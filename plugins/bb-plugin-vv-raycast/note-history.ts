import type { Block } from './vendor/note-blocks';

const copy = (blocks: Block[]) => blocks.map(block => ({ ...block }));
const same = (a: Block[], b: Block[]) => a.length === b.length && a.every((block, index) =>
  (['id', 'type', 'content', 'checked', 'language', 'fence'] as const).every(key => block[key] === b[index][key]));

export function noteHistory(initial: Block[]) {
  let frames = [copy(initial)], index = 0;
  const record = (blocks: Block[]) => {
    if (same(blocks, frames[index])) return;
    frames = [...frames.slice(0, index + 1), copy(blocks)].slice(-100);
    index = frames.length - 1;
  };
  return {
    record,
    undo(current: Block[]): Block[] | null {
      // Capture typing that has not reached its debounce checkpoint yet.
      record(current);
      return index > 0 ? copy(frames[--index]) : null;
    },
    redo(current: Block[]): Block[] | null {
      if (!same(current, frames[index])) { record(current); return null; }
      return index < frames.length - 1 ? copy(frames[++index]) : null;
    },
  };
}
