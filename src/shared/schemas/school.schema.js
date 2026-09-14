import { z } from 'zod';

// School level matching the French/Moroccan system: primaire (primary),
// college (middle school), lycee (high school).
export const SCHOOL_TYPES = ['primaire', 'college', 'lycee'];

// Max size of a base64 logo data-URL stored in the School row. Kept small
// because the row is hydrated into the legacy bootstrap payload on every
// login; the settings-table 2000-char limit is exactly why the logo gets
// its own column instead.
const MAX_LOGO_BASE64_LENGTH = 300 * 1024; // ~300 KB once base64-encoded

const optionalTrimmed = (max) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const SchoolProfileSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .transform((v) => v.trim()),
  school_type: z.enum(SCHOOL_TYPES).default('primaire'),
  address: optionalTrimmed(255),
  city: optionalTrimmed(100),
  phone: optionalTrimmed(50),
  email: z
    .string()
    .max(255)
    .optional()
    .nullable()
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Invalid email address',
    }),
  // base64 data-URL (data:image/png;base64,...) or empty string to clear.
  logo_url: z
    .string()
    .max(MAX_LOGO_BASE64_LENGTH)
    .refine(
      (v) => v === '' || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(v),
      { message: 'Logo must be a base64 image data-URL' },
    )
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
});

export const SchoolPublicProfileSchema = z.object({
  name: z.string(),
  school_type: z.string(),
  city: z.string().nullable(),
  logo_url: z.string().nullable(),
});
