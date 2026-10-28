import { createHash } from 'node:crypto';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { calculate } from './calculator';
import { contract, hostContract, commandSchema, chatSchema, type Chat, type SavedCommand } from './contract';
export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  db.prepare('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)').run();
  db.prepare('CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, data TEXT NOT NULL)').run();
  const commands = () => (db.prepare('SELECT data FROM commands ORDER BY rowid').all() as { data: string }[]).map(row => commandSchema.parse(JSON.parse(row.data)));
  const chats = () => (db.prepare('SELECT data FROM chats ORDER BY rowid DESC LIMIT 100').all() as { data: string }[]).map(row => chatSchema.parse(JSON.parse(row.data)));
  const commandSummaries = () => commands().map(command => ({ ...command, prompt: command.prompt.slice(0, 1000), truncated: command.prompt.length > 1000 }));
  async function liveChat(chat: Chat): Promise<Chat> {
    if (!chat.threadId) return chat;
    const thread = await bb.sdk.threads.get({ threadId: chat.threadId });
    const options = await bb.sdk.threads.defaultExecutionOptions({ threadId: chat.threadId }).catch(() => null);
    return { ...chat, ...(thread.environmentId ? { environmentId: thread.environmentId } : {}), title: thread.title || thread.titleFallback || chat.title, model: options?.model ?? chat.model, createdAt: thread.createdAt, pinned: thread.pinnedAt !== null, archived: thread.archivedAt !== null, unavailable: thread.deletedAt !== null };
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
    const chat: Chat = { id: input.id, title, threadId: null, fingerprint, createdAt: Date.now(), model: input.request.model, pinned: false, archived: false };
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
  bb.rpc.register(contract, {
    state: async () => {
      const projects = await bb.sdk.projects.list({ includePersonal: true });
      const personalProjectId = projects.find(project => project.kind === 'personal')?.id;
      const liveChats = await Promise.all(chats().map(chat => liveChat(chat).catch(() => ({ ...chat, unavailable: true }))));
      return { commands: commands(), chats: liveChats, ...(personalProjectId ? { personalProjectId } : {}) };
    },
    saveCommand,
    start: input => { const operation = queue.then(() => start(input)); queue = operation.catch(() => {}); return operation; },
    chatAction: async input => {
      const row = db.prepare('SELECT data FROM chats WHERE id=?').get(input.id) as { data: string } | undefined;
      if (!row) throw new Error('Chat is not in this Raycast workspace.');
      const chat = chatSchema.parse(JSON.parse(row.data));
      if (!chat.threadId) throw new Error('This chat has no confirmed BB conversation.');
      if (input.action === 'rename') await bb.sdk.threads.update({ threadId: chat.threadId, title: input.title });
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
    { name: 'chats', summary: 'List saved chat bindings', usage: 'bb vv-raycast chats [--json]' },
    { name: 'calculate', summary: 'Calculate arithmetic or convert units', usage: 'bb vv-raycast calculate "10ft in m" [--json]' },
    { name: 'files', summary: 'Search local indexed file names', usage: 'bb vv-raycast files [query] [--json]' },
  ], run: async argv => {
    const args = argv.filter(arg => arg !== '--json');
    if (args[0] === 'calculate' && args.length > 1) return { exitCode: 0, stdout: JSON.stringify(calculate(args.slice(1).join(' '))) };
    if (args[0] === 'files') return { exitCode: 0, stdout: JSON.stringify(await searchFiles(args.slice(1).join(' '))) };
    if (args.length !== 1 || !['commands', 'chats'].includes(args[0])) return { exitCode: 1, stderr: 'Usage: bb vv-raycast commands|chats [--json]' };
    return { exitCode: 0, stdout: JSON.stringify(args[0] === 'commands' ? commandSummaries() : chats()) };
  } });
  bb.agents.registerTool({ name: 'vv_raycast_commands', description: 'List saved Raycast AI commands with at most 1,000 prompt characters each and an explicit truncation flag. Does not execute them.', parameters: z.object({}), execute: async () => JSON.stringify(commandSummaries()) });
  bb.agents.registerTool({ name: 'vv_raycast_calculate', description: 'Calculate arithmetic, percentages, functions or unit conversions locally. Returns null for unsupported expressions. No model execution or external requests.', parameters: z.object({ expression: z.string().max(240) }), execute: async ({ expression }) => JSON.stringify(calculate(expression)) });
  bb.agents.registerTool({ name: 'vv_raycast_files', description: 'Find up to 50 local indexed file names in the enrolled primary Mac home folder. Returns metadata only; respects hidden-file and ignore rules. Does not read file contents or open files.', parameters: z.object({ query: z.string().max(200) }), execute: async ({ query }) => JSON.stringify(await searchFiles(query)) });
  bb.agents.configure(() => ({ tools: ['vv_raycast_commands', 'vv_raycast_calculate', 'vv_raycast_files'], skills: ['vv-raycast'] }));
}
