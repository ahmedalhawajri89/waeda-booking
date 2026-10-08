<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarDays,
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  Scissors,
  Stethoscope,
  User,
  UtensilsCrossed,
  X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AppLogo from '@/components/ui/AppLogo.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import PhoneFrame from '@/components/marketing/hero/PhoneFrame.vue'
import { useAuthStore } from '@/stores/auth'
import { DURATIONS, HOURS_PRESETS, SECTORS, sectorByKey } from '@/data/businessTemplates'
import { iconFor } from '@/lib/icons'
import { initialOf } from '@/data/business'
import { SLUG_PATTERN, slugify } from '@/lib/slug'
import { duration } from '@/lib/format'

/**
 * Opening a business, in three steps, with the booking page building itself
 * beside the form.
 *
 *   1 · your account     who is opening it
 *   2 · your business    what it is called, what kind of place, where, its link
 *   3 · your page        what it sells, who works there, when it is open
 *
 * Every step starts filled in from the kind of business chosen, so the fast
 * path is "next, next, create". The preview is the reason to keep going: by
 * step 3 the owner is looking at their own booking page, not a form.
 */
const auth = useAuthStore()

const SECTOR_ICONS = {
  Stethoscope,
  Scissors,
  GraduationCap,
  Briefcase,
  UtensilsCrossed,
  CalendarDays,
}

const step = ref(1)
const touched = ref(false)
const submitting = ref(false)
const done = ref(null)

/* ------------------------------------------------------------- 1 · you */
const account = reactive({ fullName: '', email: '', password: '' })
const showPassword = ref(false)

const strength = computed(() => {
  const p = account.password
  let score = 0
  if (p.length >= 8) score++
  if (/[0-9]/.test(p) && /[^0-9]/.test(p)) score++
  if (p.length >= 12 || /[^A-Za-z0-9]/.test(p)) score++
  return score
})
const STRENGTH = ['ضعيفة', 'مقبولة', 'جيدة', 'قوية']

const accountErrors = computed(() => ({
  fullName: account.fullName.trim().length < 2 ? 'اكتب اسمك' : undefined,
  email: !/^\S+@\S+\.\S+$/.test(account.email) ? 'بريد إلكتروني غير صالح' : undefined,
  password: account.password.length < 8 ? 'كلمة المرور 8 أحرف على الأقل' : undefined,
}))

/* -------------------------------------------------------- 2 · business */
const biz = reactive({ name: '', sector: 'clinic', address: '', slug: '' })
const slugEdited = ref(false)
const slugState = ref('idle') // idle · checking · available · taken · invalid

watch(
  () => biz.name,
  (name) => {
    if (!slugEdited.value) biz.slug = slugify(name)
  },
)

let slugTimer
watch(
  () => biz.slug,
  (slug) => {
    clearTimeout(slugTimer)
    if (!slug) return (slugState.value = 'idle')
    if (!SLUG_PATTERN.test(slug)) return (slugState.value = 'invalid')
    slugState.value = 'checking'
    slugTimer = setTimeout(async () => {
      try {
        const ok = await auth.slugAvailable(slug)
        if (biz.slug === slug) slugState.value = ok ? 'available' : 'taken'
      } catch {
        slugState.value = 'idle'
      }
    }, 400)
  },
)

