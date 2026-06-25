import React, { useState, useEffect } from 'react';
import './Login.css';
import { supabase } from '../lib/supabase';

interface LoginProps {
    onBack?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onBack }) => {
    const [isRightPanelActive, setIsRightPanelActive] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [googleLoading, setGoogleLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        const err = supabase.auth.getRedirectError();
        if (err) {
            setAuthError(err);
            supabase.auth.clearRedirectError();
        }
    }, []);

    const getNetworkErrorMessage = (error: any): string => {
        if (!navigator.onLine) return 'You are offline. Please check your internet connection.';
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
            return 'Unable to connect to the authentication server. Please try again later.';
        }
        if (error?.code) {
            return `Error ${error.code}: ${error.message || 'Check Firebase Console → Authentication → Settings → Authorized domains'}`;
        }
        return error?.message || 'An unexpected error occurred. Please try again.';
    };

    const handleGoogleLogin = async (e: React.MouseEvent) => {
        e.preventDefault();
        setAuthError(null);
        setGoogleLoading(true);
        try {
            const { error } = await supabase.auth.signInWithGooglePopup();
            if (error) {
                if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
                    console.warn('Google popup blocked, trying redirect...');
                    supabase.auth.signInWithGoogleRedirect();
                } else {
                    console.error('Google login error:', error);
                    setAuthError(getNetworkErrorMessage(error));
                }
            }
        } catch (error: any) {
            console.warn('Google popup failed, trying redirect...', error);
            supabase.auth.signInWithGoogleRedirect();
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: name,
                    }
                }
            });
            if (error) throw error;
            alert('Signup successful! Check your email to verify your account.');
        } catch (error: any) {
            console.error('Signup error:', error);
            setAuthError(`Signup failed: ${getNetworkErrorMessage(error)}`);
        }
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        } catch (error: any) {
            console.error('Login error:', error);
            setAuthError(`Login failed: ${getNetworkErrorMessage(error)}`);
        }
    };

    return (
        <div id="login-root" className="relative">
            {onBack && (
                <button
                    onClick={onBack}
                    className="fixed top-6 left-6 z-[1000] px-4 py-2 bg-black/40 hover:bg-black/60 text-white rounded-lg backdrop-blur-md transition-all border border-white/20 text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-lg"
                >
                    &larr; Back to App
                </button>
            )}
            {authError && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[2000] max-w-lg w-full px-4">
                    <div className="bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-start gap-2">
                        <span className="flex-1">{authError}</span>
                        <button onClick={() => setAuthError(null)} className="text-white/80 hover:text-white font-bold cursor-pointer">&times;</button>
                    </div>
                </div>
            )}
            <div className={`doubleslider-container ${isRightPanelActive ? 'right-panel-active' : ''}`}>

                <div className="form-container register-container">
                    <form onSubmit={handleEmailSignUp}>
                        <h1>SIGN UP</h1>
                        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
                        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        <button type="submit">Register</button>
                        <span>or use your account</span>
                        <div className="social-container">
                            <a href="#" className={`social ${googleLoading ? 'disabled' : ''}`} onClick={handleGoogleLogin}>
                                {googleLoading ? <span className="loading-spinner"></span> : <i className="lni lni-google"></i>}
                            </a>
                        </div>
                    </form>
                </div>

                <div className="form-container login-container">
                    <form onSubmit={handleEmailSignIn}>
                        <h1>SIGN IN</h1>
                        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        <div className="content">
                            <div className="checkbox">
                                <input type="checkbox" name="checkbox" id="checkbox" />
                                <label htmlFor="checkbox">Remember me</label>
                            </div>
                        </div>
                        <button type="submit">Login</button>
                        <div className="pass-link">
                            <a href="#">Forgot password?</a>
                        </div>
                        <span>or use your account</span>
                        <div className="social-container">
                            <a href="#" className={`social ${googleLoading ? 'disabled' : ''}`} onClick={handleGoogleLogin}>
                                {googleLoading ? <span className="loading-spinner"></span> : <i className="lni lni-google"></i>}
                            </a>
                        </div>
                    </form>
                </div>

                <div className="overlay-container">
                    <div className="overlay">
                        <div className="overlay-panel overlay-left">
                            <h1 className="title">Hello <br /> friends</h1>
                            <p>if you have an account, login here and have fun</p>
                            <button
                                type="button"
                                className="ghost"
                                id="login"
                                onClick={() => setIsRightPanelActive(false)}
                            >
                                Login
                                <i className="lni lni-arrow-left login"></i>
                            </button>
                        </div>
                        <div className="overlay-panel overlay-right">
                            <h1 className="title">Start your <br /> journey now</h1>
                            <p>if you don't have an account yet, join us and start your journey.</p>
                            <button
                                type="button"
                                className="ghost"
                                id="register"
                                onClick={() => setIsRightPanelActive(true)}
                            >
                                Register
                                <i className="lni lni-arrow-right register"></i>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
