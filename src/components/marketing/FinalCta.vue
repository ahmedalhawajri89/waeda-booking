<script setup>
import { ArrowLeft } from 'lucide-vue-next'

/** The last ask, said plainly, with the same two doors as the hero. */
</script>

<template>
  <section class="section bg-canvas border-border border-t">
    <div class="section-inner text-center">
      <h2 v-reveal class="type-h1 text-fg mx-auto mb-4 max-w-2xl">
        جدول ممتلئ، ومواعيد يحضرها أصحابها.
      </h2>
      <p v-reveal="60" class="type-lede mx-auto mb-9 max-w-xl">
        أنشئ صفحة الحجز لمنشأتك الآن، وأرسل الرابط لأول عميل اليوم.
      </p>
      <div v-reveal="120" class="flex flex-col items-center justify-center gap-3 sm:flex-row">
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
          to="/login"
          class="border-border-strong bg-surface text-fg hover:bg-surface-hover inline-flex w-full items-center justify-center rounded-[var(--radius-md)] border px-6 py-3.5 text-base font-bold transition-colors sm:w-auto"
        >
          شاهد لوحة التحكم
        </RouterLink>
      </div>
    </div>
  </section>
</template>
