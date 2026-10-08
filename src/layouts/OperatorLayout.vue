<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  BarChart3,
  ChevronDown,
  MessageCircle,
  CalendarDays,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  Link2,
  ListChecks,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Sparkles,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AppLogo from '@/components/ui/AppLogo.vue'
import IconButton from '@/components/ui/IconButton.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import Kbd from '@/components/ui/Kbd.vue'
import CommandPalette from '@/components/layout/CommandPalette.vue'
import NotificationsMenu from '@/components/layout/NotificationsMenu.vue'
import BookingFormDrawer from '@/components/booking/BookingFormDrawer.vue'
import BookingDetailDrawer from '@/components/booking/BookingDetailDrawer.vue'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useGuardStore } from '@/stores/guard'
import { useSubscriptionStore } from '@/stores/subscription'
import { useTheme } from '@/composables/useTheme'
import { business } from '@/data/business'
import { fullDate } from '@/lib/format'

/**
 * The console's frame.
 *
 * The rail reads top to bottom the way an owner's day runs: which business
 * this is and the link its customers book on; a new booking; today, the
 * calendar and the list; the people; the numbers; and, last, settings and
 * the account. Counts sit on the items they belong to, so the header carries
 * only the page's name, search and the bell.
 *
 * The rail folds to icons (remembered per device); on a phone it becomes a
 * bottom bar with a raised "+" and a "more" menu for the rest.
 */
const route = useRoute()
const router = useRouter()
const bookings = useBookingsStore()
const customers = useCustomersStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const guard = useGuardStore()
const sub = useSubscriptionStore()
const theme = useTheme()
let guardTimer

/* ------------------------------------------------------------- rail */
const RAIL_KEY = 'bookingpro:rail:v1'
const folded = ref(false)
try {
  folded.value = localStorage.getItem(RAIL_KEY) === 'folded'
} catch {
  /* default open */
}
function toggleRail() {
  folded.value = !folded.value
  try {
    localStorage.setItem(RAIL_KEY, folded.value ? 'folded' : 'open')
  } catch {
    /* session only */
  }
}

const todayCount = computed(
  () => bookings.today.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show').length,
)
const attentionCount = computed(() => bookings.attention.length)
const staffCount = computed(() => guard.forStaff.length)

/**
 * Ordered by how often each is reached for. The working day needs no
 * heading; the business's longer-lived pages sit under one. A count is either
 * information (today's appointments — quiet, plain number) or a call to act
 * (bookings that need you, replies waiting — a coloured dot beside it), never
 * both in the same colour.
 */
const SECTIONS = computed(() => [
  {
    title: null,
    items: [
      { to: '/app', label: 'اليوم', icon: Sun, badge: todayCount.value, tone: 'info' },
      { to: '/app/calendar', label: 'التقويم', icon: CalendarDays },
      {
        to: '/app/bookings',
        label: 'الحجوزات',
        icon: ListChecks,
        badge: attentionCount.value,
        tone: 'warning',
        hint: 'تحتاج إجراء',
      },
    ],
  },
  {
    title: 'المنشأة',
    items: [
      { to: '/app/customers', label: 'العملاء', icon: Users },
      {
        to: '/app/guard',
        label: 'حارس المواعيد',
        icon: ShieldCheck,
        badge: staffCount.value,
        tone: 'signal',
        hint: 'ردود تنتظر الفريق',
      },
      { to: '/app/analytics', label: 'التحليلات', icon: BarChart3 },
    ],
  },
])

const DOT = { warning: 'bg-warning-600', signal: 'bg-primary' }

/** The business switcher's menu: the page customers see, and its settings. */
const BUSINESS_ITEMS = [
  { value: 'open-page', label: 'افتح صفحة الحجز', icon: ExternalLink },
  { value: 'link', label: 'نسخ رابط الحجز', icon: Copy },
  { value: 'settings?tab=business', label: 'بيانات المنشأة', icon: Settings, separated: true },
]

function isActive(to) {
  return to === '/app' ? route.path === '/app' : route.path.startsWith(to)
}

/* ------------------------------------------------------- booking link */
const slug = computed(() => auth.user?.orgSlug || business.slug)
const bookingUrl = computed(() => `${window.location.origin}/b/${slug.value}`)
const bookingUrlShort = computed(() => `waeda.app/b/${slug.value}`)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(bookingUrl.value)
    toast.success('نُسخ رابط صفحة الحجز')
  } catch {
    toast.error('تعذّر النسخ')
  }
}

