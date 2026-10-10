import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, isSpinnerReady, newGame, passTurn, playTile, playableEnds } from './game.js';

const players = [{id:'a',name:'A'},{id:'b',name:'B'}];
const fixture = (overrides={}) => ({status:'playing',players,hands:{a:[],b:[]},boneyard:[],board:emptyBoard(),scores:{a:0,b:0},turn:'a',openingDouble:6,target:100,...overrides});

test('initial deal gives the highest double holder the opening turn',()=>{
  const game=newGame(players);
  assert.ok(game.hands[game.turn].some(([a,b])=>a===b&&a===game.openingDouble));
  assert.equal(game.openingDouble,Math.max(...Object.values(game.hands).flat().filter(([a,b])=>a===b).map(([a])=>a)));
});

test('all four center sides must be filled before any branch can extend',()=>{
  const board={center:[6,6],arms:[[[6,5]],[[6,4]],[],[]]};
  assert.deepEqual(playableEnds([[5,3],[6,2]],board),[2]);
  assert.equal(isSpinnerReady(board),false);
  board.arms[2]=[[6,3]];board.arms[3]=[[6,2]];
  assert.equal(isSpinnerReady(board),true);
  assert.deepEqual(playableEnds([[5,3]],board),[0,2]);
});

test('scores all four exposed branch tips only after the opening is complete',()=>{
  const board={center:[6,6],arms:[[[6,6]],[[6,5]],[[6,4]],[[6,1]]]};
  const state=fixture({board,hands:{a:[[6,0],[0,2]],b:[[1,1]]},openingDouble:6});
  const next=playTile(state,'a',0,0);
  assert.equal(next.lastMove.gained,10);
  assert.equal(next.scores.a,10);
});

test('opening player draws exactly once and skips if the draw is not a double',()=>{
  const state=fixture({hands:{a:[[1,2]],b:[[3,4]]},boneyard:[[0,1]]});
  const next=passTurn(state,'a');
  assert.equal(next.boneyard.length,0);
  assert.equal(next.hands.a.length,2);
  assert.equal(next.turn,'b');
  assert.equal(next.lastMove.skipped,true);
});

test('a drawn opening double keeps the opening turn',()=>{
  const state=fixture({hands:{a:[[1,2]],b:[[3,4]]},boneyard:[[2,2]]});
  const next=passTurn(state,'a');
  assert.equal(next.turn,'a');
});

test('a later-round leader may open with any double',()=>{
  const state=fixture({openingDouble:null,hands:{a:[[2,2],[0,1]],b:[[6,6],[1,2]]}});
  const next=playTile(state,'a',0);
  assert.deepEqual(next.board.center,[2,2]);
});

test('a new round keeps fields the game model does not own, such as a practice game\'s local flag', () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const state = {
    status: 'playing', players, hands: { a: [[6, 2]], b: [[1, 1]] }, boneyard: [],
    board: { center: [6, 6], arms: [[], [], [], []] }, scores: { a: 0, b: 0 },
    turn: 'a', roundStarter: 'a', roundNumber: 1, openingDouble: 6, lastMove: null, winner: null, target: 100,
    local: true, code: 'PRACTICE',
  };
  const next = playTile(state, 'a', 0, 0);
  assert.equal(next.roundNumber, 2);
  assert.equal(next.status, 'playing');
  assert.equal(next.local, true);
  assert.equal(next.code, 'PRACTICE');
  assert.equal(next.scores.a, 2);
  assert.equal(next.turn, 'a');
});
