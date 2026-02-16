
import React, { useState, useEffect } from 'react';
import { DollarSign, Lock, Unlock, Save, AlertCircle, Clock, FileText, CheckCircle2, Coins } from 'lucide-react';
import { SystemUser, CashSession } from '../types';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

interface CashRegisterProps {
  currentUser: SystemUser;
}

const CashRegister: React.FC<CashRegisterProps> = ({ currentUser }) => {
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchCurrentSession();
  }, [currentUser]);

  const fetchCurrentSession = async () => {
    setIsLoading(true);
    try {
      // Busca sessão ABERTA do usuário
      const q = query(
        collection(db, 'cash_sessions'),
        where('userId', '==', currentUser.id),
        where('status', '==', 'OPEN')
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docData = snapshot.docs[0];
        setCurrentSession({ id: docData.id, ...docData.data() } as CashSession);
      } else {
        setCurrentSession(null);
      }
    } catch (e) {
      console.error("Erro ao buscar sessão de caixa:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCash = async () => {
    if (!inputValue) return alert("Informe o valor de abertura (Fundo de Caixa).");
    setIsProcessing(true);
    try {
      const openValue = parseFloat(inputValue.replace(',', '.'));
      if (isNaN(openValue)) return alert("Valor inválido.");

      const newSession: Omit<CashSession, 'id'> = {
        userId: currentUser.id,
        userName: currentUser.name,
        openTime: Date.now(),
        openValue: openValue,
        status: 'OPEN',
        salesDiff: 0
      };

      await addDoc(collection(db, 'cash_sessions'), newSession);
      await fetchCurrentSession();
      setInputValue('');
    } catch (e: any) {
      alert("Erro ao abrir caixa: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseCash = async () => {
    if (!currentSession || !inputValue) return alert("Informe o valor total em caixa.");
    setIsProcessing(true);
    try {
      const closeValue = parseFloat(inputValue.replace(',', '.'));
      if (isNaN(closeValue)) return alert("Valor inválido.");

      const salesDiff = closeValue - currentSession.openValue;

      await updateDoc(doc(db, 'cash_sessions', currentSession.id), {
        closeTime: Date.now(),
        closeValue: closeValue,
        salesDiff: salesDiff,
        status: 'CLOSED',
        notes: notes
      });

      alert(`Caixa Fechado com Sucesso!\nMovimentação: R$ ${salesDiff.toFixed(2)}`);
      setCurrentSession(null);
      setInputValue('');
      setNotes('');
    } catch (e: any) {
      alert("Erro ao fechar caixa: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="p-10 text-center text-slate-400">Carregando status do caixa...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
          <DollarSign size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Frente de Caixa</h2>
          <p className="text-slate-500 text-sm">Controle de abertura e fechamento de turno.</p>
        </div>
      </div>

      <div className={`rounded-[2rem] border overflow-hidden shadow-xl ${currentSession ? 'bg-white border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        
        {/* Header do Card */}
        <div className={`p-6 border-b flex justify-between items-center ${currentSession ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-200 border-slate-300'}`}>
           <div className="flex items-center gap-2">
              {currentSession ? <Unlock className="text-emerald-600"/> : <Lock className="text-slate-500"/>}
              <span className={`font-black uppercase tracking-widest text-sm ${currentSession ? 'text-emerald-800' : 'text-slate-600'}`}>
                 {currentSession ? 'Caixa Aberto' : 'Caixa Fechado'}
              </span>
           </div>
           {currentSession && (
              <div className="text-right">
                 <p className="text-[10px] font-bold text-emerald-600 uppercase">Aberto às</p>
                 <p className="font-mono font-bold text-emerald-900">{new Date(currentSession.openTime).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
              </div>
           )}
        </div>

        <div className="p-8 space-y-6">
           {!currentSession ? (
              // TELA DE ABERTURA
              <div className="space-y-6">
                 <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
                    <p className="text-slate-500 text-sm mb-4">Informe o valor inicial (Fundo de Troco) para iniciar as operações.</p>
                    <div className="relative max-w-xs mx-auto">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                       <input 
                         type="number" 
                         step="0.01" 
                         value={inputValue}
                         onChange={e => setInputValue(e.target.value)}
                         placeholder="0,00"
                         className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-2xl font-black text-slate-800 outline-none focus:border-amber-500 transition-colors text-center"
                       />
                    </div>
                 </div>
                 <button 
                   onClick={handleOpenCash}
                   disabled={isProcessing || !inputValue}
                   className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-lg shadow-xl hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                    {isProcessing ? <Clock className="animate-spin"/> : <Unlock/>} ABRIR CAIXA
                 </button>
              </div>
           ) : (
              // TELA DE FECHAMENTO
              <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor de Abertura</p>
                       <p className="text-2xl font-black text-slate-700">R$ {currentSession.openValue.toFixed(2)}</p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                       <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">Tempo Decorrido</p>
                       <p className="text-2xl font-black text-amber-900">
                          {Math.floor((Date.now() - currentSession.openTime) / (1000 * 60 * 60))}h {Math.floor(((Date.now() - currentSession.openTime) % (1000 * 60 * 60)) / (1000 * 60))}m
                       </p>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase ml-1">Valor Final em Gaveta (Dinheiro + Comprovantes)</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                       <input 
                         type="number" 
                         step="0.01" 
                         value={inputValue}
                         onChange={e => setInputValue(e.target.value)}
                         placeholder="0,00"
                         className="w-full pl-10 pr-4 py-4 bg-white border-2 border-slate-200 rounded-xl text-2xl font-black text-slate-800 outline-none focus:border-rose-500 transition-colors"
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase ml-1">Observações de Fechamento</label>
                    <textarea 
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Ex: Sangria de R$ 50,00 realizada; Diferença justificada por..."
                      className="w-full p-4 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 h-24 outline-none focus:border-rose-500 resize-none"
                    />
                 </div>

                 <button 
                   onClick={handleCloseCash}
                   disabled={isProcessing || !inputValue}
                   className="w-full py-4 bg-rose-600 text-white rounded-xl font-black uppercase text-lg shadow-xl hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                    {isProcessing ? <Clock className="animate-spin"/> : <Lock/>} FECHAR CAIXA & CONFERIR
                 </button>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default CashRegister;
