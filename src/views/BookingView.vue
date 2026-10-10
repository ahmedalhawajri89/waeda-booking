<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { ar } from 'date-fns/locale'
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseInput from '@/components/ui/BaseInput.vue'
import DayPicker from '@/components/booking/DayPicker.vue'
import CodeInput from '@/components/booking/CodeInput.vue'
import DemoCode from '@/components/booking/DemoCode.vue'
import WaitlistJoin from '@/components/booking/WaitlistJoin.vue'
import StoreHeader from '@/components/booking/StoreHeader.vue'
import BookingTicket from '@/components/booking/BookingTicket.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { bookableResources, bookableServices, schedule, services } from '@/data/catalog'
import { durationsOf, priceFor } from '@/lib/pricing'
import { windowFor } from '@/lib/hours'
import { isGroup } from '@/lib/sessions'
import { business, initialOf } from '@/data/business'
import { isConflict } from '@/data/errors'
import { isDemoBackend } from '@/data/repository'
import { useGuestBusiness } from '@/composables/useGuestBusiness'
import { inZone, nowInZone } from '@/lib/zone'
import { usePhoneCode } from '@/composables/usePhoneCode'
import { groupByPeriod, useGuestAvailability } from '@/composables/useGuestAvailability'
import { duration, fullDate, money, time } from '@/lib/format'
import { buildIcs, downloadIcs } from '@/lib/ics'
import { forgetGuest, rememberGuest, rememberedGuest, samePhone } from '@/lib/guestIdentity'
import { digitsOnly, toLatinDigits } from '@/lib/digits'

/**
 * The guest booking page: one page, no account.
 *
 * Everything the customer chooses is on screen at once and fills in from the
 * top — service, who, when, then their details — with a summary that stays in
 * view (beside the form on a desktop, as a bar along the bottom on a phone).
 *
 * Identity is the phone number. The first time a phone is used it is proven
 * with a four-digit code; after that this device remembers the customer and
 * the next booking skips straight to confirming. Nobody makes a password.
 *
 * A refresh keeps progress (the draft), and the confirmation hands over the
 * reference, a calendar file, a WhatsApp share and the link to manage it.
 */
const bookings = useBookingsStore()
const customers = useCustomersStore()
const settings = useSettingsStore()
const { slug, managePath } = useGuestBusiness()

const DRAFT_KEY = 'bookingpro:draft:v1'
const ANY = 'any'

/* ------------------------------------------------------------------ state */
const serviceId = ref(null)
const who = ref(ANY)
// Days are the business's days (lib/zone), not the visitor's.
const date = ref(startOfDay(nowInZone()))
const startAt = ref(null)
const name = ref('')
const phone = ref('')
// Arabic-keyboard digits become Latin as they are typed: what the page
// shows is what the server stores.
watch(phone, (v) => {
  const latin = toLatinDigits(v)
  if (latin !== v) phone.value = latin
})
const notes = ref('')
const touched = ref(false)

/** 'form' → 'verify' (first time on this phone) → 'done' */
const stage = ref('form')
const submitting = ref(false)
/** The chosen time went to someone else while the guest was finishing: said where the times are, until they pick again. */
const slotTaken = ref(false)
/** Booking failed for another reason (offline, server): said beside the button, which retries. */
const bookError = ref('')
const reference = ref(null)
/** The secret in the manage link; the API's only. */
const manageToken = ref(null)
const booked = ref(null)

const returning = ref(rememberedGuest())

const offered = computed(() => bookableServices())
const service = computed(() => services.find((s) => s.id === serviceId.value) ?? null)
const allPeople = computed(() => bookableResources(service.value))

/**
 * Seen by a woman, or by a man. Many customers choose, and a women's salon
 * is staffed by women; offered only when the service has both, so a
 * one-gender team never shows a filter that changes nothing.
 */
const gender = ref('any')
const mixed = computed(() => new Set(allPeople.value.map((p) => p.gender).filter(Boolean)).size > 1)
const people = computed(() =>
  gender.value === 'any' || !mixed.value
    ? allPeople.value
    : allPeople.value.filter((p) => p.gender === gender.value),
)
watch(people, (list) => {
  if (who.value !== ANY && !list.some((p) => p.id === who.value)) who.value = ANY
})
/**
 * A court or a room is booked, not a person: when every option is a place,
 * the page asks "which court?" instead of "with whom?".
 */
const placesOnly = computed(
  () => allPeople.value.length > 0 && allPeople.value.every((p) => p.kind === 'place'),
)
const placeWord = computed(() =>
  /ملاعب|رياض|بادل/.test(business.category ?? '') ? 'ملعب' : 'مكان',
)
const whoLabel = computed(() => (placesOnly.value ? `أي ${placeWord.value}؟` : 'مع من؟'))
const anyLabel = computed(() => (placesOnly.value ? `أول ${placeWord.value} متاح` : 'أي متاح'))

/* ------------------------------------------------------------- length */
/** A length the service offers (60, 90, 120 on a court); null is its default. */
const durationMin = ref(null)
const durations = computed(() => durationsOf(service.value))
const length = computed(() => durationMin.value ?? service.value?.durationMin ?? 0)

