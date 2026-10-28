// Extracted and adapted from SuperCmd NotesManager (MIT).
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Markdown } from '@get-bb/plugin-sdk/app';
import { editableForRange } from '../note-selection';
import { LauncherIcon as Icon } from '../launcher-icon';
import { genBlockId, formatNoteBlock, moveNoteBlock, parseMarkdownToBlocks, serializeBlocksToMarkdown, detectMarkdownPrefix, type Block, type BlockType } from './note-blocks';
const [Type, List, ListOrdered, ListChecks, Quote, SquareCode, Minus, Search, GripVertical] = ['Type', 'List', 'ListOrdered', 'ListChecks', 'Quote', 'Code', 'Minus', 'Search', 'GripVertical'].map(name => ({ size = 14, className }: { size?: number; className?: string }) => <Icon name={name} className={className} style={{ width: size, height: size }} />);
const InlineNote = ({ content }: { content: string }) => <>{content.split(/(<u>[\s\S]*?<\/u>)/g).map((part, index) => part.startsWith('<u>') && part.endsWith('</u>') ? <span key={index} style={{ textDecoration: 'underline' }}><Markdown content={part.slice(3, -4)} className="rc-note-inline" /></span> : <Markdown key={index} content={part} className="rc-note-inline" />)}</>;
const hasInlineFormatting = (text: string) => /\*\*.+?\*\*|(?<!\*)\*[^*]+?\*(?!\*)|~~.+?~~|<u>.+?<\/u>|`.+?`|\[.+?\]\(.+?\)/.test(text);
function getCursorOffset(el: HTMLElement | null | undefined): number {
  if (!el) return 0;
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  if (range.startContainer === el) return range.startOffset;
  return range.startOffset;
}

