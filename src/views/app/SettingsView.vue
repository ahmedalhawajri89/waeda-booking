<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  Building2,
  Clock,
  Copy,
  ExternalLink,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  CreditCard,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { businessHours, resources, services } from '@/data/catalog'
import { business, initialOf } from '@/data/business'
import { duration, money } from '@/lib/format'
import { SERVICE_ICON_KEYS, SERVICE_ICON_LABELS, iconFor } from '@/lib/icons'
import { isDemoBackend, repository } from '@/data/repository'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SpecialPeriodsPanel from '@/components/settings/SpecialPeriodsPanel.vue'
import PrayerPanel from '@/components/settings/PrayerPanel.vue'
import PlanPanel from '@/components/settings/PlanPanel.vue'
import { useSubscriptionStore } from '@/stores/subscription'
import GuardPolicyForm from '@/components/guard/GuardPolicyForm.vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * The configuration the availability engine reads. This screen used to render
 * it read-only, which made the product look like a demo of someone else's
 * data — an operator could not change their own opening hours.
 *
 * Edits go through the settings store so they persist and stay one source of
 * truth with everything importing from data/catalog.
 */
const bookings = useBookingsStore()
const customers = useCustomersStore()
const settings = useSettingsStore()
const sub = useSubscriptionStore()
const router = useRouter()

/**
 * Seats are what the plans are priced on. At the limit, adding someone (or
 * switching someone back on) offers the upgrade instead of a form that the
 * server would refuse after it was filled in.
 */
function withinSeats(action) {
  const active = resources.filter((r) => r.isActive).length
  if (sub.canAddStaff(active)) return action()
  toast(`باقتك تسمح بـ${sub.plan.staff} من الفريق`, {
    description: 'رقِّ اشتراكك لإضافة المزيد، أو عطّل عضواً لا يعمل حالياً.',
    action: { label: 'الباقات', onClick: () => router.push('/app/settings?tab=plan') },
  })
}
const addStaff = () => withinSeats(() => (editingResource.value = settings.newResource()))
const toggleStaff = (r) =>
  r.isActive ? settings.toggleResource(r.id) : withinSeats(() => settings.toggleResource(r.id))
const auth = useAuthStore()

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const TABS = [
  { value: 'business', label: 'المنشأة', icon: Building2, hint: 'الاسم والعنوان ورابط الحجز' },
  { value: 'services', label: 'الخدمات', icon: Sparkles, hint: 'ما تقدّمه ومدته وسعره' },
  { value: 'resources', label: 'الفريق', icon: Users, hint: 'من يقدّم الخدمات' },
  { value: 'hours', label: 'ساعات العمل', icon: Clock, hint: 'متى تستقبل الحجوزات' },
  { value: 'guard', label: 'حارس المواعيد', icon: ShieldCheck, hint: 'التذكير وإعادة الملء' },
  { value: 'plan', label: 'الاشتراك', icon: CreditCard, hint: 'باقتك واستهلاكك' },
  { value: 'account', label: 'الحساب', icon: UserRound, hint: 'بريدك والبيانات' },
]
// Deep-linkable: the guard screen links straight to its policy.
const route = useRoute()
const tab = ref(TABS.some((t) => t.value === route.query.tab) ? route.query.tab : 'business')

onMounted(() => settings.load())

/* -------------------------------------------------------------- services */

const editing = ref(null)
const isNew = ref(false)

function editService(id) {
  const s = services.find((x) => x.id === id)
  if (!s) return
  isNew.value = false
  editing.value = {
    id: s.id,
    name: s.name,
    // Carried through, or saving a service used to erase its category.
    category: s.category ?? '',
    description: s.description,
    durationMin: s.durationMin,
    bufferMin: s.bufferMin,
    priceMinor: s.priceMinor,
    resourceIds: [...s.resourceIds],
    iconKey: settings.iconKeyOf(s.id),
    isActive: s.isActive,
  }
}

function addService() {
  isNew.value = true
  editing.value = { ...settings.newService(), category: services[0]?.category ?? '' }
}

// BaseInput speaks strings; these adapt the numeric fields, and clamp on the
// way in so a blank or negative entry cannot reach the model.
function numberField(key, min) {
  return computed({
    get: () => String(editing.value?.[key] ?? ''),
    set: (v) => {
      if (editing.value) editing.value[key] = Math.max(min, Math.round(Number(v)) || min)
    },
  })
}

