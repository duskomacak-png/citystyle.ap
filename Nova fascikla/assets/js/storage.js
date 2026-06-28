// assets/js/storage.js

function storageImageExtensionFromMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "webp";
}

function storageIsProductImage(type) {
  const t = String(type || "").toLowerCase();
  return t === "product" || t === "product_extra" || t.includes("product");
}

function storageLoadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Ne mogu da učitam sliku."));
    };
    img.src = url;
  });
}

function storageCanvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function normalizeProductImageToSquare(file, options = {}) {
  const size = Number(options.size || 1200);
  const outputType = options.type || "image/webp";
  const quality = Number(options.quality || 0.82);
  const img = await storageLoadImageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Bela podloga čuva providne PNG slike i daje čist 1:1 okvir u oglasu.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(size / srcW, size / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const dx = Math.round((size - drawW) / 2);
  const dy = Math.round((size - drawH) / 2);
  ctx.drawImage(img, dx, dy, drawW, drawH);

  const blob = await storageCanvasToBlob(canvas, outputType, quality);
  if (!blob) throw new Error("Ne mogu da zipujem sliku.");
  const base = String(file.name || "slika").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "slika";
  return new File([blob], `${base}_1x1.webp`, { type: outputType, lastModified: Date.now() });
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

  const isImage = String(file.type || "").startsWith("image/");
  if (!isImage) {
    window.App.showMessage("Dozvoljene su samo slike.", "error");
    return null;
  }

  const maxSize = 12 * 1024 * 1024;
  if (file.size > maxSize) {
    window.App.showMessage("Slika je prevelika. Maksimalno 12 MB.", "error");
    return null;
  }

  let uploadFile = file;
  const safeType = String(type || "home").toLowerCase().replace(/[^a-z0-9_-]/g, "");

  // Slike oglasa se automatski pretvaraju u lagani 1:1 WEBP.
  // Time bilo koji odnos stranica lepo staje u okvir oglasa i brže se učitava.
  if (storageIsProductImage(safeType)) {
    try {
      uploadFile = await normalizeProductImageToSquare(file, { size: 1200, type: "image/webp", quality: 0.82 });
    } catch (err) {
      console.warn("Automatska obrada slike nije uspela, uploadujem original.", err);
      uploadFile = file;
    }
  }

  const fileExt = storageIsProductImage(safeType) ? "webp" : storageImageExtensionFromMime(uploadFile.type) || (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
  const fileName = `${salonId}/${safeType}_${Date.now()}.${fileExt}`;

  const { error } = await window.db.storage
    .from("salon-assets")
    .upload(fileName, uploadFile, { cacheControl: "31536000", upsert: true, contentType: uploadFile.type || "image/webp" });

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

window.StorageHelper = { uploadImage, deleteImage, normalizeProductImageToSquare };
