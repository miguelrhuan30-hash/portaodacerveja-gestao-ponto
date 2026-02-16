
import React, { useState, useMemo, useRef } from 'react';
import { Calendar as CalendarIcon, Users, Clock, History, CheckCircle2, AlertCircle, Archive, Trash2, TrendingUp, Search, Grid, List, ChevronLeft, ChevronRight, MapPin, Save, ShieldCheck, RefreshCw, X, MapPinned, ArrowDownLeft, ArrowUpRight, Edit3, Plus, LogOut, FileText, UploadCloud, AlertTriangle, Image as ImageIcon, Scale } from 'lucide-react';
import { AttendanceEntry, SystemUser, BranchLocation, Task, TaskStatus } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../firebase';
import { addDoc, collection } from 'firebase/firestore';
import TimeBankModal from './TimeBankModal';

interface AttendanceReportsProps {
  logs: AttendanceEntry[];
  users: SystemUser[];
  tasks: Task[];
  locations: BranchLocation[];
  onSaveLocation: (location: BranchLocation) => void;
  onDeleteLocation: (id: string) => void;
  onDeleteAttendance?: (id: string) => void;
  versionInfo: { version: string; deployDate: string; lastChanges: string[] };
  currentUser?: SystemUser; 
}

// Interface para o Relatório Diário Agregado
interface DailyReportRow {
  dateObj: Date;
  dateStr: string; // DD/MM/YYYY
  employeeId: string;
  employeeName: string;
  pairs: { in: AttendanceEntry, out?: AttendanceEntry }[];
  totalWorkedHours: number; // Decimal
  expectedHours: number; // Decimal
  balance: number; // Decimal
  status: 'OK' | 'MISSING_OUT' | 'ABSENT' | 'OFF_DAY';
}

