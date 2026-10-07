<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  CalendarPlus,
  CalendarX2,
  CheckCheck,
  CircleCheck,
  MessageCircleWarning,
  Repeat,
  TriangleAlert,
} from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { useGuardStore } from '@/stores/guard'
import { useCustomersStore } from '@/stores/customers'
import { ATTENTION } from '@/lib/status'
import { fromNow, relativeDayTime } from '@/lib/format'

/**
 * The bell: what happened, and what is waiting on you, without leaving the
 * page you are on.
 *
 * "Needs you" holds what will not resolve itself — replies the guard handed
 * over, bookings that need a decision — and stays until it is dealt with.
 * "Latest" is the last two days of things worth knowing: online bookings,
 * cancellations, confirmations, refilled slots. Each item opens exactly
 * where it is handled. Read state is per device: anything newer than the
 * last "mark all read" is new.
 */
const emit = defineEmits(['openBooking'])
const bookings = useBookingsStore()
const guard = useGuardStore()
const customers = useCustomersStore()
const route = useRoute()
const router = useRouter()

const SEEN_KEY = 'bookingpro:notif-seen:v1'
const WINDOW_MS = 48 * 3600_000

const open = ref(false)
const root = ref(null)
const seenAt = ref(readSeen())

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}
function markAllRead() {
  seenAt.value = new Date().toISOString()
  try {
    localStorage.setItem(SEEN_KEY, seenAt.value)
  } catch {
    /* this session only */
  }
}

const nameOf = (b) => (b ? (bookings.hydrate(b).customer?.name ?? 'عميل') : 'عميل')
const recent = (at) => at && Date.now() - new Date(at).getTime() < WINDOW_MS

/* ------------------------------------------------------------ needs you */
const needs = computed(() => {
  const replies = guard.forStaff.map((m) => {
    const b = bookings.byId(m.bookingId)
    return {
      key: `reply:${m.id}`,
      at: m.at,
      icon: MessageCircleWarning,
      tone: 'text-primary-fg bg-primary-soft',
      title: `ردّ ${nameOf(b)}`,
      body: `«${m.body}»`,
      go: () =>
        router.push({ path: '/app/guard', query: { tab: 'conversations', c: m.bookingId } }),
    }
  })
  const decisions = bookings.attention.map(({ booking, reason }) => ({
    key: `att:${booking.id}:${reason}`,
    at: booking.updatedAt ?? booking.createdAt ?? new Date(0).toISOString(),
    icon: ATTENTION[reason].tone === 'danger' ? TriangleAlert : ATTENTION[reason].icon,
    tone:
      ATTENTION[reason].tone === 'danger'
        ? 'text-danger-700 bg-danger-50'
        : 'text-warning-700 bg-warning-50',
    title: ATTENTION[reason].label,
    body: `${nameOf(booking)} · ${relativeDayTime(booking.startAt)}`,
    go: () => emit('openBooking', booking.id),
  }))
  return [...replies, ...decisions]
})

/* --------------------------------------------------------------- latest */
const latest = computed(() => {
  const out = []
  for (const b of bookings.items) {
    if (b.channel === 'online' && recent(b.createdAt))
      out.push({
        key: `new:${b.id}`,
        at: b.createdAt,
        icon: CalendarPlus,
        tone: 'text-fg bg-surface-sunken',
        title: 'حجز جديد من صفحة الحجز',
        body: `${nameOf(b)} · ${relativeDayTime(b.startAt)}`,
        go: () => emit('openBooking', b.id),
      })
    const cancel =
      b.status === 'cancelled' &&
      [...(b.history ?? [])].reverse().find((h) => h.type === 'cancelled')
    if (cancel && recent(cancel.at))
      out.push({
        key: `cancel:${b.id}`,
        at: cancel.at,
        icon: CalendarX2,
        tone: 'text-fg-muted bg-surface-sunken',
        title: 'أُلغي موعد',
        body: `${nameOf(b)} · ${relativeDayTime(b.startAt)}`,
        go: () => emit('openBooking', b.id),
      })
  }
  for (const m of guard.messages) {
    if (!recent(m.at)) continue
    if (m.template === 'backfill_won')
      out.push({
        key: `refill:${m.id}`,
        at: m.at,
        icon: Repeat,
        tone: 'text-success-700 bg-success-50',
        title: 'أُعيد ملء موعد متفرّغ',
        body: `حُجز لـ${customers.byId(m.customerId)?.name ?? 'عميل'}`,
        go: () => router.push({ path: '/app/guard', query: { tab: 'refill' } }),
      })
    else if (m.direction === 'in' && m.intent === 'confirm' && !m.customerId)
      out.push({
        key: `confirm:${m.id}`,
        at: m.at,
        icon: CircleCheck,
        tone: 'text-success-700 bg-success-50',
        title: 'أكّد عميل حضوره',
        body: nameOf(bookings.byId(m.bookingId)),
        go: () => emit('openBooking', m.bookingId),
      })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15)
})

