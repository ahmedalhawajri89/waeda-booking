<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Check,
  ChevronDown,
  Clock,
  Info,
  MessageCircle,
  Phone,
  Send,
  SlidersHorizontal,
  Wallet,
  MessagesSquare,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useGuardStore } from '@/stores/guard'
import { useCustomersStore } from '@/stores/customers'
import RefillBoard from '@/components/guard/RefillBoard.vue'
import Inbox from '@/components/guard/Inbox.vue'
import { headlineAction } from '@/lib/guard'
import { TEMPLATE_LABEL } from '@/lib/guardEngine'
import { notableFactors } from '@/lib/risk'
import { money, relativeDay, relativeDayTime, time } from '@/lib/format'
import { business } from '@/data/business'
import { clone } from '@/lib/clone'
import { toast } from 'vue-sonner'

/**
 * The appointment guard: which of this week's bookings are likely to be
 * missed, why, what that is worth, and what the policy will do about each.
 *
 * Everything here comes from the business's own history through the model in
 * src/lib/risk.js — the screen says how many bookings it learned from, so an
 * operator can judge how much to trust it.
 */
const emit = defineEmits(['openBooking', 'createAt'])
const store = useBookingsStore()
const guard = useGuardStore()
const customers = useCustomersStore()

/**
 * Three questions, three tabs: who is likely to miss (overview), what
 * customers said back (conversations), and how freed time gets filled
 * (refill). One long page made the second question — the one that needs a
 * person — the easiest to scroll past.
 */
const route = useRoute()
const router = useRouter()
const TABS = computed(() => [
  { value: 'overview', label: 'نظرة عامة', icon: ShieldCheck, count: flagged.value.length },
  {
    value: 'conversations',
    label: 'المحادثات',
    icon: MessagesSquare,
    count: guard.forStaff.length,
    urgent: true,
  },
  {
    value: 'refill',
    label: 'إعادة الملء',
    icon: RefreshCcw,
    count: (guard.waitlist ?? []).filter((w) => w.status === 'waiting').length,
  },
])
const tab = ref(
  ['overview', 'conversations', 'refill'].includes(route.query.tab) ? route.query.tab : 'overview',
)
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }))
watch(
  () => route.query.tab,
  (t) => {
    if (t && t !== tab.value && ['overview', 'conversations', 'refill'].includes(t)) tab.value = t
  },
)

onMounted(() => {
  store.load()
  customers.load()
  guard.load()
  guard.loadWaitlist()
})

const ACTIVITY = [
  { key: 'sent', label: 'رسائل أرسلها الحارس' },
  { key: 'confirmed', label: 'أكّدوا حضورهم' },
  { key: 'cancelled', label: 'ألغوا مبكراً فأُتيح الوقت' },
  { key: 'rescheduled', label: 'أُجّلت بالمحادثة' },
  { key: 'released', label: 'حُرّرت تلقائياً' },
  { key: 'refilled', label: 'أُعيد ملؤها' },
]

const pct = (p) => `${Math.round(p * 100)}%`
const model = computed(() => guard.model)
const flagged = computed(() => guard.flagged)
const maxStrength = computed(() => Math.max(0.01, ...model.value.drivers.map((d) => d.strength)))

/* ---------------------------------------------------------- follow-ups */
const tierFilter = ref('all')
const TIER_FILTERS = computed(() => [
  { value: 'all', label: 'الكل', count: flagged.value.length },
  {
    value: 'high',
    label: 'مرتفع',
    count: flagged.value.filter((x) => x.risk.tier === 'high').length,
  },
  {
    value: 'medium',
    label: 'متوسط',
    count: flagged.value.filter((x) => x.risk.tier === 'medium').length,
  },
])

/** Flagged bookings, by day, riskiest first within a day. */
const followUps = computed(() => {
  const rows = flagged.value.filter(
    (x) => tierFilter.value === 'all' || x.risk.tier === tierFilter.value,
  )
  const days = new Map()
  for (const x of [...rows].sort((a, b) => a.booking.startAt.localeCompare(b.booking.startAt))) {
    const key = x.booking.startAt.slice(0, 10)
    if (!days.has(key)) days.set(key, { key, label: relativeDay(x.booking.startAt), items: [] })
    days.get(key).items.push(x)
  }
  for (const d of days.values()) d.items.sort((a, b) => b.risk.probability - a.risk.probability)
  return [...days.values()]
})

