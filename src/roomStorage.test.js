import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, newGame } from './game.js';
import { decodeRoomState, encodeRoomState, roomFromFirestore } from './roomStorage.js';

function assertNoNestedArrays(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assert.equal(Array.isArray(item), false, 'Firestore cannot store an array inside an array');
      assertNoNestedArrays(item);
    }
  } else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const item of Object.values(value)) assertNoNestedArrays(item);
  }
}

test('room state persists without nested arrays and round-trips to game format', () => {
  const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Sam' }];
  const state = {
    ...newGame(players),
    board: { center: [6, 6], arms: [[[6, 5]], [[6, 4]], [[6, 1]], [[6, 2], [2, 3]]] },
    lastMove: { playerId: 'a', tile: [2, 3], arm: 3 },
  };
  const stored = encodeRoomState(state);

  assertNoNestedArrays(stored);
  assert.deepEqual(decodeRoomState(stored), state);
});

test('an unstarted party has a Firestore-safe empty spinner', () => {
  const stored = encodeRoomState({ status: 'lobby', board: emptyBoard(), hands: {} });

  assertNoNestedArrays(stored);
  assert.deepEqual(decodeRoomState(stored).board, emptyBoard());
});

test('old empty-lobby board documents remain readable', () => {
  assert.deepEqual(decodeRoomState({ status: 'lobby', board: [] }).board, emptyBoard());
});

test('Firestore snapshots retain their document id as the party code', () => {
  const room = roomFromFirestore('4LVHZ', { status: 'lobby', players: [{ id: 'host', name: 'Host' }], board: [] });

  assert.equal(room.code, '4LVHZ');
  assert.equal(room.players.length, 1);
  assert.deepEqual(room.board, emptyBoard());
});
