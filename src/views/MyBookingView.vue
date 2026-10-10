<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { addDays, startOfDay } from 'date-fns'
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  CheckCheck,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  SearchX,
  Send,
  X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseInput from '@/components/ui/BaseInput.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import StoreHeader from '@/components/booking/StoreHeader.vue'
import BookingTicket from '@/components/booking/BookingTicket.vue'
import DayPicker from '@/components/booking/DayPicker.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { resourceById, serviceById } from '@/data/catalog'
import { business } from '@/data/business'
import { isConflict } from '@/data/errors'
import { isDemoBackend } from '@/data/repository'
import { useGuestBusiness } from '@/composables/useGuestBusiness'
import { inZone, nowInZone } from '@/lib/zone'
import { usePhoneCode } from '@/composables/usePhoneCode'
import CodeInput from '@/components/booking/CodeInput.vue'
import DemoCode from '@/components/booking/DemoCode.vue'
import {
  groupByPeriod,
  SEARCH_DAYS,
  useGuestAvailability,
} from '@/composables/useGuestAvailability'
import { canChange, CHANGE_CUTOFF_MIN } from '@/lib/bookingPolicy'
import { fromNow, fullDate, relativeDayTime, time } from '@/lib/format'
import { buildIcs, downloadIcs } from '@/lib/ics'
import { rememberGuest, rememberedGuest, samePhone } from '@/lib/guestIdentity'
import { digitsOnly, toLatinDigits } from '@/lib/digits'

/**
 * The customer's own booking: see it, keep it, move it, or let it go.
 *
 * No account. Against the API, ownership is proven one of three ways: the
 * secret in the link the confirmation gave (`?t=`), a phone this device
 * already verified by code, or a code sent now to the phone typed in. The
 * reference and a phone number on their own prove nothing — neither is a
 * secret. Moving the appointment is the main
 * action on purpose: someone who can no longer make it should change the time
 * rather than not turn up.
 */
const route = useRoute()
const bookings = useBookingsStore()
const customers = useCustomersStore()
const settings = useSettingsStore()
const { slug, bookPath, managePath } = useGuestBusiness()
const avail = useGuestAvailability()
const busyState = avail.busyState

const reference = computed(() => String(route.params.reference ?? ''))
const phone = ref('')
// Arabic-keyboard digits become Latin as they are typed: what the page
// shows is what the server stores.
watch(phone, (v) => {
  const latin = toLatinDigits(v)
  if (latin !== v) phone.value = latin
})
const verified = ref(false)
const attempted = ref(false)
const checking = ref(false)
const ready = ref(false)

/**
 * Two backends, one shape. On the demo backend the booking is in the store
 * and the phone is checked here. Against the API the reference and phone go
 * to the server, which answers with this one booking or nothing — a guest
 * never sees the booking list.
 */
const remote = ref(null)
const local = computed(() =>
  isDemoBackend ? (bookings.items.find((b) => b.reference === reference.value) ?? null) : null,
)

const view = computed(() => {
  if (isDemoBackend) {
    const b = local.value
    if (!b) return null
    const h = bookings.hydrate(b)
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      acknowledgedAt: b.acknowledgedAt,
      durationMin: b.durationMin ?? null,
      startAt: b.startAt,
      endAt: b.endAt,
      priceMinor: b.priceMinor,
      serviceId: b.serviceId,
      resourceId: b.resourceId,
      serviceName: h.service?.name ?? '',
      resourceName: h.resource?.name ?? null,
      customerName: h.customer?.name ?? '',
      phone: h.customer?.phone ?? '',
    }
  }
  return remote.value
})

const exists = computed(() => !isDemoBackend || !!local.value)
const upcoming = computed(() => !!view.value && new Date(view.value.startAt) > new Date())
const changeable = computed(() => canChange(view.value))

/* ---------------------------------------------------------- ownership */
function phoneMatches(entered) {
  const digits = digitsOnly(entered)
  const stored = digitsOnly(view.value?.phone)
  return digits.length >= 9 && stored.endsWith(digits.slice(-9))
}

