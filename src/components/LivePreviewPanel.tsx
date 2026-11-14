import React, { useState } from 'react';
import {
  ExternalLink,
  Hammer,
  Maximize2,
  Monitor,
  RotateCw,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import type { RuntimePreviewEvent, WorkspaceDetail } from '../types';

interface LivePreviewPanelProps {
  workspace: WorkspaceDetail;
  isBuilding: boolean;
  runtimeEvents: RuntimePreviewEvent[];
  onClearRuntimeEvents: () => void;
  onTriggerBuild: () => void;
  onMountFullApp: () => void;
}

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  workspace,
  isBuilding,
  runtimeEvents,
  onClearRuntimeEvents,
  onTriggerBuild,
  onMountFullApp,
}) => {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [subRoute, setSubRoute] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  if (workspace.status !== 'succeeded' || !workspace.previewUrl) {
    return (
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-12 text-center max-w-2xl mx-auto my-8 space-y-4 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Project Preview Not Built Yet
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Compile <code>{workspace.owner}/{workspace.repoName}</code> to install its packages, normalize relative asset paths, and mount the live interactive application here.
        </p>
        <div className="pt-2">
          <button
            type="button"
            disabled={isBuilding}
            onClick={onTriggerBuild}
            className="h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Hammer className="w-4 h-4" />
            <span>{isBuilding ? 'Building Project...' : 'Build Whole Project Now'}</span>
          </button>
        </div>
      </div>
    );
  }

  const cleanSub = subRoute.replace(/^\/+/, '');
  const iframeSrc = `${workspace.previewUrl}${cleanSub}${
    cleanSub.includes('?') ? '&' : '?'
  }_rf=${reloadKey}`;

  const widthClass =
    viewport === 'mobile'
      ? 'w-[390px]'
      : viewport === 'tablet'
      ? 'w-[768px]'
      : 'w-full';

  return (
    <div className="space-y-6">
      {/* Preview Chrome Bar */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-2xs">
        {/* Responsive Device Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewport === 'desktop'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport('tablet')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewport === 'tablet'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Tablet className="w-3.5 h-3.5" />
              <span>768px</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewport === 'mobile'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>390px</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload preview"
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-600" />
            <span>Reload</span>
          </button>
        </div>

        {/* Route Path Input */}
        <div className="flex-1 flex items-center bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-9 font-mono text-xs">
          <span className="text-slate-500 shrink-0">{workspace.previewUrl}</span>
          <input
            type="text"
            value={subRoute}
            onChange={(e) => setSubRoute(e.target.value)}
            placeholder="optional-route"
            className="flex-1 bg-transparent text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {/* Full-Screen & External Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={workspace.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>New Tab</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          </a>

          <button
            type="button"
            onClick={onMountFullApp}
            className="h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Mount Full-Screen App</span>
          </button>
        </div>
      </div>

      {/* Responsive Sandbox Iframe Canvas */}
      <div className="border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-[#070A10] rounded-2xl p-4 flex justify-center overflow-x-auto">
        <div
          className={`${widthClass} h-[640px] bg-white rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-sm transition-opacity duration-150`}
        >
          <iframe
            key={`${workspace.id}-${reloadKey}`}
            src={iframeSrc}
            title={`${workspace.owner}/${workspace.repoName} Live Preview`}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>

      {/* Captured Runtime Console Diagnostics */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
            Iframe Runtime Diagnostics ({runtimeEvents.length} warnings/errors)
          </div>
          {runtimeEvents.length > 0 && (
            <button
              type="button"
              onClick={onClearRuntimeEvents}
              className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
        <div className="p-4 bg-[#0F172A] font-mono text-xs max-h-40 overflow-y-auto space-y-1">
          {runtimeEvents.length === 0 ? (
            <div className="text-slate-400">
              Zero runtime errors reported from the preview frame.
            </div>
          ) : (
            runtimeEvents.map((ev) => (
              <div
                key={ev.id}
                className={ev.level === 'error' ? 'text-rose-400' : 'text-amber-300'}
              >
                [{ev.timestamp}] {ev.level.toUpperCase()}: {ev.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
