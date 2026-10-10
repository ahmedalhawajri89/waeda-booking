<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BellRing,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  CircleDollarSign,
  Copy,
  Heart,
  History,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  NotebookPen,
  Phone,
  RotateCcw,
  ShieldAlert,
  Undo2,
  UserX,
  Wallet,
  XCircle,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseDrawer from '@/components/ui/BaseDrawer.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import BookingFormDrawer from './BookingFormDrawer.vue'
import RiskBadge from '@/components/guard/RiskBadge.vue'
import ConversationThread from '@/components/guard/ConversationThread.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useGuardStore } from '@/stores/guard'
import { business, initialOf } from '@/data/business'
import { fullDate, fromNow, money, relativeDayTime, time, timeRange } from '@/lib/format'
import { hasConflict } from '@/lib/availability'
import { clone } from '@/lib/clone'
import { planFor } from '@/lib/guard'
import { notableFactors } from '@/lib/risk'

/**
 * One booking, as the desk needs it.
 *
 * The part that does not scroll answers "where does it stand, and what do I
 * do next" — the status, the one or two steps that make sense now (before,
 * during, or after the appointment), and arrows to the day's previous and
 * next booking so a receptionist can walk the day without closing anything.
 *
 * Below it, four tabs: the booking itself and its money; the customer and
 * their history with the business; the guard's conversation with them; and
 * the log. Steps that end a booking wait behind "more".
 */
const props = defineProps({
  bookingId: { type: [String, null], required: true },
})
const emit = defineEmits(['close', 'createAt'])

const store = useBookingsStore()
const guard = useGuardStore()
const route = useRoute()
const router = useRouter()

const booking = computed(() => (props.bookingId ? store.byId(props.bookingId) : null))
const view = computed(() => (booking.value ? store.hydrate(booking.value) : null))
const isOpen = computed(() => booking.value !== null)
const hasStarted = computed(() =>
  booking.value ? new Date(booking.value.startAt).getTime() < Date.now() : false,
)
const live = computed(() => ['pending', 'confirmed'].includes(booking.value?.status))
const risk = computed(() => (booking.value ? guard.riskOf(booking.value.id) : null))
const plan = computed(() => (risk.value ? planFor(risk.value.tier, guard.policy) : []))
const conflicted = computed(() => (booking.value ? hasConflict(booking.value, store.items) : false))

/* --------------------------------------------------------------- tabs */
const tab = ref('details')

/**
 * A guest's booking nobody had opened is seen the moment it is opened — the
 * guest's page then says it reached the business. The tag stays for this
 * visit so whoever opened it knows it was new.
 */
const arrivedNew = ref(false)
watch(
  () => props.bookingId,
  () => {
    tab.value = 'details'
    arrivedNew.value = false
  },
)
// On the booking, not the id: a link opened before the list has loaded has
// an id long before it has a booking to look at.
watch(
  () => booking.value?.id,
  (id) => {
    if (!id) return
    arrivedNew.value = booking.value.acknowledgedAt === null
    if (arrivedNew.value) store.acknowledge(id)
  },
  { immediate: true },
)
const thread = computed(() => (booking.value ? guard.thread(booking.value.id) : []))
const TABS = computed(() => [
  { value: 'details', label: 'التفاصيل' },
  { value: 'customer', label: 'العميل' },
  { value: 'chat', label: 'المحادثة', count: thread.value.length },
  { value: 'log', label: 'السجل', count: booking.value?.history.length ?? 0 },
])

/* ------------------------------------------- walking the day, in place */
const dayList = computed(() =>
  booking.value
    ? [...store.onDay(new Date(booking.value.startAt))].sort((a, b) =>
        a.startAt.localeCompare(b.startAt),
      )
    : [],
)
const position = computed(() => dayList.value.findIndex((b) => b.id === props.bookingId))
const prevId = computed(() => dayList.value[position.value - 1]?.id ?? null)
const nextId = computed(() => dayList.value[position.value + 1]?.id ?? null)
function goTo(id) {
  if (id) router.replace({ query: { ...route.query, booking: id } })
}
function onKey(e) {
  if (!isOpen.value || e.altKey || e.ctrlKey || e.metaKey) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '')) return
  if (e.key === 'j') goTo(nextId.value)
  if (e.key === 'k') goTo(prevId.value)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

