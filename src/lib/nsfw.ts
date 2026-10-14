// In-browser 18+ image check (nsfwjs + TensorFlow.js). Runs on the student's device, no AI credits.
// Libraries are loaded lazily so they never run during server rendering.
type Model = { classify: (img: HTMLImageElement) => Promise<{ className: string; probability: number }[]> };
let modelPromise: Promise<Model> | null = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await import("@tensorflow/tfjs");
      const nsfw = await import("nsfwjs");
      return (await nsfw.load()) as unknown as Model;
    })();
    modelPromise.catch(() => (modelPromise = null));
  }
  return modelPromise;
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/** Throws if the image looks like 18+ content. Non-images pass through. */
export async function checkImageSafe(file: File | null | undefined) {
  if (!file || !file.type.startsWith("image/") || typeof window === "undefined") return;
  const model = await loadModel();
  const img = await fileToImage(file);
  try {
    const preds = await model.classify(img);
    const p = Object.fromEntries(preds.map((x) => [x.className, x.probability]));
    const explicit = (p.Porn ?? 0) + (p.Hentai ?? 0);
    if (explicit > 0.5 || (p.Sexy ?? 0) > 0.75) {
      throw new Error("This photo looks like 18+ content and can't be uploaded.");
    }
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
