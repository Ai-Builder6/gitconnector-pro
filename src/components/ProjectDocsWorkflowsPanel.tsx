import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { marked } from 'marked';
import type {
  GeneratedDocFile,
  GeneratedProjectDocsBundle,
  WorkspaceDetail,
} from '../types';
import { apiFetch } from '../utils/api';
import { GoogleDriveExportCard } from './GoogleDriveExportCard';

interface ProjectDocsWorkflowsPanelProps {
  workspace: WorkspaceDetail;
  onRefreshWorkspace: () => Promise<void>;
}

export const ProjectDocsWorkflowsPanel: React.FC<ProjectDocsWorkflowsPanelProps> = ({
  workspace,
  onRefreshWorkspace,
}) => {
  const [bundle, setBundle] = useState<GeneratedProjectDocsBundle | null>(null);
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  const [activePath, setActivePath] = useState<string>('');
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchGeneratedBundle = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}/generated-docs`);
      const payload = (await res.json()) as {
        bundle?: GeneratedProjectDocsBundle;
        error?: string;
      };
      if (!res.ok || !payload.bundle) {
        throw new Error(payload.error || 'Failed to synthesize README and workflows.');
      }
      setBundle(payload.bundle);
      const map: Record<string, string> = {};
      for (const f of payload.bundle.files) {
        map[f.path] = f.content;
      }
      setEditedContents(map);
      setActivePath((prev) =>
        payload.bundle!.files.some((f) => f.path === prev)
          ? prev
          : payload.bundle!.files[0]?.path || ''
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate project docs.');
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    void fetchGeneratedBundle();
  }, [fetchGeneratedBundle, workspace.targetSubPath]);

  const activeFile: GeneratedDocFile | null = useMemo(() => {
    if (!bundle || !bundle.files.length) return null;
    return bundle.files.find((f) => f.path === activePath) || bundle.files[0];
  }, [bundle, activePath]);

  useEffect(() => {
    if (activeFile && activeFile.kind === 'workflow' && viewMode === 'preview') {
      setViewMode('edit');
    }
  }, [activeFile, viewMode]);

  const activeContent = activeFile ? editedContents[activeFile.path] ?? activeFile.content : '';

  const renderedMarkdownHtml = useMemo(() => {
    if (!activeFile || activeFile.kind !== 'readme') return '';
    try {
      return marked.parse(activeContent) as string;
    } catch {
      return '<p>Unable to render Markdown preview.</p>';
    }
  }, [activeFile, activeContent]);

  const handleCopyActive = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleDownloadActiveFile = () => {
    if (!activeFile) return;
    const filename = activeFile.path.split('/').pop() || 'generated-file.txt';
    const blob = new Blob([activeContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const existingFilesCount = useMemo(() => {
    if (!bundle) return 0;
    return bundle.files.filter((f) => f.existsOnDisk).length;
  }, [bundle]);

  const executeWriteToWorkspace = async () => {
    if (!bundle) return;
    setConfirmOverwriteOpen(false);
    setApplying(true);
    setErrorMsg(null);
    setStatusNotice(null);

    try {
      const filesPayload = bundle.files.map((f) => ({
        path: f.path,
        content: editedContents[f.path] ?? f.content,
      }));

      const res = await apiFetch(`/api/workspaces/${workspace.id}/generated-docs/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesPayload }),
      });

      const payload = (await res.json()) as {
        appliedPaths?: string[];
        bundle?: GeneratedProjectDocsBundle;
        error?: string;
      };

      if (!res.ok || !payload.appliedPaths) {
        throw new Error(payload.error || 'Failed to write generated files to workspace.');
      }

      if (payload.bundle) {
        setBundle(payload.bundle);
      }
      await onRefreshWorkspace();
      setStatusNotice(
        `Wrote ${payload.appliedPaths.length} file(s) directly into workspace (${payload.appliedPaths.join(', ')}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to write files to workspace.');
    } finally {
      setApplying(false);
    }
  };

  const handleWriteAllClick = () => {
    if (existingFilesCount > 0) {
      setConfirmOverwriteOpen(true);
      return;
    }
    void executeWriteToWorkspace();
  };

  const customDocsForDrive = useMemo(() => {
    if (!bundle) return undefined;
    return bundle.files.map((f) => ({
      path: f.path,
      content: editedContents[f.path] ?? f.content,
    }));
  }, [bundle, editedContents]);

  return (
    <div className="space-y-8">
      {/* Top Action Header Card */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Examined Repository</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {workspace.owner}/{workspace.repoName}@{workspace.branch}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-orange-600 dark:text-orange-400 font-semibold">
                {workspace.framework}
              </span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Tailored README.md &amp; GitHub Actions Workflows Generator
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-3xl">
              Synthesized directly from this project&apos;s detected stack, scripts, dependencies, environment variables, and database schema. Edit any file below, download the pack, or write directly into the workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={loading || applying}
              onClick={() => void fetchGeneratedBundle()}
              className="h-10 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Regenerate from Repo</span>
            </button>

            <a
              href={`/api/workspaces/${workspace.id}/generated-docs/download`}
              className="h-10 px-3.5 rounded-lg border border-cyan-300 dark:border-cyan-600/50 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 text-cyan-900 dark:text-cyan-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Download Docs &amp; Workflows (.tar.gz)</span>
            </a>

            <button
              type="button"
              disabled={loading || applying || !bundle}
              onClick={handleWriteAllClick}
              className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              {applying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Write README &amp; Workflows to Workspace</span>
            </button>
          </div>
        </div>

        {confirmOverwriteOpen && (
          <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                {existingFilesCount} file(s) (such as <code className="font-mono">README.md</code>) already exist in this cloned workspace. Replace them with the tailored versions shown below?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmOverwriteOpen(false)}
                className="h-8 px-3 rounded-md border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeWriteToWorkspace()}
                className="h-8 px-3.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-semibold cursor-pointer"
              >
                Confirm &amp; Write Files
              </button>
            </div>
          </div>
        )}

        {statusNotice && (
          <div className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 text-xs">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Main Generator Workbench */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
        {loading && !bundle ? (
          <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            <span>Synthesizing tailored README.md and GitHub Actions workflows...</span>
          </div>
        ) : bundle && activeFile ? (
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left File Selector Rail */}
            <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {bundle.files.map((file) => {
                const selected = file.path === activeFile.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => {
                      setActivePath(file.path);
                      if (file.kind === 'readme') {
                        setViewMode('preview');
                      } else {
                        setViewMode('edit');
                      }
                    }}
                    className={`w-full text-left p-4 transition-colors cursor-pointer flex items-start gap-3 ${
                      selected
                        ? 'bg-orange-50/70 dark:bg-orange-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {file.kind === 'readme' ? (
                      <FileText className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    ) : (
                      <GitBranch className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {file.label}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {file.description}
                      </p>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        {file.existsOnDisk ? 'Present in workspace' : 'New generated file'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Preview / Editor Pane */}
            <div className="lg:col-span-8 flex flex-col min-w-0">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#0B0F17]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-200 truncate">
                    {activeFile.path}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                    {activeContent.split('\n').length} lines
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeFile.kind === 'readme' && (
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          viewMode === 'preview'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          viewMode === 'edit'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>Edit Markdown</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleCopyActive()}
                    className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadActiveFile}
                    className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-500" />
                    <span>Download File</span>
                  </button>
                </div>
              </div>

              {activeFile.kind === 'readme' && viewMode === 'preview' ? (
                <div
                  className="p-6 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-h-[600px] overflow-y-auto space-y-3 [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:text-slate-900 dark:[&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_a]:text-orange-600 dark:[&_a]:text-cyan-400 [&_a]:underline [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 dark:[&_code]:bg-[#0B0F17] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border-b [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_th]:py-2 [&_th]:px-3 [&_th]:text-left [&_td]:border-b [&_td]:border-slate-100 dark:[&_td]:border-slate-800 [&_td]:py-2 [&_td]:px-3 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }}
                />
              ) : (
                <textarea
                  value={activeContent}
                  onChange={(e) =>
                    setEditedContents((prev) => ({
                      ...prev,
                      [activeFile.path]: e.target.value,
                    }))
                  }
                  spellCheck={false}
                  aria-label={`Edit ${activeFile.path}`}
                  className="w-full h-[560px] p-5 font-mono text-xs leading-relaxed bg-[#0B0F17] text-slate-100 focus:outline-none resize-y"
                />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Direct Full-Project Google Drive Folder Uploader (includes edited README & workflows) */}
      <GoogleDriveExportCard
        workspace={workspace}
        customDocs={customDocsForDrive}
        onWorkspaceUpdated={onRefreshWorkspace}
      />
    </div>
  );
};
