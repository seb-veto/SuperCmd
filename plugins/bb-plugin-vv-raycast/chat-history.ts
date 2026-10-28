import type { Chat } from './contract';

export type ChatProject = { id: string; name: string };
export type HistoryGroup = { id: string; label: string; kind: 'pinned' | 'project' | 'recent' | 'archived'; projectId?: string; buckets: { label: string; chats: Chat[] }[] };
const activity = (chat: Chat) => chat.activityAt || chat.createdAt;

function dateLabel(timestamp: number, now: Date) {
  if (!timestamp) return 'Older';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const week = new Date(today); week.setDate(today.getDate() - (today.getDay() + 6) % 7);
  const lastWeek = new Date(week); lastWeek.setDate(week.getDate() - 7);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (timestamp >= today.getTime() && timestamp < tomorrow.getTime()) return 'Today';
  if (timestamp >= tomorrow.getTime()) return new Date(timestamp).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
  if (timestamp >= yesterday.getTime()) return 'Yesterday';
  if (timestamp >= week.getTime()) return 'This Week';
  if (timestamp >= lastWeek.getTime()) return 'Last Week';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en', { month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export function chatHistory(chats: Chat[], projects: ChatProject[], query: string, archived = false, now = new Date()): HistoryGroup[] {
  const visible = chats.filter(chat => chat.archived === archived && chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => activity(b) - activity(a) || a.id.localeCompare(b.id));
  const groups: HistoryGroup[] = [];
  const pinned = visible.filter(chat => chat.pinned);
  if (pinned.length) groups.push({ id: 'pinned', label: 'Pinned', kind: 'pinned', buckets: [{ label: '', chats: pinned }] });
  let remaining = visible.filter(chat => !chat.pinned);
  for (const project of [...projects].sort((a, b) => a.name.localeCompare(b.name))) {
    const members = remaining.filter(chat => chat.projectId === project.id);
    if (!members.length) continue;
    groups.push({ id: `project:${project.id}`, label: project.name, kind: 'project', projectId: project.id, buckets: [{ label: '', chats: members }] });
    remaining = remaining.filter(chat => chat.projectId !== project.id);
  }
  const buckets = new Map<string, Chat[]>();
  for (const chat of remaining) {
    const label = dateLabel(activity(chat), now);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(chat);
  }
  if (remaining.length) groups.push({ id: archived ? 'archived' : 'recent', label: archived ? 'Archived' : 'Recent', kind: archived ? 'archived' : 'recent', buckets: Array.from(buckets, ([label, chats]) => ({ label, chats })) });
  return groups;
}
