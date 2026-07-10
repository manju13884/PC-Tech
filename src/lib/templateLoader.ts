import { COC_TEMPLATE } from '../config/cocTemplate'

export async function loadCocTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(COC_TEMPLATE.filePath)

  if (!response.ok) {
    throw new Error(`COC template not found at ${COC_TEMPLATE.filePath}`)
  }

  const template = await response.arrayBuffer()
  const signature = new Uint8Array(template.slice(0, 2))

  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error(`COC template not found at ${COC_TEMPLATE.filePath}`)
  }

  return template
}