function onSlugInput(e) {
  slugEdited.value = true
  biz.slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

const sector = computed(() => sectorByKey(biz.sector))

const bizErrors = computed(() => ({
  name: biz.name.trim().length < 2 ? 'اكتب اسم المنشأة' : undefined,
  slug:
    slugState.value === 'taken'
      ? 'هذا الرابط مأخوذ، جرّب غيره'
      : slugState.value === 'invalid' || !biz.slug
        ? 'حروف إنجليزية صغيرة وأرقام وشرطة، من 3 أحرف'
        : undefined,
}))

/* ------------------------------------------------------------ 3 · page */
const services = ref([])
const staff = ref([])
const newStaff = ref('')
const hoursKey = ref('sat-thu')

/** Each kind of business starts from its own services. */
watch(
  () => biz.sector,
  (key) => {
    const sec = sectorByKey(key)
    services.value = sec.services.map((s) => ({ ...s, keep: true }))
    // A club books courts: start with two, and its late hours.
    if (sec.resourceKind === 'place') {
      staff.value = [{ name: 'ملعب 1' }, { name: 'ملعب 2' }]
      hoursKey.value = sec.hoursKey ?? hoursKey.value
    } else if (staff.value.every((m) => /^ملعب \d+$/.test(m.name))) {
      staff.value = []
    }
  },
  { immediate: true },
)
const isPlaces = computed(() => sector.value.resourceKind === 'place')

// The owner is the first person on the team unless they say otherwise.
watch(step, (s) => {
  if (s === 3 && staff.value.length === 0 && account.fullName.trim() && !isPlaces.value)
    staff.value = [{ name: account.fullName.trim(), role: '' }]
})

function addService() {
  services.value.push({
    name: '',
    category: services.value[0]?.category ?? 'الخدمات',
    durationMin: 30,
    price: 100,
    iconKey: 'Sparkles',
    keep: true,
  })
}

function addStaff() {
  const name = newStaff.value.trim()
  if (name.length < 2) return
  staff.value.push({ name, role: '' })
  newStaff.value = ''
}

const kept = computed(() => services.value.filter((s) => s.keep && s.name.trim().length >= 2))
const pageErrors = computed(() => ({
  services: kept.value.length === 0 ? 'أبقِ خدمة واحدة على الأقل' : undefined,
  staff: staff.value.length === 0 ? 'أضف شخصاً واحداً على الأقل' : undefined,
}))

/* ------------------------------------------------------------- flow */
const STEPS = ['حسابك', 'منشأتك', 'صفحتك']
const errorsOf = (s) => [accountErrors, bizErrors, pageErrors][s - 1].value
const stepValid = (s) =>
  !Object.values(errorsOf(s)).some(Boolean) && (s !== 2 || slugState.value === 'available')

function next() {
  touched.value = true
  if (!stepValid(step.value)) return
  touched.value = false
  step.value++
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function back() {
  step.value--
  touched.value = false
}
const err = (key) => (touched.value ? errorsOf(step.value)[key] : undefined)

async function create() {
  touched.value = true
  if (!stepValid(3)) return
  submitting.value = true
  try {
    await auth.signUpBusiness({
      fullName: account.fullName.trim(),
      email: account.email.trim(),
      password: account.password,
      business: {
        name: biz.name.trim(),
        slug: biz.slug,
        category: sector.value.category,
        address: biz.address.trim() || null,
      },
      staff: staff.value.map((m) =>
        isPlaces.value
          ? { name: m.name, kind: 'place' }
          : { name: m.name, role: m.role || sector.value.staffRole },
      ),
      services: kept.value.map((s) => ({
        name: s.name.trim(),
        category: s.category,
        durationMin: s.durationMin,
        priceMinor: Math.round(Number(s.price) * 100),
        iconKey: s.iconKey,
        ...(s.durationOptions ? { durationOptions: s.durationOptions } : {}),
        ...(s.peakFrom
          ? { peakFrom: s.peakFrom, peakPriceMinor: Math.round(Number(s.peakPrice) * 100) }
          : {}),
        ...(s.capacity > 1 ? { capacity: s.capacity, sessions: s.sessions ?? [] } : {}),
      })),
      hours: HOURS_PRESETS.find((h) => h.key === hoursKey.value).hours,
    })
    done.value = { slug: biz.slug, url: `${window.location.origin}/b/${biz.slug}` }
    window.scrollTo({ top: 0 })
  } catch (e) {
    const fields = Object.keys(e?.body?.errors ?? {})
    if (fields.some((f) => f.startsWith('email'))) {
      step.value = 1
      toast.error('هذا البريد مسجّل بالفعل. سجّل دخولك أو استخدم بريداً آخر.')
    } else if (fields.some((f) => f.startsWith('business.slug'))) {
      step.value = 2
      slugState.value = 'taken'
      toast.error('الرابط أُخذ للتو. اختر رابطاً آخر.')
    } else {
      toast.error('تعذّر إنشاء المنشأة. حاول مرة أخرى.')
    }
  } finally {
    submitting.value = false
  }
}

/* ------------------------------------------------------------- done */
async function copyLink() {
  try {
    await navigator.clipboard.writeText(done.value.url)
    toast.success('نُسخ الرابط')
  } catch {
    toast.error('تعذّر النسخ')
  }
}
const shareUrl = computed(() =>
  done.value
    ? `https://wa.me/?text=${encodeURIComponent(`احجز موعدك في ${biz.name} من هنا:\n${done.value.url}`)}`
    : '#',
)
// A full load, so the console starts from the new business rather than
// whatever the stores held before it existed.
const openConsole = () => window.location.assign('/app')

/* ------------------------------------------------------------- preview */
const preview = computed(() => ({
  name: biz.name.trim() || 'اسم منشأتك',
  initial: initialOf(biz.name.trim() || 'م'),
  category: sector.value.category,
  address: biz.address.trim(),
  services: kept.value.length ? kept.value : services.value.filter((s) => s.keep),
  staff: staff.value.length
    ? staff.value
    : [{ name: account.fullName.trim() || sector.value.staffPlaceholder }],
}))
const price = (p) => (Number(p) > 0 ? `${Number(p)} ر.س` : 'مجاناً')
</script>

<template>
  <div class="bg-canvas min-h-screen">
    <header class="border-border bg-surface border-b">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <AppLogo compact />
        <p v-if="!done" class="text-fg-subtle text-sm">
          لديك حساب؟
          <RouterLink to="/login" class="text-fg font-semibold underline-offset-4 hover:underline"
            >سجّل دخولك</RouterLink
          >
        </p>
      </div>
    </header>

    <!-- ===================================================== done -->
    <main v-if="done" class="mx-auto max-w-lg px-4 py-12 text-center sm:py-16">
      <span
        class="bg-success-600 animate-pop-in mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full text-white"
      >
        <Check class="h-8 w-8" stroke-width="3" aria-hidden="true" />
      </span>
      <h1 class="font-display text-fg mb-2 text-2xl font-bold">صفحة حجز {{ biz.name }} جاهزة</h1>
      <p class="text-fg-muted mb-3">أرسل الرابط لعملائك، وكل حجز يصل إلى لوحة التحكم مباشرة.</p>
      <p
        class="bg-primary-soft text-primary-fg mx-auto mb-8 inline-block rounded-full px-3 py-1 text-xs font-semibold"
        data-trial
      >
        بدأت تجربة الباقة الاحترافية لمدة 14 يوماً، بلا بطاقة
      </p>

      <div
        class="border-border bg-surface mb-4 flex items-center gap-2 rounded-[var(--radius-lg)] border p-2 ps-4"
      >
        <span class="text-fg min-w-0 flex-1 truncate text-start font-semibold" dir="ltr">{{
          done.url.replace(/^https?:\/\//, '')
        }}</span>
        <button
          type="button"
          class="bg-surface-sunken text-fg hover:bg-surface-hover flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold"
          @click="copyLink"
        >
          <Copy class="h-4 w-4" aria-hidden="true" /> نسخ
        </button>
      </div>
      <div class="mb-6 grid grid-cols-2 gap-2">
        <a
          :href="`/b/${done.slug}`"
          target="_blank"
          rel="noopener"
          class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-3 text-sm font-bold"
        >
          <ExternalLink class="h-4 w-4" aria-hidden="true" /> افتح صفحتك
        </a>
        <a
          :href="shareUrl"
          target="_blank"
          rel="noopener"
          class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-3 text-sm font-bold"
        >
          <MessageCircle class="h-4 w-4" aria-hidden="true" /> شارك على واتساب
        </a>
      </div>
      <button
        type="button"
        class="btn-brand flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] py-3.5 text-base font-bold"
        @click="openConsole"
      >
        ادخل لوحة التحكم
        <ArrowLeft class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
      </button>
    </main>

    <!-- ===================================================== steps -->
    <main
      v-else
      class="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_20rem] lg:gap-16 lg:py-12"
    >
      <div class="min-w-0">
        <!-- stepper -->
        <ol class="mb-8 flex items-center gap-3" aria-label="خطوات إنشاء المنشأة">
          <li v-for="(s, i) in STEPS" :key="s" class="flex flex-1 items-center gap-2.5">
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors"
              :class="
                step > i + 1
                  ? 'bg-fg text-fg-inverse'
                  : step === i + 1
                    ? 'border-fg text-fg border-2'
                    : 'border-border-strong text-fg-faint border'
              "
              :aria-current="step === i + 1 ? 'step' : undefined"
            >
              <Check v-if="step > i + 1" class="h-3.5 w-3.5" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span
              class="text-sm font-semibold"
              :class="step >= i + 1 ? 'text-fg' : 'text-fg-faint'"
              >{{ s }}</span
            >
            <span v-if="i < STEPS.length - 1" class="bg-border h-px flex-1" aria-hidden="true" />
          </li>
        </ol>

        <!-- 1 · account -->
        <section v-if="step === 1" aria-labelledby="s1">
          <h1 id="s1" class="font-display text-fg mb-2 text-2xl font-bold sm:text-3xl">
            افتح منشأتك على وعدة
          </h1>
          <p class="text-fg-muted mb-8">مجاناً، ولا يحتاج بطاقة ائتمان. ثلاث خطوات وصفحتك جاهزة.</p>
          <form class="max-w-md space-y-4" @submit.prevent="next">
            <BaseInput
              v-model="account.fullName"
              label="اسمك"
              :icon="User"
              required
              :error="err('fullName')"
            />
            <BaseInput
              v-model="account.email"
              label="البريد الإلكتروني"
              type="email"
              :icon="Mail"
              ltr
              required
              :error="err('email')"
              hint="تدخل به إلى لوحة التحكم."
            />
            <div class="relative">
              <BaseInput
                v-model="account.password"
                label="كلمة المرور"
                :type="showPassword ? 'text' : 'password'"
                :icon="Lock"
                ltr
                required
                :error="err('password')"
              />
              <button
                type="button"
                class="text-fg-subtle hover:text-fg absolute end-3 top-[2.15rem] p-1"
                :aria-label="showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" class="h-4 w-4" />
                <Eye v-else class="h-4 w-4" />
              </button>
              <div v-if="account.password" class="mt-2 flex items-center gap-2" aria-live="polite">
                <div class="flex flex-1 gap-1">
                  <span
                    v-for="i in 3"
                    :key="i"
                    class="h-1 flex-1 rounded-full transition-colors"
                    :class="
                      strength >= i
                        ? strength === 1
                          ? 'bg-warning-600'
                          : 'bg-success-600'
                        : 'bg-border'
                    "
                  />
                </div>
                <span class="text-fg-subtle text-xs">{{ STRENGTH[strength] }}</span>
              </div>
            </div>
            <button
              type="submit"
              class="btn-brand flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
            >
              التالي: منشأتك
              <ArrowLeft class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
            </button>
          </form>
        </section>

        <!-- 2 · business -->
        <section v-else-if="step === 2" aria-labelledby="s2">
          <h1 id="s2" class="font-display text-fg mb-2 text-2xl font-bold sm:text-3xl">
            عرّفنا على منشأتك
          </h1>
          <p class="text-fg-muted mb-8">يظهر هذا لعملائك أعلى صفحة الحجز.</p>
          <form class="space-y-6" @submit.prevent="next">
            <BaseInput
              v-model="biz.name"
              class="max-w-md"
              label="اسم المنشأة"
              required
              placeholder="مثلاً: صالون لمسة"
              :error="err('name')"
            />

            <div>
              <p class="text-fg-muted mb-2 text-[13px] font-semibold">نوع النشاط</p>
              <div
                role="radiogroup"
                aria-label="نوع النشاط"
                class="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                <button
                  v-for="s in SECTORS"
                  :key="s.key"
                  type="button"
                  role="radio"
                  :aria-checked="biz.sector === s.key"
                  class="flex items-center gap-2.5 rounded-[var(--radius-md)] border p-3 text-start text-sm font-semibold transition-colors"
                  :class="
                    biz.sector === s.key
                      ? 'border-fg bg-surface ring-fg ring-1'
                      : 'border-border bg-surface text-fg-muted hover:border-fg-faint'
                  "
                  @click="biz.sector = s.key"
                >
                  <component
                    :is="SECTOR_ICONS[s.icon]"
                    class="h-5 w-5 shrink-0"
                    :class="biz.sector === s.key ? 'text-primary-fg' : 'text-fg-subtle'"
                    aria-hidden="true"
                  />
                  <span class="text-fg">{{ s.label }}</span>
                </button>
              </div>
            </div>

            <BaseInput
              v-model="biz.address"
              class="max-w-md"
              label="الحي والمدينة"
              :icon="MapPin"
              placeholder="مثلاً: حي النرجس، الرياض"
              hint="اختياري. يظهر لعملائك مع رابط الخريطة."
            />

            <div class="max-w-md">
              <label for="slug" class="text-fg-muted mb-1.5 block text-[13px] font-semibold"
                >رابط صفحة الحجز</label
              >
              <div
                class="bg-surface focus-within:border-fg flex items-center overflow-hidden rounded-[var(--radius-md)] border transition-colors"
                :class="err('slug') ? 'border-danger-600' : 'border-border'"
                dir="ltr"
              >
                <span
                  class="bg-surface-sunken text-fg-subtle border-border border-e px-3 py-2.5 text-sm"
                  >waeda.app/b/</span
                >
                <input
                  id="slug"
                  :value="biz.slug"
                  class="text-fg min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-semibold outline-none"
                  autocomplete="off"
                  spellcheck="false"
                  aria-describedby="slug-state"
                  @input="onSlugInput"
                />
                <span class="px-3" aria-hidden="true">
                  <Loader2
                    v-if="slugState === 'checking'"
                    class="text-fg-subtle h-4 w-4 animate-spin"
                  />
                  <Check v-else-if="slugState === 'available'" class="text-success-700 h-4 w-4" />
                  <X v-else-if="slugState === 'taken'" class="text-danger-700 h-4 w-4" />
                </span>
              </div>
              <p
                id="slug-state"
                class="mt-1.5 text-xs"
                :class="err('slug') ? 'text-danger-700' : 'text-fg-subtle'"
                aria-live="polite"
              >
                {{
                  err('slug') ??
                  (slugState === 'available'
                    ? 'الرابط متاح.'
                    : slugState === 'taken'
                      ? 'هذا الرابط مأخوذ، جرّب غيره.'
                      : 'هذا ما ترسله لعملائك. تقدر تغيّره الآن.')
                }}
              </p>
            </div>

            <div class="flex max-w-md gap-2">
              <button
                type="button"
                class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-semibold"
                @click="back"
              >
                <ArrowRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" /> السابق
              </button>
              <button
                type="submit"
                class="btn-brand flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
              >
                التالي: صفحتك
                <ArrowLeft class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>

        <!-- 3 · page -->
        <section v-else aria-labelledby="s3">
          <h1 id="s3" class="font-display text-fg mb-2 text-2xl font-bold sm:text-3xl">
            جهّز صفحة الحجز
          </h1>
          <p class="text-fg-muted mb-8">
            جهّزنا لك خدمات {{ sector.label }} المعتادة. عدّل ما تريد، وكل شيء يتغير لاحقاً من
            الإعدادات.
          </p>

          <!-- services -->
          <div class="mb-8">
            <p class="text-fg mb-3 font-bold">الخدمات</p>
            <ul
              class="border-border bg-surface divide-border divide-y rounded-[var(--radius-lg)] border"
            >
              <li
                v-for="(s, i) in services"
                :key="i"
                class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[auto_1fr_8rem_7rem]"
                :class="!s.keep && 'opacity-50'"
              >
                <input
                  v-model="s.keep"
                  type="checkbox"
                  class="accent-fg h-4 w-4"
                  :aria-label="`إظهار ${s.name || 'الخدمة'}`"
                />
                <input
                  v-model="s.name"
                  class="text-fg border-border focus:border-fg min-w-0 rounded-[var(--radius-sm)] border bg-transparent px-2.5 py-2 text-sm font-semibold outline-none"
                  placeholder="اسم الخدمة"
                  aria-label="اسم الخدمة"
                />
                <select
                  v-model.number="s.durationMin"
                  class="border-border bg-surface text-fg col-start-2 rounded-[var(--radius-sm)] border px-2 py-2 text-sm sm:col-start-auto"
                  aria-label="المدة"
                >
                  <option v-for="d in DURATIONS" :key="d" :value="d">{{ duration(d) }}</option>
                </select>
                <label
                  class="border-border focus-within:border-fg col-start-2 flex items-center rounded-[var(--radius-sm)] border sm:col-start-auto"
                >
                  <input
                    v-model.number="s.price"
                    type="text"
                    inputmode="numeric"
                    class="text-fg w-full min-w-0 bg-transparent px-2.5 py-2 text-sm outline-none"
                    aria-label="السعر بالريال"
                    dir="ltr"
                  />
                  <span class="text-fg-subtle pe-2.5 text-xs">ر.س</span>
                </label>
              </li>
            </ul>
            <button
              type="button"
              class="text-fg hover:text-primary-fg mt-2 flex items-center gap-1.5 text-sm font-semibold"
              @click="addService"
            >
              <Plus class="h-4 w-4" aria-hidden="true" /> أضف خدمة
            </button>
            <p v-if="err('services')" class="text-danger-700 mt-1 text-sm">{{ err('services') }}</p>
          </div>

          <!-- staff -->
          <div class="mb-8">
            <p class="text-fg mb-1 font-bold">{{ sector.staffTitle ?? 'فريقك' }}</p>
            <p class="text-fg-subtle mb-3 text-sm">
              {{ sector.staffHint ?? 'كل شخص له جدول مستقل، وعميلك يقدر يختار مع من يحجز.' }}
            </p>
            <div class="mb-2 flex flex-wrap gap-2">
              <span
                v-for="(m, i) in staff"
                :key="i"
                class="border-border bg-surface text-fg flex items-center gap-2 rounded-full border py-1 ps-1 pe-2 text-sm font-medium"
              >
                <span
                  class="bg-surface-sunken grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold"
                  aria-hidden="true"
                  >{{ isPlaces ? m.name.replace(/\D/g, '') || '•' : initialOf(m.name) }}</span
                >
                {{ m.name }}
                <button
                  type="button"
                  class="text-fg-faint hover:text-fg"
                  :aria-label="`إزالة ${m.name}`"
                  @click="staff.splice(i, 1)"
                >
                  <X class="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            <form class="flex max-w-md gap-2" @submit.prevent="addStaff">
              <input
                v-model="newStaff"
                class="border-border bg-surface text-fg focus:border-fg min-w-0 flex-1 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm outline-none"
                :placeholder="`مثلاً: ${sector.staffPlaceholder}`"
                :aria-label="`اسم ${sector.staffRole}`"
              />
              <button
                type="submit"
                class="border-border bg-surface text-fg hover:bg-surface-hover shrink-0 rounded-[var(--radius-md)] border px-4 text-sm font-semibold"
              >
                إضافة
              </button>
            </form>
            <p v-if="err('staff')" class="text-danger-700 mt-1 text-sm">{{ err('staff') }}</p>
          </div>

          <!-- hours -->
          <div class="mb-8">
            <p class="text-fg mb-3 font-bold">ساعات العمل</p>
            <div role="radiogroup" aria-label="ساعات العمل" class="grid gap-2 sm:grid-cols-3">
              <button
                v-for="h in HOURS_PRESETS"
                :key="h.key"
                type="button"
                role="radio"
                :aria-checked="hoursKey === h.key"
                class="rounded-[var(--radius-md)] border p-3 text-start transition-colors"
                :class="
                  hoursKey === h.key
                    ? 'border-fg bg-surface ring-fg ring-1'
                    : 'border-border bg-surface hover:border-fg-faint'
                "
                @click="hoursKey = h.key"
              >
                <span class="text-fg block text-sm font-bold">{{ h.label }}</span>
                <span class="text-fg-subtle block text-xs">{{ h.detail }}</span>
              </button>
            </div>
          </div>

          <div class="flex max-w-md gap-2">
            <button
              type="button"
              class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-semibold"
              @click="back"
            >
              <ArrowRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" /> السابق
            </button>
            <button
              type="button"
              class="btn-brand flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
              :disabled="submitting"
              @click="create"
            >
              <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" aria-hidden="true" />
              {{ submitting ? 'جاري الإنشاء…' : 'أنشئ صفحة الحجز' }}
            </button>
          </div>
        </section>
      </div>

      <!-- the page, building itself -->
      <aside class="hidden lg:block" aria-label="معاينة صفحة الحجز">
        <div class="sticky top-8">
          <p class="text-fg-subtle mb-3 text-center text-xs font-semibold">هكذا يرى عملاؤك صفحتك</p>
          <PhoneFrame class="mx-auto h-[34rem] w-[17rem]" time="9:41">
            <div class="flex h-full flex-col overflow-hidden">
              <div class="border-border border-b px-4 pt-2 pb-3">
                <div class="flex items-center gap-2.5">
                  <span
                    class="bg-ink font-display grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-sm font-bold text-white"
                    >{{ preview.initial }}</span
                  >
                  <div class="min-w-0">
                    <p class="text-fg truncate text-[13px] font-bold">{{ preview.name }}</p>
                    <p class="text-fg-subtle truncate text-[10px]">{{ preview.category }}</p>
                  </div>
                </div>
                <p
                  v-if="preview.address"
                  class="text-fg-subtle mt-1.5 flex items-center gap-1 truncate text-[10px]"
                >
                  <MapPin class="h-3 w-3 shrink-0" />{{ preview.address }}
                </p>
              </div>
              <div class="flex-1 space-y-3 overflow-hidden px-4 py-3">
                <p class="text-fg text-[11px] font-bold">الخدمة</p>
                <TransitionGroup tag="ul" name="row" class="space-y-1.5">
                  <li
                    v-for="(s, i) in preview.services.slice(0, 4)"
                    :key="s.name + i"
                    class="border-border flex items-center gap-2 rounded-[8px] border px-2.5 py-2"
                    :class="i === 0 && 'border-fg'"
                  >
                    <component
                      :is="iconFor(s.iconKey)"
                      class="text-fg-subtle h-3.5 w-3.5 shrink-0"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="text-fg block truncate text-[11px] font-semibold">{{
                        s.name || 'خدمة جديدة'
                      }}</span>
                      <span class="text-fg-subtle text-[9px]">{{ duration(s.durationMin) }}</span>
                    </span>
                    <span class="text-fg shrink-0 text-[10px] font-bold" data-numeric>{{
                      price(s.price)
                    }}</span>
                  </li>
                </TransitionGroup>
                <p class="text-fg pt-1 text-[11px] font-bold">
                  {{ isPlaces ? 'أي ملعب؟' : 'مع من؟' }}
                </p>
                <div class="flex flex-wrap gap-1">
                  <span
                    class="bg-fg text-fg-inverse rounded-full px-2 py-0.5 text-[9px] font-semibold"
                    >{{ isPlaces ? 'أول ملعب متاح' : 'أي متاح' }}</span
                  >
                  <span
                    v-for="(m, i) in preview.staff.slice(0, 3)"
                    :key="m.name + i"
                    class="border-border text-fg rounded-full border px-2 py-0.5 text-[9px]"
                    >{{ m.name }}</span
                  >
                </div>
              </div>
              <div class="border-border border-t p-3">
                <span
                  class="bg-primary block rounded-[8px] py-2 text-center text-[11px] font-bold text-white"
                  >احجز موعدك</span
                >
              </div>
            </div>
          </PhoneFrame>
          <p class="text-fg-faint mt-3 text-center text-[11px]" dir="ltr">
            waeda.app/b/{{ biz.slug || '…' }}
          </p>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.row-enter-active,
.row-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
