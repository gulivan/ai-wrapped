import type { ShareSummaryPayload } from "@shared/shareData";
import { SOURCE_COLORS } from "./constants";
import { formatNumber, formatTokens } from "./formatters";

const IMAGE_WIDTH = 1428;
const IMAGE_HEIGHT = 768;
const OUTER_PADDING = 26;
const INNER_PADDING = 60;
const FONT_FAMILY = '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif';

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const COMPACT_USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  compactDisplay: "short",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const STANDARD_USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCountCompact = (value: number): string => {
  const safeValue = Math.max(0, value);
  if (safeValue < 1_000) return formatNumber(safeValue);
  return COMPACT_NUMBER_FORMATTER.format(safeValue);
};

const formatUsdCompact = (value: number): string =>
  Math.max(0, value) < 1_000
    ? STANDARD_USD_FORMATTER.format(Math.max(0, value))
    : COMPACT_USD_FORMATTER.format(Math.max(0, value));

const formatRangeDate = (value: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
};

const resolveWrappedTitle = (payload: ShareSummaryPayload): string =>
  `YOUR ${formatRangeDate(payload.dateFrom)} - ${formatRangeDate(payload.dateTo)} WRAPPED`;

const resolveLongestStreakDays = (payload: ShareSummaryPayload): number =>
  Math.max(0, Math.round(payload.longestStreakDays));

const drawRoundedRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
};

const fillRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient,
) => {
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
};

const strokeRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string | CanvasGradient,
  lineWidth = 2,
) => {
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.stroke();
};

const resolveFittedFontSize = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number,
): number => {
  let fontSize = maxFontSize;
  while (fontSize > minFontSize) {
    context.font = `600 ${fontSize}px ${FONT_FAMILY}`;
    if (context.measureText(text).width <= maxWidth) break;
    fontSize -= 1;
  }
  return fontSize;
};

const fitTextWithEllipsis = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  if (maxWidth <= 0) return "";
  if (context.measureText(text).width <= maxWidth) return text;

  const ellipsis = "…";
  let fitted = text;
  while (fitted.length > 0) {
    fitted = fitted.slice(0, -1);
    if (context.measureText(`${fitted}${ellipsis}`).width <= maxWidth) {
      return `${fitted}${ellipsis}`;
    }
  }

  return ellipsis;
};

