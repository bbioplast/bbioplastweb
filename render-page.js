const fs=require('fs');const path=require('path');
const header=fs.readFileSync(path.join(__dirname,'public/site-header.html'),'utf8');
module.exports=function renderPage(data,file){const active='class="active" aria-current="page"';return data.toString().replace('<!-- shared-site-header -->',header.replace('{{homeActive}}',path.basename(file)==='index.html'?active:'').replace('{{productsActive}}',path.basename(file)==='products.html'?active:''));};
