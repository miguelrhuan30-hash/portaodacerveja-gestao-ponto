
import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, User, Clock, Briefcase, X, Save, AlertCircle, Plus, Trash2, Check, XCircle, Edit3, CircleDollarSign } from 'lucide-react';
import { SystemUser, WorkSchedule, ScheduleException } from '../types';

interface ScheduleManagerProps {
  users: SystemUser[];
  currentUser: SystemUser;
  onUpdateUser: (user: SystemUser) => void;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({ users, currentUser, onUpdateUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'MASTER';

  // Estado local do modal para edição em lote
  const [dayEdits, setDayEdits] = useState<{
    [userId: string]: {
       type: 'WORK' | 'OFF';
       start: string;
       end: string;
       isExtraShift: boolean;
       hasChange: boolean;
    }
  }>({});

  // Helpers de Data
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const formatDateKey = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysCount = getDaysInMonth(year, month);
    const startPad = getFirstDayOfMonth(year, month);
    
    const days = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let i = 1; i <= daysCount; i++) {
        days.push({ day: i, dateStr: formatDateKey(year, month, i), dateObj: new Date(year, month, i) });
    }
    return days;
  }, [currentDate]);

  // Lista de usuários visíveis no calendário
  const visibleUsers = useMemo(() => {
    if (canEdit) return users;
    return users.filter(u => u.id === currentUser.id);
  }, [users, currentUser, canEdit]);

  // Resolve a escala efetiva de um usuário para um dia
  const resolveUserSchedule = (user: SystemUser, dateStr: string) => {
    // 1. Verifica Exceção
    const exception = user.workSchedule?.monthlyExceptions?.find(e => e.date === dateStr);
    if (exception) {
        return {
            type: exception.type,
            start: exception.start || '00:00',
            end: exception.end || '00:00',
            isExtraShift: !!exception.isExtraShift,
            isException: true
        };
    }

    // 2. Verifica Escala Padrão (Se for FIXED)
    if (user.workSchedule?.type === 'FIXED' && user.workSchedule.weekDayConfig) {
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        const config = user.workSchedule.weekDayConfig[dayOfWeek];
        if (config && config.enabled) {
            return {
                type: 'WORK',
                start: config.start,
                end: config.end,
                isExtraShift: false,
                isException: false
            };
        }
    }

    // 3. Verifica Escala Flexível (Apenas indica se é dia útil)
    if (user.workSchedule?.type === 'FLEXIBLE') {
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        if (user.workSchedule.workDays?.includes(dayOfWeek)) {
            return {
                type: 'WORK',
                start: 'Flex',
                end: 'Flex',
                isExtraShift: false,
                isException: false
            };
        }
    }

    // Default: Folga
    return { type: 'OFF', start: '', end: '', isExtraShift: false, isException: false };
  };

  const handleDayClick = (dateStr: string) => {
    if (!canEdit) return; // Bloqueia edição para funcionários

    setSelectedDay(dateStr);
    
    // Prepara estado inicial do modal
    const edits: any = {};
    users.filter(u => u.active).forEach(u => {
        const schedule = resolveUserSchedule(u, dateStr);
        edits[u.id] = {
            type: schedule.type,
            start: schedule.start === 'Flex' ? '08:00' : schedule.start,
            end: schedule.end === 'Flex' ? '17:00' : schedule.end,
            isExtraShift: schedule.isExtraShift,
            hasChange: false
        };
    });
    setDayEdits(edits);
    setIsModalOpen(true);
  };

  const handleSaveChanges = () => {
    if (!selectedDay || !canEdit) return;

    users.filter(u => u.active).forEach(user => {
        const edit = dayEdits[user.id];
        if (edit && edit.hasChange) {
            // Cria ou atualiza a exceção
            const newException: ScheduleException = {
                id: Math.random().toString(36).substr(2, 9),
                date: selectedDay,
                type: edit.type,
                start: edit.type === 'WORK' ? edit.start : undefined,
                end: edit.type === 'WORK' ? edit.end : undefined,
                isExtraShift: edit.type === 'WORK' ? edit.isExtraShift : false,
                breakDuration: 60, // Default
                note: edit.isExtraShift ? 'Turno Extra (Pago)' : 'Ajuste Manual via Calendário'
            };

            // Atualiza lista de exceções do usuário
            const currentExceptions = user.workSchedule?.monthlyExceptions?.filter(e => e.date !== selectedDay) || [];
            
            const updatedUser = {
                ...user,
                workSchedule: {
                    ...user.workSchedule!,
                    monthlyExceptions: [...currentExceptions, newException]
                }
            };
            onUpdateUser(updatedUser);
        }
    });
    setIsModalOpen(false);
  };

  const updateEdit = (userId: string, field: string, value: any) => {
    setDayEdits(prev => ({
        ...prev,
        [userId]: { ...prev[userId], [field]: value, hasChange: true }
    }));
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in pb-20">
       {/* Header */}
       <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2rem] border shadow-sm">
          <div>
             <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{canEdit ? 'Gestão de Escalas' : 'Minha Escala'}</h2>
             <p className="text-slate-500 text-sm">{canEdit ? 'Visualize e ajuste os turnos da equipe.' : 'Confira seus dias de trabalho e folgas.'}</p>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border">
             <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-white rounded-lg transition-colors shadow-sm"><ChevronLeft size={20}/></button>
             <span className="text-lg font-black uppercase text-slate-700 min-w-[140px] text-center">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
             </span>
             <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-white rounded-lg transition-colors shadow-sm"><ChevronRight size={20}/></button>
          </div>
       </div>

       {/* Calendar Grid */}
       <div className="bg-white rounded-[2rem] border shadow-sm flex-1 flex flex-col overflow-hidden min-h-[600px]">
          <div className="grid grid-cols-7 bg-slate-50 border-b">
             {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((d, i) => (
                <div key={d} className={`py-4 text-center text-[10px] font-black uppercase tracking-widest ${i === 0 || i === 6 ? 'text-rose-400' : 'text-slate-400'}`}>
                   {d}
                </div>
             ))}
          </div>
          
          <div className="grid grid-cols-7 flex-1 auto-rows-fr">
             {monthData.map((cell, idx) => {
                if (!cell) return <div key={`empty-${idx}`} className="bg-slate-50/30 border-b border-r" />;
                
                const isToday = cell.dateStr === new Date().toISOString().split('T')[0];
                const activeWorkers = visibleUsers.filter(u => u.active).map(u => ({ user: u, schedule: resolveUserSchedule(u, cell.dateStr) })).filter(x => x.schedule.type === 'WORK');

                return (
                   <div 
                     key={cell.dateStr} 
                     onClick={() => handleDayClick(cell.dateStr)}
                     className={`border-b border-r p-2 relative group flex flex-col gap-1 min-h-[100px] transition-colors ${canEdit ? 'cursor-pointer hover:bg-amber-50' : 'cursor-default'} ${isToday ? 'bg-amber-50/30' : ''}`}
                   >
                      <span className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>
                         {cell.day}
                      </span>
                      
                      {/* Worker Chips */}
                      <div className="flex flex-col gap-1 overflow-y-auto max-h-[100px] scroll-hide">
                         {activeWorkers.map(({ user, schedule }) => (
                            <div 
                                key={user.id} 
                                className={`text-[9px] px-1.5 py-0.5 rounded border flex items-center justify-between gap-1 ${
                                    schedule.isExtraShift 
                                        ? 'bg-purple-100 text-purple-800 border-purple-200' 
                                        : schedule.isException 
                                            ? 'bg-amber-100 text-amber-800 border-amber-200' 
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                            >
                               <div className="flex items-center gap-1 overflow-hidden">
                                  {schedule.isExtraShift && <CircleDollarSign size={8} className="shrink-0"/>}
                                  <span className="font-bold truncate max-w-[50px]">{user.name.split(' ')[0]}</span>
                               </div>
                               <span className="opacity-80">{schedule.start}-{schedule.end}</span>
                            </div>
                         ))}
                         {activeWorkers.length === 0 && (
                            <div className="text-[9px] text-slate-300 font-medium italic text-center mt-2">Ninguém escalado</div>
                         )}
                      </div>

                      {canEdit && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           <div className="bg-amber-200 text-amber-800 p-1 rounded-full"><Edit3 size={12}/></div>
                        </div>
                      )}
                   </div>
                );
             })}
          </div>
       </div>

       {/* Modal de Edição do Dia */}
       {isModalOpen && selectedDay && canEdit && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
             <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
                <div className="p-6 bg-slate-800 text-white flex justify-between items-center shrink-0">
                   <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Escala do Dia</h3>
                      <p className="text-slate-400 text-sm font-bold">{new Date(selectedDay + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                   </div>
                   <button onClick={() => setIsModalOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20"><X size={20}/></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                   <div className="flex gap-2">
                       <div className="flex-1 bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-800 text-xs flex gap-2 items-start">
                          <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                          <p>Alterações criam exceções na escala. Turnos marcados como <strong>Pago à Parte</strong> não contabilizam no Banco de Horas.</p>
                       </div>
                   </div>

                   <div className="space-y-3">
                      {users.filter(u => u.active).map(user => {
                         const edit = dayEdits[user.id];
                         if (!edit) return null;

                         return (
                            <div key={user.id} className={`flex flex-col lg:flex-row items-center gap-4 p-4 rounded-2xl border transition-colors ${edit.type === 'WORK' ? (edit.isExtraShift ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200') : 'bg-slate-50 border-slate-100 opacity-70'}`}>
                               <div className="flex items-center gap-3 w-full lg:w-1/4">
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 text-xs overflow-hidden">
                                     {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover"/> : user.name[0]}
                                  </div>
                                  <div className="min-w-0">
                                     <p className="font-bold text-sm text-slate-800 truncate">{user.name}</p>
                                     <p className="text-[10px] text-slate-400 uppercase">{user.role === 'EMPLOYEE' ? 'Funcionário' : 'Gestor'}</p>
                                  </div>
                               </div>

                               <div className="flex flex-wrap items-center gap-2 w-full lg:w-3/4 justify-end">
                                  {/* Toggle Status */}
                                  <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                                     <button 
                                       onClick={() => updateEdit(user.id, 'type', 'WORK')}
                                       className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${edit.type === 'WORK' ? 'bg-white text-emerald-600 shadow' : 'text-slate-400'}`}
                                     >
                                        Trabalha
                                     </button>
                                     <button 
                                       onClick={() => updateEdit(user.id, 'type', 'OFF')}
                                       className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${edit.type === 'OFF' ? 'bg-white text-rose-500 shadow' : 'text-slate-400'}`}
                                     >
                                        Folga
                                     </button>
                                  </div>

                                  {/* Horários */}
                                  {edit.type === 'WORK' && (
                                     <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 shrink-0">
                                        <input 
                                          type="time" 
                                          value={edit.start}
                                          onChange={e => updateEdit(user.id, 'start', e.target.value)}
                                          className="bg-slate-50 border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 w-20 text-center"
                                        />
                                        <span className="text-slate-300 font-bold">-</span>
                                        <input 
                                          type="time" 
                                          value={edit.end}
                                          onChange={e => updateEdit(user.id, 'end', e.target.value)}
                                          className="bg-slate-50 border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 w-20 text-center"
                                        />
                                     </div>
                                  )}

                                  {/* Toggle Extra Shift */}
                                  {edit.type === 'WORK' && (
                                     <button 
                                       onClick={() => updateEdit(user.id, 'isExtraShift', !edit.isExtraShift)}
                                       className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all animate-in fade-in slide-in-from-right-8 ${edit.isExtraShift ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                     >
                                        <CircleDollarSign size={12}/>
                                        Pago à Parte
                                     </button>
                                  )}
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </div>

                <div className="p-6 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
                   <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">Cancelar</button>
                   <button onClick={handleSaveChanges} className="px-8 py-3 bg-amber-600 text-white rounded-xl font-black uppercase shadow-lg hover:bg-amber-700 active:scale-95 transition-all flex items-center gap-2">
                      <Save size={18}/> Salvar Escala
                   </button>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default ScheduleManager;
