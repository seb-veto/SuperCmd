import { createHash } from 'node:crypto';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { quicklinkSchema, type Quicklink } from './quicklink-schema';
import { noteHandlers } from './note-server';
import { resolveQuicklink } from './quicklinks';
import { calculate } from './calculator';
import { contract, hostContract, commandSchema, chatSchema, type Chat, type SavedCommand } from './contract';
export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  db.prepare('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)').run();
  db.prepare('CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, data TEXT NOT NULL)').run();
  db.prepare('CREATE TABLE IF NOT EXISTS quicklinks (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)').run();
  const quicklinks = () => (db.prepare('SELECT data FROM quicklinks ORDER BY rowid DESC').all() as { data: string }[]).map(row => quicklinkSchema.parse(JSON.parse(row.data)));
  function currentQuicklink(id: string, revision: number) {
    const saved = quicklinks().find(link => link.id === id);
    if (!saved || saved.revision !== revision) throw new Error('Quicklink changed elsewhere. Refresh before continuing; your draft is preserved.');
    return saved;
  }
  function saveQuicklink(value: Quicklink) {
    const link = quicklinkSchema.parse(value);
    const old = quicklinks().find(row => row.id === link.id);
    if (old ? old.revision !== link.revision : link.revision !== 0) throw new Error('Quicklink changed elsewhere. Refresh before saving; your draft is preserved.');
    if (!old && quicklinks().length >= 500) throw new Error('Quicklink library is limited to 500 entries.');
    const saved = { ...link, tags: [...new Set(link.tags)], revision: link.revision + 1 };
    const result = old
      ? db.prepare('UPDATE quicklinks SET revision=?,data=? WHERE id=? AND revision=?').run(saved.revision, JSON.stringify(saved), saved.id, link.revision)
      : db.prepare('INSERT INTO quicklinks(id,revision,data) VALUES (?,?,?)').run(saved.id, saved.revision, JSON.stringify(saved));
    if (result.changes !== 1) throw new Error('Quicklink changed elsewhere.');
    bb.realtime.publish('changed', {}); return saved;
  }
  const commands = () => (db.prepare('SELECT data FROM commands ORDER BY rowid').all() as { data: string }[]).map(row => commandSchema.parse(JSON.parse(row.data)));
  const chats = () => (db.prepare('SELECT data FROM chats ORDER BY rowid DESC LIMIT 100').all() as { data: string }[]).map(row => chatSchema.parse(JSON.parse(row.data)));
  const commandSummaries = () => commands().map(command => ({ ...command, prompt: command.prompt.slice(0, 1000), truncated: command.prompt.length > 1000 }));
  async function liveChat(chat: Chat): Promise<Chat> {
    if (!chat.threadId) return chat;
    const thread = await bb.sdk.threads.get({ threadId: chat.threadId });
    const options = await bb.sdk.threads.defaultExecutionOptions({ threadId: chat.threadId }).catch(() => null);
    return { ...chat, ...(thread.environmentId ? { environmentId: thread.environmentId } : {}), title: thread.title || thread.titleFallback || chat.title, model: options?.model ?? chat.model, createdAt: thread.createdAt, activityAt: Math.max(thread.createdAt, thread.latestAttentionAt), projectId: thread.projectId, pinned: thread.pinnedAt !== null, archived: thread.archivedAt !== null, unavailable: thread.deletedAt !== null };
  }
  function saveCommand(value: SavedCommand) {
    const command = commandSchema.parse(value);
    const old = commands().find(row => row.id === command.id);
    if (old ? old.revision !== command.revision : command.revision !== 0) throw new Error('Command changed elsewhere. Reload before saving; your draft is preserved.');
    if (!old && commands().length >= 100) throw new Error('Command library is limited to 100 entries.');
    const saved = { ...command, revision: command.revision + 1 };
    const result = old
      ? db.prepare('UPDATE commands SET revision=?,data=? WHERE id=? AND revision=?').run(saved.revision, JSON.stringify(saved), saved.id, command.revision)
      : db.prepare('INSERT INTO commands(id,revision,data) VALUES (?,?,?)').run(saved.id, saved.revision, JSON.stringify(saved));
    if (result.changes !== 1) throw new Error('Command changed elsewhere.');
    bb.realtime.publish('changed', {});
    return saved;
  }
  let queue: Promise<unknown> = Promise.resolve();
  async function start(input: z.infer<typeof contract.start.input>) {
    const fingerprint = createHash('sha256').update(JSON.stringify(input.request)).digest('hex');
    const old = db.prepare('SELECT data FROM chats WHERE id=?').get(input.id) as { data: string } | undefined;
    if (old) {
      const chat = chatSchema.parse(JSON.parse(old.data));
      if (chat.fingerprint !== fingerprint) throw new Error('This send ID belongs to a different request.');
      if (!chat.threadId) throw new Error(chat.error ?? 'Creation pending or unconfirmed. No duplicate was created.');
      return chat;
    }
    const title = input.request.input.filter(part => part.type === 'text').map(part => part.text).join(' ').trim().slice(0, 100) || 'AI Chat';
    const chat: Chat = { id: input.id, title, threadId: null, fingerprint, createdAt: Date.now(), activityAt: 0, projectId: input.request.projectId, model: input.request.model, pinned: false, archived: false };
    const persist = () => db.prepare('INSERT INTO chats(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(chat.id, JSON.stringify(chat));
    persist();
    try { const thread = await bb.sdk.threads.spawn({ ...input.request, title, pluginMetadata: { raycastChatId: chat.id } }); chat.threadId = thread.id; }
    catch (cause) { chat.error = `Creation unconfirmed: ${cause instanceof Error ? cause.message : String(cause)}. No automatic retry was made.`; }
    persist(); bb.realtime.publish('changed', {});
    if (chat.error) throw new Error(chat.error);
    return chat;
  }
  const host = bb.hosts.experimental_client({ contract: hostContract });
  async function hostId() {
    const config = await bb.sdk.system.config();
    if (!config.primaryHostId) throw new Error('VV has no initialized local host.');
    return config.primaryHostId;
  }
  const searchFiles = async (query: string) => host.call('files', { query }, { hostId: await hostId() });
  const notes = noteHandlers(bb);
  bb.rpc.register(contract, {
    ...notes,
    state: async () => {
      const projects = await bb.sdk.projects.list({ includePersonal: true });
      const personalProjectId = projects.find(project => project.kind === 'personal')?.id;
      const liveChats = await Promise.all(chats().map(chat => liveChat(chat).catch(() => ({ ...chat, unavailable: true }))));
      return { commands: commands(), quicklinks: quicklinks(), chats: liveChats, projects: projects.filter(project => project.kind !== 'personal' && liveChats.some(chat => chat.projectId === project.id)).map(({ id, name }) => ({ id, name })), ...(personalProjectId ? { personalProjectId } : {}) };
    },
    saveCommand,
    saveQuicklink,
    deleteQuicklink: ({ id, revision }) => {
      currentQuicklink(id, revision);
      const result = db.prepare('DELETE FROM quicklinks WHERE id=? AND revision=?').run(id, revision);
      if (result.changes !== 1) throw new Error('Quicklink changed elsewhere.');
      bb.realtime.publish('changed', {}); return { deleted: true };
    },
    resolveQuicklink: ({ id, revision, values }) => ({ target: resolveQuicklink(currentQuicklink(id, revision).link, values) }),
    openQuicklink: async ({ id, revision, values }) => {
      const link = currentQuicklink(id, revision);
      return host.call('openQuicklink', { target: resolveQuicklink(link.link, values), applicationPath: link.applicationPath }, { hostId: await hostId() });
    },
    start: input => { const operation = queue.then(() => start(input)); queue = operation.catch(() => {}); return operation; },
    chatAction: async input => {
      const row = db.prepare('SELECT data FROM chats WHERE id=?').get(input.id) as { data: string } | undefined;
      if (!row) throw new Error('Chat is not in this Raycast workspace.');
      const chat = chatSchema.parse(JSON.parse(row.data));
      if (!chat.threadId) throw new Error('This chat has no confirmed BB conversation.');
      if (input.action === 'rename') {
        if (input.expectedTitle !== undefined) {
          const native = await bb.sdk.threads.get({ threadId: chat.threadId });
          const currentTitle = native.title || native.titleFallback || chat.title;
          if (currentTitle !== input.expectedTitle && currentTitle !== input.title) throw new Error('Chat title changed elsewhere. Your edit is retained; reload the saved title before renaming.');
          if (currentTitle === input.title) return liveChat(chat);
        }
        await bb.sdk.threads.update({ threadId: chat.threadId, title: input.title });
      }
      else await bb.sdk.threads[input.action]({ threadId: chat.threadId });
      bb.realtime.publish('changed', {});
      return liveChat(chat);
    },
    apps: async () => host.call('apps', null, { hostId: await hostId() }),
    appIcon: async input => host.call('appIcon', input, { hostId: await hostId() }),
    openApp: async input => host.call('openApp', input, { hostId: await hostId() }),
    files: ({ query }) => searchFiles(query),
    openFile: async input => host.call('openFile', input, { hostId: await hostId() }),
    calculate: ({ expression }) => calculate(expression),
  });
  for (const event of ['thread.idle', 'thread.active', 'thread.failed', 'thread.archived', 'thread.unarchived', 'thread.deleted'] as const) {
    bb.events.on(event, ({ thread }) => { if (chats().some(chat => chat.threadId === thread.id)) bb.realtime.publish('changed', {}); });
  }
  bb.cli.register({ name: 'vv-raycast', summary: 'Search local files, calculate, and inspect Raycast AI commands', commands: [
    { name: 'commands', summary: 'List saved AI commands', usage: 'bb vv-raycast commands [--json]' },
    { name: 'notes', summary: 'Search active note titles and content without opening them', usage: 'bb vv-raycast notes [query] [--json]' },
    { name: 'quicklinks', summary: 'List saved Quicklinks without opening them', usage: 'bb vv-raycast quicklinks [--json]' },
    { name: 'chats', summary: 'List saved chat bindings', usage: 'bb vv-raycast chats [--json]' },
    { name: 'calculate', summary: 'Calculate arithmetic or convert units', usage: 'bb vv-raycast calculate "10ft in m" [--json]' },
    { name: 'files', summary: 'Search local indexed file names', usage: 'bb vv-raycast files [query] [--json]' },
  ], run: async argv => {
    const args = argv.filter(arg => arg !== '--json');
    if (args[0] === 'calculate' && args.length > 1) return { exitCode: 0, stdout: JSON.stringify(calculate(args.slice(1).join(' '))) };
    if (args[0] === 'notes') { const query = args.slice(1).join(' '); return query.length <= 200 ? { exitCode: 0, stdout: JSON.stringify(notes.noteList({ query, deleted: false, offset: 0 })) } : { exitCode: 1, stderr: 'Note search is limited to200 characters.' }; }
    if (args[0] === 'files') return { exitCode: 0, stdout: JSON.stringify(await searchFiles(args.slice(1).join(' '))) };
    if (args.length !== 1 || !['commands', 'chats', 'quicklinks'].includes(args[0])) return { exitCode: 1, stderr: 'Usage: bb vv-raycast commands|chats|quicklinks [--json]' };
    return { exitCode: 0, stdout: JSON.stringify(args[0] === 'commands' ? commandSummaries() : args[0] === 'quicklinks' ? quicklinks() : chats()) };
  } });
  bb.agents.registerTool({ name: 'vv_raycast_notes', description: 'Search active note titles and content; returns at most50 metadata records, not full note bodies. Does not open or change notes.', parameters: z.object({ query: z.string().max(200) }), execute: async ({ query }) => { const result = notes.noteList({ query, deleted: false, offset: 0 }); return JSON.stringify({ notes: result.notes.slice(0, 50), truncated: result.more || result.notes.length > 50 }); } });
  bb.agents.registerTool({ name: 'vv_raycast_note', description: 'Read the Markdown of one saved Raycast note by its exact ID. Use only for a note relevant to the user request. Does not edit notes, copy to the clipboard or start another AI conversation.', parameters: z.object({ id: z.string().uuid() }), execute: async ({ id }) => JSON.stringify(notes.noteGet({ id })) });
  bb.agents.registerTool({ name: 'vv_raycast_quicklinks', description: 'List saved Quicklinks and their explicit argument templates. Does not open destinations or read clipboard content.', parameters: z.object({ query: z.string().max(200).default('') }), execute: async ({ query }) => { const found = quicklinks().filter(link => `${link.title} ${link.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())); return JSON.stringify({ quicklinks: found.slice(0, 50), truncated: found.length > 50 }); } });
  bb.agents.registerTool({ name: 'vv_raycast_commands', description: 'List saved Raycast AI commands with at most 1,000 prompt characters each and an explicit truncation flag. Does not execute them.', parameters: z.object({}), execute: async () => JSON.stringify(commandSummaries()) });
  bb.agents.registerTool({ name: 'vv_raycast_calculate', description: 'Calculate arithmetic, percentages, functions or unit conversions locally. Returns null for unsupported expressions. No model execution or external requests.', parameters: z.object({ expression: z.string().max(240) }), execute: async ({ expression }) => JSON.stringify(calculate(expression)) });
  bb.agents.registerTool({ name: 'vv_raycast_files', description: 'Find up to 50 local indexed file names in the enrolled primary Mac home folder. Returns metadata only; respects hidden-file and ignore rules. Does not read file contents or open files.', parameters: z.object({ query: z.string().max(200) }), execute: async ({ query }) => JSON.stringify(await searchFiles(query)) });
  bb.agents.configure(() => ({ tools: ['vv_raycast_notes', 'vv_raycast_note', 'vv_raycast_quicklinks', 'vv_raycast_commands', 'vv_raycast_calculate', 'vv_raycast_files'], skills: ['vv-raycast'] }));
}
