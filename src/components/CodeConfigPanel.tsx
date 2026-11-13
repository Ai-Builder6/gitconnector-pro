import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileCode,
  FileText,
  Folder,
  Hammer,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { EnvVarItem, WorkspaceDetail } from '../types';
import { formatBytes } from '../utils/format';

interface CodeConfigPanelProps {
  workspace: WorkspaceDetail;
  initialFilePath: string | null;
  isBuilding: boolean;
  onSaveEnvVars: (vars: EnvVarItem[]) => Promise<void>;
  onTriggerBuild: () => void;
}

export const CodeConfigPanel: React.FC<CodeConfigPanelProps> = ({
  workspace,
  initialFilePath,
  isBuilding,
  onSaveEnvVars,
  onTriggerBuild,
}) => {
  const [subView, setSubView] = useState<'code' | 'env'>('code');
  const [fileFilter, setFileFilter] = useState('');
  const [scopeToTarget, setScopeToTarget] = useState(Boolean(workspace.targetSubPath));

  const [selectedPath, setSelectedPath] = useState<string | null>(initialFilePath);
  const [originalContent, setOriginalContent] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [envDraft, setEnvDraft] = useState<EnvVarItem[]>(workspace.envVars);
  const [savingEnv, setSavingEnv] = useState(false);
  const [envSavedNotice, setEnvSavedNotice] = useState(false);

  useEffect(() => {
    setEnvDraft(workspace.envVars);
  }, [workspace.id, workspace.envVars]);

  useEffect(() => {
    setScopeToTarget(Boolean(workspace.targetSubPath));
  }, [workspace.id, workspace.targetSubPath]);

  const loadFile = async (filePath: string) => {
    setSelectedPath(filePath);
    setSubView('code');
    setLoadingFile(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/file?path=${encodeURIComponent(filePath)}`
      );
      if (res.ok) {
        const data = (await res.json()) as { content: string };
        setOriginalContent(data.content);
        setEditorContent(data.content);
      } else {
        setOriginalContent('');
        setEditorContent('Unable to read file from workspace.');
      }
    } catch {
      setEditorContent('Network error while reading file.');
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => {
    if (initialFilePath) {
      void loadFile(initialFilePath);
      return;
    }
    const defaultCandidate = workspace.files.find(
      (f) =>
        f.type === 'file' &&
        (workspace.targetSubPath ? f.path.startsWith(`${workspace.targetSubPath}/`) : true) &&
        (f.path.endsWith('package.json') ||
          f.path.endsWith('App.tsx') ||
          f.path.endsWith('index.html') ||
          f.path.endsWith('README.md'))
    );
    if (defaultCandidate) {
      void loadFile(defaultCandidate.path);
    }
  }, [workspace.id, workspace.targetSubPath, initialFilePath]);

  const visibleFiles = useMemo(() => {
    return workspace.files.filter((f) => {
      if (f.type !== 'file') return false;
      if (scopeToTarget && workspace.targetSubPath) {
        if (!f.path.startsWith(`${workspace.targetSubPath}/`) && f.path !== workspace.targetSubPath) {
          return false;
        }
      }
      if (fileFilter.trim() && !f.path.toLowerCase().includes(fileFilter.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [workspace.files, workspace.targetSubPath, scopeToTarget, fileFilter]);

  const isDirty = selectedPath !== null && editorContent !== originalContent;

  const handleSaveFile = async (andRebuild = false) => {
    if (!selectedPath) return;
    setSavingFile(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content: editorContent }),
      });
      if (res.ok) {
        setOriginalContent(editorContent);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
        if (andRebuild) {
          onTriggerBuild();
        }
      }
    } finally {
      setSavingFile(false);
    }
  };

  const handleSaveEnv = async () => {
    setSavingEnv(true);
    try {
      await onSaveEnvVars(envDraft);
      setEnvSavedNotice(true);
      setTimeout(() => setEnvSavedNotice(false), 2000);
    } finally {
      setSavingEnv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setSubView('code')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subView === 'code'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Source Inspector &amp; Live Editor
          </button>
          <button
            type="button"
            onClick={() => setSubView('env')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subView === 'env'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Environment Variables ({envDraft.length})
          </button>
        </div>

        <div className="text-xs text-slate-400">
          Edits write directly to the sandboxed clone on disk — save any file and click Rebuild to recompile.
        </div>
      </div>

      {subView === 'code' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* File Explorer */}
          <div className="lg:col-span-4 border border-slate-800 bg-[#111827] rounded-xl flex flex-col h-[640px] overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder="Search files by path..."
                  className="w-full h-8 pl-8 pr-3 rounded-md bg-[#0B0F17] border border-slate-800 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              {workspace.targetSubPath && (
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={scopeToTarget}
                    onChange={(e) => setScopeToTarget(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span className="truncate">
                    Scope to <code className="text-slate-200">{workspace.targetSubPath}</code>
                  </span>
                </label>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
              {visibleFiles.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No matching files found.
                </div>
              ) : (
                visibleFiles.map((file) => {
                  const active = selectedPath === file.path;
                  const displayPath =
                    scopeToTarget &&
                    workspace.targetSubPath &&
                    file.path.startsWith(`${workspace.targetSubPath}/`)
                      ? file.path.slice(workspace.targetSubPath.length + 1)
                      : file.path;

                  const isCode = /\.(tsx?|jsx?|mjs|vue|svelte|css|scss|html|json)$/i.test(file.path);

                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => void loadFile(file.path)}
                      className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-950/40 text-white'
                          : 'text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {isCode ? (
                          <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        ) : file.type === 'dir' ? (
                          <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="font-mono truncate" title={file.path}>
                          {displayPath}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                        {formatBytes(file.size)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Code Editor */}
          <div className="lg:col-span-8 border border-slate-800 bg-[#111827] rounded-xl flex flex-col h-[640px] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-slate-200 truncate">
                  {selectedPath || 'Select a file to inspect'}
                </span>
                {isDirty && (
                  <span className="text-xs text-amber-400 whitespace-nowrap shrink-0">
                    · Unsaved changes
                  </span>
                )}
                {savedNotice && (
                  <span className="text-xs text-emerald-400 whitespace-nowrap shrink-0">
                    · Saved to disk
                  </span>
                )}
              </div>

              {selectedPath && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(editorContent);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1500);
                    }}
                    className="h-8 px-2.5 rounded-md border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-xs text-slate-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isDirty || savingFile}
                    onClick={() => void handleSaveFile(false)}
                    className="h-8 px-3 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {savingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save</span>
                  </button>

                  <button
                    type="button"
                    disabled={savingFile || isBuilding}
                    onClick={() => void handleSaveFile(true)}
                    className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    <span>Save &amp; Rebuild</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 bg-[#0B0F17] relative overflow-hidden">
              {loadingFile ? (
                <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Loading source file...</span>
                </div>
              ) : selectedPath ? (
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full p-4 bg-transparent text-slate-200 font-mono text-xs leading-relaxed resize-none focus:outline-none"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Choose any file from the left tree to view and edit its source code.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Environment Variable Configurator */
        <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Build &amp; Runtime Environment (.env)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Keys extracted from <code>.env.example</code> and static source code analysis. Values are injected during project builds.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setEnvDraft((prev) => [...prev, { key: '', value: '', source: 'custom' }])
                }
                className="h-9 px-3 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variable</span>
              </button>
              <button
                type="button"
                disabled={savingEnv}
                onClick={() => void handleSaveEnv()}
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {savingEnv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{envSavedNotice ? 'Saved!' : 'Save Environment'}</span>
              </button>
            </div>
          </div>

          {envDraft.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-3">
              <p className="text-xs text-slate-400">
                No required environment variables were detected in this repository.
              </p>
              <button
                type="button"
                onClick={() =>
                  setEnvDraft([{ key: 'VITE_API_URL', value: '', source: 'custom' }])
                }
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Variable</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {envDraft.map((item, idx) => (
                <div key={idx} className="px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="text"
                    value={item.key}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEnvDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, key: val } : row))
                      );
                    }}
                    placeholder="VARIABLE_NAME"
                    className="sm:w-64 h-9 px-3 rounded-md bg-[#0B0F17] border border-slate-800 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEnvDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, value: val } : row))
                      );
                    }}
                    placeholder="Value (injected at build time)"
                    className="flex-1 h-9 px-3 rounded-md bg-[#0B0F17] border border-slate-800 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-slate-500 sm:w-24 text-right shrink-0">
                    {item.source}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEnvDraft((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-slate-500 hover:text-rose-400 transition-colors self-end sm:self-center cursor-pointer"
                    title="Remove variable"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
