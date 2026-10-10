import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Copy, Crown, Dices, DoorOpen, Link2, LoaderCircle, Plus, RotateCcw, Send, Sparkles, Users, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react';
import { newGame, passTurn, playTile, playableEnds } from './game';
import { cloudReady } from './firebaseConfig';
import './style.css';

const RULES = [
  ['The goal', 'Be the first to reach 100 points. With two players, draw 7 dominoes each; with three or four, draw 5. The rest stay in the boneyard.'],
  ['Start the chain', 'The player holding the highest double starts: double-six, then double-five, and so on. If no one has a double, shuffle and deal again.'],
  ['Make a play', 'Match one end of a domino to either open end of the chain. Turn the tile around if you need to. If you can’t play, draw from the boneyard; if it’s empty, pass.'],
  ['Score fives', 'After each play, add the pips showing on both open ends. When their total is a multiple of 5, score that many points. A total of 10 earns 10, a total of 5 earns 5.'],
  ['End a round', 'A round ends when someone plays their last tile, or when nobody can play. The player who goes out scores the pips left in opponents’ hands. In a blocked round, the player with the fewest pips scores the difference. First to 100 wins.'],
  ['House rules', 'Five Tiles (Muggins / Five-Up) has friendly variations around the table. This version uses a double-six set, fives scoring, and a 100-point game. Doubles are placed crosswise in the classic game; this digital table keeps the chain tidy and easy to read on a phone.'],
];

