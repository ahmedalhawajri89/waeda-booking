<script setup>
import { computed } from 'vue'
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-vue-next'
import { TIER } from '@/lib/guard'
import BaseTooltip from '@/components/ui/BaseTooltip.vue'
import { notableFactors } from '@/lib/risk'

/**
 * A booking's no-show risk: tier, probability and — on hover or focus — the
 * reasons. Like StatusBadge it is never colour alone: the tier is a word, and
 * the reasons are on the booking drawer for anyone without a pointer.
 */
const props = defineProps({
  risk: { type: Object, required: true },
  size: { type: String, required: false, default: 'md' },
  showPercent: { type: Boolean, required: false, default: true },
})

const meta = computed(() => TIER[props.risk.tier])
const icon = computed(() =>
  props.risk.tier === 'high' ? ShieldAlert : props.risk.tier === 'medium' ? Shield : ShieldCheck,
)
const percent = computed(() => `${Math.round(props.risk.probability * 100)}%`)
const why = computed(() =>
  notableFactors(props.risk, { raising: true, limit: 3 })
    .map((f) => f.label)
    .join(' · '),
)

const TONE = {
  neutral: 'bg-canvas text-fg-muted border-border',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
}
</script>

<template>
  <BaseTooltip :text="why ? `${meta.label}: ${why}` : meta.label">
    <span
      class="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border font-semibold whitespace-nowrap"
      :class="[TONE[meta.tone], size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs']"
      tabindex="0"
      :aria-label="`احتمال الغياب ${percent} — ${meta.label}${why ? `: ${why}` : ''}`"
    >
      <component :is="icon" :class="size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'" aria-hidden="true" />
      <span>{{ meta.short }}</span>
      <span v-if="showPercent" class="opacity-75" data-numeric>{{ percent }}</span>
    </span>
  </BaseTooltip>
</template>
