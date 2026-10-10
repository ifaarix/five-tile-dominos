export const makeDeck = () => {
  const deck = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) deck.push([a, b]);
  return deck;
};

export const shuffle = (values) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export function newGame(players) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error('Five Tiles needs two to four players.');
  const handSize = players.length === 2 ? 7 : 5;
  let deck, hands, starter;
  do {
    deck = shuffle(makeDeck());
    hands = Object.fromEntries(players.map((p) => [p.id, deck.splice(0, handSize)]));
    starter = players.reduce((best, p) => {
      const top = Math.max(...hands[p.id].filter(([a, b]) => a === b).map(([a]) => a), -1);
      return top > best.top ? { id: p.id, top } : best;
    }, { id: players[0].id, top: -1 });
  } while (starter.top < 0);
  return { status: 'playing', players, hands, boneyard: deck, board: [], scores: Object.fromEntries(players.map((p) => [p.id, 0])), turn: starter.id, starter: starter.id, openingDouble: starter.top, lastMove: null, winner: null, target: 100, createdAt: Date.now() };
}

export function playableEnds(hand, board) {
  if (!board.length) return ['start'];
  const left = board[0][0], right = board.at(-1)[1];
  return [...new Set(hand.flatMap(([a, b]) => {
    const ends = [];
    if (a === left || b === left) ends.push('start');
    if (a === right || b === right) ends.push('end');
    return ends;
  }))];
}

export function playTile(state, playerId, tileIndex, end) {
  if (state.status !== 'playing' || state.turn !== playerId) throw new Error('It is not your turn.');
  const hand = state.hands[playerId];
  const tile = hand?.[tileIndex];
  if (!tile) throw new Error('That tile is no longer in your hand.');
  let [a, b] = tile;
  let board = [...state.board];
  if (!board.length) {
    if (a !== b) throw new Error('The first tile must be a double.');
    if (a !== state.openingDouble) throw new Error(`Open with the ${state.openingDouble}–${state.openingDouble}.`);
    board = [[a, b]];
  } else if (end === 'start') {
    const pip = board[0][0];
    if (b === pip) [a, b] = [b, a];
    if (a !== pip) throw new Error('That tile does not fit the left end.');
    board = [[b, a], ...board];
  } else {
    const pip = board.at(-1)[1];
    if (a === pip) [a, b] = [b, a];
    if (b !== pip) throw new Error('That tile does not fit the right end.');
    board = [...board, [a, b]];
  }
  const hands = { ...state.hands, [playerId]: hand.filter((_, i) => i !== tileIndex) };
  const openTotal = board[0][0] + board.at(-1)[1];
  const gained = openTotal % 5 === 0 ? openTotal : 0;
  const scores = { ...state.scores, [playerId]: state.scores[playerId] + gained };
  const empty = hands[playerId].length === 0;
  const players = state.players;
  const currentIndex = players.findIndex((p) => p.id === playerId);
  const nextIndex = (currentIndex + 1) % players.length;
  let nextTurn = players[nextIndex].id;
  if (empty) scores[playerId] += Object.values(hands).reduce((sum, h) => sum + h.flat().reduce((x, n) => x + n, 0), 0);
  const winner = scores[playerId] >= state.target ? playerId : Object.entries(scores).find(([, n]) => n >= state.target)?.[0] || null;
  const lastMove = { playerId, tile: board[end === 'start' && state.board.length ? 0 : board.length - 1], gained, at: Date.now() };
  if (winner) return { ...state, board, hands, scores, turn: winner, status: 'finished', winner, lastMove };
  if (empty) return { ...newGame(players), scores, target: state.target, lastMove: { ...lastMove, roundWonBy: playerId } };
  return { ...state, board, hands, scores, turn: nextTurn, status: 'playing', winner: null, lastMove };
}

export function passTurn(state, playerId) {
  if (state.turn !== playerId) throw new Error('It is not your turn.');
  if (playableEnds(state.hands[playerId], state.board).length) throw new Error('You have a playable tile.');
  if (state.boneyard?.length) {
    const [tile, ...boneyard] = state.boneyard;
    return { ...state, boneyard, hands: { ...state.hands, [playerId]: [...state.hands[playerId], tile] }, lastMove: { playerId, drew: true, tile, at: Date.now() } };
  }
  const turn = state.players[(state.players.findIndex((p) => p.id === playerId) + 1) % state.players.length].id;
  const allStuck = state.players.every((p) => !playableEnds(state.hands[p.id], state.board).length);
  if (allStuck) {
    const totals = Object.fromEntries(state.players.map((p) => [p.id, state.hands[p.id].flat().reduce((sum, n) => sum + n, 0)]));
    const lowest = Math.min(...Object.values(totals));
    const winner = state.players.find((p) => totals[p.id] === lowest)?.id;
    const points = Math.max(0, ...Object.values(totals)) - lowest;
    const scores = { ...state.scores, [winner]: state.scores[winner] + points };
    const gameWinner = scores[winner] >= state.target ? winner : null;
    if (gameWinner) return { ...state, scores, turn, status: 'finished', winner: gameWinner, lastMove: { playerId, blocked: true, at: Date.now() } };
    const nextRound = newGame(state.players);
    return { ...nextRound, scores, target: state.target, lastMove: { playerId, blocked: true, roundRestarted: true, at: Date.now() } };
  }
  return { ...state, turn, lastMove: { playerId, passed: true, at: Date.now() } };
}
