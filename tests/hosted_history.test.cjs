const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname,'../frontend/js/app.js'),'utf8').split('// ============ SIGN DESCRIPTIONS')[0];
function visitor(){
  const storage = new Map();
  const context = vm.createContext({console, crypto:{randomUUID}, window:{location:{hostname:'demo.onrender.com'}},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    fetch:()=>{throw new Error('Hosted history must not use the shared server');}});
  vm.runInContext(source,context);
  return context;
}
(async()=>{
  const first=visitor(), second=visitor();
  await vm.runInContext("apiSaveTranslation('Private sentence','spell')",first);
  assert.equal((await vm.runInContext('apiGetTranslations()',first))[0].text,'Private sentence');
  assert.equal((await vm.runInContext('apiGetTranslations()',second)).length,0);
  await vm.runInContext('(async()=>{const rows=await apiGetTranslations();await apiDeleteTranslation(rows[0].id);})()',first);
  assert.equal((await vm.runInContext('apiGetTranslations()',first)).length,0);
  console.log('PASS: hosted history stays in each browser and supports deletion');
})().catch(error=>{console.error(error);process.exitCode=1;});
