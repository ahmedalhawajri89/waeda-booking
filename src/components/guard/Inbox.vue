<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isToday } from 'date-fns'
import {
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  ExternalLink,
  FlaskConical,
  Inbox as InboxIcon,
  MessageCircle,
  Phone,
  Search,
  Send,
  TriangleAlert,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useGuardStore } from '@/stores/guard'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { business, initialOf } from '@/data/business'
import { TEMPLATE_LABEL } from '@/lib/guardEngine'
import { BOOKING_STATUS } from '@/lib/status'
import { clone } from '@/lib/clone'
import { fromNow, relativeDay, relativeDayTime, time } from '@/lib/format'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { digitsOnly } from '@/lib/digits'

/**
 * The customer-service inbox.
 *
 * One conversation per booking, the way a customer thinks of it ("my
 * appointment on Sunday"), in three panes: who is waiting, what was said,
 * and everything the desk needs to answer well — the customer, the booking,
 * and the next step. The guard writes most messages on its own; this is
 * where a person steps in, answers in the same thread, and closes it.
 *
 * Conversations the guard handed over come first and say how long they have
 * waited, because that is the number customer service is judged on.
 */
const emit = defineEmits(['openBooking'])
const guard = useGuardStore()
const store = useBookingsStore()
const customers = useCustomersStore()
const route = useRoute()
const router = useRouter()

/* ------------------------------------------------------------ the list */
const FILTERS = [
  { value: 'needs', label: 'تحتاجك' },
  { value: 'guard', label: 'يتولاها المساعد' },
  { value: 'done', label: 'منتهية' },
  { value: 'all', label: 'الكل' },
]
const filter = ref('needs')
const query = ref('')

const rows = computed(() =>
  guard.conversations.map((c) => {
    const b = store.byId(c.bookingId)
    const view = b ? store.hydrate(b) : null
    const over =
      !b ||
      ['cancelled', 'completed', 'no_show'].includes(b.status) ||
      new Date(b.endAt) < new Date()
    return { ...c, booking: b, view, over }
  }),
)
const inFilter = (r, f) =>
  f === 'needs'
    ? r.needsStaff
    : f === 'guard'
      ? !r.needsStaff && !r.over
      : f === 'done'
        ? !r.needsStaff && r.over
        : true
const counts = computed(() =>
  Object.fromEntries(
    FILTERS.map((f) => [f.value, rows.value.filter((r) => inFilter(r, f.value)).length]),
  ),
)
const list = computed(() => {
  const q = query.value.trim()
  const digits = digitsOnly(q)
  return (
    rows.value
      .filter((r) => inFilter(r, filter.value))
      .filter(
        (r) =>
          !q ||
          (r.view?.customer?.name ?? '').includes(q) ||
          (digits.length > 2 && digitsOnly(r.view?.customer?.phone).includes(digits)),
      )
      // Waiting longest first when someone is waiting; otherwise newest first.
      .sort((a, b) =>
        a.needsStaff && b.needsStaff
          ? a.waitingSince.localeCompare(b.waitingSince)
          : b.last.at.localeCompare(a.last.at),
      )
  )
})

/**
 * Start where the work is — once there is something to judge by. Switching
 * before the messages arrive used to land on "all" and stay there, with a
 * conversation open that was not the one waiting.
 */
let settled = false
watch(
  () => guard.conversations.length,
  (n) => {
    if (settled || n === 0) return
    settled = true
    if (counts.value.needs === 0) filter.value = 'all'
  },
  { immediate: true },
)

/* -------------------------------------------------------- the selection */
const selectedId = computed(() => (route.query.c ? String(route.query.c) : null))
const selected = computed(() => rows.value.find((r) => r.bookingId === selectedId.value) ?? null)
function select(id) {
  router.replace({ query: { ...route.query, c: id ?? undefined } })
}
// On a wide screen there is always a conversation open, and it is always one
// of those listed — change the filter and the open conversation follows.
watch(
  list,
  (l) => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    const shown = l.some((r) => r.bookingId === selectedId.value)
    if (l.length && !shown) select(l[0].bookingId)
  },
  { immediate: true },
)

