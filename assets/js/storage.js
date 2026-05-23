async function uploadAsset(file, pathPrefix='uploads'){
  if(!file) throw new Error('Nema fajla');
  if(!window.db) throw new Error('Supabase nije učitan');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const name=`${pathPrefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
  const {error}=await db.storage.from('salon-assets').upload(name,file,{cacheControl:'3600',upsert:false});
  if(error) throw error;
  const {data}=db.storage.from('salon-assets').getPublicUrl(name);
  return data.publicUrl;
}
window.uploadAsset = uploadAsset;
