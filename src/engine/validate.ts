import { GameState } from "../types";

export function validate_state(state: GameState) {
  const errors: Array<{ code: string; path: string; message: string }> = [];
  const warnings: Array<{ code: string; path: string; message: string }> = [];

  const seats = state.seats;
  const seatSet = new Set(seats);

  // —— PER_SEAT_KEYS：per_seat 的实例键必须等于 seats 集合
  for (const zone_id of Object.keys(state.zones).sort()) {
    const zr: any = (state.zones as any)[zone_id];
    if (zr.scope === "per_seat") {
      const keys = Object.keys(zr.instances).sort();
      const keySet = new Set(keys);
      const same =
        keys.length === seats.length && keys.every((k) => seatSet.has(k));
      if (!same) {
        errors.push({
          code: "INVARIANT_PER_SEAT_KEYS",
          path: `/zones/${zone_id}/instances`,
          message: `zone '${zone_id}' instances keys ${JSON.stringify(
            keys
          )} != seats ${JSON.stringify(seats)}`
        });
      }
    }
  }

  // —— ENTITY_LOC_UNIQUE：任一实体只能出现在一个实例里一次
  const locMap = new Map<string, Array<{ zone: string; owner: string; index: number }>>();
  for (const zone_id of Object.keys(state.zones).sort()) {
    const zr: any = (state.zones as any)[zone_id];
    for (const owner of Object.keys(zr.instances)) {
      const inst: any = zr.instances[owner];
      const items: string[] =
        "items" in inst && Array.isArray(inst.items) ? inst.items : [];
      items.forEach((eid, idx) => {
        if (!locMap.has(eid)) locMap.set(eid, []);
        locMap.get(eid)!.push({ zone: zone_id, owner, index: idx });
      });
    }
  }
  for (const [eid, locs] of locMap) {
    if (locs.length > 1) {
      // 为了不刷屏：只报后续重复位置
      locs.slice(1).forEach((loc) =>
        errors.push({
          code: "INVARIANT_ENTITY_LOC_UNIQUE",
          path: `/zones/${loc.zone}/instances/${loc.owner}/items/${loc.index}`,
          message: `entity '${eid}' appears in multiple zones`
        })
      );
    }
  }

  // —— ZONE_CAPACITY：每个实例的 items.length 不得超过 capacity
  for (const zone_id of Object.keys(state.zones).sort()) {
    const zr: any = (state.zones as any)[zone_id];
    const cap: number | undefined = zr.capacity;
    if (cap == null) continue;
    for (const owner of Object.keys(zr.instances)) {
      const inst: any = zr.instances[owner];
      const items: string[] =
        "items" in inst && Array.isArray(inst.items) ? inst.items : [];
      if (items.length > cap) {
        errors.push({
          code: "INVARIANT_ZONE_CAPACITY",
          path: `/zones/${zone_id}/instances/${owner}/items`,
          message: `zone '${zone_id}' owner '${owner}' has ${items.length} items > capacity ${cap}`
        });
      }
    }
  }

  return { errors, warnings };
}
