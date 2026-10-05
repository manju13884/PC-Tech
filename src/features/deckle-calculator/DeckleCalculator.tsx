import { useMemo, useState, type FormEvent } from 'react'
import { Calculator, ChevronRight, RotateCcw } from 'lucide-react'
import { useCalculatorMasterData } from '../master-data/CalculatorMasterData'
import { APPROVED_DECKLE_ORIENTATION, evaluateDeckleOptions, type DeckleInput } from './deckleCalculatorEngine'
import type { BlankSizePly } from '../calculators/blankSize'
import '../corrugated-board-price-calculator/corrugated-board-price-calculator.css'
import './deckle-calculator.css'

const number = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
export default function DeckleCalculator() {
  const defaults = useCalculatorMasterData()
  const maximum = Number(defaults.maximumMachineDeckle)
  const configured = Number.isFinite(maximum) && maximum > 0
  const [dimensions, setDimensions] = useState({ lengthMm: '', widthMm: '', heightMm: '' })
  const [ply, setPly] = useState<BlankSizePly>(3)
  const [submitted, setSubmitted] = useState<DeckleInput | null>(null)
  const [calculationExpanded, setCalculationExpanded] = useState(true)
  const analysis = useMemo(() => {
    if (!submitted || !configured) return null
    try { return { result: evaluateDeckleOptions(submitted, maximum), error: '' } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Unable to calculate.' } }
  }, [submitted, maximum, configured])
  const result = analysis?.result
  const selected = result?.recommended
  function calculate(event: FormEvent) {
    event.preventDefault()
    setSubmitted({ lengthMm: Number(dimensions.lengthMm), widthMm: Number(dimensions.widthMm),
      heightMm: Number(dimensions.heightMm), ply, fluteRun: '', orientation: APPROVED_DECKLE_ORIENTATION })
  }
  return <section className="pc-corrugated-board-calculator deckle-calculator" aria-label="Deckle Calculator">
    <div className="board-calculator-actions">
      <button className="board-calculator-refresh-button deckle-reset" type="button" title="Reset calculator" onClick={() => { setDimensions({ lengthMm: '', widthMm: '', heightMm: '' }); setPly(3); setSubmitted(null) }}><RotateCcw size={16} strokeWidth={2} aria-hidden="true" /><span>Reset</span></button>
    </div>
    <form onSubmit={calculate} className="deckle-inputs">
      <header><h3><Calculator size={15} /> Box Dimensions <span>(MM)</span></h3></header>
      <div className="deckle-fields">
        {([['lengthMm', 'Length (L)'], ['widthMm', 'Width (W)'], ['heightMm', 'Height (H)']] as const).map(([key, label]) =>
          <label key={key}>{label} *<input aria-label={label} type="text" inputMode="decimal" required value={dimensions[key]}
            onChange={event => { setDimensions(old => ({ ...old, [key]: event.target.value })); setSubmitted(null) }} /></label>)}
        <label>Ply *<select aria-label="Ply" value={ply} onChange={event => { setPly(Number(event.target.value) as BlankSizePly); setSubmitted(null) }}>
          <option value={3}>3 Ply</option><option value={5}>5 Ply</option><option value={7}>7 Ply</option>
        </select></label>
      </div>
      <div className="deckle-config"><span>Maximum Machine Deckle: <strong>{configured ? `${number(maximum)} CM` : 'Not configured'}</strong></span>
        <button type="submit" disabled={!configured}>Calculate</button></div>
      <p className="deckle-note">Box / RSC &middot; {APPROVED_DECKLE_ORIENTATION} &middot; Dimensions in MM; production sizes in CM.</p>
    </form>
    {!configured && <p className="deckle-warning" role="alert">Maximum Machine Deckle is not configured. Configure it under: Configurations → Master Data.</p>}
    {analysis?.error && <p className="deckle-warning" role="alert">{analysis.error}</p>}
    {result && <div aria-live="polite">
      <section className={`deckle-recommendation ${selected ? '' : 'does-not-fit'}`}>
        <header><h3>{selected ? 'Recommended Production Setup' : 'Does Not Fit Machine'}</h3>{selected && <span className="deckle-fit-status">Fits machine</span>}</header>
        <p className="deckle-box-context">Box Size: {number(result.box.lengthMm)} × {number(result.box.widthMm)} × {number(result.box.heightMm)} MM · {result.box.ply} Ply</p>
        {selected ? <>
          <dl className="deckle-key-values"><div><dt>Deckle</dt><dd>{number(selected.deckleCm)} <small>CM</small></dd></div>
            <div><dt>Cut Length</dt><dd>{number(selected.cutLengthCm)} <small>CM</small></dd></div>
            <div><dt>Ups</dt><dd>{selected.ups}-Up</dd></div></dl>
          <dl className="deckle-setup-metrics"><div><dt>Unused Deckle</dt><dd>{number(selected.unusedCm!)} CM</dd></div><div><dt>Machine Utilization</dt><dd>{selected.utilization!.toFixed(2)}%</dd></div></dl>
        </> : <p>Required Deckle: <strong>{number(result.minimum.deckleCm)} CM</strong> · Machine Maximum: {number(maximum)} CM · Exceeds By: <strong>{number(result.minimum.deckleCm - maximum)} CM</strong></p>}
      </section>
      <section className="deckle-explanation">
        <header className="deckle-explanation-header">
          <button className="deckle-calculation-toggle" type="button" aria-expanded={calculationExpanded} aria-controls="deckle-calculation-breakdown" aria-label={`${calculationExpanded ? 'Collapse' : 'Expand'} View Calculation`} title={`${calculationExpanded ? 'Collapse' : 'Expand'} View Calculation`} onClick={() => setCalculationExpanded(value => !value)}><ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" /></button>
          <span>View Calculation</span><span className="deckle-explanation-hint">Formula breakdown</span>
        </header>
        <div id="deckle-calculation-breakdown" hidden={!calculationExpanded}>
        <h4 className="deckle-calculation-heading">Deckle &amp; Machine Utilization</h4>
        <dl className="deckle-calculation-rows">
          <div><dt>Deckle side</dt><dd><span>{number(result.box.widthMm)} + {number(result.box.heightMm)} = {number(result.explanation.deckleSideMm)} MM</span><strong>{number(result.explanation.deckleSideMm / 10)} CM</strong></dd></div>
          <div><dt>Single-Up deckle</dt><dd><span>({number(result.explanation.deckleSideMm)} + {number(result.explanation.singleTrimMm)} MM trim) ÷ 10</span><strong>{number(result.single.deckleSizeCm)} CM</strong></dd></div>
          <div><dt>Multi-Up deckle</dt><dd><span>({number(result.explanation.deckleSideMm)} MM × Ups + {number(result.explanation.multiTrimMm)} MM shared trim) ÷ 10</span><strong>Varies by Ups</strong></dd></div>
          {selected && <>
            <div><dt>Unused deckle</dt><dd><span>{number(maximum)} − {number(selected.deckleCm)} CM</span><strong>{number(selected.unusedCm!)} CM</strong></dd></div>
            <div><dt>Machine Utilization</dt><dd><span>{number(selected.deckleCm)} ÷ {number(maximum)} × 100</span><strong>{selected.utilization!.toFixed(2)}%</strong></dd></div>
          </>}
        </dl>
        <h4 className="deckle-calculation-heading">Cut Length <span>{result.box.ply} Ply</span></h4>
        <dl className="deckle-calculation-rows">
          <div><dt>Length panels</dt><dd><span>2 × ({number(result.box.lengthMm)} + {number(result.explanation.cutLength.creasingMm)} MM creasing)</span><strong>{number(result.explanation.cutLength.lengthPanelMm)} MM</strong></dd></div>
          <div><dt>Width panels</dt><dd><span>2 × ({number(result.box.widthMm)} + {number(result.explanation.cutLength.creasingMm)} MM creasing)</span><strong>{number(result.explanation.cutLength.widthPanelMm)} MM</strong></dd></div>
          <div><dt>{result.box.ply === 7 ? 'Combined allowance' : 'Joint allowance'}</dt><dd><span>{result.box.ply === 7 ? 'Existing 7-ply production allowance' : 'Joining allowance'}</span><strong>{number(result.explanation.cutLength.jointMm)} MM</strong></dd></div>
          <div><dt>Total cut length</dt><dd><span>{number(result.explanation.cutLength.lengthPanelMm)} + {number(result.explanation.cutLength.widthPanelMm)} + {number(result.explanation.cutLength.jointMm)}</span><strong>{number(result.explanation.cutLength.cutLengthMm)} MM</strong></dd></div>
          <div><dt>Cut Length (CM)</dt><dd><span>{number(result.explanation.cutLength.cutLengthMm)} ÷ 10 · Unchanged by Ups</span><strong>{number(result.explanation.cutLength.cutLengthCm)} CM</strong></dd></div>
        </dl>
        <div className="deckle-calculation-note">Ups across deckle only; no rotation. Shared trim applies once. Best valid utilization is recommended.</div>
        </div>
      </section>
      <div className="deckle-table-wrap"><table><caption>Ups analysis — {APPROVED_DECKLE_ORIENTATION}</caption>
        <thead><tr><th>Ups</th><th>Required Deckle</th><th>Cut Length</th><th>Unused</th><th>Machine Utilization</th><th>Status</th></tr></thead>
        <tbody>{result.options.map(option => <tr key={option.ups} className={option === selected ? 'recommended' : ''}>
          <td>{option.ups}-Up{option === selected && <small>RECOMMENDED</small>}</td><td>{number(option.deckleCm)} CM</td><td>{number(option.cutLengthCm)} CM</td>
          <td>{option.unusedCm == null ? '—' : `${number(option.unusedCm)} CM`}</td><td>{option.utilization == null ? '—' : `${option.utilization.toFixed(2)}%`}</td><td>{option.status}</td>
        </tr>)}</tbody></table></div>
    </div>}
  </section>
}
