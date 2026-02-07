
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
  photoUrl: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
    distanceFromBase?: number;
    locationName?: string;
  };
}

export interface PermissionSet {
  canManageTasks: boolean;
  canRecordAttendance: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageShortages: boolean;
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
  weeklyHoursGoal?: number;
}

export enum AppTab {
  BOARD = 'tarefas',
  ATTENDANCE = 'ponto',
  REPORTS = 'gestao',
  USERS = 'equipe',
  PROFILE = 'perfil',
  SHORTAGE = 'estoque'
}
