const PACKING_SLIP_TEMPLATE_PATH = '/templates/PackingSlip.docx'
const PACKING_SLIP_LOGO_PATH = '/assets/PC-Bord-Logo-only-transparent.png'

export async function loadPackingSlipTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(PACKING_SLIP_TEMPLATE_PATH)

  if (!response.ok) {
    throw new Error(`Packing Slip template not found at ${PACKING_SLIP_TEMPLATE_PATH}`)
  }

  const template = await response.arrayBuffer()
  const signature = new Uint8Array(template.slice(0, 2))

  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error(`Packing Slip template not found at ${PACKING_SLIP_TEMPLATE_PATH}`)
  }

  return template
}

export async function loadPackingSlipLogo(): Promise<ArrayBuffer> {
  const response = await fetch(PACKING_SLIP_LOGO_PATH)

  if (!response.ok) {
    throw new Error(`Packing Slip logo not found at ${PACKING_SLIP_LOGO_PATH}`)
  }

  return response.arrayBuffer()
}
