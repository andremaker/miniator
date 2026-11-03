const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('no vendored third-party renderer sources or bundles in Git',()=>{
 const r=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/check-third-party-boundary.js')],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
