<script setup>
import { computed, ref, watch } from 'vue'
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ar } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

/**
 * A month at a glance, Sunday first. Each open day carries a dot when it has
 * a time left, so a full day reads as full before it is tapped. Past and
 * closed days are shown but cannot be chosen.
 */
const props = defineProps({
  modelValue: { type: Date, required: true },
  /** (date) => number of free times; -1 when closed. */
  freeOn: { type: Function, required: true },
})
const emit = defineEmits(['update:modelValue'])

const today = startOfDay(new Date())
const month = ref(startOfMonth(props.modelValue))
// A day set from outside ("first open day") brings its month on screen.
watch(
  () => props.modelValue,
  (d) => {
    if (!isSameMonth(d, month.value)) month.value = startOfMonth(d)
  },
)

const canGoBack = computed(() => month.value > startOfMonth(today))
const title = computed(() => format(month.value, 'MMMM yyyy', { locale: ar }))
const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

const cells = computed(() => {
  const first = startOfWeek(month.value, { weekStartsOn: 0 })
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(first, i)
    const inMonth = isSameMonth(date, month.value)
    const past = date < today
    const free = inMonth && !past ? props.freeOn(date) : -1
    return {
      date,
      key: date.toISOString(),
      inMonth,
      free,
      disabled: !inMonth || past || free < 0,
      full: free === 0,
      selected: isSameDay(date, props.modelValue),
      today: isSameDay(date, today),
    }
  })
})
// Six rows only when the month needs them.
const visible = computed(() => cells.value.slice(0, cells.value[35].inMonth ? 42 : 35))

function pick(c) {
  if (!c.disabled) emit('update:modelValue', startOfDay(c.date))
}

/** Arrow keys walk the days; RTL, so left is forward. */
function onKey(e, c) {
  const step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 }[e.key]
  if (!step) return
  e.preventDefault()
  let d = addDays(c.date, step)
  for (let i = 0; i < 60; i++, d = addDays(d, step)) {
    if (d < today) return
    if (props.freeOn(d) >= 0) {
      emit('update:modelValue', startOfDay(d))
      requestAnimationFrame(() =>
        document.querySelector(`[data-cal-day="${format(d, 'yyyy-MM-dd')}"]`)?.focus(),
      )
      return
    }
  }
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <p class="text-fg text-sm font-bold">{{ title }}</p>
      <div class="flex gap-1">
        <button
          type="button"
          class="text-fg-muted hover:bg-surface-hover grid h-8 w-8 place-items-center rounded-full disabled:opacity-30"
          :disabled="!canGoBack"
          aria-label="الشهر السابق"
          @click="month = addMonths(month, -1)"
        >
          <ChevronRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="text-fg-muted hover:bg-surface-hover grid h-8 w-8 place-items-center rounded-full"
          aria-label="الشهر التالي"
          @click="month = addMonths(month, 1)"
        >
          <ChevronLeft class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="text-fg-faint mb-1 grid grid-cols-7 text-center text-[11px]" aria-hidden="true">
      <span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span>
    </div>

    <div role="radiogroup" aria-label="اختر اليوم" class="grid grid-cols-7 gap-1">
      <button
        v-for="c in visible"
        :key="c.key"
        type="button"
        role="radio"
        :aria-checked="c.selected"
        :aria-label="
          format(c.date, 'EEEE d MMMM', { locale: ar }) +
          (c.full ? '، محجوز بالكامل' : c.free > 0 ? `، ${c.free} وقتاً متاحاً` : '')
        "
        :tabindex="c.selected ? 0 : -1"
        :disabled="c.disabled"
        :data-cal-day="format(c.date, 'yyyy-MM-dd')"
        class="relative flex aspect-square flex-col items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold transition-colors"
        :class="[
          !c.inMonth && 'invisible',
          c.selected
            ? 'bg-primary text-fg-on-primary'
            : c.disabled
              ? 'text-fg-faint cursor-not-allowed'
              : c.full
                ? 'text-fg-subtle hover:bg-surface-hover line-through'
                : 'text-fg hover:bg-primary-soft',
          c.today && !c.selected && 'ring-border-strong ring-1 ring-inset',
        ]"
        @click="pick(c)"
        @keydown="onKey($event, c)"
      >
        <span data-numeric>{{ c.date.getDate() }}</span>
        <span
          v-if="!c.disabled && c.free > 0"
          class="absolute bottom-1.5 h-1 w-1 rounded-full"
          :class="c.selected ? 'bg-white' : 'bg-primary'"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>