// New: happened after the last "mark all read", and has happened at all.
const isNew = (item) => item.at > seenAt.value && new Date(item.at).getTime() <= Date.now()
const unread = computed(() => [...needs.value, ...latest.value].filter((i) => isNew(i)).length)

function go(item) {
  open.value = false
  item.go()
}

/* --------------------------------------------------- opening and closing */
const panel = ref(null)
async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    panel.value?.querySelector('button, a')?.focus()
  }
}
function onPointer(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
function onKey(e) {
  if (open.value && e.key === 'Escape') {
    open.value = false
    root.value?.querySelector('[data-bell]')?.focus()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onPointer)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointer)
  document.removeEventListener('keydown', onKey)
})
watch(
  () => route.fullPath,
  () => (open.value = false),
)
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-bell
      class="text-fg-subtle hover:bg-surface-hover hover:text-fg relative inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors"
      :class="open && 'bg-surface-hover text-fg'"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-label="unread ? `الإشعارات: ${unread} جديد` : 'الإشعارات'"
      @click="toggle"
    >
      <Bell class="h-5 w-5" aria-hidden="true" />
      <span
        v-if="unread"
        class="bg-primary text-fg-on-primary ring-canvas absolute top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-bold ring-2"
        style="inset-inline-end: 0.3rem"
        aria-hidden="true"
        data-numeric
        >{{ unread > 9 ? '9+' : unread }}</span
      >
      <span
        v-else-if="needs.length"
        class="bg-primary ring-canvas absolute top-2 h-2 w-2 rounded-full ring-2"
        style="inset-inline-end: 0.6rem"
        aria-hidden="true"
      />
    </button>

    <Transition name="fade">
      <div
        v-if="open"
        ref="panel"
        role="dialog"
        aria-label="الإشعارات"
        class="bg-surface border-border elev-modal fixed inset-x-3 top-16 z-50 flex max-h-[min(36rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-[24rem]"
        style="inset-inline-end: 0"
      >
        <header class="border-border flex items-center justify-between border-b px-4 py-3">
          <p class="text-fg text-sm font-bold">الإشعارات</p>
          <button
            v-if="unread"
            type="button"
            class="text-fg-subtle hover:text-fg flex items-center gap-1 text-xs font-semibold"
            @click="markAllRead"
          >
            <CheckCheck class="h-3.5 w-3.5" aria-hidden="true" /> تعليم الكل كمقروء
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <p
            v-if="!needs.length && !latest.length"
            class="text-fg-subtle px-4 py-12 text-center text-sm"
          >
            لا جديد. كل شيء تحت السيطرة.
          </p>

          <template
            v-for="group in [
              { title: 'تحتاجك', items: needs },
              { title: 'آخر الأحداث', items: latest },
            ]"
            :key="group.title"
          >
            <section v-if="group.items.length">
              <p
                class="bg-surface-sunken text-fg-subtle border-border sticky top-0 border-b px-4 py-1.5 text-[11px] font-semibold"
              >
                {{ group.title }}
                <span class="text-fg-faint" data-numeric>· {{ group.items.length }}</span>
              </p>
              <ul class="divide-border divide-y">
                <li v-for="item in group.items" :key="item.key">
                  <button
                    type="button"
                    class="hover:bg-surface-hover flex w-full items-start gap-3 px-4 py-3 text-start transition-colors"
                    :class="isNew(item) && 'bg-primary-soft/40'"
                    @click="go(item)"
                  >
                    <span
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      :class="item.tone"
                      aria-hidden="true"
                    >
                      <component :is="item.icon" class="h-4 w-4" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="text-fg block text-[13px] font-semibold">{{ item.title }}</span>
                      <span class="text-fg-muted block truncate text-xs">{{ item.body }}</span>
                      <span class="text-fg-faint mt-0.5 block text-[11px]">{{
                        fromNow(item.at)
                      }}</span>
                    </span>
                    <span
                      v-if="isNew(item)"
                      class="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      aria-label="جديد"
                    />
                  </button>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>
