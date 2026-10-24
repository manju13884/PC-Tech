import { useId, useState } from 'react'
import { formatCompactIndianCurrency, formatIndianCurrency } from './utils/currencyFormatting'
import './financial-year-sales-chart.css'

interface SalesPoint { month: string; amount: number }
const hues = [42, 132, 205, 292, 340, 24, 174, 226, 270, 6, 90, 198]

export default function FinancialYearSalesChart({ points, loading = false }: { points: SalesPoint[]; loading?: boolean }) {
  const chartId = useId().replace(/:/g, '')
  const [selected, setSelected] = useState<number | null>(null)
  if (!points.length) return <p className="fy-sales-chart-empty" role="status">{loading ? 'Loading monthly sales…' : 'Monthly sales data is unavailable.'}</p>

  const maximum = Math.max(...points.map((point) => point.amount), 0)
  const scale = maximum > 0 ? maximum * 1.15 : 1
  const base = 232
  const plotHeight = 178
  const plotLeft = 82
  const step = 600 / points.length
  const barWidth = Math.min(27, step * .55)
  const depth = 8
  const bars = points.map((point, index) => ({
    ...point, x: plotLeft + step * index + step / 2 - barWidth / 2,
    y: base - (Math.max(0, point.amount) / scale) * plotHeight,
    hue: hues[index % hues.length],
  }))
  const active = selected === null ? null : bars[selected]
  const line = bars.map((bar) => `${bar.x + barWidth / 2},${bar.amount > 0 ? bar.y - depth - 13 : base}`).join(' ')

  return (
    <figure className="fy-sales-chart">
      <div className="fy-sales-chart-viewport">
        <svg viewBox="0 0 720 276" className="fy-sales-chart-svg" role="group" aria-labelledby={`${chartId}-title`} aria-describedby={`${chartId}-description`}>
          <title id={`${chartId}-title`}>Financial year sales by month</title>
          <desc id={`${chartId}-description`}>Colored three-dimensional bars and a connecting line show the same monthly sales amounts. Select a month for its exact amount.</desc>
          <defs>
            {bars.map((bar, index) => <linearGradient key={index} id={`${chartId}-bar-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsl(${bar.hue} 80% 49%)`} />
              <stop offset="55%" stopColor={`hsl(${bar.hue} 76% 46%)`} />
              <stop offset="55%" stopColor={`hsl(${bar.hue} 65% 65%)`} />
              <stop offset="100%" stopColor={`hsl(${bar.hue} 70% 56%)`} />
            </linearGradient>)}
          </defs>
          {[0, 1, 2, 3, 4].map((tick) => {
            const y = base - (tick / 4) * plotHeight
            return <g key={tick} aria-hidden="true">
              <line x1={plotLeft - 5} x2="699" y1={y} y2={y} className="fy-sales-gridline" />
              <text x={plotLeft - 12} y={y + 4} textAnchor="end" className="fy-sales-axis">{maximum ? formatCompactIndianCurrency(scale * tick / 4) : tick === 0 ? '₹0' : ''}</text>
            </g>
          })}
          <polyline points={line} className="fy-sales-trend-line" aria-hidden="true" />
          {bars.map((bar, index) => {
            const center = bar.x + barWidth / 2
            const markerY = bar.amount > 0 ? bar.y - depth - 13 : base
            return <g key={bar.month} className={`fy-sales-month${selected === index ? ' is-selected' : ''}`}
              tabIndex={0} role="button" aria-pressed={selected === index}
              aria-label={`${bar.month}: ${formatIndianCurrency(bar.amount)}`}
              onClick={() => setSelected(index)} onFocus={() => setSelected(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index) }
                if (event.key === 'Escape') setSelected(null)
              }}>
              <title>{bar.month}: {formatIndianCurrency(bar.amount)}</title>
              <rect x={center - step / 2 + 1} y="20" width={step - 2} height="246" rx="5" className="fy-sales-hit-area" />
              {bar.amount > 0 && <g aria-hidden="true" className="fy-sales-bar">
                <ellipse cx={center + depth / 2} cy={base + 4} rx={barWidth * .8} ry="4" fill="#102a43" opacity=".08" />
                <rect x={bar.x} y={bar.y} width={barWidth} height={base - bar.y} fill={`url(#${chartId}-bar-${index})`} />
                <path d={`M${bar.x + barWidth},${bar.y} l${depth},-${depth / 2} V${base - depth / 2} l-${depth},${depth / 2} Z`} fill={`hsl(${bar.hue} 65% 35%)`} />
                <path d={`M${bar.x},${bar.y} l${depth},-${depth / 2} h${barWidth} l-${depth},${depth / 2} Z`} fill={`hsl(${bar.hue} 72% 65%)`} />
              </g>}
              <circle cx={center} cy={markerY} r={selected === index ? 6 : 4.5} fill="#fff" stroke={`hsl(${bar.hue} 72% 44%)`} strokeWidth="3" aria-hidden="true" />
              <text x={center} y="260" textAnchor="middle" className="fy-sales-month-label" aria-hidden="true">{bar.month}</text>
            </g>
          })}
        </svg>
      </div>
      <figcaption className="fy-sales-chart-caption" aria-live="polite">
        {active ? <><span>{active.month}</span><strong>{formatIndianCurrency(active.amount)}</strong></> : <span>Select a month to view its sales amount.</span>}
      </figcaption>
    </figure>
  )
}
