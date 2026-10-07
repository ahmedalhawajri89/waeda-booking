<script setup>
import { ref } from 'vue'

/**
 * Roving-tabindex tablist: one stop in the tab order, arrows move between
 * tabs. Same keyboard model as DateStrip, which already does this well.
 *
 * Arrow direction is swapped in RTL — ArrowLeft must move visually left, and
 * visually left is "next" when the strip runs right-to-left.
 */
const props = defineProps({
  modelValue: { type: String, required: true },
  items: { type: Array, required: true },
  variant: { type: String, required: false, default: 'segmented' },
  size: { type: String, required: false, default: 'md' },
  label: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])

const root = ref(null)

function move(index, delta) {
  const next = (index + delta + props.items.length) % props.items.length
  const item = props.items[next]
  if (!item) return
  emit('update:modelValue', item.value)
  root.value?.querySelectorAll('[role="tab"]')[next]?.focus()
}

function onKey(e, index) {
  const rtl = document.documentElement.dir === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'

  if (e.key === forward) move(index, 1)
  else if (e.key === back) move(index, -1)
  else if (e.key === 'Home') move(index, -index)
  else if (e.key === 'End') move(index, props.items.length - 1 - index)
  else return

  e.preventDefault()
}

const SIZE = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
}
</script>

<template>
  <div
    ref="root"
    role="tablist"
    :aria-label="label"
    class="inline-flex items-center"
    :class="
      variant === 'segmented'
        ? 'bg-surface-sunken border-border gap-1 rounded-[var(--radius-md)] border p-1'
        : 'border-border gap-1 border-b'
    "
  >
    <button
      v-for="(item, i) in items"
      :key="item.value"
      type="button"
      role="tab"
      :aria-selected="item.value === modelValue"
      :tabindex="item.value === modelValue ? 0 : -1"
      class="inline-flex shrink-0 items-center gap-2 font-semibold transition-colors"
      :class="[
        SIZE[size],
        variant === 'segmented'
          ? item.value === modelValue
            ? 'bg-surface text-fg elev-raised rounded-[var(--radius-sm)]'
            : 'text-fg-subtle hover:text-fg rounded-[var(--radius-sm)]'
          : item.value === modelValue
            ? 'border-primary text-primary-fg -mb-px border-b-2'
            : 'text-fg-subtle hover:text-fg -mb-px border-b-2 border-transparent',
      ]"
      @click="emit('update:modelValue', item.value)"
      @keydown="onKey($event, i)"
    >
      <component :is="item.icon" v-if="item.icon" class="h-4 w-4" aria-hidden="true" />
      {{ item.label }}
      <span
        v-if="item.badge !== undefined"
        class="bg-surface-sunken text-fg-subtle rounded-full px-1.5 text-[11px] font-bold"
        data-numeric
      >
        {{ item.badge }}
      </span>
    </button>
  </div>
</template>
