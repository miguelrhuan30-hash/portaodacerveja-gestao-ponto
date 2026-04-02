import React, { useState } from 'react';
import { Beer, Eye, EyeOff, LogIn } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

const googleProvider = new GoogleAuthProvider();

const LoginView: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged no App.tsx cuida do resto
    } catch (err: any) {
      const msg =
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'Email ou senha incorretos.'
          : err.code === 'auth/user-not-found'
          ? 'Usuário não encontrado.'
          : err.code === 'auth/too-many-requests'
          ? 'Muitas tentativas. Aguarde alguns minutos.'
          : 'Erro ao fazer login. Tente novamente.';
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;

      const usersRef = collection(db, 'users');
      const [snapUid, snapEmail] = await Promise.all([
        getDocs(query(usersRef, where('firebaseUid', '==', firebaseUser.uid))),
        getDocs(query(usersRef, where('email', '==', firebaseUser.email))),
      ]);

      const userDoc = !snapUid.empty ? snapUid.docs[0]
                    : !snapEmail.empty ? snapEmail.docs[0]
                    : null;

      if (userDoc && userDoc.data().active) {
        if (!userDoc.data().firebaseUid) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            firebaseUid: firebaseUser.uid
          });
        }
        // onAuthStateChanged cuida do resto
        return;
      }

      // Usuário não cadastrado: bloquear + notificar MASTER
      await signOut(auth);
      await addDoc(collection(db, 'access_attempts'), {
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        photoUrl: firebaseUser.photoURL,
        attemptedAt: Date.now(),
        provider: 'google',
        notified: false,
      });

      alert(
        'Acesso negado.\n\n' +
        'Sua conta Google não está cadastrada no sistema.\n' +
        'O gestor foi notificado sobre esta tentativa de acesso.'
      );

    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        alert('Erro ao entrar com Google. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Beer className="mx-auto text-amber-400 w-12 h-12" />
          <h1 className="text-2xl font-black text-white">Portão da Cerveja</h1>
          <p className="text-amber-400/70 text-sm">Sistema de Gestão</p>
        </div>

        <form onSubmit={handleEmailLogin} className="bg-amber-900/40 rounded-3xl p-6 space-y-4 border border-amber-800/40">
          <div className="space-y-1">
            <label className="text-xs font-bold text-amber-300 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="w-full bg-amber-950/60 border border-amber-800/50 rounded-2xl px-4 py-3 text-white placeholder-amber-700 focus:outline-none focus:border-amber-500 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-amber-300 uppercase tracking-wider">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-amber-950/60 border border-amber-800/50 rounded-2xl px-4 py-3 text-white placeholder-amber-700 focus:outline-none focus:border-amber-500 text-sm pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-600 hover:text-amber-400"
              >
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-amber-950 font-black py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wide"
          >
            <LogIn size={18}/>
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-amber-800/40"/>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-amber-900/40 px-3 text-amber-600/70 text-xs uppercase tracking-widest">ou</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-2xl font-bold text-sm transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Entrar com Google
          </button>
        </form>

        <p className="text-center text-amber-800/60 text-xs">
          Portão da Cerveja © 2026
        </p>
      </div>
    </div>
  );
};

export default LoginView;
