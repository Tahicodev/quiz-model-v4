/**
 * src/shared/schemas/examTemplate.schema.js
 *
 * Wire + storage contract for a declarative exam-document TEMPLATE.
 *
 * A template is the "model" layer that sits between the content (the normalized
 * document model built by ExamDocumentService) and the layout engine (which
 * measures, paginates and draws). It says nothing about the questions; it says
 * everything about how the sheet looks: page geometry, theme (fonts/sizes/
 * colours/density), which header and footer variant to draw, and how a question
 * is styled.
 *
 * Everything is optional so a caller can send a partial override ("just make it
 * two columns") and the engine fills the rest from the built-in defaults. The
 * bounds are deliberately tight: a template must never be able to ask for a
 * sub-9pt font or a negative margin, because that would produce unreadable or
 * unprintable paper.
 */

import { z } from 'zod';

export const EXAM_TEMPLATE_SCHEMA_VERSION = 1;

/** Absolute floors the "Tenir en N pages" optimiser and every template obey. */
export const TEMPLATE_LIMITS = Object.freeze({
  minFont: 9,
  maxFont: 16,
  minMargin: 24,
  maxMargin: 96,
  minDensity: 0.7,
  maxDensity: 1.3,
  maxAnswerLines: 12,
});

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'must be a #RRGGBB colour');

const ThemeSchema = z
  .object({
    fonts: z
      .object({
        regular: z.string().min(1).max(60),
        bold: z.string().min(1).max(60),
        italic: z.string().min(1).max(60),
        mono: z.string().min(1).max(60),
        head: z.string().min(1).max(60),
        headBold: z.string().min(1).max(60),
      })
      .partial()
      .optional(),
    sizes: z
      .object({
        body: z.number().min(TEMPLATE_LIMITS.minFont).max(TEMPLATE_LIMITS.maxFont),
        small: z.number().min(TEMPLATE_LIMITS.minFont).max(TEMPLATE_LIMITS.maxFont),
        tiny: z.number().min(TEMPLATE_LIMITS.minFont).max(TEMPLATE_LIMITS.maxFont),
        title: z.number().min(11).max(22),
      })
      .partial()
      .optional(),
    colors: z
      .object({
        accent: hexColor,
        muted: hexColor,
        hairline: hexColor,
        fieldBg: hexColor,
      })
      .partial()
      .optional(),
    density: z.number().min(TEMPLATE_LIMITS.minDensity).max(TEMPLATE_LIMITS.maxDensity),
  })
  .partial();

const PageSchema = z
  .object({
    size: z.enum(['A4', 'Letter']).default('A4'),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    margin: z
      .object({
        top: z.number().min(TEMPLATE_LIMITS.minMargin).max(TEMPLATE_LIMITS.maxMargin),
        right: z.number().min(TEMPLATE_LIMITS.minMargin).max(TEMPLATE_LIMITS.maxMargin),
        bottom: z.number().min(TEMPLATE_LIMITS.minMargin).max(TEMPLATE_LIMITS.maxMargin),
        left: z.number().min(TEMPLATE_LIMITS.minMargin).max(TEMPLATE_LIMITS.maxMargin),
      })
      .partial()
      .optional(),
    columns: z.union([z.literal(1), z.literal(2)]),
    gutter: z.number().min(0).max(60),
    rule: z.object({ between: z.boolean() }).partial().optional(),
  })
  .partial();

const HeaderSchema = z
  .object({
    variant: z.enum(['bandeau', 'classique', 'minimal', 'officiel']),
    anonymity: z.boolean(),
    fullOnFirstPage: z.boolean(),
    compactOnFollow: z.boolean(),
  })
  .partial();

const FooterSchema = z
  .object({
    variant: z.enum(['number', 'number+encouragement', 'title+number', 'turn-page']),
    total: z.boolean(),
    encouragement: z.string().max(120),
  })
  .partial();

const QuestionSchema = z
  .object({
    pointBadge: z.boolean(),
    vectorBoxes: z.boolean(),
    separators: z.enum(['rule', 'none']),
    answerSpace: z
      .object({
        lines: z.number().int().min(0).max(TEMPLATE_LIMITS.maxAnswerLines),
        lineHeight: z.number().min(8).max(30),
      })
      .partial()
      .optional(),
    keepTogether: z.enum(['question', 'block']),
  })
  .partial();

/** The full public template an author (or the editor UI) may send. */
export const ExamTemplateSchema = z.object({
  schemaVersion: z.number().int().min(1).max(EXAM_TEMPLATE_SCHEMA_VERSION).default(EXAM_TEMPLATE_SCHEMA_VERSION),
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  page: PageSchema.optional(),
  theme: ThemeSchema.optional(),
  header: HeaderSchema.optional(),
  footer: FooterSchema.optional(),
  question: QuestionSchema.optional(),
});

/** A partial override: same shape but every key optional, no id/name required. */
export const ExamTemplateOverrideSchema = ExamTemplateSchema.partial().omit({ id: true, name: true });

/** Validate a full template, throwing a readable error when out of bounds. */
export function parseExamTemplate(input) {
  return ExamTemplateSchema.parse(input);
}

export function safeParseExamTemplate(input) {
  return ExamTemplateSchema.safeParse(input);
}

export function safeParseTemplateOverride(input) {
  return ExamTemplateOverrideSchema.safeParse(input);
}
