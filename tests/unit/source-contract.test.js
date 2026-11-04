const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const engine=path.resolve(__dirname,'../../engine');
test('capture uses CEF shared-memory protocol and never sends encoded images',()=>{
 const source=fs.readFileSync(path.join(engine,'plan_renderer.js'),'utf8');
 assert.match(source,/cef\.launch\(\)/);
 assert.match(source,/Page\.miniatorCreateFramePool/);
 assert.match(source,/result\.miniatorFrame/);
 assert.match(source,/miniatorExpectedMarker/);
 assert.match(source,/surfaceWidth=aw\+1/);
 assert.match(source,/CEF_PREDICTED_ROI/);
 assert.match(source,/--damage-crop/);
 assert.doesNotMatch(source,/format:\s*['"]png['"]/);
});
test('CMake build keeps CEF external to repository',()=>{
 const script=fs.readFileSync(path.resolve(__dirname,'../../scripts/build-cef.js'),'utf8');
 assert.match(script,/CEF_ROOT/);
 assert.match(script,/outside the Miniator repository/);
});
