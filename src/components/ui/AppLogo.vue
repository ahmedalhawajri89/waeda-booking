<script setup>
/**
 * The mark is the brand's own first letter, و, drawn as a geometric stroke:
 * its head is a ring, and inside the ring sits one orange dot — the
 * appointment, held. It draws in `currentColor`, so it follows the theme and
 * turns white on an inverse surface without a second asset.
 */
defineProps({
  compact: { type: Boolean, required: false, default: false },
  inverse: { type: Boolean, required: false, default: false },
  /** The mark alone, for tight spots (collapsed rail, favicon-sized uses). */
  markOnly: { type: Boolean, required: false, default: false },
})
</script>

<template>
  <RouterLink
    to="/"
    class="flex items-center gap-2"
    :class="inverse ? 'text-white' : 'text-fg'"
    aria-label="وعدة، الصفحة الرئيسية"
  >
    <svg
      :class="compact ? 'h-8 w-8' : 'h-9 w-9'"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="18.5" cy="11" r="7" stroke="currentColor" stroke-width="2.8" />
      <path
        d="M25.5 11v4c0 7.7-6.1 13.5-13.75 13.5H7"
        stroke="currentColor"
        stroke-width="2.8"
        stroke-linecap="round"
      />
      <circle cx="18.5" cy="11" r="3" fill="#E5562B" />
    </svg>
    <span
      v-if="!markOnly"
      class="font-display leading-none font-bold"
      :class="compact ? 'text-[1.35rem]' : 'text-2xl'"
    >
      وعدة
    </span>
  </RouterLink>
</template>