const GENDERS = [
  { value: 'any', label: 'الكل' },
  { value: 'female', label: 'مختصات' },
  { value: 'male', label: 'مختصون' },
]

/** Services the way the business sells them: by category, then by name. */
const categories = computed(() => [...new Set(offered.value.map((s) => s.category ?? 'الخدمات'))])
const catFilter = ref('all')
const serviceGroups = computed(() =>
  categories.value
    .filter((c) => catFilter.value === 'all' || c === catFilter.value)
    .map((c) => ({ name: c, items: offered.value.filter((s) => (s.category ?? 'الخدمات') === c) })),
)
const providersOf = (s) => bookableResources(s)

/** The resources a slot may be taken on: the chosen one, or all of them. */
const candidates = computed(() =>
  who.value === ANY ? people.value : people.value.filter((r) => r.id === who.value),
)

/* --------------------------------------------------------- availability */
const avail = useGuestAvailability()
const query = computed(() => ({
  service: service.value,
  resources: candidates.value,
  durationMin: durationMin.value,
}))
const slots = computed(() => avail.slotsOn(date.value, query.value))
const freeCount = (day) => avail.freeCount(day, query.value)
const loadBusy = () => avail.loadBusy(allPeople.value)
const busyState = avail.busyState
/** Why a day shows no times: closed, its hours already over, or all taken. */
const emptyDay = computed(() => {
  const w = windowFor(date.value, schedule)
  if (!w) return 'لا يوجد دوام في هذا اليوم. اختر يوماً آخر.'
  if (w.close <= new Date()) return 'انتهت أوقات هذا اليوم. اختر يوماً آخر.'
  return 'كل الأوقات في هذا اليوم محجوزة. اختر يوماً آخر، أو اطلب أن ننبّهك إذا تفرّغ وقت.'
})
const grouped = computed(() => groupByPeriod(slots.value))
const dayIsFull = computed(
  () => slots.value.length > 0 && !slots.value.some((s) => s.state === 'available'),
)

/* -------------------------------------------------------------- classes */
/**
 * A class is booked by session, not by free time: Sunday 18:30 with Hind,
 * eight seats left. Each seat is an ordinary booking underneath.
 */
const group = computed(() => isGroup(service.value))
const sessionResource = ref(null)
const sessionList = computed(() =>
  group.value ? avail.sessionsFor(service.value, allPeople.value) : [],
)
const sessionDays = computed(() => {
  const days = new Map()
  for (const s of sessionList.value) {
    const key = format(inZone(s.startAt), 'yyyy-MM-dd')
    if (!days.has(key)) days.set(key, { key, label: fullDate(s.startAt), items: [] })
    days.get(key).items.push(s)
  }
  return [...days.values()]
})
function pickSession(s) {
  sessionResource.value = s.resourceId
  startAt.value = s.startAt
}
// Full is full; taken by something else at that hour is just not available.
const seatsLine = (s) =>
  s.blocked
    ? 'غير متاحة'
    : s.left === 0
      ? 'ممتلئة'
      : s.left === 1
        ? 'بقي مقعد واحد'
        : s.left <= 3
          ? `بقي ${s.left} مقاعد`
          : `${s.left} مقعداً متاحاً`
const nameOf = (id) => allPeople.value.find((r) => r.id === id)?.name ?? ''

const chosenSlot = computed(() => slots.value.find((s) => s.startAt === startAt.value) ?? null)
const resourceId = computed(() =>
  group.value
    ? startAt.value
      ? sessionResource.value
      : null
    : who.value !== ANY
      ? who.value
      : (chosenSlot.value?.resourceId ?? null),
)
const resourceName = computed(
  () => allPeople.value.find((r) => r.id === resourceId.value)?.name ?? null,
)

/**
 * The price of what is chosen: the time's (peak or not) for the length
 * chosen. Before a time is picked, the off-peak price for the length.
 */
const price = computed(() =>
  service.value
    ? startAt.value
      ? priceFor(service.value, startAt.value, durationMin.value, schedule)
      : Math.round((service.value.priceMinor * length.value) / service.value.durationMin)
    : 0,
)
/** Worth showing under each time only when times differ in price. */
const pricedTimes = computed(
  () => !!service.value?.peakFrom && service.value.peakPriceMinor != null,
)

/** The soonest free time from now, for the customer who only wants "soon". */
const nearest = computed(() => avail.nearest(query.value))

function takeNearest() {
  if (!nearest.value) return
  date.value = nearest.value.day
  nextTick(() => {
    startAt.value = nearest.value?.slot.startAt ?? null
    scrollTo('details')
  })
}

/* ------------------------------------------------------------- details */
const phoneError = computed(() => {
  if (!touched.value) return undefined
  const digits = digitsOnly(phone.value)
  if (!digits) return 'رقم الجوال مطلوب'
  if (digits.length < 9) return 'رقم الجوال غير مكتمل'
  return undefined
})
const nameError = computed(() => (touched.value && !name.value.trim() ? 'الاسم مطلوب' : undefined))

