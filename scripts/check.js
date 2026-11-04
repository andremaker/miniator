#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=['src/index.js','bin/miniator.js','scripts/build-native.js',
  'engine/plan_renderer.js','engine/predictive_atlas_plan.js','engine/atlas_capacity_planner.js',
  'engine/dependency_transform.js','engine/build_static.js','engine/build_compiled_js.js','engine/prepare_compiled_scene.js'];
for(const f of files)execFileSync(process.execPath,['--check',path.join(root,f)],{stdio:'inherit'});
const jsonFiles=['package.json','package-lock.json','engine/strategy_registry_general.json','engine/bundle_manifest.json'];
for(const f of jsonFiles){const full=path.join(root,f);if(fs.existsSync(full))JSON.parse(fs.readFileSync(full,'utf8'));else if(f==='package.json'||f==='package-lock.json')throw Error('Missing manifest '+f);}
console.log('Syntax and manifests OK ('+files.length+' JS, '+jsonFiles.length+' JSON)');