const AttendanceReports: React.FC<AttendanceReportsProps> = ({ logs, users, tasks, locations, onSaveLocation, onDeleteLocation, onDeleteAttendance, versionInfo, currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'ponto' | 'historico' | 'produtividade'>('ponto');
  const [selectedUser, setSelectedUser] = useState<string | 'todos'>('todos');
  
  // Estados de Filtro de Data (Unificados no Topo)
  const [startDate, setStartDate] = useState<string>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Modais
  const [editingLocation, setEditingLocation] = useState<BranchLocation | null>(null);
  const [newLocation, setNewLocation] = useState<Partial<BranchLocation>>({ name: '', lat: 0, lng: 0, radius: 300, address: '', active: true });
  const [forcedExitData, setForcedExitData] = useState<{ openEntry: AttendanceEntry | null } | null>(null);
  const [showTimeBankModal, setShowTimeBankModal] = useState<SystemUser | null>(null);

  // Estados Form Saída Forçada
  const [forcedTime, setForcedTime] = useState('');
  const [forcedReason, setForcedReason] = useState('Esquecimento');
  const [forcedEvidence, setForcedEvidence] = useState<File | null>(null);
  const [isProcessingForced, setIsProcessingForced] = useState(false);
  
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // --- LÓGICA DE CÁLCULO DE PONTO E BANCO DE HORAS (SUPORTE MADRUGADA) ---
  
  const dailyReports = useMemo(() => {
    // 1. Filtrar logs pelos usuários selecionados
    const targetUserIds = selectedUser === 'todos' ? users.map(u => u.id) : [selectedUser];
    const filteredLogs = logs.filter(l => targetUserIds.includes(l.employeeId));

    // 2. Ordenar cronologicamente absoluto
    const sortedLogs = [...filteredLogs].sort((a, b) => a.timestamp - b.timestamp);

    // 3. Agrupar por usuário para processar pares linearmente
    const userGroups: { [key: string]: AttendanceEntry[] } = {};
    sortedLogs.forEach(log => {
        if (!userGroups[log.employeeId]) userGroups[log.employeeId] = [];
        userGroups[log.employeeId].push(log);
    });

    // 4. Formar pares de [Entrada, Saída?]
    const allPairs: { in: AttendanceEntry, out?: AttendanceEntry, dateKey: string }[] = [];
    
    Object.keys(userGroups).forEach(uid => {
        const uLogs = userGroups[uid];
        let currentIn: AttendanceEntry | null = null;
        
        uLogs.forEach(log => {
            if (log.type === 'ENTRADA') {
                if (currentIn) {
                    // Entrada sem saída prévia -> Fecha anterior como Aberto
                    const entryDate = new Date(currentIn.timestamp);
                    const dateKey = entryDate.toLocaleDateString('en-CA'); // YYYY-MM-DD para facilitar filtro
                    allPairs.push({ in: currentIn, dateKey });
                }
                currentIn = log;
            } else if (log.type === 'SAIDA') {
                if (currentIn) {
                    // Par fechado corretamente (mesmo que seja no dia seguinte)
                    const entryDate = new Date(currentIn.timestamp);
                    const dateKey = entryDate.toLocaleDateString('en-CA');
                    allPairs.push({ in: currentIn, out: log, dateKey });
                    currentIn = null;
                }
                // Saída órfã ignorada no cálculo
            }
        });

        // Sobrou uma entrada no final
        if (currentIn) {
            const entryDate = new Date(currentIn.timestamp);
            const dateKey = entryDate.toLocaleDateString('en-CA');
            allPairs.push({ in: currentIn, dateKey });
        }
    });

    // 5. Gerar linhas do relatório baseado no range de datas selecionado
    const rows: DailyReportRow[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    // Iterar dia a dia
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const currentDayStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
        const currentDayDate = new Date(d);
        const dayOfWeek = currentDayDate.getDay();

        targetUserIds.forEach(uid => {
            const user = users.find(u => u.id === uid);
            if (!user) return;

            // Buscar pares que COMEÇARAM neste dia
            const dayPairs = allPairs.filter(p => p.dateKey === currentDayStr && p.in.employeeId === uid);

            let totalWorkedHours = 0;
            let hasOpenPair = false;

            dayPairs.forEach(p => {
                if (p.out) {
                    totalWorkedHours += (p.out.timestamp - p.in.timestamp) / (1000 * 60 * 60);
                } else {
                    hasOpenPair = true;
                }
            });

            // Meta do dia
            let expectedHours = 0;
            let isWorkDay = false;
            
            // Lógica Avançada de Escala (Fixo vs Flexível)
            if (user.workSchedule) {
                if (user.workSchedule.type === 'FIXED' && user.workSchedule.weekDayConfig) {
                    // Escala Fixa
                    const dayConfig = user.workSchedule.weekDayConfig[dayOfWeek];
                    
                    // Verifica Exceções
                    const exception = user.workSchedule.monthlyExceptions?.find(e => e.date === currentDayStr);
                    
                    if (exception) {
                        if (exception.type === 'WORK' && exception.start && exception.end) {
                             const [h1, m1] = exception.start.split(':').map(Number);
                             const [h2, m2] = exception.end.split(':').map(Number);
                             let diff = (h2 + m2/60) - (h1 + m1/60);
                             if(diff < 0) diff += 24; // Madrugada
                             expectedHours = diff - ((exception.breakDuration || 0) / 60);
                             isWorkDay = true;
                        } else {
                             // OFF
                             expectedHours = 0;
                             isWorkDay = false;
                        }
                    } else if (dayConfig && dayConfig.enabled) {
                        const [h1, m1] = dayConfig.start.split(':').map(Number);
                        const [h2, m2] = dayConfig.end.split(':').map(Number);
                        let diff = (h2 + m2/60) - (h1 + m1/60);
                        if(diff < 0) diff += 24;
                        expectedHours = diff - ((dayConfig.breakDuration || 0) / 60);
                        isWorkDay = true;
                    }
                } else {
                    // Escala Flexível
                    if (user.workSchedule.workDays?.includes(dayOfWeek)) {
                        expectedHours = user.workSchedule.dailyHours || 8;
                        isWorkDay = true;
                    }
                }
            } else {
                // Fallback legado
                if (dayOfWeek >= 1 && dayOfWeek <= 5) { expectedHours = 8; isWorkDay = true; }
            }

            const balance = totalWorkedHours - expectedHours;

            // Status
            let status: DailyReportRow['status'] = 'OK';
            if (hasOpenPair) status = 'MISSING_OUT';
            else if (totalWorkedHours === 0 && isWorkDay) {
                 const isToday = new Date().toDateString() === currentDayDate.toDateString();
                 // Se é hoje e ainda não trabalhou, ok. Se é passado, falta.
                 status = isToday ? 'OK' : 'ABSENT';
            } else if (!isWorkDay) {
                status = 'OFF_DAY';
            }

            if (dayPairs.length > 0 || (isWorkDay && status === 'ABSENT')) {
                rows.push({
                    dateObj: new Date(currentDayDate),
                    dateStr: currentDayDate.toLocaleDateString('pt-BR'),
                    employeeId: user.id,
                    employeeName: user.name,
                    pairs: dayPairs,
                    totalWorkedHours,
                    expectedHours,
                    balance,
                    status
                });
            }
        });
    }

    return rows.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  }, [logs, users, startDate, endDate, selectedUser]);

  // Resumo do Período
  const periodSummary = useMemo(() => {
    let totalBalance = 0;
    let missingOutCount = 0;
    let absentCount = 0;

    dailyReports.forEach(row => {
        // Só soma saldo se não tiver erro de ponto aberto
        if (row.status !== 'MISSING_OUT') {
            totalBalance += row.balance;
        }
        if (row.status === 'MISSING_OUT') missingOutCount++;
        if (row.status === 'ABSENT') absentCount++;
    });

    return { totalBalance, missingOutCount, absentCount };
  }, [dailyReports]);

  // Funções Auxiliares
  const formatDecimalHours = (decimal: number) => {
    const sign = decimal < 0 ? '-' : '';
    const abs = Math.abs(decimal);
    const hours = Math.floor(abs);
    const minutes = Math.round((abs - hours) * 60);
    return `${sign}${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  const handleForcedExitSubmit = async () => {
    if (!forcedExitData?.openEntry || !forcedTime) return;
    if (!currentUser) return alert("Erro de permissão.");

    setIsProcessingForced(true);
    try {
        let evidenceUrl = '';
        if (forcedEvidence) {
            const fileName = `evidence/forced_exits/${Date.now()}_${forcedEvidence.name}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, forcedEvidence);
            evidenceUrl = await getDownloadURL(storageRef);
        }

        const exitDate = new Date(forcedTime);
        
        // Validação simples: Saída deve ser depois da Entrada
        if (exitDate.getTime() <= forcedExitData.openEntry.timestamp) {
            alert("A hora de saída deve ser posterior à hora de entrada.");
            setIsProcessingForced(false);
            return;
        }

        const newLog: Omit<AttendanceEntry, 'id'> = {
            employeeId: forcedExitData.openEntry.employeeId,
            employeeName: forcedExitData.openEntry.employeeName,
            type: 'SAIDA',
            timestamp: exitDate.getTime(),
            photoUrl: forcedExitData.openEntry.photoUrl,
            evidenceUrl: evidenceUrl,
            location: {
                lat: 0, lng: 0, address: 'Registro Administrativo', locationName: 'Fechamento Manual'
            },
            isForced: true,
            forcedBy: currentUser.id,
            forcedReason: forcedReason
        };

        await addDoc(collection(db, 'pontos'), newLog);
        setForcedExitData(null);
        setForcedEvidence(null);
        setForcedTime('');
    } catch (e: any) {
        alert("Erro: " + e.message);
    } finally {
        setIsProcessingForced(false);
    }
  };

  const handleCreateLocation = async () => {
      // (Lógica mantida do código original)
      if (!newLocation.name || !newLocation.lat || !newLocation.lng) return alert("Preencha os campos.");
      setIsSavingSettings(true);
      try {
        const loc: BranchLocation = {
            id: Math.random().toString(36).substr(2, 9),
            name: newLocation.name!, lat: newLocation.lat!, lng: newLocation.lng!, radius: newLocation.radius || 300, address: newLocation.address || '', active: true
        };
        await onSaveLocation(loc);
        setNewLocation({ name: '', lat: 0, lng: 0, radius: 300, address: '', active: true });
      } finally { setIsSavingSettings(false); }
  };
  const handleUpdateLocation = async () => { if(editingLocation) { setIsSavingSettings(true); await onSaveLocation(editingLocation); setEditingLocation(null); setIsSavingSettings(false); }};

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      
      {/* Topo Unificado: Filtros de Data e Usuário */}
      <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button onClick={() => setActiveSubTab('ponto')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeSubTab === 'ponto' ? 'bg-white text-slate-800 shadow' : 'text-slate-500'}`}>Frequência & Banco</button>
            <button onClick={() => setActiveSubTab('historico')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeSubTab === 'historico' ? 'bg-white text-slate-800 shadow' : 'text-slate-500'}`}>Visão Tarefas</button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
             <div className="flex items-center gap-2 bg-slate-50 border rounded-xl px-3 py-2">
                <CalendarIcon size={14} className="text-slate-400"/>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 w-24 outline-none" />
                <span className="text-slate-300">|</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 w-24 outline-none" />
             </div>
             
             <select 
               value={selectedUser} 
               onChange={e => setSelectedUser(e.target.value)} 
               className="px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold uppercase text-slate-900 outline-none"
             >
                <option value="todos">Toda a Equipe</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
             </select>

             {(selectedUser !== 'todos' && currentUser?.role !== 'EMPLOYEE') && (
                <button 
                  onClick={() => setShowTimeBankModal(users.find(u => u.id === selectedUser) || null)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-md"
                >
                   <Scale size={16}/> Gerir Banco
                </button>
             )}
          </div>
      </div>

      {activeSubTab === 'ponto' && (
        <div className="space-y-8">
          
          {/* Resumo do Período */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className={`p-6 rounded-2xl border shadow-sm ${periodSummary.totalBalance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">Saldo do Período</p>
                <h3 className={`text-3xl font-black ${periodSummary.totalBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                   {periodSummary.totalBalance > 0 ? '+' : ''}{formatDecimalHours(periodSummary.totalBalance)}
                </h3>
             </div>
             <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Pontos em Aberto</p>
                <h3 className="text-3xl font-black text-amber-600">{periodSummary.missingOutCount}</h3>
             </div>
             <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Faltas / Ausências</p>
                <h3 className="text-3xl font-black text-slate-700">{periodSummary.absentCount}</h3>
             </div>
          </div>

          {/* Tabela de Espelho de Ponto (Reformulada) */}
          <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
             <div className="p-6 border-b font-black text-slate-800 text-sm flex items-center gap-2 uppercase tracking-tighter">
                <Clock size={18} className="text-amber-500" /> Detalhe Diário
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400 tracking-widest">
                   <tr>
                     <th className="px-6 py-4">Data Ref</th>
                     <th className="px-6 py-4">Colaborador</th>
                     <th className="px-6 py-4">Turno (Entrada ➜ Saída)</th>
                     <th className="px-6 py-4">Trabalhado</th>
                     <th className="px-6 py-4">Meta</th>
                     <th className="px-6 py-4">Saldo</th>
                     <th className="px-6 py-4 text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {dailyReports.map((row, idx) => {
                     // Verifica explicitamente se existe algum par aberto nesta linha
                     const hasOpenPair = row.pairs.some(p => !p.out);

                     return (
                     <tr key={idx} className={`hover:bg-slate-50/50 group ${row.status === 'MISSING_OUT' ? 'bg-amber-50/50' : row.status === 'ABSENT' ? 'bg-rose-50/20' : ''}`}>
                       <td className="px-6 py-4">
                          <span className="font-bold text-slate-600 block">{row.dateStr}</span>
                          <span className="text-[9px] text-slate-400 uppercase">{row.dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                       </td>
                       <td className="px-6 py-4 font-bold text-slate-800">{row.employeeName}</td>
                       <td className="px-6 py-4">
                          <div className="space-y-1">
                             {row.pairs.length > 0 ? row.pairs.map((p, i) => {
                                const isNextDay = p.out && new Date(p.out.timestamp).getDate() !== new Date(p.in.timestamp).getDate();
                                return (
                                <div key={i} className="flex items-center gap-1 text-[10px]">
                                   <span className="bg-emerald-100 text-emerald-700 px-1.5 rounded">{new Date(p.in.timestamp).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                   <span className="text-slate-300">➜</span>
                                   {p.out ? (
                                      <span className={`px-1.5 rounded flex items-center gap-1 ${p.out.isForced ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-rose-100 text-rose-700'}`}>
                                         {new Date(p.out.timestamp).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                                         {isNextDay && <span className="text-[8px] bg-white/50 px-1 rounded font-bold">+1 dia</span>}
                                      </span>
                                   ) : <span className="text-rose-500 font-bold">???</span>}
                                </div>
                             )}) : <span className="text-slate-400 italic">Sem registros</span>}
                          </div>
                       </td>
                       <td className="px-6 py-4 font-bold text-slate-700">
                          {formatDecimalHours(row.totalWorkedHours)}
                       </td>
                       <td className="px-6 py-4 text-slate-500">
                          {formatDecimalHours(row.expectedHours)}
                       </td>
                       <td className="px-6 py-4">
                          {row.status === 'MISSING_OUT' ? (
                             <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase">Ponto Aberto</span>
                          ) : (
                             <span className={`font-black ${row.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {row.balance > 0 ? '+' : ''}{formatDecimalHours(row.balance)}
                             </span>
                          )}
                       </td>
                       <td className="px-6 py-4 text-right">
                          {/* CORREÇÃO: Botão aparece se houver par aberto OU status for explicitamente MISSING_OUT */}
                          {(hasOpenPair || row.status === 'MISSING_OUT') && (currentUser?.role === 'ADMIN' || currentUser?.role === 'MASTER') && (
                              <button 
                                onClick={() => {
                                    const openPair = row.pairs.find(p => !p.out);
                                    if(openPair) {
                                       setForcedExitData({ openEntry: openPair.in });
                                       // Sugerir hora atual
                                       const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                                       setForcedTime(now.toISOString().slice(0, 16));
                                    }
                                }}
                                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-rose-700 shadow-md inline-flex items-center gap-1 transition-all active:scale-95"
                              >
                                  <LogOut size={10}/> Encerrar
                              </button>
                          )}
                       </td>
                     </tr>
                   )})}
                   {dailyReports.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">Nenhum registro no período.</td></tr>}
                 </tbody>
               </table>
             </div>
          </div>

          {/* Painel de Locais (Mantido no final da aba) */}
          <div className="bg-white p-8 rounded-[2rem] border shadow-sm space-y-8">
             <div className="flex justify-between items-center">
                <div>
                   <h3 className="text-lg font-black text-slate-800 uppercase">Gestão de Locais</h3>
                   <p className="text-slate-400 text-xs">Sedes e Pontos de Acesso</p>
                </div>
             </div>
             
             {/* Lista de Locais */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {locations.map(loc => (
                   <div key={loc.id} className="p-4 border rounded-xl flex justify-between items-center hover:border-amber-400 group transition-all">
                      <div>
                         <p className="font-bold text-sm text-slate-800">{loc.name}</p>
                         <p className="text-[10px] text-slate-400">{loc.address}</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => setEditingLocation(loc)} className="text-slate-400 hover:text-amber-600"><Edit3 size={16}/></button>
                         <button onClick={() => onDeleteLocation(loc.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={16}/></button>
                      </div>
                   </div>
                ))}
             </div>
             
             {/* Painel Completo de Cadastro de Local */}
             <div className="pt-4 border-t">
                 <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-4">Cadastrar Novo Local</p>
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase">Nome</label><input type="text" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} className="w-full p-2 border rounded-lg text-sm font-bold"/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase">Endereço</label><input type="text" value={newLocation.address} onChange={e => setNewLocation({...newLocation, address: e.target.value})} className="w-full p-2 border rounded-lg text-sm font-bold"/></div>
                    <div className="flex gap-2">
                        <div className="flex-1"><label className="text-[9px] font-bold text-slate-400 uppercase">Lat</label><input type="number" step="any" value={newLocation.lat} onChange={e => setNewLocation({...newLocation, lat: parseFloat(e.target.value)})} className="w-full p-2 border rounded-lg text-sm font-bold"/></div>
                        <div className="flex-1"><label className="text-[9px] font-bold text-slate-400 uppercase">Lng</label><input type="number" step="any" value={newLocation.lng} onChange={e => setNewLocation({...newLocation, lng: parseFloat(e.target.value)})} className="w-full p-2 border rounded-lg text-sm font-bold"/></div>
                    </div>
                    <button onClick={handleCreateLocation} className="bg-amber-600 text-white p-2.5 rounded-lg font-bold uppercase text-xs shadow-lg hover:bg-amber-700">Cadastrar</button>
                 </div>
             </div>
          </div>
        </div>
      )}

      {/* Modais */}
      {showTimeBankModal && currentUser && (
         <TimeBankModal 
            user={showTimeBankModal} 
            currentUser={currentUser} 
            onClose={() => setShowTimeBankModal(null)}
            onBalanceUpdate={() => {/* Recarregar se necessário */}}
         />
      )}
      
      {editingLocation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             {/* Reutilizando estrutura do modal de edição existente */}
             <div className="bg-white rounded-[2rem] p-6 max-w-lg w-full">
                <h3 className="text-lg font-black mb-4">Editar Local</h3>
                {/* Inputs simplificados para brevidade */}
                <input type="text" value={editingLocation.name} onChange={e => setEditingLocation({...editingLocation, name: e.target.value})} className="w-full p-3 border rounded-xl mb-2 font-bold"/>
                <input type="number" step="any" value={editingLocation.lat} onChange={e => setEditingLocation({...editingLocation, lat: parseFloat(e.target.value)})} className="w-full p-3 border rounded-xl mb-2 font-bold"/>
                <input type="number" step="any" value={editingLocation.lng} onChange={e => setEditingLocation({...editingLocation, lng: parseFloat(e.target.value)})} className="w-full p-3 border rounded-xl mb-4 font-bold"/>
                <div className="flex gap-2">
                    <button onClick={handleUpdateLocation} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold">Salvar</button>
                    <button onClick={() => setEditingLocation(null)} className="flex-1 bg-slate-100 text-slate-500 py-3 rounded-xl font-bold">Cancelar</button>
                </div>
             </div>
        </div>
      )}

      {/* MODAL DE SAÍDA FORÇADA (Reutilizado) */}
      {forcedExitData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="bg-rose-600 p-6 text-white flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black uppercase">Saída Forçada</h3>
                        <p className="text-rose-100 text-xs font-bold uppercase tracking-widest">Intervenção Administrativa</p>
                    </div>
                    <button onClick={() => setForcedExitData(null)} className="p-2 hover:bg-rose-500 rounded-full"><X size={24}/></button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 text-xs font-bold flex gap-2 items-start">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                        <p>Esta ação criará um registro de saída manual vinculado ao seu usuário. Atenção para a data correta!</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Entrada Original</label>
                            <input type="text" disabled value={new Date(forcedExitData.openEntry?.timestamp || 0).toLocaleString()} className="w-full px-4 py-3 bg-slate-100 border rounded-xl font-bold text-slate-500" />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Data/Hora da Saída</label>
                            <input 
                                type="datetime-local" 
                                value={forcedTime} 
                                // Permite selecionar datas futuras ou o dia seguinte para turnos overnight
                                min={new Date(forcedExitData.openEntry?.timestamp || 0).toISOString().slice(0, 16)}
                                onChange={e => setForcedTime(e.target.value)} 
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Motivo / Justificativa</label>
                            <select 
                                value={forcedReason} 
                                onChange={e => setForcedReason(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                            >
                                <option value="Esquecimento">Esquecimento do funcionário</option>
                                <option value="Falha Técnica">Falha no sistema/internet</option>
                                <option value="Saída Antecipada">Saída antecipada autorizada</option>
                                <option value="Turno Estendido">Turno Estendido (Madrugada)</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleForcedExitSubmit}
                        disabled={isProcessingForced || !forcedTime}
                        className="w-full py-4 bg-rose-600 text-white rounded-xl font-black uppercase text-sm shadow-xl hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isProcessingForced ? <RefreshCw className="animate-spin"/> : <Save/>} 
                        Confirmar Saída Manual
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
export default AttendanceReports;
