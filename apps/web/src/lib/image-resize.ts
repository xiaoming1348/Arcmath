/**
 * Client-side image resize helper, shared between the single-step
 * handwriting OCR uploader (Sprint 1) and the multi-step batch uploader
 * (Sprint 2).
 *
 * Goal: shrink phone-photo originals (typically 3000-4000px) down to
 * a ~1280px long edge before sending to the vision API.
 *   - Vision API token cost scales with resolution; OCR accuracy
 *     doesn't improve past ~1280px for handwriting.
 *   - Smaller payloads keep tRPC request bodies sane (a 5MB jpeg
 *     base64-encodes to ~7MB plain text).
 *
 * The function lives in lib/ because it has no JSX — pure browser
 * Canvas API. Server bundles must not import it (window/document
 * undefined), so callers should keep it inside "use client"
 * components only.
 */

export async function resizeImageDataUrl(
  file: File,
  maxLongEdge = 1280
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("resizeImageDataUrl is browser-only");
  }

  // Step 1: load the image bitmap. createImageBitmap is the fast
  // path on modern Chromium/Firefox; it also honours EXIF rotation
  // on most browsers when given `imageOrientation: "from-image"`.
  // Older Safari lacks the orientation option, so fall back to a
  // plain <img> load there.
  let bitmap: ImageBitmap | HTMLImageElement;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image"
      });
    } catch {
      bitmap = await loadViaImg(file);
    }
  } else {
    bitmap = await loadViaImg(file);
  }

  // Step 2: compute target dimensions, preserving aspect ratio.
  const { width: w, height: h } = bitmap as { width: number; height: number };
  const scale = Math.min(1, maxLongEdge / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  // Step 3: draw + encode. JPEG q=0.85 is the empirical sweet spot
  // for handwriting OCR — text edges stay sharp while payload drops
  // ~6x compared to a PNG.
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // JPEG has no alpha channel. Without an explicit background, transparent
  // PNG/WebP uploads can be composited as black by some browsers, making
  // dark handwriting unreadable after conversion.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);

  // Free GPU memory on mobile.
  if (typeof (bitmap as ImageBitmap).close === "function") {
    (bitmap as ImageBitmap).close();
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Browser could not encode OCR image as JPEG");
  }
  return dataUrl;
}

function loadViaImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
