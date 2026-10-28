import type { CSSProperties, ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  Bold: <path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z" />,
  Italic: <path d="M11 4h8M5 20h8M15 4 9 20" />,
  Underline: <><path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16" /></>,
  Strikethrough: <><path d="M18 6c-1-2-3-3-6-3-4 0-6 2-6 4 0 3 4 4 6 5 3 1 6 2 6 5s-3 4-6 4c-3 0-5-1-6-3M3 12h18" /></>,
  Type: <path d="M4 4h16M12 4v16M8 20h8M4 4v3M20 4v3" />,
  Quote: <><path d="M4 6h6v7H5c0 3 1 4 3 5M14 6h6v7h-5c0 3 1 4 3 5" /></>,
  List: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  ListOrdered: <><path d="M10 6h11M10 12h11M10 18h11M3 3h2v6M3 9h4M3 14c3-2 5 1 2 3l-2 3h4" /></>,
  ListChecks: <><path d="M10 6h11M10 12h11M10 18h11M2 5l2 2 3-4" /><rect x="2" y="10" width="5" height="5" rx="1" /><rect x="2" y="18" width="5" height="4" rx="1" /></>,
  PanelTop: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M4 8h16M8 12h8M8 16h8" /></>,
  FileText: <><path d="M6 3h8l5 5v13H6zM14 3v6h5M9 13h7M9 17h5" /></>,
  Code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />,
  Minus: <path d="M4 12h16" />,
  Plus: <path d="M4 12h16M12 4v16" />,
  Search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  Link: <><path d="m10 8 3-3a5 5 0 0 1 7 7l-3 3M14 16l-3 3a5 5 0 0 1-7-7l3-3M8 16l8-8" /></>,
  Pin: <path d="M8 3h8l-1 6 4 5H5l4-5-1-6M12 14v7" />,
  Folder: <path d="M3 7V5h7l2 2h9v13H3z" />,
  Globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  GripVertical: <>{[7, 12, 17].flatMap(y => [9, 15].map(x => <circle key={`${x}:${y}`} cx={x} cy={y} r=".8" />))}</>,
};

export function LauncherIcon({ name, className, style }: { name: string; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.FileText}</svg>;
}
