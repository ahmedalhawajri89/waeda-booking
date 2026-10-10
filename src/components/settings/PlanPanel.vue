<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, Clock, MessageCircle, PackagePlus, Sparkles, Users } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useSubscriptionStore } from '@/stores/subscription'
import { FEATURE_PLAN, MESSAGE_PACK, PLANS, planByKey, priceFor, YEARLY_MONTHS } from '@/data/plans'
import { money } from '@/lib/format'

/**
 * The plan, from the owner's side: what am I on, how much have I used,
 * what would more cost. Usage is shown as the two things that run out —
 * WhatsApp messages and seats — because those are what the plans differ in.
 */
const sub = useSubscriptionStore()
onMounted(() => sub.load(true))

const cycle = ref(sub.cycle === 'yearly' ? 'yearly' : 'monthly')

const ROWS = [
  { label: 'من الفريق', of: (p) => `${p.staff}` },
  { label: 'رسالة واتساب شهرياً', of: (p) => `${p.messages.toLocaleString('en')}` },
]
const FEATURES = [
  { key: 'refill', label: 'إعادة ملء المواعيد الملغاة' },
  { key: 'deposits', label: 'طلب عربون من المعرّضين للغياب' },
]
const ALWAYS = ['صفحة الحجز وحجوزات بلا حد', 'مساعد الحضور: التذكير والتأكيد', 'صندوق المحادثات']

const status = computed(() => {
  if (sub.inTrial)
    return {
      title: `تجربة ${sub.plan.name}`,
      line: `باقٍ ${sub.daysLeft} ${sub.daysLeft > 2 && sub.daysLeft < 11 ? 'أيام' : 'يوماً'}، ثم تنتقل للمجانية ما لم تختر باقة.`,
    }
  if (sub.plan.priceMinor === 0)
    return {
      title: 'الباقة المجانية',
      line: 'مناسبة للبداية. رقِّ متى احتجت فريقاً أكبر أو رسائل أكثر.',
    }
  return {
    title: `باقة ${sub.plan.name}`,
    line: `${money(priceFor(sub.plan, sub.cycle))} ${sub.cycle === 'yearly' ? 'سنوياً' : 'شهرياً'}`,
  }
})

const meters = computed(() => [
  {
    icon: MessageCircle,
    label: 'رسائل واتساب هذا الشهر',
    used: sub.usage.messages,
    of: sub.messageAllowance,
  },
  { icon: Users, label: 'الفريق النشط', used: sub.usage.staff, of: sub.plan.staff },
])
const tone = (m) =>
  m.used >= m.of ? 'bg-danger-600' : m.used / m.of >= 0.8 ? 'bg-warning-600' : 'bg-fg'

/* ----------------------------------------------------------- choosing */
const asking = ref(null) // { plan?, extraPack? }
const askText = computed(() => {
  const a = asking.value
  if (!a) return ''
  if (a.extraPack)
    return `${MESSAGE_PACK.messages} رسالة إضافية لهذا الشهر بـ${money(MESSAGE_PACK.priceMinor)}.`
  const p = planByKey(a.plan)
  return `باقة ${p.name} بـ${money(priceFor(p, cycle.value))} ${cycle.value === 'yearly' ? 'سنوياً (شهران مجاناً)' : 'شهرياً'}.`
})

const isCurrent = (p) => !sub.inTrial && sub.paid.key === p.key && sub.cycle === cycle.value

