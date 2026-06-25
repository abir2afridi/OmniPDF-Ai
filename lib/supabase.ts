import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
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

declare const google: any;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

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
      try {
        await auth.authStateReady();
        return { data: { session: mapToSession(auth.currentUser) } };
      } catch (error) {
        console.error('getSession error:', error);
        return { data: { session: null } };
      }
    },

    getUser: async () => {
      try {
        await auth.authStateReady();
        return { data: { user: mapFirebaseUser(auth.currentUser) } };
      } catch (error) {
        console.error('getUser error:', error);
        return { data: { user: null } };
      }
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

    loadGSIScript: async () => {
      if (document.getElementById('gsi-script')) return;
      if (typeof google !== 'undefined' && google.accounts?.id) return;
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load GSI script'));
        document.head.appendChild(script);
      });
      await new Promise<void>((resolve) => {
        const check = () => {
          if (typeof google !== 'undefined' && google.accounts?.id) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    },

    signInWithGoogleOneTap: async () => {
      const gsiClientId = GOOGLE_CLIENT_ID;
      if (!gsiClientId) {
        return { data: null, error: new Error('VITE_GOOGLE_CLIENT_ID not set') };
      }
      try {
        await supabase.auth.loadGSIScript();
      } catch (e: any) {
        return { data: null, error: e };
      }
      const ONETAP_TIMEOUT = 10000;
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          google.accounts.id.cancel?.();
          resolve({ data: null, error: new Error('One Tap timed out') });
        }, ONETAP_TIMEOUT);
        try {
          google.accounts.id.initialize({
            client_id: gsiClientId,
            cancel_on_tap_outside: false,
            callback: async (response: any) => {
              clearTimeout(timeout);
              if (!response.credential) {
                resolve({ data: null, error: new Error('No credential from One Tap') });
                return;
              }
              try {
                const credential = GoogleAuthProvider.credential(response.credential);
                const result = await signInWithCredential(auth, credential);
                resolve({ data: { session: mapToSession(result.user) }, error: null });
              } catch (err: any) {
                console.error('[Auth] One Tap credential exchange error:', err);
                resolve({ data: null, error: err });
              }
            },
          });
          google.accounts.id.prompt();
        } catch (err: any) {
          clearTimeout(timeout);
          console.error('[Auth] One Tap error:', err);
          resolve({ data: null, error: err });
        }
      });
    },

    signInWithGoogleRedirect: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithRedirect(auth, provider);
      } catch (error: any) {
        console.error('Google redirect error:', error);
        const errMsg = `Google login failed: ${error?.code || error?.message || 'Unknown error'}. Check Firebase Console → Authentication → Settings → Authorized domains.`;
        sessionStorage.setItem('omni_google_auth_error', errMsg);
      }
    },

    handleGoogleOAuthRedirect: async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          sessionStorage.removeItem('omni_google_auth_error');
          await auth.authStateReady();
          return { data: { session: mapToSession(result.user) }, error: null };
        }
      } catch (error: any) {
        console.error('handleGoogleOAuthRedirect error:', error);
        const errMsg = `Google login failed: ${error?.code || error?.message || 'Unknown error'}.`;
        sessionStorage.setItem('omni_google_auth_error', errMsg);
        return { data: null, error };
      }
      return { data: null, error: null };
    },

    signInWithGooglePopup: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const result = await signInWithPopup(auth, provider);
        return { data: { session: mapToSession(result.user) }, error: null };
      } catch (error: any) {
        console.error('[Auth] signInWithGooglePopup full error:', {
          code: error?.code,
          message: error?.message,
          name: error?.name,
        });
        return { data: null, error };
      }
    },

    handleRedirect: async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          sessionStorage.removeItem('omni_google_auth_error');
          await auth.authStateReady();
          return { data: { session: mapToSession(result.user) }, error: null };
        }
      } catch (error: any) {
        console.error('handleRedirect error:', error);
        const errMsg = `Google login failed: ${error?.code || error?.message || 'Unknown error'}. Check Firebase Console → Authentication → Settings → Authorized domains has your app domain added.`;
        sessionStorage.setItem('omni_google_auth_error', errMsg);
        return { data: null, error };
      }
      return { data: null, error: null };
    },

    getRedirectError: () => {
      return sessionStorage.getItem('omni_google_auth_error');
    },

    clearRedirectError: () => {
      sessionStorage.removeItem('omni_google_auth_error');
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
