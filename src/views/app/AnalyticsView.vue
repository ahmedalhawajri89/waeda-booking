<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { subDays, startOfDay } from 'date-fns'
import {
  BarChart3,
  CalendarRange,
  CircleSlash,
  Clock4,
  TrendingUp,
  UserX,
  Wallet,
} from 'lucide-vue-next'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import KpiCard from '@/components/analytics/KpiCard.vue'
import BaseChart from '@/components/analytics/BaseChart.vue'
import DemandHeatmap from '@/components/analytics/DemandHeatmap.vue'
import { useBookingsStore } from '@/stores/bookings'
import { businessHours, resourceById, serviceById } from '@/data/catalog'
import { initialOf } from '@/data/business'
import { chartColors } from '@/composables/useChartTheme'
import { duration, money } from '@/lib/format'
import {
  byChannel,
  byResource,
  byStatus,
  computeKpis,
  dailySeries,
  demandHeatmap,
  topServices,
} from '@/lib/analytics'

/**
 * The operational read-out. TodayView answers "what do I do now"; this
 * answers "how is the business doing", which is a different question and
 * deserves a different screen rather than a row of tiles bolted onto Today.
 *
 * Every figure is derived in src/lib/analytics.ts from bookings already in
 * the store. Nothing here is invented, which is also why there is no
 * "vs. last period" delta — the range is user-chosen, so the comparison
 * period would be arbitrary.
 */
const store = useBookingsStore()
const route = useRoute()
const router = useRouter()

const RANGES = [
  { value: '7', label: '7 أيام' },
  { value: '30', label: '30 يوماً' },
  { value: '90', label: '90 يوماً' },
]

const days = ref(String(route.query.range ?? '30'))
watch(days, (v) => router.replace({ query: { ...route.query, range: v } }))

const range = computed(() => {
  const n = Number(days.value) || 30
  return { from: startOfDay(subDays(new Date(), n - 1)), to: new Date() }
})

onMounted(() => store.load())

const kpis = computed(() => computeKpis(store.items, range.value, businessHours))
const series = computed(() => dailySeries(store.items, range.value))
const channels = computed(() => byChannel(store.items, range.value))
const statuses = computed(() => byStatus(store.items, range.value))
const services = computed(() => topServices(store.items, range.value))
/** Per person on the team, with each one's share of the period's revenue. */
const team = computed(() => {
  const rows = byResource(store.items, range.value)
  const total = rows.reduce((s, r) => s + r.revenueMinor, 0) || 1
  return rows.map((r) => ({
    ...r,
    resource: resourceById(r.resourceId),
    share: r.revenueMinor / total,
  }))
})

const FROM_HOUR = 8
const TO_HOUR = 20
const heatmap = computed(() => demandHeatmap(store.items, range.value, FROM_HOUR, TO_HOUR))

const pct = (n) => `${Math.round(n * 100)}%`

/* --------------------------------------------------------------- charts */

const revenueChart = computed(() => {
  const c = chartColors()
  return {
    type: 'line',
    data: {
      labels: series.value.map((p) => p.label),
      datasets: [
        {
          label: 'الإيراد المحصَّل (ر.س)',
          data: series.value.map((p) => p.revenueMinor / 100),
          borderColor: c.primary,
          backgroundColor: c.primarySoft,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'عدد الحجوزات',
          data: series.value.map((p) => p.bookings),
          borderColor: c.accent,
          borderDash: [4, 4],
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: { position: 'right', grid: { color: c.grid }, beginAtZero: true },
        // Counts and money on one chart need separate scales, or the smaller
        // series flattens against the axis of the larger one.
        y1: { position: 'left', grid: { display: false }, beginAtZero: true },
      },
      plugins: { legend: { display: false } },
    },
  }
})

const CHANNEL_LABELS = { online: 'الموقع', phone: 'الهاتف', walk_in: 'الاستقبال' }

const channelChart = computed(() => {
  const c = chartColors()
  return {
    type: 'doughnut',
    data: {
      labels: Object.keys(channels.value).map((k) => CHANNEL_LABELS[k]),
      datasets: [
        {
          data: Object.values(channels.value),
          backgroundColor: [c.primary, c.accent, c.info],
          borderWidth: 2,
          borderColor: c.surface,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } } },
    },
  }
})

