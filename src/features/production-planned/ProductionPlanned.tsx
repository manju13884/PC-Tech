import { formatLayerGsm } from '../production-planning/paperLayerDisplay';
import { isTwoPlyRoll, twoPlyRollLayers } from '../production-planning/twoPlyRollComposition';
import { Factory, FilterX, Printer, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatIstDate } from "../../utils/dateTimeFormatting";
import { calculateTwoPlyQuantity } from "../production-planning/productionPlanningCalculations";
import { calculatedCutLengthCm } from "../production-planning/cutLength";
import "../production-planning/production-planning.css";
import "./production-planned.css";

interface PaperLayer {
  layer_name?: string;
  gsm?: string;
  shade?: string;
  bf_rct?: string;
  deckle_size?: string;
  flute?: string;
}
interface SavedPlanLine {
  id: number;
  plan_id: number;
  plan_number: string;
  plan_date: string;
  plan_status: string;
  customer_name: string;
  sales_order_number: string;
  delivery_date: string;
  item_name: string;
  item_description: string;
  production_quantity: number;
  two_ply_quantity: number | null;
  deckle_size: string;
  cut_length_cm: number | null;
  uom: string;
  product_type: string;
  ply: number | null;
  specification_code: string;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  attributes_json: string;
}

const numberText = (value: number | null) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const attributes = (line: SavedPlanLine): { paper_layers?: PaperLayer[] } => {
  try {
    return JSON.parse(line.attributes_json || "{}") as {
      paper_layers?: PaperLayer[];
    };
  } catch {
    return {};
  }
};
const layerForFlute = (layers: PaperLayer[], flute: string) =>
  layers.find((layer) => layer.flute === flute);
const linerAfterFlute = (layers: PaperLayer[], flute: string) => {
  const index = layers.findIndex((layer) => layer.flute === flute);
  return index >= 0
    ? layers.slice(index + 1).find((layer) => !layer.flute)
    : undefined;
};
const cell = (layer: PaperLayer | undefined, key: "gsm" | "bf_rct") =>
  layer?.[key] || "—";
