import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  getDocs,
  deleteDoc,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App & Firestore
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection on boot
export async function testConnection(): Promise<boolean> {
  const testPath = 'test/connection';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("✅ Firestore connected successfully to database:", firebaseConfig.firestoreDatabaseId);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    } else {
      console.warn("Firestore connection check note:", error);
    }
    return false;
  }
}

// Sync service for SanteDirect
export class SanteDirectDB {
  static databaseId = firebaseConfig.firestoreDatabaseId;
  static projectId = firebaseConfig.projectId;

  static async initDatabase(onStatusChange?: (status: { connected: boolean; count: number }) => void) {
    const isOk = await testConnection();
    if (onStatusChange) {
      onStatusChange({ connected: isOk, count: 0 });
    }
  }

  // Save an appointment to Firestore
  static async saveAppointment(apt: any): Promise<void> {
    const path = `appointments/${apt.id}`;
    try {
      await setDoc(doc(db, 'appointments', apt.id), apt, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  // Delete an appointment from Firestore
  static async deleteAppointment(aptId: string): Promise<void> {
    const path = `appointments/${aptId}`;
    try {
      await deleteDoc(doc(db, 'appointments', aptId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  // Listen to appointments collection
  static listenAppointments(
    onAppointments: (appointments: any[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    const path = 'appointments';
    return onSnapshot(
      collection(db, 'appointments'),
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        onAppointments(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  // Save Doctor Absence
  static async saveDoctorAbsence(absence: any): Promise<void> {
    const path = `doctorAbsences/${absence.id}`;
    try {
      await setDoc(doc(db, 'doctorAbsences', absence.id), absence, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  // Delete Doctor Absence
  static async deleteDoctorAbsence(absenceId: string): Promise<void> {
    const path = `doctorAbsences/${absenceId}`;
    try {
      await deleteDoc(doc(db, 'doctorAbsences', absenceId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  // Listen to doctor absences
  static listenDoctorAbsences(
    onAbsences: (absences: any[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    const path = 'doctorAbsences';
    return onSnapshot(
      collection(db, 'doctorAbsences'),
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        onAbsences(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  // Save user profile
  static async saveUserProfile(userId: string, data: any): Promise<void> {
    const path = `userProfiles/${userId}`;
    try {
      await setDoc(doc(db, 'userProfiles', userId), data, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  // Get user profile
  static async getUserProfile(userId: string): Promise<any | null> {
    const path = `userProfiles/${userId}`;
    try {
      const snap = await getDoc(doc(db, 'userProfiles', userId));
      return snap.exists() ? snap.data() : null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }
}

// Make accessible to window
if (typeof window !== 'undefined') {
  (window as any).SanteDirectDB = SanteDirectDB;
  (window as any).firestoreDB = db;
  (window as any).firebaseApp = app;
  window.dispatchEvent(new CustomEvent('santedirect-db-ready', { detail: SanteDirectDB }));
}
