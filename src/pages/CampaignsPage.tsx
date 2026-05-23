/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Megaphone, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Play, 
  Pause,
  X,
  Smartphone,
  Tag as TagIcon,
  MessageSquare,
  Users,
  LayoutList,
  FileText,
  BarChart3,
  Database,
  Copy,
  Download,
  PauseCircle,
  PlayCircle,
  StopCircle,
  Eye,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  SmartphoneNfc,
  Check,
  ExternalLink,
  MoreHorizontal,
  RotateCcw,
  Terminal,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Campaign, Customer, WhatsAppAccount, CampaignRecipient, CampaignStatus } from '../types';
import { toast } from 'sonner';
import { getErrorMessage } from '../utils/getErrorMessage';
import { safeAction } from '../utils/safeAction';
import { getAgentDisplayName } from '../utils/userUtils';
import { normalizeBrazilPhone } from '../utils/phoneUtils';

import CampaignDetailsModal from '../components/CampaignDetailsModal';
import CampaignDebugModal from '../components/CampaignDebugModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'DRAFT': { label: 'Rascunho', color: 'text-slate-500', bg: 'bg-slate-100' },
  'READY': { label: 'Pronta', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  'RUNNING': { label: 'Em disparo', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'PAUSED': { label: 'Pausada', color: 'text-amber-600', bg: 'bg-amber-50' },
  'COMPLETED': { label: 'Concluída', color: 'text-blue-600', bg: 'bg-blue-50' },
  'FAILED': { label: 'Erro', color: 'text-rose-600', bg: 'bg-rose-50' },
  'CANCELED': { label: 'Cancelada', color: 'text-slate-400', bg: 'bg-slate-200' },
  'SCHEDULED': { label: 'Agendada', color: 'text-indigo-400', bg: 'bg-indigo-50' }
};

export default function CampaignsPage() {
  const { 
    campaigns, 
    addCampaign, 
    updateCampaign, 
    deleteCampaign, 
    pauseCampaign, 
    resumeCampaign, 
    cancelCampaign,
    retryFailedCampaign,
    processCampaignBatch,
    getCampaignRecipients,
    whatsAppAccounts, 
    customers,
    conversations,
    currentUser,
    teams,
    tags
  } = useAppStore();

  const enrichedCustomers = useMemo(() => {
    return customers.map(c => {
      const customerConvs = conversations.filter(conv => conv.customer_id === c.id);
      const tagSet = new Set<string>();
      customerConvs.forEach(conv => {
        if (conv.tags && Array.isArray(conv.tags)) {
          conv.tags.forEach((tag: any) => {
            if (typeof tag === 'string') {
              tagSet.add(tag);
            } else if (tag && typeof tag === 'object' && tag.name) {
              tagSet.add(tag.name);
            }
          });
        }
      });
      return {
        ...c,
        tags: Array.from(tagSet)
      };
    });
  }, [customers, conversations]);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | 'ALL'>('ALL');
  
  // New Campaign Form State
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Promoção',
    accountId: '',
    teamId: '',
    content: '',
    messageType: 'text' as 'text' | 'image' | 'video' | 'document',
    mediaUrl: '',
    mediaFileName: '',
    mediaMimeType: '',
    audienceType: 'crm' as 'crm' | 'manual_list',
    selectedTags: [] as string[],
    manualListText: '',
    validatedList: [] as any[],
    minInterval: 5,
    maxInterval: 10,
    batchSize: 5,
    saveToCrm: false
  });

  const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
  
  const filteredCampaigns = safeCampaigns.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const metrics = {
    total: safeCampaigns.length,
    running: safeCampaigns.filter(c => c.status === 'RUNNING').length,
    paused: safeCampaigns.filter(c => c.status === 'PAUSED').length,
    completed: safeCampaigns.filter(c => c.status === 'COMPLETED').length,
    failed: safeCampaigns.filter(c => c.status === 'FAILED').length,
    totalSent: safeCampaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0),
    totalError: safeCampaigns.reduce((acc, c) => acc + (c.failed_count || 0), 0),
    avgProgress: safeCampaigns.length > 0 ? Math.round((safeCampaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0) / (safeCampaigns.reduce((acc, c) => acc + (c.recipients_count || 0), 0) || 1)) * 100) : 0
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'Promoção',
      accountId: '',
      teamId: '',
      content: '',
      messageType: 'text',
      mediaUrl: '',
      mediaFileName: '',
      mediaMimeType: '',
      audienceType: 'crm',
      selectedTags: [],
      manualListText: '',
      validatedList: [],
      minInterval: 5,
      maxInterval: 10,
      batchSize: 5,
      saveToCrm: false
    });
    setStep(1);
    setShowAddModal(false);
  };

  const handleValidateList = async () => {
    if (!formData.manualListText.trim()) {
      toast.error('Informe os contatos para validar');
      return;
    }

    await safeAction(async () => {
      const { campaignService } = await import('../services/dataService');
      const res = await campaignService.optimize(formData.manualListText);
      if (res.success) {
        const combinedList: any[] = [];
        
        if (Array.isArray(res.valid)) {
          res.valid.forEach((v: any) => {
            combinedList.push({
              name: v.name || "Cliente",
              phone: v.phone,
              phone_normalized: v.phone_normalized,
              valid: true,
              reason: ""
            });
          });
        }
        
        if (Array.isArray(res.invalid)) {
          res.invalid.forEach((v: any) => {
            let name = "Inválido";
            let phone = v.line || "";
            if (v.line && typeof v.line === "string") {
              if (v.line.includes(';')) {
                const parts = v.line.split(';');
                name = parts[0]?.trim() || "Inválido";
                phone = parts[1]?.trim() || v.line;
              } else if (v.line.includes(',')) {
                const parts = v.line.split(',');
                name = parts[0]?.trim() || "Inválido";
                phone = parts[1]?.trim() || v.line;
              }
            }
            combinedList.push({
              name,
              phone,
              phone_normalized: "",
              valid: false,
              reason: v.reason || "Formato inválido"
            });
          });
        }
        
        if (Array.isArray(res.duplicates)) {
          res.duplicates.forEach((v: any) => {
            let name = "Duplicado";
            let phone = v.line || "";
            if (v.line && typeof v.line === "string") {
              if (v.line.includes(';')) {
                const parts = v.line.split(';');
                name = parts[0]?.trim() || "Duplicado";
                phone = parts[1]?.trim() || v.line;
              } else if (v.line.includes(',')) {
                const parts = v.line.split(',');
                name = parts[0]?.trim() || "Duplicado";
                phone = parts[1]?.trim() || v.line;
              }
            }
            combinedList.push({
              name,
              phone,
              phone_normalized: v.phone_normalized || "",
              valid: false,
              reason: "Duplicado"
            });
          });
        }

        setFormData({ ...formData, validatedList: combinedList });
        toast.success(`Validado: ${res.total_valid} ok, ${res.total_invalid} inválidos, ${res.total_duplicates} duplicados.`);
      } else {
        throw new Error(res.error);
      }
    }, { label: 'Erro ao validar lista' });
  };

  const handleNextStep = async () => {
    if (step === 2 && formData.audienceType === 'manual_list') {
      if (formData.manualListText.trim() && formData.validatedList.filter(v => v.valid).length === 0) {
        toast.info("Validando lista de contatos...");
        try {
          const { campaignService } = await import('../services/dataService');
          const res = await campaignService.optimize(formData.manualListText);
          if (res.success) {
            const combinedList: any[] = [];
            
            if (Array.isArray(res.valid)) {
              res.valid.forEach((v: any) => {
                combinedList.push({
                  name: v.name || "Cliente",
                  phone: v.phone,
                  phone_normalized: v.phone_normalized,
                  valid: true,
                  reason: ""
                });
              });
            }
            
            if (Array.isArray(res.invalid)) {
              res.invalid.forEach((v: any) => {
                let name = "Inválido";
                let phone = v.line || "";
                if (v.line && typeof v.line === "string") {
                  if (v.line.includes(';')) {
                    const parts = v.line.split(';');
                    name = parts[0]?.trim() || "Inválido";
                    phone = parts[1]?.trim() || v.line;
                  } else if (v.line.includes(',')) {
                    const parts = v.line.split(',');
                    name = parts[0]?.trim() || "Inválido";
                    phone = parts[1]?.trim() || v.line;
                  }
                }
                combinedList.push({
                  name,
                  phone,
                  phone_normalized: "",
                  valid: false,
                  reason: v.reason || "Formato inválido"
                });
              });
            }
            
            if (Array.isArray(res.duplicates)) {
              res.duplicates.forEach((v: any) => {
                let name = "Duplicado";
                let phone = v.line || "";
                if (v.line && typeof v.line === "string") {
                  if (v.line.includes(';')) {
                    const parts = v.line.split(';');
                    name = parts[0]?.trim() || "Duplicado";
                    phone = parts[1]?.trim() || v.line;
                  } else if (v.line.includes(',')) {
                    const parts = v.line.split(',');
                    name = parts[0]?.trim() || "Duplicado";
                    phone = parts[1]?.trim() || v.line;
                  }
                }
                combinedList.push({
                  name,
                  phone,
                  phone_normalized: v.phone_normalized || "",
                  valid: false,
                  reason: "Duplicado"
                });
              });
            }

            setFormData(prev => ({ ...prev, validatedList: combinedList }));
            const validCount = combinedList.filter(v => v.valid).length;
            if (validCount === 0) {
              toast.error("Nenhum contato válido encontrado após validação.");
              return;
            }
            toast.success(`Validado automaticamente: ${res.total_valid} ok.`);
          } else {
            throw new Error(res.error);
          }
        } catch (err: any) {
          toast.error("Erro ao validar lista automaticamente: " + err.message);
          return;
        }
      } else if (!formData.manualListText.trim()) {
        toast.error("Por favor, cole sua lista de contatos ou mude para audiência do CRM.");
        return;
      }
    }
    setStep(step + 1);
  };

  const handleCreate = async () => {
    await safeAction(async () => {
      const contacts: any[] = [];
      
      if (formData.audienceType === 'crm') {
         const targetCustomers = enrichedCustomers.filter(c => {
           if (c.opt_out) return false;
           if (formData.selectedTags.length === 0) return true;
           return formData.selectedTags.some(tag => c.tags?.includes(tag));
         });
         targetCustomers.forEach(c => {
           contacts.push({
             name: c.name,
             phone: c.phone,
             phone_normalized: c.phone_normalized,
             variables: { name: c.name }
           });
         });
      } else {
        formData.validatedList.filter(v => v.valid).forEach(v => {
          contacts.push({
            name: v.name,
            phone: v.phone,
            phone_normalized: v.phone_normalized,
            variables: { name: v.name }
          });
        });
      }

      if (contacts.length === 0) {
        toast.error('Nenhum destinatário válido selecionado.');
        return;
      }

      const campaignData = {
        name: formData.name,
        type: formData.type,
        whatsapp_account_id: formData.accountId,
        team_id: formData.teamId,
        content: formData.content,
        message_type: formData.messageType,
        media_url: formData.mediaUrl,
        media_file_name: formData.mediaFileName,
        media_mime_type: formData.mediaMimeType,
        batch_size: formData.batchSize,
        min_interval: formData.minInterval,
        max_interval: formData.maxInterval
      };

      await addCampaign(campaignData, contacts);
      toast.success('Campanha READY! Inicie o disparo quando desejar.');
      resetForm();
    }, { label: 'Erro ao criar campanha' });
  };

  const handleStartSending = async (campaign: Campaign) => {
    await safeAction(async () => {
      const { campaignService } = await import('../services/dataService');
      const res = await campaignService.start(campaign.id);
      if (res.success) {
        toast.success('Worker ativado para a campanha!');
      } else {
        throw new Error(res.error);
      }
    }, { label: 'Erro ao iniciar disparo' });
  };

  const openDetails = (id: string) => {
    setSelectedCampaignId(id);
    setShowDetailsModal(true);
  };

  const openDebug = (id: string) => {
    setSelectedCampaignId(id);
    setShowDebugModal(true);
  };

  const handleExportCSV = (campaign: Campaign) => {
    toast.info('Exportando relatório...');
    const headers = ['Destinatário', 'Telefone', 'Status', 'Horário'];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + 
      `Campanha: ${campaign.name}\nTotal: ${campaign.recipients_count}\nSucesso: ${campaign.sent_count}\nFalhas: ${campaign.failed_count}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `campanha_${campaign.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-full mx-auto space-y-8 animate-in fade-in duration-500 bg-slate-50/30 min-h-screen">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <Megaphone className="w-6 h-6" />
             </div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">Campanhas Marketing</h1>
          </div>
          <p className="text-slate-500 mt-2 font-medium ml-1">Gerencie seus disparos em massa, acompanhe métricas de conversão e engajamento.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </button>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total', value: metrics.total, icon: Megaphone, color: 'slate' },
          { label: 'Em Disparo', value: metrics.running, icon: PlayCircle, color: 'emerald' },
          { label: 'Pausadas', value: metrics.paused, icon: PauseCircle, color: 'amber' },
          { label: 'Concluídas', value: metrics.completed, icon: CheckCircle2, color: 'blue' },
          { label: 'Com Erro', value: metrics.failed, icon: AlertCircle, color: 'rose' },
          { label: 'Enviados', value: metrics.totalSent, icon: Send, color: 'emerald' },
          { label: 'Falhas Envio', value: metrics.totalError, icon: X, color: 'red' },
          { label: 'Média Progresso', value: `${metrics.avgProgress}%`, icon: BarChart3, color: 'violet' }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm grow">
             <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500`}>
                   <stat.icon className="w-4 h-4" />
                </div>
             </div>
             <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                <h4 className="text-lg font-black text-slate-800 tracking-tight">{stat.value}</h4>
             </div>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
         <div className="relative flex-1 w-full">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar campanha pelo nome..." 
              className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'DRAFT', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELED'].map(status => (
               <button 
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${filterStatus === status ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-105' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
               >
                 {status === 'ALL' ? 'Todos' : (STATUS_CONFIG[status]?.label || status)}
               </button>
            ))}
         </div>
      </div>

      {/* Campaign List */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Campanha</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Equipe</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Início</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Progresso</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Contatos</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Enviados</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                  </tr>
               </thead>
               <tbody>
                  {filteredCampaigns.map(campaign => {
                    const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG['DRAFT'];
                    const progress = campaign.recipients_count > 0 
                      ? Math.round(((campaign.sent_count + campaign.failed_count + campaign.skipped_count) / campaign.recipients_count) * 100) 
                      : 0;

                    return (
                      <tr key={campaign.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl ${status.bg} ${status.color} flex items-center justify-center shrink-0`}>
                                 <Megaphone className="w-5 h-5" />
                              </div>
                              <div>
                                 <h4 className="font-black text-slate-800 text-sm tracking-tight leading-none mb-1">{campaign.name}</h4>
                                 <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{campaign.type}</span>
                                    <span className="text-[10px] font-bold text-slate-300">•</span>
                                    <span className="text-[10px] font-bold text-slate-400 tracking-tight">{new Date(campaign.created_at).toLocaleDateString()}</span>
                                 </div>
                              </div>
                           </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 ${status.bg} ${status.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.bg.replace('bg-', 'bg-').replace('-50', '-500')} ${campaign.status === 'RUNNING' ? 'animate-pulse' : ''}`} />
                              {status.label}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                             {teams.find(t => t.id === campaign.team_id)?.name || 'Geral'}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                             {campaign.started_at ? new Date(campaign.started_at).toLocaleDateString() : '-'}
                           </p>
                           {campaign.started_at && <p className="text-[8px] font-black text-slate-300 mt-1">{new Date(campaign.started_at).toLocaleTimeString()}</p>}
                        </td>
                        <td className="px-8 py-6 max-w-[200px]">
                            <div className="flex items-center gap-3">
                               <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className={`h-full ${campaign.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                  />
                               </div>
                               <span className="text-[10px] font-black text-slate-800">{progress}%</span>
                            </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <span className="text-sm font-black text-slate-800">{campaign.recipients_count}</span>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <div className="flex flex-col items-center">
                              <span className="text-sm font-black text-emerald-600">{campaign.sent_count}</span>
                              {campaign.failed_count > 0 && <span className="text-[10px] font-bold text-rose-500">+{campaign.failed_count} falhas</span>}
                           </div>
                        </td>
                        <td className="px-8 py-6">
                           <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => openDetails(campaign.id)}
                                className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                                title="Visualizar"
                              >
                                 <Eye className="w-4 h-4" />
                              </button>
                               {campaign.status === 'READY' || campaign.status === 'PAUSED' ? (
                                  <button 
                                    onClick={() => handleStartSending(campaign)}
                                    className="p-3 bg-indigo-600 text-white rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-100"
                                    title="Iniciar Envio"
                                  >
                                    <Play className="w-4 h-4 fill-current" />
                                  </button>
                               ) : campaign.status === 'RUNNING' ? (
                                  <button 
                                    onClick={() => pauseCampaign(campaign.id)}
                                    className="p-3 bg-amber-500 text-white rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-amber-100"
                                    title="Pausar"
                                  >
                                    <Pause className="w-4 h-4 fill-current" />
                                  </button>
                               ) : null}
                               <div className="relative">
                                  <button 
                                    onClick={() => setActiveMenuId(activeMenuId === campaign.id ? null : campaign.id)}
                                    className={`p-3 transition-all rounded-xl ${activeMenuId === campaign.id ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-400 border border-slate-100 hover:border-slate-300'}`}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                  
                                  <AnimatePresence>
                                    {activeMenuId === campaign.id && (
                                       <motion.div 
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                        className="absolute right-0 top-full mt-2 w-64 bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 p-2 z-[100] overflow-hidden"
                                       >
                                          {[
                                            { label: 'Painel de Controle', icon: BarChart3, action: () => openDetails(campaign.id) },
                                            { label: 'Diagnosticar', icon: Terminal, action: () => openDebug(campaign.id) },
                                            { label: 'Reiniciar Falhas', icon: RotateCcw, action: () => retryFailedCampaign(campaign.id), hide: campaign.failed_count === 0 },
                                            { label: 'Forçar Lote', icon: Zap, action: () => processCampaignBatch(campaign.id), hide: campaign.status !== 'RUNNING' },
                                            { label: 'Exportar CSV', icon: Download, action: () => handleExportCSV(campaign) },
                                            { label: 'Cancelar', icon: StopCircle, action: () => cancelCampaign(campaign.id), color: 'text-rose-600', hide: campaign.status === 'COMPLETED' || campaign.status === 'CANCELED' },
                                            { label: 'Excluir', icon: Trash2, action: () => deleteCampaign(campaign.id), color: 'text-rose-600 hover:bg-rose-50' }
                                          ].map((item, idx) => !item.hide && (
                                            <button 
                                              key={idx}
                                              onClick={() => { setActiveMenuId(null); item.action(); }}
                                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-tight transition-all hover:bg-slate-50 ${item.color || 'text-slate-600'}`}
                                            >
                                               <item.icon className="w-4 h-4" />
                                               {item.label}
                                            </button>
                                          ))}
                                       </motion.div>
                                    )}
                                  </AnimatePresence>
                               </div>
                           </div>
                        </td>
                      </tr>
                    );
                  })}
               </tbody>
            </table>
         </div>

         {filteredCampaigns.length === 0 && (
           <div className="py-24 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-300 mx-auto mb-6 border border-slate-100 shadow-inner">
                 <Megaphone className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Nenhuma campanha encontrada</h3>
              <p className="text-slate-400 mt-2 max-w-sm mx-auto font-medium">Use os filtros acima ou crie uma nova campanha para automatizar seus atendimentos.</p>
           </div>
         )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={resetForm}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
             >
                {/* Modal Header */}
                <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                   <div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">Criar Nova Campanha</h2>
                      <div className="flex items-center gap-2 mt-1">
                         {[1, 2, 3].map(s => (
                           <div 
                            key={s}
                            className={`h-1.5 rounded-full transition-all ${step >= s ? 'w-8 bg-indigo-600' : 'w-4 bg-slate-100'}`}
                           />
                         ))}
                         <span className="ml-2 text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Passo {step} de 3</span>
                      </div>
                   </div>
                   <button 
                    onClick={resetForm}
                    className="p-3 hover:bg-slate-50 text-slate-400 rounded-2xl transition-colors"
                   >
                     <X className="w-6 h-6" />
                   </button>
                </div>

                {/* Modal Body */}
                <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                   {step === 1 && (
                      <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Identificador</label>
                               <input 
                                 type="text" 
                                 placeholder="Ex: Black Friday 2026 - Hotéis"
                                 className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold"
                                 value={formData.name}
                                 onChange={e => setFormData({ ...formData, name: e.target.value })}
                               />
                            </div>
                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Campanha</label>
                               <select 
                                 className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold appearance-none cursor-pointer"
                                 value={formData.type}
                                 onChange={e => setFormData({ ...formData, type: e.target.value })}
                               >
                                  <option>Promoção</option>
                                  <option>Informativo</option>
                                  <option>Lembrete</option>
                                  <option>Pesquisa</option>
                                  <option>Outro</option>
                               </select>
                            </div>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Canal de Envio (WhatsApp)</label>
                               <select 
                                 className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold appearance-none cursor-pointer"
                                 value={formData.accountId}
                                 onChange={e => setFormData({ ...formData, accountId: e.target.value })}
                               >
                                  <option value="">Selecione um canal...</option>
                                  {whatsAppAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.phone_number || acc.number})</option>
                                  ))}
                               </select>
                            </div>
                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Equipe Responsável</label>
                               <select 
                                 className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold appearance-none cursor-pointer"
                                 value={formData.teamId}
                                 onChange={e => setFormData({ ...formData, teamId: e.target.value })}
                               >
                                  <option value="">Selecione uma equipe...</option>
                                  {teams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                               </select>
                            </div>
                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Mensagem</label>
                               <select 
                                 className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold appearance-none cursor-pointer"
                                 value={formData.messageType}
                                 onChange={e => setFormData({ ...formData, messageType: e.target.value as any })}
                               >
                                  <option value="text">Apenas Texto</option>
                                  <option value="image">Imagem</option>
                                  <option value="video">Vídeo</option>
                                  <option value="document">Documento/PDF</option>
                               </select>
                            </div>
                         </div>

                         {formData.messageType !== 'text' && (
                            <div className="space-y-2 animate-in fade-in duration-300">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL da Mídia (Link Direto)</label>
                               <input 
                                 type="text" 
                                 placeholder="https://exemplo.com/imagem.png"
                                 className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold"
                                 value={formData.mediaUrl}
                                 onChange={e => setFormData({ ...formData, mediaUrl: e.target.value })}
                               />
                            </div>
                         )}

                         <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conteúdo da Mensagem</label>
                               <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Dica: Use {"{{nome}}"} para personalizar</span>
                            </div>
                            <textarea 
                               placeholder="Olá {{nome}}, tudo bem? Temos uma oferta imperdível..."
                               rows={5}
                               className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium leading-relaxed resize-none"
                               value={formData.content}
                               onChange={e => setFormData({ ...formData, content: e.target.value })}
                            />
                            <div className="flex flex-wrap gap-2 mt-2">
                               {['nome', 'consultor', 'empresa'].map(v => (
                                  <button 
                                    key={v}
                                    onClick={() => setFormData({ ...formData, content: formData.content + ` {{${v}}}` })}
                                    className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-400 uppercase hover:text-indigo-600 hover:border-indigo-200 transition-all"
                                  >
                                     + {v}
                                  </button>
                               ))}
                            </div>
                         </div>
                      </div>
                   )}

                   {step === 2 && (
                      <div className="animate-in slide-in-from-right-4 duration-300 space-y-8">
                         <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl">
                            <button 
                              onClick={() => setFormData({ ...formData, audienceType: 'crm' })}
                              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${formData.audienceType === 'crm' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                               <Database className="w-4 h-4" />
                               Base CRM Filters
                            </button>
                            <button 
                              onClick={() => setFormData({ ...formData, audienceType: 'manual_list' })}
                              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${formData.audienceType === 'manual_list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                               <LayoutList className="w-4 h-4" />
                               Lista Manual
                            </button>
                         </div>

                         {formData.audienceType === 'crm' ? (
                            <div className="space-y-4">
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Etiquetas</label>
                                  <div className="flex flex-wrap gap-2 p-6 bg-slate-50 border border-slate-100 rounded-3xl min-h-[100px]">
                                     {tags.map(tag => (
                                        <button 
                                          key={tag.id}
                                          onClick={() => {
                                            const updated = formData.selectedTags.includes(tag.name)
                                              ? formData.selectedTags.filter(t => t !== tag.name)
                                              : [...formData.selectedTags, tag.name];
                                            setFormData({ ...formData, selectedTags: updated });
                                          }}
                                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${formData.selectedTags.includes(tag.name) ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-400 border-slate-200'}`}
                                        >
                                           {tag.name}
                                        </button>
                                     ))}
                                     {formData.selectedTags.length === 0 && (
                                       <div className="flex items-center gap-2 text-slate-300 italic text-xs font-medium">
                                          <Filter className="w-4 h-4" />
                                          Nenhuma etiqueta selecionada (enviará para TODA base de clientes ativos)
                                       </div>
                                     )}
                                  </div>
                               </div>
                               <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                     <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                                        <Users className="w-5 h-5" />
                                     </div>
                                     <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Recuperação Estimada</h4>
                                        <p className="text-[10px] font-bold text-indigo-600 uppercase">Cerca de {enrichedCustomers.filter(c => formData.selectedTags.length === 0 || formData.selectedTags.some(t => c.tags?.includes(t))).length} contatos encontrados</p>
                                     </div>
                                  </div>
                                  <ShieldCheck className="w-6 h-6 text-indigo-200" />
                               </div>
                            </div>
                         ) : (
                            <div className="space-y-6">
                               <div className="space-y-2">
                                  <div className="flex items-center justify-between px-1">
                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colar Lista de Contatos</label>
                                     <span className="text-[10px] font-bold text-slate-400 italic">Formato: Nome; Telefone ou apenas Telefone</span>
                                  </div>
                                  <textarea 
                                    placeholder="Maria; 5564999999999&#10;5564888888888&#10;João, 5511777777777"
                                    rows={8}
                                    className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-mono text-xs leading-relaxed resize-none"
                                    value={formData.manualListText}
                                    onChange={e => setFormData({ ...formData, manualListText: e.target.value })}
                                  />
                                  <div className="flex items-center justify-between mt-2">
                                     <div className="flex items-center gap-3">
                                        <input 
                                          type="checkbox" 
                                          id="saveToCrm" 
                                          checked={formData.saveToCrm}
                                          onChange={e => setFormData({ ...formData, saveToCrm: e.target.checked })}
                                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <label htmlFor="saveToCrm" className="text-[10px] font-black text-slate-600 uppercase tracking-widest cursor-pointer">
                                           Salvar também como clientes no CRM
                                        </label>
                                     </div>
                                     <button 
                                      onClick={handleValidateList}
                                      className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
                                     >
                                        <ShieldCheck className="w-4 h-4" />
                                        Validar Lista
                                     </button>
                                  </div>
                               </div>

                               {formData.validatedList.length > 0 && (
                                  <div className="space-y-2">
                                     <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resultado da Validação:</h5>
                                     <div className="bg-slate-50 border border-slate-100 rounded-[2rem] max-h-[150px] overflow-y-auto p-4 space-y-2">
                                        {formData.validatedList.map((v, idx) => (
                                          <div key={idx} className="flex items-center justify-between py-2 px-4 bg-white rounded-xl border border-slate-50">
                                             <div className="flex items-center gap-3">
                                                {v.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                                                <div>
                                                   <p className="text-[10px] font-black text-slate-800 tracking-tight leading-none">{v.name}</p>
                                                   <p className="text-[9px] font-bold text-slate-400 font-mono mt-0.5">{v.phone}</p>
                                                </div>
                                             </div>
                                             {!v.valid && <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-full">{v.reason}</span>}
                                             {v.valid && <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full">Pronto</span>}
                                          </div>
                                        ))}
                                     </div>
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                   )}

                   {step === 3 && (
                      <div className="animate-in slide-in-from-right-4 duration-300 space-y-8">
                         <div className="bg-indigo-600 rounded-[3rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                            <div className="relative z-10">
                               <div className="flex items-center gap-4 mb-6">
                                  <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                                     <Megaphone className="w-8 h-8" />
                                  </div>
                                  <div>
                                     <h3 className="text-2xl font-black tracking-tight leading-tight">{formData.name}</h3>
                                     <p className="text-white/60 text-xs font-black uppercase tracking-widest mt-1">Revisão Final da Campanha</p>
                                  </div>
                                </div>

                               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                  <div className="space-y-1">
                                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Contatos</p>
                                     <p className="text-lg font-black">{formData.audienceType === 'crm' ? enrichedCustomers.filter(c => formData.selectedTags.length === 0 || formData.selectedTags.some(t => c.tags?.includes(t))).length : formData.validatedList.filter(v => v.valid).length}</p>
                                  </div>
                                  <div className="space-y-1">
                                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Mensagem</p>
                                     <p className="text-lg font-black">{formData.messageType.toUpperCase()}</p>
                                  </div>
                                  <div className="space-y-1">
                                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Intervalo</p>
                                     <p className="text-lg font-black">{formData.minInterval}s ~ {formData.maxInterval}s</p>
                                  </div>
                                  <div className="space-y-1">
                                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Lote</p>
                                     <p className="text-lg font-black">{formData.batchSize} contatos</p>
                                  </div>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Regras de Disparo Inteligente:</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-2">Simulação de Comportamento Humano</p>
                                  <p className="text-[10px] text-slate-500 leading-relaxed">O sistema aguardará um tempo aleatório entre {formData.minInterval} e {formData.maxInterval} segundos após cada mensagem, reduzindo drasticamente as chances de bloqueio pela Z-API.</p>
                               </div>
                               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-2">Processamento Circular</p>
                                  <p className="text-[10px] text-slate-500 leading-relaxed">As mensagens serão disparadas em lotes de {formData.batchSize}. Caso o servidor seja reiniciado, o worker retomará exatamente de onde parou.</p>
                               </div>
                            </div>
                         </div>
                      </div>
                   )}
                </div>

                {/* Modal Footer */}
                <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                   {step > 1 ? (
                      <button 
                        onClick={() => setStep(step - 1)}
                        className="px-8 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all flex items-center gap-2"
                      >
                         Voltar
                      </button>
                   ) : (
                      <div />
                   )}

                   <div className="flex items-center gap-4">
                      {step < 3 ? (
                         <button 
                           onClick={handleNextStep}
                           disabled={step === 1 && !formData.name}
                           className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:scale-100"
                         >
                            Próximo Passo
                            <ArrowRight className="w-4 h-4" />
                         </button>
                      ) : (
                         <button 
                           onClick={handleCreate}
                           className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                         >
                            Criar e Preparar Disparo
                            <ShieldCheck className="w-4 h-4" />
                         </button>
                      )}
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailsModal && selectedCampaignId && (
          <CampaignDetailsModal 
            campaignId={selectedCampaignId}
            onClose={() => setShowDetailsModal(false)}
          />
        )}

        {showDebugModal && selectedCampaignId && (
          <CampaignDebugModal 
            campaignId={selectedCampaignId} 
            onClose={() => setShowDebugModal(false)} 
          />
        )}
      </AnimatePresence>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}} />
    </div>
  );
}
