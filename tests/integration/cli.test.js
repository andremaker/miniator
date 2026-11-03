const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('CLI displays usage without browser',()=>{
 const p=spawnSync(process.execPath,[path.resolve(__dirname,'../../bin/miniator.js'),'help'],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/miniator render/);
});
