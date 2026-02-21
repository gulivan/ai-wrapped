export const resolveCurrentCardIndex = (activeCardRefIndex: number, activeCardIndex: number): number =>
  activeCardRefIndex > 0 ? activeCardRefIndex : activeCardIndex;

export const buildCardDownloadName = (cardIndex: number, now: Date = new Date()): string => {
  const date = now.toISOString().slice(0, 10);
  return `ai-wrapped-card-${cardIndex}-${date}.png`;
};

export const downloadBlobAsFile = (
  blob: Blob,
  filename: string,
  documentRef: Pick<Document, "createElement" | "body"> = document,
  urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void => {
  const href = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  urlApi.revokeObjectURL(href);
};