const done = computed(() => ({
  service: !!service.value,
  when: !!startAt.value && !!resourceId.value,
  details: !!name.value.trim() && digitsOnly(phone.value).length >= 9,
}))
const ready = computed(() => done.value.service && done.value.when && done.value.details)

/** What the one button on the page should do next. */
const nextAction = computed(() => {
  if (!done.value.service) return { label: 'اختر الخدمة', target: 'service' }
  if (!done.value.when) return { label: 'اختر الموعد', target: 'when' }
  if (!done.value.details) return { label: 'أكمل بياناتك', target: 'details' }
  return { label: 'تأكيد الحجز', target: null }
})

function scrollTo(id) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function notMe() {
  forgetGuest()
  returning.value = null
  name.value = ''
  phone.value = ''
}

/* ------------------------------------------------------------- draft */
function saveDraft() {
  if (stage.value === 'done') return
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        serviceId: serviceId.value,
        who: who.value,
        durationMin: durationMin.value,
        date: date.value.toISOString(),
        startAt: startAt.value,
        name: name.value,
        phone: phone.value,
        notes: notes.value,
      }),
    )
  } catch {
    /* ignore */
  }
}

// A new service, person or day voids the chosen time — but not while a draft
// is being restored, when all of them arrive together and belong together.
let restoring = false
watch([serviceId, who, date, durationMin], () => {
  if (!restoring) startAt.value = null
})
watch(serviceId, async () => {
  if (!restoring) {
    who.value = ANY
    durationMin.value = null
    sessionResource.value = null
  }
  if (group.value) await avail.loadSeats(service.value)
  await loadBusy()
  // Land on a day that has something to offer rather than an empty today.
  if (!restoring && !slots.value.some((x) => x.state === 'available') && nearest.value)
    date.value = nearest.value.day
})
watch([serviceId, who, date, durationMin, startAt, name, phone, notes], saveDraft)
// A new time chosen: the notice that the last one was taken has done its job.
watch(startAt, (v) => {
  if (v) slotTaken.value = false
})

onMounted(async () => {
  await settings.load(!isDemoBackend && !!slug.value)
  if (isDemoBackend) await Promise.all([bookings.load(), customers.load()])

  if (returning.value) {
    name.value = returning.value.name
    phone.value = returning.value.phone
  }

  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const d = raw ? JSON.parse(raw) : null
    if (d?.serviceId && offered.value.some((s) => s.id === d.serviceId)) {
      restoring = true
      serviceId.value = d.serviceId
      who.value = d.who ?? ANY
      durationMin.value = d.durationMin ?? null
      date.value = startOfDay(inZone(d.date))
      startAt.value = d.startAt ?? null
      name.value = d.name || name.value
      phone.value = d.phone || phone.value
      notes.value = d.notes ?? ''
      if (d.startAt) toast.info('استأنفنا حجزك من حيث توقفت')
      await nextTick()
      restoring = false
    }
  } catch {
    restoring = false
  }
  if (!serviceId.value && offered.value.length === 1) serviceId.value = offered.value[0].id
})

/* ------------------------------------------------------- verify + book */
/**
 * The code to the phone, then a token for it that this device keeps — the
 * server will not book under a phone without one. See usePhoneCode.
 */
const code = usePhoneCode()
const resendIn = code.resendIn
const codeError = ref(false)
const codeBox = ref(null)

function sendCode() {
  codeError.value = false
  return code.send(phone.value.trim())
}

async function confirm() {
  touched.value = true
  if (!ready.value) {
    if (nextAction.value.target) scrollTo(nextAction.value.target)
    return
  }
  // A device that proved this phone before books straight away.
  const known =
    returning.value &&
    samePhone(returning.value.phone, phone.value) &&
    (isDemoBackend || returning.value.token)
  if (known) return book()
  askForCode()
}

/** Back from the code step to the phone field, to fix a mistyped number. */
async function editPhone() {
  stage.value = 'form'
  await nextTick()
  scrollTo('details')
  document.querySelector('#sec-details input[type="tel"]')?.focus({ preventScroll: true })
}

