<script setup>
import { computed, ref } from 'vue'
import {
  Briefcase,
  CalendarDays,
  Check,
  GraduationCap,
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
  active.value = next.key
  document.getElementById(`sector-tab-${next.key}`)?.focus()
}
</script>

<template>
  <section id="sectors" class="section bg-surface">
    <div class="section-inner">
      <header class="mb-12 max-w-2xl md:mb-16">
        <h2 v-reveal class="type-h1 text-fg mb-4">لمن تناسب وعدة؟</h2>
        <p v-reveal="60" class="type-lede">
          لكل منشأة تعمل بالمواعيد. اختر نشاطك وشاهد كيف تبدو صفحة الحجز لعملائك.
        </p>
      </header>

      <div class="grid gap-8 lg:grid-cols-[20rem_1fr] lg:gap-12">
        <!-- tabs -->
        <div
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
            class="group flex shrink-0 items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-start transition-colors lg:py-4"
            :class="
              active === s.key
                ? 'border-fg bg-surface'
                : 'border-border hover:bg-surface-hover lg:border-transparent'
            "
            @click="active = s.key"
            @keydown="onKey($event, i)"
          >
            <component
              :is="s.icon"
              class="mt-0.5 h-5 w-5 shrink-0"
              :class="active === s.key ? 'text-primary-fg' : 'text-fg-subtle'"
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
              <div class="border-border mb-4 flex items-center gap-3 border-b pb-4">
                <span
                  class="bg-ink grid h-10 w-10 place-items-center rounded-[var(--radius-md)] text-white"
                  aria-hidden="true"
                >
                  <component :is="sector.icon" class="h-5 w-5" />
                </span>
                <div>
                  <p class="text-fg font-bold">{{ sector.business }}</p>
                  <p class="text-fg-subtle text-xs" dir="ltr">waeda.app/{{ sector.key }}</p>
                </div>
              </div>

              <p class="text-fg-subtle mb-2 text-xs font-semibold">الخدمة</p>
              <ul class="mb-5 space-y-2">
                <li
                  v-for="(svc, i) in sector.services"
                  :key="svc.name"
                  class="flex items-center justify-between rounded-[var(--radius-md)] border px-3.5 py-2.5"
                  :class="i === 0 ? 'border-primary bg-primary-soft' : 'border-border'"
                >
                  <span>
                    <span class="text-fg block text-sm font-semibold">{{ svc.name }}</span>
                    <span class="text-fg-subtle text-xs">{{ svc.meta }}</span>
                  </span>
                  <span class="text-fg text-sm font-semibold" data-numeric>{{ svc.price }}</span>
                </li>
              </ul>

              <p class="text-fg-subtle mb-2 text-xs font-semibold">{{ sector.who }}</p>
              <div class="mb-5 flex flex-wrap gap-2">
                <span
                  v-for="(p, i) in sector.staff"
                  :key="p"
                  class="rounded-full border px-3 py-1 text-xs font-medium"
                  :class="i === 0 ? 'border-fg text-fg' : 'border-border text-fg-muted'"
                  >{{ p }}</span
                >
              </div>

              <p class="text-fg-subtle mb-2 text-xs font-semibold">أقرب الأوقات، غداً</p>
              <div class="grid grid-cols-3 gap-2">
                <span
                  v-for="(t, i) in TIMES"
                  :key="t"
                  class="rounded-[var(--radius-sm)] border py-2 text-center text-xs font-semibold"
                  :class="
                    i === 2
                      ? 'border-border bg-surface-sunken text-fg-faint line-through'
                      : 'border-border text-fg'
                  "
                  data-numeric
                  >{{ t }}</span
                >
              </div>
            </div>
          </Transition>

          <Transition name="swap" mode="out-in">
            <div :key="sector.key" class="self-center">
              <p class="text-fg mb-4 font-bold">
                ما يهمّ {{ sector.short === 'أي نشاط' ? 'نشاطك' : sector.short }}
              </p>
              <ul class="space-y-3">
                <li
                  v-for="p in sector.points"
                  :key="p"
                  class="text-fg-muted flex gap-2.5 text-[15px]"
                >
                  <Check class="text-primary-fg mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
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
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.swap-leave-to {
  opacity: 0;
}
</style>
