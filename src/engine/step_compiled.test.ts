import { describe, it, expect } from 'vitest';

import { compile } from '../compiler/index';
import { initial_state } from './index';
import { step_compiled } from './step_compiled';
import { legal_actions_compiled } from './legal_actions_compiled';

function dslWithActions() {
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
                        // 默认 by → by（会解析为 call.by）
                        { id: 'draw', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand', count: 1 } ] },
                        // 使用 active 占位，忽略 call.by，以 state.active_seat 解析
                        { id: 'draw_active', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand', from_owner: 'active', to_owner: 'active', count: 1 } ] },
                        // 指定常量席位字符串作为 owner
                        { id: 'give_to_B', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand', to_owner: 'B', count: 1 } ] },
                        // 前置条件恒为假
                        { id: 'forbidden', require: false, effect: [] },
                ],
                victory: { order: [ { when: true, result: 'ongoing' } ] },
        };
}

async function buildCompiledAndInit() {
	const compiled = await compile({ dsl: dslWithActions() });
	expect(compiled.ok).toBe(true);
	const seats = ['A', 'B'];
	const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });
	return { compiled_spec: compiled.compiled_spec!, init, seats } as const;
}

describe('step_compiled (interpreter)', () => {
	it('executes actions_index pipeline: draw moves one from A deck to A hand', async () => {
		const { compiled_spec, init } = await buildCompiledAndInit();

		const gs: any = init.game_state;
		gs.zones.deck.instances['A'].items = ['c1'];
		gs.zones.hand.instances['A'].items = [];

		const { next_state, action_hash } = step_compiled({
			compiled_spec,
			game_state: gs,
			action: { action: 'draw', by: 'A', payload: {} }
		});

		expect(action_hash.startsWith('sha256:')).toBe(true);
		const ns1: any = next_state as any;
		expect(ns1.zones.deck.instances['A'].items.length).toBe(0);
		expect(ns1.zones.hand.instances['A'].items).toEqual(['c1']);
	});

	it('payload.count overrides op.count', async () => {
		const { compiled_spec, init } = await buildCompiledAndInit();
		const gs: any = init.game_state;
		gs.zones.deck.instances['A'].items = ['c1', 'c2', 'c3'];
		gs.zones.hand.instances['A'].items = [];

		const { next_state } = step_compiled({
			compiled_spec,
			game_state: gs,
			action: { action: 'draw', by: 'A', payload: { count: 2 } }
		});

		const ns2: any = next_state as any;
		expect(ns2.zones.deck.instances['A'].items).toEqual(['c1']);
		expect(ns2.zones.hand.instances['A'].items).toEqual(['c3','c2']);
	});

	it('resolves active owner placeholder', async () => {
		const { compiled_spec, init } = await buildCompiledAndInit();
		const gs: any = init.game_state;
		// active = A
		gs.zones.deck.instances['A'].items = ['c1'];
		gs.zones.hand.instances['A'].items = [];

		const { next_state } = step_compiled({
			compiled_spec,
			game_state: gs,
			action: { action: 'draw_active', by: 'IGNORED', payload: {} }
		});

		const ns3: any = next_state as any;
		expect(ns3.zones.hand.instances['A'].items).toEqual(['c1']);
	});

        it('throws on unknown action', async () => {
                const { compiled_spec, init } = await buildCompiledAndInit();

                expect(() => step_compiled({
                        compiled_spec,
                        game_state: init.game_state,
                        action: { action: 'not_exist', by: 'A', payload: {} }
                })).toThrowError();
        });

        it('throws structured error when require_ast evaluates to false', async () => {
                const { compiled_spec, init } = await buildCompiledAndInit();
                let err: any = null;
                try {
                        step_compiled({
                                compiled_spec,
                                game_state: init.game_state,
                                action: { action: 'forbidden', by: 'A', payload: {} }
                        });
                } catch (e) {
                        err = e;
                }
                expect(err).toMatchObject({ code: 'REQUIRE_FAILED', action: 'forbidden' });
        });

	it('integration with legal_actions_compiled: suggested calls are executable', async () => {
		const { compiled_spec, init } = await buildCompiledAndInit();
		const gs: any = init.game_state;
		gs.zones.deck.instances['A'].items = ['c1', 'c2'];
		gs.zones.hand.instances['A'].items = [];

		const calls = legal_actions_compiled({ compiled_spec: compiled_spec as any, game_state: gs, by: 'A', maxCountsPerAction: 1 });
		expect(Array.isArray(calls)).toBe(true);
		expect(calls.some(c => c.action === 'draw' && (c.payload as any)?.count === 1)).toBe(true);

		const call = calls.find(c => c.action === 'draw')!;
		const { next_state } = step_compiled({ compiled_spec, game_state: gs, action: call });
		const n: any = next_state as any;
		expect(n.zones.hand.instances['A'].items.length).toBe(1);
	});
});


