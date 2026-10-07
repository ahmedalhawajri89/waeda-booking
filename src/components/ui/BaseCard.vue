<script setup>
/**
 * One card recipe. Six marketing sections had each written their own
 * `rounded-xl border border-border bg-surface p-6 hover:border-primary-line`,
 * which is why the page read as the same block repeated down the scroll.
 *
 * Variety now comes from layout — bento spans, timelines, comparison tables —
 * not from re-typing the box.
 */
defineProps({
  variant: { type: String, required: false, default: 'flat' },
  padding: { type: String, required: false, default: 'md' },
  radius: { type: String, required: false, default: 'lg' },
  interactive: { type: Boolean, required: false, default: false },
  as: { type: String, required: false, default: 'div' },
})

const VARIANT = {
  flat: 'bg-surface border-border border',
  raised: 'bg-surface border-border elev-raised border',
  outline: 'border-border border bg-transparent',
  ghost: 'bg-surface-sunken border border-transparent',
}

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5 md:p-6',
  lg: 'p-6 md:p-8',
}

const RADIUS = {
  lg: 'rounded-[var(--radius-lg)]',
  xl: 'rounded-[var(--radius-xl)]',
}
</script>

<template>
  <component
    :is="as"
    class="transition-colors duration-200"
    :class="[
      VARIANT[variant],
      PADDING[padding],
      RADIUS[radius],
      interactive && 'hover:border-primary-line hover:elev-overlay cursor-pointer',
    ]"
  >
    <slot />
  </component>
</template>
