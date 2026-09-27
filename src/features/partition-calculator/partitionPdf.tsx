import { renderToStaticMarkup } from 'react-dom/server'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import PartitionDrawing from './PartitionDrawing'
import type { PartitionPdfModel, PdfSection } from './partitionPdfModel'

const ascii = (value: string) =>
  value
    .replace(/₹/g, 'INR ')
    .replace(/×/g, 'x')
    .replace(/²/g, '2')
    .replace(/[–—]/g, '-')
    .replace(/✓/g, 'MATCH')
    .replace(/·/g, '|')

/** Reuse the screen SVG. Inline its presentation and express side-slot masks as
 * white vector cutouts because SVG masks are not supported by every PDF renderer. */
export function partitionPdfDrawings(
  model: PartitionPdfModel,
): SVGSVGElement[] {
  const holder = document.createElement('div')
  holder.innerHTML = renderToStaticMarkup(
    <PartitionDrawing
      geometry={model.geometry}
      fits={[]}
      requested={model.geometry.requested}
      ply={model.geometry.ply}
    />,
  )
  return Array.from(
    holder.querySelectorAll<SVGSVGElement>(
      '.partition-top-svg, .partition-side-svg',
    ),
  ).map((svg) => {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('font-family', 'helvetica')
    svg.setAttribute('font-size', '13')
    svg.setAttribute('fill', '#334155')
    svg.querySelectorAll('text').forEach((text) => {
      text.textContent = ascii(text.textContent || '')
      text.setAttribute('fill', '#334155')
    })
    svg
      .querySelectorAll('.partition-strip')
      .forEach((el) => el.setAttribute('fill', '#cbd5e1'))
    svg
      .querySelectorAll('.partition-dimension line, .partition-dimension path')
      .forEach((el) => {
        el.setAttribute('stroke', '#334155')
        el.setAttribute('stroke-width', '1')
        el.setAttribute('fill', 'none')
      })
    svg.querySelectorAll('.partition-extension path').forEach((el) => {
      el.setAttribute('stroke', '#94a3b8')
      el.setAttribute('stroke-width', '.7')
      el.setAttribute('fill', 'none')
    })
    svg
      .querySelectorAll('.partition-cell-number')
      .forEach((el) => el.setAttribute('fill', '#64748b'))
    svg.querySelectorAll<SVGRectElement>('rect[mask]').forEach((strip) => {
      const maskId = strip.getAttribute('mask')!.slice(5, -1)
      const mask = Array.from(svg.querySelectorAll('mask')).find(
        (el) => el.id === maskId,
      )!
      const cutout = mask.lastElementChild!.cloneNode(true) as SVGElement
      const clip = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'clipPath',
      )
      clip.id = `${maskId}-clip`
      const bounds = strip.cloneNode(false) as SVGElement
      bounds.removeAttribute('mask')
      bounds.removeAttribute('class')
      clip.append(bounds)
      svg.querySelector('defs')!.append(clip)
      const patternId = cutout.getAttribute('fill')!.slice(5, -1)
      const pattern = Array.from(svg.querySelectorAll('pattern')).find(
        (el) => el.id === patternId,
      )!
      pattern
        .querySelectorAll('rect')
        .forEach((el) => el.setAttribute('fill', 'white'))
      cutout.setAttribute('clip-path', `url(#${clip.id})`)
      strip.removeAttribute('mask')
      strip.after(cutout)
      mask.remove()
    })
    // Expand the existing SVG paint tiles into equivalent vector rectangles.
    // This avoids renderer-specific tiling transforms without recalculating geometry.
    const numeric = (el: Element, key: string) =>
      Number(el.getAttribute(key) || 0)
    svg
      .querySelectorAll<SVGRectElement>('rect[fill^="url(#"]')
      .forEach((target) => {
        const patternId = target.getAttribute('fill')!.slice(5, -1)
        const pattern = Array.from(svg.querySelectorAll('pattern')).find(
          (el) => el.id === patternId,
        )
        if (!pattern) return
        let left = numeric(target, 'x'),
          top = numeric(target, 'y'),
          right = left + numeric(target, 'width'),
          bottom = top + numeric(target, 'height')
        const clipId = target.getAttribute('clip-path')?.slice(5, -1)
        const clip = Array.from(svg.querySelectorAll('clipPath'))
          .find((el) => el.id === clipId)
          ?.querySelector('rect')
        if (clip) {
          left = Math.max(left, numeric(clip, 'x'))
          top = Math.max(top, numeric(clip, 'y'))
          right = Math.min(right, numeric(clip, 'x') + numeric(clip, 'width'))
          bottom = Math.min(
            bottom,
            numeric(clip, 'y') + numeric(clip, 'height'),
          )
        }
        const pitchX = numeric(pattern, 'width'),
          pitchY = numeric(pattern, 'height')
        const startX =
          numeric(pattern, 'x') +
          Math.floor((left - numeric(pattern, 'x')) / pitchX) * pitchX
        const startY =
          numeric(pattern, 'y') +
          Math.floor((top - numeric(pattern, 'y')) / pitchY) * pitchY
        const cols = Math.ceil((right - startX) / pitchX),
          rows = Math.ceil((bottom - startY) / pitchY)
        if (!Number.isSafeInteger(cols * rows) || cols * rows > 50000)
          throw new Error(
            'This grid is too dense for a readable PDF drawing. Reduce the cell count before exporting.',
          )
        const group = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'g',
        )
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++)
            for (const source of pattern.querySelectorAll('rect')) {
              const x = startX + col * pitchX + numeric(source, 'x'),
                y = startY + row * pitchY + numeric(source, 'y')
              const l = Math.max(left, x),
                t = Math.max(top, y),
                r = Math.min(right, x + numeric(source, 'width')),
                b = Math.min(bottom, y + numeric(source, 'height'))
              if (r <= l || b <= t) continue
              const rect = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'rect',
              )
              for (const [key, value] of Object.entries({
                x: l,
                y: t,
                width: r - l,
                height: b - t,
              }))
                rect.setAttribute(key, String(value))
              rect.setAttribute(
                'fill',
                source.getAttribute('fill') || '#cbd5e1',
              )
              group.append(rect)
            }
        target.replaceWith(group)
      })
    svg.querySelectorAll('pattern, clipPath').forEach((el) => el.remove())
    return svg
  })
}

