import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, User, Clock, Briefcase, X, Save, AlertCircle, Plus, Trash2, Check, XCircle, Edit3, CircleDollarSign, ArrowRightLeft, Split, CalendarDays, ArrowRight, FileText, Paperclip, UploadCloud, AlertTriangle, Circle } from 'lucide-react';
import { SystemUser, WorkSchedule, ScheduleException, AttendanceEntry } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

interface ScheduleManagerProps {
  users: SystemUser[];
  currentUser: SystemUser;
  attendance: AttendanceEntry[];
  onUpdateUser: (user: SystemUser) => void;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({ users, currentUser, attendance, onUpdateUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Estado para o Wizard de Compensação
  const [compensationWizard, setCompensationWizard] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
    originalDate: string;
    hoursToCompensate: number; // Horas decimais
    originalStart: string;
    originalEnd: string;
  } | null>(null);

  // Estados do Passo 2 do Wizard (Configuração de Compensação)
  const [wizardOption, setWizardOption] = useState<'DEBIT' | 'REALLOCATE' | 'DILUTE' | null>(null);
  const [reallocateDate, setReallocateDate] = useState('');
  const [diluteDays, setDiluteDays] = useState<number[]>([1, 2, 3, 4, 5]); // Seg-Sex default

  // Estados para Registro de Falta
  const [absenceForm, setAbsenceForm] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
    date: string;
    type: 'JUSTIFIED' | 'UNJUSTIFIED';
    reason: string;
    file: File | null;
    isUploading: boolean;
  } | null>(null);

  const canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'MASTER';

