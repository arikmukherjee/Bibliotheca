import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { storageDirs } from '../../config.js';

const OCR_TIMEOUT_MS = 90_000;

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      cachePath: storageDirs.tesseract,
      logger: () => undefined,
      errorHandler: () => undefined,
    }).catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function preprocess(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .grayscale()
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OCR timed out.')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface OcrResult {
  text: string;
  confidence: number | null;
  available: boolean;
  warning: string | null;
}

export async function recognizeText(buffer: Buffer): Promise<OcrResult> {
  const task = queue.then(async () => {
    const image = await preprocess(buffer);
    const worker = await getWorker();
    const result = await worker.recognize(image, {}, { text: true });
    const confidence = (result.data as { confidence?: number }).confidence;
    return {
      text: result.data.text ?? '',
      confidence: typeof confidence === 'number' ? Math.round(confidence) : null,
      available: true,
      warning: null,
    } satisfies OcrResult;
  });

  queue = task.catch(() => undefined);

  try {
    return await withTimeout(task, OCR_TIMEOUT_MS);
  } catch (error) {
    return {
      text: '',
      confidence: null,
      available: false,
      warning: `Text recognition is unavailable: ${
        error instanceof Error ? error.message : 'unknown OCR error'
      }`,
    };
  }
}

export async function shutdownOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // Ignore shutdown errors.
  } finally {
    workerPromise = null;
  }
}
