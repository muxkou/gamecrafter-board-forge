import { createHash } from "crypto";

/**
 * 将输入对象转化为“规范化”的字符串：
 * - 删除所有 null / undefined 值
 * - 深度排序对象的 key
 * - 使用 JSON.stringify 序列化
 *
 * 这样相同语义的对象（无关 key 顺序、无关 null 值）会得到完全一致的字符串，
 * 可用于生成稳定的哈希值或做缓存 key。
 */
export function canonical_stringify(input: unknown): string {
  return JSON.stringify(sort_deep(strip_nulls(input)));
}

/**
 * 计算输入字符串的 SHA-256 哈希值，并返回带前缀的十六进制表示。
 *
 * 示例：
 *   hash_sha256("hello") 
 *   => "sha256:2cf24dba5...9ca5"
 */
export function hash_sha256(text: string): string {
  const h = createHash("sha256").update(text, "utf8").digest("hex");
  return `sha256:${h}`;
}

/**
 * 递归删除对象或数组中的 null / undefined 值。
 *
 * - 如果是数组：逐元素 strip_nulls
 * - 如果是对象：忽略值为 null/undefined 的字段，并递归处理子对象
 * - 其他值：原样返回
 */
function strip_nulls(v: any): any {
  if (Array.isArray(v)) return v.map(strip_nulls);

  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v)) {
      const val = (v as any)[k];
      if (val === null || typeof val === "undefined") continue; // 过滤掉 null / undefined
      out[k] = strip_nulls(val); // 递归处理子值
    }
    return out;
  }

  return v;
}

/**
 * 深度排序对象的 key，以保证序列化输出的稳定性。
 *
 * - 如果是数组：逐元素 sort_deep
 * - 如果是对象：对 key 排序，然后递归处理每个子值
 * - 其他值：原样返回
 */
function sort_deep(v: any): any {
  if (Array.isArray(v)) return v.map(sort_deep);

  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v).sort()) {
      out[k] = sort_deep((v as any)[k]); // 按字典序处理字段
    }
    return out;
  }

  return v;
}
