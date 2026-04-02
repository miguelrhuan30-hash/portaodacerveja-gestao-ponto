
import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Mail, Trash2, Edit3, CheckCircle2, XCircle, Lock, Eye, EyeOff, X, Save, Clock, Power, Award, CalendarDays, Briefcase, ChevronDown, ChevronUp, Copy, Plus, AlertCircle, DollarSign } from 'lucide-react';
import { SystemUser, PermissionSet, WorkSchedule, DaySchedule, ScheduleException } from '../types';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

interface UserManagementProps {
  users: SystemUser[];
  onUpdateUser: (user: SystemUser) => void;
  onAddUser: (user: SystemUser) => void;
  onDeleteUser: (userId: string) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onUpdateUser, onAddUser, onDeleteUser }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  
  // Estado unificado para Create/Edit
  const [formUser, setFormUser] = useState<{
    name: string;
    email: string;
    password: string;
    role: SystemUser['role'];
    schedule: WorkSchedule;
  }>({ 
    name: '', 
    email: '', 
    password: '',
    role: 'EMPLOYEE',
    schedule: {
      type: 'FLEXIBLE',
      dailyHours: 8,
      weeklyHours: 44,
      workDays: [1, 2, 3, 4, 5],
      flexible: true
    }
  });

  // Estado local para nova exceção
  const [newException, setNewException] = useState<Partial<ScheduleException>>({
    date: '',
    type: 'WORK',
    start: '08:00',
    end: '17:00',
    breakDuration: 60,
    note: ''
  });
  const [showExceptionForm, setShowExceptionForm] = useState(false);

  const activeUsers = users.filter(user => user.active === true);

  const togglePermission = (user: SystemUser, permission: keyof PermissionSet) => {
    if (user.role === 'MASTER') return;
    const updatedUser: SystemUser = {
      ...user,
      permissions: {
        ...user.permissions,
        [permission]: !user.permissions[permission]
      }
    };
    onUpdateUser(updatedUser);
  };

  const toggleUserStatus = (user: SystemUser) => {
    if (user.role === 'MASTER') return;
    onUpdateUser({ ...user, active: !user.active });
  };

  const getDefaultWeekConfig = (): Record<number, DaySchedule> => {
    const config: Record<number, DaySchedule> = {};
    for (let i = 0; i <= 6; i++) {
        config[i] = {
            enabled: i >= 1 && i <= 5, // Seg a Sex habilitado por padrão
            start: '08:00',
            end: '17:00',
            breakDuration: 60
        };
    }
    return config;
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormUser({
      name: '', email: '', password: '', role: 'EMPLOYEE',
      schedule: { 
        type: 'FLEXIBLE',
        dailyHours: 8, 
        weeklyHours: 44, 
        workDays: [1, 2, 3, 4, 5], 
        flexible: true,
        weekDayConfig: getDefaultWeekConfig(),
        monthlyExceptions: []
      }
    });
    setShowAddModal(true);
  };

  const openEditModal = (user: SystemUser) => {
    setEditingUser(user);
    setFormUser({
      name: user.name,
      email: user.email,
      password: user.password || '',
      role: user.role,
      schedule: {
        type: user.workSchedule?.type || 'FLEXIBLE',
        dailyHours: user.workSchedule?.dailyHours || 8,
        weeklyHours: user.workSchedule?.weeklyHours || 44,
        workDays: user.workSchedule?.workDays || [1, 2, 3, 4, 5],
        flexible: user.workSchedule?.flexible ?? true,
        weekDayConfig: user.workSchedule?.weekDayConfig || getDefaultWeekConfig(),
        monthlyExceptions: user.workSchedule?.monthlyExceptions || []
      }
    });
    setShowAddModal(true);
  };

  const handleSaveUser = async () => {
    if (!formUser.name || !formUser.email) {
      alert("Preencha os campos obrigatórios.");
      return;
    }

    const userData: SystemUser = editingUser ? {
      ...editingUser,
      name: formUser.name,
      email: formUser.email,
      password: formUser.password || editingUser.password,
      role: formUser.role,
      workSchedule: formUser.schedule
    } : {
      id: Math.random().toString(36).substr(2, 9),
      name: formUser.name.trim(),
      email: formUser.email.trim().toLowerCase(),
      password: formUser.password,
      role: formUser.role,
      active: true,
      points: 0,
      workSchedule: formUser.schedule,
      permissions: {
        canManageTasks: formUser.role !== 'EMPLOYEE',
        canRecordAttendance: true,
        canViewReports: formUser.role === 'ADMIN',
        canManageUsers: false,
        canManageShortages: true,
        canManageCash: false,
        canViewConferencia: formUser.role !== 'EMPLOYEE',
        canManageConferencia: formUser.role !== 'EMPLOYEE'
      }
    };

    if (editingUser) {
        onUpdateUser(userData);
    } else {
        if (!formUser.password) return alert("Senha é obrigatória para novos usuários.");
        let newUser = userData;
        try {
          const firebaseCredential = await createUserWithEmailAndPassword(
            auth,
            formUser.email,
            formUser.password
          );
          newUser = {
            ...newUser,
            id: firebaseCredential.user.uid,
            firebaseUid: firebaseCredential.user.uid,
          };
        } catch (firebaseErr: any) {
          if (firebaseErr.code === 'auth/email-already-in-use') {
            alert('Este email já está cadastrado no Firebase Auth. Use outro email ou contate o suporte.');
          } else {
            alert('Erro ao criar conta: ' + firebaseErr.message);
          }
          return;
        }
        onAddUser(newUser);
    }
    
    setShowAddModal(false);
  };

  const updateWeekDayConfig = (dayId: number, field: keyof DaySchedule, value: any) => {
     const currentConfig = { ...formUser.schedule.weekDayConfig } || getDefaultWeekConfig();
     currentConfig[dayId] = { ...currentConfig[dayId], [field]: value };
     setFormUser({ ...formUser, schedule: { ...formUser.schedule, weekDayConfig: currentConfig }});
  };

  const replicateWeekDays = () => {
     const currentConfig = { ...formUser.schedule.weekDayConfig } || getDefaultWeekConfig();
     // Pega segunda-feira como base
     const base = currentConfig[1]; 
     for(let i = 2; i <= 5; i++) {
        currentConfig[i] = { ...base };
     }
     setFormUser({ ...formUser, schedule: { ...formUser.schedule, weekDayConfig: currentConfig }});
  };

  const handleAddException = () => {
    if(!newException.date) return alert("Selecione uma data.");
    const exception: ScheduleException = {
        id: Math.random().toString(36).substr(2,9),
        date: newException.date,
        type: newException.type as 'WORK' | 'OFF',
        note: newException.note,
        start: newException.type === 'WORK' ? newException.start : undefined,
        end: newException.type === 'WORK' ? newException.end : undefined,
        breakDuration: newException.type === 'WORK' ? newException.breakDuration : undefined,
    };
    
    const updatedExceptions = [...(formUser.schedule.monthlyExceptions || []), exception];
    // Ordenar por data
    updatedExceptions.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setFormUser({ ...formUser, schedule: { ...formUser.schedule, monthlyExceptions: updatedExceptions }});
    setShowExceptionForm(false);
    setNewException({ date: '', type: 'WORK', start: '08:00', end: '17:00', breakDuration: 60, note: '' });
  };

  const handleRemoveException = (id: string) => {
    const updatedExceptions = (formUser.schedule.monthlyExceptions || []).filter(e => e.id !== id);
    setFormUser({ ...formUser, schedule: { ...formUser.schedule, monthlyExceptions: updatedExceptions }});
  };

  const weekDays = [
    { id: 0, label: 'Domingo', short: 'Dom' }, { id: 1, label: 'Segunda', short: 'Seg' }, { id: 2, label: 'Terça', short: 'Ter' },
    { id: 3, label: 'Quarta', short: 'Qua' }, { id: 4, label: 'Quinta', short: 'Qui' }, { id: 5, label: 'Sexta', short: 'Sex' },
    { id: 6, label: 'Sábado', short: 'Sáb' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold text-slate-800">Colaboradores</h3>
          <p className="text-slate-500">Gerencie a equipe, permissões e escalas de trabalho.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg"
        >
          <UserPlus size={20} />
          Convidar Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {activeUsers.map(user => (
          <div key={user.id} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center gap-6 group hover:border-amber-400 transition-all shadow-sm">
            <div className="flex items-center gap-4 lg:w-1/4 cursor-pointer" onClick={() => openEditModal(user)}>
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold border-2 border-slate-50 overflow-hidden shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} className="w-full h-full object-cover scale-x-[-1]" />
                ) : (
                  user.name.split(' ').map(n => n[0]).join('').toUpperCase()
                )}
              </div>
              <div className="truncate">
                <h4 className="font-bold text-slate-800 truncate group-hover:text-amber-600 transition-colors">{user.name} <Edit3 size={12} className="inline ml-1 opacity-50"/></h4>
                <div className="flex items-center gap-2">
                   <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {[
                    { key: 'canManageTasks', label: 'Tarefas' },
                    { key: 'canRecordAttendance', label: 'Ponto' },
                    { key: 'canViewReports', label: 'Gestão' },
                    { key: 'canManageShortages', label: 'Estoque' },
                    { key: 'canManageCash', label: 'Op. Caixa' },
                    { key: 'canViewConferencia', label: 'Conf. (Ver/Exec)' },
                    { key: 'canManageConferencia', label: 'Conf. (Gerenciar)' }
                ].map(p => (
                    <button
                    key={p.key}
                    disabled={user.role === 'MASTER'}
                    onClick={() => togglePermission(user, p.key as keyof PermissionSet)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-2 border transition-all ${user.permissions[p.key as keyof PermissionSet] ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    >
                    {user.permissions[p.key as keyof PermissionSet] ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {p.label}
                    </button>
                ))}
              </div>
              
              {/* Resumo da Escala Visual */}
              {user.workSchedule && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium bg-slate-50 p-2 rounded-lg w-fit border border-slate-100 mt-1">
                      <Clock size={12} className="text-amber-500" />
                      {user.workSchedule.type === 'FIXED' ? (
                          <span className="font-bold text-slate-700">Horário Fixo / Escala</span>
                      ) : (
                          <>
                            <span className="font-bold text-slate-700">{user.workSchedule.dailyHours}h/dia (Flex)</span>
                            <span className="text-slate-300">|</span>
                            <span>
                                {user.workSchedule.workDays?.length === 5 && user.workSchedule.workDays.includes(1) && user.workSchedule.workDays.includes(5) 
                                ? 'Seg a Sex' 
                                : user.workSchedule.workDays?.map(d => weekDays.find(w => w.id === d)?.short).join(', ')}
                            </span>
                          </>
                      )}
                  </div>
              )}
            </div>

            <div className="flex items-center gap-3 lg:w-1/6 justify-end">
               <button 
                 onClick={() => toggleUserStatus(user)}
                 title={user.active ? "Desativar Temporariamente" : "Ativar"}
                 className={`p-2 rounded-lg transition-colors ${user.active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-rose-500 hover:bg-rose-50'}`}
               >
                 <Power size={20} />
               </button>
               {user.role !== 'MASTER' && (
                 <button 
                  onClick={() => { if(confirm(`Tem certeza que deseja remover ${user.name}? O usuário perderá o acesso imediatamente.`)) onDeleteUser(user.id); }}
                  className="p-2 text-slate-300 hover:text-rose-600 transition-colors bg-slate-50 hover:bg-rose-100 rounded-lg"
                  title="Excluir Usuário"
                 >
                   <Trash2 size={20} />
                 </button>
               )}
            </div>
          </div>
        ))}
        {activeUsers.length === 0 && (
          <div className="p-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[2.5rem]">
             <p className="font-bold uppercase tracking-widest text-sm">Nenhum colaborador ativo</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="p-6 bg-amber-600 text-white flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-xl font-black">{editingUser ? 'Editar Colaborador' : 'Novo Colaborador'}</h3>
              <button onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </div>
            <div className="p-8 space-y-6">
              
              <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase border-b pb-2 flex items-center gap-2"><Shield size={14} className="text-amber-600"/> Dados de Acesso</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nome Completo</label>
                        <input 
                        type="text" 
                        value={formUser.name} 
                        onChange={e => setFormUser({...formUser, name: e.target.value})} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">E-mail</label>
                        <input 
                        type="email" 
                        value={formUser.email} 
                        onChange={e => setFormUser({...formUser, email: e.target.value})} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Senha {editingUser && '(Opcional)'}</label>
                        <input 
                        type="password" 
                        value={formUser.password} 
                        onChange={e => setFormUser({...formUser, password: e.target.value})} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                        placeholder="******"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Cargo / Perfil</label>
                        <select 
                        value={formUser.role} 
                        onChange={e => setFormUser({...formUser, role: e.target.value as any})} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                        >
                        <option value="EMPLOYEE">Funcionário</option>
                        <option value="ADMIN">Administrador</option>
                        </select>
                    </div>
                  </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                       <Briefcase size={18} className="text-amber-600"/>
                       <h4 className="text-xs font-black text-slate-800 uppercase">Configuração de Ponto</h4>
                    </div>
                  </div>

                  {/* Seletor de Tipo de Escala */}
                  <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                     <button 
                        type="button"
                        onClick={() => setFormUser({ ...formUser, schedule: { ...formUser.schedule, type: 'FLEXIBLE' } })}
                        className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${formUser.schedule.type === 'FLEXIBLE' ? 'bg-white text-amber-600 shadow' : 'text-slate-400'}`}
                     >
                        Horário Flexível
                     </button>
                     <button 
                        type="button"
                        onClick={() => setFormUser({ ...formUser, schedule: { ...formUser.schedule, type: 'FIXED' } })}
                        className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${formUser.schedule.type === 'FIXED' ? 'bg-white text-amber-600 shadow' : 'text-slate-400'}`}
                     >
                        Horário Fixo
                     </button>
                  </div>
                  
                  {formUser.schedule.type === 'FLEXIBLE' ? (
                      // === MODO FLEXÍVEL ===
                      <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Horas Diárias</label>
                                <input 
                                    type="number" step="0.1"
                                    value={formUser.schedule.dailyHours} 
                                    onChange={e => setFormUser({...formUser, schedule: { ...formUser.schedule, dailyHours: parseFloat(e.target.value) }})} 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Semanal (Ref)</label>
                                <input 
                                    type="number" 
                                    value={formUser.schedule.weeklyHours} 
                                    onChange={e => setFormUser({...formUser, schedule: { ...formUser.schedule, weeklyHours: parseFloat(e.target.value) }})} 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Dias de Trabalho</label>
                            <div className="flex flex-wrap gap-2 justify-between">
                                {weekDays.map(day => (
                                    <button
                                        key={day.id} type="button"
                                        onClick={() => {
                                            const currentDays = formUser.schedule.workDays || [];
                                            const newDays = currentDays.includes(day.id) 
                                                ? currentDays.filter(d => d !== day.id)
                                                : [...currentDays, day.id].sort();
                                            setFormUser({...formUser, schedule: { ...formUser.schedule, workDays: newDays }});
                                        }}
                                        className={`w-12 h-12 rounded-xl text-sm font-bold transition-all border-2 flex flex-col items-center justify-center ${
                                            formUser.schedule.workDays?.includes(day.id) 
                                            ? 'bg-amber-100 border-amber-400 text-amber-700 shadow-sm' 
                                            : 'bg-white border-slate-200 text-slate-300 hover:border-slate-300'
                                        }`}
                                    >
                                        {day.label.slice(0,3)}
                                    </button>
                                ))}
                            </div>
                        </div>
                      </>
                  ) : (
                      // === MODO FIXO / GRADE ===
                      <div className="space-y-6">
                         
                         {/* Grade Semanal */}
                         <div>
                            <div className="flex justify-between items-center mb-2">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grade Semanal Padrão</label>
                               <button type="button" onClick={replicateWeekDays} className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1 hover:underline">
                                  <Copy size={12}/> Replicar Seg-Sex
                               </button>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                               {weekDays.map(day => {
                                   const cfg = formUser.schedule.weekDayConfig?.[day.id] || { enabled: false, start: '08:00', end: '17:00', breakDuration: 60 };
                                   return (
                                       <div key={day.id} className={`flex items-center gap-2 p-2 rounded-xl border ${cfg.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                           <input 
                                              type="checkbox" 
                                              checked={cfg.enabled} 
                                              onChange={e => updateWeekDayConfig(day.id, 'enabled', e.target.checked)}
                                              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                                           />
                                           <span className="w-10 text-xs font-bold text-slate-700">{day.short}</span>
                                           
                                           {cfg.enabled ? (
                                              <>
                                                 <input type="time" value={cfg.start} onChange={e => updateWeekDayConfig(day.id, 'start', e.target.value)} className="bg-slate-50 border rounded px-1 text-xs font-bold w-16" />
                                                 <span className="text-slate-300 text-xs">às</span>
                                                 <input type="time" value={cfg.end} onChange={e => updateWeekDayConfig(day.id, 'end', e.target.value)} className="bg-slate-50 border rounded px-1 text-xs font-bold w-16" />
                                                 <div className="flex items-center gap-1 ml-auto" title="Intervalo (min)">
                                                    <Clock size={12} className="text-slate-400"/>
                                                    <input type="number" value={cfg.breakDuration} onChange={e => updateWeekDayConfig(day.id, 'breakDuration', parseInt(e.target.value))} className="bg-slate-50 border rounded px-1 text-xs font-bold w-10 text-center" />
                                                 </div>
                                              </>
                                           ) : (
                                              <span className="text-xs text-slate-400 italic">Folga</span>
                                           )}
                                       </div>
                                   );
                               })}
                            </div>
                         </div>

                         {/* Exceções / Escala Mensal */}
                         <div>
                            <div className="flex justify-between items-center mb-2 border-t pt-4">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exceções / Trocas de Turno</label>
                               <button type="button" onClick={() => setShowExceptionForm(!showExceptionForm)} className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1 hover:underline">
                                  {showExceptionForm ? 'Cancelar' : <><Plus size={12}/> Adicionar Exceção</>}
                               </button>
                            </div>

                            {showExceptionForm && (
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3 mb-3 animate-in fade-in">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Data</label>
                                            <input type="date" value={newException.date} onChange={e => setNewException({...newException, date: e.target.value})} className="w-full p-2 rounded border text-xs font-bold" />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Tipo</label>
                                            <select value={newException.type} onChange={e => setNewException({...newException, type: e.target.value as any})} className="w-full p-2 rounded border text-xs font-bold">
                                                <option value="WORK">Trabalho</option>
                                                <option value="OFF">Folga</option>
                                            </select>
                                        </div>
                                    </div>
                                    {newException.type === 'WORK' && (
                                        <div className="flex gap-2 items-center">
                                            <input type="time" value={newException.start} onChange={e => setNewException({...newException, start: e.target.value})} className="flex-1 p-2 rounded border text-xs font-bold" />
                                            <span>às</span>
                                            <input type="time" value={newException.end} onChange={e => setNewException({...newException, end: e.target.value})} className="flex-1 p-2 rounded border text-xs font-bold" />
                                        </div>
                                    )}
                                    <input type="text" placeholder="Motivo (Opcional)" value={newException.note} onChange={e => setNewException({...newException, note: e.target.value})} className="w-full p-2 rounded border text-xs font-bold" />
                                    <button type="button" onClick={handleAddException} className="w-full bg-amber-600 text-white py-2 rounded-lg text-xs font-bold uppercase">Confirmar</button>
                                </div>
                            )}

                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {(formUser.schedule.monthlyExceptions || []).length === 0 ? (
                                    <p className="text-center text-xs text-slate-400 py-2 italic">Nenhuma exceção cadastrada.</p>
                                ) : (
                                    (formUser.schedule.monthlyExceptions || []).map(exc => (
                                        <div key={exc.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border text-xs">
                                            <div>
                                                <p className="font-bold text-slate-700">{new Date(exc.date + 'T00:00:00').toLocaleDateString('pt-BR')} <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] uppercase ${exc.type === 'WORK' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{exc.type === 'WORK' ? 'Extra/Troca' : 'Folga'}</span></p>
                                                {exc.type === 'WORK' && <p className="text-[10px] text-slate-500">{exc.start} - {exc.end} {exc.note ? `(${exc.note})` : ''}</p>}
                                                {exc.type === 'OFF' && exc.note && <p className="text-[10px] text-slate-500">{exc.note}</p>}
                                            </div>
                                            <button type="button" onClick={() => handleRemoveException(exc.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                                        </div>
                                    ))
                                )}
                            </div>
                         </div>
                      </div>
                  )}

              </div>

              <button onClick={handleSaveUser} className="w-full bg-amber-600 text-white py-4 rounded-xl font-black mt-4 shadow-lg active:scale-95 transition-all">
                {editingUser ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR USUÁRIO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
