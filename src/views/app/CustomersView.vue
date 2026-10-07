<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  MessageCircle,
  Phone,
  UserSearch,
  Users,
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { useCustomersStore } from '@/stores/customers'
import { useBookingsStore } from '@/stores/bookings'
import { money, relativeDay, relativeDayTime } from '@/lib/format'
import { downloadCsv } from '@/lib/export'
import SearchInput from '@/components/ui/SearchInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDrawer from '@/components/ui/BaseDrawer.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const emit = defineEmits(['openBooking'])

const customers = useCustomersStore()
const bookings = useBookingsStore()

const query = ref('')
// Deep-linkable, so the command palette can open a customer's file directly.
const route = useRoute()
const selectedId = ref(route.query.customer ?? null)
watch(
  () => route.query.customer,
  (id) => (selectedId.value = id ?? null),
)

/** Every figure is derived from bookings — nothing is stored or invented. */
function statsFor(customerId) {
  const all = bookings.forCustomer(customerId)
  const now = new Date()
  const past = all
    .filter((b) => new Date(b.startAt) <= now && b.status !== 'cancelled')
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
  const upcoming = all
    .filter((b) => new Date(b.startAt) > now && b.status !== 'cancelled')
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  const noShow = all.filter((b) => b.status === 'no_show').length
  const decided = all.filter((b) => b.status === 'completed' || b.status === 'no_show').length
  return {
    all,
    total: all.length,
    completed: all.filter((b) => b.status === 'completed').length,
    noShow,
    noShowRate: decided ? noShow / decided : 0,
    spend: all.filter((b) => b.paymentStatus === 'paid').reduce((sum, b) => sum + b.priceMinor, 0),
    last: past[0] ?? null,
    next: upcoming[0] ?? null,
    upcoming,
  }
}

const DAY = 86400000
const SEGMENTS = [
  { value: 'all', label: 'الكل', test: () => true },
  { value: 'regular', label: 'منتظمون', test: (st) => st.completed >= 3 },
  { value: 'new', label: 'جدد', test: (st) => st.total <= 1 },
  {
    value: 'lapsed',
    label: 'لم يعودوا منذ مدة',
    test: (st) => !st.next && st.last && Date.now() - new Date(st.last.startAt) > 60 * DAY,
  },
  { value: 'noshow', label: 'غابوا من قبل', test: (st) => st.noShow > 0 },
]
const segment = ref('all')

const SORTS = {
  name: (a, b) => a.c.name.localeCompare(b.c.name, 'ar'),
  visits: (a, b) => a.st.completed - b.st.completed,
  last: (a, b) => (a.st.last?.startAt ?? '').localeCompare(b.st.last?.startAt ?? ''),
  next: (a, b) => (a.st.next?.startAt ?? '9').localeCompare(b.st.next?.startAt ?? '9'),
  noshow: (a, b) => a.st.noShowRate - b.st.noShowRate,
  spend: (a, b) => a.st.spend - b.st.spend,
}
const sortKey = ref('last')
const sortDesc = ref(true)
function sortBy(k) {
  if (sortKey.value === k) sortDesc.value = !sortDesc.value
  else {
    sortKey.value = k
    sortDesc.value = k !== 'name' && k !== 'next'
  }
}

const rows = computed(() => {
  const test = SEGMENTS.find((x) => x.value === segment.value).test
  return customers
    .search(query.value)
    .map((c) => ({ c, st: statsFor(c.id) }))
    .filter((r) => test(r.st))
    .sort((a, b) => SORTS[sortKey.value](a, b) * (sortDesc.value ? -1 : 1))
})
const results = computed(() => rows.value.map((r) => r.c))

const COLS = [
  { key: 'name', label: 'العميل' },
  { key: 'visits', label: 'الزيارات', end: true },
  { key: 'last', label: 'آخر زيارة' },
  { key: 'next', label: 'الموعد القادم' },
  { key: 'noshow', label: 'الغياب', end: true },
  { key: 'spend', label: 'المدفوع', end: true },
]

const waLink = (phone) => {
  const d = (phone ?? '').replace(/\D/g, '')
  return `https://wa.me/${d.startsWith('0') ? '966' + d.slice(1) : d}`
}
const selected = computed(() => (selectedId.value ? customers.byId(selectedId.value) : null))

const stats = computed(() => (selected.value ? statsFor(selected.value.id) : null))

function exportCsv() {
  const columns = [
    { header: 'الاسم', value: (c) => c.name },
    { header: 'الجوال', value: (c) => c.phone },
    { header: 'البريد', value: (c) => c.email ?? '' },
    { header: 'إجمالي الحجوزات', value: (c) => statsFor(c.id).total },
    { header: 'مكتملة', value: (c) => statsFor(c.id).completed },
    { header: 'لم يحضر', value: (c) => statsFor(c.id).noShow },
    { header: 'إجمالي المدفوع', value: (c) => (statsFor(c.id).spend / 100).toFixed(2) },
    { header: 'ملاحظات', value: (c) => c.notes ?? '' },
  ]
  downloadCsv(`customers-${format(new Date(), 'yyyy-MM-dd')}`, results.value, columns)
}
</script>

