<script setup>
import { computed, ref } from 'vue'
import { Check, Minus, Plus, Sparkles } from 'lucide-vue-next'
import SectionHeading from './SectionHeading.vue'
import { MESSAGE_PACK, PLANS as PLAN_DATA, TRIAL_DAYS, YEARLY_MONTHS } from '@/data/plans'
import { NUMBER_LOCALE } from '@/lib/format'
import { useOwnerNumbers } from '@/composables/useOwnerNumbers'
import { useTween } from '@/composables/useTween'

const count = new Intl.NumberFormat(NUMBER_LOCALE)

/**
 * A comparison table that answers the visitor's own question: which one is
 * mine?
 *
 * It reads the appointments they gave the calculator above and asks one more
 * thing, how many people take bookings. One reminder per appointment is what
 * every plan's message count is spent on, so the plan that fits is the
 * smallest whose staff and messages cover theirs. That column lights up as
 * «تناسبك», says why in their numbers, and cells that fall short say so.
 * Nothing is invented: every limit comes from data/plans.js.
 *
 * Below `md` the matrix collapses into per-plan stacks — a three-column table
 * on a phone is unreadable.
 */
const yearly = ref(true)
const { perWeek, team } = useOwnerNumbers()

// The same plans the console sells — one file, so this page cannot drift.
const PLANS = PLAN_DATA.map((p) => ({
  key: p.key,
  name: p.name,
  monthly: p.priceMinor / 100,
  tagline: p.tagline,
  staff: p.staff,
  messages: p.messages,
  cta: p.priceMinor ? `جرّبها ${TRIAL_DAYS} يوماً` : 'ابدأ مجاناً',
}))

/* ------------------------------------------------------------ which fits */
const perMonth = computed(() => Math.round((perWeek.value * 52) / 12))
const fits = (p) => p.staff >= team.value && p.messages >= perMonth.value
const fitIndex = computed(() => {
  const i = PLANS.findIndex(fits)
  return i === -1 ? PLANS.length - 1 : i
})
const fit = computed(() => PLANS[fitIndex.value])
const people = (n) => (n === 1 ? 'لشخص واحد' : n === 2 ? 'لشخصين' : `لفريق من ${count.format(n)}`)
const reason = computed(() => {
  const need = `${people(team.value)} ومواعيد تقارب ${count.format(perMonth.value)} في الشهر، تحتاج رسالة تذكير لكل موعد.`
  const p = fit.value
  if (fits(p)) {
    return `${need} ${p.name} تكفي: حتى ${count.format(p.staff)} في الفريق، و${count.format(p.messages)} رسالة شهرياً.`
  }
  // Even the largest falls short: say what to add, from the plan file.
  const short = []
  if (p.staff < team.value) short.push(`تتسع لـ${count.format(p.staff)} في الفريق فقط`)
  if (p.messages < perMonth.value)
    short.push(
      `أضف باقات رسائل عند الحاجة (${count.format(MESSAGE_PACK.messages)} رسالة بـ${MESSAGE_PACK.priceMinor / 100} ر.س)`,
    )
  return `${need} ${p.name} أوسع باقة: ${short.join('، و')}.`
})
const shortOf = (p, key) =>
  key === 'staff' ? p.staff < team.value : key === 'messages' ? p.messages < perMonth.value : false

function step(d) {
  team.value = Math.min(30, Math.max(1, team.value + d))
}

/* --------------------------------------------------------------- the rows */
const FEATURES = [
  { label: 'حجوزات بلا حد، وصفحة حجز بلا حساب للعميل', included: [true, true, true] },
  { key: 'staff', label: 'عدد الموظفين', included: PLANS.map((p) => count.format(p.staff)) },
  {
    key: 'messages',
    label: 'رسائل واتساب شهرياً',
    included: PLANS.map((p) => count.format(p.messages)),
  },
  { label: 'مساعد الحضور: تذكير وتأكيد', included: [true, true, true] },
  { label: 'صندوق محادثات العملاء', included: [true, true, true] },
  { label: 'إعادة ملء المواعيد الملغاة', included: PLAN_DATA.map((p) => p.features.refill) },
  { label: 'طلب عربون من المعرّضين للغياب', included: PLAN_DATA.map((p) => p.features.deposits) },
  {
    label: `باقة ${MESSAGE_PACK.messages} رسالة إضافية بـ${MESSAGE_PACK.priceMinor / 100} ر.س`,
    included: [true, true, true],
  },
]

/* --------------------------------------------- prices that travel, savings */
// Yearly is ten months for twelve; shown as what it comes to per month.
const priceTweens = PLANS.map(
  (p) =>
    useTween(() => (yearly.value ? Math.round((p.monthly * YEARLY_MONTHS) / 12) : p.monthly), {
      ms: 500,
    }).value,
)
// Plain numbers for the template: refs inside an array are not unwrapped there.
const shownPrice = computed(() => priceTweens.map((t) => t.value))
const saving = (p) => p.monthly * 12 - p.monthly * YEARLY_MONTHS
</script>

