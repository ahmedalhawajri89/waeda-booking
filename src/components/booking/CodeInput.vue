<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { digitsOnly } from '@/lib/digits'

/**
 * Four boxes for a four-digit code. Typing moves forward, Backspace moves
 * back, and pasting the whole code fills every box at once. `autocomplete`
 * lets iOS and Android offer the code straight from the message.
 */
const props = defineProps({
  length: { type: Number, required: false, default: 4 },
  invalid: { type: Boolean, required: false, default: false },
})
const emit = defineEmits(['complete'])

const digits = ref(Array.from({ length: props.length }, () => ''))
const boxes = ref([])

function emitIfDone() {
  const code = digits.value.join('')
  if (code.length === props.length) emit('complete', code)
}

function onInput(e, i) {
  const v = digitsOnly(e.target.value)
  if (v.length > 1) return fill(v)
  digits.value[i] = v
  if (v && i < props.length - 1) boxes.value[i + 1]?.focus()
  emitIfDone()
}

function onKey(e, i) {
  if (e.key === 'Backspace' && !digits.value[i] && i > 0) {
    digits.value[i - 1] = ''
    boxes.value[i - 1]?.focus()
  }
}

function fill(v) {
  v.slice(0, props.length)
    .split('')
    .forEach((d, i) => (digits.value[i] = d))
  boxes.value[Math.min(v.length, props.length) - 1]?.focus()
  emitIfDone()
}

function onPaste(e) {
  e.preventDefault()
  fill(digitsOnly(e.clipboardData?.getData('text')))
}

function clear() {
  digits.value = digits.value.map(() => '')
  nextTick(() => boxes.value[0]?.focus())
}

defineExpose({ clear })
onMounted(() => boxes.value[0]?.focus())
</script>

<template>
  <div class="flex justify-center gap-2.5" dir="ltr">
    <input
      v-for="(d, i) in digits"
      :key="i"
      :ref="(el) => (boxes[i] = el)"
      :value="d"
      type="text"
      inputmode="numeric"
      :autocomplete="i === 0 ? 'one-time-code' : 'off'"
      maxlength="4"
      :aria-label="`الرقم ${i + 1} من الرمز`"
      class="bg-surface text-fg h-14 w-12 rounded-[var(--radius-md)] border text-center text-2xl font-bold transition-colors outline-none focus:ring-2"
      :class="
        invalid
          ? 'border-danger-600 focus:ring-danger-600/30'
          : 'border-border-strong focus:border-fg focus:ring-fg/10'
      "
      data-numeric
      @input="onInput($event, i)"
      @keydown="onKey($event, i)"
      @paste="onPaste"
    />
  </div>
</template>
