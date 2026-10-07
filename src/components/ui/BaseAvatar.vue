<script setup>
import { computed } from 'vue'

/**
 * Initials avatar. The tint is derived from the name, so the same customer is
 * the same colour on every screen — that consistency is what makes an avatar
 * scannable in a list. A random or rotating colour would be noise.
 */
const props = defineProps({
  name: { type: String, required: true },
  src: { type: String, required: false },
  size: { type: String, required: false, default: 'md' },
})

const SIZE = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

// Chosen to stay legible against their own -50/-100 grounds; none of them is
// the danger red, which has to keep meaning "something is wrong".
const TINTS = [
  'bg-primary-soft text-primary-fg',
  'bg-accent-100 text-accent-700',
  'bg-success-100 text-success-700',
  'bg-warning-100 text-warning-700',
  'bg-info-100 text-info-700',
  'bg-border text-fg-muted',
]

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return (parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')
})

const tint = computed(() => {
  let hash = 0
  for (const ch of props.name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
  return TINTS[hash % TINTS.length]
})
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    class="shrink-0 rounded-full object-cover"
    :class="SIZE[size]"
  />
  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none"
    :class="[SIZE[size], tint]"
    :aria-label="name"
    role="img"
  >
    {{ initials }}
  </span>
</template>
