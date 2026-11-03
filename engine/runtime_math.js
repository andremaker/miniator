'use strict';
// Conservative source-level numeric analysis. Unknown semantics trigger full-frame fallback.
// No benchmark strings, coordinates or scene-specific selectors are hardcoded.
const fs=require('fs');
const ts=require('typescript');
const {spring,interpolate}=require('remotion');

function infer(sourceFile, comp) {
 const source=fs.readFileSync(sourceFile,'utf8');
 const ast=ts.createSourceFile(sourceFile,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const asText=n=>n.getText(ast);
 const fail=message=>{throw Error('Unsupported structural inference: '+message)};
 // A deliberately small supported language: no side effects, imports beyond
 // React/Remotion, network/media, custom components or opaque CSS expressions.
 for(const st of ast.statements){
  if(ts.isImportDeclaration(st)){
   const imp=st.moduleSpecifier.text;
   if(imp!=='react'&&imp!=='remotion')fail('unsupported dependency '+imp);
  } else if(ts.isExpressionStatement(st))fail('top-level side effect');
 }
 const callsAllowed=new Set(['useCurrentFrame','useVideoConfig','spring','interpolate','Math.round','Math.floor','Math.ceil']);
 const declarators=new Map(); let component;
 function collect(n){
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){
   declarators.set(n.name.text,n.initializer);
   if(ts.isArrowFunction(n.initializer)&&ts.isBlock(n.initializer.body)&&n.initializer.body.statements.some(x=>ts.isReturnStatement(x)))component=n.initializer;
  }
  ts.forEachChild(n,collect);
 }
 collect(ast);
 function checkSideEffects(n){
  if(ts.isCallExpression(n)&&!callsAllowed.has(asText(n.expression)))fail('unknown call '+asText(n.expression));
  if(ts.isNewExpression(n))fail('new expression');
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
   const name=asText(n.tagName);
   if(name!=='AbsoluteFill'&&name!=='Sequence'&&name!==name.toLowerCase())fail('unknown custom component '+name);
   if(['video','canvas','iframe','svg','img','picture','foreignObject','audio','script'].includes(name))fail('unsupported media or scripting '+name);
  }
  ts.forEachChild(n,checkSideEffects);
 }
 if(component)checkSideEffects(component.body);
 if(!component)fail('no React component body');
 let frameIdent=null,fpsIdent=null;
 for(const st of component.body.statements)if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations){
  if(!d.initializer)continue;
  if(ts.isIdentifier(d.name)){
   declarators.set(d.name.text,d.initializer);
   if(ts.isCallExpression(d.initializer)&&asText(d.initializer.expression)==='useCurrentFrame')frameIdent=d.name.text;
  }
  if(ts.isObjectBindingPattern(d.name)&&ts.isCallExpression(d.initializer)&&asText(d.initializer.expression)==='useVideoConfig'){
   for(const el of d.name.elements)if(ts.isIdentifier(el.name)&&asText(el.propertyName||el.name)==='fps')fpsIdent=el.name.text;
  }
 }
 if(!frameIdent||!fpsIdent)fail('frame and fps identifiers not identified');
 const toNumber=x=>typeof x==='number'&&Number.isFinite(x)?x:fail('nonfinite number');
 function evaluate(n,frame,depth=0){
  if(!n||depth>25)fail('expression recursion');
  if(ts.isNumericLiteral(n))return Number(n.text);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
  if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
  if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n))return evaluate(n.expression,frame,depth+1);
  if(ts.isIdentifier(n)){
   if(n.text===frameIdent)return frame;
   if(n.text===fpsIdent)return comp.fps;
   if(n.text==='undefined')return undefined;
   const init=declarators.get(n.text);
   if(!init||ts.isArrowFunction(init))fail('unresolved variable '+n.text);
   return evaluate(init,frame,depth+1);
  }
  if(ts.isPrefixUnaryExpression(n)){
   const v=toNumber(evaluate(n.operand,frame,depth+1));
   if(n.operator===ts.SyntaxKind.MinusToken)return -v;
   if(n.operator===ts.SyntaxKind.PlusToken)return v;
   fail('unary '+asText(n));
  }
  if(ts.isBinaryExpression(n)){
   const a=evaluate(n.left,frame,depth+1),b=evaluate(n.right,frame,depth+1);
   if(n.operatorToken.kind===ts.SyntaxKind.PlusToken)return a+b;
   if(n.operatorToken.kind===ts.SyntaxKind.MinusToken)return toNumber(a)-toNumber(b);
   if(n.operatorToken.kind===ts.SyntaxKind.AsteriskToken)return toNumber(a)*toNumber(b);
   if(n.operatorToken.kind===ts.SyntaxKind.SlashToken)return toNumber(a)/toNumber(b);
   fail('binary '+asText(n.operatorToken));
  }
  if(ts.isArrayLiteralExpression(n))return n.elements.map(x=>evaluate(x,frame,depth+1));
  if(ts.isObjectLiteralExpression(n)){
   const o={};for(const prop of n.properties){
    if(ts.isPropertyAssignment(prop)){const key=ts.isIdentifier(prop.name)?prop.name.text:ts.isStringLiteral(prop.name)?prop.name.text:fail('object key');o[key]=evaluate(prop.initializer,frame,depth+1);}
    else if(ts.isShorthandPropertyAssignment(prop))o[prop.name.text]=evaluate(prop.name,frame,depth+1);
    else fail('object spread');
   }return o;
  }
  if(ts.isCallExpression(n)){
   const fn=asText(n.expression);const args=n.arguments.map(a=>evaluate(a,frame,depth+1));
   if(fn==='spring')return spring(...args);
   if(fn==='interpolate')return interpolate(...args);
   if(fn==='Math.round')return Math.round(...args);
   if(fn==='Math.floor')return Math.floor(...args);
   if(fn==='Math.ceil')return Math.ceil(...args);
   fail('function call '+fn);
  }
  if(ts.isTemplateExpression(n))return n.head.text+n.templateSpans.map(sp=>String(evaluate(sp.expression,frame,depth+1))+sp.literal.text).join('');
  fail('expression '+ts.SyntaxKind[n.kind]);
 }
 const sequences=[],elements=[],bgCandidates=[];
 const safeStyleKeys=new Set(['backgroundColor','color','fontSize','fontWeight','fontFamily','justifyContent','alignItems','display','flexDirection','opacity','transform','position','width','height','margin','padding']);
 const unsafeTags=new Set(['video','canvas','iframe','svg','img','picture','foreignObject','audio','script']);
 function childrenText(el,frame){let s='';for(const c of el.children){
  if(ts.isJsxText(c))s+=c.text;
  else if(ts.isJsxExpression(c)){if(!c.expression)continue;s+=String(evaluate(c.expression,frame));}
  else fail('nested changing text');
 }return s;}
 function analyzeElement(node){
  if(!ts.isJsxElement(node))return;
  const tag=asText(node.openingElement.tagName);
  if(unsafeTags.has(tag))fail('unsupported tag '+tag);
  const attrs=new Map();
  for(const att of node.openingElement.attributes.properties){
   if(!ts.isJsxAttribute(att))fail('spread attribute');
   if(!['style','from','layout'].includes(att.name.text))fail('unsupported attribute '+att.name.text);
   attrs.set(att.name.text,att.initializer);
  }
  let style={};if(attrs.has('style')){
   const attr=attrs.get('style');if(!attr||!ts.isJsxExpression(attr)||!attr.expression||!ts.isObjectLiteralExpression(attr.expression))fail('nonliteral CSS style');
   for(const prop of attr.expression.properties){if(!ts.isPropertyAssignment(prop))fail('computed CSS style');
    const key=asText(prop.name).replaceAll('"','').replaceAll("'",'');if(!safeStyleKeys.has(key))fail('unsupported CSS property '+key);
    style[key]=prop.initializer;
    if(!['transform','opacity'].includes(key)){
     const first=evaluate(prop.initializer,0);
     for(let f=1;f<comp.durationInFrames;f++)if(evaluate(prop.initializer,f)!==first)fail('frame-dependent CSS value '+key);
    }else if(key==='opacity'){
     for(let f=0;f<comp.durationInFrames;f++){
      const o=evaluate(prop.initializer,f);if(typeof o!=='number'||o<0||o>1)fail('unsupported opacity');
     }
    }
   }
  }
  if(tag==='AbsoluteFill'){
   if(style.backgroundColor){const a=Array.from({length:comp.durationInFrames},(_,f)=>evaluate(style.backgroundColor,f));if(a.every(v=>v===a[0]))bgCandidates.push(a[0]);}
  } else if(tag!=='Sequence' && tag[0]===tag[0].toLowerCase()){
   const t={tag,style,transformY:[],texts:[],dynamicText:false};
   if(style.transform){for(let f=0;f<comp.durationInFrames;f++){
    const css=evaluate(style.transform,f);const m=/^translateY\(([-+]?[0-9.eE+-]+)px\)$/.exec(css);if(!m)fail('unsupported transform '+css);
    t.transformY.push(Number(m[1]));
   }}else t.transformY=Array(comp.durationInFrames).fill(0);
   if(node.children.some(c=>ts.isJsxExpression(c))){t.dynamicText=true;
    for(let f=0;f<comp.durationInFrames;f++)t.texts.push(childrenText(node,f));
   }
   elements.push(t);
  }
  if(tag==='Sequence'){
   const attr=attrs.get('from');if(attr){if(!ts.isJsxExpression(attr)||!attr.expression)fail('Sequence from');const v=evaluate(attr.expression,0);if(!Number.isInteger(v))fail('Sequence from value');sequences.push(v);}
  }
 }
 function walk(node){if(ts.isJsxElement(node))analyzeElement(node);ts.forEachChild(node,walk)}walk(component.body);
 if(bgCandidates.length!==1||typeof bgCandidates[0]!=='string'||!/^(#[0-9a-f]{6})$/i.test(bgCandidates[0]))fail('no single constant opaque background');
 if(elements.length===0)fail('no leaf elements');
 const counts={};for(const e of elements){counts[e.tag]=(counts[e.tag]||0)+1;if(counts[e.tag]>1)fail('ambiguous repeated tag '+e.tag);}
 // This constrained first implementation requires an animation support matrix.
 if(sequences.length>1)fail('nested/multiple Sequence gates unsupported');
 if(elements.some(e=>e.dynamicText&&sequences.length===0))fail('dynamic text without known gate');
 return {safe_subset:true,background:bgCandidates[0].slice(1),sequenceStarts:sequences,elements:elements.map(e=>({tag:e.tag,transformY:e.transformY,texts:e.texts,dynamicText:e.dynamicText})),numerically_evaluated_frames:comp.durationInFrames,source_sha256:require('crypto').createHash('sha256').update(source).digest('hex')};
}
module.exports={infer};
