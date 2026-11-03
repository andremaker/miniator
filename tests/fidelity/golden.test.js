const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
test('offline decoded frame QA against known reference',()=>{
 const gold=path.resolve(__dirname,'../reference/initial_packed_fixture.mp4');
 const r=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/fidelity.js'),gold,gold,'1'],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(r.stdout).frames,90);
});
