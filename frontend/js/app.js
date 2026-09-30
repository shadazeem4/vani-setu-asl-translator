import { HandLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs";

// ============ BACKEND API ============
const API_BASE = '/api';

async function apiSaveTranslation(text, mode) {
  try {
    const res = await fetch(`${API_BASE}/translations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode, timestamp: new Date().toISOString() })
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[api] could not save translation:', e.message);
    return null;
  }
}

async function apiGetTranslations() {
  try {
    const res = await fetch(`${API_BASE}/translations`);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[api] could not load translations:', e.message);
    return [];
  }
}

async function apiDeleteTranslation(id) {
  try {
    const res = await fetch(`${API_BASE}/translations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    return true;
  } catch (e) {
    console.warn('[api] could not delete translation:', e.message);
    return false;
  }
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

// ============ ASL CLASSIFIER ============
class ASL {
  constructor(){
    this.mode='PHRASE'; this.buf=[]; this.mx=14; this.thr=9;
    this.cd=0; this.cdm=22; this.disp='?';
    this.fg=[false,false,false,false,false];
    this.stableCount=0; this.stableSign='?';
  }
  toggle(){ this.mode=this.mode==='PHRASE'?'SPELL':'PHRASE'; this.reset(); return this.mode; }
  _d(l,a,b){ return Math.hypot(l[a].x-l[b].x, l[a].y-l[b].y, l[a].z-l[b].z); }
  _fg(l){
    const f=[];
    f.push(l[5].x<l[17].x ? l[4].x<l[2].x : l[4].x>l[2].x);
    for(const[t,p]of[[8,6],[12,10],[16,14],[20,18]]) f.push(l[t].y<l[p].y);
    this.fg=f; return f;
  }
  _phrase(l){
    const f=this._fg(l),[T,I,M,R,P]=f,n=f.filter(Boolean).length;
    const h=this._d(l,0,9); if(h<.01)return'?';
    const ti=this._d(l,4,8)/h,im=this._d(l,8,12)/h,mr=this._d(l,12,16)/h,tc=ti<.28;
    if(T&&I&&!M&&!R&&P) return"I Love You";
    if(!T&&I&&!M&&!R&&P) return"Rock On";
    if(n===5) return(im>.2&&mr>.15)?"Hello":"Stop";
    if(n===4){ if(!T)return"Four"; if(!P&&tc)return"OK"; }
    if(n===3){ if(I&&M&&R&&im>.18&&mr>.18)return"Three"; if(T&&I&&M&&!R&&!P&&im>.22)return"Gun"; if((M&&R&&P&&tc)||(T&&I&&M&&tc))return"OK"; }
    if(n===2){ if(T&&P)return"Call Me"; if(T&&I)return"Awesome"; if(I&&M){ if(im<.1)return"Good Luck"; return im>.32?"Peace":"You"; } }
    if(n===1){ if(T)return"Good"; if(I)return"Wait"; if(P)return"Me"; }
    if(n===0){ if(tc)return"OK"; return l[4].y<l[6].y?"Yes":"No"; }
    return'?';
  }
  _spell(l){
    const f=this._fg(l),[T,I,M,R,P]=f,n=f.filter(Boolean).length;
    const h=this._d(l,0,9); if(h<.01)return'?';
    const ti=this._d(l,4,8)/h,im=this._d(l,8,12)/h,mr=this._d(l,12,16)/h,tc=ti<.28;
    if(n===0){
      if(tc)return'O';
      // C = open curved claw: thumb & fingers held apart, not a tight fist
      const openIdx=this._d(l,0,8)/h, thumbOpen=this._d(l,0,4)/h;
      if(openIdx>1.0&&openIdx<1.55&&thumbOpen>0.8)return'C';
      const tb=l[4].y<l[6].y,bs=Math.abs(l[4].x-l[5].x)>Math.abs(l[4].x-l[9].x);
      if(bs&&tb)return'A';
      if(!tb){const a=(l[8].y+l[12].y+l[16].y+l[20].y)/4;return Math.abs(a-l[4].y)<.06?'E':'S';}
      return'A';
    }
    if(n===1){if(P)return'I';if(T)return'A';if(I){const dx=Math.abs(l[8].x-l[5].x),dy=Math.abs(l[8].y-l[5].y);return dx>dy*.9?'G':'D';}}
    if(n===2){
      if(T&&P)return'Y';if(T&&I)return'L';
      if(I&&M){
        const dx=Math.abs(l[8].x-l[5].x),dy=Math.abs(l[8].y-l[5].y);
        if(dx>dy)return'H';        // fingers pointing sideways
        if(im<.1)return'R';         // crossed
        return im>.32?'V':'U';
      }
    }
    if(n===3){if(I&&M&&R&&im>.18&&mr>.18)return'W';if(T&&I&&M&&!R&&!P&&im>.22)return'K';if((M&&R&&P&&tc)||(T&&I&&M&&tc))return'F';}
    if(n===4){if(!T)return'B';if(!P&&tc)return'F';}
    if(n===5)return(im>.2&&mr>.15)?'5':'B';
    return'?';
  }
  // returns [committedSign|null, displaySign, holdRatio 0..1, confidence 0..1]
  update(l){
    const s=this.mode==='PHRASE'?this._phrase(l):this._spell(l);
    this.buf.push(s); if(this.buf.length>this.mx)this.buf.shift();

    // confidence = agreement of the top sign within the buffer
    const c={}; this.buf.forEach(x=>c[x]=(c[x]||0)+1);
    let b='?',bc=0; for(const[k,v]of Object.entries(c))if(v>bc){b=k;bc=v;}
    const conf = b==='?' ? 0 : bc/this.buf.length;

    if(this.cd>0){ this.cd--; this.disp=this._top(); return[null,this.disp,0,conf]; }

    const hold = b==='?' ? 0 : Math.min(1, bc/this.thr);
    if(b!=='?'&&bc>=this.thr){ this.cd=this.cdm; this.buf.length=0; this.disp=b; return[b,b,1,conf]; }
    this.disp=this._top(); return[null,this.disp,hold,conf];
  }
  _top(){if(!this.buf.length)return'?';const c={};this.buf.forEach(x=>c[x]=(c[x]||0)+1);let b='?',bc=0;for(const[k,v]of Object.entries(c))if(v>bc){b=k;bc=v;}return b;}
  reset(){this.buf.length=0;this.disp='?';this.cd=0;this.fg=[false,false,false,false,false];}
}

// ============ VOICE ============
class Voice {
  constructor(){this.on=true;this.busy=false;this.syn=window.speechSynthesis;}
  speak(t){
    if(!this.on||!t||this.busy||!this.syn)return;
    const u=new SpeechSynthesisUtterance(t);u.rate=0.9;
    u.onend=()=>this.busy=false;u.onerror=()=>this.busy=false;
    this.busy=true;this.syn.cancel();this.syn.speak(u);
  }
  toggle(){this.on=!this.on;return this.on;}
}

// ============ HAND CONNECTIONS ============
const HC=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];

// theme colors used on the canvas overlay
const COL_SAGE = '#5E7A5A';
const COL_OCEAN = '#3F7A8C';

function toast(msg){
  const box=document.getElementById('toasts');
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  box.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(10px)'; t.style.transition='.3s'; },1800);
  setTimeout(()=>t.remove(),2150);
}

// ============ MAIN APP ============
class App {
  constructor(){
    this.asl=new ASL();this.voice=new Voice();
    this.word='';this.sentence='';this.flash=0;
    this.signs=0;this.words=0;this.sents=0;
    this.hl=null;this.vid=null;this.cvs=null;this.cx=null;
    this.startTime=0;
    this.fpsLast=performance.now();this.fpsFrames=0;this.fps=0;
  }
  async init(){
    const v=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
    this.hl=await HandLandmarker.createFromOptions(v,{
      baseOptions:{modelAssetPath:"/models/hand_landmarker.task"},
      numHands:1,runningMode:"VIDEO",
      minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5
    });
    document.getElementById('loader').classList.add('gone');
    document.getElementById('perm').classList.remove('gone');
    document.getElementById('startBtn').onclick=()=>this.cam();
    document.addEventListener('keydown',e=>this.key(e));
    document.getElementById('btnSpeak').onclick=()=>this.doSpeak();
    document.getElementById('btnSpace').onclick=()=>this.doSpace();
    document.getElementById('btnDel').onclick=()=>this.doDel();
    document.getElementById('btnEnter').onclick=()=>this.doEnter();
    document.getElementById('btnClear').onclick=()=>this.doClear();
    document.getElementById('btnVoice').onclick=()=>this.doVoice();
    document.getElementById('pillPhrase').onclick=()=>{if(this.asl.mode!=='PHRASE')this.doMode();};
    document.getElementById('pillSpell').onclick=()=>{if(this.asl.mode!=='SPELL')this.doMode();};
    document.getElementById('btnCopy').onclick=()=>this.doCopy();
    document.getElementById('btnSave').onclick=()=>this.doDownload();
    document.getElementById('btnRefresh').onclick=()=>{this.loadHistory();toast('History refreshed');};
    // guide drawer
    document.getElementById('btnGuide').onclick=()=>this.openGuide();
    document.getElementById('guideClose').onclick=()=>this.closeGuide();
    document.getElementById('guideBackdrop').onclick=()=>this.closeGuide();
    this.loadHistory();
  }
  async cam(){
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}});
      this.vid=document.getElementById('webcam');this.vid.srcObject=s;await this.vid.play();
      this.cvs=document.getElementById('canvas');
      this.cvs.width=this.vid.videoWidth||640;this.cvs.height=this.vid.videoHeight||480;
      this.cx=this.cvs.getContext('2d');
      document.getElementById('perm').classList.add('gone');
      document.getElementById('app').style.opacity='1';
      this.startTime=Date.now();
      setInterval(()=>this.tickTimer(),1000);
      this.loop();
    }catch(e){
      const hint=document.getElementById('permHint');
      if(hint){hint.textContent='Camera blocked — allow it in the address bar, then reload.';hint.style.color='var(--rose)';}
    }
  }
  tickTimer(){
    if(!this.startTime)return;
    const s=Math.floor((Date.now()-this.startTime)/1000);
    const mm=String(Math.floor(s/60)).padStart(2,'0');
    const ss=String(s%60).padStart(2,'0');
    const el=document.getElementById('timerVal'); if(el)el.textContent=`${mm}:${ss}`;
  }
  loop(){
    // fps
    this.fpsFrames++;
    const now=performance.now();
    if(now-this.fpsLast>=500){
      this.fps=Math.round(this.fpsFrames*1000/(now-this.fpsLast));
      this.fpsFrames=0;this.fpsLast=now;
      const fe=document.getElementById('fpsVal'); if(fe)fe.textContent=this.fps;
    }

    const r=this.hl.detectForVideo(this.vid,now);
    this.cx.clearRect(0,0,this.cvs.width,this.cvs.height);
    let sign='?',com=null,ok=false,hold=0,conf=0;
    if(r.landmarks&&r.landmarks.length){
      ok=true;const lm=r.landmarks[0];
      this.draw(lm);[com,sign,hold,conf]=this.asl.update(lm);
    }else this.asl.reset();

    if(com){
      this.flash=15;this.signs++;
      if(this.asl.mode==='PHRASE'){
        if(this.word){this.sentence+=(this.sentence?' ':'')+this.word;this.word='';this.words++;}
        this.sentence+=(this.sentence?' ':'')+com;
        this.log(com,'sign');
      }else{
        this.word+=com;
        this.log('Letter: '+com,'letter');
      }
      this.voice.speak(com);
    }
    if(this.flash>0)this.flash--;
    this.ui(sign,ok,hold,conf);
    requestAnimationFrame(()=>this.loop());
  }
  draw(lm){
    const w=this.cvs.width,h=this.cvs.height,c=this.cx;
    const col=this.asl.mode==='PHRASE'?COL_SAGE:COL_OCEAN;
    c.strokeStyle=col;c.lineWidth=3;c.globalAlpha=.85;c.lineCap='round';
    for(const[a,b]of HC){c.beginPath();c.moveTo(lm[a].x*w,lm[a].y*h);c.lineTo(lm[b].x*w,lm[b].y*h);c.stroke();}
    c.globalAlpha=1;const tips=new Set([4,8,12,16,20]);
    for(let i=0;i<lm.length;i++){
      const x=lm[i].x*w,y=lm[i].y*h,t=tips.has(i);
      c.beginPath();c.arc(x,y,t?6:4,0,Math.PI*2);c.fillStyle=t?'#fff':col;c.fill();
      if(t){c.beginPath();c.arc(x,y,11,0,Math.PI*2);c.strokeStyle=col;c.lineWidth=2.5;c.globalAlpha=.5;c.stroke();c.globalAlpha=1;}
    }
  }
  log(text,type){
    const ph=document.getElementById('logPlaceholder');if(ph)ph.remove();
    const list=document.getElementById('logList');
    const now=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const d=document.createElement('div');
    d.className='log-entry log-'+type;
    d.innerHTML=`<span class="log-time">${now}</span><span class="log-dot"></span><span class="log-msg">${this.esc(text)}</span>`;
    list.appendChild(d);list.scrollTop=list.scrollHeight;
    if(list.children.length>30)list.firstChild.remove();
  }
  esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  ui(sign,ok,hold,conf){
    const spell=this.asl.mode==='SPELL';
    const st=document.getElementById('signText'),sd=document.getElementById('signDesc'),sc=document.getElementById('signCard');
    st.textContent=sign==='?'?'…':sign;
    st.className='sign-text'+(sign!=='?'&&ok?' lit':'');
    sc.classList.toggle('active',sign!=='?'&&ok);
    sc.classList.toggle('spell',spell);
    if(this.flash===14){st.classList.remove('commit-pop');void st.offsetWidth;st.classList.add('commit-pop');}
    const info=spell?S_INFO:P_INFO;
    sd.textContent=info[sign]||(sign==='?'?'Show your hand to begin':'');

    // confidence + hold bar
    const cf=document.getElementById('confTxt'); if(cf)cf.textContent=(ok?Math.round(conf*100):0)+'%';
    const hb=document.getElementById('holdBar'); if(hb)hb.style.width=(ok?Math.round(hold*100):0)+'%';

    // big cam overlay sign
    const cs=document.getElementById('camSign');
    if(cs){ cs.textContent=sign==='?'?'':sign; cs.classList.toggle('show',sign!=='?'&&ok); }

    document.getElementById('camWrap').classList.toggle('flash-border',this.flash>10);

    const mb=document.getElementById('modeBadge');
    mb.textContent=this.asl.mode;mb.className='badge mode-badge '+(spell?'spell':'phrase');
    const hbd=document.getElementById('handBadge');
    hbd.textContent=ok?'TRACKING':'NO HAND';hbd.className='badge hand-badge '+(ok?'ok':'none');

    this.asl.fg.forEach((on,i)=>document.getElementById('f'+i).classList.toggle('on',on));

    const full=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim();
    document.getElementById('transText').innerHTML=full?this.esc(full)+'<span class="cur"></span>':'Show signs to translate…<span class="cur"></span>';
    document.getElementById('wordText').textContent=this.word||'…';

    // mode pill
    const pill=document.getElementById('modePill');
    pill.classList.toggle('spell',spell);
    document.getElementById('pillPhrase').className='pill-opt'+(spell?'':' active-phrase');
    document.getElementById('pillSpell').className='pill-opt'+(spell?' active-spell':'');

    const vb=document.getElementById('btnVoice');
    vb.textContent=this.voice.on?'Voice ON':'Voice OFF';vb.classList.toggle('off',!this.voice.on);

    document.getElementById('stSigns').textContent=this.signs;
    document.getElementById('stWords').textContent=this.words;
    document.getElementById('stSent').textContent=this.sents;
  }
  key(e){
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
  doMode(){
    const m=this.asl.toggle();
    if(m==='PHRASE'&&this.word){this.sentence+=(this.sentence?' ':'')+this.word;this.word='';this.words++;}
    this.log('Switched to '+m+' mode','letter');
    if(document.getElementById('guide').classList.contains('open'))this.fillGuide();
  }
  doSpace(){
    if(this.word){this.sentence+=(this.sentence?' ':'')+this.word;this.voice.speak(this.word);this.words++;this.word='';}
  }
  doDel(){
    if(this.word){this.word=this.word.slice(0,-1);}
    else if(this.sentence){const p=this.sentence.split(' ');this.word=p.pop()||'';this.sentence=p.join(' ');}
  }
  doClear(){this.word='';this.sentence='';}
  doVoice(){const on=this.voice.toggle();toast(on?'Voice on':'Voice off');}
  doSpeak(){
    const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim();
    if(f)this.voice.speak(f);
  }
  doCopy(){
    const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim();
    if(!f){toast('Nothing to copy');return;}
    navigator.clipboard?.writeText(f).then(()=>toast('Copied to clipboard'),()=>toast('Copy failed'));
  }
  doDownload(){
    const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim();
    if(!f){toast('Nothing to download');return;}
    const blob=new Blob([f+'\n'],{type:'text/plain'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='vani-setu-translation.txt';
    a.click();URL.revokeObjectURL(a.href);
    toast('Downloaded');
  }
  async doEnter(){
    const f=(this.sentence+(this.word?(this.sentence?' ':'')+this.word:'')).trim();
    if(f){
      const s=f+'.';this.sents++;
      if(this.word)this.words++;
      this.log('Sentence: "'+s+'"','sentence');
      this.voice.speak(s);this.sentence='';this.word='';
      await apiSaveTranslation(s,this.asl.mode);
      this.loadHistory();
      toast('Sentence saved');
    }
  }
  // ============ SIGN GUIDE ============
  openGuide(){ this.fillGuide(); document.getElementById('guide').classList.add('open'); document.getElementById('guide').setAttribute('aria-hidden','false'); }
  closeGuide(){ document.getElementById('guide').classList.remove('open'); document.getElementById('guide').setAttribute('aria-hidden','true'); }
  toggleGuide(){ document.getElementById('guide').classList.contains('open')?this.closeGuide():this.openGuide(); }
  fillGuide(){
    const spell=this.asl.mode==='SPELL';
    const info=spell?S_INFO:P_INFO;
    document.getElementById('guideSub').textContent=spell?'Letters you can fingerspell':'Phrases you can sign right now';
    const grid=document.getElementById('guideGrid');
    grid.innerHTML='';
    for(const[name,desc]of Object.entries(info)){
      const d=document.createElement('div');
      d.className='g-item';
      d.innerHTML=`<div class="g-name">${this.esc(name)}</div><div class="g-desc">${this.esc(desc)}</div>`;
      grid.appendChild(d);
    }
  }
  // ============ PAST SESSIONS ============
  async loadHistory(){
    const items=await apiGetTranslations();
    const list=document.getElementById('historyList');
    if(!list)return;
    if(!items.length){
      list.innerHTML='<div class="log-placeholder">No saved sessions yet…</div>';
      return;
    }
    list.innerHTML='';
    items.slice().reverse().forEach(item=>{
      const d=document.createElement('div');
      d.className='log-entry log-sentence';
      const time=item.timestamp?new Date(item.timestamp).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'';
      d.innerHTML=`<span class="log-time">${this.esc(time)}</span><span class="log-dot"></span><span class="log-msg">${this.esc(item.text)}</span>`;
      const del=document.createElement('button');
      del.textContent='×';
      del.className='link-btn';
      del.style.cssText='margin-left:auto;font-size:16px;line-height:1;';
      del.title='Delete';
      del.onclick=async()=>{await apiDeleteTranslation(item.id);this.loadHistory();};
      d.appendChild(del);
      list.appendChild(d);
    });
  }
}
const app=new App();
app.init().catch(e=>{
  console.error(e);
  document.getElementById('loader').innerHTML=`<div class="ld-title">Something went wrong</div><p style="color:var(--rose);max-width:360px;text-align:center">${e.message}</p><p style="color:var(--ink-3)">Use Chrome or Edge and refresh the page.</p>`;
});
