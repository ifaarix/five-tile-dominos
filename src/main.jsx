import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Copy, Crown, Dices, DoorOpen, Link2, LoaderCircle, Plus, RotateCcw, Send, Sparkles, Users, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react';
import { newGame, passTurn, playTile, playableEnds, boardOpenPip, boardTileCount, isSpinnerReady } from './game';
import { cloudReady } from './firebaseConfig';
import './style.css';

const RULES = [
  ['The goal', 'Be the first to reach 100 points. With two players, draw 7 dominoes each; with three or four, draw 5. The rest stay in the boneyard.'],
  ['Start a round', 'The first round starts with the highest double. In later rounds, the player who went out last starts and may play any double. If they have no double, they draw exactly one tile; if it is not a double, their turn is skipped.'],
  ['Fill the spinner', 'The opening double goes in the center. Fill all four sides with matching tiles before extending any side. Once all four sides are filled, play outward from any matching open end.'],
  ['Score fives', 'Scoring starts after the center double and all four sides are filled (five tiles total). Add the four exposed end pips; a multiple of 5 scores that many points.'],
  ['End a round', 'A round ends when someone plays their last tile, or when nobody can play. The player who goes out scores the pips left in opponents’ hands. In a blocked round, the player with the fewest pips scores the difference. First to 100 wins.'],
  ['House rules', 'This party uses your four-sided opening spinner rule. Play to 100; when a round is blocked, the player with the fewest pips scores the difference and starts the next round.'],
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

function Tile({ tile, onClick, selected = false, small = false, orientation = 'horizontal', target = false, disabled = false, label }) {
  const [a,b] = tile;
  const patterns = {0:[],1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  const face = (n) => <span className="pip-face">{Array.from({length:9},(_,i)=><i key={i} className={patterns[n].includes(i)?'pip on':'pip'} />)}</span>;
  return <button type="button" className={`tile ${small?'tile-small':''} ${small?`tile-${orientation}`:''} ${selected?'tile-selected':''} ${target?'tile-target':''} ${disabled?'tile-disabled':''}`} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={label || `${a} and ${b}`}>
    {face(a)}<span className="tile-rule" />{face(b)}
  </button>;
}

function FourArmBoard({board, onRef, selectedTile, legalEnds = [], onPlayEnd}) {
  const orientations = ['vertical-reverse','horizontal','vertical','horizontal-reverse'];
  const arm = (tiles, index) => <div className={`spinner-arm arm-${index}`} key={index}>
    {tiles.map((tile,i)=><Tile key={`${index}-${i}-${tile.join('')}`} tile={tile} small orientation={orientations[index]} disabled/>)}
    {selectedTile && legalEnds.includes(index) && <Tile tile={selectedTile[0]===boardOpenPip(board,index)?selectedTile:[selectedTile[1],selectedTile[0]]} small orientation={orientations[index]} target onClick={()=>onPlayEnd(index)} label={`Place ${selectedTile[0]} and ${selectedTile[1]} on the ${['top','right','bottom','left'][index]} branch`}/>}
    {!tiles.length&&!legalEnds.includes(index)&&<span className="arm-slot" aria-label="Open spinner side"/>}
  </div>;
  return <div className="board-scroll" ref={onRef} aria-label="Domino board, scroll to view all tiles">
    <div className="spinner-board">
      {arm(board.arms[0],0)}<div className="spinner-center">{board.center?<Tile tile={board.center} small orientation="vertical" disabled/>:<div className="empty-board"><span>✳</span><strong>The board is yours</strong><small>Open with a double</small></div>}</div>{arm(board.arms[1],1)}{arm(board.arms[2],2)}{arm(board.arms[3],3)}
    </div>
  </div>;
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
  const boardRef = useRef(null);
  const enteredRef = useRef(false);
  const preloadFirebase = () => { if (cloudReady) import('./firebase').catch(() => {}); };
  // Back to the landing page with a clean slate: no leftover modal, saved party or invite hash.
  const resetToHome = (message = '') => { setRoom(null); setUid(null); setDemo(false); setPicked(null); setFlipped(false); setModal(''); setError(message); store.remove(ROOM_KEY); location.hash = ''; };
  // A failed connection while the party is still opening sends the player home with the reason.
  const connectionFailed = (e) => { setError(readableError(e)); setRoom((current) => current?.status === 'connecting' ? null : current); };

  useEffect(() => {
    if (!room?.code || room.local) return;
    let unsub;
    let stopped = false;
    import('./firebase').then(({watchRoom}) => {
      if (!stopped) unsub = watchRoom(room.code, (next) => next ? setRoom(next) : resetToHome('That party no longer exists.'), connectionFailed);
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
      setUid(result.uid); setRoom({code: result.code, local: false, status: 'connecting'}); location.hash = result.code;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (room?.board?.center) boardRef.current?.scrollTo({left: boardRef.current.scrollWidth/2, top: boardRef.current.scrollHeight/2, behavior:'smooth'});
  }, [room?.board?.center, room?.board?.arms?.map(a=>a.length).join(',')]);
  useEffect(() => { if (room?.status === 'finished') setModal('finished'); }, [room?.status]);
  useEffect(() => { setPicked(null); setFlipped(false); }, [room?.turn]);

  const activePlayer = room?.players?.find((p) => p.id === room?.turn);
  const isHost = !!room && (room.local || room.players?.[0]?.id === uid);
  const myTurn = !!room && (room.local ? room.status === 'playing' : room.turn === uid);
  const handOwner = room?.local ? room.turn : uid;
  const hand = room?.hands?.[handOwner] || [];
  const possibleEnds = picked == null || !room ? [] : playableEnds([hand[picked]], room.board);

  const saveName = () => { const value = name.trim(); if (!value) { setError('Add your name to take a seat.'); return false; } store.set('five-tiles-name',value); setName(value); setError(''); return true; };
  const enterRoom = async (fn) => {
    if (!saveName()) return;
    enteredRef.current = true;
    setBusy(true); setError('');
    try {
      const firebase = await import('./firebase');
      const result = await fn(firebase);
      store.set(ROOM_KEY, result.code);
      setUid(result.uid); setRoom({code:result.code, local:false, status:'connecting'}); location.hash = result.code;
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
    setUid('you'); setDemo(true); setError(''); setPicked(null); setModal('');
    setRoom({...game,code:'PRACTICE',local:true});
  };
  const backHome = () => resetToHome();
  const doAction = async (action, index, end) => {
    if (!room || busy) return;
    setBusy(true); setError('');
    try {
      if (room.local) {
        // Work the move out first so an illegal one is caught below instead of crashing the render.
        setRoom(action==='pass' ? passTurn(room, room.turn) : playTile(room, room.turn, index, end));
      }
      else await (await import('./firebase')).takeTurn(room.code,action,uid,index,end);
      setPicked(null);
      if (action !== 'pass' && sound) {
        if (navigator.vibrate) navigator.vibrate(14);
        try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { const context = new Audio(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 520; gain.gain.setValueAtTime(.035,context.currentTime); gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.045); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime+.05); oscillator.onended=()=>context.close(); } } catch {}
      }
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  };
  const chooseTile = (index) => {
    if (!myTurn || busy || !legalIndexes.has(index)) return;
    if (opening) { doAction('play',index,null); return; }
    if (picked === index) {
      if (possibleEnds.length > 1) setFlipped((value) => !value);
      else { setPicked(null); setFlipped(false); }
    } else {
      setPicked(index);
      setFlipped(false);
    }
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
      <div className="table-topline"><span className="round-label"><span className="live-dot"/>{room.status==='finished'?'GAME OVER':'GAME TO 100'}</span><button className="share-mini" onClick={copyInvite}><Link2 size={15}/>{room.code}{copied&&<Check size={14}/>}</button></div>
      <div className="score-strip">{room.players?.map((p,i)=><div key={p.id} className={`score-player ${p.id===room.turn?'score-active':''}`}><span className={`player-orb orb-${i}`}>{p.name.slice(0,1).toUpperCase()}</span><div className="score-info"><span className="score-name">{p.name}{p.id===uid?' (you)':''}{p.id===room.players[0].id&&<Crown size={12}/>}</span><strong>{room.scores?.[p.id]||0}<small> pts</small></strong></div><span className="tile-count">{room.hands?.[p.id]?.length??0} <span>tiles</span></span></div>)}</div>
      <div className="table-felt"><div className="felt-top"><span>ROUND {room.roundNumber||1} · {boardTileCount(room.board)} {boardTileCount(room.board)===1?'tile':'tiles'} played</span><span>{isSpinnerReady(room.board)?'ENDS SCORE IN FIVES':'FILL ALL FOUR SIDES TO START SCORING'}</span></div><FourArmBoard board={room.board} onRef={boardRef} selectedTile={picked==null?null:(flipped?[hand[picked][1],hand[picked][0]]:hand[picked])} legalEnds={possibleEnds} onPlayEnd={(end)=>doAction('play',picked,end)}/><div className="open-ends">{isSpinnerReady(room.board)?room.board.arms.map((a,i)=><span key={i}><i/>{a.at(-1)[1]} open</span>):<span>{room.board.center?'Fill the remaining sides of the double':'The opening double goes in the center'}</span>}</div></div>
      <div className={`turn-callout ${myTurn?'your-turn':''}`}>{room.status==='finished'?<><Crown size={17}/>{room.players.find(p=>p.id===room.winner)?.name} wins this party!</>:myTurn?<><span className="turn-pulse"/>Your turn <span className="turn-sub">{legalIndexes.size?'Choose a tile to play':opening?'No double — draw one; a non-double skips your turn':'No match — draw or pass'}</span></>:<><span className="turn-pulse waiting"/>{activePlayer?.name||'A friend'} is playing<span className="turn-sub">Good things take a moment</span></>}</div>
      {room.status==='playing'&&<><div className="hand-heading"><span>{myTurn?'YOUR TILES':`${activePlayer?.name?.toUpperCase()||'PLAYER'}’S TILES`}</span><span>{hand.length} left</span></div><div className="hand-scroll" aria-label="Your dominoes">{hand.map((tile,i)=><Tile key={`${tile.join('')}-${i}`} tile={picked===i&&flipped?[tile[1],tile[0]]:tile} selected={picked===i} disabled={!myTurn||busy||!legalIndexes.has(i)} onClick={()=>chooseTile(i)} label={`Select ${tile[0]} and ${tile[1]} domino`}/>)}</div>
      {picked!=null&&<div className="end-chooser"><span>{possibleEnds.length>1?(flipped?'Flipped · tap a yellow domino to place':'Tap the tile again to flip, or choose a yellow domino'):('Tap the yellow domino on the board to place')}</span></div>}
      <div className="table-controls">{canPass?<button className="pass-btn" onClick={()=>doAction('pass')}>{opening?(room.boneyard?.length?<><Dices size={16}/> Draw one (skip if not a double)</>:<><ArrowDownLeft size={16}/> Skip turn</>):room.boneyard?.length?<><Dices size={16}/> Draw a tile</>:<><ArrowDownLeft size={16}/> Pass turn</>}</button>:<span className="hint-text"><Sparkles size={14}/>{opening?'Tap an eligible double to open':picked!=null?'Tap a yellow domino to place':'Tap a matching domino to select'}</span>}<button className="rules-mini" onClick={()=>setModal('rules')}><BookOpen size={15}/> Rules</button></div></>}
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
