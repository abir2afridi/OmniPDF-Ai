import React, { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const AuthCallback: React.FC = () => {
  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          window.location.href = '/login?error=auth_failed';
          return;
        }
        
        if (data.session) {
          // Successfully authenticated
          window.location.href = '/dashboard';
        } else {
          // No session found
          window.location.href = '/login?error=no_session';
        }
      } catch (error) {
        console.error('Callback error:', error);
        window.location.href = '/login?error=callback_failed';
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
