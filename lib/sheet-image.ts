import { SHEET_IMAGE_SOURCE_MAX_BYTES, SHEET_IMAGE_TARGET_BYTES } from "@/lib/storage-policy";

const MAX_EDGE = 1600;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Este arquivo não pôde ser aberto como imagem."));
    };
    image.src = url;
  });
}

export type PreparedSheetImage = {
  blob: Blob;
  framing: {
    positionX: number;
    positionY: number;
    zoom: number;
    alt: string;
  };
};

export async function prepareSheetImage(file: File): Promise<PreparedSheetImage> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > SHEET_IMAGE_SOURCE_MAX_BYTES) throw new Error("A imagem é grande demais. Escolha uma com até 20 MB.");

  const source = await loadImage(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
  let width = Math.max(1, Math.round(source.naturalWidth * ratio));
  let height = Math.max(1, Math.round(source.naturalHeight * ratio));
  let quality = 0.9;
  let prepared: Blob | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Este navegador não conseguiu preparar a imagem.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    prepared = await canvasBlob(canvas, "image/webp", quality)
      ?? await canvasBlob(canvas, file.type === "image/png" ? "image/png" : "image/jpeg", quality);
    if (!prepared) throw new Error("Este navegador não conseguiu preparar a imagem.");
    if (prepared.size <= SHEET_IMAGE_TARGET_BYTES) break;
    width = Math.max(480, Math.round(width * 0.78));
    height = Math.max(480, Math.round(height * 0.78));
    quality = Math.max(0.68, quality - 0.06);
  }

  if (!prepared || prepared.size > SHEET_IMAGE_TARGET_BYTES) {
    throw new Error("Não foi possível deixar esta imagem leve o bastante sem perder demais. Tente outra.");
  }

  return {
    blob: prepared,
    framing: {
      positionX: 50,
      positionY: 50,
      zoom: 1,
      alt: file.name.replace(/\.[^.]+$/, "").slice(0, 240),
    },
  };
}