const preview = (r) => {
  const m = r.last
  if (!m) return ''
  const who =
    m.direction === 'in'
      ? ''
      : m.template === 'staff'
        ? 'أنت: '
        : `المساعد · ${TEMPLATE_LABEL[m.template] ?? ''}: `
  return who + m.body
}
const stamp = (at) => (isToday(new Date(at)) ? time(at) : relativeDay(at))

/* ---------------------------------------------------------- the thread */
const scroller = ref(null)
const INTENT = {
  confirm: { label: 'فهمه المساعد: تأكيد', tone: 'text-success-700' },
  cancel: { label: 'فهمه المساعد: إلغاء', tone: 'text-danger-700' },
  late: { label: 'فهمه المساعد: سيتأخر', tone: 'text-warning-700' },
  reschedule: { label: 'فهمه المساعد: يريد موعداً آخر', tone: 'text-fg-muted' },
  choose: { label: 'فهمه المساعد: اختار وقتاً', tone: 'text-success-700' },
  unknown: { label: 'لم يفهمه المساعد', tone: 'text-warning-700' },
}

/** Messages with a day divider wherever the day changes. */
const timeline = computed(() => {
  const out = []
  let day = ''
  for (const m of selected.value?.messages ?? []) {
    const d = m.at.slice(0, 10)
    if (d !== day) {
      out.push({ kind: 'day', key: `d${d}`, label: relativeDay(m.at) })
      day = d
    }
    out.push({ kind: 'msg', key: m.id, m })
  }
  return out
})

watch(
  () => [selectedId.value, selected.value?.messages.length],
  async () => {
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  },
)

/* ----------------------------------------------------------- composing */
const mode = ref('staff') // staff · simulate
const draft = ref('')
const sending = ref(false)
const box = ref(null)

/** Saved replies, filled in for the open conversation. */
const SAVED = [
  { label: 'نراك في موعدك', body: 'أهلاً {name}، موعدك ثابت {when}. نراك قريباً 🌿' },
  { label: 'التأخير مقبول', body: 'لا بأس يا {name}، ننتظرك حتى ربع ساعة بعد الموعد.' },
  {
    label: 'نقترح وقتاً آخر',
    body: 'أهلاً {name}، يسعدنا نقل موعدك. أي وقت يناسبك؟ نرسل لك الأوقات المتاحة.',
  },
  { label: 'شكراً للتأكيد', body: 'شكراً {name}، تم تأكيد موعدك {when}.' },
]
const CUSTOMER_SAYS = ['1', '2', 'بتأخر ربع ساعة', 'خلّيها بكرة العصر', 'ممكن أجي مع أختي؟']

const fill = (body) =>
  body
    .replaceAll('{name}', selected.value?.view?.customer?.name?.split(' ')[0] ?? '')
    .replaceAll(
      '{when}',
      selected.value?.booking ? relativeDayTime(selected.value.booking.startAt) : '',
    )

function useSaved(s) {
  draft.value = fill(s.body)
  nextTick(() => box.value?.focus())
}