const durationInput = numberField('durationMin', 5)
const bufferInput = numberField('bufferMin', 0)

/** Price is entered in riyals; the model stores halalas everywhere. */
const priceMajor = computed({
  get: () => String((editing.value?.priceMinor ?? 0) / 100),
  set: (v) => {
    if (editing.value) editing.value.priceMinor = Math.max(0, Math.round(Number(v) * 100) || 0)
  },
})

const canSaveService = computed(
  () =>
    !!editing.value &&
    editing.value.name.trim().length > 1 &&
    editing.value.durationMin > 0 &&
    editing.value.resourceIds.length > 0,
)

function commitService() {
  if (!editing.value || !canSaveService.value) return
  settings.saveService({
    ...editing.value,
    name: editing.value.name.trim(),
    category: editing.value.category?.trim() || null,
  })
  toast.success(isNew.value ? 'أُضيفت الخدمة' : 'حُفظت الخدمة')
  editing.value = null
}

function toggleResourceOn(row, resourceId) {
  const i = row.resourceIds.indexOf(resourceId)
  if (i === -1) row.resourceIds.push(resourceId)
  else row.resourceIds.splice(i, 1)
}

/** Categories already in use, offered while typing a new one. */
const categories = computed(() => [...new Set(services.map((s) => s.category).filter(Boolean))])
/** The services list, the way the booking page groups it. */
const serviceGroups = computed(() =>
  [...new Set(services.map((s) => s.category || 'بلا تصنيف'))].map((c) => ({
    name: c,
    items: services.filter((s) => (s.category || 'بلا تصنيف') === c),
  })),
)

/* -------------------------------------------------------------- business */

const profile = ref({ name: '', category: '', address: '' })
function startProfile() {
  profile.value = { name: business.name, category: business.category, address: business.address }
}
startProfile()
const profileDirty = computed(
  () =>
    profile.value.name !== business.name ||
    profile.value.category !== business.category ||
    profile.value.address !== business.address,
)
function commitProfile() {
  if (profile.value.name.trim().length < 2) return toast.error('اكتب اسم المنشأة')
  settings.saveBusiness({
    name: profile.value.name.trim(),
    category: profile.value.category.trim(),
    address: profile.value.address.trim(),
  })
  toast.success('حُفظت بيانات المنشأة، وتظهر الآن في صفحة الحجز')
}
const slug = computed(() => auth.user?.orgSlug || business.slug)
const bookingUrl = computed(() => `${window.location.origin}/b/${slug.value}`)
const bookingUrlShort = computed(() => bookingUrl.value.replace(/^https?:[/][/]/, ''))
async function copyLink() {
  try {
    await navigator.clipboard.writeText(bookingUrl.value)
    toast.success('نُسخ الرابط')
  } catch {
    toast.error('تعذّر النسخ')
  }
}

/* ----------------------------------------------------------------- hours */

const draftHours = ref([])
const hoursDirty = computed(
  () => JSON.stringify(draftHours.value) !== JSON.stringify(businessHours),
)

function startHours() {
  draftHours.value = businessHours.map((h) => ({ ...h }))
}
startHours()

function commitHours() {
  // A close before the open is a late night (16:00 to 02:00) and fine. The
  // same time twice is not a day at all, and would offer nothing, silently.
  const bad = draftHours.value.find((h) => !h.isClosed && h.close === h.open)
  if (bad) {
    toast.error(`${WEEKDAYS[bad.weekday]}: وقت الإغلاق لا يساوي وقت الفتح`)
    return
  }
  settings.saveHours(draftHours.value.map((h) => ({ ...h })))
  toast.success('حُفظت ساعات العمل')
}

/* ------------------------------------------------------------- resources */

const editingResource = ref(null)

function commitResource() {
  if (!editingResource.value || editingResource.value.name.trim().length < 1) return
  settings.saveResource({
    ...editingResource.value,
    name: editingResource.value.name.trim(),
    role: editingResource.value.role?.trim() || null,
  })
  toast.success('حُفظ')
  editingResource.value = null
}

/* ----------------------------------------------------------------- reset */

const confirmReset = ref(false)

