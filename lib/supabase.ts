import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithCredential,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
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

setPersistence(auth, browserLocalPersistence).catch(() => {});

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
      return { error: null };
    },

    signInWithGoogleRedirect: () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      signInWithRedirect(auth, provider);
    },

    handleRedirect: async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          return { data: { session: mapToSession(result.user) }, error: null };
        }
      } catch (error: any) {
        return { data: null, error };
      }
      return { data: null, error: null };
    },

    signInWithGoogleIdToken: async (idToken: string) => {
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        return { error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signInWithGoogleIdTokenREST: async (idToken: string) => {
      try {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=AIzaSyB51bv_qDJwmPw3kKWrxXTk1T5xg_A2cqE`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postBody: `id_token=${idToken}&providerId=google.com`,
            requestUri: 'https://omnipdf-ai.firebaseapp.com',
            returnIdpCredential: true,
            returnSecureToken: true,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || 'REST sign-in failed');
        return { data, error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signInWithGoogleCustomToken: async (idToken: string) => {
      try {
        const edgeUrl = Deno.env.get('SUPABASE_URL')
          ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/auth-google`
          : 'https://omnipdf-ai-d5uq.onrender.com/api/auth-google';
        const res = await fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: idToken }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Custom token exchange failed');
        }
        const { custom_token } = await res.json();
        await signInWithCustomToken(auth, custom_token);
        return { error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: { full_name?: string } } }) => {
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
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return { data: { user: credential.user }, error: null };
      } catch (error: any) {
        return { error };
      }
    },

    signOut: async () => {
      await fbSignOut(auth);
    },

    resetPasswordForEmail: async (email: string) => {
      await sendPasswordResetEmail(auth, email);
      return { data: {}, error: null };
    },
  },
};

export { supabase };
