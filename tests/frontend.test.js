const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cheerio=require('cheerio');
const Cart=require('../public/quotation-cart');

// Exercise the shipped browser scripts against a small DOM adapter. It keeps
// the real HTML, selectors and event handlers without adding a browser runtime.
function dom(html){
 const $=cheerio.load(html),wrappers=new WeakMap();
 const wrap=node=>{if(!node)return null;if(wrappers.has(node))return wrappers.get(node);const el=new Element(node);wrappers.set(node,el);return el;};
 class Element{
  constructor(node){this.node=node;this.listeners=new Map();}
  get innerHTML(){return $(this.node).html();}set innerHTML(value){$(this.node).html(value);}
  get textContent(){return $(this.node).text();}set textContent(value){$(this.node).text(value);}
  get value(){return $(this.node).attr('value')||'';}set value(value){$(this.node).attr('value',String(value));}
  get hidden(){return $(this.node).attr('hidden')!==undefined;}set hidden(value){if(value)$(this.node).attr('hidden','');else $(this.node).removeAttr('hidden');}
  get disabled(){return $(this.node).attr('disabled')!==undefined;}set disabled(value){if(value)$(this.node).attr('disabled','');else $(this.node).removeAttr('disabled');}
  get dataset(){return Object.fromEntries(Object.entries(this.node.attribs||{}).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));}
  get classList(){return {toggle:(name,value)=>$(this.node).toggleClass(name,value),add:name=>$(this.node).addClass(name)};}
  querySelector(selector){return wrap($(this.node).find(selector)[0]);}
  querySelectorAll(selector){return $(this.node).find(selector).toArray().map(wrap);}
  closest(selector){return wrap($(this.node).closest(selector)[0]);}
  matches(selector){return $(this.node).is(selector);}
  hasAttribute(name){return $(this.node).attr(name)!==undefined;}
  setAttribute(name,value){$(this.node).attr(name,String(value));}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  showModal(){this.open=true;}close(){this.open=false;this.listeners.get('close')?.();}
 }
 return {querySelector:selector=>wrap($(selector)[0]),querySelectorAll:selector=>$(selector).toArray().map(wrap),addEventListener(){},createElement:tag=>wrap($('<'+tag+'>')[0])};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function run(file,globals){const context=vm.createContext({URLSearchParams,...globals});vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),context,{filename:file});return context;}
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}

test('blog retry restores the published listing and binds search after a failed request',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/blog.html'),'utf8').replace('ความรู้ที่ต่อยอด','หัวข้อที่ผู้ดูแลเผยแพร่');
 const document=dom(html);let calls=0;
 run('blog.js',{document,location:{pathname:'/blog'},BlogContent:{escape:value=>String(value??''),render:value=>value},fetch:async()=>{if(++calls===1)throw Error('Offline');return {ok:true,json:async()=>({posts:[{slug:'real-post',title:'Automation',excerpt:'ระบบโรงงาน',category:'เทคนิค',published_at:'2026-10-01',cover:''}]})};}});
 await tick();assert.ok(document.querySelector('#blog-retry'));
 await document.querySelector('#blog-retry').onclick();
 assert.equal(calls,2);assert.equal(document.querySelector('#blog-main h1').textContent.includes('หัวข้อที่ผู้ดูแลเผยแพร่'),true);
 assert.equal(document.querySelectorAll('#blog-grid .blog-card').length,1);
 const search=document.querySelector('#blog-search');search.value='ไม่ตรงกับบทความ';search.oninput();
 assert.equal(document.querySelectorAll('#blog-grid .blog-card').length,0);assert.equal(document.querySelector('#blog-empty').hidden,false);
 document.querySelector('#blog-reset').onclick();assert.equal(document.querySelectorAll('#blog-grid .blog-card').length,1);
});

test('rapid cart quantity clicks are queued and use the quantity inside the storage lock',async()=>{
 const document=dom('<main id="quotation-content"></main><p id="quotation-error" hidden></p><dialog id="clear-cart-dialog"></dialog>'),storage=memoryStorage(),otherTab=Cart.create(storage);
 otherTab.add({productId:'p-one',sku:'ONE',qty:1});
 let release;const gate=new Promise(resolve=>release=resolve);let locks=Promise.resolve();const listeners=new Map();
 const win={document,localStorage:storage,navigator:{locks:{request(_name,fn){const task=locks.then(()=>gate).then(fn);locks=task.catch(()=>{});return task;}}},fetch:async()=>({ok:true,json:async()=>({products:[{id:'p-one',name:'สินค้า',sku:'ONE',category_id:'c',price:null,stock:null}],categories:[{id:'c',name:'อุปกรณ์'}]})}),addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event)};
 const cart=Cart.browser(win);run('quotation-cart-page.js',{document,window:win,QuoteCart:cart});await tick();
 const root=document.querySelector('#quotation-content'),plus=document.querySelector('[data-step="1"]');
 root.listeners.get('click')({target:plus});root.listeners.get('click')({target:plus});
 await tick();otherTab.add({productId:'p-one',qty:5});release();await tick();await tick();
 assert.equal(otherTab.read()[0].qty,8,'both clicks must be added to the latest cross-tab quantity');
 assert.equal(document.querySelector('[data-line-qty]').value,'8');
 const before=otherTab.read();assert.throws(()=>otherTab.adjustQty('p:p-one',-8));assert.deepEqual(otherTab.read(),before);
});

