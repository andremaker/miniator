const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('predictive atlas plans are cached for irrelevant props and computed before rendering',()=>{
 const p=spawnSync(process.execPath,[path.resolve(__dirname,'../../engine/test_predictive_atlas_plan.js')],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/"status": "PASS"/);
});
