
export type TaskStatus = 'A_FAZER' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'VENCIDA';
export type RecurrenceType = 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL';
export type ShortageUrgency = 'BAIXA' | 'MEDIA' | 'ALTA';
export type ShortageStatus = 'PENDENTE' | 'COMPRADO' | 'RECEBIDO';

export interface BranchLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; 
  address: string;
  active: boolean;
}

export interface CompanySettings {
  name: string;
  lat: number;
  lng: number;
  radius: number; 
  address: string;
}

export interface TaskPhotoRequirement {
  id: string;
  title: string;
}

export interface TaskEvidence {
  requirementId: string;
  title: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  archived?: boolean;
  completedAt?: number;
  requirePhoto: boolean;
  photoRequirements?: TaskPhotoRequirement[];
  evidences?: TaskEvidence[];
  
  // Agendamento tipo Google Calendar
  startDate: number; // Timestamp de início
  endDate: number;   // Timestamp de fim
  allDay: boolean;
  
  recurrence: {
    type: RecurrenceType;
    groupId?: string; // Para identificar tarefas que pertencem à mesma série
  };
  
  createdAt: number;
  assignedUserIds: string[];
}

export interface ProductShortage {
  id: string;
  productName: string;
  category: string;
  quantity: string;
  urgency: ShortageUrgency;
  status: ShortageStatus;
  requestedBy: string;
  requestedAt: number;
  notes?: string;
  archived?: boolean;
}

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'ENTRADA' | 'SAIDA';
  timestamp: number;
  dateStr?: string; // Data local YYYY-MM-DD para agrupamento
  photoUrl: string; // URL da selfie ou da evidência manual
  location: {
    lat: number;
    lng: number;
    address?: string;
    distanceFromBase?: number;
    locationName?: string;
  };
  // Campos para Saída Forçada (Gestão)
  isForced?: boolean;
  forcedBy?: string; // ID do gestor
  forcedReason?: string;
  evidenceUrl?: string; // URL da foto da câmera/comprovante
}

export interface DaySchedule {
  enabled: boolean; // Se false, é folga fixa (ex: Domingo)
  start: string; // "08:00"
  end: string;   // "17:00"
  breakDuration: number; // Minutos de intervalo (ex: 60)
}

export interface ScheduleException {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'OFF' | 'WORK' | 'COMPENSATION' | 'ABSENCE';
  note?: string; // Ex: "Troca de turno", "Feriado trabalhado"
  // Se for WORK ou COMPENSATION, define o horário específico desse dia:
  start?: string;
  end?: string;
  breakDuration?: number;
  
  isExtraShift?: boolean; // Se true, é pago à parte e ignora o banco de horas
  deductFromBank?: boolean; // Se true (e type=OFF), desconta as horas originais do banco
  originalDuration?: number; // Duração em horas que deveria ter sido trabalhada (para cálculo de débito)
  
  // Novos campos de rastreabilidade:
  linkedDate?: string; // A data original da folga ou compensação
  isDilutedCompensation?: boolean; // True se for horas picadas na semana

  // Novos campos de Falta:
  absenceType?: 'JUSTIFIED' | 'UNJUSTIFIED'; // Só preenchido se type === 'ABSENCE'
  absenceReason?: string; // Motivo (ex: "Doença", "Atraso", "Sem justificativa")
  attachmentUrl?: string; // URL da foto do atestado (para faltas justificadas)
}

export interface WorkSchedule {
  type: 'FLEXIBLE' | 'FIXED';
  
  // Se FLEXIBLE:
  dailyHours?: number; // Ex: 8h
  weeklyHours?: number; // Ex: 44h
  workDays?: number[]; // [0-6] (0=Domingo, 1=Segunda...)

  // Se FIXED:
  weekDayConfig?: Record<number, DaySchedule>; // 0 (Dom) a 6 (Sáb)
  monthlyExceptions?: ScheduleException[]; // Lista de exceções pontuais
  
  flexible?: boolean; // Mantido para retrocompatibilidade visual
}

export interface TimeBankTransaction {
  id: string;
  userId: string;
  date: number; // Timestamp
  amount: number; // Horas em decimal (ex: 1.5 ou -2.0)
  type: 'AUTO' | 'MANUAL_ADJUSTMENT' | 'PAYMENT';
  description: string; // Ex: "Hora extra do dia 15" ou "Desconto em folha"
  authorId: string; // Quem fez o ajuste
}

// Interface de Sessão de Caixa
export interface CashSession {
  id: string;
  userId: string;
  userName: string;
  openTime: number; // Timestamp
  closeTime?: number; // Timestamp
  openValue: number; // Fundo de caixa
  closeValue?: number; // Valor conferido no fechamento
  salesDiff?: number; // Diferença (Fechamento - Abertura)
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface PermissionSet {
  canManageTasks: boolean;
  canRecordAttendance: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageShortages: boolean;
  canManageCash: boolean; // Nova permissão
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  role: 'MASTER' | 'ADMIN' | 'EMPLOYEE';
  permissions: PermissionSet;
  active: boolean;
  weeklyHoursGoal?: number; // Deprecated em favor de workSchedule
  workSchedule?: WorkSchedule;
  timeBankBalance?: number; // Saldo atual acumulado (em horas decimais)
  bankBalance?: number; // Saldo em minutos (backup/precisão)
  points: number;
}

export enum AppTab {
  BOARD = 'tarefas',
  ATTENDANCE = 'ponto',
  REPORTS = 'gestao',
  USERS = 'equipe',
  PROFILE = 'perfil',
  SHORTAGE = 'estoque',
  SCHEDULE = 'escala',
  CASH = 'caixa',
  FINANCIAL = 'financeiro'
}
