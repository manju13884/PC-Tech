import { ClipboardPlus, FilterX, Printer, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatIstDate } from '../../utils/dateTimeFormatting';
import { calculateRotarySize, calculateSlottingSize } from '../product-specifications/rotarySizeCalculations';
import { calculateRequiredPaperQuantity } from './jobCardCalculations';
import './job-cards.css';

interface PaperLayer {
  layer_name?: string;
  paper_grade?: string;
  gsm?: string;
  bf_rct?: string;
  deckle_size?: string;
  shade?: string;
  flute?: string;
}
export interface JobCardLine {
  production_plan_line_id: number;
  job_card_id: number | null;
  job_number: string | null;
  job_status: string | null;
  job_created_at: string | null;
  plan_number: string;
  plan_date: string;
  plan_status: string;
  plan_remarks: string;
  customer_name: string;
  sales_order_number: string;
  delivery_date: string;
  item_name: string;
  item_description: string;
  customer_po_number: string;
  production_quantity: number;
  two_ply_quantity: number | null;
  deckle_size: string;
  uom: string;
  product_type: string;
  ply: number | null;
  specification_code: string;
  product_name: string;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  print_required: number;
  print_colors: string;
  specification_notes: string;
  attributes_json: string;
  process_entries_json?: string;
  supervisor_name?: string | null;
  supervisor_user_id?: number | null;
  quality_name?: string | null;
  dispatch_name?: string | null;
  box_weight_kg?: number | null;
  manufactured_quantity?: number | null;
}

export interface InventoryReel {
  inventory_stock_id: number;
  material_no: string;
  reel_number: string;
  gsm: number;
  bf: number | null;
  reel_size_cm: number;
  available_weight: number;
  reel_status?: 'Available' | 'Reserved';
  reserved_job_card_id?: number | null;
  reserved_job_number?: string | null;
}

type ProcessField = 'start_datetime' | 'end_datetime' | 'in_quantity' | 'out_quantity' | 'employee_name' | 'in_quantity_2' | 'out_quantity_2' | 'employee_name_2' | 'reel_number' | 'in_reel_weight' | 'out_reel_weight' | 'remaining_reel_weight' | 'reel_number_2' | 'in_reel_weight_2' | 'out_reel_weight_2' | 'remaining_reel_weight_2';
type FooterField = 'supervisor_name' | 'quality_name' | 'dispatch_name' | 'box_weight_kg' | 'manufactured_quantity';
interface ProcessEntry {
  process_entry_id?: number;
  process_name: string;
  start_datetime: string | null;
  end_datetime: string | null;
  in_quantity: number | null;
  out_quantity: number | null;
  employee_name: string | null;
  in_quantity_2: number | null;
  out_quantity_2: number | null;
  employee_name_2: string | null;
  reel_number: string | null;
  in_reel_weight: number | null;
  out_reel_weight: number | null;
  remaining_reel_weight: number | null;
  reel_number_2: string | null;
  in_reel_weight_2: number | null;
  out_reel_weight_2: number | null;
  remaining_reel_weight_2: number | null;
  inventory_stock_id: number | null;
  inventory_stock_id_2: number | null;
  process_status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  completed_at?: string | null;
}

const numberText = (value: number | null | undefined) => (value == null ? '' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
interface JobCardAttributes {
  paper_layers?: PaperLayer[];
  production_stages?: string[];
  board_type?: string;
  joint_type?: string;
  material?: string;
  flute_type?: string;
  paper_type?: string;
  shade_color?: string;
  finish?: string;
  board_creasing_allowance?: string;
}
const readAttributes = (line: JobCardLine): JobCardAttributes => {
  try {
    return JSON.parse(line.attributes_json || '{}') as JobCardAttributes;
  } catch {
    return {};
  }
};
const calculated = (line: JobCardLine) => {
  const attributes = readAttributes(line);
  const layers = attributes.paper_layers ?? [];
  const deckle = Number(line.deckle_size || layers.find((layer) => layer.deckle_size)?.deckle_size || (line.width_mm ?? 0) + (line.height_mm ?? 0) + 20);
  const creasingAllowance = Number(attributes.board_creasing_allowance);
  const rotaryCalculation = calculateRotarySize(Number(line.width_mm), Number(line.height_mm), creasingAllowance);
  const slottingSize = calculateSlottingSize(Number(line.width_mm), creasingAllowance);
  const rotary = rotaryCalculation?.rotarySize ?? 0;
  const boardGsm = layers.every((layer) => Number(layer.gsm) > 0) ? layers.reduce((sum, layer) => sum + Number(layer.gsm), 0) : 0;
  const boxWeight = deckle > 0 && rotary > 0 && boardGsm > 0 ? (deckle * rotary * boardGsm * 1.05) / 1_000_000 : 0;
  const bs = layers.every((layer) => Number(layer.gsm) > 0 && Number(layer.bf_rct) > 0) ? layers.reduce((sum, layer) => sum + (Number(layer.gsm) * Number(layer.bf_rct)) / 1000, 0) : 0;
  return {
    layers,
    deckle,
    rotary,
    rotaryCalculation,
    slottingSize,
    boxWeight,
    bs,
  };
};
const readProcessEntries = (line: JobCardLine): ProcessEntry[] => {
  try {
    const value: unknown = JSON.parse(line.process_entries_json || '[]');
    return Array.isArray(value) ? value.filter((entry): entry is ProcessEntry => Boolean(entry) && typeof entry === 'object' && typeof (entry as ProcessEntry).process_name === 'string') : [];
  } catch {
    return [];
  }
};
const processDateTimeText = (value: string | null | undefined) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})/);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1];
  return `${day}-${monthName}-${year.slice(-2)} ${hour}:${minute}`;
};

