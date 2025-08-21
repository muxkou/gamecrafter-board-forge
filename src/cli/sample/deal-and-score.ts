// examples/deal-and-score.ts
export default {
  schema_version: 0,
  engine_compat: '>=1.0.0',
  id: 'deal-score',
  name: 'Deal & Score',
  metadata: { seats: { min: 2, max: 2, default: 2 } },
  entities: [{ id: 'card', props: {} }],
  zones: [
    { id: 'deck', kind: 'stack', scope: 'public', of: ['card'], visibility: 'all' },
    { id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
  ],
  phases: [{ id: 'main', transitions: [] }],
  actions: [
    { id: 'deal_all', effect: [{ op: 'deal', from_zone: 'deck', to_zone: 'hand', from_owner: '_', to_owner: 'seat', count: 1 }] },
    { id: 'set_score', effect: [{ op: 'set_var', key: 'score', value: 10 }] },
  ],
  victory: { order: [{ when: true, result: 'ongoing' }] },
};
