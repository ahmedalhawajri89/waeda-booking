import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { NUMBER_LOCALE } from '@/lib/format'
import { useTheme } from './useTheme'

const theme = useTheme()

/**
 * Chart.js setup, done once.
 *
 * Registration is explicit rather than `...registerables` so the bundle only
 * carries the three chart types this app draws. The library was already a
 * dependency but had never been imported anywhere — it was dead weight in
 * package.json until now.
 */
let registered = false

export function setupCharts() {
  if (registered) return
  Chart.register(
    LineController,
    BarController,
    DoughnutController,
    LineElement,
    BarElement,
    PointElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    Filler,
    Tooltip,
  )

  const css = getComputedStyle(document.documentElement)
  Chart.defaults.font.family = css.getPropertyValue('--font-sans').trim()
  Chart.defaults.font.size = 12
  Chart.defaults.locale = NUMBER_LOCALE
  // The rest of the app honours reduced motion through CSS; a canvas can't.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false
  Chart.defaults.plugins.tooltip.rtl = true
  Chart.defaults.plugins.tooltip.textDirection = 'rtl'
  registered = true
}

/** Text and grid colours follow the theme, so they are re-read on every build. */
export function applyThemeDefaults() {
  const css = getComputedStyle(document.documentElement)
  Chart.defaults.color = css.getPropertyValue('--color-fg-subtle').trim()
  Chart.defaults.borderColor = css.getPropertyValue('--color-border').trim()
}

/**
 * Chart colours come from the design tokens, read at runtime. Hard-coding
 * hexes here is how a chart ends up being the one thing on the page that
 * never got re-skinned.
 */
export function chartColors() {
  // Touching the theme here makes every computed chart config that calls
  // this depend on it — so a theme switch rebuilds the charts in its colours.
  void theme.resolved.value
  const css = getComputedStyle(document.documentElement)
  const v = (name) => css.getPropertyValue(name).trim()
  return {
    primary: v('--color-primary-fg'),
    primarySoft: v('--color-primary-soft'),
    accent: v('--color-accent-500'),
    success: v('--color-success-600'),
    warning: v('--color-warning-600'),
    danger: v('--color-danger-600'),
    info: v('--color-info-600'),
    grid: v('--color-border'),
    fg: v('--color-fg'),
    muted: v('--color-fg-subtle'),
    surface: v('--color-surface'),
  }
}
