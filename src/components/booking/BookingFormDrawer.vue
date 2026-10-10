<script setup>
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { startOfDay } from 'date-fns'
import {
  CalendarClock,
  Check,
  History,
  Phone,
  Repeat,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import IconButton from '@/components/ui/IconButton.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import MonthCalendar from './MonthCalendar.vue'
import TimeSlotGrid from './TimeSlotGrid.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { bookableResources, bookableServices, schedule, services } from '@/data/catalog'
import { generateSlots, isOpenOn } from '@/lib/availability'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { dayLabel, duration, money, time } from '@/lib/format'
import { initialOf } from '@/data/business'
import { durationsOf, priceFor } from '@/lib/pricing'
import { isConflict } from '@/data/errors'
import { digitsOnly, toLatinDigits } from '@/lib/digits'

/**
 * Operator create/reschedule on one wide surface, everything in view at once:
 * who and what, then the month, then the day's times; the booking itself is
 * summed up along the bottom. No stepper. Availability
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
// Arabic-keyboard digits become Latin as they are typed: what the page
// shows is what the server stores.
watch(phone, (v) => {
  const latin = toLatinDigits(v)
  if (latin !== v) phone.value = latin
})
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

/** A length the service offers; a moved booking keeps its own. */
const durationMin = ref(null)
const lengths = computed(() => durationsOf(service.value))
const length = computed(() => durationMin.value ?? service.value?.durationMin ?? 0)

/** The same slot every week, for a team that plays every Tuesday. */
const repeatWeekly = ref(false)
const weeks = ref(4)

const slots = computed(() =>
  generateSlots({
    date: date.value,
    service: service.value,
    resourceId: resourceId.value,
    bookings: bookings.items,
    hours: schedule,
    excludeBookingId: props.rescheduleId ?? undefined,
    durationMin: durationMin.value,
  }),
)
const price = computed(() =>
  service.value && startAt.value
    ? priceFor(service.value, startAt.value, durationMin.value, schedule)
    : Math.round(
        ((service.value?.priceMinor ?? 0) * length.value) / (service.value?.durationMin || 1),
      ),
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
  const digits = digitsOnly(phone.value)
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
  if (!rescheduling.value) durationMin.value = null
  startAt.value = null
})
watch([date, resourceId, durationMin], () => {
  startAt.value = null
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    optionsOpen.value = false
    // A new booking starts where the desk starts: typing the caller's number.
    if (!props.rescheduleId)
      nextTick(() =>
        requestAnimationFrame(() => panel.value?.querySelector('input[type="tel"]')?.focus()),
      )
    touched.value = false
    startAt.value = null
    phone.value = ''
    name.value = ''
    notes.value = ''
    paymentStatus.value = 'unpaid'
    repeatWeekly.value = false
    weeks.value = 4
    usedLast.value = false
    skippedToday.value = false
    const b = rescheduling.value
    if (b) {
      // Slots must be for this booking's own service and room, starting on its day.
      serviceId.value = b.serviceId
      resourceId.value = b.resourceId
      durationMin.value = b.durationMin ?? null
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
      durationMin.value = null
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
      // Today if anything is left of it, else the first day that has a time:
      // opening onto a grid of struck-out hours made the desk hunt for a day.
      const first = firstOpenDay()
      date.value = first
      skippedToday.value = first.getTime() !== startOfDay(new Date()).getTime()
    }
  },
)

/** Set when the form opened past today because today has nothing left. */
const skippedToday = ref(false)

/**
 * A returning customer usually books what they booked last time, with the
 * same person — offered as one tap, never changed behind the desk's back.
 */
