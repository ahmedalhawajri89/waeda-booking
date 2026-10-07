<script setup>
import { ArrowLeft } from 'lucide-vue-next'
import HeroFlow from './hero/HeroFlow.vue'

/**
 * First screen. Two lines say what the business gets; below them the whole
 * journey plays out on real screens, from the customer booking on their phone
 * to the reminder they confirm the day before.
 */
</script>

<template>
  <section class="border-border bg-surface relative overflow-hidden border-b">
    <div
      class="mx-auto w-full max-w-7xl px-4 pt-10 pb-14 sm:px-6 sm:pt-12 lg:px-8 lg:pt-12 lg:pb-16"
    >
      <div class="mx-auto mb-10 max-w-3xl text-center lg:mb-12">
        <p class="rise text-fg-subtle mb-4 text-sm font-semibold" style="--i: 0">
          نظام حجز المواعيد للمنشآت الخدمية
        </p>

        <h1 class="hero-title text-fg mb-6">
          <span class="rise block" style="--i: 1">عميلك يحجز من جواله،</span>
          <span class="rise block" style="--i: 2"
            >ويحضر <span class="text-primary-fg">في موعده.</span></span
          >
        </h1>

        <p class="rise type-lede mx-auto mb-8 max-w-2xl" style="--i: 3">
          رابط حجز باسم منشأتك، وتقويم لفريقك، وتذكير واتساب يطلب التأكيد قبل الموعد.
        </p>

        <div
          class="rise flex flex-col items-center justify-center gap-3 sm:flex-row"
          style="--i: 4"
        >
          <RouterLink
            to="/register"
            class="btn-brand group inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-6 py-3.5 text-base font-bold sm:w-auto"
          >
            ابدأ مجاناً
            <ArrowLeft
              class="h-4 w-4 transition-transform group-hover:-translate-x-1 ltr:rotate-180"
              aria-hidden="true"
            />
          </RouterLink>
          <RouterLink
            to="/book"
            class="border-border-strong bg-surface text-fg hover:bg-surface-hover inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border px-6 py-3.5 text-base font-bold transition-colors sm:w-auto"
          >
            جرّب صفحة الحجز
          </RouterLink>
        </div>
      </div>

      <div class="rise" style="--i: 5">
        <HeroFlow />
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-title {
  font-family: var(--font-display);
  font-size: clamp(2.1rem, 4.2vw, 3.3rem);
  line-height: 1.22;
  font-weight: 700;
}

.rise {
  animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i, 0) * 90ms + 60ms);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rise {
    animation: none;
  }
}
</style>
