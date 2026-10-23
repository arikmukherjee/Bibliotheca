import { randomInt } from 'node:crypto';
import { ulid } from 'ulid';

export function newId(): string {
  return ulid();
}

const ITEM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateItemCode(): string {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += ITEM_CODE_ALPHABET[randomInt(0, ITEM_CODE_ALPHABET.length)];
  }
  return `BIB-${code}`;
}
