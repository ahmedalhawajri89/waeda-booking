<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { BellRing, Check, MapPin } from 'lucide-vue-next'
import PhoneFrame from '@/components/marketing/hero/PhoneFrame.vue'
import { iconFor } from '@/lib/icons'
import { duration } from '@/lib/format'

/**
 * The booking page being opened, beside the form that opens it — and then
 * what it is for: a customer booking on it.
 *
 * While the owner types, the part of the page they just changed lights up,
 * so every field visibly lands somewhere. When they pause, a customer plays
 * it out: taps a service, picks a time, books — the page says «تم الحجز» and
 * a «حجز جديد» card arrives beside the phone, the way it will reach their
 * calendar. Typing stops the scene; it plays three times at most, not while
 * the tab is hidden, and never with reduced motion.
 */
const props = defineProps({
  preview: { type: Object, required: true },
  isPlaces: { type: Boolean, required: false, default: false },
  slug: { type: String, required: false, default: '' },
})

const TIMES = ['10:00', '11:00', '12:30']
const price = (p) => (Number(p) > 0 ? `${Number(p)} ر.س` : 'مجاناً')

/* ---------------------------------------------------- what just changed */
const flash = reactive({ header: 0, services: 0, staff: 0 })
let lastInput = 0
function changed(part) {
  flash[part] += 1
  lastInput = Date.now()
  stopScene()
}
watch(
  () => [props.preview.name, props.preview.category, props.preview.address],
  () => changed('header'),
)
watch(
  () => props.preview.services.map((s) => `${s.name}|${s.durationMin}|${s.price}`).join(),
  () => changed('services'),
)
watch(
  () => props.preview.staff.map((m) => m.name).join(),
  () => changed('staff'),
)

/* ------------------------------------------------- a customer, booking */
const stage = ref(null)
const cursor = reactive({ x: 0, y: 0, shown: false, tap: 0 })
const sel = ref(0)
const time = ref(null)
const booked = ref(false)
const notice = ref(false)

const root = ref(null)
const serviceEls = ref([])
const timeEls = ref([])
const bookEl = ref(null)

function moveTo(el) {
  if (!el || !root.value) return
  const box = root.value.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  cursor.x = r.left - box.left + r.width / 2
  cursor.y = r.top - box.top + r.height / 2
}

const timers = []
let plays = 0
const MAX_PLAYS = 3
const QUIET_MS = 4000
function clear() {
  timers.forEach(clearTimeout)
  timers.length = 0
}
function at(ms, fn) {
  timers.push(setTimeout(fn, ms))
}
function stopScene() {
  clear()
  cursor.shown = false
  booked.value = false
  notice.value = false
  time.value = null
  sel.value = 0
  schedule()
}

function play() {
  clear()
  if (document.hidden || plays >= MAX_PLAYS) return
  if (Date.now() - lastInput < QUIET_MS) return schedule()
  plays += 1
  const target = props.preview.services.length > 1 ? 1 : 0
  moveTo(bookEl.value)
  cursor.y += 40
  cursor.shown = true
  at(500, () => moveTo(serviceEls.value[target]))
  at(1200, () => {
    cursor.tap += 1
    sel.value = target
  })
  at(1900, () => moveTo(timeEls.value[1]))
  at(2600, () => {
    cursor.tap += 1
    time.value = TIMES[1]
  })
  at(3300, () => moveTo(bookEl.value))
  at(4000, () => {
    cursor.tap += 1
    booked.value = true
  })
  at(4600, () => (notice.value = true))
  at(4900, () => (cursor.shown = false))
  at(8400, () => {
    booked.value = false
    notice.value = false
    time.value = null
    sel.value = 0
  })
  at(11000, play)
}
function schedule() {
  if (plays < MAX_PLAYS) at(QUIET_MS + 500, play)
}

function onVisibility() {
  if (document.hidden) clear()
  else schedule()
}
onMounted(async () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  await nextTick()
  lastInput = 0
  at(1500, play)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  clear()
  document.removeEventListener('visibilitychange', onVisibility)
})

const chosen = () => props.preview.services[sel.value] ?? props.preview.services[0]
</script>

