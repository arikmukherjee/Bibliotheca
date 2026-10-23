import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';
import sharp from 'sharp';

interface DecodeImage {
  data: Buffer;
  width: number;
  height: number;
}

async function toLuminance(
  buffer: Buffer,
  rotation: number,
  enhance: boolean,
): Promise<DecodeImage> {
  let pipeline = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
  if (rotation !== 0) pipeline = pipeline.rotate(rotation);
  pipeline = pipeline
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale();
  if (enhance) pipeline = pipeline.normalise().sharpen();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function tryDecode(image: DecodeImage): string[] {
  const luminances = new Uint8ClampedArray(image.data);
  const source = new RGBLuminanceSource(luminances, image.width, image.height);
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const binarizers = [
    () => new BinaryBitmap(new HybridBinarizer(source)),
    () => new BinaryBitmap(new GlobalHistogramBinarizer(source)),
  ];

  const values: string[] = [];
  for (const createBitmap of binarizers) {
    try {
      const reader = new MultiFormatReader();
      const result = reader.decode(createBitmap(), hints as Map<DecodeHintType, unknown>);
      const text = result.getText();
      if (text) values.push(text);
    } catch {
      // Not found in this binarizer; try the next variant.
    }
  }
  return values;
}

export async function decodeBarcodes(buffer: Buffer): Promise<{
  values: string[];
  attemptedRotations: number[];
}> {
  const values = new Set<string>();
  const attemptedRotations: number[] = [];

  for (const rotation of [0, 90, 270, 180]) {
    for (const enhance of [false, true]) {
      try {
        const image = await toLuminance(buffer, rotation, enhance);
        const decoded = tryDecode(image);
        if (decoded.length > 0) {
          decoded.forEach((value) => values.add(value.trim()));
        }
        if (rotation !== 0) attemptedRotations.push(rotation);
        if (values.size > 0) {
          return { values: [...values], attemptedRotations: [...new Set(attemptedRotations)] };
        }
      } catch (error) {
        console.warn(
          `Barcode decode variant failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return { values: [...values], attemptedRotations: [...new Set(attemptedRotations)] };
}
