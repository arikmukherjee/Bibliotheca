import { config } from '../config.js';
import { ExternalServiceError } from './errors.js';

const USER_AGENT = 'Bibliotheca/1.0 (personal book catalog; +https://github.com/)';

export async function fetchJson<T>(
  url: string,
  service: string,
  timeoutMs = config.metadata.timeoutMs,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? `${service} did not respond in time.`
        : `${service} could not be reached.`;
    throw new ExternalServiceError(service, message);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ExternalServiceError(service, `${service} rate limit reached. Try again shortly.`);
    }
    throw new ExternalServiceError(service, `${service} returned an error (HTTP ${response.status}).`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ExternalServiceError(service, `${service} returned an unreadable response.`);
  }
}

export async function fetchImageBuffer(
  url: string,
  maxBytes = 5 * 1024 * 1024,
  timeoutMs = 8000,
): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url, {
    headers: {
      Accept: 'image/*',
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Cover request failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Cover URL did not return an image.');
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > maxBytes) {
    throw new Error('Cover image is too large.');
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error('Cover image is too large.');
  }

  return { buffer: Buffer.from(arrayBuffer), contentType };
}
