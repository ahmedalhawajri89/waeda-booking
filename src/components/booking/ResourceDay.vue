<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { addMinutes, differenceInMinutes } from 'date-fns'
import { GripVertical, Plus, Users } from 'lucide-vue-next'
import { useBookingsStore } from '@/stores/bookings'
import { schedule, serviceById } from '@/data/catalog'
import { initialOf } from '@/data/business'
import { windowFor } from '@/lib/hours'
import { assignLanes } from '@/lib/lanes'
import { BOOKING_STATUS, bookingTone } from '@/lib/status'
import { time, timeRange } from '@/lib/format'

/**
 * A day, one column per person.
 *
 * The question at the desk is "who is free, and when", so each member of the
 * team gets their own column and their own gaps. Three gestures on it:
 *   - a click on a booking opens it;
 *   - a click on empty time starts a booking with that person at that time;
 *   - a drag moves a booking — up and down for the time, across for the
 *     person — and drops through bookings.move(), which refuses a clash.
 * Everything snaps to a quarter hour. The reschedule drawer remains the
 * keyboard path for the same move.
 */
const props = defineProps({
  date: { type: Date, required: true },
  resources: { type: Array, required: true },
  /** Pixels per minute: 1.4 roomy, 0.9 compact. */
  scale: { type: Number, required: false, default: 1.2 },
})
const emit = defineEmits(['open', 'create', 'move'])

const store = useBookingsStore()
const SNAP = 15
const MOVABLE = new Set(['pending', 'confirmed'])

/* -------------------------------------------------------------- frame */
const dayBookings = computed(() => store.onDay(props.date))

/**
 * Opening hours, widened to cover any booking that sits outside them —
 * a manual late booking still has to be visible to be dealt with.
 */
const bounds = computed(() => {
  // The business day, which may close after midnight.
  const w = windowFor(props.date, schedule)
  let open = w?.open ?? null
  let close = w?.close ?? null
  for (const b of dayBookings.value) {
    const s = new Date(b.startAt)
    const e = new Date(b.endAt)
    if (!open || s < open) open = s
    if (!close || e > close) close = e
  }
  if (!open || !close) return null
  // Whole hours either side, so the rail starts and ends on a label.
  open = new Date(open.getFullYear(), open.getMonth(), open.getDate(), open.getHours())
  if (close.getMinutes() > 0) close = addMinutes(close, 60 - close.getMinutes())
  return { open, close, totalMin: differenceInMinutes(close, open), closedToday: !w }
})

const px = (min) => min * props.scale

/** Prayer pauses, drawn across every column so a booking is not put there. */
const pauses = computed(() => {
  const b = bounds.value
  const w = windowFor(props.date, schedule)
  if (!b || !w) return []
  return w.breaks.map((p) => ({
    label: p.label,
    top: px(differenceInMinutes(p.start, b.open)),
    height: px(differenceInMinutes(p.end, p.start)),
  }))
})
const ticks = computed(() => {
  const b = bounds.value
  if (!b) return []
  const out = []
  for (let m = 0; m <= b.totalMin; m += 30) {
    out.push({ top: px(m), label: m % 60 === 0 ? time(addMinutes(b.open, m)) : null })
  }
  return out
})

const nowTop = computed(() => {
  const b = bounds.value
  if (!b) return null
  const m = differenceInMinutes(now.value, b.open)
  return m < 0 || m > b.totalMin ? null : px(m)
})
const now = ref(new Date())
let clock
onMounted(() => (clock = setInterval(() => (now.value = new Date()), 60_000)))
onBeforeUnmount(() => clearInterval(clock))

