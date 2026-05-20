import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Terminal, 
  Activity, 
  Database, 
  ShieldCheck, 
  AlertCircle, 
  RotateCcw, 
  Zap,
  CheckCircle2,
  Clock,
  Phone,
  MessageSquare
} from 'lucide-react';
import { Campaign } from '../types';
import { campaignService } from '../services/dataService';
import { toast } from 'sonner';

interface CampaignDebugModalProps {
  campaignId: string;
  onClose: () => void;
}

export default function CampaignDebugModal({ campaignId, onClose }: CampaignDebugModalProps) {
  const [debugData, setDebugData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [forcing, setForcing] = useState(false);

  const loadDebug = async () => {
    setLoading(true);
    try {
      const data = await campaignService.getDebug(campaignId);
      if (data.success) {
        setDebugData(data);
      } else {
        toast.error(data.error || 'Erro ao carregar diagnóstico');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao carregar diagnóstico');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDebug();
    const interval = setInterval(loadDebug, 5000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const handleForceProcess = async () => {
    setForcing(true);
    try {
      const res = await campaignService.processBatch(campaignId);
      if (res.success) {
        toast.success('Processamento disparado com sucesso');
        loadDebug();
      } else {
        toast.error(res.error || 'Erro ao disparar processamento');
      }
    } catch (err) {
      toast.error('Erro de rede ao disparar processamento');
    } finally {
      setForcing(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      const res = await campaignService.retryFailed(campaignId);
      if (res.success) {
        toast.success('Falhas reiniciadas');
        loadDebug();
      }
    } catch (err) {
      toast.error('Erro ao reiniciar falhas');
    }
  };

  if (!debugData && loading) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 text-indigo-600 animate-pulse" />
          <p className="font-black text-slate-800 text-sm uppercase tracking-widest">Iniciando Diagnóstico...</p>
        </div>
      </div>
    );
  }

  const campaign = debugData?.campaign;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-5xl bg-slate-950 text-emerald-400 rounded-[2.5rem] shadow-2xl border border-emerald-900/30 flex flex-col max-h-[90vh] overflow-hidden font-mono"
      >
        {/* Header */}
        <div className="p-8 border-b border-emerald-900/20 flex items-center justify-between shrink-0 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <Terminal className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-widest uppercase">System Analytics & Debug</h2>
              <p className="text-emerald-500/60 text-[10px] uppercase font-bold tracking-tighter mt-1">
                Campaign ID: {campaignId} • Status: {campaign?.status || 'N/A'} • {debugData?.systemTime}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-emerald-500/10 text-emerald-500 rounded-2xl transition-colors border border-emerald-500/10"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar space-y-8">
          
          {/* Top Row: Engine Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-emerald-900/20">
              <div className="flex items-center gap-3 mb-4">
                <Zap className={`w-5 h-5 ${debugData?.workerLock ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
                <h3 className="text-white font-black text-xs uppercase tracking-widest">Worker Engine</h3>
              </div>
              <p className="text-2xl font-black text-white uppercase tracking-tighter mb-1">
                {debugData?.workerLock ? 'LOCKED' : 'IDLE'}
              </p>
              <p className="text-[10px] text-emerald-500/50 uppercase font-bold">
                {debugData?.workerLock ? 'Processing batch in progress...' : 'Waiting for next interval cycle.'}
              </p>
            </div>

            <div className="bg-slate-900/50 p-6 rounded-3xl border border-emerald-900/20">
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-5 h-5 text-indigo-500" />
                <h3 className="text-white font-black text-xs uppercase tracking-widest">Database Stats</h3>
              </div>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-black text-white tracking-tight">{campaign?.sent_count || 0}</p>
                <p className="text-xs text-emerald-500/50 uppercase font-bold pb-1">Sent</p>
                <p className="text-2xl font-black text-rose-500 tracking-tight ml-4">{campaign?.failed_count || 0}</p>
                <p className="text-xs text-rose-500/50 uppercase font-bold pb-1">Failed</p>
              </div>
            </div>

            <div className="bg-slate-900/50 p-6 rounded-3xl border border-emerald-900/20">
              <div className="flex items-center gap-3 mb-4">
                <Activity className="w-5 h-5 text-emerald-500" />
                <h3 className="text-white font-black text-xs uppercase tracking-widest">Health Check</h3>
              </div>
              <div className="flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4 text-emerald-500" />
                 <span className="text-xs font-bold text-emerald-500">Z-API: Connected</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                 <Clock className="w-4 h-4 text-emerald-500" />
                 <span className="text-[10px] font-bold text-emerald-500/70">Interval: {campaign?.min_interval}-{campaign?.max_interval}s</span>
              </div>
            </div>
          </div>

          {/* Middle Row: Recent Activity & Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                   <Phone className="w-4 h-4" /> Recent Recipients Attempts
                </h3>
              </div>
              <div className="bg-slate-900/80 rounded-3xl border border-emerald-900/20 overflow-hidden">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="bg-emerald-900/10 border-b border-emerald-900/20">
                      <th className="px-4 py-3 font-black uppercase text-emerald-500/50">Recipient</th>
                      <th className="px-4 py-3 font-black uppercase text-emerald-500/50 text-center">Status</th>
                      <th className="px-4 py-3 font-black uppercase text-emerald-500/50 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-900/10">
                    {debugData?.recentRecipients?.map((r: any) => (
                      <tr key={r.id} className="hover:bg-emerald-500/5 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-white font-black">{r.name}</p>
                          <p className="text-[9px] text-emerald-500/40">{r.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-black text-[8px] uppercase ${
                            r.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-500' :
                            r.status === 'FAILED' ? 'bg-rose-500/10 text-rose-500' :
                            r.status === 'SENDING' ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-500/40">
                          {r.last_attempt_at ? new Date(r.last_attempt_at).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                 <AlertCircle className="w-4 h-4" /> System Events & Failures
              </h3>
              <div className="bg-slate-900/80 rounded-3xl border border-emerald-900/20 p-6 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar-emerald">
                {debugData?.recentEvents?.map((ev: any) => (
                  <div key={ev.id} className="border-l-2 border-emerald-800 pl-4 py-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{ev.event_type}</p>
                      <p className="text-[8px] text-emerald-500/40 uppercase">{new Date(ev.created_at).toLocaleString()}</p>
                    </div>
                    <p className="text-[11px] text-white/80 leading-relaxed">
                      {typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data)}
                    </p>
                  </div>
                ))}
                {!debugData?.recentEvents?.length && (
                  <div className="flex flex-col items-center justify-center py-12 text-emerald-500/20">
                    <Database className="w-12 h-12 mb-4" />
                    <p className="text-xs uppercase font-black">No events recorded yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t border-emerald-900/20 bg-slate-900/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 text-[10px] font-black text-emerald-500/40 uppercase tracking-widest">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
             Live Monitor Active
          </div>
          <div className="flex items-center gap-4">
             {campaign?.failed_count > 0 && (
               <button 
                 onClick={handleRetryFailed}
                 className="px-6 py-3 border border-emerald-500/30 text-emerald-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/5 transition-all flex items-center gap-2"
               >
                 <RotateCcw className="w-4 h-4" />
                 Reiniciar Falhas
               </button>
             )}
             <button 
              onClick={handleForceProcess}
              disabled={forcing || debugData?.workerLock}
              className="px-8 py-3 bg-emerald-500 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
             >
                {forcing ? 'Disparando...' : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    Forçar Processamento Imediato
                  </>
                )}
             </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
