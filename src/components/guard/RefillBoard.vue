<script setup>
import { computed, onMounted, ref } from 'vue'
import { addDays, startOfDay } from 'date-fns'
import {
  CalendarPlus,
  CalendarX2,
  Check,
  CircleDashed,
  FlaskConical,
  Hourglass,
  MessageCircle,
  Repeat,
  Send,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useGuardStore } from '@/stores/guard'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { useSubscriptionStore } from '@/stores/subscription'
import { bookableResources, resources, serviceById } from '@/data/catalog'
import { business, initialOf } from '@/data/business'
import { isDemoBackend } from '@/data/repository'
import { useGuestAvailability } from '@/composables/useGuestAvailability'
import { wants } from '@/lib/waitlist'
import { dayLabel, fromNow, money, relativeDayTime } from '@/lib/format'
import EmptyState from '@/components/ui/EmptyState.vue'

/**
 * Refill: turning a cancellation back into a booking.
 *
 * When an appointment is cancelled (or released for silence), the guard offers
 * the time to up to three people — those waiting for exactly that, then the
 * service's regulars — and the first "yes" books it. This board shows that
 * happening, slot by slot, and what it has been worth.
 *
 * The waitlist beside it is not just a list to prune: each person waiting is
 * shown the soonest time that fits what they asked for, with a button to book
 * them into it now — the desk does not have to wait for a cancellation.
 */
const emit = defineEmits(['openBooking', 'createAt'])
const guard = useGuardStore()
const store = useBookingsStore()
const customers = useCustomersStore()
const avail = useGuestAvailability()
const sub = useSubscriptionStore()

onMounted(async () => {
  await Promise.all([guard.loadWaitlist(), customers.load()])
  await avail.loadBusy(resources.filter((r) => r.isActive))
})

const nameOf = (id) => customers.byId(id)?.name ?? 'عميل'

/* ------------------------------------------------------------ the slots */
const board = computed(() =>
  guard.refills.map((r) => {
    const freed = store.byId(r.bookingId)
    const view = freed ? store.hydrate(freed) : null
    const answered = r.candidates.filter((c) => c.answer).length
    const past = freed ? new Date(freed.startAt) < new Date() : true
    const state = r.won ? 'filled' : past || answered === r.candidates.length ? 'unfilled' : 'open'
    return {
      ...r,
      freed,
      view,
      state,
      winner: r.won ? nameOf(r.won.customerId) : null,
      value: r.won?.payload?.priceMinor ?? freed?.priceMinor ?? 0,
    }
  }),
)

const STATE = {
  open: { label: 'يُعرض الآن', tone: 'bg-primary-soft text-primary-fg', icon: Send },
  filled: { label: 'أُعيد ملؤه', tone: 'bg-success-50 text-success-700', icon: Check },
  unfilled: { label: 'لم يُملأ', tone: 'bg-surface-sunken text-fg-subtle', icon: CircleDashed },
}

const ANSWER = {
  backfill_won: { label: 'قبل وحُجز له', tone: 'text-success-700', icon: Check },
  backfill_taken: { label: 'قبل متأخراً، سبقه غيره', tone: 'text-fg-subtle', icon: CircleDashed },
  backfill_declined: { label: 'اعتذر', tone: 'text-fg-subtle', icon: X },
}
function outcomeOf(c) {
  if (!c.answer) return null
  const ack = guard.messages.find(
    (m) =>
      m.direction === 'out' &&
      m.customerId === c.customerId &&
      m.at === c.answer.at &&
      m.template.startsWith('backfill_'),
  )
  return ack ? ANSWER[ack.template] : { label: 'أُحيل للفريق', tone: 'text-warning-700', icon: X }
}

/* ------------------------------------------------------------- numbers */
const filled = computed(() => board.value.filter((r) => r.state === 'filled'))
const decided = computed(() => board.value.filter((r) => r.state !== 'open'))
const KPIS = computed(() => [
  { label: 'مواعيد أُعيد ملؤها', value: filled.value.length },
  { label: 'إيراد استُرد', value: money(guard.protectedRevenue.refilled), accent: true },
  {
    label: 'نسبة النجاح',
    value: decided.value.length
      ? `${Math.round((filled.value.length / decided.value.length) * 100)}%`
      : '—',
  },
  { label: 'ينتظرون موعداً', value: waiting.value.length },
])

const STEPS = [
  { icon: CalendarX2, title: 'يُلغى موعد', body: 'أو يُحرَّر لأن صاحبه لم يؤكد' },
  { icon: Send, title: 'يعرضه الحارس', body: 'على 3: المنتظرين أولاً ثم المعتادين' },
  { icon: UserCheck, title: 'أول من يقبل', body: 'يُحجز له تلقائياً، ويُبلَّغ الباقون' },
  { icon: Sparkles, title: 'لا يضيع الدخل', body: 'الموعد الملغى صار حجزاً جديداً' },
]

