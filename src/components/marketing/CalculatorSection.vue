<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Minus, Plus } from 'lucide-vue-next'
import { NUMBER_LOCALE } from '@/lib/format'
import { planByKey, TRIAL_DAYS, TRIAL_PLAN } from '@/data/plans'
import { useTween } from '@/composables/useTween'

/**
 * What no-shows cost, in the owner's own numbers — and shown, not only said.
 *
 * Every figure here comes from the four inputs and the plan file. The last
 * input, how much reminders and the waitlist win back, is the visitor's own
 * assumption and is marked as one; the page makes no claim of its own.
 *
 * The month is drawn as a grid, a tile per lost appointment, the ones won
 * back turning green as the assumption rises; the figures travel to their
 * new values; and what is won back is set against the plan's own price, the
 * question the visitor is actually asking. Honest either way: when it does
 * not cover the price, it says so and points to the free plan.
 */
const perWeek = ref(60)
const price = ref(150)
const noShowRate = ref(12)
const recovered = ref(40)

const WEEKS_PER_MONTH = 52 / 12

const missedPerMonth = computed(() =>
  Math.round(perWeek.value * WEEKS_PER_MONTH * (noShowRate.value / 100)),
)
const lostPerMonth = computed(() => missedPerMonth.value * price.value)
const backPerMonth = computed(() => Math.round(lostPerMonth.value * (recovered.value / 100)))
const backPerYear = computed(() => backPerMonth.value * 12)

const n = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 })
const fmt = (v) => n.format(v)

/** One step up or down, for an exact value a slider is too coarse to hit on a phone. */
function nudge(f, dir) {
  f.model.value = Math.min(f.max, Math.max(f.min, f.model.value + dir * f.step))
}

const INPUTS = [
  { model: perWeek, label: 'مواعيدك في الأسبوع', min: 5, max: 400, step: 5, unit: 'موعد' },
  { model: price, label: 'متوسط قيمة الموعد', min: 20, max: 1500, step: 10, unit: 'ر.س' },
  { model: noShowRate, label: 'نسبة من لا يحضر اليوم', min: 1, max: 40, step: 1, unit: '%' },
  {
    model: recovered,
    label: 'كم تتوقع أن يسترد التذكير وقائمة الانتظار؟',
    min: 10,
    max: 80,
    step: 5,
    unit: '%',
    note: 'هذا افتراضك أنت. ابدأ بتقدير متحفظ.',
    assumption: true,
  },
]

/* --------------------------------------------- counted up on first sight */
const root = ref(null)
const seen = ref(false)
let io
onMounted(() => {
  io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return
      seen.value = true
      io.disconnect()
    },
    { threshold: 0.3 },
  )
  io.observe(root.value)
})
onBeforeUnmount(() => io?.disconnect())

const missedShown = useTween(() => (seen.value ? missedPerMonth.value : 0), { from: 0 }).value
const lostShown = useTween(() => (seen.value ? lostPerMonth.value : 0), { from: 0, ms: 900 }).value
const backShown = useTween(() => (seen.value ? backPerMonth.value : 0), { from: 0, ms: 900 }).value

/* --------------------------------------------------------- the month grid */
const MAX_TILES = 60
const tiles = computed(() => (seen.value ? Math.min(missedPerMonth.value, MAX_TILES) : 0))
const wonTiles = computed(() => Math.round(tiles.value * (recovered.value / 100)))
const moreTiles = computed(() => Math.max(0, missedPerMonth.value - MAX_TILES))

/* ---------------------------------------------- set against the plan price */
const pro = planByKey('pro')
const planMonthly = pro.priceMinor / 100
const covers = computed(() => backPerMonth.value >= planMonthly)
const times = computed(() => backPerMonth.value / planMonthly)
const barMax = computed(() => Math.max(backPerMonth.value, planMonthly))
const backBar = computed(() => (seen.value ? (backPerMonth.value / barMax.value) * 100 : 0))
const planBar = computed(() => (seen.value ? (planMonthly / barMax.value) * 100 : 0))
const verdict = computed(() =>
  covers.value
    ? `أي نحو ${times.value >= 10 ? fmt(times.value) : times.value.toFixed(1).replace(/\.0$/, '')} أضعاف سعر الباقة.`
    : 'أقل من سعر الباقة. ابدأ بالمجانية، وارجع للحساب حين يكبر نشاطك.',
)
const cta = computed(() =>
  covers.value
    ? { to: '/register', label: `جرّب ${planByKey(TRIAL_PLAN).name} ${TRIAL_DAYS} يوماً` }
    : { to: '/register', label: 'ابدأ مجاناً' },
)
</script>