/* ------------------------------------------------------------ columns */
const columns = computed(() =>
  props.resources.map((r) => {
    const own = dayBookings.value.filter((b) => b.resourceId === r.id)
    // A class's seats are one block — the session — not a dozen side by side.
    const singles = []
    const sessions = new Map()
    for (const b of own) {
      const capacity = serviceById(b.serviceId)?.capacity ?? 1
      if (capacity > 1 && b.status !== 'cancelled') {
        const key = `${b.serviceId}|${b.startAt}`
        if (!sessions.has(key)) sessions.set(key, { capacity, items: [] })
        sessions.get(key).items.push(b)
      } else singles.push(b)
    }
    const blockOf = (b, group = null) => ({
      id: group ? `session:${b.serviceId}|${b.startAt}` : b.id,
      top: px(differenceInMinutes(new Date(b.startAt), bounds.value.open)),
      height: Math.max(px(differenceInMinutes(new Date(b.endAt), new Date(b.startAt))), 26),
      b,
      view: store.hydrate(b),
      group,
    })
    const blocks = assignLanes([
      ...singles.map((b) => blockOf(b)),
      ...[...sessions.values()].map(({ capacity, items }) => {
        const seated = items.filter((x) => x.status !== 'no_show')
        return blockOf(seated[0] ?? items[0], { taken: seated.length, capacity })
      }),
    ])
    const live = own.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show')
    return { r, blocks, count: live.length }
  }),
)

/* ------------------------------------------------- empty time → create */
const colEls = ref([])
const hover = ref(null) // { col, top, startAt }

function minuteAt(colIndex, clientY) {
  const rect = colEls.value[colIndex]?.getBoundingClientRect()
  if (!rect || !bounds.value) return null
  const m = Math.round((clientY - rect.top) / props.scale / SNAP) * SNAP
  return Math.max(0, Math.min(m, bounds.value.totalMin - SNAP))
}

function onColumnMove(e, i) {
  if (drag.value || e.target.closest('[data-block]')) return (hover.value = null)
  const m = minuteAt(i, e.clientY)
  if (m === null) return
  hover.value = { col: i, top: px(m), startAt: addMinutes(bounds.value.open, m) }
}

function onColumnClick(e, i) {
  if (e.target.closest('[data-block]') || justDragged) return
  const m = minuteAt(i, e.clientY)
  if (m === null) return
  emit('create', {
    resourceId: props.resources[i].id,
    startAt: addMinutes(bounds.value.open, m).toISOString(),
  })
}

/* --------------------------------------------------------------- drag */
const drag = ref(null)
let justDragged = false

function onBlockDown(e, block, colIndex) {
  if (e.button !== 0) return
  // A session is opened, not dragged: moving one seat would split the class.
  if (block.group) {
    emit('open', block.b.id)
    return
  }
  drag.value = {
    id: block.id,
    b: block.b,
    view: block.view,
    fromCol: colIndex,
    col: colIndex,
    startY: e.clientY,
    startX: e.clientX,
    origTop: block.top,
    top: block.top,
    height: block.height,
    moved: false,
  }
  e.currentTarget.setPointerCapture?.(e.pointerId)
}

function onBlockMove(e) {
  const d = drag.value
  if (!d) return
  const dy = e.clientY - d.startY
  if (!d.moved && Math.abs(dy) < 5 && Math.abs(e.clientX - d.startX) < 5) return
  if (!MOVABLE.has(d.b.status)) return
  d.moved = true
  hover.value = null
  const raw = (d.origTop + dy) / props.scale
  const m = Math.max(0, Math.min(Math.round(raw / SNAP) * SNAP, bounds.value.totalMin - SNAP))
  d.top = px(m)
  // The column under the pointer is the person it would move to.
  const i = colEls.value.findIndex((el) => {
    const r = el?.getBoundingClientRect()
    return r && e.clientX >= r.left && e.clientX <= r.right
  })
  if (i !== -1) d.col = i
}

function onBlockUp() {
  const d = drag.value
  drag.value = null
  if (!d) return
  if (!d.moved) return emit('open', d.id)
  justDragged = true
  setTimeout(() => (justDragged = false), 0)
  const startAt = addMinutes(bounds.value.open, d.top / props.scale).toISOString()
  const resourceId = props.resources[d.col].id
  if (startAt === new Date(d.b.startAt).toISOString() && resourceId === d.b.resourceId) return
  emit('move', { id: d.id, startAt, resourceId })
}

