import React, { useMemo, useState } from 'react';
import { SystemUser, AttendanceEntry, Task } from '../types';
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Star, Users, Calendar } from 'lucide-react';

interface DashboardProps {
  users: SystemUser[];
  attendance: AttendanceEntry[];
  tasks: Task[];
  currentUser: SystemUser;
}

type Period = 'WEEK' | 'MONTH' | 'CUSTOM';

const Dashboard: React.FC<DashboardProps> = ({ users, attendance, tasks, currentUser }) => {
  const [period, setPeriod] = useState<Period>('MONTH');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (period === 'WEEK') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0,0,0,0);
      return { startDate: start.getTime(), endDate: now.getTime() };
    }
    if (period === 'MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.getTime(), endDate: now.getTime() };
    }
    return {
      startDate: customStart ? new Date(customStart).getTime() : 0,
      endDate: customEnd ? new Date(customEnd + 'T23:59:59').getTime() : now.getTime(),
    };
  }, [period, customStart, customEnd]);

  const activeUsers = useMemo(() =>
    currentUser.role === 'EMPLOYEE'
      ? users.filter(u => u.id === currentUser.id && u.active)
      : users.filter(u => u.active),
    [users, currentUser]
  );

  const kpis = useMemo(() => {
    const periodAttendance = attendance.filter(l => l.timestamp >= startDate && l.timestamp <= endDate);
    const periodTasks = tasks.filter(t => t.completedAt && t.completedAt >= startDate && t.completedAt <= endDate);

    const logsByUser = new Map<string, AttendanceEntry[]>();
    for (const l of periodAttendance) {
      const arr = logsByUser.get(l.employeeId);
      if (arr) arr.push(l); else logsByUser.set(l.employeeId, [l]);
    }

    const taskCountByUser = new Map<string, number>();
    for (const t of periodTasks) {
      for (const uid of t.assignedUserIds) {
        taskCountByUser.set(uid, (taskCountByUser.get(uid) ?? 0) + 1);
      }
    }

    const totalDays = Math.ceil((endDate - startDate) / 86_400_000);
    const workDays = Math.ceil(totalDays * 5 / 7);

    return activeUsers.map(user => {
      const userLogs = logsByUser.get(user.id) ?? [];
      const entries = userLogs.filter(l => l.type === 'ENTRADA').sort((a,b) => a.timestamp - b.timestamp);
      const exits   = userLogs.filter(l => l.type === 'SAIDA').sort((a,b) => a.timestamp - b.timestamp);
      let hoursWorked = 0;
      entries.forEach((entry, i) => {
        const exit = exits[i];
        if (exit) hoursWorked += (exit.timestamp - entry.timestamp) / 3_600_000;
      });
      const workedDays = new Set(userLogs.map(l => l.dateStr || new Date(l.timestamp).toDateString())).size;
      const absences = Math.max(0, workDays - workedDays);
      const punctuality = workedDays > 0 ? Math.round((workedDays / Math.max(workDays, 1)) * 100) : 0;
      return {
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        hoursWorked: Math.round(hoursWorked * 10) / 10,
        tasksCompleted: taskCountByUser.get(user.id) ?? 0,
        absences,
        points: user.points || 0,
        punctualityRate: punctuality,
        workedDays,
      };
    }).sort((a, b) => b.points - a.points);
  }, [activeUsers, attendance, tasks, startDate, endDate]);

  const totals = useMemo(() => ({
    hours: Math.round(kpis.reduce((s, k) => s + k.hoursWorked, 0) * 10) / 10,
    tasks: kpis.reduce((s, k) => s + k.tasksCompleted, 0),
    absences: kpis.reduce((s, k) => s + k.absences, 0),
  }), [kpis]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-slate-600 flex items-center gap-1">
          <Calendar size={15}/> Período
        </span>
        {(['WEEK','MONTH','CUSTOM'] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${
              period === p ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {p === 'WEEK' ? 'Esta semana' : p === 'MONTH' ? 'Este mês' : 'Personalizado'}
          </button>
        ))}
        {period === 'CUSTOM' && (
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="border rounded-xl px-3 py-1 text-xs"/>
            <span className="text-slate-400 text-xs">até</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="border rounded-xl px-3 py-1 text-xs"/>
          </div>
        )}
      </div>

      {currentUser.role !== 'EMPLOYEE' && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: <Clock size={20} className="text-blue-500"/>, label: 'Horas totais', value: `${totals.hours}h` },
            { icon: <CheckCircle2 size={20} className="text-emerald-500"/>, label: 'Tarefas concluídas', value: totals.tasks },
            { icon: <AlertCircle size={20} className="text-rose-500"/>, label: 'Faltas estimadas', value: totals.absences },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-2xl border p-5 flex flex-col items-center gap-1">
              {item.icon}
              <span className="text-2xl font-bold text-slate-800">{item.value}</span>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Users size={14}/> Colaboradores
        </h3>
        {kpis.length === 0 && (
          <div className="bg-white rounded-2xl border p-8 text-center text-slate-400 text-sm">
            Nenhum dado no período selecionado.
          </div>
        )}
        {kpis.map((kpi, i) => (
          <div key={kpi.userId} className="bg-white rounded-2xl border p-5 flex flex-wrap gap-4 items-center">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-black text-amber-700 text-sm shrink-0">
              {i + 1}
            </div>
            <div className="flex items-center gap-3 flex-1 min-w-[140px]">
              <div className="w-10 h-10 rounded-full bg-amber-500 overflow-hidden flex items-center justify-center font-bold text-white border-2 border-amber-300 shrink-0">
                {kpi.avatar ? <img src={kpi.avatar} className="w-full h-full object-cover" alt=""/> : kpi.name[0]}
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{kpi.name}</p>
                <p className="text-xs text-slate-400">{kpi.workedDays} dias trabalhados</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              {[
                { icon: <Clock size={13} className="text-blue-400"/>, label: 'Horas', value: `${kpi.hoursWorked}h` },
                { icon: <CheckCircle2 size={13} className="text-emerald-400"/>, label: 'Tarefas', value: kpi.tasksCompleted },
                { icon: <AlertCircle size={13} className="text-rose-400"/>, label: 'Faltas', value: kpi.absences },
                { icon: <TrendingUp size={13} className="text-violet-400"/>, label: 'Pontualidade', value: `${kpi.punctualityRate}%` },
                { icon: <Star size={13} className="text-amber-400"/>, label: 'Pontos', value: kpi.points, highlight: true },
              ].map(k => (
                <div key={k.label} className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl ${k.highlight ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-1">
                    {k.icon}
                    <span className={`text-sm font-black ${k.highlight ? 'text-amber-600' : 'text-slate-700'}`}>{k.value}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
