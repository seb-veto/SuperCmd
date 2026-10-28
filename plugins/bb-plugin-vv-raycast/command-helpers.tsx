import type { ReactNode } from 'react';
import type { CommandInfo } from './types';
export type LauncherAction = { id: string; title: string; shortcut?: string; style?: 'default' | 'destructive'; icon?: ReactNode; separatorBefore?: boolean; execute: () => void | Promise<void> };
export const getCategoryLabel = (category: string, _t?: unknown) => category === 'app' ? 'Application' : 'Command';
export const getCommandAccessoryLabel = (command: CommandInfo) => command.subtitle ?? '';
export const getCommandDisplayTitle = (command: CommandInfo, _t?: unknown) => command.title;
export const getCommandTypeBadgeLabel = (command: CommandInfo, _t?: unknown) => command.category === 'app' ? '' : 'Command';
export const getShortcutDisplayParts = (shortcut: string) => shortcut.replace('Cmd', '⌘').replace('Enter', '↵').split('+');
export const renderCommandIcon = (command: CommandInfo) => <span aria-hidden="true">{command.iconEmoji ?? (command.category === 'app' ? '▣' : '✦')}</span>;
