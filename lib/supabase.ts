import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
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

    signInWithGoogleRedirect: async () => {
      const clientId = GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { data: null, error: new Error('VITE_GOOGLE_CLIENT_ID not set') };
      }
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('omni_google_oauth_state', state);
      sessionStorage.setItem('omni_google_oauth_nonce', nonce);
      const redirectUri = window.location.origin;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        'client_id=' + clientId +
        '&response_type=id_token%20token' +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&scope=' + encodeURIComponent('openid email profile') +
        '&state=' + state +
        '&nonce=' + nonce +
        '&prompt=select_account';
      window.location.assign(url);
      return { data: null, error: null };
    },

    handleGoogleOAuthRedirect: async () => {
      const hash = window.location.hash;
      if (!hash || hash.length < 5) return { data: null, error: null };
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      const state = params.get('state');
      const savedState = sessionStorage.getItem('omni_google_oauth_state');
      sessionStorage.removeItem('omni_google_oauth_state');
      sessionStorage.removeItem('omni_google_oauth_nonce');
      if (!idToken || !state || state !== savedState) {
        return { data: null, error: null };
      }
      window.history.replaceState({}, document.title, window.location.pathname);
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        return { data: { session: mapToSession(result.user) }, error: null };
      } catch (error: any) {
        console.error('[Auth] Google OAuth credential exchange error:', error);
        const errMsg = 'Google login failed: ' + (error?.code || error?.message || 'Unknown error');
        sessionStorage.setItem('omni_google_auth_error', errMsg);
        return { data: null, error };
      }
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
