<script setup>
import { computed, ref } from 'vue'
import { Check, Minus } from 'lucide-vue-next'
import SectionHeading from './SectionHeading.vue'
import { MESSAGE_PACK, PLANS as PLAN_DATA, TRIAL_DAYS, YEARLY_MONTHS } from '@/data/plans'

/**
 * A comparison table, not three cards.
 *
 * Cards force the reader to hold one plan's list in their head while scanning
 * the next; a matrix answers "what do I lose by going cheaper" in one glance,
 * which is the only question this section exists to answer. It also stops
 * being the fourth card grid on the page.
 *
 * Below `md` the matrix collapses into per-plan stacks — a three-column table
 * on a phone is unreadable, and horizontal scroll here loses the comparison
 * the table was for.
 */
const yearly = ref(true)

// The same plans the console sells — one file, so this page cannot drift.
const PLANS = PLAN_DATA.map((p) => ({
  name: p.name,
  monthly: p.priceMinor / 100,
  tagline: p.tagline,
  cta: p.priceMinor ? `جرّبها ${TRIAL_DAYS} يوماً` : 'ابدأ مجاناً',
  featured: p.key === 'pro',
}))

/**
 * One row per capability, one cell per plan — the whole point of the layout.
 * A cell is a tick, a dash, or the number that differs between plans.
 */
const FEATURES = [
  { label: 'حجوزات بلا حد، وصفحة حجز بلا حساب للعميل', included: [true, true, true] },
  { label: 'من الفريق', included: PLAN_DATA.map((p) => `${p.staff}`) },
  { label: 'رسائل واتساب شهرياً', included: PLAN_DATA.map((p) => p.messages.toLocaleString('en')) },
  { label: 'حارس المواعيد: تذكير وتأكيد', included: [true, true, true] },
  { label: 'صندوق محادثات العملاء', included: [true, true, true] },
  { label: 'إعادة ملء المواعيد الملغاة', included: PLAN_DATA.map((p) => p.features.refill) },
  { label: 'طلب عربون من المعرّضين للغياب', included: PLAN_DATA.map((p) => p.features.deposits) },
  {
    label: `باقة ${MESSAGE_PACK.messages} رسالة إضافية بـ${MESSAGE_PACK.priceMinor / 100} ر.س`,
    included: [true, true, true],
  },
]

// Yearly is ten months for twelve; shown as what it comes to per month.
const price = computed(() => (p) => {
  if (p.monthly === 0) return 'مجاناً'
  return `${yearly.value ? Math.round((p.monthly * YEARLY_MONTHS) / 12) : p.monthly} ر.س`
})
</script>

<template>
  <section id="pricing" class="section bg-canvas">
    <div class="section-inner">
      <SectionHeading
        title="ابدأ مجاناً، وادفع حين يكبر نشاطك"
        :lede="`كل منشأة جديدة تبدأ بتجربة الاحترافية ${TRIAL_DAYS} يوماً بلا بطاقة. بلا عقود ولا رسوم إعداد.`"
      />

      <!-- billing toggle -->
      <div v-reveal class="mb-10 flex items-center justify-center gap-3">
        <span class="text-sm font-semibold" :class="!yearly ? 'text-fg' : 'text-fg-subtle'">
          شهري
        </span>
        <button
          type="button"
          role="switch"
          :aria-checked="yearly"
          aria-label="التبديل بين الدفع الشهري والسنوي"
          class="relative h-7 shrink-0 rounded-full border transition-colors"
          :class="yearly ? 'bg-primary border-primary' : 'border-border bg-surface-sunken'"
          style="width: 3.25rem"
          @click="yearly = !yearly"
        >
          <span
            class="bg-surface absolute top-0.5 h-5 w-5 rounded-full shadow transition-all duration-300"
            :style="{ insetInlineStart: yearly ? 'calc(100% - 1.375rem)' : '0.125rem' }"
          />
        </button>
        <span class="text-sm font-semibold" :class="yearly ? 'text-fg' : 'text-fg-subtle'">
          سنوي
        </span>
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
                v-for="p in PLANS"
                :key="p.name"
                scope="col"
                class="bg-canvas sticky top-16 z-10 px-4 pb-5 align-bottom"
              >
                <div
                  class="rounded-[var(--radius-lg)] border p-4 text-center"
                  :class="
                    p.featured
                      ? 'border-primary-line bg-primary-soft elev-raised'
                      : 'border-border bg-surface'
                  "
                >
                  <p v-if="p.featured" class="text-primary-fg mb-1 text-[11px] font-bold">
                    الأكثر اختياراً
                  </p>
                  <p class="type-h3 text-fg">{{ p.name }}</p>
                  <p class="text-fg-subtle mt-0.5 text-[12px]">{{ p.tagline }}</p>
                  <p class="mt-3 flex items-baseline justify-center gap-1.5">
                    <span class="text-fg text-2xl font-extrabold whitespace-nowrap" data-numeric>{{
                      price(p)
                    }}</span>
                    <span v-if="p.monthly > 0" class="text-fg-subtle text-[12px]">/ شهرياً</span>
                  </p>

                  <p v-if="yearly && p.monthly > 0" class="text-fg-subtle mt-0.5 text-[11px]">
                    يُدفع سنوياً
                  </p>
                  <RouterLink
                    to="/register"
                    class="mt-3 block rounded-[var(--radius-md)] py-2 text-center text-[13px] font-bold transition-colors"
                    :class="
                      p.featured
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
              <td v-for="(inc, i) in f.included" :key="i" class="px-4 py-3 text-center">
                <span
                  v-if="typeof inc === 'string'"
                  class="text-fg text-sm font-bold"
                  data-numeric
                  >{{ inc }}</span
                >
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
          class="rounded-[var(--radius-xl)] border p-5"
          :class="
            p.featured
              ? 'border-primary-line elev-raised bg-primary-soft'
              : 'border-border bg-surface'
          "
        >
          <p v-if="p.featured" class="text-primary-fg mb-1 text-[11px] font-bold">
            الأكثر اختياراً
          </p>
          <h3 class="type-h3 text-fg">{{ p.name }}</h3>
          <p class="text-fg-subtle mt-0.5 text-[13px]">{{ p.tagline }}</p>
          <p class="mt-4 flex items-baseline gap-1.5">
            <span class="text-fg text-3xl font-extrabold whitespace-nowrap" data-numeric>{{
              price(p)
            }}</span>
            <span v-if="p.monthly > 0" class="text-fg-subtle text-[13px]">/ شهرياً</span>
          </p>

          <p v-if="yearly && p.monthly > 0" class="text-fg-subtle mt-0.5 text-[11px]">
            يُدفع سنوياً
          </p>
          <RouterLink
            to="/register"
            class="mt-4 block rounded-[var(--radius-md)] py-2.5 text-center text-sm font-bold transition-colors"
            :class="
              p.featured
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
                class="text-fg min-w-4 shrink-0 font-bold"
                data-numeric
                >{{ f.included[pi] }}</span
              >
              <Check
                v-else-if="f.included[pi]"
                class="text-success-700 mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <Minus v-else class="text-border-strong mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ f.label }}</span>
              <span class="sr-only">{{ f.included[pi] ? '— متضمّن' : '— غير متضمّن' }}</span>
            </li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>
