import { z } from 'zod';

const FORBIDDEN_FIELD_NAMES = ['__proto__', 'constructor', 'prototype', '_hp'];

const widgetFieldSchema = z.object({
   name: z.string()
      .regex(/^[a-zA-Z0-9_]{1,64}$/)
      .refine((fieldName) => !FORBIDDEN_FIELD_NAMES.includes(fieldName), { message: 'Forbidden field name' }),
   type: z.enum(['text', 'email', 'textarea', 'checkbox']),
   label: z.string().min(1).max(100),
   required: z.boolean().default(false),
   maxLength: z.number().int().min(1).max(1000).optional(),
}).strict();

export const createWidgetSchema = z.object({
   type: z.enum(['signup', 'cta', 'popover']),
   title: z.string().min(1).max(200),
   description: z.string().max(1000).optional().default(''),
   fields: z.array(widgetFieldSchema).max(20).default([]),
   button_text: z.string().min(1).max(50).default('Submit'),
   display_options: z.object({}).passthrough().default({}),
}).strict();

export const patchWidgetSchema = z.object({
  type: z.enum(['signup', 'cta', 'popover']).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  fields: z.array(widgetFieldSchema).max(20).optional(),
  button_text: z.string().min(1).max(50).optional(),
  display_options: z.object({}).passthrough().optional(),
}).strict().refine((patchValues) => Object.keys(patchValues).length > 0, { message: 'Empty patch' });

export const widgetIdParamSchema = z.string().uuid();
export const listCursorSchema = z.string().uuid().nullable();
