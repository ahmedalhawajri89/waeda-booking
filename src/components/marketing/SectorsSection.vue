<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Briefcase,
  CalendarDays,
  Check,
  GraduationCap,
  Pause,
  Play,
  Scissors,
  Stethoscope,
  Trophy,
  UtensilsCrossed,
} from 'lucide-vue-next'

/**
 * One product, seven kinds of business. Picking a sector rewrites the booking
 * page beside it with that sector's own services, people and words, so the
 * visitor sees their business rather than a generic one.
 */
const SECTORS = [
  {
    key: 'clinic',
    icon: Stethoscope,
    label: 'العيادات والمراكز الطبية',
    short: 'العيادات',
    line: 'حجوزات المرضى وتنظيم مواعيد الأطباء.',
    business: 'عيادات النخبة',
    who: 'الطبيب',
    staff: ['د. سارة', 'د. خالد', 'أي طبيب'],
    services: [
      { name: 'كشف عام', meta: '20 دقيقة', price: '150 ر.س' },
      { name: 'استشارة أسنان', meta: '30 دقيقة', price: '200 ر.س' },
      { name: 'مراجعة', meta: '15 دقيقة', price: '80 ر.س' },
    ],
    points: [
      'جدول مستقل لكل طبيب وغرفة',
      'تذكير يطلب التأكيد قبل الموعد بيوم',
      'ملف لكل مريض وسجل زياراته',
    ],
  },
  {
    key: 'salon',
    icon: Scissors,
    label: 'الصالونات ومراكز التجميل',
    short: 'الصالونات',
    line: 'حجز الجلسات وتوزيعها على أوقات العمل.',
    business: 'صالون لمسة',
    who: 'الأخصائية',
    staff: ['أ. ريم', 'أ. هيا', 'أي أخصائية'],
    services: [
      { name: 'قص وتصفيف', meta: '45 دقيقة', price: '120 ر.س' },
      { name: 'صبغة كاملة', meta: '90 دقيقة', price: '350 ر.س' },
      { name: 'تنظيف بشرة', meta: '60 دقيقة', price: '220 ر.س' },
    ],
    points: [
      'مدة كل خدمة ووقت التجهيز بعدها',
      'العربون يُسجَّل مع الحجز',
      'قائمة انتظار للأيام المزدحمة',
    ],
  },
  {
    key: 'training',
    icon: GraduationCap,
    label: 'مراكز التدريب والتعليم',
    short: 'التدريب',
    line: 'حجز المحاضرات والحصص التدريبية.',
    business: 'أكاديمية المسار',
    who: 'المدرّب',
    staff: ['أ. فهد', 'أ. منى', 'القاعة الكبرى'],
    services: [
      { name: 'حصة خصوصية', meta: '60 دقيقة', price: '120 ر.س' },
      { name: 'ورشة جماعية', meta: 'ساعتان', price: '300 ر.س' },
      { name: 'تحديد مستوى', meta: '30 دقيقة', price: 'مجاناً' },
    ],
    points: ['القاعات والمدربون كموارد مستقلة', 'تذكير للطالب وولي الأمر', 'سجل حضور لكل متدرب'],
  },
  {
    key: 'services',
    icon: Briefcase,
    label: 'الشركات ومقدمو الخدمات',
    short: 'الخدمات',
    line: 'حجز الاستشارات ومواعيد العملاء.',
    business: 'مكتب الراية للاستشارات',
    who: 'المستشار',
    staff: ['م. عبدالله', 'أ. نوف', 'أي مستشار'],
    services: [
      { name: 'استشارة أولية', meta: '30 دقيقة', price: 'مجاناً' },
      { name: 'جلسة استشارية', meta: '60 دقيقة', price: '400 ر.س' },
      { name: 'زيارة ميدانية', meta: 'ساعتان', price: '750 ر.س' },
    ],
    points: [
      'رابط حجز تضعه في توقيع بريدك',
      'ملاحظات العميل تصلك قبل الاجتماع',
      'إعادة جدولة دون مراسلات',
    ],
  },
  {
    key: 'restaurant',
    icon: UtensilsCrossed,
    label: 'المطاعم والمقاهي',
    short: 'المطاعم',
    line: 'إدارة حجوزات الطاولات وأوقات الذروة.',
    business: 'مطعم سُفرة',
    who: 'القسم',
    staff: ['الصالة', 'الجلسات الخارجية', 'الركن العائلي'],
    services: [
      { name: 'طاولة لشخصين', meta: '90 دقيقة', price: 'بلا رسوم' },
      { name: 'طاولة عائلية', meta: 'ساعتان', price: 'عربون 50 ر.س' },
      { name: 'جلسة خاصة', meta: 'ساعتان', price: 'عربون 150 ر.س' },
    ],
    points: ['كل طاولة أو قسم بجدوله', 'تأكيد قبل الحجز بساعات', 'تعرف أوقات الذروة من الأرقام'],
  },
  {
    key: 'sports',
    icon: Trophy,
    label: 'الملاعب والنوادي الرياضية',
    short: 'الملاعب',
    line: 'حجز الملاعب بالساعة، بسعر المساء، وحتى الفجر.',
    business: 'نادي الأوج للبادل',
    who: 'الملعب',
    staff: ['ملعب 1', 'ملعب 2', 'أول ملعب متاح'],
    services: [
      { name: 'ملعب بادل', meta: '60 · 90 · 120 دقيقة', price: 'من 150 ر.س' },
      { name: 'ملعب كرة خماسي', meta: '60 · 90 دقيقة', price: 'من 250 ر.س' },
      { name: 'حجز أسبوعي ثابت', meta: 'كل أسبوع', price: 'بنفس السعر' },
    ],
    points: [
      'العميل يختار المدة، والسعر يتغير معها',
      'سعر أعلى بعد العصر يُحسب تلقائياً',
      'دوام حتى الفجر وحجز أسبوعي متكرر',
    ],
  },
  {
    key: 'any',
    icon: CalendarDays,
    label: 'أي مشروع يحتاج إلى تنظيم مواعيده',
    short: 'أي نشاط',
    line: 'أي نشاط يحتاج إلى تنظيم مواعيده بطريقة واضحة.',
    business: 'منشأتك',
    who: 'الموظف',
    staff: ['الفريق', 'الفرع الرئيسي', 'أي موظف'],
    services: [
      { name: 'موعد قصير', meta: '30 دقيقة', price: '100 ر.س' },
      { name: 'موعد عادي', meta: '60 دقيقة', price: '180 ر.س' },
      { name: 'زيارة', meta: '90 دقيقة', price: '250 ر.س' },
    ],
    points: [
      'خدماتك ومددها وأسعارها كما تحددها',
      'ساعات عمل مختلفة لكل يوم',
      'يعمل على الجوال لك ولعملائك',
    ],
  },
]

