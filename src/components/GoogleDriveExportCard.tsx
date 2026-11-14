import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FolderPlus,
  Loader2,
  LogOut,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GoogleDriveUploadResult, WorkspaceDetail } from '../types';
import { apiFetch } from '../utils/api';
import { formatBytes } from '../utils/format';
import {
  clearCachedDriveAccessToken,
  getCachedDriveAccessToken,
  signInWithGoogleForDrive,
  signOutFirebase,
  subscribeDriveAuthState,
} from '../lib/firebaseBridge';

interface GoogleDriveExportCardProps {
  workspace: WorkspaceDetail;
  customDocs?: Array<{ path: string; content: string }>;
  onWorkspaceUpdated?: () => Promise<void>;
}

const OfficialGoogleGMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
    />
    <path
      fill="#34A853"
      d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9.003 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.712A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.33z"
    />
    <path
      fill="#EA4335"
      d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
    />
  </svg>
);

export const GoogleDriveExportCard: React.FC<GoogleDriveExportCardProps> = ({
  workspace,
  customDocs,
  onWorkspaceUpdated,
}) => {
  const defaultFolderName = `RepoForge - ${workspace.owner}-${workspace.repoName} (${
    workspace.branch || 'main'
  }-${workspace.commitShort || 'head'})`;

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState(false);
  const [folderName, setFolderName] = useState(defaultFolderName);
  const [includeGeneratedDocs, setIncludeGeneratedDocs] = useState(true);
  const [mirrorSourceFiles, setMirrorSourceFiles] = useState(true);

  const [signingIn, setSigningIn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRepeatOpen, setConfirmRepeatOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<GoogleDriveUploadResult | null>(null);

  useEffect(() => {
    setFolderName(
      `RepoForge - ${workspace.owner}-${workspace.repoName} (${workspace.branch || 'main'}-${
        workspace.commitShort || 'head'
      })`
    );
    setUploadResult(null);
    setErrorMsg(null);
    setConfirmRepeatOpen(false);
  }, [workspace.id, workspace.owner, workspace.repoName, workspace.branch, workspace.commitShort]);

  useEffect(() => {
    return subscribeDriveAuthState(({ user, hasDriveToken: hasTok }) => {
      setAuthUser(user);
      setHasDriveToken(hasTok);
    });
  }, []);

  const handleGoogleSignIn = async (forcePicker = false) => {
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await signInWithGoogleForDrive(forcePicker);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or blocked by browser.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const executeDriveUpload = async () => {
    setErrorMsg(null);
    setConfirmRepeatOpen(false);

    let token = getCachedDriveAccessToken();
    if (!token) {
      try {
        setSigningIn(true);
        const signed = await signInWithGoogleForDrive(false);
        token = signed.accessToken;
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Google Drive permission is required to upload.'
        );
        return;
      } finally {
        setSigningIn(false);
      }
    }

    setUploading(true);
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}/drive-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folderName: folderName.trim() || defaultFolderName,
          includeGeneratedDocs,
          mirrorSourceFiles,
          customDocs,
        }),
      });

      const payload = (await res.json()) as {
        result?: GoogleDriveUploadResult;
        error?: string;
      };

      if (res.status === 401 || res.status === 403) {
        clearCachedDriveAccessToken();
        throw new Error(
          'Your Google Drive session expired or lacked permission. Click Sign in with Google and try again.'
        );
      }

      if (!res.ok || !payload.result) {
        throw new Error(payload.error || 'Failed to upload project to Google Drive.');
      }

      setUploadResult(payload.result);
      if (onWorkspaceUpdated) {
        await onWorkspaceUpdated();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Drive upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadButtonClick = () => {
    if (uploadResult && uploadResult.folderName === (folderName.trim() || defaultFolderName)) {
      setConfirmRepeatOpen(true);
      return;
    }
    void executeDriveUpload();
  };

  return (
    <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FolderPlus className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Export Full Project to Google Drive Folder
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Creates a dedicated folder in your Google Drive containing the full project archive, mirrored source tree, README, and workflows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!hasDriveToken ? (
            <button
              type="button"
              disabled={signingIn || uploading}
              onClick={() => void handleGoogleSignIn(false)}
              className="h-10 px-4 rounded border bg-[#FFFFFF] border-[#DADCE0] text-[#3C4043] text-sm font-medium inline-flex items-center gap-2.5 shadow-2xs hover:bg-[#F8F9FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
              ) : (
                <OfficialGoogleGMark />
              )}
              <span>Sign in with Google</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-44">
                {authUser?.email || 'Google Drive connected'}
              </span>
              <button
                type="button"
                onClick={() => void handleGoogleSignIn(true)}
                title="Switch Google Account"
                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Switch</span>
              </button>
              <button
                type="button"
                onClick={() => void signOutFirebase()}
                title="Disconnect Google Drive"
                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-7 space-y-1.5">
            <label
              htmlFor={`drive-folder-name-${workspace.id}`}
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Created Google Drive Folder Name
            </label>
            <input
              id={`drive-folder-name-${workspace.id}`}
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={uploading}
              placeholder="Folder name to create in Google Drive"
              className="w-full h-10 px-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="lg:col-span-5 flex items-center justify-end">
            <button
              type="button"
              disabled={uploading || signingIn}
              onClick={handleUploadButtonClick}
              className="w-full lg:w-auto h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Folder &amp; Uploading Project...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload Full Project to Google Drive</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Export Configuration Checkboxes */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1 text-xs text-slate-700 dark:text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeGeneratedDocs}
              onChange={(e) => setIncludeGeneratedDocs(e.target.checked)}
              disabled={uploading}
              className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
            />
            <span>Include tailored README.md &amp; .github/workflows/*</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mirrorSourceFiles}
              onChange={(e) => setMirrorSourceFiles(e.target.checked)}
              disabled={uploading}
              className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
            />
            <span>Mirror individual source files &amp; subfolders (plus full .tar.gz archive)</span>
          </label>
        </div>

        {/* Inline Repeat-Folder Confirmation (Zero window.confirm) */}
        {confirmRepeatOpen && (
          <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-amber-900 dark:text-amber-200">
              You already uploaded this workspace to <strong>{folderName}</strong>. Create another fresh folder copy in Google Drive?
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmRepeatOpen(false)}
                className="h-8 px-3 rounded-md border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDriveUpload()}
                className="h-8 px-3 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-semibold cursor-pointer"
              >
                Create New Folder &amp; Upload
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {uploadResult && (
          <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-600/40 bg-emerald-50/70 dark:bg-emerald-950/25 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    Uploaded to Google Drive Folder: {uploadResult.folderName}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 font-mono tabular-nums mt-0.5">
                    {uploadResult.uploadedFilesCount} files across {uploadResult.uploadedFoldersCount} folders ·{' '}
                    {formatBytes(uploadResult.totalBytesUploaded)} uploaded
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={uploadResult.archiveFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 px-3 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 text-emerald-800 dark:text-emerald-300 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <span>Archive (.tar.gz)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={uploadResult.folderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <span>Open Folder in Google Drive</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