const drawMetric = (
  context: CanvasRenderingContext2D,
  x: number,
  width: number,
  y: number,
  value: string,
  label: string,
) => {
  const centerX = x + width / 2;
  const valueFontSize = resolveFittedFontSize(context, value, Math.max(1, width - 34), 84, 38);
  context.fillStyle = "rgba(244, 250, 255, 0.96)";
  context.font = `600 ${valueFontSize}px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(value, centerX, y);

  context.fillStyle = "rgba(197, 222, 243, 0.88)";
  context.font = `600 31px ${FONT_FAMILY}`;
  context.fillText(label.toUpperCase(), centerX, y + 48);
};

const renderShareSummaryCanvas = async (payload: ShareSummaryPayload): Promise<HTMLCanvasElement> => {
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font readiness failures and continue with fallback fonts.
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_WIDTH;
  canvas.height = IMAGE_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create canvas context");
  }

  const wrappedTitle = resolveWrappedTitle(payload);
  const longestStreakDays = resolveLongestStreakDays(payload);

  const backgroundGradient = context.createRadialGradient(
    IMAGE_WIDTH * 0.1,
    IMAGE_HEIGHT * 0.05,
    80,
    IMAGE_WIDTH * 0.45,
    IMAGE_HEIGHT * 0.5,
    IMAGE_WIDTH * 0.85,
  );
  backgroundGradient.addColorStop(0, "#070c2a");
  backgroundGradient.addColorStop(0.48, "#020723");
  backgroundGradient.addColorStop(1, "#01041a");
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

  const cardX = OUTER_PADDING;
  const cardY = OUTER_PADDING;
  const cardWidth = IMAGE_WIDTH - OUTER_PADDING * 2;
  const cardHeight = IMAGE_HEIGHT - OUTER_PADDING * 2;

  const cardGradient = context.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  cardGradient.addColorStop(0, "rgba(50, 28, 117, 0.92)");
  cardGradient.addColorStop(0.55, "rgba(18, 57, 145, 0.92)");
  cardGradient.addColorStop(1, "rgba(10, 132, 138, 0.9)");
  fillRoundedRect(context, cardX, cardY, cardWidth, cardHeight, 40, cardGradient);
  strokeRoundedRect(context, cardX, cardY, cardWidth, cardHeight, 40, "rgba(116, 216, 255, 0.46)", 2.5);

  const contentLeft = cardX + INNER_PADDING;
  const contentRight = cardX + cardWidth - INNER_PADDING;
  const topY = cardY + 92;

  context.fillStyle = "rgba(179, 220, 245, 0.93)";
  const wrappedTitleFontSize = resolveFittedFontSize(
    context,
    wrappedTitle,
    Math.max(1, contentRight - contentLeft),
    40,
    26,
  );
  context.font = `600 ${wrappedTitleFontSize}px ${FONT_FAMILY}`;
  context.fillText(wrappedTitle, contentLeft, topY);

  const statsTop = topY + 122;
  const statGap = 28;
  const statWidth = (contentRight - contentLeft - statGap * 3) / 4;

  drawMetric(context, contentLeft, statWidth, statsTop, formatCountCompact(payload.totalSessions), "Sessions");
  drawMetric(context, contentLeft + (statWidth + statGap), statWidth, statsTop, formatTokens(payload.totalTokens), "Tokens");
  drawMetric(
    context,
    contentLeft + (statWidth + statGap) * 2,
    statWidth,
    statsTop,
    formatUsdCompact(payload.totalCostUsd),
    "Total Cost",
  );
  drawMetric(
    context,
    contentLeft + (statWidth + statGap) * 3,
    statWidth,
    statsTop,
    formatCountCompact(payload.totalToolCalls),
    "Tool Calls",
  );

  const panelY = cardY + 360;
  const panelHeight = cardHeight - (panelY - cardY) - 44;
  const panelGap = 28;
  const leftPanelWidth = (cardWidth - INNER_PADDING * 2 - panelGap) / 2;
  const rightPanelWidth = leftPanelWidth;
  const leftPanelX = contentLeft;
  const rightPanelX = leftPanelX + leftPanelWidth + panelGap;
  const panelFill = "rgba(8, 20, 66, 0.62)";
  fillRoundedRect(context, leftPanelX, panelY, leftPanelWidth, panelHeight, 30, panelFill);
  fillRoundedRect(context, rightPanelX, panelY, rightPanelWidth, panelHeight, 30, panelFill);
  strokeRoundedRect(context, leftPanelX, panelY, leftPanelWidth, panelHeight, 30, "rgba(166, 206, 238, 0.16)", 1.5);
  strokeRoundedRect(context, rightPanelX, panelY, rightPanelWidth, panelHeight, 30, "rgba(166, 206, 238, 0.16)", 1.5);

  const leftPanelCenterX = leftPanelX + leftPanelWidth / 2;
  context.fillStyle = "rgba(180, 218, 244, 0.9)";
  context.font = `600 38px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.fillText("TOP AGENTS", leftPanelCenterX, panelY + 62);

  const renderedAgents = payload.topAgents.slice(0, 3);
  if (renderedAgents.length === 0) {
    context.fillStyle = "rgba(218, 231, 243, 0.82)";
    context.font = `500 42px ${FONT_FAMILY}`;
    context.fillText("No activity", leftPanelCenterX, panelY + 146);
  } else {
    const rowCenterX = leftPanelCenterX;
    const labelFont = `500 42px ${FONT_FAMILY}`;
    const percentageFont = `500 42px ${FONT_FAMILY}`;
    const dotRadius = 8;
    const dotGap = 14;
    const labelPercentGap = 24;
    const maxRowWidth = Math.max(40, leftPanelWidth - 72);
    for (const [index, agent] of renderedAgents.entries()) {
      const rowY = panelY + 126 + index * 76;
      const percentText = `${agent.percentage.toFixed(0)}%`;

      context.font = percentageFont;
      const percentWidth = context.measureText(percentText).width;

      context.font = labelFont;
      const labelMaxWidth = Math.max(
        30,
        maxRowWidth - dotRadius * 2 - dotGap - labelPercentGap - percentWidth,
      );
      const labelText = fitTextWithEllipsis(context, agent.label, labelMaxWidth);
      const labelWidth = context.measureText(labelText).width;
      const rowWidth = dotRadius * 2 + dotGap + labelWidth + labelPercentGap + percentWidth;
      const rowStartX = rowCenterX - rowWidth / 2;
      const dotCenterX = rowStartX + dotRadius;
      const dotCenterY = rowY - 15;

      context.beginPath();
      context.arc(dotCenterX, dotCenterY, dotRadius, 0, Math.PI * 2);
      context.closePath();
      context.fillStyle = SOURCE_COLORS[agent.source] ?? "#22d3ee";
      context.fill();
      context.strokeStyle = "rgba(241, 248, 255, 0.55)";
      context.lineWidth = 1.4;
      context.stroke();

      context.textAlign = "left";
      context.fillStyle = "rgba(241, 248, 255, 0.96)";
      context.font = labelFont;
      context.fillText(labelText, rowStartX + dotRadius * 2 + dotGap, rowY);

      context.textAlign = "right";
      context.fillStyle = "rgba(191, 215, 235, 0.88)";
      context.font = percentageFont;
      context.fillText(percentText, rowStartX + rowWidth, rowY);
    }
  }

  const rightContentY = panelY + panelHeight / 2 + 12;
  const streakText = formatNumber(longestStreakDays);
  const streakValueX = rightPanelX + 52;
  const streakLabelX = rightPanelX + rightPanelWidth * 0.56;

  context.textAlign = "left";
  context.fillStyle = "rgba(244, 250, 255, 0.98)";
  context.font = `600 116px ${FONT_FAMILY}`;
  context.fillText(streakText, streakValueX, rightContentY + 16);
  context.fillStyle = "rgba(186, 216, 243, 0.88)";
  context.font = `600 34px ${FONT_FAMILY}`;
  context.fillText("LONGEST", streakLabelX, rightContentY - 34);
  context.fillText("STREAK", streakLabelX, rightContentY + 2);
  context.font = `600 30px ${FONT_FAMILY}`;
  context.fillText(longestStreakDays === 1 ? "DAY" : "DAYS", streakLabelX, rightContentY + 38);
  context.textAlign = "left";

  return canvas;
};

const toPngBlob = async (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode share image"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });

export const downloadShareSummaryImage = async (payload: ShareSummaryPayload): Promise<void> => {
  const canvas = await renderShareSummaryCanvas(payload);
  const blob = await toPngBlob(canvas);
  const objectUrl = URL.createObjectURL(blob);
  const filenameDate = payload.dateTo || new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `ai-wrapped-${filenameDate}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};
