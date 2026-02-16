
import React, { useState, useMemo, useRef } from 'react';
import { Calendar as CalendarIcon, Users, Clock, History, CheckCircle2, AlertCircle, Archive, Trash2, TrendingUp, Search, Grid, List, ChevronLeft, ChevronRight, MapPin, Save, ShieldCheck, RefreshCw, X, MapPinned, ArrowDownLeft, ArrowUpRight, Edit3, Plus, LogOut, FileText, UploadCloud, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { AttendanceEntry, SystemUser, BranchLocation, Task, TaskStatus } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../firebase';
import { addDoc, collection } from 'firebase/firestore';

interface AttendanceReportsProps {
  logs: AttendanceEntry[];
  users: SystemUser[];
  tasks: Task[];
  locations: BranchLocation[];
  onSaveLocation: (location: BranchLocation) => void;
  onDeleteLocation: (id: string) => void;
  onDeleteAttendance?: (id: string) => void;
  versionInfo: { version: string; deployDate: string; lastChanges: string[] };
  currentUser?: SystemUser; // Passado opcionalmente para pegar o ID do gestor
}

// Interface auxiliar para o Espelho de Ponto (Pares)
interface AttendancePair {
  date: string; // YYYY-MM-DD
  employeeId: string;
  employeeName: string;
  checkIn?: AttendanceEntry;
  checkOut?: AttendanceEntry;
  status: 'OPEN' | 'CLOSED' | 'MISSING_IN'; // OPEN = Falta bater saída
}

const AttendanceReports: React.FC<AttendanceReportsProps> = ({ logs, users, tasks, locations, onSaveLocation, onDeleteLocation, onDeleteAttendance, versionInfo, currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'ponto' | 'historico' | 'produtividade'>('ponto');
  const [viewMode, setViewMode] = useState<'KANBAN' | 'CALENDAR' | 'LIST'>('CALENDAR');
  const [selectedUser, setSelectedUser] = useState<string | 'todos'>('todos');
  
  // Estado para FORMULÁRIO DE CRIAÇÃO (Novo)
  const [newLocation, setNewLocation] = useState<Partial<BranchLocation>>({
    name: '',
    lat: 0,
    lng: 0,
    radius: 300,
    address: '',
    active: true
  });

  // Estado para MODAL DE EDIÇÃO
  const [editingLocation, setEditingLocation] = useState<BranchLocation | null>(null);
  
  // Estado para MODAL DE SAÍDA FORÇADA
  const [forcedExitData, setForcedExitData] = useState<{ openEntry: AttendanceEntry | null } | null>(null);
  const [forcedTime, setForcedTime] = useState('');
  const [forcedReason, setForcedReason] = useState('Esquecimento');
  const [forcedEvidence, setForcedEvidence] = useState<File | null>(null);
  const [isProcessingForced, setIsProcessingForced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Filtros de Data
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [startDate, setStartDate] = useState<string>(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Função para processar os logs e criar pares (Espelho de Ponto)
  const attendancePairs = useMemo(() => {
    const pairs: AttendancePair[] = [];
    const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
    const userLogs: { [key: string]: AttendanceEntry[] } = {};

    // Agrupa por usuário
    sortedLogs.forEach(log => {
      if (!userLogs[log.employeeId]) userLogs[log.employeeId] = [];
      userLogs[log.employeeId].push(log);
    });

    Object.keys(userLogs).forEach(empId => {
      const uLogs = userLogs[empId];
      let currentEntry: AttendanceEntry | null = null;

      uLogs.forEach(log => {
        const dateKey = new Date(log.timestamp).toLocaleDateString('pt-BR');
        
        if (log.type === 'ENTRADA') {
          // Se já tinha uma entrada aberta, significa que esqueceu a saída anterior
          if (currentEntry) {
            pairs.push({
              date: new Date(currentEntry.timestamp).toLocaleDateString('pt-BR'),
              employeeId: currentEntry.employeeId,
              employeeName: currentEntry.employeeName,
              checkIn: currentEntry,
              checkOut: undefined,
              status: 'OPEN'
            });
          }
          currentEntry = log;
        } else if (log.type === 'SAIDA') {
          if (currentEntry) {
            // Fechou o par corretamente
            pairs.push({
              date: new Date(currentEntry.timestamp).toLocaleDateString('pt-BR'),
              employeeId: currentEntry.employeeId,
              employeeName: currentEntry.employeeName,
              checkIn: currentEntry,
              checkOut: log,
              status: 'CLOSED'
            });
            currentEntry = null;
          } else {
            // Saída sem entrada (Orfã)
            pairs.push({
              date: dateKey,
              employeeId: log.employeeId,
              employeeName: log.employeeName,
              checkIn: undefined,
              checkOut: log,
              status: 'MISSING_IN'
            });
          }
        }
      });

      // Se sobrou uma entrada no final, está em aberto
      if (currentEntry) {
        pairs.push({
          date: new Date(currentEntry.timestamp).toLocaleDateString('pt-BR'),
          employeeId: currentEntry.employeeId,
          employeeName: currentEntry.employeeName,
          checkIn: currentEntry,
          checkOut: undefined,
          status: 'OPEN'
        });
      }
    });

    // Filtra e ordena
    return pairs.sort((a, b) => {
        // Primeiro por status (OPEN primeiro), depois data desc
        if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
        if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
        return (b.checkIn?.timestamp || 0) - (a.checkIn?.timestamp || 0);
    });
  }, [logs]);


  const handleForcedExitSubmit = async () => {
    if (!forcedExitData?.openEntry || !forcedTime) return;
    if (!currentUser) return alert("Erro de permissão: Usuário atual não identificado.");

    setIsProcessingForced(true);
    try {
        let evidenceUrl = '';
        
        // 1. Upload da evidência se houver
        if (forcedEvidence) {
            const fileName = `evidence/forced_exits/${Date.now()}_${forcedEvidence.name}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, forcedEvidence);
            evidenceUrl = await getDownloadURL(storageRef);
        }

        // 2. Criar registro de saída
        const exitDate = new Date(forcedTime);
        const newLog: Omit<AttendanceEntry, 'id'> = {
            employeeId: forcedExitData.openEntry.employeeId,
            employeeName: forcedExitData.openEntry.employeeName,
            type: 'SAIDA',
            timestamp: exitDate.getTime(),
            photoUrl: forcedExitData.openEntry.photoUrl, // Usa a mesma foto da entrada como placeholder ou a evidência
            evidenceUrl: evidenceUrl, // URL da foto da câmera/comprovante
            location: {
                lat: 0,
                lng: 0,
                address: 'Registro Administrativo',
                locationName: 'Fechamento Manual'
            },
            isForced: true,
            forcedBy: currentUser.id,
            forcedReason: forcedReason
        };

        await addDoc(collection(db, 'pontos'), newLog);
        
        setForcedExitData(null);
        setForcedEvidence(null);
        setForcedTime('');
        setForcedReason('Esquecimento');

    } catch (e: any) {
        console.error(e);
        alert("Erro ao salvar saída forçada: " + e.message);
    } finally {
        setIsProcessingForced(false);
    }
  };

  // ... (Funções existentes de busca e local mantidas iguais) ...
  const performAddressSearch = async (addressQuery: string): Promise<{lat: number, lng: number, address: string, name?: string} | null> => {
    if (!addressQuery) {
        alert("Digite um endereço para buscar.");
        return null;
    }
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Aja como um serviço de Geocodificação. Encontre as coordenadas geográficas (latitude e longitude) precisas para o seguinte endereço: "${addressQuery}". Tente identificar também o nome do estabelecimento se for um local conhecido. Retorne apenas as coordenadas e o endereço formatado em JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              formatted_address: { type: Type.STRING },
              suggested_name: { type: Type.STRING }
            },
            required: ["lat", "lng", "formatted_address"]
          }
        }
      });
      
      const result = JSON.parse(response.text);
      return {
          lat: result.lat,
          lng: result.lng,
          address: result.formatted_address,
          name: result.suggested_name
      };
    } catch (e) {
      console.error(e);
      alert("Erro ao localizar endereço. Tente ser mais específico.");
      return null;
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchForCreate = async () => {
      const result = await performAddressSearch(newLocation.address || '');
      if (result) {
          setNewLocation(prev => ({
              ...prev,
              lat: result.lat,
              lng: result.lng,
              address: result.address,
              name: prev.name || result.name || ''
          }));
      }
  };

  const handleSearchForEdit = async () => {
      if (!editingLocation) return;
      const result = await performAddressSearch(editingLocation.address || '');
      if (result) {
          setEditingLocation(prev => prev ? ({
              ...prev,
              lat: result.lat,
              lng: result.lng,
              address: result.address
          }) : null);
      }
  };

  const handleCreateLocation = async () => {
    if (!newLocation.name || !newLocation.lat || !newLocation.lng) {
      alert("Preencha ao menos o Nome e as Coordenadas.");
      return;
    }
    setIsSavingSettings(true);
    try {
      const loc: BranchLocation = {
        id: Math.random().toString(36).substr(2, 9),
        name: newLocation.name!,
        lat: newLocation.lat!,
        lng: newLocation.lng!,
        radius: newLocation.radius || 300,
        address: newLocation.address || '',
        active: true
      };
      await onSaveLocation(loc);
      setNewLocation({ name: '', lat: 0, lng: 0, radius: 300, address: '', active: true });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdateLocation = async () => {
    if (!editingLocation) return;
    setIsSavingSettings(true);
    try {
      await onSaveLocation(editingLocation);
      setEditingLocation(null); // Fecha o modal
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getTaskColor = (status: TaskStatus) => {
    switch (status) {
      case 'A_FAZER': return 'bg-white border-slate-200 text-slate-700'; 
      case 'EM_EXECUCAO': return 'bg-amber-100 border-amber-300 text-amber-800'; 
      case 'CONCLUIDA': return 'bg-emerald-100 border-emerald-300 text-emerald-800'; 
      case 'VENCIDA': return 'bg-rose-100 border-rose-300 text-rose-800'; 
      default: return 'bg-white';
    }
  };

  const filteredTasks = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime() + 86400000;
    return tasks
      .filter(t => {
        const ts = t.startDate;
        const matchesUser = selectedUser === 'todos' || t.assignedUserIds.includes(selectedUser);
        if (viewMode === 'CALENDAR') return matchesUser; 
        return ts >= start && ts <= end && matchesUser;
      })
      .sort((a,b) => b.startDate - a.startDate);
  }, [tasks, startDate, endDate, selectedUser, viewMode]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const dayDate = new Date(year, month, i);
      const dayTasks = tasks.filter(t => {
        const tDate = new Date(t.startDate);
        const matchesUser = selectedUser === 'todos' || t.assignedUserIds.includes(selectedUser);
        return tDate.getDate() === i && tDate.getMonth() === month && tDate.getFullYear() === year && matchesUser;
      });
      days.push({ day: i, date: dayDate, tasks: dayTasks });
    }
    return days;
  }, [currentDate, tasks, selectedUser]);

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex bg-slate-200/50 p-1 rounded-2xl w-fit">
          <button onClick={() => setActiveSubTab('ponto')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'ponto' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500'}`}>Frequência</button>
          <button onClick={() => setActiveSubTab('historico')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'historico' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500'}`}>Visão de Tarefas</button>
          <button onClick={() => setActiveSubTab('produtividade')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'produtividade' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500'}`}>Produtividade</button>
        </div>
      </div>

      {activeSubTab === 'ponto' && (
        <div className="space-y-12">
          {/* Painel de Cadastro de Local */}
          <div className="bg-white p-8 rounded-[2rem] border shadow-sm space-y-8 relative overflow-hidden">
            <div className="flex items-center justify-between border-b pb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-800 text-white rounded-2xl flex items-center justify-center shadow-xl">
                    <Plus size={24}/>
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Novo Ponto de Acesso</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ADICIONAR NOVA SEDE</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Campos do Formulário (Mantidos) */}
              <div className="space-y-1 md:col-span-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Localização</label>
                <input 
                  type="text" 
                  value={newLocation.name} 
                  onChange={e => setNewLocation({...newLocation, name: e.target.value})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 transition-all shadow-inner" 
                  placeholder="Ex: Sede Portão da Cerveja" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude</label>
                <input 
                  type="number" 
                  step="any" 
                  value={newLocation.lat} 
                  onChange={e => setNewLocation({...newLocation, lat: parseFloat(e.target.value)})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none shadow-inner" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitude</label>
                <input 
                  type="number" 
                  step="any" 
                  value={newLocation.lng} 
                  onChange={e => setNewLocation({...newLocation, lng: parseFloat(e.target.value)})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none shadow-inner" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raio de Tolerância (Metros)</label>
                <input 
                  type="number" 
                  value={newLocation.radius} 
                  onChange={e => setNewLocation({...newLocation, radius: parseInt(e.target.value)})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none shadow-inner" 
                  placeholder="300" 
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Descritivo (Pesquisar no Maps)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newLocation.address} 
                    onChange={e => setNewLocation({...newLocation, address: e.target.value})} 
                    onKeyDown={e => e.key === 'Enter' && handleSearchForCreate()}
                    className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 shadow-inner" 
                    placeholder="Rua, Número, Bairro, Cidade..." 
                  />
                  <button 
                    onClick={handleSearchForCreate}
                    disabled={isSearching}
                    title="Geocodificar Endereço"
                    className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center disabled:opacity-50"
                  >
                    {isSearching ? <RefreshCw className="animate-spin" size={24}/> : <Search size={24}/>}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t flex justify-end">
              <button 
                onClick={handleCreateLocation}
                disabled={isSavingSettings || isSearching}
                className="text-white px-10 py-5 rounded-2xl font-black text-sm uppercase flex items-center gap-3 shadow-xl hover:shadow-2xl transition-all active:scale-95 disabled:opacity-50 bg-slate-900 hover:bg-black"
              >
                {isSavingSettings ? <ShieldCheck className="animate-pulse" size={20}/> : <Plus size={20}/>}
                CADASTRAR NOVO LOCAL
              </button>
            </div>
          </div>

          {/* LISTA DE LOCAIS (Mantido) */}
          <div className="space-y-4">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-4">Locais Habilitados para Ponto</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.map(loc => (
                   <div key={loc.id} className="bg-white p-5 rounded-2xl border transition-all flex flex-col justify-between group hover:border-amber-300">
                      <div>
                         <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-800 text-lg leading-tight">{loc.name}</h4>
                            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full uppercase">{loc.active ? 'Ativo' : 'Inativo'}</span>
                         </div>
                         <p className="text-xs text-slate-500 mb-4 line-clamp-2" title={loc.address}>{loc.address}</p>
                         <div className="flex gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 p-2 rounded-lg">
                            <span className="flex items-center gap-1"><MapPinned size={12}/> {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                            <span className="flex items-center gap-1"><ShieldCheck size={12}/> Raio: {loc.radius}m</span>
                         </div>
                      </div>
                      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                         <button 
                           onClick={() => setEditingLocation(loc)}
                           className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-amber-100 hover:text-amber-700 transition-colors flex items-center justify-center gap-2"
                         >
                            <Edit3 size={14}/> Editar
                         </button>
                         <button 
                           type="button"
                           onClick={(e) => {
                             e.stopPropagation();
                             if(confirm(`ATENÇÃO: Deseja excluir permanentemente o local "${loc.name}"?`)) {
                               onDeleteLocation(loc.id);
                             }
                           }}
                           className="py-2 px-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors z-10"
                           title="Excluir Local"
                         >
                            <Trash2 size={16}/>
                         </button>
                      </div>
                   </div>
                ))}
             </div>
          </div>

          {/* ESPELHO DE PONTO (PARES) */}
          <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
             <div className="p-6 border-b font-black text-slate-800 text-sm flex items-center gap-2 uppercase tracking-tighter"><Clock size={18} className="text-amber-500" /> Espelho de Ponto (Turnos)</div>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400 tracking-widest">
                   <tr>
                     <th className="px-6 py-4">Data</th>
                     <th className="px-6 py-4">Colaborador</th>
                     <th className="px-6 py-4">Entrada</th>
                     <th className="px-6 py-4">Saída</th>
                     <th className="px-6 py-4">Status</th>
                     <th className="px-6 py-4 text-right">Gestão</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {attendancePairs.map((pair, idx) => (
                     <tr key={idx} className={`hover:bg-slate-50/50 group ${pair.status === 'OPEN' ? 'bg-amber-50/30' : ''}`}>
                       <td className="px-6 py-4 font-bold text-slate-600">{pair.date}</td>
                       <td className="px-6 py-4">
                         <div className="flex items-center gap-2">
                             <span className="font-bold text-slate-800">{pair.employeeName}</span>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         {pair.checkIn ? (
                            <div className="flex flex-col">
                                <span className="font-bold text-emerald-700">{new Date(pair.checkIn.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                                <span className="text-[9px] text-slate-400 truncate max-w-[100px]">{pair.checkIn.location.locationName || 'Local'}</span>
                            </div>
                         ) : <span className="text-rose-400">--:--</span>}
                       </td>
                       <td className="px-6 py-4">
                         {pair.checkOut ? (
                            <div className="flex flex-col">
                                <span className="font-bold text-rose-700">{new Date(pair.checkOut.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                                <span className="text-[9px] text-slate-400 truncate max-w-[100px]">{pair.checkOut.location.locationName || 'Local'}</span>
                                {pair.checkOut.isForced && (
                                    <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1 rounded w-fit flex gap-1 mt-0.5" title={`Forçado por: ${users.find(u => u.id === pair.checkOut?.forcedBy)?.name}\nMotivo: ${pair.checkOut.forcedReason}`}>
                                        <AlertTriangle size={8}/> Manual
                                    </span>
                                )}
                            </div>
                         ) : <span className="text-slate-300 italic">--:--</span>}
                       </td>
                       <td className="px-6 py-4">
                          {pair.status === 'OPEN' && <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase">Em Aberto</span>}
                          {pair.status === 'CLOSED' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase">Concluído</span>}
                          {pair.status === 'MISSING_IN' && <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-[9px] font-black uppercase">Erro (Sem Entrada)</span>}
                       </td>
                       <td className="px-6 py-4 text-right">
                          {pair.status === 'OPEN' && pair.checkIn && currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MASTER') && (
                              <button 
                                onClick={() => {
                                    setForcedExitData({ openEntry: pair.checkIn! });
                                    // Sugere a hora atual
                                    const now = new Date();
                                    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                                    setForcedTime(now.toISOString().slice(0, 16));
                                }}
                                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-rose-700 shadow-md flex items-center gap-1 ml-auto"
                              >
                                  <LogOut size={12}/> 
                                  Encerrar Ponto
                              </button>
                          )}
                          {(onDeleteAttendance && pair.checkIn && pair.status !== 'OPEN') && (currentUser?.role === 'MASTER') && (
                             <button onClick={() => onDeleteAttendance(pair.checkIn!.id)} className="text-slate-300 hover:text-rose-500 ml-2" title="Deletar Registro"><Trash2 size={16}/></button>
                          )}
                       </td>
                     </tr>
                   ))}
                   {attendancePairs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">Nenhum registro de ponto encontrado.</td></tr>}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO LOCAL (Mantido) */}
      {editingLocation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            {/* ... Conteúdo do modal de edição de local (Código já existente) ... */}
            <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95">
             <div className="p-6 bg-amber-600 text-white flex justify-between items-center sticky top-0 z-20">
                <div>
                  <h3 className="text-xl font-black uppercase">Editar Local</h3>
                  <p className="text-amber-100 text-xs font-bold uppercase tracking-widest opacity-80">Atualização de Cadastro</p>
                </div>
                <button onClick={() => setEditingLocation(null)} className="p-2 hover:bg-amber-500 rounded-full transition-colors"><X size={24}/></button>
             </div>
             
             <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Linha 1 */}
                  <div className="space-y-1 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                    <input 
                      type="text" 
                      value={editingLocation.name} 
                      onChange={e => setEditingLocation({...editingLocation, name: e.target.value})} 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude</label>
                    <input 
                      type="number" 
                      step="any" 
                      value={editingLocation.lat} 
                      onChange={e => setEditingLocation({...editingLocation, lat: parseFloat(e.target.value)})} 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitude</label>
                    <input 
                      type="number" 
                      step="any" 
                      value={editingLocation.lng} 
                      onChange={e => setEditingLocation({...editingLocation, lng: parseFloat(e.target.value)})} 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none" 
                    />
                  </div>

                  {/* Linha 2 */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raio (m)</label>
                    <input 
                      type="number" 
                      value={editingLocation.radius} 
                      onChange={e => setEditingLocation({...editingLocation, radius: parseInt(e.target.value)})} 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none" 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço (Busca IA)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={editingLocation.address} 
                        onChange={e => setEditingLocation({...editingLocation, address: e.target.value})} 
                        onKeyDown={e => e.key === 'Enter' && handleSearchForEdit()}
                        className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none" 
                      />
                      <button 
                        onClick={handleSearchForEdit}
                        disabled={isSearching}
                        className="bg-slate-800 text-white p-4 rounded-2xl hover:bg-black transition-all disabled:opacity-50"
                      >
                        {isSearching ? <RefreshCw className="animate-spin" size={24}/> : <Search size={24}/>}
                      </button>
                    </div>
                  </div>
                  
                  <div className="md:col-span-3 pt-2">
                     <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-4 rounded-xl border border-slate-200 w-fit">
                        <input 
                          type="checkbox" 
                          checked={editingLocation.active} 
                          onChange={e => setEditingLocation({...editingLocation, active: e.target.checked})}
                          className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
                        />
                        <span className="font-bold text-slate-700 text-sm">Local Ativo</span>
                     </label>
                  </div>
                </div>

                <div className="pt-6 border-t flex gap-4">
                  <button onClick={() => setEditingLocation(null)} className="flex-1 py-4 text-slate-500 font-bold uppercase hover:bg-slate-50 rounded-2xl">Cancelar</button>
                  <button 
                    onClick={handleUpdateLocation}
                    disabled={isSavingSettings}
                    className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                  >
                    {isSavingSettings ? <RefreshCw className="animate-spin"/> : <Save/>} SALVAR ALTERAÇÕES
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL DE SAÍDA FORÇADA (NOVO) */}
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
                        <p>Esta ação criará um registro de saída manual vinculado ao seu usuário. Use apenas em casos de esquecimento ou falha técnica.</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Colaborador</label>
                            <input type="text" disabled value={forcedExitData.openEntry?.employeeName} className="w-full px-4 py-3 bg-slate-100 border rounded-xl font-bold text-slate-500" />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Data/Hora da Saída</label>
                            <input 
                                type="datetime-local" 
                                value={forcedTime} 
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
                                <option value="Outros">Outros</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Evidência (Opcional)</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                {forcedEvidence ? (
                                    <div className="text-center">
                                        <ImageIcon className="mx-auto mb-2 text-emerald-500" size={32}/>
                                        <p className="text-xs font-bold text-emerald-600">{forcedEvidence.name}</p>
                                        <p className="text-[10px]">Clique para alterar</p>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <UploadCloud className="mx-auto mb-2" size={32}/>
                                        <p className="text-xs font-bold">Clique para enviar foto</p>
                                        <p className="text-[10px]">Câmera de segurança ou comprovante</p>
                                    </div>
                                )}
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={e => e.target.files?.[0] && setForcedEvidence(e.target.files[0])}
                                />
                            </div>
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

      {activeSubTab === 'historico' && (
        <div className="space-y-6">
          {/* ... (Código existente da tab Historico/Tarefas) ... */}
          <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col md:flex-row gap-6 items-end">
             <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                {viewMode !== 'CALENDAR' ? (
                  <>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Início</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-slate-900" /></div>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Fim</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-slate-900" /></div>
                  </>
                ) : (
                  <div className="col-span-2 flex items-center gap-4">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                      {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h3>
                    <div className="flex gap-1">
                      <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18}/></button>
                      <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 font-bold text-xs uppercase hover:bg-slate-100 rounded-lg">Hoje</button>
                      <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18}/></button>
                    </div>
                  </div>
                )}
                <div><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Colaborador</label><select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold uppercase text-slate-900"><option value="todos">Equipe Completa</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
             </div>
          </div>

          <div className="flex-1">
            {viewMode === 'CALENDAR' && (
              <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden flex flex-col min-h-[600px]">
                <div className="grid grid-cols-7 border-b bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest py-3">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="text-center">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 flex-1 overflow-y-auto">
                  {calendarDays.map((d, i) => (
                    <div key={i} className={`min-h-[120px] border-r border-b p-2 space-y-1 transition-colors ${!d ? 'bg-slate-50/50' : 'bg-white hover:bg-slate-50'}`}>
                      {d && (
                        <>
                          <div className="flex justify-between items-center px-1">
                            <span className={`text-xs font-black ${d.date.toDateString() === new Date().toDateString() ? 'bg-amber-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-slate-400'}`}>{d.day}</span>
                          </div>
                          <div className="space-y-1">
                            {d.tasks.map(t => (
                              <div key={t.id} className={`text-[9px] font-bold p-1 rounded border truncate ${getTaskColor(t.status)}`}>
                                {t.title}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'KANBAN' && (
              <div className="flex gap-6 overflow-x-auto pb-6 min-h-[600px]">
                {(['A_FAZER', 'EM_EXECUCAO', 'CONCLUIDA', 'VENCIDA'] as TaskStatus[]).map(status => (
                  <div key={status} className="flex-1 min-w-[300px] flex flex-col bg-slate-100/50 rounded-[2rem] border overflow-hidden">
                    <div className="p-4 border-b bg-white/50 flex items-center justify-between">
                      <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">{status.replace('_', ' ')}</h3>
                    </div>
                    <div className="p-3 space-y-3 overflow-y-auto flex-1 scrollbar-hide">
                      {filteredTasks.filter(t => t.status === status).map(task => (
                        <div key={task.id} className={`p-4 rounded-2xl shadow-sm border transition-all ${getTaskColor(task.status)}`}>
                          <h4 className="font-bold leading-tight">{task.title}</h4>
                          <p className="text-[10px] opacity-60 mt-2 font-bold uppercase">{users.find(u => task.assignedUserIds.includes(u.id))?.name}</p>
                          <p className="text-[10px] opacity-60 mt-1">{new Date(task.startDate).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'LIST' && (
              <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
                 <table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400 tracking-widest"><tr><th className="px-6 py-4">Tarefa</th><th className="px-6 py-4">Responsável</th><th className="px-6 py-4">Data</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Evidências</th></tr></thead><tbody className="divide-y">{filteredTasks.map(t => (
                   <tr key={t.id} className="hover:bg-slate-50"><td className="px-6 py-4 font-bold text-slate-800">{t.title}</td><td className="px-6 py-4 text-slate-600 font-medium">{users.find(u => t.assignedUserIds.includes(u.id))?.name}</td><td className="px-6 py-4 text-slate-500">{new Date(t.startDate).toLocaleString()}</td><td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${getTaskColor(t.status)}`}>{t.status.replace('_', ' ')}</span></td><td className="px-6 py-4"><div className="flex gap-1">{t.evidences?.map((ev, i) => <img key={i} src={ev.url} className="w-8 h-8 rounded border object-cover" alt="Evidência" />)}</div></td></tr>
                 ))}</tbody></table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default AttendanceReports;
