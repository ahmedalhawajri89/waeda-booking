<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import { applyThemeDefaults, setupCharts } from '@/composables/useChartTheme'

/**
 * Thin Chart.js wrapper.
 *
 * vue-chartjs is in package.json but adds a component per chart type for what
 * amounts to a canvas ref and a destroy on unmount; one wrapper taking a
 * config is less indirection and keeps every chart on this screen consistent
 * about accessibility and resize behaviour.
 *
 * A canvas is invisible to assistive tech, so `summary` is required — it is
 * the chart's actual accessible content, not decoration.
 */
const props = defineProps({
  config: { type: Object, required: true },
  summary: { type: String, required: true },
  height: { type: Number, required: false },
})

const el = ref(null)
let chart = null

function build() {
  if (!el.value) return
  chart?.destroy()
  setupCharts()
  applyThemeDefaults()
  chart = new Chart(el.value, props.config)
}

onMounted(build)
watch(() => props.config, build, { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="relative" :style="{ height: `${height ?? 260}px` }">
    <canvas ref="el" role="img" :aria-label="summary" />
    <p class="sr-only">{{ summary }}</p>
  </div>
</template>
