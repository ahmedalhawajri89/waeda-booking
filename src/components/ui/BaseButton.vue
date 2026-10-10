<script setup>
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'

/** The single primary-action component. Replaces every ad-hoc button. */
const props = defineProps({
  variant: { type: String, required: false, default: 'secondary' },
  size: { type: String, required: false, default: 'md' },
  icon: { type: null, required: false },
  iconEnd: { type: null, required: false },
  loading: { type: Boolean, required: false, default: false },
  disabled: { type: Boolean, required: false, default: false },
  block: { type: Boolean, required: false, default: false },
  type: { type: String, required: false, default: 'button' },
})

const VARIANT = {
  primary:
    'bg-primary text-fg-on-primary hover:bg-primary-hover active:bg-primary-active border-transparent',
  secondary:
    'bg-surface text-fg-muted hover:bg-surface-hover active:bg-surface-sunken border-border',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-sunken active:bg-border border-transparent',
  danger: 'bg-surface text-danger-700 hover:bg-danger-50 active:bg-danger-100 border-danger-700/25',
}

const SIZE = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

const ICON_SIZE = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' }

const isInert = computed(() => props.disabled || props.loading)
</script>

<template>
  <button
    :type="type"
    :disabled="isInert"
    :aria-busy="loading || undefined"
    class="inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border font-semibold transition-colors duration-150 select-none active:scale-[.98] disabled:pointer-events-none disabled:opacity-45"
    :class="[VARIANT[variant], SIZE[size], block && 'w-full']"
  >
    <Loader2 v-if="loading" :class="[ICON_SIZE[size], 'animate-spin']" />
    <component :is="icon" v-else-if="icon" :class="ICON_SIZE[size]" />
    <slot />
    <component :is="iconEnd" v-if="iconEnd && !loading" :class="ICON_SIZE[size]" />
  </button>
</template>
