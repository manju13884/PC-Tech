# Partition Calculator

Open **Calculators → Partition Calculator**. The existing menu permission flow applies; SUPERADMIN receives access automatically. The calculator runs entirely in the browser and does not save records or require database migrations.

Choose 3, 5 or 7 Ply and enter Outer Length/Width/Height, Cell Internal Length/Width, finished Partition Thickness and Length/Width Side Projection, in millimetres. Outer dimensions include the complete projected strip spans. Each projection is **per side**, applied twice, and can be zero. Thickness is required, positive and independent of ply. 5 Ply is selected by default and restored by Reset. Quantity defaults to 500 complete sets.

For each direction, `outer = N * cell + (N + 1) * thickness + 2 * projection`. Therefore `N = (outer - thickness - 2 * projection) / (cell + thickness)`. Decimal integer arithmetic requires an exact positive whole count; no flooring or automatic input changes occur. Non-exact inputs show the raw count, nearest whole count, resulting actual cell size and reconstructed-minus-entered outer dimensional difference. Manufacturing counts and costing remain empty until the configuration is exact. The preview is diagnostic only.

Actual clear size is `(outer - (N + 1) * thickness - 2 * projection) / N`. The dimensional breakdown shows both projections and every perimeter/intermediate strip, with a compact multiplication form for large grids.

Strip Group A spans Outer Length and has `cellsWidth + 1` strips. Group B spans Outer Width and has `cellsLength + 1` strips. Both groups include perimeter strips, including for 1 by 1 or one-row configurations. Purchased area uses the complete outer span times height for every strip, converting millimetres to metres. Projections are already included in outer size and are not added again.

**Construction Details** groups the actual partition thickness with slot width and depth. Slot width defaults to thickness; slot depth defaults to half the outer height. Both remain editable, retain manual overrides when source dimensions change, and have independent **Reset to Auto** actions. Slot width must be positive; slot depth must be positive and no greater than the outer height. Slot overrides do not change the grid, purchased paper area or pricing formulas.

Every Group A strip has one slot per Group B strip, and vice versa. A 4 by 3 grid has 12 cells and 9 strips: 4 in Group A with 5 slots each, and 5 in Group B with 4 slots each.

The paper grid keeps separate settings for each layer when changing ply. Shared Advanced Paper Weight constants supply B (1.36), C (1.43), A (1.45), and the initial 5% wastage. E has no default draw ratio and requires a configured value. All flute ratios remain editable. GSM, BF and shade describe each paper layer; GSM, flute draw ratio and paper rate determine its weight and cost. BF and shade do not independently change cost.

Base board area excludes wastage. Final board area is base area × (1 + wastage / 100). Paper weights and material costs include wastage exactly once. Area-based conversion uses final board area (including wastage); set-based conversion uses the number of complete sets. A zero conversion rate omits conversion charges. Slot cut-outs are not subtracted from purchased paper area.

Markup multiplies cost by `1 + percent / 100`. Margin divides cost by `1 − percent / 100` and must stay below 100%. Calculations retain full precision; only displayed values are rounded.

## Validation

- `node --experimental-strip-types --test tests/partitionCalculator.test.ts`
- `node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs`
- `python tests/productionToLocal.test.py`
- `npm run build`

Mandatory drawing regression: outer 370 by 340 mm, requested cells 72 by 92 mm, thickness 8 mm and projections 21/16 mm yield exactly 4 by 3 cells and 9 strips. Reconstructed dimensions are `4 * 72 + 5 * 8 + 2 * 21 = 370` and `3 * 92 + 4 * 8 + 2 * 16 = 340`. At height 150 mm, net board area is 0.477 square metres per set. With 5% wastage, 3 Ply, 120 GSM per layer, B flute and rate 33/kg, paper weight is 0.20194272 kg/set and material cost is 6.66410976/set.

The page reuses Board Calculator containers, sections, fields, calculated-input treatment, tables and buttons, together with the existing ERP segmented buttons. Desktop configuration uses four columns, with tablet/mobile breakpoints inherited from the calculator layout. The eight key results remain visible; detailed totals can be expanded below them.


