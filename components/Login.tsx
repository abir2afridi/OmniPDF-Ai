import React, { useState } from 'react';
import './Login.css';
import { supabase } from '../lib/supabase';

interface LoginProps {
    onBack?: () => void;
}

function initGoogleOneTap() {
    if (typeof google === 'undefined' || !google.accounts?.id) return;
    google.accounts.id.initialize({
        client_id: '1044154368370-do81h015m74j9qbbjj77adsibc3tdqpg.apps.googleusercontent.com',
        cancel_on_tap_outside: false,
        callback: async (response: any) => {
            if (response.credential) {
                const { error } = await supabase.auth.signInWithGoogleIdToken(response.credential);
                if (error) console.error('Google OneTap sign-in error:', error);
            }
        },
    });
}

export const Login: React.FC<LoginProps> = ({ onBack }) => {
    const [isRightPanelActive, setIsRightPanelActive] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');

    const getNetworkErrorMessage = (error: any): string => {
        if (!navigator.onLine) return 'You are offline. Please check your internet connection.';
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
            return 'Unable to connect to the authentication server. Please try again later.';
        }
        return error?.message || 'An unexpected error occurred. Please try again.';
    };

    const handleGoogleLogin = (e: React.MouseEvent) => {
        e.preventDefault();
        if (typeof google === 'undefined' || !google.accounts?.id) {
            alert('Google Sign-In is loading. Please try again in a moment.');
            return;
        }
        initGoogleOneTap();
        google.accounts.id.prompt();
    };

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
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
            alert(`Signup failed: ${getNetworkErrorMessage(error)}`);
        }
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        } catch (error: any) {
            console.error('Login error:', error);
            alert(`Login failed: ${getNetworkErrorMessage(error)}`);
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
                            <a href="#" className="social" onClick={handleGoogleLogin}><i className="lni lni-google"></i></a>
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
                            <a href="#" className="social" onClick={handleGoogleLogin}><i className="lni lni-google"></i></a>
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

declare global {
    interface Window {
        google?: any;
    }
}
