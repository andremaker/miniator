const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cef=require('../../cef/transport');
const root=process.env.CEF_ROOT;
const bridge=process.env.MINIATOR_CEF_BRIDGE||(root&&path.join(root,'Release','miniator_cef_bridge'));
const available=bridge&&fs.existsSync(bridge)&&!!process.env.DISPLAY&&fs.existsSync(path.join(__dirname,'../../engine/atlas_native.node'));
test('native CEF paints raw BGRA into POSIX shared memory', {skip:available?false:'Requires CEF_ROOT, compiled addon and DISPLAY'},async()=>{
 const native=require('../../engine/atlas_native.node');
 const worker=await cef.launch();let tab,pool;
 try{
  const {targetId}=await worker.cdp.send('Target.createTarget',{width:64,height:64,url:'about:blank'});
  const {sessionId}=await worker.cdp.send('Target.attachToTarget',{targetId,flatten:true});tab={targetId,sessionId};
  await worker.cdp.send('Page.enable',{},sessionId);
  const tree=await worker.cdp.send('Page.getFrameTree',{},sessionId);
  await worker.cdp.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:'<!doctype html><body style="margin:0;background:#f00"></body>'},sessionId);
  const f=await worker.cdp.send('Page.miniatorCreateFramePool',{slotCount:2,slotCapacity:64*64*4+64,preferredBackend:'posix-shm'},sessionId);
  pool=native.openPool(f.sharedMemoryName,f.slotCapacity,f.slotCount);
  const m=await worker.cdp.send('Page.captureScreenshot',{miniatorFrameSlot:0,miniatorFrameId:'native-test'},sessionId);
  const tile=native.extractTile(pool,0,64,64,m.miniatorFrame.stride,0,64,64,0);
  assert.deepEqual([...tile.subarray(0,4)],[0,0,255,255]);
  assert.equal(tile.length,64*64*4);
  await worker.cdp.send('Page.miniatorReleaseFrame',{slot:0,frameId:'native-test'},sessionId);
 }finally{
  if(pool)native.closePool(pool);
  if(tab){await worker.cdp.send('Page.miniatorDestroyFramePool',{},tab.sessionId).catch(()=>{});await worker.cdp.send('Target.closeTarget',{targetId:tab.targetId}).catch(()=>{});}
  await cef.stop(worker);
 }
});
