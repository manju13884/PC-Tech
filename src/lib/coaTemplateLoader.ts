const COA_TEMPLATE_PATH = '/templates/COA.docx'

export async function loadCoaTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(COA_TEMPLATE_PATH)

  if (!response.ok) {
    throw new Error(`COA template not found at ${COA_TEMPLATE_PATH}`)
  }

  const template = await response.arrayBuffer()
  const signature = new Uint8Array(template.slice(0, 2))

  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error(`COA template not found at ${COA_TEMPLATE_PATH}`)
  }

  return template
}
