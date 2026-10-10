<script setup>
import { computed, useId } from 'vue'

/** Owns its label, hint and error, and wires the ARIA relationships itself. */
const props = defineProps({
  modelValue: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, required: false, default: 'text' },
  placeholder: { type: String, required: false },
  hint: { type: String, required: false },
  error: { type: String, required: false },
  icon: { type: null, required: false },
  required: { type: Boolean, required: false, default: false },
  disabled: { type: Boolean, required: false, default: false },
  ltr: { type: Boolean, required: false, default: false },
  rows: { type: Number, required: false, default: 4 },
  /** id of a <datalist> to suggest from. */
  list: { type: String, required: false },
  autocomplete: { type: String, required: false },
  /** The keyboard a phone shows: "tel", "numeric", "email"… */
  inputmode: { type: String, required: false },
})

defineEmits(['update:modelValue', 'blur'])

const id = useId()
const hintId = computed(() => (props.hint ? `${id}-hint` : undefined))
const errorId = computed(() => (props.error ? `${id}-error` : undefined))
const describedBy = computed(
  () => [errorId.value, hintId.value].filter(Boolean).join(' ') || undefined,
)
</script>

<template>
  <div>
    <label :for="id" class="text-fg-muted mb-1.5 block text-[13px] font-semibold">
      {{ label }}
      <span v-if="required" class="text-danger-700" aria-hidden="true">*</span>
    </label>

    <div class="relative">
      <component
        :is="icon"
        v-if="icon && type !== 'textarea'"
        class="inset-inline-start-0 text-fg-faint pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2"
        style="inset-inline-start: 12px"
      />

      <textarea
        v-if="type === 'textarea'"
        :id="id"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :rows="rows"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
        class="focus:border-primary bg-surface text-fg placeholder:text-fg-faint disabled:bg-surface-sunken disabled:text-fg-faint w-full resize-none rounded-[var(--radius-md)] border px-3 py-2.5 text-sm transition-colors"
        :class="error ? 'border-danger-700/50' : 'border-border'"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="$emit('blur')"
      />

      <input
        v-else
        :id="id"
        :type="type"
        :value="modelValue"
        :list="list"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :dir="ltr ? 'ltr' : undefined"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
        class="focus:border-primary bg-surface text-fg placeholder:text-fg-faint disabled:bg-surface-sunken disabled:text-fg-faint h-10 w-full rounded-[var(--radius-md)] border px-3 text-sm transition-colors"
        :class="[
          error ? 'border-danger-700/50' : 'border-border',
          icon && 'ps-9',
          ltr && 'text-start',
        ]"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="$emit('blur')"
      />
    </div>

    <p v-if="error" :id="errorId" role="alert" class="text-danger-700 mt-1.5 text-xs font-medium">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="hintId" class="text-fg-subtle mt-1.5 text-xs">{{ hint }}</p>
  </div>
</template>
