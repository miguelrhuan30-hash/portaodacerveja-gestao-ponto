
import React, { useState, useEffect } from 'react';
import { RefreshCw, Trash2, AlertTriangle } from 'lucide-react';

const SystemUpdater: React.FC = () => {
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detecção simples de iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);
  }, []);

  const handleForceUpdate = async () => {
    const confirm = window.confirm(
      "Isso vai apagar os dados temporários e baixar a versão mais recente do sistema. Continuar?"
    );

    if (!confirm) return;

    try {
      // 1. Desregistrar Service Workers (Matar a versão antiga)
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // 2. Limpar Cache Storage (Limpar arquivos antigos)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }

      // 3. Forçar Reload do Servidor (Ignorando cache)
      window.location.reload();
      
    } catch (error) {
      console.error("Erro ao atualizar:", error);
      alert("Erro ao limpar cache. Tente fechar e abrir o app novamente.");
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 max-w-md mx-auto w-full">
      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
        <RefreshCw size={16} className="text-blue-600"/> Diagnóstico e Atualização
      </h3>
      <p className="text-xs text-slate-500 mb-3 font-medium">
        Se o sistema estiver apresentando falhas ou não mostrar as novas funções, force uma atualização manual.
      </p>
      
      <button
        onClick={handleForceUpdate}
        className="w-full bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-black py-3 px-4 rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-95"
      >
        <Trash2 size={16} /> Limpar Cache e Atualizar Agora
      </button>

      {isIOS && (
        <div className="mt-3 flex items-start gap-2 text-xs text-orange-700 bg-orange-50 p-3 rounded-xl border border-orange-100">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p className="font-medium leading-relaxed">
            No iPhone, após clicar acima, pode ser necessário <strong>fechar o app completamente</strong> (arrastar para cima no multitarefa) e abrir de novo para aplicar as mudanças.
          </p>
        </div>
      )}
    </div>
  );
};

export default SystemUpdater;
