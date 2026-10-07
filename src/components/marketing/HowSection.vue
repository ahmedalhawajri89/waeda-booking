<script setup>
import { Check, Clock, Copy, MessageCircle } from 'lucide-vue-next'

/**
 * Three steps, each with the small piece of screen that step happens on. The
 * pictures are the real shapes of the setup form, the shared link and the day
 * list, kept small so they read as evidence rather than decoration.
 */
</script>

<template>
  <section id="how-it-works" class="section bg-canvas">
    <div class="section-inner">
      <header class="mb-12 max-w-2xl md:mb-16">
        <h2 v-reveal class="type-h1 text-fg mb-4">تبدأ في نفس اليوم</h2>
        <p v-reveal="60" class="type-lede">
          لا تركيب ولا تدريب. تضيف خدماتك مرة واحدة، وترسل الرابط لعملائك، وتتابع.
        </p>
      </header>

      <ol class="grid gap-6 md:grid-cols-3">
        <!-- 1 -->
        <li v-reveal class="flex flex-col">
          <span class="text-fg-faint font-display mb-3 text-sm font-bold" data-numeric>01</span>
          <h3 class="type-h3 text-fg mb-2">أضف خدماتك وساعات عملك</h3>
          <p class="text-fg-muted mb-6 text-[15px] leading-relaxed">
            اسم الخدمة ومدتها وسعرها، ومن يقدّمها، ومتى تفتح. النظام يحسب الأوقات المتاحة من هذا.
          </p>
          <div
            class="border-border bg-surface mt-auto space-y-2.5 rounded-[var(--radius-lg)] border p-4"
            aria-hidden="true"
          >
            <div class="flex items-center justify-between text-[13px]">
              <span class="text-fg font-semibold">قص وتصفيف</span>
              <span class="text-fg-subtle" data-numeric>45 د · 120 ر.س</span>
            </div>
            <div class="flex items-center justify-between text-[13px]">
              <span class="text-fg font-semibold">تنظيف بشرة</span>
              <span class="text-fg-subtle" data-numeric>60 د · 220 ر.س</span>
            </div>
            <div
              class="border-border flex items-center justify-between border-t pt-2.5 text-[13px]"
            >
              <span class="text-fg-subtle">السبت إلى الخميس</span>
              <span class="text-fg font-semibold" dir="ltr" data-numeric>10:00 – 22:00</span>
            </div>
          </div>
        </li>

        <!-- 2 -->
        <li v-reveal="80" class="flex flex-col">
          <span class="text-fg-faint font-display mb-3 text-sm font-bold" data-numeric>02</span>
          <h3 class="type-h3 text-fg mb-2">شارك رابط الحجز</h3>
          <p class="text-fg-muted mb-6 text-[15px] leading-relaxed">
            ضعه في حساب إنستغرام، وفي ردّك الآلي على الواتساب، وعلى خرائط Google. العميل يحجز دون أن
            يتصل.
          </p>
          <div
            class="border-border bg-surface mt-auto rounded-[var(--radius-lg)] border p-4"
            aria-hidden="true"
          >
            <div
              class="border-border bg-surface-sunken mb-3 flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2"
            >
              <span class="text-fg text-[13px] font-semibold" dir="ltr">waeda.app/lamsa</span>
              <Copy class="text-fg-subtle h-4 w-4" />
            </div>
            <div class="flex flex-wrap gap-1.5 text-[12px]">
              <span class="border-border text-fg-muted rounded-full border px-2.5 py-1"
                >إنستغرام</span
              >
              <span class="border-border text-fg-muted rounded-full border px-2.5 py-1"
                >واتساب</span
              >
              <span class="border-border text-fg-muted rounded-full border px-2.5 py-1"
                >خرائط Google</span
              >
            </div>
          </div>
        </li>

        <!-- 3 -->
        <li v-reveal="160" class="flex flex-col">
          <span class="text-fg-faint font-display mb-3 text-sm font-bold" data-numeric>03</span>
          <h3 class="type-h3 text-fg mb-2">تابع يومك، والتذكير يعمل وحده</h3>
          <p class="text-fg-muted mb-6 text-[15px] leading-relaxed">
            الحجوزات تصل إلى تقويم واحد. قبل كل موعد تخرج رسالة تأكيد، وأنت ترى من أكّد ومن لم يرد.
          </p>
          <ul
            class="border-border bg-surface divide-border mt-auto divide-y rounded-[var(--radius-lg)] border text-[13px]"
            aria-hidden="true"
          >
            <li class="flex items-center justify-between px-4 py-2.5">
              <span class="text-fg font-semibold">10:00 · منيرة</span>
              <span class="text-success-700 flex items-center gap-1 font-semibold"
                ><Check class="h-3.5 w-3.5" /> أكّدت</span
              >
            </li>
            <li class="flex items-center justify-between px-4 py-2.5">
              <span class="text-fg font-semibold">11:00 · ريما</span>
              <span class="text-warning-700 flex items-center gap-1 font-semibold"
                ><Clock class="h-3.5 w-3.5" /> لم ترد</span
              >
            </li>
            <li class="flex items-center justify-between px-4 py-2.5">
              <span class="text-fg font-semibold">12:30 · جود</span>
              <span class="text-fg-subtle flex items-center gap-1 font-semibold"
                ><MessageCircle class="h-3.5 w-3.5" /> أُرسل التذكير</span
              >
            </li>
          </ul>
        </li>
      </ol>
    </div>
  </section>
</template>
