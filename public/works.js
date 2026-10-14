(()=>{
 const grid=document.querySelector('#portfolio-grid'),filters=document.querySelector('#portfolio-filters'),count=document.querySelector('#portfolio-count');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const categories=[{id:'all',name:'ผลงานทั้งหมด',label:'ALL PROJECTS'},{id:'chuck',name:'Chuck Plate',label:'ROBOT HANDLING'},{id:'cutting',name:'Gate Cutting',label:'GATE CUTTING'},{id:'conveyor',name:'สายพานลำเลียง',label:'CONVEYOR SYSTEM'}];
 const works=siteData.works.map((w,index)=>({...w,index,category:/gate cutting/i.test(w.title)?'cutting':/สายพาน/.test(w.title)?'conveyor':'chuck'}));
 let selected=new URLSearchParams(location.search).get('category')||'all';if(!categories.some(c=>c.id===selected))selected='all';
 function render(){
  filters.hidden=false;filters.innerHTML=categories.map(c=>`<button type="button" data-work-category="${c.id}" aria-pressed="${c.id===selected}">${c.name}<span>${works.filter(w=>c.id==='all'||w.category===c.id).length}</span></button>`).join('');
  const visible=works.filter(w=>selected==='all'||w.category===selected);count.textContent=visible.length+' ผลงาน';
  grid.innerHTML=visible.map(w=>`<a class="portfolio-card" href="${escape(w.url)}" target="_blank" rel="noopener noreferrer"><div class="portfolio-card-image"><img src="${escape(w.image)}" alt="${escape(w.title)}" loading="lazy" decoding="async"><span class="portfolio-card-number" aria-hidden="true">${String(w.index+1).padStart(2,'0')}</span></div><div class="portfolio-card-copy"><p class="portfolio-category">${categories.find(c=>c.id===w.category).label}</p><h3>${escape(w.title)}</h3><div class="portfolio-card-bottom"><span>ดูรายละเอียดผลงาน</span><span aria-hidden="true">↗</span></div></div></a>`).join('')||'<p class="portfolio-empty">ยังไม่มีผลงานในหมวดนี้</p>';
  grid.setAttribute('aria-busy','false');
  grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{const image=img.parentElement;img.hidden=true;image.classList.add('portfolio-empty');const text=document.createElement('span');text.textContent='B&B · '+img.alt;image.append(text);},{once:true}));
 }
 filters.addEventListener('click',e=>{const button=e.target.closest('[data-work-category]');if(!button)return;selected=button.dataset.workCategory;render();const url=new URL(location.href);selected==='all'?url.searchParams.delete('category'):url.searchParams.set('category',selected);history.replaceState(null,'',url.pathname+url.search+url.hash);});
 render();
})();
