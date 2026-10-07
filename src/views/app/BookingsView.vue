<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isSameDay, isWithinInterval, startOfDay, addDays, format } from 'date-fns'
import { ArrowDown, ArrowUp, CalendarPlus, Download, SearchX } from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { resources, services, serviceById } from '@/data/catalog'
import { BOOKING_STATUS, PAYMENT_STATUS } from '@/lib/status'
import { downloadCsv } from '@/lib/export'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BookingRow from '@/components/booking/BookingRow.vue'
import BookingsTable from '@/components/booking/BookingsTable.vue'
import { toast } from 'vue-sonner'
import { clone } from '@/lib/clone'
import SearchInput from '@/components/ui/SearchInput.vue'

const emit = defineEmits(['openBooking'])

const route = useRoute()
const store = useBookingsStore()
const customers = useCustomersStore()

const query = ref('')
// What a desk opens this list for is what is coming, not last July.
const quick = ref('upcoming')
const status = ref('all')
const serviceId = ref('all')
const resourceId = ref('all')
const sortKey = ref('time')
const sortDesc = ref(false)
const page = ref(1)

/** Large enough that most operators never paginate, small enough to stay fast. */
const PAGE_SIZE = 50

const QUICK = [
  { value: 'upcoming', label: 'القادمة' },
  { value: 'all', label: 'الكل' },
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'هذا الأسبوع' },
  { value: 'pending', label: 'بانتظار التأكيد' },
  { value: 'unpaid', label: 'غير مدفوع' },
  { value: 'attention', label: 'يحتاج إجراء' },
]

const SORTS = [
  { value: 'time', label: 'الموعد' },
  { value: 'customer', label: 'العميل' },
  { value: 'status', label: 'الحالة' },
  { value: 'price', label: 'المبلغ' },
]

onMounted(() => {
  query.value = route.query.q ?? ''
  if (route.query.filter === 'attention') quick.value = 'attention'
})

watch(
  () => route.query,
  (q) => {
    if (typeof q.q === 'string') query.value = q.q
    if (q.filter === 'attention') quick.value = 'attention'
  },
)

// Any change to what is being shown resets the page, or you end up looking at
// an empty page 4 of a 12-result list.
watch([query, quick, status, serviceId, resourceId, sortKey, sortDesc], () => (page.value = 1))

const attentionIds = computed(() => new Set(store.attention.map((a) => a.booking.id)))

function matchesQuick(b) {
  const start = new Date(b.startAt)
  switch (quick.value) {
    case 'upcoming':
      // A search looks everywhere: the booking you are hunting for may be past.
      return query.value.trim() !== '' || start >= startOfDay(new Date())
    case 'today':
      return isSameDay(start, new Date())
    case 'week':
      return isWithinInterval(start, {
        start: startOfDay(new Date()),
        end: addDays(startOfDay(new Date()), 7),
      })
    case 'pending':
      return b.status === 'pending'
    case 'unpaid':
      return b.paymentStatus === 'unpaid' && b.status !== 'cancelled'
    case 'attention':
      return attentionIds.value.has(b.id)
    default:
      return true
  }
}

function matchesQuery(b) {
  const q = query.value.trim()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const customer = customers.byId(b.customerId)
  return (
    b.reference.toLowerCase().includes(q.toLowerCase()) ||
    (customer?.name.includes(q) ?? false) ||
    (digits.length > 2 && (customer?.phone.replace(/\D/g, '').includes(digits) ?? false))
  )
}

const filtered = computed(() =>
  store.sorted.filter(
    (b) =>
      matchesQuick(b) &&
      matchesQuery(b) &&
      (status.value === 'all' || b.status === status.value) &&
      (serviceId.value === 'all' || b.serviceId === serviceId.value) &&
      (resourceId.value === 'all' || b.resourceId === resourceId.value),
  ),
)

// Status sorts by workflow order, not alphabetically: "pending" before
// "completed" is what an operator means by sorting on status.
const STATUS_ORDER = {
  pending: 0,
  confirmed: 1,
  completed: 2,
  no_show: 3,
  cancelled: 4,
}

