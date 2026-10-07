<script setup>
import { computed } from 'vue'
import {
  ArrowLeft,
  CalendarCheck,
  Copy,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useBookingsStore } from '@/stores/bookings'
import { useGuardStore } from '@/stores/guard'
import { useAuthStore } from '@/stores/auth'
import { resources } from '@/data/catalog'
import { business } from '@/data/business'
import { useBookingMove } from '@/composables/useBookingMove'
import { ATTENTION } from '@/lib/status'
import { money, relativeDayTime, time } from '@/lib/format'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import ResourceDay from '@/components/booking/ResourceDay.vue'

/**
 * The working surface, read in the order the morning asks it:
 *   how does today look (the numbers) → who is where, when (the day, one
 *   column per person) → what needs me, and what is next (the side).
 * A business with no bookings yet is shown the one thing that brings them:
 * its own booking link.
 */
const emit = defineEmits(['openBooking', 'createAt'])
const store = useBookingsStore()
const guard = useGuardStore()
const auth = useAuthStore()
const { move } = useBookingMove()

const team = computed(() => resources.filter((r) => r.isActive))
const live = computed(() =>
  store.today.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show'),
)
const attention = computed(() => store.attention)
const next = computed(() => store.upcoming.slice(0, 4))
const occupancy = computed(() => store.occupancyToday)

const KPIS = computed(() => [
  { label: 'مواعيد اليوم', value: live.value.length },
  {
    label: 'المؤكدة',
    value: live.value.filter((b) => b.status === 'confirmed' || b.status === 'completed').length,
  },
  {
    label: 'بانتظار التأكيد',
    value: live.value.filter((b) => b.status === 'pending').length,
    warn: true,
  },
  { label: 'الإشغال', value: `${Math.round(occupancy.value.ratio * 100)}%` },
  { label: 'المتوقع اليوم', value: money(live.value.reduce((s, b) => s + b.priceMinor, 0)) },
])

const protectedTotal = computed(() => guard.protectedRevenue?.total ?? 0)

/* the link, for a business still waiting on its first bookings */
const isNew = computed(() => store.loaded && store.items.length === 0)
const url = computed(() => `${window.location.origin}/b/${auth.user?.orgSlug || business.slug}`)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(url.value)
    toast.success('نُسخ رابط صفحة الحجز')
  } catch {
    toast.error('تعذّر النسخ')
  }
}
const shareUrl = computed(
  () =>
    `https://wa.me/?text=${encodeURIComponent(`احجز موعدك في ${business.name}:\n${url.value}`)}`,
)
</script>

