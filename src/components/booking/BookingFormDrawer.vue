<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { startOfDay } from 'date-fns'
import { Phone, User } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseDrawer from '@/components/ui/BaseDrawer.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import DateStrip from './DateStrip.vue'
import TimeSlotGrid from './TimeSlotGrid.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { bookableResources, bookableServices, schedule, services } from '@/data/catalog'
import { generateSlots } from '@/lib/availability'
import { money, duration } from '@/lib/format'
import { isConflict } from '@/data/errors'

/**
 * Operator create/reschedule on a single surface — no stepper. Availability
 * recomputes live, so an impossible booking cannot be submitted.
 */
const props = defineProps({
  open: { type: Boolean, required: true },
  rescheduleId: { type: [String, null], required: false, default: null },
  /** Who, when, what and for whom, ready to confirm: { resourceId, startAt, serviceId, phone, name }. */
  prefill: { type: [Object, null], required: false, default: null },
})
const emit = defineEmits(['close', 'created'])

const bookings = useBookingsStore()
const customers = useCustomersStore()

const serviceId = ref(services[0].id)
const resourceId = ref(services[0].resourceIds[0])
const date = ref(startOfDay(new Date()))
const startAt = ref(null)
const phone = ref('')
const name = ref('')
const paymentStatus = ref('unpaid')
const notes = ref('')
const submitting = ref(false)
const touched = ref(false)

const rescheduling = computed(() => (props.rescheduleId ? bookings.byId(props.rescheduleId) : null))

const service = computed(() => services.find((s) => s.id === serviceId.value) ?? services[0])
const allowedResources = computed(() => bookableResources(service.value))

/** Rescheduling keeps the booking's service; creating offers what is bookable. */
const offeredServices = computed(() =>
  rescheduling.value
    ? services.filter((s) => s.id === rescheduling.value.serviceId)
    : bookableServices(),
)

/**
 * The catalog arrives after this component is set up.
 *
 * `serviceId` starts on the defaults in data/catalog.js, and the settings
 * store then replaces those rows with whatever the repository returns. On the
 * demo backend the ids happen to survive that swap; against a real one they
 * do not, and the captured id stops matching anything — which used to leave
 * `service` undefined and take the drawer down with it.
 *
 * Re-pointing the selection at a row that exists is what keeps the radio
 * group and the slot grid agreeing about which service is selected.
 */
watch(
  () => services.map((s) => s.id).join(),
  () => {
    if (!services.some((s) => s.id === serviceId.value)) serviceId.value = services[0]?.id
  },
  { immediate: true },
)

/** A phone that matches an existing customer pre-fills the name. */
const matched = computed(() => (phone.value.trim() ? customers.byPhone(phone.value) : null))

const slots = computed(() =>
  generateSlots({
    date: date.value,
    service: service.value,
    resourceId: resourceId.value,
    bookings: bookings.items,
    hours: schedule,
    excludeBookingId: props.rescheduleId ?? undefined,
  }),
)

/** Today, or the first day on the strip with a time still open. */
function firstOpenDay() {
  const today = startOfDay(new Date())
  for (let i = 0; i < 7; i++) {
    const day = new Date(today)
    day.setDate(today.getDate() + i)
    const open = generateSlots({
      date: day,
      service: service.value,
      resourceId: resourceId.value,
      bookings: bookings.items,
      hours: schedule,
    }).some((s) => s.state === 'available')
    if (open) return day
  }
  return today
}

const nameError = computed(() =>
  touched.value && !name.value.trim() && !matched.value ? 'الاسم مطلوب' : undefined,
)
const phoneError = computed(() => {
  if (!touched.value) return undefined
  const digits = phone.value.replace(/\D/g, '')
  if (digits.length === 0) return 'رقم الجوال مطلوب'
  if (digits.length < 9) return 'رقم الجوال غير مكتمل'
  return undefined
})
// Rescheduling only moves the time — the customer fields are not shown, so
// requiring them left the button permanently disabled.
const canSubmit = computed(
  () =>
    !!startAt.value &&
    (!!rescheduling.value || (!phoneError.value && (!!matched.value || !!name.value.trim()))),
)

watch(matched, (c) => {
  if (c) name.value = c.name
})