function focusAndSetCursor(el: HTMLElement, offset: number) {
  el.focus();
  const textNode = el.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    const safe = Math.min(offset, textNode.textContent?.length || 0);
    range.setStart(textNode, safe);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } else {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(offset > 0 ? false : true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

function setCursorPosition(el: HTMLElement, offset: number) {
  requestAnimationFrame(() => focusAndSetCursor(el, offset));
}

// ─── Menu Panel Styles (matches clipboard/extension action panels) ───

const SLASH_COMMANDS: Array<{ type: BlockType; label: string; description: string; icon: React.ReactNode; keywords: string[] }> = [
  { type: 'paragraph', label: 'Text', description: 'Plain text block', icon: <Type size={14} />, keywords: ['text', 'paragraph', 'plain'] },
  { type: 'h1', label: 'Heading 1', description: 'Large heading', icon: <span className="text-xs font-bold">H1</span>, keywords: ['heading', 'h1', 'title'] },
  { type: 'h2', label: 'Heading 2', description: 'Medium heading', icon: <span className="text-xs font-bold">H2</span>, keywords: ['heading', 'h2'] },
  { type: 'h3', label: 'Heading 3', description: 'Small heading', icon: <span className="text-xs font-bold">H3</span>, keywords: ['heading', 'h3'] },
  { type: 'bullet', label: 'Bullet List', description: 'Unordered list item', icon: <List size={14} />, keywords: ['bullet', 'list', 'unordered'] },
  { type: 'ordered', label: 'Numbered List', description: 'Ordered list item', icon: <ListOrdered size={14} />, keywords: ['numbered', 'ordered', 'list'] },
  { type: 'checkbox', label: 'To-Do', description: 'Checkbox item', icon: <ListChecks size={14} />, keywords: ['todo', 'checkbox', 'task', 'check'] },
  { type: 'blockquote', label: 'Quote', description: 'Block quote', icon: <Quote size={14} />, keywords: ['quote', 'blockquote'] },
  { type: 'code', label: 'Code', description: 'Code block', icon: <SquareCode size={14} />, keywords: ['code', 'snippet'] },
  { type: 'divider', label: 'Divider', description: 'Horizontal line', icon: <Minus size={14} />, keywords: ['divider', 'line', 'separator', 'hr'] },
];

interface SlashMenuProps {
  position: { top: number; left: number };
  onSelect: (type: BlockType) => void;
  onClose: () => void;
  portalTarget: HTMLElement;
}

/**
 * Slash command menu — renders as a fixed-position overlay that pops OUT of the
 * editor. Has its own search input so keyboard navigation works reliably.
 */
const SlashMenu: React.FC<SlashMenuProps> = ({ position, onSelect, onClose, portalTarget }) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filterQuery) return SLASH_COMMANDS;
    const q = filterQuery.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.keywords.some(k => k.includes(q)));
  }, [filterQuery]);

  useEffect(() => { setSelectedIdx(0); }, [filterQuery]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[data-slash-item]');
    const item = items?.[selectedIdx] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setSelectedIdx(i => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[selectedIdx]) { e.preventDefault(); e.stopPropagation(); onSelect(filtered[selectedIdx].type); }
      return;
    }
  };

  // Adjust position after first render using actual menu size
  const [adjustedPos, setAdjustedPos] = useState(position);
  const [menuMaxH, setMenuMaxH] = useState(400);
  useEffect(() => {
    requestAnimationFrame(() => {
      const menuEl = menuRef.current;
      const menuHeight = menuEl?.offsetHeight || 380;
      const menuWidth = 260;
      const winH = window.innerHeight;
      const winW = window.innerWidth;
      const pad = 8;
      const titleBarH = 40; // Keep below traffic light buttons

      let top = position.top;
      let left = position.left;

      // Try below cursor first
      if (top + menuHeight > winH - pad) {
        // Flip above: position.top is rect.bottom + 4, so cursor top ≈ position.top - 4 - 22
        const cursorTop = position.top - 4 - 22;
        top = cursorTop - menuHeight;
      }

      // Clamp to window bounds (never overlap title bar)
      top = Math.max(titleBarH, Math.min(top, winH - menuHeight - pad));
      left = Math.max(pad, Math.min(left, winW - menuWidth - pad));

      // If menu still doesn't fit, constrain max height
      const availH = winH - pad * 2;
      setMenuMaxH(Math.min(400, availH));

      setAdjustedPos({ top, left });
    });
  }, [position]);

  return createPortal(
    <div role="dialog" aria-label="Format blocks" className="fixed inset-0 z-[9998]" onClick={onClose}>
      <div
        ref={menuRef}
        className="fixed z-[9999] w-[260px] overflow-hidden flex flex-col rounded-lg shadow-2xl"
        style={{
          top: adjustedPos.top, left: adjustedPos.left, maxHeight: menuMaxH,
          background: 'rgba(30, 30, 30, 0.85)',
          backdropFilter: 'blur(80px) saturate(150%)',
          WebkitBackdropFilter: 'blur(80px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--ui-divider)]">
          <Search size={13} className="text-[var(--text-disabled)] flex-shrink-0" />
          <input
            ref={inputRef}
            aria-label="Filter formatting blocks"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
          />
        </div>
        <div role="listbox" aria-label="Formatting blocks" ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-[11px] text-[var(--text-disabled)]">No blocks found</div>
          ) : filtered.map((cmd, idx) => (
            <div
              key={cmd.type}
              data-slash-item
              role="option" aria-selected={idx === selectedIdx}
              onClick={() => onSelect(cmd.type)}
              onMouseEnter={() => setSelectedIdx(idx)}
              className="flex items-center gap-2.5 px-2.5 py-[7px] cursor-pointer transition-colors"
              style={idx === selectedIdx ? { background: 'rgba(255,255,255,0.08)' } : undefined}
            >
              <span className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] flex-shrink-0">{cmd.icon}</span>
              <span className="text-[12px] text-[var(--text-primary)] font-medium">{cmd.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    portalTarget
  );
};

// ─── Block Editor ────────────────────────────────────────────────────

export interface BlockEditorHandle {
  getContent: () => string;
  wrapSelection: (prefix: string, suffix: string) => void;
  insertBlockType: (type: BlockType) => void;
}

interface BlockEditorProps {
  initialContent: string;
  onContentChange: (content: string) => void;
  accentColor: string;
  editorRef?: React.Ref<BlockEditorHandle>;
  onNotice?: (message: string) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({ initialContent, onContentChange, accentColor, editorRef, onNotice }) => {
  const [blocks, setBlocks] = useState<Block[]>(() => parseMarkdownToBlocks(initialContent));
  const blocksRef = useRef(blocks);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  const [slashMenu, setSlashMenu] = useState<{ blockId: string; position: { top: number; left: number } } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const blockElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingFocusRef = useRef<{ id: string; offset: number } | null>(null);
  const composing = useRef(false);
  const lastFocusedBlock = useRef<string | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // ─── Undo / Redo History ───────────────────────────────────
  const historyRef = useRef<Block[][]>([]);
  const historyIdxRef = useRef(-1);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUndoRedoRef = useRef(false);

  const snapshotBlocks = useCallback((): Block[] => {
    return blocksRef.current.map(b => {
      const el = blockElsRef.current.get(b.id);
      return { ...b, content: el?.textContent ?? b.content };
    });
  }, []);

  const pushHistory = useCallback((immediate?: boolean) => {
    if (isUndoRedoRef.current) return;
    const push = () => {
      const snapshot = snapshotBlocks().map(b => ({ ...b }));
      const stack = historyRef.current.slice(0, historyIdxRef.current + 1);
      stack.push(snapshot);
      if (stack.length > 100) stack.shift();
      historyRef.current = stack;
      historyIdxRef.current = stack.length - 1;
    };
    if (immediate) {
      if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
      push();
    } else {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      historyTimerRef.current = setTimeout(push, 500);
    }
  }, [snapshotBlocks]);

  useEffect(() => {
    const initial = blocksRef.current.map(b => ({ ...b }));
    historyRef.current = [initial];
    historyIdxRef.current = 0;
  }, []);

  React.useLayoutEffect(() => {
    const block = blocksRef.current[blocksRef.current.length - 1];
    const element = block && blockElsRef.current.get(block.id);
    if (element) focusAndSetCursor(element, block.content.length);
    return () => { if (historyTimerRef.current) clearTimeout(historyTimerRef.current); };
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
    const currentSnapshot = snapshotBlocks().map(b => ({ ...b }));
    const stack = historyRef.current;
    stack[historyIdxRef.current] = currentSnapshot;
    historyIdxRef.current--;
    const prev = stack[historyIdxRef.current];
    isUndoRedoRef.current = true;
    setBlocks(prev.map(b => ({ ...b })));
    requestAnimationFrame(() => {
      for (const b of prev) {
        const el = blockElsRef.current.get(b.id);
        if (el && el.textContent !== b.content) el.textContent = b.content;
      }
      isUndoRedoRef.current = false;
    });
  }, [snapshotBlocks]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const next = historyRef.current[historyIdxRef.current];
    isUndoRedoRef.current = true;
    setBlocks(next.map(b => ({ ...b })));
    requestAnimationFrame(() => {
      for (const b of next) {
        const el = blockElsRef.current.get(b.id);
        if (el && el.textContent !== b.content) el.textContent = b.content;
      }
      isUndoRedoRef.current = false;
    });
  }, []);

  const lastNotified = useRef(serializeBlocksToMarkdown(blocks));
  useEffect(() => {
    const content = serializeBlocksToMarkdown(blocks);
    if (content !== lastNotified.current) { lastNotified.current = content; onContentChange(content); }
  }, [blocks, onContentChange]);

  const notifyRef = useRef(onContentChange);
  notifyRef.current = onContentChange;
  useEffect(() => () => {
    const content = serializeBlocksToMarkdown(snapshotBlocks());
    if (content !== lastNotified.current) notifyRef.current(content);
  }, [snapshotBlocks]);

  // Pending focus after render
  React.useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const element = blockElsRef.current.get(pending.id);
    if (element) setCursorPosition(element, pending.offset);
  });

  const focusBlock = useCallback((id: string, offset: number) => {
    pendingFocusRef.current = { id, offset };
  }, []);

  // ─── Block Input Handler ─────────────────────────────────────
  const handleBlockInput = useCallback((blockId: string) => {
    const el = blockElsRef.current.get(blockId);
    if (!el) return;
    const text = el.textContent || '';
    const block = blocksRef.current.find(b => b.id === blockId);
    if (!block) return;

    if (block.type === 'paragraph') {
      const prefix = !composing.current && detectMarkdownPrefix(text);
      if (prefix) {
        if (prefix.type === 'divider') {
          // Divider: convert block and add a new paragraph below, then focus it
          const newPara: Block = { id: genBlockId(), type: 'paragraph', content: '' };
          setBlocks(prev => {
            const idx = prev.findIndex(b => b.id === blockId);
            const updated = [...prev];
            updated[idx] = { ...prev[idx], type: 'divider', content: '' };
            updated.splice(idx + 1, 0, newPara);
            return updated;
          });
          focusBlock(newPara.id, 0);
        } else {
          el.textContent = prefix.content;
          setCursorPosition(el, prefix.content.length);
          setBlocks(prev => prev.map(b =>
            b.id === blockId ? { ...b, type: prefix.type, content: prefix.content, checked: prefix.checked } : b
          ));
        }
        setSlashMenu(null);
        return;
      }
    }

    // Slash command detection — open menu and clear the "/" from the block
    if (!composing.current && text === '/') {
      const rect = el.getBoundingClientRect();
      el.textContent = '';
      setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content: '' } : b));
      setSlashMenu({ blockId, position: { top: rect.bottom + 4, left: rect.left } });
      return;
    }

    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content: text } : b));
    pushHistory();
  }, [slashMenu, pushHistory]);

  // ─── Slash Command Selection ─────────────────────────────────
  const handleSlashSelect = useCallback((type: BlockType) => {
    if (!slashMenu) return;
    const { blockId } = slashMenu;
    const el = blockElsRef.current.get(blockId);
    setSlashMenu(null);

    if (type === 'divider') {
      const newPara: Block = { id: genBlockId(), type: 'paragraph', content: '' };
      setBlocks(prev => {
        const idx = prev.findIndex(b => b.id === blockId);
        const updated = [...prev];
        updated[idx] = { ...prev[idx], type: 'divider', content: '' };
        updated.splice(idx + 1, 0, newPara);
        return updated;
      });
      focusBlock(newPara.id, 0);
    } else {
      if (el) el.textContent = '';
      setBlocks(prev => prev.map(b =>
        b.id === blockId ? { ...b, type, content: '', checked: type === 'checkbox' ? false : undefined } : b
      ));
      focusBlock(blockId, 0);
    }
  }, [slashMenu, focusBlock]);

  // ─── Key Down Handler ────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent, blockId: string) => {
    const block = blocksRef.current.find(b => b.id === blockId);
    if (!block) return;
    const el = blockElsRef.current.get(blockId);
    const meta = e.metaKey || e.ctrlKey;

    if (slashMenu?.blockId === blockId && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;

    if (meta && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (meta && e.shiftKey && e.key === 'z') { e.preventDefault(); redo(); return; }

    if (e.key === 'Enter' && !e.shiftKey && !meta) {
      e.preventDefault();
      pushHistory(true);
      const offset = getCursorOffset(el);
      const text = el?.textContent || '';
      const before = text.slice(0, offset);
      const after = text.slice(offset);

      if (['bullet', 'ordered', 'checkbox'].includes(block.type) && !before && !after) {
        setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, type: 'paragraph' } : b));
        pushHistory(true);
        return;
      }

      const newType = ['bullet', 'ordered', 'checkbox'].includes(block.type) ? block.type : 'paragraph';
      const newBlock: Block = {
        id: genBlockId(),
        type: newType as BlockType,
        content: after,
        checked: newType === 'checkbox' ? false : undefined,
      };

      if (el) el.textContent = before;
      setBlocks(prev => {
        const idx = prev.findIndex(b => b.id === blockId);
        const updated = [...prev];
        updated[idx] = { ...block, content: before };
        updated.splice(idx + 1, 0, newBlock);
        return updated;
      });
      focusBlock(newBlock.id, 0);
      pushHistory(true);
      return;
    }

    if (e.key === 'Backspace' && !meta) {
      const offset = getCursorOffset(el);
      const sel = window.getSelection();
      if (offset === 0 && sel?.isCollapsed) {
        e.preventDefault();
        pushHistory(true);
        if (block.type !== 'paragraph') {
          setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, type: 'paragraph', checked: undefined } : b));
        } else {
          const idx = blocksRef.current.findIndex(b => b.id === blockId);
          if (idx > 0) {
            const prev = blocksRef.current[idx - 1];
            if (prev.type === 'divider') {
              setBlocks(p => p.filter((_, i) => i !== idx - 1));
              focusBlock(blockId, 0);
            } else {
              const mergeOffset = prev.content.length;
              const mergedContent = prev.content + block.content;
              const prevEl = blockElsRef.current.get(prev.id);
              if (prevEl) prevEl.textContent = mergedContent;
              setBlocks(p => {
                const u = [...p];
                u[idx - 1] = { ...prev, content: mergedContent };
                u.splice(idx, 1);
                return u;
              });
              focusBlock(prev.id, mergeOffset);
            }
          }
        }
        pushHistory(true);
        return;
      }
    }

    // Arrow navigation between blocks — focus synchronously to avoid lag.
    // Skip over dividers (they have no editable element).
    if (e.key === 'ArrowDown' && !meta && !e.shiftKey) {
      const offset = getCursorOffset(el);
      const textLen = el?.textContent?.length || 0;
      if (offset >= textLen) {
        const idx = blocksRef.current.findIndex(b => b.id === blockId);
        for (let i = idx + 1; i < blocksRef.current.length; i++) {
          const target = blocksRef.current[i];
          if (target.type === 'divider') continue;
          const targetEl = blockElsRef.current.get(target.id);
          if (targetEl) { e.preventDefault(); focusAndSetCursor(targetEl, 0); }
          break;
        }
      }
    }

    if (e.key === 'ArrowUp' && !meta && !e.shiftKey) {
      const offset = getCursorOffset(el);
      if (offset === 0) {
        const idx = blocksRef.current.findIndex(b => b.id === blockId);
        for (let i = idx - 1; i >= 0; i--) {
          const target = blocksRef.current[i];
          if (target.type === 'divider') continue;
          const targetEl = blockElsRef.current.get(target.id);
          if (targetEl) { e.preventDefault(); focusAndSetCursor(targetEl, target.content.length); }
          break;
        }
      }
    }

    if (e.key === 'ArrowLeft' && !meta && !e.shiftKey && !e.altKey) {
      const offset = getCursorOffset(el);
      const sel = window.getSelection();
      if (offset === 0 && sel?.isCollapsed) {
        const idx = blocksRef.current.findIndex(b => b.id === blockId);
        for (let i = idx - 1; i >= 0; i--) {
          const target = blocksRef.current[i];
          if (target.type === 'divider') continue;
          const targetEl = blockElsRef.current.get(target.id);
          if (targetEl) { e.preventDefault(); focusAndSetCursor(targetEl, target.content.length); }
          break;
        }
      }
    }

    if (e.key === 'ArrowRight' && !meta && !e.shiftKey && !e.altKey) {
      const offset = getCursorOffset(el);
      const textLen = el?.textContent?.length || 0;
      const sel = window.getSelection();
      if (offset >= textLen && sel?.isCollapsed) {
        const idx = blocksRef.current.findIndex(b => b.id === blockId);
        for (let i = idx + 1; i < blocksRef.current.length; i++) {
          const target = blocksRef.current[i];
          if (target.type === 'divider') continue;
          const targetEl = blockElsRef.current.get(target.id);
          if (targetEl) { e.preventDefault(); focusAndSetCursor(targetEl, 0); }
          break;
        }
      }
    }

    // Formatting shortcuts
    if (meta && !e.shiftKey && !e.altKey && e.key === 'b') { e.preventDefault(); pushHistory(true); wrapSelection('**', '**'); pushHistory(true); return; }
    if (meta && !e.shiftKey && !e.altKey && e.key === 'i') { e.preventDefault(); pushHistory(true); wrapSelection('*', '*'); pushHistory(true); return; }
    if (meta && e.shiftKey && e.key === 's') { e.preventDefault(); pushHistory(true); wrapSelection('~~', '~~'); pushHistory(true); return; }
    if (meta && !e.shiftKey && !e.altKey && e.key === 'e') { e.preventDefault(); pushHistory(true); wrapSelection('`', '`'); pushHistory(true); return; }
    if (meta && !e.shiftKey && !e.altKey && e.key === 'u') { e.preventDefault(); pushHistory(true); wrapSelection('<u>', '</u>'); pushHistory(true); return; }

    if (meta && e.key === 'Enter') {
      if (block.type === 'checkbox') {
        e.preventDefault();
        pushHistory(true);
        setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b));
        pushHistory(true);
        return;
      }
    }
  }, [slashMenu, focusBlock, undo, redo, pushHistory]);

  const wrapSelection = useCallback((prefix: string, suffix: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current) return;
    const selectedEditable = editableForRange(range, containerRef.current);
    if (!selectedEditable) { onNotice?.('Select text within one block to format it. Multi-block text formatting is not available yet.'); return; }
    onNotice?.('');
    const selected = range.toString();
    if (!selected) return;

    // Smart link: if wrapping with []() and selected text is a URL, use it as the href
    let text: string;
    const isLinkWrap = prefix === '[' && suffix === '](url)';
    const isUrl = /^https?:\/\/\S+$/i.test(selected.trim());
    if (isLinkWrap && isUrl) {
      text = `[${selected.trim()}](${selected.trim()})`;
    } else {
      text = prefix + selected + suffix;
    }

    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    const editable = selectedEditable;
    const el = editable?.closest('[data-block-id]') as HTMLElement | null;
    if (el) {
      const blockId = el.dataset.blockId;
      if (blockId) {
        setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content: editable?.textContent || '' } : b));
      }
    }
  }, [onNotice]);

  // Expose format actions to parent via ref
  React.useImperativeHandle(editorRef, () => ({
    getContent: () => serializeBlocksToMarkdown(snapshotBlocks()),
    wrapSelection: (prefix: string, suffix: string) => {
      pushHistory(true);
      // If there's a selection, wrap it. Otherwise insert at cursor in focused block.
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        wrapSelection(prefix, suffix);
      } else {
        // Find focused block and insert wrapping at cursor
        const focusedId = focusedBlockId || lastFocusedBlock.current || blocksRef.current[blocksRef.current.length - 1]?.id;
        if (!focusedId) return;
        const el = blockElsRef.current.get(focusedId);
        if (!el) return;
        el.focus();
        const offset = getCursorOffset(el);
        const text = el.textContent || '';
        const placeholder = prefix + suffix;
        const newText = text.slice(0, offset) + placeholder + text.slice(offset);
        el.textContent = newText;
        setCursorPosition(el, offset + prefix.length);
        setBlocks(prev => prev.map(b => b.id === focusedId ? { ...b, content: newText } : b));
      }
      pushHistory(true);
    },
    insertBlockType: (type: BlockType) => {
      pushHistory(true);
      const formatted = formatNoteBlock(blocksRef.current, focusedBlockId || lastFocusedBlock.current, type);
      setBlocks(formatted.blocks);
      pendingFocusRef.current = { id: formatted.focusId, offset: 0 };

    },
  }), [wrapSelection, focusedBlockId, pushHistory, snapshotBlocks]);

  // ─── Drag & Drop ─────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIdx(idx);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setDropIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    setBlocks(prev => moveNoteBlock(prev, fromIdx, toIdx));
  }, [dragIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDropIdx(null);
  }, []);

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 cursor-text"
      onClick={(e) => {
        // Clicking empty space below blocks → focus last block or create one
        const target = e.target as HTMLElement;
        if (target === containerRef.current) {
          const lastBlock = blocksRef.current[blocksRef.current.length - 1];
          if (lastBlock && lastBlock.content === '' && lastBlock.type === 'paragraph') {
            // Last block is already an empty paragraph — just focus it
            const el = blockElsRef.current.get(lastBlock.id);
            if (el) { el.focus(); setCursorPosition(el, 0); }
          } else {
            // Add a new empty paragraph and focus it
            const newBlock: Block = { id: genBlockId(), type: 'paragraph', content: '' };
            setBlocks(prev => [...prev, newBlock]);
            pendingFocusRef.current = { id: newBlock.id, offset: 0 };
          }
        }
      }}
    >
      {blocks.map((block, idx) => (
        <div key={block.id} className="relative group">
          {dropIdx === idx && dragIdx !== null && dragIdx !== idx && (
            <div className="absolute top-0 left-6 right-2 h-[2px] rounded-full" style={{ background: accentColor }} />
          )}
          <div
            className={`flex items-start gap-1 rounded-md transition-all ${dragIdx === idx ? 'opacity-40' : ''}`}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
          >
            <div
              draggable role="group" tabIndex={0} aria-label="Move block" title="Move block"
              aria-description="Drag to reorder. Alt Arrow Up or Down moves this block."
              onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setBlocks(old => moveNoteBlock(old, idx, idx + (event.key === 'ArrowUp' ? -1 : 1))); } }}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex-shrink-0 w-5 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-30 hover:!opacity-60 transition-opacity ${
                block.type === 'h1' ? 'h-[36px]' : block.type === 'h2' ? 'h-[28px]' : block.type === 'h3' ? 'h-[23px]' : 'h-[21px]'
              }`}
            >
              <GripVertical size={12} />
            </div>

            {block.type === 'divider' ? (
              <div className="flex-1 py-3 px-1">
                <div className="border-t border-[var(--ui-divider)]" />
              </div>
            ) : (
              <div className="flex-1 flex items-start gap-1.5 min-w-0" data-block-id={block.id}>
                {block.type === 'checkbox' && (
                  <button type="button" role="checkbox" aria-checked={Boolean(block.checked)} aria-label="Toggle task" title="Toggle task" aria-description="Click or press Command Enter in the task to change its checked state."
                    onClick={() => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, checked: !b.checked } : b))}
                    className="flex-shrink-0 mt-[3px] w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: block.checked ? accentColor : `${accentColor}60`,
                      background: block.checked ? `${accentColor}30` : 'transparent',
                      color: accentColor,
                    }}
                  >
                    {block.checked && <span className="text-[9px] font-bold">✓</span>}
                  </button>
                )}
                {block.type === 'bullet' && (
                  <span className="flex-shrink-0 mt-[9px] w-[5px] h-[5px] rounded-full" style={{ background: accentColor }} />
                )}
                {block.type === 'ordered' && (
                  <span className="flex-shrink-0 mt-[2px] text-[12px] text-[var(--text-subtle)] min-w-[16px] text-right font-medium">
                    {(() => { let n = 1; for (let j = idx - 1; j >= 0 && blocks[j].type === 'ordered'; j--) n++; return `${n}.`; })()}
                  </span>
                )}
                {block.type === 'blockquote' && (
                  <div className="flex-shrink-0 w-[3px] self-stretch rounded-full mr-1" style={{ background: `${accentColor}50` }} />
                )}

                <div className="flex-1 relative min-w-0">
                  <div
                    ref={(el) => {
                      if (el) {
                        blockElsRef.current.set(block.id, el);
                        if (!el.dataset.init) { el.textContent = block.content; el.dataset.init = '1'; }
                      } else { blockElsRef.current.delete(block.id); }
                    }}
                    role="textbox" aria-label={`Note ${block.type} block`} aria-multiline="true"
                    aria-description="Type Markdown or slash for formatting. Changes save automatically."
                    onCompositionStart={() => { composing.current = true; }}
                    onCompositionEnd={() => { composing.current = false; handleBlockInput(block.id); }}
                    contentEditable={"plaintext-only" as any}
                    suppressContentEditableWarning
                    onInput={() => handleBlockInput(block.id)}
                    onKeyDown={(e) => handleKeyDown(e, block.id)}
                    onFocus={() => { lastFocusedBlock.current = block.id; setFocusedBlockId(block.id); if (slashMenu && slashMenu.blockId !== block.id) setSlashMenu(null); }}
                    onBlur={() => { if (focusedBlockId === block.id) setFocusedBlockId(null); }}
                    className={[
                      'outline-none min-h-[24px] leading-[1.65]',
                      block.type === 'h1' && 'text-[22px] font-bold text-[var(--text-primary)]',
                      block.type === 'h2' && 'text-[17px] font-semibold text-[var(--text-primary)]',
                      block.type === 'h3' && 'text-[14px] font-semibold text-[var(--text-primary)]',
                      block.type === 'paragraph' && 'text-[13px] text-[var(--text-secondary)]',
                      block.type === 'bullet' && 'text-[13px] text-[var(--text-secondary)]',
                      block.type === 'ordered' && 'text-[13px] text-[var(--text-secondary)]',
                      block.type === 'checkbox' && block.checked && 'text-[13px] text-[var(--text-subtle)] line-through',
                      block.type === 'checkbox' && !block.checked && 'text-[13px] text-[var(--text-secondary)]',
                      block.type === 'blockquote' && 'text-[13px] text-[var(--text-muted)] italic',
                      block.type === 'code' && 'text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--input-bg)] rounded px-2 py-1 whitespace-pre',
                      focusedBlockId !== block.id && hasInlineFormatting(block.content) && block.type !== 'code' && 'opacity-0',
                    ].filter(Boolean).join(' ')}
                    data-placeholder={focusedBlockId === block.id ? (block.type === 'h1' ? 'Heading 1' : block.type === 'h2' ? 'Heading 2' : block.type === 'h3' ? 'Heading 3' : block.type === 'paragraph' ? "Type '/' for commands..." : '') : ''}
                    style={{ '--placeholder-color': 'var(--text-disabled)' } as any}
                  />
                  {focusedBlockId !== block.id && hasInlineFormatting(block.content) && block.type !== 'code' && (
                    <div
                      data-note-formatted-overlay
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a')) return;
                        setFocusedBlockId(block.id);
                        const el = blockElsRef.current.get(block.id);
                        if (el) el.focus();
                      }}
                      className={[
                        'absolute inset-0 cursor-text min-h-[24px] leading-[1.65]',
                        block.type === 'h1' && 'text-[22px] font-bold text-[var(--text-primary)]',
                        block.type === 'h2' && 'text-[17px] font-semibold text-[var(--text-primary)]',
                        block.type === 'h3' && 'text-[14px] font-semibold text-[var(--text-primary)]',
                        block.type === 'paragraph' && 'text-[13px] text-[var(--text-secondary)]',
                        block.type === 'bullet' && 'text-[13px] text-[var(--text-secondary)]',
                        block.type === 'ordered' && 'text-[13px] text-[var(--text-secondary)]',
                        block.type === 'checkbox' && block.checked && 'text-[13px] text-[var(--text-subtle)] line-through',
                        block.type === 'checkbox' && !block.checked && 'text-[13px] text-[var(--text-secondary)]',
                        block.type === 'blockquote' && 'text-[13px] text-[var(--text-muted)] italic',
                      ].filter(Boolean).join(' ')}
                    ><InlineNote content={block.content} /></div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {slashMenu && (
        <SlashMenu
          position={slashMenu.position}
          portalTarget={containerRef.current ?? document.body}
          onSelect={handleSlashSelect}
          onClose={() => {
            const { blockId } = slashMenu;
            setSlashMenu(null);
            focusBlock(blockId, 0);
          }}
        />
      )}

      <style>{`
        .rc-notes-workspace [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--text-disabled, rgba(255,255,255,0.25));
          pointer-events: none;
          position: absolute;
        }
        .rc-notes-workspace [data-placeholder]:empty { position: relative; }
      `}</style>
    </div>
  );
};