async function resetData() {
  confirmReset.value = false
  await repository.reset()
  await settings.load(true)
  await bookings.load(true)
  await customers.load(true)
  startHours()
  startProfile()
  toast.success('أُعيدت البيانات التجريبية إلى حالتها الأولى')
}
</script>

<template>
  <div class="w-full p-4 lg:p-6 2xl:px-8">
    <header class="mb-5">
      <h1 class="type-h3 text-fg">الإعدادات</h1>
      <p class="text-fg-subtle text-sm">كل ما يراه عملاؤك في صفحة الحجز يُضبط من هنا.</p>
    </header>

    <div class="mb-4 overflow-x-auto lg:hidden">
      <BaseTabs v-model="tab" :items="TABS" label="أقسام الإعدادات" size="sm" />
    </div>

    <div class="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-8">
      <nav class="hidden lg:block" aria-label="أقسام الإعدادات">
        <ul class="sticky top-20 space-y-0.5">
          <li v-for="t in TABS" :key="t.value">
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-start transition-colors"
              :class="t.value === tab ? 'bg-surface-sunken' : 'hover:bg-surface-hover'"
              :aria-current="t.value === tab ? 'page' : undefined"
              @click="tab = t.value"
            >
              <component
                :is="t.icon"
                class="mt-0.5 h-4 w-4 shrink-0"
                :class="t.value === tab ? 'text-fg' : 'text-fg-subtle'"
                aria-hidden="true"
              />
              <span>
                <span class="text-fg block text-sm font-semibold">{{ t.label }}</span>
                <span class="text-fg-subtle block text-xs">{{ t.hint }}</span>
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <div class="max-w-4xl min-w-0 space-y-5">
        <ErrorState v-if="settings.error" :message="settings.error" @retry="settings.load(true)" />

        <!-- ------------------------------------------------------- business -->
        <section v-else-if="tab === 'business'" class="space-y-5">
          <div class="surface overflow-hidden">
            <header class="border-border border-b px-4 py-3">
              <h2 class="text-fg text-sm font-bold">بيانات المنشأة</h2>
              <p class="text-fg-subtle mt-0.5 text-xs">
                تظهر لعملائك أعلى صفحة الحجز وفي رسائل التذكير.
              </p>
            </header>
            <div class="grid gap-4 p-4 sm:grid-cols-2">
              <BaseInput
                v-model="profile.name"
                label="اسم المنشأة"
                required
                class="sm:col-span-2"
              />
              <BaseInput
                v-model="profile.category"
                label="النشاط"
                placeholder="مثلاً: عيادة جلدية وتجميل"
              />
              <BaseInput
                v-model="profile.address"
                label="الحي والمدينة"
                placeholder="مثلاً: حي الياسمين، الرياض"
              />
            </div>
            <footer
              class="border-border flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="bg-ink dark:bg-surface-raised dark:ring-border font-display grid h-9 w-9 place-items-center rounded-[9px] text-sm font-bold text-white dark:ring-1"
                  aria-hidden="true"
                  >{{ initialOf(profile.name) }}</span
                >
                <span class="text-fg-subtle text-xs">هكذا يظهر شعار منشأتك المختصر.</span>
              </div>
              <div class="flex gap-2">
                <BaseButton variant="ghost" :disabled="!profileDirty" @click="startProfile"
                  >تراجع</BaseButton
                >
                <BaseButton variant="primary" :disabled="!profileDirty" @click="commitProfile"
                  >حفظ</BaseButton
                >
              </div>
            </footer>
          </div>

          <div class="surface p-4">
            <h2 class="text-fg mb-1 text-sm font-bold">رابط صفحة الحجز</h2>
            <p class="text-fg-subtle mb-3 text-xs">
              الرابط ثابت حتى لا تنكسر الروابط التي أرسلتها لعملائك.
            </p>
            <div
              class="border-border bg-surface-sunken flex items-center gap-2 rounded-[var(--radius-md)] border p-1.5 ps-3"
            >
              <span class="text-fg min-w-0 flex-1 truncate text-sm font-semibold" dir="ltr">{{
                bookingUrlShort
              }}</span>
              <button
                type="button"
                class="bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-semibold"
                @click="copyLink"
              >
                <Copy class="h-4 w-4" aria-hidden="true" /> نسخ
              </button>
              <a
                :href="`/b/${slug}`"
                target="_blank"
                rel="noopener"
                class="bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-semibold"
              >
                <ExternalLink class="h-4 w-4" aria-hidden="true" /> فتح
              </a>
            </div>
          </div>
        </section>

        <!-- ------------------------------------------------------- services -->
        <section v-else-if="tab === 'services'" class="surface overflow-hidden">
          <header class="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 class="text-fg text-sm font-bold">الخدمات</h2>
              <p class="text-fg-subtle mt-0.5 text-xs">
                المدة والفاصل يحددان الأوقات المتاحة للحجز.
              </p>
            </div>
            <BaseButton size="sm" :icon="Plus" @click="addService">إضافة</BaseButton>
          </header>

          <div v-for="g in serviceGroups" :key="g.name">
            <p
              v-if="serviceGroups.length > 1"
              class="bg-surface-sunken text-fg-subtle border-border border-b px-4 py-1.5 text-xs font-semibold"
            >
              {{ g.name }}
            </p>
            <ul class="divide-border divide-y">
              <li v-for="s in g.items" :key="s.id" class="flex items-center gap-3 px-4 py-3">
                <component
                  :is="s.icon"
                  class="text-fg-subtle h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                <button type="button" class="min-w-0 flex-1 text-start" @click="editService(s.id)">
                  <p
                    class="text-fg truncate text-sm font-semibold"
                    :class="!s.isActive && 'opacity-50'"
                  >
                    {{ s.name }}
                  </p>
                  <p class="text-fg-subtle text-xs">
                    {{ duration(s.durationMin) }} · فاصل {{ duration(s.bufferMin) }}
                    <span v-if="!s.isActive"> · معطّلة</span>
                  </p>
                </button>
                <span class="text-fg shrink-0 text-sm font-bold" data-numeric>
                  {{ money(s.priceMinor) }}
                </span>
                <BaseButton size="sm" variant="ghost" @click="settings.toggleService(s.id)">
                  {{ s.isActive ? 'تعطيل' : 'تفعيل' }}
                </BaseButton>
              </li>
            </ul>
          </div>
        </section>

        <!-- ---------------------------------------------------------- hours -->
        <div v-else-if="tab === 'hours'" class="space-y-5">
          <section class="surface overflow-hidden">
            <header class="border-border border-b px-4 py-3">
              <h2 class="text-fg text-sm font-bold">ساعات العمل</h2>
              <p class="text-fg-subtle mt-0.5 text-xs">
                الأوقات المعروضة للعملاء تُحسب من هنا مباشرةً.
              </p>
            </header>

            <ul class="divide-border divide-y">
              <li
                v-for="h in draftHours"
                :key="h.weekday"
                class="flex flex-wrap items-center gap-3 px-4 py-2.5"
              >
                <span class="text-fg w-20 shrink-0 text-sm">{{ WEEKDAYS[h.weekday] }}</span>

                <label class="text-fg-muted flex items-center gap-2 text-xs">
                  <input v-model="h.isClosed" type="checkbox" class="accent-primary h-4 w-4" />
                  مغلق
                </label>

                <!-- The pair stays one unit: a row that wraps between a time and its
               dash reads as two broken halves, not as a range. -->
                <div v-if="!h.isClosed" class="ms-auto flex items-center gap-2">
                  <input
                    v-model="h.open"
                    type="time"
                    :aria-label="`فتح ${WEEKDAYS[h.weekday]}`"
                    class="border-border bg-surface text-fg focus:border-primary h-9 min-w-0 rounded-[var(--radius-md)] border px-2 text-sm focus:outline-none"
                    dir="ltr"
                  />
                  <span class="text-fg-subtle">–</span>
                  <input
                    v-model="h.close"
                    type="time"
                    :aria-label="`إغلاق ${WEEKDAYS[h.weekday]}`"
                    class="border-border bg-surface text-fg focus:border-primary h-9 min-w-0 rounded-[var(--radius-md)] border px-2 text-sm focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <p
                  v-if="!h.isClosed && h.close < h.open"
                  class="text-fg-subtle basis-full text-end text-xs"
                  data-overnight
                >
                  يغلق بعد منتصف الليل، فجر اليوم التالي
                </p>
              </li>
            </ul>

            <footer class="border-border flex items-center justify-end gap-2 border-t px-4 py-3">
              <BaseButton variant="ghost" :disabled="!hoursDirty" @click="startHours"
                >تراجع</BaseButton
              >
              <BaseButton variant="primary" :disabled="!hoursDirty" @click="commitHours">
                حفظ ساعات العمل
              </BaseButton>
            </footer>
          </section>
          <PrayerPanel />
          <SpecialPeriodsPanel />
        </div>

        <!-- ------------------------------------------------------ resources -->
        <section v-else-if="tab === 'resources'" class="surface overflow-hidden">
          <header class="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 class="text-fg text-sm font-bold">الفريق</h2>
              <p class="text-fg-subtle mt-0.5 text-xs">
                كل شخص (أو غرفة، أو كرسي) له جدول مستقل، ولا يُحجز مرتين في نفس الوقت.
              </p>
            </div>
            <BaseButton size="sm" :icon="Plus" @click="addStaff"> إضافة </BaseButton>
          </header>
          <ul class="divide-border divide-y">
            <li v-for="r in resources" :key="r.id" class="flex items-center gap-3 px-4 py-2.5">
              <span
                class="bg-surface-sunken text-fg grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                :class="!r.isActive && 'opacity-50'"
                aria-hidden="true"
                >{{ initialOf(r.name) }}</span
              >
              <button
                type="button"
                class="min-w-0 flex-1 text-start"
                :class="!r.isActive && 'opacity-50'"
                @click="editingResource = { role: '', ...r }"
              >
                <span class="text-fg block text-sm font-semibold">{{ r.name }}</span>
                <span class="text-fg-subtle block text-xs"
                  >{{ r.role || 'بلا وظيفة' }}<template v-if="!r.isActive"> · معطّل</template></span
                >
              </button>
              <BaseButton size="sm" variant="ghost" @click="toggleStaff(r)">
                {{ r.isActive ? 'تعطيل' : 'تفعيل' }}
              </BaseButton>
            </li>
          </ul>
        </section>

        <!-- ---------------------------------------------------------- guard -->
        <GuardPolicyForm v-else-if="tab === 'guard'" />
        <PlanPanel v-else-if="tab === 'plan'" />

        <!-- -------------------------------------------------------- account -->
        <section v-else class="surface p-4">
          <h2 class="text-fg text-sm font-bold">الحساب</h2>
          <p class="text-fg-muted mt-1 text-sm">{{ auth.user?.email ?? 'غير مسجّل' }}</p>
          <!-- Only on the demo backend. Against a real database this button would
           not reset a browser, it would wipe a business. -->
          <div v-if="isDemoBackend" class="border-border mt-4 border-t pt-4">
            <p class="text-fg-subtle mb-2 text-xs">
              البيانات محفوظة محلياً في هذا المتصفح. إعادة التعيين تعيد بيانات العرض التجريبية
              <strong>وإعدادات الخدمات وساعات العمل</strong> إلى حالتها الأولى.
            </p>
            <BaseButton :icon="RotateCcw" @click="confirmReset = true"
              >إعادة تعيين البيانات</BaseButton
            >
            <ConfirmDialog
              :open="confirmReset"
              title="إعادة تعيين كل البيانات؟"
              message="ستُحذف كل الحجوزات والعملاء والتعديلات على الخدمات وساعات العمل في هذا المتصفح، وتعود البيانات التجريبية الأولى. لا يمكن التراجع."
              confirm-label="إعادة التعيين"
              @confirm="resetData"
              @cancel="confirmReset = false"
            />
          </div>
          <p v-else class="border-border text-fg-subtle mt-4 border-t pt-4 text-xs">
            البيانات محفوظة على خادم قاعدة البيانات.
          </p>
        </section>
      </div>
    </div>

    <!-- --------------------------------------------------- service modal -->
    <BaseModal
      :open="editing !== null"
      :title="isNew ? 'خدمة جديدة' : 'تعديل الخدمة'"
      size="md"
      :close-on-backdrop="false"
      @close="editing = null"
    >
      <div v-if="editing" class="space-y-4">
        <BaseInput v-model="editing.name" label="اسم الخدمة" required />
        <div>
          <BaseInput
            v-model="editing.category"
            label="التصنيف"
            list="service-categories"
            placeholder="مثلاً: العناية بالبشرة"
            hint="الخدمات تُجمّع بالتصنيف في صفحة الحجز."
          />
          <datalist id="service-categories">
            <option v-for="c in categories" :key="c" :value="c" />
          </datalist>
        </div>
        <BaseInput v-model="editing.description" label="الوصف" type="textarea" :rows="2" />

        <div class="grid gap-4 sm:grid-cols-3">
          <BaseInput v-model="durationInput" label="المدة (دقيقة)" type="number" required />
          <BaseInput
            v-model="bufferInput"
            label="الفاصل (دقيقة)"
            type="number"
            hint="وقت التجهيز بعد الموعد"
          />
          <BaseInput v-model="priceMajor" label="السعر (ر.س)" type="number" />
        </div>

        <BaseSelect
          v-model="editing.iconKey"
          label="الأيقونة"
          :options="SERVICE_ICON_KEYS.map((k) => ({ value: k, label: SERVICE_ICON_LABELS[k] }))"
        />
        <p class="text-fg-subtle -mt-2 flex items-center gap-2 text-xs">
          <component :is="iconFor(editing.iconKey)" class="text-primary-fg h-4 w-4" />
          معاينة
        </p>

        <fieldset>
          <legend class="text-fg-muted mb-1.5 text-[13px] font-semibold">
            من يقدّم هذه الخدمة
            <span class="text-danger-700" aria-hidden="true">*</span>
          </legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="r in resources"
              :key="r.id"
              class="border-border hover:border-primary-line inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              :class="editing.resourceIds.includes(r.id) && 'border-primary bg-primary-soft'"
            >
              <input
                type="checkbox"
                class="accent-primary h-4 w-4"
                :checked="editing.resourceIds.includes(r.id)"
                @change="toggleResourceOn(editing, r.id)"
              />
              {{ r.name }}
            </label>
          </div>
          <p v-if="editing.resourceIds.length === 0" class="text-danger-700 mt-1.5 text-xs">
            اختر شخصاً واحداً على الأقل، وإلا لن تظهر أي أوقات متاحة لهذه الخدمة.
          </p>
        </fieldset>
      </div>

      <template #footer>
        <BaseButton variant="ghost" @click="editing = null">إلغاء</BaseButton>
        <BaseButton variant="primary" :disabled="!canSaveService" @click="commitService">
          حفظ
        </BaseButton>
      </template>
    </BaseModal>

    <!-- -------------------------------------------------- resource modal -->
    <BaseModal
      :open="editingResource !== null"
      title="عضو الفريق"
      :close-on-backdrop="false"
      @close="editingResource = null"
    >
      <div v-if="editingResource" class="space-y-4">
        <BaseInput v-model="editingResource.name" label="الاسم" required />
        <BaseInput
          v-model="editingResource.role"
          label="الوظيفة"
          placeholder="مثلاً: أخصائية بشرة"
          hint="تظهر لعملائك عند اختيار مع من يحجزون."
        />
        <fieldset>
          <legend class="text-fg-muted mb-1.5 text-[13px] font-semibold">المختص</legend>
          <div class="flex gap-2" role="radiogroup" aria-label="المختص">
            <button
              v-for="g in [
                { value: 'female', label: 'امرأة' },
                { value: 'male', label: 'رجل' },
                { value: null, label: 'لا يُعرض' },
              ]"
              :key="String(g.value)"
              type="button"
              role="radio"
              :aria-checked="(editingResource.gender ?? null) === g.value"
              class="rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold"
              :class="
                (editingResource.gender ?? null) === g.value
                  ? 'border-fg bg-fg text-canvas'
                  : 'border-border text-fg-muted hover:bg-surface-hover'
              "
              @click="editingResource.gender = g.value"
            >
              {{ g.label }}
            </button>
          </div>
          <p class="text-fg-subtle mt-1.5 text-xs">
            إن كان في فريقك رجال ونساء، يستطيع العميل اختيار «مختصات» أو «مختصون» عند الحجز.
          </p>
        </fieldset>
      </div>
      <template #footer>
        <BaseButton variant="ghost" @click="editingResource = null">إلغاء</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!editingResource?.name.trim()"
          @click="commitResource"
        >
          حفظ
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