const results = computed(() => {
  const rows = [...filtered.value]
  rows.sort((a, b) => {
    let d = 0
    switch (sortKey.value) {
      case 'customer':
        d = (customers.byId(a.customerId)?.name ?? '').localeCompare(
          customers.byId(b.customerId)?.name ?? '',
          'ar',
        )
        break
      case 'status':
        d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        break
      case 'price':
        d = a.priceMinor - b.priceMinor
        break
      case 'resource':
        d = (store.hydrate(a).resource?.name ?? '').localeCompare(
          store.hydrate(b).resource?.name ?? '',
          'ar',
        )
        break
      default:
        d = a.startAt.localeCompare(b.startAt)
    }
    // Ties fall back to time, so the order is stable and predictable.
    return (d || a.startAt.localeCompare(b.startAt)) * (sortDesc.value ? -1 : 1)
  })
  return rows
})

const pageCount = computed(() => Math.max(1, Math.ceil(results.value.length / PAGE_SIZE)))
const paged = computed(() =>
  results.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

const hasFilters = computed(
  () =>
    query.value.trim() !== '' ||
    quick.value !== 'upcoming' ||
    status.value !== 'all' ||
    serviceId.value !== 'all' ||
    resourceId.value !== 'all',
)

function clearAll() {
  query.value = ''
  quick.value = 'upcoming'
  status.value = 'all'
  serviceId.value = 'all'
  resourceId.value = 'all'
}

/** A row's one-click next step, with the way back. */
function quickAction({ id, status: next }) {
  const before = store.byId(id) ? clone(store.byId(id)) : null
  store.setStatus(id, next)
  toast.success(next === 'confirmed' ? 'تم التأكيد' : 'سُجّل الحضور', {
    action: { label: 'تراجع', onClick: () => before && store.restore(before) },
  })
}

function toggleSort(key) {
  if (sortKey.value === key) sortDesc.value = !sortDesc.value
  else {
    sortKey.value = key
    sortDesc.value = false
  }
}

/** Exports what is on screen after filtering — not the current page, and not
 *  the whole table. What you filtered to is what you meant. */
function exportCsv() {
  const columns = [
    { header: 'المرجع', value: (b) => b.reference },
    { header: 'التاريخ', value: (b) => format(new Date(b.startAt), 'yyyy-MM-dd') },
    { header: 'من', value: (b) => format(new Date(b.startAt), 'HH:mm') },
    { header: 'إلى', value: (b) => format(new Date(b.endAt), 'HH:mm') },
    { header: 'العميل', value: (b) => customers.byId(b.customerId)?.name ?? '' },
    { header: 'الجوال', value: (b) => customers.byId(b.customerId)?.phone ?? '' },
    { header: 'الخدمة', value: (b) => serviceById(b.serviceId)?.name ?? '' },
    { header: 'الحالة', value: (b) => BOOKING_STATUS[b.status].label },
    { header: 'الدفع', value: (b) => PAYMENT_STATUS[b.paymentStatus].label },
    { header: 'المبلغ', value: (b) => (b.priceMinor / 100).toFixed(2) },
    { header: 'ملاحظات', value: (b) => b.notes ?? '' },
  ]
  downloadCsv(`bookings-${format(new Date(), 'yyyy-MM-dd')}`, results.value, columns)
}
</script>

<template>
  <div class="w-full p-4 lg:p-6 2xl:px-8">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="type-h3 text-fg">الحجوزات</h1>
        <p class="text-fg-subtle text-sm">كل المواعيد، القادمة والسابقة، مع البحث والتصفية.</p>
      </div>
      <div class="flex items-center gap-3">
        <p class="text-fg-subtle text-sm">
          <span data-numeric>{{ results.length }}</span> من
          <span data-numeric>{{ store.items.length }}</span>
        </p>
        <BaseButton size="sm" :icon="Download" :disabled="results.length === 0" @click="exportCsv">
          تصدير
        </BaseButton>
      </div>
    </header>

    <!-- filters -->
    <div class="mb-4 space-y-3">
      <SearchInput
        v-model="query"
        class="max-w-md"
        placeholder="ابحث بالاسم أو الجوال أو رقم الحجز"
      />
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="مرشّحات سريعة">
        <button
          v-for="f in QUICK"
          :key="f.value"
          type="button"
          :aria-pressed="quick === f.value"
          class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="
            quick === f.value
              ? 'border-fg bg-fg text-fg-inverse'
              : 'hover:border-primary-line hover:text-primary-fg border-border bg-surface text-fg-muted'
          "
          @click="quick = f.value"
        >
          {{ f.label }}
        </button>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <BaseSelect
          v-model="status"
          label="الحالة"
          hide-label
          size="sm"
          :options="[
            { value: 'all', label: 'كل الحالات' },
            ...Object.entries(BOOKING_STATUS).map(([k, m]) => ({ value: k, label: m.label })),
          ]"
        />
        <BaseSelect
          v-model="serviceId"
          label="الخدمة"
          hide-label
          size="sm"
          :options="[
            { value: 'all', label: 'كل الخدمات' },
            ...services.map((s) => ({ value: s.id, label: s.name })),
          ]"
        />
        <BaseSelect
          v-if="resources.length > 1"
          v-model="resourceId"
          label="مع"
          hide-label
          size="sm"
          :options="[
            { value: 'all', label: 'كل الفريق' },
            ...resources.map((r) => ({ value: r.id, label: r.name })),
          ]"
        />

        <!-- Sort as buttons rather than table headers: below `sm` the rows are
             cards with no header row to click. -->
        <div class="flex items-center gap-1 md:hidden" role="group" aria-label="الترتيب">
          <span class="text-fg-subtle me-1 text-xs font-semibold">ترتيب:</span>
          <button
            v-for="s in SORTS"
            :key="s.value"
            type="button"
            :aria-pressed="sortKey === s.value"
            class="inline-flex h-9 items-center gap-1 rounded-[var(--radius-md)] border px-2.5 text-xs font-semibold transition-colors"
            :class="
              sortKey === s.value
                ? 'border-primary-line bg-primary-soft text-primary-fg'
                : 'border-border bg-surface text-fg-muted hover:border-primary-line'
            "
            @click="toggleSort(s.value)"
          >
            {{ s.label }}
            <component
              :is="sortDesc ? ArrowDown : ArrowUp"
              v-if="sortKey === s.value"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
            <span v-if="sortKey === s.value" class="sr-only">
              {{ sortDesc ? '— تنازلي' : '— تصاعدي' }}
            </span>
          </button>
        </div>

        <button
          v-if="hasFilters"
          type="button"
          class="text-fg-subtle hover:text-fg h-9 rounded-[var(--radius-md)] px-2.5 text-sm font-semibold"
          @click="clearAll"
        >
          مسح المرشّحات
        </button>
      </div>
    </div>

    <!-- results -->
    <div class="surface">
      <ErrorState v-if="store.error" :message="store.error" @retry="store.load(true)" />

      <div v-else-if="store.isLoading && !store.loaded" class="p-4">
        <SkeletonBlock variant="row" :count="6" />
      </div>

      <EmptyState
        v-else-if="results.length === 0 && hasFilters"
        variant="no-results"
        :icon="SearchX"
        title="لا نتائج مطابقة"
        description="جرّب توسيع نطاق البحث أو مسح المرشّحات للعودة إلى كل الحجوزات."
      />

      <EmptyState
        v-else-if="results.length === 0"
        variant="first-run"
        :icon="CalendarPlus"
        title="لا توجد حجوزات بعد"
        description="ابدأ بإنشاء أول حجز — اضغط N أو استخدم زر «حجز جديد» في الأعلى."
      />

      <template v-else>
        <div class="hidden md:block">
          <BookingsTable
            :rows="paged"
            :sort-key="sortKey"
            :sort-desc="sortDesc"
            @open="emit('openBooking', $event)"
            @sort="toggleSort"
            @quick="quickAction"
          />
        </div>
        <div role="list" class="md:hidden">
          <BookingRow
            v-for="b in paged"
            :key="b.id"
            :booking="b"
            show-day
            @open="emit('openBooking', $event)"
          />
        </div>
      </template>
    </div>

    <nav
      v-if="pageCount > 1"
      class="mt-4 flex items-center justify-between gap-3"
      aria-label="تنقّل الصفحات"
    >
      <BaseButton size="sm" :disabled="page === 1" @click="page -= 1">السابق</BaseButton>
      <p class="text-fg-subtle text-sm">
        صفحة <span data-numeric>{{ page }}</span> من
        <span data-numeric>{{ pageCount }}</span>
      </p>
      <BaseButton size="sm" :disabled="page === pageCount" @click="page += 1">التالي</BaseButton>
    </nav>
  </div>
</template>
