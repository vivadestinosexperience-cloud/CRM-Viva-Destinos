/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Smartphone, Cloud, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  MoreVertical, Key, Globe, Database, Briefcase, Instagram, Facebook, MessageSquare, Info,
  ArrowLeft, ChevronRight, X, User as UserIcon, Smartphone as MobileIcon, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../../store/useAppStore';
import { WhatsAppAccount } from '../../types';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'ESTÁVEL': { label: 'Estável', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'DISCONNECTED': { label: 'Desconectado', color: 'text-rose-600', bg: 'bg-rose-50' },
  'CONECTANDO': { label: 'Conectando', color: 'text-blue-600', bg: 'bg-blue-50' },
  'ERROR': { label: 'Erro', color: 'text-amber-600', bg: 'bg-amber-50' },
  'WAITING_QR': { label: 'Aguardando QR Code', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  'WAITING_CREDENTIALS': { label: 'Aguardando credenciais', color: 'text-slate-400', bg: 'bg-slate-50' }
};

export default function ChannelsSettingsPage() {
  const { whatsAppAccounts, addWhatsAppAccount, updateWhatsAppAccount, deleteWhatsAppAccount, isSaving, teams, users } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'TYPE' | 'PROVIDER' | 'CONFIG' | 'INSTRUCTIONS' | 'QR' | 'SUCCESS'>('TYPE');
  const [selectedType, setSelectedType] = useState<'META' | 'QR' | 'INSTA' | 'FB' | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'ZAPI' | 'EVOLUTION' | 'CLOUD' | '360' | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phoneId: '',
    businessId: '',
    verifyToken: '',
    teamId: '',
    responsibleId: ''
  });

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrAttempts, setQrAttempts] = useState(0);
  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [configStatus, setConfigStatus] = useState<{meta: boolean, zapi: boolean, evolution: boolean} | null>(null);

  useEffect(() => {
    fetch('/api/channels/config-check')
      .then(r => r.json())
      .then(setConfigStatus)
      .catch(() => setConfigStatus({meta: false, zapi: false, evolution: false}));
  }, []);

  const resetModal = () => {
    setShowAddModal(false);
    setAddStep('TYPE');
    setSelectedType(null);
    setSelectedProvider(null);
    setQrCode(null);
    setQrAttempts(0);
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    setFormData({
      name: '',
      phone: '',
      phoneId: '',
      businessId: '',
      verifyToken: '',
      teamId: '',
      responsibleId: ''
    });
  };

  const handleStartQR = () => {
    setAddStep('INSTRUCTIONS');
  };

  const handleShowQRPage = () => {
    setAddStep('QR');
    generateQrCode();
    startStatusPolling();
  };

  const startStatusPolling = () => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    statusIntervalRef.current = setInterval(checkProviderStatus, 5000);
  };

  const checkProviderStatus = async () => {
    if (addStep !== 'QR') return;
    
    const providerPath = selectedProvider === 'ZAPI' ? 'zapi' : 'evolution';
    try {
      const res = await fetch(`/api/channels/${providerPath}/status`);
      const data = await res.json();
      
      if (data.mapped_status === 'ESTÁVEL' || data.connected === true) {
        handleQRComplete(data.phone || data.number);
      }
    } catch (err) {
      console.error('Error checking status:', err);
    }
  };

  const generateQrCode = async () => {
    if (qrAttempts >= 3) {
      // Show error but don't toast yet to avoid spamming
      return;
    }

    const providerPath = selectedProvider === 'ZAPI' ? 'zapi' : 'evolution';
    try {
      const res = await fetch(`/api/channels/${providerPath}/qrcode`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        setAddStep('CONFIG'); // Return to config if provider error
        return;
      }

      setQrCode(data.value || data.qrcode || data.base64); 
      setQrAttempts(prev => prev + 1);
    } catch (err) {
      toast.error('Erro ao conectar com o servidor backend');
    }
  };

  useEffect(() => {
    if (addStep === 'QR' && !qrIntervalRef.current) {
      qrIntervalRef.current = setInterval(generateQrCode, 20000);
    }
    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = null;
    };
  }, [addStep, qrAttempts]);

  const handleMetaSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Nome do canal é obrigatório');
      return;
    }
    const newChannel: Partial<WhatsAppAccount> = {
      id: `ch-${Date.now()}`,
      name: formData.name,
      type: 'WHATSAPP',
      provider: selectedProvider === 'CLOUD' ? 'META_CLOUD' : '360DIALOG',
      provider_type: selectedProvider === 'CLOUD' ? 'meta_cloud' : '360dialog',
      phone_number: formData.phone,
      instance_id: formData.phoneId,
      status: 'ESTÁVEL', // Assuming success for now
      team_id: formData.teamId,
      responsible_user_id: formData.responsibleId,
      config: {
        phoneId: formData.phoneId,
        businessId: formData.businessId,
        verifyToken: formData.verifyToken
      },
      created_at: new Date().toISOString()
    };
    await addWhatsAppAccount(newChannel as WhatsAppAccount);
    setAddStep('SUCCESS');
    setTimeout(resetModal, 2000);
  };

  const handleQRComplete = async (detectedPhone?: string) => {
     if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
     if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);

     const newChannel: Partial<WhatsAppAccount> = {
        id: `ch-${Date.now()}`,
        name: formData.name || (selectedProvider === 'ZAPI' ? 'WhatsApp Z-API' : 'WhatsApp Evolution'),
        type: 'WHATSAPP',
        provider: selectedProvider === 'ZAPI' ? 'ZAPI' : 'EVOLUTION',
        provider_type: selectedProvider === 'ZAPI' ? 'zapi' : 'evolution',
        phone_number: detectedPhone || formData.phone,
        status: 'ESTÁVEL',
        team_id: formData.teamId,
        responsible_user_id: formData.responsibleId,
        created_at: new Date().toISOString()
     };
     await addWhatsAppAccount(newChannel as WhatsAppAccount);
     setAddStep('SUCCESS');
     setTimeout(resetModal, 2000);
  };

  const handleManualCheckStatus = async () => {
    const providerPath = selectedProvider === 'ZAPI' ? 'zapi' : 'evolution';
    try {
      const res = await fetch(`/api/channels/${providerPath}/status`);
      const data = await res.json();
      
      if (data.mapped_status === 'ESTÁVEL' || data.connected === true) {
        handleQRComplete(data.phone || data.number);
      } else {
        toast.info("Número ainda não conectado. Faça a leitura do QR Code.");
      }
    } catch (err) {
      toast.error('Erro ao verificar status');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Deseja realmente remover este canal?')) {
      deleteWhatsAppAccount(id);
      toast.success('Canal removido com sucesso');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            Canais de atendimento
            <span className="bg-blue-100 text-blue-600 text-[10px] uppercase font-black px-3 py-1 rounded-full border border-blue-200">
              Omnichannel
            </span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Configure os canais usados para atendimento omnichannel da Viva Destinos.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white p-4 rounded-3xl shadow-xl shadow-blue-200 hover:scale-105 active:scale-95 transition-all group"
        >
          <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-500" />
        </button>
      </header>

      {/* Grid of Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {whatsAppAccounts.map((account) => {
          const status = STATUS_CONFIG[account.status] || STATUS_CONFIG['ERROR'];
          return (
            <motion.div 
              layout
              key={account.id}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-6">
                   <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                     account.type === 'INSTAGRAM' ? 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600' :
                     account.type === 'FACEBOOK' ? 'bg-blue-600' :
                     account.provider === 'ZAPI' || account.provider === 'EVOLUTION' ? 'bg-slate-800' : 'bg-blue-500'
                   }`}>
                     {account.type === 'INSTAGRAM' ? <Instagram className="w-6 h-6" /> :
                      account.type === 'FACEBOOK' ? <Facebook className="w-6 h-6" /> :
                      <MessageSquare className="w-6 h-6" />}
                   </div>
                   <div className="flex items-center gap-2">
                     <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${status.bg} ${status.color}`}>
                        {status.label}
                     </span>
                     <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-300 transition-colors">
                       <MoreVertical className="w-4 h-4" />
                     </button>
                   </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-black text-slate-800 text-lg leading-tight mb-1">{account.name}</h3>
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      Provedor: {account.provider || 'Meta Cloud'}
                    </p>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">
                      Limite: /24hrs
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Número</span>
                     <span className="text-xs font-black text-slate-700">{account.phone_number || account.number || '---'}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Equipe</span>
                     <span className="text-xs font-black text-slate-700">
                        {teams.find(t => t.id === account.team_id || t.id === account.default_team_id)?.name || 'Geral'}
                     </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-[10px] font-bold text-slate-500">
                    {users.find(u => u.id === account.responsible_user_id)?.name.split(' ')[0] || 'Sem Resp.'}
                  </span>
                </div>
                <button 
                  onClick={() => handleDelete(account.id)}
                  className="p-2 text-red-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}

        {/* Placeholder for Instagram/Messenger if requested but not present */}
        <div className="bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center opacity-60 grayscale">
           <Instagram className="w-10 h-10 text-slate-300 mb-4" />
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Instagram & Messenger</p>
           <p className="text-[9px] text-slate-400 mt-2">Clique no botão "+" para integrar novos canais Meta.</p>
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetModal}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                   {addStep !== 'TYPE' && (
                     <button onClick={() => setAddStep('TYPE')} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                       <ArrowLeft className="w-5 h-5 text-slate-400" />
                     </button>
                   )}
                   <div>
                     <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                       {addStep === 'TYPE' ? 'Adicionar Canal' : 
                        addStep === 'PROVIDER' ? 'Escolha o Provedor' :
                        addStep === 'CONFIG' ? 'Configurações' :
                        addStep === 'QR' ? 'Escaneie o QR Code' : 'Concluído'}
                     </h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Viva Destinos Omnichannel</p>
                   </div>
                </div>
                <button onClick={resetModal} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Steps Content */}
              <div className="flex-1 overflow-y-auto p-8">
                {addStep === 'TYPE' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => { setSelectedType('META'); setAddStep('PROVIDER'); }}
                      className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all flex items-center gap-5 group"
                    >
                       <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                          <Cloud className="w-7 h-7" />
                       </div>
                       <div className="text-left">
                          <p className="text-sm font-black text-slate-800">WhatsApp Cloud API</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Oficial da Meta</p>
                       </div>
                    </button>
                    <button 
                      onClick={() => { setSelectedType('QR'); setAddStep('PROVIDER'); }}
                      className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all flex items-center gap-5 group"
                    >
                       <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                          <Smartphone className="w-7 h-7" />
                       </div>
                       <div className="text-left">
                          <p className="text-sm font-black text-slate-800">WhatsApp QR Code</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Provider Externo</p>
                       </div>
                    </button>
                    <button 
                      onClick={() => { setSelectedType('INSTA'); setAddStep('CONFIG'); }}
                      className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-purple-200 hover:bg-purple-50 transition-all flex items-center gap-5 group"
                    >
                       <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                          <Instagram className="w-7 h-7" />
                       </div>
                       <div className="text-left">
                          <p className="text-sm font-black text-slate-800">Instagram</p>
                          <p className="text-[10px] font-bold text-amber-500 uppercase">Exige Token Meta</p>
                       </div>
                    </button>
                    <button 
                      onClick={() => { setSelectedType('FB'); setAddStep('CONFIG'); }}
                      className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center gap-5 group"
                    >
                       <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                          <Facebook className="w-7 h-7" />
                       </div>
                       <div className="text-left">
                          <p className="text-sm font-black text-slate-800">Messenger</p>
                          <p className="text-[10px] font-bold text-amber-500 uppercase">Exige Token Meta</p>
                       </div>
                    </button>
                  </div>
                )}

                {addStep === 'PROVIDER' && (
                  <div className="space-y-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 mb-4">Selecione o provedor de conexão:</p>
                    {selectedType === 'META' ? (
                      <div className="grid grid-cols-1 gap-3">
                         <button 
                          disabled={!configStatus?.meta}
                          onClick={() => { setSelectedProvider('CLOUD'); setAddStep('CONFIG'); }}
                          className={`p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between hover:border-blue-200 hover:shadow-lg transition-all ${!configStatus?.meta ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                         >
                            <div className="text-left">
                              <span className="font-black text-slate-700 block text-sm">Cloud Meta (Oficial)</span>
                              {!configStatus?.meta && <span className="text-[10px] text-red-500 font-bold uppercase">Credenciais Meta não configuradas no servidor.</span>}
                            </div>
                            <ChevronRight className={`w-5 h-5 text-slate-300 ${!configStatus?.meta ? 'hidden' : ''}`} />
                         </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                         <button 
                          disabled={!configStatus?.zapi}
                          onClick={() => { setSelectedProvider('ZAPI'); setAddStep('CONFIG'); }}
                          className={`p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between hover:border-emerald-200 hover:shadow-lg transition-all ${!configStatus?.zapi ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                         >
                            <div className="text-left">
                              <span className="font-black text-slate-700 block text-sm">Z-API</span>
                              {!configStatus?.zapi && <span className="text-[10px] text-red-500 font-bold uppercase">Z-API não configurada no servidor.</span>}
                              {configStatus?.zapi && <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[8px] font-black uppercase">Recomendado</span>}
                            </div>
                            <ChevronRight className={`w-5 h-5 text-slate-300 ${!configStatus?.zapi ? 'hidden' : ''}`} />
                         </button>
                         <button 
                          disabled={!configStatus?.evolution}
                          onClick={() => { setSelectedProvider('EVOLUTION'); setAddStep('CONFIG'); }}
                          className={`p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between hover:border-emerald-200 hover:shadow-lg transition-all ${!configStatus?.evolution ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                         >
                            <div className="text-left">
                              <span className="font-black text-slate-700 block text-sm">Evolution API</span>
                              {!configStatus?.evolution && <span className="text-[10px] text-red-500 font-bold uppercase">Evolution não configurada no servidor.</span>}
                            </div>
                            <ChevronRight className={`w-5 h-5 text-slate-300 ${!configStatus?.evolution ? 'hidden' : ''}`} />
                         </button>
                      </div>
                    )}
                  </div>
                )}

                {addStep === 'CONFIG' && (
                   <form className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                         <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nome do Canal</label>
                           <input 
                            type="text" 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold"
                            placeholder="Ex: Comercial 01"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                          />
                         </div>
                         <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Número do WhatsApp</label>
                           <input 
                            type="text" 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold"
                            placeholder="+55 ..."
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                          />
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                         <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Equipe Responsável</label>
                           <select 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-bold appearance-none"
                            value={formData.teamId}
                            onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                          >
                             <option value="">Selecione...</option>
                             {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                           </select>
                         </div>
                         <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Usuário Responsável</label>
                           <select 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-bold appearance-none"
                            value={formData.responsibleId}
                            onChange={(e) => setFormData({...formData, responsibleId: e.target.value})}
                          >
                             <option value="">Selecione...</option>
                             {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                           </select>
                         </div>
                      </div>

                      {selectedType === 'META' && (
                        <div className="p-6 bg-blue-50 rounded-[2rem] border border-blue-100 space-y-4">
                           <div className="flex items-center gap-3 text-blue-600 font-black text-[10px] uppercase tracking-widest mb-2">
                              <Info className="w-4 h-4" /> Credenciais Meta Cloud
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                             <input type="text" placeholder="Phone Number ID" className="bg-white px-4 py-3 rounded-2xl text-xs outline-none" value={formData.phoneId} onChange={(e) => setFormData({...formData, phoneId: e.target.value})} />
                             <input type="text" placeholder="Business Account ID" className="bg-white px-4 py-3 rounded-2xl text-xs outline-none" value={formData.businessId} onChange={(e) => setFormData({...formData, businessId: e.target.value})} />
                             <input type="text" placeholder="Verify Token" className="bg-white px-4 py-3 rounded-2xl text-xs outline-none col-span-2" value={formData.verifyToken} onChange={(e) => setFormData({...formData, verifyToken: e.target.value})} />
                           </div>
                           <p className="text-[8px] text-blue-400 font-bold uppercase mt-2">O Token de Acesso (Permanente) será lido automaticamente do servidor.</p>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-4 mt-8">
                         <button type="button" onClick={() => setAddStep('PROVIDER')} className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Retornar</button>
                         {selectedType === 'META' ? (
                           <button onClick={handleMetaSave} className="px-10 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100">Configurar Meta</button>
                         ) : (
                           <button onClick={handleStartQR} className="px-10 py-4 bg-emerald-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-100">Próximo Passo</button>
                         )}
                      </div>
                   </form>
                )}

                {addStep === 'INSTRUCTIONS' && (
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mb-6">
                       <MobileIcon className="w-10 h-10" />
                    </div>
                    
                    <h4 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">WhatsApp / QR Code</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Integração por QR Code via {selectedProvider}</p>

                    <div className="flex items-center justify-center gap-4 mb-10">
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">1</div>
                          <span className="text-[9px] font-black text-slate-400 uppercase">Instância</span>
                       </div>
                       <div className="w-12 h-[2px] bg-slate-100 -mt-5" />
                       <div className="flex flex-col items-center gap-2 opacity-40">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[10px] font-black flex items-center justify-center">2</div>
                          <span className="text-[9px] font-black text-slate-400 uppercase">Conectar</span>
                       </div>
                       <div className="w-12 h-[2px] bg-slate-100 -mt-5" />
                       <div className="flex flex-col items-center gap-2 opacity-40">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[10px] font-black flex items-center justify-center">3</div>
                          <span className="text-[9px] font-black text-slate-400 uppercase">Concluído</span>
                       </div>
                    </div>

                    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 max-w-sm mb-10">
                       <p className="text-sm text-slate-600 leading-relaxed font-medium">
                        Acesse o aplicativo do WhatsApp no smartphone, vá em <b>Aparelhos conectados</b> e siga os passos abaixo. Após isso, clique em continuar e realize a leitura do QR Code.
                       </p>
                    </div>

                    <div className="flex items-center gap-4 w-full px-4">
                       <button onClick={resetModal} className="flex-1 p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">Ler posteriormente</button>
                       <button onClick={handleShowQRPage} className="flex-[2] p-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 hover:scale-105 transition-all">Continuar</button>
                    </div>
                  </div>
                )}

                {addStep === 'QR' && (
                  <div className="flex flex-col items-center py-6">
                    <div className="flex items-center justify-center gap-4 mb-8">
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-black flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
                          <span className="text-[9px] font-black text-slate-400 uppercase">Instância</span>
                       </div>
                       <div className="w-12 h-[2px] bg-emerald-100 -mt-5" />
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">2</div>
                          <span className="text-[9px] font-black text-slate-400 uppercase">Conectar</span>
                       </div>
                       <div className="w-12 h-[2px] bg-slate-100 -mt-5" />
                       <div className="flex flex-col items-center gap-2 opacity-40">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[10px] font-black flex items-center justify-center">3</div>
                          <span className="text-[9px] font-black text-slate-400 uppercase">Concluído</span>
                       </div>
                    </div>

                    <div className="w-64 h-64 bg-slate-50 flex items-center justify-center rounded-[3rem] border-4 border-emerald-100 mb-8 relative group overflow-hidden shadow-2xl">
                       {qrCode ? (
                         <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500" />
                       ) : (
                         <RefreshCw className="w-12 h-12 text-emerald-300 animate-spin" />
                       )}
                       {!qrCode && <p className="absolute bottom-10 text-[9px] font-black text-emerald-400 uppercase tracking-widest">Obtendo Código...</p>}
                    </div>

                    <h4 className="text-xl font-black text-slate-800 mb-4 text-center">Realize a leitura do QR Code abaixo:</h4>
                    
                    <div className="grid grid-cols-2 gap-4 w-full px-4 mb-8">
                       <button onClick={() => setAddStep('INSTRUCTIONS')} className="flex items-center justify-center gap-2 p-4 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                          <ArrowLeft className="w-4 h-4" /> Retornar
                       </button>
                       <button onClick={generateQrCode} className="flex items-center justify-center gap-2 p-4 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                          <RefreshCw className="w-4 h-4" /> Atualizar QR
                       </button>
                    </div>

                    <button onClick={handleManualCheckStatus} className="w-full mx-4 p-5 bg-emerald-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:scale-[1.02] transition-all">
                       Continuar
                    </button>
                  </div>
                )}

                {addStep === 'SUCCESS' && (
                   <div className="flex flex-col items-center py-10">
                      <div className="w-24 h-24 bg-emerald-100 rounded-[2.5rem] flex items-center justify-center text-emerald-600 mb-6 shadow-xl shadow-emerald-50">
                        <CheckCircle2 className="w-12 h-12" />
                      </div>
                      <h4 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Canal Conectado!</h4>
                      <p className="text-sm text-slate-500 font-medium italic">"Operação omnichannel ativada para este canal."</p>
                   </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