## Live construction drawing

Partition Drawing follows Cell Configuration. Its responsive SVG top view shows the full projected spans, perimeter and intermediate strips, numbered clear cells, outside dimensions and one representative clear opening, thickness and projection dimension. Group A runs horizontally across Outer Length; Group B runs vertically across Outer Width. The smaller side views expose opposing slots in one strip from each group, using the entered height and active slot width/depth overrides.

The calculation engine returns a shared `PartitionGeometry` for the UI and costing. Engine-generated drawing coordinates use a common proportional scale; the SVG does not infer counts or physical dimensions. SVG patterns represent large strip counts without allocating a node per strip. Cell numbering is suppressed above 100 cells or when openings become too small. The drawing remains available when geometry is valid but paper/rate inputs are incomplete.

Only exact, valid geometry is drawn. Non-exact inputs show DIMENSION MISMATCH, requested and nearest-layout actual cell sizes, and cell-size differences. The existing fit preview also reports the outer dimensional differences. Invalid dimensions or slots show the valid-input prompt. No manufacturing inputs are silently altered. The expandable breakdown includes both the additive and simplified reconstruction. Print CSS keeps each SVG intact on a white background; no PDF-generation feature is added.


The compact ERP presentation uses 33px controls, shortened input labels, neutral read-only data rows and a six-column cell configuration summary. Paper composition includes per-set weight and cost from the existing calculation result. Final totals use a two-column list, while full order/layer details remain expandable. Drawing annotations use concise engineering labels and the match indicator sits beside the section title. These presentation changes do not change formulas or drawing coordinates.


Costing defaults to **Per KG** conversion and **Margin %** pricing (also restored by Reset). Per KG conversion uses the full-precision paper weight including wastage; per-square-metre conversion retains final board area including wastage; per-set conversion uses complete set quantity. The rate label and summary units follow the selected basis. Margin divides total cost by `1 - percent / 100`; markup multiplies by `1 + percent / 100`. Only displayed values are rounded.


## Save as PDF

The summary action downloads an A4 portrait technical sheet when geometry, paper composition and costing are valid. Include Costing in PDF defaults to on. Turning it off builds a technical-only document model that excludes all commercial fields, including paper rates, conversion, margin/markup and prices. Both modes include drawings, dimensions, strip/cell counts, paper specifications and material quantities.

The export uses the current calculation snapshot and the same screen SVG component. Existing SVG paint patterns are expanded to vector rectangles for reliable PDF rendering; no raster capture or second geometric calculation is used. An exceptionally dense grid above 50,000 repeated SVG paint tiles reports an export error instead of creating an incomplete drawing. Export libraries load on demand. Currency is explicitly labelled INR in the PDF using its standard document font.

The two-page sheet contains company/title, the existing signed-in display name supplied by Dashboard, IST date/time, dynamic dimension checks, and numbered confidentiality footers. Filenames follow `Partition_<Ply>Ply_<L>X<W>X<H>_<YYYYMMDD>.pdf`. The document does not save records or require API/database changes.


The final screen layout places the title and ply selector on one desktop row. Partition Details uses three four-column rows: outer dimensions/quantity; clear cell dimensions/thickness/wastage; projections/slot dimensions. First-load validation is quiet until fields are edited; calculation validation and export eligibility are unchanged. Strip details remain expandable, the financial summary exposes order cost/selling/profit, and the PDF action bar is at the bottom. On narrow screens the paper grid scrolls locally, without horizontal page scrolling.

## Shared calculator defaults

Opening a calculator loads the saved Master Data values before rendering its inputs. Partition uses Paper Price for every layer, Wastage, and Margin; choosing Markup loads the saved Markup value. Reset restores the loaded defaults. Local calculator edits do not update Master Data. Transport is used by the Box and Board calculators where an existing transport charge applies. Calculator access permits reading these defaults without granting Master Data edit access.