<template>
  <section id="pricing" class="section bg-surface">
    <div class="section-inner">
      <SectionHeading
        title="ابدأ مجاناً، وادفع حين يكبر نشاطك"
        :lede="`كل منشأة جديدة تبدأ بتجربة الاحترافية ${TRIAL_DAYS} يوماً بلا بطاقة. بلا عقود ولا رسوم إعداد.`"
      />

      <!-- which one is mine -->
      <div
        v-reveal
        class="border-border bg-surface-sunken mx-auto mb-8 max-w-3xl rounded-[var(--radius-xl)] border p-5"
      >
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span id="team-label" class="text-fg text-sm font-semibold"
              >كم شخصاً يستقبل الحجوزات عندك؟</span
            >
            <div class="flex items-center gap-1.5" role="group" aria-labelledby="team-label">
              <button
                type="button"
                class="border-border bg-surface text-fg-muted hover:text-fg grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border disabled:opacity-40"
                aria-label="أقل"
                :disabled="team <= 1"
                @click="step(-1)"
              >
                <Minus class="h-4 w-4" aria-hidden="true" />
              </button>
              <span class="text-fg w-8 text-center text-lg font-bold" data-numeric>{{ team }}</span>
              <button
                type="button"
                class="border-border bg-surface text-fg-muted hover:text-fg grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border disabled:opacity-40"
                aria-label="أكثر"
                :disabled="team >= 30"
                @click="step(1)"
              >
                <Plus class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p class="text-fg-subtle text-sm">
            مواعيدك في الأسبوع:
            <span class="text-fg font-bold" data-numeric>{{ count.format(perWeek) }}</span>
            <a href="#calculator" class="text-fg ms-1 font-semibold underline underline-offset-4"
              >عدّلها في الحاسبة</a
            >
          </p>
        </div>
        <p class="text-fg-muted mt-4 flex items-start gap-2 text-sm" aria-live="polite">
          <Sparkles class="text-primary-fg mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{{ reason }}</span>
        </p>
      </div>

      <!-- billing toggle -->
      <div v-reveal class="mb-10 flex items-center justify-center gap-3">
        <button
          type="button"
          class="px-1 py-2 text-sm font-semibold"
          :class="!yearly ? 'text-fg' : 'text-fg-subtle'"
          @click="yearly = false"
        >
          شهري
        </button>
        <button
          type="button"
          role="switch"
          :aria-checked="yearly"
          aria-label="التبديل بين الدفع الشهري والسنوي"
          class="relative h-8 shrink-0 rounded-full border transition-colors"
          :class="yearly ? 'bg-primary border-primary' : 'border-border bg-surface-sunken'"
          style="width: 3.75rem"
          @click="yearly = !yearly"
        >
          <span
            class="bg-surface elev-raised absolute top-0.5 h-6 w-6 rounded-full transition-all duration-300"
            :style="{ insetInlineStart: yearly ? 'calc(100% - 1.625rem)' : '0.125rem' }"
          />
        </button>
        <button
          type="button"
          class="px-1 py-2 text-sm font-semibold"
          :class="yearly ? 'text-fg' : 'text-fg-subtle'"
          @click="yearly = true"
        >
          سنوي
        </button>
        <span class="bg-success-50 text-success-700 rounded-full px-2 py-0.5 text-[11px] font-bold">
          شهران مجاناً
        </span>
      </div>

      <!-- ---------- matrix, md and up ---------- -->
      <div v-reveal class="hidden md:block">
        <table class="w-full border-collapse">
          <caption class="sr-only">
            مقارنة الباقات والمزايا المتضمّنة في كل منها
          </caption>
          <thead>
            <tr>
              <th class="w-2/5"><span class="sr-only">الميزة</span></th>
              <th
                v-for="(p, pi) in PLANS"
                :key="p.name"
                scope="col"
                class="bg-surface sticky top-16 z-10 px-4 pt-4 pb-5 align-bottom"
              >
                <div
                  class="plan relative rounded-[var(--radius-lg)] border p-4 text-center"
                  :class="
                    pi === fitIndex
                      ? 'border-primary bg-primary-soft elev-raised is-fit'
                      : 'border-border bg-surface'
                  "
                >
                  <Transition name="badge">
                    <span
                      v-if="pi === fitIndex"
                      class="bg-primary text-fg-on-primary absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-bold whitespace-nowrap"
                      >تناسبك</span
                    >
                  </Transition>
                  <p class="type-h3 text-fg">{{ p.name }}</p>
                  <p class="text-fg-subtle mt-0.5 text-[12px]">{{ p.tagline }}</p>
                  <p class="mt-3 flex items-baseline justify-center gap-1.5">
                    <span class="text-fg text-2xl font-extrabold whitespace-nowrap" data-numeric>{{
                      p.monthly ? `${count.format(shownPrice[pi])} ر.س` : 'مجاناً'
                    }}</span>
                    <span v-if="p.monthly > 0" class="text-fg-subtle text-[12px]">/ شهرياً</span>
                  </p>
                  <Transition name="badge">
                    <p
                      v-if="yearly && p.monthly > 0"
                      class="text-success-700 mt-1 text-xs font-semibold"
                      data-numeric
                    >
                      توفّر {{ count.format(saving(p)) }} ر.س في السنة
                    </p>
                  </Transition>
                  <RouterLink
                    to="/register"
                    class="mt-3 block rounded-[var(--radius-md)] py-2 text-center text-[13px] font-bold transition-colors"
                    :class="
                      pi === fitIndex
                        ? 'btn-brand'
                        : 'border-border hover:border-primary-line hover:bg-primary-soft text-fg border'
                    "
                  >
                    {{ p.cta }}
                  </RouterLink>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in FEATURES" :key="f.label" class="border-border border-t">
              <th scope="row" class="text-fg-muted py-3 pe-4 text-start text-[14px] font-medium">
                {{ f.label }}
              </th>
              <td
                v-for="(inc, i) in f.included"
                :key="i"
                class="px-4 py-3 text-center transition-colors duration-300"
                :class="i === fitIndex && 'bg-primary-soft/50'"
              >
                <template v-if="typeof inc === 'string'">
                  <span
                    class="text-sm font-bold"
                    :class="shortOf(PLANS[i], f.key) ? 'text-fg-subtle line-through' : 'text-fg'"
                    data-numeric
                    >{{ inc }}</span
                  >
                  <span
                    v-if="shortOf(PLANS[i], f.key)"
                    class="text-danger-700 block text-[11px] font-semibold"
                    >لا تكفي</span
                  >
                </template>
                <Check
                  v-else-if="inc"
                  class="text-success-700 mx-auto h-4.5 w-4.5"
                  aria-hidden="true"
                />
                <Minus v-else class="text-border-strong mx-auto h-4.5 w-4.5" aria-hidden="true" />
                <span class="sr-only">
                  {{ PLANS[i].name }} — {{ inc ? 'متضمّن' : 'غير متضمّن' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ---------- stacked, below md ---------- -->
      <div class="space-y-4 md:hidden">
        <article
          v-for="(p, pi) in PLANS"
          :key="p.name"
          v-reveal="pi * 90"
          class="relative rounded-[var(--radius-xl)] border p-5 transition-colors duration-300"
          :class="
            pi === fitIndex
              ? 'border-primary elev-raised bg-primary-soft'
              : 'border-border bg-surface'
          "
        >
          <span
            v-if="pi === fitIndex"
            class="bg-primary text-fg-on-primary absolute start-5 -top-3 rounded-full px-3 py-0.5 text-[11px] font-bold"
            >تناسبك</span
          >
          <h3 class="type-h3 text-fg">{{ p.name }}</h3>
          <p class="text-fg-subtle mt-0.5 text-[13px]">{{ p.tagline }}</p>
          <p class="mt-4 flex items-baseline gap-1.5">
            <span class="text-fg text-3xl font-extrabold whitespace-nowrap" data-numeric>{{
              p.monthly ? `${count.format(shownPrice[pi])} ر.س` : 'مجاناً'
            }}</span>
            <span v-if="p.monthly > 0" class="text-fg-subtle text-[13px]">/ شهرياً</span>
          </p>
          <p
            v-if="yearly && p.monthly > 0"
            class="text-success-700 mt-1 text-xs font-semibold"
            data-numeric
          >
            توفّر {{ count.format(saving(p)) }} ر.س في السنة
          </p>
          <RouterLink
            to="/register"
            class="mt-4 block rounded-[var(--radius-md)] py-2.5 text-center text-sm font-bold transition-colors"
            :class="
              pi === fitIndex
                ? 'btn-brand'
                : 'border-border hover:border-primary-line text-fg bg-surface border'
            "
          >
            {{ p.cta }}
          </RouterLink>
          <ul class="border-border mt-5 space-y-2.5 border-t pt-4">
            <li
              v-for="f in FEATURES"
              :key="f.label"
              class="flex items-start gap-2 text-[13px]"
              :class="f.included[pi] ? 'text-fg-muted' : 'text-fg-subtle'"
            >
              <span
                v-if="typeof f.included[pi] === 'string'"
                class="min-w-4 shrink-0 font-bold"
                :class="shortOf(p, f.key) ? 'text-danger-700' : 'text-fg'"
                data-numeric
                >{{ f.included[pi] }}</span
              >
              <Check
                v-else-if="f.included[pi]"
                class="text-success-700 mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <Minus v-else class="text-border-strong mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ f.label }}<template v-if="shortOf(p, f.key)"> · لا تكفي</template></span>
              <span class="sr-only">{{ f.included[pi] ? '— متضمّن' : '— غير متضمّن' }}</span>
            </li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.plan {
  transition:
    background-color 0.35s ease,
    border-color 0.35s ease,
    box-shadow 0.35s ease,
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
/* The plan that fits stands a little forward. */
.is-fit {
  transform: translateY(-4px);
}
.badge-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.badge-leave-active {
  transition: opacity 0.15s ease;
}
.badge-enter-from {
  opacity: 0;
  transform: translate(-50%, 4px) scale(0.85);
}
.badge-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .plan,
  .is-fit {
    transition: none;
    transform: none;
  }
}
</style>
