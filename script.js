const APP_VERSION = "1.3.3";
const POWERED_TEXT = "powered by citystyle.app";

const businesses = {
  urban: {
    name: "Urban Step",
    type: "Prodavnica patika",
    defaultTab: "products",
    heroTitle: "Patike koje se pregledaju kao mobilni katalog.",
    heroText: "Bez korpe, bez plaćanja, bez kupčevog login-a — kupac odmah šalje upit ili zove.",
    cta: "Pošalji upit",
  },
  venera: {
    name: "Venera Beauty",
    type: "Beauty studio",
    defaultTab: "services",
    heroTitle: "Usluge prikazane kao premium mobilni izlog.",
    heroText: "Klijent vidi uslugu, trajanje i odmah zakazuje pozivom ili porukom.",
    cta: "Zakaži termin",
  }
};

const items = [
  {
    id:"sneaker-1", business:"urban", tab:"products", type:"Proizvod", title:"Nike Air Max Pulse", price:"4.700 RSD", meta:"Brojevi 40–46 · Dostupno odmah", label:"Patike", cta:"Pošalji upit",
    description:"Detalj je podešen da na laptopu ostane u phone-preview širini. Slika ima kontrolisanu visinu, strelice, tačkice i Zum prikaz.",
    info:[['Veličine','40, 41, 42, 43, 44, 45, 46'],['Dostupnost','Na stanju'],['Kontakt','WhatsApp / Viber'],['Profil','Urban Step']],
    images:[shoeSvg('#1f2937','#f3f4f6','#d7b46a'), shoeSvg('#111827','#e5e7eb','#9ca3af'), shoeSvg('#201612','#f8fafc','#f2d38b')]
  },
  {
    id:"sneaker-2", business:"urban", tab:"products", type:"Proizvod", title:"Adidas Campus Black", price:"5.200 RSD", meta:"Brojevi 39–45 · Poruka za rezervaciju", label:"Novo", cta:"Pošalji upit",
    description:"Kartica i detalj ostaju čisti: slika je fokus, tekst ne prekriva pola proizvoda, CTA je vidljiv ali nizak.",
    info:[['Veličine','39–45'],['Boja','Crna'],['Dostupnost','Pitaju se veličine'],['Dostava','Po dogovoru']],
    images:[shoeSvg('#080808','#f4f4f5','#ffffff'), shoeSvg('#111111','#eab308','#fef3c7')]
  },
  {
    id:"beauty-1", business:"venera", tab:"services", type:"Usluga", title:"Feniranje + nega", price:"od 1.800 RSD", meta:"Trajanje 45 min · Zakazivanje pozivom", label:"Usluga", cta:"Zakaži termin",
    description:"Venera Beauty je podešena da po defaultu otvara Usluge, ne proizvode. Nema korpe, plaćanja ni login-a kupca.",
    info:[['Trajanje','45 min'],['Tip','Kosa / nega'],['Zakazivanje','Poziv ili poruka'],['Status','Dostupno']],
    images:[beautySvg('#3b1d2d','#f9d7e7','#d7b46a'), beautySvg('#24111b','#ffd1dc','#f2d38b')]
  },
  {
    id:"beauty-2", business:"venera", tab:"services", type:"Usluga", title:"Manikir classic", price:"od 1.500 RSD", meta:"Trajanje 60 min · Pozovi za termin", label:"Beauty", cta:"Zakaži termin",
    description:"Isti premium dark UI radi za usluge i proizvode, samo se tekstovi/CTA menjaju po tipu biznisa.",
    info:[['Trajanje','60 min'],['Tip','Nokti'],['Zakazivanje','Poziv'],['Cena','Od 1.500 RSD']],
    images:[beautySvg('#1f1537','#eee7ff','#d7b46a'), beautySvg('#111827','#fce7f3','#f9a8d4')]
  }
];

let currentBusinessKey = new URLSearchParams(location.search).get('biz') || 'urban';
if(!businesses[currentBusinessKey]) currentBusinessKey = 'urban';
let activeTab = businesses[currentBusinessKey].defaultTab;
let activeItem = null;
let activeImg = 0;
let isContain = false;
let isZoomed = false;