const STATUS_LABELS = {
  pending: 'بانتظار',
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
}

const statusChart = computed(() => {
  const c = chartColors()
  return {
    type: 'bar',
    data: {
      labels: Object.keys(statuses.value).map((k) => STATUS_LABELS[k]),
      datasets: [
        {
          data: Object.values(statuses.value),
          backgroundColor: [c.warning, c.info, c.success, c.muted, c.danger],
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: { position: 'right', grid: { color: c.grid }, beginAtZero: true },
      },
      plugins: { legend: { display: false } },
    },
  }
})

const servicesChart = computed(() => {
  const c = chartColors()
  return {
    type: 'bar',
    data: {
      labels: services.value.map((s) => serviceById(s.serviceId)?.name ?? s.serviceId),
      datasets: [
        {
          data: services.value.map((s) => s.revenueMinor / 100),
          backgroundColor: c.primary,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: c.grid }, beginAtZero: true },
        y: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  }
})

const summary = computed(
  () =>
    `${kpis.value.bookingCount} حجز خلال ${days.value} يوماً، ` +
    `إشغال ${pct(kpis.value.occupancy)}، ` +
    `محصَّل ${money(kpis.value.revenueCollected)}.`,
)
</script>

<template>
  <div class="w-full space-y-6 p-4 lg:p-6 2xl:px-8">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="type-h3 text-fg">التحليلات</h1>
        <p class="text-fg-subtle text-[13px]">أرقام مشتقة من حجوزاتك، لا تقديرات.</p>
      </div>
      <BaseTabs v-model="days" :items="[...RANGES]" label="المدى الزمني" size="sm" />
    </header>

    <ErrorState v-if="store.error" :message="store.error" @retry="store.load(true)" />

    <div v-else-if="store.isLoading && !store.loaded" class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonBlock v-for="n in 6" :key="n" variant="card" />
      </div>
    </div>

    <EmptyState
      v-else-if="kpis.bookingCount === 0"
      :icon="CalendarRange"
      variant="no-results"
      title="لا حجوزات في هذه الفترة"
      description="جرّب مدى زمنياً أوسع، أو أنشئ حجزاً لترى الأرقام تتحرك."
    />

    <template v-else>
      <p class="sr-only">{{ summary }}</p>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="نسبة الإشغال"
          :value="pct(kpis.occupancy)"
          hint="متوسط أيام العمل فقط"
          :icon="TrendingUp"
        />
        <KpiCard
          label="الإيراد المحصَّل"
          :value="money(kpis.revenueCollected)"
          hint="حجوزات مدفوعة بالكامل"
          :icon="Wallet"
          tone="success"
        />
        <KpiCard
          label="مستحق غير محصَّل"
          :value="money(kpis.revenueOutstanding)"
          hint="مؤكدة أو مكتملة وغير مدفوعة"
          :icon="Clock4"
          tone="warning"
        />
        <KpiCard
          label="معدّل عدم الحضور"
          :value="pct(kpis.noShowRate)"
          hint="من الحجوزات التي حُسمت"
          :icon="UserX"
          :tone="kpis.noShowRate > 0.15 ? 'danger' : 'neutral'"
        />
        <KpiCard
          label="معدّل الإلغاء"
          :value="pct(kpis.cancellationRate)"
          hint="من إجمالي الحجوزات"
          :icon="CircleSlash"
        />
        <KpiCard
          label="وسيط مهلة الحجز"
          :value="`${Math.round(kpis.medianLeadHours)} ساعة`"
          hint="بين إنشاء الحجز وموعده"
          :icon="BarChart3"
        />
      </div>

      <section class="surface p-4">
        <h2 class="type-h3 text-fg mb-4">الإيراد وعدد الحجوزات</h2>
        <BaseChart
          :config="revenueChart"
          :height="280"
          summary="مخطط خطي يقارن الإيراد المحصَّل بعدد الحجوزات يومياً خلال الفترة المختارة."
        />
      </section>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="surface p-4">
          <h2 class="type-h3 text-fg mb-4">قنوات الحجز</h2>
          <BaseChart
            :config="channelChart"
            :height="240"
            :summary="`توزيع الحجوزات: الموقع ${channels.online}، الهاتف ${channels.phone}، الاستقبال ${channels.walk_in}.`"
          />
        </section>

        <section class="surface p-4">
          <h2 class="type-h3 text-fg mb-4">مزيج الحالات</h2>
          <BaseChart
            :config="statusChart"
            :height="240"
            :summary="`عدد الحجوزات بكل حالة: بانتظار ${statuses.pending}، مؤكد ${statuses.confirmed}، مكتمل ${statuses.completed}، ملغى ${statuses.cancelled}، لم يحضر ${statuses.no_show}.`"
          />
        </section>
      </div>

      <section class="surface p-4">
        <h2 class="type-h3 text-fg mb-1">أوقات الطلب</h2>
        <p class="text-fg-subtle mb-4 text-[13px]">
          أكثر الأوقات طلباً حسب اليوم والساعة — يخبرك متى تحتاج طاقة إضافية.
        </p>
        <DemandHeatmap :cells="heatmap" :from-hour="FROM_HOUR" :to-hour="TO_HOUR" />
      </section>

      <div class="grid gap-4 xl:grid-cols-2">
        <section class="surface overflow-hidden" aria-labelledby="team-h">
          <header class="border-border border-b px-4 py-3">
            <h2 id="team-h" class="type-h3 text-fg">الأداء حسب المختص</h2>
            <p class="text-fg-subtle text-[13px]">من يحمل الإيراد، ومن يغيب عملاؤه أكثر.</p>
          </header>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-border text-fg-subtle border-b text-xs">
                <th scope="col" class="px-4 py-2 text-start font-semibold">المختص</th>
                <th scope="col" class="px-4 py-2 text-end font-semibold">الحجوزات</th>
                <th scope="col" class="px-4 py-2 text-end font-semibold">الوقت المحجوز</th>
                <th scope="col" class="px-4 py-2 text-end font-semibold">الغياب</th>
                <th scope="col" class="px-4 py-2 text-start font-semibold">الإيراد</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in team"
                :key="r.resourceId"
                class="border-border border-b last:border-b-0"
              >
                <td class="px-4 py-3">
                  <span class="flex items-center gap-2.5">
                    <span
                      class="bg-surface-sunken text-fg grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                      aria-hidden="true"
                      >{{ initialOf(r.resource?.name) }}</span
                    >
                    <span class="min-w-0">
                      <span class="text-fg block truncate font-semibold">{{
                        r.resource?.name ?? 'محذوف'
                      }}</span>
                      <span v-if="r.resource?.role" class="text-fg-subtle block truncate text-xs">{{
                        r.resource.role
                      }}</span>
                    </span>
                  </span>
                </td>
                <td class="text-fg px-4 py-3 text-end font-semibold" data-numeric>{{ r.count }}</td>
                <td class="text-fg-muted px-4 py-3 text-end whitespace-nowrap">
                  {{ duration(Math.round(r.bookedMin)) }}
                </td>
                <td
                  class="px-4 py-3 text-end"
                  :class="r.noShowRate > 0.15 ? 'text-danger-700 font-semibold' : 'text-fg-muted'"
                  data-numeric
                >
                  {{ pct(r.noShowRate) }}
                </td>
                <td class="w-[38%] px-4 py-3">
                  <span class="text-fg block text-xs font-semibold" data-numeric>{{
                    money(r.revenueMinor)
                  }}</span>
                  <span class="bg-surface-sunken mt-1 block h-1.5 overflow-hidden rounded-full">
                    <span
                      class="bg-fg block h-full rounded-full"
                      :style="{ width: `${Math.round(r.share * 100)}%` }"
                    />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="surface p-4">
          <h2 class="type-h3 text-fg mb-4">أعلى الخدمات إيراداً</h2>
          <BaseChart
            :config="servicesChart"
            :height="Math.max(160, services.length * 52)"
            summary="أعمدة أفقية تعرض إيراد كل خدمة خلال الفترة المختارة، مرتّبة تنازلياً."
          />
        </section>
      </div>
    </template>
  </div>
</template>
