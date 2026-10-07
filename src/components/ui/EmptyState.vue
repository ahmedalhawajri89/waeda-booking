<script setup>
/**
 * Three genuinely different situations, three different messages.
 * "No data" is never an acceptable empty state.
 */
defineProps({
  variant: { type: String, required: false, default: 'first-run' },
  icon: { type: null, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
})

const TONE = {
  'first-run': 'bg-primary-soft text-primary-fg',
  'no-results': 'bg-surface-sunken text-fg-subtle',
  error: 'bg-danger-50 text-danger-700',
}
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div
      class="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)]"
      :class="TONE[variant]"
    >
      <component :is="icon" class="h-6 w-6" aria-hidden="true" />
    </div>
    <h3 class="text-fg mb-1.5 text-base font-bold">{{ title }}</h3>
    <p class="text-fg-subtle max-w-sm text-sm leading-relaxed">{{ description }}</p>
    <div v-if="$slots.action" class="mt-5">
      <slot name="action" />
    </div>
  </div>
</template>
