// examples/draw-and-shuffle.ts
export default {
  schema_version: 0,
  engine_compat: '>=1.0.0',
  id: 'draw-demo',
  name: 'Draw Demo',
  metadata: { seats: { min: 2, max: 4, default: 2 } },
  entities: [{ id: 'card', props: {} }],
  zones: [
    { id: 'deck', kind: 'stack', scope: 'per_seat', of: ['card'], visibility: 'owner' },
    { id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
  ],
  phases: [{ id: 'main', transitions: [] }],
  actions: [
    { id: 'shuffle_deck', effect: [{ op: 'shuffle', zone: 'deck' }] },
    { id: 'draw', effect: [{ op: 'move_top', from_zone: 'deck', to_zone: 'hand', count: 1 }] },
  ],
  victory: { order: [{ when: true, result: 'ongoing' }] },
};
