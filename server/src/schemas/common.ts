import { z, type ZodTypeAny } from 'zod';
import { HttpError } from '../utils/errors.js';

export function parseWith<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Some fields need attention.', {
      fields: result.error.flatten().fieldErrors,
      formErrors: result.error.flatten().formErrors,
    });
  }
  return result.data;
}

export const emptyToNull = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

export const queryBoolean = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export const optionalString = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

export const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
    .nullable()
    .optional(),
);

export const optionalMoney = z.preprocess((value) => {
  if (value === '' || value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    const number = Number(value);
    return Number.isNaN(number) ? value : number;
  }
  return value;
}, z.number().min(0).max(99_999_999).nullable().optional());

export const optionalInt = (min: number, max: number) =>
  z.preprocess((value) => {
    if (value === '' || value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      const number = Number(value);
      return Number.isNaN(number) ? value : number;
    }
    return value;
  }, z.number().int().min(min).max(max).nullable().optional());

export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'Invalid identifier.');
