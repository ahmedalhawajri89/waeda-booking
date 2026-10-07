<script setup>
import { computed } from 'vue'

/**
 * Weekday × hour demand grid.
 *
 * Built from CSS grid rather than Chart.js: a heatmap is a table of values,
 * and as a real table it stays readable to screen readers, prints, and
 * selects — none of which a canvas does. Chart.js has no heatmap type
 * anyway; the usual workaround is a scatter with square points.
 */
const props = defineProps({
  cells: { type: Array, required: true },
  fromHour: { type: Number, required: true },
  toHour: { type: Number, required: true },
})

// Sunday first: the working week starts on Sunday in the region this is for.
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const max = computed(() => Math.max(1, ...props.cells.map((c) => c.count)))
const hours = computed(() =>
  Array.from({ length: props.toHour - props.fromHour + 1 }, (_, i) => props.fromHour + i),
)

function at(weekday, hour) {
  return props.cells.find((c) => c.weekday === weekday && c.hour === hour)?.count ?? 0
}

/** Opacity rather than a colour ramp: one hue keeps it honest about being a
 *  single measure, and it stays legible against the surface underneath. */
function shade(count) {
  if (count === 0) return 'transparent'
  return `color-mix(in oklab, var(--color-primary-600) ${15 + (count / max.value) * 85}%, transparent)`
}

function hourLabel(h) {
  const suffix = h < 12 ? 'ص' : 'م'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${suffix}`
}
</script>

<template>
  <div class="relative overflow-x-auto">
    <table class="w-full min-w-[34rem] border-separate" style="border-spacing: 2px">
      <caption class="sr-only">
        عدد الحجوزات حسب اليوم والساعة
      </caption>
      <thead>
        <tr>
          <th scope="col"><span class="sr-only">اليوم</span></th>
          <th
            v-for="h in hours"
            :key="h"
            scope="col"
            class="text-fg-subtle pb-1 text-[10px] font-medium"
            data-numeric
          >
            {{ hourLabel(h) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(day, wd) in DAYS" :key="day">
          <th
            scope="row"
            class="text-fg-subtle pe-2 text-end text-[11px] font-medium whitespace-nowrap"
          >
            {{ day }}
          </th>
          <td
            v-for="h in hours"
            :key="h"
            class="border-border h-7 rounded-[var(--radius-sm)] border text-center text-[10px] font-bold"
            :style="{ backgroundColor: shade(at(wd, h)) }"
            :class="at(wd, h) / max > 0.55 ? 'text-white' : 'text-fg-subtle'"
          >
            <span v-if="at(wd, h) > 0" data-numeric>{{ at(wd, h) }}</span>
            <span class="sr-only">{{ day }} {{ hourLabel(h) }}: {{ at(wd, h) }} حجز</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