const usedLast = ref(false)
const lastVisit = computed(() => {
  if (!matched.value || rescheduling.value) return null
  const last = [...bookings.forCustomer(matched.value.id)]
    .filter(
      (b) => b.status !== 'cancelled' && offeredServices.value.some((s) => s.id === b.serviceId),
    )
    .sort((a, b) => b.startAt.localeCompare(a.startAt))[0]
  if (!last) return null
  if (last.serviceId === serviceId.value && last.resourceId === resourceId.value) return null
  return {
    serviceId: last.serviceId,
    resourceId: last.resourceId,
    service: services.find((s) => s.id === last.serviceId)?.name ?? '',
    resource: bookableResources(services.find((s) => s.id === last.serviceId)).find(
      (r) => r.id === last.resourceId,
    )?.name,
  }
})
function useLast() {
  const l = lastVisit.value
  if (!l) return
  serviceId.value = l.serviceId
  nextTick(() => {
    if (allowedResources.value.some((r) => r.id === l.resourceId)) resourceId.value = l.resourceId
    usedLast.value = true
  })
}

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
    const input = {
      customerId: customer.id,
      serviceId: serviceId.value,
      resourceId: resourceId.value,
      startAt: startAt.value,
      status: 'confirmed',
      paymentStatus: paymentStatus.value,
      channel: 'phone',
      notes: notes.value.trim() || undefined,
      durationMin: durationMin.value,
    }
    if (repeatWeekly.value) {
      const { created, skipped } = await bookings.createWeekly(input, weeks.value)
      if (!created.length) throw Object.assign(new Error('all taken'), { status: 409 })
      toast.success(`حُجز ${created.length} من ${weeks.value} أسابيع`, {
        description: skipped.length
          ? `مشغول: ${skipped.map((d) => dayLabel(d)).join('، ')}`
          : 'كل الأسابيع محجوزة بنفس الوقت',
      })
      emit('close')
      emit('created', created[0].id)
      return
    }
    const created = await bookings.create(input)
    toast.success('تم إنشاء الحجز', { description: created.reference })
    emit('close')
    emit('created', created.id)
  } catch (e) {
    // The slot went between the grid rendering and this submit, or the
    // backend refused it; the drawer stays open so another time can be picked.
    toast.error(
      isConflict(e) || e?.status === 409
        ? 'هذا الوقت لم يعد متاحاً — اختر وقتاً آخر'
        : 'تعذّر إنشاء الحجز. حاول مرة أخرى.',
    )
  } finally {
    submitting.value = false
  }
}

/* ------------------------------------------------------------ presentation */

const panel = ref(null)
useFocusTrap(toRef(props, 'open'), panel, () => emit('close'))

/**
 * How many times each day has left, for the month's dots. Computed per day on
 * demand and kept until the service, person, length or bookings change.
 */
const freeOn = computed(() => {
  const cache = new Map()
  const deps = [service.value, resourceId.value, durationMin.value, bookings.items]
  return (day) => {
    const key = day.getTime()
    if (cache.has(key)) return cache.get(key)
    let n = -1
    if (deps[0] && isOpenOn(schedule, day)) {
      n = generateSlots({
        date: day,
        service: deps[0],
        resourceId: deps[1],
        bookings: deps[3],
        hours: schedule,
        excludeBookingId: props.rescheduleId ?? undefined,
        durationMin: deps[2],
      }).filter((x) => x.state === 'available').length
    }
    cache.set(key, n)
    return n
  }
})

/** Payment, notes and repeating live behind one button; most bookings need none. */
const optionsOpen = ref(false)
const optionsSet = computed(
  () =>
    (paymentStatus.value !== 'unpaid' ? 1 : 0) +
    (notes.value.trim() ? 1 : 0) +
    (repeatWeekly.value ? 1 : 0),
)

/**
 * Times by part of the day, so a long day reads as three short rows. Times
 * already gone are left out; taken ones stay, struck through.
 */
const PARTS = [
  { key: 'night', label: 'بعد منتصف الليل', test: (h) => h < 5 },
  { key: 'morning', label: 'صباحاً', test: (h) => h < 12 },
  { key: 'noon', label: 'بعد الظهر', test: (h) => h < 17 },
  { key: 'evening', label: 'مساءً', test: () => true },
]
const slotGroups = computed(() => {
  const groups = []
  for (const slot of slots.value) {
    if (slot.state === 'past') continue
    const part = PARTS.find((x) => x.test(new Date(slot.startAt).getHours()))
    let g = groups.find((x) => x.key === part.key)
    if (!g) groups.push((g = { key: part.key, label: part.label, slots: [] }))
    g.slots.push(slot)
  }
  return groups
})
const freeCount = computed(() => slots.value.filter((s) => s.state === 'available').length)

