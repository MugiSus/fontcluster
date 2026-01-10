/**
 * Aligns a measured size to HOG algorithm constraints.
 * Formula: Size = cellSide * (blockSide + n * blockStride)
 * where n is the smallest non-negative integer such that the result >= measuredSize.
 */
export function alignToHogConstraints(
  measuredSize: number,
  cellSide: number,
  blockSide: number,
  blockStride: number,
): number {
  const minCellsRequired = Math.ceil(measuredSize / cellSide);
  const n = Math.ceil(Math.max(0, minCellsRequired - blockSide) / blockStride);
  const totalCells = blockSide + n * blockStride;
  return totalCells * cellSide;
}