const $ = (id)=>document.getElementById(id);

function init(){
  document.querySelectorAll('.footer-brand,.detail-powered').forEach(el=>el.textContent=POWERED_TEXT);
  setupBusiness();
  bindEvents();
  renderTabs();
  renderFeed();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}

function setupBusiness(){
  const b = businesses[currentBusinessKey];
  $('businessName').textContent = b.name;
  $('businessTypeBadge').textContent = b.type;
  $('heroTitle').textContent = b.heroTitle;
  $('heroText').textContent = b.heroText;
  document.title = `${b.name} | citystyle.app`;
}
function bindEvents(){
  $('tabProducts').addEventListener('click',()=>{activeTab='products';renderTabs();renderFeed();});
  $('tabServices').addEventListener('click',()=>{activeTab='services';renderTabs();renderFeed();});
  $('closeDetailBtn').addEventListener('click',closeDetail);
  $('prevImgBtn').addEventListener('click',()=>changeImg(-1));
  $('nextImgBtn').addEventListener('click',()=>changeImg(1));
  $('zoomBtn').addEventListener('click',toggleZoomMode);
  $('galleryFrame').addEventListener('click',toggleZoomMode);
  $('shareBusinessBtn').addEventListener('click',()=>shareText(`${businesses[currentBusinessKey].name} — ${location.href}`));
  $('shareItemBtn').addEventListener('click',()=> activeItem && shareText(`${activeItem.title} — ${location.href.split('#')[0]}#${activeItem.id}`));
  $('primaryCtaBtn').addEventListener('click',()=>alert('Demo CTA: ovde ide WhatsApp/Viber/poruka za biznis. Nema korpe i nema plaćanja.'));
  $('callBtn').addEventListener('click',()=>alert('Demo poziv: ovde kasnije ide tel: link biznisa.'));
  document.addEventListener('keydown',(e)=>{
    if($('detailOverlay').classList.contains('hidden')) return;
    if(e.key==='Escape') closeDetail();
    if(e.key==='ArrowLeft') changeImg(-1);
    if(e.key==='ArrowRight') changeImg(1);
  });
}
function renderTabs(){
  $('tabProducts').classList.toggle('active',activeTab==='products');
  $('tabServices').classList.toggle('active',activeTab==='services');
}
function renderFeed(){
  const feed = $('feed');
  const visible = items.filter(i => i.business === currentBusinessKey && i.tab === activeTab);
  feed.innerHTML = visible.map(item => `
    <article class="card" data-id="${item.id}" tabindex="0" role="button" aria-label="Otvori ${escapeHtml(item.title)}">
      <div class="card-media">
        <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <span class="card-tag">${escapeHtml(item.label)}</span>
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="price">${escapeHtml(item.price)}</p>
        </div>
        <p class="meta">${escapeHtml(item.meta)}</p>
      </div>
    </article>
  `).join('') || `<p class="meta">Nema stavki za ovaj prikaz.</p>`;
  feed.querySelectorAll('.card').forEach(card=>{
    const open = ()=>openDetail(card.dataset.id);
    card.addEventListener('click',open);
    card.addEventListener('keydown',(e)=>{ if(e.key==='Enter') open(); });
  });
}
function openDetail(id){
  activeItem = items.find(i=>i.id===id);
  if(!activeItem) return;
  activeImg = 0; isContain = false; isZoomed = false;
  $('detailKicker').textContent = activeItem.type;
  $('detailTitle').textContent = activeItem.title;
  $('detailPrice').textContent = activeItem.price;
  $('detailDescription').textContent = activeItem.description;
  $('primaryCtaBtn').textContent = activeItem.cta || businesses[currentBusinessKey].cta;
  $('detailInfo').innerHTML = activeItem.info.map(([k,v])=>`<div class="info-box"><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`).join('');
  $('detailOverlay').classList.remove('hidden');
  $('detailOverlay').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  $('detailScroll').scrollTop = 0;
  updateImage();
}
function closeDetail(){
  $('detailOverlay').classList.add('hidden');
  $('detailOverlay').setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}