/** Where the guard's conversation with this customer stands, in one line. */
function contactOf(booking) {
  const t = guard.thread(booking.id)
  const lastOut = [...t].reverse().find((m) => m.direction === 'out')
  const lastIn = [...t].reverse().find((m) => m.direction === 'in')
  if (lastIn && (!lastOut || lastIn.at > lastOut.at))
    return { icon: MessageCircle, label: `ردّ ${relativeDayTime(lastIn.at)}: «${lastIn.body}»` }
  if (lastOut)
    return {
      icon: Send,
      label: `أُرسل ${TEMPLATE_LABEL[lastOut.template] ?? 'رسالة'} ${relativeDayTime(lastOut.at)} · لم يرد بعد`,
    }
  return {
    icon: Clock,
    label: `لم يُراسَل بعد · الخطوة القادمة: ${headlineAction(booking && guard.riskOf(booking.id)?.tier, guard.policy)}`,
  }
}

function whatsappOf(booking) {
  const c = store.hydrate(booking).customer
  const d = (c?.phone ?? '').replace(/[^0-9]/g, '')
  if (!d) return null
  const msg = `مرحباً ${c.name}، نذكّرك بموعدك في ${business.name} ${relativeDayTime(booking.startAt)}. نرجو تأكيد حضورك بالرد على هذه الرسالة.`
  return `https://wa.me/${d.startsWith('0') ? '966' + d.slice(1) : d}?text=${encodeURIComponent(msg)}`
}

function withUndo(booking, label, change) {
  const before = clone(booking)
  change()
  toast.success(label, { action: { label: 'تراجع', onClick: () => store.restore(before) } })
}
const confirmBooking = (b) =>
  withUndo(b, 'تم تأكيد الحضور', () => store.setStatus(b.id, 'confirmed'))
const recordDeposit = (b) =>
  withUndo(b, 'سُجّل العربون', () => store.setPayment(b.id, 'deposit_paid'))

/** The strongest reasons a booking is at risk — only the ones that raise it. */
const reasons = (risk) => notableFactors(risk, { raising: true, limit: 2 }).map((f) => f.label)
</script>