const active = ref(SECTORS[0].key)
const sector = computed(() => SECTORS.find((s) => s.key === active.value))
const TIMES = ['9:30 ص', '10:00 ص', '11:30 ص', '1:00 م', '4:30 م', '6:00 م']
/** 11:30 is taken on every page: a full day is part of the picture. */
const TAKEN = 2

/* ---------------------------------------------------------------- tour
 * Most visitors never click a tab, so the section shows them round itself:
 * each sector for a few seconds, a bar under its tab filling as it goes. It
 * runs while the section is on screen, holds while pointed at or focused,
 * stops for good on a click or after one full round, and has its own pause
 * button (moving content must be stoppable). Never with reduced motion.
 */
const DWELL_MS = 6500
const reduced =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const touring = ref(!reduced)
const userPaused = ref(false)
const hovering = ref(false)
const inView = ref(false)
const playing = computed(
  () => touring.value && !userPaused.value && !hovering.value && inView.value,
)
let visited = 1

function advance() {
  if (visited >= SECTORS.length) {
    // One full round, then back to the first page and quiet.
    touring.value = false
    show(SECTORS[0].key)
    return
  }
  visited += 1
  const i = SECTORS.findIndex((s) => s.key === active.value)
  show(SECTORS[(i + 1) % SECTORS.length].key)
}