function ReelDetailCell({ stage, label, entry, field, secondField, numeric = false, processEditable, reelEditable, savingProcessKey, onChange, inventoryReels = [], onReelSelect, onReelConsume }: { stage: string; label: string; entry?: ProcessEntry; field: ProcessField; secondField: ProcessField; numeric?: boolean; processEditable: boolean; reelEditable: boolean; savingProcessKey: string; onChange?: (processName: string, field: ProcessField, value: string) => void; inventoryReels?: InventoryReel[]; onReelSelect?: (processName: string, reelSlot: 1 | 2, inventoryStockId: number) => void; onReelConsume?: (processName: string, reelSlot: 1 | 2, outReelWeight: string) => void }) {
  if (stage !== 'Paper Cutting' && stage !== 'Corrugation') return <td></td>;
  reelEditable = reelEditable && entry?.process_status !== 'COMPLETED';
  const hasSecondReel = stage === 'Corrugation';
  const display = (value: string | number | null | undefined) => (numeric ? numberText(value == null ? null : Number(value)) : value || '');
  const input = (inputField: ProcessField, suffix: string, slot: 1 | 2) => {
    const inventoryIdField = slot === 2 ? 'inventory_stock_id_2' : 'inventory_stock_id';
    const inWeightField = slot === 2 ? 'in_reel_weight_2' : 'in_reel_weight';
    const outWeightField = slot === 2 ? 'out_reel_weight_2' : 'out_reel_weight';
    const selectedId = Number(entry?.[inventoryIdField] ?? 0);
    if (label === 'Reel Number') {
      const selectedStillAvailable = inventoryReels.some((reel) => reel.inventory_stock_id === selectedId);
      return (
        <select key={`${stage}:${inputField}:${selectedId}`} className="job-card-process-entry job-card-reel-select" aria-label={`${stage} Reel No.${suffix}`} value={selectedId || ''} disabled={!reelEditable || savingProcessKey === `${stage}:reel_${slot}`} onChange={(event) => onReelSelect?.(stage, slot, Number(event.target.value))}>
          <option value="">Select Reel</option>
          {selectedId > 0 && !selectedStillAvailable && <option value={selectedId}>{entry?.[inputField]} | Unavailable</option>}
          {inventoryReels.map((reel) => (
            <option key={reel.inventory_stock_id} value={reel.inventory_stock_id}>
              {reel.reel_number} | {reel.material_no} | {reel.gsm} GSM | {reel.bf ?? '-'} BF | {reel.reel_size_cm} cm | {numberText(reel.available_weight)} KG
            </option>
          ))}
        </select>
      );
    }
    if (label === 'Consumed Reel Weight') {
      const consumed = entry?.[outWeightField] == null ? '' : Math.max(0, Number(entry?.[inWeightField] ?? 0) - Number(entry?.[outWeightField]));
      return <input key={`${stage}:${inputField}:consumed:${consumed}`} className="job-card-process-entry job-card-reel-readonly" aria-label={`${stage} Consumed Reel Weight${suffix}`} readOnly value={consumed} />;
    }
    if (label === 'In Reel Weight' || label === 'Remaining Reel Weight') {
      return <input key={`${stage}:${inputField}:${entry?.[inputField] ?? ''}`} className="job-card-process-entry job-card-reel-readonly" aria-label={`${stage} ${label}${suffix}`} readOnly value={entry?.[inputField] ?? ''} />;
    }
    if (label === 'Out Reel Weight') {
      return <input key={`${stage}:${inputField}:${entry?.[inputField] ?? ''}`} className="job-card-process-entry" aria-label={`${stage} Out Reel Weight${suffix}`} inputMode="decimal" defaultValue={entry?.[inputField] ?? ''} readOnly={!reelEditable} disabled={!selectedId || savingProcessKey === `${stage}:reel_${slot}`} onBlur={(event) => onReelConsume?.(stage, slot, event.target.value)} />;
    }
    return <input key={`${stage}:${inputField}:${entry?.[inputField] ?? ''}`} className="job-card-process-entry" aria-label={`${stage} ${label}${suffix}`} inputMode={numeric ? 'decimal' : undefined} maxLength={numeric ? undefined : 80} defaultValue={entry?.[inputField] ?? ''} disabled={savingProcessKey === `${stage}:${inputField}`} onBlur={(event) => onChange?.(stage, inputField, event.target.value)} />;
  };
  return (
    <td className={hasSecondReel ? 'job-card-split-process-values' : ''}>
      <div className={hasSecondReel ? 'job-card-process-entry-stack' : ''}>
        {processEditable ? (
          <>
            {input(field, hasSecondReel ? ' 1' : '', 1)}
            {hasSecondReel && input(secondField, ' 2', 2)}
          </>
        ) : (
          <>
            <span>{display(entry?.[field])}</span>
            {hasSecondReel && <span>{display(entry?.[secondField])}</span>}
          </>
        )}
      </div>
    </td>
  );
}

