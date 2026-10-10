import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Copy, Crown, Dices, DoorOpen, Link2, LoaderCircle, Plus, RotateCcw, RotateCw, Send, Sparkles, Users, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react';
import { DEFAULT_TARGET, endsForPip, newGame, passTurn, playTile, playableEnds, boardTileCount, isSpinnerReady } from './game';
import { cloudReady } from './firebaseConfig';
import './style.css';
import './tiles.css';

const RULES = [
  ['The goal', `Be the first to reach ${DEFAULT_TARGET} points. With two players, draw 7 dominoes each; with three or four, draw 5. The rest stay in the boneyard.`],
  ['Start a round', 'The first round starts with the highest double. In later rounds, the player who went out last starts and may play any double. If they have no double, they draw exactly one tile; if it is not a double, their turn is skipped.'],
  ['Fill the spinner', 'The opening double goes in the center. Fill all four sides with matching tiles before extending any side. Once all four sides are filled, play outward from any matching open end.'],
  ['Score fives', 'Scoring starts once the center double and all four sides are filled. Add the four open end pips. If the total is a multiple of 5 you score one point for every five: 5 is 1 point, 10 is 2 points, 15 is 3 points, and so on.'],
  ['Draw once', 'If you have no tile that fits, draw exactly one tile from the boneyard. Your turn then ends, even if the new tile would fit. When the boneyard is empty, you pass.'],
  ['End a round', 'A round ends when someone plays their last tile, or when nobody can play. The player who goes out scores one point for every five pips left in opponents’ hands (rounded to the nearest five). In a blocked round, the player with the fewest pips scores the difference the same way.'],
];

// localStorage can throw (private browsing, blocked site data), so never touch it directly.
const ROOM_KEY = 'five-tiles-room';
const store = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch {} },
  remove: (key) => { try { localStorage.removeItem(key); } catch {} },
};

function readableError(error) {
  const code = error?.code || '';
  // Firebase reports a disabled Anonymous provider as admin-restricted-operation.
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Firebase guest access is not enabled. Enable Authentication → Sign-in method → Anonymous for this project.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Firebase is blocking this site. Add ifaarix.github.io under Authentication → Settings → Authorized domains.';
  }
  if (code.includes('requests-from-referer') || code.includes('api-key-not-valid') || code === 'auth/invalid-api-key') {
    return 'The Firebase API key is rejecting this site. In Google Cloud → APIs & Services → Credentials, allow https://ifaarix.github.io/* for the browser key.';
  }
  if (code === 'auth/network-request-failed' || code === 'unavailable') {
    return 'Could not reach Firebase. Check your connection, and that a Cloud Firestore database exists for this project.';
  }
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Firestore denied access. Create the Firestore database and publish the app’s firestore.rules.';
  }
  return error?.message || 'Could not reach the party. Check your connection and try again.';
}

const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const Half = ({ n }) => <span className="half">{PIPS[n].map((p) => <i key={p} className={`pip p${p}`} />)}</span>;

// o says which side the tile's FIRST half sits on: h (left), hr (right), v (top), vr (bottom).
// Size always comes from the --u variable of the surrounding area, never from the tile itself.
function Tile({ tile, o = 'v', onClick, selected = false, dim = false, fresh = false, disabled = false, label, slotKey }) {
  const [a, b] = tile;
  const className = `tile o-${o}${selected ? ' tile-selected' : ''}${dim ? ' tile-dim' : ''}${fresh ? ' tile-new' : ''}`;
  const faces = <><Half n={a} /><Half n={b} /></>;
  if (!onClick) return <div className={className} data-slot={slotKey} role="img" aria-label={label || `${a} and ${b}`}>{faces}</div>;
  return <button type="button" className={className} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={label || `${a} and ${b}`} data-slot={slotKey}>{faces}</button>;
}

