<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, Clock, RefreshCw, Send, X } from 'lucide-vue-next'
import { NUMBER_LOCALE } from '@/lib/format'

/**
 * The owner's morning, told by the product itself — beside the sign-in form,
 * so what waits behind it is shown rather than described.
 *
 * One day's appointments put themselves in order: a reminder leaves each row,
 * the answers come back and turn to «مؤكد», a late cancellation goes grey and
 * is taken from the waitlist, and «حماه المساعد» climbs with every slot that
 * would otherwise have stood empty. It plays twice, then rests on the finished
 * day; with reduced motion it simply shows that day.
 *
 * States per row: waiting → sent → confirmed, or cancelled → refilled.
 */

const ROWS = [
  { time: '9:00', name: 'منيرة', service: 'تنظيف بشرة', price: 220 },
  { time: '10:30', name: 'عبدالله', service: 'استشارة', price: 150 },
  { time: '12:00', name: 'ريما', service: 'جلسة ليزر', price: 450, refill: 'هدى' },
  { time: '4:00', name: 'فيصل', service: 'استشارة', price: 150 },
]

/** [ms, row, state]: one day's story, in the order the morning lives it. */
const SCRIPT = [
  [700, 0, 'sent'],
  [1500, 0, 'confirmed'],
  [2100, 1, 'sent'],
  [2900, 1, 'confirmed'],
  [3700, 2, 'cancelled'],
  [4900, 2, 'refilled'],
  [5700, 3, 'sent'],
]
const LOOP_MS = 11000
const MAX_LOOPS = 2

const FINAL = ['confirmed', 'confirmed', 'refilled', 'sent']
const states = ref(['waiting', 'waiting', 'waiting', 'waiting'])

const settled = computed(
  () => states.value.filter((s) => s === 'confirmed' || s === 'refilled').length,
)
/** What was kept: confirmed appointments and the one taken from the waitlist. */
const protectedSar = computed(() =>
  states.value.reduce(
    (sum, s, i) => (s === 'confirmed' || s === 'refilled' ? sum + ROWS[i].price : sum),
    0,
  ),
)

// The figure climbs to each new total instead of jumping to it.
const shown = ref(0)
let raf = 0
watch(protectedSar, (to) => {
  cancelAnimationFrame(raf)
  const from = shown.value
  const start = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 700)
    shown.value = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)))
    if (t < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
})
const sar = new Intl.NumberFormat(NUMBER_LOCALE)

// The ring: how much of the day is settled.
const R = 15
const CIRC = 2 * Math.PI * R
const dash = computed(() => CIRC * (1 - settled.value / ROWS.length))

const timers = []
let loops = 0
function clear() {
  timers.forEach(clearTimeout)
  timers.length = 0
}
function play() {
  clear()
  if (loops >= MAX_LOOPS) {
    states.value = [...FINAL]
    return
  }
  loops += 1
  states.value = ['waiting', 'waiting', 'waiting', 'waiting']
  for (const [ms, row, state] of SCRIPT) {
    timers.push(
      setTimeout(() => {
        const next = [...states.value]
        next[row] = state
        states.value = next
      }, ms),
    )
  }
  timers.push(setTimeout(play, LOOP_MS))
}
// A hidden tab does not need a morning played to it.
function onVisibility() {
  if (document.hidden) {
    clear()
    states.value = [...FINAL]
  } else if (loops < MAX_LOOPS && !timers.length) {
    play()
  }
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    states.value = [...FINAL]
    shown.value = protectedSar.value
    return
  }
  timers.push(setTimeout(play, 400))
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  clear()
  cancelAnimationFrame(raf)
  document.removeEventListener('visibilitychange', onVisibility)
})

const STATUS = {
  waiting: { label: 'لم يُذكَّر بعد', tone: 'text-fg-subtle', icon: Clock },
  sent: { label: 'بانتظار الرد', tone: 'text-warning-700', icon: Clock },
  confirmed: { label: 'مؤكد', tone: 'text-success-700', icon: Check },
  cancelled: { label: 'ألغت', tone: 'text-fg-subtle', icon: X },
  refilled: { label: 'مؤكد', tone: 'text-success-700', icon: Check },
}
</script>