export async function createPartitionPdf(model: PartitionPdfModel) {
  const pdf = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  })
  pdf.setProperties({
    title: model.title,
    author: model.generatedBy,
    creator: 'PC-Tech',
    subject: `${model.geometry.ply} Ply Partition`,
  })
  const mm = (n: number) => (n * 72) / 25.4
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    pdf.line(mm(x1), mm(y1), mm(x2), mm(y2))
  const text = (
    value: string,
    x: number,
    y: number,
    size = 8,
    bold = false,
    width?: number,
  ) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(30, 41, 59)
    const lines = width
      ? pdf.splitTextToSize(ascii(value), mm(width))
      : ascii(value)
    pdf.text(lines, mm(x), mm(y))
  }
  const heading = (title: string, y: number) => {
    text(title, 12, y, 9, true)
    pdf.setDrawColor(203, 213, 225)
    pdf.setLineWidth(0.2)
    line(12, y + 2, 198, y + 2)
  }
  const header = () => {
    text('POLAR CANVAS TECHNOLOGIES PVT. LTD.', 12, 14, 11, true)
    text(model.title, 12, 21, 14, true)
    text(
      `${model.geometry.ply} Ply Partition | Generated from PC-Tech`,
      12,
      27,
      8,
    )
    text(`Generated: ${model.date} ${model.time}`, 12, 32, 7)
    text(`Generated by: ${model.generatedBy}`, 12, 37, 7, false, 184)
  }
  const section = (data: PdfSection, y: number, compact = false) => {
    heading(data.title, y)
    y += 7
    for (const row of data.rows) {
      const widths = [40, 51, 40, 51],
        positions = [12, 53, 106, 147]
      let height = compact ? 4.3 : 6
      row.forEach((value, i) => {
        const lines = pdf.splitTextToSize(ascii(value), mm(widths[i]))
        height = Math.max(height, lines.length * 3.1)
        text(value, positions[i], y, compact ? 7 : 8, i % 2 === 1, widths[i])
      })
      y += height
    }
    return y + 3
  }
  const drawing = async (
    svg: SVGSVGElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    pdf.saveGraphicsState()
    try {
      await svg2pdf(svg, pdf, {
        x: mm(x),
        y: mm(y),
        width: mm(width),
        height: mm(height),
        loadExternalStyleSheets: false,
      })
    } finally {
      pdf.restoreGraphicsState()
    }
  }
  header()
  let y = section(model.details, 45, true)
  y = section(model.cells, y, true)
  text(
    'Group A spans Outer Length; Group B spans Outer Width. Projections are per side.',
    12,
    y,
    7,
  )
  y += 5
  heading('TOP VIEW', y)
  const drawings = partitionPdfDrawings(model)
  await drawing(drawings[0], 27, y + 3, 156, 119)
  y += 126
  text('DIMENSION CHECK', 12, y, 8, true)
  model.dimensionChecks.forEach((line, i) => text(line, 12, y + 4 + i * 4, 7.5))
  y += 16
  text(
    `SIDE VIEWS | H ${model.geometry.outer.height} mm | T ${model.geometry.thickness} mm | Slot width ${model.geometry.slots.width} mm | Depth ${model.geometry.slots.depth} mm`,
    12,
    y,
    7.5,
    true,
  )
  await drawing(drawings[1], 12, y + 2, 91, 35)
  await drawing(drawings[2], 107, y + 2, 91, 35)
  pdf.addPage()
  header()
  y = 46
  heading('PAPER COMPOSITION', y)
  y += 5
  const cols = model.paperHeaders.length
  const widths =
    cols === 9
      ? [32, 16, 13, 24, 15, 18, 22, 23, 23]
      : [38, 22, 18, 34, 20, 24, 30]
  const tableRow = (row: string[], headerRow: boolean) => {
    let x = 12
    const height = 8
    if (headerRow) {
      pdf.setFillColor(241, 245, 249)
      pdf.rect(mm(12), mm(y - 4), mm(186), mm(height), 'F')
    }
    row.forEach((value, i) => {
      pdf.setFont('helvetica', headerRow ? 'bold' : 'normal')
      pdf.setFontSize(7.5)
      const numeric = i !== 0 && i !== 3 && i !== 4
      pdf.text(ascii(value), mm(numeric ? x + widths[i] - 2 : x + 2), mm(y), {
        align: numeric ? 'right' : 'left',
        maxWidth: mm(widths[i] - 4),
      })
      x += widths[i]
    })
    pdf.setDrawColor(226, 232, 240)
    line(12, y + 3, 198, y + 3)
    y += height
  }
  tableRow(model.paperHeaders, true)
  model.paperRows.forEach((row) => tableRow(row, false))
  y += 5
  for (const data of model.sections) {
    const needed = 12 + data.rows.length * 8
    if (y + needed > 276) {
      pdf.addPage()
      header()
      y = 46
    }
    y = section(data, y)
  }
  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page)
    pdf.setDrawColor(203, 213, 225)
    line(12, 283, 198, 283)
    text(
      'Generated from PC-Tech | Confidential | Shred After Job Completion',
      12,
      288,
      7,
    )
    text(`Page ${page} of ${pages}`, 175, 288, 7)
  }
  return pdf
}

export async function savePartitionPdf(model: PartitionPdfModel) {
  const pdf = await createPartitionPdf(model)
  pdf.save(model.filename)
}
