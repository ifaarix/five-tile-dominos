import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, getFirestore, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { emptyBoard, newGame, passTurn, playTile } from './game';
import { decodeRoomState, encodeRoomState, isMember, planJoin, roomFromFirestore } from './roomStorage';
import { firebaseConfig, cloudReady } from './firebaseConfig';

let db, auth, userPromise;
// Players only enter a display name. Firebase uses an anonymous identity
// behind the scenes so Firestore can enforce room membership. A failed
// sign-in is not cached, so the next action retries instead of staying broken.
const ensureUser = () => {
  if (!userPromise) userPromise = signInAnonymously(auth).catch((error) => { userPromise = null; throw error; });
  return userPromise;
};
if (cloudReady) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  ensureUser().catch(() => {}); // warm up; real actions retry and show the error
}
const currentUid = async () => (await ensureUser()).user.uid;
const roomRef = (code) => doc(db, 'rooms', code);
// 32 unambiguous characters (no 0/O/1/I), so 5 random bytes always give a full 5-character code.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
export function watchRoom(code, callback, onError) {
  return onSnapshot(roomRef(code), (snap) => callback(snap.exists() ? roomFromFirestore(snap.id, snap.data()) : null), onError);
}
export async function createRoom(name) {
  const uid = await currentUid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const ref = roomRef(code);
    const player = { id: uid, name: name.trim().slice(0, 18), joinedAt: Date.now() };
    const state = { status: 'lobby', players: [player], hands: {}, board: emptyBoard(), scores: {}, turn: null, target: 100, createdAt: Date.now() };
    const created = await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return false;
      tx.set(ref, encodeRoomState({ ...state, updatedAt: serverTimestamp() }));
      return true;
    });
    if (created) return { code, uid };
  }
  throw new Error('Could not make a room code. Please try again.');
}
export async function joinRoom(codeInput, name) {
  const uid = await currentUid();
  const code = codeInput.trim().toUpperCase();
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code), snap = await tx.get(ref);
    const state = snap.exists() ? snap.data() : null;
    if (planJoin(state, uid) === 'add') tx.update(ref, { players: [...state.players, { id: uid, name: name.trim().slice(0, 18), joinedAt: Date.now() }] });
  });
  return { code, uid };
}
// Reopen a party this device is already seated in (page refresh, closed tab).
// Returns null when the room is missing or this device is not a member.
export async function resumeRoom(codeInput) {
  const uid = await currentUid();
  const code = codeInput.trim().toUpperCase();
  const snap = await getDoc(roomRef(code));
  return snap.exists() && isMember(snap.data(), uid) ? { code, uid } : null;
}
export async function startRoom(code, uid) {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code), snap = await tx.get(ref), room = snap.data();
    if (!room || room.players[0]?.id !== uid) throw new Error('Only the party host can start this game.');
    if (room.players.length < 2) throw new Error('Invite at least one friend first.');
    tx.set(ref, encodeRoomState({ ...newGame(room.players), updatedAt: serverTimestamp() }));
  });
}
export async function takeTurn(code, action, uid, tileIndex, end) {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code), snap = await tx.get(ref), state = decodeRoomState(snap.data());
    if (!state) throw new Error('This room has closed.');
    const next = action === 'pass' ? passTurn(state, uid) : playTile(state, uid, tileIndex, end);
    tx.set(ref, encodeRoomState({ ...next, updatedAt: serverTimestamp() }));
  });
}
