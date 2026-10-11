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

// Points are counted in "fives": ends adding up to 5 score 1 point, 10 scores 2, 15 scores 3...
export const DEFAULT_TARGET = 20;
export const fivesOf = (pips) => Math.round(pips / 5);

export const emptyBoard = () => ({ center: null, arms: [[], [], [], []] });
export const isSpinnerReady = (board) => !!board?.center && board.arms.every((arm) => arm.length > 0);
export const boardTileCount = (board) => board?.center ? 1 + board.arms.reduce((sum, arm) => sum + arm.length, 0) : 0;
export const boardOpenPip = (board, armIndex) => {
  if (!board?.center) return null;
  const arm = board.arms[armIndex];
  return arm.length ? arm.at(-1)[1] : board.center[0];
};

const bestDouble = (players, hands) => players.reduce((best, player) => {
  const value = Math.max(...hands[player.id].filter(([a, b]) => a === b).map(([a]) => a), -1);
  return value > best.value ? { id: player.id, value } : best;
}, { id: players[0].id, value: -1 });

export function newGame(players, options = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error('Five Tiles needs two to four players.');
  const handSize = players.length === 2 ? 7 : 5;
  const roundNumber = options.roundNumber || 1;
  const openingRound = !options.leadPlayerId;
  let deck, hands, high;
  do {
    deck = shuffle(makeDeck());
    hands = Object.fromEntries(players.map((player) => [player.id, deck.splice(0, handSize)]));
    high = bestDouble(players, hands);
  } while (openingRound && high.value < 0);

  return {
    status: 'playing', players, hands, boneyard: deck, board: emptyBoard(),
    scores: options.scores || Object.fromEntries(players.map((player) => [player.id, 0])),
    turn: options.leadPlayerId || high.id,
    roundStarter: options.leadPlayerId || high.id,
    roundNumber,
    openingDouble: openingRound ? high.value : null,
    lastMove: null,
    winner: null,
    target: options.target || DEFAULT_TARGET,
    createdAt: Date.now(),
  };
}

// Arms that a tile face showing `pip` could connect to. Until all four sides of
// the spinner are filled, only the first empty side is open.
export function endsForPip(board, pip) {
  if (!board?.center) return [];
  const firstEmptyArm = board.arms.findIndex((arm) => arm.length === 0);
  if (firstEmptyArm >= 0) return board.center[0] === pip ? [firstEmptyArm] : [];
  return board.arms.flatMap((arm, index) => arm.at(-1)[1] === pip ? [index] : []);
}

// Arms any tile in `hand` could connect to, whichever way it is turned.
export function playableEnds(hand, board) {
  const ends = new Set();
  for (const tile of hand) for (const pip of new Set(tile)) endsForPip(board, pip).forEach((index) => ends.add(index));
  return [...ends].sort((a, b) => a - b);
}

function nextPlayerId(players, playerId) {
  return players[(players.findIndex((player) => player.id === playerId) + 1) % players.length].id;
}

function scoreEnds(board) {
  if (!isSpinnerReady(board)) return 0;
  return board.arms.reduce((sum, arm) => sum + arm.at(-1)[1], 0);
}

function startNextRound(state, scores, leadPlayerId, lastMove) {
  if (Object.values(scores).some((score) => score >= state.target)) {
    const winner = Object.entries(scores).find(([, score]) => score >= state.target)?.[0];
    return { ...state, scores, turn: winner, status: 'finished', winner, lastMove };
  }
  return {
    // Keep fields the game model doesn't own (a practice game's `local`/`code`); newGame overrides every game field.
    ...state,
    ...newGame(state.players, {
      leadPlayerId,
      roundNumber: state.roundNumber + 1,
      scores,
      target: state.target,
    }),
    lastMove: { ...lastMove, roundWinner: leadPlayerId },
  };
}

