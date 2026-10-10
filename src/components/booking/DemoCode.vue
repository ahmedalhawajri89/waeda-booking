<script setup>
/**
 * The code, on the page, while no real WhatsApp channel sends it.
 *
 * It used to arrive as a toast, which outlived the code step and sat over the
 * confirmation page. Here it belongs to the code step and goes with it, and it
 * says plainly why it is on screen at all.
 */
defineProps({
  code: { type: String, required: true },
})
</script>

<template>
  <p
    class="bg-surface-sunken text-fg-muted rounded-[var(--radius-md)] px-3 py-2 text-center text-xs"
  >
    نسخة تجريبية: واتساب غير مربوط بعد، فهذا رمزك
    <span class="text-fg ms-1 text-sm font-bold" dir="ltr" data-numeric data-demo-code>{{
      code
    }}</span>
  </p>
</template>