function pick(key) {
  touring.value = false
  show(key)
}

const tablist = ref(null)
function show(key) {
  active.value = key
  book()
  // On a phone the tabs scroll sideways: bring this one into the strip
  // without moving the page itself.
  const list = tablist.value
  const tab = document.getElementById(`sector-tab-${key}`)
  if (list && tab && list.scrollWidth > list.clientWidth) {
    list.scrollTo({
      left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }
}

/* --------------------------------------------------- a booking, made live
 * On each page a customer books: a service, a person, a time, then the
 * confirmation slides in. The same scene plays for a sector picked by hand.
 */
const sel = ref(0)
const who = ref(0)
const time = ref(null)
const booked = ref(false)
const tap = ref(0)
const scene = []
function book() {
  scene.forEach(clearTimeout)
  scene.length = 0
  sel.value = 0
  who.value = 0
  time.value = null
  booked.value = false
  if (reduced) return
  const at = (ms, fn) => scene.push(setTimeout(fn, ms))
  at(1000, () => {
    sel.value = 1
    tap.value += 1
  })
  at(2000, () => (who.value = 1))
  at(3000, () => (time.value = 3))
  at(3900, () => (booked.value = true))
}

const root = ref(null)
let io
onMounted(() => {
  if (reduced) return
  io = new IntersectionObserver(
    ([e]) => {
      const was = inView.value
      inView.value = e.isIntersecting
      // The first page's booking plays when the section is first seen.
      if (e.isIntersecting && !was && !booked.value && !scene.length) book()
    },
    { threshold: 0.35 },
  )
  io.observe(root.value)
})
onBeforeUnmount(() => {
  io?.disconnect()
  scene.forEach(clearTimeout)
})

function onKey(e, i) {
  const d =
    e.key === 'ArrowDown' || e.key === 'ArrowLeft'
      ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? -1
        : 0
  if (!d) return
  e.preventDefault()
  const next = SECTORS[(i + d + SECTORS.length) % SECTORS.length]
  pick(next.key)
  document.getElementById(`sector-tab-${next.key}`)?.focus()
}
</script>

<template>
  <section id="sectors" ref="root" class="section bg-surface">
    <div class="section-inner">
      <header class="mb-12 max-w-2xl md:mb-16">
        <h2 v-reveal class="type-h1 text-fg mb-4">لمن تناسب وعدة؟</h2>
        <p v-reveal="60" class="type-lede">
          لكل منشأة تعمل بالمواعيد. اختر نشاطك وشاهد كيف تبدو صفحة الحجز لعملائك.
        </p>
      </header>

      <div
        class="grid gap-8 lg:grid-cols-[20rem_1fr] lg:gap-12"
        @pointerenter="hovering = true"
        @pointerleave="hovering = false"
        @focusin="hovering = true"
        @focusout="hovering = false"
      >
        <!-- min-w-0: the tab strip scrolls sideways on a phone; without it this
             grid cell took the whole strip's width and pushed the page wide. -->
        <div class="min-w-0">
          <!-- tabs -->
          <div
            ref="tablist"
            role="tablist"
            aria-label="القطاعات"
            aria-orientation="vertical"
            class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
          >
            <button
              v-for="(s, i) in SECTORS"
              :id="`sector-tab-${s.key}`"
              :key="s.key"
              type="button"
              role="tab"
              :aria-selected="active === s.key"
              aria-controls="sector-panel"
              :tabindex="active === s.key ? 0 : -1"
              class="group relative flex shrink-0 items-start gap-3 overflow-hidden rounded-[var(--radius-lg)] border px-4 py-3 text-start transition-colors lg:py-4"
              :class="
                active === s.key
                  ? 'border-fg bg-surface'
                  : 'border-border hover:bg-surface-hover lg:border-transparent'
              "
              @click="pick(s.key)"
              @keydown="onKey($event, i)"
            >
              <component
                :is="s.icon"
                class="mt-0.5 h-5 w-5 shrink-0 transition-transform duration-300"
                :class="active === s.key ? 'text-primary-fg scale-110' : 'text-fg-subtle'"
                aria-hidden="true"
              />
              <span>
                <span
                  class="text-fg block text-[15px] font-bold whitespace-nowrap lg:whitespace-normal"
                >
                  <span class="lg:hidden">{{ s.short }}</span>
                  <span class="hidden lg:inline">{{ s.label }}</span>
                </span>
                <span class="text-fg-subtle mt-0.5 hidden text-[13px] lg:block">{{ s.line }}</span>
              </span>
              <!-- how long until the tour moves on -->
              <span
                v-if="touring && active === s.key"
                :key="`bar-${s.key}`"
                class="tour-bar bg-primary absolute bottom-0 h-0.5"
                :style="{
                  animationDuration: `${DWELL_MS}ms`,
                  animationPlayState: playing ? 'running' : 'paused',
                }"
                aria-hidden="true"
                @animationend="advance"
              />
            </button>
          </div>

          <button
            v-if="touring"
            type="button"
            class="text-fg-subtle hover:text-fg mt-3 hidden items-center gap-1.5 px-1 py-1 text-xs font-semibold lg:inline-flex"
            @click="userPaused = !userPaused"
          >
            <component :is="userPaused ? Play : Pause" class="h-3.5 w-3.5" aria-hidden="true" />
            {{ userPaused ? 'تشغيل الجولة' : 'إيقاف الجولة' }}
          </button>
        </div>

        <!-- panel -->
        <div
          id="sector-panel"
          role="tabpanel"
          :aria-labelledby="`sector-tab-${active}`"
          class="bg-surface-sunken grid gap-8 rounded-[var(--radius-xl)] p-5 sm:p-8 md:grid-cols-[1fr_15rem]"
        >
          <Transition name="swap" mode="out-in">
            <div
              :key="sector.key"
              class="border-border bg-surface rounded-[var(--radius-lg)] border p-5"
            >
              <div class="rise border-border mb-4 flex items-center gap-3 border-b pb-4">
                <span
                  class="pop bg-ink grid h-10 w-10 place-items-center rounded-[var(--radius-md)] text-white"
                  aria-hidden="true"
                >
                  <component :is="sector.icon" class="h-5 w-5" />
                </span>
                <div>
                  <p class="text-fg font-bold">{{ sector.business }}</p>
                  <p class="text-fg-subtle text-xs" dir="ltr">waeda.app/{{ sector.key }}</p>
                </div>
              </div>

              <p class="rise text-fg-subtle mb-2 text-xs font-semibold" style="--d: 60ms">الخدمة</p>
              <ul class="mb-5 space-y-2">
                <li
                  v-for="(svc, i) in sector.services"
                  :key="svc.name"
                  class="rise relative flex items-center justify-between overflow-hidden rounded-[var(--radius-md)] border px-3.5 py-2.5 transition-colors duration-300"
                  :class="i === sel ? 'border-primary bg-primary-soft' : 'border-border'"
                  :style="{ '--d': `${100 + i * 60}ms` }"
                >
                  <span>
                    <span class="text-fg block text-sm font-semibold">{{ svc.name }}</span>
                    <span class="text-fg-subtle text-xs">{{ svc.meta }}</span>
                  </span>
                  <span class="text-fg text-sm font-semibold" data-numeric>{{ svc.price }}</span>
                  <span v-if="i === sel && tap" :key="tap" class="ripple" aria-hidden="true" />
                </li>
              </ul>

              <p class="rise text-fg-subtle mb-2 text-xs font-semibold" style="--d: 300ms">
                {{ sector.who }}
              </p>
              <div class="rise mb-5 flex flex-wrap gap-2" style="--d: 340ms">
                <span
                  v-for="(p, i) in sector.staff"
                  :key="p"
                  class="rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-300"
                  :class="
                    i === who ? 'border-fg bg-fg text-fg-inverse' : 'border-border text-fg-muted'
                  "
                  >{{ p }}</span
                >
              </div>

              <p class="rise text-fg-subtle mb-2 text-xs font-semibold" style="--d: 380ms">
                أقرب الأوقات، غداً
              </p>
              <div class="rise grid grid-cols-3 gap-2" style="--d: 420ms">
                <span
                  v-for="(t, i) in TIMES"
                  :key="t"
                  class="rounded-[var(--radius-sm)] border py-2 text-center text-xs font-semibold transition-colors duration-300"
                  :class="
                    i === TAKEN
                      ? 'border-border bg-surface-sunken text-fg-faint line-through'
                      : i === time
                        ? 'border-primary bg-primary text-fg-on-primary'
                        : 'border-border text-fg'
                  "
                  data-numeric
                  >{{ t }}</span
                >
              </div>

              <!-- the page's answer; its room is kept so nothing jumps -->
              <div class="mt-4 h-10">
                <Transition name="booked">
                  <p
                    v-if="booked"
                    class="bg-success-50 text-success-700 flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm font-semibold"
                  >
                    <Check class="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span class="truncate">
                      تم الحجز · {{ sector.services[sel]?.name }} · {{ TIMES[time] }}
                    </span>
                  </p>
                </Transition>
              </div>
            </div>
          </Transition>

          <Transition name="swap" mode="out-in">
            <div :key="sector.key" class="self-center">
              <p class="rise text-fg mb-4 font-bold" style="--d: 120ms">
                ما يهمّ {{ sector.short === 'أي نشاط' ? 'نشاطك' : sector.short }}
              </p>
              <ul class="space-y-3">
                <li
                  v-for="(p, i) in sector.points"
                  :key="p"
                  class="rise text-fg-muted flex gap-2.5 text-[15px]"
                  :style="{ '--d': `${200 + i * 90}ms` }"
                >
                  <Check
                    class="draw text-primary-fg mt-1 h-4 w-4 shrink-0"
                    :style="{ '--d': `${320 + i * 90}ms` }"
                    aria-hidden="true"
                  />
                  {{ p }}
                </li>
              </ul>
              <RouterLink
                to="/book"
                class="text-fg hover:text-primary-fg decoration-border-strong mt-6 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4 transition-colors"
              >
                جرّب صفحة حجز حقيقية
              </RouterLink>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.swap-enter-active,
.swap-leave-active {
  transition: opacity 0.2s ease;
}
.swap-enter-from,
.swap-leave-to {
  opacity: 0;
}

/* Each page comes in piece by piece, top to bottom. */
.rise {
  animation: rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--d, 0ms);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.pop {
  animation: pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
}
/* The tick of each point is drawn rather than shown. */
.draw :deep(path) {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: draw 0.45s ease-out forwards;
  animation-delay: var(--d, 0ms);
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

/* The customer's tap on a service. */
.ripple {
  position: absolute;
  inset-inline-start: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  margin: -12px;
  border-radius: 999px;
  background: var(--color-primary);
  opacity: 0.25;
  animation: ripple 0.6s ease-out forwards;
  pointer-events: none;
}
@keyframes ripple {
  to {
    transform: scale(9);
    opacity: 0;
  }
}

/* Fills from the start edge: the right in Arabic. */
.tour-bar {
  inset-inline-start: 0;
  width: 100%;
  transform-origin: right;
  animation-name: fill;
  animation-timing-function: linear;
  animation-fill-mode: both;
}
@keyframes fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

.booked-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
.booked-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

@media (prefers-reduced-motion: reduce) {
  .rise,
  .pop,
  .draw :deep(path) {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
