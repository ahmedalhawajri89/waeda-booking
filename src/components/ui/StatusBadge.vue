<script setup>
import { computed } from 'vue'
import { BOOKING_STATUS, PAYMENT_STATUS } from '@/lib/status'

/**
 * Status is never colour-alone: this renders tone + label + icon together,
 * so the meaning survives greyscale, low vision and colour blindness.
 */
const props = defineProps({
  status: { type: null, required: false },
  payment: { type: null, required: false },
  size: { type: String, required: false, default: 'md' },
  iconOnly: { type: Boolean, required: false, default: false },
})

const meta = computed(() =>
  props.status
    ? BOOKING_STATUS[props.status]
    : props.payment
      ? PAYMENT_STATUS[props.payment]
      : null,
)

const TONE = {
  success: 'bg-success-50 text-success-700 border-success-100',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  info: 'bg-info-50 text-info-700 border-info-100',
  neutral: 'bg-surface-sunken text-fg-muted border-border',
  muted: 'bg-canvas text-fg-subtle border-border',
}
</script>

<template>
  <span
    v-if="meta"
    class="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border font-semibold whitespace-nowrap"
    :class="[
      TONE[meta.tone],
      size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
      iconOnly && 'px-1',
    ]"
    :title="iconOnly ? meta.label : undefined"
  >
    <component
      :is="meta.icon"
      :class="size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'"
      aria-hidden="true"
    />
    <span :class="iconOnly && 'sr-only'">{{ meta.label }}</span>
  </span>
</template>
