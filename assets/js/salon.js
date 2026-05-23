let ownerProfile=null, ownerSettings={}, ownerKind='salon', ownerProducts=[], ownerServices=[], editingProductId=null;
const ownerApp=document.getElementById('ownerApp');
window.addEventListener('DOMContentLoaded', initOwner);
function savedSession(){try{return JSON.parse(localStorage.getItem('citystyle_salon_session')||'null')}catch(e){return null}}
async function initOwner(){const s=savedSession(); if(s?.id){try{const {data}=await db.from('salons').select('*').eq('id',s.id).maybeSingle(); if(data){ownerProfile=data; await ownerLoad(); renderOwner(); return;}}catch(e){}} renderLogin();}
function renderLogin(){ownerApp.innerHTML=`<section class="hero"><h1>Ulaz za vlasnika</h1><p class="muted">Salon ili prodavnica patika.</p><div class="card form"><label>Email<input id="loginEmail" type="email"></label><label>Šifra/kod profila<input id="loginCode" type="password"></label><button class="btn primary" onclick="ownerLogin()">Uđi</button></div></section>`}
async function ownerLogin(){const email=$('#loginEmail').value.trim().toLowerCase(); const code=$('#loginCode').value.trim(); if(!email||!code){toast('Upiši email i kod.');return;} const {data,error}=await db.from('salons').select('*').ilike('owner_email',email).eq('company_code',code).neq('status','deleted').maybeSingle(); if(error||!data){toast('Pogrešan email ili kod.');return;} ownerProfile=data; localStorage.setItem('citystyle_salon_session',JSON.stringify({id:data.id,email})); await ownerLoad(); renderOwner();}
async function ownerLoad(){ownerSettings=await City.getSettings(ownerProfile.id); await loadProducts(); await loadServices(); ownerKind=City.profileType(ownerProfile, ownerProducts.length);}
function logout(){localStorage.removeItem('citystyle_salon_session'); location.reload();}
function publicUrl(){return `${location.origin}/?salon=${encodeURIComponent(ownerProfile.slug)}`}
function renderOwner(tab){tab=tab || (ownerKind==='shop'?'products':'appointments'); ownerApp.innerHTML=`<div class="topbar"><div><h1>${City.esc(City.profileName(ownerProfile))}</h1><p class="muted">${ownerKind==='shop'?'Prodavnica patika':'Salon'}</p></div><button class="btn ghost" onclick="logout()">Odjavi se</button></div><div class="tabs">${ownerKind==='shop'?`<button class="btn ${tab==='products'?'active':''}" onclick="renderOwner('products')">Proizvodi</button><button class="btn ${tab==='settings'?'active':''}" onclick="renderOwner('settings')">Profil</button><button class="btn ${tab==='qr'?'active':''}" onclick="renderOwner('qr')">QR/link</button>`:`<button class="btn ${tab==='appointments'?'active':''}" onclick="renderOwner('appointments')">Termini</button><button class="btn ${tab==='services'?'active':''}" onclick="renderOwner('services')">Usluge</button><button class="btn ${tab==='settings'?'active':''}" onclick="renderOwner('settings')">Profil</button><button class="btn ${tab==='qr'?'active':''}" onclick="renderOwner('qr')">QR/link</button>`}</div><section id="ownerContent"></section>`; if(tab==='products') renderProducts(); if(tab==='settings') renderSettings(); if(tab==='qr') renderQr(); if(tab==='appointments') renderAppointments(); if(tab==='services') renderServices();}
async function loadProducts(){try{const {data}=await db.from('products').select('*').eq('salon_id',ownerProfile.id).order('created_at',{ascending:false}); ownerProducts=data||[]}catch(e){ownerProducts=[]}}
async function loadServices(){try{const {data}=await db.from('services').select('*').eq('salon_id',ownerProfile.id).order('sort_order',{ascending:true}); ownerServices=data||[]}catch(e){ownerServices=[]}}
function renderProducts(){
  const c=$('#ownerContent');
  const editing = editingProductId ? ownerProducts.find(p=>String(p.id)===String(editingProductId)) : null;
  const submitLabel = editing ? 'Sačuvaj izmene' : 'Dodaj proizvod';
  const cancelBtn = editing ? `<button class="btn ghost" onclick="cancelProductEdit()">Otkaži izmenu</button>` : '';
  c.innerHTML=`<div class="card"><h2>${editing?'Izmeni oglas / proizvod':'Dodaj oglas / proizvod'}</h2><div class="form"><input id="pName" placeholder="Naziv patika" value="${City.esc(editing?.name||'')}"><input id="pCategory" placeholder="Brend/kategorija, npr. Nike" value="${City.esc(editing?.category||'')}"><input id="pPrice" inputmode="numeric" autocomplete="off" placeholder="Cena, npr. 12.400" onblur="this.value=City.normalizePriceInput(this.value)" value="${City.esc(City.normalizePriceInput(editing?.price||''))}"><select id="pStatus"><option value="in_stock" ${(!editing||editing.stock_status==='in_stock')?'selected':''}>Na stanju</option><option value="order" ${editing?.stock_status==='order'?'selected':''}>Po porudžbini</option><option value="sold_out" ${editing?.stock_status==='sold_out'?'selected':''}>Nema na stanju</option></select><textarea id="pDesc" placeholder="Opis, brojevi, stanje...">${City.esc(editing?.description||'')}</textarea><label>Glavna slika<small class="muted">Slika se automatski smanjuje i prilagođava za TikTok oglas.</small>${editing?.image_url?`<small class="muted">Ako ne izabereš novu sliku, ostaje stara.</small>`:''}<input id="pImage" type="file" accept="image/*"></label><div class="actions"><button class="btn primary" onclick="saveProduct()">${submitLabel}</button>${cancelBtn}</div></div></div><div class="list">${ownerProducts.map(p=>`<div class="row"><div style="display:flex;gap:10px"><img src="${City.esc(p.image_url||'')}" onerror="this.style.display='none'"><div><b>${City.esc(p.name)}</b><p class="muted">${City.esc(p.public_code||String(p.id).slice(0,8))} • ${City.esc(City.formatPrice(p.price,p.currency||'RSD'))}</p></div></div><div class="actions"><button class="btn small primary" onclick="editProduct('${p.id}')">Izmeni</button><button class="btn small" onclick="openProductImages('${p.id}')">Slike</button><button class="btn small ghost" onclick="copyText('${publicUrl()}&product=${encodeURIComponent(p.public_code||p.id)}')">Link</button><button class="btn small danger" onclick="deleteProduct('${p.id}')">Obriši</button></div></div>`).join('')}</div>`
}
function editProduct(id){editingProductId=id; renderProducts(); setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),30);}
function cancelProductEdit(){editingProductId=null; renderProducts();}
async function saveProduct(){
  const editing = editingProductId ? ownerProducts.find(p=>String(p.id)===String(editingProductId)) : null;
  let image=editing?.image_url||'';
  const f=$('#pImage').files[0];
  if(f){try{image=await uploadAsset(f,`products/${ownerProfile.id}`)}catch(e){toast('Upload greška: '+e.message);return;}}
  const payload={salon_id:ownerProfile.id,name:$('#pName').value.trim(),category:$('#pCategory').value.trim(),price:City.normalizePriceInput($('#pPrice').value),currency:'RSD',stock_status:$('#pStatus').value,description:$('#pDesc').value.trim(),image_url:image,active:true,updated_at:new Date().toISOString()};
  if(!payload.name){toast('Upiši naziv.');return;}
  let error;
  if(editing){({error}=await db.from('products').update(payload).eq('id',editing.id).eq('salon_id',ownerProfile.id));}
  else{({error}=await db.from('products').insert(payload));}
  if(error){toast('Greška: '+error.message);return;}
  toast(editing?'Oglas izmenjen.':'Proizvod dodat.');
  editingProductId=null;
  await loadProducts(); renderProducts();
}
async function deleteProduct(id){if(!confirm('Obrisati proizvod?'))return; const {error}=await db.from('products').delete().eq('id',id).eq('salon_id',ownerProfile.id); if(error){toast(error.message);return;} await loadProducts(); renderProducts();}
async function openProductImages(id){const {data:imgs=[]}=await db.from('product_images').select('*').eq('product_id',id).order('sort_order',{ascending:true}); const html=`<div class="viewer" id="imageManager" style="overflow:auto;padding:18px"><button class="viewer-close" onclick="$('#imageManager').remove()">×</button><div class="card"><h2>Dodatne slike</h2><label class="form">Dodaj slike<small class="muted">Slike se automatski kompresuju i uklapaju u format oglasa.</small><input id="extraImgs" type="file" accept="image/*" multiple></label><button class="btn primary" onclick="uploadProductImages('${id}')">Upload</button></div><div class="product-grid">${imgs.map(i=>`<div class="product-card"><img src="${City.esc(i.image_url)}"><div class="product-card-body"><button class="btn danger small" onclick="deleteProductImage('${i.id}','${id}')">Obriši</button></div></div>`).join('')}</div></div>`; document.body.insertAdjacentHTML('beforeend',html)}
async function uploadProductImages(id){const files=Array.from($('#extraImgs').files||[]).slice(0,10); for(const f of files){const url=await uploadAsset(f,`products/${ownerProfile.id}`); await db.from('product_images').insert({product_id:id,image_url:url,sort_order:100});} $('#imageManager').remove(); toast('Slike dodate.');}
async function deleteProductImage(imgId, productId){await db.from('product_images').delete().eq('id',imgId); $('#imageManager').remove(); openProductImages(productId)}
async function renderAppointments(){const c=$('#ownerContent'); let rows=[]; try{const {data}=await db.from('appointments').select('*').eq('salon_id',ownerProfile.id).order('appointment_date',{ascending:true}); rows=data||[]}catch(e){} c.innerHTML=`<div class="card"><h2>Termini</h2>${rows.length?rows.map(a=>`<div class="row"><div><b>${City.esc(a.client_name||'Klijent')}</b><p class="muted">${City.esc(a.appointment_date)} ${City.esc(a.appointment_time)} • ${City.esc(a.service_name_snapshot||'Usluga')}</p></div><span class="pill">${City.esc(a.status||'new')}</span></div>`).join(''):'<p class="muted">Nema termina.</p>'}</div>`}
function renderServices(){const c=$('#ownerContent'); c.innerHTML=`<div class="card form"><h2>Usluge</h2><input id="sName" placeholder="Naziv usluge"><input id="sPrice" inputmode="numeric" autocomplete="off" placeholder="Cena, npr. 1.500" onblur="this.value=City.normalizePriceInput(this.value)"><input id="sDur" placeholder="Trajanje min" value="30"><button class="btn primary" onclick="saveService()">Dodaj uslugu</button></div><div class="list">${ownerServices.map(s=>`<div class="row"><div><b>${City.esc(s.name)}</b><p class="muted">${City.esc(City.formatPrice(s.price,s.currency||'RSD'))} • ${s.duration_minutes||30} min</p></div></div>`).join('')}</div>`}
async function saveService(){const payload={salon_id:ownerProfile.id,name:$('#sName').value.trim(),price:City.normalizePriceInput($('#sPrice').value),currency:'RSD',duration_minutes:Number($('#sDur').value||30),active:true,sort_order:100}; if(!payload.name){toast('Naziv usluge');return;} const {error}=await db.from('services').insert(payload); if(error){toast(error.message);return;} await loadServices(); renderServices();}
function renderSettings(){const c=$('#ownerContent'); c.innerHTML=`<div class="card form"><h2>Podešavanje profila</h2><label>Opis<textarea id="setText">${City.esc(City.profileText(ownerProfile,ownerSettings))}</textarea></label><label>Telefon/WhatsApp<input id="setPhone" value="${City.esc(City.profilePhone(ownerProfile,ownerSettings))}"></label><label>Logo<input id="setLogo" type="file" accept="image/*"></label><button class="btn primary" onclick="saveSettings()">Sačuvaj</button></div>`}
async function saveSettings(){let logo=ownerSettings.logo_url||''; const f=$('#setLogo').files[0]; if(f) logo=await uploadAsset(f,`logos/${ownerProfile.id}`); const payload={salon_id:ownerProfile.id,welcome_text:$('#setText').value.trim(),phone:$('#setPhone').value.trim(),whatsapp:$('#setPhone').value.trim(),logo_url:logo}; const {error}=await db.from('salon_settings').upsert(payload,{onConflict:'salon_id'}); if(error){toast(error.message);return;} toast('Sačuvano.'); ownerSettings={...ownerSettings,...payload};}
function renderQr(){
  const url = publicUrl();
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(url)}`;
  const safeUrl = City.esc(url);
  const safeQr = City.esc(qrSrc);
  $('#ownerContent').innerHTML = `
    <div class="card qr-card">
      <h2>QR kod profila</h2>
      <p class="muted">Mušterija skenira ovaj kod i otvara baš ovaj profil.</p>
      <div class="qr-box">
        <img class="qr-img" src="${safeQr}" alt="QR kod profila" loading="lazy">
      </div>
      <p class="muted qr-link-text">${safeUrl}</p>
      <div class="actions">
        <button class="btn primary" onclick="copyText('${url}')">Kopiraj link</button>
        <a class="btn ghost" href="${safeQr}" target="_blank" rel="noopener">Otvori QR</a>
        <a class="btn ghost" href="${safeUrl}" target="_blank" rel="noopener">Otvori profil</a>
      </div>
    </div>`;
}
Object.assign(window,{ownerLogin,logout,renderOwner,renderProducts,saveProduct,editProduct,cancelProductEdit,deleteProduct,openProductImages,uploadProductImages,deleteProductImage,renderAppointments,renderServices,saveService,renderSettings,saveSettings,renderQr,copyText:City.copyText});
