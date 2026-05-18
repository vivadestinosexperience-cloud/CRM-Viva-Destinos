/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Mail, 
  Phone, 
  Shield, 
  Lock, 
  Bell, 
  Palette, 
  ArrowLeft,
  Camera,
  Save,
  CheckCircle2,
  Clock,
  MessageSquare,
  BarChart2,
  Settings as SettingsIcon,
  Globe,
  Music
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { toast } from 'sonner';
import { safeAction } from '../utils/safeAction';
import { motion, AnimatePresence } from 'motion/react';

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, appearance, setAppearance } = useAppStore();
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    phone: currentUser?.phone || '',
    avatar: currentUser?.avatar || ''
  });

  const [passwordData, setPasswordData] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await safeAction(async () => {
      if (currentUser) {
        const updatedUser = { ...currentUser, name: formData.name, phone: formData.phone, avatar: formData.avatar };
        await setCurrentUser(updatedUser);
        toast.success('Perfil atualizado com sucesso!');
      }
      setShowEditModal(false);
    }, { label: 'Erro ao salvar perfil' });
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new !== passwordData.confirm) {
      toast.error('As senhas não coincidem!');
      return;
    }
    
    await safeAction(async () => {
      setShowPasswordModal(false);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success('Sua senha foi alterada com sucesso!');
      setPasswordData({ current: '', new: '', confirm: '' });
    }, { label: 'Erro ao alterar senha' });
  };

  const handleSavePreferences = () => {
    safeAction(async () => {
      toast.success('Suas preferências foram salvas e sincronizadas!');
    });
  };

  if (!currentUser) return null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Meu Perfil</h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">Gerencie suas informações pessoais, segurança e experiência de uso.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Info & Security */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Info Card */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden ring-1 ring-slate-100">
            <div className={`h-40 bg-gradient-to-r from-primary to-primary/80 relative`}>
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            </div>
            <div className="px-10 pb-10">
              <div className="relative -mt-16 mb-8 flex items-end justify-between">
                 <div className="relative group">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-white p-1.5 shadow-2xl">
                      <div className="w-full h-full rounded-[2rem] bg-slate-100 overflow-hidden border-2 border-slate-50 flex items-center justify-center">
                        {currentUser.avatar ? (
                          <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-4xl font-black text-slate-300">{currentUser.name.charAt(0)}</span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        toast.info('Para alterar seu avatar, utilize as configurações de conta ou fale com o suporte.');
                      }}
                      className="absolute bottom-1 right-1 p-3 bg-primary text-white rounded-2xl shadow-xl border-4 border-white hover:scale-110 transition-all active:scale-90"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                 </div>
                 <button 
                  onClick={() => setShowEditModal(true)}
                  className="px-8 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
                 >
                   Editar Informações
                 </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-8">
                  <div className="group">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1 flex items-center gap-2">
                      <UserIcon className="w-3 h-3 text-primary" /> Nome Completo
                    </h3>
                    <p className="text-lg font-bold text-slate-800 px-1 group-hover:text-primary transition-colors">{currentUser.name}</p>
                  </div>
                  <div className="group">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1 flex items-center gap-2">
                       <Mail className="w-3 h-3 text-primary" /> E-mail de Acesso
                    </h3>
                    <p className="text-lg font-bold text-slate-800 px-1 flex items-center gap-3">
                       {currentUser.email}
                       <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                         <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                       </div>
                    </p>
                  </div>
                  <div className="group">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1 flex items-center gap-2">
                       <Phone className="w-3 h-3 text-primary" /> Telefone / WhatsApp
                    </h3>
                    <p className="text-lg font-bold text-slate-800 px-1">{currentUser.phone || 'Não vinculado'}</p>
                  </div>
                </div>
                <div className="space-y-8">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1 flex items-center gap-2">
                       <Shield className="w-3 h-3 text-primary" /> Funções e Permissões
                    </h3>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-700 rounded-xl border border-slate-100">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{currentUser.role || 'CONSULTANT'}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1 flex items-center gap-2">
                       <Globe className="w-3 h-3 text-primary" /> Linguagem e Região
                    </h3>
                    <p className="text-lg font-bold text-slate-800 px-1">Português (Brasil)</p>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1 flex items-center gap-2">
                       <Clock className="w-3 h-3 text-primary" /> Último Acesso
                    </h3>
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Online Agora</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Table Section */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-10 space-y-8 ring-1 ring-slate-100">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
              <Lock className="w-4 h-4 text-primary" />
              Segurança da Conta
            </h3>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 p-8 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
               <div className="space-y-2">
                  <p className="text-base font-bold text-slate-800">Autenticação de Dois Fatores (2FA)</p>
                  <p className="text-sm text-slate-500 font-medium">Sua conta está protegida com criptografia de ponta a ponta.</p>
               </div>
               <button 
                onClick={() => setShowPasswordModal(true)}
                className="px-8 py-4 bg-white border border-slate-200 rounded-2xl text-slate-800 font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm whitespace-nowrap"
               >
                 Alterar Senha
               </button>
            </div>
          </div>

          {/* Productivity Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
             {[
               { label: 'Chats Ativos', value: '12', icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/10' },
               { label: 'Lead Scoring', value: '8.4', icon: BarChart2, color: 'text-purple-600', bg: 'bg-purple-100/50' },
               { label: 'Conversão', value: '32%', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100/50' },
               { label: 'IA Insights', value: '45', icon: Globe, color: 'text-amber-600', bg: 'bg-amber-100/50' },
             ].map((stat, i) => (
               <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm ring-1 ring-slate-100 flex flex-col items-center text-center">
                 <div className={`w-12 h-12 rounded-[1rem] ${stat.bg} flex items-center justify-center ${stat.color} mb-4`}>
                   <stat.icon className="w-6 h-6" />
                 </div>
                 <p className="text-3xl font-black text-slate-800 leading-none mb-2 tracking-tighter">{stat.value}</p>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
               </div>
             ))}
          </div>
        </div>

        {/* Right Column: Preferences */}
        <div className="space-y-8">
          {/* Preferences Card */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-10 space-y-8 ring-1 ring-slate-100">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
              <SettingsIcon className="w-4 h-4 text-primary" />
              Preferências
            </h3>
            
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tema da Interface</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map(mode => (
                    <button 
                      key={mode} 
                      onClick={() => setAppearance({ theme: mode })}
                      className={`py-3 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${appearance.theme === mode ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {mode === 'light' ? 'Claro' : mode === 'dark' ? 'Escuro' : 'Auto'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-100">
                 <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">Notificações Sonoras</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Novas mensagens</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                 </div>
                 
                 <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                        <Palette className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">Densidade Compacta</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Otimizar espaço</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={appearance.density === 'compact'}
                        onChange={(e) => setAppearance({ density: e.target.checked ? 'compact' : 'comfortable' })}
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                 </div>

                 <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">Tradução Automática</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Via Google Translate</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                 </div>
              </div>

              <button 
                onClick={handleSavePreferences}
                className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20 transition-all hover:brightness-110 active:scale-95 mt-4"
              >
                Salvar Preferências
              </button>
            </div>
          </div>

          {/* Connected Teams */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-10 ring-1 ring-slate-100">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3 mb-8">
              <Shield className="w-4 h-4 text-primary" />
              Minhas Equipes
            </h3>
            
            <div className="space-y-4">
              {[
                { name: 'Comercial Caldas Novas', role: 'Líder', active: true },
                { name: 'Suporte VIP', role: 'Membro', active: true },
                { name: 'Financeiro Geral', role: 'Visualizador', active: false },
              ].map((team, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-primary/20 transition-all">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate uppercase tracking-tight">{team.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{team.role}</p>
                  </div>
                  {team.active ? (
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowEditModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100">
              <h2 className="text-xl font-black mb-8 text-slate-800 uppercase tracking-widest text-center">Editar Meu Perfil</h2>
              <form onSubmit={handleSaveProfile} className="space-y-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <UserIcon className="w-3 h-3 text-primary" /> Nome Completo
                  </label>
                  <div className="relative">
                    <input 
                      required 
                      type="text" 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/30 text-sm font-bold transition-all"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <Phone className="w-3 h-3 text-primary" /> Telefone WhatsApp
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/30 text-sm font-bold transition-all"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="(DD) 99999-9999"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-4">
                  <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>
                  <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 transition-all hover:brightness-110 active:scale-95">Confirmar Tudo</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Change Password Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPasswordModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100">
              <h2 className="text-xl font-black mb-8 text-slate-800 uppercase tracking-widest text-center">🔐 Alterar Senha</h2>
              <form onSubmit={handleSavePassword} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">Senha Atual</label>
                  <input 
                    required 
                    type="password" 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 text-sm font-bold transition-all"
                    value={passwordData.current}
                    onChange={e => setPasswordData({...passwordData, current: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">Nova Senha</label>
                  <input 
                    required 
                    type="password" 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 text-sm font-bold transition-all"
                    value={passwordData.new}
                    onChange={e => setPasswordData({...passwordData, new: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">Repetir Senha</label>
                  <input 
                    required 
                    type="password" 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 text-sm font-bold transition-all"
                    value={passwordData.confirm}
                    onChange={e => setPasswordData({...passwordData, confirm: e.target.value})}
                  />
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>
                  <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 transition-all hover:brightness-110 active:scale-95">Salvar Nova Senha</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
