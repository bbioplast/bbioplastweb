/* A deliberately small text format: headings, paragraphs and bullet lists.
   Escape all author input; never execute embedded HTML. */
window.BlogContent={escape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),render(value){
 const esc=this.escape;let html='',paragraph=[],bullets=[];
 const flush=()=>{if(paragraph.length){html+='<p>'+paragraph.map(esc).join('<br>')+'</p>';paragraph=[];}if(bullets.length){html+='<ul>'+bullets.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';bullets=[];}};
 for(const line of String(value||'').split(/\r?\n/)){if(!line.trim()){flush();continue;}const heading=line.match(/^(#{1,3})\s+(.+)$/);if(heading){flush();const level=Math.min(heading[1].length+1,4);html+=`<h${level}>${esc(heading[2])}</h${level}>`;}else if(line.startsWith('- ')){if(paragraph.length)flush();bullets.push(line.slice(2));}else{if(bullets.length)flush();paragraph.push(line);}}
 flush();return html;
}};
