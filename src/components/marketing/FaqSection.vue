<script setup>
import { Plus } from 'lucide-vue-next'
import SectionHeading from './SectionHeading.vue'
import { MESSAGE_PACK, TRIAL_DAYS } from '@/data/plans'

/**
 * Native <details>/<summary>, not a hand-rolled accordion.
 *
 * The browser already gives us the button semantics, the expanded state, and
 * — the part that actually matters — in-page find. Ctrl+F for a term inside a
 * collapsed answer opens it; a div with aria-expanded cannot do that, and an
 * FAQ is exactly the content people search rather than read.
 *
 * `name` makes them mutually exclusive without a line of JS. Where it is
 * unsupported the panels simply all open independently, which is a fine
 * fallback.
 */
const FAQ = [
  {
    q: 'هل أحتاج خبرة تقنية؟',
    a: 'لا. تضيف خدماتك ومدة كل خدمة وساعات عملك مرة واحدة، والنظام يحسب الأوقات المتاحة بعدها. ويمكنك البدء في نفس اليوم.',
  },
  {
    q: 'كيف يعمل التذكير على الواتساب؟',
    a: 'قبل الموعد بالوقت الذي تحدده، تصل العميل رسالة تطلب التأكيد. إذا ردّ بالتأكيد يتحدّث الحجز في تقويمك، وإذا لم يرد يظهر لك لتتصل به.',
  },
  {
    q: 'ماذا يحدث إذا ألغى العميل؟',
    a: 'يلغي بنفسه من رابط حجزه، فيعود الوقت متاحاً فوراً. وإذا كان عندك قائمة انتظار لذلك اليوم، يُعرض الوقت على من فيها، وأول من يوافق يأخذه.',
  },
  {
    q: 'هل يناسب منشأة فيها أكثر من موظف أو غرفة؟',
    a: 'نعم. لكل موظف وغرفة وطاولة جدول مستقل، وتحدد أي خدمة يقدمها كل واحد. لا يمكن حجز نفس الوقت مرتين على نفس الشخص أو المكان.',
  },
  {
    q: 'هل أستطيع أخذ عربون؟',
    a: 'تسجّل حالة الدفع مع كل حجز: غير مدفوع، عربون، مدفوع، أو مسترجع. والدفع الإلكتروني المباشر من صفحة الحجز قادم قريباً.',
  },
  {
    q: 'ما الذي يحدث إذا انتهت رسائل الواتساب في باقتي، أو انتهت التجربة؟',
    // From the plans themselves, so the answer cannot drift from the prices.
    a: `الحجوزات لا تتوقف أبداً. إذا انتهت رسائل الشهر يتوقف التذكير فقط حتى الشهر التالي، أو تضيف ${MESSAGE_PACK.messages} رسالة بـ${MESSAGE_PACK.priceMinor / 100} ريالاً. وبعد التجربة (${TRIAL_DAYS} يوماً) تنتقل منشأتك للباقة المجانية تلقائياً، دون أن نسحب أي مبلغ، ما لم تختر باقة.`,
  },
]
</script>

<template>
  <section id="faq" class="section bg-surface">
    <div class="section-inner grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
      <SectionHeading
        title="أسئلة أصحاب المنشآت"
        lede="وإن لم تجد سؤالك، جرّب النظام بنفسك. لا يحتاج تسجيلاً."
        align="start"
        sticky
      />

      <div
        v-reveal
        class="border-border bg-surface divide-border divide-y rounded-[var(--radius-xl)] border"
      >
        <details v-for="item in FAQ" :key="item.q" name="faq" class="group">
          <summary
            class="hover:bg-surface-sunken flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors"
          >
            <span class="text-fg text-[15px] font-bold">{{ item.q }}</span>
            <Plus
              class="text-primary-fg h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45"
              aria-hidden="true"
            />
          </summary>
          <p class="text-fg-muted px-5 pb-4 text-[15px] leading-relaxed">{{ item.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Safari still paints its own disclosure triangle without this. */
summary::-webkit-details-marker {
  display: none;
}
</style>
