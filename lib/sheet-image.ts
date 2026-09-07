import type { FateCharacter } from "@/lib/fate";

const MAX_SOURCE_BYTES = 20_000_000;
const MAX_DATA_URL_LENGTH = 1_250_000;
const MAX_EDGE = 1600;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
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

export async function prepareSheetImage(file: File): Promise<NonNullable<FateCharacter["optional"]["image"]>> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("A imagem é grande demais. Escolha uma com até 20 MB.");

  const source = await loadImage(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
  let width = Math.max(1, Math.round(source.naturalWidth * ratio));
  let height = Math.max(1, Math.round(source.naturalHeight * ratio));
  let quality = 0.9;
  let dataUrl = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Este navegador não conseguiu preparar a imagem.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    const blob = await canvasBlob(canvas, "image/webp", quality)
      ?? await canvasBlob(canvas, file.type === "image/png" ? "image/png" : "image/jpeg", quality);
    if (!blob) throw new Error("Este navegador não conseguiu preparar a imagem.");
    dataUrl = await blobDataUrl(blob);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) break;
    width = Math.max(480, Math.round(width * 0.78));
    height = Math.max(480, Math.round(height * 0.78));
    quality = Math.max(0.68, quality - 0.06);
  }

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Não foi possível deixar esta imagem leve o bastante sem perder demais. Tente outra.");
  }

  return {
    dataUrl,
    positionX: 50,
    positionY: 50,
    zoom: 1,
    alt: file.name.replace(/\.[^.]+$/, "").slice(0, 240),
  };
}
