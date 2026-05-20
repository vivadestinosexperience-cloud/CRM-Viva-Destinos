/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { toast } from 'sonner';
import { authorizedFetch, safeReadJson } from '../../services/api';
import { User, UserRole } from '../../types';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { safeAction } from '../../utils/safeAction';

export default function UsersSettingsPage() {
  const navigate = useNavigate();
  const { users, addUser, updateUser, deleteUser, teams, refreshData: loadUsers } = useAppStore();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Refresh users presence every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadUsers();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadUsers]);

  const isOnline = (user: any) => {
    // If we have enhanced user presence table, we use that. 
    // In this app, we're syncing user.is_online and user.last_seen_at
    if (!user.is_online) return false;
    if (!user.last_seen_at) return false;
    const lastSeen = new Date(user.last_seen_at).getTime();
    const now = Date.now();
    return (now - lastSeen) < 90000; // 90 seconds threshold
  };

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'agent',
    teamId: 'comercial',
    status: 'ACTIVE'
  });

  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const runDiagnostic = async () => {
    setIsRunningDiagnostic(true);
    await safeAction(async () => {
      const res = await authorizedFetch('/api/admin/users/diagnostic');
      const data = await safeReadJson(res);
      if (data.success) {
        setDiagnosticData(data.diagnosis);
        setShowDiagnostic(true);
      }
    }, { label: 'Erro ao rodar diagnóstico' });
    setIsRunningDiagnostic(false);
  };

  const handleFixUser = async (user: any) => {
    toast.info(`Tentando recriar acesso para ${user.name}...`);
    await safeAction(async () => {
      const res = await authorizedFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          role: user.role || 'agent',
          team_id: user.team_id || 'comercial',
          team_name: user.team_name || 'Comercial',
          is_active: true,
          // Senha padrão temporária para manutenção
          password: 'Viva' + Math.random().toString(36).slice(-6) + '@!',
          confirmPassword: '' // backend doesn't check confirmPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Acesso recriado para ${user.name}. Nova senha gerada.`);
        loadUsers();
        if (showDiagnostic) runDiagnostic();
      } else {
        throw data;
      }
    }, { label: 'Erro ao recriar acesso' });
  };
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetData, setResetData] = useState({
    password: '',
    confirmPassword: ''
  });

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    safeAction(async () => {
      const selectedTeam = teams.find(t => t.id === formData.teamId);
      const team_name = selectedTeam?.name || (formData.teamId === 'comercial' ? 'Comercial' : '');

      if (editingUser) {
        await updateUser({
          ...editingUser,
          name: formData.name,
          role: formData.role as UserRole,
          team_id: formData.teamId,
          team_name,
          is_active: formData.status === 'ACTIVE'
        } as any);
        toast.success(`Usuário ${formData.name} atualizado com sucesso!`);
      } else {
        // Enforce password for new users
        if (!formData.password || formData.password !== formData.confirmPassword) {
          toast.error("As senhas não conferem ou estão vazias.");
          return;
        }

        const newUser: any = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          role: formData.role,
          team_id: formData.teamId || 'comercial',
          team_name: team_name || 'Comercial',
          is_active: true
        };
        await addUser(newUser);
        toast.success('Usuário criado com sucesso!');
      }
      
      resetForm();
      setShowCreateModal(false);
      setEditingUser(null);
    }, { label: 'Erro ao salvar usuário' });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      role: 'agent',
      teamId: 'comercial',
      status: 'ACTIVE'
    });
  };

  const handleEditClick = (user: any) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      confirmPassword: '',
      role: user.role || 'agent',
      teamId: user.team_id || '',
      status: user.is_active === false ? 'INACTIVE' : 'ACTIVE'
    });
    setShowCreateModal(true);
    setActiveMenuId(null);
  };

  const handleToggleStatus = (user: User) => {
    safeAction(async () => {
      const newStatus = user.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
      await updateUser({ ...user, status: newStatus as any, active: newStatus === 'ACTIVE' });
      toast.info(`Usuário ${user.name} agora está ${newStatus === 'ACTIVE' ? 'Ativo' : 'Inativo'}`);
      setActiveMenuId(null);
    });
  };

  const handleDelete = (id: string, name: string) => {
    safeAction(async () => {
      await deleteUser(id);
      toast.success(`Usuário ${name} removido do sistema`);
      setActiveMenuId(null);
    });
  };

  const handleResetPassword = (user: User) => {
    setResettingUser(user);
    setResetData({ password: '', confirmPassword: '' });
    setShowResetModal(true);
    setActiveMenuId(null);
  };

  const submitResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    safeAction(async () => {
      const { profilesService } = await import('../../services/dataService');
      await profilesService.resetPassword(resettingUser.id, resetData);
      toast.success('Senha redefinida com sucesso.');
      setShowResetModal(false);
      setResettingUser(null);
    }, { label: 'Erro ao redefinir senha' });
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
        <div className="flex items-center gap-3">
          <button 
            onClick={runDiagnostic}
            disabled={isRunningDiagnostic}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95 border border-slate-200 ${isRunningDiagnostic ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <RefreshCw className={`w-4 h-4 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
            {isRunningDiagnostic ? 'Diagnosticando...' : 'Diagnóstico'}
          </button>
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
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border-2 border-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
                          {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${isOnline(user) ? 'bg-emerald-500' : 'bg-slate-300'}`} title={isOnline(user) ? 'Online' : 'Offline'}></div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                          {isOnline(user) && (
                            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100">Online</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium truncate">{user.email || 'sem e-mail'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        {user.role === 'admin' ? 'Administrador' : 
                         user.role === 'supervisor' ? 'Supervisor' : 
                         user.role === 'agent' ? 'Atendente' : 
                         user.role === 'viewer' ? 'Visualizador' : 
                         user.role || 'Consultor'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                        {user.team_name || teams.find(t => t.id === (user.team_id || user.teamId))?.name || 'Geral'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.is_active === false || user.status === 'INACTIVE' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.is_active === false || user.status === 'INACTIVE' ? 'bg-slate-400' : 'bg-emerald-500'} shadow-sm`}></span>
                      {user.is_active === false || user.status === 'INACTIVE' ? 'Inativo' : 'Ativo'}
                    </div>
                    {(user as any).must_change_password && (
                       <p className="text-[8px] text-amber-500 font-black uppercase mt-1">Exige troca de senha</p>
                    )}
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
                           
                           <button onClick={() => handleResetPassword(user)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-2xl transition-all text-xs font-bold text-slate-600 group">
                              <Key className="w-4 h-4 text-slate-300 group-hover:text-primary" />
                              Redefinir Senha
                           </button>

                           <div className="h-px bg-slate-50 my-1 mx-2" />

                           <button onClick={() => toast.info(`Relatório completo de ${user.name}`)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 rounded-2xl transition-all text-xs font-bold text-slate-600 group">
                              <BarChart2 className="w-4 h-4 text-slate-300 group-hover:text-primary" />
                              Dashboard de Desempenho
                           </button>

                           <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(user.id, user.name);
                            }} 
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-2xl transition-all text-xs font-bold text-red-600 group"
                           >
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
                      disabled={!!editingUser}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/10 transition-all text-sm font-medium disabled:opacity-50"
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
                        <option value="admin">Administrador</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="agent">Atendente</option>
                        <option value="viewer">Visualizador</option>
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
                        <option value="comercial">Comercial</option>
                        {teams.filter(t => t.id !== 'comercial').map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 rotate-90" />
                    </div>
                  </div>

                  {!editingUser && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                          <Key className="w-3 h-3 text-primary" /> Senha Inicial
                        </label>
                        <input 
                          required
                          type="password" 
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium transition-all"
                          placeholder="Mínimo 8 caracteres"
                          value={formData.password}
                          onChange={(e) => setFormData({...formData, password: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                          <Key className="w-3 h-3 text-primary" /> Confirmar Senha
                        </label>
                        <input 
                          required
                          type="password" 
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium transition-all"
                          placeholder="Repita a senha"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                        />
                      </div>
                    </>
                  )}

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

      {/* User Diagnostic Modal */}
      <AnimatePresence>
        {showDiagnostic && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowDiagnostic(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[80vh]">
               <div className="p-8 border-b border-slate-50 bg-slate-50/30 shrink-0">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                     <Shield className="w-6 h-6 text-primary" /> Diagnóstico de Identidade
                  </h2>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                     Identificando usuários com desajustes de autenticação ou perfil.
                  </p>
               </div>
               
               <div className="p-8 overflow-y-auto space-y-8">
                  {diagnosticData ? (
                    <>
                      {/* Section: Missing Auth ID */}
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                           <UserX className="w-4 h-4" /> Usuários Sem Vínculo de Autenticação ({diagnosticData.missing_auth_id.length})
                        </h3>
                        {diagnosticData.missing_auth_id.length > 0 ? (
                          <div className="grid gap-3">
                            {diagnosticData.missing_auth_id.map((user: any) => (
                              <div key={user.id} className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-amber-900">{user.name}</p>
                                  <p className="text-[10px] text-amber-700 font-bold uppercase">{user.email || 'Sem e-mail'}</p>
                                </div>
                                <button 
                                  onClick={() => handleFixUser(user)}
                                  className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-95 shadow-sm"
                                >
                                  Recriar Acesso
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">✅ Nenhum usuário afetado.</p>
                        )}
                      </div>

                      {/* Section: Duplicate Auth ID */}
                      <div className="space-y-4 pt-4 border-t border-slate-50">
                        <h3 className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                           <XCircle className="w-4 h-4" /> IDs de Autenticação Duplicados ({diagnosticData.duplicate_auth_ids.length})
                        </h3>
                        {diagnosticData.duplicate_auth_ids.length > 0 ? (
                          <div className="grid gap-3">
                            {diagnosticData.duplicate_auth_ids.map((dup: any) => (
                              <div key={dup.auth_user_id} className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                                <p className="text-[10px] font-black text-red-700 uppercase mb-2">ID Comprometido: {dup.auth_user_id}</p>
                                <div className="space-y-1">
                                  {dup.users.map((u: any) => (
                                    <p key={u.id} className="text-xs font-bold text-red-900">• {u.name} ({u.email})</p>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">✅ Nenhum conflito detectado.</p>
                        )}
                      </div>

                      {/* Section: Team Issues */}
                      <div className="space-y-4 pt-4 border-t border-slate-50">
                        <h3 className="text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-2">
                           <Users className="w-4 h-4" /> Usuários Sem Equipe Configurada ({diagnosticData.no_team_link.length})
                        </h3>
                        {diagnosticData.no_team_link.length > 0 ? (
                          <div className="grid gap-3">
                            {diagnosticData.no_team_link.map((user: any) => (
                              <div key={user.id} className="p-4 bg-purple-50 border border-purple-100 rounded-2xl flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-purple-900">{user.name}</p>
                                  <p className="text-[10px] text-purple-700 font-bold uppercase">{user.email}</p>
                                </div>
                                <button 
                                  onClick={() => handleEditClick(user)}
                                  className="px-4 py-2 bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 transition-all active:scale-95 shadow-sm"
                                >
                                  Vincular Equipe
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">✅ Todos usuários vinculados.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                      <RefreshCw className="w-12 h-12 text-slate-200 animate-spin" />
                      <p className="text-slate-400 font-bold text-sm tracking-tight">Analisando base de dados...</p>
                    </div>
                  )}
               </div>

               <div className="p-8 border-t border-slate-50 bg-slate-50/30 flex justify-end shrink-0">
                  <button 
                    onClick={() => setShowDiagnostic(false)}
                    className="px-10 py-4 bg-slate-800 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-slate-900/20 hover:brightness-110 transition-all active:scale-95"
                  >
                    Fechar Diagnóstico
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showResetModal && resettingUser && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => {
                 setShowResetModal(false);
                 setResettingUser(null);
               }}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
               <div className="p-8 border-b border-slate-50 bg-slate-50/30">
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                     <Key className="w-5 h-5 text-primary" /> Redefinir Senha
                  </h2>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                     Defina uma nova senha de acesso para {resettingUser.name}
                  </p>
               </div>
               
               <form onSubmit={submitResetPassword} className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Nova Senha</label>
                    <input 
                      required
                      type="password" 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                      placeholder="Mínimo 8 caracteres"
                      value={resetData.password}
                      onChange={(e) => setResetData({...resetData, password: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Confirmar Nova Senha</label>
                    <input 
                      required
                      type="password" 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                      placeholder="Repita a nova senha"
                      value={resetData.confirmPassword}
                      onChange={(e) => setResetData({...resetData, confirmPassword: e.target.value})}
                    />
                  </div>
                  
                  <div className="flex items-center justify-end gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => {
                        setShowResetModal(false);
                        setResettingUser(null);
                      }}
                      className="px-6 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="px-8 py-4 bg-slate-800 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-slate-900/20 hover:brightness-110 transition-all active:scale-95"
                    >
                      Alterar Senha
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
