<script setup>
import { computed, ref, watch } from 'vue'
import { Moon } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseButton from '@/components/ui/BaseButton.vue'
import { prayer, schedule } from '@/data/catalog'
import { CITIES, PRAYERS } from '@/data/cities'
import { useSettingsStore } from '@/stores/settings'
import { prayerTimesOn } from '@/lib/prayer'
import { windowFor } from '@/lib/hours'
import { time } from '@/lib/format'

/**
 * Pausing bookings for prayer.
 *
 * Off by default: not every business stops, and the rule on closing for
 * prayer has been loosened. When it is on, the times come from the city,
 * worked out daily (Umm al-Qura in Saudi Arabia), so the owner never has to
 * move them through the year. A preview shows exactly what today blocks.
 */
const settings = useSettingsStore()
const draft = ref(null)
const reset = () => (draft.value = { ...prayer, prayers: [...prayer.prayers] })
reset()
watch(() => ({ ...prayer }), reset)

const dirty = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify({ ...prayer, prayers: [...prayer.prayers] }),
)

const groups = computed(() => {
  const out = new Map()
  for (const c of CITIES) out.set(c.country, [...(out.get(c.country) ?? []), c])
  return [...out.entries()]
})

function toggle(key) {
  const list = draft.value.prayers
  draft.value.prayers = list.includes(key)
    ? list.filter((k) => k !== key)
    : PRAYERS.map((p) => p.key).filter((k) => k === key || list.includes(k))
}

/** Today, with the draft applied: the five times, and what is paused. */
const today = computed(() => {
  const times = prayerTimesOn(new Date(), draft.value.city)
  const w = windowFor(new Date(), { ...schedule, prayer: { ...draft.value, enabled: true } })
  return { times, pauses: w?.breaks ?? [] }
})

function save() {
  if (draft.value.enabled && !draft.value.prayers.length) {
    toast.error('اختر صلاة واحدة على الأقل')
    return
  }
  settings.savePrayer({ ...draft.value })
  toast.success(draft.value.enabled ? 'تُحجب أوقات الصلاة من الحجز' : 'أُوقف حجب أوقات الصلاة')
}
</script>

<template>
  <section class="surface overflow-hidden" aria-labelledby="prayer-h">
    <header class="border-border flex items-start justify-between gap-3 border-b px-4 py-3">
      <div>
        <h2 id="prayer-h" class="text-fg flex items-center gap-1.5 text-sm font-bold">
          <Moon class="text-fg-subtle h-4 w-4" aria-hidden="true" /> أوقات الصلاة
        </h2>
        <p class="text-fg-subtle mt-0.5 text-xs">
          لا تُعرض للحجز الأوقات التي تتوقف فيها للصلاة. تُحسب يومياً حسب مدينتك.
        </p>
      </div>
      <label class="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold">
        <input
          v-model="draft.enabled"
          type="checkbox"
          role="switch"
          class="accent-primary h-4 w-4"
          aria-label="حجب أوقات الصلاة"
        />
        {{ draft.enabled ? 'مفعّل' : 'متوقف' }}
      </label>
    </header>

    <div v-if="draft.enabled" class="space-y-5 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="block">
          <span class="text-fg-muted mb-1.5 block text-[13px] font-semibold">المدينة</span>
          <select
            v-model="draft.city"
            class="border-border bg-surface text-fg focus:border-primary h-10 w-full rounded-[var(--radius-md)] border px-2 text-sm focus:outline-none"
          >
            <optgroup v-for="[country, list] in groups" :key="country" :label="country">
              <option v-for="c in list" :key="c.key" :value="c.key">{{ c.name }}</option>
            </optgroup>
          </select>
        </label>
        <label class="block">
          <span class="text-fg-muted mb-1.5 block text-[13px] font-semibold"
            >مدة التوقف (دقيقة)</span
          >
          <input
            v-model.number="draft.minutes"
            type="number"
            min="5"
            max="90"
            step="5"
            class="border-border bg-surface text-fg h-10 w-full rounded-[var(--radius-md)] border px-2 text-sm"
            dir="ltr"
          />
        </label>
        <label class="block">
          <span class="text-fg-muted mb-1.5 block text-[13px] font-semibold">الجمعة (دقيقة)</span>
          <input
            v-model.number="draft.jumuahMinutes"
            type="number"
            min="5"
            max="120"
            step="5"
            class="border-border bg-surface text-fg h-10 w-full rounded-[var(--radius-md)] border px-2 text-sm"
            dir="ltr"
          />
        </label>
      </div>

      <fieldset>
        <legend class="text-fg-muted mb-2 text-[13px] font-semibold">الصلوات التي تتوقف لها</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in PRAYERS"
            :key="p.key"
            type="button"
            role="checkbox"
            :aria-checked="draft.prayers.includes(p.key)"
            class="rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
            :class="
              draft.prayers.includes(p.key)
                ? 'border-fg bg-fg text-canvas'
                : 'border-border text-fg-muted hover:bg-surface-hover'
            "
            @click="toggle(p.key)"
          >
            {{ p.label }}
            <span v-if="today.times" class="ms-1 text-xs opacity-70" data-numeric>{{
              time(today.times[p.key])
            }}</span>
          </button>
        </div>
      </fieldset>

      <div
        class="bg-surface-sunken rounded-[var(--radius-md)] px-3 py-2.5 text-xs"
        data-prayer-preview
      >
        <p class="text-fg-muted mb-1 font-semibold">لا يُحجز اليوم في هذه الأوقات:</p>
        <p v-if="!today.pauses.length" class="text-fg-subtle">لا شيء ضمن ساعات العمل اليوم.</p>
        <ul v-else class="text-fg flex flex-wrap gap-x-4 gap-y-1">
          <li v-for="b in today.pauses" :key="b.label" data-numeric>
            {{ b.label }}: {{ time(b.start) }} – {{ time(b.end) }}
          </li>
        </ul>
      </div>
    </div>

    <footer class="border-border flex items-center justify-end gap-2 border-t px-4 py-3">
      <BaseButton variant="ghost" :disabled="!dirty" @click="reset">تراجع</BaseButton>
      <BaseButton variant="primary" :disabled="!dirty" @click="save">حفظ أوقات الصلاة</BaseButton>
    </footer>
  </section>
</template>