async function confirm() {
  const a = asking.value
  asking.value = null
  try {
    const { activated } = await sub.request({
      plan: a.plan ?? null,
      cycle: cycle.value,
      extraPack: !!a.extraPack,
    })
    toast.success(
      activated
        ? a.extraPack
          ? `أُضيفت ${MESSAGE_PACK.messages} رسالة لهذا الشهر`
          : `فُعّلت باقة ${planByKey(a.plan).name}`
        : 'وصلنا طلبك، وسنفعّله ونتواصل معك قريباً',
    )
  } catch {
    toast.error('تعذّر إرسال الطلب. حاول مرة أخرى.')
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- where you are -->
    <section class="surface p-5" aria-labelledby="plan-h" data-plan-status>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-fg-subtle flex items-center gap-1.5 text-xs font-semibold">
            <Clock v-if="sub.inTrial" class="h-3.5 w-3.5" aria-hidden="true" />
            اشتراكك
          </p>
          <h2 id="plan-h" class="font-display text-fg mt-1 text-xl font-bold">
            {{ status.title }}
          </h2>
          <p class="text-fg-muted mt-0.5 text-sm">{{ status.line }}</p>
        </div>
        <BaseButton v-if="sub.loaded" :icon="PackagePlus" @click="asking = { extraPack: true }"
          >أضف {{ MESSAGE_PACK.messages }} رسالة</BaseButton
        >
      </div>

      <p
        v-if="sub.pending"
        class="bg-warning-50 text-warning-700 mt-4 rounded-[var(--radius-md)] px-3 py-2 text-sm"
        role="status"
      >
        طلبك
        {{ sub.pending.plan ? `لباقة ${planByKey(sub.pending.plan).name}` : 'لباقة رسائل' }} قيد
        التفعيل. سنتواصل معك قريباً.
      </p>

      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <div v-for="m in meters" :key="m.label" data-meter>
          <div class="mb-1.5 flex items-center justify-between text-sm">
            <span class="text-fg-muted flex items-center gap-1.5">
              <component :is="m.icon" class="h-4 w-4" aria-hidden="true" />{{ m.label }}
            </span>
            <span class="text-fg font-semibold" data-numeric>{{ m.used }} من {{ m.of }}</span>
          </div>
          <div
            class="bg-surface-sunken h-2 overflow-hidden rounded-full"
            role="progressbar"
            :aria-valuenow="m.used"
            :aria-valuemax="m.of"
            :aria-label="m.label"
          >
            <span
              class="block h-full rounded-full transition-all"
              :class="tone(m)"
              :style="{ width: `${Math.min(100, (m.used / Math.max(1, m.of)) * 100)}%` }"
            />
          </div>
        </div>
      </div>
      <p class="text-fg-subtle mt-3 text-xs">
        الحجوزات لا تتوقف أبداً. إذا انتهت الرسائل يتوقف المساعد عن التذكير حتى الشهر القادم أو حتى
        تضيف رسائل.
      </p>
    </section>

    <!-- the plans -->
    <section class="surface overflow-hidden" aria-labelledby="plans-h">
      <header
        class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
      >
        <h2 id="plans-h" class="text-fg text-sm font-bold">الباقات</h2>
        <div
          class="bg-surface-sunken flex rounded-full p-1 text-xs font-semibold"
          role="radiogroup"
          aria-label="دورة الدفع"
        >
          <button
            v-for="c in [
              { value: 'monthly', label: 'شهري' },
              { value: 'yearly', label: 'سنوي · شهران مجاناً' },
            ]"
            :key="c.value"
            type="button"
            role="radio"
            :aria-checked="cycle === c.value"
            class="rounded-full px-3 py-1.5 transition-colors"
            :class="cycle === c.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle'"
            @click="cycle = c.value"
          >
            {{ c.label }}
          </button>
        </div>
      </header>

      <div class="grid gap-4 p-4 lg:grid-cols-3">
        <article
          v-for="p in PLANS"
          :key="p.key"
          class="flex flex-col rounded-[var(--radius-lg)] border p-4"
          :class="p.key === 'pro' ? 'border-fg' : 'border-border'"
          :data-plan="p.key"
        >
          <p class="text-fg flex items-center gap-1.5 font-bold">
            {{ p.name }}
            <Sparkles v-if="p.key === 'pro'" class="text-primary-fg h-4 w-4" aria-hidden="true" />
          </p>
          <p class="text-fg-subtle mb-3 text-xs">{{ p.tagline }}</p>
          <p class="font-display text-fg text-2xl font-bold" data-numeric>
            {{
              p.priceMinor
                ? money(cycle === 'yearly' ? p.priceMinor * YEARLY_MONTHS : p.priceMinor)
                : 'مجاناً'
            }}
            <span v-if="p.priceMinor" class="text-fg-subtle text-xs font-medium">{{
              cycle === 'yearly' ? '/ سنة' : '/ شهر'
            }}</span>
          </p>

          <ul class="text-fg-muted my-4 flex-1 space-y-1.5 text-sm">
            <li v-for="r in ROWS" :key="r.label" class="flex items-center gap-2">
              <Check class="text-fg h-4 w-4 shrink-0" aria-hidden="true" />
              <span
                ><b class="text-fg" data-numeric>{{ r.of(p) }}</b> {{ r.label }}</span
              >
            </li>
            <li
              v-for="f in FEATURES"
              :key="f.key"
              class="flex items-center gap-2"
              :class="!p.features[f.key] && 'text-fg-faint line-through'"
            >
              <Check v-if="p.features[f.key]" class="text-fg h-4 w-4 shrink-0" aria-hidden="true" />
              <span v-else class="h-4 w-4 shrink-0" aria-hidden="true" />
              {{ f.label }}
            </li>
            <li v-for="a in ALWAYS" :key="a" class="flex items-center gap-2">
              <Check class="text-fg h-4 w-4 shrink-0" aria-hidden="true" />{{ a }}
            </li>
          </ul>

          <BaseButton v-if="isCurrent(p)" disabled block>باقتك الحالية</BaseButton>
          <BaseButton
            v-else-if="p.priceMinor"
            :variant="p.key === 'pro' ? 'primary' : 'secondary'"
            block
            @click="asking = { plan: p.key }"
            >اختر {{ p.name }}</BaseButton
          >
        </article>
      </div>
      <p class="text-fg-subtle border-border border-t px-4 py-3 text-xs">
        الأسعار بالريال وتشمل ضريبة القيمة المضافة. إعادة الملء تبدأ من
        {{ planByKey(FEATURE_PLAN.refill).name }}، وطلب العربون في
        {{ planByKey(FEATURE_PLAN.deposits).name }}.
      </p>
    </section>

    <ConfirmDialog
      :open="!!asking"
      title="تأكيد الطلب"
      :message="askText"
      confirm-label="تأكيد"
      tone="primary"
      @confirm="confirm"
      @cancel="asking = null"
    />
  </div>
</template>
