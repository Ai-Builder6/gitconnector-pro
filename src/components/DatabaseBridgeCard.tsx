import React, { useEffect, useState } from 'react';
import {
  Check,
  CloudUpload,
  Database,
  FileCode2,
  Loader2,
  LogIn,
  LogOut,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { WorkspaceDetail } from '../types';
import { apiFetch } from '../utils/api';
import {
  generateFirestoreRulesFromModels,
  generatePostgresSqlFromModels,
  signInWithGoogleFirebase,
  signOutFirebase,
  subscribeFirebaseUser,
  syncWorkspaceSnapshotToFirestore,
} from '../lib/firebaseBridge';
import firebaseConfig from '../../firebase-applet-config.json';

interface DatabaseBridgeCardProps {
  workspace: WorkspaceDetail;
  onOpenFileInEditor: (filePath: string) => void;
  onRefreshWorkspace: () => Promise<void>;
}

export const DatabaseBridgeCard: React.FC<DatabaseBridgeCardProps> = ({
  workspace,
  onOpenFileInEditor,
  onRefreshWorkspace,
}) => {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [writingArtifact, setWritingArtifact] = useState<'firestore' | 'postgres' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeFirebaseUser((u) => setFbUser(u));
    return () => unsub();
  }, []);

  const handleWriteFirestoreRulesBridge = async () => {
    setWritingArtifact('firestore');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const rulesText = generateFirestoreRulesFromModels(workspace.databaseSchema.models);
      const targetPath = workspace.targetSubPath
        ? `${workspace.targetSubPath}/firestore.rules`
        : 'firestore.rules';
      const res = await apiFetch(`/api/workspaces/${workspace.id}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, content: rulesText }),
      });
      if (!res.ok) throw new Error('Failed to write firestore.rules into workspace.');
      await onRefreshWorkspace();
      setStatusMessage(`Generated hardened ${targetPath} in workspace.`);
      onOpenFileInEditor(targetPath);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to generate rules');
    } finally {
      setWritingArtifact(null);
    }
  };

  const handleWritePostgresSqlBridge = async () => {
    setWritingArtifact('postgres');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const sqlText = generatePostgresSqlFromModels(workspace.databaseSchema.models);
      const targetPath = workspace.targetSubPath
        ? `${workspace.targetSubPath}/db/cloudsql-migration.sql`
        : 'db/cloudsql-migration.sql';
      const res = await apiFetch(`/api/workspaces/${workspace.id}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, content: sqlText }),
      });
      if (!res.ok) throw new Error('Failed to write SQL migration into workspace.');
      await onRefreshWorkspace();
      setStatusMessage(`Generated ${targetPath} in workspace.`);
      onOpenFileInEditor(targetPath);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to generate SQL');
    } finally {
      setWritingArtifact(null);
    }
  };

  const handleCloudSync = async () => {
    setSyncing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      let currentUser = fbUser;
      if (!currentUser) {
        currentUser = await signInWithGoogleFirebase();
      }
      const saved = await syncWorkspaceSnapshotToFirestore(workspace);
      setStatusMessage(
        `Synced workspace snapshot (${saved.workspaceId}) to Firestore (${firebaseConfig.firestoreDatabaseId.slice(0, 28)}...).`
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setErrorMessage(
        raw.includes('Missing or insufficient permissions')
          ? 'Connected Firestore rules on this database restrict /users/{uid}/repoforge_workspaces writes — use Generate Firestore Rules to inspect the required collection policy.'
          : raw
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-100">
              Database Schema &amp; Cloud Provisioning Bridge
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400 font-mono tabular-nums">
              {workspace.databaseSchema.detected
                ? `${workspace.databaseSchema.models.length} ${workspace.databaseSchema.ormType} model(s) parsed`
                : 'No ORM schema files — starter bridge available'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Translate Prisma, Drizzle, or SQL models directly into hardened <code>firestore.rules</code> or Cloud SQL PostgreSQL migrations, or persist workspace metadata to Firestore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={writingArtifact !== null}
            onClick={() => void handleWriteFirestoreRulesBridge()}
            className="h-9 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {writingArtifact === 'firestore' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Generate Firestore Rules</span>
          </button>

          <button
            type="button"
            disabled={writingArtifact !== null}
            onClick={() => void handleWritePostgresSqlBridge()}
            className="h-9 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {writingArtifact === 'postgres' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCode2 className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span>Generate Cloud SQL DDL</span>
          </button>

          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleCloudSync()}
            className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : fbUser ? (
              <CloudUpload className="w-3.5 h-3.5" />
            ) : (
              <LogIn className="w-3.5 h-3.5" />
            )}
            <span>{fbUser ? 'Sync Snapshot to Firestore' : 'Sign In & Sync to Firestore'}</span>
          </button>

          {fbUser && (
            <button
              type="button"
              onClick={() => void signOutFirebase()}
              title={`Signed in as ${fbUser.email || fbUser.uid}`}
              className="h-9 px-2.5 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-xs text-slate-400 hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="px-5 py-2.5 bg-emerald-950/30 border-b border-slate-800 text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="px-5 py-2.5 bg-rose-950/30 border-b border-slate-800 text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      {workspace.databaseSchema.detected && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
          {workspace.databaseSchema.models.map((model) => (
            <div
              key={`${model.sourceFile}-${model.name}`}
              className="border border-slate-800 bg-[#0B0F17] rounded-lg overflow-hidden"
            >
              <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-slate-100">{model.name}</span>
                <button
                  type="button"
                  onClick={() => onOpenFileInEditor(model.sourceFile)}
                  className="text-slate-400 hover:text-blue-400 font-mono cursor-pointer"
                >
                  {model.orm}
                </button>
              </div>
              <div className="divide-y divide-slate-800/60 max-h-44 overflow-y-auto text-xs font-mono">
                {model.fields.map((field) => (
                  <div
                    key={field.name}
                    className="px-3.5 py-1.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-300 truncate">
                      {field.name}
                      {field.isPrimary ? ' (PK)' : ''}
                    </span>
                    <span className="text-slate-500 shrink-0">
                      {field.type}
                      {field.isOptional ? '?' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
