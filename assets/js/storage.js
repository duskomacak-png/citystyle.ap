async function loadImageForCanvas(file){
  if(window.createImageBitmap){
    try{return await createImageBitmap(file, { imageOrientation:'from-image' });}catch(e){}
  }
  return await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Slika ne može da se učita'));
    img.src=URL.createObjectURL(file);
  });
}
function fitRect(sw,sh,dw,dh,mode='contain'){
  const s = mode==='cover' ? Math.max(dw/sw, dh/sh) : Math.min(dw/sw, dh/sh);
  const w=sw*s, h=sh*s;
  return {x:(dw-w)/2, y:(dh-h)/2, w, h};
}
async function canvasToBlob(canvas, type='image/webp', quality=.82){
  return await new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
async function prepareImageForUpload(file, pathPrefix='uploads'){
  if(!file || !file.type || !file.type.startsWith('image/')) return {blob:file, ext:(file.name.split('.').pop()||'jpg').toLowerCase(), contentType:file?.type||'application/octet-stream'};
  const img=await loadImageForCanvas(file);
  const isProduct=String(pathPrefix||'').includes('products/');
  const isLogo=String(pathPrefix||'').includes('logos/');
  let canvas=document.createElement('canvas');
  let ctx=canvas.getContext('2d');
  if(isProduct){
    canvas.width=1080; canvas.height=1920;
    ctx.fillStyle='#f3f4f6'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const cover=fitRect(img.width,img.height,canvas.width,canvas.height,'cover');
    ctx.save();
    ctx.filter='blur(28px)';
    ctx.globalAlpha=.55;
    ctx.drawImage(img, cover.x-40, cover.y-40, cover.w+80, cover.h+80);
    ctx.restore();
    ctx.fillStyle='rgba(245,245,245,.62)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const padX=34, padY=210;
    const contain=fitRect(img.width,img.height,canvas.width-padX*2,canvas.height-padY*2,'contain');
    ctx.drawImage(img, contain.x+padX, contain.y+padY, contain.w, contain.h);
  }else if(isLogo){
    canvas.width=640; canvas.height=640;
    ctx.fillStyle='#111827'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const r=fitRect(img.width,img.height,560,560,'contain');
    ctx.drawImage(img,r.x+40,r.y+40,r.w,r.h);
  }else{
    const max=1600;
    const scale=Math.min(1,max/Math.max(img.width,img.height));
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
  }
  const blob=await canvasToBlob(canvas,'image/webp',isProduct?.84:.82);
  if(!blob) return {blob:file, ext:(file.name.split('.').pop()||'jpg').toLowerCase(), contentType:file.type};
  return {blob, ext:'webp', contentType:'image/webp'};
}
async function uploadAsset(file, pathPrefix='uploads'){
  if(!file) throw new Error('Nema fajla');
  if(!window.db) throw new Error('Supabase nije učitan');
  const prepared=await prepareImageForUpload(file,pathPrefix);
  const name=`${pathPrefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${prepared.ext}`;
  const {error}=await db.storage.from('salon-assets').upload(name,prepared.blob,{cacheControl:'31536000',upsert:false,contentType:prepared.contentType});
  if(error) throw error;
  const {data}=db.storage.from('salon-assets').getPublicUrl(name);
  return data.publicUrl;
}
window.prepareImageForUpload=prepareImageForUpload;
window.uploadAsset = uploadAsset;
