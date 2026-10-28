import { useState } from 'react';
import { experimental_Icon as Icon } from '@get-bb/plugin-sdk/app';
import type { Chat } from './contract';

export function ChatSidebar({ chats, selected, onSelect, onNew, onActions, onHide }: {
  chats: Chat[];
  selected: string | null;
  onSelect: (chat: Chat) => void;
  onNew: () => void;
  onActions: (chat: Chat) => void;
  onHide: () => void;
}) {
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const visible = chats.filter(chat => chat.archived === archived && chat.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const groups = [
    { label: 'Pinned', chats: visible.filter(chat => chat.pinned) },
    { label: archived ? 'Archived' : 'Recent', chats: visible.filter(chat => !chat.pinned) },
  ];
  return <aside className="rc-chat-sidebar" aria-label="Chat history">
    <div className="rc-sidebar-controls">
      <button title="Hide chat history" aria-label="Hide chat history" onClick={onHide}><Icon name="PanelLeft" className="rc-icon" /></button>
      <button title="Start new chat" aria-label="Start new chat" onClick={onNew}><Icon name="Edit" className="rc-icon" /></button>
    </div>
    <label className="rc-chat-search"><Icon name="Search" className="rc-icon small" aria-hidden="true" /><input aria-label="Search chat titles" placeholder="Search chats" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="rc-chat-groups">
      {groups.map(group => group.chats.length > 0 && <section key={group.label} aria-label={group.label}>
        <h2>{group.label === 'Pinned' ? <svg className="rc-icon small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3h8l-1 6 4 5H5l4-5-1-6ZM12 14v7" strokeLinejoin="round" /></svg> : archived ? <Icon name="Archive" className="rc-icon small" /> : <Icon name="MessageSquare" className="rc-icon small" />}{group.label}</h2>
        {group.chats.map(chat => <div key={chat.id} className={`rc-history-item ${selected === chat.id ? 'is-selected' : ''}`}>
          <button className="rc-history-title" aria-current={selected === chat.id ? 'page' : undefined} title="Open this chat" onClick={() => onSelect(chat)} onContextMenu={event => { event.preventDefault(); onActions(chat); }}>{chat.title}</button>
          <button className="rc-history-more" title="Show chat actions" aria-label={`Actions for ${chat.title}`} onClick={() => onActions(chat)}>···</button>
        </div>)}
      </section>)}
      {!visible.length && <p className="rc-history-empty">{query ? 'No matching chats' : archived ? 'No archived chats' : 'Your chats will appear here'}</p>}
    </div>
    <button className="rc-archive-toggle" aria-pressed={archived} title={archived ? 'Show recent chats' : 'Show archived chats'} onClick={() => setArchived(value => !value)}><Icon name="Archive" className="rc-icon small" />{archived ? 'Back to Recent' : 'Archived'}</button>
    <p className="rc-sidebar-help">Click or press Enter to open a chat.<br />Use ··· for pin, rename and archive.</p>
  </aside>;
}
