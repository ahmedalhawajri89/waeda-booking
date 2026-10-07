<script setup>
import { computed, ref, watch } from 'vue'
import { format } from 'date-fns'
import { BellRing, Phone, User } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { repository } from '@/data/repository'
import { dayLabel } from '@/lib/format'

/**
 * "Tell me if a time frees up." Offered on the booking page — open when the
 * chosen day has nothing left, one link away otherwise. A cancellation that
 * fits is then offered to the people here before anyone else, by the guard.
 */
const props = defineProps({
  serviceId: { type: String, required: true },
  date: { type: Date, required: true },
  full: { type: Boolean, required: false, default: false },
})

const open = ref(props.full)
watch(
  () => props.full,
  (full) => {
    if (full) open.value = true
  },
)

const name = ref('')
const phone = ref('')
const part = ref('any')
const done = ref(false)
const saving = ref(false)
const touched = ref(false)

const PARTS = [
  { value: 'any', label: 'أي وقت', window: null },
  { value: 'morning', label: 'الصبح', window: [9 * 60, 12 * 60] },
  { value: 'noon', label: 'الظهر', window: [12 * 60, 15 * 60] },
  { value: 'afternoon', label: 'العصر', window: [15 * 60, 18 * 60] },
  { value: 'evening', label: 'المساء', window: [17 * 60, 21 * 60] },
]

const phoneOk = computed(() => phone.value.replace(/\D/g, '').length >= 9)
const nameError = computed(() => (touched.value && !name.value.trim() ? 'الاسم مطلوب' : undefined))
const phoneError = computed(() =>
  touched.value && !phoneOk.value ? 'رقم الجوال غير مكتمل' : undefined,
)

async function join() {
  touched.value = true
  if (!name.value.trim() || !phoneOk.value) return
  saving.value = true
  try {
    await repository.joinWaitlist({
      serviceId: props.serviceId,
      day: format(props.date, 'yyyy-MM-dd'),
      window: PARTS.find((p) => p.value === part.value).window,
      name: name.value.trim(),
      phone: phone.value.trim(),
    })
    done.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mt-4">
    <button
      v-if="!open"
      type="button"
      class="text-primary-fg hover:text-primary-fg text-sm font-semibold"
      @click="open = true"
    >
      لا يناسبك أي وقت؟ انضم لقائمة الانتظار
    </button>

    <div
      v-else
      class="border-primary-line bg-primary-soft/50 rounded-[var(--radius-lg)] border p-4"
    >
      <p
        v-if="done"
        class="text-success-700 flex items-center gap-2 text-sm font-semibold"
        role="status"
      >
        <BellRing class="h-4 w-4" aria-hidden="true" />
        سجّلناك. إذا تفرّغ وقت {{ dayLabel(date) }} نرسل لك رسالة، وأول من يرد يأخذه.
      </p>

      <form v-else class="space-y-3" @submit.prevent="join">
        <p class="text-fg flex items-center gap-2 text-sm font-bold">
          <BellRing class="text-primary-fg h-4 w-4" aria-hidden="true" />
          {{ full ? 'هذا اليوم ممتلئ — نبّهني إذا تفرّغ وقت' : 'نبّهني إذا تفرّغ وقت' }}
        </p>

        <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="الوقت المفضّل">
          <label
            v-for="p in PARTS"
            :key="p.value"
            class="cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
            :class="
              part === p.value
                ? 'border-primary text-primary-fg bg-surface'
                : 'hover:border-primary-line border-border text-fg-muted bg-white/60'
            "
          >
            <input v-model="part" type="radio" :value="p.value" class="sr-only" />
            {{ p.label }}
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <BaseInput v-model="name" label="الاسم" :icon="User" :error="nameError" />
          <BaseInput
            v-model="phone"
            label="رقم الجوال"
            type="tel"
            :icon="Phone"
            ltr
            placeholder="05XXXXXXXX"
            :error="phoneError"
          />
        </div>

        <BaseButton type="submit" variant="primary" :loading="saving">نبّهني</BaseButton>
      </form>
    </div>
  </div>
</template>