function Tile({ tile, onClick, selected = false, small = false, disabled = false, label }) {
  const [a,b] = tile;
  const patterns = {0:[],1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  const face = (n) => <span className="pip-face">{Array.from({length:9},(_,i)=><i key={i} className={patterns[n].includes(i)?'pip on':'pip'} />)}</span>;
  return <button type="button" className={`tile ${small?'tile-small':''} ${selected?'tile-selected':''} ${disabled?'tile-disabled':''}`} onClick={onClick} disabled={disabled} aria-label={label || `${a} and ${b}`}>
    {face(a)}<span className="tile-rule" />{face(b)}
  </button>;
}

function App() {
  const [room, setRoom] = useState(null);
  const [uid, setUid] = useState(null);
  const [name, setName] = useState(localStorage.getItem('five-tiles-name') || '');
  const [code, setCode] = useState(location.hash.slice(1).toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState('');
  const [picked, setPicked] = useState(null);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [demo, setDemo] = useState(false);
  const [sound, setSound] = useState(false);
  const [expandedRule, setExpandedRule] = useState(0);
  const boardRef = useRef(null);

  useEffect(() => {
    if (!room?.code || room.local) return;
    let unsub;
    let stopped = false;
    import('./firebase').then(({watchRoom}) => {
      if (!stopped) unsub = watchRoom(room.code, setRoom, (e) => setError(e.message || 'Lost connection to this table.'));
    }).catch((e) => setError(e.message || 'Could not connect to this table.'));
    return () => { stopped = true; unsub?.(); };
  }, [room?.code, room?.local]);
  useEffect(() => {
    if (room?.board?.length) boardRef.current?.scrollTo({left: boardRef.current.scrollWidth, behavior:'smooth'});
  }, [room?.board?.length]);
  useEffect(() => { if (room?.status === 'finished') setModal('finished'); }, [room?.status]);
  useEffect(() => { setPicked(null); }, [room?.turn]);

  const activePlayer = room?.players?.find((p) => p.id === room?.turn);
  const myTurn = !!room && (room.local ? room.status === 'playing' : room.turn === uid);
  const handOwner = room?.local ? room.turn : uid;
  const hand = room?.hands?.[handOwner] || [];
  const possibleEnds = picked == null || !room ? [] : playableEnds([hand[picked]], room.board);

  const saveName = () => { const value = name.trim(); if (!value) { setError('Add your name to take a seat.'); return false; } localStorage.setItem('five-tiles-name',value); setName(value); setError(''); return true; };
  const enterRoom = async (fn) => {
    if (!saveName()) return;
    setBusy(true); setError('');
    try { const result = await fn(); setUid(result.uid); setRoom({code:result.code, local:false}); location.hash = result.code; }
    catch (e) { setError(e.message || 'Could not reach the table. Check the code and try again.'); }
    finally { setBusy(false); }
  };
  const create = () => {
    if (!cloudReady) { setError('Online tables are not connected yet. Try a practice table, or connect Firebase to invite friends.'); return; }
    enterRoom(async () => (await import('./firebase')).createRoom(name));
  };
  const join = () => {
    if (!cloudReady) { setError('Online tables are not connected yet. Try a practice table, or connect Firebase to invite friends.'); return; }
    if (code.trim().length < 4) { setError('Enter the 5-letter invite code.'); return; }
    enterRoom(async () => (await import('./firebase')).joinRoom(code,name));
  };
  const practice = () => {
    if (!saveName()) return;
    const players = [{id:'you',name:name.trim()},{id:'friend',name:'Your friend'}];
    const game = newGame(players);
    setUid('you'); setDemo(true); setError(''); setPicked(null); setModal('');
    setRoom({...game,code:'PRACTICE',local:true});
  };
  const backHome = () => { setRoom(null); setUid(null); setDemo(false); setPicked(null); setError(''); location.hash=''; };
  const doAction = async (action, index, end) => {
    if (!room || busy) return;
    setBusy(true); setError('');
    try {
      if (room.local) setRoom((state) => action==='pass'?passTurn(state,state.turn):playTile(state,state.turn,index,end));
      else await (await import('./firebase')).takeTurn(room.code,action,uid,index,end);
      setPicked(null);
      if (action !== 'pass' && sound) {
        if (navigator.vibrate) navigator.vibrate(14);
        try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { const context = new Audio(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 520; gain.gain.setValueAtTime(.035,context.currentTime); gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.045); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime+.05); oscillator.onended=()=>context.close(); } } catch {}
      }
    } catch (e) { setError(e.message || 'That play didn’t go through.'); }
    finally { setBusy(false); }
  };
  const start = async () => {
    setBusy(true);setError('');try { await (await import('./firebase')).startRoom(room.code,uid); } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${room.code}`); setCopied(true); setTimeout(()=>setCopied(false),1800); }
    catch { setNotice(`Invite code: ${room.code}`); setTimeout(()=>setNotice(''),2800); }
  };
  const shareInvite = async () => {
    const url = `${location.origin}${location.pathname}#${room.code}`;
    if (navigator.share) { try { await navigator.share({title:'Join my Five Tiles table',text:`Pull up a chair — our code is ${room.code}`,url}); } catch {} }
    else copyInvite();
  };

  if (!room) return <main className="landing">
    <div className="landing-glow glow-a"/><div className="landing-glow glow-b"/>
    <header className="topbar"><a className="brand" href="#" onClick={(e)=>e.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>five<span className="brand-light">tiles</span></span></a><button className="icon-btn top-help" onClick={()=>setModal('rules')} aria-label="How to play"><CircleHelp size={21}/></button></header>
    <section className="hero"><div className="eyebrow"><span className="live-dot"/> THE TABLE IS OPEN</div><h1>Good friends.<br/>Good <em>dominoes.</em></h1><p className="hero-copy">A little strategy, a little luck, and the people you like best. Pull up a chair.</p>
      <div className="tile-stack" aria-hidden="true"><div className="stack-tile stack-back"><i/><i/><i/><i/></div><div className="stack-tile stack-middle"><i/><i/><i/><i/><i/></div><div className="stack-tile stack-front"><i/><i/><i/><i/><i/><i/></div><span className="spark spark-one">✳</span><span className="spark spark-two">✦</span></div>
    </section>
    <section className="entry-card" aria-label="Join or create a game"><label className="field-label" htmlFor="player-name">YOUR NAME</label><input id="player-name" className="name-input" placeholder="What should we call you?" maxLength="18" value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&create()} autoComplete="nickname"/>
      <button className="primary-btn" onClick={create} disabled={busy}><span>{busy?<LoaderCircle className="spin" size={19}/>:<Plus size={19}/>}</span>Create a table <ArrowRight size={18}/></button>
      <div className="divider"><span/>OR JOIN YOUR FRIENDS<span/></div><div className="join-row"><input className="code-input" aria-label="Invite code" placeholder="INVITE CODE" maxLength="5" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} onKeyDown={(e)=>e.key==='Enter'&&join()} /><button className="join-btn" onClick={join} disabled={busy}>Join <ArrowRight size={17}/></button></div>
      <button className="practice-link" onClick={practice}><Dices size={16}/> Just looking? Play a practice table <ArrowRight size={15}/></button>
      {!cloudReady&&<div className="cloud-note"><WifiOff size={14}/> Friend invites will turn on after Firebase is connected.</div>}
      {error&&<p className="error-note" role="alert">{error}</p>}
    </section>
    <footer className="landing-footer"><span><Users size={15}/> 2–4 players</span><span className="footer-dot">·</span><span>About 15 min</span><button onClick={()=>setModal('rules')}><BookOpen size={15}/> How to play</button></footer>
    <div className="version-note">A classic game, made for right now.</div>
    {modal==='rules'&&<RulesModal onClose={()=>setModal('')} expanded={expandedRule} setExpanded={setExpandedRule}/>}
  </main>;

  const myHand = room.local ? room.hands[room.turn] : room.hands?.[uid] || [];
  const canPass = myTurn && room.status==='playing' && !playableEnds(myHand,room.board).length;
  const legalIndexes = new Set(myHand.flatMap((t,i)=>(room.board.length?playableEnds([t],room.board).length:t[0]===room.openingDouble&&t[1]===room.openingDouble)?[i]:[]));

  return <main className="game-shell">
    <header className="game-header"><button className="back-btn" onClick={()=>setModal('leave')} aria-label="Back to home"><ArrowLeft size={19}/></button><a className="brand game-brand" href="#" onClick={(e)=>e.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>five<span className="brand-light">tiles</span></span></a><div className="header-actions"><button className="icon-btn" onClick={()=>setSound(!sound)} aria-label={sound?'Mute play feedback':'Enable play feedback'}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button><button className="icon-btn" onClick={()=>setModal('rules')} aria-label="Rules"><BookOpen size={19}/></button></div></header>
    {room.status==='lobby' ? <section className="lobby-screen"><div className="lobby-top"><span className="eyebrow"><span className="live-dot"/> WAITING FOR PLAYERS</span><span className="room-badge"><Users size={15}/>{room.players?.length||1} / 4</span></div><div className="lobby-title"><div className="overline">YOUR TABLE</div><h1>Invite your<br/>people over.</h1><p>Send the code. They’re just a tap away.</p></div>
      <button className="invite-card" onClick={shareInvite}><span className="invite-caption">TABLE CODE</span><strong>{room.code}</strong><span className="invite-action"><Send size={17}/>{copied?'Copied!':'Share invite'}<ArrowRight size={16}/></span></button>
      <div className="seats-heading"><span>AROUND THE TABLE</span><span>{Math.max(0,4-(room.players?.length||0))} seats open</span></div><div className="seat-grid">{[0,1,2,3].map((i)=>{const player=room.players?.[i];return <div key={i} className={`seat ${player?'seat-filled':''}`}><span className="seat-avatar">{player?player.name.slice(0,1).toUpperCase():<Plus size={17}/>}</span><span className="seat-name">{player?.name||'Waiting…'}</span>{player?.id===room.players?.[0]?.id&&<span className="host-tag">HOST</span>}</div>})}</div>
      {demo&&<div className="setup-hint"><WifiOff size={17}/> Practice table is only on this device. Share a link after Firebase is connected.</div>}
      <button className="primary-btn lobby-start" onClick={()=>demo?setRoom({...room,status:'playing'}):start()} disabled={busy||(!demo&&room.players?.length<2)}><span>{busy?<LoaderCircle className="spin" size={19}/>:<Sparkles size={18}/>}</span>{room.players?.length<2&&!demo?'Waiting for a friend…':'Let’s play'}<ArrowRight size={18}/></button>
      <button className="text-btn lobby-exit" onClick={backHome}>Leave this table</button>{error&&<p className="error-note" role="alert">{error}</p>}
    </section> : <section className="table-screen">
      <div className="table-topline"><span className="round-label"><span className="live-dot"/>{room.status==='finished'?'GAME OVER':'GAME TO 100'}</span><button className="share-mini" onClick={copyInvite}><Link2 size={15}/>{room.code}{copied&&<Check size={14}/>}</button></div>
      <div className="score-strip">{room.players?.map((p,i)=><div key={p.id} className={`score-player ${p.id===room.turn?'score-active':''}`}><span className={`player-orb orb-${i}`}>{p.name.slice(0,1).toUpperCase()}</span><div className="score-info"><span className="score-name">{p.name}{p.id===uid?' (you)':''}{p.id===room.players[0].id&&<Crown size={12}/>}</span><strong>{room.scores?.[p.id]||0}<small> pts</small></strong></div><span className="tile-count">{room.hands?.[p.id]?.length??0} <span>tiles</span></span></div>)}</div>
      <div className="table-felt"><div className="felt-top"><span>{room.board?.length?`${room.board.length} ${room.board.length===1?'tile':'tiles'} played`:'THE FIRST PLAY'}</span><span>ENDS SCORE IN FIVES</span></div><div className="board-scroll" ref={boardRef}><div className="board-chain">{room.board?.length?room.board.map((tile,i)=><React.Fragment key={tile.toSorted().join('')}><Tile tile={tile} small disabled/><span className="chain-seam"/></React.Fragment>):<div className="empty-board"><span>✳</span><strong>The table is yours</strong><small>{activePlayer?.name||'First player'} plays the highest double</small></div>}</div></div><div className="open-ends">{room.board?.length?<><span><i/>{room.board[0][0]} open</span><span>{room.board.at(-1)[1]} open<i/></span></>:<span>Double dominoes start the chain</span>}</div></div>
      <div className={`turn-callout ${myTurn?'your-turn':''}`}>{room.status==='finished'?<><Crown size={17}/>{room.players.find(p=>p.id===room.winner)?.name} wins the table!</>:myTurn?<><span className="turn-pulse"/>Your turn <span className="turn-sub">{legalIndexes.size?'Choose a tile to play':'No match — draw or pass'}</span></>:<><span className="turn-pulse waiting"/>{activePlayer?.name||'A friend'} is playing<span className="turn-sub">Good things take a moment</span></>}</div>
      {room.status==='playing'&&<><div className="hand-heading"><span>{myTurn?'YOUR TILES':`${activePlayer?.name?.toUpperCase()||'PLAYER'}’S TILES`}</span><span>{hand.length} left</span></div><div className="hand-scroll" aria-label="Your dominoes">{hand.map((tile,i)=><Tile key={`${tile.join('')}-${i}`} tile={tile} selected={picked===i} disabled={!myTurn||busy||(!legalIndexes.has(i)&&room.board.length>0)} onClick={()=>{if(!myTurn)return;if(!legalIndexes.has(i)&&room.board.length)return;if(!room.board.length){doAction('play',i,'start');return;}const ends=playableEnds([tile],room.board);if(ends.length===1)doAction('play',i,ends[0]);else setPicked(picked===i?null:i);}} label={`Play ${tile[0]} and ${tile[1]}`}/>)}</div>
      {picked!=null&&possibleEnds.length>1&&<div className="end-chooser"><span>Which open end?</span><button onClick={()=>doAction('play',picked,'start')}><ArrowLeft size={16}/> LEFT ({room.board[0][0]})</button><button onClick={()=>doAction('play',picked,'end')}>RIGHT ({room.board.at(-1)[1]}) <ArrowRight size={16}/></button></div>}
      <div className="table-controls">{canPass?<button className="pass-btn" onClick={()=>doAction('pass')}>{room.boneyard?.length?<><Dices size={16}/> Draw a tile</>:<><ArrowDownLeft size={16}/> Pass turn</>}</button>:<span className="hint-text"><Sparkles size={14}/>{room.board.length?'Tap a matching tile to play':'Tap your highest double to open'}</span>}<button className="rules-mini" onClick={()=>setModal('rules')}><BookOpen size={15}/> Rules</button></div></>}
      {error&&<p className="error-note game-error" role="alert">{error}</p>}
    </section>}
    {notice&&<div className="toast"><Check size={16}/>{notice}</div>}
    {modal==='rules'&&<RulesModal onClose={()=>setModal('')} expanded={expandedRule} setExpanded={setExpandedRule}/>}
    {modal==='leave'&&<div className="modal-scrim" onClick={()=>setModal('')}><div className="modal-card leave-card" onClick={(e)=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal('')}><X size={20}/></button><span className="modal-icon"><DoorOpen size={23}/></span><h2>Head home?</h2><p>{room.local?'This practice game will reset.':'You can come back with the table code.'}</p><button className="primary-btn" onClick={backHome}><span><ArrowLeft size={17}/></span>Leave table</button><button className="text-btn" onClick={()=>setModal('')}>Stay and play</button></div></div>}
    {modal==='finished'&&<div className="modal-scrim"><div className="modal-card leave-card"><span className="modal-icon winner-icon"><Crown size={24}/></span><span className="eyebrow">THAT’S A WRAP</span><h2>{room.players.find(p=>p.id===room.winner)?.name} takes it!</h2><p>Good game. The next one’s yours.</p><button className="primary-btn" onClick={backHome}><span><RotateCcw size={17}/></span>Back to tables</button></div></div>}
  </main>;
}

function RulesModal({onClose,expanded,setExpanded}) { return <div className="modal-scrim" onClick={onClose}><section className="modal-card rules-card" onClick={(e)=>e.stopPropagation()}><div className="rules-top"><span className="modal-icon"><BookOpen size={22}/></span><button className="modal-close" onClick={onClose} aria-label="Close rules"><X size={20}/></button></div><span className="eyebrow">THE QUICK GUIDE</span><h2>How to play<br/><em>Five Tiles.</em></h2><p className="rules-intro">The classic domino game with a satisfying little twist: make the ends add up to five.</p><div className="rules-list">{RULES.map(([title,body],i)=><button key={title} className={`rule-item ${expanded===i?'rule-open':''}`} onClick={()=>setExpanded(expanded===i?-1:i)}><span className="rule-number">0{i+1}</span><span className="rule-copy"><strong>{title}</strong>{expanded===i&&<small>{body}</small>}</span><ChevronDown size={17}/></button>)}</div><div className="rules-foot"><span><Sparkles size={14}/> That’s the gist. Now make it yours.</span><button className="primary-btn" onClick={onClose}><span><Check size={18}/></span>Got it</button></div></section></div> }

createRoot(document.getElementById('root')).render(<App/>);
