<script setup>
import { computed } from 'vue'
import { addDays, addMinutes, differenceInMinutes, startOfDay } from 'date-fns'
import { useBookingsStore } from '@/stores/bookings'
import { schedule } from '@/data/catalog'
import { sameBusinessDay, windowFor } from '@/lib/hours'
import { assignLanes } from '@/lib/lanes'
import { time } from '@/lib/format'
import { BOOKING_STATUS, TONE_BLOCK } from '@/lib/status'

/**
 * Seven days side by side, sharing one hour rail.
 *
 * Deliberately the same proportional geometry as DayTimeline — free time is
 * empty space — but at a third of the scale, because a week only has to
 * answer "which days are full", not "what is at 10:20". Anything needing that
 * detail is one click away in the day view.
 */
const props = defineProps({
  start: { type: Date, required: true },
  bookings: { type: Array, required: true },
})
defineEmits(['open', 'pickDay'])

const store = useBookingsStore()
const PX_PER_MIN = 0.5

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => addDays(startOfDay(props.start), i)),
)

/**
 * One rail for all seven columns, so blocks line up across days. Taking the
 * widest opening hours of the week means a day that opens early is not
 * clipped, and a day that closes early just has empty space at the bottom —
 * which is true.
 */
const bounds = computed(() => {
  // Minutes from each day's own midnight; a day that runs late reaches past
  // 24 × 60, and the rail simply goes on into the small hours.
  let openMin = 48 * 60
  let closeMin = 0
  for (const d of days.value) {
    const w = windowFor(d, schedule)
    if (!w) continue
    openMin = Math.min(openMin, differenceInMinutes(w.open, d))
    closeMin = Math.max(closeMin, differenceInMinutes(w.close, d))
  }
  if (closeMin <= openMin) return null
  return { openMin, closeMin, totalMin: closeMin - openMin }
})

const ticks = computed(() => {
  const b = bounds.value
  if (!b) return []
  const out = []
  for (let m = b.openMin; m <= b.closeMin; m += 60) {
    out.push({
      label: time(addMinutes(startOfDay(new Date()), m)),
      top: (m - b.openMin) * PX_PER_MIN,
    })
  }
  return out
})

function blocksFor(day) {
  const b = bounds.value
  if (!b) return []
  const dayOpen = addMinutes(startOfDay(day), b.openMin)
  return assignLanes(
    props.bookings
      .filter((bk) => bk.status !== 'cancelled' && sameBusinessDay(bk.startAt, day, schedule))
      .map((bk) => ({
        booking: bk,
        view: store.hydrate(bk),
        top: Math.max(0, differenceInMinutes(new Date(bk.startAt), dayOpen)) * PX_PER_MIN,
        height: Math.max(
          14,
          differenceInMinutes(new Date(bk.endAt), new Date(bk.startAt)) * PX_PER_MIN,
        ),
      })),
  )
}

function isClosed(day) {
  return windowFor(day, schedule) === null
}

const TONE = TONE_BLOCK

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
</script>

<template>
  <p v-if="!bounds" class="text-fg-subtle px-4 py-10 text-center text-sm">
    لا ساعات عمل في هذا الأسبوع.
  </p>

  <div v-else class="relative overflow-x-auto">
    <div class="min-w-[46rem]">
      <!-- day headers -->
      <div class="grid" style="grid-template-columns: 3.5rem repeat(7, minmax(0, 1fr))">
        <span />
        <button
          v-for="d in days"
          :key="d.toISOString()"
          type="button"
          class="hover:bg-surface-sunken rounded-[var(--radius-sm)] px-1 py-1.5 text-center transition-colors"
          @click="$emit('pickDay', d)"
        >
          <span
            class="block text-[11px] font-semibold"
            :class="isSameDay(d, new Date()) ? 'text-primary-fg' : 'text-fg-subtle'"
          >
            {{ DAY_NAMES[d.getDay()] }}
          </span>
          <span
            class="block text-sm font-bold"
            :class="isSameDay(d, new Date()) ? 'text-primary-fg' : 'text-fg'"
            data-numeric
          >
            {{ d.getDate() }}
          </span>
        </button>
      </div>

      <div
        class="relative mt-2 grid"
        style="grid-template-columns: 3.5rem repeat(7, minmax(0, 1fr))"
        :style="{ height: `${bounds.totalMin * PX_PER_MIN + 12}px` }"
      >
        <!-- shared hour rail -->
        <div class="relative">
          <span
            v-for="t in ticks"
            :key="t.label"
            class="text-fg-subtle absolute text-[10px]"
            :style="{ top: `${t.top - 6}px`, insetInlineStart: 0 }"
            data-numeric
          >
            {{ t.label }}
          </span>
        </div>

        <div
          v-for="d in days"
          :key="d.toISOString()"
          class="border-border relative border-s"
          :class="isClosed(d) && 'bg-surface-sunken'"
        >
          <span
            v-for="t in ticks"
            :key="t.label"
            class="bg-border absolute inset-x-0 h-px"
            :style="{ top: `${t.top}px` }"
            aria-hidden="true"
          />

          <button
            v-for="b in blocksFor(d)"
            :key="b.booking.id"
            type="button"
            class="hover:elev-raised absolute z-10 overflow-hidden rounded-[var(--radius-sm)] border px-1 text-start transition-shadow"
            :class="TONE[BOOKING_STATUS[b.booking.status].tone]"
            :style="{
              top: `${b.top}px`,
              height: `${b.height}px`,
              insetInlineStart: `calc(2px + (100% - 4px) * ${b.lane} / ${b.lanes})`,
              width: `calc((100% - 4px) / ${b.lanes} - ${b.lanes > 1 ? 2 : 0}px)`,
            }"
            :title="`${b.view.customer?.name} · ${b.view.service?.name}`"
            @click="$emit('open', b.booking.id)"
          >
            <span class="block truncate text-[10px] leading-[14px] font-bold">
              {{ b.view.customer?.name }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
