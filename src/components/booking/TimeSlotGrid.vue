<script setup>
import { CalendarX2 } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'

/**
 * Taken slots stay visible but disabled — absence is information. Hiding them
 * would make a fully-booked day look identical to a closed one.
 */
defineProps({
  slots: { type: Array, required: true },
  modelValue: { type: [String, null], required: true },
  /** 'grid', or 'list': two to a row on a wide screen, for a narrow column. */
  layout: { type: String, required: false, default: 'grid' },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div v-if="slots.length === 0">
    <EmptyState
      variant="no-results"
      :icon="CalendarX2"
      title="لا توجد أوقات متاحة"
      description="هذا اليوم خارج ساعات العمل أو محجوز بالكامل. جرّب يوماً آخر."
    />
  </div>

  <div
    v-else
    role="radiogroup"
    aria-label="اختر الوقت"
    class="grid gap-2"
    :class="
      layout === 'list' ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-2' : 'grid-cols-3 sm:grid-cols-4'
    "
  >
    <button
      v-for="slot in slots"
      :key="slot.startAt"
      type="button"
      role="radio"
      :aria-checked="modelValue === slot.startAt"
      :disabled="slot.state !== 'available'"
      :aria-label="
        slot.state === 'taken'
          ? `${slot.label} — محجوز`
          : slot.state === 'past'
            ? `${slot.label} — مضى`
            : slot.label
      "
      class="h-10 rounded-[var(--radius-md)] border text-sm font-semibold transition-colors"
      :class="[
        modelValue === slot.startAt
          ? 'border-primary bg-primary text-fg-on-primary'
          : slot.state === 'available'
            ? 'hover:border-primary-line hover:bg-primary-soft bg-surface border-border text-fg-muted'
            : 'border-border bg-canvas text-fg-faint cursor-not-allowed line-through',
      ]"
      @click="emit('update:modelValue', slot.startAt)"
    >
      {{ slot.label }}
    </button>
  </div>
</template>
