<script setup>
import { computed, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

/**
 * Wraps a native <select> rather than building a listbox. The native control
 * gets the platform picker on mobile, correct RTL behaviour, and type-ahead
 * for free — none of which a custom widget reproduces without real work.
 * Styling matches BaseInput so the two sit together in a form.
 */
const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true },
  label: { type: String, required: true },
  hideLabel: { type: Boolean, required: false, default: false },
  placeholder: { type: String, required: false },
  hint: { type: String, required: false },
  error: { type: String, required: false },
  required: { type: Boolean, required: false, default: false },
  disabled: { type: Boolean, required: false, default: false },
  size: { type: String, required: false, default: 'md' },
})

defineEmits(['update:modelValue'])

const id = useId()
const hintId = computed(() => (props.hint ? `${id}-hint` : undefined))
const errorId = computed(() => (props.error ? `${id}-error` : undefined))
const describedBy = computed(
  () => [errorId.value, hintId.value].filter(Boolean).join(' ') || undefined,
)

const SIZE = { sm: 'h-9 text-[13px]', md: 'h-10 text-sm' }
</script>

<template>
  <div>
    <label
      :for="id"
      class="text-fg-muted mb-1.5 block text-[13px] font-semibold"
      :class="hideLabel && 'sr-only'"
    >
      {{ label }}
      <span v-if="required" class="text-danger-700" aria-hidden="true">*</span>
    </label>

    <div class="relative">
      <select
        :id="id"
        :value="modelValue"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
        class="focus:border-primary bg-surface text-fg disabled:bg-surface-sunken disabled:text-fg-subtle w-full appearance-none rounded-[var(--radius-md)] border px-3 pe-9 transition-colors"
        :class="[SIZE[size], error ? 'border-danger-700/50' : 'border-border']"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
          {{ opt.label }}
        </option>
      </select>

      <ChevronDown
        class="text-fg-subtle pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2"
        style="inset-inline-end: 12px"
        aria-hidden="true"
      />
    </div>

    <p v-if="error" :id="errorId" class="text-danger-700 mt-1.5 text-xs font-medium">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="hintId" class="text-fg-subtle mt-1.5 text-xs">{{ hint }}</p>
  </div>
</template>
