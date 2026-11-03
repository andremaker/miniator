'use strict';
// Restricted but automatic static/dependency compiler for the five-scene TSX corpus.
// Finds values transitively dependent on useCurrentFrame(), converts derived locals
// into lazy closures and installs dynamic markers ONLY for affected JSX leaf props/text.
// It does not invoke a component, rebuild JSX, or reconcile a tree between frames.
const ts=require('typescript'),fs=require('fs'),path=require('path');
function compileDependency(input,output){
if(!input||!output)throw Error('Usage: dependency_transform(source.tsx, generated.tsx)');
const code=fs.readFileSync(input,'utf8');
const sf=ts.createSourceFile(path.basename(input),code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let diagnostics=[];
const dynamic=new Set();const vars=[];
function identifiers(expr,acc=new Set()){
 if(!expr)return acc;
 if(ts.isIdentifier(expr))acc.add(expr.text);
 ts.forEachChild(expr,c=>{identifiers(c,acc)});return acc;
}
function isHook(e){return ts.isCallExpression(e)&&e.expression.getText(sf)==='useCurrentFrame';}
function collect(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&!ts.isArrowFunction(node.initializer)&&!ts.isFunctionExpression(node.initializer))vars.push({name:node.name.text,initializer:node.initializer,node});ts.forEachChild(node,collect)}
collect(sf);
for(const v of vars)if(isHook(v.initializer))dynamic.add(v.name);
let added=true;while(added){added=false;for(const v of vars){if(!dynamic.has(v.name)&&[...identifiers(v.initializer)].some(n=>dynamic.has(n))){dynamic.add(v.name);added=true}}}
function dyn(e){return !!e&&[...identifiers(e)].some(n=>dynamic.has(n))}
function containsJsx(n){let found=false;function visit(x){if(ts.isJsxElement(x)||ts.isJsxSelfClosingElement(x)||ts.isJsxFragment(x)){found=true;return;}ts.forEachChild(x,visit)}visit(n);return found;}
const f=ts.factory;
const glob=f.createPropertyAccessExpression(f.createIdentifier('globalThis'),'__MINIATOR_FRAME__');
const mkCall=name=>f.createCallExpression(f.createIdentifier(name),undefined,[]);
function wrap(expr){return f.createCallExpression(f.createIdentifier('__miniatorDynamic'),undefined,[f.createArrowFunction(undefined,undefined,[],undefined,f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),expr)])}
const changes=[];
const result=ts.transform(sf,[ctx=>{
 function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&dynamic.has(node.name.text)){
   const body=isHook(node.initializer)?glob:ts.visitNode(node.initializer,visit);
   changes.push({binding:node.name.text,kind:'dynamic-closure'});
   return f.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,
    isHook(node.initializer)?f.createArrowFunction(undefined,undefined,[],undefined,f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),body):f.createCallExpression(f.createIdentifier('__miniatorMemoFrame'),undefined,[f.createArrowFunction(undefined,undefined,[],undefined,f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),body)]));
  }
  if(ts.isJsxAttribute(node)&&node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression){
   const expr=node.initializer.expression;
   if(node.name.text==='style'&&ts.isObjectLiteralExpression(expr)){
    const updated=expr.properties.map(p=>{
     if(ts.isPropertyAssignment(p)&&dyn(p.initializer)&&!containsJsx(p.initializer)){
      changes.push({binding:node.name.text,field:p.name.getText(sf),kind:'dynamic-style'});
      return f.updatePropertyAssignment(p,p.name,wrap(ts.visitNode(p.initializer,visit)));
     }
     return ts.visitNode(p,visit);
    });
    const obj=f.updateObjectLiteralExpression(expr,updated);
    return f.updateJsxAttribute(node,node.name,f.updateJsxExpression(node.initializer,obj));
   }
   if(dyn(expr)&&!containsJsx(expr)){
    changes.push({binding:node.name.text,kind:'dynamic-attribute'});
    return f.updateJsxAttribute(node,node.name,f.updateJsxExpression(node.initializer,wrap(ts.visitNode(expr,visit))));
   }
  }
  if(ts.isJsxExpression(node)&&node.expression&&dyn(node.expression)&&!containsJsx(node.expression)){
   changes.push({binding:'jsx-child',kind:'dynamic-text'});
   return f.updateJsxExpression(node,wrap(ts.visitNode(node.expression,visit)));
  }
  if(ts.isShorthandPropertyAssignment(node)&&dynamic.has(node.name.text)){
   return f.createPropertyAssignment(node.name,mkCall(node.name.text));
  }
  if(ts.isPropertyAccessExpression(node))return f.updatePropertyAccessExpression(node,ts.visitNode(node.expression,visit),node.name);
  if(ts.isPropertyAssignment(node))return f.updatePropertyAssignment(node,node.name,ts.visitNode(node.initializer,visit));
  if(ts.isJsxAttribute(node))return f.updateJsxAttribute(node,node.name,node.initializer?ts.visitNode(node.initializer,visit):undefined);
  if(ts.isVariableDeclaration(node))return f.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,node.initializer?ts.visitNode(node.initializer,visit):undefined);
  if(ts.isIdentifier(node)&&dynamic.has(node.text))return mkCall(node.text);
  return ts.visitEachChild(node,visit,ctx);
 }
 return x=>ts.visitNode(x,visit);
}]);
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const rendered=printer.printFile(result.transformed[0]);result.dispose();
fs.writeFileSync(output,rendered);
const metrics={source:path.basename(input),dynamicBindings:[...dynamic],dynamicStyleFields:changes.filter(x=>x.kind==='dynamic-style').length,dynamicTextNodes:changes.filter(x=>x.kind==='dynamic-text').length,dynamicAttributes:changes.filter(x=>x.kind==='dynamic-attribute').length,changes};
fs.writeFileSync(output+'.analysis.json',JSON.stringify(metrics,null,2));
return metrics;
}
module.exports={compileDependency};
if(require.main===module)console.log(JSON.stringify(compileDependency(process.argv[2],process.argv[3])));
