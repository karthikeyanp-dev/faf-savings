/**
 * Compress a user-uploaded QR (or any small) image to a base64 JPEG
 * data URL of at most `maxSize` x `maxSize` pixels.
 *
 * QR codes are simple high-contrast images, so 300x300 at quality 0.8
 * is more than sharp enough for any scanner and keeps the resulting
 * payload well under the Firestore 1 MiB doc limit. This avoids
 * storing multi-megabyte base64 PNGs in `config/app`.
 */
export async function compressQRImage(
  file: File,
  maxSize = 300,
  quality = 0.8,
): Promise<string> {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  // Preserve aspect ratio, scaled down so the longest edge <= maxSize.
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}
