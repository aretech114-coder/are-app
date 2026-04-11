/**
 * Client-side file compression utility.
 * Compresses images and PDFs before upload to reduce storage usage.
 *
 * - Images (JPEG/PNG/WEBP): resized to max 1500px wide, re-encoded as JPEG @ quality 0.70
 * - PDFs: left as-is if < threshold (pdf-lib image extraction is unreliable for scanned PDFs)
 *   → future improvement: server-side Ghostscript compression
 * - Files < MIN_SIZE_BYTES are returned unchanged.
 * - Non-image/non-PDF files are returned unchanged.
 */

const MAX_WIDTH = 1500;
const JPEG_QUALITY = 0.70;
const MIN_SIZE_BYTES = 500 * 1024; // 500 KB

const COMPRESSIBLE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
];

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

/**
 * Compress a file if it is a compressible image above the size threshold.
 */
export async function compressFile(file: File): Promise<CompressionResult> {
  const originalSize = file.size;

  // Skip small files
  if (originalSize < MIN_SIZE_BYTES) {
    return { file, originalSize, compressedSize: originalSize, wasCompressed: false };
  }

  // Compress images
  if (COMPRESSIBLE_IMAGE_TYPES.includes(file.type)) {
    const compressed = await compressImage(file);
    return {
      file: compressed,
      originalSize,
      compressedSize: compressed.size,
      wasCompressed: compressed.size < originalSize,
    };
  }

  // PDFs: attempt basic re-save with pdf-lib (strips unused objects)
  if (file.type === "application/pdf") {
    try {
      const compressed = await compressPDF(file);
      return {
        file: compressed,
        originalSize,
        compressedSize: compressed.size,
        wasCompressed: compressed.size < originalSize,
      };
    } catch {
      // If pdf-lib fails (encrypted PDF, etc.), return original
      return { file, originalSize, compressedSize: originalSize, wasCompressed: false };
    }
  }

  // Non-compressible type
  return { file, originalSize, compressedSize: originalSize, wasCompressed: false };
}

/**
 * Compress an image using Canvas API.
 * Resizes to max MAX_WIDTH, re-encodes as JPEG.
 */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // Compression didn't help — return original
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger l'image pour compression"));
    };

    img.src = url;
  });
}

/**
 * Re-save a PDF with pdf-lib to strip unused objects and reduce size.
 * This won't recompress embedded images but can still save 5-20%.
 */
async function compressPDF(file: File): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const savedBytes = await pdfDoc.save();
  const blob = new Blob([savedBytes.buffer as ArrayBuffer], { type: "application/pdf" });

  if (blob.size >= file.size) {
    return file; // No gain
  }

  return new File([blob], file.name, { type: "application/pdf" });
}

/**
 * Format bytes to human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