export default function JobCards() {
  const [lines, setLines] = useState<JobCardLine[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'ready' | 'created'>('ready');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewingSpecification, setViewingSpecification] = useState<JobCardLine | null>(null);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/job-cards', {
        credentials: 'include',
      });
      const data = (await response.json().catch(() => ({}))) as {
        lines?: JobCardLine[];
        error?: string;
      };
      if (response.status === 401) window.dispatchEvent(new Event('pc-tech-session-expired'));
      if (!response.ok) throw new Error(data.error || 'Unable to load Job Cards.');
      setLines(Array.isArray(data.lines) ? data.lines : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Job Cards.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lines.filter((line) => Boolean(line.job_card_id) === (view === 'created') && (!term || `${line.job_number} ${line.plan_number} ${line.sales_order_number} ${line.customer_name} ${line.product_name} ${line.item_description}`.toLowerCase().includes(term)));
  }, [lines, search, view]);
  const selectedLines = lines.filter((line) => selected.includes(line.production_plan_line_id));
  const createCards = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/job-cards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds: selected }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        lines?: JobCardLine[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Unable to create Job Cards.');
      setLines(Array.isArray(data.lines) ? data.lines : []);
      setView('created');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create Job Cards.');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: number) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const printSelected = () => {
    const previousTitle = document.title;
    document.title = selectedLines.length === 1 && selectedLines[0].job_number ? selectedLines[0].job_number : `Production-Job-Cards-${selectedLines.length}`;
    window.addEventListener(
      'afterprint',
      () => {
        document.title = previousTitle;
      },
      { once: true },
    );
    window.print();
  };

  return (
    <div className="production-planning-workspace production-planned-workspace job-cards-workspace">
      {error && (
        <p className="production-planning-message is-error job-cards-message" role="alert">
          {error}
          <button type="button" onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </p>
      )}
      <div className="production-planned-toolbar job-cards-toolbar">
        <div className="production-planned-title">
          <ClipboardPlus size={15} />
          <strong>Production Job Cards</strong>
          <span>{filtered.length} production items</span>
        </div>
        <div className="production-planned-controls job-cards-actions">
          <input aria-label="Search Job Cards" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, plan, SO, customer, product" />
          <select
            aria-label="Job Card view"
            value={view}
            onChange={(event) => {
              setView(event.target.value as 'ready' | 'created');
              setSelected([]);
            }}
          >
            <option value="ready">Ready to Create</option>
            <option value="created">Created Job Cards</option>
          </select>
          <button
            type="button"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={() => {
              setSearch('');
              setView('ready');
              setSelected([]);
            }}
          >
            <FilterX size={14} />
          </button>
          <button type="button" aria-label="Refresh Job Cards" title="Refresh" disabled={loading} onClick={load}>
            <RefreshCw size={14} />
          </button>
          {view === 'ready' ? (
            <button className="job-cards-primary" type="button" disabled={!selected.length || busy} onClick={createCards}>
              <ClipboardPlus size={14} />
              {busy ? 'Creating...' : `Create Job Cards (${selected.length})`}
            </button>
          ) : (
            <button className="job-cards-primary job-cards-print" type="button" disabled={!selectedLines.length} onClick={printSelected}>
              <Printer size={14} /> Print Selected ({selectedLines.length})
            </button>
          )}
        </div>
      </div>
      <section className="production-selection-panel production-planned-grid-panel job-cards-list">
        <div className="job-cards-table-scroll">
          <table>
            <colgroup>
              <col className="job-grid-select" />
              <col className="job-grid-id" />
              <col className="job-grid-status" />
              <col className="job-grid-date" />
              <col className="job-grid-plan" />
              <col className="job-grid-order" />
              <col className="job-grid-item" />
              <col className="job-grid-customer" />
              <col className="job-grid-product-name" />
              <col className="job-grid-product-description" />
              <col className="job-grid-qty" />
            </colgroup>
            <thead>
              <tr className="job-cards-groups">
                <th rowSpan={2}>
                  <input aria-label="Select all" type="checkbox" checked={filtered.length > 0 && filtered.every((line) => selected.includes(line.production_plan_line_id))} onChange={() => setSelected(filtered.every((line) => selected.includes(line.production_plan_line_id)) ? [] : filtered.map((line) => line.production_plan_line_id))} />
                </th>
                <th className="group-job" colSpan={2}>
                  Job Card
                </th>
                <th className="group-schedule" colSpan={2}>
                  Schedule
                </th>
                <th className="group-order" colSpan={2}>
                  Order &amp; Item
                </th>
                <th className="group-customer">Customer</th>
                <th className="group-product" colSpan={2}>
                  Product
                </th>
                <th className="group-production">Production</th>
              </tr>
              <tr>
                <th>Job ID</th>
                <th>Status</th>
                <th>Production Date</th>
                <th>Plan</th>
                <th>Sales Order</th>
                <th>PC Item Code</th>
                <th>Customer</th>
                <th>Product Name</th>
                <th>Product Description</th>
                <th>Box Qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((line) => (
                <tr key={line.production_plan_line_id} className={selected.includes(line.production_plan_line_id) ? 'is-selected' : ''}>
                  <td>
                    <input aria-label={`Select ${line.job_number || line.sales_order_number}`} type="checkbox" checked={selected.includes(line.production_plan_line_id)} onChange={() => toggle(line.production_plan_line_id)} />
                  </td>
                  <td>
                    <strong>{line.job_number || 'Not created'}</strong>
                  </td>
                  <td>
                    <span className={line.job_card_id ? 'created' : 'ready'}>{line.job_status || 'READY'}</span>
                  </td>
                  <td>{formatIstDate(line.plan_date)}</td>
                  <td>{line.plan_number}</td>
                  <td>
                    <strong>{line.sales_order_number}</strong>
                  </td>
                  <td>
                    <button className="job-card-specification-link" type="button" disabled={!line.specification_code} onClick={() => setViewingSpecification(line)}>
                      {line.specification_code || 'Not mapped'}
                    </button>
                  </td>
                  <td>{line.customer_name}</td>
                  <td className="job-cards-product">{line.product_name}</td>
                  <td className="job-cards-product">{line.item_description || line.item_name}</td>
                  <td className="numeric job-cards-box-qty">{numberText(line.production_quantity)}</td>
                </tr>
              ))}
              {!loading && !filtered.length && (
                <tr>
                  <td colSpan={11} className="job-cards-empty">
                    {view === 'ready' ? 'No Production Planned items are waiting for Job Cards.' : 'No Job Cards have been created.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={11} className="job-cards-empty">
                    Loading Production Planned items...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer>
          <span>{selected.length} selected</span>
          <span>{filtered.length} production items</span>
        </footer>
      </section>
      {viewingSpecification && <ProductSpecificationDialog line={viewingSpecification} onClose={() => setViewingSpecification(null)} />}
      <div className="job-card-print-area">
        {selectedLines
          .filter((line) => line.job_card_id)
          .map((line) => (
            <JobCard key={line.production_plan_line_id} line={line} />
          ))}
      </div>
    </div>
  );
}

function ProductSpecificationDialog({ line, onClose }: { line: JobCardLine; onClose: () => void }) {
  const attributes = readAttributes(line);
  const layers = attributes.paper_layers ?? [];
  const stages = attributes.production_stages ?? [];
  return (
    <div className="job-card-specification-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="job-card-specification-dialog" role="dialog" aria-modal="true" aria-labelledby="job-card-specification-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong id="job-card-specification-title">Product Specification</strong>
            <span>{line.specification_code}</span>
          </div>
          <button type="button" aria-label="Close Product Specification" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="job-card-specification-body">
          <dl className="job-card-specification-summary">
            <div>
              <dt>Customer</dt>
              <dd>{line.customer_name}</dd>
            </div>
            <div>
              <dt>Product Name</dt>
              <dd>{line.product_name || ''}</dd>
            </div>
            <div>
              <dt>Item</dt>
              <dd>{line.item_name}</dd>
            </div>
            <div>
              <dt>Design Type</dt>
              <dd>{line.product_type}</dd>
            </div>
            <div>
              <dt>Outer Dimensions (MM)</dt>
              <dd>{[line.length_mm, line.width_mm, line.height_mm].filter((value) => value != null).join(' X ')}</dd>
            </div>
            <div>
              <dt>Ply</dt>
              <dd>{line.ply ? `${line.ply} Ply` : ''}</dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{attributes.material || ''}</dd>
            </div>
            <div>
              <dt>Flute</dt>
              <dd>{attributes.flute_type || ''}</dd>
            </div>
            <div>
              <dt>Joint</dt>
              <dd>{attributes.joint_type || ''}</dd>
            </div>
            <div>
              <dt>Board Type</dt>
              <dd>{attributes.board_type || ''}</dd>
            </div>
            <div>
              <dt>Board / Creasing Allowance</dt>
              <dd>{attributes.board_creasing_allowance || ''}</dd>
            </div>
            <div>
              <dt>Print</dt>
              <dd>{line.print_required ? 'Required' : 'Not Required'}</dd>
            </div>
            <div>
              <dt>Print Colors</dt>
              <dd>{line.print_colors || ''}</dd>
            </div>
          </dl>
          <h3>Paper Composition</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Layer</th>
                <th>Paper Grade</th>
                <th>GSM</th>
                <th>BF / RCT</th>
                <th>Shade</th>
                <th>Flute</th>
                <th>Deckle Size</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer, index) => (
                <tr key={`${layer.layer_name}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{layer.layer_name}</td>
                  <td>{layer.paper_grade}</td>
                  <td>{layer.gsm}</td>
                  <td>{layer.bf_rct}</td>
                  <td>{layer.shade}</td>
                  <td>{layer.flute}</td>
                  <td>{layer.deckle_size}</td>
                </tr>
              ))}
              {!layers.length && (
                <tr>
                  <td colSpan={8}>Paper composition not available.</td>
                </tr>
              )}
            </tbody>
          </table>
          <h3>Production Stages</h3>
          <ol className="job-card-specification-stages">
            {stages.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
          {line.specification_notes && (
            <>
              <h3>Specification Notes</h3>
              <p className="job-card-specification-notes">{line.specification_notes}</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function JobCard({ line, processEditable = false, reelEditable = processEditable, supervisorReadOnly = false, defaultSupervisorName = '', savingProcessKey = '', savingFooterKey = '', onProcessValueChange, onProcessStatusChange, onFooterValueChange, inventoryReels = [], onReelSelect, onReelConsume }: { line: JobCardLine; processEditable?: boolean; reelEditable?: boolean; supervisorReadOnly?: boolean; defaultSupervisorName?: string; savingProcessKey?: string; savingFooterKey?: string; onProcessValueChange?: (processName: string, field: ProcessField, value: string) => void; onProcessStatusChange?: (processName: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED', processEntryId?: number) => void; onFooterValueChange?: (field: FooterField, value: string) => void; inventoryReels?: InventoryReel[]; onReelSelect?: (processName: string, reelSlot: 1 | 2, inventoryStockId: number) => void; onReelConsume?: (processName: string, reelSlot: 1 | 2, outReelWeight: string) => void }) {
  const attributes = readAttributes(line);
  const { layers, deckle, rotary, rotaryCalculation, slottingSize, boxWeight, bs } = calculated(line);
  const stages = attributes.production_stages ?? [];
  const processEntries = readProcessEntries(line);
  const size = [line.length_mm, line.width_mm, line.height_mm].filter((value) => value != null).join(' X ');
  const sizeCm = [line.length_mm, line.width_mm, line.height_mm]
    .filter((value) => value != null)
    .map((value) => numberText(Number(value) / 10))
    .join(' X ');
  const shades = [...new Set(layers.map((layer) => layer.shade).filter(Boolean))].join(' / ');
  const requiredPaperByLayer = layers.map((layer) => calculateRequiredPaperQuantity(deckle, rotary, layer.gsm, line.production_quantity, layer.flute));
  const totalRequiredPaperKg = requiredPaperByLayer.length > 0 && requiredPaperByLayer.every((value) => value != null) ? requiredPaperByLayer.reduce<number>((total, value) => total + Number(value), 0) : null;
  return (
    <article className="job-card-sheet">
      <header>
        <img className="job-card-logo" src="/assets/PC-Bord-Logo-only-transparent.png" alt="Polarcanvas" />
        <h1 className="job-card-heading">PRODUCTION JOB CARD</h1>
        <strong>Job Card: {line.job_number}</strong>
      </header>
      <table className="job-card-master">
        <colgroup>
          <col className="job-card-label-column" />
          <col className="job-card-value-column" />
          <col className="job-card-label-column" />
          <col className="job-card-value-column" />
          <col className="job-card-label-column" />
          <col className="job-card-value-column" />
          <col className="job-card-label-column" />
          <col className="job-card-value-column" />
        </colgroup>
        <tbody>
          <tr>
            <th>Job ID</th>
            <td>{line.job_number}</td>
            <th>PC Item Code</th>
            <td>{line.specification_code}</td>
            <th>Date</th>
            <td>{formatIstDate(line.plan_date)}</td>
            <th>Time</th>
            <td></td>
          </tr>
          <tr>
            <th>Customer Name</th>
            <td colSpan={3}>{line.customer_name}</td>
            <th>Printing</th>
            <td colSpan={3}>{line.print_required ? 'Printing Required' : 'No Printing'}</td>
          </tr>
          <tr>
            <th>Product Spec</th>
            <td colSpan={3}>{line.item_description || line.item_name}</td>
            <th>Joint</th>
            <td colSpan={3}>{attributes.joint_type || ''}</td>
          </tr>
          <tr>
            <th>No. of Color</th>
            <td>{line.print_colors || '0'}</td>
            <th>Color</th>
            <td>{line.print_colors || shades}</td>
            <th colSpan={4}></th>
          </tr>
          <tr>
            <th>No. of Ply</th>
            <td>{line.ply ? `${line.ply} Ply` : ''}</td>
            <th>Box Wt. (Kg)</th>
            <td>{boxWeight ? numberText(boxWeight / 1000) : ''}</td>
            <th>Lamination (Size)</th>
            <td></td>
            <th className="job-card-required-qty-label" rowSpan={3}>
              Req. Qty (Kg)
            </th>
            <td className="job-card-required-qty-value" rowSpan={3}>
              {numberText(totalRequiredPaperKg)}
            </td>
          </tr>
          <tr>
            <th>Box Size (OD)</th>
            <td colSpan={3}>{size ? `${size} mm | ${sizeCm} cm` : ''}</td>
            <th>Metpad (Size)</th>
            <td></td>
          </tr>
          <tr>
            <th>Sheet Size</th>
            <td colSpan={3}>{deckle && rotary ? `${numberText(deckle)} X ${numberText(rotary)} mm | ${numberText(deckle / 10)} X ${numberText(rotary / 10)} cm` : ''}</td>
            <th>Window (Size)</th>
            <td></td>
          </tr>
          <tr>
            <th>Rotary Size</th>
            <td colSpan={2}>{rotaryCalculation ? `${numberText(rotaryCalculation.topFlap)} + ${numberText(line.height_mm)} + ${numberText(rotaryCalculation.bottomFlap)} = ${numberText(rotary)} mm` : ''}</td>
            <th>BS</th>
            <td>{bs ? numberText(bs) : ''}</td>
            <th>UV / Dripoff / Varnish</th>
            <td colSpan={2}></td>
          </tr>
          <tr className="job-card-creasing-row">
            <td colSpan={8}>
              <dl className="job-card-creasing-summary">
                <div>
                  <dt>Slotting Size</dt>
                  <dd>{slottingSize == null ? '' : `${numberText(slottingSize)} mm`}</dd>
                </div>
                <div>
                  <dt>Board / Creasing Allowance</dt>
                  <dd>{attributes.board_creasing_allowance ? `${attributes.board_creasing_allowance} mm` : ''}</dd>
                </div>
                <div>
                  <dt>Adjusted Width</dt>
                  <dd>{rotaryCalculation ? `${numberText(rotaryCalculation.adjustedWidth)} mm` : ''}</dd>
                </div>
                <div>
                  <dt>Top Flap</dt>
                  <dd>{rotaryCalculation ? `${numberText(rotaryCalculation.topFlap)} mm` : ''}</dd>
                </div>
                <div>
                  <dt>Box Height</dt>
                  <dd>{rotaryCalculation ? `${numberText(line.height_mm)} mm` : ''}</dd>
                </div>
                <div>
                  <dt>Bottom Flap</dt>
                  <dd>{rotaryCalculation ? `${numberText(rotaryCalculation.bottomFlap)} mm` : ''}</dd>
                </div>
              </dl>
            </td>
          </tr>
          <tr>
            <th>Job Remarks</th>
            <td colSpan={3}>{line.plan_remarks || line.specification_notes}</td>
            <th>Die No.</th>
            <td></td>
            <th>Art Work No.</th>
            <td></td>
          </tr>
          <tr>
            <th>Box Qty</th>
            <td>{numberText(line.production_quantity)}</td>
            <th>Box/Board</th>
            <td>1.0</td>
            <th>Sales Order</th>
            <td>{line.sales_order_number}</td>
            <th>Delivery</th>
            <td>{formatIstDate(line.delivery_date)}</td>
          </tr>
          <tr>
            <th>Board Qty</th>
            <td>{numberText(line.production_quantity)}</td>
            <th>Paper Ups</th>
            <td>1</td>
            <th>Corr. Ups</th>
            <td>1</td>
            <th>Customer PO</th>
            <td>{line.customer_po_number}</td>
          </tr>
        </tbody>
      </table>
      <h2 className="job-card-heading">REQUIRED ITEM</h2>
      <table className="job-card-items">
        <colgroup>
          <col className="job-card-col-serial" />
          <col className="job-card-col-layer" />
          <col />
          <col />
          <col />
          <col className="job-card-col-small" />
          <col className="job-card-col-small" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>S.N</th>
            <th>Layers</th>
            <th>Size (MM)</th>
            <th>Req. Size (CM)</th>
            <th>Color</th>
            <th>GSM</th>
            <th>BF</th>
            <th>Qty (Kg)</th>
            <th>Board Qty</th>
          </tr>
        </thead>
        <tbody>
          {layers.map((layer, index) => (
            <tr key={`${layer.layer_name}-${index}`}>
              <td>{index + 1}</td>
              <td>{layer.layer_name}</td>
              <td>{deckle ? numberText(deckle) : ''}</td>
              <td>{deckle ? numberText(deckle / 10) : ''}</td>
              <td>{layer.shade}</td>
              <td>{layer.gsm}</td>
              <td>{layer.bf_rct}</td>
              <td>{numberText(calculateRequiredPaperQuantity(deckle, rotary, layer.gsm, line.production_quantity, layer.flute))}</td>
              <td>{!layer.flute ? numberText(line.production_quantity) : ''}</td>
            </tr>
          ))}
          {!layers.length && (
            <tr>
              <td colSpan={9}>Paper composition not available.</td>
            </tr>
          )}
          {layers.length > 0 && (
            <tr className="job-card-paper-total">
              <th colSpan={7}>Total Paper Required for {numberText(line.production_quantity)} Boxes</th>
              <td>{numberText(totalRequiredPaperKg)}</td>
              <td>Kg</td>
            </tr>
          )}
        </tbody>
      </table>
      <h2 className="job-card-heading">PROCESS</h2>
      {processEditable && <p className={`job-card-reel-guidance${line.job_status === 'COMPLETED' ? ' is-completed' : ''}`}>{line.job_status === 'COMPLETED' ? 'Inventory postings are complete and Reel details are locked.' : 'Reel consumption will be updated when its Process is completed. Reel details remain editable while the Process is Not Started or In Progress.'}</p>}
      <table className="job-card-process">
        <colgroup>
          <col className="job-card-col-serial" />
          <col className="job-card-col-process" />
          <col className="job-card-col-status" />
          <col className="job-card-col-time" />
          <col className="job-card-col-time" />
          <col className="job-card-col-reel" />
          <col className="job-card-col-weight" />
          <col className="job-card-col-weight" />
          <col className="job-card-col-weight" />
          <col className="job-card-col-weight" />
          <col className="job-card-col-qty" />
          <col className="job-card-col-qty" />
          <col className="job-card-col-employee" />
        </colgroup>
        <thead>
          <tr>
            <th>S.N</th>
            <th>Process</th>
            <th>Status</th>
            <th>Start Datetime</th>
            <th>End Datetime</th>
            <th>Reel No.</th>
            <th>Reel Weight</th>
            <th>Out Reel Weight</th>
            <th>Consumed Weight</th>
            <th>Remaining Reel Weight</th>
            <th>In Qty</th>
            <th>Out Qty</th>
            <th>Emp. Name</th>
          </tr>
        </thead>
        <tbody>
          {(stages.length ? stages : ['Paper Cutting', 'Corrugation', 'Pasting', 'Quality Inspection']).map((stage, index) => {
            const entry = processEntries.find((value) => value.process_name === stage);
            const processStatus = entry?.process_status ?? 'NOT_STARTED';
            const processCompleted = processStatus === 'COMPLETED';
            return (
              <tr key={stage} className={stage === 'Corrugation' ? 'job-card-corrugation-row' : ''}>
                <td>{index + 1}</td>
                <td className="job-card-process-name">
                  {stage === 'Board / Sheet Cutting' ? (
                    <>
                      Board / Sheet
                      <br />
                      Cutting
                    </>
                  ) : stage === 'Quality Inspection' ? (
                    <>
                      Quality
                      <br />
                      Inspection
                    </>
                  ) : stage === 'Bundling / Packing' ? (
                    <>
                      Bundling /<br />
                      Packing
                    </>
                  ) : (
                    stage
                  )}
                </td>
                <td>
                  {processEditable ? (
                    <select className={`job-card-process-status is-${processStatus.toLowerCase()}`} aria-label={`${stage} Process Status`} value={processStatus} disabled={processCompleted || savingProcessKey === `${stage}:process_status`} onChange={(event) => onProcessStatusChange?.(stage, event.target.value as 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED', entry?.process_entry_id)}>
                      <option value="NOT_STARTED">Not Started</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  ) : (
                    processStatus.replace('_', ' ')
                  )}
                </td>
                <td>
                  {processEditable ? (
                    <label className="job-card-datetime-control">
                      <span>{processDateTimeText(entry?.start_datetime) || 'Select'}</span>
                      <input aria-label={`${stage} Start Datetime`} type="datetime-local" value={entry?.start_datetime || ''} disabled={savingProcessKey === `${stage}:start_datetime`} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => onProcessValueChange?.(stage, 'start_datetime', event.target.value)} />
                    </label>
                  ) : (
                    processDateTimeText(entry?.start_datetime)
                  )}
                </td>
                <td>
                  {processEditable ? (
                    <label className="job-card-datetime-control">
                      <span>{processDateTimeText(entry?.end_datetime) || 'Select'}</span>
                      <input aria-label={`${stage} End Datetime`} type="datetime-local" value={entry?.end_datetime || ''} disabled={savingProcessKey === `${stage}:end_datetime`} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => onProcessValueChange?.(stage, 'end_datetime', event.target.value)} />
                    </label>
                  ) : (
                    processDateTimeText(entry?.end_datetime)
                  )}
                </td>
                <ReelDetailCell stage={stage} label="Reel Number" entry={entry} field="reel_number" secondField="reel_number_2" processEditable={processEditable} reelEditable={reelEditable} savingProcessKey={savingProcessKey} onChange={onProcessValueChange} inventoryReels={inventoryReels} onReelSelect={onReelSelect} onReelConsume={onReelConsume} />
                <ReelDetailCell stage={stage} label="In Reel Weight" entry={entry} field="in_reel_weight" secondField="in_reel_weight_2" numeric processEditable={processEditable} reelEditable={reelEditable} savingProcessKey={savingProcessKey} onChange={onProcessValueChange} inventoryReels={inventoryReels} onReelSelect={onReelSelect} onReelConsume={onReelConsume} />
                <ReelDetailCell stage={stage} label="Out Reel Weight" entry={entry} field="out_reel_weight" secondField="out_reel_weight_2" numeric processEditable={processEditable} reelEditable={reelEditable} savingProcessKey={savingProcessKey} onChange={onProcessValueChange} inventoryReels={inventoryReels} onReelSelect={onReelSelect} onReelConsume={onReelConsume} />
                <ReelDetailCell stage={stage} label="Consumed Reel Weight" entry={entry} field="out_reel_weight" secondField="out_reel_weight_2" numeric processEditable={processEditable} reelEditable={reelEditable} savingProcessKey={savingProcessKey} onChange={onProcessValueChange} inventoryReels={inventoryReels} onReelSelect={onReelSelect} onReelConsume={onReelConsume} />
                <ReelDetailCell stage={stage} label="Remaining Reel Weight" entry={entry} field="remaining_reel_weight" secondField="remaining_reel_weight_2" numeric processEditable={processEditable} reelEditable={reelEditable} savingProcessKey={savingProcessKey} onChange={onProcessValueChange} inventoryReels={inventoryReels} onReelSelect={onReelSelect} onReelConsume={onReelConsume} />
                <td className={stage === 'Corrugation' ? 'job-card-split-process-values' : ''}>
                  <div className={stage === 'Corrugation' ? 'job-card-process-entry-stack' : ''}>
                    {processEditable ? (
                      <>
                        <input key={`${stage}:in:${entry?.in_quantity ?? ''}`} className="job-card-process-entry" aria-label={`${stage} In Qty 1`} inputMode="decimal" defaultValue={entry?.in_quantity ?? ''} disabled={savingProcessKey === `${stage}:in_quantity`} onBlur={(event) => onProcessValueChange?.(stage, 'in_quantity', event.target.value)} />
                        {stage === 'Corrugation' && <input key={`${stage}:in2:${entry?.in_quantity_2 ?? ''}`} className="job-card-process-entry" aria-label="Corrugation In Qty 2" inputMode="decimal" defaultValue={entry?.in_quantity_2 ?? ''} disabled={savingProcessKey === `${stage}:in_quantity_2`} onBlur={(event) => onProcessValueChange?.(stage, 'in_quantity_2', event.target.value)} />}
                      </>
                    ) : (
                      <>
                        <span>{numberText(entry?.in_quantity)}</span>
                        {stage === 'Corrugation' && <span>{numberText(entry?.in_quantity_2)}</span>}
                      </>
                    )}
                  </div>
                </td>
                <td className={stage === 'Corrugation' ? 'job-card-split-process-values' : ''}>
                  <div className={stage === 'Corrugation' ? 'job-card-process-entry-stack' : ''}>
                    {processEditable ? (
                      <>
                        <input key={`${stage}:out:${entry?.out_quantity ?? ''}`} className="job-card-process-entry" aria-label={`${stage} Out Qty 1`} inputMode="decimal" defaultValue={entry?.out_quantity ?? ''} disabled={savingProcessKey === `${stage}:out_quantity`} onBlur={(event) => onProcessValueChange?.(stage, 'out_quantity', event.target.value)} />
                        {stage === 'Corrugation' && <input key={`${stage}:out2:${entry?.out_quantity_2 ?? ''}`} className="job-card-process-entry" aria-label="Corrugation Out Qty 2" inputMode="decimal" defaultValue={entry?.out_quantity_2 ?? ''} disabled={savingProcessKey === `${stage}:out_quantity_2`} onBlur={(event) => onProcessValueChange?.(stage, 'out_quantity_2', event.target.value)} />}
                      </>
                    ) : (
                      <>
                        <span>{numberText(entry?.out_quantity)}</span>
                        {stage === 'Corrugation' && <span>{numberText(entry?.out_quantity_2)}</span>}
                      </>
                    )}
                  </div>
                </td>
                <td className={stage === 'Corrugation' ? 'job-card-split-process-values' : ''}>
                  <div className={stage === 'Corrugation' ? 'job-card-process-entry-stack' : ''}>
                    {processEditable ? (
                      <>
                        <input key={`${stage}:employee:${entry?.employee_name ?? ''}`} className="job-card-process-entry" aria-label={`${stage} Employee Name 1`} maxLength={120} defaultValue={entry?.employee_name ?? ''} disabled={savingProcessKey === `${stage}:employee_name`} onBlur={(event) => onProcessValueChange?.(stage, 'employee_name', event.target.value)} />
                        {stage === 'Corrugation' && <input key={`${stage}:employee2:${entry?.employee_name_2 ?? ''}`} className="job-card-process-entry" aria-label="Corrugation Employee Name 2" maxLength={120} defaultValue={entry?.employee_name_2 ?? ''} disabled={savingProcessKey === `${stage}:employee_name_2`} onBlur={(event) => onProcessValueChange?.(stage, 'employee_name_2', event.target.value)} />}
                      </>
                    ) : (
                      <>
                        <span>{entry?.employee_name}</span>
                        {stage === 'Corrugation' && <span>{entry?.employee_name_2}</span>}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <footer>
        {(
          [
            ['supervisor_name', 'Supervisor', false],
            ['quality_name', 'Quality', false],
            ['dispatch_name', 'Dispatch', false],
            ['box_weight_kg', 'Box Wt. (Kg)', true],
            ['manufactured_quantity', 'Manufactured Qty', true],
          ] as const
        ).map(([field, label, numeric]) => (
          <label key={field}>
            <span>{label}</span>
            {field === 'supervisor_name' && supervisorReadOnly
              ? <input className="job-card-footer-entry" aria-label={label} value={line.supervisor_name || defaultSupervisorName} readOnly />
              : processEditable ? <input key={`${field}:${line[field] ?? ''}`} className="job-card-footer-entry" aria-label={label} inputMode={numeric ? 'decimal' : undefined} maxLength={numeric ? undefined : 120} defaultValue={line[field] ?? ''} disabled={savingFooterKey === field} onBlur={(event) => onFooterValueChange?.(field, event.target.value)} /> : <strong>{numeric ? numberText(line[field] as number | null | undefined) : line[field]}</strong>}
          </label>
        ))}
      </footer>
    </article>
  );
}
