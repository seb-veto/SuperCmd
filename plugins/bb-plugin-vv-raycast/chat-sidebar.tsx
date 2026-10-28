import { experimental_Icon as Icon } from '@get-bb/plugin-sdk/app';
import type { Chat } from './contract';
import type { HistoryGroup } from './chat-history';

export function ChatSidebar({ groups, query, onQuery, archived, onArchived, shortcuts, selected, onSelect, onNew, onActions, onHide }: {
  groups: HistoryGroup[];
  query: string;
  onQuery: (value: string) => void;
  archived: boolean;
  onArchived: (value: boolean) => void;
  shortcuts: boolean;
  selected: string | null;
  onSelect: (chat: Chat) => void;
  onNew: () => void;
  onActions: (chat: Chat) => void;
  onHide: () => void;
}) {
  const targets = groups.flatMap(group => group.buckets.flatMap(bucket => bucket.chats)).slice(0, 10);
  return <aside className="rc-chat-sidebar" aria-label="Chat history">
    <div className="rc-sidebar-controls">
      <button title="Hide chat history" aria-label="Hide chat history" onClick={onHide}><Icon name="PanelLeft" className="rc-icon" /></button>
      <button title="Start new chat" aria-label="Start new chat" onClick={onNew}><Icon name="Edit" className="rc-icon" /></button>
    </div>
    <label className="rc-chat-search"><Icon name="Search" className="rc-icon small" aria-hidden="true" /><input aria-label="Search chat titles" placeholder="Search chats" value={query} onChange={event => onQuery(event.target.value)} /></label>
    <div className="rc-chat-groups">
      {groups.map(group => <section key={group.id} aria-label={group.label}>
        <h2>{group.kind === 'pinned' ? <svg className="rc-icon small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3h8l-1 6 4 5H5l4-5-1-6ZM12 14v7" strokeLinejoin="round" /></svg> : group.kind === 'project' ? <Icon name="Folder" className="rc-icon small" /> : archived ? <Icon name="Archive" className="rc-icon small" /> : <Icon name="MessageSquare" className="rc-icon small" />}{group.label}</h2>
        {group.buckets.map(bucket => <div key={bucket.label} className="rc-history-bucket">{bucket.label && <h3>{bucket.label}</h3>}{bucket.chats.map(chat => <div key={chat.id} className={`rc-history-item ${selected === chat.id ? 'is-selected' : ''}`}>
          <button className="rc-history-title" aria-current={selected === chat.id ? 'page' : undefined} title="Open this chat" aria-description="Click or press Enter to open. Command or Control 1–0 jumps to the first ten chats." aria-keyshortcuts={targets.includes(chat) ? `Meta+${(targets.indexOf(chat) + 1) % 10} Control+${(targets.indexOf(chat) + 1) % 10}` : undefined} onClick={() => onSelect(chat)} onContextMenu={event => { event.preventDefault(); onActions(chat); }}>{chat.title}</button>
          <button className="rc-history-more" title="Show chat actions" aria-label={`Actions for ${chat.title}`} onClick={() => onActions(chat)}>···</button>{shortcuts && targets.includes(chat) && <kbd className="rc-history-shortcut" aria-hidden="true">{(targets.indexOf(chat) + 1) % 10}</kbd>}
        </div>)}</div>)}
      </section>)}
      {!groups.length && <p className="rc-history-empty">{query ? 'No matching chats' : archived ? 'No archived chats' : 'Your chats will appear here'}</p>}
    </div>
    <button className="rc-archive-toggle" aria-pressed={archived} title={archived ? 'Show recent chats' : 'Show archived chats'} onClick={() => onArchived(!archived)}><Icon name="Archive" className="rc-icon small" />{archived ? 'Back to Recent' : 'Archived'}</button>
    <p className="rc-sidebar-help">Click or press Enter to open a chat.<br />⌘/Ctrl 1–0 jumps to a chat.<br />Use ··· for pin, rename and archive.</p>
  </aside>;
}
