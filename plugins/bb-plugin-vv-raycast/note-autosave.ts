import type { NoteInput, Note } from './note-schema';
export type { NoteInput, Note, NoteSummary } from './note-schema';

export function noteTitle(content: string): string {
  const first = content.split('\n').find(line => line.trim())?.trim() ?? '';
  return first.replace(/^(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s*|[-*+]\s+|>\s*|\d+\.\s+)/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|__|~~|`/g, '').trim().slice(0, 200) || 'Untitled';
}

export function isNoteDraft(value: unknown): value is NoteInput & { dirty: boolean } {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.id === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(draft.id)
    && Number.isInteger(draft.revision) && Number(draft.revision) >= 0 && typeof draft.content === 'string'
    && typeof draft.theme === 'string' && ['default', 'rose', 'amber', 'emerald', 'blue', 'violet'].includes(draft.theme)
    && typeof draft.pinned === 'boolean' && typeof draft.dirty === 'boolean';
}

export function noteAutosave(initial: NoteInput, initiallyDirty: boolean, write: (value: NoteInput) => Promise<Note>, persist: (value: NoteInput & { dirty: boolean }) => void, changed: () => void) {
  let current = initial, dirty = initiallyDirty, pending: Promise<void> | null = null, error: unknown = null, local = false;
  const keep = () => { try { persist({ ...current, dirty }); local = true; } catch { local = false; } };
  keep();
  return {
    get value() { return current; }, get dirty() { return dirty; }, get saving() { return pending !== null; }, get error() { return error; }, get recoverable() { return !dirty || local; },
    update(patch: Partial<Pick<NoteInput, 'content' | 'theme' | 'pinned'>>) {
      const next = { ...current, ...patch };
      if (next.content === current.content && next.theme === current.theme && next.pinned === current.pinned) return;
      current = next; dirty = true; keep(); changed();
    },
    async flush(retry = false): Promise<void> {
      if (pending) return pending;
      if (error && !retry) throw error;
      error = null;
      pending = (async () => {
        while (dirty) {
          if (!current.revision && !current.content.trim()) { dirty = false; keep(); break; }
          const candidate = current;
          const saved = await write(candidate);
          dirty = current.content !== candidate.content || current.theme !== candidate.theme || current.pinned !== candidate.pinned;
          current = { ...current, revision: saved.revision };
          keep(); changed();
        }
      })();
      changed();
      try { await pending; } catch (cause) { error = cause; keep(); throw cause; }
      finally { pending = null; changed(); }
    },
  };
}