/* ---------------------------------------------------------- simulator */
const busy = ref(null)
async function answer(offerId, text) {
  busy.value = offerId
  try {
    const r = await guard.replyToOffer(offerId, text)
    if (r.booking) toast.success('أُعيد ملء الموعد وحُجز للعميل')
    else if (r.intent === 'confirm') toast('سبقه عميل آخر إلى الموعد')
  } catch {
    toast.error('تعذّر إرسال الرد.')
  } finally {
    busy.value = null
  }
}

/** Demo only: cancel an upcoming booking somebody is waiting for, and watch. */
const trying = ref(false)
async function tryIt() {
  const soon = Date.now() + 2 * 3600_000
  const upcoming = store.items
    .filter(
      (b) =>
        (b.status === 'pending' || b.status === 'confirmed') &&
        new Date(b.startAt).getTime() > soon &&
        new Date(b.startAt) < addDays(new Date(), 5),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  const pick =
    upcoming.find((b) => waiting.value.some((e) => wants(e, b))) ??
    upcoming.find((b) => waiting.value.some((e) => e.serviceId === b.serviceId)) ??
    upcoming[0]
  if (!pick) return toast('لا مواعيد قادمة مناسبة للتجربة.')
  trying.value = true
  try {
    store.setStatus(pick.id, 'cancelled')
    await guard.run()
    toast.success(`أُلغي موعد ${nameOf(pick.customerId)}، وعرضه الحارس على المنتظرين`)
  } finally {
    trying.value = false
  }
}

/* ------------------------------------------------------------ waitlist */
const waiting = computed(() =>
  guard.waitlist
    .filter((e) => e.status === 'waiting')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
)

const PARTS = { 540: 'الصبح', 720: 'الظهر', 900: 'العصر', 1020: 'المساء' }
const wish = (e) => {
  const day = e.day ? dayLabel(`${e.day}T12:00:00`) : 'أي يوم'
  const part = e.window ? (PARTS[e.window[0]] ?? '') : ''
  return part ? `${day} · ${part}` : day
}

/** The soonest free time that fits what this person asked for, if any. */
function fitFor(e) {
  const service = serviceById(e.serviceId)
  if (!service) return null
  const q = { service, resources: bookableResources(service) }
  for (let i = 0; i < 14; i++) {
    const day = addDays(startOfDay(new Date()), i)
    const slot = avail
      .slotsOn(day, q)
      .find(
        (s) => s.state === 'available' && wants(e, { serviceId: e.serviceId, startAt: s.startAt }),
      )
    if (slot) return slot
  }
  return null
}
const fits = computed(() => Object.fromEntries(waiting.value.map((e) => [e.id, fitFor(e)])))

function bookFor(e) {
  const c = customers.byId(e.customerId)
  const slot = fits.value[e.id]
  emit('createAt', {
    serviceId: e.serviceId,
    resourceId: slot?.resourceId,
    startAt: slot?.startAt,
    phone: c?.phone,
    name: c?.name,
  })
}

function whatsappFor(e) {
  const c = customers.byId(e.customerId)
  const d = (c?.phone ?? '').replace(/[^0-9]/g, '')
  if (!d) return null
  const slot = fits.value[e.id]
  const msg = slot
    ? `أهلاً ${c.name.split(' ')[0]}، توفّر موعد ${serviceById(e.serviceId)?.name} ${relativeDayTime(slot.startAt)} في ${business.name}. يناسبك نحجزه لك؟`
    : `أهلاً ${c.name.split(' ')[0]}، ما زلت على قائمة الانتظار في ${business.name}، وسنبلغك أول ما يتوفر موعد.`
  return `https://wa.me/${d.startsWith('0') ? '966' + d.slice(1) : d}?text=${encodeURIComponent(msg)}`
}
</script>

<template>
  <div class="space-y-5">
    <!-- the free plan shows what refilling does, and that it is off -->
    <p
      v-if="sub.loaded && !sub.allows('refill')"
      class="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm"
      data-refill-locked
    >
      <span class="text-fg-muted">
        إعادة الملء متوقفة في الباقة المجانية: الموعد الملغى يبقى فارغاً ولا يُعرض على قائمة
        الانتظار.
      </span>
      <RouterLink
        to="/app/settings?tab=plan"
        class="text-fg shrink-0 font-semibold underline underline-offset-4"
        >فعّلها من الأساسية</RouterLink
      >
    </p>
    <!-- what it is for, and what it has been worth -->
    <section class="surface overflow-hidden" aria-labelledby="refill-what">
      <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div class="p-5">
          <h2 id="refill-what" class="text-fg mb-1 flex items-center gap-2 text-sm font-bold">
            <Repeat class="text-primary-fg h-4 w-4" aria-hidden="true" /> إعادة ملء المواعيد
          </h2>
          <p class="text-fg-subtle mb-5 text-xs">
            كل موعد يُلغى يعود حجزاً، دون أن يتصل أحد من الفريق.
          </p>
          <ol class="grid gap-4 sm:grid-cols-4">
            <li v-for="(s, i) in STEPS" :key="s.title" class="relative">
              <span
                class="bg-surface-sunken text-fg mb-2 grid h-9 w-9 place-items-center rounded-full"
                aria-hidden="true"
              >
                <component :is="s.icon" class="h-4 w-4" />
              </span>
              <span
                v-if="i < STEPS.length - 1"
                class="bg-border absolute top-[18px] hidden h-px sm:block"
                style="inset-inline-start: 2.75rem; inset-inline-end: 0.5rem"
                aria-hidden="true"
              />
              <p class="text-fg text-[13px] font-semibold">{{ s.title }}</p>
              <p class="text-fg-subtle text-xs leading-relaxed">{{ s.body }}</p>
            </li>
          </ol>
        </div>
        <dl class="border-border grid grid-cols-2 border-t lg:border-s lg:border-t-0">
          <div
            v-for="(k, i) in KPIS"
            :key="k.label"
            class="border-border p-4"
            :class="[i % 2 === 0 && 'border-e', i < 2 && 'border-b']"
          >
            <dt class="text-fg-subtle text-xs">{{ k.label }}</dt>
            <dd
              class="font-display mt-1 text-2xl font-bold"
              :class="k.accent ? 'text-primary-fg' : 'text-fg'"
              data-numeric
            >
              {{ k.value }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <!-- freed slots -->
      <section class="space-y-3" aria-labelledby="slots-h">
        <div class="flex items-center justify-between gap-3">
          <h2 id="slots-h" class="text-fg text-sm font-bold">المواعيد المتفرّغة</h2>
          <button
            v-if="isDemoBackend"
            type="button"
            class="border-border bg-surface text-fg hover:border-fg flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-semibold"
            :disabled="trying"
            title="تجريبي: يلغي موعداً قادماً ليعرضه الحارس على المنتظرين"
            @click="tryIt"
          >
            <FlaskConical class="h-3.5 w-3.5" aria-hidden="true" /> شاهدها تعمل
          </button>
        </div>

        <div v-if="!board.length" class="surface">
          <EmptyState
            :icon="Repeat"
            title="لا مواعيد متفرّغة الآن"
            description="عند أي إلغاء يظهر الموعد هنا، ويعرضه الحارس على المنتظرين والعملاء المعتادين خلال دقيقة."
          />
        </div>

        <article
          v-for="r in board"
          :key="r.bookingId"
          class="surface overflow-hidden"
          :aria-label="`${r.view?.service?.name ?? 'موعد'} ${r.freed ? relativeDayTime(r.freed.startAt) : ''}`"
        >
          <header class="flex flex-wrap items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="text-fg text-start text-sm font-bold hover:underline"
                @click="emit('openBooking', r.bookingId)"
              >
                {{ r.view?.service?.name }} ·
                <span data-numeric>{{ r.freed ? relativeDayTime(r.freed.startAt) : '' }}</span>
              </button>
              <p class="text-fg-subtle text-xs">
                {{ r.view?.resource?.name }} · ألغاه {{ r.view?.customer?.name ?? 'عميل' }} ·
                <span data-numeric>{{ money(r.value) }}</span>
              </p>
            </div>
            <span
              class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              :class="STATE[r.state].tone"
            >
              <span
                v-if="r.state === 'open'"
                class="bg-primary h-1.5 w-1.5 animate-pulse rounded-full"
                aria-hidden="true"
              />
              <component :is="STATE[r.state].icon" v-else class="h-3.5 w-3.5" aria-hidden="true" />
              {{ STATE[r.state].label }}
            </span>
          </header>

          <p
            v-if="r.state === 'filled'"
            class="bg-success-50 text-success-700 border-border border-t px-4 py-2 text-xs font-semibold"
          >
            حُجز لـ{{ r.winner }}، والموعد الملغى صار حجزاً من جديد.
          </p>

          <ul class="border-border divide-border divide-y border-t">
            <li
              v-for="c in r.candidates"
              :key="c.offer.id"
              class="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span
                class="bg-surface-sunken text-fg grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                aria-hidden="true"
                >{{ initialOf(nameOf(c.customerId)) }}</span
              >
              <span class="min-w-0 flex-1">
                <span class="text-fg block truncate text-sm font-semibold">{{
                  nameOf(c.customerId)
                }}</span>
                <span class="text-fg-subtle text-[11px]">
                  {{ c.reason === 'waitlist' ? 'من قائمة الانتظار' : 'عميل معتاد على الخدمة' }} ·
                  عُرض {{ fromNow(c.offer.at) }}
                </span>
              </span>
              <span
                v-if="outcomeOf(c)"
                class="flex items-center gap-1 text-xs font-semibold"
                :class="outcomeOf(c).tone"
              >
                <component :is="outcomeOf(c).icon" class="h-3.5 w-3.5" aria-hidden="true" />
                {{ outcomeOf(c).label }}
              </span>
              <template v-else-if="r.state === 'open'">
                <span class="text-fg-subtle text-xs">بانتظار رده</span>
                <span
                  class="border-border flex items-center gap-1 rounded-[var(--radius-sm)] border border-dashed p-0.5"
                  title="تجريبي: ردّ كأنك هذا العميل"
                >
                  <FlaskConical class="text-fg-faint mx-1 h-3 w-3" aria-hidden="true" />
                  <button
                    type="button"
                    class="text-success-700 hover:bg-success-50 rounded-[4px] px-2 py-0.5 text-xs font-semibold"
                    :disabled="busy === c.offer.id"
                    @click="answer(c.offer.id, 'نعم')"
                  >
                    يقبل
                  </button>
                  <button
                    type="button"
                    class="text-fg-subtle hover:bg-surface-hover rounded-[4px] px-2 py-0.5 text-xs font-semibold"
                    :disabled="busy === c.offer.id"
                    @click="answer(c.offer.id, 'لا شكراً')"
                  >
                    يعتذر
                  </button>
                </span>
              </template>
              <span v-else class="text-fg-faint text-xs">لم يرد</span>
            </li>
          </ul>
        </article>
      </section>

      <!-- who is waiting, and what is free for them now -->
      <section class="surface self-start overflow-hidden" aria-labelledby="wait-h">
        <header class="border-border flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 id="wait-h" class="text-fg flex items-center gap-2 text-sm font-bold">
              <Hourglass class="text-fg-subtle h-4 w-4" aria-hidden="true" /> قائمة الانتظار
            </h2>
            <p class="text-fg-subtle text-xs">ينضمون من صفحة الحجز حين يكون اليوم ممتلئاً.</p>
          </div>
          <span class="text-fg-subtle text-xs" data-numeric>{{ waiting.length }}</span>
        </header>

        <p v-if="!waiting.length" class="text-fg-subtle px-4 py-8 text-center text-sm">
          لا أحد ينتظر الآن.
        </p>

        <ul v-else class="divide-border divide-y">
          <li v-for="e in waiting" :key="e.id" class="px-4 py-3">
            <div class="flex items-start gap-3">
              <span
                class="bg-surface-sunken text-fg grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                aria-hidden="true"
                >{{ initialOf(nameOf(e.customerId)) }}</span
              >
              <div class="min-w-0 flex-1">
                <p class="text-fg truncate text-sm font-semibold">{{ nameOf(e.customerId) }}</p>
                <p class="text-fg-subtle truncate text-xs">
                  {{ serviceById(e.serviceId)?.name }} · {{ wish(e) }}
                </p>
                <p class="text-fg-faint text-[11px]">
                  ينتظر {{ fromNow(e.createdAt).replace('قبل ', 'منذ ') }}
                </p>
              </div>
              <button
                type="button"
                class="text-fg-faint hover:text-danger-700 shrink-0 rounded p-1"
                :aria-label="`إزالة ${nameOf(e.customerId)} من قائمة الانتظار`"
                title="إزالة من القائمة"
                @click="guard.removeFromWaitlist(e.id)"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div class="mt-2.5 flex flex-wrap items-center gap-2 ps-11">
              <span
                v-if="fits[e.id]"
                class="bg-success-50 text-success-700 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                data-numeric
                >متاح الآن: {{ relativeDayTime(fits[e.id].startAt) }}</span
              >
              <span v-else class="text-fg-faint text-[11px]">لا وقت يناسب طلبه حالياً</span>
              <span class="flex-1" />
              <button
                type="button"
                class="border-border text-fg hover:border-fg flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold"
                @click="bookFor(e)"
              >
                <CalendarPlus class="h-3.5 w-3.5" aria-hidden="true" /> احجز له
              </button>
              <a
                v-if="whatsappFor(e)"
                :href="whatsappFor(e)"
                target="_blank"
                rel="noopener"
                class="border-border text-fg-muted hover:text-fg grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] border"
                aria-label="راسله على واتساب"
                title="راسله على واتساب"
              >
                <MessageCircle class="h-3.5 w-3.5" />
              </a>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