const ARM_O = ['vr', 'h', 'v', 'hr']; // top, right, bottom, left: first half always touches the centre
const ARM_NAMES = ['top', 'right', 'bottom', 'left'];
const FIT = { min: 28, max: 46, gap: 0.06 };

function FourArmBoard({ board, boardRef, face, ends, onPlayEnd }) {
  const lens = board.arms.map((arm) => arm.length).join(',');
  // Scale the whole cross (never the tile shape) so it fits the felt, down to a readable minimum.
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el || !board.center) return;
    const fit = () => {
      const [top, right, bottom, left] = board.arms.map((arm) => arm.length + 1); // +1 keeps room for the next tile
      const g = FIT.gap;
      const w = (left + right) * (2 + g) + 2 * g + 2;  // arms + centre + padding, in tile-widths
      const h = (top + bottom) * (2 + g) + 2 * g + 3;
      const u = Math.floor(Math.max(FIT.min, Math.min(FIT.max, el.clientWidth / w, el.clientHeight / h)));
      el.style.setProperty('--bu', `${u}px`);
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [lens, !!board.center]);

  const arm = (index) => {
    const tiles = board.arms[index];
    const o = ARM_O[index];
    const open = !!face && ends.includes(index);
    return <div className={`spinner-arm arm-${index}`} key={index}>
      {tiles.map((tile, i) => <Tile key={i} tile={tile} o={o} slotKey={`${index}-${i}`} />)}
      {open ? <button type="button" className={`ghost o-${o}`} onClick={() => onPlayEnd(index)} aria-label={`Place ${face[1]} and ${face[0]} on the ${ARM_NAMES[index]} branch`} />
        : !tiles.length && <span className={`slot o-${o}`} aria-hidden="true" />}
    </div>;
  };
  return <div className="board-scroll" ref={boardRef} aria-label="Domino board">
    {board.center
      ? <div className="spinner-board">{arm(0)}<div className="spinner-center"><Tile tile={board.center} o="v" slotKey="c" /></div>{arm(1)}{arm(2)}{arm(3)}</div>
      : <div className="empty-board"><span>✳</span><strong>The board is yours</strong><small>Open with a double</small></div>}
  </div>;
}

// Rotation that makes a tile in its landing orientation look like an upright hand tile
// (the pip that touches the board on top), used as the start of the flight.
const FLIGHT_TURN = [180, 90, 0, -90];
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const keepInView = (scroller, el) => {
  const box = scroller.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 14;
  if (r.left < box.left + pad) scroller.scrollLeft -= box.left + pad - r.left; else if (r.right > box.right - pad) scroller.scrollLeft += r.right - (box.right - pad);
  if (r.top < box.top + pad) scroller.scrollTop -= box.top + pad - r.top; else if (r.bottom > box.bottom - pad) scroller.scrollTop += r.bottom - (box.bottom - pad);
};

function buzz() {
  if (navigator.vibrate) navigator.vibrate(14);
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context(), oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 520;
    gain.gain.setValueAtTime(.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .045);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .05);
    oscillator.onended = () => context.close();
  } catch {}
}

