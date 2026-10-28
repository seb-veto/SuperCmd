// Adapted from SuperCmd NotesManager (MIT); no Electron or persistence dependency.
export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'checkbox' | 'code' | 'blockquote' | 'divider';

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  language?: string;
  fence?: string;
}

let _blockIdCounter = 0;
export const genBlockId = () => `blk-${++_blockIdCounter}-${Date.now().toString(36)}`;

export function parseMarkdownToBlocks(md: string): Block[] {
  if (!md.trim()) return [{ id: genBlockId(), type: 'paragraph', content: '' }];
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const code = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (code) {
      const fence = code[1];
      const closing = new RegExp(`^${fence[0]}{${fence.length},}\\s*$`);
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !closing.test(lines[j])) { codeLines.push(lines[j]); j++; }
      blocks.push({ id: genBlockId(), type: 'code', content: codeLines.join('\n'), language: code[2], fence });
      i = j + 1; continue;
    }
    if (/^(---+|___+|\*\*\*+)$/.test(line.trim())) { blocks.push({ id: genBlockId(), type: 'divider', content: '' }); i++; continue; }
    const h3 = line.match(/^### (.+)/);
    if (h3) { blocks.push({ id: genBlockId(), type: 'h3', content: h3[1] }); i++; continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { blocks.push({ id: genBlockId(), type: 'h2', content: h2[1] }); i++; continue; }
    const h1 = line.match(/^# (.+)/);
    if (h1) { blocks.push({ id: genBlockId(), type: 'h1', content: h1[1] }); i++; continue; }
    const check = line.match(/^- \[([ x])\]\s*(.*)/);
    if (check) { blocks.push({ id: genBlockId(), type: 'checkbox', content: check[2], checked: check[1] === 'x' }); i++; continue; }
    const bullet = line.match(/^[-*+]\s+(.*)/);
    if (bullet) { blocks.push({ id: genBlockId(), type: 'bullet', content: bullet[1] }); i++; continue; }
    const ordered = line.match(/^(\d+)\.\s+(.*)/);
    if (ordered) { blocks.push({ id: genBlockId(), type: 'ordered', content: ordered[2] }); i++; continue; }
    const bq = line.match(/^>\s*(.*)/);
    if (bq) { blocks.push({ id: genBlockId(), type: 'blockquote', content: bq[1] }); i++; continue; }
    if (!line.trim()) { blocks.push({ id: genBlockId(), type: 'paragraph', content: '' }); i++; continue; }
    blocks.push({ id: genBlockId(), type: 'paragraph', content: line });
    i++;
  }
  if (blocks.length === 0) blocks.push({ id: genBlockId(), type: 'paragraph', content: '' });
  return blocks;
}

export function serializeBlocksToMarkdown(blocks: Block[]): string {
  return blocks.map((b, i) => {
    switch (b.type) {
      case 'h1': return `# ${b.content}`;
      case 'h2': return `## ${b.content}`;
      case 'h3': return `### ${b.content}`;
      case 'bullet': return `- ${b.content}`;
      case 'ordered': {
        let num = 1;
        for (let j = i - 1; j >= 0 && blocks[j].type === 'ordered'; j--) num++;
        return `${num}. ${b.content}`;
      }
      case 'checkbox': return `- [${b.checked ? 'x' : ' '}] ${b.content}`;
      case 'blockquote': return `> ${b.content}`;
      case 'code': {
        const marker = b.fence?.[0] ?? '`';
        let length = Math.max(3, b.fence?.length ?? 3);
        for (const match of b.content.matchAll(new RegExp(`${marker}+`, 'g'))) length = Math.max(length, match[0].length + 1);
        const fence = marker.repeat(length);
        return `${fence}${b.language ?? ''}\n${b.content}\n${fence}`;
      }
      case 'divider': return '---';
      default: return b.content;
    }
  }).join('\n');
}

export function moveNoteBlock(blocks: Block[], from: number, to: number): Block[] {
  if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length || from === to) return blocks;
  const result = [...blocks];
  const [block] = result.splice(from, 1); result.splice(to, 0, block);
  return result;
}

export function formatNoteBlock(blocks: Block[], id: string | null, type: BlockType): { blocks: Block[]; focusId: string } {
  const index = blocks.findIndex(block => block.id === id);
  const target = blocks[index] ?? blocks[blocks.length - 1];
  if (type === 'divider') {
    const paragraph: Block = { id: genBlockId(), type: 'paragraph', content: '' };
    const divider: Block = { id: genBlockId(), type: 'divider', content: '' };
    const result = [...blocks];
    const at = target ? result.indexOf(target) : 0;
    if (target?.content) result.splice(at + 1, 0, divider, paragraph);
    else result.splice(at, target ? 1 : 0, divider, paragraph);
    return { blocks: result, focusId: paragraph.id };
  }
  if (!target) { const block: Block = { id: genBlockId(), type, content: '' }; return { blocks: [block], focusId: block.id }; }
  return { blocks: blocks.map(block => block === target ? { ...block, type, checked: type === 'checkbox' ? Boolean(block.checked) : undefined } : block), focusId: target.id };
}

export function detectMarkdownPrefix(text: string): { type: BlockType; content: string; checked?: boolean } | null {
  if (text === '``` ' || text === '~~~ ') return { type: 'code', content: '' };
  if (text.startsWith('### ')) return { type: 'h3', content: text.slice(4) };
  if (text.startsWith('## ')) return { type: 'h2', content: text.slice(3) };
  if (text.startsWith('# ')) return { type: 'h1', content: text.slice(2) };
  if (text.startsWith('- [x] ')) return { type: 'checkbox', content: text.slice(6), checked: true };
  if (text.startsWith('- [ ] ')) return { type: 'checkbox', content: text.slice(6), checked: false };
  if (text.startsWith('[] ')) return { type: 'checkbox', content: text.slice(3), checked: false };
  if (/^[-*+] /.test(text)) return { type: 'bullet', content: text.slice(2) };
  if (/^\d+\. /.test(text)) { const m = text.match(/^\d+\. /); return m ? { type: 'ordered', content: text.slice(m[0].length) } : null; }
  if (text.startsWith('> ')) return { type: 'blockquote', content: text.slice(2) };
  if (text === '---' || text === '***' || text === '___') return { type: 'divider', content: '' };
  return null;
}
