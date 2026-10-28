import { z } from 'zod';
import { quicklinkFields } from './quicklinks';

export const quicklinkSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(100), link: z.string().trim().min(1).max(4096),
  icon: z.enum(['Link', 'Globe', 'Search', 'Folder']).default('Link'),
  applicationPath: z.string().max(2000).default(''),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  pinned: z.boolean().default(false), hidden: z.boolean().default(false),
}).superRefine((value, context) => {
  try { quicklinkFields(value.link); } catch (error) { context.addIssue({ code: 'custom', path: ['link'], message: (error as Error).message }); }
});
export type Quicklink = z.infer<typeof quicklinkSchema>;
