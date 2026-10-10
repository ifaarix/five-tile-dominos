const ARM_NAMES = ['top', 'right', 'bottom', 'left'];

const packTile = ([a, b]) => ({ a, b });
const unpackTile = (tile) => Array.isArray(tile) ? tile : [tile.a, tile.b];

// Firestore rejects arrays nested inside arrays. Keep the game model's
// [pip, pip] tiles in memory, but persist tiles as flat objects instead.
export function encodeRoomState(state) {
  const encoded = { ...state };
  if (state.board) {
    encoded.board = {
      center: state.board.center ? packTile(state.board.center) : null,
      arms: Object.fromEntries(ARM_NAMES.map((name, index) => [name, state.board.arms[index].map(packTile)])),
    };
  }
  if (state.hands) {
    encoded.hands = Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, hand.map(packTile)]));
  }
  if (state.boneyard) encoded.boneyard = state.boneyard.map(packTile);
  if (state.lastMove?.tile) encoded.lastMove = { ...state.lastMove, tile: packTile(state.lastMove.tile) };
  return encoded;
}

export function decodeRoomState(state) {
  if (!state) return state;
  const decoded = { ...state };
  if (state.board) {
    const legacyEmptyBoard = Array.isArray(state.board);
    decoded.board = legacyEmptyBoard ? { center: null, arms: [[], [], [], []] } : {
      center: state.board.center ? unpackTile(state.board.center) : null,
      arms: ARM_NAMES.map((name, index) => {
        const storedArm = Array.isArray(state.board.arms)
          ? state.board.arms[index]
          : state.board.arms?.[name];
        return (storedArm || []).map(unpackTile);
      }),
    };
  }
  if (state.hands) {
    decoded.hands = Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, hand.map(unpackTile)]));
  }
  if (state.boneyard) decoded.boneyard = state.boneyard.map(unpackTile);
  if (state.lastMove?.tile) decoded.lastMove = { ...state.lastMove, tile: unpackTile(state.lastMove.tile) };
  return decoded;
}

export function roomFromFirestore(id, state) {
  return state ? { ...decodeRoomState(state), code: id } : null;
}
