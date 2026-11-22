// Load tracking only when the camera is requested; typed gestures work without it.

// ============ BACKEND API ============
const API_BASE = '/api';
async function apiSaveTranslation(text, mode){
  try{ const res=await fetch(`${API_BASE}/translations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,mode,timestamp:new Date().toISOString()})}); if(!res.ok)throw new Error(res.status); return await res.json(); }
  catch(e){ console.warn('[api] save:',e.message); return null; }
}
async function apiGetTranslations(){
  try{ const res=await fetch(`${API_BASE}/translations`); if(!res.ok)throw new Error(res.status); return await res.json(); }
  catch(e){ console.warn('[api] load:',e.message); return []; }
}
async function apiDeleteTranslation(id){
  try{ const res=await fetch(`${API_BASE}/translations/${id}`,{method:'DELETE'}); return res.ok; }
  catch(e){ console.warn('[api] del:',e.message); return false; }
}

// ============ SIGN DESCRIPTIONS ============
const P_INFO = {
  "Hello":"Open hand, fingers spread","Stop":"Palm forward, fingers together",
  "Good":"Thumbs up","Yes":"Fist with thumb up","No":"Closed fist",
  "I Love You":"Thumb + index + pinky","Peace":"V-sign spread",
  "OK":"Thumb + index circle","Call Me":"Thumb + pinky out",
  "Rock On":"Index + pinky out","Wait":"Index finger up",
  "Me":"Pinky up","Awesome":"L-shape","You":"Point forward",
  "Three":"Three fingers spread","Good Luck":"Cross index & middle",
  "Gun":"Thumb up, index + middle out","Four":"Four fingers, thumb tucked"
};
const S_INFO = {
  'A':'Fist, thumb beside','B':'Four fingers up','C':'Curved claw hand',
  'D':'Index up','E':'Fingers curled','F':'OK + 3 up','G':'Index side',
  'H':'Index + middle sideways','I':'Pinky up','K':'V-shape + thumb up',
  'L':'L-shape','O':'Circle','R':'Cross index & middle','S':'Fist tight',
  'U':'Index+middle together','V':'Peace sign','W':'Three spread',
  'Y':'Thumb+pinky','5':'Open hand'
};

// ============ ASL CLASSIFIER (camera mode) ============
class ASL {
  constructor(){this.mode='SPELL';this.thr=5;this.reset();}
  toggle(){return this.mode;}
  update(l,prediction){
    this.fg=[Math.abs(l[4].x-l[9].x)>Math.abs(l[3].x-l[9].x),...[ [8,6],[12,10],[16,14],[20,18] ].map(([t,p])=>l[t].y<l[p].y)];
    const label=prediction?.label||'?';
    if(label==='?'){this.candidate='?';this.count=0;return[null,'?',0,prediction?.confidence||0];}
    if(label===this.candidate)this.count++;else{this.candidate=label;this.count=1;}
    const committed=this.count>=this.thr&&label!==this.lastCommitted;
    if(committed)this.lastCommitted=label;
    return[committed?label:null,label,Math.min(1,this.count/this.thr),prediction.confidence];
  }
  reset(){this.lastCommitted=null;this.candidate='?';this.count=0;this.fg=[false,false,false,false,false];}
}

// ============ VOICE (text-to-speech) ============
class Voice {
  constructor(){this.on=true;this.busy=false;this.syn=window.speechSynthesis;}
  speak(t){ if(!this.on||!t||this.busy||!this.syn)return; const u=new SpeechSynthesisUtterance(t);u.rate=0.9; u.onend=()=>this.busy=false;u.onerror=()=>this.busy=false; this.busy=true;this.syn.cancel();this.syn.speak(u); }
  toggle(){this.on=!this.on;return this.on;}
}

const HC=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
const COL_SAGE='#5E7A5A', COL_OCEAN='#3F7A8C';

function toast(msg){
  const box=document.getElementById('toasts');
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg; box.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(10px)';t.style.transition='.3s';},1800);
  setTimeout(()=>t.remove(),2150);
}

/* =========================================================
   HAND ILLUSTRATION (schematic SVG) — used in Voice→Sign
   fingers = [thumb, index, middle, ring, pinky] (true = extended)
   ========================================================= */
function buildHand(def){
  def=def||{};
  const wrap=s=>`<svg class="hand-svg" viewBox="0 0 120 170" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  if(def.shape==='O') return wrap(`<circle cx="60" cy="66" r="33" fill="none" stroke="var(--hand)" stroke-width="20"/><rect x="36" y="118" width="48" height="36" rx="16" fill="var(--hand)"/>`);
  if(def.shape==='C') return wrap(`<path d="M88 40 A42 42 0 1 0 88 130" fill="none" stroke="var(--hand)" stroke-width="21" stroke-linecap="round"/>`);
  const F=def.fingers||[0,0,0,0,0];
  const spread=def.spread, circle=def.circle, crossed=def.crossed;
  const baseY=98, xs=[44,58,72,86], tip=[30,22,26,38], w=12, ang=[-15,-5,5,15];
  let fg='';
  for(let i=0;i<4;i++){
    if(crossed&&(i===0||i===1))continue;
    const x=xs[i];
    if(F[i+1]){ const a=spread?ang[i]:0; fg+=`<g transform="rotate(${a} ${x} ${baseY})"><rect x="${x-w/2}" y="${tip[i]}" width="${w}" height="${baseY-tip[i]+10}" rx="${w/2}" fill="var(--hand)"/></g>`; }
    else { fg+=`<rect x="${x-w/2}" y="${baseY-16}" width="${w}" height="24" rx="${w/2}" fill="var(--hand-2)"/>`; }
  }
  if(crossed){
    fg+=`<rect x="${58-w/2}" y="34" width="${w}" height="${baseY-34}" rx="${w/2}" fill="var(--hand)" transform="rotate(14 58 ${baseY})"/>`;
    fg+=`<rect x="${44-w/2}" y="34" width="${w}" height="${baseY-34}" rx="${w/2}" fill="var(--hand)" transform="rotate(-14 44 ${baseY})"/>`;
  }
  const palm=`<rect x="36" y="92" width="56" height="58" rx="20" fill="var(--hand)"/>`;
  let thumb;
  if(def.thumbSide) thumb=`<rect x="24" y="96" width="14" height="40" rx="7" fill="var(--hand-2)"/>`;
  else if(F[0]) thumb=`<g transform="rotate(-32 34 116)"><rect x="24" y="64" width="13" height="56" rx="6.5" fill="var(--hand)"/></g>`;
  else thumb=`<rect x="40" y="96" width="30" height="13" rx="6.5" fill="var(--hand-2)"/>`;
  let inner=fg+palm+thumb;
  if(circle) inner+=`<circle cx="48" cy="54" r="14" fill="none" stroke="var(--hand)" stroke-width="11"/>`;
  return wrap(`<g ${def.horizontal?'transform="rotate(-90 60 90)"':''}>${inner}</g>`);
}

// hand shape per phrase / letter
const PHRASE_SIGN = {
  "Hello":{fingers:[1,1,1,1,1],spread:1}, "Stop":{fingers:[1,1,1,1,1]},
  "Good":{fingers:[1,0,0,0,0]}, "Yes":{fingers:[1,0,0,0,0]}, "No":{fingers:[0,0,0,0,0]},
  "I Love You":{fingers:[1,1,0,0,1]}, "Peace":{fingers:[0,1,1,0,0],spread:1},
  "OK":{fingers:[0,0,1,1,1],circle:1}, "Call Me":{fingers:[1,0,0,0,1]},
  "Rock On":{fingers:[0,1,0,0,1]}, "Wait":{fingers:[0,1,0,0,0]}, "Me":{fingers:[0,0,0,0,1]},
  "Awesome":{fingers:[1,1,0,0,0]}, "You":{fingers:[0,1,0,0,0]}, "Three":{fingers:[0,1,1,1,0]},
  "Good Luck":{fingers:[0,1,1,0,0],crossed:1}, "Gun":{fingers:[1,1,1,0,0],spread:1}, "Four":{fingers:[0,1,1,1,1]}
};
const LETTER_SIGN = {
  A:{fingers:[0,0,0,0,0],thumbSide:1}, B:{fingers:[0,1,1,1,1]}, C:{shape:'C'}, D:{fingers:[0,1,0,0,0]},
  E:{fingers:[0,0,0,0,0]}, F:{fingers:[0,0,1,1,1],circle:1}, G:{fingers:[0,1,0,0,0],horizontal:1},
  H:{fingers:[0,1,1,0,0],horizontal:1}, I:{fingers:[0,0,0,0,1]}, J:{fingers:[0,0,0,0,1]},
  K:{fingers:[1,1,1,0,0],spread:1}, L:{fingers:[1,1,0,0,0]}, M:{fingers:[0,0,0,0,0]}, N:{fingers:[0,0,0,0,0]},
  O:{shape:'O'}, P:{fingers:[1,1,1,0,0],horizontal:1}, Q:{fingers:[1,1,0,0,0],horizontal:1},
  R:{fingers:[0,1,1,0,0],crossed:1}, S:{fingers:[0,0,0,0,0]}, T:{fingers:[0,0,0,0,0],thumbSide:1},
  U:{fingers:[0,1,1,0,0]}, V:{fingers:[0,1,1,0,0],spread:1}, W:{fingers:[0,1,1,1,0],spread:1},
  X:{fingers:[0,1,0,0,0]}, Y:{fingers:[1,0,0,0,1]}, Z:{fingers:[0,1,0,0,0]}
};
const LETTER_DESC = {
  A:'Fist, thumb resting at the side', B:'Flat hand up, thumb across the palm',
  C:'Curve the whole hand into a C', D:'Index up, other fingertips meet the thumb',
  E:'Fingers curl down onto the thumb', F:'Thumb & index touch, three fingers up',
  G:'Index finger pointing sideways', H:'Index & middle sideways, together',
  I:'Pinky up, rest of the hand a fist', J:'Pinky up, then draw a “J” (motion)',
  K:'Index & middle up in a V, thumb between', L:'Thumb & index make an “L”',
  M:'Thumb tucked under three fingers', N:'Thumb tucked under two fingers',
  O:'Fingers curve to meet the thumb in an O', P:'Like K, pointed downward',
  Q:'Like G, pointed downward', R:'Cross index over middle finger',
  S:'Fist with the thumb across the front', T:'Thumb between index & middle, fist',
  U:'Index & middle up, held together', V:'Index & middle up, spread apart',
  W:'Index, middle & ring up (three)', X:'Index up, bent into a hook',
  Y:'Thumb & pinky out (hang-loose)', Z:'Index finger draws a “Z” (motion)'
};
// spoken word -> phrase sign (single word)
const WORD_TO_PHRASE = {
  hello:'Hello', hi:'Hello', hey:'Hello', stop:'Stop', good:'Good', great:'Good',
  yes:'Yes', yeah:'Yes', yep:'Yes', no:'No', nope:'No', peace:'Peace',
  ok:'OK', okay:'OK', wait:'Wait', me:'Me', you:'You', three:'Three', four:'Four',
  awesome:'Awesome', cool:'Awesome'
};
// multi-word phrases -> phrase sign
const MULTIWORD = [
  ['i love you','I Love You'], ['love you','I Love You'], ['call me','Call Me'],
  ['good luck','Good Luck'], ['rock on','Rock On']
];

// Turn a sentence into an ordered list of sign tokens.
const GESTURES = [
  {label:'Hello', aliases:['hello','hi','hey','namaste'], motion:'wave', desc:'Raise an open hand beside your head and wave.', hand:PHRASE_SIGN.Hello},
  {label:'Thank you', aliases:['thank you','thanks','shukriya'], motion:'thanks', desc:'Move your open hand from your chin outward.', hand:PHRASE_SIGN.Stop},
  {label:'Yes', aliases:['yes','yeah','haan'], motion:'yes', desc:'Nod a closed fist up and down.', hand:{fingers:[0,0,0,0,0]}},
  {label:'No', aliases:['no','nope','nahi'], motion:'no', desc:'Bring your index and middle fingers toward your thumb.', hand:{fingers:[1,1,1,0,0]}},
  {label:'I love you', aliases:['i love you','love you'], motion:'love', desc:'Raise your thumb, index and little finger.', hand:PHRASE_SIGN['I Love You']},
  {label:'Please', aliases:['please'], motion:'please', desc:'Move your open hand in a small circle over your chest.', hand:PHRASE_SIGN.Stop},
  {label:'Stop', aliases:['stop','ruko'], motion:'stop', desc:'Hold an open palm forward to ask someone to stop.', hand:PHRASE_SIGN.Stop},
  {label:'Good luck', aliases:['good luck'], motion:'luck', desc:'Cross your fingers: a familiar good-luck gesture.', hand:PHRASE_SIGN['Good Luck']}
];
// Prefer complete phrases inside sentences, then spell words without a gesture.
const SENTENCE_GESTURES = [
  ...GESTURES,
  {label:'My name is', aliases:['my name is','mera naam','मेरा नाम'],motion:'introduce',desc:'Introduction cue: point toward yourself, then show the name.',hand:{fingers:[0,1,0,0,0]}},
  ...Object.entries(PHRASE_SIGN).filter(([label])=>!GESTURES.some(g=>g.label.toLowerCase()===label.toLowerCase())).map(([label,hand])=>({label,aliases:[label.toLowerCase()],motion:'present',desc:P_INFO[label]+' — simplified gesture cue.',hand}))
];
const GESTURE_ALIASES = SENTENCE_GESTURES.flatMap(g=>g.aliases.map(alias=>({words:alias.toLowerCase().split(/\s+/),gesture:g}))).sort((a,b)=>b.words.length-a.words.length);
function tokenizeToSigns(sentence){
  const words=sentence.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu)||[];
  const lower=words.map(w=>w.toLowerCase());
  const tokens=[];
  for(let i=0;i<words.length;){
    const match=GESTURE_ALIASES.find(a=>a.words.every((w,j)=>lower[i+j]===w));
    if(match){tokens.push({...match.gesture,type:'phrase'});i+=match.words.length;continue;}
    const word=words[i++];
    const mapped=WORD_TO_PHRASE[word.toLowerCase()];
    if(mapped){tokens.push({type:'phrase',label:mapped,motion:'present',hand:PHRASE_SIGN[mapped],desc:P_INFO[mapped]+' — simplified gesture cue.'});continue;}
    if(/^[a-z]+(?:['’][a-z]+)*$/i.test(word)){
      const letters=word.replace(/['’]/g,'').toUpperCase();
      [...letters].forEach((letter,index)=>tokens.push({type:'letter',label:letter,word,motion:letter==='J'?'letter-j':letter==='Z'?'letter-z':'spell',hand:LETTER_SIGN[letter],desc:`Spelling “${word}” · ${index+1}/${letters.length}. ${LETTER_DESC[letter]}. Schematic hand pose.`}));
    }else{
      // Keep scripts/numbers we cannot sign visible; never invent a sign for them.
      tokens.push({type:'caption',label:word,motion:'present',hand:PHRASE_SIGN.Stop,desc:'Text cue only — no verified sign for this script or number. Use English letters for fingerspelling.'});
    }
  }
  return tokens;
}
function buildStickHand(def={}){
  const f=def.fingers||[0,0,0,0,0];
  let paths='<path d="M0 5L0 -8M-13 -10Q0 -3 13 -10M-13 -10L-11 -28M13 -10L11 -28"/>';
  if(def.shape==='C'||def.shape==='O'){
    paths+=def.shape==='C'?'<path d="M10 -44C-22 -52 -24 -12 4 -12"/>':'<ellipse cx="0" cy="-29" rx="16" ry="19"/>';
  }else{
    for(let i=0;i<4;i++){
      const x=-12+i*8,tip=-48+Math.abs(1.5-i)*3;
      const tx=def.crossed&&i<2?(i===0?7:-7):x+(def.spread?(i-1.5)*5:0);
      paths+=f[i+1]?`<path d="M${x} -14L${x} -29L${tx} ${tip}"/>`:`<path d="M${x} -14L${x-2} -27L${x+3} -23L${x+2} -15"/>`;
    }
    paths+=f[0]?'<path d="M-8 -10L-23 -20L-29 -31"/>':'<path d="M-10 -10L-16 -21L4 -24"/>';
    if(def.circle)paths+='<circle cx="-14" cy="-31" r="7"/>';
  }
  return `<g class="stick-fingers" fill="none" stroke="var(--ocean)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" ${def.horizontal?'transform="rotate(-90)"':''}>${paths}</g>`;
}
function buildStickMan(t={motion:'spell',hand:{fingers:[0,0,0,0,0]}}){
  return `<svg class="stick-man gesture-${t.motion}" viewBox="0 0 320 300" role="img" aria-label="Stick figure showing a schematic gesture">
    <g fill="none" stroke="var(--ocean)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="150" cy="60" r="30"/><path d="M150 92V200M150 200L105 275M150 200L195 275M150 112L105 150L85 195"/>
      <path class="gesture-arm" d="M150 112L195 145L222 88"/>
    </g>
    <circle cx="140" cy="56" r="3" fill="var(--ink)"/><circle cx="160" cy="56" r="3" fill="var(--ink)"/>
    <path d="M140 72Q150 80 160 72" fill="none" stroke="var(--ink)" stroke-width="3"/>
    <g class="gesture-hand" transform="translate(222 88)">${buildStickHand(t.hand)}</g>
  </svg>`;
}

/* =========================================================
   SPEECH -> SIGN feature
   ========================================================= */
class SpeechToSign {
  constructor(){
    this.tokens=[]; this.idx=0; this.timer=null; this.playing=false; this.speed=1800; this.listening=false;
    this.localSession=null; this.micPending=false; this.micMessage='';
  }

  mount(){
    document.getElementById('micBtn').onclick=()=>this.toggleMic();
    document.getElementById('typeGo').onclick=()=>this.fromInput();
    document.getElementById('typeInput').addEventListener('keydown',e=>{ if(e.key==='Enter')this.fromInput(); });
    document.getElementById('btnSpeakClear').onclick=()=>{ this.reset(); document.getElementById('sttText').textContent='Your words will appear here…'; document.getElementById('sttText').classList.add('dim'); };
    document.getElementById('btnPlay').onclick=()=>{ this.playing?this.pause():(this.tokens.length?this.play():null); };
    document.getElementById('btnPrev').onclick=()=>this.prev();
    document.getElementById('btnNext').onclick=()=>this.next();
    document.getElementById('btnReplay').onclick=()=>{ if(this.tokens.length){this.idx=0;this.play();} };
    document.getElementById('speedRange').addEventListener('input',e=>{ this.speed=2700-(+e.target.value); document.getElementById('stageHand').style.setProperty('--gesture-duration',this.speed+'ms'); if(this.playing)this.schedule(); });
    // speed slider: right = faster. value 500..2200 -> speed 2200..500
    document.getElementById('speedRange').value=900;
    this.speed=1800;
    // quick phrases
    const quick=['My name is Azeem','Hello, thank you','I love you','Please wait'];
    const box=document.getElementById('quickChips');
    quick.forEach(q=>{ const b=document.createElement('button'); b.className='qchip'; b.textContent=q; b.onclick=()=>{ document.getElementById('typeInput').value=q; this.fromInput(); }; box.appendChild(b); });
  }
  async toggleMic(){
    if(this.localSession){
      const session=this.localSession;
      if(session.recorder?.state==='recording'){session.recorder.stop();return;}
      this.cancelMic();return;
    }
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      this.micMessage='Open localhost:8000 in a browser with microphone recording support.';this.updateMic();return;
    }
    const session={stream:null,recorder:null,chunks:[],controller:new AbortController()};
    this.localSession=session;this.micPending=true;this.micMessage='Allow microphone access…';this.updateMic();
    const active=()=>this.localSession===session;
    try{
      session.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(!active()){session.stream.getTracks().forEach(t=>t.stop());return;}
      const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
      session.recorder=new MediaRecorder(session.stream,mime?{mimeType:mime}:{});
      session.recorder.ondataavailable=e=>{if(e.data.size)session.chunks.push(e.data);};
      session.recorder.onerror=()=>{if(active()){this.cancelMic();this.micMessage='Microphone recording failed. Please retry.';this.updateMic();}};
      session.recorder.onstop=async()=>{
        clearTimeout(session.timer);session.stream.getTracks().forEach(t=>t.stop());
        if(!active())return;
        this.listening=false;this.micPending=true;this.micMessage='Transcribing on this computer… Tap to cancel.';this.updateMic();
        session.timer=setTimeout(()=>session.controller.abort(),120000);
        try{
          const audio=new Blob(session.chunks,{type:session.recorder.mimeType});
          const language=document.getElementById('speechLanguage').value.split('-')[0];
          const response=await fetch('/api/speech?language='+language,{method:'POST',headers:{'Content-Type':audio.type||'application/octet-stream'},body:audio,signal:session.controller.signal});
          if(response.status===404)throw new Error('Restart the server using run.bat to enable local speech input.');
          const result=await response.json();
          if(!response.ok)throw new Error(result.detail||'Local transcription failed.');
          if(!active())return;
          if(result.text){
            const caption=document.getElementById('sttText');caption.textContent=result.text;caption.classList.remove('dim');this.build(result.text);
            this.micMessage='Message received. Tap to record again.';
          }else this.micMessage='No speech detected. Check your microphone and try again.';
        }catch(error){if(active())this.micMessage=error.name==='AbortError'?'Transcription timed out. Try a shorter recording.':error.message;}
        finally{clearTimeout(session.timer);if(active()){this.localSession=null;this.micPending=false;this.updateMic();}}
      };
      session.recorder.start();this.micPending=false;this.listening=true;
      this.micMessage='Recording… speak, then tap to transcribe (maximum 30 seconds).';this.updateMic();
      session.timer=setTimeout(()=>{if(active()&&session.recorder.state==='recording')session.recorder.stop();},30000);
    }catch(error){
      if(!active())return;
      this.cancelMic();this.micMessage=error.name==='NotAllowedError'?'Allow microphone access in the address bar and Windows privacy settings, then retry.':error.name==='NotFoundError'?'No microphone found. Connect or enable your microphone.':'Could not record: '+error.message;this.updateMic();
    }
  }
  cancelMic(){
    if(this.localSession){
      const session=this.localSession;this.localSession=null;clearTimeout(session.timer);session.controller.abort();
      if(session.recorder?.state==='recording')session.recorder.stop();
      session.stream?.getTracks().forEach(t=>t.stop());
      this.listening=false;this.micPending=false;this.micMessage='Recording cancelled. Tap to record.';this.updateMic();
    }
  }
  updateMic(){
    const b=document.getElementById('micBtn'), s=document.getElementById('micState');
    b.classList.toggle('on',this.listening);
    b.setAttribute('aria-pressed',String(this.listening||this.micPending));
    b.setAttribute('aria-label',this.localSession?'Stop speech input':'Start speech input');
    s.textContent=this.micMessage||(this.micPending?'Starting… allow microphone access. Tap to cancel.':this.listening?'Listening… tap to stop':'Tap to speak');
  }
  fromInput(){
    this.cancelMic();
    const v=document.getElementById('typeInput').value.trim();
    if(!v){ toast('Type something first'); return; }
    const c=document.getElementById('sttText'); c.textContent=v; c.classList.remove('dim');
    this.build(v); document.getElementById('typeInput').value='';
  }
  build(sentence){
    this.pause(); this.tokens=tokenizeToSigns(sentence); this.idx=0;
    if(!this.tokens.length){ this.renderTimeline(); document.getElementById('stageHand').innerHTML=buildStickMan(); document.getElementById('stageWord').textContent='Enter a message'; document.getElementById('stageDesc').textContent='Type words or a sentence to animate the stick figure.'; document.getElementById('stageCount').textContent=''; return; }
    this.renderTimeline(); this.play();
  }
  play(){ if(!this.tokens.length)return; if(this.idx===this.tokens.length-1)this.idx=0; this.playing=true; this.updatePlay(); this.schedule(); }
  schedule(){
    clearTimeout(this.timer); this.renderToken();
    this.timer=setTimeout(()=>{ if(!this.playing)return;
      if(this.idx<this.tokens.length-1){ this.idx++; this.schedule(); }
      else { this.playing=false; this.updatePlay(); }
    }, this.speed);
  }
  pause(){ this.playing=false; clearTimeout(this.timer); this.updatePlay(); }
  next(){ this.pause(); if(this.idx<this.tokens.length-1)this.idx++; this.renderToken(); }
  prev(){ this.pause(); if(this.idx>0)this.idx--; this.renderToken(); }
  updatePlay(){ document.getElementById('stageHand').classList.toggle('paused',!this.playing); document.getElementById('btnPlay').innerHTML=this.playing?'&#10073;&#10073;':'&#9654;'; }
  renderToken(){
    const t=this.tokens[this.idx]; if(!t)return;
    document.getElementById('stageHand').style.setProperty('--gesture-duration',this.speed+'ms');
    document.getElementById('stageHand').innerHTML=buildStickMan(t);
    document.getElementById('stageWord').textContent=t.word?`${t.word} · ${t.label}`:t.label;
    document.getElementById('stageDesc').textContent=t.desc||(t.type==='letter'?'Fingerspelled letter':'');
    document.getElementById('stageCount').textContent=`${t.type==='letter'?'Fingerspelling':t.type==='caption'?'Text cue':'Gesture'} · ${this.idx+1} of ${this.tokens.length}`;
    document.querySelectorAll('#timeline .tl-chip').forEach((c,i)=>{ c.classList.toggle('on',i===this.idx); c.classList.toggle('done',i<this.idx); });
  }
  renderTimeline(){
    const tl=document.getElementById('timeline'); tl.innerHTML='';
    this.tokens.forEach((t,i)=>{ const c=document.createElement('button'); c.className='tl-chip'+(t.type==='letter'?' letter':''); c.textContent=t.label; c.title=t.word?`Spell ${t.word}: ${t.label}`:t.label; c.onclick=()=>{ this.pause(); this.idx=i; this.renderToken(); }; tl.appendChild(c); });
  }
  reset(){
    this.cancelMic(); this.micMessage=''; this.updateMic();
    this.pause(); this.tokens=[]; this.idx=0;
    document.getElementById('timeline').innerHTML='';
    document.getElementById('stageHand').innerHTML=buildStickMan();
    document.getElementById('stageWord').textContent='Ready';
    document.getElementById('stageDesc').textContent='Type any English sentence. The stick figure shows gesture cues and spells other words.';
    document.getElementById('stageCount').textContent='';
    const c=document.getElementById('sttText'); c.textContent='Your words will appear here…'; c.classList.add('dim');
  }
  stop(){ this.pause(); this.cancelMic(); }
}

/* =========================================================
   SIGN -> VOICE app (camera)
   ========================================================= */
function summarizeTrials(trials){
  const total=trials.length;
  const correct=trials.filter(t=>t.expected===(t.predicted||'REJECT')).length;
  const rejected=trials.filter(t=>!t.predicted).length;
  const classes=new Set(trials.map(t=>t.expected).filter(t=>t!=='REJECT')).size;
  return {total,correct,rejected,classes,accuracy:total?correct/total:null};
}
class App {
  constructor(){
    this.asl=new ASL(); this.voice=new Voice(); this.trials=[]; this.lastTrialFrame=null;
    this.word=''; this.sentence=''; this.flash=0;
    this.signs=0; this.words=0; this.sents=0;
    this.hl=null; this.vid=null; this.cvs=null; this.cx=null;
    this.running=false; this.stream=null; this.startTime=0; this.timerInt=null;
    this.starting=false; this.session=0; this.raf=null; this.lastVideoTime=-1; this.fpsLast=performance.now(); this.fpsFrames=0; this.fps=0; this.modelPromise=null;
  }
  wire(){
    const expected=document.getElementById('expectedLetter');
    [...'ABCDEFGHIKLMNOPQRSTUVWXY','REJECT'].forEach(letter=>{const option=document.createElement('option');option.value=letter;option.textContent=letter==='REJECT'?'Unsupported pose (expect rejection)':letter;expected.appendChild(option);});
    document.getElementById('btnRecordTrial').onclick=()=>this.recordTrial();
    document.getElementById('btnExportTrials').onclick=()=>this.exportTrials();
    document.getElementById('btnClearTrials').onclick=()=>{this.trials=[];this.lastTrialFrame=null;this.updateTrials();};
    document.getElementById('startBtn').onclick=()=>this.cam();
    document.addEventListener('keydown',e=>this.key(e));
    document.getElementById('btnSpeak').onclick=()=>this.doSpeak();
    document.getElementById('btnSpace').onclick=()=>this.doSpace();
    document.getElementById('btnDel').onclick=()=>this.doDel();
    document.getElementById('btnEnter').onclick=()=>this.doEnter();
    document.getElementById('btnClear').onclick=()=>this.doClear();
    document.getElementById('btnVoice').onclick=()=>this.doVoice();
    document.getElementById('pillPhrase').disabled=true;
    document.getElementById('pillSpell').onclick=()=>{if(this.asl.mode!=='SPELL')this.doMode();};
    document.getElementById('btnCopy').onclick=()=>this.doCopy();
    document.getElementById('btnSave').onclick=()=>this.doDownload();
    document.getElementById('btnRefresh').onclick=()=>{this.loadHistory();toast('History refreshed');};
    document.getElementById('btnGuide').onclick=()=>this.openGuide();
    document.getElementById('guideClose').onclick=()=>this.closeGuide();
    document.getElementById('guideBackdrop').onclick=()=>this.closeGuide();
  }
  ensureModel(){
    if(this.modelPromise)return this.modelPromise;
    this.modelPromise=(async()=>{
      const {HandLandmarker,FilesetResolver}=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs");
      const v=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
      this.hl=await HandLandmarker.createFromOptions(v,{ baseOptions:{modelAssetPath:"/models/hand_landmarker.task"}, numHands:1, runningMode:"VIDEO", minHandDetectionConfidence:.5, minHandPresenceConfidence:.5, minTrackingConfidence:.5 });
    })().catch(error=>{this.modelPromise=null;throw error;});
    return this.modelPromise;
  }
  async cam(){
    if(this.starting||this.running)return;
    this.starting=true;
    const session=++this.session, hint=document.getElementById('permHint'), button=document.getElementById('startBtn');
    button.disabled=true;
    let phase='camera';
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Open this app at http://localhost:8000 or an HTTPS address to use the camera.');
      hint.textContent='Allow camera access in your browser…'; hint.style.color='';
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:{ideal:'user'}}});
      if(session!==this.session){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;
      this.vid=document.getElementById('webcam'); this.vid.srcObject=stream;
      await this.vid.play();
      if(session!==this.session)return;
      phase='model'; hint.textContent='Camera connected. Loading hand tracking…';
      await this.ensureModel();
      const modelStatus=await fetch('/api/asl/status').then(r=>r.json());
      if(!modelStatus.ready)throw new Error(modelStatus.detail);
      if(session!==this.session)return;
      this.cvs=document.getElementById('canvas'); this.cvs.width=this.vid.videoWidth||640; this.cvs.height=this.vid.videoHeight||480; this.cx=this.cvs.getContext('2d');
      show('app');
      this.asl.reset(); this.lastPrediction=null; this.lastLandmarks=null; this.lastVideoTime=-1;
      this.startTime=Date.now(); clearInterval(this.timerInt); this.timerInt=setInterval(()=>this.tickTimer(),1000);
      this.running=true; this.loadHistory(); this.loop();
    }catch(e){
      if(session!==this.session)return;
      this.stopCamera(); show('perm');
      const errors={NotAllowedError:'Camera permission denied. Allow camera access in the address bar, then retry.',NotFoundError:'No camera found. Connect a webcam and retry.',NotReadableError:'Camera is busy or unavailable. Close other camera apps and retry.'};
      hint.textContent=phase==='model'?('Recognition could not load: '+e.message+'. Restart using run.bat.'): (errors[e.name]||e.message);
      hint.style.color='var(--rose)'; console.error(e);
    }finally{ if(session===this.session||!this.starting){this.starting=false;button.disabled=false;} }
  }
  stopCamera(){
    this.inferController?.abort(); this.session++; this.starting=false; this.running=false; clearInterval(this.timerInt); cancelAnimationFrame(this.raf);
    document.getElementById('startBtn').disabled=false;
    if(this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; }
    if(this.vid) this.vid.srcObject=null;
  }
  recordTrial(){
    if(!this.running||!this.lastPrediction||!this.lastLandmarks||performance.now()-this.predictionTime>1500){toast('Show one hand and wait for a fresh prediction.');return;}
    if(this.lastTrialFrame===this.predictionTime){toast('Wait for the next prediction.');return;}
    this.lastTrialFrame=this.predictionTime;
    this.trials.push({expected:document.getElementById('expectedLetter').value,predicted:this.lastPrediction.label,confidence:this.lastPrediction.confidence,latency_ms:this.lastPrediction.latency_ms,points:this.lastLandmarks,width:this.cvs.width,height:this.cvs.height,timestamp:new Date().toISOString()});
    this.updateTrials();
  }
  updateTrials(){
    const summary=summarizeTrials(this.trials);
    document.getElementById('evaluationSummary').textContent=summary.total?`${summary.correct}/${summary.total} correct (${(summary.accuracy*100).toFixed(1)}%). ${summary.rejected} rejected. ${summary.classes}/24 letters tested. User-labeled sample only.`:'No accuracy measurement yet.';
  }
  exportTrials(){
    if(!this.trials.length){toast('Record some labeled trials first.');return;}
    const report={schema:'vani-setu-asl-trials-v1',model:'asl_cnn_model.onnx',source:'user-labeled camera trials; not independent benchmark',summary:summarizeTrials(this.trials),trials:this.trials};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='asl-evaluation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  tickTimer(){ if(!this.startTime)return; const s=Math.floor((Date.now()-this.startTime)/1000); document.getElementById('timerVal').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  async loop(){
    if(!this.running)return;
    const session=this.session;
    this.fpsFrames++; const now=performance.now();
    if(now-this.fpsLast>=500){ this.fps=Math.round(this.fpsFrames*1000/(now-this.fpsLast)); this.fpsFrames=0; this.fpsLast=now; document.getElementById('fpsVal').textContent=this.fps; }
    if(this.vid.readyState<2||this.vid.currentTime===this.lastVideoTime){this.raf=requestAnimationFrame(()=>this.loop());return;}
    this.lastVideoTime=this.vid.currentTime;
    let r;
    try{r=this.hl.detectForVideo(this.vid,now);}catch(error){
      this.stopCamera(); show('perm'); document.getElementById('permHint').textContent='Hand tracking stopped. Click Start Camera to retry.'; console.error(error); return;
    }
    this.cx.clearRect(0,0,this.cvs.width,this.cvs.height);
    let sign='?',com=null,ok=false,hold=0,conf=0;
    if(r.landmarks&&r.landmarks.length){
      ok=true; const lm=r.landmarks[0]; this.draw(lm);
      try{
        this.inferController=new AbortController();
        const timeout=setTimeout(()=>this.inferController?.abort(),10000);
        let response;
        try{response=await fetch('/api/asl/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points:lm.map(p=>[p.x,p.y]),width:this.cvs.width,height:this.cvs.height}),signal:this.inferController.signal});}finally{clearTimeout(timeout);}
        if(session!==this.session||!this.running)return;
        if(!response.ok)throw new Error('Local recognition failed. Restart with run.bat.');
        const prediction=await response.json();
        if(session!==this.session||!this.running)return;
        this.predictionTime=performance.now(); this.lastPrediction=prediction; this.lastLandmarks=lm.map(p=>[p.x,p.y]);
        [com,sign,hold,conf]=this.asl.update(lm,prediction);
        document.getElementById('inferenceStatus').textContent=prediction.label?`Local model · ${prediction.latency_ms} ms inference`:prediction.reason;
      }catch(error){
        if(session!==this.session)return;
        this.stopCamera();show('perm');document.getElementById('permHint').textContent=error.message;return;
      }
    }
    else {this.asl.reset();this.lastPrediction=null;this.lastLandmarks=null;document.getElementById('inferenceStatus').textContent='Show one hand. Hold a static ASL letter.';}
    if(com){ this.flash=15; this.signs++;
      if(this.asl.mode==='PHRASE'){ if(this.word){this.sentence+=(this.sentence?' ':'')+this.word;this.word='';this.words++;} this.sentence+=(this.sentence?' ':'')+com; this.log(com,'sign'); }
      else { this.word+=com; this.log('Letter: '+com,'letter'); }
      this.voice.speak(com);
    }
    if(this.flash>0)this.flash--;
    this.ui(sign,ok,hold,conf);
    this.raf=requestAnimationFrame(()=>this.loop());
  }
  draw(lm){
    const w=this.cvs.width,h=this.cvs.height,c=this.cx;
    const col=this.asl.mode==='PHRASE'?COL_SAGE:COL_OCEAN;
    c.strokeStyle=col;c.lineWidth=3;c.globalAlpha=.85;c.lineCap='round';
    for(const[a,b]of HC){c.beginPath();c.moveTo(lm[a].x*w,lm[a].y*h);c.lineTo(lm[b].x*w,lm[b].y*h);c.stroke();}
    c.globalAlpha=1;const tips=new Set([4,8,12,16,20]);
    for(let i=0;i<lm.length;i++){ const x=lm[i].x*w,y=lm[i].y*h,t=tips.has(i); c.beginPath();c.arc(x,y,t?6:4,0,Math.PI*2);c.fillStyle=t?'#fff':col;c.fill(); if(t){c.beginPath();c.arc(x,y,11,0,Math.PI*2);c.strokeStyle=col;c.lineWidth=2.5;c.globalAlpha=.5;c.stroke();c.globalAlpha=1;} }
  }
  log(text,type){
    const ph=document.getElementById('logPlaceholder');if(ph)ph.remove();
    const list=document.getElementById('logList');
    const now=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const d=document.createElement('div'); d.className='log-entry log-'+type;
    d.innerHTML=`<span class="log-time">${now}</span><span class="log-dot"></span><span class="log-msg">${this.esc(text)}</span>`;
    list.appendChild(d);list.scrollTop=list.scrollHeight; if(list.children.length>30)list.firstChild.remove();
  }
  esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  ui(sign,ok,hold,conf){
    const spell=this.asl.mode==='SPELL';
    const st=document.getElementById('signText'),sd=document.getElementById('signDesc'),sc=document.getElementById('signCard');
    st.textContent=sign==='?'?'…':sign; st.className='sign-text'+(sign!=='?'&&ok?' lit':'');
    sc.classList.toggle('active',sign!=='?'&&ok); sc.classList.toggle('spell',spell);
    if(this.flash===14){st.classList.remove('commit-pop');void st.offsetWidth;st.classList.add('commit-pop');}
    const info=spell?LETTER_DESC:P_INFO; sd.textContent=info[sign]||(sign==='?'?'Show your hand to begin':'');
    document.getElementById('confTxt').textContent=(ok?Math.round(conf*100):0)+'% score';
    document.getElementById('holdBar').style.width=(ok?Math.round(hold*100):0)+'%';
    const cs=document.getElementById('camSign'); cs.textContent=sign==='?'?'':sign; cs.classList.toggle('show',sign!=='?'&&ok);
    document.getElementById('camWrap').classList.toggle('flash-border',this.flash>10);
    const mb=document.getElementById('modeBadge'); mb.textContent=this.asl.mode; mb.className='badge mode-badge '+(spell?'spell':'phrase');
    const hbd=document.getElementById('handBadge'); hbd.textContent=ok?'TRACKING':'NO HAND'; hbd.className='badge hand-badge '+(ok?'ok':'none');
    this.asl.fg.forEach((on,i)=>document.getElementById('f'+i).classList.toggle('on',on));
    const full=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim();
    document.getElementById('transText').innerHTML=full?this.esc(full)+'<span class="cur"></span>':'Show signs to translate…<span class="cur"></span>';
    document.getElementById('wordText').textContent=this.word||'…';
    document.getElementById('modePill').classList.toggle('spell',spell);
    document.getElementById('pillPhrase').className='pill-opt'+(spell?'':' active-phrase');
    document.getElementById('pillSpell').className='pill-opt'+(spell?' active-spell':'');
    const vb=document.getElementById('btnVoice'); vb.textContent=this.voice.on?'Voice ON':'Voice OFF'; vb.classList.toggle('off',!this.voice.on);
    document.getElementById('stSigns').textContent=this.signs; document.getElementById('stWords').textContent=this.words; document.getElementById('stSent').textContent=this.sents;
  }
  key(e){
    if(document.getElementById('app').style.opacity!=='1')return;
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
    switch(e.key){
      case'm':case'M':this.doMode();break;
      case' ':e.preventDefault();this.doSpace();break;
      case'Backspace':this.doDel();break;
      case'c':case'C':this.doClear();break;
      case'v':case'V':this.doVoice();break;
      case's':case'S':this.doSpeak();break;
      case'g':case'G':this.toggleGuide();break;
      case'Escape':this.closeGuide();break;
      case'Enter':this.doEnter();break;
    }
  }
  doMode(){toast('Static ASL letters only. J and Z need a motion model.');}

  doSpace(){ if(this.word){this.sentence+=(this.sentence?' ':'')+this.word;this.voice.speak(this.word);this.words++;this.word='';} }
  doDel(){ if(this.word){this.word=this.word.slice(0,-1);} else if(this.sentence){const p=this.sentence.split(' ');this.word=p.pop()||'';this.sentence=p.join(' ');} }
  doClear(){this.word='';this.sentence='';}
  doVoice(){const on=this.voice.toggle();toast(on?'Voice on':'Voice off');}
  doSpeak(){ const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim(); if(f)this.voice.speak(f); }
  doCopy(){ const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim(); if(!f){toast('Nothing to copy');return;} navigator.clipboard?.writeText(f).then(()=>toast('Copied'),()=>toast('Copy failed')); }
  doDownload(){ const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim(); if(!f){toast('Nothing to download');return;} const b=new Blob([f+'\n'],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='vani-setu-translation.txt'; a.click(); URL.revokeObjectURL(a.href); toast('Downloaded'); }
  async doEnter(){ const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim(); if(f){ const s=f+'.'; this.sents++; if(this.word)this.words++; this.log('Sentence: "'+s+'"','sentence'); this.voice.speak(s); this.sentence='';this.word=''; await apiSaveTranslation(s,this.asl.mode); this.loadHistory(); toast('Sentence saved'); } }
  openGuide(){ this.fillGuide(); document.getElementById('guide').classList.add('open'); document.getElementById('guide').setAttribute('aria-hidden','false'); }
  closeGuide(){ document.getElementById('guide').classList.remove('open'); document.getElementById('guide').setAttribute('aria-hidden','true'); }
  toggleGuide(){ document.getElementById('guide').classList.contains('open')?this.closeGuide():this.openGuide(); }
  fillGuide(){
    const spell=true; const info=Object.fromEntries(Object.entries(LETTER_DESC).filter(([letter])=>!['J','Z'].includes(letter)));
    document.getElementById('guideSub').textContent='24 static ASL letters. J/Z motion recognition is unavailable.';
    const grid=document.getElementById('guideGrid'); grid.innerHTML='';
    for(const[name,desc]of Object.entries(info)){ const d=document.createElement('div'); d.className='g-item'; d.innerHTML=`<div class="g-name">${this.esc(name)}</div><div class="g-desc">${this.esc(desc)}</div>`; grid.appendChild(d); }
  }
  async loadHistory(){
    const items=await apiGetTranslations(); const list=document.getElementById('historyList'); if(!list)return;
    if(!items.length){ list.innerHTML='<div class="log-placeholder">No saved sessions yet…</div>'; return; }
    list.innerHTML='';
    items.slice().reverse().forEach(item=>{
      const d=document.createElement('div'); d.className='log-entry log-sentence';
      const time=item.timestamp?new Date(item.timestamp).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'';
      d.innerHTML=`<span class="log-time">${this.esc(time)}</span><span class="log-dot"></span><span class="log-msg">${this.esc(item.text)}</span>`;
      const del=document.createElement('button'); del.textContent='×'; del.className='link-btn'; del.style.cssText='margin-left:auto;font-size:16px;line-height:1;'; del.title='Delete';
      del.onclick=async()=>{await apiDeleteTranslation(item.id);this.loadHistory();};
      d.appendChild(del); list.appendChild(d);
    });
  }
}

/* =========================================================
   ROUTER — chooser / change-mode wiring
   ========================================================= */
const app=new App();
const s2s=new SpeechToSign();

function show(id){
  ['chooser','perm','app','speakApp'].forEach(x=>{
    const el=document.getElementById(x); const on=(x===id);
    el.style.display = on ? '' : 'none';
    if(x==='app') el.style.opacity = on ? '1' : '0';
    el.classList.toggle('gone',!on);
  });
}

function goChooser(){ app.stopCamera(); s2s.stop(); app.voice.syn&&app.voice.syn.cancel(); show('chooser'); }
function goSign(){ show('perm'); }
function goSpeak(){ app.stopCamera(); s2s.reset(); show('speakApp'); }

function boot(){
  app.wire(); s2s.mount();
  document.getElementById('cardSign').onclick=goSign;
  document.getElementById('cardSpeak').onclick=goSpeak;
  document.getElementById('permBack').onclick=goChooser;
  document.getElementById('btnChange').onclick=goChooser;
  document.getElementById('btnChange2').onclick=goChooser;
  document.getElementById('loader').classList.add('gone');
  show('chooser');
}

boot();

window.addEventListener('pagehide',()=>{app.stopCamera();s2s.stop();});
