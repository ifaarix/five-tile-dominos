import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TARGET, emptyBoard, endsForPip, isSpinnerReady, newGame, passTurn, playTile, playableEnds } from './game.js';

const players = [{id:'a',name:'A'},{id:'b',name:'B'}];
const fixture = (overrides={}) => ({status:'playing',players,hands:{a:[],b:[]},boneyard:[],board:emptyBoard(),scores:{a:0,b:0},turn:'a',openingDouble:6,target:DEFAULT_TARGET,...overrides});

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
  // 6+5+4+1 = 16 is not a multiple of 5 -> after playing [6,0] on arm 0 the tips are 0+5+4+1 = 10 -> 2 points
  assert.equal(next.lastMove.gained,2);
  assert.equal(next.scores.a,2);
});

test('ends adding up to 5 score 1 point, 15 scores 3, anything else scores nothing',()=>{
  const spinner=(tips)=>({center:[6,6],arms:tips.map((tip)=>[[6,tip]])});
  // play [x,y] on arm 0 so the new tip is y
  const play=(tips,tile)=>playTile(fixture({board:spinner(tips),hands:{a:[tile,[0,2]],b:[[1,1]]}}),'a',0,0).lastMove.gained;
  assert.equal(play([6,2,2,1],[6,0]),1);   // 0+2+2+1 = 5
  assert.equal(play([6,5,5,5],[6,0]),3);   // 0+5+5+5 = 15
  assert.equal(play([6,2,2,2],[6,0]),0);   // 6 is not a multiple of 5
  assert.equal(play([6,2,2,1],[6,1]),0);   // 1+2+2+1 = 6
});

test('going out adds the opponents\' pips in fives (rounded)',()=>{
  const state=fixture({board:{center:[6,6],arms:[[],[],[],[]]},hands:{a:[[6,2]],b:[[3,3],[2,2]]},openingDouble:null});
  const next=playTile(state,'a',0,0);
  assert.equal(next.scores.a,2); // 10 pips left -> 2 points
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

test('a stuck player draws once; a drawn tile that fits must be played, otherwise the turn is skipped',()=>{
  const board={center:[6,6],arms:[[[6,5]],[[6,4]],[[6,3]],[[6,2]]]};
  // tips are 5, 4, 3, 2 -> a drawn [2,2] fits, a drawn [1,1] does not
  const fits=fixture({board,hands:{a:[[0,0]],b:[[1,0]]},boneyard:[[2,2],[1,1]],openingDouble:null});
  const afterFit=passTurn(fits,'a');
  assert.equal(afterFit.hands.a.length,2);
  assert.equal(afterFit.boneyard.length,1);
  assert.equal(afterFit.turn,'a');            // keeps the turn to play the new tile
  assert.equal(afterFit.lastMove.canPlay,true);
  assert.throws(()=>passTurn(afterFit,'a'),/playable/); // and may not draw a second time
  const played=playTile(afterFit,'a',1,3);
  assert.equal(played.turn,'b');

  const misses=fixture({board,hands:{a:[[0,0]],b:[[1,0]]},boneyard:[[1,1],[2,2]],openingDouble:null});
  const afterMiss=passTurn(misses,'a');
  assert.equal(afterMiss.hands.a.length,2);
  assert.equal(afterMiss.turn,'b');           // skipped: the play goes to the next player
  assert.equal(afterMiss.lastMove.skipped,true);
  assert.equal(afterMiss.boneyard.length,1);  // only one tile was taken
});

test('you cannot draw while you hold a playable tile',()=>{
  const board={center:[6,6],arms:[[[6,5]],[[6,4]],[[6,3]],[[6,2]]]};
  const state=fixture({board,hands:{a:[[5,0]],b:[[1,1]]},boneyard:[[2,2]],openingDouble:null});
  assert.throws(()=>passTurn(state,'a'),/playable/);
});

test('endsForPip only opens the sides that match the face you are holding',()=>{
  const board={center:[6,6],arms:[[[6,3]],[[6,1]],[[6,4]],[[6,5]]]};
  assert.deepEqual(endsForPip(board,3),[0]);
  assert.deepEqual(endsForPip(board,1),[1]);
  assert.deepEqual(endsForPip(board,2),[]);
  assert.deepEqual(playableEnds([[3,1]],board),[0,1]);
  // while the spinner is still filling, only the next empty side is open
  assert.deepEqual(endsForPip({center:[6,6],arms:[[[6,3]],[],[],[]]},6),[1]);
  assert.deepEqual(endsForPip({center:[6,6],arms:[[[6,3]],[],[],[]]},3),[]);
});

test('a later-round leader may open with any double',()=>{
  const state=fixture({openingDouble:null,hands:{a:[[2,2],[0,1]],b:[[6,6],[1,2]]}});
  const next=playTile(state,'a',0);
  assert.deepEqual(next.board.center,[2,2]);
});

test('a new round keeps fields the game model does not own, such as a practice game\'s local flag', () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const state = {
    status: 'playing', players, hands: { a: [[6, 2]], b: [[5, 5]] }, boneyard: [],
    board: { center: [6, 6], arms: [[], [], [], []] }, scores: { a: 0, b: 0 },
    turn: 'a', roundStarter: 'a', roundNumber: 1, openingDouble: 6, lastMove: null, winner: null, target: DEFAULT_TARGET,
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
