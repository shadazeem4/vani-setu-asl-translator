const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {setAttribute(){},value:'en-IN',style:{}, classList:{add(){},remove(){},toggle(){}}, textContent:'', disabled:false, videoWidth:640, videoHeight:480, readyState:2,currentTime:1, play:async()=>{},getContext:()=>({}),srcObject:null});
  return elements.get(id);
}
const context={console,assert,AbortController,Blob,document:{getElementById:element},window:{isSecureContext:true,addEventListener(){}}, navigator:{mediaDevices:{}},performance:{now:()=>1},setInterval:()=>1,clearInterval(){},cancelAnimationFrame(){},setTimeout,clearTimeout};
vm.createContext(context);
let source=fs.readFileSync('vani-setu/frontend/js/app.js','utf8').replace(/\nboot\(\);/, '\n');
vm.runInContext(source,context);
(async()=>{
await vm.runInContext(`(async()=>{
  let micStops=0;
  navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop:()=>micStops++}]});
  window.MediaRecorder=globalThis.MediaRecorder=class {
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'])});this.done=this.onstop();}
  };
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({text:'Hello'})});
  const speech=new SpeechToSign();let built='';speech.build=t=>built=t;
  await speech.toggleMic();const first=speech.localSession;
  assert.equal(speech.listening,true);await speech.toggleMic();await first.recorder.done;
  assert.equal(built,'Hello');assert.equal(speech.localSession,null);assert.ok(micStops>0);
  globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({detail:'Model missing'})});
  await speech.toggleMic();const second=speech.localSession;await speech.toggleMic();await second.recorder.done;
  assert.match(document.getElementById('micState').textContent,/Model missing/);
  await speech.toggleMic();speech.cancelMic();assert.equal(speech.localSession,null);
  assert.equal(built,'Hello');
  let permit; navigator.mediaDevices.getUserMedia=()=>new Promise(r=>permit=r);
  const pendingMic=speech.toggleMic();speech.cancelMic();let lateReleased=false;
  permit({getTracks:()=>[{stop:()=>lateReleased=true}]});await pendingMic;assert.equal(lateReleased,true);
  assert.equal(tokenizeToSigns('Thank you!').length,1);
  assert.equal(tokenizeToSigns('I love you')[0].motion,'love');
  assert.ok(tokenizeToSigns('an unsupported sentence').length>0);
  const introduction=tokenizeToSigns('My name is Azeem');
  assert.equal(introduction[0].label,'My name is');
  assert.equal(introduction.slice(1).map(t=>t.label).join(''),'AZEEM');
  assert.equal(tokenizeToSigns('Hello, I love you. Thank you!').length,3);
  assert.equal(tokenizeToSigns('thank you thank you').length,2);
  assert.equal(tokenizeToSigns('!!!').length,0);
  assert.ok(tokenizeToSigns('नमस्ते 123').every(t=>t.type==='caption'));
  assert.equal(tokenizeToSigns('abcdefghijklmnopqrstuvwxyz').length,26);
  assert.equal(tokenizeToSigns('jazzy')[0].motion,'letter-j');
  for(const token of tokenizeToSigns('My name is Azeem. Hello 123 नमस्ते')){
    const svg=buildStickMan(token);
    assert.ok(svg.includes('stick-fingers'));
    assert.ok(!svg.includes('hand-svg'),'Only line-drawn stick figure hands');
    assert.ok(!svg.includes('undefined'));
  }
  for(const g of GESTURES)assert.ok(buildStickMan(g).includes('stick-man'));
  const classifier=new ASL();
  const lm=Array.from({length:21},(_,i)=>({x:i/30,y:i/30}));
  let commits=0;for(let i=0;i<100;i++)if(classifier.update(lm,{label:'A',confidence:.99})[0])commits++;
  assert.equal(commits,1,'held sign must commit only once');
  classifier.reset();for(let i=0;i<14;i++)if(classifier.update(lm,{label:'A',confidence:.99})[0])commits++;
  assert.equal(commits,2,'hand release allows repeating a letter');
  classifier.reset();for(let i=0;i<20;i++)assert.equal(classifier.update(lm,{label:null,confidence:.5})[0],null);
  const summary=summarizeTrials([{expected:'A',predicted:'A'},{expected:'B',predicted:null},{expected:'REJECT',predicted:null}]);
  assert.equal(summary.correct,2);assert.equal(summary.total,3);assert.equal(summary.classes,2);assert.equal(summary.rejected,2);
  assert.equal(summarizeTrials([]).accuracy,null);
  globalThis.fetch=async()=>({ok:true,json:async()=>({ready:true})});
  const camera=new App(); let stopped=0;
  const stream={getTracks:()=>[{stop:()=>stopped++}]};
  navigator.mediaDevices.getUserMedia=async()=>stream;
  camera.ensureModel=async()=>{}; camera.loadHistory=()=>{};camera.loop=()=>{};
  show('perm'); assert.equal(document.getElementById('app').style.display,'none');
  await camera.cam(); assert.equal(camera.running,true);assert.equal(document.getElementById('app').style.display,'');
  camera.stopCamera(); assert.equal(stopped,1);assert.equal(camera.vid.srcObject,null);
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error('Denied'),{name:'NotAllowedError'})};
  await camera.cam();assert.match(document.getElementById('permHint').textContent,/permission denied/);assert.equal(document.getElementById('startBtn').disabled,false);
  navigator.mediaDevices.getUserMedia=async()=>stream;
  camera.ensureModel=async()=>{throw new Error('model fetch failed')};
  await camera.cam();assert.match(document.getElementById('permHint').textContent,/Recognition could not load/);assert.equal(stopped,2);
  let resolve; navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const pending=camera.cam();camera.stopCamera();resolve(stream);await pending;
  assert.equal(camera.running,false);assert.equal(stopped,3,'late camera stream is released');
})()`,context);
console.log('PASS: speech lifecycle, persistent errors, transcript delivery, cancellation, phrase mapping, unsupported text, duplicate suppression, camera visibility, cleanup, permission/model errors, cancelled startup');
})().catch(e=>{console.error(e);process.exitCode=1});
