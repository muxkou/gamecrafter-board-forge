/**
 * engine 的核心 UT
 *
 * 覆盖范围：
 * - initial_state：状态骨架、zones 实例结构、state_hash 基本形状
 * - step：seq/seat 前置校验、end_turn 推进、move_top 成功路径
 */
import { describe, it, expect } from 'vitest';

import { compile } from '../../compiler/index';
import { initial_state, step } from '../index';

/**
 * 构造一个最小可用的有效 DSL，便于复用。
 */
function buildValidDSL() {
	return {
		schema_version: 0,
		engine_compat: '>=1.0.0',
		id: 'demo',
		name: 'Demo Game',
		metadata: { seats: { min: 2, max: 4, default: 2 } },
		entities: [
			{ id: 'card', props: { cost: 1 } }
		],
		zones: [
			{ id: 'deck', kind: 'stack', scope: 'per_seat', of: ['card'], visibility: 'owner', capacity: 60 },
			{ id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
		],
		phases: [
			{ id: 'main', transitions: [] }
		],
		actions: [
			{ id: 'draw', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand', count: 1 } ] }
		],
		victory: { order: [ { when: true, result: 'ongoing' } ] },
	};
}

describe('engine.initial_state', () => {
	// 场景一：创建最小可用状态，校验骨架与 zones 形状
	it('should create minimal state with zones and per-seat instances', async () => {
		const dsl = buildValidDSL();
		const compiled = await compile({ dsl });
		expect(compiled.ok).toBe(true);
		const seats = ['A', 'B'];
		const seed = 123;
		const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed });

		const gs = init.game_state as any;
		expect(gs.phase).toBe(compiled.compiled_spec!.phase_graph.initial_phase);
		expect(gs.active_seat).toBe('A');
		expect(gs.turn).toBe(1);
		expect(typeof gs.meta.created_at).toBe('number');
		expect(gs.meta.last_seq).toBe(0);
		expect(typeof init.state_hash).toBe('string');
		expect(init.state_hash.startsWith('sha256:')).toBe(true);

		// zones per-seat shape
		expect(Object.keys(gs.zones.deck.instances).sort()).toEqual(['A','B']);
		expect(Array.isArray(gs.zones.deck.instances['A'].items)).toBe(true);
		expect(Array.isArray(gs.zones.hand.instances['A'].items)).toBe(true);
	});
});

describe('engine.step', () => {
	// 场景二：end_turn 推进席位并在未环回时不自增回合
	it('end_turn should advance active seat and keep turn unless wrapped (compiled fallback path)', async () => {
		const dsl = buildValidDSL();
		const compiled = await compile({ dsl });
		const seats = ['A', 'B'];
		const base = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });

		const r = await step({ game_state: base.game_state, action: { id: 'end_turn', by: 'A', payload: {}, seq: 1 } });
		expect(r.ok).toBe(true);
		const ns = r.next_state!;
		expect(ns.active_seat).toBe('B');
		expect(ns.turn).toBe(1);
		expect(ns.meta.last_seq).toBe(1);
		expect(r.state_hash?.startsWith('sha256:')).toBe(true);
	});

	// 场景三：非递增 seq 被拒绝
	it('duplicate or non-increasing seq should be rejected', async () => {
		const dsl = buildValidDSL();
		const compiled = await compile({ dsl });
		const seats = ['A', 'B'];
		const base = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });

		const r = await step({ game_state: base.game_state, action: { id: 'end_turn', by: 'A', payload: {}, seq: 0 } });
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('DUPLICATE_SEQ');
	});

	// 场景四：非当前席位执行动作被拒绝
	it('illegal action by non-active seat should be rejected', async () => {
		const dsl = buildValidDSL();
		const compiled = await compile({ dsl });
		const seats = ['A', 'B'];
		const base = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });

		const r = await step({ game_state: base.game_state, action: { id: 'end_turn', by: 'B', payload: {}, seq: 1 } });
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('ILLEGAL_ACTION');
	});

        // 场景五：move_top 成功移动指定数量的实体
        // compiled_spec 路径：通过解释器执行 effect_pipeline
        it('move_top should move N items from source to target when valid (compiled path)', async () => {
                const dsl = buildValidDSL();
                const compiled = await compile({ dsl });
		const seats = ['A', 'B'];
		const base = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });

		// seed source items
		const gs: any = base.game_state;
		gs.zones.deck.instances['A'].items = ['c1', 'c2'];
		gs.zones.hand.instances['A'].items = [];

		const r = await step({ compiled_spec: compiled.compiled_spec!, game_state: gs, action: { id: 'draw', by: 'A', payload: { count: 2 }, seq: 1 } });
		expect(r.ok).toBe(true);
		const ns: any = r.next_state!;
		expect(ns.zones.deck.instances['A'].items.length).toBe(0);
		expect(ns.zones.hand.instances['A'].items.length).toBe(2);
                expect(new Set(ns.zones.hand.instances['A'].items)).toEqual(new Set(['c1','c2']));
        });

        // 场景六：move_top 缺省 count 时默认为 1
        it('move_top defaults count to 1 when omitted', async () => {
                const dsl = buildValidDSL();
                const compiled = await compile({ dsl });
                const seats = ['A', 'B'];
                const base = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });

                const gs: any = base.game_state;
                gs.zones.deck.instances['A'].items = ['c1'];
                gs.zones.hand.instances['A'].items = [];

                const r = await step({ game_state: gs, action: { id: 'move_top', by: 'A', payload: { from_zone: 'deck', to_zone: 'hand' }, seq: 1 } });
                expect(r.ok).toBe(true);
                const ns: any = r.next_state!;
                expect(ns.zones.deck.instances['A'].items).toEqual([]);
                expect(ns.zones.hand.instances['A'].items).toEqual(['c1']);
        });
});
