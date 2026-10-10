<script setup>
import { ref } from 'vue'
import { Search, X } from 'lucide-vue-next'

defineProps({
  modelValue: { type: String, required: true },
  placeholder: { type: String, required: false, default: 'ابحث…' },
  shortcut: { type: Boolean, required: false, default: false },
})

const emit = defineEmits(['update:modelValue'])
const input = ref(null)

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="relative">
    <Search
      class="text-fg-faint pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2"
      style="inset-inline-start: 12px"
      aria-hidden="true"
    />
    <input
      ref="input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="focus:border-primary bg-surface border-border text-fg placeholder:text-fg-faint h-10 w-full rounded-[var(--radius-md)] border ps-9 pe-9 text-sm transition-colors"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <button
      v-if="modelValue"
      type="button"
      aria-label="مسح البحث"
      class="text-fg-faint hover:bg-surface-sunken hover:text-fg-muted absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full"
      style="inset-inline-end: 8px"
      @click="emit('update:modelValue', '')"
    >
      <X class="h-3.5 w-3.5" />
    </button>
    <kbd
      v-else-if="shortcut"
      class="border-border bg-canvas text-fg-faint pointer-events-none absolute top-1/2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 text-[11px] font-medium sm:block"
      style="inset-inline-end: 8px"
      aria-hidden="true"
    >
      /
    </kbd>
  </div>
</template>
