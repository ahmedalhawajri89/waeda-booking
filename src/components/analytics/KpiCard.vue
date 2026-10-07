<script setup>
/**
 * One figure with its label. No sparkline and no delta-versus-last-period
 * arrow: with a range picker right above it, "up 12%" is ambiguous about
 * what it is up against, and a fake trend line is worse than none.
 */
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  hint: { type: String, required: false },
  icon: { type: null, required: true },
  tone: { type: String, required: false, default: 'neutral' },
})

const TONE = {
  neutral: 'bg-primary-soft text-primary-fg',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
}
</script>

<template>
  <div class="surface p-4">
    <div class="flex items-start justify-between gap-3">
      <p class="type-label text-fg-subtle">{{ label }}</p>
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
        :class="TONE[tone]"
      >
        <component :is="icon" class="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
    <p class="text-fg mt-2 text-2xl font-extrabold" data-numeric>{{ value }}</p>
    <p v-if="hint" class="text-fg-subtle mt-1 text-[12px]">{{ hint }}</p>
  </div>
</template>