/** What the API accepted as proof, reused to move or cancel. */
const proof = ref(null)
const linkToken = computed(() => (typeof route.query.t === 'string' ? route.query.t : null))

/** Opens the booking with this proof; false when the server says no. */
async function open(p, quiet) {
  try {
    const { lookupBooking } = await import('@/data/api/public')
    remote.value = await lookupBooking(reference.value, p)
    proof.value = p
    verified.value = true
    return true
  } catch {
    // One message for "no such reference" and "not yours", deliberately:
    // telling them apart would let anyone discover which references exist.
    if (!quiet) toast.error('رقم الجوال لا يطابق هذا الحجز')
    return false
  }
}

/* A code to the phone typed in, when this device has not verified it. */
const code = usePhoneCode()
const askingCode = ref(false)
const codeError = ref(false)
const codeBox = ref(null)

async function verify(entered = phone.value, quiet = false) {
  attempted.value = !quiet
  checking.value = true
  try {
    if (isDemoBackend) {
      if (!phoneMatches(entered)) {
        if (!quiet) toast.error('رقم الجوال لا يطابق هذا الحجز')
        return
      }
      phone.value = entered
      verified.value = true
      rememberGuest(view.value?.customerName ?? '', entered)
      return
    }
    const known = rememberedGuest()
    if (known?.token && samePhone(known.phone, entered)) {
      phone.value = entered
      if (await open({ phone: entered, verificationToken: known.token }, quiet)) return
      if (quiet) return
    }
    if (quiet) return
    phone.value = entered
    codeError.value = false
    askingCode.value = await code.send(entered)
  } finally {
    checking.value = false
  }
}

async function onCode(entered) {
  const token = await code.verify(phone.value, entered).catch(() => null)
  if (!token) {
    codeError.value = true
    codeBox.value?.clear()
    return
  }
  rememberGuest(rememberedGuest()?.name ?? '', phone.value, token)
  askingCode.value = false
  checking.value = true
  await open({ phone: phone.value, verificationToken: token }, false)
  checking.value = false
}

onMounted(async () => {
  await settings.load(!isDemoBackend && !!slug.value)
  if (isDemoBackend) await Promise.all([bookings.load(), customers.load()])
  if (!isDemoBackend && linkToken.value) {
    // The link from the confirmation: proof on its own.
    await open({ token: linkToken.value }, true)
  }
  // A device that has booked before already proved its phone.
  const known = rememberedGuest()
  if (!verified.value && known && exists.value) await verify(known.phone, true)
  ready.value = true
})

/* ---------------------------------------------------------- status */
const STATE = computed(() => {
  const v = view.value
  if (!v) return null
  if (v.status === 'cancelled')
    return { tone: 'muted', icon: X, title: 'أُلغي هذا الحجز', line: 'الوقت عاد متاحاً لغيرك.' }
  if (!upcoming.value || v.status === 'completed' || v.status === 'no_show')
    return {
      tone: 'muted',
      icon: Check,
      title: 'انتهى هذا الموعد',
      line: 'نتمنى أن تكون الزيارة أعجبتك.',
    }
  if (v.status === 'confirmed')
    return {
      tone: 'success',
      icon: Check,
      title: 'موعدك مؤكد',
      line: `${relativeDayTime(v.startAt)} · ${fromNow(v.startAt)}`,
    }
  return {
    tone: 'warning',
    icon: Clock,
    title: 'بانتظار التأكيد',
    line: `${relativeDayTime(v.startAt)} · ستصلك رسالة قبل الموعد لتأكيد حضورك.`,
  }
})

/**
 * Did it reach them? The commonest complaint about booking apps here is a
 * confirmation the venue never saw, so the page says plainly which it is.
 * Only `null` means unseen; older bookings without the field were seen.
 */
const RECEIPT = computed(() => {
  const v = view.value
  if (!v || !upcoming.value || !['pending', 'confirmed'].includes(v.status)) return null
  return v.acknowledgedAt === null
    ? { seen: false, text: `أُرسل إلى ${business.name}. تظهر هنا علامة الاستلام فور اطلاعهم عليه.` }
    : { seen: true, text: `وصل حجزك إلى ${business.name}` }
})

