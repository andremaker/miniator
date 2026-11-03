const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../../src');
test('public API functions',()=>{
 assert.equal(typeof api.render,'function');
 assert.equal(typeof api.prepareScene,'function');
 assert.equal(typeof api.compileStatic,'function');
});
test('reject unsupported or unsafe fixture IDs',()=>{
 assert.throws(()=>api.prepareScene('../../foo'),/Unsupported/);
 assert.throws(()=>api.compileStatic('../foo'),/Unsafe/);
});
