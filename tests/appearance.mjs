import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile('lib/appearance-preference.ts','utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exports={}
new Function('exports',js)(exports)
const {readAppearanceMode,isNightAppearance,APPEARANCE_STORAGE_KEY}=exports

test('new devices use Auto and preserve existing saved manual choices',()=>{
 for(const saved of [null,'invalid','auto','on','off']){
  const storage={getItem:key=>{assert.equal(key,APPEARANCE_STORAGE_KEY);return saved}}
  assert.equal(readAppearanceMode(storage),['on','off','auto'].includes(saved)?saved:'auto')
 }
})
test('Auto follows the system while manual day and night ignore it',()=>{
 assert.equal(isNightAppearance('auto',true),true)
 assert.equal(isNightAppearance('auto',false),false)
 for(const system of [true,false]){
  assert.equal(isNightAppearance('on',system),true)
  assert.equal(isNightAppearance('off',system),false)
 }
})
test('unavailable device storage safely falls back to Auto',()=>{
 assert.equal(readAppearanceMode({getItem(){throw new Error('Storage unavailable')}}),'auto')
})

test('appearance provider follows live system changes and rechecks after native resume',async t=>{
 const oldWindow=global.window,oldDocument=global.document
 const values=new Map([[APPEARANCE_STORAGE_KEY,'off']]),windowEvents=new Map(),documentEvents=new Map(),mediaEvents=new Map()
 const media={matches:true,addEventListener:(name,fn)=>mediaEvents.set(name,fn),removeEventListener:name=>mediaEvents.delete(name)}
 global.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},matchMedia:()=>media,
  addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name)}
 global.document={addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)}
 t.after(()=>{global.window=oldWindow;global.document=oldDocument})
 let hook=0,mounted=false
 const states=[],effects=[],cleanups=[]
 const react={createContext:()=>({Provider:'appearance'}),useContext:()=>{},
  useState:initial=>{const index=hook++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=value}]},
  useEffect:fn=>{if(!mounted)effects.push(fn)},
 }
 const jsx=(type,props)=>({type,props})
 const providerSource=await readFile('components/upcatch/appearance-provider.tsx','utf8')
 const compiled=ts.transpileModule(providerSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const provider={}
 const overrides={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'./appearance.module.css':{default:{night:'night'}},'@/lib/appearance-preference':exports}
 new Function('require','exports',compiled)(name=>{if(!(name in overrides))throw Error('Unexpected import '+name);return overrides[name]},provider)
 const render=()=>{hook=0;const tree=provider.AppearanceProvider({children:null});mounted=true;for(const effect of effects.splice(0))cleanups.push(effect());return tree.props.value}
 render()
 assert.equal(render().night,false,'saved Light overrides a dark device')
 render().setMode('auto')
 assert.equal(render().night,true)
 media.matches=false;mediaEvents.get('change')()
 assert.equal(render().night,false,'Auto follows a system change')
 media.matches=true;windowEvents.get('upcatch:appearance-resume')()
 assert.equal(render().night,true,'Auto catches a theme change missed while suspended')
 render().setMode('off')
 windowEvents.get('upcatch:appearance-resume')()
 assert.equal(render().night,false)
 assert.equal(values.get(APPEARANCE_STORAGE_KEY),'off')
 for(const cleanup of cleanups)cleanup()
 assert.equal(windowEvents.size+documentEvents.size+mediaEvents.size,0)
})
