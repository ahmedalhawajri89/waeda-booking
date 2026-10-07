<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Dropdown menu. Positioned by the browser via an absolutely placed panel
 * anchored to the trigger, not by a positioning library: the menus here are
 * short and always near a screen edge we control.
 */
defineProps({
  items: { type: Array, required: true },
  label: { type: String, required: true },
  align: { type: String, required: false, default: 'end' },
  /** 'top' opens upward, for triggers near the bottom of the screen. */
  side: { type: String, required: false, default: 'bottom' },
})

const emit = defineEmits(['select'])

const open = ref(false)
const root = ref(null)
const panel = ref(null)

function close(restoreFocus = true) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) root.value?.querySelector('[data-menu-trigger]')?.focus()
}

function choose(item) {
  if (item.disabled) return
  emit('select', item.value)
  close()
}

function focusItem(index) {
  const nodes = panel.value?.querySelectorAll('[role="menuitem"]:not([disabled])')
  if (!nodes?.length) return
  nodes[(index + nodes.length) % nodes.length]?.focus()
}

function onPanelKey(e) {
  const nodes = Array.from(panel.value?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? [])
  const current = nodes.indexOf(document.activeElement)

  if (e.key === 'ArrowDown') focusItem(current + 1)
  else if (e.key === 'ArrowUp') focusItem(current - 1)
  else if (e.key === 'Home') focusItem(0)
  else if (e.key === 'End') focusItem(nodes.length - 1)
  else if (e.key === 'Escape') close()
  else if (e.key === 'Tab') {
    // Tabbing out is a dismissal, not a trap — a menu is not a modal.
    close(false)
    return
  } else return

  e.preventDefault()
}

function onDocumentPointer(e) {
  if (!root.value?.contains(e.target)) close(false)
}

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointer)
    await nextTick()
    focusItem(0)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointer)
  }
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer))
</script>

<template>
  <div ref="root" class="relative">
    <div
      data-menu-trigger
      class="contents"
      @click="open = !open"
      @keydown.down.prevent="open = true"
    >
      <slot name="trigger" :open="open" />
    </div>

    <Transition name="fade">
      <div
        v-if="open"
        ref="panel"
        role="menu"
        :aria-label="label"
        class="elev-overlay bg-surface border-border absolute z-50 min-w-52 rounded-[var(--radius-lg)] border p-1"
        :class="side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'"
        :style="align === 'end' ? 'inset-inline-end: 0' : 'inset-inline-start: 0'"
        @keydown="onPanelKey"
      >
        <template v-for="item in items" :key="item.value">
          <div v-if="item.separated" class="bg-border my-1 h-px" role="separator" />
          <button
            type="button"
            role="menuitem"
            :disabled="item.disabled"
            class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-start text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="
              item.tone === 'danger'
                ? 'text-danger-700 hover:bg-danger-50'
                : 'text-fg hover:bg-surface-sunken'
            "
            @click="choose(item)"
          >
            <component :is="item.icon" v-if="item.icon" class="h-4 w-4" aria-hidden="true" />
            {{ item.label }}
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>
