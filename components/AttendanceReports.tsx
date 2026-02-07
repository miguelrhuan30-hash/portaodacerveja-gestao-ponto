
import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Users, Clock, History, CheckCircle2, AlertCircle, Archive, Trash2, TrendingUp, Search, Grid, List, ChevronLeft, ChevronRight, MapPin, Save, ShieldCheck, RefreshCw, X, MapPinned, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { AttendanceEntry, SystemUser, BranchLocation, Task, TaskStatus } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface AttendanceReportsProps {
  logs: AttendanceEntry[];
  users: SystemUser[];
  tasks: Task[];
  locations: BranchLocation[];
  onSaveLocation: (location: BranchLocation) => void;
  onDeleteLocation: (id: string) => void;
  onDeleteAttendance?: (id: string) => void;
  versionInfo: { version: string; deployDate: string; lastChanges: string[] };
}

const AttendanceReports: React.FC<AttendanceReportsProps> = ({ logs, users, tasks, locations, onSaveLocation, onDeleteLocation, onDeleteAttendance, versionInfo }) => {
  const [activeSubTab, setActiveSubTab] = useState<'ponto' | 'historico' | 'produtividade'>('historico');
  const [viewMode, setViewMode] = useState<'KANBAN' | 'CALENDAR' | 'LIST'>('CALENDAR');
  const [selectedUser, setSelectedUser] = useState<string | 'todos'>('todos');
  
  // Localização State Local para Formulário
  const [localSettings, setLocalSettings] = useState<Partial<BranchLocation>>({
    name: '',
    lat: 0,
    lng: 0,
    radius: 300,
    address: '',
    active: true
  });
  const [isSearching, setIsSearching] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Filtros de Data
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [startDate, setStartDate] = useState<string>(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const handleSearchAddress = async () => {
    if (!localSettings.address) return alert("Digite um endereço ou nome de rua para buscar.");
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Aja como um serviço de Geocodificação. Encontre as coordenadas geográficas (latitude e longitude) precisas para o seguinte endereço: "${localSettings.address}". Tente identificar também o nome do estabelecimento se for um local conhecido. Retorne apenas as coordenadas e o endereço formatado em JSON.`,
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
      setLocalSettings(prev => ({
        ...prev,
        lat: result.lat,
        lng: result.lng,
        address: result.formatted_address,
        name: prev.name || result.suggested_name || ''
      }));
    } catch (e) {
      console.error(e);
      alert("Erro ao localizar endereço. Tente ser mais específico com o nome da rua, número e cidade.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!localSettings.name || !localSettings.lat || !localSettings.lng) {
      alert("Preencha ao menos o Nome da Localização e as Coordenadas.");
      return;
    }
    setIsSavingSettings(true);
    try {
      const newLoc: BranchLocation = {
        id: localSettings.id || Math.random().toString(36).substr(2, 9),
        name: localSettings.name!,
        lat: localSettings.lat!,
        lng: localSettings.lng!,
        radius: localSettings.radius || 300,
        address: localSettings.address || '',
        active: true
      };
      await onSaveLocation(newLoc);
      setLocalSettings({ name: '', lat: 0, lng: 0, radius: 300, address: '', active: true });
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
          <button onClick={() => setActiveSubTab('historico')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'historico' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500'}`}>Visão de Tarefas</button>
          <button onClick={() => setActiveSubTab('ponto')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'ponto' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500'}`}>Frequência</button>
          <button onClick={() => setActiveSubTab('produtividade')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'produtividade' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500'}`}>Produtividade</button>
        </div>
      </div>

      {activeSubTab === 'ponto' && (
        <div className="space-y-12">
          {/* Painel de Geolocalização */}
          <div className="bg-white p-8 rounded-[2rem] border shadow-sm space-y-8">
            <div className="flex items-center gap-3 border-b pb-6">
              <div className="w-12 h-12 bg-amber-600 text-white rounded-2xl flex items-center justify-center shadow-xl"><MapPin size={24}/></div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Geolocalização da Sede</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">DADOS SALVOS NO BANCO DE DADOS</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Linha 1 */}
              <div className="space-y-1 md:col-span-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Localização</label>
                <input 
                  type="text" 
                  value={localSettings.name} 
                  onChange={e => setLocalSettings({...localSettings, name: e.target.value})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 transition-all shadow-inner" 
                  placeholder="Ex: Sede Portão da Cerveja" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude</label>
                <input 
                  type="number" 
                  step="any" 
                  value={localSettings.lat} 
                  onChange={e => setLocalSettings({...localSettings, lat: parseFloat(e.target.value)})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none shadow-inner" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitude</label>
                <input 
                  type="number" 
                  step="any" 
                  value={localSettings.lng} 
                  onChange={e => setLocalSettings({...localSettings, lng: parseFloat(e.target.value)})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none shadow-inner" 
                />
              </div>

              {/* Linha 2 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raio de Tolerância (Metros)</label>
                <input 
                  type="number" 
                  value={localSettings.radius} 
                  onChange={e => setLocalSettings({...localSettings, radius: parseInt(e.target.value)})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none shadow-inner" 
                  placeholder="300" 
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Descritivo (Pesquisar no Maps)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={localSettings.address} 
                    onChange={e => setLocalSettings({...localSettings, address: e.target.value})} 
                    onKeyDown={e => e.key === 'Enter' && handleSearchAddress()}
                    className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 shadow-inner" 
                    placeholder="Rua, Número, Bairro, Cidade..." 
                  />
                  <button 
                    onClick={handleSearchAddress}
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
                onClick={handleSaveLocation}
                disabled={isSavingSettings || isSearching}
                className="bg-amber-600 text-white px-10 py-5 rounded-2xl font-black text-sm uppercase flex items-center gap-3 shadow-xl shadow-amber-900/10 hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSavingSettings ? <ShieldCheck className="animate-pulse" size={20}/> : <Save size={20}/>}
                SALVAR NO BANCO DE DADOS
              </button>
            </div>
          </div>

          {/* Lista de Registros de Ponto com Opção de Exclusão */}
          <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
             <div className="p-6 border-b font-black text-slate-800 text-sm flex items-center gap-2 uppercase tracking-tighter"><Clock size={18} className="text-amber-500" /> Histórico Geral de Ponto</div>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400 tracking-widest">
                   <tr>
                     <th className="px-6 py-4">Colaborador</th>
                     <th className="px-6 py-4">Tipo</th>
                     <th className="px-6 py-4">Data/Hora</th>
                     <th className="px-6 py-4">Local</th>
                     <th className="px-6 py-4 text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {logs.map(log => (
                     <tr key={log.id} className="hover:bg-slate-50/50 group">
                       <td className="px-6 py-4 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                            <img src={log.photoUrl} className="w-full h-full object-cover scale-x-[-1]"/>
                         </div>
                         <span className="font-bold text-slate-800">{log.employeeName}</span>
                       </td>
                       <td className="px-6 py-4">
                         <span className={`flex items-center gap-1 w-fit px-2 py-0.5 rounded-full font-black uppercase text-[10px] ${log.type === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                           {log.type === 'ENTRADA' ? <ArrowUpRight size={10}/> : <ArrowDownLeft size={10}/>} {log.type}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-slate-600">
                         {new Date(log.timestamp).toLocaleString()}
                       </td>
                       <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]" title={log.location.address}>
                         {log.location.locationName || log.location.address}
                       </td>
                       <td className="px-6 py-4 text-right">
                         {onDeleteAttendance && (
                           <button 
                             onClick={() => onDeleteAttendance(log.id)}
                             className="p-2 text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                             title="Excluir Registro de Ponto"
                           >
                             <Trash2 size={16}/>
                           </button>
                         )}
                       </td>
                     </tr>
                   ))}
                   {logs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Nenhum registro de ponto encontrado.</td></tr>}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {activeSubTab === 'historico' && (
        <div className="space-y-6">
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
