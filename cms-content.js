const sanitize=require('sanitize-html');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeUrl(value,{image=false,contact=false,empty=true}={}){
 if(typeof value!=='string'||value.length>1800)throw Error('URL ไม่ถูกต้อง');const v=value.trim();
 if(!v&&empty)return '';
 if(/[\u0000-\u0020\u007f\\]/.test(v))throw Error('URL มีอักขระที่ไม่อนุญาต');
 if(v.startsWith('/')&&!v.startsWith('//')){if(image&&(!/^\/(?:media\/[a-f0-9]{64}\.(?:png|jpg|webp)|assets\/[a-zA-Z0-9_./-]+)$/.test(v)||v.split('/').some(part=>part==='.'||part==='..')))throw Error('กรุณาเลือกรูปจากคลัง');return v;}
 if(!image&&v.startsWith('#'))return v;
 if(contact&&/^(?:tel:[+0-9()-]+|mailto:[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/.test(v))return v;
 const url=new URL(v);if(url.protocol!=='https:'||url.username||url.password)throw Error('URL ต้องเป็น HTTPS หรือลิงก์ภายในเว็บไซต์');return v;
}
const validUrl=(v,o)=>{try{return safeUrl(v,o);}catch{return '';}};
function richHtml(v){return sanitize(String(v||''),{
 allowedTags:['p','br','h2','h3','strong','em','u','s','ul','ol','li','blockquote','a','img'],
 allowedAttributes:{a:['href','title','target','rel'],img:['src','alt','width','height','loading']},allowedSchemes:['https','mailto','tel'],allowProtocolRelative:false,
 transformTags:{a:(tag,a)=>({tagName:tag,attribs:{href:validUrl(a.href||'',{contact:true}),title:a.title||'',rel:'noopener noreferrer',...(a.target==='_blank'?{target:'_blank'}:{})}}),img:(tag,a)=>({tagName:tag,attribs:{src:validUrl(a.src||'',{image:true}),alt:String(a.alt||'').slice(0,250),loading:'lazy'}})},
 exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src
 });}
function plainHtml(v){let out='',para=[],items=[];const flush=()=>{if(para.length){out+='<p>'+para.map(esc).join('<br>')+'</p>';para=[];}if(items.length){out+='<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';items=[];}};for(const line of String(v||'').split(/\r?\n/)){const h=line.match(/^(#{1,3})\s+(.+)$/);if(!line.trim())flush();else if(h){flush();const n=Math.min(h[1].length+1,4);out+=`<h${n}>${esc(h[2])}</h${n}>`;}else if(line.startsWith('- ')){if(para.length)flush();items.push(line.slice(2));}else{if(items.length)flush();para.push(line);}}flush();return out;}
const renderContent=p=>p.format==='html'?richHtml(p.content):plainHtml(p.content);
function seo(value={}){const result={};for(const [k,max]of Object.entries({title:180,description:400,og_title:180,og_description:400,og_image:1800,canonical:1800})){if(typeof(value[k]??'')!=='string'||String(value[k]||'').length>max)throw Error('ข้อมูล SEO ยาวเกินกำหนด');result[k]=String(value[k]||'').trim();}if(result.og_image)result.og_image=safeUrl(result.og_image,{image:true});if(result.canonical){result.canonical=safeUrl(result.canonical);if(!result.canonical.startsWith('https://'))throw Error('Canonical ต้องเป็น HTTPS');}return result;}
const slugOK=v=>typeof v==='string'&&v.length<=120&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
module.exports={esc,safeUrl,validUrl,richHtml,plainHtml,renderContent,seo,slugOK};
