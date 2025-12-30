/**
 * Chart Theme Configuration
 *
 * Provides theme-aware colors for Recharts and other charting libraries.
 * Uses CSS variables from globals.css for automatic dark mode support.
 */

// HSL to CSS hsl() string
function hsl(variable: string): string {
  return `hsl(var(--${variable}))`;
}

// HSL to CSS hsl() with alpha
function hsla(variable: string, alpha: number): string {
  return `hsl(var(--${variable}) / ${alpha})`;
}

/**
 * Semantic chart colors for income/expense/cashflow charts
 */
export const chartColors = {
  income: hsl('chart-income'),
  expense: hsl('chart-expense'),
  neutral: hsl('chart-neutral'),
  grid: hsl('chart-grid'),
  // For gradients
  incomeAlpha: (alpha: number) => hsla('chart-income', alpha),
  expenseAlpha: (alpha: number) => hsla('chart-expense', alpha),
} as const;

/**
 * Categorical color palette for pie charts, bar charts, etc.
 * Use sequentially for different data series
 */
export const chartPalette = [
  hsl('chart-1'),
  hsl('chart-2'),
  hsl('chart-3'),
  hsl('chart-4'),
  hsl('chart-5'),
  hsl('chart-6'),
  hsl('chart-7'),
  hsl('chart-8'),
] as const;

/**
 * Get a color from the palette by index (wraps around)
 */
export function getChartColor(index: number): string {
  return chartPalette[index % chartPalette.length];
}

/**
 * Tooltip styles for Recharts
 */
export const tooltipStyle = {
  backgroundColor: hsl('popover'),
  border: `1px solid ${hsl('border')}`,
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
} as const;

/**
 * Axis styles for Recharts
 */
export const axisStyle = {
  fontSize: 12,
  fill: hsl('muted-foreground'),
} as const;

/**
 * Grid styles for Recharts
 */
export const gridStyle = {
  stroke: hsl('chart-grid'),
  strokeDasharray: '3 3',
} as const;

/**
 * Legend styles for Recharts
 */
export const legendStyle = {
  fontSize: '12px',
  color: hsl('foreground'),
} as const;

/**
 * Animation configuration
 */
export const chartAnimation = {
  duration: 500,
  easing: 'ease-out',
} as const;

/**
 * Area chart defaults - subtle fills, prominent lines
 */
export const areaChartDefaults = {
  fillOpacity: 0.08,
  strokeWidth: 2.5,
  dotRadius: 0,
  activeDotRadius: 4,
  activeDotStrokeWidth: 2,
} as const;

/**
 * Bar chart defaults - modern rounded corners
 */
export const barChartDefaults = {
  barGap: 4,
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  maxBarSize: 48,
} as const;

/**
 * Line chart defaults
 */
export const lineChartDefaults = {
  strokeWidth: 2.5,
  dotRadius: 0,
  activeDotRadius: 4,
} as const;
