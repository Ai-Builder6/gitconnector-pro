import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { DetectedSchemaModel, WorkspaceDetail } from '../types';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const resolvedFirestoreDbId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-tidyupsgoogleads-c1b71ce9-ff4f-47ca-90aa-1b084f857ab6';
export const db = getFirestore(app, resolvedFirestoreDbId);
export const auth = getAuth(app);

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Strictly cache Google Workspace OAuth access token in memory only (never in localStorage/sessionStorage)
let isSigningInDrive = false;
let cachedDriveAccessToken: string | null = null;
const driveListeners = new Set<(state: { user: User | null; hasDriveToken: boolean }) => void>();

function notifyDriveListeners() {
  const payload = {
    user: auth.currentUser,
    hasDriveToken: Boolean(cachedDriveAccessToken),
  };
  for (const listener of driveListeners) {
    listener(payload);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user && !isSigningInDrive) {
    cachedDriveAccessToken = null;
  }
  notifyDriveListeners();
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function subscribeFirebaseUser(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export function subscribeDriveAuthState(
  cb: (state: { user: User | null; hasDriveToken: boolean }) => void
) {
  driveListeners.add(cb);
  cb({
    user: auth.currentUser,
    hasDriveToken: Boolean(cachedDriveAccessToken),
  });
  return () => {
    driveListeners.delete(cb);
  };
}

export function getCachedDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearCachedDriveAccessToken(): void {
  cachedDriveAccessToken = null;
  notifyDriveListeners();
}

export async function signInWithGoogleForDrive(
  forceAccountPicker = false
): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningInDrive = true;
    const provider = new GoogleAuthProvider();
    for (const scope of GOOGLE_DRIVE_SCOPES) {
      provider.addScope(scope);
    }
    provider.setCustomParameters({
      prompt: forceAccountPicker ? 'select_account consent' : 'consent',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Sign-In succeeded, but no Google Drive access token was returned.');
    }

    cachedDriveAccessToken = credential.accessToken;
    notifyDriveListeners();
    return { user: result.user, accessToken: credential.accessToken };
  } finally {
    isSigningInDrive = false;
  }
}

export async function signInWithGoogleFirebase(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutFirebase(): Promise<void> {
  cachedDriveAccessToken = null;
  await signOut(auth);
  notifyDriveListeners();
}

export interface CloudSavedSnapshot {
  workspaceId: string;
  ownerId: string;
  repoUrl: string;
  branch: string;
  commitShort: string;
  framework: string;
  modelCount: number;
  savedAtIso: string;
}

export async function syncWorkspaceSnapshotToFirestore(
  workspace: WorkspaceDetail
): Promise<CloudSavedSnapshot> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with Google first to sync snapshots to Firestore.');
  }

  const safeWsId = workspace.id.slice(0, 128).replace(/[^a-zA-Z0-9_-]/g, '-');
  const docPath = `users/${user.uid}/repoforge_workspaces/${safeWsId}`;
  const payload: CloudSavedSnapshot = {
    workspaceId: safeWsId,
    ownerId: user.uid,
    repoUrl: workspace.repoUrl.slice(0, 512),
    branch: workspace.branch.slice(0, 128),
    commitShort: (workspace.commitShort || 'head').slice(0, 40),
    framework: workspace.framework.slice(0, 120),
    modelCount: workspace.databaseSchema.models.length,
    savedAtIso: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'users', user.uid, 'repoforge_workspaces', safeWsId), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function listSyncedSnapshots(): Promise<CloudSavedSnapshot[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const colPath = `users/${user.uid}/repoforge_workspaces`;
  try {
    const q = query(
      collection(db, 'users', user.uid, 'repoforge_workspaces'),
      where('ownerId', '==', user.uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CloudSavedSnapshot);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export function generateFirestoreRulesFromModels(models: DetectedSchemaModel[]): string {
  const targetModels =
    models.length > 0
      ? models
      : [
          {
            name: 'Item',
            sourceFile: 'generated',
            orm: 'Prisma' as const,
            fields: [
              { name: 'id', type: 'String', isPrimary: true },
              { name: 'title', type: 'String' },
              { name: 'ownerId', type: 'String' },
            ],
          },
        ];

  const validators = targetModels
    .map((m) => {
      const allowedKeys = Array.from(
        new Set([...m.fields.map((f) => f.name), 'ownerId', 'createdAt', 'updatedAt'])
      )
        .map((k) => `'${k}'`)
        .join(', ');
      return `    function isValid${m.name}(data) {
      return data.keys().hasAll(['ownerId']) &&
             data.keys().hasOnly([${allowedKeys}]) &&
             data.ownerId is string && data.ownerId.size() <= 128 &&
             data.ownerId == request.auth.uid;
    }`;
    })
    .join('\n\n');

  const matches = targetModels
    .map((m) => {
      const colName = m.name.toLowerCase() + 's';
      return `    match /${colName}/{docId} {
      allow get: if isSignedIn() && isValidId(docId) && resource.data.ownerId == request.auth.uid;
      allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid;
      allow create: if isSignedIn() && isValidId(docId) && isValid${m.name}(request.resource.data);
      allow update: if isSignedIn() && isValidId(docId) && isValid${m.name}(request.resource.data) &&
                    resource.data.ownerId == request.auth.uid &&
                    request.resource.data.ownerId == resource.data.ownerId;
      allow delete: if isSignedIn() && isValidId(docId) && resource.data.ownerId == request.auth.uid;
    }`;
    })
    .join('\n\n');

  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null && request.auth.token.email_verified == true;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }

${validators}

${matches}
  }
}
`;
}

export function generatePostgresSqlFromModels(models: DetectedSchemaModel[]): string {
  if (models.length === 0) {
    return `-- Generated Cloud SQL (PostgreSQL) Starter Schema\nCREATE TABLE IF NOT EXISTS app_records (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  owner_id VARCHAR(128) NOT NULL,\n  payload JSONB NOT NULL DEFAULT '{}'::jsonb,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n`;
  }

  const mapSqlType = (rawType: string): string => {
    const t = rawType.toLowerCase();
    if (t.includes('int') || t === 'serial') return 'INTEGER';
    if (t.includes('bool')) return 'BOOLEAN';
    if (t.includes('date') || t.includes('time')) return 'TIMESTAMPTZ';
    if (t.includes('float') || t.includes('decimal') || t.includes('numeric')) return 'NUMERIC';
    if (t.includes('json')) return 'JSONB';
    if (t.includes('uuid')) return 'UUID';
    return 'TEXT';
  };

  return models
    .map((m) => {
      const cols = m.fields.map((f) => {
        const sqlT = mapSqlType(f.type);
        const pk = f.isPrimary ? ' PRIMARY KEY' : '';
        const nn = !f.isOptional && !f.isPrimary ? ' NOT NULL' : '';
        return `  "${f.name}" ${sqlT}${pk}${nn}`;
      });
      return `-- Source: ${m.sourceFile} (${m.orm})\nCREATE TABLE IF NOT EXISTS "${m.name.toLowerCase()}" (\n${cols.join(',\n')}\n);`;
    })
    .join('\n\n');
}
