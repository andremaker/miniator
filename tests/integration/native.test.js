const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const nativePath=path.resolve(__dirname,'../../engine/atlas_native.node');
test('native module exports the production shared-memory capture functions',()=>{
 if(!fs.existsSync(nativePath))return test.skip('run npm run build:native');
 const native=require(nativePath);
 for(const fn of ['openPool','closePool','extractTile','extractTileGrid'])assert.equal(typeof native[fn],'function',fn);
});
