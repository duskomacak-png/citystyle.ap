// assets/js/storage.js

async function uploadImage(file, salonId, type = "home") {
  if (!file) {
    window.App.showMessage("Nije izabrana slika.", "error");
    return null;
  }
  if (!salonId) {
    window.App.showMessage("Nedostaje salon ID.", "error");
    return null;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    window.App.showMessage("Dozvoljene su samo JPG, PNG ili WEBP slike.", "error");
    return null;
  }

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    window.App.showMessage("Slika je prevelika. Maksimalno 5 MB.", "error");
    return null;
  }

  const fileExt = file.name.split(".").pop().toLowerCase();
  const safeType = String(type || "home").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const fileName = `${salonId}/${safeType}_${Date.now()}.${fileExt}`;

  const { error } = await window.db.storage
    .from("salon-assets")
    .upload(fileName, file, { cacheControl: "3600", upsert: true });

  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri uploadu slike.", "error");
    return null;
  }

  const { data } = window.db.storage.from("salon-assets").getPublicUrl(fileName);
  return data.publicUrl;
}

async function deleteImage(imageUrl) {
  if (!imageUrl) return false;
  const marker = "/storage/v1/object/public/salon-assets/";
  const index = imageUrl.indexOf(marker);
  if (index === -1) return false;
  const path = imageUrl.slice(index + marker.length);

  const { error } = await window.db.storage.from("salon-assets").remove([path]);
  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri brisanju slike.", "error");
    return false;
  }
  return true;
}

window.StorageHelper = { uploadImage, deleteImage };
