<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, CheckCheck, Stethoscope } from 'lucide-vue-next'
import PhoneFrame from './PhoneFrame.vue'

/**
 * The whole idea in one loop, left to right in reading order:
 *   the customer books on their phone → it lands on the business's day →
 *   the day before, a reminder asks them to confirm → they answer, and the
 *   appointment turns confirmed.
 * A dot travels the line between screens so the eye follows the booking.
 * Under reduced motion it shows the finished state and stays still.
 */

/* 0 idle · 1 time picked · 2 booked · 3 on the calendar · 4 reminder · 5 replied · 6 confirmed */
// It opens on the finished story — a booking, a reminder, a "yes" — rather
// than on an empty phone that only fills in seconds later.
const stage = ref(6)
const timers = []
const root = ref(null)
/** Played twice at most, and only while on screen: motion that never stops wears. */
const MAX_LOOPS = 2
let loops = 0
let observer

function clear() {
  timers.forEach(clearTimeout)
  timers.length = 0
}

function run() {
  clear()
  if (loops >= MAX_LOOPS) {
    stage.value = 6
    return
  }
  loops += 1
  stage.value = 0
  ;[
    [900, 1],
    [1900, 2],
    [3000, 3],
    [5000, 4],
    [6400, 5],
    [7200, 6],
  ].forEach(([ms, s]) => timers.push(setTimeout(() => (stage.value = s), ms)))
  timers.push(setTimeout(run, 12000))
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        if (!timers.length) timers.push(setTimeout(run, 2500))
      } else {
        clear()
        stage.value = 6
      }
    },
    { threshold: 0.3 },
  )
  observer.observe(root.value)
})
onBeforeUnmount(() => {
  clear()
  observer?.disconnect()
})

const TIMES = ['9:30', '10:00', '11:00', '11:30', '12:30', '1:00']
const DAY = [
  { time: '9:00', name: 'محمد العنزي', service: 'كشف عام' },
  { time: '10:00', name: 'هند السبيعي', service: 'مراجعة' },
  { time: '11:00', name: null },
  { time: '12:00', name: 'فيصل الدوسري', service: 'استشارة' },
]
const STEPS = ['العميل يحجز من رابطك', 'يصل الحجز لتقويمك', 'يؤكد حضوره قبل الموعد']
const stepOf = (s) => (s < 3 ? 0 : s < 4 ? 1 : 2)
</script>