const whatsappShare = computed(
  () =>
    `https://wa.me/?text=${encodeURIComponent(`احجز موعدك في ${business.name} من هنا:\n${bookingUrl.value}`)}`,
)

/* ------------------------------------------------------------- account */
const ACCOUNT_ITEMS = computed(() => [
  {
    value: 'theme',
    label: theme.isDark.value ? 'الوضع الفاتح' : 'الوضع الليلي',
    icon: theme.isDark.value ? Sun : Moon,
  },
  { value: 'system', label: 'مثل الجهاز', icon: Monitor },
  { value: 'signout', label: 'تسجيل الخروج', icon: LogOut, tone: 'danger', separated: true },
])

/** The phone's "more": everything the bottom bar has no room for. */
const MORE_ITEMS = computed(() => [
  { value: 'customers', label: 'العملاء', icon: Users },
  { value: 'guard', label: 'حارس المواعيد', icon: ShieldCheck },
  { value: 'analytics', label: 'التحليلات', icon: BarChart3 },
  { value: 'settings', label: 'الإعدادات', icon: Settings },
  { value: 'link', label: 'نسخ رابط صفحة الحجز', icon: Link2, separated: true },
  ...ACCOUNT_ITEMS.value.map((i, n) => ({ ...i, separated: n === 0 })),
])

function signOut() {
  auth.signOut()
  void router.push('/')
}

function onMenu(value) {
  if (value === 'open-page') return window.open(`/b/${slug.value}`, '_blank', 'noopener')
  if (value === 'signout') return signOut()
  if (value === 'theme') return theme.toggle()
  if (value === 'system') return theme.setTheme('system')
  if (value === 'link') return copyLink()
  void router.push(`/app/${value}`)
}

/* ------------------------------------------------------------- drawers */
const createOpen = ref(false)
const createPrefill = ref(null)
const paletteOpen = ref(false)
const openBookingId = computed(() => route.query.booking ?? null)
const pageTitle = computed(() => route.meta.title ?? 'اليوم')

function openCreate(prefill = null) {
  createPrefill.value = prefill
  createOpen.value = true
}
/** "Book again" from a booking: that booking steps aside for the new one. */
async function bookFromDetail(prefill) {
  closeBooking()
  await nextTick()
  openCreate(prefill)
}

function openBooking(id) {
  void router.push({ query: { ...route.query, booking: id } })
}

function closeBooking() {
  const q = { ...route.query }
  delete q.booking
  void router.push({ query: q })
}

/** Ctrl/⌘+K or `/` opens the palette; `n` opens a new booking. */
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  const target = e.target
  const typing =
    /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '') || target?.isContentEditable
  if (typing || e.metaKey || e.ctrlKey || e.altKey || paletteOpen.value) return

  if (e.key === '/') {
    e.preventDefault()
    paletteOpen.value = true
  } else if (e.key.toLowerCase() === 'n') {
    e.preventDefault()
    openCreate()
  }
}

onMounted(() => {
  // Settings first: services and opening hours are what the availability
  // engine reads, so every other screen depends on them being current.
  void settings.load()
  // The guard runs once now and every minute after: sending what is due,
  // releasing what expired, picking up anything that changed.
  void guard.load().then(() => guard.run())
  guardTimer = setInterval(() => guard.run(), 60_000)
  void bookings.load()
  void customers.load()
  void sub.load()
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  clearInterval(guardTimer)
  document.removeEventListener('keydown', onKeydown)
})

/** Labels show on a wide, unfolded rail; icons only otherwise. */
const wide = computed(() => !folded.value)
</script>

