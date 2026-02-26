# 🔧 Google OAuth Production Fix Guide

## 🚨 Problem Summary
Google OAuth works on localhost but fails on Vercel production due to incorrect redirect URI configuration.

## 📋 Required Configuration Changes

### 1. Supabase Dashboard Settings
**URL**: https://supabase.com/dashboard/project/rsagndlatqwzzsjqbqqt/auth/url-configuration

**Site URL:**
```
https://omni2pdf-ai.vercel.app
```

**Redirect URLs (add all):**
```
https://omni2pdf-ai.vercel.app/**
https://omni2pdf-ai.vercel.app/auth/callback
http://localhost:3002/**
http://localhost:3000/**
```

### 2. Google Cloud Console Settings
**URL**: https://console.cloud.google.com/apis/credentials

**Authorized redirect URIs:**
```
https://rsagndlatqwzzsjqbqqt.supabase.co/auth/v1/callback
https://omni2pdf-ai.vercel.app/auth/callback
```

### 3. Vercel Environment Variables
Add these in Vercel Dashboard → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://rsagndlatqwzzsjqbqqt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQsImV4cCI6MjA4NzQyMzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo
VITE_APP_URL=https://omni2pdf-ai.vercel.app
```

## 🔄 OAuth Redirect Flow Diagram

```
User Clicks Google Login
        ↓
Frontend: signInWithOAuth()
        ↓
Google OAuth Screen
        ↓
User Grants Permission
        ↓
Google Redirects to: https://rsagndlatqwzzsjqbqqt.supabase.co/auth/v1/callback
        ↓
Supabase Processes Auth
        ↓
Supabase Redirects to: https://omni2pdf-ai.vercel.app/auth/callback
        ↓
Frontend Callback Handler
        ↓
Session Established → Redirect to Dashboard
```

## ✅ Fixed Code Implementation

### Login.tsx (Updated)
```typescript
const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                }
            }
        });
        if (error) throw error;
    } catch (error: any) {
        console.error('Login error:', error);
        alert(`Authentication failed: ${error.message}`);
    }
};
```

### supabase.ts (Enhanced)
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  }
});
```

### Auth Callback Handler (pages/auth/callback.tsx)
```typescript
import React, { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const AuthCallback: React.FC = () => {
  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          window.location.href = '/login?error=auth_failed';
          return;
        }
        
        if (data.session) {
          window.location.href = '/dashboard';
        } else {
          window.location.href = '/login?error=no_session';
        }
      } catch (error) {
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
```

## 🚀 Deployment Steps

1. **Push changes to Git**
2. **Update Supabase URL Configuration** (add production URLs)
3. **Update Google Cloud Console** (add production redirect URIs)
4. **Set Vercel Environment Variables**
5. **Deploy to Vercel**
6. **Test OAuth flow on production**

## ⚠️ Common Mistakes Checklist

- [ ] Missing trailing slash in redirect URLs
- [ ] Using http instead of https for production
- [ ] Not adding both localhost and production URLs
- [ ] Forgetting to set Vercel environment variables
- [ ] Using window.location.origin without explicit callback path
- [ ] Not configuring PKCE flow in Supabase client
- [ ] Missing queryParams for offline access
- [ ] Not handling auth callback URL properly
- [ ] Forgetting to restart Vercel after env changes
- [ ] Using different domains in Supabase vs Google Console

## 🔍 Testing Checklist

### Local Testing
- [ ] OAuth works on localhost:3002
- [ ] Redirects to correct callback URL
- [ ] Session persists after callback

### Production Testing
- [ ] OAuth initiates on Vercel domain
- [ ] Google consent screen shows correct app name
- [ ] Redirects to production callback URL
- [ ] Session established successfully
- [ ] User redirected to dashboard
- [ ] No console errors in production

## 🆘 Troubleshooting

### Error: "redirect_uri_mismatch"
**Fix**: Ensure exact match between Google Console and Supabase redirect URIs

### Error: "Invalid client"
**Fix**: Check Google OAuth client ID/secret in Supabase settings

### Error: "Callback failed"
**Fix**: Verify callback handler exists and handles session properly

### Error: "No session found"
**Fix**: Ensure detectSessionInUrl is enabled in Supabase client
