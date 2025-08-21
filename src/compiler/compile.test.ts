/**
 * compile() 的单元测试
 *
 * 覆盖三类核心场景：
 * - 成功编译：产物结构、action_hash 与 spec_id 的稳定性
 * - DSL schema 失败：zod 校验失败时返回 ok=false 且无产物
 * - effect 规范化失败：收集错误并跳过有问题的 action
 */
import { describe, it, expect } from 'vitest';

import { compile } from './index';
import { canonical_stringify, hash_sha256 } from '../utils/canonical.util';

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

describe('compile', () => {
	// 场景一：成功编译，断言产物与稳定哈希
	it('should compile a valid DSL successfully and produce stable action_hash/spec_id', async () => {
		const dsl = buildValidDSL();
		const result = await compile({ dsl });

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.compiled_spec).not.toBeNull();
		expect(result.spec_id).toBeTypeOf('string');
		expect(result.spec_id?.startsWith('sha256:')).toBe(true);

		const compiled = result.compiled_spec!;
		expect(compiled.spec_id).toBe(result.spec_id);
		expect(Object.keys(compiled.actions_index)).toContain('draw');

		const draw = compiled.actions_index['draw'];
		expect(draw.effect_pipeline).toEqual([
			{ op: 'move_top', from_zone: 'deck', to_zone: 'hand', from_owner: 'by', to_owner: 'by', count: 1 }
		]);

                // action_hash = sha256(canonical_stringify(effect_pipeline))
                const expectedActionHash = hash_sha256(canonical_stringify(draw.effect_pipeline));
                expect(draw.action_hash).toBe(expectedActionHash);

                const firstSpecId = result.spec_id!;
                const firstActionHash = draw.action_hash;

                const second = await compile({ dsl });
                expect(second.spec_id).toBe(firstSpecId);
                const drawAgain = second.compiled_spec!.actions_index['draw'];
                expect(drawAgain.action_hash).toBe(firstActionHash);
        });

	// 场景二：DSL schema 校验失败，ok=false 且无产物
	it('should return ok=false when DSL schema validation fails', async () => {
		const badDsl = {
			...buildValidDSL(),
			// zone.of 引用不存在的实体，触发 schema 超精化错误
			zones: [ { id: 'mystery', kind: 'list', scope: 'public', of: ['ghost'], visibility: 'all' } ],
		};

		const result = await compile({ dsl: badDsl });
		expect(result.ok).toBe(false);
		expect(result.compiled_spec).toBeNull();
		expect(result.spec_id).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
		// 错误码由编译器包装为 SCHEMA_ERROR
		expect(result.errors.some(e => e.code === 'SCHEMA_ERROR')).toBe(true);
	});

        // 场景三：effect 规范化失败，错误被收集且该 action 被跳过
        it('should collect errors and skip invalid actions whose effect pipeline fails normalization', async () => {
                const dsl = buildValidDSL();
                // 注入一个结构错误的 action（缺失 from_zone）
                dsl.actions.push({ id: 'bad', effect: [ { op: 'move_top', to_zone: 'hand' } ] } as any);

		const result = await compile({ dsl });
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors.some(e => e.code === 'SCHEMA_ERROR' && e.path.includes('/actions/bad/effect/0'))).toBe(true);

		const compiled = result.compiled_spec!;
		expect(Object.keys(compiled.actions_index)).toContain('draw');
                expect(Object.keys(compiled.actions_index)).not.toContain('bad');
        });

        // 场景四：规范化新 effect op（shuffle/deal/set_var）
        it('should normalize shuffle/deal/set_var ops', async () => {
                const dsl = buildValidDSL();
                dsl.actions.push(
                        { id: 'shuf', effect: [ { op: 'shuffle', zone: 'deck' } ] },
                        { id: 'deal', effect: [ { op: 'deal', from_zone: 'deck', to_zone: 'hand', to_owner: 'seat', count: 1 } ] },
                        { id: 'setv', effect: [ { op: 'set_var', key: 'foo', value: 42 } ] },
                );
                const result = await compile({ dsl });
                expect(result.ok).toBe(true);
                const compiled = result.compiled_spec!;
                expect(compiled.actions_index['shuf'].effect_pipeline).toEqual([
                        { op: 'shuffle', zone: 'deck', owner: 'by' }
                ]);
                expect(compiled.actions_index['deal'].effect_pipeline).toEqual([
                        { op: 'deal', from_zone: 'deck', to_zone: 'hand', from_owner: 'by', to_owner: 'seat', count: 1 }
                ]);
                expect(compiled.actions_index['setv'].effect_pipeline).toEqual([
                        { op: 'set_var', key: 'foo', value: 42 }
                ]);
        });
});


