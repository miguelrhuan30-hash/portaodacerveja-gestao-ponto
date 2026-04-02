
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Beer, ClipboardList, Clock, Calendar, Users as UsersIcon, LogOut, Menu, X, PackageSearch, AlertCircle, Cpu, Download, Lock, CalendarDays, DollarSign, PieChart } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, setDoc, deleteDoc, getDocs, where, writeBatch, getDoc, increment } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import KanbanBoard from './components/KanbanBoard';
import TimeClock from './components/TimeClock';
import AttendanceLog from './components/AttendanceLog';
import UserManagement from './components/UserManagement';
import UserProfile from './components/UserProfile';
import AttendanceReports from './components/AttendanceReports';
import ProductShortageComponent from './components/ProductShortage';
import ScheduleManager from './components/ScheduleManager';
import CashRegister from './components/CashRegister';
import FinancialReports from './components/FinancialReports';
import Conferencia from './components/Conferencia';
import LoginView from './components/LoginView';
import { AppTab, Task, AttendanceEntry, SystemUser, BranchLocation, ProductShortage, TaskStatus, TaskEvidence } from './types';
import { versionData } from './version';
import { ToastProvider, useToast } from './components/Toast';
import { hashPassword, verifyPassword, generateSessionToken, safeRandomUUID } from './utils/crypto';

