import { safeSourceUrl } from "./model";
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string").slice(0, 50)
    : [];
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
/** Existing model output stays an inference. No posture or evidence ID is manufactured. */
export function liveProjection(value: unknown) {
  const root = object(value),
    metadata = object(root["metadata"]);
  const signals = (Array.isArray(root["signals"]) ? root["signals"] : [])
    .slice(0, 20)
    .map((v: unknown) => {
      const s = object(v);
      return {
        title: str(s["title"]),
        description: str(s["description"]),
        sources: strings(s["sourceUrls"])
          .map(safeSourceUrl)
          .filter((u): u is string => Boolean(u)),
      };
    })
    .filter((s) => s.title && s.description);
  return {
    signals,
    unknowns: strings(root["unknowns"]),
    id: str(metadata["id"]),
    at: str(metadata["analyzedAt"]),
    url: safeSourceUrl(metadata["storeUrl"]),
    saved: metadata["evidenceLedgerPersisted"] === true,
  };
}
