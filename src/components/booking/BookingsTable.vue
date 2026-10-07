<script setup>
import { ArrowDown, ArrowUp, ArrowUpDown, Check, UserCheck } from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { useGuardStore } from '@/stores/guard'
import { money, relativeDay, time } from '@/lib/format'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import RiskBadge from '@/components/guard/RiskBadge.vue'
import { PAYMENT_STATUS } from '@/lib/status'

/**
 * Bookings as a table, for screens wide enough to read across a row.
 *
 * Every column a desk compares on, headers that sort, and the one next step
 * a row usually needs — confirm a pending booking, mark an arrival — on the
 * row itself, so the common case never opens the drawer.
 */
defineProps({
  rows: { type: Array, required: true },
  sortKey: { type: String, required: true },
  sortDesc: { type: Boolean, required: true },
})
const emit = defineEmits(['open', 'sort', 'quick'])

const store = useBookingsStore()
const guard = useGuardStore()

const COLUMNS = [
  { key: 'time', label: 'الموعد', sortable: true },
  { key: 'customer', label: 'العميل', sortable: true },
  { key: 'service', label: 'الخدمة' },
  { key: 'resource', label: 'مع', sortable: true },
  { key: 'status', label: 'الحالة', sortable: true },
  { key: 'payment', label: 'الدفع' },
  { key: 'price', label: 'المبلغ', sortable: true, end: true },
]

const risk = (b) => {
  const r = guard.riskOf(b.id)
  return r && r.tier !== 'low' ? r : null
}

/** The one action a row most often needs, if any. */
function quickOf(b) {
  if (b.status === 'pending') return { status: 'confirmed', label: 'تأكيد', icon: Check }
  if (b.status === 'confirmed' && new Date(b.startAt) <= new Date())
    return { status: 'completed', label: 'حضر', icon: UserCheck }
  return null
}
</script>

<template>
  <table class="w-full border-collapse text-sm">
    <thead class="bg-surface sticky top-16 z-10">
      <tr class="border-border border-b">
        <th
          v-for="c in COLUMNS"
          :key="c.key"
          scope="col"
          class="text-fg-subtle px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
          :class="c.end ? 'text-end' : 'text-start'"
          :aria-sort="
            sortKey === c.key
              ? sortDesc
                ? 'descending'
                : 'ascending'
              : c.sortable
                ? 'none'
                : undefined
          "
        >
          <button
            v-if="c.sortable"
            type="button"
            class="hover:text-fg inline-flex items-center gap-1"
            :class="sortKey === c.key && 'text-fg'"
            @click="emit('sort', c.key)"
          >
            {{ c.label }}
            <component
              :is="sortKey === c.key ? (sortDesc ? ArrowDown : ArrowUp) : ArrowUpDown"
              class="h-3.5 w-3.5"
              :class="sortKey !== c.key && 'opacity-40'"
              aria-hidden="true"
            />
          </button>
          <template v-else>{{ c.label }}</template>
        </th>
        <th scope="col" class="w-24"><span class="sr-only">إجراء</span></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="b in rows"
        :key="b.id"
        class="group border-border hover:bg-surface-hover cursor-pointer border-b last:border-b-0"
        @click="emit('open', b.id)"
      >
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="text-fg block font-semibold" data-numeric>{{ time(b.startAt) }}</span>
          <span class="text-fg-subtle block text-xs">{{ relativeDay(b.startAt) }}</span>
        </td>
        <td class="px-4 py-3">
          <button
            type="button"
            class="text-fg focus-visible:ring-ring block max-w-[14rem] truncate text-start font-semibold"
            @click.stop="emit('open', b.id)"
          >
            {{ store.hydrate(b).customer?.name ?? 'عميل' }}
          </button>
          <span class="text-fg-subtle block text-xs" dir="ltr" data-numeric>{{ b.reference }}</span>
        </td>
        <td class="text-fg-muted max-w-[14rem] truncate px-4 py-3">
          {{ store.hydrate(b).service?.name }}
        </td>
        <td class="text-fg-muted px-4 py-3 whitespace-nowrap">
          {{ store.hydrate(b).resource?.name }}
        </td>
        <td class="px-4 py-3">
          <span class="flex items-center gap-1.5">
            <StatusBadge :status="b.status" size="sm" />
            <RiskBadge v-if="risk(b)" :risk="risk(b)" size="sm" :show-percent="false" />
          </span>
        </td>
        <td class="text-fg-muted px-4 py-3 text-xs whitespace-nowrap">
          {{ PAYMENT_STATUS[b.paymentStatus].label }}
        </td>
        <td class="text-fg px-4 py-3 text-end font-semibold whitespace-nowrap" data-numeric>
          {{ money(b.priceMinor) }}
        </td>
        <td class="px-3 py-3 text-end">
          <button
            v-if="quickOf(b)"
            type="button"
            class="border-border bg-surface text-fg hover:border-fg inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            :aria-label="`${quickOf(b).label}: ${store.hydrate(b).customer?.name ?? ''}`"
            @click.stop="emit('quick', { id: b.id, status: quickOf(b).status })"
          >
            <component :is="quickOf(b).icon" class="h-3.5 w-3.5" aria-hidden="true" />
            {{ quickOf(b).label }}
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