/* ---------------------------------------------------------- keep it */
const manageUrl = computed(
  () => `${window.location.origin}${managePath(reference.value, linkToken.value)}`,
)

function addToCalendar() {
  const v = view.value
  if (!v) return
  downloadIcs(
    `${v.reference}.ics`,
    buildIcs({
      uid: `${v.reference}@waeda.app`,
      title: `${v.serviceName} · ${business.name}`,
      start: v.startAt,
      end: v.endAt,
      location: business.address,
      description: `رقم الحجز ${v.reference}\n${manageUrl.value}`,
    }),
  )
}

const shareUrl = computed(() => {
  const v = view.value
  if (!v) return '#'
  const msg = `موعدي في ${business.name}\n${v.serviceName}\n${fullDate(v.startAt)} الساعة ${time(v.startAt)}\nرقم الحجز: ${v.reference}\n${manageUrl.value}`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
})

/* ---------------------------------------------------------- move it */
const moving = ref(false)
const newDate = ref(startOfDay(nowInZone()))
const newStart = ref(null)
const saving = ref(false)

const service = computed(() => (view.value ? serviceById(view.value.serviceId) : null))
/** Same person as before; the customer chose them, or was given them. */
const resource = computed(() =>
  view.value
    ? (resourceById(view.value.resourceId) ?? {
        id: view.value.resourceId,
        name: view.value.resourceName,
      })
    : null,
)
const query = computed(() => ({
  service: service.value,
  resources: resource.value ? [resource.value] : [],
  excludeBookingId: view.value?.id,
  // A booking moves with its own length: a 90-minute court stays 90.
  durationMin: view.value?.durationMin ?? null,
}))
/** Times this booking can move to on a day: free, past the cutoff, not where it is. */
const movableOn = (day) =>
  avail
    .slotsOn(day, query.value)
    // Not offered: the cutoff applies to the new time as much as the old.
    .filter((s) => new Date(s.startAt).getTime() - Date.now() > CHANGE_CUTOFF_MIN * 60000)
    .filter((s) => s.startAt !== view.value?.startAt)
const slots = computed(() => movableOn(newDate.value))
const grouped = computed(() => groupByPeriod(slots.value))
const freeCount = (day) => {
  const n = avail.freeCount(day, query.value)
  return n < 0 ? n : movableOn(day).filter((s) => s.state === 'available').length
}

watch(newDate, () => (newStart.value = null))

