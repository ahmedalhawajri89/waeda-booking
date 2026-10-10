<script setup>
import { computed, ref } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'
import { NUMBER_LOCALE } from '@/lib/format'
import { planByKey, TRIAL_DAYS, TRIAL_PLAN } from '@/data/plans'

/**
 * What no-shows cost, in the owner's own numbers.
 *
 * Every figure on this section comes from the four inputs. The last one, how
 * much of the loss reminders win back, is the visitor's assumption and is
 * labelled as one; the page makes no claim of its own about it.
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

const trial = `جرّب ${planByKey(TRIAL_PLAN).name} ${TRIAL_DAYS} يوماً`

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
  },
]
</script>

<template>
  <section id="calculator" class="section bg-surface">
    <div class="section-inner">
      <header class="mb-12 max-w-2xl md:mb-16">
        <h2 v-reveal class="type-h1 text-fg mb-4">كم يكلّفك الغياب؟</h2>
        <p v-reveal="60" class="type-lede">
          ضع أرقام منشأتك. الحساب يجري هنا في الصفحة، ولا يُرسل أي شيء.
        </p>
      </header>

      <div
        v-reveal
        class="border-border grid overflow-hidden rounded-[var(--radius-xl)] border lg:grid-cols-[1.2fr_1fr]"
      >
        <div class="bg-surface space-y-7 p-6 sm:p-8">
          <div v-for="(f, i) in INPUTS" :key="f.label">
            <div class="mb-2.5 flex items-center justify-between gap-4">
              <label :for="`calc-${i}`" class="text-fg text-[15px] font-semibold">{{
                f.label
              }}</label>
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
              :aria-valuetext="`${fmt(f.model.value)} ${f.unit}`"
              v-model.number="f.model.value"
              type="range"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              class="range w-full"
              :style="{ '--p': `${((f.model.value - f.min) / (f.max - f.min)) * 100}%` }"
            />
            <p v-if="f.note" class="text-fg-subtle mt-2 text-[13px]">{{ f.note }}</p>
          </div>
        </div>

        <div
          class="bg-surface-sunken border-border flex flex-col justify-center gap-6 border-t p-6 sm:p-8 lg:border-s lg:border-t-0"
        >
          <div>
            <p class="text-fg-subtle mb-1 text-sm">مواعيد تضيع كل شهر</p>
            <p class="text-fg font-display text-3xl font-bold" data-numeric>
              {{ fmt(missedPerMonth) }}
              <span class="text-fg-subtle text-base font-medium">موعداً</span>
            </p>
          </div>
          <div>
            <p class="text-fg-subtle mb-1 text-sm">دخل يضيع كل شهر</p>
            <p class="text-fg font-display text-3xl font-bold" data-numeric>
              {{ fmt(lostPerMonth) }} <span class="text-fg-subtle text-base font-medium">ر.س</span>
            </p>
          </div>
          <!-- Only the bottom line is announced: the whole panel, live, read out
               every step of a slider being dragged. -->
          <div class="border-border border-t pt-6" aria-live="polite" aria-atomic="true">
            <p class="text-fg-subtle mb-1 text-sm">ما يمكن استرداده بحسب افتراضك</p>
            <p class="text-primary-fg font-display text-4xl font-bold" data-numeric>
              {{ fmt(backPerMonth) }} <span class="text-base font-medium">ر.س شهرياً</span>
            </p>
            <p class="text-fg-muted mt-1 text-sm" data-numeric>
              أي {{ fmt(backPerYear) }} ر.س في السنة.
            </p>
          </div>
          <RouterLink
            to="/register"
            class="btn-brand inline-flex items-center justify-center rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold"
          >
            {{ trial }}
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
</style>
