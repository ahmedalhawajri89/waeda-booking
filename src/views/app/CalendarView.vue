<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { addDays, format, isSameDay, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Rows3, Rows4 } from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { fullDate, relativeDay, time } from '@/lib/format'
import { schedule, resources } from '@/data/catalog'
import { useBookingMove } from '@/composables/useBookingMove'
import { isOpenOn } from '@/lib/availability'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import ResourceDay from '@/components/booking/ResourceDay.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { CalendarX2 } from 'lucide-vue-next'
import WeekGrid from '@/components/booking/WeekGrid.vue'

const emit = defineEmits(['openBooking', 'createAt'])
const { move } = useBookingMove()
const team = computed(() => resources.filter((r) => r.isActive))
const store = useBookingsStore()
const route = useRoute()
const router = useRouter()

const MODES = [
  { value: 'day', label: 'يوم' },
  { value: 'week', label: 'أسبوع' },
  { value: 'agenda', label: 'قائمة' },
]

const mode = ref(route.query.view ?? 'day')
const cursor = ref(
  typeof route.query.date === 'string'
    ? startOfDay(parseISO(route.query.date))
    : startOfDay(new Date()),
)

// The view and the day are kept in the URL, so a particular day is linkable
// and survives a refresh.
watch([mode, cursor], ([v, d]) =>
  router.replace({ query: { ...route.query, view: v, date: format(d, 'yyyy-MM-dd') } }),
)

/** Roomy or compact rows; remembered per device. */
const DENSITY_KEY = 'bookingpro:calendar-density:v1'
const compact = ref(false)
try {
  compact.value = localStorage.getItem(DENSITY_KEY) === 'compact'
} catch {
  /* roomy */
}
watch(compact, (c) => {
  try {
    localStorage.setItem(DENSITY_KEY, c ? 'compact' : 'roomy')
  } catch {
    /* session only */
  }
})

// Sunday-start weeks: the working week starts on Sunday in the region this
// is built for, and date-fns defaults to Monday.
const weekStart = computed(() => startOfWeek(cursor.value, { weekStartsOn: 0 }))

const dayBookings = computed(() => store.onDay(cursor.value))
const weekBookings = computed(() =>
  store.sorted.filter((b) => {
    const d = new Date(b.startAt)
    return d >= weekStart.value && d < addDays(weekStart.value, 7)
  }),
)

/** Agenda groups the next 14 days, skipping days with nothing on them. */
const agenda = computed(() => {
  const out = []
  for (let i = 0; i < 14; i++) {
    const d = addDays(startOfDay(new Date()), i)
    const items = store.onDay(d).filter((b) => b.status !== 'cancelled')
    if (items.length) out.push({ date: d, items })
  }
  return out
})

/** One arrow moves whatever unit is on screen. */
function shift(direction) {
  cursor.value = addDays(cursor.value, direction * (mode.value === 'week' ? 7 : 1))
}

const heading = computed(() => {
  if (mode.value !== 'week') return fullDate(cursor.value)
  const end = addDays(weekStart.value, 6)
  return `${relativeDay(weekStart.value)} — ${relativeDay(end)}`
})

function openDay(date) {
  cursor.value = startOfDay(date)
  mode.value = 'day'
}
</script>

<template>
  <div class="w-full p-4 lg:p-6 2xl:px-8">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <!-- RTL: "previous" points right -->
        <IconButton
          :icon="ChevronRight"
          :label="mode === 'week' ? 'الأسبوع السابق' : 'اليوم السابق'"
          @click="shift(-1)"
        />
        <div class="min-w-0">
          <h1 class="text-fg truncate text-base font-bold">{{ heading }}</h1>
          <p class="text-fg-subtle text-xs">
            <template v-if="mode === 'week'">{{ weekBookings.length }} حجز هذا الأسبوع</template>
            <template v-else>
              {{ isOpenOn(schedule, cursor) ? `${dayBookings.length} حجز` : 'مغلق' }}
            </template>
          </p>
        </div>
        <IconButton
          :icon="ChevronLeft"
          :label="mode === 'week' ? 'الأسبوع التالي' : 'اليوم التالي'"
          @click="shift(1)"
        />
      </div>

      <div class="flex items-center gap-2">
        <BaseButton
          v-if="!isSameDay(cursor, new Date())"
          size="sm"
          @click="cursor = startOfDay(new Date())"
        >
          اليوم
        </BaseButton>
        <IconButton
          v-if="mode === 'day'"
          :icon="compact ? Rows3 : Rows4"
          :label="compact ? 'عرض مريح' : 'عرض مضغوط'"
          @click="compact = !compact"
        />
        <BaseTabs v-model="mode" :items="MODES" label="عرض التقويم" size="sm" />
      </div>
    </header>

    <ErrorState v-if="store.error" :message="store.error" @retry="store.load(true)" />

    <template v-else-if="mode === 'day'">
      <p class="text-fg-subtle mb-2 hidden text-xs sm:block">
        انقر وقتاً فارغاً لحجز جديد، واسحب الحجز لتغيير وقته أو الشخص.
      </p>
      <div class="surface overflow-hidden">
        <ResourceDay
          :date="cursor"
          :resources="team"
          :scale="compact ? 0.9 : 1.4"
          @open="emit('openBooking', $event)"
          @create="emit('createAt', $event)"
          @move="move"
        />
      </div>
    </template>

    <div v-else-if="mode === 'week'" class="surface p-4">
      <WeekGrid
        :start="weekStart"
        :bookings="weekBookings"
        @open="emit('openBooking', $event)"
        @pick-day="openDay"
      />
    </div>

    <div v-else class="space-y-4">
      <section v-for="group in agenda" :key="group.date.toISOString()">
        <h2 class="text-fg mb-2 text-sm font-bold">{{ relativeDay(group.date) }}</h2>
        <ul class="surface divide-border divide-y overflow-hidden">
          <li v-for="b in group.items" :key="b.id">
            <button
              type="button"
              class="hover:bg-primary-soft/40 flex w-full items-center gap-3 px-4 py-3 text-start"
              @click="emit('openBooking', b.id)"
            >
              <time :datetime="b.startAt" class="text-fg w-16 shrink-0 text-sm font-bold">
                {{ time(b.startAt) }}
              </time>
              <span class="min-w-0 flex-1">
                <span class="text-fg block truncate text-sm">
                  {{ store.hydrate(b).customer?.name }}
                </span>
                <span class="text-fg-subtle block truncate text-xs">
                  {{ store.hydrate(b).service?.name }}
                </span>
              </span>
              <StatusBadge :status="b.status" size="sm" />
            </button>
          </li>
        </ul>
      </section>

      <div v-if="agenda.length === 0" class="surface">
        <EmptyState
          :icon="CalendarX2"
          title="لا حجوزات في الأسبوعين القادمين"
          description="شارك رابط صفحة الحجز مع عملائك لتبدأ الحجوزات بالوصول."
        />
      </div>
    </div>
  </div>
</template>
