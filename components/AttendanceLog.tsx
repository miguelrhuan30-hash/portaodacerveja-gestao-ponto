
import React from 'react';
import { MapPin, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { AttendanceEntry } from '../types';

interface AttendanceLogProps {
  logs: AttendanceEntry[];
}

const AttendanceLog: React.FC<AttendanceLogProps> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <p>Nenhum registro encontrado para hoje.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {logs.map((log) => (
        <div key={log.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-center gap-4 group">
          <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-slate-200 flex-shrink-0">
            <img src={log.photoUrl} className="w-full h-full object-cover scale-x-[-1]" alt="Selfie" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {/* Fix: changed 'IN' to 'ENTRADA' on line 29 to match types.ts definition */}
              <span className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${log.type === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {/* Fix: changed 'IN' to 'ENTRADA' on line 30 to match types.ts definition */}
                {log.type === 'ENTRADA' ? <ArrowUpRight size={10} /> : <ArrowDownLeft size={10} />}
                {/* Fix: changed 'IN' to 'ENTRADA' on line 31 to match types.ts definition */}
                {log.type === 'ENTRADA' ? 'Entrada' : 'Saída'}
              </span>
              <span className="text-sm font-bold text-slate-700">
                {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin size={10} />
              <span className="truncate">{log.location.address || 'Localização Verificada'}</span>
            </div>
          </div>

          <div className="hidden sm:block text-right flex-shrink-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">DATA</p>
            <p className="text-xs font-semibold text-slate-600">
              {new Date(log.timestamp).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AttendanceLog;
