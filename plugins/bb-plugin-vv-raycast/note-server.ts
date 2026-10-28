import type { BbPluginApi } from '@get-bb/plugin-sdk';
import type { z } from 'zod';
import { noteContract, noteSchema, type Note, type NoteInput } from './note-schema';
import { noteTitle } from './note-autosave';

export function noteHandlers(bb: BbPluginApi) {
  const db = bb.storage.database();
  db.prepare('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, searchText TEXT NOT NULL, theme TEXT NOT NULL, pinned INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER)').run();
  const parse = (row: unknown): Note => { if (!row) throw new Error('Note is unavailable. Your local draft is retained.'); const value = row as Record<string, unknown>; return noteSchema.parse({ ...value, pinned: Boolean(value.pinned) }); };
  const get = (id: string) => parse(db.prepare('SELECT * FROM notes WHERE id=?').get(id));
  const changed = () => bb.realtime.publish('notesChanged', {});
  return {
    noteList: ({ query, deleted, offset }: z.infer<typeof noteContract.noteList.input>) => {
      const found = db.prepare(`SELECT id,revision,title,theme,pinned,updatedAt,deletedAt FROM notes WHERE deletedAt IS ${deleted ? 'NOT ' : ''}NULL AND (?='' OR instr(searchText,?)>0) ORDER BY pinned DESC,updatedAt DESC,id LIMIT 101 OFFSET ?`).all(query.trim().toLowerCase(), query.trim().toLowerCase(), offset) as Record<string, unknown>[];
      return { notes: found.slice(0, 100).map(row => ({ ...row, pinned: Boolean(row.pinned) })) as Omit<Note, 'content'>[], more: found.length > 100 };
    },
    noteGet: ({ id }: { id: string }) => get(id),
    noteSave: (input: NoteInput) => {
      const row = db.prepare('SELECT * FROM notes WHERE id=?').get(input.id);
      const old = row ? parse(row) : null;
      if (old && old.deletedAt !== null) throw new Error('This note is in Recently Deleted. Restore it before editing. Your local draft is retained.');
      if (old ? old.revision !== input.revision : input.revision !== 0) {
        if (old && old.revision === input.revision + 1 && old.content === input.content && old.theme === input.theme && old.pinned === input.pinned) return old;
        throw new Error('Note changed elsewhere. Your draft is retained; save it as a new note.');
      }
      const title = noteTitle(input.content), updatedAt = Date.now(), revision = input.revision + 1, searchText = `${title}\n${input.content}`.toLowerCase();
      const result = old
        ? db.prepare('UPDATE notes SET revision=?,title=?,content=?,searchText=?,theme=?,pinned=?,updatedAt=? WHERE id=? AND revision=? AND deletedAt IS NULL').run(revision, title, input.content, searchText, input.theme, Number(input.pinned), updatedAt, input.id, input.revision)
        : db.prepare('INSERT INTO notes(id,revision,title,content,searchText,theme,pinned,updatedAt,deletedAt) VALUES (?,?,?,?,?,?,?,?,NULL)').run(input.id, revision, title, input.content, searchText, input.theme, Number(input.pinned), updatedAt);
      if (result.changes !== 1) throw new Error('Note changed elsewhere. Your draft is retained.');
      changed(); return get(input.id);
    },
    noteAction: ({ id, revision, action }: z.infer<typeof noteContract.noteAction.input>) => {
      const note = get(id);
      if (note.revision !== revision) throw new Error('Note changed elsewhere. Refresh before continuing.');
      if (note.deletedAt !== null && action !== 'restore') throw new Error('Restore this note before changing it.');
      if (action === 'restore' && note.deletedAt === null) return note;
      const pinned = action === 'pin' ? true : action === 'unpin' ? false : note.pinned;
      const deletedAt = action === 'delete' ? Date.now() : action === 'restore' ? null : note.deletedAt;
      const result = db.prepare('UPDATE notes SET revision=revision+1,pinned=?,deletedAt=?,updatedAt=? WHERE id=? AND revision=?').run(Number(pinned), deletedAt, Date.now(), id, revision);
      if (result.changes !== 1) throw new Error('Note changed elsewhere.');
      changed(); return get(id);
    },
  };
}