test('an older admin navigation response or error cannot replace the selected screen',async()=>{
 const document=dom('<div id="auth"></div><div id="workspace"></div><div id="view"></div><dialog id="editor"><div id="editor-content"></div></dialog><p id="global-error" hidden></p><button class="dialog-close"></button><button id="logout"></button><button data-tab="products"></button><button data-tab="quotes"></button>');
 let resolveCatalog,rejectCatalog,resolveQuotes;
 const context=run('admin.js',{document,location:{hash:'',pathname:'/admin'},history:{replaceState(){}},confirm:()=>true,api:url=>{if(url==='/api/auth/status')return new Promise(()=>{});if(url==='/api/admin/catalog')return new Promise((resolve,reject)=>{resolveCatalog=resolve;rejectCatalog=reject;});if(url==='/api/admin/quotes')return new Promise(resolve=>resolveQuotes=resolve);throw Error(url);},errorAt:(el,error)=>{el.hidden=false;el.textContent=error.message;}});
 vm.runInContext('renderProducts=()=>view.innerHTML="STALE PRODUCTS";renderQuotes=()=>view.innerHTML="CURRENT QUOTES";',context);
 let old=vm.runInContext('navigate("products")',context),current=vm.runInContext('navigate("quotes")',context);
 resolveQuotes([]);await current;resolveCatalog({products:[],categories:[]});await old;
 assert.equal(document.querySelector('#view').innerHTML,'CURRENT QUOTES');
 old=vm.runInContext('navigate("products")',context);current=vm.runInContext('navigate("quotes")',context);resolveQuotes([]);await current;rejectCatalog(Error('Old request failed'));await old;
 assert.equal(document.querySelector('#view').innerHTML,'CURRENT QUOTES');assert.equal(document.querySelector('#global-error').hidden,true);
});

test('catalog indexed filtering preserves category, popular ordering and Thai search',async()=>{
 const document=dom(fs.readFileSync(path.join(__dirname,'../public/products.html'),'utf8'));
 const catalog={categories:[{id:'air',name:'ระบบลม'},{id:'pad',name:'ลูกยาง'}],products:[{id:'p-10',name:'รุ่น 10',sku:'S10',description:'รายละเอียด',category_id:'air',price:null,stock:null},{id:'p-2',name:'รุ่น 2',sku:'S2',description:'รายละเอียด',category_id:'air',price:100,stock:2,popular:true},{id:'p-1',name:'รุ่น 1',sku:'S1',description:'รายละเอียด',category_id:'pad',price:null,stock:0}]};
 run('catalog.js',{document,location:{search:''},URLSearchParams,QuoteCart:{setCatalog(){},money:()=>'',form:()=>''},fetch:async()=>({ok:true,json:async()=>catalog})});await tick();
 assert.deepEqual(document.querySelectorAll('.catalog-item h3').map(el=>el.textContent),['รุ่น 1','รุ่น 2','รุ่น 10']);
 const sort=document.querySelector('#catalog-sort');sort.value='popular';sort.listeners.get('change')();assert.equal(document.querySelector('.catalog-item h3').textContent,'รุ่น 2');
 const search=document.querySelector('#catalog-search');search.value='ระบบลม';search.listeners.get('input')();assert.equal(document.querySelectorAll('.catalog-item').length,2);
 const category=document.querySelector('[data-category="air"]');assert.equal(category.querySelector('.catalog-category-count').textContent,'2');
});

test('failed quote submission rechecks cart readiness before enabling submit again',async()=>{
 const document=dom(fs.readFileSync(path.join(__dirname,'../public/shop.html'),'utf8')),storage=memoryStorage(),core=Cart.create(storage);
 core.add({productId:'p-one',sku:'ONE',qty:1});
 const catalog={products:[{id:'p-one',name:'สินค้า',sku:'ONE',category_id:'c',description:'',price:null,stock:null}],categories:[{id:'c',name:'อุปกรณ์'}]};
 class FormData{constructor(){this.entries=[['customer','ลูกค้า'],['email','customer@example.test'],['phone','0812345678'],['address','ที่อยู่']];}get(key){return this.entries.find(([name])=>name===key)?.[1];}[Symbol.iterator](){return this.entries[Symbol.iterator]();}}
 let requests=0;
 run('shop.js',{document,window:{addEventListener(){}},location:{search:'?checkout=1',origin:'https://example.test'},FormData,TextEncoder,crypto:require('node:crypto').webcrypto,navigator:{},localStorage:storage,QuoteCart:{...core,resolve:Cart.resolve,catalog:async()=>catalog,money:()=>'',form:()=>'',escape:String},escape:String,errorAt:(el,error)=>{el.hidden=false;el.textContent=error.message;},api:async()=>{requests++;core.clear();throw Error('Connection interrupted');}});
 await tick();const form=document.querySelector('#quote-form'),button=form.querySelector('[type=submit]');assert.equal(button.disabled,false);
 await form.onsubmit({preventDefault(){},target:form});
 assert.equal(requests,1);assert.equal(button.disabled,true);assert.equal(document.querySelector('#checkout-section').hidden,true);
 assert.equal(document.querySelector('#submit-error').textContent,'Connection interrupted');
});
