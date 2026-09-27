import { useId } from 'react'
import { Ruler } from 'lucide-react'
import { partitionDrawingLayout } from './partitionCalculatorEngine'
import type {
  calculateCellFit,
  PartitionGeometry,
  PartitionPly,
} from './partitionCalculatorEngine'

const mm = (n: number | undefined) =>
  n === undefined || !Number.isFinite(n)
    ? '—'
    : Math.abs(n) >= 1e7 || (n !== 0 && Math.abs(n) < 0.000001)
      ? n.toExponential(4)
      : n.toLocaleString('en-IN', { maximumFractionDigits: 6 })
type Fit = ReturnType<typeof calculateCellFit> | null
type Props = {
  geometry: PartitionGeometry | null
  fits: Fit[]
  requested: { length: number; width: number }
  ply: PartitionPly
}

// All physical positions/pitches come from the engine. This component only places
// annotation lines, labels and SVG patterns around that model.
function Dimension({
  x1,
  y1,
  x2,
  y2,
  label,
  vertical = false,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  label?: string
  vertical?: boolean
}) {
  return (
    <g className="partition-dimension">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path
        d={
          vertical
            ? `M ${x1 - 4} ${y1 + 4} l 8 -8 M ${x2 - 4} ${y2 + 4} l 8 -8`
            : `M ${x1 - 4} ${y1 + 4} l 8 -8 M ${x2 - 4} ${y2 + 4} l 8 -8`
        }
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 7}
          textAnchor="middle"
          transform={
            vertical
              ? `rotate(-90 ${(x1 + x2) / 2} ${(y1 + y2) / 2})`
              : undefined
          }
        >
          {label}
        </text>
      )}
    </g>
  )
}