watch(service, (s) => {
  const ids = bookableResources(s).map((r) => r.id)
  if (s && !ids.includes(resourceId.value)) resourceId.value = ids[0] ?? s.resourceIds[0]
  startAt.value = null
})
watch([date, resourceId], () => {
  startAt.value = null
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    touched.value = false
    startAt.value = null
    phone.value = ''
    name.value = ''
    notes.value = ''
    paymentStatus.value = 'unpaid'
    const b = rescheduling.value
    if (b) {
      // Slots must be for this booking's own service and room, starting on its day.
      serviceId.value = b.serviceId
      resourceId.value = b.resourceId
      date.value = startOfDay(new Date(b.startAt))
    } else if (props.prefill) {
      // A service this person actually does, then their day, then the time —
      // in that order, because each of the first two clears the time.
      // A prefill can also name the service and the customer — booking someone
      // straight off the waitlist.
      const p = props.prefill
      if (p.serviceId && offeredServices.value.some((x) => x.id === p.serviceId))
        serviceId.value = p.serviceId
      const fits = (s) => !p.resourceId || bookableResources(s).some((r) => r.id === p.resourceId)
      if (!fits(service.value))
        serviceId.value = offeredServices.value.find(fits)?.id ?? serviceId.value
      if (p.resourceId) resourceId.value = p.resourceId
      if (p.phone) phone.value = p.phone
      if (p.name) name.value = p.name
      if (p.startAt) {
        date.value = startOfDay(new Date(p.startAt))
        nextTick(() => nextTick(() => (startAt.value = p.startAt)))
      } else {
        // "Book again" names no time: open on the first day that has one.
        date.value = firstOpenDay()
      }
    } else {
      if (!offeredServices.value.some((s) => s.id === serviceId.value))
        serviceId.value = offeredServices.value[0]?.id ?? services[0]?.id
      date.value = startOfDay(new Date())
    }
  },
)

async function submit() {
  touched.value = true
  if (!canSubmit.value) return
  submitting.value = true
  try {
    if (props.rescheduleId) {
      // The grid does not offer taken slots, so this only fires if the slot
      // was claimed between the grid rendering and this submit.
      // The resource picker is shown here, so the move has to honour it —
      // it used to move the time and leave the person behind.
      const moved = bookings.move(props.rescheduleId, {
        startAt: startAt.value,
        resourceId: resourceId.value,
      })
      if (moved !== true) {
        toast.error('هذا الوقت لم يعد متاحاً — اختر وقتاً آخر')
        return
      }
      toast.success('تمت إعادة الجدولة')
      emit('close')
      return
    }
    const customer = await customers.upsert({ name: name.value, phone: phone.value })
    const created = await bookings.create({
      customerId: customer.id,
      serviceId: serviceId.value,
      resourceId: resourceId.value,
      startAt: startAt.value,
      status: 'confirmed',
      paymentStatus: paymentStatus.value,
      channel: 'phone',
      notes: notes.value.trim() || undefined,
    })
    toast.success('تم إنشاء الحجز', { description: created.reference })
    emit('close')
    emit('created', created.id)
  } catch (e) {
    // The slot went between the grid rendering and this submit, or the
    // backend refused it; the drawer stays open so another time can be picked.
    toast.error(
      isConflict(e)
        ? 'هذا الوقت لم يعد متاحاً — اختر وقتاً آخر'
        : 'تعذّر إنشاء الحجز. حاول مرة أخرى.',
    )
  } finally {
    submitting.value = false
  }
}

const PAYMENTS = [
  { value: 'unpaid', label: 'غير مدفوع' },
  { value: 'deposit_paid', label: 'عربون' },
  { value: 'paid', label: 'مدفوع' },
]
</script>

