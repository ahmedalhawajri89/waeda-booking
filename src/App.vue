<script setup>
import { RouterView } from 'vue-router'
import { Toaster } from 'vue-sonner'
import { useTheme } from '@/composables/useTheme'

const { resolved } = useTheme()
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <Toaster position="top-center" rich-colors :theme="resolved" dir="rtl" />
  </div>
</template>
