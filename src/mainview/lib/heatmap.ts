const HEATMAP_MIN_CELL_PX = 10;
const HEATMAP_MAX_CELL_PX = 14;
const HEATMAP_TARGET_WIDTH_PX = 640;
export const HEATMAP_GAP_PX = 4;

export const computeHeatmapCellSizePx = (
  weekCount: number,
  targetWidthPx: number = HEATMAP_TARGET_WIDTH_PX,
  gapPx: number = HEATMAP_GAP_PX,
): number => {
  const safeWeeks = Math.max(1, Math.floor(weekCount));
  const safeTargetWidth =
    Number.isFinite(targetWidthPx) && targetWidthPx > 0 ? targetWidthPx : HEATMAP_TARGET_WIDTH_PX;
  const safeGapPx = Number.isFinite(gapPx) && gapPx >= 0 ? gapPx : HEATMAP_GAP_PX;
  const totalGapWidth = Math.max(0, safeWeeks - 1) * safeGapPx;
  const usableWidth = Math.max(HEATMAP_MIN_CELL_PX, safeTargetWidth - totalGapWidth);

  const idealCellSize = Math.floor(usableWidth / safeWeeks);
  return Math.max(HEATMAP_MIN_CELL_PX, Math.min(HEATMAP_MAX_CELL_PX, idealCellSize));
};