export default function PartitionDrawing({
  geometry: g,
  fits,
  requested,
  ply,
}: Props) {
  const id = useId().replace(/:/g, '')
  let layout: ReturnType<typeof partitionDrawingLayout> | null = null
  try {
    if (g) layout = partitionDrawingLayout(g)
  } catch {
    /* Unsafe SVG coordinates are never rendered. */
  }
  const mismatch = fits.some((fit) => fit && fit.count === null)
  const status =
    g && layout
      ? '✓ Dimensions Match'
      : mismatch
        ? '⚠ Dimension Mismatch'
        : null
  return (
    <section className="board-section partition-drawing">
      <header>
        <h3>
          <Ruler size={16} /> Partition Drawing – {ply} Ply
        </h3>
        {status && (
          <p
            role="status"
            className={
              g && layout
                ? 'admin-user-message success partition-match-status'
                : 'board-formula-notice partition-match-status'
            }
          >
            {status}
          </p>
        )}
      </header>
      {!g || !layout ? (
        <>
          <p className="partition-hint">
            Enter partition dimensions to preview drawing.
          </p>
          {mismatch && (
            <div className="board-specification-grid partition-input-grid">
              {[
                [
                  'Requested Cell Size (mm)',
                  `${mm(requested.length)} × ${mm(requested.width)}`,
                ],
                [
                  'Nearest-layout Actual Cell Size (mm)',
                  `${mm(fits[0]?.actualCell)} × ${mm(fits[1]?.actualCell)}`,
                ],
                ['Length Cell Difference (mm)', mm(fits[0]?.cellDifference)],
                ['Width Cell Difference (mm)', mm(fits[1]?.cellDifference)],
              ].map(([label, value]) => (
                <div
                  className="partition-metric"
                  data-label={label}
                  key={label}
                >
                  <span>{label}</span>
                  <output aria-label={label}>{value}</output>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h4>Top View</h4>
          <dl className="partition-drawing-facts">
            {[
              ['Outer Size', `${mm(g.outer.length)} × ${mm(g.outer.width)} mm`],
              [
                'Cell Internal Size',
                `${mm(g.cells.length)} × ${mm(g.cells.width)} mm`,
              ],
              [
                'Cell Configuration',
                `${g.counts.length} × ${g.counts.width} · ${g.totalCells} cells`,
              ],
              ['Partition Thickness', `${mm(g.thickness)} mm`],
              ['Length Projection', `${mm(g.projections.length)} mm / side`],
              ['Width Projection', `${mm(g.projections.width)} mm / side`],
              [
                'Group A · horizontal',
                `${g.pieces.length} strips spanning Outer Length`,
              ],
              [
                'Group B · vertical',
                `${g.pieces.width} strips spanning Outer Width`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <svg
            className="partition-top-svg"
            role="img"
            aria-labelledby={`${id}-top-title ${id}-top-desc`}
            viewBox={`-75 -95 ${Math.max(650, layout.width + 165)} ${Math.max(260, layout.height + 160)}`}
            preserveAspectRatio="xMidYMid meet"
            data-columns={g.counts.length}
            data-rows={g.counts.width}
          >
            <title id={`${id}-top-title`}>
              Partition top view: {g.counts.length} by {g.counts.width} clear
              cells
            </title>
            <desc id={`${id}-top-desc`}>
              {g.pieces.width} vertical Group B strips and {g.pieces.length}{' '}
              horizontal Group A strips. Outer size {mm(g.outer.length)} by{' '}
              {mm(g.outer.width)} mm. Clear cells {mm(g.cells.length)} by{' '}
              {mm(g.cells.width)} mm. Thickness {mm(g.thickness)} mm.
              Projections {mm(g.projections.length)} and{' '}
              {mm(g.projections.width)} mm at each corresponding end.
            </desc>
            <defs>
              <pattern
                id={`${id}-horizontal`}
                patternUnits="userSpaceOnUse"
                x="0"
                y={layout.py}
                width={layout.width}
                height={layout.pitchY}
              >
                <rect
                  width={layout.width}
                  height={layout.t}
                  className="partition-strip"
                />
              </pattern>
              <pattern
                id={`${id}-vertical`}
                patternUnits="userSpaceOnUse"
                x={layout.px}
                y="0"
                width={layout.pitchX}
                height={layout.height}
              >
                <rect
                  width={layout.t}
                  height={layout.height}
                  className="partition-strip"
                />
              </pattern>
            </defs>
            <rect
              data-strip-group="A"
              data-count={g.pieces.length}
              x="0"
              y={layout.py}
              width={layout.width}
              height={layout.gridHeight}
              fill={`url(#${id}-horizontal)`}
            />
            <rect
              data-strip-group="B"
              data-count={g.pieces.width}
              x={layout.px}
              y="0"
              width={layout.gridWidth}
              height={layout.height}
              fill={`url(#${id}-vertical)`}
            />
            {layout.numbers.map((cell) => (
              <text
                className="partition-cell-number"
                key={cell.number}
                x={cell.x}
                y={cell.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {cell.number}
              </text>
            ))}
            <g className="partition-extension">
              <path
                d={`M 0 ${layout.height} V ${layout.height + 38} M ${layout.width} ${layout.height} V ${layout.height + 38} M ${layout.width} 0 H ${layout.width + 44} M ${layout.width} ${layout.height} H ${layout.width + 44}`}
              />
              <path
                d={`M 0 ${layout.py} V -28 M ${layout.px} 0 V -65 M ${layout.px + layout.t} 0 V -65 M 0 0 H -35 M 0 ${layout.py} H -35`}
              />
            </g>
            <Dimension
              x1={0}
              y1={layout.height + 32}
              x2={layout.width}
              y2={layout.height + 32}
              label={`${mm(g.outer.length)} mm`}
            />
            <Dimension
              x1={layout.width + 38}
              y1={0}
              x2={layout.width + 38}
              y2={layout.height}
              label={`${mm(g.outer.width)} mm`}
              vertical
            />
            <Dimension x1={0} y1={-22} x2={layout.px} y2={-22} />
            <text x="0" y="-34">
              P {mm(g.projections.length)} mm
            </text>
            <Dimension x1={-28} y1={0} x2={-28} y2={layout.py} />
            <text
              x="-42"
              y={layout.height / 2}
              textAnchor="middle"
              transform={`rotate(-90 -42 ${layout.height / 2})`}
            >
              P {mm(g.projections.width)} mm
            </text>
            <Dimension
              x1={layout.px}
              y1={-60}
              x2={layout.px + layout.t}
              y2={-60}
            />
            <text x={layout.px} y="-74">
              T {mm(g.thickness)} mm
            </text>
            {layout.cellWidth >= 36 && layout.cellHeight >= 36 ? (
              <>
                <Dimension
                  x1={layout.cell.x}
                  y1={layout.cell.y + layout.cellHeight * 0.78}
                  x2={layout.cell.x + layout.cellWidth}
                  y2={layout.cell.y + layout.cellHeight * 0.78}
                  label={mm(g.cells.length)}
                />
                <Dimension
                  x1={layout.cell.x + layout.cellWidth * 0.78}
                  y1={layout.cell.y}
                  x2={layout.cell.x + layout.cellWidth * 0.78}
                  y2={layout.cell.y + layout.cellHeight}
                  label={mm(g.cells.width)}
                  vertical
                />
              </>
            ) : (
              <text x="0" y={layout.height + 57}>
                Clear cell: {mm(g.cells.length)} × {mm(g.cells.width)} mm ·
                dimensions too small to annotate at this scale
              </text>
            )}
          </svg>
          <p className="partition-hint">
            Clear opening: Cell Internal Length {mm(g.cells.length)} mm; Cell
            Internal Width {mm(g.cells.width)} mm. Numbers identify clear cells.
            All strips, clear openings and projections share one scale.
          </p>
          <div className="partition-dimension-check">
            <strong>Dimension Check</strong>
            <p>
              L ({g.counts.length} × {mm(g.requested.length)}) + (
              {g.pieces.width} × {mm(g.thickness)}) + (2 ×{' '}
              {mm(g.projections.length)}) = {mm(g.reconstructed.length)} mm ✓
            </p>
            <p>
              W ({g.counts.width} × {mm(g.requested.width)}) + (
              {g.pieces.length} × {mm(g.thickness)}) + (2 ×{' '}
              {mm(g.projections.width)}) = {mm(g.reconstructed.width)} mm ✓
            </p>
            <details className="partition-detail-summary">
              <summary>Full dimension breakdown</summary>
              <p>L {g.breakdown.length}</p>
              <p>W {g.breakdown.width}</p>
            </details>
          </div>
          <h4>Side View · interlocking strip detail</h4>
          <div className="partition-side-layout">
            <div>
              {(
                [
                  ['A', layout.sideA],
                  ['B', layout.sideB],
                ] as const
              ).map(([group, side]) => (
                <svg
                  key={group}
                  className="partition-side-svg"
                  role="img"
                  aria-label={`Group ${group} strip side view, height ${mm(g.outer.height)} mm, slot depth ${mm(g.slots.depth)} mm, slot width ${mm(g.slots.width)} mm`}
                  viewBox={`-20 ${side.height >= 80 ? -38 : -90} ${Math.max(515, side.width + 155)} ${side.height >= 80 ? side.height + 94 : Math.max(230, side.height + 150)}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <pattern
                      id={`${id}-slot-${group}`}
                      patternUnits="userSpaceOnUse"
                      x={side.firstSlot}
                      y="0"
                      width={side.pitch}
                      height={side.height}
                    >
                      <rect
                        width={side.slotWidth}
                        y={group === 'A' ? 0 : side.height - side.depth}
                        height={side.depth}
                        fill="black"
                      />
                    </pattern>
                    <mask
                      id={`${id}-mask-${group}`}
                      maskUnits="userSpaceOnUse"
                      x="0"
                      y="0"
                      width={side.width}
                      height={side.height}
                    >
                      <rect
                        width={side.width}
                        height={side.height}
                        fill="white"
                      />
                      <rect
                        x={side.firstSlot}
                        width={side.slotSpan}
                        height={side.height}
                        fill={`url(#${id}-slot-${group})`}
                      />
                    </mask>
                  </defs>
                  <text x="0" y="-18">
                    Group {group} · {side.count} slots ·{' '}
                    {group === 'A' ? 'opens from top' : 'opens from bottom'}
                  </text>
                  <rect
                    className="partition-strip"
                    width={side.width}
                    height={side.height}
                    mask={`url(#${id}-mask-${group})`}
                  />
                  <g className="partition-extension">
                    <path
                      d={`M ${side.width} 0 H ${side.width + 100} M ${side.width} ${side.height} H ${side.width + 45}`}
                    />
                  </g>
                  <Dimension
                    x1={side.width + 35}
                    y1={0}
                    x2={side.width + 35}
                    y2={side.height}
                    label={`H ${mm(g.outer.height)} mm`}
                    vertical
                  />
                  <Dimension
                    x1={side.width + 85}
                    y1={group === 'A' ? 0 : side.height - side.depth}
                    x2={side.width + 85}
                    y2={group === 'A' ? side.depth : side.height}
                    label={`D ${mm(g.slots.depth)} mm`}
                    vertical
                  />
                  <Dimension
                    x1={side.firstSlot}
                    y1={side.height + 23}
                    x2={side.firstSlot + side.slotWidth}
                    y2={side.height + 23}
                  />
                  <text x={Math.max(0, side.firstSlot)} y={side.height + 39}>
                    Slot Width {mm(g.slots.width)} mm
                  </text>
                </svg>
              ))}
            </div>
            <div className="partition-side-details">
              <p>
                Outer Height: <strong>{mm(g.outer.height)} mm</strong>
              </p>
              <p>
                Partition Thickness: <strong>{mm(g.thickness)} mm</strong>
              </p>
              <p>
                Slot Width: <strong>{mm(g.slots.width)} mm</strong>
              </p>
              <p>
                Slot Depth: <strong>{mm(g.slots.depth)} mm</strong>
              </p>
              <p>
                Group A and Group B engage through opposing slots. Strip faces
                are shown separately so the cuts remain visible; the entered
                slot overrides are preserved.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
