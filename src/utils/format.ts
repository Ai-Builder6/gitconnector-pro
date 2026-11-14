import type { BuildStatus } from '../types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function getStatusDisplay(status: BuildStatus): {
  label: string;
  colorClass: string;
} {
  switch (status) {
    case 'cloning':
      return { label: 'Cloning repository', colorClass: 'text-cyan-600 dark:text-cyan-400 font-semibold' };
    case 'building':
      return { label: 'Building project', colorClass: 'text-orange-600 dark:text-amber-400 font-semibold' };
    case 'succeeded':
      return { label: 'Build succeeded', colorClass: 'text-emerald-600 dark:text-emerald-400 font-semibold' };
    case 'failed':
      return { label: 'Build failed', colorClass: 'text-rose-600 dark:text-rose-400 font-semibold' };
    case 'ready':
      return { label: 'Inspected · Ready to build', colorClass: 'text-blue-600 dark:text-sky-400 font-medium' };
    default:
      return { label: 'Idle', colorClass: 'text-slate-500 dark:text-slate-400' };
  }
}