function App() {
  const [room, setRoom] = useState(null);
  const [uid, setUid] = useState(null);
  const [name, setName] = useState(store.get('five-tiles-name') || '');
  const [code, setCode] = useState(location.hash.slice(1).toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState('');
  const [picked, setPicked] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [demo, setDemo] = useState(false);
  const [sound, setSound] = useState(false);
  const [expandedRule, setExpandedRule] = useState(0);
  const [pop, setPop] = useState(null);
  const boardRef = useRef(null);
  const handRef = useRef(null);
  const enteredRef = useRef(false);
  const serverRef = useRef(null);   // last room state confirmed by Firestore
  const pendingRef = useRef(false); // a move is on its way to Firestore
  const flightRef = useRef(null);   // where the tile you just played left your hand
  const seenMoveRef = useRef(undefined); // last move already animated (undefined until a real state has been seen)
  const preloadFirebase = () => { if (cloudReady) import('./firebase').catch(() => {}); };
  // Back to the landing page with a clean slate: no leftover modal, saved party or invite hash.
  const resetToHome = (message = '') => { setRoom(null); setUid(null); setDemo(false); setPicked(null); setFlipped(false); setModal(''); setPop(null); setError(message); store.remove(ROOM_KEY); location.hash = ''; serverRef.current = null; pendingRef.current = false; seenMoveRef.current = undefined; };
  // A failed connection while the party is still opening sends the player home with the reason.
  const connectionFailed = (e) => { setError(readableError(e)); setRoom((current) => current?.status === 'connecting' ? null : current); };

  useEffect(() => {
    if (!room?.code || room.local) return;
    let unsub;
    let stopped = false;
    import('./firebase').then(({watchRoom}) => {
      if (!stopped) unsub = watchRoom(room.code, (next) => { serverRef.current = next; if (next) setRoom({...next, local: false}); else resetToHome('That party no longer exists.'); }, connectionFailed);
    }).catch(connectionFailed);
    return () => { stopped = true; unsub?.(); };
  }, [room?.code, room?.local]);
  // Reopen the party after a refresh, or when an invite link is opened by someone who is already seated.
  useEffect(() => {
    const target = (location.hash.slice(1) || store.get(ROOM_KEY) || '').toUpperCase();
    if (!cloudReady || target.length < 4) return;
    let cancelled = false;
    import('./firebase').then(({resumeRoom}) => resumeRoom(target)).then((result) => {
      if (cancelled || enteredRef.current || !result) return;
      enteredRef.current = true;
      setUid(result.uid); setRoom({...result.room, local: false}); location.hash = result.code;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (room?.status === 'finished') setModal('finished'); }, [room?.status]);
  useEffect(() => { setPicked(null); setFlipped(false); }, [room?.turn]);

  const activePlayer = room?.players?.find((p) => p.id === room?.turn);
  const isHost = !!room && (room.local || room.players?.[0]?.id === uid);
  const myTurn = !!room && (room.local ? room.status === 'playing' : room.turn === uid);
  const handOwner = room?.local ? room.turn : uid;
  const hand = room?.hands?.[handOwner] || [];
  const pickedTile = picked == null ? null : hand[picked] || null;
  // The face turned toward the board is the top pip: only the open ends that match it are offered.
  const face = pickedTile ? (flipped ? [pickedTile[1], pickedTile[0]] : pickedTile) : null;
  const possibleEnds = face && room ? endsForPip(room.board, face[0]) : [];
  const canFlip = !!pickedTile && !!room && pickedTile[0] !== pickedTile[1] && endsForPip(room.board, pickedTile[0]).length > 0 && endsForPip(room.board, pickedTile[1]).length > 0;

  // A play is identified by who/where/what, not by timestamp, so the optimistic move and the
  // copy that comes back from Firestore count as the same move and animate only once.
  const lastMove = room?.lastMove;
  const moveSig = lastMove?.tile && !lastMove.drew && room?.board ? `${room.roundNumber}|${lastMove.playerId}|${lastMove.arm}|${lastMove.position}|${lastMove.tile.join('')}` : '';
  useLayoutEffect(() => {
    if (!room || room.status === 'connecting') return;
    if (seenMoveRef.current === undefined) { seenMoveRef.current = moveSig; return; } // first state of this party: nothing to replay
    if (!moveSig || moveSig === seenMoveRef.current) return;
    seenMoveRef.current = moveSig;
    flyIn(lastMove);
  }, [moveSig, room?.status]);

  const flyIn = (move) => {
    const own = flightRef.current; flightRef.current = null;
    const scroller = boardRef.current;
    const dest = scroller?.querySelector(`.tile[data-slot="${move.arm == null ? 'c' : `${move.arm}-${move.position}`}"]`);
    const total = (move.gained || 0) + (move.bonus || 0);
    if (total > 0) {
      const who = room.players?.find((player) => player.id === move.playerId)?.name || 'Player';
      setTimeout(() => setPop({ id: moveSig, text: `${who} scores`, points: total }), dest ? 300 : 0);
      setTimeout(() => setPop((current) => current?.id === moveSig ? null : current), 1700);
    }
    if (!dest || reducedMotion() || !dest.animate) return;
    keepInView(scroller, dest);
    const to = dest.getBoundingClientRect();
    const unit = Math.min(to.width, to.height);
    const turn = FLIGHT_TURN[move.arm ?? 2];
    let from, scale, fade = false;
    if (own?.rect) { from = own.rect; scale = own.rect.width / unit; }
    else {
      const orb = document.querySelector(`[data-pid="${move.playerId}"]`);
      if (!orb) return;
      from = orb.getBoundingClientRect(); scale = Math.max(.25, from.width / unit * .8); fade = true;
    }
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const clone = dest.cloneNode(true);
    clone.removeAttribute('data-slot');
    clone.classList.add('fly-tile');
    clone.style.cssText = `--u:${unit}px;left:${to.left}px;top:${to.top}px`;
    document.body.appendChild(clone);
    dest.style.visibility = 'hidden';
    const lift = Math.min(70, 26 + Math.abs(dy) * .12);
    const finish = () => { clone.remove(); dest.style.visibility = ''; };
    const flight = clone.animate([
      { transform: `translate(${dx}px,${dy}px) rotate(${turn}deg) scale(${scale})`, opacity: fade ? .15 : 1 },
      { transform: `translate(${dx * .45}px,${dy * .45 - lift}px) rotate(${turn * .45}deg) scale(${(scale + 1) / 2 * 1.1})`, opacity: 1, offset: .55 },
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
    ], { duration: 340, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
    flight.onfinish = finish; flight.oncancel = finish;
    setTimeout(finish, 700); // never leave a tile hidden
  };

  const saveName = () => { const value = name.trim(); if (!value) { setError('Add your name to take a seat.'); return false; } store.set('five-tiles-name',value); setName(value); setError(''); return true; };
  const enterRoom = async (fn) => {
    if (!saveName()) return;
    enteredRef.current = true;
    setBusy(true); setError('');
    try {
      const firebase = await import('./firebase');
      const result = await fn(firebase);
      store.set(ROOM_KEY, result.code);
      seenMoveRef.current = undefined;
      setUid(result.uid); setRoom({...result.room, local:false}); location.hash = result.code;
    }
    catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  };
  const create = () => {
    if (!cloudReady) { setError('Online parties are not connected yet. Try a practice game, or connect Firebase to invite friends.'); return; }
    enterRoom((firebase) => firebase.createRoom(name));
  };
  const join = () => {
    if (!cloudReady) { setError('Online parties are not connected yet. Try a practice game, or connect Firebase to invite friends.'); return; }
    if (code.trim().length < 4) { setError('Enter the 5-letter invite code.'); return; }
    enterRoom((firebase) => firebase.joinRoom(code,name));
  };
  const practice = () => {
    if (!saveName()) return;
    enteredRef.current = true;
    const players = [{id:'you',name:name.trim()},{id:'friend',name:'Your friend'}];
    const game = newGame(players);
    seenMoveRef.current = undefined;
    setUid('you'); setDemo(true); setError(''); setPicked(null); setModal('');
    setRoom({...game,code:'PRACTICE',local:true});
  };
  const backHome = () => resetToHome();
  // Moves are applied on screen immediately and confirmed by Firestore in the background,
  // so the game never waits on the network. If the server rejects a move, the table snaps back.
  const doAction = (action, index, end) => {
    if (!room || pendingRef.current || busy) return;
    const actor = room.local ? room.turn : uid;
    let next;
    try { next = action === 'pass' ? passTurn(room, actor) : playTile(room, actor, index, end); }
    catch (e) { setError(readableError(e)); return; }
    setError('');
    const handTile = action === 'pass' ? null : handRef.current?.querySelector(`.tile[data-slot="h${index}"]`);
    flightRef.current = handTile ? { rect: handTile.getBoundingClientRect() } : null;
    setPicked(null); setFlipped(false);
    if (action !== 'pass' && sound) buzz();
    if (room.local) { setRoom(next); return; }
    const before = room;
    pendingRef.current = true;
    setRoom(next);
    import('./firebase').then(({ submitState }) => submitState(room.code, next))
      .catch((e) => { flightRef.current = null; setError(readableError(e)); setRoom(before); })
      .finally(() => { pendingRef.current = false; });
  };
  const chooseTile = (index) => {
    if (!myTurn || busy || !legalIndexes.has(index)) return;
    if (opening) { doAction('play', index, null); return; }
    if (picked === index) {
      // Tapping the lifted tile again: turn it over if the other end also fits somewhere, otherwise place it when there is only one spot.
      if (canFlip) setFlipped((value) => !value);
      else if (possibleEnds.length === 1) doAction('play', index, possibleEnds[0]);
      else { setPicked(null); setFlipped(false); }
      return;
    }
    setPicked(index);
    setFlipped(endsForPip(room.board, hand[index][0]).length === 0);
  };
  const start = async () => {
    setBusy(true);setError('');try { await (await import('./firebase')).startRoom(room.code,uid); } catch(e) { setError(readableError(e)); } finally { setBusy(false); }
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${room.code}`); setCopied(true); setTimeout(()=>setCopied(false),1800); }
    catch { setNotice(`Invite code: ${room.code}`); setTimeout(()=>setNotice(''),2800); }
  };
  const shareInvite = async () => {
    const url = `${location.origin}${location.pathname}#${room.code}`;
    if (navigator.share) { try { await navigator.share({title:'Join my Five Tiles party',text:`Pull up a chair — our party code is ${room.code}`,url}); } catch {} }
    else copyInvite();
  };

  if (!room) return <main className="landing">
    <div className="landing-glow glow-a"/><div className="landing-glow glow-b"/>
    <header className="topbar"><a className="brand" href="#" onClick={(e)=>e.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>five<span className="brand-light">tiles</span></span></a><button className="icon-btn top-help" onClick={()=>setModal('rules')} aria-label="How to play"><CircleHelp size={21}/></button></header>
    <section className="hero"><div className="eyebrow"><span className="live-dot"/> THE PARTY IS OPEN</div><h1>Good friends.<br/>Good <em>dominoes.</em></h1><p className="hero-copy">A little strategy, a little luck, and the people you like best. Pull up a chair.</p>
      <div className="tile-stack" aria-hidden="true"><div className="stack-tile stack-back"><i/><i/><i/><i/></div><div className="stack-tile stack-middle"><i/><i/><i/><i/><i/></div><div className="stack-tile stack-front"><i/><i/><i/><i/><i/><i/></div><span className="spark spark-one">✳</span><span className="spark spark-two">✦</span></div>
    </section>
    <section className="entry-card" aria-label="Join or create a game">
      <label className="field-label" htmlFor="player-name">YOUR NAME</label><input id="player-name" className="name-input" placeholder="What should we call you?" maxLength="18" value={name} onFocus={preloadFirebase} onChange={(e)=>{setName(e.target.value);preloadFirebase();}} onKeyDown={(e)=>e.key==='Enter'&&create()} autoComplete="nickname"/>
      <button className="primary-btn" onClick={create} disabled={busy}><span>{busy?<LoaderCircle className="spin" size={19}/>:<Plus size={19}/>}</span>Create a party <ArrowRight size={18}/></button>
      <div className="divider"><span/>OR JOIN YOUR FRIENDS<span/></div><div className="join-row"><input className="code-input" aria-label="Party invite code" placeholder="INVITE CODE" maxLength="5" value={code} onFocus={preloadFirebase} onChange={(e)=>{setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));preloadFirebase();}} onKeyDown={(e)=>e.key==='Enter'&&join()} /><button className="join-btn" onClick={join} disabled={busy}>Join <ArrowRight size={17}/></button></div>
      <button className="practice-link" onClick={practice}><Dices size={16}/> Just looking? Play a practice game <ArrowRight size={15}/></button>
      {!cloudReady&&<div className="cloud-note"><WifiOff size={14}/> Friend invites will turn on after Firebase is connected.</div>}
      {error&&<p className="error-note" role="alert">{error}</p>}
    </section>
    <footer className="landing-footer"><span><Users size={15}/> 2–4 players</span><span className="footer-dot">·</span><span>About 15 min</span><button onClick={()=>setModal('rules')}><BookOpen size={15}/> How to play</button></footer>
    <div className="version-note">A classic game, made for right now.</div>
    {modal==='rules'&&<RulesModal onClose={()=>setModal('')} expanded={expandedRule} setExpanded={setExpandedRule}/>}
  </main>;

  if (room.status === 'connecting') return <main className="game-shell"><header className="game-header"><a className="brand game-brand" href="#" onClick={(e)=>e.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>five<span className="brand-light">tiles</span></span></a></header><section className="lobby-screen"><div className="eyebrow"><span className="live-dot"/> PARTY CREATED</div><div className="lobby-title"><h1>Opening your<br/>party…</h1><p>Getting everyone a seat.</p></div><span className="loader-line"><LoaderCircle className="spin" size={20}/> Connecting</span><button className="text-btn lobby-exit" onClick={backHome}>Cancel</button></section></main>;

  const myHand = room.local ? room.hands[room.turn] : room.hands?.[uid] || [];
  const opening = !room.board?.center;
  const openingDoubleLegal = (tile) => tile[0]===tile[1] && (room.openingDouble==null || tile[0]===room.openingDouble);
  const canPass = myTurn && room.status==='playing' && !(opening ? myHand.some(openingDoubleLegal) : playableEnds(myHand,room.board).length);
  const legalIndexes = new Set(myHand.flatMap((t,i)=>(opening ? openingDoubleLegal(t) : playableEnds([t],room.board).length)?[i]:[]));

  return <main className="game-shell">
    <header className="game-header"><button className="back-btn" onClick={()=>setModal('leave')} aria-label="Back to home"><ArrowLeft size={19}/></button><a className="brand game-brand" href="#" onClick={(e)=>e.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>five<span className="brand-light">tiles</span></span></a><div className="header-actions"><button className="icon-btn" onClick={()=>setSound(!sound)} aria-label={sound?'Mute play feedback':'Enable play feedback'}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button><button className="icon-btn" onClick={()=>setModal('rules')} aria-label="Rules"><BookOpen size={19}/></button></div></header>
    {room.status==='lobby' ? <section className="lobby-screen"><div className="lobby-top"><span className="eyebrow"><span className="live-dot"/> PARTY IS OPEN</span><span className="room-badge"><Users size={15}/>{room.players?.length||1} / 4</span></div><div className="lobby-title"><div className="overline">YOUR PARTY</div><h1>Invite your<br/>people over.</h1><p>Send the code. They’re just a tap away.</p></div>
      <button className="invite-card" onClick={shareInvite}><span className="invite-caption">PARTY CODE</span><strong>{room.code}</strong><span className="invite-action"><Send size={17}/>{copied?'Copied!':'Share invite'}<ArrowRight size={16}/></span></button>
      <div className="seats-heading"><span>PARTY MEMBERS</span><span>{Math.max(0,4-(room.players?.length||0))} seats open</span></div><div className="seat-grid">{[0,1,2,3].map((i)=>{const player=room.players?.[i];return <div key={i} className={`seat ${player?'seat-filled':''}`}><span className="seat-avatar">{player?player.name.slice(0,1).toUpperCase():<Plus size={17}/>}</span><span className="seat-name">{player?.name||'Waiting…'}</span>{player?.id===room.players?.[0]?.id&&<span className="host-tag">HOST</span>}</div>})}</div>
      {demo&&<div className="setup-hint"><WifiOff size={17}/> Practice game is only on this device. Share a link after Firebase is connected.</div>}
      <button className="primary-btn lobby-start" onClick={()=>demo?setRoom({...room,status:'playing'}):start()} disabled={busy||(!demo&&room.players?.length<2)||(!demo&&!isHost)}><span>{busy?<LoaderCircle className="spin" size={19}/>:<Sparkles size={18}/>}</span>{!demo&&!isHost?'Waiting for the host…':room.players?.length<2&&!demo?'Waiting for a friend…':'Let’s play'}<ArrowRight size={18}/></button>
      <button className="text-btn lobby-exit" onClick={backHome}>Leave party</button>{error&&<p className="error-note" role="alert">{error}</p>}
    </section> : <section className="table-screen">
      <div className="table-topline"><span className="round-label"><span className="live-dot"/>{room.status==='finished'?'GAME OVER':`GAME TO ${room.target||DEFAULT_TARGET}`}</span><button className="share-mini" onClick={copyInvite}><Link2 size={15}/>{room.code}{copied&&<Check size={14}/>}</button></div>
      <div className="score-strip">{room.players?.map((p,i)=><div key={p.id} className={`score-player ${p.id===room.turn?'score-active':''}`}><span className={`player-orb orb-${i}`} data-pid={p.id}>{p.name.slice(0,1).toUpperCase()}</span><div className="score-info"><span className="score-name">{p.name}{p.id===uid?' (you)':''}{p.id===room.players[0].id&&<Crown size={12}/>}</span><strong>{room.scores?.[p.id]||0}<small> pts</small></strong></div><span className="tile-count">{room.hands?.[p.id]?.length??0} <span>tiles</span></span></div>)}</div>
      <div className="table-felt"><div className="felt-top"><span>ROUND {room.roundNumber||1} · {boardTileCount(room.board)} PLAYED</span><span>{isSpinnerReady(room.board)?'ENDS SCORE IN FIVES':'FILL 4 SIDES TO SCORE'}</span></div>
        <FourArmBoard board={room.board} boardRef={boardRef} face={face} ends={possibleEnds} onPlayEnd={(end)=>doAction('play',picked,end)}/>
        {pop&&<div className="gain-pop" key={pop.id}>{pop.text} <b>+{pop.points}</b></div>}
        <div className="open-ends">{isSpinnerReady(room.board)?room.board.arms.map((a,i)=><span key={i} className={possibleEnds.includes(i)?'match':''}><i/>{['↑','→','↓','←'][i]} {a.at(-1)[1]} open</span>):<span>{room.board.center?'Fill the remaining sides of the double':'The opening double goes in the center'}</span>}</div></div>
      <div className={`turn-callout ${myTurn?'your-turn':''}`}>{room.status==='finished'?<><Crown size={17}/>{room.players.find(p=>p.id===room.winner)?.name} wins this party!</>:myTurn?<><span className="turn-pulse"/>Your turn <span className="turn-sub">{legalIndexes.size?'Choose a tile to play':opening?'No double — draw one; a non-double skips your turn':room.boneyard?.length?'No match — draw one tile, then play passes':'No match — pass'}</span></>:<><span className="turn-pulse waiting"/>{activePlayer?.name||'A friend'} is playing<span className="turn-sub">Good things take a moment</span></>}</div>
      {room.status==='playing'&&<><div className="hand-heading"><span>{myTurn?'YOUR TILES':`${activePlayer?.name?.toUpperCase()||'PLAYER'}’S TILES`}</span><span>{hand.length} left</span></div>
        <div className="hand-scroll" ref={handRef} aria-label="Your dominoes">{hand.map((tile,i)=><Tile key={tile.join('')} tile={picked===i&&face?face:tile} o="v" slotKey={`h${i}`} selected={picked===i} dim={myTurn&&!legalIndexes.has(i)} fresh={!!lastMove?.drew&&lastMove.playerId===handOwner&&i===hand.length-1} disabled={!myTurn||busy||!legalIndexes.has(i)} onClick={()=>chooseTile(i)} label={`Select ${tile[0]} and ${tile[1]} domino`}/>)}</div>
        {picked!=null&&<div className="end-chooser"><span>{possibleEnds.length>1?'Tap a yellow outline to place it':'Tap the yellow outline, or the tile again, to place it'}</span>{canFlip&&<button type="button" onClick={()=>setFlipped((value)=>!value)}><RotateCw size={14}/>Flip</button>}</div>}
        <div className="table-controls">{canPass?<button className="pass-btn" onClick={()=>doAction('pass')}>{opening?(room.boneyard?.length?<><Dices size={16}/> Draw one (skip if not a double)</>:<><ArrowDownLeft size={16}/> Skip turn</>):room.boneyard?.length?<><Dices size={16}/> Draw a tile</>:<><ArrowDownLeft size={16}/> Pass turn</>}</button>:<span className="hint-text">{picked==null&&<><Sparkles size={14}/>{opening?'Tap an eligible double to open':'Tap a matching domino to select'}</>}</span>}<button className="rules-mini" onClick={()=>setModal('rules')}><BookOpen size={15}/> Rules</button></div></>}
      {error&&<p className="error-note game-error" role="alert">{error}</p>}
    </section>}
    {notice&&<div className="toast"><Check size={16}/>{notice}</div>}
    {modal==='rules'&&<RulesModal onClose={()=>setModal('')} expanded={expandedRule} setExpanded={setExpandedRule}/>}
    {modal==='leave'&&<div className="modal-scrim" onClick={()=>setModal('')}><div className="modal-card leave-card" onClick={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal('')}><X size={20}/></button><span className="modal-icon"><DoorOpen size={23}/></span><h2>Head home?</h2><p>{room.local?'This practice game will reset.':'You can come back with the party code.'}</p><button className="primary-btn" onClick={backHome}><span><ArrowLeft size={17}/></span>Leave party</button><button className="text-btn" onClick={()=>setModal('')}>Stay and play</button></div></div>}
    {modal==='finished'&&<div className="modal-scrim"><div className="modal-card leave-card"><span className="modal-icon winner-icon"><Crown size={24}/></span><span className="eyebrow">THAT’S A WRAP</span><h2>{room.players.find(p=>p.id===room.winner)?.name} takes it!</h2><p>Good game. The next one’s yours.</p><button className="primary-btn" onClick={backHome}><span><RotateCcw size={17}/></span>Back to parties</button></div></div>}
  </main>;
}

function RulesModal({onClose,expanded,setExpanded}) { return <div className="modal-scrim" onClick={onClose}><section className="modal-card rules-card" onClick={(e)=>e.stopPropagation()}><div className="rules-top"><span className="modal-icon"><BookOpen size={22}/></span><button className="modal-close" onClick={onClose} aria-label="Close rules"><X size={20}/></button></div><span className="eyebrow">THE QUICK GUIDE</span><h2>How to play<br/><em>Five Tiles.</em></h2><p className="rules-intro">The classic domino game with a satisfying little twist: make the ends add up to five.</p><div className="rules-list">{RULES.map(([title,body],i)=><button key={title} className={`rule-item ${expanded===i?'rule-open':''}`} onClick={()=>setExpanded(expanded===i?-1:i)}><span className="rule-number">0{i+1}</span><span className="rule-copy"><strong>{title}</strong>{expanded===i&&<small>{body}</small>}</span><ChevronDown size={17}/></button>)}</div><div className="rules-foot"><span><Sparkles size={14}/> That’s the gist. Now make it yours.</span><button className="primary-btn" onClick={onClose}><span><Check size={18}/></span>Got it</button></div></section></div> }

createRoot(document.getElementById('root')).render(<App/>);