<template>
  <div class="w-full p-4 lg:p-6 2xl:px-8">
    <div v-if="store.isLoading && !store.loaded" class="space-y-4">
      <SkeletonBlock variant="card" :count="1" />
      <SkeletonBlock variant="row" :count="5" />
    </div>

    <div v-else-if="store.error" class="surface">
      <EmptyState
        variant="error"
        :icon="TriangleAlert"
        title="تعذّر تحميل جدول اليوم"
        :description="store.error"
      >
        <template #action>
          <BaseButton variant="primary" :icon="RefreshCw" @click="store.load(true)">
            أعد المحاولة
          </BaseButton>
        </template>
      </EmptyState>
    </div>

    <!-- a business with nothing yet: the link is the next step -->
    <div v-else-if="isNew" class="surface mx-auto max-w-2xl p-8 text-center sm:p-12">
      <span
        class="bg-surface-sunken text-fg mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full"
      >
        <CalendarCheck class="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 class="font-display text-fg mb-2 text-xl font-bold">لا حجوزات بعد</h2>
      <p class="text-fg-muted mb-6">
        شارك رابط صفحة الحجز مع عملائك، وكل حجز يظهر هنا في جدول اليوم. أو أضف أول موعد بنفسك.
      </p>
      <div
        class="border-border bg-surface-sunken mx-auto mb-4 flex max-w-md items-center gap-2 rounded-[var(--radius-md)] border p-1.5 ps-3"
      >
        <span class="text-fg min-w-0 flex-1 truncate text-start text-sm font-semibold" dir="ltr">{{
          url.replace(/^https?:\/\//, '')
        }}</span>
        <button
          type="button"
          class="bg-surface text-fg hover:bg-surface-hover flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-semibold"
          @click="copyLink"
        >
          <Copy class="h-4 w-4" aria-hidden="true" /> نسخ
        </button>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <a
          :href="shareUrl"
          target="_blank"
          rel="noopener"
          class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-bold"
        >
          <MessageCircle class="h-4 w-4" aria-hidden="true" /> شارك على واتساب
        </a>
        <BaseButton variant="primary" @click="emit('createAt', null)">أضف موعداً</BaseButton>
      </div>
    </div>

    <template v-else>
      <!-- the numbers -->
      <dl class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div
          v-for="k in KPIS"
          :key="k.label"
          class="border-border bg-surface rounded-[var(--radius-lg)] border px-4 py-3"
        >
          <dt class="text-fg-subtle text-xs">{{ k.label }}</dt>
          <dd
            class="font-display mt-0.5 text-xl font-bold"
            :class="k.warn && k.value ? 'text-warning-700' : 'text-fg'"
            data-numeric
          >
            {{ k.value }}
          </dd>
        </div>
        <RouterLink
          to="/app/guard"
          class="border-border bg-surface hover:border-border-strong rounded-[var(--radius-lg)] border px-4 py-3 transition-colors"
        >
          <dt class="text-fg-subtle flex items-center gap-1 text-xs">
            <ShieldCheck class="text-primary-fg h-3.5 w-3.5" aria-hidden="true" /> حماه الحارس
          </dt>
          <dd class="font-display text-fg mt-0.5 text-xl font-bold" data-numeric>
            {{ money(protectedTotal) }}
          </dd>
        </RouterLink>
      </dl>

      <div class="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <!-- the day, one column per person -->
        <section class="surface min-w-0 overflow-hidden" aria-labelledby="day-h">
          <header class="border-border flex items-center justify-between border-b px-4 py-3">
            <h2 id="day-h" class="text-fg text-sm font-bold">جدول اليوم</h2>
            <RouterLink
              to="/app/calendar"
              class="text-fg-subtle hover:text-fg flex items-center gap-1 text-xs font-semibold"
            >
              التقويم الكامل <ArrowLeft class="h-3.5 w-3.5 ltr:rotate-180" aria-hidden="true" />
            </RouterLink>
          </header>
          <ResourceDay
            :date="new Date()"
            :resources="team"
            :scale="1.1"
            @open="emit('openBooking', $event)"
            @create="emit('createAt', $event)"
            @move="move"
          />
        </section>

        <!-- what needs me, and what is next -->
        <div class="space-y-5">
          <section class="surface overflow-hidden" aria-labelledby="att-h">
            <header class="border-border flex items-center justify-between border-b px-4 py-3">
              <h2 id="att-h" class="text-fg flex items-center gap-2 text-sm font-bold">
                يحتاج إجراء
                <span
                  v-if="attention.length"
                  class="bg-warning-100 text-warning-700 rounded-full px-2 py-0.5 text-xs"
                  data-numeric
                  >{{ attention.length }}</span
                >
              </h2>
              <RouterLink
                v-if="attention.length > 4"
                to="/app/bookings?filter=attention"
                class="text-fg-subtle hover:text-fg text-xs font-semibold"
                >عرض الكل</RouterLink
              >
            </header>
            <p v-if="!attention.length" class="text-fg-subtle px-4 py-6 text-center text-sm">
              لا شيء ينتظرك الآن.
            </p>
            <ul v-else class="divide-border divide-y">
              <li v-for="item in attention.slice(0, 4)" :key="item.booking.id + item.reason">
                <button
                  type="button"
                  class="hover:bg-surface-hover flex w-full items-start gap-3 px-4 py-3 text-start transition-colors"
                  @click="emit('openBooking', item.booking.id)"
                >
                  <component
                    :is="ATTENTION[item.reason].icon"
                    class="mt-0.5 h-4 w-4 shrink-0"
                    :class="
                      ATTENTION[item.reason].tone === 'danger'
                        ? 'text-danger-700'
                        : 'text-warning-700'
                    "
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="text-fg block truncate text-sm font-semibold">{{
                      store.hydrate(item.booking).customer?.name
                    }}</span>
                    <span class="text-fg-subtle block truncate text-xs"
                      >{{ ATTENTION[item.reason].label }} ·
                      {{ relativeDayTime(item.booking.startAt) }}</span
                    >
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <section class="surface overflow-hidden" aria-labelledby="next-h">
            <header class="border-border border-b px-4 py-3">
              <h2 id="next-h" class="text-fg text-sm font-bold">التالي</h2>
            </header>
            <p v-if="!next.length" class="text-fg-subtle px-4 py-6 text-center text-sm">
              لا مواعيد قادمة.
            </p>
            <ul v-else class="divide-border divide-y">
              <li v-for="b in next" :key="b.id">
                <button
                  type="button"
                  class="hover:bg-surface-hover flex w-full items-center gap-3 px-4 py-3 text-start transition-colors"
                  @click="emit('openBooking', b.id)"
                >
                  <time
                    :datetime="b.startAt"
                    class="text-fg w-16 shrink-0 text-sm font-bold whitespace-nowrap"
                    data-numeric
                    >{{ time(b.startAt) }}</time
                  >
                  <span class="min-w-0 flex-1">
                    <span class="text-fg block truncate text-sm">{{
                      store.hydrate(b).customer?.name
                    }}</span>
                    <span class="text-fg-subtle block truncate text-xs"
                      >{{ store.hydrate(b).service?.name }} ·
                      {{ store.hydrate(b).resource?.name }}</span
                    >
                  </span>
                  <StatusBadge :status="b.status" size="sm" icon-only />
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
