// src/services/timetableImages.js
// ─────────────────────────────────────────────────────────────────────────────
// Turns a timetable the head teacher picks — a photo, a screenshot or a PDF —
// into the few JPEG images the AI reads (api/_lib/aiTools.js,
// task=timetable-extract). Everything happens in the browser and in memory:
// the file is never uploaded anywhere or kept.
//
// Images are scaled so the long side is at most MAX_SIDE pixels: enough for
// the model to read small print, small enough to stay well inside the
// provider's per-image limit on a school's mobile data.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PAGES = 3; // the most images the vision model takes in one request
const MAX_SIDE = 2000;
const QUALITY = 0.85;

export const TIMETABLE_FILE_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

function drawScaled(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // a transparent PNG would otherwise turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

async function imageToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return drawScaled(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

async function pdfToDataUrls(file) {
  // Loaded only when someone actually picks a PDF — it is a large library.
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const out = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n += 1) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, background: "#ffffff" }).promise;
      out.push(canvas.toDataURL("image/jpeg", QUALITY));
      page.cleanup();
    }
    return { images: out, pages: pdf.numPages };
  } finally {
    pdf.destroy();
  }
}

async function fileToImages(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return pdfToDataUrls(file);
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) return { images: [await imageToDataUrl(file)], pages: 1 };
  throw new Error(`"${file.name}" isn't a photo (JPG or PNG) or a PDF.`);
}

/**
 * One or more files — a PDF, or several photos, one per class say — as JPEG
 * data URLs, at most MAX_PAGES in all.
 * @returns {Promise<{ images: string[], pages: number }>} `pages` counts every
 *   page picked, so the caller can say when some were left out.
 */
export async function timetableFilesToImages(files) {
  const list = [...(files || [])];
  if (!list.length) throw new Error("Choose a file.");
  const images = [];
  let pages = 0;
  for (const file of list) {
    const r = await fileToImages(file);
    pages += r.pages;
    images.push(...r.images);
  }
  return { images: images.slice(0, MAX_PAGES), pages };
}
