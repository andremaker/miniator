'use strict';
// JSON-lines CEF native bridge. Matches the existing CDP.send() call surface
// without changing Miniator's atlas, ROI, native SHM extraction, or FFmpeg paths.
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const {once} = require('node:events');

class CefTransport {
  constructor(proc, startupTimeout=30000) {
    this.proc=proc;
    this.id=0;
    this.pending=new Map();
    this.closed=false;
    this.ready=false;
    this.startupTimeout=startupTimeout;
    this.stderr='';
    proc.stderr.on('data', c => this.stderr=(this.stderr+c.toString()).slice(-30000));
    const lines=readline.createInterface({input:proc.stdout, crlfDelay:Infinity});
    lines.on('line',line=>{
      let msg;try{msg=JSON.parse(line)}catch{return this._fail(new Error('CEF bridge sent invalid JSON: '+line.slice(0,200)))}
      if(msg.event==='ready') {
        if(msg.protocol!==1)return this._fail(new Error('Unsupported CEF bridge protocol'));
        this.ready=true;
        this.version=msg.version || 'CEF';
        this.onReady?.();
        return;
      }
      const entry=this.pending.get(msg.id);
      if(!entry)return;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if(msg.error)entry.reject(new Error('CEF '+entry.method+': '+JSON.stringify(msg.error)));
      else entry.resolve(msg.result||{});
    });
    proc.once('exit',(code,signal)=>this._fail(new Error('CEF bridge exited '+code+' '+signal+' '+this.stderr)));
    proc.once('error',e=>this._fail(e));
  }
  _fail(e) {
    if(this.closed)return;
    this.closed=true;
    this.onError?.(e);
    for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(e)}
    this.pending.clear();
  }
  async start(){
    if(this.ready)return this;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(new Error('CEF bridge startup timed out: '+this.stderr))},this.startupTimeout);
      const cleanup=()=>{clearTimeout(timer);this.onReady=null;this.onError=null};
      this.onReady=()=>{cleanup();resolve()};
      this.onError=e=>{cleanup();reject(e)};
      if(this.ready){cleanup();resolve()}
      else if(this.closed){cleanup();reject(new Error('CEF bridge closed: '+this.stderr))}
    });
    return this;
  }
  send(method,params={},sessionId){
    if(this.closed)return Promise.reject(new Error('CEF bridge closed'));
    if(!this.ready)return Promise.reject(new Error('CEF bridge not ready'));
    const id=++this.id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CEF bridge timeout: '+method))},30000);
      this.pending.set(id,{resolve,reject,timer,method});
      this.proc.stdin.write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\n',e=>{
        if(e){const entry=this.pending.get(id);if(entry){clearTimeout(entry.timer);this.pending.delete(id);reject(e)}}
      });
    });
  }
}
async function launch({binary=process.env.MINIATOR_CEF_BRIDGE || (process.env.CEF_ROOT && path.join(process.env.CEF_ROOT,'Release','miniator_cef_bridge')),args=[]}={}) {
  if(!binary)throw new Error('Set MINIATOR_CEF_BRIDGE or CEF_ROOT to the external CEF native host executable');
  const env={...process.env};
  delete env.LD_PRELOAD;delete env.MALLOC_CONF;delete env.DBUS_SESSION_BUS_ADDRESS;
  if(process.env.CEF_ROOT)env.LD_LIBRARY_PATH=[path.join(process.env.CEF_ROOT,'Release'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  const proc=spawn(path.resolve(binary),args,{stdio:['pipe','pipe','pipe'],env});
  const cdp=new CefTransport(proc);
  try{await cdp.start();return {proc,cdp,cef:true,version:cdp.version}}
  catch(e){proc.kill();throw e}
}
async function stop(b){
  if(!b)return;
  if(b.cdp&&!b.cdp.closed)try{await b.cdp.send('Browser.close')}catch{}
  if(b.proc.exitCode===null) {
    b.proc.stdin.end();
    const timer=setTimeout(()=>b.proc.kill('SIGKILL'),1500);
    try{await once(b.proc,'exit')}catch{}finally{clearTimeout(timer)}
  }
}
module.exports={CefTransport,launch,stop};
