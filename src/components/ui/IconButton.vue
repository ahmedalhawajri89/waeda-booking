<script setup>
/** Icon-only control. `label` is mandatory — it becomes the accessible name. */
defineProps({
  icon: { type: null, required: true },
  label: { type: String, required: true },
  variant: { type: String, required: false, default: 'ghost' },
  size: { type: String, required: false, default: 'md' },
})

const VARIANT = {
  ghost: 'text-fg-subtle hover:bg-surface-sunken hover:text-fg border-transparent',
  secondary: 'bg-surface text-fg-muted hover:bg-surface-hover border-border',
  danger: 'text-danger-700 hover:bg-danger-50 border-transparent',
}
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-colors duration-150 active:scale-95 sm:h-10 sm:w-10"
    :class="VARIANT[variant]"
  >
    <component :is="icon" :class="size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'" />
  </button>
</template>
