const BUILD = 'fresh-salons-shoes-v1';
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
function esc(v){return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function qs(name){return new URL(location.href).searchParams.get(name);}
function toast(msg){let n=document.createElement('div');n.textContent=msg;n.style.cssText='position:fixed;left:12px;right:12px;bottom:18px;z-index:20000;background:#111827;color:#fff;padding:12px 14px;border-radius:14px;text-align:center;box-shadow:0 12px 30px #0008';document.body.appendChild(n);setTimeout(()=>n.remove(),2400)}
function normalizePhone(raw){let s=String(raw||'').replace(/[^0-9+]/g,''); if(!s)return ''; if(s.startsWith('+')) return s.replace('+',''); if(s.startsWith('00')) return s.slice(2); if(s.startsWith('0')) return '381'+s.slice(1); return s;}
function formatPrice(p,currency='RSD'){if(p===null||p===undefined||p==='')return 'Cena na upit'; return `${String(p).replace('.', ',')} ${currency||'RSD'}`;}
function profileType(profile, productsCount=0){const raw = `${profile?.profile_type||''} ${profile?.business_type||''} ${profile?.type||''} ${profile?.category||''} ${profile?.salon_type||''}`.toLowerCase(); if(raw.match(/shop|prodav|patik|katalog|store|shoes|sneaker/)) return 'shop'; if(raw.match(/salon|beauty|barber|frizer|kozmet/)) return 'salon'; if(productsCount>0) return 'shop'; return 'salon';}
async function getProfile(slug){ if(!window.db) throw new Error('Supabase nije učitan'); const {data,error}=await db.from('salons').select('*').eq('slug',slug).neq('status','deleted').maybeSingle(); if(error) throw error; return data; }
async function getSettings(salon_id){ try{const {data}=await db.from('salon_settings').select('*').eq('salon_id',salon_id).maybeSingle();return data||{};}catch(e){return {}} }
function profilePhone(profile, settings={}){return settings.phone || settings.whatsapp || profile.phone || profile.mobile || profile.whatsapp || ''}
function profileName(p){return p?.salon_name || p?.name || p?.business_name || 'CityStyle profil'}
function profileLogo(p,s={}){return s.logo_url || p.logo_url || ''}
function profileText(p,s={}){return s.welcome_text || p.description || p.about || ''}
function directLink(slug, code){return `${location.origin}${location.pathname}?salon=${encodeURIComponent(slug)}&product=${encodeURIComponent(code)}`}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Kopirano');}catch(e){prompt('Kopiraj link:',text)}}
window.City = {esc,qs,toast,normalizePhone,formatPrice,profileType,getProfile,getSettings,profilePhone,profileName,profileLogo,profileText,directLink,copyText,BUILD};
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v='+BUILD).catch(()=>{}));}