<template>
  <BaseDrawer
    :open="open"
    :title="rescheduleId ? 'إعادة جدولة' : 'حجز جديد'"
    :subtitle="rescheduleId ? 'اختر وقتاً جديداً متاحاً' : 'أنشئ حجزاً في أقل من دقيقة'"
    @close="emit('close')"
  >
    <div class="space-y-5">
      <!-- service -->
      <fieldset>
        <legend class="text-fg-muted mb-1.5 text-[13px] font-semibold">الخدمة</legend>
        <div class="grid gap-2">
          <label
            v-for="s in offeredServices"
            :key="s.id"
            class="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors"
            :class="
              serviceId === s.id
                ? 'border-primary bg-primary-soft'
                : 'hover:border-primary-line border-border'
            "
          >
            <input
              v-model="serviceId"
              type="radio"
              :value="s.id"
              class="sr-only"
              :disabled="!!rescheduleId"
            />
            <component :is="s.icon" class="text-fg-subtle h-5 w-5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="text-fg block truncate text-sm font-semibold">{{ s.name }}</span>
              <span class="text-fg-subtle block text-xs">{{ duration(s.durationMin) }}</span>
            </span>
            <span class="text-fg shrink-0 text-sm font-bold" data-numeric>
              {{ money(s.priceMinor) }}
            </span>
          </label>
        </div>
      </fieldset>

      <!-- resource -->
      <fieldset v-if="allowedResources.length > 1">
        <legend class="text-fg-muted mb-1.5 text-[13px] font-semibold">مع من؟</legend>
        <div class="flex gap-2">
          <label
            v-for="r in allowedResources"
            :key="r.id"
            class="flex-1 cursor-pointer rounded-[var(--radius-md)] border px-3 py-2 text-center text-sm font-semibold transition-colors"
            :class="
              resourceId === r.id
                ? 'border-primary bg-primary-soft text-primary-fg'
                : 'hover:border-primary-line border-border text-fg-muted'
            "
          >
            <input v-model="resourceId" type="radio" :value="r.id" class="sr-only" />
            {{ r.name }}
          </label>
        </div>
      </fieldset>

      <!-- when -->
      <div>
        <p class="text-fg-muted mb-1.5 text-[13px] font-semibold">اليوم</p>
        <DateStrip v-model="date" :days="7" />
      </div>

      <div>
        <p class="text-fg-muted mb-1.5 text-[13px] font-semibold">الوقت</p>
        <TimeSlotGrid
          :slots="slots"
          :model-value="startAt"
          @update:model-value="startAt = $event"
        />
      </div>

      <!-- customer -->
      <template v-if="!rescheduleId">
        <div class="border-border grid gap-4 border-t pt-5">
          <BaseInput
            v-model="phone"
            label="رقم الجوال"
            type="tel"
            :icon="Phone"
            ltr
            required
            placeholder="05XXXXXXXX"
            :error="phoneError"
            :hint="
              matched ? `عميل مسجّل: ${matched.name}` : 'إن كان الرقم مسجّلاً سيُملأ الاسم تلقائياً'
            "
          />
          <BaseInput
            v-model="name"
            label="اسم العميل"
            :icon="User"
            required
            :disabled="!!matched"
            :error="nameError"
            placeholder="الاسم الكامل"
          />
        </div>

        <fieldset>
          <legend class="text-fg-muted mb-1.5 text-[13px] font-semibold">حالة الدفع</legend>
          <div class="flex gap-2">
            <label
              v-for="p in PAYMENTS"
              :key="p.value"
              class="flex-1 cursor-pointer rounded-[var(--radius-md)] border px-2 py-2 text-center text-xs font-semibold transition-colors"
              :class="
                paymentStatus === p.value
                  ? 'border-primary bg-primary-soft text-primary-fg'
                  : 'hover:border-primary-line border-border text-fg-muted'
              "
            >
              <input v-model="paymentStatus" type="radio" :value="p.value" class="sr-only" />
              {{ p.label }}
            </label>
          </div>
        </fieldset>

        <BaseInput
          v-model="notes"
          label="ملاحظات"
          type="textarea"
          :rows="2"
          placeholder="اختياري"
        />
      </template>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span class="text-fg-subtle text-sm">
          الإجمالي
          <strong class="text-fg" data-numeric>{{ money(service.priceMinor) }}</strong>
        </span>
        <div class="flex gap-2">
          <BaseButton variant="ghost" @click="emit('close')">إلغاء</BaseButton>
          <BaseButton
            variant="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ rescheduleId ? 'تأكيد الموعد الجديد' : 'إنشاء الحجز' }}
          </BaseButton>
        </div>
      </div>
    </template>
  </BaseDrawer>
</template>
