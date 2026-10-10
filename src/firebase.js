import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { newGame, passTurn, playTile } from './game';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB1r_jEyqXh5sZmmxh_znrIhRpc8-ZgblQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'funnn-c0f93.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'funnn-c0f93',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1041639511434:web:1b94e315c85fd4e4372473',
};
export const cloudReady = Object.values(config).every(Boolean);
let db, auth, userPromise;
if (cloudReady) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  userPromise = signInAnonymously(auth);
}
export const currentUid = async () => (await userPromise)?.user.uid;
const roomRef = (code) => doc(db, 'rooms', code);
export function watchRoom(code, callback, onError) {
  return onSnapshot(roomRef(code), (snap) => callback(snap.exists() ? snap.data() : null), onError);
}
export async function createRoom(name) {
  const uid = await currentUid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    const ref = roomRef(code);
    const player = { id: uid, name: name.trim().slice(0, 18), joinedAt: Date.now() };
    const state = { status: 'lobby', players: [player], hands: {}, board: [], scores: {}, turn: null, target: 100, createdAt: Date.now() };
    const created = await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return false;
      tx.set(ref, { ...state, updatedAt: serverTimestamp() });
      return true;
    });
    if (created) return { code, uid };
  }
  throw new Error('Could not make a room code. Please try again.');
}
export async function joinRoom(codeInput, name) {
  const uid = await currentUid(), code = codeInput.trim().toUpperCase();
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code), snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found. Check the invite code.');
    const state = snap.data();
    if (state.status !== 'lobby' || state.players.length >= 4) throw new Error('This table is full or already playing.');
    if (!state.players.some((p) => p.id === uid)) tx.update(ref, { players: [...state.players, { id: uid, name: name.trim().slice(0, 18), joinedAt: Date.now() }] });
  });
  return { code, uid };
}
export async function startRoom(code, uid) {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code), snap = await tx.get(ref), room = snap.data();
    if (!room || room.players[0]?.id !== uid) throw new Error('Only the host can start this table.');
    if (room.players.length < 2) throw new Error('Invite at least one friend first.');
    tx.set(ref, { ...newGame(room.players), updatedAt: serverTimestamp() });
  });
}
export async function takeTurn(code, action, uid, tileIndex, end) {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code), snap = await tx.get(ref), state = snap.data();
    if (!state) throw new Error('This room has closed.');
    const next = action === 'pass' ? passTurn(state, uid) : playTile(state, uid, tileIndex, end);
    tx.set(ref, { ...next, updatedAt: serverTimestamp() });
  });
}
