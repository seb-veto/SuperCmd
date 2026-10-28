import { z } from 'zod';
import { defineRpcContract } from '@get-bb/plugin-sdk';

export const noteInputSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(), content: z.string().max(100000),
  theme: z.enum(['default', 'rose', 'amber', 'emerald', 'blue', 'violet']).default('default'), pinned: z.boolean().default(false),
});
export const noteSchema = noteInputSchema.extend({ title: z.string(), updatedAt: z.number(), deletedAt: z.number().nullable() });
export const noteSummarySchema = noteSchema.omit({ content: true });
export type NoteInput = z.infer<typeof noteInputSchema>;
export type Note = z.infer<typeof noteSchema>;
export type NoteSummary = z.infer<typeof noteSummarySchema>;
export const noteContract = defineRpcContract({
  noteList: { input: z.object({ query: z.string().max(200).default(''), deleted: z.boolean().default(false), offset: z.number().int().min(0).max(1000000).default(0) }), output: z.object({ notes: z.array(noteSummarySchema), more: z.boolean() }) },
  noteGet: { input: z.object({ id: z.string().uuid() }), output: noteSchema },
  noteSave: { input: noteInputSchema, output: noteSchema },
  noteAction: { input: z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative(), action: z.enum(['pin', 'unpin', 'delete', 'restore']) }), output: noteSchema },
});
