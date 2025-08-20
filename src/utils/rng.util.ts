/**
 * 同样的初始种子 → 完全一致的输出序列
 * @param seed 
 * @returns 
 */
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return {
    next_uint32(): number {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0);
    },
    get state(): number { return t >>> 0; }
  };
}

/**
 * 混合两个种子，生成新的种子
 * @param base 
 * @param salt 
 * @returns 
 */
export function mix_seed(base: number, salt: number): number { let x = (base ^ 0x9e3779b9) + (salt | 0); x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; }
