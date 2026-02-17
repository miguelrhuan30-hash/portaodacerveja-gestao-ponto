
import React, { useState, useEffect } from 'react';
import { DollarSign, Lock, Unlock, Save, AlertCircle, Clock, FileText, CheckCircle2, Coins, Plus, TrendingDown, TrendingUp, AlertTriangle, Image as ImageIcon, X, UploadCloud } from 'lucide-react';
import { SystemUser, CashSession, CashEvent, CashEventType } from '../types';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';

interface CashRegisterProps {
  currentUser: SystemUser;
}

const CashRegister: React.FC<CashRegisterProps> = ({ currentUser }) => {
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [events, setEvents] = useState<CashEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // States Abertura/Fechamento
  const [inputValue, setInputValue] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // States Modal de Evento
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventData, setNewEventData] = useState<{
    type: CashEventType;
    amount: string;
    description: string;
    file: File | null;
  }>({
    type: 'SANGRIA',
    amount: '',
    description: '',
    file: null
  });

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
        const session = { id: docData.id, ...docData.data() } as CashSession;
        setCurrentSession(session);
        fetchEvents(session.id);
      } else {
        setCurrentSession(null);
        setEvents([]);
      }
    } catch (e) {
      console.error("Erro ao buscar sessão de caixa:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEvents = async (sessionId: string) => {
    try {
      const q = query(collection(db, 'cash_sessions', sessionId, 'events'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashEvent));
      setEvents(fetchedEvents);
    } catch (error) {
      console.error("Erro ao buscar eventos:", error);
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
      setEvents([]);
    } catch (e: any) {
      alert("Erro ao fechar caixa: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEvent = async () => {
    if (!currentSession) return;
    if (!newEventData.amount || !newEventData.description) return alert("Preencha valor e descrição.");
    
    // Validações Específicas
    if ((newEventData.type === 'SANGRIA' || newEventData.type === 'SALE_NO_ENTRY') && !newEventData.file) {
       return alert("Para Sangrias e Vendas sem registro, a foto do comprovante/recibo é obrigatória.");
    }

    setIsProcessing(true);
    try {
      let evidenceUrl = undefined;
      if (newEventData.file) {
         const fileName = `cash_evidence/${currentSession.id}/${Date.now()}_${newEventData.file.name}`;
         const storageRef = ref(storage, fileName);
         await uploadBytes(storageRef, newEventData.file);
         evidenceUrl = await getDownloadURL(storageRef);
      }

      const event: Omit<CashEvent, 'id'> = {
         sessionId: currentSession.id,
         type: newEventData.type,
         amount: parseFloat(newEventData.amount),
         description: newEventData.description,
         evidenceUrl,
         createdAt: Date.now(),
         createdBy: currentUser.name
      };

      await addDoc(collection(db, 'cash_sessions', currentSession.id, 'events'), event);
      
      await fetchEvents(currentSession.id);
      setShowEventModal(false);
      setNewEventData({ type: 'SANGRIA', amount: '', description: '', file: null });

    } catch (e: any) {
      alert("Erro ao salvar ocorrência: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getEventBadge = (type: CashEventType) => {
     switch(type) {
        case 'SANGRIA': return { label: 'Sangria / Retirada', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: <TrendingDown size={12}/> };
        case 'SALE_NO_ENTRY': return { label: 'Venda s/ Registro', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <TrendingUp size={12}/> };
        case 'ENTRY_ERROR': return { label: 'Erro de Lançamento', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertTriangle size={12}/> };
        default: return { label: 'Outros', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: <FileText size={12}/> };
     }
  };

  if (isLoading) return <div className="p-10 text-center text-slate-400">Carregando status do caixa...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in pb-20">
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

        <div className="p-8 space-y-8">
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
              // TELA DE FECHAMENTO E GESTÃO
              <>
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

                 {/* Seção de Ocorrências */}
                 <div className="border-t border-slate-100 pt-6">
                    <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-2">
                          <AlertCircle size={16}/> Ocorrências & Movimentações
                       </h3>
                       <button 
                         onClick={() => setShowEventModal(true)}
                         className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-black transition-colors"
                       >
                          <Plus size={12}/> Nova Ocorrência
                       </button>
                    </div>

                    {events.length === 0 ? (
                       <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                          Nenhuma movimentação registrada
                       </div>
                    ) : (
                       <div className="space-y-2">
                          {events.map(ev => {
                             const badge = getEventBadge(ev.type);
                             return (
                                <div key={ev.id} className="p-3 border rounded-xl flex items-center justify-between bg-white shadow-sm">
                                   <div className="flex items-center gap-3">
                                      <div className={`p-2 rounded-lg ${badge.color}`}>{badge.icon}</div>
                                      <div>
                                         <p className="text-xs font-bold text-slate-800">{ev.description}</p>
                                         <div className="flex items-center gap-2 mt-0.5">
                                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${badge.color}`}>{badge.label}</span>
                                            <span className="text-[9px] text-slate-400">{new Date(ev.createdAt).toLocaleTimeString()}</span>
                                         </div>
                                      </div>
                                   </div>
                                   <div className="flex items-center gap-3">
                                      <span className="font-mono font-bold text-slate-700 text-sm">R$ {ev.amount.toFixed(2)}</span>
                                      {ev.evidenceUrl && <ImageIcon size={16} className="text-blue-400"/>}
                                   </div>
                                </div>
                             );
                          })}
                       </div>
                    )}
                 </div>

                 <div className="border-t border-slate-100 pt-6 space-y-6">
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
                        placeholder="Observações finais sobre o fechamento..."
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
              </>
           )}
        </div>
      </div>

      {/* Modal Nova Ocorrência */}
      {showEventModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
               <div className="p-6 bg-slate-800 text-white flex justify-between items-center">
                  <h3 className="text-lg font-black uppercase">Registrar Ocorrência</h3>
                  <button onClick={() => setShowEventModal(false)}><X size={20}/></button>
               </div>
               <div className="p-6 space-y-4">
                  <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tipo</label>
                     <select 
                        value={newEventData.type} 
                        onChange={e => setNewEventData({...newEventData, type: e.target.value as CashEventType})}
                        className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none"
                     >
                        <option value="SANGRIA">Sangria / Retirada de Valor</option>
                        <option value="SALE_NO_ENTRY">Venda sem Lançamento (Sobra)</option>
                        <option value="ENTRY_ERROR">Erro de Digitação / Troco</option>
                        <option value="OTHER">Outros</option>
                     </select>
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Valor (R$)</label>
                     <input 
                        type="number" step="0.01"
                        value={newEventData.amount} 
                        onChange={e => setNewEventData({...newEventData, amount: e.target.value})}
                        placeholder="0.00"
                        className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none"
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Descrição</label>
                     <input 
                        type="text"
                        value={newEventData.description} 
                        onChange={e => setNewEventData({...newEventData, description: e.target.value})}
                        placeholder="Ex: Pagamento fornecedor X..."
                        className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none"
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Comprovante / Foto {['SANGRIA','SALE_NO_ENTRY'].includes(newEventData.type) && <span className="text-rose-500">*</span>}</label>
                     <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                        <input 
                           type="file" 
                           accept="image/*"
                           onChange={e => setNewEventData({...newEventData, file: e.target.files?.[0] || null})}
                           className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center gap-1 pointer-events-none">
                           <UploadCloud size={20} className="text-slate-400"/>
                           {newEventData.file ? (
                              <span className="text-xs font-bold text-emerald-600 truncate max-w-[200px]">{newEventData.file.name}</span>
                           ) : (
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Clique para anexar foto</span>
                           )}
                        </div>
                     </div>
                  </div>
                  
                  <button 
                     onClick={handleSaveEvent}
                     disabled={isProcessing}
                     className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs shadow-lg hover:bg-emerald-700 disabled:opacity-50 mt-2"
                  >
                     {isProcessing ? 'Salvando...' : 'Confirmar Registro'}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
