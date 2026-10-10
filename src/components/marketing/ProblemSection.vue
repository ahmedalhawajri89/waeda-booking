<script setup>
import { Check, X } from 'lucide-vue-next'

/**
 * The problem, told the way an owner lives it, beside what changes. A table
 * rather than cards: each row is one moment of the working day, read across.
 */
const ROWS = [
  {
    moment: 'حين يريد العميل موعداً',
    before: 'يرسل على الواتساب «متى عندكم فاضي؟» وينتظر ردك، وأنت مشغول مع عميل آخر.',
    after: 'يفتح رابطك، يرى الأوقات المتاحة فعلاً، ويحجز في أي ساعة من اليوم.',
  },
  {
    moment: 'حين يتزاحم الجدول',
    before: 'موعدان في نفس الوقت، لأن أحداً سجّل في الدفتر والآخر في الجوال.',
    after: 'الوقت المحجوز لا يظهر لأحد. لكل موظف وغرفة جدول مستقل.',
  },
  {
    moment: 'قبل الموعد بيوم',
    before: 'العميل نسي. الكرسي فارغ، والموظف ينتظر، والدخل ضاع.',
    after: 'تصله رسالة تطلب التأكيد، ومن لم يؤكد تعرفه مبكراً وتتصرف.',
  },
  {
    moment: 'حين يلغي أحد',
    before: 'تعرف متأخراً، ولا وقت لتعويض الموعد.',
    after: 'يُعرض الوقت فوراً على قائمة الانتظار، وأول من يوافق يأخذه.',
  },
  {
    moment: 'آخر الشهر',
    before: 'لا تعرف كم موعداً ضاع، ولا من يغيب دائماً.',
    after: 'ترى الإشغال ونسبة الغياب وأكثر العملاء التزاماً في صفحة واحدة.',
  },
]
</script>

<template>
  <section id="problem" class="section bg-surface">
    <div class="section-inner">
      <header class="mb-12 max-w-2xl md:mb-16">
        <h2 v-reveal class="type-h1 text-fg mb-4">المواعيد تضيع في التفاصيل الصغيرة</h2>
        <p v-reveal="60" class="type-lede">
          كثير من المنشآت تدير حجوزاتها بين الواتساب والمكالمات ودفتر على الطاولة. هذا ما يحدث في
          يوم عادي، وما يتغير مع وعدة.
        </p>
      </header>

      <div
        v-reveal
        class="border-border bg-surface overflow-hidden rounded-[var(--radius-xl)] border"
      >
        <div
          class="border-border text-fg-subtle hidden grid-cols-[13rem_1fr_1fr] border-b text-[13px] font-semibold md:grid"
        >
          <span class="px-6 py-3.5" />
          <span class="border-border border-s px-6 py-3.5">اليوم</span>
          <span class="border-border text-fg border-s px-6 py-3.5">مع وعدة</span>
        </div>

        <div
          v-for="r in ROWS"
          :key="r.moment"
          class="border-border grid border-b last:border-b-0 md:grid-cols-[13rem_1fr_1fr]"
        >
          <p class="text-fg px-6 pt-5 pb-2 text-[15px] font-bold md:py-5">{{ r.moment }}</p>
          <p
            class="border-border text-fg-subtle flex gap-3 px-6 py-2 text-[15px] leading-relaxed md:border-s md:py-5"
          >
            <X class="text-fg-faint mt-1 h-4 w-4 shrink-0" aria-label="اليوم" />
            {{ r.before }}
          </p>
          <p
            class="border-border text-fg flex gap-3 px-6 pt-2 pb-5 text-[15px] leading-relaxed md:border-s md:py-5"
          >
            <Check class="text-primary-fg mt-1 h-4 w-4 shrink-0" aria-label="مع وعدة" />
            {{ r.after }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
