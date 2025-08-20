import { createHash } from "crypto";

export function canonical_stringify(input: unknown): string {
  return JSON.stringify(sort_deep(strip_nulls(input)));
}

export function hash_sha256(text: string): string {
  const h = createHash("sha256").update(text, "utf8").digest("hex");
  return `sha256:${h}`;
}

function strip_nulls(v: any): any {
  if (Array.isArray(v)) return v.map(strip_nulls);

  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v)) {
      const val = (v as any)[k];
      if (val === null || typeof val === "undefined") continue;
      out[k] = strip_nulls(val);
    }
    return out;
  }

  return v;
}

function sort_deep(v: any): any {
  if (Array.isArray(v)) return v.map(sort_deep);

  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v).sort()) {
      out[k] = sort_deep((v as any)[k]);
    }
    return out;
  }

  return v;
}