<template>
  <section id="calculator" ref="root" class="section bg-surface">
    <div class="section-inner">
      <header class="mb-12 max-w-2xl md:mb-16">
        <h2 v-reveal class="type-h1 text-fg mb-4">كم يكلّفك الغياب؟</h2>
        <p v-reveal="60" class="type-lede">
          ضع أرقام منشأتك. الحساب يجري هنا في الصفحة، ولا يُرسل أي شيء.
        </p>
      </header>

      <div
        v-reveal
        class="border-border grid overflow-hidden rounded-[var(--radius-xl)] border lg:grid-cols-[1.1fr_1fr]"
      >
        <!-- the owner's numbers -->
        <div class="bg-surface space-y-6 p-6 sm:p-8">
          <div
            v-for="(f, i) in INPUTS"
            :key="f.label"
            :class="
              f.assumption &&
              'border-border-strong rounded-[var(--radius-lg)] border border-dashed p-4 sm:-mx-4'
            "
          >
            <div class="mb-2.5 flex items-center justify-between gap-4">
              <label :for="`calc-${i}`" class="text-fg text-[15px] font-semibold">
                {{ f.label }}
                <span
                  v-if="f.assumption"
                  class="bg-surface-sunken text-fg-muted ms-1 rounded-full px-2 py-0.5 align-middle text-[11px] font-bold"
                  >افتراضك</span
                >
              </label>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  class="border-border text-fg-muted hover:text-fg grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border disabled:opacity-40"
                  :aria-label="`أقل: ${f.label}`"
                  :disabled="f.model.value <= f.min"
                  @click="nudge(f, -1)"
                >
                  <Minus class="h-4 w-4" aria-hidden="true" />
                </button>
                <span class="text-fg min-w-[4.5rem] text-center text-lg font-bold" data-numeric>
                  {{ fmt(f.model.value) }}
                  <span class="text-fg-subtle text-sm font-medium">{{ f.unit }}</span>
                </span>
                <button
                  type="button"
                  class="border-border text-fg-muted hover:text-fg grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border disabled:opacity-40"
                  :aria-label="`أكثر: ${f.label}`"
                  :disabled="f.model.value >= f.max"
                  @click="nudge(f, 1)"
                >
                  <Plus class="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <input
              :id="`calc-${i}`"
              v-model.number="f.model.value"
              :aria-valuetext="`${fmt(f.model.value)} ${f.unit}`"
              type="range"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              class="range w-full"
              :style="{ '--p': `${((f.model.value - f.min) / (f.max - f.min)) * 100}%` }"
            />
            <div class="text-fg-subtle mt-1 flex justify-between text-[11px]" aria-hidden="true">
              <span data-numeric>{{ fmt(f.min) }}</span>
              <span data-numeric>{{ fmt(f.max) }}</span>
            </div>
            <p v-if="f.note" class="text-fg-subtle mt-1.5 text-[13px]">{{ f.note }}</p>
          </div>
        </div>

        <!-- what it comes to -->
        <div
          class="bg-surface-sunken border-border flex flex-col gap-6 border-t p-6 sm:p-8 lg:border-s lg:border-t-0"
        >
          <!-- the month, drawn -->
          <div aria-hidden="true">
            <p class="text-fg-subtle mb-2.5 text-xs font-semibold">شهرك: كل مربع موعد ضاع</p>
            <TransitionGroup tag="div" name="tile" class="grid grid-cols-10 gap-1">
              <span
                v-for="t in tiles"
                :key="t"
                class="tile grid aspect-square place-items-center rounded-[4px] transition-colors duration-300"
                :class="t <= wonTiles ? 'bg-success-600 text-white' : 'bg-border'"
                :style="{ transitionDelay: `${(t % 10) * 12}ms` }"
              >
                <Check v-if="t <= wonTiles" class="h-2.5 w-2.5" stroke-width="3.5" />
              </span>
            </TransitionGroup>
            <div class="text-fg-subtle mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span class="flex items-center gap-1.5">
                <span class="bg-border h-2.5 w-2.5 rounded-[2px]" /> يضيع
              </span>
              <span class="flex items-center gap-1.5">
                <span class="bg-success-600 h-2.5 w-2.5 rounded-[2px]" /> يعود بالتذكير وقائمة
                الانتظار
              </span>
              <span v-if="moreTiles" data-numeric>و{{ fmt(moreTiles) }} غيرها</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4" aria-hidden="true">
            <div>
              <p class="text-fg-subtle mb-1 text-xs">مواعيد تضيع كل شهر</p>
              <p class="text-fg font-display text-2xl font-bold" data-numeric>
                {{ fmt(missedShown) }}
                <span class="text-fg-subtle text-sm font-medium">موعداً</span>
              </p>
            </div>
            <div>
              <p class="text-fg-subtle mb-1 text-xs">دخل يضيع كل شهر</p>
              <p class="text-fg font-display text-2xl font-bold" data-numeric>
                {{ fmt(lostShown) }} <span class="text-fg-subtle text-sm font-medium">ر.س</span>
              </p>
            </div>
          </div>

          <div class="border-border border-t pt-5">
            <p class="text-fg-subtle mb-1 text-sm" aria-hidden="true">
              ما يمكن استرداده بحسب افتراضك
            </p>
            <p
              class="text-primary-fg font-display text-4xl font-bold"
              data-numeric
              aria-hidden="true"
            >
              {{ fmt(backShown) }} <span class="text-base font-medium">ر.س شهرياً</span>
            </p>
            <p class="text-fg-muted mt-1 text-sm" data-numeric aria-hidden="true">
              أي {{ fmt(backPerYear) }} ر.س في السنة.
            </p>

            <!-- set against what the plan costs -->
            <div class="mt-4 space-y-2" aria-hidden="true">
              <div class="flex items-center gap-3">
                <span class="text-fg-subtle w-20 shrink-0 text-xs">ما تسترده</span>
                <span class="bg-border h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    class="bar bg-primary block h-full rounded-full"
                    :style="{ width: `${backBar}%` }"
                  />
                </span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-fg-subtle w-20 shrink-0 text-xs">{{ pro.name }}</span>
                <span class="bg-border h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    class="bar bg-fg-subtle block h-full rounded-full"
                    :style="{ width: `${planBar}%` }"
                  />
                </span>
              </div>
              <p class="text-fg-muted text-sm" data-numeric>
                {{ pro.name }} بـ{{ fmt(planMonthly) }} ر.س شهرياً. {{ verdict }}
              </p>
            </div>

            <!-- what a screen reader hears: the settled figures, once -->
            <p class="sr-only" aria-live="polite" aria-atomic="true">
              يضيع كل شهر {{ fmt(missedPerMonth) }} موعداً و{{ fmt(lostPerMonth) }} ريالاً. يمكن
              استرداد {{ fmt(backPerMonth) }} ريالاً شهرياً بحسب افتراضك. {{ verdict }}
            </p>
          </div>

          <RouterLink
            :to="cta.to"
            class="btn-brand inline-flex items-center justify-center rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold"
          >
            {{ cta.label }}
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.range {
  appearance: none;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to left,
    var(--color-fg) 0 var(--p),
    var(--color-border) var(--p) 100%
  );
  cursor: pointer;
}
html[dir='ltr'] .range {
  background: linear-gradient(
    to right,
    var(--color-fg) 0 var(--p),
    var(--color-border) var(--p) 100%
  );
}
.range::-webkit-slider-thumb {
  appearance: none;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-surface);
  border: 2px solid var(--color-fg);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
}
.range::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--color-surface);
  border: 2px solid var(--color-fg);
}
.range:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 4px;
}

/* Tiles arrive and leave with a small pop. */
.tile-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease;
}
.tile-leave-active {
  transition: opacity 0.2s ease;
}
.tile-enter-from {
  transform: scale(0.4);
  opacity: 0;
}
.tile-leave-to {
  opacity: 0;
}

.bar {
  transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .tile,
  .bar {
    transition: none;
  }
}
</style>
