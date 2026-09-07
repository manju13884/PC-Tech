export const calculateTwoPlyQuantity = (productionQuantity: number, ply: number | null) => {
  if (!Number.isFinite(productionQuantity) || productionQuantity < 0 || ply == null || !Number.isFinite(ply) || ply < 2) return null
  return productionQuantity * Math.floor(ply / 2)
}
