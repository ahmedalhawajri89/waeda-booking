<script setup>
import { ref, toRef } from 'vue'
import { X } from 'lucide-vue-next'
import IconButton from './IconButton.vue'
import { useFocusTrap } from '@/composables/useFocusTrap'

/**
 * Centred dialog. Use for decisions the operator must resolve before doing
 * anything else; anything they can browse alongside belongs in a drawer.
 *
 * `role` is a prop because an alertdialog interrupts a screen reader and a
 * plain dialog does not — destructive confirmations earn the interruption,
 * ordinary forms do not.
 */
const props = defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, required: true },
  description: { type: String, required: false },
  size: { type: String, required: false, default: 'sm' },
  role: { type: String, required: false, default: 'dialog' },
  closeOnBackdrop: { type: Boolean, required: false, default: true },
  dismissible: { type: Boolean, required: false, default: true },
})

const emit = defineEmits(['close'])

const panel = ref(null)
useFocusTrap(toRef(props, 'open'), panel, () => emit('close'))

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="bg-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-[2px]"
        @click.self="closeOnBackdrop && emit('close')"
      >
        <div
          ref="panel"
          :role="role"
          aria-modal="true"
          :aria-label="title"
          class="elev-modal animate-pop-in bg-surface flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-[var(--radius-xl)] p-5"
          :class="SIZE[size]"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h2 class="type-h3 text-fg">{{ title }}</h2>
              <p v-if="description" class="type-body text-fg-muted mt-2">{{ description }}</p>
            </div>
            <IconButton
              v-if="dismissible"
              :icon="X"
              label="إغلاق"
              size="sm"
              @click="emit('close')"
            />
          </div>

          <!-- The body scrolls; the title and the buttons stay put, so a long
               form never pushes "save" off the screen. -->
          <div v-if="$slots.default" class="-mx-5 mt-4 min-h-0 flex-1 overflow-y-auto px-5">
            <slot />
          </div>

          <div v-if="$slots.footer" class="mt-5 flex shrink-0 justify-end gap-2">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
