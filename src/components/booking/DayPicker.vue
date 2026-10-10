<script setup>
import { computed, ref, watch } from 'vue'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { ar } from 'date-fns/locale'
import { nowInZone } from '@/lib/zone'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

/**
 * A week at a time, each day marked with how much is left on it, so the
 * customer can see a full Thursday before tapping it. Arrow keys move between
 * days (a radiogroup); the chevrons move between weeks, up to `weeks` ahead.
 */
const props = defineProps({
  modelValue: { type: Date, required: true },
  /** (date) => number of free times; -1 when closed. */
  freeOn: { type: Function, required: true },
  weeks: { type: Number, required: false, default: 4 },
})
const emit = defineEmits(['update:modelValue'])

const today = startOfDay(nowInZone())
const page = ref(0)

// Keep the chosen day on screen when it is set from outside ("nearest time").
watch(
  () => props.modelValue,
  (d) => {
    const diff = Math.floor((startOfDay(d) - today) / 86400000)
    if (diff >= 0) page.value = Math.min(Math.floor(diff / 7), props.weeks - 1)
  },
  { immediate: true },
)

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, page.value * 7 + i)
    const free = props.freeOn(date)
    return { date, free, closed: free < 0, full: free === 0 }
  }),
)

const label = computed(() => format(days.value[0].date, 'MMMM yyyy', { locale: ar }))

/** The day Tab lands on: the chosen one when it is on this week, else the first open one. */
const tabDay = computed(
  () =>
    (
      days.value.find((d) => isSameDay(d.date, props.modelValue)) ??
      days.value.find((d) => !d.closed)
    )?.date,
)

function pick(d) {
  if (!d.closed) emit('update:modelValue', d.date)
}

function onKey(e, i) {
  const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
  if (!step) return
  e.preventDefault()
  for (let j = i + step; j >= 0 && j < 7; j += step) {
    if (!days.value[j].closed) {
      emit('update:modelValue', days.value[j].date)
      document.getElementById(`day-${j}`)?.focus()
      return
    }
  }
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <p class="text-fg text-sm font-semibold">{{ label }}</p>
      <div class="flex gap-1">
        <button
          type="button"
          class="border-border text-fg-muted hover:bg-surface-hover grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border disabled:opacity-40"
          :disabled="page === 0"
          aria-label="الأسبوع السابق"
          @click="page--"
        >
          <ChevronRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="border-border text-fg-muted hover:bg-surface-hover grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border disabled:opacity-40"
          :disabled="page >= weeks - 1"
          aria-label="الأسبوع التالي"
          @click="page++"
        >
          <ChevronLeft class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div role="radiogroup" aria-label="اختر اليوم" class="grid grid-cols-7 gap-1.5">
      <button
        v-for="(d, i) in days"
        :id="`day-${i}`"
        :key="d.date.toISOString()"
        type="button"
        role="radio"
        :aria-checked="isSameDay(d.date, modelValue)"
        :aria-label="`${format(d.date, 'EEEE d MMMM', { locale: ar })}${d.closed ? '، مغلق' : d.full ? '، محجوز بالكامل' : ''}`"
        :disabled="d.closed"
        :tabindex="d.date === tabDay ? 0 : -1"
        class="flex flex-col items-center gap-0.5 rounded-[var(--radius-md)] border pt-2 pb-2.5 transition-colors disabled:cursor-not-allowed"
        :class="
          isSameDay(d.date, modelValue)
            ? 'border-fg bg-fg text-fg-inverse'
            : d.closed
              ? 'text-fg-faint border-transparent'
              : 'border-border bg-surface text-fg hover:border-fg-faint'
        "
        @click="pick(d)"
        @keydown="onKey($event, i)"
      >
        <span class="text-[11px] opacity-75">{{ format(d.date, 'EEE', { locale: ar }) }}</span>
        <span class="text-base font-bold" data-numeric>{{ format(d.date, 'd') }}</span>
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="
            d.closed
              ? 'bg-transparent'
              : d.full
                ? 'bg-border-strong'
                : isSameDay(d.date, modelValue)
                  ? 'bg-primary-300'
                  : 'bg-success-600'
          "
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>