<template>
  <div class="w-full p-4 lg:p-6 2xl:px-8">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="type-h3 text-fg">العملاء</h1>
        <p class="text-fg-subtle text-sm">من يزورك، كم مرة، ومن غاب عنك.</p>
      </div>
      <div class="flex items-center gap-3">
        <p class="text-fg-subtle text-sm">
          <span data-numeric>{{ results.length }}</span> عميل
        </p>
        <BaseButton size="sm" :icon="Download" :disabled="results.length === 0" @click="exportCsv">
          تصدير
        </BaseButton>
      </div>
    </header>

    <div class="mb-4 space-y-3">
      <SearchInput v-model="query" class="max-w-md" placeholder="ابحث بالاسم أو رقم الجوال" />
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="شرائح العملاء">
        <button
          v-for="sg in SEGMENTS"
          :key="sg.value"
          type="button"
          :aria-pressed="segment === sg.value"
          class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="
            segment === sg.value
              ? 'border-fg bg-fg text-fg-inverse'
              : 'border-border bg-surface text-fg-muted hover:text-fg'
          "
          @click="segment = sg.value"
        >
          {{ sg.label }}
        </button>
      </div>
    </div>

    <div class="surface">
      <ErrorState v-if="customers.error" :message="customers.error" @retry="customers.load(true)" />

      <div v-else-if="customers.isLoading && !customers.loaded" class="p-4">
        <SkeletonBlock variant="row" :count="6" />
      </div>

      <EmptyState
        v-else-if="results.length === 0 && (query || segment !== 'all')"
        variant="no-results"
        :icon="UserSearch"
        title="لا عميل بهذا الاسم أو الرقم"
        description="تأكد من الرقم، أو أنشئ الحجز مباشرة وسيُضاف العميل تلقائياً."
      />

      <EmptyState
        v-else-if="results.length === 0"
        variant="first-run"
        :icon="Users"
        title="لا عملاء بعد"
        description="يُضاف العملاء تلقائياً عند إنشاء أول حجز لهم."
      />

      <template v-else>
        <table class="hidden w-full border-collapse text-sm md:table">
          <thead class="bg-surface sticky top-16 z-10">
            <tr class="border-border border-b">
              <th
                v-for="col in COLS"
                :key="col.key"
                scope="col"
                class="text-fg-subtle px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
                :class="col.end ? 'text-end' : 'text-start'"
                :aria-sort="sortKey === col.key ? (sortDesc ? 'descending' : 'ascending') : 'none'"
              >
                <button
                  type="button"
                  class="hover:text-fg inline-flex items-center gap-1"
                  :class="sortKey === col.key && 'text-fg'"
                  @click="sortBy(col.key)"
                >
                  {{ col.label }}
                  <component
                    :is="sortKey === col.key ? (sortDesc ? ArrowDown : ArrowUp) : ArrowUpDown"
                    class="h-3.5 w-3.5"
                    :class="sortKey !== col.key && 'opacity-40'"
                    aria-hidden="true"
                  />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.c.id"
              class="border-border hover:bg-surface-hover cursor-pointer border-b last:border-b-0"
              @click="selectedId = r.c.id"
            >
              <td class="px-4 py-3">
                <span class="flex items-center gap-3">
                  <BaseAvatar :name="r.c.name" size="sm" />
                  <span class="min-w-0">
                    <button
                      type="button"
                      class="text-fg block truncate text-start font-semibold"
                      @click.stop="selectedId = r.c.id"
                    >
                      {{ r.c.name }}
                    </button>
                    <span
                      class="text-fg-subtle block text-xs"
                      dir="ltr"
                      style="text-align: start"
                      >{{ r.c.phone }}</span
                    >
                  </span>
                </span>
              </td>
              <td class="text-fg px-4 py-3 text-end font-semibold" data-numeric>
                {{ r.st.completed }}
              </td>
              <td class="text-fg-muted px-4 py-3 whitespace-nowrap">
                {{ r.st.last ? relativeDay(r.st.last.startAt) : '—' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span v-if="r.st.next" class="text-fg">{{
                  relativeDayTime(r.st.next.startAt)
                }}</span>
                <span v-else class="text-fg-faint">—</span>
              </td>
              <td
                class="px-4 py-3 text-end whitespace-nowrap"
                :class="r.st.noShow ? 'text-danger-700 font-semibold' : 'text-fg-faint'"
                data-numeric
              >
                {{ r.st.noShow ? `${r.st.noShow} · ${Math.round(r.st.noShowRate * 100)}%` : '—' }}
              </td>
              <td class="text-fg px-4 py-3 text-end font-semibold whitespace-nowrap" data-numeric>
                {{ money(r.st.spend) }}
              </td>
            </tr>
          </tbody>
        </table>

        <ul class="divide-border divide-y md:hidden">
          <li v-for="r in rows" :key="r.c.id">
            <button
              type="button"
              class="hover:bg-surface-hover flex w-full items-center gap-3 px-4 py-3 text-start transition-colors"
              @click="selectedId = r.c.id"
            >
              <BaseAvatar :name="r.c.name" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="text-fg block truncate text-sm font-semibold">{{ r.c.name }}</span>
                <span class="text-fg-subtle block truncate text-xs">
                  <span data-numeric>{{ r.st.completed }}</span> زيارة
                  <template v-if="r.st.next">
                    · القادم {{ relativeDay(r.st.next.startAt) }}</template
                  >
                </span>
              </span>
              <span
                v-if="r.st.noShow"
                class="bg-danger-50 text-danger-700 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                >غاب {{ r.st.noShow }}</span
              >
            </button>
          </li>
        </ul>
      </template>
    </div>

    <BaseDrawer
      :open="selected !== null"
      :title="selected?.name ?? ''"
      :subtitle="selected?.phone"
      @close="selectedId = null"
    >
      <div v-if="selected && stats" class="space-y-5">
        <div class="grid grid-cols-2 gap-2">
          <a
            :href="`tel:${selected.phone}`"
            class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-2.5 text-sm font-semibold"
          >
            <Phone class="h-4 w-4" aria-hidden="true" /> اتصال
          </a>
          <a
            :href="waLink(selected.phone)"
            target="_blank"
            rel="noopener"
            class="border-border bg-surface text-fg hover:bg-surface-hover flex items-center justify-center gap-2 rounded-[var(--radius-md)] border py-2.5 text-sm font-semibold"
          >
            <MessageCircle class="h-4 w-4" aria-hidden="true" /> واتساب
          </a>
        </div>
        <dl class="grid grid-cols-2 gap-3">
          <div class="surface p-3">
            <dt class="text-fg-subtle text-xs">إجمالي الحجوزات</dt>
            <dd class="text-fg mt-1 text-xl font-bold" data-numeric>{{ stats.total }}</dd>
          </div>
          <div class="surface p-3">
            <dt class="text-fg-subtle text-xs">مكتملة</dt>
            <dd class="text-fg mt-1 text-xl font-bold" data-numeric>{{ stats.completed }}</dd>
          </div>
          <div class="surface p-3">
            <dt class="text-fg-subtle text-xs">لم يحضر</dt>
            <dd
              class="mt-1 text-xl font-bold"
              :class="stats.noShow ? 'text-danger-700' : 'text-fg'"
              data-numeric
            >
              {{ stats.noShow }}
            </dd>
          </div>
          <div class="surface p-3">
            <dt class="text-fg-subtle text-xs">إجمالي المدفوع</dt>
            <dd class="text-fg mt-1 text-xl font-bold" data-numeric>
              {{ money(stats.spend) }}
            </dd>
          </div>
        </dl>

        <section v-if="stats.upcoming.length">
          <h3 class="text-fg-muted mb-2 text-[13px] font-semibold">مواعيد قادمة</h3>
          <ul class="surface divide-border divide-y overflow-hidden">
            <li v-for="b in stats.upcoming" :key="b.id">
              <button
                type="button"
                class="hover:bg-primary-soft/40 flex w-full items-center gap-2 px-3 py-2.5 text-start"
                @click="emit('openBooking', b.id)"
              >
                <span class="text-fg min-w-0 flex-1 truncate text-sm">
                  {{ relativeDayTime(b.startAt) }}
                </span>
                <StatusBadge :status="b.status" size="sm" />
              </button>
            </li>
          </ul>
        </section>

        <section>
          <h3 class="text-fg-muted mb-2 text-[13px] font-semibold">كل السجل</h3>
          <ul class="surface divide-border divide-y overflow-hidden">
            <li v-for="b in stats.all" :key="b.id">
              <button
                type="button"
                class="hover:bg-primary-soft/40 flex w-full items-center gap-2 px-3 py-2.5 text-start"
                @click="emit('openBooking', b.id)"
              >
                <span class="min-w-0 flex-1">
                  <span class="text-fg block truncate text-sm">
                    {{ relativeDayTime(b.startAt) }}
                  </span>
                  <span class="text-fg-subtle block truncate text-xs">
                    {{ bookings.hydrate(b).service?.name }}
                  </span>
                </span>
                <StatusBadge :status="b.status" size="sm" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </BaseDrawer>
  </div>
</template>
