<script setup>
import { onBeforeUnmount, ref, useId } from 'vue'

/**
 * Hover/focus hint. Never the only carrier of meaning — touch users get no
 * hover and screen readers get the text via aria-describedby, so anything
 * essential has to be on the page proper.
 *
 * Positioned with getBoundingClientRect into a fixed-position node instead of
 * a positioning library: these are small labels near controls we place.
 */
const props = defineProps({
  text: { type: String, required: true },
  placement: { type: String, required: false, default: 'top' },
  delay: { type: Number, required: false, default: 400 },
})

const id = useId()
const visible = ref(false)
const coords = ref({ top: 0, left: 0 })
const anchor = ref(null)
let timer

function place() {
  const el = anchor.value?.firstElementChild ?? anchor.value
  if (!el) return
  const r = el.getBoundingClientRect()
  coords.value = {
    top: props.placement === 'top' ? r.top - 8 : r.bottom + 8,
    left: r.left + r.width / 2,
  }
}

function show() {
  timer = setTimeout(() => {
    place()
    visible.value = true
  }, props.delay)
}

/** Keyboard focus shows at once — no hover delay for someone tabbing through. */
function showNow() {
  place()
  visible.value = true
}

function hide() {
  clearTimeout(timer)
  visible.value = false
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span
    ref="anchor"
    class="contents"
    :aria-describedby="visible ? id : undefined"
    @pointerenter="show"
    @pointerleave="hide"
    @focusin="showNow"
    @focusout="hide"
    @keydown.escape="hide"
  >
    <slot />
  </span>

  <Teleport to="body">
    <Transition name="fade">
      <span
        v-if="visible"
        :id="id"
        role="tooltip"
        class="elev-overlay bg-surface-inverse text-fg-inverse pointer-events-none fixed z-[80] max-w-56 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-center text-xs font-medium"
        :style="{
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          transform: `translate(-50%, ${placement === 'top' ? '-100%' : '0'})`,
        }"
      >
        {{ text }}
      </span>
    </Transition>
  </Teleport>
</template>