const App: React.FC = () => {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shortages, setShortages] = useState<ProductShortage[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [locations, setLocations] = useState<BranchLocation[]>([]);
  
  // Estado para Categorias de Produto
  const [productCategories, setProductCategories] = useState<string[]>(['Insumos', 'Embalagens', 'Limpeza', 'Escritório', 'Manutenção', 'Outros']);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.BOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Estado para PWA
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  const logError = useCallback((title: string, error: any) => {
    const message = error?.message || error?.code || "Erro desconhecido";
    console.error(`${title}:`, message);
  }, []);

  // --- RESTAURAR SESSÃO DO LOCALSTORAGE ---
  // Executado uma única vez após os usuários serem carregados
  useEffect(() => {
    if (users.length === 0 || isLoggedIn) return;
    try {
      const stored = localStorage.getItem('pdc_session');
      if (stored) {
        const { email, sessionToken } = JSON.parse(stored);
        if (email && sessionToken) {
          const user = users.find(
            u => u.email.toLowerCase() === email.toLowerCase() &&
                 u.sessionToken === sessionToken &&
                 u.active
          );
          if (user) {
            setCurrentUser(user);
            setIsLoggedIn(true);
            setActiveTab(user.permissions.canManageTasks ? AppTab.BOARD : AppTab.ATTENDANCE);
          } else {
            localStorage.removeItem('pdc_session');
          }
        }
      }
    } catch {
      localStorage.removeItem('pdc_session');
    }
  }, [users, isLoggedIn]);

  // --- LÓGICA DE BLOQUEIO POR FALTA DE PONTO ---
  // NOVA LÓGICA: Baseada no status do turno (Aberto/Fechado), não na data.
  const isAttendanceLocked = useMemo(() => {
    // 1. Se não for funcionário, nunca bloqueia
    if (!currentUser || currentUser.role !== 'EMPLOYEE')
        return false;

    // 2. Busca o último registro histórico desse usuário
    // (A lista 'attendance' já vem ordenada por timestamp decrescente do banco)
    const lastEntry = attendance.find(entry => entry.employeeId === currentUser.id);

    // 3. Se nunca bateu ponto na vida, bloqueia (precisa dar entrada)
    if (!lastEntry) return true;

    // 4. Se o último registro foi 'SAIDA', o turno está FECHADO -> BLOQUEIA
    if (lastEntry.type === 'SAIDA') return true;

    // 5. Se o último registro foi 'ENTRADA', o turno está ABERTO -> LIBERA
    // (Isso funciona mesmo que a entrada tenha sido ontem)
    return false;
  }, [currentUser, attendance]);

  // Efeito para forçar a aba de Ponto se estiver bloqueado
  useEffect(() => {
    // Permite estar na aba de PONTO (para registrar) ou PERFIL (para cadastrar foto/biometria)
    if (isAttendanceLocked && activeTab !== AppTab.ATTENDANCE && activeTab !== AppTab.PROFILE) {
      setActiveTab(AppTab.ATTENDANCE);
    }
  }, [isAttendanceLocked, activeTab]);

  // --- SINCRONIZAÇÃO EM TEMPO REAL DO USUÁRIO ATUAL ---
  useEffect(() => {
    if (currentUser && users.length > 0) {
      const liveUserData = users.find(u => u.id === currentUser.id);
      
      // Se encontrou o usuário e houve mudança nos dados (ex: avatar novo)
      if (liveUserData) {
         // Usamos JSON.stringify para comparar profundamente e evitar loops infinitos se o objeto for idêntico
         if (JSON.stringify(liveUserData) !== JSON.stringify(currentUser)) {
            console.log("Sincronizando dados do usuário atual...");
            setCurrentUser(liveUserData);
         }
      }
    }
  }, [users, currentUser]);

  // --- CALCULAR ÚLTIMO PONTO DO USUÁRIO PARA PASSAR AO TIMECLOCK ---
  // Evita erro de índice no Firestore ao reutilizar os dados já carregados
  const userLastEntry = useMemo(() => {
    if (!currentUser || attendance.length === 0) return null;
    // attendance já está ordenado por timestamp desc no onSnapshot principal
    return attendance.find(a => a.employeeId === currentUser.id) || null;
  }, [currentUser, attendance]);

  useEffect(() => {
    // Listener para o evento de instalação PWA
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        setShowInstallButton(false);
      }
      setDeferredPrompt(null);
    });
  };

  useEffect(() => {
    const unsubLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      const locs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BranchLocation));
      setLocations(locs);
      if (locs.length === 0 && !isInitializing) {
        const defaultLoc: BranchLocation = {
          id: 'sede-principal',
          name: 'Sede Portão da Cerveja',
          lat: -26.9189,
          lng: -49.0660,
          radius: 300,
          address: 'Blumenau, SC',
          active: true
        };
        setDoc(doc(db, 'locations', defaultLoc.id), defaultLoc).catch(e => logError("Erro Criar Local", e));
      }
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SystemUser));
      if (usersData.length === 0) {
        const master: SystemUser = {
          id: 'master-001',
          name: 'Gestor Portão da Cerveja',
          email: 'portaodacerveja@portaodacerveja.com',
          password: 'gestor202017',
          role: 'MASTER',
          active: true,
          points: 0,
          permissions: { canManageTasks: true, canRecordAttendance: true, canViewReports: true, canManageUsers: true, canManageShortages: true, canManageCash: true }
        };
        setDoc(doc(db, 'users', master.id), master).catch(e => logError("Erro Criar Master", e));
      } else {
        setUsers(usersData);
      }
      setIsInitializing(false);
    }, (err) => { logError("Erro Usuários", err); setIsInitializing(false); });

    const unsubTasks = onSnapshot(query(collection(db, 'tasks'), orderBy('startDate', 'asc')), (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task)));
    }, (err) => logError("Erro Tarefas", err));

    const unsubShortages = onSnapshot(query(collection(db, 'shortages'), orderBy('requestedAt', 'desc')), (snapshot) => {
      setShortages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductShortage)));
    }, (err) => logError("Erro Estoque", err));

    const unsubAttendance = onSnapshot(query(collection(db, 'pontos'), orderBy('timestamp', 'desc')), (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AttendanceEntry)));
    }, (err) => logError("Erro Pontos", err));

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().productCategories) {
        setProductCategories(docSnap.data().productCategories);
      }
    });

    return () => { 
      unsubLocations();
      unsubUsers(); 
      unsubTasks(); 
      unsubShortages(); 
      unsubAttendance(); 
      unsubSettings();
    };
  }, [logError]);

  const handleUpdateTaskStatus = async (id: string, status: TaskStatus, evidencePhotos?: {requirementId: string, title: string, data: string}[]) : Promise<string[]> => {
    const successfulUploadIds: string[] = [];
    
    try { 
      const taskRef = doc(db, 'tasks', id);
      const taskSnap = await getDoc(taskRef);
      
      if (!taskSnap.exists()) throw new Error("Tarefa não encontrada no sistema.");
      const currentTaskData = taskSnap.data() as Task;

      let updates: Partial<Task> = { status };
      
      if (status === 'CONCLUIDA' && currentTaskData.status !== 'CONCLUIDA') {
        updates.completedAt = Date.now();
        updates.archived = false; 
        
        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.id);
          updateDoc(userRef, { points: increment(1) }).catch(err => console.error("Erro ao dar pontos", err));
        }
      }

      const evidenceMap = new Map<string, TaskEvidence>();
      const existingEvidences: TaskEvidence[] = currentTaskData.evidences || [];
      existingEvidences.forEach(ev => evidenceMap.set(ev.requirementId, ev));

      if (evidencePhotos && evidencePhotos.length > 0) {
        const uploadPromises = evidencePhotos.map(async (photo) => {
          const fileName = `tasks/${id}/ev_${photo.requirementId}_${Date.now()}.jpg`;
          const storageRef = ref(storage, fileName);
          
          try {
            if (!photo.data.includes('base64,')) {
                console.warn(`Formato de imagem inválido para ${photo.title}`);
                throw new Error("Formato inválido");
            }

            await uploadString(storageRef, photo.data, 'data_url', { contentType: 'image/jpeg' });
            const url = await getDownloadURL(storageRef);
            
            successfulUploadIds.push(photo.requirementId);
            
            return { 
                success: true, 
                evidence: { requirementId: photo.requirementId, title: photo.title, url } as TaskEvidence 
            };
          } catch (storageError: any) {
            console.error(`Erro ao subir imagem ${photo.title}:`, storageError);
            alert(`Falha ao salvar a foto: "${photo.title}". Verifique sua conexão e tente novamente.`);
            return { success: false };
          }
        });

        const results = await Promise.all(uploadPromises);
        
        results.forEach(res => {
            if (res.success && res.evidence) {
                evidenceMap.set(res.evidence.requirementId, res.evidence);
            }
        });
        
        updates.evidences = Array.from(evidenceMap.values());
      }
      
      await updateDoc(taskRef, updates);
      
      return successfulUploadIds;

    } catch(e: any) { 
      console.error("Falha ao atualizar tarefa:", e);
      alert("Erro crítico ao salvar tarefa: " + e.message);
      return []; 
    }
  };

  const handleSaveLocation = async (location: BranchLocation) => {
    try {
      await setDoc(doc(db, 'locations', location.id), location);
    } catch (e: any) { alert("Erro ao salvar local: " + e.message); }
  };

  const handleDeleteLocation = async (id: string) => {
    try { await deleteDoc(doc(db, 'locations', id)); } catch (e: any) { alert("Erro ao deletar local: " + e.message); }
  };

  const handleUpdateCategories = async (newCategories: string[]) => {
    try {
      await setDoc(doc(db, 'settings', 'general'), { productCategories: newCategories }, { merge: true });
    } catch (e: any) {
      alert("Erro ao atualizar categorias: " + e.message);
    }
  };

  const handleAddTask = async (task: Task) => {
    try {
      if (task.recurrence.type === 'NENHUMA') {
        await addDoc(collection(db, 'tasks'), task);
      } else {
        const batch = writeBatch(db);
        const groupId = task.recurrence.groupId || safeRandomUUID();
        let currentStart = new Date(task.startDate);
        let currentEnd = new Date(task.endDate);
        const duration = task.endDate - task.startDate;

        const maxOccurrences = (() => {
          const daysPerOccurrence =
            task.recurrence.type === 'DIARIA'    ? 1  :
            task.recurrence.type === 'SEMANAL'   ? 7  :
            task.recurrence.type === 'QUINZENAL' ? 14 :
            task.recurrence.type === 'MENSAL'    ? 30 : 1;
          const horizon = task.recurrence.horizon ?? 30;
          return Math.min(100, Math.ceil(horizon / daysPerOccurrence));
        })();

        for (let i = 0; i < maxOccurrences; i++) {
          const newTask = {
            ...task,
            id: safeRandomUUID(),
            startDate: currentStart.getTime(),
            endDate: currentEnd.getTime(),
            recurrence: { ...task.recurrence, groupId }
          };
          batch.set(doc(collection(db, 'tasks'), newTask.id), newTask);

          if (task.recurrence.type === 'DIARIA') currentStart.setDate(currentStart.getDate() + 1);
          else if (task.recurrence.type === 'SEMANAL') currentStart.setDate(currentStart.getDate() + 7);
          else if (task.recurrence.type === 'QUINZENAL') currentStart.setDate(currentStart.getDate() + 14);
          else if (task.recurrence.type === 'MENSAL') currentStart.setMonth(currentStart.getMonth() + 1);
          
          currentEnd = new Date(currentStart.getTime() + duration);
        }
        await batch.commit();
      }
    } catch (e: any) { alert("Erro ao criar tarefa: " + e.message); }
  };

  const handleDeleteTask = async (taskId: string, deleteMode: 'SINGLE' | 'RECURRING') => {
    if (!currentUser?.permissions.canManageTasks) return alert("Permissão negada para excluir tarefas.");
    
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      
      if (deleteMode === 'SINGLE' || !task.recurrence || !task.recurrence.groupId) {
        await deleteDoc(doc(db, 'tasks', taskId));
      } else {
        const q = query(collection(db, 'tasks'), 
          where('recurrence.groupId', '==', task.recurrence.groupId)
        );
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        if (snap.empty) {
            await deleteDoc(doc(db, 'tasks', taskId));
        } else {
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
      }
    } catch (e: any) { 
        console.error(e);
        alert("Erro ao excluir: " + e.message); 
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (currentUser?.role !== 'MASTER' && currentUser?.role !== 'ADMIN') {
      alert("Apenas Administradores ou Master podem excluir usuários.");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), { active: false });
    } catch (e: any) {
      alert("Erro ao remover usuário: " + e.message);
    }
  };

  const handleDeleteShortage = async (shortageId: string) => {
    if (!currentUser?.permissions.canManageShortages) {
      alert("Você não tem permissão para gerenciar o estoque.");
      return;
    }
    if (!confirm("Tem certeza que deseja remover este item da lista de faltas?")) return;
    
    try {
      await deleteDoc(doc(db, 'shortages', shortageId));
    } catch (e: any) {
      alert("Erro ao excluir item: " + e.message);
    }
  };

  const handleDeleteAttendance = async (logId: string) => {
    if (currentUser?.role !== 'MASTER') {
      alert("Apenas o perfil MASTER pode excluir registros de ponto por motivos de segurança.");
      return;
    }
    if (!confirm("ATENÇÃO: Excluir um registro de ponto é uma ação irreversível. Deseja continuar?")) return;

    try {
      await deleteDoc(doc(db, 'pontos', logId));
    } catch (e: any) {
      alert("Erro ao excluir registro: " + e.message);
    }
  };

  const handleLogin = async (email: string, plainPassword: string, remember: boolean) => {
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.active);
    if (!user) { alert('Login inválido.'); return; }

    const isValid = await verifyPassword(plainPassword, user.password || '');
    if (!isValid) { alert('Login inválido.'); return; }

    // Migração on-the-fly: se senha ainda é texto puro, salva o hash
    const isLegacy = (user.password || '').length !== 64;
    if (isLegacy) {
      const hashed = await hashPassword(plainPassword);
      await updateDoc(doc(db, 'users', user.id), { password: hashed });
    }

    // Sessão segura com token
    if (remember) {
      const token = generateSessionToken();
      await updateDoc(doc(db, 'users', user.id), { sessionToken: token });
      localStorage.setItem('pdc_session', JSON.stringify({ email: email.toLowerCase(), sessionToken: token }));
    }

    setCurrentUser(user);
    setIsLoggedIn(true);
    setActiveTab(user.permissions.canManageTasks ? AppTab.BOARD : AppTab.ATTENDANCE);
  };

  if (isInitializing) return <div className="min-h-screen bg-amber-950 flex items-center justify-center flex-col gap-4 text-amber-200"><Beer className="animate-bounce w-12 h-12" /><p className="font-black text-xs uppercase tracking-widest">Sincronizando...</p></div>;
  if (!isLoggedIn || !currentUser) return <LoginView onLogin={handleLogin} />;

  return (
    <ToastProvider>
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-amber-950 text-white flex flex-col shadow-2xl transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between border-b border-amber-900">
          <div className="flex items-center gap-3"><Beer className="text-amber-400 w-8 h-8" /><h1 className="text-xl font-bold">Portão da Cerveja</h1></div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-amber-400"><X size={24} /></button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scroll-hide">
          {!isAttendanceLocked ? (
            <>
              {currentUser.permissions.canManageTasks && <button onClick={() => { setActiveTab(AppTab.BOARD); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.BOARD ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><ClipboardList size={22} /> <span>Tarefas</span></button>}
              <button onClick={() => { setActiveTab(AppTab.SHORTAGE); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.SHORTAGE ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><PackageSearch size={22} /> <span>Estoque</span></button>
              {(currentUser.permissions.canViewConferencia || currentUser.permissions.canManageConferencia || currentUser.role === 'ADMIN' || currentUser.role === 'MASTER') && <button onClick={() => { setActiveTab(AppTab.CONFERENCIA); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.CONFERENCIA ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><ClipboardList size={22} /> <span>Conferência</span></button>}
              {currentUser.permissions.canManageCash && <button onClick={() => { setActiveTab(AppTab.CASH); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.CASH ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><DollarSign size={22} /> <span>Caixa</span></button>}
              {currentUser.permissions.canRecordAttendance && <button onClick={() => { setActiveTab(AppTab.ATTENDANCE); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.ATTENDANCE ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><Clock size={22} /> <span>Ponto</span></button>}
              {currentUser.permissions.canViewReports && <button onClick={() => { setActiveTab(AppTab.REPORTS); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.REPORTS ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><Calendar size={22} /> <span>Gestão</span></button>}
              {currentUser.permissions.canViewReports && <button onClick={() => { setActiveTab(AppTab.FINANCIAL); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.FINANCIAL ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><PieChart size={22} /> <span>Financeiro</span></button>}
              <button onClick={() => { setActiveTab(AppTab.SCHEDULE); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.SCHEDULE ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><CalendarDays size={22} /> <span>Escala</span></button>
              {currentUser.permissions.canManageUsers && <button onClick={() => { setActiveTab(AppTab.USERS); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === AppTab.USERS ? 'bg-amber-600 shadow-lg' : 'hover:bg-amber-900/50 text-amber-100'}`}><UsersIcon size={22} /> <span>Equipe</span></button>}
            </>
          ) : (
             <button 
               onClick={() => { setActiveTab(AppTab.ATTENDANCE); setIsSidebarOpen(false); }}
               className="w-full bg-rose-500/20 p-4 rounded-2xl border border-rose-500/50 text-center space-y-2 hover:bg-rose-500/30 transition-colors cursor-pointer"
             >
                <Lock className="mx-auto text-rose-300 animate-pulse" size={32} />
                <p className="text-xs font-black uppercase text-rose-200">Acesso Restrito</p>
                <p className="text-[10px] text-amber-100/70 leading-tight">Clique aqui para registrar sua ENTRADA e liberar o sistema.</p>
             </button>
          )}
        </nav>
        
        <div className="p-4 border-t border-amber-900 bg-amber-950/50 space-y-3">
          {showInstallButton && (
            <button 
              onClick={handleInstallClick} 
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white text-amber-900 rounded-xl font-black uppercase text-xs shadow-md hover:bg-slate-100 transition-all animate-pulse"
            >
              <Download size={16} />
              Instalar App
            </button>
          )}

          <button onClick={() => { setActiveTab(AppTab.PROFILE); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === AppTab.PROFILE ? 'bg-amber-800' : 'hover:bg-amber-900/50'}`}>
            <div className="w-10 h-10 rounded-full bg-amber-500 overflow-hidden flex items-center justify-center font-bold border-2 border-amber-400 shrink-0">{currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover scale-x-[-1]" /> : currentUser.name[0]}</div>
            <div className="flex-1 text-left truncate">
              <p className="text-sm font-bold truncate">{currentUser.name}</p>
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-amber-400 font-medium uppercase">{currentUser.role === 'EMPLOYEE' ? 'Funcionário' : currentUser.role}</p>
                <span className="text-[10px] font-black bg-amber-900 px-1.5 rounded text-amber-200">★ {currentUser.points || 0}</span>
              </div>
            </div>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden overflow-y-auto flex flex-col w-full relative">
        <header className="bg-white h-16 border-b flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3"><button onClick={() => setIsSidebarOpen(true)} className="p-2 md:hidden text-slate-600"><Menu size={26} /></button><h2 className="text-sm md:text-lg font-black text-slate-800 uppercase tracking-tight">{activeTab.toUpperCase()}</h2></div>
          <button onClick={() => { localStorage.removeItem('pdc_session'); setIsLoggedIn(false); setCurrentUser(null); }} className="flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-all text-xs md:text-sm"><LogOut size={18} /> <span>Sair</span></button>
        </header>
        <div className="p-4 md:p-8 flex-1 w-full max-w-[100vw] flex flex-col min-h-full">
          <div className="flex-1">
            {activeTab === AppTab.BOARD && <KanbanBoard tasks={tasks} users={users} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask} onUpdateStatus={handleUpdateTaskStatus} currentUser={currentUser} />}
            {activeTab === AppTab.SHORTAGE && <ProductShortageComponent 
                shortages={shortages} 
                currentUser={currentUser} 
                categories={productCategories}
                onUpdateCategories={handleUpdateCategories}
                onAddShortage={(s) => addDoc(collection(db, 'shortages'), s)} 
                onUpdateShortage={(id, u) => updateDoc(doc(db, 'shortages', id), u)} 
                onDeleteShortage={handleDeleteShortage} 
            />}
            {activeTab === AppTab.CASH && <CashRegister currentUser={currentUser} />}
            {activeTab === AppTab.FINANCIAL && <FinancialReports users={users} />}
            {activeTab === AppTab.CONFERENCIA && <Conferencia currentUser={currentUser} />}
            {activeTab === AppTab.ATTENDANCE && <div className="max-w-4xl mx-auto space-y-8"><TimeClock currentUser={currentUser} locations={locations} lastEntry={userLastEntry} onPunch={(e) => addDoc(collection(db, 'pontos'), e)} onGoToProfile={() => setActiveTab(AppTab.PROFILE)} onRequestCashOpen={() => setActiveTab(AppTab.CASH)} /><div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm"><div className="p-6 border-b font-bold text-slate-800 flex items-center gap-2"><Clock size={18} className="text-amber-500" /> Registros de Ponto</div><AttendanceLog logs={attendance.filter(l => l.employeeId === currentUser.id)} /></div></div>}
            {activeTab === AppTab.REPORTS && <AttendanceReports logs={attendance} users={users} tasks={tasks} locations={locations} onSaveLocation={handleSaveLocation} onDeleteLocation={handleDeleteLocation} onDeleteAttendance={handleDeleteAttendance} versionInfo={versionData} currentUser={currentUser} />}
            {activeTab === AppTab.SCHEDULE && <ScheduleManager users={users} currentUser={currentUser} attendance={attendance} onUpdateUser={(u) => setDoc(doc(db, 'users', u.id), u)} />}
            {activeTab === AppTab.USERS && <UserManagement users={users} onUpdateUser={(u) => setDoc(doc(db, 'users', u.id), u)} onAddUser={(u) => setDoc(doc(db, 'users', u.id), u)} onDeleteUser={handleDeleteUser} />}
            {activeTab === AppTab.PROFILE && <UserProfile user={currentUser} tasks={tasks} onUpdateUser={(u) => setDoc(doc(db, 'users', u.id), u)} />}
          </div>
          <footer className="mt-12 py-6 border-t border-slate-200 flex flex-col items-center gap-1 opacity-40"><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Portão da Cerveja &copy; 2026</p><div className="flex items-center gap-2 text-[9px] font-bold text-amber-600 uppercase"><Cpu size={10} /><span>Versão {versionData.version}</span></div></footer>
        </div>
      </main>
    </div>
    </ToastProvider>
  );
};
export default App;
