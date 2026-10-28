import { defineRpcContract, type NewThreadRequest } from '@get-bb/plugin-sdk';
import { z } from 'zod';
const id = z.string().min(1).max(200);
export const commandSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(100), prompt: z.string().trim().min(1).max(12000), revision: z.number().int().nonnegative() });
export const chatSchema = z.object({ id: z.string().uuid(), title: z.string(), threadId: z.string().nullable(), environmentId: z.string().optional(), error: z.string().optional(), fingerprint: z.string(), createdAt: z.number().default(0), model: z.string().default(''), pinned: z.boolean().default(false), archived: z.boolean().default(false), unavailable: z.boolean().optional() });
export type SavedCommand = z.infer<typeof commandSchema>;
export type Chat = z.infer<typeof chatSchema>;
// BB remains authoritative for provider, environment, permission and attachment validation.
export const requestSchema = z.object({
  projectId: id, providerId: id, model: id, reasoningLevel: z.string().max(100),
  permissionMode: z.enum(['accept-edits', 'auto', 'full']), serviceTier: z.string().max(100).optional(),
  sessionOptions: z.record(z.string(), z.json()).optional(),
  executionInputSources: z.record(z.string(), z.enum(['explicit', 'client-preference'])),
  environment: z.object({ type: z.enum(['reuse', 'host', 'project-default', 'provider']) }).passthrough(),
  input: z.array(z.object({ type: z.enum(['text', 'image', 'localImage', 'localFile']) }).passthrough()).min(1).max(100),
  sendAt: z.number().int().nonnegative().optional(),
}).refine(value => JSON.stringify(value).length <= 1000000, 'Message is too large') as unknown as z.ZodType<NewThreadRequest>;
export const appSchema = z.object({ id: z.string(), title: z.string(), path: z.string() });
export const fileSchema = z.object({ id: z.string().uuid(), title: z.string(), path: z.string(), subtitle: z.string(), directory: z.boolean(), size: z.number(), modifiedAt: z.number(), createdAt: z.number() });
export const calculationSchema = z.object({ input: z.string(), result: z.string(), kind: z.enum(['math', 'unit']), inputLabel: z.string(), resultLabel: z.string() });
export const hostContract = defineRpcContract({
  apps: { input: z.null(), output: z.array(appSchema) },
  appIcon: { input: z.object({ path: z.string().max(2000) }), output: z.string().max(140000).nullable() },
  openApp: { input: z.object({ path: z.string().max(2000) }), output: z.object({ opened: z.boolean() }) },
  files: { input: z.object({ query: z.string().max(200) }), output: z.object({ files: z.array(fileSchema).max(50), source: z.string(), indexing: z.boolean(), indexedEntries: z.number(), indexLimited: z.boolean() }) },
  openFile: { input: z.object({ id: z.string().uuid(), reveal: z.boolean() }), output: z.object({ opened: z.boolean() }) },
});
export const contract = defineRpcContract({
  state: { input: z.null(), output: z.object({ commands: z.array(commandSchema), chats: z.array(chatSchema), personalProjectId: z.string().optional() }) },
  saveCommand: { input: commandSchema, output: commandSchema },
  start: { input: z.object({ id: z.string().uuid(), request: requestSchema }), output: chatSchema },
  chatAction: { input: z.object({ id: z.string().uuid(), action: z.enum(['pin', 'unpin', 'archive', 'unarchive', 'rename']), title: z.string().trim().min(1).max(100).optional() }).refine(input => input.action !== 'rename' || Boolean(input.title), 'Enter a chat title'), output: chatSchema },
  apps: hostContract.apps,
  appIcon: hostContract.appIcon,
  openApp: hostContract.openApp,
  files: hostContract.files,
  openFile: hostContract.openFile,
  calculate: { input: z.object({ expression: z.string().max(240) }), output: calculationSchema.nullable() },
});
