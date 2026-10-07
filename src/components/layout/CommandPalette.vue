<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CornerDownLeft,
  ListChecks,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Users,
} from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { useCustomersStore } from '@/stores/customers'
import { useTheme } from '@/composables/useTheme'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { relativeDayTime } from '@/lib/format'
import { BOOKING_STATUS } from '@/lib/status'
import Kbd from '@/components/ui/Kbd.vue'

/**
 * Ctrl/⌘+K: one box for finding anything and doing anything.
 *
 * Bookings by reference, name or phone; customers by name or phone; every
 * page; and the handful of actions an operator reaches for all day. Arrow
 * keys move, Enter runs, Escape closes. Results come from the stores already
 * in memory, so it answers as fast as you type.
 */
const props = defineProps({ open: { type: Boolean, required: true } })
const emit = defineEmits(['close', 'newBooking', 'openBooking'])

const router = useRouter()
const bookings = useBookingsStore()
const customers = useCustomersStore()
const theme = useTheme()

const query = ref('')
const active = ref(0)
const panel = ref(null)
const input = ref(null)

useFocusTrap(
  computed(() => props.open),
  panel,
  () => emit('close'),
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    query.value = ''
    active.value = 0
    await nextTick()
    input.value?.focus()
  },
)

const go = (path) => () => router.push(path)

const PAGES = [
  { label: 'اليوم', icon: Sun, run: go('/app') },
  { label: 'التقويم', icon: CalendarDays, run: go('/app/calendar') },
  { label: 'الحجوزات', icon: ListChecks, run: go('/app/bookings') },
  { label: 'العملاء', icon: Users, run: go('/app/customers') },
  { label: 'حارس المواعيد', icon: ShieldCheck, run: go('/app/guard') },
  { label: 'التحليلات', icon: BarChart3, run: go('/app/analytics') },
  { label: 'الإعدادات', icon: Settings, run: go('/app/settings') },
]

const actions = computed(() => [
  { label: 'حجز جديد', hint: 'N', icon: CalendarPlus, run: () => emit('newBooking') },
  {
    label: theme.isDark.value ? 'الوضع الفاتح' : 'الوضع الليلي',
    icon: theme.isDark.value ? Sun : Moon,
    run: theme.toggle,
  },
])

const digits = (s) => s.replace(/\D/g, '')

const groups = computed(() => {
  const q = query.value.trim()
  const ql = q.toLowerCase()
  const match = (label) => !q || label.includes(q)

  const out = []
  const acts = actions.value.filter((a) => match(a.label))
  if (acts.length) out.push({ title: 'إجراءات', items: acts })

  if (q) {
    const d = digits(q)
    const found = bookings.sorted
      .filter((b) => {
        const c = customers.byId(b.customerId)
        return (
          b.reference.toLowerCase().includes(ql) ||
          (c?.name ?? '').includes(q) ||
          (d.length >= 3 && digits(c?.phone ?? '').includes(d))
        )
      })
      // Upcoming first, then most recent past.
      .sort((a, b) => {
        const now = Date.now()
        const fa = new Date(a.startAt).getTime() >= now
        const fb = new Date(b.startAt).getTime() >= now
        if (fa !== fb) return fa ? -1 : 1
        return fa ? a.startAt.localeCompare(b.startAt) : b.startAt.localeCompare(a.startAt)
      })
      .slice(0, 6)
    if (found.length) {
      out.push({
        title: 'حجوزات',
        items: found.map((b) => ({
          label: `${customers.byId(b.customerId)?.name ?? 'عميل'} · ${relativeDayTime(b.startAt)}`,
          hint: `${b.reference} · ${BOOKING_STATUS[b.status].label}`,
          icon: CalendarDays,
          run: () => emit('openBooking', b.id),
        })),
      })
    }

    const people = customers
      .search(q)
      .slice(0, 4)
      .map((c) => ({
        label: c.name,
        hint: c.phone,
        icon: User,
        run: go(`/app/customers?customer=${c.id}`),
      }))
    if (people.length) out.push({ title: 'عملاء', items: people })

    out.push({
      title: 'بحث',
      items: [
        {
          label: `ابحث عن «${q}» في كل الحجوزات`,
          icon: Search,
          run: go(`/app/bookings?q=${encodeURIComponent(q)}`),
        },
      ],
    })
  }

  const pages = PAGES.filter((p) => match(p.label))
  if (pages.length) out.push({ title: 'انتقال', items: pages })
  return out
})

const flat = computed(() => groups.value.flatMap((g) => g.items))
watch(query, () => (active.value = 0))

function run(item) {
  emit('close')
  item.run()
}

function onKeydown(e) {
  const n = flat.value.length
  if (!n) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % n
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + n) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    run(flat.value[active.value])
  }
}

const indexOf = (item) => flat.value.indexOf(item)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="bg-overlay fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh] backdrop-blur-[2px]"
        @mousedown.self="emit('close')"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          aria-label="لوحة الأوامر"
          class="bg-surface-raised border-border elev-modal animate-pop-in w-full max-w-xl overflow-hidden rounded-[var(--radius-xl)] border"
        >
          <div class="border-border flex items-center gap-3 border-b px-4">
            <Search class="text-fg-subtle h-5 w-5 shrink-0" aria-hidden="true" />
            <input
              ref="input"
              v-model="query"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              :aria-activedescendant="flat.length ? `palette-item-${active}` : undefined"
              placeholder="ابحث عن حجز أو عميل، أو اكتب أمراً…"
              class="text-fg placeholder:text-fg-faint h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
              autocomplete="off"
              @keydown="onKeydown"
            />
            <Kbd>Esc</Kbd>
          </div>

          <div id="palette-results" role="listbox" class="max-h-[55vh] overflow-y-auto p-2">
            <p v-if="flat.length === 0" class="text-fg-subtle px-3 py-8 text-center text-sm">
              لا نتائج لـ «{{ query }}»
            </p>
            <div v-for="g in groups" :key="g.title" class="mb-1">
              <p class="text-fg-faint px-3 pt-2 pb-1 text-[11px] font-semibold">{{ g.title }}</p>
              <button
                v-for="item in g.items"
                :id="`palette-item-${indexOf(item)}`"
                :key="g.title + item.label"
                type="button"
                role="option"
                :aria-selected="indexOf(item) === active"
                class="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-start transition-colors"
                :class="indexOf(item) === active ? 'bg-primary-soft text-fg' : 'text-fg-muted'"
                @mousemove="active = indexOf(item)"
                @click="run(item)"
              >
                <component
                  :is="item.icon"
                  class="h-4 w-4 shrink-0"
                  :class="indexOf(item) === active ? 'text-primary-fg' : 'text-fg-subtle'"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="text-fg block truncate text-sm font-medium">{{ item.label }}</span>
                  <span
                    v-if="item.hint && g.title !== 'إجراءات'"
                    class="text-fg-subtle block truncate text-xs"
                  >
                    {{ item.hint }}
                  </span>
                </span>
                <Kbd v-if="item.hint && g.title === 'إجراءات'">{{ item.hint }}</Kbd>
                <CornerDownLeft
                  v-else-if="indexOf(item) === active"
                  class="text-fg-faint h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div
            class="border-border text-fg-faint flex items-center gap-4 border-t px-4 py-2 text-[11px]"
          >
            <span class="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> تنقّل</span>
            <span class="flex items-center gap-1"><Kbd>↵</Kbd> تنفيذ</span>
            <span class="flex items-center gap-1"><Kbd>Esc</Kbd> إغلاق</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
