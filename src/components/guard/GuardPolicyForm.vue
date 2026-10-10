<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useGuardStore } from '@/stores/guard'
import { useBookingsStore } from '@/stores/bookings'
import { useSubscriptionStore } from '@/stores/subscription'
import { DEFAULT_POLICY, TIER, planFor, withDefaults } from '@/lib/guard'
import { tierOf } from '@/lib/risk'

/**
 * The guard's policy, edited as a draft and previewed against this week's real
 * bookings: moving a threshold shows at once how many bookings that would
 * flag. A threshold chosen blind is a threshold chosen wrong.
 */
const guard = useGuardStore()
const bookings = useBookingsStore()
/** Deposit requests are a top-plan feature; shown, but locked, below it. */
const sub = useSubscriptionStore()
onMounted(() => sub.load())
onMounted(() => {
  guard.load()
  bookings.load()
})
const draft = ref(withDefaults(guard.policy))
watch(
  () => guard.policy,
  (p) => (draft.value = withDefaults(p)),
)

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(guard.policy))

/** Sliders work in whole percent; the policy stores probabilities. */
const mediumPct = computed({
  get: () => Math.round(draft.value.mediumAt * 100),
  set: (v) => (draft.value = { ...draft.value, mediumAt: Number(v) / 100 }),
})
const highPct = computed({
  get: () => Math.round(draft.value.highAt * 100),
  set: (v) => (draft.value = { ...draft.value, highAt: Number(v) / 100 }),
})

const hours = (list) => list.map((h) => ({ value: String(h), label: `${h} ساعة` }))
const field = (key) =>
  computed({
    get: () => String(draft.value[key]),
    set: (v) => (draft.value = { ...draft.value, [key]: Number(v) }),
  })
const remind = field('remindHoursBefore')
const confirm = field('confirmHoursBefore')
const release = field('releaseHoursBefore')

const preview = computed(() => {
  const counts = { low: 0, medium: 0, high: 0 }
  for (const { risk } of guard.week) counts[tierOf(risk.probability, draft.value)]++
  return counts
})

const error = computed(() => {
  if (draft.value.highAt <= draft.value.mediumAt)
    return 'حد الخطر المرتفع يجب أن يكون أعلى من المتوسط.'
  if (draft.value.autoRelease && draft.value.releaseHoursBefore >= draft.value.confirmHoursBefore)
    return 'تحرير الموعد يجب أن يأتي بعد طلب التأكيد، أي بساعات أقل قبل الموعد.'
  return ''
})

async function save() {
  if (error.value) return
  try {
    await guard.save(draft.value)
    toast.success('حُفظت سياسة الحماية')
  } catch {
    toast.error('تعذّر حفظ السياسة.')
  }
}
</script>

