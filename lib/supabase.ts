import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB51bv_qDJwmPw3kKWrxXTk1T5xg_A2cqE",
  authDomain: "omnipdf-ai.firebaseapp.com",
  projectId: "omnipdf-ai",
  storageBucket: "omnipdf-ai.firebasestorage.app",
  messagingSenderId: "619952563506",
  appId: "1:619952563506:web:bcf59b3582f0bca808a32b",
  measurementId: "G-HVMP4GXK59"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const authReady = (async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    console.log('[Auth] Persistence set to browserLocalPersistence');
  } catch (err) {
    console.warn('[Auth] Failed to set persistence, using default:', err);
  }
})();

const mapFirebaseUser = (user: User | null) => {
  if (!user) return null;
  return {
    id: user.uid,
    email: user.email,
    user_metadata: {
      full_name: user.displayName,
      avatar_url: user.photoURL,
      picture: user.photoURL,
    },
  };
};

const mapToSession = (user: User | null) => {
  return user ? { user: mapFirebaseUser(user) } : null;
};

const supabase = {
  auth: {
    getSession: async () => {
      const user = await new Promise<User | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          resolve(user);
        });
      });
      return { data: { session: mapToSession(user) } };
    },

    getUser: async () => {
      const user = await new Promise<User | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          resolve(user);
        });
      });
      return { data: { user: mapFirebaseUser(user) } };
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          callback('SIGNED_IN', mapToSession(user));
        } else {
          callback('SIGNED_OUT', null);
        }
      });
      return { data: { subscription: { unsubscribe } } };
    },

    signInWithOAuth: async () => {
      await authReady;
      try {
        const googleProvider = new GoogleAuthProvider();
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, googleProvider);
        return { data: { user: result.user }, error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: { full_name?: string } } }) => {
      await authReady;
      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (options?.data?.full_name) {
          await updateProfile(credential.user, { displayName: options.data.full_name });
        }
        return { data: { user: credential.user }, error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      await authReady;
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return { data: { user: credential.user }, error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signOut: async () => {
      await authReady;
      await fbSignOut(auth);
    },

    resetPasswordForEmail: async (email: string) => {
      await sendPasswordResetEmail(auth, email);
      return { data: {}, error: null };
    },
  },
};

export { supabase };