/* ------------------------------------------------------------ actions */
const confirmCancel = ref(false)
const rescheduleOpen = ref(false)

function withUndo(label, mutate) {
  const before = booking.value ? clone(booking.value) : null
  mutate()
  toast.success(label, {
    action: before ? { label: 'تراجع', onClick: () => store.restore(before) } : undefined,
  })
}
function setStatus(status, label) {
  if (!booking.value) return
  const id = booking.value.id
  withUndo(label, () => store.setStatus(id, status))
}
function setPayment(payment, label) {
  if (!booking.value) return
  const id = booking.value.id
  withUndo(label, () => store.setPayment(id, payment))
}

const phoneDigits = computed(() => (view.value?.customer?.phone ?? '').replace(/[^0-9]/g, ''))
function wa(text) {
  const d = phoneDigits.value
  if (!d) return null
  const to = d.startsWith('0') ? '966' + d.slice(1) : d
  return `https://wa.me/${to}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
const firstName = computed(() => view.value?.customer?.name?.split(' ')[0] ?? '')
const reminderLink = computed(() =>
  booking.value
    ? wa(
        `أهلاً ${firstName.value}، نذكّرك بموعدك في ${business.name} ${relativeDayTime(booking.value.startAt)} (${view.value?.service?.name}). نرجو تأكيد حضورك.`,
      )
    : null,
)
const thanksLink = computed(() =>
  wa(`شكراً ${firstName.value} على زيارتك ${business.name}. يسعدنا نشوفك مرة ثانية 🌿`),
)

/** Book the same customer again: same service, same person, a fresh time. */
function bookAgain() {
  const b = booking.value
  if (!b) return
  emit('createAt', {
    serviceId: b.serviceId,
    resourceId: b.resourceId,
    phone: view.value?.customer?.phone,
    name: view.value?.customer?.name,
  })
}

/** What the "more" menu holds for this booking right now. */
/**
 * A class: everyone in this session, with attendance one by one — or all at
 * once, which is how a trainer actually closes a class.
 */
const roster = computed(() => {
  const b = booking.value
  if (!b || (view.value?.service?.capacity ?? 1) <= 1) return []
  return store.items
    .filter(
      (x) =>
        x.serviceId === b.serviceId &&
        x.resourceId === b.resourceId &&
        x.startAt === b.startAt &&
        x.status !== 'cancelled',
    )
    .map((x) => ({ b: x, name: store.hydrate(x).customer?.name ?? 'عميل' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
})
const rosterOpen = computed(() =>
  roster.value.filter((r) => r.b.status === 'pending' || r.b.status === 'confirmed'),
)
function markSeat(id, status) {
  const before = clone(store.byId(id))
  store.setStatus(id, status)
  toast.success(status === 'completed' ? 'سُجّل الحضور' : 'سُجّل الغياب', {
    action: { label: 'تراجع', onClick: () => store.restore(before) },
  })
}
function allCame() {
  const before = rosterOpen.value.map((r) => clone(r.b))
  for (const r of rosterOpen.value) store.setStatus(r.b.id, 'completed')
  toast.success(`سُجّل حضور ${before.length}`, {
    action: { label: 'تراجع', onClick: () => before.forEach((x) => store.restore(x)) },
  })
}

/** A weekly booking: where this one sits, and the weeks still to come after it. */
const series = computed(() => (booking.value ? store.seriesOf(booking.value.seriesId) : []))
const seriesAt = computed(() => series.value.findIndex((b) => b.id === booking.value?.id))
const laterInSeries = computed(() =>
  series.value
    .slice(seriesAt.value + 1)
    .filter((b) => b.status === 'pending' || b.status === 'confirmed'),
)
function cancelRest() {
  const before = laterInSeries.value.map((b) => clone(b))
  for (const b of laterInSeries.value) store.setStatus(b.id, 'cancelled')
  toast.success(`أُلغيت ${before.length} حجوزات بعد هذا الأسبوع`, {
    action: { label: 'تراجع', onClick: () => before.forEach((b) => store.restore(b)) },
  })
}

const moreItems = computed(() => {
  const b = booking.value
  if (!b) return []
  const items = [{ value: 'copy', label: 'نسخ رقم الحجز', icon: Copy }]
  if (laterInSeries.value.length)
    items.push({
      value: 'cancel-rest',
      label: `إلغاء ما بعده من السلسلة (${laterInSeries.value.length})`,
      icon: XCircle,
      separated: true,
    })
  if (b.paymentStatus === 'paid')
    items.push({ value: 'refund', label: 'إعادة المبلغ', icon: Undo2, separated: true })
  if (live.value)
    items.push({
      value: 'cancel',
      label: 'إلغاء الحجز',
      icon: XCircle,
      tone: 'danger',
      separated: true,
    })
  return items
})
async function onMore(v) {
  if (v === 'copy') {
    try {
      await navigator.clipboard.writeText(booking.value.reference)
      toast.success('نُسخ رقم الحجز')
    } catch {
      toast.error('تعذّر النسخ')
    }
  }
  if (v === 'no_show') setStatus('no_show', 'سُجّل عدم الحضور')
  if (v === 'refund') setPayment('refunded', 'سُجّلت إعادة المبلغ')
  if (v === 'cancel') confirmCancel.value = true
  if (v === 'cancel-rest') cancelRest()
}
function doCancel() {
  confirmCancel.value = false
  setStatus('cancelled', 'أُلغي الحجز')
}

/* ------------------------------------------------------------- notes */
const noteDraft = ref('')
const editingNote = ref(false)
function startNote() {
  noteDraft.value = booking.value?.notes ?? ''
  editingNote.value = true
}
function saveNote() {
  if (!booking.value) return
  store.addNote(booking.value.id, noteDraft.value.trim())
  editingNote.value = false
  toast.success('حُفظت الملاحظة')
}

/* ----------------------------------------------------------- customer */
const history = computed(() => {
  const c = view.value?.customer
  if (!c) return null
  const all = [...store.forCustomer(c.id)].sort((a, b) => b.startAt.localeCompare(a.startAt))
  const now = Date.now()
  const decided = all.filter((b) => b.status === 'completed' || b.status === 'no_show')
  const noShows = all.filter((b) => b.status === 'no_show').length
  const others = all.filter((b) => b.id !== booking.value?.id)
  return {
    visits: all.filter((b) => b.status === 'completed').length,
    noShows,
    noShowRate: decided.length ? noShows / decided.length : 0,
    spend: all.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.priceMinor, 0),
    upcoming: others
      .filter(
        (b) =>
          new Date(b.startAt).getTime() > now &&
          (b.status === 'pending' || b.status === 'confirmed'),
      )
      .reverse()
      .slice(0, 3),
    past: others.filter((b) => new Date(b.startAt).getTime() <= now).slice(0, 5),
  }
})

/* -------------------------------------------------------------- money */
const PAYMENT_LINE = {
  unpaid: { label: 'لم يُدفع شيء بعد', tone: 'text-fg-muted' },
  deposit_paid: { label: 'دُفع عربون، والباقي عند الحضور', tone: 'text-warning-700' },
  paid: { label: 'مدفوع بالكامل', tone: 'text-success-700' },
  refunded: { label: 'أُعيد المبلغ للعميل', tone: 'text-fg-subtle' },
}

/* ---------------------------------------------------------------- log */
const EVENT_ICON = {
  created: CalendarPlus,
  confirmed: Check,
  rescheduled: CalendarClock,
  cancelled: XCircle,
  completed: CircleCheckBig,
  no_show: UserX,
  payment_recorded: CircleDollarSign,
  note_added: NotebookPen,
}
const lastEvent = computed(() => booking.value?.history.at(-1) ?? null)
const CHANNEL = { online: 'من صفحة الحجز', phone: 'حجز هاتفي', walk_in: 'حضور مباشر' }
</script>

<template>
  <BaseDrawer
    :open="isOpen"
    width="xl"
    :title="view?.customer?.name ?? ''"
    :subtitle="booking ? `${booking.reference} · ${view?.service?.name ?? ''}` : ''"
    @close="emit('close')"
  >
    <template #actions>
      <span
        v-if="dayList.length > 1"
        class="text-fg-faint me-1 hidden text-xs sm:inline"
        data-numeric
        >{{ position + 1 }} من {{ dayList.length }}</span
      >
      <button
        type="button"
        class="text-fg-subtle hover:text-fg hover:bg-surface-hover grid h-9 w-9 place-items-center rounded-[var(--radius-md)] disabled:opacity-30"
        :disabled="!prevId"
        aria-label="الحجز السابق في اليوم (K)"
        title="الحجز السابق (K)"
        @click="goTo(prevId)"
      >
        <ChevronRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="text-fg-subtle hover:text-fg hover:bg-surface-hover grid h-9 w-9 place-items-center rounded-[var(--radius-md)] disabled:opacity-30"
        :disabled="!nextId"
        aria-label="الحجز التالي في اليوم (J)"
        title="الحجز التالي (J)"
        @click="goTo(nextId)"
      >
        <ChevronLeft class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
      </button>
    </template>

    <!-- ============================== fixed: where it stands, what next -->
    <template v-if="booking && view" #top>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge :status="booking.status" />
        <StatusBadge :payment="booking.paymentStatus" />
        <RiskBadge v-if="live && risk && risk.tier !== 'low'" :risk="risk" />
        <span
          v-if="arrivedNew"
          class="bg-primary-soft text-primary-fg inline-flex items-center rounded-[var(--radius-sm)] px-2 py-1 text-xs font-semibold"
          >جديد من صفحة الحجز</span
        >
        <span
          v-if="conflicted"
          class="border-danger-100 bg-danger-50 text-danger-700 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-semibold"
        >
          تعارض مع حجز آخر
        </span>
        <span class="text-fg-subtle ms-auto text-xs" data-numeric>
          {{ relativeDayTime(booking.startAt) }} · {{ fromNow(booking.startAt) }}
        </span>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <!-- before the appointment -->
        <template v-if="live && !hasStarted">
          <BaseButton
            v-if="booking.status === 'pending'"
            variant="primary"
            :icon="Check"
            @click="setStatus('confirmed', 'تم تأكيد الحجز')"
            >تأكيد</BaseButton
          >
          <BaseButton :icon="CalendarClock" @click="rescheduleOpen = true">إعادة جدولة</BaseButton>
          <a
            v-if="reminderLink"
            :href="reminderLink"
            target="_blank"
            rel="noopener"
            class="border-border text-fg hover:bg-surface-hover inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-sm font-semibold sm:px-3"
            aria-label="ذكّره بالموعد على واتساب"
            title="ذكّره بالموعد على واتساب"
          >
            <BellRing class="h-4 w-4" aria-hidden="true" />
            <span class="hidden sm:inline">ذكّره</span>
          </a>
        </template>
        <!-- it is time, or past it, and nobody closed it -->
        <template v-else-if="live">
          <BaseButton
            variant="primary"
            :icon="CircleCheckBig"
            @click="setStatus('completed', 'اكتملت الخدمة')"
            >حضر واكتمل</BaseButton
          >
          <BaseButton :icon="UserX" @click="setStatus('no_show', 'سُجّل عدم الحضور')"
            >لم يحضر</BaseButton
          >
          <BaseButton :icon="CalendarClock" @click="rescheduleOpen = true">إعادة جدولة</BaseButton>
        </template>
        <!-- after it: keep the customer -->
        <template v-else-if="booking.status === 'completed'">
          <BaseButton variant="primary" :icon="CalendarPlus" @click="bookAgain"
            >احجز موعده القادم</BaseButton
          >
          <a
            v-if="thanksLink"
            :href="thanksLink"
            target="_blank"
            rel="noopener"
            class="border-border text-fg hover:bg-surface-hover inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-sm font-semibold"
          >
            <Heart class="h-4 w-4" aria-hidden="true" /> رسالة شكر
          </a>
        </template>
        <!-- it did not happen -->
        <template v-else>
          <BaseButton variant="primary" :icon="RotateCcw" @click="bookAgain"
            >احجز له موعداً جديداً</BaseButton
          >
        </template>

        <span class="flex-1" />
        <BaseMenu :items="moreItems" label="إجراءات أخرى" align="end" @select="onMore">
          <template #trigger="{ open }">
            <button
              type="button"
              class="border-border text-fg-muted hover:bg-surface-hover grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border"
              :aria-expanded="open"
              aria-haspopup="menu"
              aria-label="إجراءات أخرى"
            >
              <MoreHorizontal class="h-4 w-4" aria-hidden="true" />
            </button>
          </template>
        </BaseMenu>
      </div>

      <nav class="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="أقسام الحجز">
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          role="tab"
          :aria-selected="tab === t.value"
          class="flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors"
          :class="
            tab === t.value
              ? 'border-fg text-fg'
              : 'text-fg-subtle hover:text-fg border-transparent'
          "
          @click="tab = t.value"
        >
          {{ t.label }}
          <span
            v-if="t.count"
            class="bg-surface-sunken text-fg-muted rounded-full px-1.5 text-[10px] leading-4"
            data-numeric
            >{{ t.count }}</span
          >
        </button>
      </nav>
    </template>

    <!-- ============================================================ body -->
    <div v-if="booking && view">
      <!-- ---------------------------------------------------- details -->
      <div v-if="tab === 'details'" class="space-y-5">
        <dl
          class="border-border grid grid-cols-2 overflow-hidden rounded-[var(--radius-lg)] border"
        >
          <div class="border-border border-e border-b p-3.5">
            <dt class="text-fg-subtle text-xs">الموعد</dt>
            <dd class="text-fg mt-0.5 text-sm font-semibold">{{ fullDate(booking.startAt) }}</dd>
            <dd class="text-fg-muted text-xs" data-numeric>
              {{ timeRange(booking.startAt, booking.endAt) }}
            </dd>
          </div>
          <div class="border-border border-b p-3.5">
            <dt class="text-fg-subtle text-xs">مع</dt>
            <dd class="text-fg mt-0.5 text-sm font-semibold">{{ view.resource?.name ?? '—' }}</dd>
            <dd v-if="view.resource?.role" class="text-fg-muted text-xs">
              {{ view.resource.role }}
            </dd>
          </div>
          <div class="border-border border-e p-3.5">
            <dt class="text-fg-subtle text-xs">الخدمة</dt>
            <dd class="text-fg mt-0.5 text-sm font-semibold">{{ view.service?.name }}</dd>
            <dd class="text-fg-muted text-xs">{{ CHANNEL[booking.channel] ?? '' }}</dd>
          </div>
          <div class="p-3.5">
            <dt class="text-fg-subtle text-xs">أُنشئ</dt>
            <dd class="text-fg mt-0.5 text-sm font-semibold">
              {{ booking.createdAt ? fromNow(booking.createdAt) : '—' }}
            </dd>
            <dd class="text-fg-muted text-xs" dir="ltr" style="text-align: start">
              {{ booking.reference }}
            </dd>
          </div>
        </dl>

        <!-- the money -->
        <section
          class="border-border rounded-[var(--radius-lg)] border p-4"
          aria-labelledby="pay-h"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="pay-h" class="text-fg-subtle text-xs font-semibold">الدفع</h3>
              <p class="font-display text-fg text-xl font-bold" data-numeric>
                {{ money(booking.priceMinor) }}
              </p>
              <p class="text-xs" :class="PAYMENT_LINE[booking.paymentStatus].tone">
                {{ PAYMENT_LINE[booking.paymentStatus].label }}
              </p>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <BaseButton
                v-if="booking.paymentStatus === 'unpaid'"
                size="sm"
                @click="setPayment('deposit_paid', 'سُجّل العربون')"
                >سجّل عربوناً</BaseButton
              >
              <BaseButton
                v-if="
                  booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'deposit_paid'
                "
                size="sm"
                variant="primary"
                :icon="Wallet"
                @click="setPayment('paid', 'سُجّل الدفع كاملاً')"
                >سجّل الدفع</BaseButton
              >
            </div>
          </div>
        </section>

        <!-- the guard's read, for what is still ahead -->
        <section
          v-if="live && risk"
          class="border-border rounded-[var(--radius-lg)] border p-4"
          aria-labelledby="risk-h"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 id="risk-h" class="text-fg flex items-center gap-1.5 text-sm font-semibold">
              <ShieldAlert class="text-fg-subtle h-4 w-4" aria-hidden="true" /> احتمال الغياب
            </h3>
            <RiskBadge :risk="risk" />
          </div>
          <p class="mb-2 flex flex-wrap gap-1">
            <span
              v-for="f in notableFactors(risk)"
              :key="f.key"
              class="rounded-[4px] px-1.5 py-0.5 text-[11px]"
              :class="
                f.delta > 0 ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'
              "
              >{{ f.delta > 0 ? '↑' : '↓' }} {{ f.label }}</span
            >
          </p>
          <p class="text-fg-subtle text-xs">المساعد سيفعل: {{ plan.join('، ثم ') }}</p>
        </section>

        <!-- notes -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-fg-subtle text-xs font-semibold">ملاحظات</h3>
            <button
              v-if="!editingNote"
              type="button"
              class="text-fg-subtle hover:text-fg text-xs font-semibold"
              @click="startNote"
            >
              {{ booking.notes ? 'تعديل' : 'إضافة ملاحظة' }}
            </button>
          </div>
          <div v-if="editingNote" class="space-y-2">
            <textarea
              v-model="noteDraft"
              rows="3"
              class="border-border bg-surface text-fg focus:border-fg w-full rounded-[var(--radius-md)] border p-2.5 text-sm"
              aria-label="ملاحظات الحجز"
            />
            <div class="flex justify-end gap-2">
              <BaseButton size="sm" variant="ghost" @click="editingNote = false">إلغاء</BaseButton>
              <BaseButton size="sm" variant="primary" @click="saveNote">حفظ</BaseButton>
            </div>
          </div>
          <p
            v-else-if="booking.notes"
            class="bg-surface-sunken text-fg rounded-[var(--radius-md)] px-3 py-2 text-sm leading-relaxed"
          >
            {{ booking.notes }}
          </p>
          <p v-else class="text-fg-faint text-sm">لا ملاحظات.</p>
        </section>

        <!-- the last thing that happened, so the log is rarely needed -->
        <!-- a class: everyone in this session -->
        <section v-if="roster.length" data-roster aria-labelledby="roster-h">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 id="roster-h" class="text-fg-subtle text-xs font-semibold">
              المشاركون في هذه الحصة
              <span data-numeric>· {{ roster.length }} من {{ view.service.capacity }}</span>
            </h3>
            <button
              v-if="hasStarted && rosterOpen.length > 1"
              type="button"
              class="text-success-700 text-xs font-semibold"
              @click="allCame"
            >
              الكل حضر
            </button>
          </div>
          <ul class="border-border divide-border divide-y rounded-[var(--radius-md)] border">
            <li v-for="r in roster" :key="r.b.id" class="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-start text-sm"
                :class="r.b.id === booking.id ? 'text-fg font-bold' : 'text-fg hover:underline'"
                @click="goTo(r.b.id)"
              >
                {{ r.name }}
              </button>
              <template
                v-if="hasStarted && (r.b.status === 'pending' || r.b.status === 'confirmed')"
              >
                <button
                  type="button"
                  class="border-border text-success-700 hover:bg-success-50 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold"
                  @click="markSeat(r.b.id, 'completed')"
                >
                  حضر
                </button>
                <button
                  type="button"
                  class="border-border text-danger-700 hover:bg-danger-50 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold"
                  @click="markSeat(r.b.id, 'no_show')"
                >
                  لم يحضر
                </button>
              </template>
              <StatusBadge v-else :status="r.b.status" size="sm" />
            </li>
          </ul>
        </section>

        <p
          v-if="series.length > 1"
          class="bg-surface-sunken text-fg-muted flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs"
          data-series
        >
          <CalendarClock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          حجز أسبوعي ·
          <span data-numeric>{{ seriesAt + 1 }} من {{ series.length }}</span>
          <span v-if="laterInSeries.length" class="text-fg-subtle"
            >· {{ laterInSeries.length }} قادمة</span
          >
        </p>

        <p v-if="lastEvent" class="text-fg-subtle flex items-start gap-2 text-xs">
          <History class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span
            >آخر تغيير: {{ lastEvent.summary }} ·
            <span data-numeric>{{ fromNow(lastEvent.at) }}</span></span
          >
        </p>
      </div>

      <!-- --------------------------------------------------- customer -->
      <div v-else-if="tab === 'customer'" class="space-y-5">
        <div class="flex items-center gap-3">
          <span
            class="bg-surface-sunken text-fg grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold"
            aria-hidden="true"
            >{{ initialOf(view.customer?.name) }}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-fg truncate font-bold">{{ view.customer?.name }}</p>
            <p class="text-fg-subtle text-xs" dir="ltr" style="text-align: start">
              {{ view.customer?.phone }}
            </p>
          </div>
          <a
            v-if="view.customer"
            :href="`tel:${view.customer.phone}`"
            class="border-border text-fg-muted hover:text-fg grid h-9 w-9 place-items-center rounded-full border"
            aria-label="اتصال"
            title="اتصال"
            ><Phone class="h-4 w-4" aria-hidden="true"
          /></a>
          <a
            v-if="wa('')"
            :href="wa('')"
            target="_blank"
            rel="noopener"
            class="border-border text-fg-muted hover:text-fg grid h-9 w-9 place-items-center rounded-full border"
            aria-label="واتساب"
            title="واتساب"
            ><MessageCircle class="h-4 w-4" aria-hidden="true"
          /></a>
        </div>

        <dl
          v-if="history"
          class="border-border grid grid-cols-3 overflow-hidden rounded-[var(--radius-lg)] border text-center"
        >
          <div class="border-border border-e p-3">
            <dt class="text-fg-subtle text-[11px]">زيارات</dt>
            <dd class="text-fg text-lg font-bold" data-numeric>{{ history.visits }}</dd>
          </div>
          <div class="border-border border-e p-3">
            <dt class="text-fg-subtle text-[11px]">غياب</dt>
            <dd
              class="text-lg font-bold"
              :class="history.noShows ? 'text-danger-700' : 'text-fg'"
              data-numeric
            >
              {{ history.noShows
              }}<span v-if="history.noShows" class="text-fg-subtle text-xs font-medium">
                · {{ Math.round(history.noShowRate * 100) }}%</span
              >
            </dd>
          </div>
          <div class="p-3">
            <dt class="text-fg-subtle text-[11px]">أنفق</dt>
            <dd class="text-fg text-lg font-bold" data-numeric>{{ money(history.spend) }}</dd>
          </div>
        </dl>

        <section v-if="history?.upcoming.length">
          <h3 class="text-fg-subtle mb-2 text-xs font-semibold">مواعيده القادمة</h3>
          <ul class="border-border divide-border divide-y rounded-[var(--radius-md)] border">
            <li v-for="b in history.upcoming" :key="b.id">
              <button
                type="button"
                class="hover:bg-surface-hover flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start"
                @click="goTo(b.id)"
              >
                <span class="text-fg text-sm" data-numeric>{{ relativeDayTime(b.startAt) }}</span>
                <span class="text-fg-subtle truncate text-xs">{{
                  store.hydrate(b).service?.name
                }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section v-if="history?.past.length">
          <h3 class="text-fg-subtle mb-2 text-xs font-semibold">آخر زياراته</h3>
          <ul class="border-border divide-border divide-y rounded-[var(--radius-md)] border">
            <li v-for="b in history.past" :key="b.id">
              <button
                type="button"
                class="hover:bg-surface-hover flex w-full items-center gap-3 px-3 py-2.5 text-start"
                @click="goTo(b.id)"
              >
                <span class="text-fg min-w-0 flex-1 truncate text-sm" data-numeric
                  >{{ fullDate(b.startAt) }} · {{ store.hydrate(b).service?.name }}</span
                >
                <StatusBadge :status="b.status" size="sm" />
              </button>
            </li>
          </ul>
        </section>

        <RouterLink
          v-if="view.customer"
          :to="{ path: '/app/customers', query: { customer: view.customer.id } }"
          class="text-fg-subtle hover:text-fg block text-center text-xs font-semibold underline-offset-4 hover:underline"
          >ملف العميل الكامل</RouterLink
        >
      </div>

      <!-- ------------------------------------------------------- chat -->
      <div v-else-if="tab === 'chat'" class="space-y-3">
        <ConversationThread :booking-id="booking.id" :live="live" />
        <RouterLink
          :to="{ path: '/app/guard', query: { tab: 'conversations', c: booking.id } }"
          class="border-border text-fg hover:bg-surface-hover flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border py-2 text-sm font-semibold"
        >
          <MessagesSquare class="h-4 w-4" aria-hidden="true" /> افتح في صندوق المحادثات للرد
        </RouterLink>
      </div>

      <!-- -------------------------------------------------------- log -->
      <ol v-else class="relative space-y-4">
        <span
          class="bg-border absolute inset-y-1 w-px"
          style="inset-inline-start: 15px"
          aria-hidden="true"
        />
        <li
          v-for="(e, i) in [...booking.history].reverse()"
          :key="i"
          class="relative flex items-start gap-3"
        >
          <span
            class="bg-surface border-border text-fg-muted relative grid h-8 w-8 shrink-0 place-items-center rounded-full border"
            aria-hidden="true"
          >
            <component :is="EVENT_ICON[e.type] ?? CheckCheck" class="h-3.5 w-3.5" />
          </span>
          <div class="min-w-0 pt-1">
            <p class="text-fg text-sm">{{ e.summary }}</p>
            <p class="text-fg-faint text-xs" data-numeric>
              {{ fullDate(e.at) }} · {{ time(e.at) }}
            </p>
          </div>
        </li>
      </ol>
    </div>
  </BaseDrawer>

  <ConfirmDialog
    :open="confirmCancel"
    title="إلغاء الحجز؟"
    :message="`سيتم إلغاء حجز ${view?.customer?.name ?? ''} في ${booking ? fullDate(booking.startAt) : ''}. يمكنك التراجع مباشرة بعد الإلغاء.`"
    confirm-label="نعم، ألغِ الحجز"
    @confirm="doCancel"
    @cancel="confirmCancel = false"
  />

  <BookingFormDrawer
    :open="rescheduleOpen"
    :reschedule-id="booking?.id ?? null"
    @close="rescheduleOpen = false"
  />
</template>
