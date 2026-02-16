
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Save, Lock, Mail, User, RefreshCw, CheckCircle, ShieldCheck, ScanFace, Info, X, Check, AlertCircle, TrendingUp, Target, Award, CheckCircle2 } from 'lucide-react';
import { SystemUser, Task } from '../types';
import SystemUpdater from './SystemUpdater';

interface UserProfileProps {
  user: SystemUser;
  tasks: Task[];
  onUpdateUser: (user: SystemUser) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ user, tasks, onUpdateUser }) => {
  const [formData, setFormData] = useState({ name: user.name, email: user.email, password: user.password || '' });
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(user.avatar || null);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => { setFormData({ name: user.name, email: user.email, password: user.password || '' }); setPhoto(user.avatar || null); }, [user]);

  const stats = useMemo(() => {
    const userTasks = tasks.filter(t => t.assignedUserIds.includes(user.id));
    const done = userTasks.filter(t => t.status === 'CONCLUIDA').length;
    const expired = userTasks.filter(t => t.status === 'VENCIDA').length;
    const total = userTasks.length;
    
    // Métrica: Barra cheia que esvazia com atrasos/vencimentos
    const integrity = total > 0 ? Math.max(0, ((total - expired) / total) * 100) : 100;
    
    return { done, expired, total, integrity };
  }, [tasks, user.id]);

  const openCamera = async () => { setTempPhoto(null); setIsReady(false); setIsCameraModalOpen(true); setTimeout(async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: "user" } }); streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => { setIsReady(true); videoRef.current?.play(); }; } } catch (err) { alert("Câmera bloqueada."); setIsCameraModalOpen(false); } }, 300); };
  const closeCamera = () => { if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop()); setIsCameraModalOpen(false); };
  const capture = () => { if (videoRef.current && canvasRef.current) { const ctx = canvasRef.current.getContext('2d'); if (ctx) { const size = Math.min(videoRef.current.videoWidth, videoRef.current.videoHeight); canvasRef.current.width = 400; canvasRef.current.height = 400; ctx.drawImage(videoRef.current, (videoRef.current.videoWidth - size) / 2, (videoRef.current.videoHeight - size) / 2, size, size, 0, 0, 400, 400); setTempPhoto(canvasRef.current.toDataURL('image/jpeg', 0.85)); } } };
  const confirmPhoto = () => { if (tempPhoto) { setPhoto(tempPhoto); closeCamera(); } };
  const handleSave = async () => { if (!photo) { alert("Biometria obrigatória."); return; } setSaveStatus('SAVING'); try { await onUpdateUser({ ...user, ...formData, avatar: photo }); setSaveStatus('SAVED'); setTimeout(() => setSaveStatus('IDLE'), 3000); } catch (e) { setSaveStatus('ERROR'); } };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden border border-white/10 group">
         <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform"><Award size={140} className="text-white" /></div>
         <div className="relative z-10 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                   <h2 className="text-white text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                     <CheckCircle2 className="text-emerald-400" /> Placar Real
                   </h2>
                   <p className="text-slate-400 text-sm font-medium uppercase tracking-[0.2em]">Produtividade Atual</p>
                </div>
                
                <div className="flex items-center gap-6">
                   <div className="text-center">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Concluídas</p>
                      <p className="text-5xl font-black text-white leading-none">{stats.done}</p>
                   </div>
                   <div className="w-px h-12 bg-white/10" />
                   <div className="text-center">
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Vencidas</p>
                      <p className="text-5xl font-black text-white leading-none">{stats.expired}</p>
                   </div>
                </div>
            </div>

            <div className="space-y-2">
               <div className="flex justify-between items-center text-white px-1">
                 <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Integridade Operacional</span>
                 <span className="text-xs font-black">{Math.round(stats.integrity)}%</span>
               </div>
               <div className="w-full bg-white/5 h-4 rounded-full overflow-hidden border border-white/5 p-1">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.5)]" 
                    style={{ width: `${stats.integrity}%` }} 
                  />
               </div>
               <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Barra baseada no total de tarefas vs atrasos</p>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="h-32 md:h-48 bg-gradient-to-r from-amber-600 to-amber-700 relative">
          <div className="absolute -bottom-12 md:-bottom-16 left-6 md:left-12 flex items-center md:items-end gap-4 md:gap-8">
            <div className="relative">
              <div className="w-28 h-28 md:w-44 md:h-44 rounded-3xl md:rounded-[3.5rem] border-4 md:border-8 border-white bg-slate-100 shadow-2xl overflow-hidden flex items-center justify-center">
                {photo ? <img src={photo} className="w-full h-full object-cover scale-x-[-1]" alt="Perfil" /> : <ScanFace size={40} className="text-slate-300" />}
              </div>
              <button onClick={openCamera} className="absolute -bottom-2 -right-2 p-3 md:p-4 bg-amber-600 text-white rounded-xl md:rounded-2xl shadow-xl border-2 md:border-4 border-white active:scale-90 transition-transform z-10"><Camera size={20} /></button>
            </div>
            <div className="md:pb-8 pt-4">
              <h3 className="text-xl md:text-4xl font-black text-slate-800 tracking-tight leading-tight">{user.name}</h3>
              <div className="flex items-center gap-1.5 text-amber-600"><ShieldCheck size={16} /><span className="font-bold text-[10px] md:text-sm uppercase tracking-widest">{user.role === 'MASTER' ? 'Proprietário' : user.role === 'ADMIN' ? 'Gestor' : 'Colaborador'}</span></div>
            </div>
          </div>
        </div>

        <div className="pt-16 md:pt-24 p-6 md:p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            <section className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User size={14} className="text-amber-500" /> Dados Pessoais</h4>
              <div className="space-y-4">
                <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Nome</label><input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-xl outline-none text-slate-800 font-bold placeholder:text-slate-400" /></div>
                <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">E-mail</label><input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-xl outline-none text-slate-800 font-bold placeholder:text-slate-400" /></div>
              </div>
            </section>
            <section className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Lock size={14} className="text-amber-500" /> Segurança</h4>
              <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Senha</label><input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-xl outline-none text-slate-800 font-bold placeholder:text-slate-400" /></div>
            </section>
          </div>
        </div>

        <div className="p-6 md:p-10 bg-slate-50 border-t flex justify-end">
          <button onClick={handleSave} disabled={saveStatus === 'SAVING'} className={`w-full md:w-auto px-10 py-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-xl ${saveStatus === 'SAVED' ? 'bg-emerald-600' : 'bg-amber-600'} text-white`}>
            {saveStatus === 'SAVING' ? <RefreshCw className="animate-spin" /> : <Save />} {saveStatus === 'SAVED' ? 'ATUALIZADO!' : 'SALVAR PERFIL'}
          </button>
        </div>
      </div>

      <SystemUpdater />

      {isCameraModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 p-4">
          <div className="w-full max-w-lg flex flex-col items-center gap-6">
            <h3 className="text-white text-2xl font-black">Biometria Facial</h3>
            <div className="relative w-full aspect-square bg-slate-900 rounded-[2.5rem] overflow-hidden border-4 border-slate-800">
              {!tempPhoto ? <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" /> : <img src={tempPhoto} className="w-full h-full object-cover scale-x-[-1]" />}
            </div>
            {!tempPhoto ? <button onClick={capture} disabled={!isReady} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black">CAPTURAR</button> : <div className="w-full flex gap-3"><button onClick={confirmPhoto} className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black">CONFIRMAR</button><button onClick={() => setTempPhoto(null)} className="flex-1 py-5 bg-slate-800 text-white rounded-2xl font-black">REFAZER</button></div>}
            {!tempPhoto && <button onClick={closeCamera} className="text-slate-400 font-bold">CANCELAR</button>}
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default UserProfile;
