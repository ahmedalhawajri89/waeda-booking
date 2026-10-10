<script setup>
import { computed, ref, watch } from 'vue'
import { format } from 'date-fns'
import { BellRing, Phone, User } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import CodeInput from '@/components/booking/CodeInput.vue'
import DemoCode from '@/components/booking/DemoCode.vue'
import { isDemoBackend, repository } from '@/data/repository'
import { usePhoneCode } from '@/composables/usePhoneCode'
import { dayLabel } from '@/lib/format'
import { rememberGuest, rememberedGuest, samePhone } from '@/lib/guestIdentity'
import { digitsOnly, toLatinDigits } from '@/lib/digits'

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

const known = rememberedGuest()
const name = ref(known?.name ?? '')
const phone = ref(known?.phone ?? '')
// Arabic-keyboard digits become Latin as they are typed: what the page
// shows is what the server stores.
watch(phone, (v) => {
  const latin = toLatinDigits(v)
  if (latin !== v) phone.value = latin
})
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

const phoneOk = computed(() => digitsOnly(phone.value).length >= 9)
const nameError = computed(() => (touched.value && !name.value.trim() ? 'الاسم مطلوب' : undefined))
const phoneError = computed(() =>
  touched.value && !phoneOk.value ? 'رقم الجوال غير مكتمل' : undefined,
)

/**
 * An offer goes to this phone as a message, so the phone is proven first —
 * once per device, as for booking: a device that already did joins directly.
 */
const code = usePhoneCode()
const verifying = ref(false)
const codeError = ref(false)
const codeBox = ref(null)

function proof() {
  const g = rememberedGuest()
  if (!g || !samePhone(g.phone, phone.value)) return null
  // The demo checks nothing server-side: a device that verified once is known.
  return isDemoBackend ? (g.token ?? 'demo') : g.token
}

async function join() {
  touched.value = true
  if (!name.value.trim() || !phoneOk.value) return
  const token = proof()
  if (token === null) return askForCode()
  saving.value = true
  try {
    await repository.joinWaitlist({
      serviceId: props.serviceId,
      day: format(props.date, 'yyyy-MM-dd'),
      window: PARTS.find((p) => p.value === part.value).window,
      name: name.value.trim(),
      phone: phone.value.trim(),
      verificationToken: token,
    })
    done.value = true
  } catch (e) {
    if (e?.body?.error === 'phone_not_verified') {
      rememberGuest(name.value.trim(), phone.value.trim(), null)
      return askForCode()
    }
    throw e
  } finally {
    saving.value = false
  }
}

async function askForCode() {
  codeError.value = false
  verifying.value = await code.send(phone.value.trim())
}

async function onCode(entered) {
  const token = await code.verify(phone.value.trim(), entered)
  if (!token) {
    codeError.value = true
    codeBox.value?.clear()
    return
  }
  rememberGuest(name.value.trim(), phone.value.trim(), token)
  verifying.value = false
  await join()
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

      <div v-else-if="verifying" class="space-y-3 text-center">
        <p class="text-fg text-sm font-bold">
          أدخل الرمز المرسل إلى <span dir="ltr">{{ phone }}</span>
        </p>
        <CodeInput ref="codeBox" :invalid="codeError" @complete="onCode" />
        <DemoCode v-if="code.shown.value" :code="code.shown.value" />
        <p v-if="codeError" class="text-danger-700 text-sm" role="alert">
          الرمز غير صحيح. حاول مرة أخرى.
        </p>
        <div class="text-fg-subtle text-sm">
          <span v-if="code.resendIn.value > 0" data-numeric>
            إعادة الإرسال بعد {{ code.resendIn.value }} ثانية
          </span>
          <button v-else type="button" class="text-fg font-semibold underline" @click="askForCode">
            أعد إرسال الرمز
          </button>
        </div>
      </div>

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