const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const relativeDateIso = (days: number) => {
  const date = new Date(`${todayIso()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
type ProductionView =
  "all" | "planned" | "draft" | "closed" | "yesterday" | "today" | "tomorrow" | "custom";
const productionViewLabels: Record<ProductionView, string> = {
  all: "All Statuses",
  planned: "PLANNED",
  draft: "DRAFT",
  closed: "CLOSED",
  yesterday: "Yesterday's Production",
  today: "Today's Production",
  tomorrow: "Tomorrow's Production",
  custom: "Custom Date Production",
};

const GridColumns = () => (
  <colgroup>
    <col className="col-serial" />
    <col className="col-order-number" />
    <col className="col-code" />
    <col className="col-customer" />
    <col className="col-date" />
    <col className="col-date" />
    <col className="col-quantity" />
    <col className="col-quantity" />
    <col className="col-quantity" />
    <col className="col-status" />
    <col className="col-description" />
    <col className="col-dimension" />
    <col className="col-dimension" />
    <col className="col-dimension" />
    <col className="col-product-type" />
    <col className="col-ply" />
    <col className="col-flute-run" />
    <col className="col-machine" />
    <col className="col-machine" />
    {Array.from({ length: 12 }, (_, index) => (
      <col className={`col-paper ${[0, 2, 4, 6, 8, 9, 11].includes(index) ? 'col-paper-gsm' : 'col-paper-bf'}`} key={index} />
    ))}
    <col className="production-plan-actions-column" />
  </colgroup>
);
const GridHeader = () => (
  <thead>
    <tr className="production-grid-groups">
      <th rowSpan={2}>Sl. No.</th>
      <th className="group-order" colSpan={2}>
        Order &amp; Item
      </th>
      <th className="group-product">Customer</th>
      <th className="group-production" colSpan={2}>
        Schedule
      </th>
      <th className="group-production" colSpan={4}>
        Production
      </th>
      <th className="group-product">Product</th>
      <th className="group-construction" colSpan={5}>
        Outer Dimensions (OD) in mm &amp; Construction
      </th>
      <th className="group-machine" colSpan={3}>
        Machine Setup
      </th>
      <th className="group-paper" colSpan={12}>
        Paper Composition
      </th>
      <th className="production-plan-actions-column" rowSpan={2}>Actions</th>
    </tr>
    <tr className="production-grid-columns">
      <th>Sales Order</th>
      <th>PC Item Code</th>
      <th>Customer</th>
      <th>Production Date</th>
      <th>Delivery Date</th>
      <th>Box Qty</th>
      <th>Top Sheet</th>
      <th>2 Ply Qty</th>
      <th>Status</th>
      <th>Product Description</th>
      <th>L</th>
      <th>W</th>
      <th>H</th>
      <th>
        Product
        <br />
        Type
      </th>
      <th>Ply</th>
      <th>
        Flute
        <br />
        Run
      </th>
      <th>Deckle Size<br />(CM)</th>
      <th>Cut Length (CM)</th>
      <th>Top GSM (G/N)</th>
      <th>Top BF</th>
      <th>B Flute GSM (G/N)</th>
      <th>B Flute BF</th>
      <th>B Liner GSM (G/N)</th>
      <th>B Liner BF</th>
      <th>A Flute GSM (G/N)</th>
      <th>A Flute BF</th>
      <th>A Liner GSM (G/N)</th>
      <th>C Flute GSM (G/N)</th>
      <th>C Flute BF</th>
      <th>C Liner GSM (G/N)</th>
    </tr>
  </thead>
);

export default function ProductionPlanned() {
  const [lines, setLines] = useState<SavedPlanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [productionView, setProductionView] = useState<ProductionView>("all");
  const [customFromDate, setCustomFromDate] = useState("");
  const [customToDate, setCustomToDate] = useState("");
  const [unplanTarget, setUnplanTarget] = useState<SavedPlanLine | null>(null);
  const [unplanning, setUnplanning] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [linkedJobCards, setLinkedJobCards] = useState<Array<{ id:number; jobNumber:string }>>([]);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/production-plans?view=lines", {
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as {
        lines?: SavedPlanLine[];
        error?: string;
      };
      if (response.status === 401)
        window.dispatchEvent(new Event("pc-tech-session-expired"));
      if (!response.ok)
        throw new Error(data.error || "Unable to load saved Production Plans.");
      setLines(Array.isArray(data.lines) ? data.lines : []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load saved Production Plans.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const unplan = async () => {
    if (!unplanTarget) return;
    setUnplanning(true);
    setError("");
    setSuccessMessage("");
    try {
      const response = await fetch(`/api/production-plans?line_id=${unplanTarget.id}${linkedJobCards.length ? "&remove_job_cards=true" : ""}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (response.status === 401) window.dispatchEvent(new Event("pc-tech-session-expired"));
      if (!response.ok) throw new Error(data.error || "Unable to unplan the Production activity.");
      setUnplanTarget(null);
      setLinkedJobCards([]);
      setSuccessMessage(data.message || "Production activity unplanned successfully.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to unplan the Production activity.");
    } finally {
      setUnplanning(false);
    }
  };
  const prepareUnplan = async (line: SavedPlanLine) => {
    setError("");
    const response = await fetch(`/api/production-plans?view=unplan&line_id=${line.id}`, { credentials:"include" });
    const data = (await response.json().catch(() => ({}))) as { error?:string; jobCards?:Array<{ id:number;jobNumber:string;status:string;hasTransactions:boolean }> };
    if (!response.ok) { setError(data.error || "Unable to inspect the Production activity."); return; }
    const active = data.jobCards?.find((card) => card.status === "IN_PROGRESS");
    if (active) { setError(`Job Card ${active.jobNumber} has active Job Tracking. Cancel Job Tracking before unplanning this production activity.`); return; }
    const protectedCard = data.jobCards?.find((card) => card.status === "COMPLETED" || card.hasTransactions);
    if (protectedCard) { setError(`This production activity cannot be unplanned because Job Card ${protectedCard.jobNumber} contains production/inventory transactions. Reverse the related production activity before unplanning.`); return; }
    setLinkedJobCards((data.jobCards ?? []).map(({ id,jobNumber }) => ({ id,jobNumber })));
    setUnplanTarget(line);
  };
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lines.filter((line) => {
      const matchesView =
        productionView === "all" ||
        (productionView === "planned" && line.plan_status === "PLANNED") ||
        (productionView === "draft" && line.plan_status === "DRAFT") ||
        (productionView === "closed" && line.plan_status === "CLOSED") ||
        (productionView === "yesterday" &&
          line.plan_date === relativeDateIso(-1)) ||
        (productionView === "today" && line.plan_date === todayIso()) ||
        (productionView === "tomorrow" &&
          line.plan_date === relativeDateIso(1)) ||
        (productionView === "custom" &&
          Boolean(customFromDate || customToDate) &&
          (!customFromDate || line.plan_date >= customFromDate) &&
          (!customToDate || line.plan_date <= customToDate));
      return (
        matchesView &&
        (!term ||
          `${line.plan_number} ${line.sales_order_number} ${line.specification_code} ${line.customer_name} ${line.item_description}`
            .toLowerCase()
            .includes(term))
      );
    });
  }, [customFromDate, customToDate, lines, productionView, search]);
  const printFilterLabel =
    productionView === "custom"
      ? [
          customFromDate &&
            `From ${formatIstDate(customFromDate, "DD-MMM-YYYY")}`,
          customToDate && `To ${formatIstDate(customToDate, "DD-MMM-YYYY")}`,
        ]
          .filter(Boolean)
          .join(" - ") || productionViewLabels.custom
      : productionViewLabels[productionView];
  const printUnavailableReason =
    filtered.length === 0
      ? "No production lines are available to print"
      : "Print or save the displayed production lines as PDF";
  const printProductionPlan = () => {
    const productionDates = [...new Set(filtered.map((line) => line.plan_date).filter(Boolean))].sort();
    const firstDate = productionDates[0]
      ? formatIstDate(productionDates[0], "DD-MMM-YYYY")
      : "Undated";
    const finalProductionDate = productionDates[productionDates.length - 1];
    const lastDate = finalProductionDate
      ? formatIstDate(finalProductionDate, "DD-MMM-YYYY")
      : firstDate;
    const previousTitle = document.title;
    document.title = productionDates.length > 1
      ? `Production-Planned-${firstDate}-to-${lastDate}`
      : `Production-Planned-${firstDate}`;
    document.body.classList.add("printing-production-planned");
    // Override other reports' default portrait rules for this print dialog only.
    const printPageStyle = document.createElement("style");
    printPageStyle.media = "print";
    printPageStyle.textContent = "@page { size: A4 landscape; margin: 0; } @page production-planned-landscape { size: A4 landscape; margin: 0; }";
    document.head.appendChild(printPageStyle);
    const cleanup = () => {
      printPageStyle.remove();
      document.body.classList.remove("printing-production-planned");
      document.title = previousTitle;
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    try {
      window.print();
    } catch (error) {
      window.removeEventListener("afterprint", cleanup);
      cleanup();
      throw error;
    }
  };

  return (
    <div className="production-planning-workspace production-planned-workspace">
      {error && (
        <p className="production-planning-message is-error" role="alert">
          {error}
          <button type="button" onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </p>
      )}
      {successMessage && (
        <p className="production-planning-message is-success" role="status">{successMessage}</p>
      )}
      <div className="production-planned-toolbar">
        <div className="production-planned-title">
          <Factory size={15} />
          <strong>Sales Orders for Production</strong>
          <span>
            {new Set(filtered.map((line) => line.plan_id)).size} plans /{" "}
            {filtered.length} lines
          </span>
        </div>
        <div className="production-planned-controls">
          <input
            aria-label="Search saved production plans"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search plan, SO, customer, item"
          />
          <select
            aria-label="Production view"
            value={productionView}
            onChange={(event) =>
              setProductionView(event.target.value as ProductionView)
            }
          >
            <option value="all">All Statuses</option>
            <option value="planned">PLANNED</option>
            <option value="draft">DRAFT</option>
            <option value="closed">CLOSED</option>
            <option value="yesterday">Yesterday's Production</option>
            <option value="today">Today's Production</option>
            <option value="tomorrow">Tomorrow's Production</option>
            <option value="custom">Custom Date Production</option>
          </select>
          {productionView === "custom" && (
            <div className="production-planned-date-range">
              <label>
                <span>From</span>
                <b>{formatIstDate(customFromDate, "DD-MMM-YYYY")}</b>
                <input
                  aria-label="Production from date"
                  type="date"
                  value={customFromDate}
                  max={customToDate || undefined}
                  onClick={(event) => event.currentTarget.showPicker?.()}
                  onChange={(event) => setCustomFromDate(event.target.value)}
                />
              </label>
              <label>
                <span>To</span>
                <b>{formatIstDate(customToDate, "DD-MMM-YYYY")}</b>
                <input
                  aria-label="Production to date"
                  type="date"
                  value={customToDate}
                  min={customFromDate || undefined}
                  onClick={(event) => event.currentTarget.showPicker?.()}
                  onChange={(event) => setCustomToDate(event.target.value)}
                />
              </label>
            </div>
          )}
          <button
            type="button"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={() => {
              setSearch("");
              setProductionView("all");
              setCustomFromDate("");
              setCustomToDate("");
            }}
          >
            <FilterX size={14} />
          </button>
          <button
            type="button"
            aria-label="Refresh production plans"
            title="Refresh"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={14} />
          </button>
          <button
            className="production-planned-print"
            type="button"
            title={printUnavailableReason}
            disabled={filtered.length === 0}
            onClick={printProductionPlan}
          >
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>
      <section className="production-selection-panel production-planned-grid-panel production-planned-print-area production-planned-print-page">
        <header className="production-planned-print-heading">
          <img src="/assets/PC-Bord-Logo-only-transparent.png" alt="PolarCanvas" />
          <h1>Production Planned</h1>
          <p>
            {printFilterLabel} | {filtered.length} production lines
          </p>
        </header>
        <div className="production-order-table-wrap production-lines-scroll">
          <table className="production-planning-grid">
            <GridColumns />
            <GridHeader />
            <tbody>
              {filtered.map((line, index) => {
                const layers = attributes(line).paper_layers ?? [];
                const twoPlyRoll = isTwoPlyRoll(line.item_name, line.item_description, line.product_type);
                const rollLayers = twoPlyRollLayers(layers);
                const top = twoPlyRoll ? rollLayers.top : layers.find((layer) => !layer.flute),
                  bFlute = twoPlyRoll ? rollLayers.flute : layerForFlute(layers, "B"),
                  bLiner = twoPlyRoll ? undefined : linerAfterFlute(layers, "B");
                const aFlute = twoPlyRoll ? undefined : layerForFlute(layers, "A"),
                  aLiner = twoPlyRoll ? undefined : linerAfterFlute(layers, "A"),
                  cFlute = twoPlyRoll ? undefined : layerForFlute(layers, "C"),
                  cLiner = twoPlyRoll ? undefined : linerAfterFlute(layers, "C");
                const fluteRun =
                  layers
                    .filter((layer) => layer.flute)
                    .map((layer) => layer.flute)
                    .join(" + ") || "—";
                const deckleSource =
                  line.deckle_size ||
                  layers.find((layer) => layer.deckle_size)?.deckle_size ||
                  (line.width_mm != null && line.height_mm != null
                    ? String(line.width_mm + line.height_mm + 20)
                    : numberText(line.width_mm));
                const deckleMm = deckleSource === "—" || deckleSource === "" ? Number.NaN : Number(deckleSource);
                const deckle = Number.isFinite(deckleMm) ? numberText(deckleMm / 10) : "—";
                const cutLengthCm = line.cut_length_cm ?? calculatedCutLengthCm(line.length_mm, line.width_mm);
                const twoPly =
                  line.two_ply_quantity ??
                  calculateTwoPlyQuantity(line.production_quantity, line.ply);
                return (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td title={`Plan ${line.plan_number}`}>
                      <strong>{line.sales_order_number}</strong>
                      <small>{line.plan_number}</small>
                    </td>
                    <td>{line.specification_code || "—"}</td>
                    <td>{line.customer_name}</td>
                    <td>{formatIstDate(line.plan_date)}</td>
                    <td>{formatIstDate(line.delivery_date)}</td>
                    <td className="numeric">
                      {numberText(line.production_quantity)}
                    </td>
                    <td className="numeric">
                      {numberText(line.production_quantity)}
                    </td>
                    <td className="numeric">{numberText(twoPly)}</td>
                    <td>
                      <span className={`production-status is-${line.plan_status.toLowerCase().replace(/_/g, "-")}`}>
                        {line.plan_status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="production-description">
                      {line.item_description || line.item_name}
                    </td>
                    <td className="numeric">{numberText(line.length_mm)}</td>
                    <td className="numeric">{numberText(line.width_mm)}</td>
                    <td className="numeric">{numberText(line.height_mm)}</td>
                    <td>{line.product_type || "—"}</td>
                    <td>{line.ply ? `${line.ply} Ply` : "—"}</td>
                    <td>{fluteRun}</td>
                    <td>{deckle}</td>
                    <td className="numeric">{numberText(cutLengthCm)}</td>
                    {twoPlyRoll ? <td colSpan={12} className="two-ply-roll-composition"><div>
                      <span><b>Top GSM</b>{formatLayerGsm(top)}</span><span><b>Top BF</b>{cell(top, "bf_rct")}</span>
                      <span><b>Flute GSM</b>{formatLayerGsm(bFlute)}</span><span><b>Flute BF</b>{cell(bFlute, "bf_rct")}</span>
                    </div></td> : <>
                      <td>{formatLayerGsm(top)}</td><td>{cell(top, "bf_rct")}</td>
                      <td>{formatLayerGsm(bFlute)}</td><td>{cell(bFlute, "bf_rct")}</td><td>{formatLayerGsm(bLiner)}</td><td>{cell(bLiner, "bf_rct")}</td>
                      <td>{formatLayerGsm(aFlute)}</td><td>{cell(aFlute, "bf_rct")}</td><td>{formatLayerGsm(aLiner)}</td>
                      <td>{formatLayerGsm(cFlute)}</td><td>{cell(cFlute, "bf_rct")}</td><td>{formatLayerGsm(cLiner)}</td>
                    </>}
                    <td className="production-plan-actions-cell">
                      {(line.plan_status === "PLANNED" || line.plan_status === "DRAFT") && (
                        <button type="button" onClick={() => void prepareUnplan(line)}>
                          <Undo2 size={12} /> Unplan
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={32} className="production-planning-empty">
                    No saved Production Plans found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={32} className="production-planning-empty">
                    Loading saved Production Plans...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer>
          <span>
            {new Set(filtered.map((line) => line.plan_id)).size} plans ·{" "}
            {filtered.length} production lines
          </span>
        </footer>
      </section>
      {unplanTarget && (
        <div className="production-unplan-backdrop" role="presentation">
          <section className="production-unplan-dialog" role="dialog" aria-modal="true" aria-labelledby="production-unplan-title">
            <h2 id="production-unplan-title">{linkedJobCards.length ? `${linkedJobCards.length} Job Card${linkedJobCards.length === 1 ? " is" : "s are"} linked to this production activity.` : "Unplan this production activity?"}</h2>
            {linkedJobCards.length ? <><p>{linkedJobCards.map((card) => card.jobNumber).join(", ")}</p><p>Continuing will remove {linkedJobCards.length === 1 ? "this Job Card" : "these Job Cards"}, release the linkage, and unplan the production activity.</p></> : <p>The activity will be removed from Production Planned and the corresponding SO/item will become available again for Production Planning.</p>}
            <div>
              <button type="button" disabled={unplanning} onClick={() => { setUnplanTarget(null); setLinkedJobCards([]); }}>Cancel</button>
              <button type="button" disabled={unplanning} onClick={() => void unplan()}>{unplanning ? "Unplanning..." : linkedJobCards.length === 1 ? "Remove Job Card & Unplan" : linkedJobCards.length > 1 ? "Remove Job Cards & Unplan" : "Unplan"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