<template>
  <div class="w-full space-y-6 p-4 lg:p-6 2xl:px-8">
    <!-- No second page title: the top bar already says where you are. What the
         guard is doing right now is the more useful first line. -->
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span
            class="bg-success-600 absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
          />
          <span class="bg-success-600 relative inline-flex h-2.5 w-2.5 rounded-full" />
        </span>
        <p class="text-fg text-sm">
          <strong class="font-semibold">الحارس يعمل</strong>
          <span class="text-fg-subtle">
            · يراقب <span data-numeric>{{ guard.week.length }}</span> حجزاً خلال الأيام السبعة
            القادمة، ويرسل التذكير وطلبات التأكيد وحده.</span
          >
        </p>
      </div>
      <RouterLink
        to="/app/settings?tab=guard"
        class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold"
      >
        <SlidersHorizontal class="h-4 w-4" aria-hidden="true" /> سياسة الحماية
      </RouterLink>
    </header>

    <div v-if="store.isLoading && !store.loaded" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SkeletonBlock v-for="n in 4" :key="n" variant="card" />
    </div>

    <template v-else>
      <nav
        class="border-border flex gap-1 overflow-x-auto overflow-y-hidden border-b"
        role="tablist"
        aria-label="أقسام الحارس"
      >
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          role="tab"
          :aria-selected="tab === t.value"
          class="-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors"
          :class="
            tab === t.value
              ? 'border-fg text-fg'
              : 'text-fg-subtle hover:text-fg border-transparent'
          "
          @click="tab = t.value"
        >
          <component :is="t.icon" class="h-4 w-4" aria-hidden="true" />
          {{ t.label }}
          <span
            v-if="t.count"
            class="rounded-full px-1.5 text-[11px] leading-5 font-bold"
            :class="t.urgent ? 'bg-primary text-fg-on-primary' : 'bg-surface-sunken text-fg-muted'"
            data-numeric
            >{{ t.count }}</span
          >
        </button>
      </nav>

      <!-- ===================================================== overview -->
      <template v-if="tab === 'overview'">
        <!-- three numbers, in the order an owner asks them -->
        <section
          class="border-border bg-surface grid overflow-hidden rounded-[var(--radius-lg)] border sm:grid-cols-3"
          aria-label="ملخص الحارس"
        >
          <div class="border-border p-5 sm:border-e">
            <p class="text-fg-subtle text-[13px]">حماه الحارس حتى الآن</p>
            <p class="font-display text-primary-fg mt-1 text-3xl font-bold" data-numeric>
              {{ money(guard.protectedRevenue.total) }}
            </p>
            <p class="text-fg-subtle mt-1 text-xs" data-numeric>
              أُجّل بدل أن يضيع {{ money(guard.protectedRevenue.kept) }} · أُعيد ملؤه
              {{ money(guard.protectedRevenue.refilled) }}
            </p>
          </div>
          <div class="border-border border-t p-5 sm:border-e sm:border-t-0">
            <p class="text-fg-subtle text-[13px]">معرّض للغياب هذا الأسبوع</p>
            <p class="font-display text-fg mt-1 text-3xl font-bold" data-numeric>
              {{ money(guard.exposureMinor) }}
            </p>
            <p class="text-fg-subtle mt-1 text-xs">
              <span data-numeric>{{ flagged.length }}</span> حجوزات تحتاج متابعة
            </p>
          </div>
          <div class="border-border border-t p-5 sm:border-t-0">
            <p class="text-fg-subtle text-[13px]">نسبة الغياب لديك</p>
            <p
              class="font-display mt-1 text-3xl font-bold"
              :class="model.overall > 0.15 ? 'text-danger-700' : 'text-fg'"
              data-numeric
            >
              {{ pct(model.overall) }}
            </p>
            <p class="text-fg-subtle mt-1 text-xs">
              تعلّمها من <span data-numeric>{{ model.settled }}</span> حجزاً سابقاً في منشأتك
            </p>
          </div>
        </section>

        <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <!-- who needs following up, by day, with the step that helps -->
          <section class="surface overflow-hidden" aria-labelledby="flagged-heading">
            <header
              class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
            >
              <div>
                <h2 id="flagged-heading" class="text-fg text-sm font-bold">يحتاج متابعتك</h2>
                <p class="text-fg-subtle text-xs">
                  حجوزات احتمال غيابها أعلى من المعتاد، خلال الأيام السبعة القادمة.
                </p>
              </div>
              <div class="flex gap-1" role="group" aria-label="تصفية حسب الخطر">
                <button
                  v-for="f in TIER_FILTERS"
                  :key="f.value"
                  type="button"
                  :aria-pressed="tierFilter === f.value"
                  class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                  :class="
                    tierFilter === f.value
                      ? 'border-fg bg-fg text-fg-inverse'
                      : 'border-border text-fg-muted hover:text-fg'
                  "
                  @click="tierFilter = f.value"
                >
                  {{ f.label }}
                  <span class="opacity-70" data-numeric>{{ f.count }}</span>
                </button>
              </div>
            </header>

            <EmptyState
              v-if="followUps.length === 0"
              variant="no-results"
              :icon="ShieldCheck"
              title="لا أحد يحتاج متابعة"
              description="كل الحجوزات القادمة منخفضة الخطر، والتذكيرات العادية تصل وحدها."
            />

            <div v-for="day in followUps" v-else :key="day.key">
              <p
                class="bg-surface-sunken text-fg-subtle border-border border-b px-4 py-1.5 text-xs font-semibold"
              >
                {{ day.label }}
              </p>
              <ul class="divide-border divide-y">
                <li v-for="{ booking, risk } in day.items" :key="booking.id" class="px-4 py-3.5">
                  <div class="flex flex-wrap items-start gap-x-4 gap-y-3">
                    <!-- the risk, as a figure and a meter -->
                    <div class="w-14 shrink-0 text-center">
                      <p
                        class="font-display text-lg leading-none font-bold"
                        :class="risk.tier === 'high' ? 'text-danger-700' : 'text-warning-700'"
                        data-numeric
                      >
                        {{ pct(risk.probability) }}
                      </p>
                      <span class="bg-surface-sunken mt-1.5 block h-1 overflow-hidden rounded-full">
                        <span
                          class="block h-full rounded-full"
                          :class="risk.tier === 'high' ? 'bg-danger-600' : 'bg-warning-600'"
                          :style="{ width: pct(risk.probability) }"
                        />
                      </span>
                      <p class="text-fg-faint mt-1 text-[10px]">
                        {{ risk.tier === 'high' ? 'مرتفع' : 'متوسط' }}
                      </p>
                    </div>

                    <!-- who, when, and why -->
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-start"
                      @click="emit('openBooking', booking.id)"
                    >
                      <p class="text-fg text-sm font-semibold">
                        {{ store.hydrate(booking).customer?.name }}
                      </p>
                      <p class="text-fg-subtle mt-0.5 text-xs" data-numeric>
                        {{ time(booking.startAt) }} · {{ store.hydrate(booking).service?.name }} ·
                        {{ store.hydrate(booking).resource?.name }}
                      </p>
                      <p class="mt-1.5 flex flex-wrap gap-1">
                        <span
                          v-for="r in reasons(risk)"
                          :key="r"
                          class="bg-surface-sunken text-fg-muted rounded-[4px] px-1.5 py-0.5 text-[11px]"
                          >{{ r }}</span
                        >
                      </p>
                      <p class="text-fg-subtle mt-1.5 flex items-center gap-1.5 text-[11px]">
                        <component
                          :is="contactOf(booking).icon"
                          class="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {{ contactOf(booking).label }}
                      </p>
                    </button>

                    <!-- what can be done now -->
                    <div class="flex w-full shrink-0 flex-wrap gap-1.5 sm:w-auto">
                      <button
                        v-if="booking.status === 'pending'"
                        type="button"
                        class="border-border bg-surface text-fg hover:border-fg flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-semibold"
                        @click="confirmBooking(booking)"
                      >
                        <Check class="h-3.5 w-3.5" aria-hidden="true" /> أكّد الحضور
                      </button>
                      <button
                        v-if="risk.tier === 'high' && booking.paymentStatus === 'unpaid'"
                        type="button"
                        class="border-border bg-surface text-fg hover:border-fg flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-semibold"
                        @click="recordDeposit(booking)"
                      >
                        <Wallet class="h-3.5 w-3.5" aria-hidden="true" /> سجّل عربوناً
                      </button>
                      <a
                        v-if="whatsappOf(booking)"
                        :href="whatsappOf(booking)"
                        target="_blank"
                        rel="noopener"
                        class="border-border bg-surface text-fg-muted hover:text-fg grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border"
                        aria-label="أرسل تذكيراً على واتساب"
                        title="أرسل تذكيراً على واتساب"
                      >
                        <MessageCircle class="h-4 w-4" />
                      </a>
                      <a
                        v-if="store.hydrate(booking).customer"
                        :href="`tel:${store.hydrate(booking).customer.phone}`"
                        class="border-border bg-surface text-fg-muted hover:text-fg grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border"
                        aria-label="اتصال"
                        title="اتصال"
                      >
                        <Phone class="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </section>

          <!-- why customers miss, here -->
          <aside class="space-y-5">
            <section class="surface p-4" aria-labelledby="drivers-heading">
              <h2 id="drivers-heading" class="text-fg text-sm font-bold">لماذا يغيب عملاؤك؟</h2>
              <p class="text-fg-subtle mb-4 text-xs">
                ما يرفع الغياب في منشأتك أنت، مرتّباً من الأقوى.
              </p>
              <ol class="space-y-3.5">
                <li v-for="(d, i) in model.drivers.slice(0, 5)" :key="d.key" class="flex gap-3">
                  <span
                    class="bg-surface-sunken text-fg-muted grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    data-numeric
                    >{{ i + 1 }}</span
                  >
                  <div class="min-w-0 flex-1">
                    <p class="text-fg text-[13px] font-semibold">{{ d.name }}</p>
                    <p class="text-fg-subtle truncate text-[11px]">الأسوأ: {{ d.worst || '—' }}</p>
                    <span class="bg-surface-sunken mt-1.5 block h-1 overflow-hidden rounded-full">
                      <span
                        class="bg-fg block h-full rounded-full"
                        :style="{ width: `${Math.round((d.strength / maxStrength) * 100)}%` }"
                      />
                    </span>
                  </div>
                </li>
              </ol>
            </section>

            <details class="surface group p-4">
              <summary
                class="text-fg flex cursor-pointer list-none items-center justify-between text-sm font-bold"
              >
                <span class="flex items-center gap-2">
                  <Info class="text-fg-subtle h-4 w-4" aria-hidden="true" /> كيف يحسب الحارس الخطر؟
                </span>
                <ChevronDown
                  class="text-fg-faint h-4 w-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <ol
                class="text-fg-muted mt-3 list-inside list-decimal space-y-2 text-xs leading-relaxed"
              >
                <li>
                  يقيس من حجوزاتك السابقة أثر كل عامل على الغياب: المهلة، والقناة، والدفع، والوقت.
                </li>
                <li>يبدأ من سجل العميل نفسه، ويضيف أثر ظروف الحجز، فيخرج احتمالاً مع أسبابه.</li>
                <li>تطبّق سياسة الحماية الإجراء المناسب: تذكير، أو طلب تأكيد، أو عربون.</li>
              </ol>
            </details>
          </aside>
        </div>
      </template>

      <!-- ================================================ conversations -->
      <template v-else-if="tab === 'conversations'">
        <!-- what the guard has handled on its own, in one quiet line -->
        <dl
          class="text-fg-subtle flex flex-wrap items-center gap-x-5 gap-y-1 text-xs"
          aria-label="نشاط الحارس"
        >
          <div v-for="k in ACTIVITY" :key="k.key" class="flex items-baseline gap-1.5">
            <dd class="text-fg text-sm font-bold" data-numeric>{{ guard.activity[k.key] }}</dd>
            <dt>{{ k.label }}</dt>
          </div>
        </dl>
        <Inbox @open-booking="emit('openBooking', $event)" />
      </template>

      <!-- ======================================================= refill -->
      <RefillBoard
        v-else
        @open-booking="emit('openBooking', $event)"
        @create-at="emit('createAt', $event)"
      />
    </template>
  </div>
</template>