<template>
  <div class="space-y-5">
    <section class="surface p-4">
      <h2 class="text-fg text-sm font-bold">متى يُعتبر الحجز معرّضاً للغياب؟</h2>
      <p class="text-fg-subtle mt-1 text-xs">
        يُحسب الاحتمال من سجل منشأتك. ارفع الحدود لتقل الحجوزات المُنبَّه عليها، أو اخفضها لحماية
        أكثر.
      </p>

      <div class="mt-4 grid gap-5 sm:grid-cols-2">
        <label class="block">
          <span class="text-fg flex justify-between text-[13px] font-semibold">
            خطر متوسط من <span data-numeric>{{ mediumPct }}%</span>
          </span>
          <input
            v-model="mediumPct"
            type="range"
            min="5"
            max="60"
            step="1"
            class="accent-warning-700 mt-2 w-full"
          />
        </label>
        <label class="block">
          <span class="text-fg flex justify-between text-[13px] font-semibold">
            خطر مرتفع من <span data-numeric>{{ highPct }}%</span>
          </span>
          <input
            v-model="highPct"
            type="range"
            min="10"
            max="90"
            step="1"
            class="accent-danger-700 mt-2 w-full"
          />
        </label>
      </div>

      <div
        class="bg-surface-sunken mt-4 flex flex-wrap gap-4 rounded-[var(--radius-md)] px-3 py-2 text-xs"
      >
        <span class="text-fg-subtle">بهذه الحدود، حجوزات الأسبوع القادم:</span>
        <span v-for="t in ['high', 'medium', 'low']" :key="t" class="text-fg font-semibold">
          {{ TIER[t].short }} <span data-numeric>{{ preview[t] }}</span>
        </span>
      </div>
    </section>

    <section class="surface space-y-4 p-4">
      <h2 class="text-fg text-sm font-bold">ماذا يفعل المساعد؟</h2>

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseSelect
          v-model="remind"
          label="تذكير لكل الحجوزات قبل الموعد بـ"
          :options="hours([2, 6, 12, 24, 48])"
        />
        <BaseSelect
          v-model="confirm"
          label="طلب تأكيد (متوسط ومرتفع) قبل الموعد بـ"
          :options="hours([2, 3, 6, 12, 24])"
        />
      </div>

      <label class="flex items-start gap-3" :class="!sub.allows('deposits') && 'opacity-60'">
        <input
          v-model="draft.depositForHigh"
          type="checkbox"
          class="accent-primary mt-1 h-4 w-4"
          :disabled="!sub.allows('deposits')"
        />
        <span>
          <span class="text-fg flex items-center gap-2 text-sm font-semibold"
            >طلب عربون من الحجوزات مرتفعة الخطر
            <RouterLink
              v-if="!sub.allows('deposits')"
              to="/app/settings?tab=plan"
              class="bg-surface-sunken text-fg-muted rounded-full px-2 py-0.5 text-[11px]"
              >متاح في الاحترافية</RouterLink
            >
          </span>
          <span class="text-fg-subtle block text-xs">الدفع المسبق أقوى ما يخفض الغياب.</span>
        </span>
      </label>

      <label class="flex items-start gap-3">
        <input v-model="draft.autoRelease" type="checkbox" class="accent-primary mt-1 h-4 w-4" />
        <span>
          <span class="text-fg block text-sm font-semibold"
            >تحرير الموعد تلقائياً إن لم يُؤكَّد</span
          >
          <span class="text-fg-subtle block text-xs">
            يُعرض الوقت على قائمة الانتظار بدل أن يضيع. يمكنك إيقافه متى شئت.
          </span>
        </span>
      </label>
      <BaseSelect
        v-if="draft.autoRelease"
        v-model="release"
        label="يُحرَّر قبل الموعد بـ"
        :options="hours([1, 2, 3, 6])"
      />

      <div class="border-border border-t pt-4">
        <p class="text-fg-subtle mb-2 text-xs font-semibold">معاينة الخطة لكل مستوى</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div
            v-for="t in ['low', 'medium', 'high']"
            :key="t"
            class="bg-surface-sunken rounded-[var(--radius-md)] p-3"
          >
            <p class="text-fg mb-1 text-xs font-bold">{{ TIER[t].label }}</p>
            <ol
              class="text-fg-muted list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed"
            >
              <li v-for="step in planFor(t, draft)" :key="step">{{ step }}</li>
            </ol>
          </div>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-danger-700 text-sm" role="alert">{{ error }}</p>

    <div class="flex items-center justify-end gap-2">
      <BaseButton variant="ghost" :disabled="!dirty" @click="draft = withDefaults(guard.policy)"
        >تراجع</BaseButton
      >
      <BaseButton variant="ghost" @click="draft = { ...DEFAULT_POLICY }"
        >الإعدادات المقترحة</BaseButton
      >
      <BaseButton
        variant="primary"
        :disabled="!dirty || !!error"
        :loading="guard.saving"
        @click="save"
      >
        حفظ السياسة
      </BaseButton>
    </div>
  </div>
</template>
