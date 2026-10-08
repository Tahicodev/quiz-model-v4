import { z } from 'zod';

// Kids Championship — the kid-friendly tournament over Kids Games.
// Completely separate from the collège/lycée Tournament schemas: no rounds,
// brackets or multipliers — just a name, an emoji and a list of challenges.

export const KidsChampionshipCreateSchema = z.object({
  name:        z.string().min(1).max(100),
  emoji:       z.string().min(1).max(8).default('🏆'),
  description: z.string().max(500).optional().nullable(),
  game_ids:    z.array(z.string().min(1)).min(1).max(8),
});

export const KidsChampionshipUpdateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  emoji:       z.string().min(1).max(8).optional(),
  description: z.string().max(500).optional().nullable(),
  game_ids:    z.array(z.string().min(1)).min(1).max(8).optional(),
  status:      z.enum(['active', 'finished']).optional(),
});

export const KidsChampionshipFilterSchema = z.object({
  status: z.enum(['active', 'finished']).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
