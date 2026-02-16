
import React, { useState } from 'react';
import { Beer, Mail, Lock, Eye, EyeOff, ArrowRight, Cpu } from 'lucide-react';
import { versionData } from '../version';
import SystemUpdater from './SystemUpdater';

interface LoginViewProps {
  onLogin: (email: string, pass: string, remember: boolean) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simular carregamento para efeito visual
    setTimeout(() => {
      onLogin(email, password, rememberMe);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-amber-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorativo (Brewery Feel) */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/10 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-amber-400/10 blur-[100px] rounded-full"></div>
      
      <div className="w-full max-w-md space-y-8 z-10 flex flex-col items-center">
        {/* Logo Section */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-600 shadow-2xl shadow-amber-900/50 mb-6 border border-amber-400/30">
            <Beer className="text-white w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Portão da Cerveja</h1>
          <p className="text-amber-400/60 font-medium mt-2 uppercase tracking-[0.2em] text-xs">Gestão & Ponto Eletrônico</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-md p-8 rounded-[2.5rem] shadow-2xl space-y-6 w-full">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Bem-vindo de volta!</h2>
            <p className="text-slate-500 text-sm">Acesse sua conta para gerenciar as atividades da cervejaria.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase ml-1">E-mail Corporativo</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-600 transition-colors">
                  <Mail size={18} />
                </div>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@portaodacerveja.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all placeholder:text-slate-400 text-slate-900 font-bold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase ml-1">Senha de Acesso</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-600 transition-colors">
                  <Lock size={18} />
                </div>
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all placeholder:text-slate-400 text-slate-900 font-bold"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" 
                />
                <span className="text-xs text-slate-500 group-hover:text-amber-700 font-medium">Lembrar acesso</span>
              </label>
              <button type="button" className="text-xs font-bold text-amber-600 hover:underline">Esqueceu a senha?</button>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-amber-900/10 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-70"
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Ferramenta de Atualização */}
        <SystemUpdater />

        <div className="text-center space-y-2 pb-8">
          <p className="text-amber-400/40 text-[10px] font-black uppercase tracking-widest">
            Copyright &copy; 2026 Portão da Cerveja
          </p>
          <div className="inline-flex items-center gap-2 text-[9px] font-bold text-amber-500/30 uppercase">
             <Cpu size={10} />
             <span>Versão {versionData.version}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