/** The returning customer, at a glance: how often they come. */
const visits = computed(() =>
  matched.value
    ? bookings.forCustomer(matched.value.id).filter((b) => b.status === 'completed').length
    : 0,
)

const resourceName = computed(
  () => allowedResources.value.find((r) => r.id === resourceId.value)?.name ?? '',
)

/** Each section turns its number into a tick once it has what it needs. */
const done = computed(() => ({
  who:
    !!rescheduling.value ||
    (digitsOnly(phone.value).length >= 9 && (!!matched.value || !!name.value.trim())),
  what: !!service.value,
  when: !!startAt.value,
}))

/** What the button is still waiting for, said in the footer. */
const missing = computed(() => {
  if (!startAt.value) return 'اختر وقتاً لإكمال الحجز'
  if (!done.value.who) return 'أدخل جوال العميل واسمه'
  return ''
})

/** A section's number, or a tick once it has what it needs. */
const stepClass = (isDone) => [
  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
  isDone ? 'bg-success-50 text-success-700' : 'bg-surface-sunken text-fg-muted',
]
/** One sunken control, the choice raised inside it. */
const SEGMENTED = 'bg-surface-sunken flex gap-1 rounded-[var(--radius-md)] p-1'
const segment = (on) => [
  'flex-1 cursor-pointer rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-center text-xs font-semibold transition-colors',
  on ? 'bg-surface text-fg elev-raised' : 'text-fg-muted hover:text-fg',
]

