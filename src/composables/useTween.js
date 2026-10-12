import { onBeforeUnmount, ref, watch } from 'vue'

const REDUCED =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A number that travels to its new value instead of jumping to it.
 *
 * Figures that change while someone watches (a total climbing as the day
 * settles, a loss growing as a slider moves) read as measured when they
 * travel; a jump reads as a glitch. With reduced motion it simply jumps.
 *
 * @param {() => number} source the value to follow
 * @param {{ ms?: number, from?: number }} [opts] `from`: where the very first
 *   run starts (0 to count up on first sight); the current value otherwise.
 * @returns {{ value: import('vue').Ref<number>, jump: (v: number) => void }}
 */
export function useTween(source, { ms = 700, from } = {}) {
  const value = ref(from ?? source())
  let raf = 0

  function run(to) {
    cancelAnimationFrame(raf)
    if (REDUCED) {
      value.value = to
      return
    }
    const start = performance.now()
    const begin = value.value
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      // easeOutCubic: quick to move, soft to land.
      value.value = Math.round(begin + (to - begin) * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  watch(source, run)
  onBeforeUnmount(() => cancelAnimationFrame(raf))

  return {
    value,
    /** Travel to `v` now (e.g. the first count-up when the section is seen). */
    jump: run,
  }
}
