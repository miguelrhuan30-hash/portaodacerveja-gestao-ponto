
import React, { useState, useEffect } from 'react';
import { X, History, TrendingUp, TrendingDown, Plus, Minus, Save, AlertCircle } from 'lucide-react';
import { SystemUser, TimeBankTransaction } from '../types';
import { collection, query, where, orderBy, getDocs, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

interface TimeBankModalProps {
  user: SystemUser;
  currentUser: SystemUser;
  onClose: () => void;
  onBalanceUpdate: () => void; // Callback para atualizar a lista principal
}

const TimeBankModal: React.FC<TimeBankModalProps> = ({ user, currentUser, onClose, onBalanceUpdate }) => {
  const [transactions, setTransactions] = useState<TimeBankTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formata hora decimal para HH:mm
  const formatHours = (decimal: number) => {
    const hours = Math.floor(Math.abs(decimal));
    const minutes = Math.round((Math.abs(decimal) - hours) * 60);
    const sign = decimal < 0 ? '-' : '+';
    return `${sign}${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        // Query simplificada para evitar erro de índice composto (userId + date)
        const q = query(
          collection(db, 'time_bank_transactions'),
          where('userId', '==', user.id)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as TimeBankTransaction))
            .sort((a, b) => b.date - a.date); // Ordenação feita no cliente

        setTransactions(data);
      } catch (error) {
        console.error("Erro ao buscar transações:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTransactions();
  }, [user.id]);

  const handleAdjustment = async () => {
    if (!adjustmentAmount || !adjustmentReason) return alert("Preencha o valor e o motivo.");
    
    setIsSubmitting(true);
    try {
      const value = parseFloat(adjustmentAmount);
      const finalAmount = adjustmentType === 'CREDIT' ? value : -value;

      const newTransaction: Omit<TimeBankTransaction, 'id'> = {
        userId: user.id,
        date: Date.now(),
        amount: finalAmount,
        type: 'MANUAL_ADJUSTMENT',
        description: adjustmentReason,
        authorId: currentUser.id
      };

      // 1. Cria transação
      await addDoc(collection(db, 'time_bank_transactions'), newTransaction);

      // 2. Atualiza saldo do usuário
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        timeBankBalance: increment(finalAmount)
      });

      alert("Ajuste realizado com sucesso!");
      onBalanceUpdate();
      onClose();

    } catch (e: any) {
      alert("Erro ao ajustar saldo: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const balance = user.timeBankBalance || 0;
  const isPositive = balance >= 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95">
        
        {/* Header */}
        <div className={`p-8 text-white flex justify-between items-start ${isPositive ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Banco de Horas</h3>
            <p className="text-white/80 font-bold text-sm">{user.name}</p>
          </div>
          <button onClick={onClose} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          
          {/* Saldo Atual */}
          <div className="text-center space-y-2">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Saldo Atual Acumulado</p>
            <div className={`text-6xl font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatHours(balance)}
            </div>
            <p className="text-slate-400 text-sm font-medium">
               {balance === 0 ? 'Zerado' : isPositive ? 'Crédito a compensar ou pagar' : 'Débito a pagar pelo funcionário'}
            </p>
          </div>

          {/* Ajuste Manual (Apenas Gestores) */}
          {(currentUser.role === 'MASTER' || currentUser.role === 'ADMIN') && (
             <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                <h4 className="font-black text-slate-700 uppercase text-xs flex items-center gap-2">
                   <AlertCircle size={14}/> Ajuste Manual
                </h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                      <div className="flex bg-white rounded-xl p-1 border">
                         <button 
                           onClick={() => setAdjustmentType('CREDIT')}
                           className={`flex-1 py-2 rounded-lg text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${adjustmentType === 'CREDIT' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}
                         >
                            <Plus size={12}/> Crédito
                         </button>
                         <button 
                           onClick={() => setAdjustmentType('DEBIT')}
                           className={`flex-1 py-2 rounded-lg text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${adjustmentType === 'DEBIT' ? 'bg-rose-100 text-rose-700' : 'text-slate-400'}`}
                         >
                            <Minus size={12}/> Débito
                         </button>
                      </div>
                   </div>
                   <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Qtd. Horas (Decimal)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        placeholder="Ex: 1.5" 
                        value={adjustmentAmount}
                        onChange={e => setAdjustmentAmount(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border rounded-xl font-bold text-slate-800 outline-none"
                      />
                   </div>
                   <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Motivo / Descrição</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Pagamento de hora extra, Falta justificada..." 
                        value={adjustmentReason}
                        onChange={e => setAdjustmentReason(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border rounded-xl font-bold text-slate-800 outline-none"
                      />
                   </div>
                </div>
                <button 
                  onClick={handleAdjustment}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-slate-800 text-white rounded-xl font-black uppercase text-xs hover:bg-black transition-colors disabled:opacity-50"
                >
                   {isSubmitting ? 'Processando...' : 'Confirmar Ajuste'}
                </button>
             </div>
          )}

          {/* Histórico */}
          <div className="space-y-4">
             <h4 className="font-black text-slate-700 uppercase text-xs flex items-center gap-2">
                <History size={14}/> Histórico de Movimentações
             </h4>
             <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {isLoading ? (
                   <p className="text-center text-slate-400 text-xs py-4">Carregando...</p>
                ) : transactions.length === 0 ? (
                   <p className="text-center text-slate-400 text-xs py-4">Nenhuma movimentação registrada.</p>
                ) : (
                   transactions.map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3 bg-white border rounded-xl text-xs">
                         <div>
                            <p className="font-bold text-slate-700">{t.description}</p>
                            <p className="text-[10px] text-slate-400">{new Date(t.date).toLocaleString()}</p>
                         </div>
                         <div className={`font-black ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {t.amount > 0 ? '+' : ''}{t.amount}h
                         </div>
                      </div>
                   ))
                )}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TimeBankModal;