  // Estado local do modal principal para edição em lote
  const [dayEdits, setDayEdits] = useState<{
    [userId: string]: {
       type: 'WORK' | 'OFF' | 'COMPENSATION' | 'ABSENCE';
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

  const calculateHours = (start: string, end: string, breakMins: number = 60) => {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 + m2/60) - (h1 + m1/60);
    if(diff < 0) diff += 24;
    return Math.max(0, diff - (breakMins/60));
  };

  const addMinutesToTime = (time: string, minsToAdd: number) => {
    const [h, m] = time.split(':').map(Number);
    const totalMins = h * 60 + m + Math.round(minsToAdd);
    const newH = Math.floor(totalMins / 60) % 24;
    const newM = totalMins % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
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
            isException: true,
            deductFromBank: exception.deductFromBank,
            isCompensation: exception.type === 'COMPENSATION',
            isDiluted: !!exception.isDilutedCompensation,
            linkedDate: exception.linkedDate,
            absenceType: exception.absenceType,
            hasAttachment: !!exception.attachmentUrl,
            breakDuration: exception.breakDuration
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
                isException: false,
                breakDuration: config.breakDuration
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
                isException: false,
                breakDuration: 60
            };
        }
    }

    // Default: Folga
    return { type: 'OFF', start: '', end: '', isExtraShift: false, isException: false };
  };

  // --- NOVA FUNÇÃO: Resolve o status real (Cores do Semáforo) ---
  const resolveDailyStatus = (user: SystemUser, dateStr: string) => {
      const schedule = resolveUserSchedule(user, dateStr);
      const isPast = new Date(dateStr + 'T23:59:59').getTime() < Date.now();
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      
      // Filtra registros do dia e do usuário
      const logs = attendance.filter(a => a.employeeId === user.id && a.dateStr === dateStr)
                             .sort((a,b) => a.timestamp - b.timestamp);

      // COR BASE: Cinza (Futuro/Planejado)
      let colorClass = 'bg-slate-100 text-slate-500 border-slate-200'; 
      let tooltip = 'Planejado';

      // 1. Analisa Exceções Especiais primeiro (Prioridade Máxima)
      if (schedule.type === 'ABSENCE') {
          if (schedule.absenceType === 'UNJUSTIFIED') {
              return { colorClass: 'bg-rose-100 border-rose-400 text-rose-800', tooltip: 'Falta Injustificada' };
          } else {
              return { colorClass: 'bg-teal-100 border-teal-400 text-teal-800', tooltip: 'Atestado / Justificada' };
          }
      }

      if (schedule.type === 'COMPENSATION') {
          return { colorClass: 'bg-yellow-100 border-yellow-400 text-yellow-800', tooltip: 'Compensação de Folga' };
      }

      if (schedule.isExtraShift) {
          return { colorClass: 'bg-purple-100 border-purple-400 text-purple-800', tooltip: 'Turno Extra (Pago)' };
      }

      if (schedule.type === 'OFF') {
          return { colorClass: schedule.linkedDate ? 'bg-slate-200 border-slate-300 text-slate-500 opacity-60 line-through' : 'bg-white border-transparent text-slate-300', tooltip: 'Folga' };
      }

      // 2. Se não tiver registro de ponto
      if (logs.length === 0) {
          if (isPast && schedule.type === 'WORK') {
              // Passou da data, era dia de trabalho e não bateu ponto -> Falta (Vermelho)
              return { colorClass: 'bg-rose-100 border-rose-400 text-rose-800', tooltip: 'Falta (Sem Registro)' };
          }
          // Futuro ou Hoje (ainda pode bater) -> Mantém Cinza/Planejado
          return { colorClass: 'bg-slate-50 border-slate-200 text-slate-500', tooltip: `Planejado: ${schedule.start} - ${schedule.end}` };
      }

      // 3. Tem registros de ponto: Calcular Horas Trabalhadas
      let workedMinutes = 0;
      for (let i = 0; i < logs.length; i += 2) {
          const entry = logs[i];
          const exit = logs[i+1];
          if (entry && exit) {
              workedMinutes += (exit.timestamp - entry.timestamp) / (1000 * 60);
          }
      }
      const workedHours = workedMinutes / 60;

      // Calcular Meta (Expected)
      let expectedHours = 0;
      if (schedule.start === 'Flex') {
          expectedHours = user.workSchedule?.dailyHours || 8;
      } else {
          expectedHours = calculateHours(schedule.start, schedule.end, schedule.breakDuration);
      }

      const balance = workedMinutes - (expectedHours * 60);
      const balanceHours = balance / 60;

      const formatH = (h: number) => {
          const abs = Math.abs(h);
          const hh = Math.floor(abs);
          const mm = Math.round((abs - hh) * 60);
          return `${h < 0 ? '-' : '+'}${hh}h${mm.toString().padStart(2,'0')}`;
      };

      // 4. Define Cores baseadas no Saldo (Tolerância +/- 10 min)
      if (balance > 10) {
          // Crédito (Azul)
          colorClass = 'bg-blue-100 border-blue-400 text-blue-800';
          tooltip = `Extra: ${formatH(balanceHours)}`;
      } else if (balance < -10) {
          // Débito/Atraso (Laranja)
          colorClass = 'bg-amber-100 border-amber-400 text-amber-800';
          tooltip = `Débito: ${formatH(balanceHours)}`;
      } else {
          // Pontual/Zerado (Verde)
          colorClass = 'bg-emerald-100 border-emerald-400 text-emerald-800';
          tooltip = 'Pontual';
      }

      return { colorClass, tooltip, workedHours };
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

  const openAbsenceForm = (userId: string) => {
      const user = users.find(u => u.id === userId);
      if(!user || !selectedDay) return;
      setAbsenceForm({
          isOpen: true,
          userId,
          userName: user.name,
          date: selectedDay,
          type: 'UNJUSTIFIED',
          reason: '',
          file: null,
          isUploading: false
      });
  };

  const handleSaveAbsence = async () => {
      if(!absenceForm) return;
      if(absenceForm.type === 'JUSTIFIED' && !absenceForm.file && !absenceForm.reason) {
          alert("Para faltas justificadas, descreva o motivo ou anexe o atestado.");
          return;
      }

      setAbsenceForm(prev => prev ? {...prev, isUploading: true} : null);

      try {
          let attachmentUrl = undefined;
          
          if(absenceForm.file) {
              const storageRef = ref(storage, `attachments/${absenceForm.userId}/${absenceForm.date}_${Date.now()}_${absenceForm.file.name}`);
              await uploadBytes(storageRef, absenceForm.file);
              attachmentUrl = await getDownloadURL(storageRef);
          }

          const user = users.find(u => u.id === absenceForm.userId);
          if(!user) return;

          let newExceptions = [...(user.workSchedule?.monthlyExceptions || [])];
          newExceptions = newExceptions.filter(e => e.date !== absenceForm.date);

          newExceptions.push({
              id: Math.random().toString(36).substr(2, 9),
              date: absenceForm.date,
              type: 'ABSENCE',
              absenceType: absenceForm.type,
              absenceReason: absenceForm.reason || (absenceForm.type === 'UNJUSTIFIED' ? 'Falta Injustificada' : 'Atestado Médico'),
              attachmentUrl: attachmentUrl
          });

          const updatedUser = {
            ...user,
            workSchedule: { ...user.workSchedule!, monthlyExceptions: newExceptions }
          };
          onUpdateUser(updatedUser);
          
          setAbsenceForm(null);
          setIsModalOpen(false); // Fecha o modal principal para ver o resultado

      } catch(e: any) {
          alert("Erro ao salvar falta: " + e.message);
          setAbsenceForm(prev => prev ? {...prev, isUploading: false} : null);
      }
  };

  // Intercepta a mudança para OFF para abrir o Wizard
  const handleTypeChange = (userId: string, newType: 'WORK' | 'OFF') => {
    if (newType === 'OFF') {
        // Verifica se originalmente era um dia de trabalho e quantas horas
        const user = users.find(u => u.id === userId);
        if (user && selectedDay) {
            // Verifica o schedule BASE (ignora exceções atuais pois estamos editando)
            let originalHours = 0;
            let originalStart = '08:00';
            let originalEnd = '17:00';
            let isOriginalWorkDay = false;

            if (user.workSchedule?.type === 'FIXED' && user.workSchedule.weekDayConfig) {
                const dayOfWeek = new Date(selectedDay + 'T00:00:00').getDay();
                const config = user.workSchedule.weekDayConfig[dayOfWeek];
                if (config && config.enabled) {
                    isOriginalWorkDay = true;
                    originalStart = config.start;
                    originalEnd = config.end;
                    originalHours = calculateHours(config.start, config.end, config.breakDuration);
                }
            }

            if (isOriginalWorkDay && originalHours > 0) {
                // Abre o Wizard
                setCompensationWizard({
                    isOpen: true,
                    userId: user.id,
                    userName: user.name,
                    originalDate: selectedDay,
                    hoursToCompensate: originalHours,
                    originalStart,
                    originalEnd
                });
                return; // Interrompe a atualização direta
            }
        }
    }

    // Se não for caso de wizard, segue normal
    setDayEdits(prev => ({
        ...prev,
        [userId]: { ...prev[userId], type: newType, hasChange: true }
    }));
  };

  const handleWizardConfirm = () => {
    if (!compensationWizard) return;
    const { userId, hoursToCompensate, originalDate, originalStart, originalEnd } = compensationWizard;
    const user = users.find(u => u.id === userId);
    if (!user) return;

    let newExceptions = [...(user.workSchedule?.monthlyExceptions || [])];
    
    // Remove exceção existente para a data original se houver, para sobrescrever
    newExceptions = newExceptions.filter(e => e.date !== originalDate);

    // 1. Exceção de FOLGA no dia original
    const offException: ScheduleException = {
        id: Math.random().toString(36).substr(2, 9),
        date: originalDate,
        type: 'OFF',
        deductFromBank: wizardOption === 'DEBIT',
        originalDuration: hoursToCompensate,
        note: wizardOption === 'DEBIT' ? 'Folga (Desc. Banco)' : wizardOption === 'REALLOCATE' ? 'Folga Realocada' : 'Folga (Diluída)',
        linkedDate: wizardOption === 'REALLOCATE' ? reallocateDate : undefined
    };
    newExceptions.push(offException);

    // 2. Lógica Específica
    if (wizardOption === 'REALLOCATE' && reallocateDate) {
        // Cria dia de COMPENSAÇÃO (COMPENSATION) no novo dia
        newExceptions = newExceptions.filter(e => e.date !== reallocateDate);
        newExceptions.push({
            id: Math.random().toString(36).substr(2, 9),
            date: reallocateDate,
            type: 'COMPENSATION', // Tipo específico para destaque visual
            start: originalStart,
            end: originalEnd,
            breakDuration: 60, // Assumindo padrão
            note: 'Compensação de Folga',
            linkedDate: originalDate // Link para saber a origem
        });
    } else if (wizardOption === 'DILUTE' && diluteDays.length > 0) {
        // Distribui horas
        const minutesTotal = hoursToCompensate * 60;
        const minutesPerDay = minutesTotal / diluteDays.length;
        
        // Pega os próximos dias da semana selecionados a partir da data original (ou semana atual)
        const targetDate = new Date(originalDate + 'T00:00:00');
        const currentDayOfWeek = targetDate.getDay();
        const startOfWeek = new Date(targetDate);
        startOfWeek.setDate(targetDate.getDate() - currentDayOfWeek); // Domingo

        diluteDays.forEach(dayIndex => {
            if (dayIndex === currentDayOfWeek) return; // Pula o próprio dia

            const workDate = new Date(startOfWeek);
            workDate.setDate(startOfWeek.getDate() + dayIndex);
            const workDateStr = workDate.toISOString().split('T')[0];

            // Pega horário padrão do dia
            let baseEnd = '17:00';
            let baseStart = '08:00';
            if (user.workSchedule?.type === 'FIXED' && user.workSchedule.weekDayConfig) {
                const cfg = user.workSchedule.weekDayConfig[dayIndex];
                if (cfg) { baseEnd = cfg.end; baseStart = cfg.start; }
            }

            // Se já tem exceção nesse dia, usa ela como base
            const existingExc = newExceptions.find(e => e.date === workDateStr);
            if (existingExc && (existingExc.type === 'WORK' || existingExc.type === 'COMPENSATION') && existingExc.end) {
                baseEnd = existingExc.end;
            }

            const newEnd = addMinutesToTime(baseEnd, minutesPerDay);

            // Remove anterior se existir
            newExceptions = newExceptions.filter(e => e.date !== workDateStr);
            
            newExceptions.push({
                id: Math.random().toString(36).substr(2, 9),
                date: workDateStr,
                type: 'WORK',
                start: baseStart,
                end: newEnd,
                breakDuration: 60,
                isDilutedCompensation: true, // Flag de diluição
                note: `Inclui compensação (+${Math.round(minutesPerDay)}min)`
            });
        });
    }

    // Salva Usuário
    const updatedUser = {
        ...user,
        workSchedule: {
            ...user.workSchedule!,
            monthlyExceptions: newExceptions
        }
    };
    onUpdateUser(updatedUser);

    // Atualiza estado visual local para refletir a folga (apenas visual)
    setDayEdits(prev => ({
        ...prev,
        [userId]: { ...prev[userId], type: 'OFF', hasChange: true } 
    }));

    // Reseta Wizard
    setCompensationWizard(null);
    setWizardOption(null);
    setReallocateDate('');
  };

  const handleSaveChanges = () => {
    if (!selectedDay || !canEdit) return;

    users.filter(u => u.active).forEach(user => {
        const edit = dayEdits[user.id];
        if (edit && edit.hasChange && edit.type !== 'ABSENCE') {
            // Verifica se já não foi tratado pelo Wizard
            const existingExc = user.workSchedule?.monthlyExceptions?.find(e => e.date === selectedDay);
            
            // Se for OFF e já existir uma exception OFF complexa (ou ABSENCE), não sobrescreve
            if (edit.type === 'OFF' && existingExc) {
                const isAbsence = existingExc.type === 'ABSENCE';
                const isComplexOff = existingExc.type === 'OFF' && (existingExc.deductFromBank || existingExc.linkedDate || existingExc.note?.includes('Diluída'));
                
                if (isAbsence || isComplexOff) return;
            }

            const newException: ScheduleException = {
                id: Math.random().toString(36).substr(2, 9),
                date: selectedDay,
                type: edit.type as 'WORK' | 'OFF' | 'COMPENSATION',
                start: (edit.type === 'WORK' || edit.type === 'COMPENSATION') ? edit.start : undefined,
                end: (edit.type === 'WORK' || edit.type === 'COMPENSATION') ? edit.end : undefined,
                isExtraShift: edit.type === 'WORK' ? edit.isExtraShift : false,
                breakDuration: 60, // Default
                note: edit.isExtraShift ? 'Turno Extra (Pago)' : 'Ajuste Manual via Calendário'
            };

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

       {/* Legenda de Status */}
       <div className="flex flex-wrap gap-3 bg-white p-4 rounded-[1.5rem] border shadow-sm text-[10px] font-bold uppercase text-slate-600 justify-center">
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-slate-400 text-slate-400"/> Planejado</div>
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-rose-500 text-rose-500"/> Falta/Ausência</div>
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-amber-500 text-amber-500"/> Atraso/Débito</div>
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-emerald-500 text-emerald-500"/> Pontual/Ok</div>
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-blue-500 text-blue-500"/> Hora Extra</div>
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-purple-500 text-purple-500"/> Turno Extra</div>
          <div className="flex items-center gap-1.5"><Circle size={8} className="fill-yellow-500 text-yellow-500"/> Compensação</div>
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
                const activeWorkers = visibleUsers.filter(u => u.active).map(u => ({ 
                    user: u, 
                    schedule: resolveUserSchedule(u, cell.dateStr),
                    status: resolveDailyStatus(u, cell.dateStr) 
                })).filter(x => x.schedule.type !== 'OFF' || x.schedule.linkedDate || x.schedule.type === 'ABSENCE');

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
                         {activeWorkers.map(({ user, schedule, status }) => {
                            return (
                                <div 
                                    key={user.id} 
                                    title={`${user.name} - ${status.tooltip}`}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border flex items-center justify-between gap-1 ${status.colorClass}`}
                                >
                                   <div className="flex items-center gap-1 overflow-hidden">
                                      {schedule.isExtraShift && <CircleDollarSign size={8} className="shrink-0"/>}
                                      {schedule.isCompensation && <ArrowRightLeft size={8} className="shrink-0"/>}
                                      {schedule.hasAttachment && <Paperclip size={8} className="shrink-0"/>}
                                      {schedule.isDiluted && <span className="text-[7px] font-black border border-current px-0.5 rounded">C</span>}
                                      <span className="font-bold truncate max-w-[50px]">{user.name.split(' ')[0]}</span>
                                   </div>
                                   <span className="opacity-80">
                                       {schedule.type === 'OFF' ? 'FOLGA' : schedule.type === 'ABSENCE' ? (schedule.absenceType === 'UNJUSTIFIED' ? 'FALTA' : 'ATEST') : `${schedule.start}-${schedule.end}`}
                                   </span>
                                </div>
                            );
                         })}
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
                   
                   {/* Formulário de Falta (Overlay interno ou substituição) */}
                   {absenceForm ? (
                       <div className="space-y-6 animate-in slide-in-from-right">
                           <div className="flex items-center justify-between border-b pb-2">
                               <div>
                                   <h4 className="font-black text-lg text-slate-800">Registrar Ausência</h4>
                                   <p className="text-slate-500 text-xs">Colaborador: <strong>{absenceForm.userName}</strong></p>
                               </div>
                               <button onClick={() => setAbsenceForm(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">Voltar</button>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                               <div onClick={() => setAbsenceForm({...absenceForm, type: 'UNJUSTIFIED'})} className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${absenceForm.type === 'UNJUSTIFIED' ? 'border-rose-500 bg-rose-50' : 'border-slate-100 hover:border-slate-300'}`}>
                                   <AlertTriangle size={24} className={absenceForm.type === 'UNJUSTIFIED' ? 'text-rose-500' : 'text-slate-300'} />
                                   <p className="font-bold mt-2 text-sm text-slate-700">Injustificada</p>
                                   <p className="text-[10px] text-slate-500">Desconta do banco/salário.</p>
                               </div>
                               <div onClick={() => setAbsenceForm({...absenceForm, type: 'JUSTIFIED'})} className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${absenceForm.type === 'JUSTIFIED' ? 'border-teal-500 bg-teal-50' : 'border-slate-100 hover:border-slate-300'}`}>
                                   <FileText size={24} className={absenceForm.type === 'JUSTIFIED' ? 'text-teal-500' : 'text-slate-300'} />
                                   <p className="font-bold mt-2 text-sm text-slate-700">Justificada / Atestado</p>
                                   <p className="text-[10px] text-slate-500">Abona as horas do dia.</p>
                               </div>
                           </div>

                           <div>
                               <label className="text-[10px] font-black uppercase text-slate-400">Motivo / Observação</label>
                               <input 
                                 type="text" 
                                 value={absenceForm.reason} 
                                 onChange={e => setAbsenceForm({...absenceForm, reason: e.target.value})}
                                 className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm"
                                 placeholder="Ex: Doença, Problema Pessoal..."
                               />
                           </div>

                           {absenceForm.type === 'JUSTIFIED' && (
                               <div>
                                   <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Anexar Atestado (Foto/PDF)</label>
                                   <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors">
                                       <input 
                                         type="file" 
                                         accept="image/*,application/pdf"
                                         onChange={e => setAbsenceForm({...absenceForm, file: e.target.files?.[0] || null})}
                                         className="absolute inset-0 opacity-0 cursor-pointer"
                                       />
                                       <div className="flex flex-col items-center gap-2 pointer-events-none">
                                           <UploadCloud size={24} className="text-amber-500"/>
                                           {absenceForm.file ? (
                                               <span className="text-sm font-bold text-emerald-600">{absenceForm.file.name}</span>
                                           ) : (
                                               <span className="text-xs text-slate-400 font-bold">Clique para enviar arquivo</span>
                                           )}
                                       </div>
                                   </div>
                               </div>
                           )}

                           <div className="pt-4 border-t flex justify-end">
                               <button 
                                 onClick={handleSaveAbsence}
                                 disabled={absenceForm.isUploading}
                                 className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs shadow-lg hover:bg-black transition-all disabled:opacity-50"
                               >
                                   {absenceForm.isUploading ? 'Salvando...' : 'Confirmar Falta'}
                               </button>
                           </div>
                       </div>
                   ) : (
                       /* Lista Padrão de Edição */
                       <div className="space-y-3">
                          {users.filter(u => u.active).map(user => {
                             const edit = dayEdits[user.id];
                             if (!edit) return null;
                             const isWorkOrComp = edit.type === 'WORK' || edit.type === 'COMPENSATION';
                             const isAbsence = edit.type === 'ABSENCE'; // Embora o edit.type não mude aqui sem reload, usamos para lógica defensiva

                             return (
                                <div key={user.id} className={`flex flex-col lg:flex-row items-center gap-4 p-4 rounded-2xl border transition-colors ${isWorkOrComp ? (edit.isExtraShift ? 'bg-purple-50 border-purple-200' : edit.type === 'COMPENSATION' ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200') : 'bg-slate-50 border-slate-100 opacity-70'}`}>
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
                                           onClick={() => handleTypeChange(user.id, 'WORK')}
                                           className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${isWorkOrComp ? 'bg-white text-emerald-600 shadow' : 'text-slate-400'}`}
                                         >
                                            Trabalha
                                         </button>
                                         <button 
                                           onClick={() => handleTypeChange(user.id, 'OFF')}
                                           className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${edit.type === 'OFF' ? 'bg-white text-rose-500 shadow' : 'text-slate-400'}`}
                                         >
                                            Folga
                                         </button>
                                      </div>

                                      {/* Horários (Só mostra se trabalha) */}
                                      {isWorkOrComp && (
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

                                      {/* Botão Registrar Falta */}
                                      <button 
                                        onClick={() => openAbsenceForm(user.id)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-rose-200 text-rose-600 hover:bg-rose-50 transition-all"
                                      >
                                          <AlertTriangle size={12}/> Falta
                                      </button>
                                   </div>
                                </div>
                             );
                          })}
                       </div>
                   )}
                </div>

                {!absenceForm && (
                    <div className="p-6 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
                       <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">Cancelar</button>
                       <button onClick={handleSaveChanges} className="px-8 py-3 bg-amber-600 text-white rounded-xl font-black uppercase shadow-lg hover:bg-amber-700 active:scale-95 transition-all flex items-center gap-2">
                          <Save size={18}/> Salvar Escala
                       </button>
                    </div>
                )}
             </div>
          </div>
       )}

       {/* Modal Wizard de Compensação */}
       {compensationWizard && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
             <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col">
                <div className="p-6 bg-slate-900 text-white">
                   <h3 className="text-xl font-black uppercase tracking-tight">Compensação de Horas</h3>
                   <p className="text-slate-400 text-xs">Gerenciamento de folga em dia útil.</p>
                </div>
                
                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                   <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-900 text-sm">
                      <p><strong>{compensationWizard.userName}</strong> deixará de trabalhar <strong>{compensationWizard.hoursToCompensate.toFixed(1)}h</strong> em <strong>{new Date(compensationWizard.originalDate + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>.</p>
                      <p className="mt-1 text-xs opacity-80">O que deseja fazer com estas horas?</p>
                   </div>

                   {!wizardOption ? (
                      <div className="space-y-3">
                         <button onClick={() => setWizardOption('DEBIT')} className="w-full p-4 rounded-xl border-2 border-slate-100 hover:border-rose-400 hover:bg-rose-50 transition-all text-left flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform"><CircleDollarSign size={20}/></div>
                            <div>
                               <h4 className="font-black text-slate-800 uppercase text-xs group-hover:text-rose-700">Descontar do Banco</h4>
                               <p className="text-[10px] text-slate-500">Gera saldo negativo no dia (-{compensationWizard.hoursToCompensate.toFixed(1)}h).</p>
                            </div>
                         </button>

                         <button onClick={() => setWizardOption('REALLOCATE')} className="w-full p-4 rounded-xl border-2 border-slate-100 hover:border-blue-400 hover:bg-blue-50 transition-all text-left flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform"><ArrowRightLeft size={20}/></div>
                            <div>
                               <h4 className="font-black text-slate-800 uppercase text-xs group-hover:text-blue-700">Realocar Turno</h4>
                               <p className="text-[10px] text-slate-500">Trabalha em outro dia (folga) para compensar.</p>
                            </div>
                         </button>

                         <button onClick={() => setWizardOption('DILUTE')} className="w-full p-4 rounded-xl border-2 border-slate-100 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform"><Split size={20}/></div>
                            <div>
                               <h4 className="font-black text-slate-800 uppercase text-xs group-hover:text-emerald-700">Diluir na Semana</h4>
                               <p className="text-[10px] text-slate-500">Estende o horário de saída nos dias selecionados.</p>
                            </div>
                         </button>
                      </div>
                   ) : (
                      <div className="space-y-4 animate-in slide-in-from-right-10">
                         <button onClick={() => setWizardOption(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2"><ChevronLeft size={14}/> Voltar</button>
                         
                         {wizardOption === 'REALLOCATE' && (
                            <div>
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Escolha o dia da compensação</label>
                               <input type="date" value={reallocateDate} onChange={e => setReallocateDate(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-slate-800 outline-none" min={new Date().toISOString().split('T')[0]} />
                               <p className="text-[10px] text-slate-400 mt-2">Será criado um turno das {compensationWizard.originalStart} às {compensationWizard.originalEnd} neste dia.</p>
                            </div>
                         )}

                         {wizardOption === 'DILUTE' && (
                            <div>
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Selecione os dias para estender</label>
                               <div className="flex flex-wrap gap-2">
                                  {[1,2,3,4,5].map(d => (
                                     <button 
                                       key={d}
                                       onClick={() => setDiluteDays(prev => prev.includes(d) ? prev.filter(x => x!==d) : [...prev, d])}
                                       className={`w-10 h-10 rounded-lg font-black text-xs border transition-all ${diluteDays.includes(d) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-200'}`}
                                     >
                                        {['D','S','T','Q','Q','S','S'][d]}
                                     </button>
                                  ))}
                               </div>
                               <p className="text-[10px] text-emerald-600 font-bold mt-3 bg-emerald-50 p-2 rounded-lg inline-block">
                                  +{Math.round((compensationWizard.hoursToCompensate * 60) / diluteDays.length)} min/dia
                               </p>
                            </div>
                         )}

                         {wizardOption === 'DEBIT' && (
                            <div className="text-center p-4">
                               <p className="font-bold text-rose-600">Confirmar desconto de {compensationWizard.hoursToCompensate.toFixed(1)}h do banco?</p>
                            </div>
                         )}
                      </div>
                   )}
                </div>

                <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
                   <button onClick={() => setCompensationWizard(null)} className="px-4 py-2 text-slate-400 font-bold text-xs uppercase hover:bg-slate-200 rounded-lg">Cancelar</button>
                   {wizardOption && (
                      <button onClick={handleWizardConfirm} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:bg-black transition-all flex items-center gap-2">
                         <Check size={16}/> Confirmar
                      </button>
                   )}
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default ScheduleManager;