
import React, { useState, useRef, useEffect } from 'react';
import { Camera, MapPin, CheckCircle2, RefreshCw, Clock, AlertTriangle, ArrowRight, ScanFace, ShieldCheck, X, Satellite, RotateCcw, Map as MapIcon, ExternalLink, Ruler, LogOut, LogIn, Lock } from 'lucide-react';
import { AttendanceEntry, SystemUser, BranchLocation } from '../types';
import { safeRandomUUID } from '../utils/crypto';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

interface TimeClockProps {
  currentUser: SystemUser;
  locations: BranchLocation[];
  lastEntry: AttendanceEntry | null;
  onPunch: (entry: AttendanceEntry) => void;
  onGoToProfile: () => void;
  onRequestCashOpen?: () => void; // Callback para redirecionar para o caixa
}

const TimeClock: React.FC<TimeClockProps> = ({ currentUser, locations, lastEntry, onPunch, onGoToProfile, onRequestCashOpen }) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); 
  const [minDistance, setMinDistance] = useState<number | null>(null);
  const [nearestLocation, setNearestLocation] = useState<BranchLocation | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMsg, setErrorMsg] = useState('');
  const [analysisSteps, setAnalysisSteps] = useState<string>('');
  const [watchId, setWatchId] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  // Estado para duração do turno atual
  const [currentShiftDuration, setCurrentShiftDuration] = useState<string>('00:00');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Timer para atualizar duração do turno se estiver aberto
  useEffect(() => {
    let interval: any;
    if (lastEntry && lastEntry.type === 'ENTRADA') {
      const updateTimer = () => {
        const now = Date.now();
        const diff = now - lastEntry.timestamp;
        const hours   = Math.floor(diff / 3_600_000);
        const minutes = Math.floor((diff % 3_600_000) / 60_000);
        const seconds = Math.floor((diff % 60_000) / 1_000);
        setCurrentShiftDuration(
          `${hours.toString().padStart(2, '0')}h ` +
          `${minutes.toString().padStart(2, '0')}m ` +
          `${seconds.toString().padStart(2, '0')}s`
        );
      };
      updateTimer();
      interval = setInterval(updateTimer, 30_000);
    } else {
      setCurrentShiftDuration('00:00');
    }
    return () => clearInterval(interval);
  }, [lastEntry]);

  // Função Auxiliar para Data Local (Evita bug de UTC)
  const getLocalDateString = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset*60*1000));
    return localDate.toISOString().split('T')[0];
  };

  // Função Haversine blindada
  const calculateDistance = (lat1: any, lon1: any, lat2: any, lon2: any) => {
    const nLat1 = Number(lat1);
    const nLon1 = Number(lon1);
    const nLat2 = Number(lat2);
    const nLon2 = Number(lon2);

    const R = 6371e3; 
    const φ1 = nLat1 * Math.PI / 180;
    const φ2 = nLat2 * Math.PI / 180;
    const Δφ = (nLat2 - nLat1) * Math.PI / 180;
    const Δλ = (nLon2 - nLon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
  };

  const startGPS = () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    
    setGpsAccuracy(null);
    setCurrentPos(null);
    setErrorMsg('');

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentPos(p);
        setGpsAccuracy(pos.coords.accuracy);
        
        let minD = Infinity;
        let nearestLoc = null;

        if (locations.length > 0) {
          locations.forEach(loc => {
            const d = calculateDistance(p.lat, p.lng, loc.lat, loc.lng);
            if (d < minD) {
              minD = d;
              nearestLoc = loc;
            }
          });
          setMinDistance(minD);
          setNearestLocation(nearestLoc);
        }
      },
      (err) => {
        console.error("Erro GPS:", err);
        let msg = "Erro desconhecido no GPS.";
        if (err.code === 1) msg = "Permissão de localização negada.";
        else if (err.code === 2) msg = "Sinal de GPS indisponível.";
        else if (err.code === 3) msg = "Tempo limite do GPS esgotado.";
        setErrorMsg(msg);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
    setWatchId(id);
  };

  useEffect(() => {
    startGPS();
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, [locations]);

  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user", width: 480, height: 480 } 
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Câmera bloqueada. Verifique as permissões.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        const video = videoRef.current;
        const size = Math.min(video.videoWidth, video.videoHeight);
        canvasRef.current.width = 400;
        canvasRef.current.height = 400;
        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;
        context.drawImage(video, startX, startY, size, size, 0, 0, 400, 400);
        setPhoto(canvasRef.current.toDataURL('image/jpeg', 0.8));
        stopCamera();
      }
    }
  };

  const getBase64FromUrl = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const analyzeImage = async (base64Image: string): Promise<{ isHuman: boolean; confidence: number; details: string }> => {
    const response = await fetch('/api/analyze-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('Muitas tentativas. Aguarde 1 minuto.');
      throw new Error('Falha na análise biométrica');
    }

    return response.json();
  };

  const handlePunch = async () => {
    if (!photo) return;
    
    // Define o tipo baseado no último registro (passado via prop)
    const punchType = (!lastEntry || lastEntry.type === 'SAIDA') ? 'ENTRADA' : 'SAIDA';

    if (!nearestLocation || (minDistance !== null && minDistance > nearestLocation.radius)) {
      setStatus('ERROR');
      setErrorMsg(`Distância inválida: ${Math.round(minDistance || 0)}m.`);
      setShowDebug(true);
      return;
    }

    // --- BLOQUEIO DE CAIXA (NOVO) ---
    // Se for SAIDA e o usuário tiver permissão de caixa, verificar se há sessão aberta
    if (punchType === 'SAIDA' && currentUser.permissions.canManageCash) {
       setStatus('PROCESSING');
       setAnalysisSteps("Verificando caixa...");
       
       const q = query(
          collection(db, 'cash_sessions'),
          where('userId', '==', currentUser.id),
          where('status', '==', 'OPEN')
       );
       const snapshot = await getDocs(q);
       
       if (!snapshot.empty) {
          setStatus('ERROR');
          setErrorMsg("CAIXA ABERTO! Feche o caixa antes de sair.");
          if (confirm("⚠️ Você possui um caixa aberto! É necessário realizar o fechamento do caixa antes de bater a saída.\n\nDeseja ir para o fechamento agora?")) {
             onRequestCashOpen?.();
          }
          setPhoto(null);
          return;
       }
    }

    setStatus('PROCESSING');
    setAnalysisSteps("Validando identidade...");
    try {
      const analysis = await analyzeImage(photo);
      if (!analysis.isHuman) {
        setStatus('ERROR');
        setErrorMsg(analysis.details || "Rosto não reconhecido.");
        setTimeout(() => { setStatus('IDLE'); setPhoto(null); }, 4000);
        return;
      }
    } catch (err: any) {
      setStatus('ERROR');
      setErrorMsg(err.message || "Falha na biometria. Tente novamente.");
      setTimeout(() => { setStatus('IDLE'); setPhoto(null); }, 4000);
      return;
    }

    onPunch({
      id: safeRandomUUID(),
      employeeId: currentUser.id,
      employeeName: currentUser.name,
      type: punchType,
      timestamp: Date.now(),
      dateStr: getLocalDateString(), // Data local formatada YYYY-MM-DD
      photoUrl: photo,
      location: { 
        lat: currentPos?.lat || 0, 
        lng: currentPos?.lng || 0, 
        address: nearestLocation.address,
        distanceFromBase: minDistance || 0,
        locationName: nearestLocation.name
      }
    });
    
    setStatus('SUCCESS');
    
    // Feedback e Redirecionamento Pós-Entrada para Operadores de Caixa
    if (punchType === 'ENTRADA' && currentUser.permissions.canManageCash) {
       setTimeout(() => {
          if(confirm("Ponto registrado. Deseja realizar a abertura do caixa agora?")) {
             onRequestCashOpen?.();
          }
          setStatus('IDLE'); setPhoto(null);
       }, 1000);
    } else {
       setTimeout(() => { setStatus('IDLE'); setPhoto(null); }, 3000);
    }
  };

  const isLocationValid = nearestLocation && minDistance !== null && minDistance <= nearestLocation.radius;
  
  // Determina qual botão mostrar baseado no estado
  const nextAction = (!lastEntry || lastEntry.type === 'SAIDA') ? 'ENTRADA' : 'SAIDA';

  if (!currentUser.avatar) {
    return (
      <div className="bg-white p-10 rounded-[2rem] border-2 border-dashed border-rose-200 text-center space-y-4">
        <ScanFace size={48} className="mx-auto text-rose-400" />
        <h3 className="text-xl font-bold">Biometria Pendente</h3>
        <p className="text-slate-500 text-sm">Você precisa cadastrar seu rosto no perfil antes de bater o ponto.</p>
        <button onClick={onGoToProfile} className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-900/10">Cadastrar Agora</button>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-xl border border-amber-100 flex flex-col md:flex-row gap-8">
      <div className="flex-1 flex flex-col items-center">
        <div className="relative w-64 h-64 bg-slate-900 rounded-[2.5rem] overflow-hidden border-4 border-amber-500 shadow-lg">
          {!photo && !isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <ScanFace size={40} className="text-amber-500 mb-4" />
              <button onClick={startCamera} className="bg-amber-600 px-6 py-2 rounded-xl font-bold text-xs uppercase shadow-lg">Abrir Câmera</button>
            </div>
          )}
          
          {isCameraActive && (
            <div className="absolute inset-0">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              <button onClick={capture} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white w-14 h-14 rounded-full border-4 border-amber-500 flex items-center justify-center shadow-2xl active:scale-90 transition-transform">
                <div className="w-8 h-8 bg-amber-600 rounded-full"></div>
              </button>
            </div>
          )}

          {photo && !isCameraActive && status === 'IDLE' && (
            <div className="absolute inset-0">
              <img src={photo} className="w-full h-full object-cover scale-x-[-1]" />
              <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full"><X size={14}/></button>
            </div>
          )}

          {status === 'PROCESSING' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-white text-center p-4">
              <RefreshCw className="animate-spin text-amber-500 mb-3" size={40} />
              <p className="font-bold text-sm uppercase tracking-widest">{analysisSteps}</p>
            </div>
          )}

          {status === 'SUCCESS' && (
            <div className="absolute inset-0 bg-emerald-600 flex flex-col items-center justify-center text-white animate-in zoom-in">
              <CheckCircle2 size={50} />
              <p className="mt-2 font-black uppercase text-center px-4 leading-tight">
                {nextAction === 'SAIDA' ? 'Saída Registrada!' : 'Bem-vindo!'}
                <br/><span className="text-[10px] font-normal">{nearestLocation?.name}</span>
              </p>
            </div>
          )}

          {status === 'ERROR' && (
            <div className="absolute inset-0 bg-rose-600 flex flex-col items-center justify-center text-white p-4 text-center">
              <AlertTriangle size={40} className="mb-2" />
              <p className="font-bold text-xs uppercase leading-tight">{errorMsg}</p>
              <button onClick={() => {setStatus('IDLE'); setPhoto(null);}} className="mt-3 bg-white/20 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase">Tentar Novamente</button>
            </div>
          )}
        </div>
        
        {/* Status do Turno */}
        {lastEntry && lastEntry.type === 'ENTRADA' && (
           <div className="mt-4 bg-emerald-50 text-emerald-800 px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 border border-emerald-100 animate-pulse">
              <Clock size={16}/> Turno em andamento: {currentShiftDuration}
           </div>
        )}
      </div>

      <div className="flex-1 space-y-6 flex flex-col justify-center">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
              {currentUser.avatar && <img src={currentUser.avatar} className="w-14 h-14 rounded-2xl border-2 border-amber-500 object-cover scale-x-[-1] shadow-md" />}
              <div>
                 <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Colaborador</p>
                 <h3 className="text-xl font-black text-slate-800">{currentUser.name}</h3>
              </div>
           </div>
           <button onClick={startGPS} className="p-3 bg-slate-100 rounded-xl text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Forçar Atualização GPS">
              <RotateCcw size={20} />
           </button>
        </div>

        <div className={`p-4 rounded-2xl border relative overflow-hidden transition-colors ${!isLocationValid ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
          <div className="flex items-start gap-3 relative z-10">
            <MapPin size={24} className="shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase opacity-70 mb-1">Status de Localização</p>
              
              {locations.length === 0 ? (
                <p className="text-lg font-black text-rose-600">Nenhum ponto configurado</p>
              ) : (
                <>
                  <p className="text-lg font-black truncate">{nearestLocation ? nearestLocation.name : 'Calculando...'}</p>
                  
                  <div className="flex items-center gap-4 mt-2 text-xs font-bold flex-wrap">
                     <span className="flex items-center gap-1"><ArrowRight size={12}/> Distância: {minDistance !== null ? Math.round(minDistance) : '...'}m</span>
                     <span className="flex items-center gap-1"><Satellite size={12}/> Precisão GPS: +/- {gpsAccuracy ? Math.round(gpsAccuracy) : '...'}m</span>
                  </div>

                  {nearestLocation && (
                     <div className="mt-2 text-[10px] font-black uppercase tracking-widest opacity-60 flex gap-2">
                        <span className="flex items-center gap-1"><Ruler size={10}/> Raio Permitido: {nearestLocation.radius}m</span>
                     </div>
                  )}
                  
                  {minDistance !== null && nearestLocation && minDistance > nearestLocation.radius && (
                     <div className="mt-3 space-y-2">
                       <p className="text-[10px] font-black bg-rose-200/50 p-2 rounded-lg text-rose-900 inline-block">
                          Você está {Math.round(minDistance - nearestLocation.radius)}m fora do raio permitido.
                       </p>
                       <div className="flex gap-2">
                         <button 
                           onClick={() => setShowDebug(!showDebug)} 
                           className="text-[10px] font-bold underline flex items-center gap-1"
                         >
                            {showDebug ? 'Ocultar Detalhes Técnicos' : 'Por que isso está acontecendo?'}
                         </button>
                       </div>
                     </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Painel de Diagnóstico Técnico */}
        {showDebug && currentPos && nearestLocation && (
          <div className="bg-slate-100 p-4 rounded-2xl text-[10px] font-mono space-y-2 animate-in zoom-in-95 border border-slate-200">
             <div className="flex justify-between items-center border-b border-slate-200 pb-1">
                <span className="font-bold">MEU DISPOSITIVO (GPS):</span>
                <span>{currentPos.lat.toFixed(5)}, {currentPos.lng.toFixed(5)}</span>
             </div>
             <div className="flex justify-between items-center border-b border-slate-200 pb-1 text-emerald-700">
                <span className="font-bold">LOCAL CADASTRADO:</span>
                <span>{Number(nearestLocation.lat).toFixed(5)}, {Number(nearestLocation.lng).toFixed(5)}</span>
             </div>
             {(Math.abs(currentPos.lat - nearestLocation.lat) > 10 || Math.abs(currentPos.lng - nearestLocation.lng) > 10) && (
                <div className="bg-amber-100 text-amber-800 p-2 rounded-lg font-bold">
                   <AlertTriangle size={12} className="inline mr-1"/>
                   ALERTA: Diferença geográfica detectada. Verifique os sinais (+/-) das coordenadas.
                </div>
             )}
          </div>
        )}

        {/* Botão Único Contextual */}
        <button 
          disabled={!photo || status !== 'IDLE' || !isLocationValid} 
          onClick={handlePunch} 
          className={`w-full py-5 rounded-2xl font-black text-xl shadow-xl disabled:opacity-20 active:scale-95 transition-all flex items-center justify-center gap-3 ${
            nextAction === 'ENTRADA' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-rose-600 text-white hover:bg-rose-700'
          }`}
        >
           {nextAction === 'ENTRADA' ? <LogIn size={24}/> : <LogOut size={24}/>}
           {nextAction === 'ENTRADA' ? 'REGISTRAR ENTRADA' : 'REGISTRAR SAÍDA'}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default TimeClock;
