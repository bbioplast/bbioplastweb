module.exports=function quotationItems(input,{findProduct,fail}){
 if(!Array.isArray(input)||!input.length||input.length>200)fail('กรุณาเลือกสินค้า 1–50 รายการ');const result=[],seen=new Map();
 for(const i of input){if(!i||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>10000)fail('จำนวนสินค้าต้องเป็นจำนวนเต็ม 1–10,000 ชิ้น');let item,id;
  if(i.productId!=null){if(typeof i.productId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(i.productId))fail('รหัสสินค้าไม่ถูกต้อง');const p=findProduct(i.productId);if(!p)fail('สินค้าบางรายการไม่พร้อมให้สอบถาม กรุณาตรวจสอบตะกร้าอีกครั้ง',409);item={productId:p.id,sku:p.sku,name:p.name,qty:i.qty,unitPrice:null,image:p.image||'',category:p.category||'',referencePrice:p.price,availability:p.stock===null?'made-to-order':p.stock===0?'check-delivery':'available'};id='p:'+p.id;
  }else{const name=typeof i.name==='string'?i.name.trim().slice(0,200):'';if(!name)fail('กรุณาระบุชื่อสินค้าที่ต้องการให้จัดหา');item={productId:null,sku:'',name,qty:i.qty,unitPrice:null,image:'',category:'รายการให้ทีมงานจัดหา',referencePrice:null,availability:'custom'};id='c:'+name.toLowerCase();}
  if(seen.has(id)){const old=seen.get(id);if(old.qty+item.qty>10000)fail('จำนวนสินค้ารวมต่อรายการต้องไม่เกิน 10,000 ชิ้น');old.qty+=item.qty;}else{seen.set(id,item);result.push(item);}
 }
 if(result.length>50)fail('เพิ่มสินค้าได้สูงสุด 50 รายการ');return result;
};
