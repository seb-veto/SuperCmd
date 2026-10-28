export function editableForRange(range: Pick<Range, 'startContainer' | 'endContainer'>, root: Pick<HTMLElement, 'contains'>): HTMLElement | null {
  const editable = (node: Node) => (node.nodeType === 1 ? node as Element : node.parentElement)?.closest<HTMLElement>('[contenteditable]') ?? null;
  const start = editable(range.startContainer), end = editable(range.endContainer);
  return start && start === end && root.contains(start) ? start : null;
}