<template>
  <div ref="root" aria-hidden="true">
    <div
      class="mx-auto grid max-w-5xl grid-cols-2 items-center gap-4 sm:gap-8 lg:grid-cols-[12.5rem_1fr_22rem_1fr_12.5rem] lg:gap-0"
    >
      <!-- 1 · the customer's booking page -->
      <div class="flex flex-col items-center gap-2">
        <PhoneFrame class="phone mx-auto" time="7:42">
          <div class="flex h-full flex-col px-3.5 pt-2 pb-3.5">
            <div class="border-border mb-3 flex items-center gap-2 border-b pb-2.5">
              <span class="bg-ink grid h-7 w-7 place-items-center rounded-[7px] text-white">
                <Stethoscope class="h-3.5 w-3.5" />
              </span>
              <div class="min-w-0">
                <p class="text-fg truncate text-[11px] font-bold">عيادات النخبة</p>
                <p class="text-fg-faint text-[9px]" dir="ltr">waeda.app/nokhba</p>
              </div>
            </div>

            <p class="text-fg-subtle mb-1.5 text-[9px] font-semibold">الخدمة</p>
            <div
              class="border-primary bg-primary-soft mb-3 flex items-center justify-between rounded-[8px] border px-2.5 py-2"
            >
              <span class="text-fg text-[10px] font-bold">كشف عام</span>
              <span class="text-fg-subtle text-[9px]" data-numeric>20 د · 150 ر.س</span>
            </div>

            <p class="text-fg-subtle mb-1.5 text-[9px] font-semibold">غداً، الأحد 12 أكتوبر</p>
            <div class="mb-auto grid grid-cols-3 gap-1.5">
              <span
                v-for="t in TIMES"
                :key="t"
                class="rounded-[6px] border py-1.5 text-center text-[10px] font-semibold transition-colors duration-300"
                :class="
                  t === '11:00' && stage >= 1
                    ? 'border-primary bg-primary text-white'
                    : 'border-border text-fg'
                "
                dir="ltr"
                data-numeric
                >{{ t }}</span
              >
            </div>

            <span
              class="mt-3 rounded-[8px] py-2 text-center text-[11px] font-bold transition-colors duration-300"
              :class="stage >= 1 ? 'bg-primary text-white' : 'bg-surface-sunken text-fg-faint'"
              :style="stage === 1 ? 'transform: scale(.97)' : ''"
              >تأكيد الحجز</span
            >

            <!-- booked -->
            <Transition name="screen">
              <div
                v-if="stage >= 2"
                class="bg-surface absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
              >
                <span
                  class="bg-success-600 mb-3 grid h-12 w-12 place-items-center rounded-full text-white"
                >
                  <Check class="h-6 w-6" stroke-width="3" />
                </span>
                <p class="text-fg mb-1 text-[13px] font-bold">تم حجز موعدك</p>
                <p class="text-fg-subtle mb-3 text-[10px]">الأحد 11:00 ص مع د. سارة</p>
                <span
                  class="border-border text-fg rounded-full border px-2.5 py-1 text-[9px] font-semibold"
                  dir="ltr"
                  >W-2041</span
                >
              </div>
            </Transition>
          </div>
        </PhoneFrame>
        <p class="text-fg-subtle text-center text-xs lg:hidden">{{ STEPS[0] }}</p>
      </div>

      <!-- line 1 -->
      <div class="relative hidden h-px lg:block">
        <div class="border-border-strong absolute inset-0 border-t border-dashed" />
        <span v-if="stage === 2 || stage === 3" :key="'a' + stage" class="travel" />
      </div>

      <!-- 2 · the business's day -->
      <div
        class="border-border bg-surface elev-overlay hidden rounded-[var(--radius-xl)] border p-4 lg:block"
      >
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p class="text-fg text-[13px] font-bold">تقويم الأحد</p>
            <p class="text-fg-subtle text-[10px]">عيادات النخبة · د. سارة</p>
          </div>
          <span
            class="bg-surface-sunken text-fg rounded-full px-2.5 py-1 text-[10px] font-bold"
            data-numeric
          >
            {{ stage >= 3 ? 14 : 13 }} موعداً
          </span>
        </div>
        <ul class="space-y-1.5">
          <li v-for="row in DAY" :key="row.time" class="flex items-stretch gap-2.5">
            <span class="text-fg-faint w-9 shrink-0 pt-2 text-[10px]" dir="ltr" data-numeric>{{
              row.time
            }}</span>
            <div
              v-if="row.name"
              class="border-border bg-surface-sunken flex flex-1 items-center justify-between rounded-[8px] border px-2.5 py-2"
            >
              <span class="text-fg text-[11px] font-semibold">{{ row.name }}</span>
              <span class="text-fg-subtle text-[10px]">{{ row.service }}</span>
            </div>
            <div
              v-else
              class="relative flex flex-1 items-center justify-between rounded-[8px] border px-2.5 py-2 transition-colors duration-500"
              :class="
                stage >= 6
                  ? 'border-success-600/40 bg-success-50'
                  : stage >= 3
                    ? 'border-primary-line bg-primary-soft'
                    : 'border-border border-dashed'
              "
            >
              <template v-if="stage >= 3">
                <span class="land text-fg text-[11px] font-semibold">نورة القحطاني</span>
                <span
                  class="text-[10px] font-bold"
                  :class="stage >= 6 ? 'text-success-700' : 'text-primary-fg'"
                  >{{ stage >= 6 ? 'مؤكد' : stage >= 4 ? 'بانتظار التأكيد' : 'حجز جديد' }}</span
                >
              </template>
              <span v-else class="text-fg-faint text-[10px]">متاح</span>
            </div>
          </li>
        </ul>
      </div>

      <!-- line 2 -->
      <div class="relative hidden h-px lg:block">
        <div class="border-border-strong absolute inset-0 border-t border-dashed" />
        <span v-if="stage === 4" key="b" class="travel" />
      </div>

      <!-- 3 · the reminder, the day before -->
      <div class="flex flex-col items-center gap-2">
        <PhoneFrame class="phone mx-auto" time="7:00">
          <div class="flex h-full flex-col">
            <div class="border-border flex items-center gap-2 border-b px-3.5 pt-1 pb-2.5">
              <span class="bg-ink grid h-7 w-7 place-items-center rounded-full text-white">
                <Stethoscope class="h-3.5 w-3.5" />
              </span>
              <div>
                <p class="text-fg text-[11px] font-bold">عيادات النخبة</p>
                <p class="text-fg-faint text-[9px]">{{ stage === 5 ? 'يكتب…' : 'واتساب' }}</p>
              </div>
            </div>
            <div class="bg-surface-sunken flex-1 space-y-2 px-3 py-3">
              <p class="text-fg-faint text-center text-[9px]">السبت</p>
              <Transition name="bubble">
                <div
                  v-if="stage >= 4"
                  class="bg-surface text-fg me-5 rounded-[12px] rounded-ss-[4px] px-2.5 py-2 text-[10px] leading-relaxed shadow-sm"
                >
                  مرحباً نورة، نذكّرك بموعدك غداً الساعة 11:00 ص مع د. سارة. للتأكيد أرسلي 1،
                  وللإلغاء 2.
                </div>
              </Transition>
              <Transition name="bubble">
                <div
                  v-if="stage >= 5"
                  class="bg-primary ms-auto flex w-fit items-center gap-1 rounded-[12px] rounded-se-[4px] px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  1 <CheckCheck class="h-3 w-3 opacity-80" />
                </div>
              </Transition>
              <Transition name="bubble">
                <div
                  v-if="stage >= 6"
                  class="bg-surface text-fg me-5 rounded-[12px] rounded-ss-[4px] px-2.5 py-2 text-[10px] leading-relaxed shadow-sm"
                >
                  تم تأكيد موعدك. نراك غداً.
                </div>
              </Transition>
            </div>
          </div>
        </PhoneFrame>
        <p class="text-fg-subtle text-center text-xs lg:hidden">{{ STEPS[2] }}</p>
      </div>
    </div>

    <!-- steps -->
    <ol class="mx-auto mt-6 hidden max-w-5xl grid-cols-3 lg:grid">
      <li
        v-for="(s, i) in STEPS"
        :key="s"
        class="flex items-center justify-center gap-2 text-sm transition-colors duration-300"
        :class="stepOf(stage) === i ? 'text-fg font-bold' : 'text-fg-subtle'"
      >
        <span
          class="grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold transition-colors duration-300"
          :class="stepOf(stage) === i ? 'bg-ink border-ink text-white' : 'border-border-strong'"
          data-numeric
          >{{ i + 1 }}</span
        >
        {{ s }}
      </li>
    </ol>
  </div>
</template>

<style scoped>
.phone {
  width: 12.5rem;
  height: 25rem;
}
@media (max-width: 639px) {
  /* Two phones side by side must fit a 360px screen with its gutters. */
  .phone {
    width: min(10.5rem, 41vw);
    height: auto;
    aspect-ratio: 1 / 2;
    font-size: 90%;
  }
}

/* the booking, travelling between screens (RTL: from the start edge to the end edge) */
.travel {
  position: absolute;
  top: -5px;
  inset-inline-start: 0;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--color-primary);
  box-shadow: 0 0 0 4px var(--color-primary-soft);
  animation: travel 1s cubic-bezier(0.65, 0, 0.35, 1) forwards;
}
@keyframes travel {
  from {
    inset-inline-start: 0;
  }
  to {
    inset-inline-start: calc(100% - 10px);
  }
}

.land {
  animation: land 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes land {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}

.screen-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
.screen-leave-active {
  transition: opacity 0.25s ease;
}
.screen-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.screen-leave-to {
  opacity: 0;
}

.bubble-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.bubble-leave-active {
  transition: opacity 0.2s ease;
}
.bubble-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.bubble-leave-to {
  opacity: 0;
}
</style>
