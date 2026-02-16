
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Clock, X, Check, Timer, TrendingUp, Camera, RefreshCw, Trash2, ListChecks, PlusCircle, Calendar as CalendarIcon, Grid, ChevronLeft, ChevronRight, Info, CheckCircle2, AlertCircle, CalendarDays, UploadCloud, Save, Image as ImageIcon, ExternalLink, Award, PartyPopper, ArrowRight } from 'lucide-react';
import { Task, TaskStatus, SystemUser, RecurrenceType, TaskPhotoRequirement } from '../types';

interface KanbanBoardProps {
  tasks: Task[];
  users: SystemUser[];
  onAddTask: (task: Task) => void;
  // Alterado para esperar um retorno de IDs (string[]) das fotos que deram certo
  onUpdateStatus: (taskId: string, status: TaskStatus, evidencePhotos?: {requirementId: string, title: string, data: string}[]) => Promise<string[]>;
  onDeleteTask: (id: string, mode: 'SINGLE' | 'RECURRING') => void;
  currentUser: SystemUser;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, onAddTask, onUpdateStatus, onDeleteTask, currentUser }) => {
  // ALTERAÇÃO: Padrão mudado para 'KANBAN'
  const [viewMode, setViewMode] = useState<'KANBAN' | 'CALENDAR'>('KANBAN');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCamera, setShowCamera] = useState<{ reqId: string, title: string } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<{ taskId: string, hasRecurrence: boolean } | null>(null);
  
  // Estado para Animação de Confete/Gamificação
  const [showCelebration, setShowCelebration] = useState(false);
  
  // Estado local para fotos capturadas mas ainda não enviadas no modal de detalhes
  const [pendingPhotos, setPendingPhotos] = useState<{requirementId: string, title: string, data: string}[]>([]);
  
  const [isUploading, setIsUploading] = useState(false);
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [currentTempPhoto, setCurrentTempPhoto] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // NOVO: Sincroniza a tarefa selecionada com as atualizações do banco de dados em tempo real
  // Isso garante que quando uma foto é salva, ela apareça imediatamente como "Salva" no modal
  useEffect(() => {
    if (selectedTask) {
      const updatedTask = tasks.find(t => t.id === selectedTask.id);
      if (updatedTask) {
        // Preserva o estado de fotos pendentes se houver, mas atualiza os dados do servidor
        setSelectedTask(updatedTask);
      }
    }
  }, [tasks]);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    requirePhoto: true,
    photoRequirements: [{ id: Math.random().toString(36).substr(2, 9), title: 'Geral da Atividade' }],
    startDate: new Date().toISOString().slice(0, 16),
    endDate: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    allDay: false,
    recurrence: { type: 'NENHUMA' as RecurrenceType },
    assignedUserIds: [currentUser.id]
  });

  const operationalStats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const userTasks = tasks.filter(t => t.assignedUserIds.includes(currentUser.id) && (t.completedAt || t.startDate) >= monthStart.getTime());
    const done = userTasks.filter(t => t.status === 'CONCLUIDA').length;
    const expired = userTasks.filter(t => t.status === 'VENCIDA').length;
    const total = userTasks.length;
    const integrity = total > 0 ? Math.max(0, ((total - expired) / total) * 100) : 100;
    return { done, expired, total, integrity };
  }, [tasks, currentUser.id]);

  // Identifica a próxima tarefa disponível para o usuário
  const nextAvailableTask = useMemo(() => {
    const now = Date.now();
    return tasks
      .filter(t => 
        t.status === 'A_FAZER' && 
        !t.archived && 
        t.assignedUserIds.includes(currentUser.id)
      )
      .sort((a, b) => a.startDate - b.startDate)[0]; // Pega a mais antiga/prioritária
  }, [tasks, currentUser.id]);

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { alert("Câmera indisponível."); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = 480; 
      canvasRef.current.height = 480;
      const video = videoRef.current;
      const size = Math.min(video.videoWidth, video.videoHeight);
      const startX = (video.videoWidth - size) / 2;
      const startY = (video.videoHeight - size) / 2;
      ctx?.drawImage(video, startX, startY, size, size, 0, 0, 480, 480);
      setCurrentTempPhoto(canvasRef.current.toDataURL('image/jpeg', 0.5)); 
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  };

  const confirmCapture = () => {
    if (showCamera && currentTempPhoto) {
      // Adiciona à lista de pendentes ou substitui se já existir para aquele requisito
      setPendingPhotos(prev => [
        ...prev.filter(p => p.requirementId !== showCamera.reqId),
        { requirementId: showCamera.reqId, title: showCamera.title, data: currentTempPhoto }
      ]);
      setShowCamera(null);
      setCurrentTempPhoto(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  };

  const handleSavePhotosOnly = async () => {
    if (!selectedTask || pendingPhotos.length === 0) return;
    setIsUploading(true);
    try {
      // Recebe a lista de IDs que foram salvos com sucesso
      const successfulIds = await onUpdateStatus(selectedTask.id, selectedTask.status, pendingPhotos);
      
      // Remove da lista de pendentes APENAS o que foi salvo
      setPendingPhotos(prev => prev.filter(p => !successfulIds.includes(p.requirementId)));
      
      if (successfulIds.length > 0 && successfulIds.length < pendingPhotos.length) {
         // Se salvou algumas mas não todas
         alert("Algumas fotos não foram salvas. Verifique as pendências e tente novamente.");
      } else if (successfulIds.length === 0 && pendingPhotos.length > 0) {
         // Se não salvou nada
         alert("Nenhuma foto foi salva. Tente novamente.");
      }
    } catch (e: any) {
      alert("Erro ao salvar fotos: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFinishTask = async () => {
    if (!selectedTask) return;
    
    const photosToUpload = pendingPhotos.length > 0 ? pendingPhotos : undefined;

    // Validação básica
    if (selectedTask.requirePhoto && selectedTask.photoRequirements) {
       const serverEvidenceIds = selectedTask.evidences?.map(e => e.requirementId) || [];
       const pendingEvidenceIds = pendingPhotos.map(p => p.requirementId);
       const allEvidenceIds = new Set([...serverEvidenceIds, ...pendingEvidenceIds]);
       
       const missing = selectedTask.photoRequirements.filter(req => !allEvidenceIds.has(req.id));
       if (missing.length > 0) {
         alert(`Faltam fotos para: ${missing.map(m => m.title).join(', ')}`);
         return;
       }
    }

    setIsUploading(true);
    try {
      const successfulIds = await onUpdateStatus(selectedTask.id, 'CONCLUIDA', photosToUpload);
      
      // Limpa as que subiram
      if (photosToUpload) {
          setPendingPhotos(prev => prev.filter(p => !successfulIds.includes(p.requirementId)));
      }
      
      // Se era para concluir e sobraram fotos pendentes (falha no upload), a tarefa provavelmente não concluiu (depende da lógica do App.tsx)
      // Mas visualmente limpamos o selectedTask apenas se tudo ok ou se o usuário fechar
      // Se o status mudou para concluída (via useEffect), o modal fecha ou atualiza
      if (!photosToUpload || successfulIds.length === photosToUpload.length) {
          setSelectedTask(null);
          setPendingPhotos([]);
          // DISPARA CELEBRAÇÃO (Sem timeout automático, aguarda interação)
          setShowCelebration(true);
      }
    } catch (e: any) {
      alert("Erro ao finalizar: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartTask = async () => {
    if (!selectedTask) return;
    setIsUploading(true);
    try {
      await onUpdateStatus(selectedTask.id, 'EM_EXECUCAO');
      // O useEffect atualizará o status visualmente
    } catch(e: any) {
      alert("Erro ao iniciar: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    setPendingPhotos([]);
    setSelectedTask(task);
  };

  const handleStartNextTask = () => {
    if (nextAvailableTask) {
      setShowCelebration(false);
      // Pequeno delay para transição suave de modais
      setTimeout(() => {
        setSelectedTask(nextAvailableTask);
      }, 100);
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title) return alert("Título é obrigatório.");
    
    onAddTask({
      id: Math.random().toString(36).substr(2, 9),
      title: newTask.title,
      description: newTask.description,
      status: 'A_FAZER',
      requirePhoto: newTask.requirePhoto,
      photoRequirements: newTask.requirePhoto ? newTask.photoRequirements : [],
      startDate: new Date(newTask.startDate).getTime(),
      endDate: new Date(newTask.endDate).getTime(),
      allDay: newTask.allDay,
      recurrence: newTask.recurrence,
      createdAt: Date.now(),
      assignedUserIds: newTask.assignedUserIds
    });
    
    setShowAddModal(false);
    setNewTask({
      title: '',
      description: '',
      requirePhoto: true,
      photoRequirements: [{ id: Math.random().toString(36).substr(2, 9), title: 'Geral da Atividade' }],
      startDate: new Date().toISOString().slice(0, 16),
      endDate: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
      allDay: false,
      recurrence: { type: 'NENHUMA' },
      assignedUserIds: [currentUser.id]
    });
  };

  const getTaskColor = (status: TaskStatus) => {
    switch (status) {
      case 'A_FAZER': return 'bg-white border-slate-200 text-slate-700';
      case 'EM_EXECUCAO': return 'bg-amber-100 border-amber-300 text-amber-800';
      case 'CONCLUIDA': return 'bg-emerald-100 border-emerald-300 text-emerald-800';
      case 'VENCIDA': return 'bg-rose-100 border-rose-300 text-rose-800';
    }
  };

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const dayTasks = tasks.filter(t => {
        const tDate = new Date(t.startDate);
        return tDate.getDate() === i && tDate.getMonth() === month && tDate.getFullYear() === year;
      });
      days.push({ day: i, date: new Date(year, month, i), tasks: dayTasks });
    }
    return days;
  }, [currentDate, tasks]);

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in pb-20">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="bg-slate-900 p-6 rounded-[2rem] border border-white/10 shadow-xl flex flex-wrap items-center justify-between gap-6 flex-1">
           <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg"><CheckCircle2 size={24} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Placar do Mês</p>
                <p className="text-white font-bold text-lg uppercase tracking-tight">Produtividade Atual</p>
              </div>
           </div>
           <div className="flex-1 max-w-sm hidden md:block">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Barra de Integridade</span>
                <span className="text-[10px] font-black text-emerald-400">{Math.round(operationalStats.integrity)}%</span>
              </div>
              <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden border border-white/5 p-0.5">
                 <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${operationalStats.integrity}%` }} />
              </div>
           </div>
           <div className="flex items-center gap-6">
              <div className="text-center"><p className="text-[9px] font-black text-emerald-500 uppercase">Feitas</p><p className="text-3xl font-black text-white leading-none">{operationalStats.done}</p></div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center"><p className="text-[9px] font-black text-rose-500 uppercase">Não Feitas</p><p className="text-3xl font-black text-white leading-none">{operationalStats.expired}</p></div>
           </div>
        </div>
        <div className="bg-white p-2 rounded-2xl border shadow-sm flex gap-2 self-start lg:self-center">
           <button onClick={() => setViewMode('KANBAN')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all ${viewMode === 'KANBAN' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}><Grid size={18}/> Quadro</button>
           <button onClick={() => setViewMode('CALENDAR')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all ${viewMode === 'CALENDAR' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}><CalendarIcon size={18}/> Agenda</button>
        </div>
      </div>

      <div className="flex justify-between items-center">
        {viewMode === 'CALENDAR' ? (
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
            <div className="flex gap-1">
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18}/></button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 font-bold text-xs uppercase hover:bg-slate-100 rounded-lg">Hoje</button>
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18}/></button>
            </div>
          </div>
        ) : <div/>}
        {currentUser.permissions.canManageTasks && <button onClick={() => setShowAddModal(true)} className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-amber-700 transition-all active:scale-95"><Plus size={20} /> Agendar Tarefa</button>}
      </div>

      {viewMode === 'CALENDAR' ? (
        <div className="flex-1 bg-white rounded-[2rem] border shadow-sm overflow-hidden flex flex-col min-h-[500px]">
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
                        <div key={t.id} 
                             onClick={() => handleTaskClick(t)}
                             className={`group relative text-[9px] font-bold p-1.5 rounded-lg border truncate cursor-pointer transition-all hover:scale-[1.02] ${getTaskColor(t.status)}`}>
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
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-6 flex-1 min-h-0">
          {(['A_FAZER', 'EM_EXECUCAO', 'CONCLUIDA', 'VENCIDA'] as TaskStatus[]).map(status => (
            <div key={status} className="flex-1 min-w-[320px] flex flex-col bg-slate-100/50 rounded-[2rem] border overflow-hidden">
               <div className="p-4 border-b bg-white/50 flex items-center justify-between"><h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">{status.replace('_', ' ')}</h3></div>
               <div className="p-3 space-y-3 overflow-y-auto flex-1 scrollbar-hide">
                 {tasks.filter(t => t.status === status && !t.archived).map(task => (
                   <div key={task.id} onClick={() => handleTaskClick(task)} className={`p-5 rounded-2xl shadow-sm border group hover:border-amber-400 transition-all cursor-pointer ${getTaskColor(task.status)}`}>
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold leading-tight flex-1">{task.title}</h4>
                      </div>
                      <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center">
                        <div className="flex -space-x-1">{task.assignedUserIds.map(uid => <div key={uid} className="w-7 h-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] font-black" title={users.find(u => u.id === uid)?.name}>{users.find(u => u.id === uid)?.name[0]}</div>)}</div>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Detalhes da Tarefa */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95">
             <div className="p-6 bg-slate-50 border-b flex justify-between items-start sticky top-0 z-20">
                <div>
                   <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase border mb-2 ${getTaskColor(selectedTask.status)}`}>
                      {selectedTask.status.replace('_', ' ')}
                   </div>
                   <h2 className="text-2xl font-black text-slate-800 leading-tight">{selectedTask.title}</h2>
                   <div className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-500">
                      <Clock size={14}/> 
                      <span>{new Date(selectedTask.startDate).toLocaleString()}</span>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   {currentUser.permissions.canManageTasks && (
                      <button 
                        onClick={() => setShowDeleteModal({ taskId: selectedTask.id, hasRecurrence: !!selectedTask.recurrence.groupId })}
                        className="p-2 bg-rose-50 text-rose-500 rounded-full border border-rose-100 hover:bg-rose-100 hover:text-rose-600 transition-colors"
                        title="Excluir Tarefa"
                      >
                        <Trash2 size={20}/>
                      </button>
                   )}
                   <button onClick={() => setSelectedTask(null)} className="p-2 bg-white rounded-full border hover:bg-slate-100"><X size={20}/></button>
                </div>
             </div>
             
             <div className="p-6 space-y-8">
                {selectedTask.description && (
                   <div className="bg-slate-50 p-4 rounded-2xl border">
                      <p className="text-sm text-slate-600">{selectedTask.description}</p>
                   </div>
                )}

                {/* Seção de Evidências e Galeria */}
                {selectedTask.requirePhoto && (
                   <div className="space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                         <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><Camera size={18}/> Requisitos de Evidência</h3>
                         {pendingPhotos.length > 0 && (
                            <button 
                              onClick={handleSavePhotosOnly} 
                              disabled={isUploading}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase flex items-center gap-2 hover:bg-blue-700 shadow-md animate-pulse"
                            >
                              {isUploading ? <RefreshCw className="animate-spin" size={14}/> : <UploadCloud size={14}/>}
                              Salvar {pendingPhotos.length} Fotos
                            </button>
                         )}
                      </div>
                      
                      {/* Lista de Requisitos (Botões de Câmera) */}
                      <div className="grid grid-cols-1 gap-3">
                         {selectedTask.photoRequirements?.map(req => {
                            const savedEvidence = selectedTask.evidences?.find(e => e.requirementId === req.id);
                            const pendingEvidence = pendingPhotos.find(p => p.requirementId === req.id);
                            const isDone = !!savedEvidence;
                            const isPending = !!pendingEvidence;

                            return (
                               <div key={req.id} className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${isDone ? 'bg-emerald-50 border-emerald-200' : isPending ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                                  <div className="flex items-center gap-4">
                                     <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-200 text-emerald-700' : isPending ? 'bg-amber-200 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                                        {isDone ? <Check size={24}/> : isPending ? <Save size={24}/> : <Camera size={24}/>}
                                     </div>
                                     <div>
                                        <p className="font-black text-sm text-slate-800">{req.title}</p>
                                        <p className="text-[10px] font-bold uppercase tracking-wider mt-1">
                                           {isDone ? <span className="text-emerald-600 flex items-center gap-1"><UploadCloud size={10}/> Salvo na Nuvem</span> : isPending ? <span className="text-amber-600 flex items-center gap-1"><Clock size={10}/> Pendente de Envio</span> : <span className="text-slate-400">Aguardando Foto</span>}
                                        </p>
                                     </div>
                                  </div>
                                  {selectedTask.status === 'EM_EXECUCAO' && (
                                     <button 
                                       onClick={() => { setShowCamera({ reqId: req.id, title: req.title }); initCamera(); }}
                                       className={`p-3 rounded-xl transition-colors ${isDone || isPending ? 'text-slate-400 hover:bg-slate-100' : 'bg-amber-600 text-white shadow-md hover:bg-amber-700'}`}
                                     >
                                        <Camera size={20}/>
                                     </button>
                                  )}
                               </div>
                            );
                         })}
                      </div>

                      {/* Galeria de Fotos (Repositório Visual) */}
                      {(selectedTask.evidences?.length || pendingPhotos.length) ? (
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={12}/> Galeria de Evidências</h4>
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {/* Fotos Pendentes (Locais) */}
                              {pendingPhotos.map((photo, idx) => (
                                <div key={`pending-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border-2 border-amber-400 shadow-md group">
                                  <img src={photo.data} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="text-amber-400 font-bold text-xs uppercase bg-black/50 px-2 py-1 rounded">Pendente</span>
                                  </div>
                                  <button onClick={() => setPendingPhotos(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-rose-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                                  <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1 text-[9px] text-white truncate text-center">{photo.title}</div>
                                </div>
                              ))}
                              
                              {/* Fotos Salvas (Nuvem) */}
                              {selectedTask.evidences?.map((ev, idx) => (
                                <div key={`saved-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                                  <img src={ev.url} className="w-full h-full object-cover" />
                                  <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg"><Check size={12}/></div>
                                  <a href={ev.url} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                                    <ExternalLink className="text-white drop-shadow-md" size={20}/>
                                  </a>
                                  <div className="absolute bottom-0 inset-x-0 bg-white/90 p-1 text-[9px] font-bold text-slate-800 truncate text-center border-t">{ev.title}</div>
                                </div>
                              ))}
                           </div>
                        </div>
                      ) : null}
                   </div>
                )}

                {/* Ações Principais */}
                <div className="pt-6 border-t flex flex-col md:flex-row gap-4 sticky bottom-0 bg-white pb-4 z-10">
                   {selectedTask.status === 'A_FAZER' && (
                      <button 
                        onClick={handleStartTask}
                        disabled={isUploading}
                        className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                         {isUploading ? <RefreshCw className="animate-spin"/> : <TrendingUp/>} Iniciar Tarefa
                      </button>
                   )}
                   
                   {selectedTask.status === 'EM_EXECUCAO' && (
                      <button 
                        onClick={handleFinishTask}
                        disabled={isUploading}
                        className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                         {isUploading ? <RefreshCw className="animate-spin"/> : <CheckCircle2/>} Finalizar Tarefa
                      </button>
                   )}
                   
                   {selectedTask.status === 'CONCLUIDA' && (
                      <div className="w-full py-4 bg-emerald-100 text-emerald-700 rounded-2xl font-black text-center flex items-center justify-center gap-2 border border-emerald-200">
                         <CheckCircle2/> Tarefa Concluída
                      </div>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* OVERLAY DE CELEBRAÇÃO INTERATIVO (GAMIFICAÇÃO) */}
      {showCelebration && (
         <div className="fixed inset-0 z-[160] flex flex-col items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500"></div>
            <div className="relative bg-white p-10 md:p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-in zoom-in-50 slide-in-from-bottom-20 duration-500 max-w-sm w-full mx-4 border-4 border-amber-500">
               <div className="text-7xl mb-6 animate-bounce">🏆</div>
               <h3 className="text-3xl font-black text-slate-800 uppercase text-center mb-2 leading-none">Excelente!</h3>
               <div className="bg-amber-100 text-amber-800 px-6 py-2 rounded-full font-black text-xl border border-amber-200 shadow-inner flex items-center gap-2 mb-4">
                  <Plus size={24}/> 1 Ponto
               </div>
               <p className="text-slate-400 text-sm font-bold uppercase tracking-widest text-center">Tarefa finalizada com sucesso.</p>

               <div className="mt-8 w-full space-y-3 relative z-20">
                  {nextAvailableTask ? (
                    <button 
                      onClick={handleStartNextTask}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg uppercase shadow-xl hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 animate-pulse"
                    >
                      Próxima Tarefa <ArrowRight size={24}/>
                    </button>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-2xl text-center border border-slate-100">
                       <p className="text-xs font-bold text-slate-500 uppercase">Você zerou suas pendências!</p>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => setShowCelebration(false)}
                    className="w-full py-4 bg-white text-slate-400 hover:text-slate-600 rounded-2xl font-bold uppercase text-xs border-2 border-transparent hover:border-slate-100 transition-all"
                  >
                    Voltar ao Quadro
                  </button>
               </div>
               
               {/* Efeito de Confete CSS Simples */}
               <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[3rem]">
                  {[...Array(30)].map((_, i) => (
                    <div key={i} className="absolute w-2 h-2 bg-amber-500 rounded-full animate-ping" style={{
                       top: `${Math.random() * 100}%`,
                       left: `${Math.random() * 100}%`,
                       animationDelay: `${Math.random()}s`,
                       animationDuration: '2s'
                    }}/>
                  ))}
               </div>
            </div>
         </div>
      )}

      {/* Modal de Câmera */}
      {showCamera && (
         <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md space-y-6 text-center">
               <h3 className="text-white text-2xl font-black">{showCamera.title}</h3>
               <div className="relative aspect-square bg-slate-900 rounded-[3rem] overflow-hidden border-4 border-amber-500 shadow-2xl">
                  {!currentTempPhoto ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"/> : <img src={currentTempPhoto} className="w-full h-full object-cover"/>}
               </div>
               <div className="flex flex-col gap-4">
                  {!currentTempPhoto ? (
                    <button onClick={capturePhoto} className="w-full py-5 bg-white text-amber-600 rounded-2xl font-black text-xl uppercase shadow-xl">Capturar</button>
                  ) : (
                    <div className="flex gap-3">
                       <button onClick={confirmCapture} className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl uppercase shadow-xl">Usar Foto</button>
                       <button onClick={() => setCurrentTempPhoto(null)} className="flex-1 py-5 bg-slate-700 text-white rounded-2xl font-black text-xl uppercase shadow-xl">Refazer</button>
                    </div>
                  )}
                  <button onClick={() => { if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop()); setShowCamera(null); setCurrentTempPhoto(null); }} className="text-slate-500 font-bold uppercase text-xs">Cancelar</button>
               </div>
            </div>
         </div>
      )}

      {/* Modal Agendar Tarefa */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-amber-600 text-white flex justify-between items-center sticky top-0 z-10">
              <div>
                <h3 className="text-2xl font-black">Agendar Tarefa</h3>
                <p className="text-amber-100 text-xs font-bold uppercase tracking-widest opacity-80">Criação de demanda para a equipe</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-amber-500 rounded-full transition-colors"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleCreateTask} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Título da Atividade</label>
                  <input type="text" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl outline-none font-bold text-black placeholder:text-slate-500" style={{ colorScheme: 'light' }} placeholder="Ex: Lavagem de barris, Produção Lote #04..." />
                </div>
                
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Descrição (Opcional)</label>
                  <textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl outline-none font-medium text-black h-24 placeholder:text-slate-500" style={{ colorScheme: 'light' }} placeholder="Detalhes técnicos ou orientações..." />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Início</label>
                  <input type="datetime-local" value={newTask.startDate} onChange={e => setNewTask({...newTask, startDate: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl outline-none font-bold text-black placeholder:text-slate-500" style={{ colorScheme: 'light' }} />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Fim Estimado</label>
                  <input type="datetime-local" value={newTask.endDate} onChange={e => setNewTask({...newTask, endDate: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl outline-none font-bold text-black placeholder:text-slate-500" style={{ colorScheme: 'light' }} />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Recorrência</label>
                  <select value={newTask.recurrence.type} onChange={e => setNewTask({...newTask, recurrence: { type: e.target.value as any }})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl outline-none font-bold text-black" style={{ colorScheme: 'light' }}>
                    <option value="NENHUMA">Não se repete</option>
                    <option value="DIARIA">Diariamente</option>
                    <option value="SEMANAL">Semanalmente</option>
                    <option value="QUINZENAL">Quinzenalmente</option>
                    <option value="MENSAL">Mensalmente</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Responsáveis</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {users.filter(u => u.active).map(u => (
                      <button 
                        key={u.id}
                        type="button"
                        onClick={() => {
                          const ids = newTask.assignedUserIds.includes(u.id) ? newTask.assignedUserIds.filter(id => id !== u.id) : [...newTask.assignedUserIds, u.id];
                          setNewTask({...newTask, assignedUserIds: ids});
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border ${newTask.assignedUserIds.includes(u.id) ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div className="flex items-center justify-between border-t pt-4">
                    <div className="flex items-center gap-2">
                       <Camera size={18} className="text-amber-500" />
                       <span className="text-sm font-bold text-slate-700">Exigir fotos de evidência</span>
                    </div>
                    <button type="button" onClick={() => setNewTask({...newTask, requirePhoto: !newTask.requirePhoto})} className={`w-12 h-6 rounded-full relative transition-colors ${newTask.requirePhoto ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                       <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newTask.requirePhoto ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  {newTask.requirePhoto && (
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisitos Fotográficos</p>
                      {newTask.photoRequirements.map((req, idx) => (
                        <div key={req.id} className="flex gap-2">
                           <input type="text" value={req.title} onChange={e => {
                             const newList = [...newTask.photoRequirements];
                             newList[idx].title = e.target.value;
                             setNewTask({...newTask, photoRequirements: newList});
                           }} className="flex-1 px-4 py-2 bg-white border rounded-xl text-xs font-bold text-black placeholder:text-slate-500" style={{ colorScheme: 'light' }} placeholder="Título da Foto..." />
                           {newTask.photoRequirements.length > 1 && <button type="button" onClick={() => setNewTask({...newTask, photoRequirements: newTask.photoRequirements.filter((_, i) => i !== idx)})} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><X size={16}/></button>}
                        </div>
                      ))}
                      <button type="button" onClick={() => setNewTask({...newTask, photoRequirements: [...newTask.photoRequirements, { id: Math.random().toString(36).substr(2, 9), title: '' }]})} className="text-[10px] font-black text-amber-600 uppercase flex items-center gap-1 hover:underline"><PlusCircle size={14}/> Adicionar Foto</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6">
                <button type="submit" className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-amber-700 transition-all active:scale-95 flex items-center justify-center gap-3">
                  <CalendarDays size={24} />
                  CRIAR AGENDA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmação de Exclusão */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl p-8 text-center space-y-6 animate-in zoom-in-95">
             <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto"><Trash2 size={32}/></div>
             <div>
                <h3 className="text-xl font-black text-slate-800">Deseja remover?</h3>
                <p className="text-slate-500 text-sm mt-2">Esta ação não pode ser desfeita no sistema.</p>
             </div>
             <div className="flex flex-col gap-2">
                <button onClick={() => { onDeleteTask(showDeleteModal.taskId, 'SINGLE'); setShowDeleteModal(null); setSelectedTask(null); }} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs">Excluir apenas esta</button>
                {showDeleteModal.hasRecurrence && (
                  <button onClick={() => { onDeleteTask(showDeleteModal.taskId, 'RECURRING'); setShowDeleteModal(null); setSelectedTask(null); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">Excluir toda a série</button>
                )}
                <button onClick={() => setShowDeleteModal(null)} className="w-full py-4 text-slate-400 font-bold uppercase text-xs">Cancelar</button>
             </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden"/>
    </div>
  );
};
export default KanbanBoard;
