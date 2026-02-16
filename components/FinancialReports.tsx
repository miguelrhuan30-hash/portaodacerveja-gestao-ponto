
import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, User, TrendingDown, TrendingUp, Search, AlertCircle } from 'lucide-react';
import { CashSession, SystemUser } from '../types';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';

interface FinancialReportsProps {
  users: SystemUser[];
}

const FinancialReports: React.FC<FinancialReportsProps> = ({ users }) => {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchSessions();
  }, [selectedUser, dateFilter]);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      // Data inicial e final para filtro (00:00 as 23:59)
      const start = new Date(dateFilter);
      start.setHours(0,0,0,0);
      const end = new Date(dateFilter);
      end.setHours(23,59,59,999);

      let q = query(
        collection(db, 'cash_sessions'),
        where('openTime', '>=', start.getTime()),
        where('openTime', '<=', end.getTime()),
        orderBy('openTime', 'desc')
      );

      if (selectedUser !== 'ALL') {
        q = query(q, where('userId', '==', selectedUser));
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashSession));
      setSessions(data);
    } catch (error) {
      console.error("Erro ao buscar relatórios financeiros:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalSales = sessions.reduce((acc, s) => acc + (s.salesDiff || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2rem] border shadow-sm">
         <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Relatório de Caixa</h2>
            <p className="text-slate-500 text-sm">Auditoria de aberturas e fechamentos.</p>
         </div>
         
         <div className="flex gap-2 bg-slate-50 p-2 rounded-xl border">
            <input 
              type="date" 
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-700 outline-none text-sm"
            />
            <div className="w-px bg-slate-200 h-6 mx-2"/>
            <select 
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="bg-transparent font-bold text-slate-700 outline-none text-sm"
            >
               <option value="ALL">Todos Operadores</option>
               {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className={`p-6 rounded-[2rem] border shadow-sm ${totalSales >= 0 ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'}`}>
            <p className="text-emerald-100 text-xs font-black uppercase tracking-widest mb-1">Saldo do Dia (Vendas)</p>
            <h3 className="text-4xl font-black text-white">R$ {totalSales.toFixed(2)}</h3>
         </div>
         <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Total de Sessões</p>
            <h3 className="text-4xl font-black text-slate-800">{sessions.length}</h3>
         </div>
      </div>

      <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
               <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400 tracking-widest">
                  <tr>
                     <th className="px-6 py-4">Status / Operador</th>
                     <th className="px-6 py-4">Abertura</th>
                     <th className="px-6 py-4">Fechamento</th>
                     <th className="px-6 py-4">Fundo Inicial</th>
                     <th className="px-6 py-4">Total Gaveta</th>
                     <th className="px-6 py-4">Saldo (Vendas)</th>
                     <th className="px-6 py-4">Obs</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                     <tr><td colSpan={7} className="p-8 text-center text-slate-400">Carregando...</td></tr>
                  ) : sessions.length === 0 ? (
                     <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">Nenhum registro encontrado para esta data.</td></tr>
                  ) : (
                     sessions.map(session => (
                        <tr key={session.id} className="hover:bg-slate-50">
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                 <div className={`w-2 h-2 rounded-full ${session.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}/>
                                 <div>
                                    <p className="font-bold text-slate-800">{session.userName}</p>
                                    <p className="text-[9px] text-slate-400 uppercase">{session.status === 'OPEN' ? 'EM ABERTO' : 'FECHADO'}</p>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-4 font-mono text-slate-600">
                              {new Date(session.openTime).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                           </td>
                           <td className="px-6 py-4 font-mono text-slate-600">
                              {session.closeTime ? new Date(session.closeTime).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '-'}
                           </td>
                           <td className="px-6 py-4 text-slate-500">R$ {session.openValue.toFixed(2)}</td>
                           <td className="px-6 py-4 font-bold text-slate-700">{session.closeValue ? `R$ ${session.closeValue.toFixed(2)}` : '-'}</td>
                           <td className="px-6 py-4">
                              {session.status === 'CLOSED' ? (
                                 <span className={`font-black px-2 py-1 rounded ${session.salesDiff! < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    R$ {session.salesDiff!.toFixed(2)}
                                 </span>
                              ) : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="px-6 py-4 max-w-xs truncate text-slate-500" title={session.notes}>
                              {session.notes || '-'}
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default FinancialReports;