const PAYMENTS = [
  { value: 'unpaid', label: 'غير مدفوع' },
  { value: 'deposit_paid', label: 'عربون' },
  { value: 'paid', label: 'مدفوع' },
]
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="bg-overlay fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-[2px] sm:p-6"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-label="rescheduleId ? 'إعادة جدولة' : 'حجز جديد'"
          class="elev-modal animate-pop-in bg-surface flex h-full w-full flex-col overflow-hidden sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-5xl sm:rounded-[var(--radius-xl)] lg:h-[min(720px,calc(100dvh-3rem))]"
        >
          <!-- head -->
          <header class="border-border flex items-center justify-between gap-4 border-b px-6 py-4">
            <div class="min-w-0">
              <h2 class="text-fg text-lg font-bold">
                {{ rescheduleId ? 'إعادة جدولة' : 'حجز جديد' }}
              </h2>
              <p v-if="rescheduling" class="text-fg-subtle text-sm">اختر يوماً ووقتاً جديدين</p>
              <p v-else class="text-fg-subtle text-sm">العميل والخدمة، ثم اليوم، ثم الوقت</p>
            </div>
            <IconButton :icon="X" label="إغلاق" data-autofocus @click="emit('close')" />
          </header>

          <!-- three columns on a wide screen, one scroll on a phone -->
          <div
            class="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.75fr)] lg:overflow-hidden"
          >
            <!-- 1. who and what -->
            <div class="space-y-6 p-6 lg:overflow-y-auto">
              <!-- what is being moved, kept in view while the new time is picked -->
              <div v-if="rescheduling" data-current-booking>
                <p class="text-fg-muted mb-2 text-xs font-semibold">الموعد الحالي</p>
                <div class="border-border rounded-[var(--radius-lg)] border p-4">
                  <div class="flex items-center gap-3">
                    <span
                      class="bg-surface-sunken text-fg grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold"
                      aria-hidden="true"
                      >{{ initialOf(bookings.hydrate(rescheduling).customer?.name) }}</span
                    >
                    <div class="min-w-0">
                      <p class="text-fg truncate text-sm font-bold">
                        {{ bookings.hydrate(rescheduling).customer?.name }}
                      </p>
                      <p class="text-fg-subtle truncate text-xs">{{ service.name }}</p>
                    </div>
                  </div>
                  <p
                    class="text-fg-muted border-border mt-3 flex items-center gap-2 border-t pt-3 text-sm"
                  >
                    <CalendarClock class="text-fg-subtle h-4 w-4 shrink-0" aria-hidden="true" />
                    <span class="line-through decoration-1"
                      >{{ dayLabel(rescheduling.startAt) }}، {{ time(rescheduling.startAt) }}</span
                    >
                  </p>
                </div>
              </div>

              <fieldset v-if="!rescheduleId" class="space-y-3">
                <legend class="mb-3 flex items-center gap-2.5">
                  <span :class="stepClass(done.who)" aria-hidden="true">
                    <Check v-if="done.who" class="h-3.5 w-3.5" /><template v-else>1</template>
                  </span>
                  <span class="text-fg text-sm font-bold">العميل</span>
                </legend>
                <BaseInput
                  v-model="phone"
                  label="رقم الجوال"
                  type="tel"
                  :icon="Phone"
                  ltr
                  required
                  placeholder="05XXXXXXXX"
                  :error="phoneError"
                />
                <BaseInput
                  v-if="!matched"
                  v-model="name"
                  label="اسم العميل"
                  :icon="User"
                  required
                  :error="nameError"
                  placeholder="الاسم الكامل"
                />
                <!-- a number we know: the customer, not an empty field -->
                <div
                  v-else
                  class="border-border flex items-center gap-3 rounded-[var(--radius-lg)] border p-3"
                  data-known-customer
                >
                  <span
                    class="bg-primary-soft text-primary-fg grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold"
                    aria-hidden="true"
                    >{{ initialOf(matched.name) }}</span
                  >
                  <div class="min-w-0 flex-1">
                    <p class="text-fg truncate text-sm font-bold">{{ matched.name }}</p>
                    <p class="text-fg-subtle text-xs">
                      <template v-if="visits">{{ visits }} زيارات سابقة</template
                      ><template v-else>عميل مسجّل، أول زيارة</template>
                    </p>
                  </div>
                  <button
                    v-if="lastVisit && !usedLast"
                    type="button"
                    class="border-border text-fg hover:bg-surface-hover flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    :title="
                      lastVisit.resource
                        ? `${lastVisit.service} · ${lastVisit.resource}`
                        : lastVisit.service
                    "
                    data-last-visit
                    @click="useLast"
                  >
                    <History class="h-3.5 w-3.5" aria-hidden="true" /> مثل آخر مرة
                  </button>
                </div>
              </fieldset>

              <fieldset v-if="!rescheduleId">
                <legend class="mb-3 flex items-center gap-2.5">
                  <span :class="stepClass(done.what)" aria-hidden="true">
                    <Check v-if="done.what" class="h-3.5 w-3.5" /><template v-else>2</template>
                  </span>
                  <span class="text-fg text-sm font-bold">الخدمة</span>
                </legend>
                <div
                  class="border-border divide-border divide-y overflow-hidden rounded-[var(--radius-lg)] border"
                  role="radiogroup"
                  aria-label="الخدمة"
                >
                  <label
                    v-for="s in offeredServices"
                    :key="s.id"
                    class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
                    :class="serviceId === s.id ? 'bg-primary-soft/60' : 'hover:bg-surface-hover'"
                  >
                    <input v-model="serviceId" type="radio" :value="s.id" class="sr-only" />
                    <component
                      :is="s.icon"
                      class="h-[18px] w-[18px] shrink-0"
                      :class="serviceId === s.id ? 'text-primary-fg' : 'text-fg-subtle'"
                      aria-hidden="true"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="text-fg block truncate text-sm font-semibold">{{ s.name }}</span>
                      <span class="text-fg-subtle block text-xs">{{
                        duration(s.durationMin)
                      }}</span>
                    </span>
                    <span class="text-fg shrink-0 text-sm font-bold" data-numeric>{{
                      money(s.priceMinor)
                    }}</span>
                    <span
                      class="grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                      :class="
                        serviceId === s.id
                          ? 'border-primary bg-primary text-fg-on-primary'
                          : 'border-border'
                      "
                      aria-hidden="true"
                    >
                      <Check v-if="serviceId === s.id" class="h-3 w-3" />
                    </span>
                  </label>
                </div>
              </fieldset>

              <!-- with whom (also when moving: a move can change the person) -->
              <fieldset v-if="allowedResources.length > 1">
                <legend class="text-fg-muted mb-2 text-xs font-semibold">مع من؟</legend>
                <div class="flex flex-wrap gap-2">
                  <label
                    v-for="r in allowedResources"
                    :key="r.id"
                    class="flex cursor-pointer items-center gap-2 rounded-full border py-1 ps-1 pe-3.5 text-sm font-semibold transition-colors"
                    :class="
                      resourceId === r.id
                        ? 'border-primary bg-primary-soft text-primary-fg'
                        : 'border-border text-fg-muted hover:border-border-strong'
                    "
                  >
                    <input v-model="resourceId" type="radio" :value="r.id" class="sr-only" />
                    <span
                      class="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
                      :class="resourceId === r.id ? 'bg-surface' : 'bg-surface-sunken'"
                      aria-hidden="true"
                      >{{ initialOf(r.name) }}</span
                    >
                    {{ r.name }}
                  </label>
                </div>
              </fieldset>

              <!-- how long, when the service offers lengths -->
              <div v-if="lengths.length > 1">
                <p class="text-fg-muted mb-2 text-xs font-semibold">المدة</p>
                <div :class="SEGMENTED" role="group" aria-label="المدة">
                  <button
                    v-for="d in lengths"
                    :key="d"
                    type="button"
                    :class="segment(length === d)"
                    :aria-pressed="length === d"
                    @click="durationMin = d === service.durationMin ? null : d"
                  >
                    {{ duration(d) }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 2. the day -->
            <div class="border-border border-t p-6 lg:border-s lg:border-t-0">
              <p class="mb-3 flex items-center gap-2.5">
                <span :class="stepClass(true)" aria-hidden="true">
                  <Check class="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span class="text-fg text-sm font-bold">اليوم</span>
              </p>
              <MonthCalendar v-model="date" :free-on="freeOn" />
              <p
                v-if="skippedToday"
                class="bg-surface-sunken text-fg-muted mt-4 rounded-[var(--radius-md)] px-3 py-2 text-xs"
                data-skipped-today
              >
                لا أوقات متبقية اليوم، ففتحنا على أقرب يوم متاح.
              </p>
            </div>

            <!-- 3. the time -->
            <div
              class="border-border bg-canvas/40 border-t p-6 lg:overflow-y-auto lg:border-s lg:border-t-0"
            >
              <p class="mb-1 flex items-center gap-2.5">
                <span :class="stepClass(done.when)" aria-hidden="true">
                  <Check v-if="done.when" class="h-3.5 w-3.5" /><template v-else>{{
                    rescheduleId ? 2 : 3
                  }}</template>
                </span>
                <span class="text-fg text-sm font-bold">{{ dayLabel(date) }}</span>
              </p>
              <p class="text-fg-subtle mb-4 ps-8 text-xs" data-numeric>
                {{ freeCount ? `${freeCount} وقتاً متاحاً` : 'لا أوقات متاحة' }}
              </p>

              <TimeSlotGrid
                v-if="!slotGroups.length"
                :slots="[]"
                :model-value="startAt"
                @update:model-value="startAt = $event"
              />
              <div v-for="g in slotGroups" :key="g.key" class="mb-4">
                <p class="text-fg-subtle mb-2 text-[11px] font-semibold">{{ g.label }}</p>
                <TimeSlotGrid
                  layout="list"
                  :slots="g.slots"
                  :model-value="startAt"
                  @update:model-value="startAt = $event"
                />
              </div>
            </div>
          </div>

          <!-- payment, notes and repeating: there when asked for -->
          <div
            v-if="optionsOpen && !rescheduleId"
            class="border-border bg-canvas/40 grid gap-4 border-t px-6 py-4 sm:grid-cols-[1fr_1.4fr_1.2fr]"
            data-options
          >
            <div>
              <p class="text-fg-muted mb-2 text-xs font-semibold">حالة الدفع</p>
              <div :class="SEGMENTED" role="radiogroup" aria-label="حالة الدفع">
                <label
                  v-for="p in PAYMENTS"
                  :key="p.value"
                  :class="segment(paymentStatus === p.value)"
                >
                  <input v-model="paymentStatus" type="radio" :value="p.value" class="sr-only" />
                  {{ p.label }}
                </label>
              </div>
            </div>
            <BaseInput v-model="notes" label="ملاحظات" placeholder="مثلاً: يفضّل غرفة هادئة" />
            <div data-repeat>
              <label class="mb-2 flex cursor-pointer items-center gap-2">
                <input v-model="repeatWeekly" type="checkbox" class="accent-primary h-4 w-4" />
                <span class="text-fg text-xs font-semibold">كرّر أسبوعياً</span>
                <Repeat class="text-fg-subtle h-3.5 w-3.5" aria-hidden="true" />
              </label>
              <div v-if="repeatWeekly" class="flex flex-wrap items-center gap-2 text-sm">
                <span class="text-fg-muted">لمدة</span>
                <select
                  v-model.number="weeks"
                  class="border-border bg-surface text-fg h-8 rounded-[var(--radius-md)] border px-2"
                  aria-label="عدد الأسابيع"
                >
                  <option v-for="n in [2, 3, 4, 6, 8, 10, 12]" :key="n" :value="n">
                    {{ n }}
                  </option>
                </select>
                <span class="text-fg-muted">أسابيع</span>
              </div>
              <p v-else class="text-fg-subtle text-xs">نفس اليوم والوقت والمكان كل أسبوع.</p>
            </div>
          </div>

          <!-- the booking in one line, and the button -->
          <footer
            class="border-border flex flex-wrap items-center gap-x-4 gap-y-3 border-t px-6 py-4"
          >
            <div class="min-w-0 flex-1 basis-64" aria-live="polite" data-summary>
              <template v-if="startAt">
                <p class="text-fg flex items-center gap-2 text-sm font-bold">
                  <CalendarClock class="text-primary-fg h-4 w-4 shrink-0" aria-hidden="true" />
                  <span class="truncate">{{ dayLabel(startAt) }}، {{ time(startAt) }}</span>
                </p>
                <p class="text-fg-subtle truncate ps-6 text-xs">
                  {{ service.name }}<template v-if="resourceName"> · {{ resourceName }}</template
                  ><template v-if="repeatWeekly && !rescheduleId">
                    · كل أسبوع، {{ weeks }} أسابيع</template
                  ><template v-if="missing"> · {{ missing }}</template>
                </p>
              </template>
              <p v-else class="text-fg-subtle text-sm">{{ missing }}</p>
            </div>

            <button
              v-if="!rescheduleId"
              type="button"
              class="border-border text-fg-muted hover:bg-surface-hover hover:text-fg flex h-10 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-semibold"
              :class="optionsOpen && 'bg-surface-sunken text-fg'"
              :aria-expanded="optionsOpen"
              data-options-toggle
              @click="optionsOpen = !optionsOpen"
            >
              <SlidersHorizontal class="h-4 w-4" aria-hidden="true" />
              خيارات
              <span
                v-if="optionsSet"
                class="bg-primary text-fg-on-primary rounded-full px-1.5 text-[11px] leading-5"
                data-numeric
                >{{ optionsSet }}</span
              >
            </button>

            <div v-if="!rescheduleId" class="text-end leading-tight">
              <p class="text-fg-subtle text-[11px]">الإجمالي</p>
              <p class="text-fg font-display text-lg font-bold" data-numeric>
                {{ money(price * (repeatWeekly ? weeks : 1)) }}
              </p>
            </div>

            <div class="flex gap-2">
              <!-- a phone has the ✕ for this, and needs the room -->
              <span class="hidden sm:contents">
                <BaseButton variant="ghost" @click="emit('close')">إلغاء</BaseButton>
              </span>
              <BaseButton
                variant="primary"
                :loading="submitting"
                :disabled="!canSubmit"
                @click="submit"
              >
                {{ rescheduleId ? 'تأكيد الموعد الجديد' : 'إنشاء الحجز' }}
              </BaseButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
