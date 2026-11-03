const test=require('node:test');
const assert=require('node:assert/strict');
const {geometry,sceneComplexity}=require('../../engine/atlas_capacity_planner');
test('larger atlas tiles require constrained dimensions',()=>{
 assert(geometry(8,200,100));
 assert.equal(geometry(8,40000,100),null);
});
test('complexity estimate reacts to CSS effects',()=>{
 const a=sceneComplexity('<div />');
 const b=sceneComplexity('<div style={{filter:"blur(8px)", transform:"scale(2)"}}/>');
 assert(b.factor>a.factor);
});
