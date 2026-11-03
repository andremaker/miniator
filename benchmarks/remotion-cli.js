#!/usr/bin/env node
'use strict';
// External opponent only: forward arguments to Remotion's installed public CLI.
// No Remotion source code or generated bundles belong in Miniator's Git history.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let bin;
try{const pkg=require.resolve('@remotion/cli/package.json',{paths:[root]});
 const info=require(pkg); bin=path.join(path.dirname(pkg),info.bin.remotion)}
catch{console.error('Install the Remotion development dependencies (npm ci).');process.exit(2)}
const args=process.argv.slice(2);
if(!args.length||args.includes('--help-miniator')){
 console.log('Usage: npm run benchmark:remotion -- render <entry> <composition> <output> [Remotion CLI options]');
 process.exit(0);
}
const result=spawnSync(process.execPath,[bin,...args],{stdio:'inherit',env:process.env,cwd:process.cwd()});
if(result.error)throw result.error;
if(result.signal){console.error('External Remotion CLI stopped by',result.signal);process.exit(1)}
process.exit(result.status??1);
