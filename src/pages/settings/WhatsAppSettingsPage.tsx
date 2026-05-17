/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, 
  Smartphone, 
  Settings2, 
  Zap, 
  Cloud, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  Key,
  Globe,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../../store/useAppStore';
import { WhatsAppAccount } from '../../types';
import { toast } from 'sonner';

export default function WhatsAppSettingsPage() {
  const { whatsAppAccounts, addWhatsAppAccount, updateWhatsAppAccount, deleteWhatsAppAccount, isSaving } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'official' | 'qr'>('official');

  const [formData, setFormData] = useState({
    name: '',
    number: '',
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    verifyToken: '',
    qrProviderUrl: '',
    qrApiKey: '',
    qrInstanceId: ''
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Informe um nome para a conexão');
      return;
    }

    const newAccount: Partial<WhatsAppAccount> = {
      id: `wa-${Date.now()}`,
      name: formData.name,
      number: formData.number,
      type: activeTab === 'official' ? 'CLOUD_API' : 'EXTERNAL_QR',
      status: 'DISCONNECTED',
      quality: 'HIGH',
      config: activeTab === 'official' ? {
        accessToken: formData.accessToken,
        phoneNumberId: formData.phoneNumberId,
        businessAccountId: formData.businessAccountId,
        verifyToken: formData.verifyToken
      } : {
        url: formData.qrProviderUrl,
        apiKey: formData.qrApiKey,
        instanceId: formData.qrInstanceId
      },
      created_at: new Date().toISOString()
    };

    try {
      await addWhatsAppAccount(newAccount as WhatsAppAccount);
      toast.success('Conexão configurada com sucesso!');
      setShowAddModal(false);
      setFormData({
        name: '',
        number: '',
        accessToken: '',
        phoneNumberId: '',
        businessAccountId: '',
        verifyToken: '',
        qrProviderUrl: '',
        qrApiKey: '',
        qrInstanceId: ''
      });
    } catch (err) {
      toast.error('Erro ao salvar conexão');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Deseja realmente remover esta conexão?')) {
      deleteWhatsAppAccount(id);
      toast.success('Conexão removida');
    }
  };

  const handleSync = (id: string) => {
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 2000)),
      {
        loading: 'Sincronizando com WhatsApp...',
        success: 'Sincronização concluída!',
        error: 'Erro na sincronização'
      }
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans animate-in fade-in duration-500">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-4">
            Integração WhatsApp
            <div className="bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-200">
              Omnichannel Ativo
            </div>
          </h2>
          <p className="text-slate-500 mt-2 font-medium">Gerencie suas linhas oficiais e provedores de QR Code.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-blue-100 transition-all hover:bg-blue-700 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Conectar Nova Linha
        </button>
      </header>

      {/* Stats Quick View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner">
             <Zap className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Linhas Ativas</p>
            <p className="text-2xl font-black text-slate-800">{whatsAppAccounts.filter(a => a.status === 'CONNECTED').length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-inner">
             <Smartphone className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Conexões</p>
            <p className="text-2xl font-black text-slate-800">{whatsAppAccounts.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shadow-inner">
             <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Alertas</p>
            <p className="text-2xl font-black text-slate-800">{whatsAppAccounts.filter(a => a.status === 'ERROR').length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {whatsAppAccounts.map((account) => (
          <motion.div 
            layout
            key={account.id}
            className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all border-l-[6px] border-l-emerald-500"
            style={{ borderLeftColor: account.status === 'CONNECTED' ? '#10b981' : '#f43f5e' }}
          >
            <div className="p-8 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-lg transform -rotate-3 ${account.type === 'CLOUD_API' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'}`}>
                  {account.type === 'CLOUD_API' ? <Cloud className="w-8 h-8" /> : <Smartphone className="w-8 h-8" />}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-xl font-black text-slate-800">{account.name}</h4>
                    <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${account.status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {account.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm font-bold text-slate-400 flex items-center gap-2">
                       <Zap className="w-3.5 h-3.5 text-blue-500" /> {account.number || 'Linha Base'}
                    </p>
                    <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{account.type === 'CLOUD_API' ? 'Cloud API Official' : 'QR Code Provider'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                 <div className="bg-slate-50 px-4 py-2 rounded-2xl flex items-center gap-4 border border-slate-100 mr-4">
                    <div className="text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Qualidade</p>
                       <p className="text-xs font-black text-emerald-600 uppercase tracking-tighter">ALTA / {account.quality || 'HIGH'}</p>
                    </div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div className="text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Última Sync</p>
                       <p className="text-xs font-black text-slate-600">{account.last_sync ? new Date(account.last_sync).toLocaleTimeString() : 'Agora'}</p>
                    </div>
                 </div>

                <button 
                  onClick={() => handleSync(account.id)}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-90"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <div className="h-8 w-px bg-slate-100 mx-1"></div>
                <button 
                  onClick={() => handleDelete(account.id)}
                  className="p-3.5 hover:bg-red-50 rounded-2xl text-red-400 transition-all active:scale-90"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {whatsAppAccounts.length === 0 && (
          <div className="py-24 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-10">
            <div className="w-20 h-20 bg-white rounded-3xl shadow-lg flex items-center justify-center text-slate-200 mb-6">
               <Smartphone className="w-10 h-10" />
            </div>
            <h4 className="text-xl font-bold text-slate-400">Nenhuma conexão ativa</h4>
            <p className="text-slate-400 text-sm mt-2 max-w-sm">Conecte sua conta oficial da Meta ou utilize um provedor de QR Code para começar os atendimentos.</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="mt-8 bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-blue-100 hover:brightness-110 transition-all active:scale-95"
            >
              Conectar Agora
            </button>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-3xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-white"
            >
              <div className="p-10 border-b border-slate-100 flex items-center justify-between">
                <div>
                   <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Configurar Conexão</h3>
                   <p className="text-slate-400 font-medium">Escolha o método de conexão para sua linha.</p>
                </div>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                   <button 
                    onClick={() => setActiveTab('official')}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'official' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}
                   >
                     OFICIAL (Meta API)
                   </button>
                   <button 
                    onClick={() => setActiveTab('qr')}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'qr' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-400'}`}
                   >
                     VIA QR CODE
                   </button>
                </div>
              </div>

              <form onSubmit={handleAdd} className="p-10">
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="space-y-2 flex flex-col">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                      <Settings2 className="w-3 h-3" /> Nome da Conexão
                    </label>
                    <input 
                      type="text"
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-700"
                      placeholder="Ex: WhatsApp Comercial"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <Smartphone className="w-3 h-3" /> Número do Telefone
                    </label>
                    <input 
                      type="text"
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-700"
                      placeholder="+55 62 9..."
                      value={formData.number}
                      onChange={(e) => setFormData({...formData, number: e.target.value})}
                    />
                  </div>
                </div>

                <div className="bg-slate-50 rounded-[2.5rem] p-8 space-y-6 border border-slate-100">
                  {activeTab === 'official' ? (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="col-span-2 space-y-2 flex flex-col">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
                           <Key className="w-3 h-3" /> Access Token (Meta)
                         </label>
                         <input 
                          type="password"
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none font-mono text-xs text-slate-600 shadow-sm"
                          placeholder="EAAB..."
                          value={formData.accessToken}
                          onChange={(e) => setFormData({...formData, accessToken: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2 flex flex-col">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Phone Number ID</label>
                         <input 
                          type="text"
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none text-sm font-bold text-slate-600 shadow-sm"
                          placeholder="1098..."
                          value={formData.phoneNumberId}
                          onChange={(e) => setFormData({...formData, phoneNumberId: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2 flex flex-col">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Business Account ID</label>
                         <input 
                          type="text"
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none text-sm font-bold text-slate-600 shadow-sm"
                          placeholder="9283..."
                          value={formData.businessAccountId}
                          onChange={(e) => setFormData({...formData, businessAccountId: e.target.value})}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2 space-y-2 flex flex-col">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
                             <Globe className="w-3 h-3" /> URL do Provedor (API Base)
                           </label>
                           <input 
                            type="text"
                            className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none text-sm font-bold text-slate-600 shadow-sm"
                            placeholder="https://api.provider.com"
                            value={formData.qrProviderUrl}
                            onChange={(e) => setFormData({...formData, qrProviderUrl: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2 flex flex-col">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
                             <Key className="w-3 h-3" /> API Key
                           </label>
                           <input 
                            type="password"
                            className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none font-mono text-xs text-slate-600 shadow-sm"
                            placeholder="sk-..."
                            value={formData.qrApiKey}
                            onChange={(e) => setFormData({...formData, qrApiKey: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2 flex flex-col">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
                             <Database className="w-3 h-3" /> Instance ID
                           </label>
                           <input 
                            type="text"
                            className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none text-sm font-bold text-slate-600 shadow-sm"
                            placeholder="inst-001"
                            value={formData.qrInstanceId}
                            onChange={(e) => setFormData({...formData, qrInstanceId: e.target.value})}
                          />
                        </div>
                    </div>
                  )}
                </div>

                <div className="mt-10 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                     <AlertCircle className="w-4 h-4" /> Certifique-se de preencher todos os dados corretamente.
                  </div>
                  <div className="flex items-center gap-5">
                    <button 
                      type="button" 
                      onClick={() => setShowAddModal(false)}
                      className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="px-10 py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-blue-100 hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-3"
                    >
                      {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirmar Conexão'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
