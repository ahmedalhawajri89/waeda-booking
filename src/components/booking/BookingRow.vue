<script setup>
import { computed } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { money, relativeDayTime, timeRange } from '@/lib/format'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import RiskBadge from '@/components/guard/RiskBadge.vue'
import { useGuardStore } from '@/stores/guard'

/**
 * One booking, rendered as a card on small screens and as a dense row from
 * `sm` up. Same data, same target — the whole thing is one button so the
 * keyboard path is a single stop.
 */
const props = defineProps({
  booking: { type: null, required: true },
  showDay: { type: Boolean, required: false },
})
defineEmits(['open'])

const bookings = useBookingsStore()
const view = computed(() => bookings.hydrate(props.booking))
const guard = useGuardStore()
/** Only worth a badge when it calls for action — low risk is the default state. */
const risk = computed(() => {
  const r = guard.riskOf(props.booking.id)
  return r && r.tier !== 'low' ? r : null
})
</script>

<template>
  <button
    type="button"
    class="group hover:bg-primary-soft/40 border-border flex w-full flex-col gap-2 border-b px-4 py-3 text-start transition-colors last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
    @click="$emit('open', booking.id)"
  >
    <!-- when -->
    <div class="flex shrink-0 items-baseline gap-2 sm:w-40 sm:flex-col sm:items-start sm:gap-0.5">
      <time :datetime="booking.startAt" class="text-fg text-sm font-bold">
        {{ showDay ? relativeDayTime(booking.startAt) : timeRange(booking.startAt, booking.endAt) }}
      </time>
      <span v-if="showDay" class="text-fg-faint text-xs sm:hidden">·</span>
      <span class="text-fg-subtle text-xs">{{ view.resource?.name ?? '—' }}</span>
    </div>

    <!-- who / what -->
    <div class="min-w-0 flex-1">
      <p class="text-fg truncate text-sm font-semibold">
        {{ view.customer?.name ?? 'عميل محذوف' }}
      </p>
      <p class="text-fg-subtle truncate text-xs">{{ view.service?.name ?? '—' }}</p>
    </div>

    <!-- state -->
    <div class="flex shrink-0 items-center gap-2">
      <RiskBadge v-if="risk" :risk="risk" size="sm" :show-percent="false" />
      <StatusBadge :status="booking.status" size="sm" />
      <StatusBadge :payment="booking.paymentStatus" size="sm" />
      <span class="text-fg-muted hidden w-20 text-end text-sm font-semibold md:block" data-numeric>
        {{ money(booking.priceMinor) }}
      </span>
      <ChevronLeft
        class="text-fg-faint group-hover:text-fg-subtle hidden h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5 sm:block"
        aria-hidden="true"
      />
    </div>
  </button>
</template>
