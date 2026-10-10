<script setup>
/** A plain phone: ink bezel, island, status bar. The screen is the slot. */
defineProps({
  time: { type: String, required: false, default: '9:41' },
})
</script>

<template>
  <div
    class="bg-ink relative rounded-[2.4rem] p-[7px] shadow-[0_30px_60px_-20px_rgb(17_17_16/0.35)] ring-1 ring-black/5 dark:bg-[#2b2b28]"
  >
    <div class="bg-surface relative flex h-full flex-col overflow-hidden rounded-[1.95rem]">
      <div
        class="text-fg flex items-center justify-between px-4 pt-2.5 pb-1 text-[10px] font-semibold sm:px-5"
        dir="ltr"
      >
        <span data-numeric>{{ time }}</span>
        <span
          class="bg-ink absolute top-2 left-1/2 h-[18px] w-[40%] max-w-[64px] -translate-x-1/2 rounded-full"
        />
        <span class="flex items-center gap-1">
          <span class="bg-fg h-[7px] w-[3px] rounded-[1px]" />
          <span class="bg-fg h-[9px] w-[3px] rounded-[1px]" />
          <span class="border-fg ms-1 h-[9px] w-[18px] rounded-[3px] border p-[1px]"
            ><span class="bg-fg block h-full w-3/4 rounded-[1px]"
          /></span>
        </span>
      </div>
      <div class="relative min-h-0 flex-1">
        <slot />
      </div>
    </div>
  </div>
</template>
