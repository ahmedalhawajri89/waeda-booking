<script setup>
import { Copy } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { business } from '@/data/business'
import { fullDate, money, time } from '@/lib/format'

/**
 * The booking as a ticket: what, with whom, when, and the reference that finds
 * it again. Shown on the confirmation and on the manage page, so the customer
 * recognises it as the same thing.
 */
const props = defineProps({
  serviceName: { type: String, required: true },
  resourceName: { type: String, required: false, default: null },
  startAt: { type: String, required: true },
  reference: { type: String, required: true },
  priceMinor: { type: Number, required: false, default: null },
  /** Struck through: a cancelled or past booking is shown, not offered. */
  muted: { type: Boolean, required: false, default: false },
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.reference)
    toast.success('نُسخ رقم الحجز')
  } catch {
    toast.error('تعذّر النسخ. انسخ الرقم يدوياً.')
  }
}
</script>

<template>
  <div
    class="border-border bg-surface overflow-hidden rounded-[var(--radius-xl)] border"
    :class="muted && 'opacity-70'"
  >
    <div class="flex items-start justify-between gap-3 p-5">
      <div>
        <p class="text-fg font-bold" :class="muted && 'line-through'">{{ serviceName }}</p>
        <p class="text-fg-subtle text-sm">
          {{ business.name }}<template v-if="resourceName"> · {{ resourceName }}</template>
        </p>
      </div>
      <p v-if="priceMinor != null" class="text-fg shrink-0 font-bold" data-numeric>
        {{ money(priceMinor) }}
      </p>
    </div>
    <dl class="border-border grid grid-cols-2 border-t border-dashed">
      <div class="border-border border-e p-5">
        <dt class="text-fg-subtle text-xs">اليوم</dt>
        <dd class="text-fg mt-0.5 font-semibold">{{ fullDate(startAt) }}</dd>
      </div>
      <div class="p-5">
        <dt class="text-fg-subtle text-xs">الوقت</dt>
        <dd class="text-fg mt-0.5 font-semibold" data-numeric>{{ time(startAt) }}</dd>
      </div>
    </dl>
    <div
      class="border-border bg-surface-sunken flex items-center justify-between border-t border-dashed px-5 py-4"
    >
      <div>
        <p class="text-fg-subtle text-xs">رقم الحجز</p>
        <p class="text-fg text-lg font-bold" dir="ltr" data-numeric>{{ reference }}</p>
      </div>
      <button
        type="button"
        class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold"
        @click="copy"
      >
        <Copy class="h-4 w-4" aria-hidden="true" /> نسخ
      </button>
    </div>
  </div>
</template>
