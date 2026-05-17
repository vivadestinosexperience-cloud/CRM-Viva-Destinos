/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  MoreVertical, 
  Shield, 
  CheckCircle2, 
  XCircle,
  Filter,
  ArrowLeft,
  Edit2,
  Trash2,
  Key,
  BarChart2,
  UserX,
  Mail,
  Phone,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { toast } from 'sonner';
import { User } from '../../types';

export default function UsersSettingsPage() {
  const navigate = useNavigate();
  const { users, addUser, updateUser, deleteUser, teams } = useAppStore();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'CONSULTANT',
    teamId: '',
    status: 'ACTIVE'
  });

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      updateUser({
        ...editingUser,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        status: formData.status as any,
      });
      toast.success(`Usuário ${formData.name} atualizado com sucesso!`);
    } else {
      const newUser: User = {
        id: `u${Date.now()}`,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role as any,
        status: 'ACTIVE',
        active: true,
        online: false,
        teamId: formData.teamId
      };
      addUser(newUser);
      toast.success('Usuário criado com sucesso!');
    }
    
    resetForm();
    setShowCreateModal(false);
    setEditingUser(null);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'CONSULTANT',
      teamId: '',
      status: 'ACTIVE'
    });
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
      role: (user.role as any) || 'CONSULTANT',
      teamId: user.teamId || '',
      status: user.status || 'ACTIVE'
    });
    setShowCreateModal(true);
    setActiveMenuId(null);
  };

  const handleToggleStatus = (user: User) => {
    const newStatus = user.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    updateUser({ ...user, status: newStatus as any, active: newStatus === 'ACTIVE' });
    toast.info(`Usuário ${user.name} agora está ${newStatus === 'ACTIVE' ? 'Ativo' : 'Inativo'}`);
    setActiveMenuId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir permanentemente o usuário ${name}? Esta ação não pode ser desfeita.`)) {
      deleteUser(id);
      toast.success(`Usuário ${name} removido do sistema`);
    }
    setActiveMenuId(null);
  };

  const handleResetPassword = (name: string) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: `Gerando link de recuperação para ${name}...`,
        success: `Link de redefinição enviado para o e-mail de ${name}`,
        error: 'Erro ao processar solicitação',
      }
    );
    setActiveMenuId(null);
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/app/ajustes')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Gestão de Usuários</h1>
            <p className="text-slate-500 text-sm mt-1">Gerencie os acessos e permissões da sua equipe comercial.</p>
          </div>
        </div>
        <button 
          onClick={() => {
            resetForm();
            setEditingUser(null);
            setShowCreateModal(true);
          }}
          className="bg-primary hover:brightness-110 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/10 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Criar Usuário
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total de Usuários', value: users.length, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Usuários Ativos', value: users.filter(u => u.status !== 'INACTIVE').length, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Administradores', value: users.filter(u => u.role === 'ADMIN').length, icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Inativos', value: users.filter(u => u.status === 'INACTIVE').length, icon: XCircle, color: 'text-slate-600', bg: 'bg-slate-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
              <p className="text-xl font-bold text-slate-800">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por nome, e-mail ou cargo..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
          />
        </div>
        <button 
          onClick={() => toast.info('Filtros avançados em desenvolvimento')}
          className="px-5 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
        >
          <Filter className="w-4 h-4 text-slate-400" />
          Filtros Avançados
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Usuário</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Função / Equipe</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border-2 border-white shadow-sm ring-1 ring-slate-100 overflow-hidden shrink-0">
                        {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                        <p className="text-xs text-slate-400 font-medium truncate">{user.email || 'sem e-mail'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{user.role || 'Consultor'}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                        {teams.find(t => t.id === user.teamId)?.name || 'Geral'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.status === 'INACTIVE' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'INACTIVE' ? 'bg-slate-400' : 'bg-emerald-500'} shadow-sm`}></span>
                      {user.status === 'INACTIVE' ? 'Inativo' : 'Ativo'}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right relative">
                    <div className="flex items-center justify-end gap-2">
                       <button 
                        onClick={() => handleEditClick(user)}
                        className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-primary transition-all border border-transparent hover:border-slate-100 active:scale-95"
                        title="Editar"
                       >
                         <Edit2 className="w-4 h-4" />
                       </button>
                       <button 
                        onClick={() => setActiveMenuId(activeMenuId === user.id ? null : user.id)}
                        className={`p-2.5 rounded-xl transition-all border active:scale-95 ${activeMenuId === user.id ? 'bg-primary/5 border-primary/20 text-primary' : 'text-slate-400 hover:text-primary border-transparent'}`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {activeMenuId === user.id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, x: 10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: 10 }}
                          className="absolute right-20 top-4 z-[50] w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2 text-left"
                        >
                           <div className="px-4 py-2.5 border-b border-slate-50 mb-1">
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Opções de Equipe</p>
                           </div>
                           
                           <button onClick={() => handleToggleStatus(user)} className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-2xl transition-all text-xs font-bold ${user.status === 'INACTIVE' ? 'text-emerald-600' : 'text-amber-600'} group`}>
                              {user.status === 'INACTIVE' ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 group-hover:text-emerald-500" />
                                  Reativar Acesso
                                </>
                              ) : (
                                <>
                                  <UserX className="w-4 h-4 text-amber-400 group-hover:text-amber-500" />
                                  Desativar Temporariamente
                                </>
                              )}
                           </button>
                           
                           <button onClick={() => handleResetPassword(user.name)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-2xl transition-all text-xs font-bold text-slate-600 group">
                              <Key className="w-4 h-4 text-slate-300 group-hover:text-primary" />
                              Resetar Senha / Enviar Link
                           </button>

                           <div className="h-px bg-slate-50 my-1 mx-2" />

                           <button onClick={() => toast.info(`Relatório completo de ${user.name}`)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 rounded-2xl transition-all text-xs font-bold text-slate-600 group">
                              <BarChart2 className="w-4 h-4 text-slate-300 group-hover:text-primary" />
                              Dashboard de Desempenho
                           </button>

                           <button onClick={() => handleDelete(user.id, user.name)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-2xl transition-all text-xs font-bold text-red-600 group">
                              <Trash2 className="w-4 h-4 text-red-300 group-hover:text-red-500" />
                              Excluir Permanentemente
                           </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                         <Search className="w-8 h-8" />
                      </div>
                      <p className="text-slate-400 font-bold text-sm tracking-tight">Nenhum usuário encontrado</p>
                      <button onClick={() => setSearchTerm('')} className="text-primary font-bold text-xs uppercase tracking-widest border-b-2 border-primary/20 hover:border-primary transition-all">Limpar Busca</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowCreateModal(false);
                setEditingUser(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">
                    {editingUser ? 'Editar Usuário' : 'Novo Colaborador'}
                  </h2>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                    {editingUser ? `Atualizando dados de ${editingUser.name}` : 'Preencha os dados de acesso do novo membro'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                  }} 
                  className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-90"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="p-10 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <Plus className="w-3 h-3 text-primary" /> Nome Completo
                    </label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/30 transition-all text-sm font-medium"
                      placeholder="Ex: João da Silva"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <Mail className="w-3 h-3 text-primary" /> E-mail de Acesso
                    </label>
                    <input 
                      required
                      type="email" 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/10 transition-all text-sm font-medium"
                      placeholder="joao@viva.com"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <Shield className="w-3 h-3 text-primary" /> Função / Perfil
                    </label>
                    <div className="relative">
                      <select 
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 appearance-none text-sm font-medium"
                        value={formData.role}
                        onChange={(e) => setFormData({...formData, role: e.target.value})}
                      >
                        <option value="ADMIN">Administrador do Sistema</option>
                        <option value="MANAGER">Gestor de Equipes</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="CONSULTANT">Consultor de Viagens</option>
                        <option value="SUPPORT">Atendimento ao Cliente</option>
                      </select>
                      <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 rotate-90" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <Users className="w-3 h-3 text-primary" /> Equipe
                    </label>
                    <div className="relative">
                      <select 
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 appearance-none text-sm font-medium"
                        value={formData.teamId}
                        onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                      >
                        <option value="">Sem Equipe</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 rotate-90" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                       <Phone className="w-3 h-3 text-primary" /> Telefone / WhatsApp
                    </label>
                    <input 
                      type="tel" 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                      placeholder="(64) 99999-9999"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingUser(null);
                    }}
                    className="px-8 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-10 py-4 bg-primary text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 transition-all active:scale-95"
                  >
                    {editingUser ? 'Salvar Alterações' : 'Criar Conta Viva'}
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
