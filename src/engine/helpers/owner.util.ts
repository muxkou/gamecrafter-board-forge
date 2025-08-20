import type { InterpreterCtx } from '../effects/types';

export function resolve_owner(mode: 'by' | 'active' | string, ctx: InterpreterCtx): string {
  if (mode === 'by') {
    const by = ctx.call.by;
    if (!by) throw new Error(`action.by 未提供，但 pipeline 需要 'by'`);
    return by;
  }
  if (mode === 'active') {
    const active = ctx.state.active_seat || '';
    if (!active) throw new Error(`当前无 active_seat，无法解析 'active'`);
    return active;
  }
  return mode;
}