async function send(text = draft.value) {
  const body = text.trim()
  if (!body || sending.value || !selected.value) return
  sending.value = true
  try {
    if (mode.value === 'staff') {
      await guard.staffReply(selected.value.bookingId, body)
      toast.success('أُرسل الرد')
    } else {
      const intent = await guard.reply(selected.value.bookingId, body)
      if (intent === 'confirm') toast.success('أكّد العميل حضوره')
      else if (intent === 'cancel') toast.success('ألغى العميل، والوقت متاح الآن')
      else if (intent === 'unknown') toast('لم يفهمه المساعد، فأحاله لك')
    }
    draft.value = ''
  } catch {
    toast.error('تعذّر الإرسال. حاول مرة أخرى.')
  } finally {
    sending.value = false
  }
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

async function markDone() {
  if (!selected.value) return
  await guard.resolve(selected.value.bookingId)
  toast.success('أُغلقت المحادثة')
}

/* ------------------------------------------------------------- context */
const history = computed(() => {
  const c = selected.value?.view?.customer
  if (!c) return null
  const all = store.forCustomer(c.id)
  return {
    visits: all.filter((b) => b.status === 'completed').length,
    noShows: all.filter((b) => b.status === 'no_show').length,
  }
})
const risk = computed(() =>
  selected.value?.booking ? guard.riskOf(selected.value.booking.id) : null,
)
const waLink = computed(() => {
  const d = (selected.value?.view?.customer?.phone ?? '').replace(/[^0-9]/g, '')
  return d ? `https://wa.me/${d.startsWith('0') ? '966' + d.slice(1) : d}` : null
})
function confirmIt() {
  const b = selected.value?.booking
  if (!b) return
  const before = clone(b)
  store.setStatus(b.id, 'confirmed')
  toast.success('تم تأكيد الحجز', {
    action: { label: 'تراجع', onClick: () => store.restore(before) },
  })
}
// Keep the customers store warm for the context pane.
customers.load()
</script>

<template>
  <div
    class="surface grid h-[calc(100dvh-15rem)] min-h-[34rem] grid-cols-1 overflow-hidden lg:grid-cols-[21rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)_19rem]"
  >
    <!-- ======================================================= list -->
    <aside
      class="border-border flex min-h-0 min-w-0 flex-col border-e"
      :class="selected ? 'hidden lg:flex' : 'flex'"
      aria-label="المحادثات"
    >
      <div class="border-border space-y-2.5 border-b p-3">
        <label class="relative block">
          <Search
            class="text-fg-faint pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2"
            style="inset-inline-start: 0.7rem"
            aria-hidden="true"
          />
          <input
            v-model="query"
            class="border-border bg-surface-sunken text-fg placeholder:text-fg-faint focus:border-fg h-9 w-full rounded-[var(--radius-md)] border ps-9 pe-3 text-sm"
            placeholder="ابحث باسم العميل أو جواله"
            aria-label="ابحث في المحادثات"
          />
        </label>
        <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="تصفية المحادثات">
          <button
            v-for="f in FILTERS"
            :key="f.value"
            type="button"
            role="tab"
            :aria-selected="filter === f.value"
            class="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            :class="
              filter === f.value ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:bg-surface-hover'
            "
            @click="filter = f.value"
          >
            {{ f.label }}
            <span
              v-if="counts[f.value]"
              class="rounded-full px-1.5 text-[10px] leading-4"
              :class="
                f.value === 'needs'
                  ? 'bg-primary text-fg-on-primary'
                  : filter === f.value
                    ? 'bg-fg-inverse/20'
                    : 'bg-surface-sunken'
              "
              data-numeric
              >{{ counts[f.value] }}</span
            >
          </button>
        </div>
      </div>

      <ul class="min-h-0 flex-1 overflow-y-auto" role="list">
        <li v-if="!list.length" class="text-fg-subtle px-4 py-10 text-center text-sm">
          {{ filter === 'needs' ? 'لا أحد ينتظرك الآن. 👌' : 'لا محادثات هنا.' }}
        </li>
        <li v-for="r in list" :key="r.bookingId">
          <button
            type="button"
            class="border-border flex w-full items-start gap-3 border-b px-3.5 py-3 text-start transition-colors"
            :class="r.bookingId === selectedId ? 'bg-surface-sunken' : 'hover:bg-surface-hover'"
            :aria-current="r.bookingId === selectedId ? 'true' : undefined"
            @click="select(r.bookingId)"
          >
            <span class="relative shrink-0">
              <span
                class="bg-surface-sunken text-fg grid h-10 w-10 place-items-center rounded-full text-sm font-bold"
                :class="r.bookingId === selectedId && 'bg-surface'"
                aria-hidden="true"
                >{{ initialOf(r.view?.customer?.name) }}</span
              >
              <span
                v-if="r.needsStaff"
                class="bg-primary ring-surface absolute -top-0.5 h-3 w-3 rounded-full ring-2"
                style="inset-inline-end: -2px"
                aria-hidden="true"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-2">
                <span
                  class="truncate text-sm"
                  :class="r.needsStaff ? 'text-fg font-bold' : 'text-fg font-semibold'"
                  >{{ r.view?.customer?.name ?? 'عميل' }}</span
                >
                <span class="text-fg-faint shrink-0 text-[11px]" data-numeric>{{
                  stamp(r.last.at)
                }}</span>
              </span>
              <span
                class="mt-0.5 block truncate text-[13px]"
                :class="r.needsStaff ? 'text-fg' : 'text-fg-subtle'"
                >{{ preview(r) }}</span
              >
              <span
                v-if="r.needsStaff"
                class="text-warning-700 mt-1 flex items-center gap-1 text-[11px] font-semibold"
              >
                <TriangleAlert class="h-3 w-3" aria-hidden="true" /> ينتظر رداً
                {{ fromNow(r.waitingSince) }}
              </span>
              <span v-else-if="r.booking" class="text-fg-faint mt-1 block truncate text-[11px]">
                {{ relativeDayTime(r.booking.startAt) }} · {{ r.view?.service?.name }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </aside>

    <!-- ======================================================= thread -->
    <section
      class="min-h-0 min-w-0 flex-col"
      :class="selected ? 'flex' : 'hidden lg:flex'"
      aria-label="المحادثة"
    >
      <div v-if="!selected" class="grid flex-1 place-items-center">
        <EmptyState
          :icon="InboxIcon"
          title="اختر محادثة"
          description="المحادثات التي تحتاجك تظهر أولاً في القائمة."
        />
      </div>

      <template v-else>
        <!-- who, and the booking the conversation is about -->
        <header class="border-border flex items-center gap-3 border-b px-4 py-3">
          <button
            type="button"
            class="text-fg-subtle hover:text-fg -ms-1 grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] lg:hidden"
            aria-label="رجوع إلى المحادثات"
            @click="select(null)"
          >
            <ArrowRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
          </button>
          <span
            class="bg-surface-sunken text-fg grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold"
            aria-hidden="true"
            >{{ initialOf(selected.view?.customer?.name) }}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-fg truncate text-sm font-bold">
              {{ selected.view?.customer?.name ?? 'عميل' }}
            </p>
            <p v-if="selected.booking" class="text-fg-subtle truncate text-xs" data-numeric>
              {{ relativeDayTime(selected.booking.startAt) }} · {{ selected.view?.service?.name }} ·
              {{ selected.view?.resource?.name }}
            </p>
          </div>
          <StatusBadge
            v-if="selected.booking"
            :status="selected.booking.status"
            size="sm"
            class="hidden sm:inline-flex"
          />
          <button
            v-if="selected.needsStaff"
            type="button"
            class="border-border text-fg hover:border-fg flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-semibold"
            title="لا يحتاج رداً: أغلق المحادثة"
            @click="markDone"
          >
            <CheckCheck class="h-4 w-4" aria-hidden="true" /> تم
          </button>
        </header>

        <!-- what was said -->
        <div ref="scroller" class="bg-canvas min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-5">
          <template v-for="row in timeline" :key="row.key">
            <p v-if="row.kind === 'day'" class="text-center">
              <span
                class="bg-surface border-border text-fg-subtle rounded-full border px-2.5 py-0.5 text-[11px]"
                >{{ row.label }}</span
              >
            </p>

            <!-- the customer -->
            <div v-else-if="row.m.direction === 'in'" class="flex flex-col items-start">
              <div
                class="border-border bg-surface text-fg max-w-[78%] rounded-[14px] rounded-ss-[4px] border px-3.5 py-2 text-sm leading-relaxed"
              >
                {{ row.m.body }}
              </div>
              <p class="text-fg-faint mt-1 flex items-center gap-1.5 px-1 text-[11px]">
                <span data-numeric>{{ time(row.m.at) }}</span>
                <span v-if="INTENT[row.m.intent]" :class="INTENT[row.m.intent].tone"
                  >· {{ INTENT[row.m.intent].label }}</span
                >
              </p>
              <p
                v-if="row.m.needsStaff"
                class="bg-warning-50 text-warning-700 mt-1.5 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold"
              >
                <TriangleAlert class="h-3.5 w-3.5" aria-hidden="true" /> أحاله المساعد لك
              </p>
            </div>

            <!-- the team -->
            <div v-else-if="row.m.template === 'staff'" class="flex flex-col items-end">
              <div
                class="bg-fg text-fg-inverse max-w-[78%] rounded-[14px] rounded-se-[4px] px-3.5 py-2 text-sm leading-relaxed"
              >
                {{ row.m.body }}
              </div>
              <p class="text-fg-faint mt-1 px-1 text-[11px]">
                {{ row.m.payload?.author ?? 'الفريق' }} ·
                <span data-numeric>{{ time(row.m.at) }}</span>
              </p>
            </div>

            <!-- the guard -->
            <div v-else class="flex flex-col items-end">
              <div
                class="bg-surface-sunken text-fg max-w-[78%] rounded-[14px] rounded-se-[4px] px-3.5 py-2 text-sm leading-relaxed"
              >
                {{ row.m.body }}
              </div>
              <p class="text-fg-faint mt-1 flex items-center gap-1 px-1 text-[11px]">
                <Bot class="h-3 w-3" aria-hidden="true" />
                المساعد · {{ TEMPLATE_LABEL[row.m.template] ?? 'رسالة' }} ·
                <span data-numeric>{{ time(row.m.at) }}</span>
              </p>
            </div>
          </template>
        </div>

        <!-- writing back -->
        <footer class="border-border bg-surface border-t p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="flex gap-1.5 overflow-x-auto">
              <button
                v-for="s in mode === 'staff'
                  ? SAVED
                  : CUSTOMER_SAYS.map((t) => ({ label: t, body: t }))"
                :key="s.label"
                type="button"
                class="border-border text-fg-muted hover:text-fg hover:border-fg-faint shrink-0 rounded-full border px-2.5 py-1 text-xs"
                @click="mode === 'staff' ? useSaved(s) : send(s.body)"
              >
                {{ s.label }}
              </button>
            </div>
            <div
              class="bg-surface-sunken flex shrink-0 rounded-[var(--radius-md)] p-0.5 text-[11px] font-semibold"
              role="radiogroup"
              aria-label="من يكتب"
            >
              <button
                type="button"
                role="radio"
                :aria-checked="mode === 'staff'"
                class="rounded-sm px-2 py-1"
                :class="mode === 'staff' ? 'bg-surface text-fg elev-raised' : 'text-fg-subtle'"
                @click="mode = 'staff'"
              >
                رد الفريق
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="mode === 'simulate'"
                class="flex items-center gap-1 rounded-sm px-2 py-1"
                :class="mode === 'simulate' ? 'bg-surface text-fg elev-raised' : 'text-fg-subtle'"
                title="جرّب كيف يفهم المساعد ردود العملاء"
                @click="mode = 'simulate'"
              >
                <FlaskConical class="h-3 w-3" aria-hidden="true" /> كأنك العميل
              </button>
            </div>
          </div>
          <form class="flex items-end gap-2" @submit.prevent="send()">
            <textarea
              ref="box"
              v-model="draft"
              rows="1"
              class="border-border bg-surface-sunken text-fg placeholder:text-fg-faint focus:border-fg [field-sizing:content] max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-[var(--radius-md)] border px-3 py-2 text-sm"
              :placeholder="
                mode === 'staff'
                  ? `اكتب ردك إلى ${selected.view?.customer?.name?.split(' ')[0] ?? 'العميل'}…`
                  : 'اكتب كأنك العميل لترى كيف يفهمه المساعد…'
              "
              :aria-label="mode === 'staff' ? 'رد الفريق' : 'رد العميل التجريبي'"
              @keydown="onKey"
            />
            <button
              type="submit"
              class="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] transition-colors"
              :class="
                draft.trim()
                  ? mode === 'staff'
                    ? 'btn-brand'
                    : 'bg-fg text-fg-inverse'
                  : 'bg-surface-sunken text-fg-faint'
              "
              :disabled="!draft.trim() || sending"
              :aria-label="mode === 'staff' ? 'إرسال' : 'أرسل كأنك العميل'"
            >
              <Send class="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </form>
          <p class="text-fg-faint mt-1.5 text-[11px]">
            <template v-if="mode === 'staff'"
              >يصل الرد للعميل على واتساب باسم {{ business.name }}. Enter للإرسال، Shift+Enter لسطر
              جديد.</template
            >
            <template v-else
              >تجريبي: يُعامل النص كرد من العميل، ويتصرف المساعد كما يفعل حقيقةً.</template
            >
          </p>
        </footer>
      </template>
    </section>

    <!-- ======================================================= context -->
    <aside
      v-if="selected"
      class="border-border hidden min-h-0 overflow-y-auto border-s p-4 2xl:block"
      aria-label="تفاصيل العميل والحجز"
    >
      <div class="mb-5 text-center">
        <span
          class="bg-surface-sunken text-fg mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full text-lg font-bold"
          aria-hidden="true"
          >{{ initialOf(selected.view?.customer?.name) }}</span
        >
        <p class="text-fg font-bold">{{ selected.view?.customer?.name }}</p>
        <p class="text-fg-subtle text-xs" dir="ltr">{{ selected.view?.customer?.phone }}</p>
        <div class="mt-3 flex justify-center gap-2">
          <a
            v-if="selected.view?.customer"
            :href="`tel:${selected.view.customer.phone}`"
            class="border-border text-fg-muted hover:text-fg grid h-9 w-9 place-items-center rounded-full border"
            aria-label="اتصال"
            title="اتصال"
            ><Phone class="h-4 w-4" aria-hidden="true"
          /></a>
          <a
            v-if="waLink"
            :href="waLink"
            target="_blank"
            rel="noopener"
            class="border-border text-fg-muted hover:text-fg grid h-9 w-9 place-items-center rounded-full border"
            aria-label="فتح واتساب"
            title="فتح واتساب"
            ><MessageCircle class="h-4 w-4" aria-hidden="true"
          /></a>
        </div>
      </div>

      <dl
        v-if="history"
        class="border-border mb-5 grid grid-cols-2 rounded-[var(--radius-md)] border"
      >
        <div class="border-border border-e p-3 text-center">
          <dt class="text-fg-subtle text-[11px]">زيارات</dt>
          <dd class="text-fg font-bold" data-numeric>{{ history.visits }}</dd>
        </div>
        <div class="p-3 text-center">
          <dt class="text-fg-subtle text-[11px]">غياب</dt>
          <dd
            class="font-bold"
            :class="history.noShows ? 'text-danger-700' : 'text-fg'"
            data-numeric
          >
            {{ history.noShows }}
          </dd>
        </div>
      </dl>

      <div v-if="selected.booking" class="space-y-3">
        <p class="text-fg-subtle text-xs font-semibold">الحجز</p>
        <div class="border-border space-y-2 rounded-[var(--radius-md)] border p-3 text-sm">
          <p class="text-fg font-semibold">{{ selected.view?.service?.name }}</p>
          <p class="text-fg-muted text-xs" data-numeric>
            {{ relativeDayTime(selected.booking.startAt) }} · {{ selected.view?.resource?.name }}
          </p>
          <p class="flex items-center justify-between text-xs">
            <span class="text-fg-subtle">الحالة</span>
            <span class="text-fg font-semibold">{{
              BOOKING_STATUS[selected.booking.status].label
            }}</span>
          </p>
          <p v-if="risk" class="flex items-center justify-between text-xs">
            <span class="text-fg-subtle">احتمال الغياب</span>
            <span
              class="font-semibold"
              :class="
                risk.tier === 'high'
                  ? 'text-danger-700'
                  : risk.tier === 'medium'
                    ? 'text-warning-700'
                    : 'text-fg'
              "
              data-numeric
              >{{ Math.round(risk.probability * 100) }}%</span
            >
          </p>
        </div>
        <button
          v-if="selected.booking.status === 'pending'"
          type="button"
          class="btn-brand flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] py-2 text-sm font-bold"
          @click="confirmIt"
        >
          <Check class="h-4 w-4" aria-hidden="true" /> أكّد الحجز
        </button>
        <button
          type="button"
          class="border-border text-fg hover:bg-surface-hover flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border py-2 text-sm font-semibold"
          @click="emit('openBooking', selected.bookingId)"
        >
          <ExternalLink class="h-4 w-4" aria-hidden="true" /> افتح الحجز
        </button>
      </div>
    </aside>
  </div>
</template>