<template>
  <div class="bg-canvas flex min-h-screen">
    <a
      href="#main"
      class="sr-only-focusable bg-surface-inverse text-fg-inverse fixed top-2 z-[70] rounded-[var(--radius-md)] px-3 py-2 text-sm"
      style="inset-inline-start: 8px"
    >
      تخطَّ إلى المحتوى
    </a>

    <!-- ============================================================ rail -->
    <aside
      class="bg-surface border-border sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-e transition-[width] duration-200 md:flex"
      :class="wide ? 'w-[4.5rem] lg:w-64' : 'w-[4.5rem]'"
    >
      <!-- the business: a switcher-style row, with the page customers see in its menu -->
      <div class="flex items-center gap-1 px-2.5 pt-3" :class="wide && 'lg:px-3'">
        <BaseMenu
          :items="BUSINESS_ITEMS"
          label="المنشأة"
          align="start"
          class="min-w-0 flex-1"
          @select="onMenu"
        >
          <template #trigger="{ open }">
            <button
              type="button"
              class="hover:bg-surface-hover flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] p-1.5 text-start transition-colors"
              :class="wide && 'lg:justify-start'"
              :aria-expanded="open"
              aria-haspopup="menu"
              :aria-label="`المنشأة: ${business.name}`"
            >
              <span
                class="bg-ink dark:bg-surface-raised dark:ring-border font-display grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-sm font-bold text-white dark:ring-1"
                aria-hidden="true"
                >{{ business.initial }}</span
              >
              <span v-if="wide" class="hidden min-w-0 flex-1 lg:block">
                <span class="text-fg block truncate text-sm font-bold">{{ business.name }}</span>
                <span class="text-fg-subtle block truncate text-[11px]">{{
                  business.category || 'لوحة التحكم'
                }}</span>
              </span>
              <ChevronDown
                v-if="wide"
                class="text-fg-faint hidden h-4 w-4 shrink-0 lg:block"
                aria-hidden="true"
              />
            </button>
          </template>
        </BaseMenu>
        <button
          type="button"
          class="text-fg-faint hover:text-fg hover:bg-surface-hover hidden h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"
          :class="wide ? 'lg:grid' : ''"
          aria-label="طي الشريط"
          title="طي الشريط"
          @click="toggleRail"
        >
          <PanelRightClose class="h-4 w-4 ltr:rotate-180" />
        </button>
      </div>
      <button
        v-if="folded"
        type="button"
        class="text-fg-faint hover:text-fg hover:bg-surface-hover mx-2.5 mt-1 hidden h-8 place-items-center rounded-[var(--radius-sm)] lg:grid"
        aria-label="توسيع الشريط"
        title="توسيع الشريط"
        @click="toggleRail"
      >
        <PanelRightOpen class="h-4 w-4 ltr:rotate-180" />
      </button>

      <!-- find, and add: the two things done from anywhere -->
      <div class="space-y-0.5 px-2.5 pt-3" :class="wide && 'lg:px-3'">
        <button
          type="button"
          class="text-fg-subtle hover:bg-surface-hover hover:text-fg flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors"
          :class="wide && 'lg:justify-start'"
          title="بحث (Ctrl K)"
          @click="paletteOpen = true"
        >
          <Search class="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span v-if="wide" class="hidden lg:inline">بحث</span>
          <span v-if="wide" class="ms-auto hidden items-center gap-0.5 lg:flex" dir="ltr"
            ><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span
          >
        </button>
        <button
          type="button"
          class="text-fg hover:bg-surface-hover flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors"
          :class="wide && 'lg:justify-start'"
          title="حجز جديد (N)"
          @click="openCreate()"
        >
          <span
            class="bg-primary text-fg-on-primary grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px]"
            aria-hidden="true"
          >
            <Plus class="h-3.5 w-3.5" stroke-width="3" />
          </span>
          <span v-if="wide" class="hidden lg:inline">حجز جديد</span>
          <span v-if="wide" class="ms-auto hidden lg:inline"><Kbd>N</Kbd></span>
        </button>
      </div>

      <!-- destinations -->
      <nav
        class="flex-1 space-y-5 overflow-y-auto px-2.5 pt-4 pb-3"
        :class="wide && 'lg:px-3'"
        aria-label="التنقل الرئيسي"
      >
        <div v-for="(section, si) in SECTIONS" :key="si">
          <p
            v-if="section.title && wide"
            class="text-fg-faint mb-1.5 hidden px-3 text-[11px] font-semibold lg:block"
          >
            {{ section.title }}
          </p>
          <div v-else-if="section.title" class="bg-border mx-3 mb-2 h-px" aria-hidden="true" />
          <div class="space-y-0.5">
            <RouterLink
              v-for="item in section.items"
              :key="item.to"
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              :title="item.label"
              class="group relative flex items-center justify-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors"
              :class="[
                wide && 'lg:justify-start',
                isActive(item.to)
                  ? 'bg-surface-sunken text-fg font-semibold'
                  : 'text-fg-subtle hover:bg-surface-hover hover:text-fg',
              ]"
            >
              <component
                :is="item.icon"
                class="h-[18px] w-[18px] shrink-0"
                :class="isActive(item.to) && 'text-primary-fg'"
                aria-hidden="true"
              />
              <span v-if="wide" class="hidden lg:inline">{{ item.label }}</span>
              <template v-if="item.badge">
                <!-- wide: a quiet number, with a dot only when it asks for action -->
                <span
                  v-if="wide"
                  class="ms-auto hidden items-center gap-1.5 text-xs lg:flex"
                  :class="item.tone === 'info' ? 'text-fg-faint' : 'text-fg font-semibold'"
                  data-numeric
                >
                  <span
                    v-if="DOT[item.tone]"
                    class="h-1.5 w-1.5 rounded-full"
                    :class="DOT[item.tone]"
                    aria-hidden="true"
                  />
                  {{ item.badge }}
                </span>
                <!-- folded: the dot alone, and only when action is asked -->
                <span
                  v-if="DOT[item.tone]"
                  class="absolute top-1.5 h-2 w-2 rounded-full"
                  :class="[wide && 'lg:hidden', DOT[item.tone]]"
                  style="inset-inline-end: 0.7rem"
                  aria-hidden="true"
                />
                <span v-if="item.hint" class="sr-only">{{ item.badge }} {{ item.hint }}</span>
              </template>
            </RouterLink>
          </div>
        </div>
      </nav>

      <!-- the plan: quiet, one line, and the way to the subscription page -->
      <RouterLink
        v-if="wide && sub.loaded"
        to="/app/settings?tab=plan"
        class="text-fg-subtle hover:text-fg mx-3 mb-2 hidden items-center justify-between gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-semibold lg:flex"
        data-plan-badge
      >
        <span class="flex items-center gap-1.5">
          <Sparkles class="h-3.5 w-3.5" aria-hidden="true" />
          {{ sub.inTrial ? `تجربة ${sub.plan.name}` : `باقة ${sub.plan.name}` }}
        </span>
        <span v-if="sub.inTrial" class="text-primary-fg" data-numeric
          >{{ sub.daysLeft }} {{ sub.daysLeft > 2 && sub.daysLeft < 11 ? 'أيام' : 'يوماً' }}</span
        >
        <span v-else data-numeric>{{ sub.usage.messages }}/{{ sub.messageAllowance }}</span>
      </RouterLink>

      <!-- the link customers book on: shared now and then, so it lives low -->
      <div v-if="wide" class="hidden px-3 pb-2 lg:block">
        <div class="border-border rounded-[var(--radius-md)] border p-2.5">
          <p class="text-fg-subtle mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
            <Link2 class="h-3.5 w-3.5" aria-hidden="true" /> صفحة الحجز
          </p>
          <p class="text-fg mb-2 truncate text-xs font-semibold" dir="ltr">{{ bookingUrlShort }}</p>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="bg-surface-sunken text-fg hover:bg-surface-hover flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 text-xs font-semibold"
              @click="copyLink"
            >
              <Copy class="h-3.5 w-3.5" aria-hidden="true" /> نسخ
            </button>
            <a
              :href="whatsappShare"
              target="_blank"
              rel="noopener"
              class="bg-surface-sunken text-fg hover:bg-surface-hover flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 text-xs font-semibold"
            >
              <MessageCircle class="h-3.5 w-3.5" aria-hidden="true" /> مشاركة
            </a>
          </div>
        </div>
      </div>

      <!-- settings and the account -->
      <div class="border-border space-y-1 border-t p-2.5" :class="wide && 'lg:p-3'">
        <RouterLink
          to="/app/settings"
          :aria-current="isActive('/app/settings') ? 'page' : undefined"
          title="الإعدادات"
          class="flex items-center justify-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors"
          :class="[
            wide && 'lg:justify-start',
            isActive('/app/settings')
              ? 'bg-surface-sunken text-fg'
              : 'text-fg-subtle hover:bg-surface-hover hover:text-fg',
          ]"
        >
          <Settings class="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span v-if="wide" class="hidden lg:inline">الإعدادات</span>
        </RouterLink>

        <BaseMenu
          :items="ACCOUNT_ITEMS"
          label="قائمة الحساب"
          side="top"
          align="start"
          @select="onMenu"
        >
          <template #trigger="{ open }">
            <button
              type="button"
              class="hover:bg-surface-hover flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] p-1.5 text-start transition-colors"
              :class="wide && 'lg:justify-start'"
              :aria-expanded="open"
              aria-haspopup="menu"
              :aria-label="`الحساب: ${auth.user?.name ?? 'المشغّل'}`"
            >
              <BaseAvatar :name="auth.user?.name ?? 'المشغّل'" size="sm" />
              <span v-if="wide" class="hidden min-w-0 flex-1 lg:block">
                <span class="text-fg block truncate text-[13px] font-semibold">{{
                  auth.user?.name ?? 'المشغّل'
                }}</span>
                <span class="text-fg-subtle block truncate text-[11px]" dir="ltr">{{
                  auth.user?.email
                }}</span>
              </span>
              <ChevronsUpDown
                v-if="wide"
                class="text-fg-faint hidden h-4 w-4 shrink-0 lg:block"
                aria-hidden="true"
              />
            </button>
          </template>
        </BaseMenu>
      </div>
    </aside>

    <!-- ===================================================== main column -->
    <div class="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
      <header
        class="bg-canvas/85 border-border sticky top-0 z-20 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-md sm:gap-3 lg:px-6"
      >
        <span class="md:hidden"><AppLogo compact mark-only /></span>
        <div class="min-w-0">
          <h1 class="font-display text-fg truncate text-lg font-bold">{{ pageTitle }}</h1>
          <p class="text-fg-subtle hidden truncate text-xs lg:block">{{ fullDate(new Date()) }}</p>
        </div>

        <span class="flex-1" />

        <span class="md:hidden">
          <IconButton :icon="Search" label="بحث" @click="paletteOpen = true" />
        </span>

        <NotificationsMenu @open-booking="openBooking" />
      </header>

      <!-- the one plan fact worth interrupting for, if there is one -->
      <div
        v-if="sub.alert"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm lg:px-6"
        :class="
          sub.alert.tone === 'danger'
            ? 'bg-danger-50 text-danger-700 border-danger-100'
            : 'bg-warning-50 text-warning-700 border-warning-100'
        "
        role="status"
        data-plan-alert
      >
        <span class="min-w-0 flex-1">{{ sub.alert.text }}</span>
        <RouterLink
          to="/app/settings?tab=plan"
          class="shrink-0 font-semibold underline underline-offset-4"
          >{{ sub.alert.action }}</RouterLink
        >
      </div>

      <main id="main" class="min-w-0 flex-1">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component
              :is="Component"
              @open-booking="openBooking"
              @create-at="openCreate"
              @new-booking="openCreate()"
            />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- ===================================================== phone bar -->
    <nav
      class="bg-surface/95 border-border fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="التنقل"
    >
      <RouterLink
        v-for="item in [SECTIONS[0].items[0], SECTIONS[0].items[1]]"
        :key="item.to"
        :to="item.to"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold"
        :class="isActive(item.to) ? 'text-fg' : 'text-fg-subtle'"
      >
        <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
        {{ item.label }}
      </RouterLink>
      <button
        type="button"
        class="-mt-5 flex flex-col items-center"
        aria-label="حجز جديد"
        @click="openCreate()"
      >
        <span
          class="bg-primary text-fg-on-primary ring-canvas grid h-12 w-12 place-items-center rounded-full shadow-lg ring-4"
        >
          <Plus class="h-6 w-6" aria-hidden="true" />
        </span>
      </button>
      <RouterLink
        to="/app/bookings"
        :aria-current="isActive('/app/bookings') ? 'page' : undefined"
        class="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold"
        :class="isActive('/app/bookings') ? 'text-fg' : 'text-fg-subtle'"
      >
        <ListChecks class="h-5 w-5" aria-hidden="true" />
        الحجوزات
        <span
          v-if="attentionCount"
          class="bg-warning-600 absolute top-1.5 h-2 w-2 rounded-full"
          style="inset-inline-end: 30%"
          aria-hidden="true"
        />
      </RouterLink>
      <BaseMenu :items="MORE_ITEMS" label="المزيد" side="top" align="end" @select="onMenu">
        <template #trigger="{ open }">
          <button
            type="button"
            class="text-fg-subtle flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-semibold"
            :aria-expanded="open"
            aria-haspopup="menu"
          >
            <MoreHorizontal class="h-5 w-5" aria-hidden="true" />
            المزيد
          </button>
        </template>
      </BaseMenu>
    </nav>

    <CommandPalette
      :open="paletteOpen"
      @close="paletteOpen = false"
      @new-booking="openCreate()"
      @open-booking="openBooking"
    />
    <BookingFormDrawer
      :open="createOpen"
      :prefill="createPrefill"
      @close="createOpen = false"
      @created="openBooking"
    />
    <BookingDetailDrawer
      :booking-id="openBookingId"
      @close="closeBooking"
      @create-at="bookFromDetail"
    />
  </div>
</template>
