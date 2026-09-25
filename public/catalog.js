(()=>{
  const root=document.querySelector('#products'),search=root.querySelector('#catalog-search'),headerSearch=document.querySelector('#search'),results=root.querySelector('#catalog-results'),message=root.querySelector('#catalog-message'),categories=root.querySelector('#catalog-categories'),sort=root.querySelector('#catalog-sort');
  const dialog=document.querySelector('#product-dialog');
  function show(html){dialog.querySelector('#product-dialog-content').innerHTML=html;dialog.showModal();}
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  search.value=new URLSearchParams(location.search).get('q')||'';
  let catalog={products:[],categories:[]},selected='',loaded=false;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const name=id=>catalog.categories.find(c=>c.id===id)?.name||'Automation';
  function categoryButtons(){categories.innerHTML=[{id:'',name:'สินค้าทั้งหมด'},...catalog.categories].map(c=>`<button type="button" data-category="${escape(c.id)}" aria-pressed="${selected===c.id}"><span>${escape(c.name)}</span><span class="catalog-category-count">${catalog.products.filter(p=>!c.id||p.category_id===c.id).length}</span></button>`).join('');}
  function render(){
    if(!loaded)return;
    const term=search.value.trim().toLocaleLowerCase();
    const matches=catalog.products.filter(p=>(!selected||p.category_id===selected)&&[p.name,p.sku,p.description,name(p.category_id)].join(' ').toLocaleLowerCase().includes(term)).sort((a,b)=>(sort.value==='popular'?Number(b.popular)-Number(a.popular):0)||a.name.localeCompare(b.name,'th',{numeric:true}));
    root.querySelector('#catalog-current').textContent=selected?name(selected):'สินค้าทั้งหมด';
    root.querySelector('#catalog-count').textContent=`พบ ${matches.length} รายการ จากสินค้าทั้งหมด ${catalog.products.length} รายการ`;
    root.querySelector('#catalog-clear').hidden=!search.value;
    categoryButtons();message.hidden=matches.length>0;
    root.querySelector('#catalog-retry').hidden=true;root.querySelector('#catalog-reset').hidden=false;
    if(!matches.length){message.querySelector('h3').textContent=term?'ไม่พบสินค้าที่ตรงกับคำค้นหา':'ยังไม่มีรุ่นสินค้าในหมวดนี้';message.querySelector('p').textContent='ลองเลือกหมวดหมู่อื่น หรือส่งรุ่นและคุณสมบัติที่ต้องการให้ทีมงานช่วยจัดหา';message.querySelector('a').href='/shop?request='+encodeURIComponent(search.value||(selected?name(selected):''));}
    results.innerHTML=matches.map(p=>`<article class="catalog-item"><div class="catalog-item-image">${p.popular?'<span class="catalog-tag">★ สินค้ายอดนิยม</span>':''}${/^https:\/\//i.test(p.image)?`<img src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy" width="320" height="230">`:'<span class="catalog-placeholder">B&B<small>BIOPLAST TECH</small></span>'}</div><div class="catalog-item-copy"><p class="catalog-item-category">${escape(name(p.category_id))}</p><h3>${escape(p.name)}</h3><p class="catalog-item-sku">รหัสรุ่น ${escape(p.sku)}</p><p class="catalog-item-description">${escape(p.description||'สอบถามรายละเอียดและคุณสมบัติสินค้าเพิ่มเติมกับทีมงาน')}</p><p class="catalog-stock">${p.stock===null?'จัดหาตามคำขอ':p.stock===0?'สอบถามระยะเวลาจัดส่ง':'พร้อมเสนอราคา'}</p><div class="catalog-item-actions"><button type="button" data-details="${escape(p.id)}" aria-label="ดูรายละเอียด ${escape(p.name)}">ดูรายละเอียด</button><a href="/shop?product=${encodeURIComponent(p.id)}" aria-label="ขอราคา ${escape(p.name)}">ขอราคา <span aria-hidden="true">↗</span></a></div></div></article>`).join('');
    results.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const fallback=document.createElement('span');fallback.className='catalog-placeholder';fallback.textContent='B&B';img.after(fallback);},{once:true}));
  }
  function reset(){selected='';search.value='';if(headerSearch)headerSearch.value='';sort.value='name';render();}
  categories.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;selected=button.dataset.category;render();});
  results.addEventListener('click',event=>{const button=event.target.closest('[data-details]');if(!button)return;const p=catalog.products.find(p=>p.id===button.dataset.details);if(!p)return;show(`<p class="eyebrow">${escape(name(p.category_id))}</p><h2>${escape(p.name)}</h2><p>รหัสรุ่น ${escape(p.sku)}</p><p style="white-space:pre-wrap">${escape(p.description||'สอบถามคุณสมบัติและรายละเอียดเพิ่มเติมกับทีมงาน')}</p><p>กรุณายืนยันราคาและระยะเวลาจัดส่งกับทีมงานก่อนสั่งซื้อ</p><a class="button" href="/shop?product=${encodeURIComponent(p.id)}">เลือกสินค้าเพื่อขอราคา →</a>`);});
  search.addEventListener('input',()=>{if(headerSearch)headerSearch.value=search.value;render();});headerSearch?.addEventListener('input',()=>{search.value=headerSearch.value;render();root.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});sort.addEventListener('change',render);
  root.querySelector('#catalog-clear').onclick=()=>{search.value='';if(headerSearch)headerSearch.value='';render();search.focus();};root.querySelector('#catalog-reset').onclick=reset;
  async function load(){results.setAttribute('aria-busy','true');message.hidden=true;root.querySelector('#catalog-count').textContent='กำลังโหลดสินค้า…';try{const response=await fetch('/api/catalog');if(!response.ok)throw Error('Unavailable');catalog=await response.json();loaded=true;render();}catch{loaded=false;root.querySelector('#catalog-count').textContent='ยังโหลดรายการสินค้าไม่ได้';message.hidden=false;message.querySelector('h3').textContent='โหลดรายการสินค้าไม่สำเร็จ';message.querySelector('p').textContent='ลองใหม่อีกครั้ง หรือส่งรายการที่ต้องการให้ทีมงานช่วยดูแล';root.querySelector('#catalog-reset').hidden=true;root.querySelector('#catalog-retry').hidden=false;}finally{results.setAttribute('aria-busy','false');}}
  root.querySelector('#catalog-retry').onclick=load;load();
})();