async function askForCode() {
  // Only once a code has really gone out: a failed send stays on this screen
  // (usePhoneCode says why), rather than asking for a code that never came.
  if (!(await sendCode())) return
  stage.value = 'verify'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function onCode(entered) {
  let token
  try {
    token = await code.verify(phone.value.trim(), entered)
  } catch {
    toast.error('تعذّر التحقق من الرمز. حاول مرة أخرى.')
    codeBox.value?.clear()
    return
  }
  if (!token) {
    codeError.value = true
    codeBox.value?.clear()
    return
  }
  rememberGuest(name.value.trim(), phone.value.trim(), token)
  returning.value = rememberedGuest()
  book()
}

async function book() {
  if (!serviceId.value || !resourceId.value || !startAt.value) return
  bookError.value = ''
  submitting.value = true
  try {
    if (isDemoBackend) {
      const customer = await customers.upsert({ name: name.value, phone: phone.value })
      const created = await bookings.create({
        customerId: customer.id,
        serviceId: serviceId.value,
        resourceId: resourceId.value,
        startAt: startAt.value,
        status: 'pending',
        paymentStatus: 'unpaid',
        channel: 'online',
        notes: notes.value.trim() || undefined,
        durationMin: durationMin.value,
        byGuest: true,
      })
      reference.value = created.reference
      booked.value = {
        startAt: created.startAt,
        endAt: created.endAt,
        priceMinor: created.priceMinor,
      }
    } else {
      // The public endpoint computes price, end time and reference itself;
      // these facts are all a guest is trusted to supply.
      const { bookPublic } = await import('@/data/api/public')
      const created = await bookPublic({
        serviceId: serviceId.value,
        resourceId: resourceId.value,
        startAt: startAt.value,
        name: name.value.trim(),
        phone: phone.value.trim(),
        notes: notes.value.trim() || undefined,
        durationMin: durationMin.value,
        verificationToken: returning.value?.token ?? undefined,
      })
      reference.value = created.reference
      manageToken.value = created.manageToken ?? null
      // The server's price, not this page's estimate.
      booked.value = {
        startAt: created.startAt ?? startAt.value,
        endAt: created.endAt ?? null,
        priceMinor: created.priceMinor ?? price.value,
      }
    }
    rememberGuest(name.value.trim(), phone.value.trim())
    localStorage.removeItem(DRAFT_KEY)
    stage.value = 'done'
    window.scrollTo({ top: 0 })
  } catch (e) {
    // The kept proof expired or was for another number: prove it again.
    if (e?.body?.error === 'phone_not_verified') {
      rememberGuest(name.value.trim(), phone.value.trim(), null)
      returning.value = rememberedGuest()
      askForCode()
      return
    }
    if (e?.status === 409 || isConflict(e)) {
      // The one case that needs a new choice: back to the times, with the
      // reason left on screen beside them.
      stage.value = 'form'
      startAt.value = null
      slotTaken.value = true
      loadBusy()
      nextTick(() => scrollTo('when'))
      return
    }
    // Anything else (offline, a server error) keeps the guest where they are,
    // code and details intact; the button tries again.
    bookError.value = 'تعذّر إتمام الحجز. تحقّق من الاتصال ثم حاول مرة أخرى.'
  } finally {
    submitting.value = false
  }
}

/* -------------------------------------------------------- after booking */
const manageUrl = computed(() =>
  reference.value
    ? `${window.location.origin}${managePath(reference.value, manageToken.value)}`
    : '',
)

function addToCalendar() {
  if (!booked.value || !service.value) return
  const start = booked.value.startAt
  const end =
    booked.value.endAt ?? new Date(new Date(start).getTime() + length.value * 60000).toISOString()
  downloadIcs(
    `${reference.value}.ics`,
    buildIcs({
      uid: `${reference.value}@waeda.app`,
      title: `${service.value.name} · ${business.name}`,
      start,
      end,
      location: business.address,
      description: `رقم الحجز ${reference.value}\n${manageUrl.value}`,
    }),
  )
}

const shareUrl = computed(() => {
  if (!booked.value || !service.value) return '#'
  const msg = `حجزت موعداً في ${business.name}\n${service.value.name}\n${fullDate(booked.value.startAt)} الساعة ${time(booked.value.startAt)}\nرقم الحجز: ${reference.value}\n${manageUrl.value}`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
})

const dayTitle = computed(() =>
  isSameDay(date.value, nowInZone())
    ? 'اليوم'
    : isSameDay(date.value, addDays(nowInZone(), 1))
      ? 'غداً'
      : format(date.value, 'EEEE d MMMM', { locale: ar }),
)
</script>

<template>
  <div class="bg-canvas min-h-screen pb-28 lg:pb-0">
    <StoreHeader />

    <!-- ================================================= done -->
    <main v-if="stage === 'done'" class="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <div class="animate-pop-in text-center">
        <span
          class="bg-success-600 mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full text-white"
        >
          <Check class="h-8 w-8" stroke-width="3" aria-hidden="true" />
        </span>
        <h2 class="font-display text-fg mb-2 text-2xl font-bold">تم حجز موعدك</h2>
        <p class="text-fg-muted mb-8 text-[15px]">
          ستصلك رسالة على الواتساب قبل الموعد بيوم لتأكيد حضورك.
        </p>
      </div>

      <BookingTicket
        v-if="booked && service"
        :service-name="service.name"
        :resource-name="resourceName"
        :start-at="booked.startAt"
        :reference="reference"
        :price-minor="booked?.priceMinor ?? price"
      />

      <div class="mt-5 grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-3 text-sm font-bold"
          @click="addToCalendar"
        >
          <CalendarPlus class="h-4 w-4" aria-hidden="true" /> أضف إلى تقويمك
        </button>
        <a
          :href="shareUrl"
          target="_blank"
          rel="noopener"
          class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-3 text-sm font-bold"
        >
          <MessageCircle class="h-4 w-4" aria-hidden="true" /> شارك على واتساب
        </a>
      </div>
      <RouterLink
        :to="managePath(reference, manageToken)"
        class="btn-brand mt-2.5 flex items-center justify-center rounded-[var(--radius-md)] py-3 text-sm font-bold"
      >
        إدارة الحجز
      </RouterLink>
      <p class="text-fg-subtle mt-4 text-center text-[13px]">
        تقدر تعدّل الموعد أو تلغيه من رابط إدارة الحجز، دون أن تتصل.
      </p>
    </main>

    <!-- ================================================= verify -->
    <main v-else-if="stage === 'verify'" class="mx-auto max-w-md px-4 py-10 sm:py-14">
      <button
        type="button"
        class="text-fg-subtle hover:text-fg mb-6 flex items-center gap-1.5 text-sm font-medium"
        @click="stage = 'form'"
      >
        <ArrowRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" /> رجوع
      </button>
      <div
        class="border-border bg-surface rounded-[var(--radius-xl)] border p-6 text-center sm:p-8"
      >
        <span
          class="bg-surface-sunken text-fg mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full"
        >
          <ShieldCheck class="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 class="font-display text-fg mb-2 text-xl font-bold">أدخل رمز التحقق</h2>
        <p class="text-fg-muted mb-6 text-sm">
          أرسلنا رمزاً من 4 أرقام على واتساب إلى
          <span class="text-fg font-semibold" dir="ltr">{{ phone }}</span>
          <button type="button" class="text-fg ms-1 font-semibold underline" @click="editPhone">
            تعديل الرقم
          </button>
        </p>

        <CodeInput ref="codeBox" :invalid="codeError" @complete="onCode" />
        <p v-if="codeError" class="text-danger-700 mt-3 text-sm" role="alert">
          الرمز غير صحيح. حاول مرة أخرى.
        </p>
        <p v-if="submitting" class="text-fg-subtle mt-3 text-sm">جاري تأكيد الحجز…</p>
        <div v-else-if="bookError" role="alert" class="text-danger-700 mt-3 text-sm">
          {{ bookError }}
          <button type="button" class="font-semibold underline" @click="book">حاول مرة أخرى</button>
        </div>

        <div class="text-fg-subtle mt-6 text-sm">
          <span v-if="resendIn > 0" data-numeric>إعادة الإرسال بعد {{ resendIn }} ثانية</span>
          <button v-else type="button" class="text-fg font-semibold underline" @click="sendCode">
            أعد إرسال الرمز
          </button>
        </div>
        <DemoCode v-if="code.shown.value" :code="code.shown.value" class="mt-6" />
      </div>
      <p class="text-fg-subtle mt-4 text-center text-xs">
        نتحقق من الرقم مرة واحدة فقط على هذا الجهاز.
      </p>
    </main>

    <!-- ================================================= form -->
    <main v-else class="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_22rem]">
      <div class="min-w-0 space-y-10">
        <!-- returning -->
        <div
          v-if="returning"
          class="border-border bg-surface flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3"
        >
          <p class="text-fg text-sm">
            أهلاً <strong>{{ returning.name }}</strong
            >، بياناتك محفوظة على هذا الجهاز.
          </p>
          <button
            type="button"
            class="text-fg-subtle hover:text-fg shrink-0 text-sm underline"
            @click="notMe"
          >
            لست أنا
          </button>
        </div>

        <!-- 1 · service -->
        <section id="sec-service" class="scroll-mt-6" aria-labelledby="h-service">
          <h2 id="h-service" class="text-fg mb-4 flex items-center gap-2.5 text-lg font-bold">
            <span
              class="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
              :class="done.service ? 'bg-fg text-fg-inverse' : 'border-border-strong border'"
              aria-hidden="true"
            >
              <Check v-if="done.service" class="h-3.5 w-3.5" />
              <template v-else>1</template>
            </span>
            الخدمة
          </h2>
          <!-- categories -->
          <div
            v-if="categories.length > 1"
            class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
            role="tablist"
            aria-label="تصنيفات الخدمات"
          >
            <button
              v-for="c in ['all', ...categories]"
              :key="c"
              type="button"
              role="tab"
              :aria-selected="catFilter === c"
              class="shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
              :class="
                catFilter === c
                  ? 'border-fg bg-fg text-fg-inverse'
                  : 'border-border bg-surface text-fg-muted hover:text-fg'
              "
              @click="catFilter = c"
            >
              {{ c === 'all' ? 'الكل' : c }}
            </button>
          </div>

          <div role="radiogroup" aria-labelledby="h-service" class="space-y-6">
            <div v-for="g in serviceGroups" :key="g.name">
              <p v-if="categories.length > 1" class="text-fg-subtle mb-2 text-[13px] font-semibold">
                {{ g.name }}
              </p>
              <div
                class="border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-lg)] border"
              >
                <button
                  v-for="s in g.items"
                  :key="s.id"
                  type="button"
                  role="radio"
                  :aria-checked="serviceId === s.id"
                  class="flex w-full items-start gap-3.5 p-4 text-start transition-colors"
                  :class="serviceId === s.id ? 'bg-surface-sunken' : 'hover:bg-surface-hover'"
                  @click="serviceId = s.id"
                >
                  <span
                    class="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)]"
                    :class="
                      serviceId === s.id ? 'bg-fg text-fg-inverse' : 'bg-surface-sunken text-fg'
                    "
                  >
                    <component :is="s.icon" class="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-start justify-between gap-3">
                      <span class="text-fg font-bold">{{ s.name }}</span>
                      <span class="text-fg shrink-0 font-bold" data-numeric>{{
                        money(s.priceMinor)
                      }}</span>
                    </span>
                    <span class="text-fg-subtle mt-0.5 block text-[13px] leading-relaxed">{{
                      s.description
                    }}</span>
                    <span class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                      <span class="text-fg-subtle flex items-center gap-1"
                        ><Clock class="h-3.5 w-3.5" aria-hidden="true" />{{
                          duration(s.durationMin)
                        }}</span
                      >
                      <span class="flex items-center gap-2">
                        <span class="flex -space-x-1.5 rtl:space-x-reverse" aria-hidden="true">
                          <span
                            v-for="p in providersOf(s)"
                            :key="p.id"
                            class="bg-surface-sunken text-fg ring-surface grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ring-2"
                            >{{ initialOf(p.name) }}</span
                          >
                        </span>
                        <span class="text-fg-muted">{{
                          providersOf(s)
                            .map((p) => p.name)
                            .join('، ')
                        }}</span>
                      </span>
                    </span>
                  </span>
                  <span
                    class="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors"
                    :class="serviceId === s.id ? 'border-fg bg-fg' : 'border-border-strong'"
                    aria-hidden="true"
                  >
                    <Check
                      v-if="serviceId === s.id"
                      class="text-fg-inverse h-3 w-3"
                      stroke-width="3"
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 2 · who + when -->
        <section id="sec-when" class="scroll-mt-6" aria-labelledby="h-when">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="h-when" class="text-fg flex items-center gap-2.5 text-lg font-bold">
              <span
                class="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
                :class="done.when ? 'bg-fg text-fg-inverse' : 'border-border-strong border'"
                aria-hidden="true"
              >
                <Check v-if="done.when" class="h-3.5 w-3.5" />
                <template v-else>2</template>
              </span>
              الموعد
            </h2>
            <button
              v-if="nearest && !group"
              type="button"
              class="border-border bg-surface text-fg hover:border-fg-faint flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold"
              @click="takeNearest"
            >
              <Zap class="text-primary-fg h-3.5 w-3.5" aria-hidden="true" />
              أقرب موعد:
              <span data-numeric
                >{{
                  isSameDay(nearest.day, nowInZone())
                    ? 'اليوم'
                    : isSameDay(nearest.day, addDays(nowInZone(), 1))
                      ? 'غداً'
                      : format(nearest.day, 'EEEE', { locale: ar })
                }}
                {{ nearest.slot.label }}</span
              >
            </button>
          </div>

          <p
            v-if="!service"
            class="border-border text-fg-subtle rounded-[var(--radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          >
            اختر الخدمة أولاً لتظهر الأوقات المتاحة.
          </p>

          <!-- a class: its sessions, each with the seats left -->
          <div
            v-else-if="group"
            class="border-border bg-surface rounded-[var(--radius-lg)] border p-4 sm:p-5"
            data-sessions
          >
            <p class="text-fg-muted mb-3 text-[13px] font-semibold">
              الحصص القادمة · {{ service.capacity }} مقعداً في كل حصة
            </p>
            <p
              v-if="!sessionList.length"
              class="bg-surface-sunken text-fg-subtle rounded-[var(--radius-md)] px-4 py-6 text-center text-sm"
            >
              لا حصص مجدولة في الأسابيع القادمة.
            </p>
            <div v-else class="space-y-4">
              <div v-for="d in sessionDays" :key="d.key">
                <p class="text-fg-subtle mb-2 text-xs">{{ d.label }}</p>
                <div
                  role="radiogroup"
                  :aria-label="`حصص ${d.label}`"
                  class="grid gap-2 sm:grid-cols-2"
                >
                  <button
                    v-for="s in d.items"
                    :key="s.resourceId + s.startAt"
                    type="button"
                    role="radio"
                    :aria-checked="startAt === s.startAt && sessionResource === s.resourceId"
                    :disabled="s.left === 0"
                    class="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-start transition-colors"
                    :class="
                      startAt === s.startAt && sessionResource === s.resourceId
                        ? 'border-primary bg-primary text-white'
                        : s.left === 0
                          ? 'border-border text-fg-faint cursor-not-allowed'
                          : 'border-border text-fg hover:border-fg'
                    "
                    @click="pickSession(s)"
                  >
                    <span class="min-w-0">
                      <span class="block font-bold" data-numeric>{{ time(s.startAt) }}</span>
                      <span class="block truncate text-xs opacity-75">{{
                        nameOf(s.resourceId)
                      }}</span>
                    </span>
                    <span
                      class="shrink-0 text-xs font-semibold"
                      :class="
                        startAt === s.startAt && sessionResource === s.resourceId
                          ? ''
                          : s.left === 0
                            ? ''
                            : s.left <= 3
                              ? 'text-warning-700'
                              : 'text-success-700'
                      "
                      data-numeric
                      >{{ seatsLine(s) }}</span
                    >
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="border-border bg-surface space-y-6 rounded-[var(--radius-lg)] border p-4 sm:p-5"
          >
            <!-- how long, when the service offers more than one length -->
            <div v-if="durations.length > 1">
              <p class="text-fg-muted mb-2 text-[13px] font-semibold">المدة</p>
              <div role="radiogroup" aria-label="المدة" class="flex flex-wrap gap-2" data-durations>
                <button
                  v-for="d in durations"
                  :key="d"
                  type="button"
                  role="radio"
                  :aria-checked="length === d"
                  class="rounded-[var(--radius-md)] border px-3.5 py-2 text-start text-sm transition-colors"
                  :class="
                    length === d
                      ? 'border-fg bg-fg text-fg-inverse'
                      : 'border-border text-fg hover:border-fg-faint'
                  "
                  @click="durationMin = d === service.durationMin ? null : d"
                >
                  <span class="block font-semibold">{{ duration(d) }}</span>
                  <span class="block text-[11px] opacity-70" data-numeric>{{
                    money(Math.round((service.priceMinor * d) / service.durationMin))
                  }}</span>
                </button>
              </div>
            </div>

            <!-- who: by gender first, when the team has both -->
            <div v-if="mixed" role="radiogroup" aria-label="المختص" class="flex gap-1" data-gender>
              <button
                v-for="g in GENDERS"
                :key="g.value"
                type="button"
                role="radio"
                :aria-checked="gender === g.value"
                class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                :class="
                  gender === g.value ? 'bg-surface-sunken text-fg' : 'text-fg-subtle hover:text-fg'
                "
                @click="gender = g.value"
              >
                {{ g.label }}
              </button>
            </div>
            <div v-if="people.length > 1">
              <p class="text-fg-muted mb-2 text-[13px] font-semibold">{{ whoLabel }}</p>
              <div role="radiogroup" :aria-label="whoLabel" class="flex flex-wrap gap-2">
                <button
                  v-for="p in [{ id: ANY, name: anyLabel }, ...people]"
                  :key="p.id"
                  type="button"
                  role="radio"
                  :aria-checked="who === p.id"
                  class="flex items-center gap-2 rounded-full border py-1.5 ps-1.5 pe-3.5 text-sm font-medium transition-colors"
                  :class="
                    who === p.id
                      ? 'border-fg bg-fg text-fg-inverse'
                      : 'border-border text-fg hover:border-fg-faint'
                  "
                  @click="who = p.id"
                >
                  <span
                    class="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold"
                    :class="who === p.id ? 'bg-fg-inverse/20' : 'bg-surface-sunken'"
                    aria-hidden="true"
                  >
                    <Zap v-if="p.id === ANY" class="h-3 w-3" />
                    <MapPin v-else-if="p.kind === 'place'" class="h-3 w-3" />
                    <template v-else>{{ initialOf(p.name) }}</template>
                  </span>
                  <span class="text-start leading-tight">
                    <span class="block">{{ p.name }}</span>
                    <span
                      v-if="p.role"
                      class="block text-[11px]"
                      :class="who === p.id ? 'opacity-70' : 'text-fg-subtle'"
                      >{{ p.role }}</span
                    >
                  </span>
                </button>
              </div>
            </div>

            <DayPicker v-model="date" :free-on="freeCount" :weeks="4" />

            <!-- times -->
            <div>
              <p class="text-fg-muted mb-3 text-[13px] font-semibold">
                الأوقات المتاحة {{ dayTitle }}
              </p>
              <p
                v-if="slotTaken"
                role="alert"
                class="border-warning-100 bg-warning-50 text-warning-700 mb-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm"
              >
                الوقت الذي اخترته حُجز قبل لحظات. اختر وقتاً آخر من الأوقات المتاحة الآن.
              </p>
              <!-- Until the taken times are known every time would look free. -->
              <div
                v-if="busyState === 'loading'"
                class="grid grid-cols-3 gap-2 sm:grid-cols-5"
                aria-busy="true"
                aria-label="جاري تحميل الأوقات"
              >
                <span
                  v-for="n in 10"
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
                <button type="button" class="font-semibold underline" @click="loadBusy">
                  إعادة المحاولة
                </button>
              </div>
              <p
                v-else-if="!slots.length"
                class="bg-surface-sunken text-fg-subtle rounded-[var(--radius-md)] px-4 py-6 text-center text-sm"
              >
                {{ emptyDay }}
              </p>
              <div v-else class="space-y-4">
                <div v-for="g in grouped" :key="g.key">
                  <p class="text-fg-subtle mb-2 text-xs">{{ g.label }}</p>
                  <div
                    role="radiogroup"
                    :aria-label="`أوقات ${g.label}`"
                    class="grid grid-cols-3 gap-2 sm:grid-cols-5"
                  >
                    <button
                      v-for="s in g.slots"
                      :key="s.startAt"
                      type="button"
                      role="radio"
                      :aria-checked="startAt === s.startAt"
                      :disabled="s.state !== 'available'"
                      :aria-label="s.state === 'available' ? s.label : `${s.label}، غير متاح`"
                      class="flex min-h-10 flex-col items-center justify-center rounded-[var(--radius-md)] border py-1 text-sm font-semibold transition-colors"
                      :class="
                        startAt === s.startAt
                          ? 'border-primary bg-primary text-white'
                          : s.state === 'available'
                            ? 'border-border text-fg hover:border-fg'
                            : 'text-fg-faint cursor-not-allowed border-transparent line-through'
                      "
                      data-numeric
                      @click="startAt = s.startAt"
                    >
                      {{ s.label }}
                      <span
                        v-if="pricedTimes && s.state === 'available'"
                        class="text-[10px] font-medium opacity-70"
                        >{{ money(s.priceMinor) }}</span
                      >
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <WaitlistJoin
            v-if="serviceId"
            :key="`${serviceId}:${date.toISOString()}`"
            :service-id="serviceId"
            :date="date"
            :full="
              group ? sessionList.length > 0 && sessionList.every((s) => s.left === 0) : dayIsFull
            "
          />
        </section>

        <!-- 3 · details -->
        <section id="sec-details" class="scroll-mt-6" aria-labelledby="h-details">
          <h2 id="h-details" class="text-fg mb-4 flex items-center gap-2.5 text-lg font-bold">
            <span
              class="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
              :class="done.details ? 'bg-fg text-fg-inverse' : 'border-border-strong border'"
              aria-hidden="true"
            >
              <Check v-if="done.details" class="h-3.5 w-3.5" />
              <template v-else>3</template>
            </span>
            بياناتك
          </h2>
          <div
            class="border-border bg-surface grid gap-4 rounded-[var(--radius-lg)] border p-4 sm:grid-cols-2 sm:p-5"
          >
            <BaseInput
              v-model="name"
              label="الاسم الكامل"
              :icon="User"
              required
              :error="nameError"
            />
            <BaseInput
              v-model="phone"
              label="رقم الجوال"
              type="tel"
              :icon="Phone"
              ltr
              required
              placeholder="05XXXXXXXX"
              :error="phoneError"
              hint="يصلك عليه التذكير وتأكيد الموعد."
            />
            <BaseInput
              v-model="notes"
              class="sm:col-span-2"
              label="ملاحظات للمنشأة"
              type="textarea"
              :rows="2"
              placeholder="اختياري"
            />
          </div>
          <p class="text-fg-subtle mt-3 flex items-center gap-1.5 text-xs">
            <ShieldCheck class="h-3.5 w-3.5" aria-hidden="true" />
            لا تحتاج حساباً ولا كلمة مرور. نتحقق من رقمك مرة واحدة برمز على الواتساب.
          </p>
        </section>
      </div>

      <!-- summary: beside the form on desktop -->
      <aside class="hidden lg:block">
        <div class="border-border bg-surface sticky top-6 rounded-[var(--radius-xl)] border p-5">
          <p class="text-fg mb-4 font-bold">ملخص الحجز</p>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-fg-subtle">الخدمة</dt>
              <dd class="text-fg text-end font-semibold">{{ service?.name ?? '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-fg-subtle">{{ placesOnly ? placeWord : 'مع' }}</dt>
              <dd class="text-fg font-semibold">
                {{ resourceName ?? (who === ANY ? anyLabel : '—') }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-fg-subtle">الموعد</dt>
              <dd class="text-fg text-end font-semibold" data-numeric>
                {{ startAt ? `${fullDate(startAt)} · ${time(startAt)}` : '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-fg-subtle">المدة</dt>
              <dd class="text-fg font-semibold">
                {{ service ? duration(length) : '—' }}
              </dd>
            </div>
          </dl>
          <div class="border-border mt-4 flex items-baseline justify-between border-t pt-4">
            <span class="text-fg-subtle text-sm">الإجمالي</span>
            <span class="text-fg text-xl font-bold" data-numeric>{{
              service ? money(price) : '—'
            }}</span>
          </div>
          <button
            type="button"
            class="mt-5 w-full rounded-[var(--radius-md)] py-3 text-sm font-bold transition-colors"
            :class="ready ? 'btn-brand' : 'bg-surface-sunken text-fg-muted hover:text-fg'"
            :disabled="submitting"
            @click="confirm"
          >
            {{ nextAction.label }}
          </button>
          <p v-if="bookError" role="alert" class="text-danger-700 mt-3 text-center text-sm">
            {{ bookError }}
          </p>
          <p class="text-fg-subtle mt-3 text-center text-xs">الدفع في المنشأة عند الحضور.</p>
        </div>
      </aside>

      <!-- summary: a bar along the bottom on a phone -->
      <div
        class="bg-surface/95 border-border fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur lg:hidden"
      >
        <div class="mx-auto flex max-w-6xl items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-fg truncate text-sm font-bold">
              {{ service?.name ?? 'لم تختر خدمة بعد' }}
            </p>
            <p class="text-fg-subtle truncate text-xs" data-numeric>
              <template v-if="startAt">{{ fullDate(startAt) }} · {{ time(startAt) }} · </template>
              {{ service ? money(price) : '' }}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold"
            :class="ready ? 'btn-brand' : 'bg-fg text-fg-inverse'"
            :disabled="submitting"
            @click="confirm"
          >
            {{ nextAction.label }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
