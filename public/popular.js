/* Curated by the store owner; no fabricated sales counts or rankings. */
(async function popularProducts(){
  const anchor=document.querySelector('#products');
  if(!anchor)return;
  const section=document.createElement('section');
  section.id='popular-products';section.className='popular-section';
  section.setAttribute('aria-labelledby','popular-title');
  section.innerHTML='<div class="container"><div class="popular-heading"><div><p class="popular-eyebrow">POPULAR PRODUCTS</p><h2 id="popular-title">สินค้ายอดนิยม</h2><p>เลือกอุปกรณ์ที่ใช่ สำหรับงาน Automation ของคุณ</p></div><a class="popular-more" href="/shop?popular=1">ดูสินค้ายอดนิยมทั้งหมด ↗</a></div><div class="popular-grid"></div><p class="popular-note">คัดเลือกโดยทีมงาน B&B Bioplast Tech · สอบถามราคาและรายละเอียดก่อนสั่งซื้อ</p></div>';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  try{
    const response=await fetch('/api/catalog');
    if(!response.ok)throw Error('Catalog unavailable');
    const catalog=await response.json();
    const products=catalog.products.filter(p=>p.popular).slice(0,4);
    if(!products.length)return;
    section.querySelector('.popular-grid').innerHTML=products.map(p=>{
      const category=catalog.categories.find(c=>c.id===p.category_id)?.name||'Automation';
      const image=p.image&&/^https:\/\//i.test(p.image)?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="360" height="240">`:'<span class="popular-placeholder">B&B<span>BIOPLAST TECH</span></span>';
      return `<article class="popular-card"><div class="popular-image"><span class="popular-badge">★ สินค้ายอดนิยม</span>${image}</div><div class="popular-info"><span class="popular-category">${esc(category)}</span><h3>${esc(p.name)}</h3><p class="popular-sku">รหัสสินค้า ${esc(p.sku)}</p><p class="popular-description">${esc(p.description)}</p><div class="popular-availability">${p.stock===null?'จัดหาตามคำขอ':p.stock===0?'สอบถามระยะเวลาจัดส่ง':'พร้อมเสนอราคา'}</div><a class="popular-cta" href="/shop?product=${encodeURIComponent(p.id)}">เลือกสินค้าเพื่อขอราคา <span aria-hidden="true">↗</span></a></div></article>`;
    }).join('');
    section.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const placeholder=document.createElement('span');placeholder.className='popular-placeholder';placeholder.textContent='B&B';img.after(placeholder);},{once:true}));
    const keepCatalogAnchor=location.hash==='#products'&&Math.abs(anchor.getBoundingClientRect().top)<180;
    anchor.before(section);
    if(keepCatalogAnchor)anchor.scrollIntoView({behavior:'instant'});
  }catch(error){console.warn('Popular products could not be loaded.');}
})();
