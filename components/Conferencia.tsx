import React, { useState, useEffect, useRef } from 'react';
import { ClipboardList, Plus, FileSpreadsheet, UploadCloud, Search, CheckCircle2, Circle, ArrowLeft, X, Download, Trash2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { SystemUser, StockConference, StockProduct } from '../types';
import * as XLSX from 'xlsx';

interface ConferenciaProps {
  currentUser: SystemUser;
}

type ScreenState = 'HOME' | 'UPLOAD' | 'LIST' | 'COUNT';

const parseCSV = (text: string) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(';')
    .map(h => h.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ';' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(r => r['Código'] && r['Nome']);
};

const exportExcel = (conference: StockConference) => {
  const rows = conference.products.map(p => ({
    Categoria: p.Categoria,
    'Código': p['Código'],
    Nome: p.Nome,
    Quantidade: p.Quantidade,
    Medida: p.Medida,
    'Movimentação': p.mov !== '' ? Number(p.mov) : '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 32 }, { wch: 8 }, { wch: 58 },
    { wch: 12 }, { wch: 10 }, { wch: 14 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conferência');
  XLSX.writeFile(wb, `conferencia_${conference.name.replace(/\s+/g, '_')}.xlsx`);
};

const Conferencia: React.FC<ConferenciaProps> = ({ currentUser }) => {
  const [screen, setScreen] = useState<ScreenState>('HOME');
  const [conferences, setConferences] = useState<StockConference[]>([]);
  const [selectedConference, setSelectedConference] = useState<StockConference | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [selectedProductIndex, setSelectedProductIndex] = useState<number>(-1);

  // Upload State
  const [uploadName, setUploadName] = useState('');
  const [parsedProducts, setParsedProducts] = useState<StockProduct[]>([]);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Count State
  const [countValue, setCountValue] = useState('');

  const canManage = currentUser.role === 'MASTER' || currentUser.role === 'ADMIN' || !!currentUser.permissions.canManageConferencia;
  const canView = canManage || !!currentUser.permissions.canViewConferencia;

  useEffect(() => {
    if (!canView) return;
    const q = query(collection(db, 'stock_conferences'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StockConference));
      setConferences(data);
      
      if (selectedConference) {
        const updated = data.find(c => c.id === selectedConference.id);
        if (updated) setSelectedConference(updated);
      }
    });
    return () => unsub();
  }, [canView, selectedConference?.id]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const data = parseCSV(text);
        if (data.length === 0) {
          setUploadError('Arquivo vazio ou formato inválido.');
          return;
        }
        const products: StockProduct[] = data.map(d => ({
          Categoria: d['Categoria'] || 'Sem Categoria',
          Código: d['Código'] || '',
          Nome: d['Nome'] || '',
          Quantidade: d['Quantidade'] || '0',
          Medida: d['Medida'] || '',
          mov: '',
          done: false
        }));
        setParsedProducts(products);
      } catch (err) {
        setUploadError('Erro ao processar o arquivo.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const createConference = async () => {
    if (!uploadName.trim() || parsedProducts.length === 0) return;
    try {
      const newConf = {
        name: uploadName.trim(),
        createdAt: Date.now(),
        createdBy: currentUser.id,
        products: parsedProducts,
        totalItems: parsedProducts.length,
        doneItems: 0,
        status: 'pending'
      };
      await addDoc(collection(db, 'stock_conferences'), newConf);
      setScreen('HOME');
      setUploadName('');
      setParsedProducts([]);
    } catch (err) {
      console.error(err);
      alert('Erro ao criar conferência.');
    }
  };

  const deleteConference = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conferência?')) return;
    try {
      await deleteDoc(doc(db, 'stock_conferences', id));
      if (selectedConference?.id === id) {
        setScreen('HOME');
        setSelectedConference(null);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir conferência.');
    }
  };

  const saveCount = async () => {
    if (!selectedConference || !selectedProduct || countValue === '') return;
    
    const newProducts = [...selectedConference.products];
    newProducts[selectedProductIndex] = {
      ...selectedProduct,
      mov: countValue,
      done: true
    };

    const doneItems = newProducts.filter(p => p.done).length;
    const status = doneItems === newProducts.length ? 'done' : 'pending';

    try {
      await updateDoc(doc(db, 'stock_conferences', selectedConference.id), {
        products: newProducts,
        doneItems,
        status
      });
      setScreen('LIST');
      setCountValue('');
      setSelectedProduct(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar contagem.');
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-slate-500">
        Você não tem permissão para acessar este módulo.
      </div>
    );
  }

  if (screen === 'HOME') {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="text-amber-600" />
              Conferência de Estoque
            </h3>
            <p className="text-slate-500">Gerencie e execute contagens de inventário.</p>
          </div>
          {canManage && (
            <button 
              onClick={() => {
                setUploadName('');
                setParsedProducts([]);
                setUploadError('');
                setScreen('UPLOAD');
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Nova Conferência</span>
            </button>
          )}
        </div>

        {conferences.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <FileSpreadsheet size={40} className="text-slate-300" />
            </div>
            <h4 className="text-lg font-bold text-slate-700 mb-2">Nenhuma conferência</h4>
            <p className="text-slate-500 mb-6 max-w-md">
              Crie uma nova conferência importando um arquivo CSV do seu sistema de gestão.
            </p>
            {canManage && (
              <button 
                onClick={() => setScreen('UPLOAD')}
                className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-6 py-3 rounded-xl font-bold transition-all"
              >
                Criar Primeira Conferência
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {conferences.map(conf => {
              const pct = conf.totalItems > 0 ? Math.round((conf.doneItems / conf.totalItems) * 100) : 0;
              return (
                <div key={conf.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-amber-400 transition-all shadow-sm flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-slate-800 line-clamp-2 flex-1 pr-2">{conf.name}</h4>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase shrink-0 ${conf.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {conf.status === 'done' ? 'Concluída' : 'Pendente'}
                    </span>
                  </div>
                  
                  <p className="text-xs text-slate-500 mb-4">
                    Criada em {new Date(conf.createdAt).toLocaleDateString('pt-BR')}
                  </p>

                  <div className="mt-auto space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>{conf.doneItems} / {conf.totalItems} itens</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${conf.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
                    <button 
                      onClick={() => {
                        setSelectedConference(conf);
                        setScreen('LIST');
                      }}
                      className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 py-2 rounded-xl text-xs font-bold transition-colors"
                    >
                      Abrir
                    </button>
                    {canManage && conf.status === 'done' && (
                      <button 
                        onClick={() => exportExcel(conf)}
                        className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-colors"
                        title="Exportar Excel"
                      >
                        <Download size={18} />
                      </button>
                    )}
                    {canManage && (
                      <button 
                        onClick={() => deleteConference(conf.id)}
                        className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (screen === 'UPLOAD') {
    const categories = Array.from(new Set(parsedProducts.map(p => p.Categoria)));
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
        <div className="flex items-center gap-4">
          <button onClick={() => setScreen('HOME')} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-50">
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-xl font-bold text-slate-800">Nova Conferência</h3>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Nome da Conferência</label>
            <input 
              type="text" 
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              placeholder="Ex: Inventário Geral - Março 2024"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Arquivo CSV</label>
            <div 
              className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={40} className="mx-auto text-slate-400 mb-3" />
              <p className="font-bold text-slate-700 mb-1">Clique para selecionar o arquivo</p>
              <p className="text-xs text-slate-500">Formato esperado: CSV separado por ponto e vírgula (;)</p>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
            </div>
            {uploadError && (
              <p className="text-rose-500 text-xs font-bold mt-2 flex items-center gap-1">
                <AlertCircle size={14} /> {uploadError}
              </p>
            )}
          </div>

          {parsedProducts.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <h4 className="font-bold text-emerald-800 flex items-center gap-2 mb-2">
                <CheckCircle2 size={18} /> Arquivo processado com sucesso!
              </h4>
              <p className="text-sm text-emerald-700 mb-4">
                Encontrados <strong>{parsedProducts.length}</strong> produtos em <strong>{categories.length}</strong> categorias.
              </p>
              
              <div className="bg-white rounded-lg border border-emerald-100 overflow-hidden">
                <div className="bg-emerald-100/50 px-3 py-2 text-xs font-bold text-emerald-800 border-b border-emerald-100">
                  Prévia dos primeiros registros:
                </div>
                <div className="divide-y divide-emerald-50">
                  {parsedProducts.slice(0, 5).map((p, i) => (
                    <div key={i} className="px-3 py-2 text-xs flex justify-between">
                      <span className="text-slate-600 truncate pr-2">{p.Nome}</span>
                      <span className="text-slate-400 font-mono shrink-0">{p['Código']}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={createConference}
            disabled={!uploadName.trim() || parsedProducts.length === 0}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-4 rounded-xl font-black shadow-lg transition-all"
          >
            CRIAR CONFERÊNCIA
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'LIST' && selectedConference) {
    const pct = selectedConference.totalItems > 0 ? Math.round((selectedConference.doneItems / selectedConference.totalItems) * 100) : 0;
    
    let filtered = selectedConference.products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.Nome.toLowerCase().includes(q) || 
        p['Código'].toLowerCase().includes(q) || 
        p.Categoria.toLowerCase().includes(q)
      );
    }
    if (filterStatus === 'PENDING') filtered = filtered.filter(p => !p.done);
    if (filterStatus === 'DONE') filtered = filtered.filter(p => p.done);

    // Agrupar por categoria
    const grouped: Record<string, typeof filtered> = {};
    filtered.forEach((p, originalIndex) => {
      if (!grouped[p.Categoria]) grouped[p.Categoria] = [];
      // Precisamos manter o índice original para poder atualizar o produto correto no array
      const actualIndex = selectedConference.products.findIndex(op => op['Código'] === p['Código'] && op.Nome === p.Nome);
      grouped[p.Categoria].push({ ...p, _originalIndex: actualIndex } as any);
    });

    const toggleCategory = (cat: string) => {
      setExpandedCategories(prev => ({ ...prev, [cat]: prev[cat] === undefined ? false : !prev[cat] }));
    };

    return (
      <div className="space-y-4 animate-in fade-in pb-20">
        {/* Header Fixo */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  setScreen('HOME');
                  setSelectedConference(null);
                }} 
                className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 text-slate-600"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h3 className="font-bold text-slate-800 leading-tight">{selectedConference.name}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {selectedConference.doneItems} / {selectedConference.totalItems} ({pct}%)
                </p>
              </div>
            </div>
            {canManage && selectedConference.status === 'done' && (
              <button 
                onClick={() => exportExcel(selectedConference)}
                className="bg-emerald-100 text-emerald-700 p-2 rounded-xl hover:bg-emerald-200 transition-colors"
                title="Exportar Excel"
              >
                <Download size={20} />
              </button>
            )}
          </div>
          
          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-4 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${selectedConference.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar produto..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
              {(['ALL', 'PENDING', 'DONE'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${filterStatus === f ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {f === 'ALL' ? 'Todos' : f === 'PENDING' ? 'Pendentes' : 'Feitos'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista Agrupada */}
        <div className="space-y-3">
          {Object.entries(grouped).map(([category, prods]) => {
            const isExpanded = expandedCategories[category] !== false; // default true
            const catTotal = selectedConference.products.filter(p => p.Categoria === category).length;
            const catDone = selectedConference.products.filter(p => p.Categoria === category && p.done).length;
            const catPct = catTotal > 0 ? Math.round((catDone / catTotal) * 100) : 0;

            return (
              <div key={category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <button 
                  onClick={() => toggleCategory(category)}
                  className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                    <span className="font-bold text-slate-700 text-sm">{category}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">{catDone}/{catTotal}</span>
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${catPct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${catPct}%` }} />
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-slate-100">
                    {prods.map((p: any) => (
                      <div 
                        key={p['Código']} 
                        onClick={() => {
                          setSelectedProduct(p);
                          setSelectedProductIndex(p._originalIndex);
                          setCountValue(p.done ? p.mov : '');
                          setScreen('COUNT');
                        }}
                        className={`p-4 flex items-center gap-3 cursor-pointer transition-colors ${p.done ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                      >
                        <div className="shrink-0">
                          {p.done ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Circle size={24} className="text-slate-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className={`font-bold text-sm truncate ${p.done ? 'text-slate-800' : 'text-slate-700'}`}>{p.Nome}</h5>
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mt-0.5">
                            <span className="text-slate-400 font-mono">{p['Código']}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-500">Sis: {p.Quantidade} {p.Medida}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {p.done ? (
                            <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg font-black text-sm">
                              {p.mov}
                            </div>
                          ) : (
                            <span className="text-amber-600 text-[10px] font-black uppercase flex items-center gap-1">
                              Tocar <ChevronRight size={12} />
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {Object.keys(grouped).length === 0 && (
            <div className="text-center p-8 text-slate-400 text-sm">
              Nenhum produto encontrado com os filtros atuais.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'COUNT' && selectedProduct) {
    const sysQty = parseFloat(selectedProduct.Quantidade.replace(',', '.')) || 0;
    const countNum = parseFloat(countValue.replace(',', '.')) || 0;
    const diff = countValue !== '' ? countNum - sysQty : 0;

    return (
      <div className="max-w-md mx-auto space-y-4 animate-in slide-in-from-right-4">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setScreen('LIST')} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-50">
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-xl font-bold text-slate-800">Registrar Contagem</h3>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="mb-6">
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-md">
              {selectedProduct.Categoria}
            </span>
            <h4 className="text-lg font-bold text-slate-800 mt-2 leading-tight">{selectedProduct.Nome}</h4>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">{selectedProduct['Código']}</span>
              <span className="text-slate-500">Sistema: <strong className="text-slate-700">{selectedProduct.Quantidade} {selectedProduct.Medida}</strong></span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="relative">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block text-center">Quantidade Física Contada</label>
              <input 
                type="number" 
                step="0.01"
                value={countValue}
                onChange={e => setCountValue(e.target.value)}
                className="w-full text-center text-[44px] font-black text-slate-800 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-amber-500 focus:bg-white transition-all"
                placeholder="0"
                autoFocus
              />
              {countValue !== '' && (
                <div className={`text-center mt-2 text-sm font-bold ${diff >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  Diferença: {diff > 0 ? '+' : ''}{diff.toFixed(2).replace('.', ',')}
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[1, 5, 10, 20, 50, 100].map(val => (
                <button
                  key={val}
                  onClick={() => {
                    const current = parseFloat(countValue) || 0;
                    setCountValue((current + val).toString());
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm transition-colors"
                >
                  +{val}
                </button>
              ))}
              <button
                onClick={() => setCountValue('0')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm transition-colors"
              >
                Zero
              </button>
              <button
                onClick={() => setCountValue('')}
                className="bg-rose-50 hover:bg-rose-100 text-rose-600 py-3 rounded-xl font-bold text-sm transition-colors"
              >
                <X size={16} className="mx-auto" />
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setScreen('LIST')}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={saveCount}
                disabled={countValue === ''}
                className="flex-[2] bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-4 rounded-xl font-black shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={20} /> Salvar Contagem
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Conferencia;