function changeImg(step){
  if(!activeItem) return;
  activeImg = (activeImg + step + activeItem.images.length) % activeItem.images.length;
  isZoomed = false;
  updateImage();
}
function updateImage(){
  const frame = $('galleryFrame');
  const img = $('detailImage');
  img.src = activeItem.images[activeImg];
  img.alt = activeItem.title + ` slika ${activeImg+1}`;
  frame.classList.toggle('contain',isContain || isZoomed);
  frame.classList.toggle('zoomed',isZoomed);
  $('zoomBtn').textContent = isZoomed ? 'Vrati' : (isContain ? 'Cover' : 'Zum');
  $('dots').innerHTML = activeItem.images.map((_,idx)=>`<span class="dot ${idx===activeImg?'active':''}"></span>`).join('');
  $('prevImgBtn').style.display = activeItem.images.length > 1 ? 'grid' : 'none';
  $('nextImgBtn').style.display = activeItem.images.length > 1 ? 'grid' : 'none';
}
function toggleZoomMode(){
  if(!activeItem) return;
  if(!isContain){ isContain = true; isZoomed = false; }
  else if(!isZoomed){ isZoomed = true; }
  else { isContain = false; isZoomed = false; }
  updateImage();
}
async function shareText(text){
  try{
    if(navigator.share) await navigator.share({text});
    else { await navigator.clipboard.writeText(text); alert('Link je kopiran.'); }
  }catch(e){}
}
function escapeHtml(str){return String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function svgData(svg){return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);}
function shoeSvg(bg,shoe,accent){return svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 675"><defs><radialGradient id="g" cx="45%" cy="18%"><stop offset="0" stop-color="${accent}" stop-opacity=".42"/><stop offset="1" stop-color="${bg}"/></radialGradient><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="28" stdDeviation="20" flood-color="#000" flood-opacity=".55"/></filter></defs><rect width="900" height="675" fill="url(#g)"/><circle cx="760" cy="110" r="150" fill="${accent}" opacity=".18"/><path filter="url(#s)" d="M188 398c80-34 146-83 195-158 20-31 59-35 87-12 44 37 91 70 162 82 72 12 123 43 152 91 18 30 3 68-32 76-163 38-350 42-548 18-58-7-72-73-16-97z" fill="${shoe}"/><path d="M316 353c126 24 259 28 401 10 33-4 60 19 69 49 9 31-7 56-38 63-158 36-338 39-529 16-38-5-58-38-48-69 9-29 62-85 145-69z" fill="#0b0b0d" opacity=".92"/><path d="M360 260c42 47 101 82 177 105" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><path d="M423 286l-31 42m76-14l-29 43m77-25l-24 37" stroke="#111" stroke-opacity=".55" stroke-width="12" stroke-linecap="round"/><text x="60" y="82" fill="#fff" opacity=".82" font-size="34" font-family="Arial" font-weight="700">citystyle.app</text></svg>`)}
function beautySvg(bg,main,accent){return svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 675"><defs><radialGradient id="g" cx="48%" cy="20%"><stop offset="0" stop-color="${accent}" stop-opacity=".45"/><stop offset="1" stop-color="${bg}"/></radialGradient><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="24" stdDeviation="20" flood-color="#000" flood-opacity=".5"/></filter></defs><rect width="900" height="675" fill="url(#g)"/><circle cx="205" cy="150" r="100" fill="${main}" opacity=".18"/><circle cx="710" cy="190" r="130" fill="${accent}" opacity=".16"/><g filter="url(#s)"><rect x="260" y="155" width="380" height="390" rx="56" fill="#15151a"/><path d="M346 360c0-98 54-159 120-159s108 56 108 140c0 92-57 156-129 156-61 0-99-47-99-137z" fill="${main}"/><path d="M321 477c96 48 200 48 297 0" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><circle cx="403" cy="326" r="12" fill="#0b0b0d"/><circle cx="497" cy="326" r="12" fill="#0b0b0d"/></g><text x="60" y="82" fill="#fff" opacity=".82" font-size="34" font-family="Arial" font-weight="700">Venera Beauty</text></svg>`)}

init();
