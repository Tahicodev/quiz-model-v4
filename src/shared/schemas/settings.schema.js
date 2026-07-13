import { z } from 'zod';
import { SETTINGS_VISIBILITY } from '../constants.js';

const visibilityValues = Object.values(SETTINGS_VISIBILITY);

export const SettingUpdateSchema = z.object({
  key:        z.string().min(1).max(100),
  value:      z.string().max(2000),
  visibility: z.enum(visibilityValues).optional(),
});

export const SettingsBulkUpdateSchema = z.object({
  settings: z.array(SettingUpdateSchema).min(1),
});

export const SettingsFilterSchema = z.object({
  visibility: z.enum(visibilityValues).optional(),
  search:     z.string().optional(),
});
