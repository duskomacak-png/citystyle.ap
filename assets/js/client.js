let currentProfile=null,currentSettings={},currentKind='salon',services=[],products=[],productImages={},selectedService=null,selectedTime=null,viewerState=null;
const app=document.getElementById('app');
window.addEventListener('DOMContentLoaded', initClient);
window.addEventListener('keydown', handleViewerKey);
async function initClient(){
  const slug=City.qs('salon') || localStorage.getItem('citystyle_saved_salon');
  if(!slug){renderLanding();return;}
  try{
    currentProfile=await City.getProfile(slug); if(!currentProfile){renderMissing();return;}
    currentSettings=await City.getSettings(currentProfile.id);
    localStorage.setItem('citystyle_saved_salon', currentProfile.slug);
    await loadBaseData();
    currentKind=City.profileType(currentProfile, products.length);
    renderProfile();
    const productCode=City.qs('product'); if(productCode && products.length) openProductByCode(productCode);
  }catch(e){console.error(e);app.innerHTML=`<div class="notice">Greška učitavanja profila: ${City.esc(e.message)}</div>`}
}
function renderLanding(){app.innerHTML=`<section class="hero"><div class="brand-logo">CS</div><h1>CityStyle</h1><p class="muted">QR/PWA profili za salone i prodavnice patika.</p><div class="actions"><a class="btn primary" href="/admin/">Admin</a><a class="btn ghost" href="/salon/">Ulaz za vlasnika</a></div></section>`}
function renderMissing(){app.innerHTML=`<section class="hero"><h1>Profil nije pronađen</h1><p class="muted">Proveri QR/link.</p></section>`}
async function loadBaseData(){
  const sid=currentProfile.id;
  try{const {data}=await db.from('services').select('*').eq('salon_id',sid).eq('active',true).order('sort_order',{ascending:true});services=data||[]}catch(e){services=[]}
  try{const {data}=await db.from('products').select('*').eq('salon_id',sid).eq('active',true).order('created_at',{ascending:false});products=data||[]}catch(e){products=[]}
  if(products.length){
    try{const ids=products.map(p=>p.id);const {data}=await db.from('product_images').select('*').in('product_id',ids).order('sort_order',{ascending:true}).order('created_at',{ascending:true});productImages={};(data||[]).forEach(img=>{(productImages[img.product_id] ||= []).push(img)});}catch(e){productImages={}}
  }
}
function renderProfile(){
  const logo=City.profileLogo(currentProfile,currentSettings); const name=City.profileName(currentProfile); const text=City.profileText(currentProfile,currentSettings);
  const phone=City.profilePhone(currentProfile,currentSettings); const address=City.profileAddress(currentProfile,currentSettings);
  if(currentKind==='shop'){
    app.innerHTML=`<section class="shop-client-page"><div class="shop-client-head">${logo?`<img class="shop-logo" src="${City.esc(logo)}" alt="Logo profila">`:`<div class="shop-logo shop-logo-fallback">${City.esc(name[0]||'S')}</div>`}<div class="shop-client-copy"><h1>${City.esc(name)}</h1>${text?`<p>${City.esc(text)}</p>`:''}<div class="shop-client-meta">${phone?`<span class="meta-pill">📞 ${City.esc(phone)}</span>`:''}${address?`<span class="meta-pill">📍 ${City.esc(address)}</span>`:''}</div></div></div><section id="content"></section></section>`;
    showProducts();
    return;
  }
  app.innerHTML=`<section class="hero"><div>${logo?`<img class="brand-logo" src="${City.esc(logo)}" alt="">`:`<div class="brand-logo">${City.esc(name[0]||'C')}</div>`}</div><h1>${City.esc(name)}</h1>${text?`<p class="muted">${City.esc(text)}</p>`:''}${phone||address?`<div class="hero-meta">${phone?`<span class="meta-pill">📞 ${City.esc(phone)}</span>`:''}${address?`<span class="meta-pill">📍 ${City.esc(address)}</span>`:''}</div>`:''}<div class="actions"><button class="btn primary" onclick="showServices()">Zakaži termin</button><button class="btn ghost" onclick="installInfo()">Preuzmi app profila</button></div></section><section id="content"></section>`;
  showServices();
}
function installInfo(){toast('Na telefonu: Chrome/Safari meni → Add to Home screen / Dodaj na početni ekran')}
function productMainImage(p){return p.image_url || (productImages[p.id]||[])[0]?.image_url || ''}
function productAllImages(p){const set=[]; if(p.image_url) set.push(p.image_url); (productImages[p.id]||[]).forEach(i=>{if(i.image_url&&!set.includes(i.image_url)) set.push(i.image_url)}); return set;}
function productCode(p){return p.public_code || String(p.id||'').slice(0,8).toUpperCase()}
function productPrice(p){return City.formatPrice(p.price, p.currency || 'RSD')}
function showProducts(){
  const c=$('#content'); if(!c)return;
  if(!products.length){c.innerHTML='<div class="card"><h2>Još nema proizvoda</h2><p class="muted">Vlasnik još nije dodao katalog.</p></div>';return;}
  c.innerHTML=`<div class="product-grid shop-feed-grid">${products.map((p,i)=>`<button class="product-card" onclick="openViewer(${i})"><div class="product-card-img-wrap">${productMainImage(p)?`<img src="${City.esc(productMainImage(p))}" alt="">`:`<div class="empty-img">Bez slike</div>`}</div><div class="product-card-body"><small class="muted">${City.esc(productCode(p))}${p.category?' • '+City.esc(p.category):''}</small><h3>${City.esc(p.name||'Proizvod')}</h3><div class="price">${City.esc(productPrice(p))}</div></div></button>`).join('')}</div>`;
}
function openProductByCode(code){const idx=products.findIndex(p=>String(productCode(p)).toLowerCase()===String(code).toLowerCase()||String(p.id)===String(code)); if(idx>=0) openViewer(idx); else showProducts();}
function openViewer(index){viewerState={index,image:0,startX:0,startY:0,lastWheel:0,mouseX:0,mouseY:0}; renderViewer();}
function renderViewer(){
  const p=products[viewerState.index]; if(!p)return; const imgs=productAllImages(p); const img=imgs[viewerState.image]||'';
  const el=document.createElement('div'); el.className='viewer'; el.id='productViewer';
  el.innerHTML=`<div class="viewer-slide active">${img?`<img class="viewer-img" src="${City.esc(img)}" alt="${City.esc(p.name||'')}">`:`<div class="viewer-img" style="display:grid;place-items:center">Bez slike</div>`}</div>${imgs.length>1?`<button class="viewer-arrow viewer-arrow-left" onclick="changeImageFromButton(event,-1)" aria-label="Prethodna slika">‹</button><button class="viewer-arrow viewer-arrow-right" onclick="changeImageFromButton(event,1)" aria-label="Sledeća slika">›</button>`:''}<div class="viewer-info"><small>${City.esc(productCode(p))}${p.category?' • '+City.esc(p.category):''}${imgs.length>1?' • '+(viewerState.image+1)+'/'+imgs.length:''}</small><h2>${City.esc(p.name||'Proizvod')}</h2><div class="viewer-price">${City.esc(productPrice(p))}</div></div><button class="viewer-close" onclick="closeViewer()">×</button><div class="viewer-actions"><button class="icon-btn red" onclick="shareCurrentProduct(event)" aria-label="Podeli"><span>↗</span><b>Podeli</b></button><button class="icon-btn blue" onclick="askCurrentProduct(event)" aria-label="Pitaj"><span>💬</span><b>Pitaj</b></button><button class="icon-btn green" onclick="callProfile(event)" aria-label="Pozovi"><span>☎</span><b>Pozovi</b></button></div>${imgs.length>1?`<div class="viewer-dots">${imgs.map((_,i)=>`<button class="viewer-dot ${i===viewerState.image?'active':''}" onclick="setViewerImage(event,${i})"></button>`).join('')}</div>`:''}`;
  el.addEventListener('touchstart',e=>{viewerState.startX=e.touches[0].clientX;viewerState.startY=e.touches[0].clientY;},{passive:true});
  el.addEventListener('touchend',handleViewerSwipe,{passive:true});
  el.addEventListener('wheel', handleViewerWheel, {passive:false});
  el.addEventListener('mousedown', e=>{viewerState.mouseX=e.clientX;viewerState.mouseY=e.clientY;});
  el.addEventListener('mouseup', handleViewerMouse);
  $('#productViewer')?.remove(); document.body.appendChild(el);
}
function handleViewerSwipe(e){if(!viewerState||e.target.closest('button,a'))return; const dx=e.changedTouches[0].clientX-viewerState.startX; const dy=e.changedTouches[0].clientY-viewerState.startY; if(Math.max(Math.abs(dx),Math.abs(dy))<45)return; if(Math.abs(dx)>Math.abs(dy)){changeImage(dx<0?1:-1)}else{changeProduct(dy<0?1:-1)}}
function handleViewerMouse(e){if(!viewerState||e.target.closest('button,a'))return; const dx=e.clientX-viewerState.mouseX; const dy=e.clientY-viewerState.mouseY; if(Math.max(Math.abs(dx),Math.abs(dy))<55)return; if(Math.abs(dx)>Math.abs(dy)){changeImage(dx<0?1:-1)}else{changeProduct(dy<0?1:-1)}}
function handleViewerWheel(e){if(!viewerState)return; if(Math.abs(e.deltaY)<25)return; e.preventDefault(); const now=Date.now(); if(now-(viewerState.lastWheel||0)<520)return; viewerState.lastWheel=now; changeProduct(e.deltaY>0?1:-1)}
function handleViewerKey(e){if(!viewerState)return; if(e.key==='Escape')closeViewer(); if(e.key==='ArrowRight')changeImage(1); if(e.key==='ArrowLeft')changeImage(-1); if(e.key==='ArrowDown')changeProduct(1); if(e.key==='ArrowUp')changeProduct(-1);}
function changeImage(dir){const p=products[viewerState.index], imgs=productAllImages(p); if(imgs.length<2)return; viewerState.image=(viewerState.image+dir+imgs.length)%imgs.length; renderViewer();}
function changeProduct(dir){viewerState.index=(viewerState.index+dir+products.length)%products.length; viewerState.image=0; renderViewer();}
function setViewerImage(e,i){e.stopPropagation(); viewerState.image=i; renderViewer();}
function changeImageFromButton(e,dir){e.stopPropagation(); changeImage(dir);}
function closeViewer(){ $('#productViewer')?.remove(); viewerState=null;}
function closeOrUnzoom(){closeViewer();}
function currentProduct(){return products[viewerState.index]}
function productUrl(p){return City.directLink(currentProfile.slug, productCode(p))}
async function shareCurrentProduct(e){e.stopPropagation(); const p=currentProduct(); const url=productUrl(p); const text=`${p.name||'Proizvod'} • ${productPrice(p)} • ${url}`; if(navigator.share){try{await navigator.share({title:p.name||'Proizvod',text,url});return;}catch(_){}} City.copyText(text)}
function askCurrentProduct(e){e.stopPropagation(); const p=currentProduct(); const phone=City.normalizePhone(City.profilePhone(currentProfile,currentSettings)); if(!phone){toast('Vlasnik nije upisao WhatsApp/telefon.');return;} const msg=`Zdravo, zanima me ovaj proizvod:%0A%0AOglas: ${encodeURIComponent(productCode(p))}%0ANaziv: ${encodeURIComponent(p.name||'Proizvod')}%0ACena: ${encodeURIComponent(productPrice(p))}%0ALink: ${encodeURIComponent(productUrl(p))}`; location.href=`whatsapp://send?phone=${phone}&text=${msg}`; setTimeout(()=>{location.href=`https://wa.me/${phone}?text=${msg}`},900)}
function callProfile(e){e.stopPropagation(); const phone=City.normalizePhone(City.profilePhone(currentProfile,currentSettings)); if(!phone){toast('Telefon nije upisan.');return;} location.href='tel:+'+phone;}
function showServices(){
  const c=$('#content'); if(!c)return; selectedService=null; selectedTime=null;
  c.innerHTML=`<div class="card"><h2>Zakazivanje termina</h2>${services.length?`<div class="list">${services.map(s=>`<button class="service-card" onclick="selectService('${s.id}')"><b>${City.esc(s.name)}</b><p class="muted">${City.esc(City.formatPrice(s.price,s.currency||'RSD'))} • ${s.duration_minutes||s.duration_snapshot||30} min</p></button>`).join('')}</div>`:'<p class="muted">Vlasnik još nije dodao usluge.</p>'}</div><div id="bookingBox"></div>`;
}
function selectService(id){selectedService=services.find(s=>s.id===id); const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1); const date=tomorrow.toISOString().slice(0,10); $('#bookingBox').innerHTML=`<div class="card form"><h3>${City.esc(selectedService.name)}</h3><label>Datum<input type="date" id="bookDate" value="${date}" onchange="renderSlots()"></label><div id="slots"></div><label>Ime i prezime<input id="clientName" placeholder="Ime"></label><label>Telefon<input id="clientPhone" placeholder="Telefon"></label><label>Napomena<textarea id="clientNote" placeholder="Napomena"></textarea></label><button class="btn primary" onclick="submitBooking()">Pošalji zahtev</button></div>`; renderSlots();}
function renderSlots(){const box=$('#slots'); const slots=['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00']; box.innerHTML=`<label>Termin</label><div class="time-grid">${slots.map(t=>`<button class="time-slot ${selectedTime===t?'selected':''}" onclick="selectedTime='${t}';renderSlots()">${t}</button>`).join('')}</div>`}
async function submitBooking(){if(!selectedService||!selectedTime){toast('Izaberi uslugu i termin.');return;} const payload={salon_id:currentProfile.id,service_id:selectedService.id,service_name_snapshot:selectedService.name,price_snapshot:selectedService.price||null,duration_snapshot:selectedService.duration_minutes||30,appointment_date:$('#bookDate').value,appointment_time:selectedTime,client_name:$('#clientName').value.trim(),client_phone:$('#clientPhone').value.trim(),client_note:$('#clientNote').value.trim(),status:'new'}; if(!payload.client_name||!payload.client_phone){toast('Upiši ime i telefon.');return;} const {error}=await db.from('appointments').insert(payload); if(error){toast('Greška: '+error.message);return;} toast('Zahtev je poslat.'); showServices();}
Object.assign(window,{showProducts,openViewer,closeViewer,closeOrUnzoom,setViewerImage,shareCurrentProduct,askCurrentProduct,callProfile,showServices,selectService,renderSlots,submitBooking,installInfo});
