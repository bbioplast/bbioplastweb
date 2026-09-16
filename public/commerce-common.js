const statusNames={pending:'รอเสนอราคา',offered:'เสนอราคาแล้ว',confirmed:'ยืนยันสั่งซื้อ',processing:'กำลังดำเนินการ',shipped:'จัดส่งแล้ว',completed:'เสร็จสมบูรณ์',cancelled:'ยกเลิก'};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n===null?'ขอใบเสนอราคา':new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(n/100);
const date=s=>s?new Date(s).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'—';
const pill=s=>`<span class="pill ${escape(s)}">${escape(statusNames[s]||s)}</span>`;
let csrf='';
async function api(url,method='GET',data){const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'BBWeb','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'เกิดข้อผิดพลาด'),{status:response.status});return result;}
function errorAt(el,error){el.hidden=false;el.className='notice error';el.textContent=error.message||error;}
function cents(v){if(v===''||v===null)return null;const n=Number(v);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100)))throw Error('กรุณากรอกราคาให้ถูกต้อง');return Math.round(n*100);}
