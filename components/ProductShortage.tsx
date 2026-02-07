
import React, { useState } from 'react';
import { PackageSearch, Plus, Clock, CheckCircle2, ShoppingCart, AlertTriangle, Filter, X, ChevronDown, User, Tag } from 'lucide-react';
import { ProductShortage, ShortageUrgency, ShortageStatus, SystemUser } from '../types';

interface ProductShortageProps {
  shortages: ProductShortage[];
  currentUser: SystemUser;
  onAddShortage: (shortage: ProductShortage) => void;
  onUpdateShortage: (id: string, updates: Partial<ProductShortage>) => void;
}

const ProductShortageComponent: React.FC<ProductShortageProps> = ({ shortages, currentUser, onAddShortage, onUpdateShortage }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ShortageStatus | 'ALL'>('ALL');
  const [newShortage, setNewShortage] = useState({
    productName: '',
    category: 'Insumos',
    quantity: '',
    urgency: 'MEDIA' as ShortageUrgency,
    notes: ''
  });

  const categories = ['Insumos', 'Embalagens', 'Limpeza', 'Escritório', 'Manutenção', 'Outros'];

  const filteredShortages = shortages.filter(s => filterStatus === 'ALL' || s.status === filterStatus);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortage.productName || !newShortage.quantity) {
      alert("Nome do produto e quantidade são obrigatórios.");
      return;
    }

    onAddShortage({
      id: Math.random().toString(36).substr(2, 9),
      ...newShortage,
      status: 'PENDENTE',
      requestedBy: currentUser.name,
      requestedAt: Date.now()
    });

    setNewShortage({
      productName: '',
      category: 'Insumos',
      quantity: '',
      urgency: 'MEDIA',
      notes: ''
    });
    setShowAddModal(false);
  };

  const getUrgencyColor = (urgency: ShortageUrgency) => {
    switch (urgency) {
      case 'ALTA': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'MEDIA': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'BAIXA': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const getStatusBadge = (status: any) => {
    // Mapeamento de compatibilidade para dados legados
    const currentStatus = status === 'PENDING' ? 'PENDENTE' : 
                          status === 'ORDERED' ? 'COMPRADO' : 
                          status === 'RECEIVED' ? 'RECEBIDO' : status;

    switch (currentStatus) {
      case 'PENDENTE': return { icon: <Clock size={12} />, text: 'Pendente', class: 'bg-slate-100 text-slate-600' };
      case 'COMPRADO': return { icon: <ShoppingCart size={12} />, text: 'Comprado', class: 'bg-blue-100 text-blue-600' };
      case 'RECEBIDO': return { icon: <CheckCircle2 size={12} />, text: 'Recebido', class: 'bg-emerald-100 text-emerald-600' };
      default: return { icon: <AlertTriangle size={12} />, text: 'Desconhecido', class: 'bg-slate-200 text-slate-400' };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex bg-slate-200/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
          {(['ALL', 'PENDENTE', 'COMPRADO', 'RECEBIDO'] as const).map(status => (
            <button 
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${filterStatus === status ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {status === 'ALL' ? 'Tudo' : status === 'PENDENTE' ? 'Pendentes' : status === 'COMPRADO' ? 'Comprados' : 'Recebidos'}
            </button>
          ))}
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-amber-900/10 transition-all active:scale-95"
        >
          <Plus size={20} />
          Reportar Falta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredShortages.map(shortage => {
          const statusBadge = getStatusBadge(shortage.status);
          return (
            <div key={shortage.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:border-amber-400 transition-all">
              <div className="p-6 space-y-4 flex-1">
                <div className="flex justify-between items-start">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${getUrgencyColor(shortage.urgency)}`}>
                    {shortage.urgency === 'ALTA' ? 'Crítico' : shortage.urgency === 'MEDIA' ? 'Médio' : 'Baixo'}
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${statusBadge?.class || 'bg-slate-100 text-slate-400'}`}>
                    {statusBadge?.icon}
                    {statusBadge?.text}
                  </div>
                </div>

                <div>
                  <h4 className="text-xl font-black text-slate-800 group-hover:text-amber-700 transition-colors leading-tight">{shortage.productName}</h4>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1 mt-1">
                    <Tag size={12} /> {shortage.category} • {shortage.quantity}
                  </p>
                </div>

                {shortage.notes && (
                  <p className="text-sm text-slate-600 italic bg-slate-50 p-3 rounded-xl">"{shortage.notes}"</p>
                )}

                <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                    {shortage.requestedBy[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{shortage.requestedBy}</p>
                    <p className="text-[10px] text-slate-400">{new Date(shortage.requestedAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              </div>

              {currentUser.permissions.canManageShortages && shortage.status !== 'RECEBIDO' && (
                <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-2">
                  {shortage.status === 'PENDENTE' && (
                    <button 
                      onClick={() => onUpdateShortage(shortage.id, { status: 'COMPRADO' })}
                      className="col-span-2 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                    >
                      <ShoppingCart size={14} /> MARCAR COMO COMPRADO
                    </button>
                  )}
                  {shortage.status === 'COMPRADO' && (
                    <button 
                      onClick={() => onUpdateShortage(shortage.id, { status: 'RECEBIDO' })}
                      className="col-span-2 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"
                    >
                      <CheckCircle2 size={14} /> MARCAR COMO RECEBIDO
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredShortages.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <PackageSearch size={32} />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Nenhuma demanda registrada</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-amber-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black">Reportar Falta</h3>
                <p className="text-amber-100 text-sm opacity-80">Avise o gestor sobre o que está faltando.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-amber-500 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Produto em Falta</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Malte Pilsen, Detergente Alcalino..." 
                    value={newShortage.productName} 
                    onChange={e => setNewShortage({...newShortage, productName: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 placeholder:text-slate-400 font-bold" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Categoria</label>
                    <select 
                      value={newShortage.category} 
                      onChange={e => setNewShortage({...newShortage, category: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-sm text-slate-900 font-bold"
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Quantidade aprox.</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 50kg, 12 fardos..." 
                      value={newShortage.quantity} 
                      onChange={e => setNewShortage({...newShortage, quantity: e.target.value})} 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 placeholder:text-slate-400 font-bold" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Urgência</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['BAIXA', 'MEDIA', 'ALTA'] as const).map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setNewShortage({...newShortage, urgency: u})}
                        className={`py-3 rounded-xl text-xs font-black uppercase transition-all border ${
                          newShortage.urgency === u 
                            ? (u === 'ALTA' ? 'bg-rose-600 border-rose-600 text-white' : u === 'MEDIA' ? 'bg-amber-600 border-amber-600 text-white' : 'bg-blue-600 border-blue-600 text-white')
                            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {u === 'ALTA' ? 'Crítica' : u === 'MEDIA' ? 'Média' : 'Baixa'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Observações (Opcional)</label>
                  <textarea 
                    placeholder="Motivo da falta ou link do fornecedor..." 
                    value={newShortage.notes} 
                    onChange={e => setNewShortage({...newShortage, notes: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none h-24 resize-none text-slate-900 placeholder:text-slate-400 font-bold" 
                  />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-amber-900/10 hover:bg-amber-700 transition-all flex items-center justify-center gap-2"
                >
                  <PackageSearch size={22} />
                  Enviar Demanda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductShortageComponent;
