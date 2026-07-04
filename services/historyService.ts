import { db } from '../lib/supabase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  limit as firestoreLimit,
  Timestamp,
  deleteDoc,
  doc,
} from 'firebase/firestore';

export interface HistoryEntry {
  id?: string;
  userId: string;
  toolId: string;
  toolName: string;
  fileName: string;
  fileSize: number;
  status: 'completed' | 'failed';
  timestamp: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  try {
    await addDoc(collection(db, 'history'), {
      ...entry,
      fileSize: formatFileSize(entry.fileSize),
      timestamp: Timestamp.fromMillis(entry.timestamp),
    });
  } catch (err) {
    console.error('Failed to save history entry:', err);
  }
}

export async function getUserHistory(userId: string): Promise<HistoryEntry[]> {
  try {
    const q = query(
      collection(db, 'history'),
      where('userId', '==', userId),
      firestoreLimit(100)
    );
    const snapshot = await getDocs(q);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return snapshot.docs
      .map(snap => {
        const data = snap.data() as Omit<HistoryEntry, 'id'>;
        const ts = data.timestamp as any;
        const millis = ts?.toMillis?.() ?? ts;
        return {
          ...data,
          id: snap.id,
          timestamp: millis,
        } as HistoryEntry;
      })
      .filter(entry => entry.timestamp >= sevenDaysAgo)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error('Failed to fetch history:', err);
    return [];
  }
}

export async function deleteHistoryEntry(entryId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'history', entryId));
  } catch (err) {
    console.error('Failed to delete history entry:', err);
  }
}

export async function cleanupOldEntries(userId: string): Promise<void> {
  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const q = query(
      collection(db, 'history'),
      where('userId', '==', userId),
      where('timestamp', '<', Timestamp.fromMillis(sevenDaysAgo))
    );
    const snapshot = await getDocs(q);
    const promises = snapshot.docs.map(snap => deleteDoc(snap.ref));
    await Promise.all(promises);
  } catch (err) {
    console.error('Failed to cleanup old history:', err);
  }
}
