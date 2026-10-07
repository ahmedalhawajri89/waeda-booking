<script setup>
import AppLogo from '@/components/ui/AppLogo.vue'

const year = new Date().getFullYear()

const COLUMNS = [
  {
    title: 'المنتج',
    links: [
      { label: 'كيف يعمل', href: '#how-it-works' },
      { label: 'حاسبة الغياب', href: '#calculator' },
      { label: 'الأسعار', href: '#pricing' },
      { label: 'الأسئلة', href: '#faq' },
    ],
  },
  {
    title: 'القطاعات',
    links: [
      { label: 'العيادات', href: '#sectors' },
      { label: 'الصالونات', href: '#sectors' },
      { label: 'مراكز التدريب', href: '#sectors' },
      { label: 'المطاعم والمقاهي', href: '#sectors' },
    ],
  },
  {
    title: 'جرّب',
    links: [
      { label: 'صفحة الحجز', to: '/book' },
      { label: 'لوحة التحكم', to: '/login' },
      { label: 'إنشاء حساب', to: '/register' },
    ],
  },
]
</script>

<template>
  <footer class="border-border bg-surface border-t">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div class="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <AppLogo compact class="mb-4" />
          <p class="text-fg-subtle max-w-xs text-sm leading-relaxed">
            نظام حجز مواعيد للمنشآت الخدمية. رابط حجز، تقويم لفريقك، وتذكير يقلّل الغياب.
          </p>
        </div>
        <nav v-for="c in COLUMNS" :key="c.title" :aria-label="c.title">
          <p class="text-fg mb-4 text-sm font-bold">{{ c.title }}</p>
          <ul class="space-y-2.5 text-sm">
            <li v-for="l in c.links" :key="l.label">
              <RouterLink
                v-if="l.to"
                :to="l.to"
                class="text-fg-subtle hover:text-fg transition-colors"
                >{{ l.label }}</RouterLink
              >
              <a v-else :href="l.href" class="text-fg-subtle hover:text-fg transition-colors">{{
                l.label
              }}</a>
            </li>
          </ul>
        </nav>
      </div>
      <div
        class="border-border text-fg-faint mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 text-[13px] sm:flex-row"
      >
        <p>© {{ year }} وعدة</p>
        <p>صُنع للمنشآت العربية</p>
      </div>
    </div>
  </footer>
</template>
