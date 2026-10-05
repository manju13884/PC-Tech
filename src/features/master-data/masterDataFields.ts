export const masterDataFields = [
  { name: 'maximumMachineDeckle', key: 'maximum-machine-deckle', label: 'Maximum Machine Deckle (CM) *', defaultValue: '' },
  { name: 'paperPrice', key: 'paper-price', label: 'Paper Price', defaultValue: '37' },
  { name: 'wastage', key: 'wastage', label: 'Wastage (%)', defaultValue: '6' },
  { name: 'margin', key: 'margin', label: 'Margin (%)', defaultValue: '12' },
  { name: 'markup', key: 'markup', label: 'Markup', defaultValue: '12' },
  { name: 'transport', key: 'transport', label: 'Transport', defaultValue: '1' },
  { name: 'ratePerKg', key: 'rate-per-kg', label: 'Rate/KG', defaultValue: '12' },
  { name: 'printing', key: 'printing', label: 'Printing', defaultValue: '2' },
] as const

export type MasterDataValues = Record<typeof masterDataFields[number]['name'], string>

export function resolveMasterData(values: Partial<MasterDataValues>): MasterDataValues {
  return Object.fromEntries(masterDataFields.map(field => [field.name, values[field.name]?.trim() || field.defaultValue])) as MasterDataValues
}

export function validMasterDataValue(value: string, name?: string): boolean {
  return /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value))
    && (name !== 'maximumMachineDeckle' || Number(value) > 0)
}
