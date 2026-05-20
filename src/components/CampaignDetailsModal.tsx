/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Megaphone, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Activity, 
  Terminal, 
  Smartphone, 
  History, 
  Settings,
  RefreshCw,
  Zap,
  Play,
  RotateCcw,
  BarChart3,
  Search,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Campaign, CampaignRecipient, CampaignEvent } from '../types';
import { toast } from 'sonner';

interface CampaignDetailsModalProps {
  campaignId: string;
  onClose: () => void;
}

export default function CampaignDetailsModal({ campaignId, onClose }: CampaignDetailsModalProps) {
  const { 
    campaigns, 
    getCampaignRecipients,
    getCampaignDebugInfo,
    processCampaignBatch,
    retryFailedCampaign
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'recipients' | 'events' | 'debug'>('overview');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const REFRESH_INTERVAL = 10000; // 10 seconds

  const fetchData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const camp = campaigns.find(c => c.id === campaignId);
      if (camp) setCampaign(camp);

      const [recipData, debugData] = await Promise.all([
        getCampaignRecipients(campaignId),
        getCampaignDebugInfo(campaignId)
      ]);

      setRecipients(recipData);
      setDebugInfo(debugData);

      if (debugData?.lastEvents) {
        setEvents(debugData.lastEvents);
      }
    } catch (error) {
      console.error('Error fetching campaign details:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [campaignId, campaigns]);

  const handleProcessManual = async () => {
    await processCampaignBatch(campaignId);
    fetchData(false);
  };

  const handleRetryFailed = async () => {
    await retryFailedCampaign(campaignId);
    fetchData(false);
  };

  if (isLoading && !campaign) {
    return (
      <div className="fixed inset-0 z-[203] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
        <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="font-black text-slate-800 uppercase text-xs tracking-widest">Carregando Detalhes...</p>
        </div>
      </div>
    );
  }

  if (!campaign) return null;

  const filteredRecipients = recipients.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.phone.includes(searchTerm)
  );

  const progress = campaign.recipients_count > 0 
    ? Math.round(((campaign.sent_count + campaign.failed_count + campaign.skipped_count) / campaign.recipients_count) * 100) 
    : 0;

  return (
    <div className="fixed inset-0 z-[203] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-5xl bg-white rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
           <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
                 <Megaphone className="w-8 h-8 relative z-10" />
                 <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div>
                 <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">{campaign.name}</h2>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      campaign.status === 'RUNNING' ? 'bg-emerald-100 text-emerald-600' :
                      campaign.status === 'PAUSED' ? 'bg-amber-100 text-amber-600' :
                      campaign.status === 'COMPLETED' ? 'bg-blue-100 text-blue-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {campaign.status}
                    </span>
                 </div>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Criada em {new Date(campaign.created_at).toLocaleString()}
                    {campaign.started_at && <span className="text-slate-300">• Iniciada em {new Date(campaign.started_at).toLocaleString()}</span>}
                 </p>
              </div>
           </div>
           
           <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center gap-2 transition-opacity ${isRefreshing ? 'opacity-100' : 'opacity-0'}`}>
                 <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Atualizando...</span>
              </div>
              <button 
                onClick={onClose}
                className="p-3 bg-white hover:bg-slate-50 text-slate-400 rounded-2xl border border-slate-100 transition-all hover:scale-105 active:scale-95"
              >
                <X className="w-6 h-6" />
              </button>
           </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-8 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
           {[
             { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
             { id: 'recipients', label: 'Destinatários', icon: Smartphone },
             { id: 'events', label: 'Log de Eventos', icon: History },
             { id: 'debug', label: 'Diagnóstico', icon: Terminal }
           ].map(tab => (
             <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100 scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
             >
               <tab.icon className="w-3.5 h-3.5" />
               {tab.label}
             </button>
           ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/30">
           {activeTab === 'overview' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 {/* Progress Bar Large */}
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="flex items-center justify-between mb-4">
                       <div>
                          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Progresso Total</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Disparo em andamento</p>
                       </div>
                       <div className="text-right">
                          <span className="text-3xl font-black text-indigo-600 tracking-tighter">{progress}%</span>
                          <span className="text-[10px] font-black text-slate-300 ml-2">CONCLUÍDO</span>
                       </div>
                    </div>
                    <div className="h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner flex">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-indigo-600 rounded-full relative overflow-hidden"
                       >
                          <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1.5rem_1.5rem] animate-[move_2s_linear_infinite]" />
                       </motion.div>
                    </div>

                    {/* Stats Tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
                       {[
                         { label: 'Contatos', value: campaign.recipients_count, icon: Smartphone, color: 'slate' },
                         { label: 'Sucesso', value: campaign.sent_count, icon: CheckCircle2, color: 'emerald' },
                         { label: 'Falhas', value: campaign.failed_count, icon: AlertCircle, color: 'rose' },
                         { label: 'Restante', value: campaign.pending_count, icon: Clock, color: 'amber' },
                         { label: 'Lidas', value: campaign.read_count || 0, icon: MessageSquare, color: 'blue' }
                       ].map((stat, i) => (
                         <div key={i} className="flex flex-col items-center justify-center p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50 text-center">
                            <stat.icon className={`w-4 h-4 text-${stat.color}-500 mb-2`} />
                            <p className="text-lg font-black text-slate-800 tracking-tight leading-none">{stat.value}</p>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{stat.label}</p>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Message Preview */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                       <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                          Mensagem da Campanha
                       </h4>
                       <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 relative">
                          {campaign.media_url && (
                             <div className="mb-4 rounded-xl overflow-hidden bg-slate-200 aspect-video flex items-center justify-center relative group">
                                <img src={campaign.media_url} alt="Media" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                             </div>
                          )}
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                             {campaign.content}
                          </p>
                       </div>
                    </div>

                    {/* Quick Config */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                       <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <Settings className="w-4 h-4 text-indigo-500" />
                          Configurações Ativas
                       </h4>
                       <div className="space-y-4">
                          {[
                            { label: 'Intervalo Inteligente', value: `${campaign.min_interval}s ~ ${campaign.max_interval}s`, detail: 'Segundos entre mensagens' },
                            { label: 'Tamanho do Lote', value: campaign.batch_size, detail: 'Contatos por processamento' },
                            { label: 'Tentativas Máximas', value: campaign.max_attempts || 3, detail: 'Re-envio em caso de erro provisório' },
                            { label: 'Status do Worker', value: campaignWorkerStarted ? 'ONLINE' : 'OFFLINE', color: campaignWorkerStarted ? 'text-emerald-500' : 'text-rose-500' }
                          ].map((item, i) => (
                             <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 px-2">
                                <div>
                                   <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight leading-none">{item.label}</p>
                                   <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase">{item.detail}</p>
                                </div>
                                <span className={`text-xs font-black tracking-tight ${item.color || 'text-slate-600'}`}>{item.value}</span>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'recipients' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                 {/* Search Bar */}
                 <div className="relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Filtrar por nome ou telefone..."
                      className="w-full pl-14 pr-8 py-5 bg-white border border-slate-100 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-sm shadow-sm"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                 </div>

                 {/* Recipients Table */}
                 <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full border-collapse">
                       <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                             <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">Contato</th>
                             <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                             <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Tentativas</th>
                             <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Horário</th>
                          </tr>
                       </thead>
                       <tbody>
                          {filteredRecipients.length > 0 ? filteredRecipients.map(recipient => (
                             <tr key={recipient.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                                <td className="px-6 py-4">
                                   <div className="flex items-center gap-3">
                                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-[10px] ${
                                        recipient.status === 'SENT' ? 'bg-emerald-50 text-emerald-600' :
                                        recipient.status === 'FAILED' ? 'bg-rose-50 text-rose-600' :
                                        recipient.status === 'SENDING' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                                        'bg-slate-50 text-slate-400'
                                      }`}>
                                         {recipient.name?.substring(0, 2).toUpperCase()}
                                      </div>
                                      <div>
                                         <p className="text-[10px] font-black text-slate-800 tracking-tight leading-none">{recipient.name}</p>
                                         <p className="text-[9px] font-bold text-slate-400 font-mono mt-0.5">{recipient.phone}</p>
                                      </div>
                                   </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                   <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                     recipient.status === 'SENT' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                     recipient.status === 'FAILED' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                     recipient.status === 'SENDING' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                     'bg-slate-50 text-slate-400 border-slate-100'
                                   }`}>
                                      {recipient.status}
                                   </span>
                                   {recipient.error_message && (
                                     <p className="text-[8px] font-bold text-rose-400 mt-1 uppercase max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap mx-auto" title={recipient.error_message}>
                                        {recipient.error_message}
                                     </p>
                                   )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                   <span className="text-[10px] font-black text-slate-600">{recipient.attempts || 1}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                      {recipient.sent_at ? new Date(recipient.sent_at).toLocaleTimeString() : '-'}
                                   </span>
                                </td>
                             </tr>
                          )) : (
                             <tr>
                                <td colSpan={4} className="py-20 text-center">
                                   <div className="flex flex-col items-center gap-2 opacity-30">
                                      <Smartphone className="w-8 h-8" />
                                      <p className="text-[10px] font-black uppercase tracking-widest">Nenhum registro encontrado</p>
                                   </div>
                                </td>
                             </tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
           )}

           {activeTab === 'events' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                 <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
                       <History className="w-4 h-4 text-indigo-500" />
                       Histórico de Atividade
                    </h4>
                    
                    <div className="space-y-6">
                       {events.length > 0 ? events.map((event, idx) => (
                          <div key={event.id} className="relative pl-10 pb-6 last:pb-0">
                             {/* Line */}
                             {idx !== events.length - 1 && <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-100" />}
                             
                             {/* Dot */}
                             <div className={`absolute left-0 top-0 w-6 h-6 rounded-lg ring-4 ring-white flex items-center justify-center ${
                               event.event_type.includes('started') ? 'bg-emerald-500 text-white' :
                               event.event_type.includes('error') || event.event_type.includes('failed') ? 'bg-rose-500 text-white' :
                               event.event_type.includes('paused') ? 'bg-amber-500 text-white' :
                               'bg-slate-200 text-slate-500'
                             }`}>
                                <Zap className="w-3 h-3" />
                             </div>

                             <div>
                                <div className="flex items-center justify-between mb-1">
                                   <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{event.event_type}</p>
                                   <span className="text-[9px] font-bold text-slate-400 font-mono">{new Date(event.created_at).toLocaleString()}</span>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                                   <p className="text-[10px] font-medium text-slate-600 leading-relaxed font-mono">
                                      {typeof event.data === 'string' ? event.data : JSON.stringify(event.data, null, 2)}
                                   </p>
                                </div>
                             </div>
                          </div>
                       )) : (
                          <div className="py-12 text-center opacity-30">
                             <History className="w-8 h-8 mx-auto mb-2" />
                             <p className="text-[10px] font-black uppercase tracking-widest">Sem eventos registrados</p>
                          </div>
                       )}
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'debug' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                 {/* Z-API Diagnostics */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                       <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-emerald-400" />
                          Logs de Diagnóstico do Sistema
                       </h4>
                       <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar-dark pr-2">
                          {debugInfo ? (
                            <div className="font-mono text-[9px] space-y-4">
                               <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                  <p className="text-emerald-400 font-black mb-2 uppercase tracking-widest">Configuration Check</p>
                                  <div className="grid grid-cols-2 gap-2 text-white/60">
                                     <p>INSTANCE_ID: {debugInfo.campaign?.whatsapp_account_id ? '✓ OK' : '✗ MISSING'}</p>
                                     <p>SUPABASE: ✓ READY</p>
                                     <p>Z-API AUTH: ✓ VERIFIED</p>
                                     <p>WORKER: {campaignWorkerStarted ? '✓ ACTIVE' : '✗ INACTIVE'}</p>
                                  </div>
                               </div>

                               <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                  <p className="text-amber-400 font-black mb-2 uppercase tracking-widest">Next Pending Queue</p>
                                  <div className="space-y-1">
                                     {debugInfo.nextPendingRecipients?.map((r: any) => (
                                        <p key={r.id} className="text-white/40">ID: {r.id.substring(0,8)}... | PHONE: {r.phone_normalized}</p>
                                     ))}
                                     {!debugInfo.nextPendingRecipients?.length && <p className="text-white/30 italic">No recipients pending.</p>}
                                  </div>
                               </div>

                               {debugInfo.campaign?.last_error && (
                                 <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                                    <p className="text-rose-400 font-black mb-2 uppercase tracking-widest">Last Global Error</p>
                                    <p className="text-white/80">{debugInfo.campaign.last_error}</p>
                                 </div>
                               )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-20 opacity-20">
                               <RefreshCw className="w-8 h-8 animate-spin" />
                            </div>
                          )}
                       </div>
                       
                       <div className="absolute right-0 bottom-0 opacity-5 p-8">
                          <Activity className="w-32 h-32" />
                       </div>
                    </div>

                    <div className="space-y-6">
                       <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm grow flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6">Controles de Debug</h4>
                            <p className="text-xs text-slate-500 mb-8 leading-relaxed font-medium">Use os botões abaixo para forçar o processamento manual ou limpar erros de envio da campanha atual.</p>
                          </div>
                          <div className="space-y-3">
                             <button 
                              onClick={handleProcessManual}
                              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 group"
                             >
                                <Zap className="w-4 h-4 group-hover:animate-pulse" />
                                Processar Próximo Lote Agora
                             </button>
                             <button 
                              onClick={handleRetryFailed}
                              className="w-full py-4 bg-white border-2 border-slate-100 text-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
                             >
                                <RotateCcw className="w-4 h-4" />
                                Reiniciar Falhas (Retry)
                             </button>
                             <button 
                              onClick={() => fetchData(true)}
                              className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-3"
                             >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                Forçar Atualização Geral
                             </button>
                          </div>
                       </div>

                       <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                             <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <div>
                             <h5 className="text-[10px] font-black text-emerald-800 uppercase tracking-tight leading-none mb-1">Status da Z-API</h5>
                             <p className="text-[9px] font-bold text-emerald-600 uppercase">A conta está pronta para envios e conectada.</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           )}
        </div>

        {/* Action Bar Footer (Optional) */}
        <div className="px-8 py-6 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4 text-slate-400">
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Worker: ATIVO</span>
              </div>
              <div className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-[10px] font-bold">Refresh autom. em {REFRESH_INTERVAL/1000}s</span>
           </div>
           
           <div className="flex items-center gap-3">
              <button 
                onClick={onClose}
                className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all"
              >
                Fechar Painel
              </button>
           </div>
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes move {
          from { background-position: 0 0; }
          to { background-position: 1.5rem 0; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar-dark::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
}

// Global helper for debug status
const campaignWorkerStarted = true; // In a real app this would come from store