const ghostLabel = computed(() => {
  const d = drag.value
  if (!d?.moved) return ''
  const start = addMinutes(bounds.value.open, d.top / props.scale)
  return `${time(start)} · ${props.resources[d.col]?.name ?? ''}`
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `3.5rem repeat(${props.resources.length}, minmax(11rem, 1fr))`,
}))
</script>

<template>
  <div v-if="!bounds" class="text-fg-subtle px-4 py-16 text-center text-sm">
    مغلق في هذا اليوم، ولا مواعيد عليه.
  </div>

  <div v-else-if="!resources.length" class="text-fg-subtle px-4 py-16 text-center text-sm">
    لا يوجد أحد في الفريق بعد. أضف الفريق من الإعدادات.
  </div>

  <div v-else class="overflow-x-auto">
    <div class="min-w-full" :style="{ minWidth: `${3.5 + resources.length * 11}rem` }">
      <!-- who -->
      <div class="bg-surface border-border sticky top-0 z-20 grid border-b" :style="gridStyle">
        <span class="bg-surface sticky start-0 z-10" />
        <div
          v-for="c in columns"
          :key="c.r.id"
          class="border-border flex items-center gap-2.5 border-s px-3 py-2.5"
        >
          <span
            class="bg-surface-sunken text-fg hidden h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold sm:grid"
            aria-hidden="true"
            >{{ initialOf(c.r.name) }}</span
          >
          <div class="min-w-0">
            <p class="text-fg truncate text-sm font-semibold" :title="c.r.name">{{ c.r.name }}</p>
            <p class="text-fg-subtle truncate text-[11px]">
              <template v-if="c.r.role">{{ c.r.role }} · </template>
              <span data-numeric>{{ c.count }}</span> مواعيد
            </p>
          </div>
        </div>
      </div>

      <!-- when -->
      <div class="relative grid" :style="[gridStyle, { height: `${px(bounds.totalMin) + 8}px` }]">
        <!-- hour rail: it stays in view while the columns scroll sideways -->
        <div class="bg-surface sticky start-0 z-[15]" data-hour-rail>
          <span
            v-for="t in ticks.filter((t) => t.label)"
            :key="t.top"
            class="text-fg-faint absolute start-2 text-[11px]"
            :class="t.top > 0 && '-translate-y-1/2'"
            :style="{ top: `${t.top}px` }"
            data-numeric
            >{{ t.label }}</span
          >
        </div>

        <!-- one column per person -->
        <div
          v-for="(c, i) in columns"
          :key="c.r.id"
          :ref="(el) => (colEls[i] = el)"
          class="border-border relative cursor-copy border-s"
          @pointermove="onColumnMove($event, i)"
          @pointerleave="hover = null"
          @click="onColumnClick($event, i)"
        >
          <div
            v-for="t in ticks"
            :key="t.top"
            class="pointer-events-none absolute inset-x-0 border-t"
            :class="t.label ? 'border-border' : 'border-border/60 border-dashed'"
            :style="{ top: `${t.top}px` }"
          />

          <!-- prayer pauses -->
          <div
            v-for="p in pauses"
            :key="p.label + p.top"
            class="bg-surface-sunken border-border text-fg-faint pointer-events-none absolute inset-x-0 flex items-start justify-end border-y border-dashed px-1.5 pt-0.5 text-[10px]"
            :style="{ top: `${p.top}px`, height: `${p.height}px` }"
            data-pause
          >
            <span v-if="i === 0 && p.height > 14">{{ p.label }}</span>
          </div>

          <!-- the time under the pointer, offered -->
          <div
            v-if="hover && hover.col === i"
            class="border-primary-line bg-primary-soft text-primary-fg pointer-events-none absolute inset-x-1 z-10 flex items-center gap-1 rounded-[6px] border border-dashed px-2 text-[11px] font-semibold"
            :style="{ top: `${hover.top}px`, height: `${px(SNAP * 2)}px` }"
          >
            <Plus class="h-3 w-3" aria-hidden="true" />
            <span data-numeric>{{ time(hover.startAt) }}</span>
          </div>

          <!-- bookings -->
          <button
            v-for="blk in c.blocks"
            :key="blk.id"
            type="button"
            data-block
            class="group absolute z-10 flex touch-none flex-col overflow-hidden rounded-[6px] border px-2 py-1 text-start text-xs transition-shadow hover:shadow-md"
            :class="[
              bookingTone(blk.b.status),
              MOVABLE.has(blk.b.status) && !blk.group
                ? 'cursor-grab active:cursor-grabbing'
                : 'cursor-pointer',
              drag?.id === blk.id && drag.moved && 'opacity-40',
            ]"
            :style="{
              top: `${blk.top + 1}px`,
              height: `${blk.height - 2}px`,
              insetInlineStart: `calc(${(blk.lane / blk.lanes) * 100}% + 3px)`,
              width: `calc(${100 / blk.lanes}% - 6px)`,
            }"
            :aria-label="
              blk.group
                ? `${blk.view.service?.name ?? ''}، ${blk.group.taken} من ${blk.group.capacity}، ${timeRange(blk.b.startAt, blk.b.endAt)}`
                : `${blk.view.customer?.name ?? 'عميل'}، ${blk.view.service?.name ?? ''}، ${timeRange(blk.b.startAt, blk.b.endAt)}، ${BOOKING_STATUS[blk.b.status].label}`
            "
            :data-session="blk.group ? '' : undefined"
            @pointerdown="onBlockDown($event, blk, i)"
            @pointermove="onBlockMove"
            @pointerup="onBlockUp"
            @pointercancel="drag = null"
            @keydown.enter.prevent="emit('open', blk.b.id)"
          >
            <!-- a class: the session, how full it is -->
            <template v-if="blk.group">
              <span class="flex items-center gap-1">
                <Users class="h-3 w-3 shrink-0" aria-hidden="true" />
                <span class="truncate font-semibold">{{ blk.view.service?.name }}</span>
                <span class="ms-auto shrink-0 font-bold" data-numeric
                  >{{ blk.group.taken }}/{{ blk.group.capacity }}</span
                >
              </span>
              <span v-if="blk.height > 34" class="truncate opacity-75" data-numeric>{{
                timeRange(blk.b.startAt, blk.b.endAt)
              }}</span>
            </template>
            <template v-else>
              <span class="flex items-center gap-1">
                <component
                  :is="BOOKING_STATUS[blk.b.status].icon"
                  class="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <span class="truncate font-semibold">{{ blk.view.customer?.name ?? 'عميل' }}</span>
                <GripVertical
                  v-if="MOVABLE.has(blk.b.status)"
                  class="ms-auto h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50"
                  aria-hidden="true"
                />
              </span>
              <span v-if="blk.height > 34" class="truncate opacity-80">{{
                blk.view.service?.name
              }}</span>
              <span v-if="blk.height > 52" class="truncate opacity-70" data-numeric>{{
                timeRange(blk.b.startAt, blk.b.endAt)
              }}</span>
            </template>
          </button>

          <!-- where a dragged booking would land -->
          <div
            v-if="drag?.moved && drag.col === i"
            class="border-fg bg-surface pointer-events-none absolute inset-x-1 z-30 rounded-[6px] border-2 px-2 py-1 text-xs shadow-lg"
            :style="{ top: `${drag.top + 1}px`, height: `${drag.height - 2}px` }"
          >
            <span class="text-fg block truncate font-semibold">{{
              drag.view.customer?.name ?? 'عميل'
            }}</span>
            <span class="text-fg-subtle block truncate" data-numeric>{{ ghostLabel }}</span>
          </div>
        </div>

        <!-- now -->
        <div
          v-if="nowTop !== null"
          class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
          :style="{ top: `${nowTop}px` }"
          aria-hidden="true"
        >
          <span
            class="bg-primary text-fg-on-primary ms-1 rounded-full px-1.5 text-[10px] font-bold"
            data-numeric
            >{{ time(now) }}</span
          >
          <span class="bg-primary h-px flex-1" />
        </div>
      </div>
    </div>
  </div>
</template>