export function playTile(state, playerId, tileIndex, armIndex = null) {
  if (state.status !== 'playing' || state.turn !== playerId) throw new Error('It is not your turn.');
  const hand = state.hands[playerId];
  const tile = hand?.[tileIndex];
  if (!tile) throw new Error('That tile is no longer in your hand.');
  let board = { center: state.board.center ? [...state.board.center] : null, arms: state.board.arms.map((arm) => arm.map((placed) => [...placed])) };
  let placedArm = null;
  let position = null;

  if (!board.center) {
    const [a, b] = tile;
    if (a !== b) throw new Error('Open with a double.');
    if (state.openingDouble != null && a !== state.openingDouble) throw new Error(`Open with the ${state.openingDouble}–${state.openingDouble}.`);
    board.center = [...tile];
  } else {
    const legalArms = playableEnds([tile], board);
    placedArm = armIndex == null ? legalArms[0] : armIndex;
    if (!legalArms.includes(placedArm)) throw new Error('That tile does not fit an open side.');
    const arm = board.arms[placedArm];
    const innerPip = arm.length ? arm.at(-1)[1] : board.center[0];
    let oriented;
    if (tile[0] === innerPip) oriented = [tile[0], tile[1]];
    else if (tile[1] === innerPip) oriented = [tile[1], tile[0]];
    else throw new Error('That tile does not match this side.');
    position = arm.length;
    board.arms[placedArm] = [...arm, oriented];
  }

  const hands = { ...state.hands, [playerId]: hand.filter((_, index) => index !== tileIndex) };
  const pointsAtEnds = scoreEnds(board);
  const gained = pointsAtEnds > 0 && pointsAtEnds % 5 === 0 ? fivesOf(pointsAtEnds) : 0;
  const scores = { ...state.scores, [playerId]: state.scores[playerId] + gained };
  const lastMove = { playerId, tile: [...tile], arm: placedArm, position, gained, at: Date.now() };
  const empty = hands[playerId].length === 0;
  if (empty) {
    // Going out: one point per five pips still in opponents' hands.
    const bonus = fivesOf(Object.entries(hands).reduce((sum, [id, tiles]) => id === playerId ? sum : sum + tiles.flat().reduce((total, pip) => total + pip, 0), 0));
    scores[playerId] += bonus;
    lastMove.bonus = bonus;
  }
  if (Object.values(scores).some((score) => score >= state.target)) {
    const winner = Object.entries(scores).find(([, score]) => score >= state.target)?.[0];
    return { ...state, board, hands, scores, turn: winner, status: 'finished', winner, lastMove };
  }
  if (empty) return startNextRound(state, scores, playerId, lastMove);
  return { ...state, board, hands, scores, turn: nextPlayerId(state.players, playerId), status: 'playing', winner: null, lastMove };
}

function finishBlockedRound(state, playerId) {
  const totals = Object.fromEntries(state.players.map((player) => [player.id, state.hands[player.id].flat().reduce((sum, pip) => sum + pip, 0)]));
  const lowest = Math.min(...Object.values(totals));
  const leadPlayerId = state.players.find((player) => totals[player.id] === lowest).id;
  const highest = Math.max(...Object.values(totals));
  const bonus = fivesOf(highest - lowest);
  const scores = { ...state.scores, [leadPlayerId]: state.scores[leadPlayerId] + bonus };
  return startNextRound(state, scores, leadPlayerId, { playerId, blocked: true, bonus, bonusTo: leadPlayerId, at: Date.now() });
}

export function passTurn(state, playerId) {
  if (state.status !== 'playing' || state.turn !== playerId) throw new Error('It is not your turn.');
  const hand = state.hands[playerId];
  if (!state.board.center) {
    const hasOpeningDouble = hand.some(([a, b]) => a === b && (state.openingDouble == null || a === state.openingDouble));
    if (hasOpeningDouble) throw new Error('You have a double to open with.');
    if (state.boneyard.length) {
      const [tile, ...boneyard] = state.boneyard;
      const drewDouble = tile[0] === tile[1];
      return {
        ...state,
        boneyard,
        hands: { ...state.hands, [playerId]: [...hand, tile] },
        turn: drewDouble ? playerId : nextPlayerId(state.players, playerId),
        lastMove: { playerId, drew: true, tile, openingDraw: true, drewDouble, skipped: !drewDouble, at: Date.now() },
      };
    }
    return { ...state, turn: nextPlayerId(state.players, playerId), lastMove: { playerId, passed: true, openingDraw: true, skipped: true, at: Date.now() } };
  }

  if (playableEnds(hand, state.board).length) throw new Error('You have a playable tile.');
  // One draw per turn. If the drawn tile fits, the same player plays it; if not, the turn is skipped.
  if (state.boneyard.length) {
    const [tile, ...boneyard] = state.boneyard;
    const fits = playableEnds([tile], state.board).length > 0;
    return {
      ...state,
      boneyard,
      hands: { ...state.hands, [playerId]: [...hand, tile] },
      turn: fits ? playerId : nextPlayerId(state.players, playerId),
      lastMove: { playerId, drew: true, tile, canPlay: fits, skipped: !fits, at: Date.now() },
    };
  }

  const nextTurn = nextPlayerId(state.players, playerId);
  const allStuck = state.players.every((player) => !playableEnds(state.hands[player.id], state.board).length);
  if (allStuck) return finishBlockedRound(state, playerId);
  return { ...state, turn: nextTurn, lastMove: { playerId, passed: true, at: Date.now() } };
}