<template>
  <div class="live-day mx-auto w-full max-w-md">
    <div class="border-border bg-surface elev-overlay rounded-[var(--radius-xl)] border p-5">
      <!-- header: the day, and how much of it is settled -->
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <p class="text-fg font-bold">مواعيد اليوم</p>
          <p class="text-fg-subtle text-xs">قبل أن تفتح الباب</p>
        </div>
        <div class="flex items-center gap-2.5">
          <span class="text-fg-muted text-xs font-semibold" data-numeric
            >{{ settled }} من {{ ROWS.length }} مؤكدة</span
          >
          <svg viewBox="0 0 36 36" class="h-9 w-9 -rotate-90">
            <circle cx="18" cy="18" :r="R" class="stroke-border" fill="none" stroke-width="3.5" />
            <circle
              cx="18"
              cy="18"
              :r="R"
              class="stroke-success-600 ring"
              fill="none"
              stroke-width="3.5"
              stroke-linecap="round"
              :stroke-dasharray="CIRC"
              :stroke-dashoffset="dash"
            />
          </svg>
        </div>
      </div>

      <ul class="space-y-2">
        <li
          v-for="(r, i) in ROWS"
          :key="r.time"
          class="row border-border relative flex items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-md)] border px-3 py-2.5"
          :class="{
            'row-confirmed': states[i] === 'confirmed' || states[i] === 'refilled',
            'row-cancelled': states[i] === 'cancelled',
          }"
        >
          <span class="flex min-w-0 items-center gap-3">
            <span class="text-fg-subtle w-10 shrink-0 text-xs" dir="ltr" data-numeric>{{
              r.time
            }}</span>
            <span class="min-w-0">
              <Transition name="swap" mode="out-in">
                <span
                  :key="states[i] === 'refilled' ? 'new' : 'old'"
                  class="text-fg block truncate text-sm font-semibold"
                  :class="states[i] === 'cancelled' && 'text-fg-subtle line-through'"
                >
                  {{ states[i] === 'refilled' ? r.refill : r.name }}
                </span>
              </Transition>
              <span class="text-fg-subtle block truncate text-xs">
                {{ r.service }}
                <span v-if="states[i] === 'refilled'" class="text-primary-fg font-semibold">
                  · من قائمة الانتظار
                </span>
              </span>
            </span>
          </span>

          <!-- the reminder, leaving the row -->
          <Send
            v-if="states[i] === 'sent'"
            :key="`send-${i}`"
            class="plane text-primary absolute h-4 w-4 rtl:-scale-x-100"
            aria-hidden="true"
          />

          <Transition name="status" mode="out-in">
            <span
              :key="states[i]"
              class="flex shrink-0 items-center gap-1 text-xs font-semibold"
              :class="STATUS[states[i]].tone"
            >
              <RefreshCw v-if="states[i] === 'refilled'" class="h-3.5 w-3.5" />
              <component :is="STATUS[states[i]].icon" v-else class="h-3.5 w-3.5" />
              {{ STATUS[states[i]].label }}
            </span>
          </Transition>
        </li>
      </ul>

      <!-- what the morning kept -->
      <div class="border-border mt-4 flex items-baseline justify-between border-t pt-4">
        <span class="text-fg-subtle text-xs font-semibold">حماه المساعد اليوم</span>
        <span class="text-fg font-display text-2xl font-bold" data-numeric>
          {{ sar.format(shown) }} <span class="text-fg-subtle text-sm font-medium">ر.س</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ring {
  transition: stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.row {
  transition:
    background-color 0.6s ease,
    border-color 0.6s ease,
    opacity 0.4s ease;
}
/* A brief tint when an answer lands, then the row settles back to white. */
.row-confirmed {
  animation: settle 1.4s ease-out;
}
@keyframes settle {
  0% {
    background-color: var(--color-success-50);
    border-color: var(--color-success-100);
  }
  100% {
    background-color: transparent;
  }
}
.row-cancelled {
  opacity: 0.6;
}

/* The reminder leaves along the row, towards the customer (the end side). */
.plane {
  inset-inline-start: 3.5rem;
  top: calc(50% - 0.5rem);
  animation: fly 0.9s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes fly {
  0% {
    opacity: 0;
    translate: 0 4px;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    inset-inline-start: calc(100% - 2rem);
    translate: 0 -6px;
  }
}

.status-enter-active,
.swap-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.status-leave-active,
.swap-leave-active {
  transition: opacity 0.18s ease;
}
.status-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
.swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.status-leave-to,
.swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .row-confirmed,
  .plane {
    animation: none;
  }
}
</style>