async function openMove() {
  moving.value = true
  newStart.value = null
  await avail.loadBusy(query.value.resources)
  // Open on the first day that has a time the customer can actually pick —
  // "nearest free" can be within the cutoff, which would open on an empty day.
  newDate.value = startOfDay(inZone(view.value.startAt))
  for (let i = 0; i < SEARCH_DAYS; i++) {
    const day = addDays(startOfDay(nowInZone()), i)
    if (movableOn(day).some((x) => x.state === 'available')) {
      newDate.value = day
      break
    }
  }
  await nextTick()
  document.getElementById('move')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function saveMove() {
  const v = view.value
  if (!v || !newStart.value) return
  saving.value = true
  try {
    if (isDemoBackend) {
      if (bookings.move(v.id, { startAt: newStart.value }, { byGuest: true }) !== true)
        throw { status: 409 }
    } else {
      const { rescheduleBooking } = await import('@/data/api/public')
      const moved = await rescheduleBooking(v.reference, proof.value, newStart.value)
      remote.value = {
        ...remote.value,
        startAt: moved.startAt,
        endAt: moved.endAt,
        acknowledgedAt: null,
      }
    }
    moving.value = false
    toast.success(`نُقل موعدك إلى ${relativeDayTime(newStart.value)}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e) {
    if (e?.status === 409 || isConflict(e)) {
      toast.error('هذا الوقت حُجز قبل لحظات. اختر وقتاً آخر.')
      newStart.value = null
      avail.loadBusy(query.value.resources)
    } else {
      toast.error('تعذّر تعديل الموعد. حاول مرة أخرى.')
    }
  } finally {
    saving.value = false
  }
}

/* ---------------------------------------------------------- let it go */
const askCancel = ref(false)
const cancelling = ref(false)

async function cancel() {
  const v = view.value
  if (!v) return
  cancelling.value = true
  try {
    if (isDemoBackend) {
      bookings.setStatus(v.id, 'cancelled')
    } else {
      const { cancelBooking } = await import('@/data/api/public')
      await cancelBooking(v.reference, proof.value)
      remote.value = { ...remote.value, status: 'cancelled' }
    }
    askCancel.value = false
    moving.value = false
    toast.success('أُلغي حجزك')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch {
    toast.error('تعذّر إلغاء الحجز. حاول مرة أخرى.')
  } finally {
    cancelling.value = false
  }
}

function moveInstead() {
  askCancel.value = false
  openMove()
}
</script>

<template>
  <div class="bg-canvas min-h-screen">
    <StoreHeader />

    <main class="mx-auto max-w-lg px-4 py-8 sm:py-12">
      <!-- loading -->
      <div v-if="!ready" class="border-border bg-surface rounded-[var(--radius-xl)] border p-5">
        <SkeletonBlock variant="text" :count="4" />
      </div>

      <!-- no such booking (demo only: the API never says which) -->
      <div
        v-else-if="!exists"
        class="border-border bg-surface rounded-[var(--radius-xl)] border p-8 text-center"
      >
        <SearchX class="text-fg-faint mx-auto mb-3 h-10 w-10" aria-hidden="true" />
        <h1 class="font-display text-fg mb-2 text-xl font-bold">لم نجد هذا الحجز</h1>
        <p class="text-fg-muted mb-6 text-sm">
          لا يوجد حجز بالرقم <span dir="ltr" class="font-semibold">{{ reference }}</span
          >. تأكد من الرقم كما وصلك في رسالة التأكيد.
        </p>
        <RouterLink
          :to="bookPath"
          class="btn-brand inline-flex rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-bold"
          >احجز موعداً</RouterLink
        >
      </div>

      <!-- prove it is yours -->
      <div
        v-else-if="!verified"
        class="border-border bg-surface rounded-[var(--radius-xl)] border p-6 sm:p-8"
      >
        <h1 class="font-display text-fg mb-1 text-xl font-bold">حجزك رقم</h1>
        <p class="text-fg mb-4 text-lg font-bold" dir="ltr" data-numeric>{{ reference }}</p>
        <p class="text-fg-muted mb-6 text-sm leading-relaxed">
          أدخل رقم الجوال الذي حجزت به لعرض الحجز وإدارته.
        </p>
        <div v-if="askingCode" class="space-y-3 text-center">
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
            <button v-else type="button" class="text-fg font-semibold underline" @click="verify()">
              أعد إرسال الرمز
            </button>
          </div>
        </div>
        <form v-else class="space-y-4" @submit.prevent="verify()">
          <BaseInput
            v-model="phone"
            label="رقم الجوال"
            type="tel"
            :icon="Phone"
            ltr
            required
            placeholder="05XXXXXXXX"
            :error="attempted && !verified && !checking ? 'الرقم لا يطابق هذا الحجز' : undefined"
          />
          <button
            type="submit"
            class="btn-brand w-full rounded-[var(--radius-md)] py-3 text-sm font-bold"
            :disabled="checking"
          >
            عرض الحجز
          </button>
        </form>
      </div>

      <!-- the booking -->
      <div v-else-if="view" class="space-y-5">
        <!-- status -->
        <div class="flex items-start gap-3.5">
          <span
            class="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            :class="{
              'bg-success-600 text-white': STATE.tone === 'success',
              'bg-warning-50 text-warning-700': STATE.tone === 'warning',
              'bg-surface-sunken text-fg-subtle': STATE.tone === 'muted',
            }"
          >
            <component :is="STATE.icon" class="h-5 w-5" stroke-width="2.5" aria-hidden="true" />
          </span>
          <div>
            <h1 class="font-display text-fg text-xl font-bold">{{ STATE.title }}</h1>
            <p class="text-fg-muted mt-0.5 text-sm" data-numeric>{{ STATE.line }}</p>
            <p
              v-if="RECEIPT"
              class="mt-2 flex items-start gap-1.5 text-xs leading-5 font-semibold"
              :class="RECEIPT.seen ? 'text-success-700' : 'text-fg-subtle'"
              data-receipt
            >
              <CheckCheck v-if="RECEIPT.seen" class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <Send v-else class="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {{ RECEIPT.text }}
            </p>
          </div>
        </div>

        <BookingTicket
          :service-name="view.serviceName"
          :resource-name="view.resourceName"
          :start-at="view.startAt"
          :reference="view.reference"
          :price-minor="view.priceMinor"
          :muted="view.status === 'cancelled'"
        />

        <!-- keep it -->
        <div v-if="upcoming && view.status !== 'cancelled'" class="grid grid-cols-3 gap-2">
          <button
            type="button"
            class="border-border bg-surface text-fg hover:bg-surface-hover flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border py-3 text-xs font-semibold"
            @click="addToCalendar"
          >
            <CalendarPlus class="h-5 w-5" aria-hidden="true" /> أضف لتقويمك
          </button>
          <a
            :href="business.mapsUrl"
            target="_blank"
            rel="noopener"
            class="border-border bg-surface text-fg hover:bg-surface-hover flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border py-3 text-xs font-semibold"
          >
            <MapPin class="h-5 w-5" aria-hidden="true" /> الاتجاهات
          </a>
          <a
            :href="shareUrl"
            target="_blank"
            rel="noopener"
            class="border-border bg-surface text-fg hover:bg-surface-hover flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border py-3 text-xs font-semibold"
          >
            <MessageCircle class="h-5 w-5" aria-hidden="true" /> شارك
          </a>
        </div>

        <!-- change it -->
        <template v-if="changeable">
          <button
            v-if="!moving"
            type="button"
            class="btn-brand flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
            @click="openMove"
          >
            <CalendarClock class="h-4 w-4" aria-hidden="true" /> تعديل الموعد
          </button>

          <section
            v-else
            id="move"
            class="border-border bg-surface scroll-mt-4 space-y-5 rounded-[var(--radius-xl)] border p-5"
            aria-labelledby="move-h"
          >
            <div class="flex items-center justify-between">
              <h2 id="move-h" class="text-fg font-bold">اختر موعداً جديداً</h2>
              <button
                type="button"
                class="text-fg-subtle hover:text-fg text-sm"
                @click="moving = false"
              >
                إغلاق
              </button>
            </div>
            <p class="text-fg-subtle -mt-3 text-[13px]">
              نفس الخدمة<template v-if="view.resourceName"> مع {{ view.resourceName }}</template
              >.
            </p>

            <DayPicker v-model="newDate" :free-on="freeCount" :weeks="4" />

            <div>
              <!-- Until the taken times are known every time would look free. -->
              <div
                v-if="busyState === 'loading'"
                class="grid grid-cols-3 gap-2 sm:grid-cols-4"
                aria-busy="true"
                aria-label="جاري تحميل الأوقات"
              >
                <span
                  v-for="n in 8"
                  :key="n"
                  class="bg-surface-sunken h-11 animate-pulse rounded-[var(--radius-md)]"
                />
              </div>
              <div
                v-else-if="busyState === 'failed'"
                role="alert"
                class="border-warning-100 bg-warning-50 text-warning-700 rounded-[var(--radius-md)] border px-4 py-4 text-center text-sm"
              >
                تعذّر التحقق من الأوقات المحجوزة، فلم نعرضها حتى لا تختار وقتاً محجوزاً.
                <button
                  type="button"
                  class="font-semibold underline"
                  @click="avail.loadBusy(query.resources)"
                >
                  إعادة المحاولة
                </button>
              </div>
              <p
                v-else-if="!slots.length"
                class="bg-surface-sunken text-fg-subtle rounded-[var(--radius-md)] px-4 py-6 text-center text-sm"
              >
                لا أوقات متاحة في هذا اليوم. اختر يوماً آخر.
              </p>
              <div v-else class="space-y-4">
                <div v-for="g in grouped" :key="g.key">
                  <p class="text-fg-subtle mb-2 text-xs">{{ g.label }}</p>
                  <div
                    role="radiogroup"
                    :aria-label="`أوقات ${g.label}`"
                    class="grid grid-cols-3 gap-2 sm:grid-cols-4"
                  >
                    <button
                      v-for="s in g.slots"
                      :key="s.startAt"
                      type="button"
                      role="radio"
                      :aria-checked="newStart === s.startAt"
                      :disabled="s.state !== 'available'"
                      class="h-10 rounded-[var(--radius-md)] border text-sm font-semibold transition-colors"
                      :class="
                        newStart === s.startAt
                          ? 'border-primary bg-primary text-white'
                          : s.state === 'available'
                            ? 'border-border text-fg hover:border-fg'
                            : 'text-fg-faint cursor-not-allowed border-transparent line-through'
                      "
                      data-numeric
                      @click="newStart = s.startAt"
                    >
                      {{ s.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- from → to -->
            <div
              v-if="newStart"
              class="bg-surface-sunken flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-4 py-3 text-sm"
            >
              <span class="text-fg-subtle line-through" data-numeric>{{
                relativeDayTime(view.startAt)
              }}</span>
              <ArrowLeft class="text-fg-faint h-4 w-4 shrink-0 ltr:rotate-180" aria-hidden="true" />
              <span class="text-fg font-bold" data-numeric>{{ relativeDayTime(newStart) }}</span>
            </div>

            <button
              type="button"
              class="w-full rounded-[var(--radius-md)] py-3 text-sm font-bold transition-colors"
              :class="newStart ? 'btn-brand' : 'bg-surface-sunken text-fg-faint cursor-not-allowed'"
              :disabled="!newStart || saving"
              @click="saveMove"
            >
              {{ saving ? 'جاري الحفظ…' : 'تأكيد الموعد الجديد' }}
            </button>
          </section>

          <button
            type="button"
            class="text-fg-subtle hover:text-danger-700 mx-auto flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            @click="askCancel = true"
          >
            <CalendarX2 class="h-4 w-4" aria-hidden="true" /> إلغاء الحجز
          </button>
        </template>

        <p
          v-else-if="upcoming && view.status !== 'cancelled'"
          class="bg-surface-sunken text-fg-muted rounded-[var(--radius-md)] px-4 py-3 text-center text-sm"
        >
          باقي أقل من ساعتين على موعدك. للتعديل أو الإلغاء الآن تواصل مع {{ business.name }}.
        </p>

        <RouterLink
          v-if="view.status === 'cancelled' || !upcoming"
          :to="bookPath"
          class="btn-brand flex items-center justify-center rounded-[var(--radius-md)] py-3 text-sm font-bold"
        >
          احجز موعداً جديداً
        </RouterLink>
      </div>
    </main>

    <!-- cancel: offer the move first -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="askCancel"
          class="bg-overlay fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          @mousedown.self="askCancel = false"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-h"
            class="bg-surface elev-modal animate-pop-in w-full max-w-md rounded-t-[var(--radius-xl)] p-6 sm:rounded-[var(--radius-xl)]"
          >
            <h2 id="cancel-h" class="font-display text-fg mb-2 text-lg font-bold">
              تريد إلغاء موعدك؟
            </h2>
            <p class="text-fg-muted mb-6 text-sm leading-relaxed">
              إذا كان الوقت فقط لا يناسبك، تقدر تنقل الموعد ليوم آخر بدل إلغائه.
            </p>
            <div class="space-y-2">
              <button
                type="button"
                class="btn-brand w-full rounded-[var(--radius-md)] py-3 text-sm font-bold"
                @click="moveInstead"
              >
                تعديل الموعد بدلاً من ذلك
              </button>
              <button
                type="button"
                class="border-border text-danger-700 hover:bg-danger-50 w-full rounded-[var(--radius-md)] border py-3 text-sm font-bold"
                :disabled="cancelling"
                @click="cancel"
              >
                {{ cancelling ? 'جاري الإلغاء…' : 'نعم، ألغِ الحجز' }}
              </button>
              <button
                type="button"
                class="text-fg-subtle hover:text-fg w-full py-2 text-sm"
                @click="askCancel = false"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