<template>
  <div ref="root" class="relative">
    <p class="text-fg-subtle mb-3 text-center text-xs font-semibold">هكذا يرى عملاؤك صفحتك</p>
    <PhoneFrame class="mx-auto h-[34rem] w-[17rem]" time="9:41">
      <div class="relative flex h-full flex-col overflow-hidden">
        <div
          :key="`h${flash.header}`"
          class="border-border border-b px-4 pt-2 pb-3"
          :class="flash.header && 'flash'"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="bg-ink font-display grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
              >{{ preview.initial }}</span
            >
            <div class="min-w-0">
              <p class="text-fg truncate text-[13px] font-bold">{{ preview.name }}</p>
              <p class="text-fg-subtle truncate text-[10px]">{{ preview.category }}</p>
            </div>
          </div>
          <p
            v-if="preview.address"
            class="text-fg-subtle mt-1.5 flex items-center gap-1 truncate text-[10px]"
          >
            <MapPin class="h-3 w-3 shrink-0" aria-hidden="true" />{{ preview.address }}
          </p>
        </div>

        <div class="flex-1 space-y-3 overflow-hidden px-4 py-3">
          <p class="text-fg text-[11px] font-bold">الخدمة</p>
          <TransitionGroup
            :key="`s${flash.services}`"
            tag="ul"
            name="row"
            class="space-y-1.5 rounded-md"
            :class="flash.services && 'flash'"
          >
            <li
              v-for="(s, i) in preview.services.slice(0, 3)"
              :key="s.name + i"
              :ref="(el) => (serviceEls[i] = el)"
              class="flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors duration-300"
              :class="i === sel ? 'border-fg bg-surface-sunken' : 'border-border'"
            >
              <component :is="iconFor(s.iconKey)" class="text-fg-subtle h-3.5 w-3.5 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="text-fg block truncate text-[11px] font-semibold">{{
                  s.name || 'خدمة جديدة'
                }}</span>
                <span class="text-fg-subtle text-[9px]">{{ duration(s.durationMin) }}</span>
              </span>
              <span class="text-fg shrink-0 text-[10px] font-bold" data-numeric>{{
                price(s.price)
              }}</span>
            </li>
          </TransitionGroup>

          <div :key="`t${flash.staff}`" class="space-y-1.5" :class="flash.staff && 'flash'">
            <p class="text-fg text-[11px] font-bold">
              {{ isPlaces ? 'أي ملعب؟' : 'مع من؟' }}
            </p>
            <div class="flex flex-wrap gap-1">
              <span
                class="bg-fg text-fg-inverse rounded-full px-2 py-0.5 text-[9px] font-semibold"
                >{{ isPlaces ? 'أول ملعب متاح' : 'أي متاح' }}</span
              >
              <span
                v-for="(m, i) in preview.staff.slice(0, 3)"
                :key="m.name + i"
                class="border-border text-fg rounded-full border px-2 py-0.5 text-[9px]"
                >{{ m.name }}</span
              >
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-fg text-[11px] font-bold">أقرب الأوقات · غداً</p>
            <div class="grid grid-cols-3 gap-1.5">
              <span
                v-for="(t, i) in TIMES"
                :key="t"
                :ref="(el) => (timeEls[i] = el)"
                class="rounded-md border py-1.5 text-center text-[10px] font-semibold transition-colors duration-300"
                :class="
                  time === t
                    ? 'border-primary bg-primary text-fg-on-primary'
                    : 'border-border text-fg'
                "
                data-numeric
                >{{ t }}</span
              >
            </div>
          </div>
        </div>

        <div class="border-border border-t p-3">
          <span
            ref="bookEl"
            class="bg-primary text-fg-on-primary block rounded-md py-2 text-center text-[11px] font-bold transition-transform duration-150"
            :class="cursor.tap && booked && 'press'"
            >احجز موعدك</span
          >
        </div>

        <!-- the page's answer -->
        <Transition name="done">
          <div
            v-if="booked"
            class="bg-surface/95 absolute inset-0 grid place-items-center px-6 text-center"
          >
            <div>
              <span
                class="bg-success-600 mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full text-white"
              >
                <Check class="h-6 w-6" stroke-width="3" />
              </span>
              <p class="text-fg text-sm font-bold">تم حجز موعدك</p>
              <p class="text-fg-subtle mt-1 text-[10px]" data-numeric>
                {{ chosen()?.name || 'خدمة' }} · غداً {{ TIMES[1] }}
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </PhoneFrame>

    <!-- the customer's finger -->
    <span
      class="cursor pointer-events-none absolute z-20"
      :class="cursor.shown ? 'opacity-100' : 'opacity-0'"
      :style="{ left: `${cursor.x}px`, top: `${cursor.y}px` }"
    >
      <span :key="cursor.tap" class="tap" />
    </span>

    <!-- and what reaches the owner -->
    <Transition name="notice">
      <div
        v-if="notice"
        class="border-border bg-surface elev-overlay absolute -end-4 bottom-28 z-10 w-56 rounded-[var(--radius-lg)] border p-3"
      >
        <p class="text-primary-fg mb-1 flex items-center gap-1.5 text-[11px] font-bold">
          <BellRing class="h-3.5 w-3.5" /> حجز جديد
        </p>
        <p class="text-fg truncate text-sm font-semibold">{{ chosen()?.name || 'خدمة' }}</p>
        <p class="text-fg-subtle text-xs" data-numeric>غداً {{ TIMES[1] }} · وصل إلى تقويمك</p>
      </div>
    </Transition>

    <p class="text-fg-subtle mt-3 text-center text-[11px]" dir="ltr">
      waeda.app/b/{{ slug || '…' }}
    </p>
  </div>
</template>

<style scoped>
/* A field the owner just changed, landing on the page. */
.flash {
  animation: flash 0.9s ease-out;
}
@keyframes flash {
  0% {
    box-shadow: 0 0 0 3px var(--color-primary-soft);
    background-color: var(--color-primary-soft);
  }
  100% {
    box-shadow: 0 0 0 3px transparent;
    background-color: transparent;
  }
}

.cursor {
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border-radius: 999px;
  background: rgb(17 17 16 / 0.18);
  border: 2px solid rgb(17 17 16 / 0.55);
  transition:
    left 0.65s cubic-bezier(0.65, 0, 0.35, 1),
    top 0.65s cubic-bezier(0.65, 0, 0.35, 1),
    opacity 0.3s ease;
}
.tap {
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  border: 2px solid var(--color-primary);
  animation: tap 0.5s ease-out forwards;
}
@keyframes tap {
  from {
    transform: scale(0.6);
    opacity: 1;
  }
  to {
    transform: scale(2.2);
    opacity: 0;
  }
}
.press {
  transform: scale(0.97);
}

.done-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
.done-leave-active {
  transition: opacity 0.3s ease;
}
.done-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.done-leave-to {
  opacity: 0;
}

.notice-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
.notice-leave-active {
  transition: opacity 0.3s ease;
}
.notice-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.notice-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .flash {
    animation: none;
  }
}
</style>
