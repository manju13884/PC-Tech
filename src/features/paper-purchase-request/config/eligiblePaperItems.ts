import type {
  EligiblePaperItem,
  PaperItemEligibility,
} from '../types/paperPurchaseRequest'

export const PAPER_COST_ELIGIBLE_ITEMS: Readonly<Record<string, EligiblePaperItem>> = Object.freeze({
  '898884000000028106': { name: '3 ply corrugated Plain Board', productType: 'BOARD', defaultPly: 3 },
  '898884000000029106': { name: '3 ply Carton Box', productType: 'BOX', defaultPly: 3 },
  '898884000000030043': { name: '5 Ply Carton Box', productType: 'BOX', defaultPly: 5 },
  '898884000000033408': { name: '3 ply Corrugated Board', productType: 'BOARD', defaultPly: 3 },
  '898884000000281023': { name: '3 ply Carton Box - Top Opening', productType: 'BOX', defaultPly: 3 },
  '898884000000281032': { name: '3 ply Carton Box - Side Opening', productType: 'BOX', defaultPly: 3 },
  '898884000000297157': { name: '7 Ply Carton Box', productType: 'BOX', defaultPly: 7 },
  '898884000002063003': { name: '3 ply corrugated box', productType: 'BOX', defaultPly: 3 },
  '898884000002278057': { name: '5 ply corrugated Board', productType: 'BOARD', defaultPly: 5 },
  '898884000003946017': { name: '7 ply Sheet', productType: 'SHEET', defaultPly: 7 },
  '898884000004987235': { name: '2 ply Sheets', productType: 'SHEET', defaultPly: 2 },
  '898884000005603280': { name: '9 Ply Corrugated Box', productType: 'BOX', defaultPly: 9 },
  '898884000007386003': { name: '3 Ply Creased Board', productType: 'BOARD', defaultPly: 3 },
})

export const PAPER_COST_EXCLUDED_ITEM_IDS = Object.freeze({
  TEN_PLY_BOX: '898884000004139001',
  TWO_PLY_ROLL: '898884000000085971',
})

export function getPaperItemEligibility(itemId: string): PaperItemEligibility {
  const configuration = PAPER_COST_ELIGIBLE_ITEMS[itemId]
  if (configuration) {
    return {
      eligible: true,
      reason: 'eligible',
      configuration,
      message: 'Eligible for Paper Cost Estimation',
    }
  }

  if (itemId === PAPER_COST_EXCLUDED_ITEM_IDS.TEN_PLY_BOX) {
    return {
      eligible: false,
      reason: 'ten-ply',
      message: 'Paper Cost Estimation is not available for 10-ply products.',
    }
  }

  if (itemId === PAPER_COST_EXCLUDED_ITEM_IDS.TWO_PLY_ROLL) {
    return {
      eligible: false,
      reason: 'roll',
      message: 'Paper Cost Estimation is not available for Roll products.',
    }
  }

  return {
    eligible: false,
    reason: 'not-approved',
    message: 'Paper Cost Estimation is not applicable for the selected Sales Order item.',
  }
}
