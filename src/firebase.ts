import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  Auth,
  User
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    { experimentalAutoDetectLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db: Firestore = dbInstance;
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export type FirebaseBridge = {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
  firebaseConfig: typeof firebaseConfig;
  OperationType: typeof OperationType;
  handleFirestoreError: typeof handleFirestoreError;
  testConnection: typeof testConnection;
  signInWithGoogle: () => Promise<User>;
  signOutFirebase: () => Promise<void>;
  onAuthStateChanged: typeof onAuthStateChanged;
  doc: typeof doc;
  getDoc: typeof getDoc;
  getDocFromServer: typeof getDocFromServer;
  setDoc: typeof setDoc;
  updateDoc: typeof updateDoc;
  onSnapshot: typeof onSnapshot;
  serverTimestamp: typeof serverTimestamp;
};

export const firebaseBridge: FirebaseBridge = {
  app,
  db,
  auth,
  googleProvider,
  firebaseConfig,
  OperationType,
  handleFirestoreError,
  testConnection,
  async signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  },
  async signOutFirebase() {
    await signOut(auth);
  },
  onAuthStateChanged,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
};

declare global {
  interface Window {
    __firebaseBridge?: FirebaseBridge;
  }
}

export function mountFirebaseBridge() {
  window.__firebaseBridge = firebaseBridge;
  void testConnection();
}
