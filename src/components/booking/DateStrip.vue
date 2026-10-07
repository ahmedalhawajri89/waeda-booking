<script setup>
import { computed } from 'vue'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { ar } from 'date-fns/locale'
import { isOpenOn } from '@/lib/availability'
import { businessHours } from '@/data/catalog'

/** Horizontal day picker. A radiogroup, so arrow keys work as expected. */
const props = defineProps({
  modelValue: { type: Date, required: true },
  days: { type: Number, required: false, default: 7 },
  from: { type: Date, required: false },
  allowPast: { type: Boolean, required: false, default: false },
})

const emit = defineEmits(['update:modelValue'])

const today = startOfDay(new Date())
const dates = computed(() =>
  Array.from({ length: props.days }, (_, i) => addDays(startOfDay(props.from ?? today), i)),
)

function isDisabled(d) {
  if (!isOpenOn(businessHours, d)) return true
  return !props.allowPast && d < today
}

function onKey(e, index) {
  const delta = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
  if (delta === 0) return
  e.preventDefault()
  for (let i = index + delta; i >= 0 && i < dates.value.length; i += delta) {
    const candidate = dates.value[i]
    if (!isDisabled(candidate)) {
      emit('update:modelValue', candidate)
      const el = document.getElementById(`daystrip-${i}`)
      el?.focus()
      return
    }
  }
}
</script>

<template>
  <div role="radiogroup" aria-label="اختر اليوم" class="grid grid-cols-7 gap-1.5">
    <button
      v-for="(d, i) in dates"
      :id="`daystrip-${i}`"
      :key="d.toISOString()"
      type="button"
      role="radio"
      :aria-checked="isSameDay(d, modelValue)"
      :aria-label="format(d, 'EEEE d MMMM', { locale: ar })"
      :disabled="isDisabled(d)"
      :tabindex="isSameDay(d, modelValue) ? 0 : -1"
      class="flex flex-col items-center rounded-[var(--radius-md)] border py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      :class="
        isSameDay(d, modelValue)
          ? 'border-primary bg-primary text-white'
          : 'hover:border-primary-line hover:bg-primary-soft bg-surface border-border text-fg-muted'
      "
      @click="emit('update:modelValue', d)"
      @keydown="onKey($event, i)"
    >
      <span class="text-[11px] opacity-80">{{ format(d, 'EEE', { locale: ar }) }}</span>
      <span class="text-base font-bold" data-numeric>{{ format(d, 'd') }}</span>
    </button>
  </div>
</template>
