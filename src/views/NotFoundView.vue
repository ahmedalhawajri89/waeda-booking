<script setup>
import { Compass } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="bg-canvas flex min-h-screen items-center justify-center p-6">
    <div class="surface max-w-md p-8 text-center">
      <div
        class="bg-primary-soft text-primary-fg mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)]"
      >
        <Compass class="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 class="text-fg mb-2 text-xl font-bold">الصفحة غير موجودة</h1>
      <p class="text-fg-muted mb-6 text-sm leading-relaxed">
        الرابط الذي فتحته غير صحيح أو تم نقل الصفحة. تأكد من العنوان أو عد إلى البداية.
      </p>
      <div class="flex justify-center gap-2">
        <BaseButton @click="router.back()">رجوع</BaseButton>
        <BaseButton variant="primary" @click="router.push('/')">الصفحة الرئيسية</BaseButton>
      </div>
    </div>
  </div>
</template>
