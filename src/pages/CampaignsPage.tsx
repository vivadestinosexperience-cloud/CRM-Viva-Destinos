/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { Campaign, Customer } from '../types';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'PENDING': { label: 'Pendente', color: 'text-slate-500', bg: 'bg-slate-50' },
  'SENDING': { label: 'Enviando', color: 'text-blue-600', bg: 'bg-blue-50' },
  'COMPLETED': { label: 'Concluído', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'PAUSED': { label: 'Pausado', color: 'text-amber-600', bg: 'bg-amber-50' },
  'CANCELLED': { label: 'Cancelado', color: 'text-rose-600', bg: 'bg-rose-50' }
};

export default function CampaignsPage() {
  const { 
    campaigns, 
    addCampaign, 
    updateCampaign, 
    deleteCampaign, 
    whatsAppAccounts, 
    customers 
  } = useAppStore();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    accountId: '',
    content: '',
    selectedTags: [] as string[]
  });

  const allTags = Array.from(new Set(customers.flatMap(c => c.tags || [])));

  const filteredCampaigns = campaigns.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetForm = () => {
    setFormData({
      name: '',
      accountId: '',
      content: '',
      selectedTags: []
    });
    setShowAddModal(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.accountId || !formData.content) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    // Filter recipients
    const recipients = customers.filter(c => {
      if (c.opt_out) return false;
      if (formData.selectedTags.length === 0) return true;
      return formData.selectedTags.some(tag => c.tags?.includes(tag));
    });

    if (recipients.length === 0) {
      toast.error('Nenhum cliente encontrado com os filtros selecionados');
      return;
    }

    const newCampaign: Campaign = {
      id: `cp-${Date.now()}`,
      name: formData.name,
      whatsapp_account_id: formData.accountId,
      content: formData.content,
      status: 'PENDING',
      target_tags: formData.selectedTags,
      recipients_count: recipients.length,
      sent_count: 0,
      failed_count: 0,
      read_count: 0,
      created_at: new Date().toISOString()
    };

    await addCampaign(newCampaign);
    resetForm();
    toast.success('Campanha criada com sucesso');
  };

  const startSending = async (campaign: Campaign) => {
    if (campaign.status === 'COMPLETED') return;
    
    // Check if channel is connected
    const account = whatsAppAccounts.find(a => a.id === campaign.whatsapp_account_id);
    if (!account || account.status !== 'ESTÁVEL') {
      toast.error('O canal de envio está desconectado. Reconecte em Configurações > Canais.');
      return;
    }

    // Simulated Sending Process
    updateCampaign({ ...campaign, status: 'SENDING', started_at: new Date().toISOString() });
    toast.info(`Iniciando envio para ${campaign.recipients_count} clientes...`);

    const recipients = customers.filter(c => {
      if (c.opt_out) return false;
      if (!campaign.target_tags || campaign.target_tags.length === 0) return true;
      return campaign.target_tags.some(tag => c.tags?.includes(tag));
    });

    let sent = 0;
    let failed = 0;

    for (const customer of recipients) {
      // Pause if campaign status changed (e.g. manually paused)
      // Note: In real app this would be backend controlled
      
      const message = campaign.content.replace(/{name}/g, customer.name);
      
      try {
        const res = await fetch('/api/zapi/send-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: customer.phone, message })
        });
        
        if (res.ok) sent++;
        else failed++;
      } catch (err) {
        failed++;
      }

      // Update progress every 5 messages or at the end
      if (sent % 5 === 0 || sent + failed === recipients.length) {
        updateCampaign({ 
          ...campaign, 
          status: (sent + failed === recipients.length) ? 'COMPLETED' : 'SENDING',
          sent_count: sent,
          failed_count: failed,
          completed_at: (sent + failed === recipients.length) ? new Date().toISOString() : undefined
        });
      }

      // Add a small delay between messages to avoid blocking (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    toast.success(`Campanha "${campaign.name}" finalizada! Enviados: ${sent}, Falhas: ${failed}`);
  };

  const handleDelete = (id: string) => {
    if (confirm('Deseja realmente remover esta campanha?')) {
      deleteCampaign(id);
      toast.success('Campanha removida');
    }
  };

  const toggleTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter(t => t !== tag)
        : [...prev.selectedTags, tag]
    }));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            Campanhas WhatsApp
            <span className="bg-emerald-100 text-emerald-600 text-[10px] uppercase font-black px-3 py-1 rounded-full border border-emerald-200">
              marketing
            </span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Envio de mensagens em massa via Z-API com respeito ao opt-out.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white p-4 rounded-3xl shadow-xl shadow-blue-200 hover:scale-105 active:scale-95 transition-all group flex items-center gap-3 pr-6"
        >
          <div className="w-8 h-8 rounded-2xl bg-white/20 flex items-center justify-center">
             <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          </div>
          <span className="text-sm font-black uppercase tracking-widest">Nova Campanha</span>
        </button>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Campanhas', value: campaigns.length, icon: Megaphone, color: 'blue' },
          { label: 'Mensagens Enviadas', value: campaigns.reduce((acc, c) => acc + c.sent_count, 0), icon: Send, color: 'emerald' },
          { label: 'Taxa de Leitura', value: '72%', icon: CheckCircle2, color: 'indigo' },
          { label: 'Clientes Opt-out', value: customers.filter(c => c.opt_out).length, icon: Users, color: 'rose' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className={`w-12 h-12 rounded-2xl bg-${stat.color}-50 flex items-center justify-center text-${stat.color}-600 shadow-inner`}>
               <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">{stat.label}</p>
              <h4 className="text-xl font-black text-slate-800 tracking-tight">{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] border border-slate-100">
         <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar campanha pelo nome..." 
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         <div className="flex items-center gap-2">
            <button className="p-3 bg-slate-50 text-slate-500 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors">
              <Filter className="w-5 h-5" />
            </button>
         </div>
      </div>

      {/* Campaigns list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredCampaigns.map((campaign) => {
          const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG['PENDING'];
          const account = whatsAppAccounts.find(a => a.id === campaign.whatsapp_account_id);
          const progress = campaign.recipients_count > 0 
            ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.recipients_count) * 100) 
            : 0;

          return (
            <motion.div 
              layout
              key={campaign.id}
              className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all group"
            >
              <div className="p-8">
                <div className="flex items-start justify-between mb-8">
                   <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${campaign.status === 'COMPLETED' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'}`}>
                        <Megaphone className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-xl tracking-tight leading-tight">{campaign.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">• {account?.name || '---'}</span>
                        </div>
                      </div>
                   </div>
                   <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-300 transition-colors">
                     <MoreVertical className="w-5 h-5" />
                   </button>
                </div>

                <div className="space-y-6">
                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progresso do Envio</span>
                      <span className="text-[10px] font-black text-slate-800">{progress}%</span>
                    </div>
                    <div className="h-3 bg-slate-50 rounded-full border border-slate-100 overflow-hidden relative">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className={`absolute left-0 top-0 bottom-0 ${campaign.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-600'}`}
                       />
                    </div>
                  </div>

                  {/* Stats circles */}
                  <div className="grid grid-cols-4 gap-4">
                     <div className="p-4 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2">Alvos</p>
                        <span className="text-base font-black text-slate-800 uppercase">{campaign.recipients_count}</span>
                     </div>
                     <div className="p-4 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2">Sucesso</p>
                        <span className="text-base font-black text-emerald-600 uppercase">{campaign.sent_count}</span>
                     </div>
                     <div className="p-4 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2">Falhas</p>
                        <span className="text-base font-black text-rose-500 uppercase">{campaign.failed_count}</span>
                     </div>
                     <div className="p-4 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2">Leitura</p>
                        <span className="text-base font-black text-indigo-500 uppercase">{campaign.read_count}</span>
                     </div>
                  </div>

                  {/* Message preview */}
                  <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 relative group/msg">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-60">Prévia da mensagem:</p>
                    <p className="text-sm text-slate-600 leading-relaxed italic line-clamp-2">"{campaign.content}"</p>
                    <div className="absolute right-4 top-4">
                      <MessageSquare className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 font-mono tracking-tight">
                    {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : '---'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                   {campaign.status === 'PENDING' || campaign.status === 'PAUSED' ? (
                     <button 
                      onClick={() => startSending(campaign)}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:scale-105 active:scale-95 transition-all"
                     >
                       <Play className="w-3 h-3 fill-current" /> Iniciar Envio
                     </button>
                   ) : campaign.status === 'SENDING' ? (
                     <button 
                      onClick={() => updateCampaign({ ...campaign, status: 'PAUSED' })}
                      className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-100 hover:scale-105 active:scale-95 transition-all"
                     >
                       <Pause className="w-3 h-3 fill-current" /> Pausar
                     </button>
                   ) : (
                     <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                       <CheckCircle2 className="w-4 h-4" /> Finalizado
                     </span>
                   )}
                   <button 
                    onClick={() => handleDelete(campaign.id)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                   >
                     <Trash2 className="w-5 h-5" />
                   </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {filteredCampaigns.length === 0 && (
          <div className="col-span-full py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
             <Megaphone className="w-12 h-12 text-slate-300 mb-4" />
             <h3 className="text-lg font-black text-slate-400 uppercase tracking-tight">Nenhuma campanha registrada</h3>
             <p className="text-sm text-slate-400 mt-2 max-w-xs">Crie sua primeira campanha para escalar seus atendimentos proativos.</p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col my-auto"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Criar Nova Campanha</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Viva Destinos Omnichannel Marketing</p>
                </div>
                <button onClick={resetForm} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-8 space-y-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nome da Campanha</label>
                       <input 
                        type="text" 
                        required
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold"
                        placeholder="Ex: Oferta Férias Julho"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Canal de Envio (Z-API)</label>
                       <select 
                        required
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold appearance-none"
                        value={formData.accountId}
                        onChange={(e) => setFormData({...formData, accountId: e.target.value})}
                      >
                         <option value="">Selecione um canal...</option>
                         {whatsAppAccounts.filter(a => a.provider === 'ZAPI').map(acc => (
                           <option key={acc.id} value={acc.id}>{acc.name} ({acc.status === 'ESTÁVEL' ? 'Conectado' : 'Off'})</option>
                         ))}
                       </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Filtrar Alvos (Tags)</label>
                    <div className="flex flex-wrap gap-2">
                       {allTags.map(tag => (
                         <button 
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${formData.selectedTags.includes(tag) ? 'bg-blue-600 text-white border-blue-600 scale-105 shadow-lg shadow-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                         >
                           {tag}
                         </button>
                       ))}
                       {allTags.length === 0 && <p className="text-[10px] text-slate-300 font-bold uppercase italic px-2">Nenhuma tag cadastrada nos clientes.</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conteúdo da Mensagem</label>
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Dica: Use {"{name}"} para personalizar</span>
                    </div>
                    <textarea 
                      required
                      rows={5}
                      className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-[2rem] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-sm resize-none"
                      placeholder="Olá {name}, como vai? Veja nossas ofertas..."
                      value={formData.content}
                      onChange={(e) => setFormData({...formData, content: e.target.value})}
                    />
                  </div>

                  {/* Summary bar */}
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-inner">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                           <Users className="w-5 h-5" />
                        </div>
                        <div>
                           <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Destinatários Estimados</p>
                           <h4 className="text-base font-black text-slate-800">
                             {customers.filter(c => {
                               if (c.opt_out) return false;
                               if (formData.selectedTags.length === 0) return true;
                               return formData.selectedTags.some(tag => c.tags?.includes(tag));
                             }).length} Clientes ativos
                           </h4>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1 text-emerald-500">Privacidade Garantida</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Opt-out respeitado automaticamente</p>
                     </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4">
                   <button type="button" onClick={resetForm} className="px-8 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Cancelar</button>
                   <button type="submit" className="px-12 py-4 bg-emerald-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-100 hover:scale-[1.02] transition-all">
                     Criar Campanha
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
