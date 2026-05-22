// assets/js/storage.js

async function compressImageForUpload(file, options = {}) {
  const maxWidth = Number(options.maxWidth || 1600);
  const maxHeight = Number(options.maxHeight || 1600);
  const quality = Number(options.quality || 0.82);

  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  // Very small images are already fine; do not waste time or risk quality loss.
  if (file.size <= 350 * 1024) return file;

  try {
    const imageUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = imageUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) {
      URL.revokeObjectURL(imageUrl);
      return file;
    }

    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    URL.revokeObjectURL(imageUrl);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;

    const safeName = String(file.name || "image").replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], safeName, { type: "image/webp", lastModified: Date.now() });
  } catch (err) {
    console.warn("Image compression skipped:", err);
    return file;
  }
}

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

  const maxSize = 8 * 1024 * 1024;
  if (file.size > maxSize) {
    window.App.showMessage("Slika je prevelika. Maksimalno 8 MB.", "error");
    return null;
  }

  const uploadFile = await compressImageForUpload(file, {
    maxWidth: type === "logo" ? 900 : 1600,
    maxHeight: type === "logo" ? 900 : 1600,
    quality: type === "logo" ? 0.9 : 0.82
  });

  const fileExt = (uploadFile.name.split(".").pop() || "webp").toLowerCase();
  const safeType = String(type || "home").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const fileName = `${salonId}/${safeType}_${Date.now()}.${fileExt}`;

  const { error } = await window.db.storage
    .from("salon-assets")
    .upload(fileName, uploadFile, { cacheControl: "3600", upsert: true, contentType: uploadFile.type });

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

window.StorageHelper = { uploadImage, deleteImage, compressImageForUpload };
