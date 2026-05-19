/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Plus, 
  Search, 
  MoreVertical, 
  Users, 
  Layers, 
  ArrowLeft,
  ChevronRight,
  Smartphone,
  Edit2,
  Trash2,
  UserPlus,
  X,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  UserCheck,
  UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { Team, TeamMember, User } from '../../types';
import { toast } from 'sonner';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { safeAction } from '../../utils/safeAction';

export default function TeamsSettingsPage() {
  const navigate = useNavigate();
  const { users } = useAppStore();
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  function getApiBaseUrl() {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl) return envUrl.replace(/\/$/, "");
    return "";
  }

  async function loadTeams() {
    setLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams`);
      const data = await res.json();
      if (data.success) {
        setTeams(data.teams || []);
      } else {
        toast.error(data.error || "Erro ao carregar equipes");
      }
    } catch (err) {
      toast.error("Erro de conexão ao carregar equipes");
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamMembers(teamId: string) {
    setLoadingMembers(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams/${teamId}/members`);
      const data = await res.json();
      if (data.success) {
        setTeamMembers(data.members || []);
      }
    } catch (err) {
      console.error("Erro ao carregar membros", err);
    } finally {
      setLoadingMembers(false);
    }
  }

  useEffect(() => {
    loadTeams();
    
    // Refresh members presence every 15 seconds if modal is open
    const interval = setInterval(() => {
      if (showMembersModal && selectedTeam) {
        loadTeamMembers(selectedTeam.id);
      }
    }, 15000);
    
    return () => clearInterval(interval);
  }, [showMembersModal, selectedTeam]);

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const method = editingTeam ? 'PATCH' : 'POST';
      const url = editingTeam ? `${baseUrl}/api/teams/${editingTeam.id}` : `${baseUrl}/api/teams`;
      
      const payload = {
        ...formData,
        distribution_enabled: editingTeam ? editingTeam.distribution_enabled : true,
        distribution_mode: editingTeam ? editingTeam.distribution_mode : 'round_robin'
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw data;

      toast.success(editingTeam ? "Equipe atualizada!" : "Equipe criada com sucesso!");
      loadTeams();
      setShowModal(false);
      setEditingTeam(null);
      setFormData({ name: '', description: '', is_active: true });
    }, { label: 'Erro ao salvar equipe' });
  };

  const handleDeleteTeam = async (team: Team) => {
    if (team.id === 'comercial') {
      toast.error("A equipe Comercial não pode ser excluída.");
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir a equipe "${team.name}"?`)) return;

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams/${team.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw data;

      toast.success("Equipe excluída");
      loadTeams();
    }, { label: 'Erro ao excluir equipe' });
  };

  const handleUpdateMember = async (userId: string, updates: Partial<TeamMember>) => {
    if (!selectedTeam) return;

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams/${selectedTeam.id}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const data = await res.json();
      if (!res.ok) throw data;

      toast.success("Membro atualizado");
      loadTeamMembers(selectedTeam.id);
    }, { label: 'Erro ao atualizar membro' });
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedTeam) return;
    const user = users.find(u => u.id === userId);
    if (!user) return;

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          role_in_team: 'agent',
          is_active: true,
          receives_queue: true,
          is_available: true
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw data;

      toast.success(`${user.name} adicionado à equipe`);
      loadTeamMembers(selectedTeam.id);
    }, { label: 'Erro ao adicionar membro' });
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    
    if (!window.confirm("Remover este usuário da equipe?")) return;

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams/${selectedTeam.id}/members/${userId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (!res.ok) throw data;

      toast.success("Membro removido");
      loadTeamMembers(selectedTeam.id);
    }, { label: 'Erro ao remover membro' });
  };

  const toggleDistribution = async (team: Team) => {
    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/teams/${team.id}/distribution`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_enabled: !team.distribution_enabled,
          distribution_mode: team.distribution_mode || 'round_robin'
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw data;

      toast.success(`Distribuição ${!team.distribution_enabled ? 'ativada' : 'desativada'} para ${team.name}`);
      loadTeams();
    }, { label: 'Erro ao alterar distribuição' });
  };

  const openMembersModal = (team: Team) => {
    setSelectedTeam(team);
    loadTeamMembers(team.id);
    setShowMembersModal(true);
    setActiveMenuId(null);
  };

  const isOnline = (member: TeamMember) => {
    if (!member.is_online) return false;
    if (!member.last_seen_at) return false;
    const lastSeen = new Date(member.last_seen_at).getTime();
    const now = Date.now();
    return (now - lastSeen) < 90000; // 90 seconds threshold
  };

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
            <h1 className="text-2xl font-bold text-slate-800">Gerenciamento de Equipes</h1>
            <p className="text-slate-500 text-sm mt-1">Configure as filas de atendimento e atribua usuários.</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setEditingTeam(null);
            setFormData({ name: '', description: '', is_active: true });
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nova Equipe
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 opacity-40">
          <RefreshCw className="w-10 h-10 animate-spin mb-4 text-blue-600" />
          <p className="font-bold uppercase tracking-widest text-xs">Carregando equipes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team, index) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
            >
              {team.is_active ? (
                <div className="absolute top-0 right-0 p-2">
                  <div className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter shadow-sm border border-emerald-200">Ativa</div>
                </div>
              ) : (
                <div className="absolute top-0 right-0 p-2">
                   <div className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter">Inativa</div>
                </div>
              )}

              <div className="flex items-start justify-between mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-slate-500 border border-slate-100 ${team.id === 'comercial' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-slate-50'}`}>
                  {team.id === 'comercial' ? <Shield className="w-6 h-6" /> : <Briefcase className="w-6 h-6" />}
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenuId(activeMenuId === team.id ? null : team.id)}
                    className={`p-2 rounded-lg transition-all border ${activeMenuId === team.id ? 'bg-blue-50 border-blue-100 text-blue-600' : 'hover:bg-slate-50 text-slate-400 border-transparent'}`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {activeMenuId === team.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        className="absolute right-0 top-full mt-2 z-[50] w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2"
                      >
                         <button 
                           onClick={() => {
                             setEditingTeam(team);
                             setFormData({
                               name: team.name,
                               description: team.description || '',
                               is_active: !!team.is_active
                             });
                             setShowModal(true);
                             setActiveMenuId(null);
                           }} 
                           className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600"
                         >
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                         </button>
                         <button 
                           onClick={() => openMembersModal(team)} 
                           className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600"
                         >
                            <UserPlus className="w-3.5 h-3.5" /> Vincular Usuários
                         </button>
                         {team.id !== 'comercial' && (
                           <>
                             <div className="h-px bg-slate-50 my-1 mx-2" />
                             <button 
                              onClick={() => { setActiveMenuId(null); handleDeleteTeam(team); }} 
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-lg text-xs font-bold text-red-600"
                             >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir Equipe
                             </button>
                           </>
                         )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                {team.name}
                {team.id === 'comercial' && <span className="bg-blue-100 text-blue-600 text-[9px] px-1.5 py-0.5 rounded uppercase">Padrão</span>}
              </h3>
              <p className="text-xs text-slate-500 line-clamp-2 h-8 mb-6">{team.description || 'Sem descrição definida.'}</p>
              
              <div className="flex items-center justify-between py-4 border-t border-slate-50">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-bold text-slate-600">
                    Membros: ---
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-bold text-slate-600">
                    Fila: {team.id}
                  </span>
                </div>
              </div>
  
              <div className="flex items-center justify-between mb-4 border-t border-slate-50 pt-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Distribuição</span>
                  <span className={`text-[9px] font-bold uppercase transition-colors ${team.distribution_enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {team.distribution_enabled ? 'Automática' : 'Manual'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={!!team.distribution_enabled}
                    onChange={() => toggleDistribution(team)}
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <button 
                onClick={() => openMembersModal(team)}
                className="w-full mt-2 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all border border-blue-50 active:scale-95"
              >
                Gerenciar Membros
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Team Form Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                onClick={() => { setShowModal(false); setEditingTeam(null); }} 
              />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl border border-slate-100"
            >
              <h2 className="text-xl font-bold mb-6 text-slate-800 uppercase tracking-widest">{editingTeam ? 'Editar Equipe' : 'Criar Nova Equipe'}</h2>
              <form onSubmit={handleSaveTeam} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Equipe</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ex: Comercial, Suporte, Financeiro..." 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    disabled={editingTeam?.id === 'comercial'}
                  />
                  {editingTeam?.id === 'comercial' && <p className="text-[9px] text-amber-600 font-bold px-1">* O nome da equipe padrão não pode ser alterado.</p>}
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Descrição</label>
                  <textarea 
                    rows={3}
                    placeholder="Para que serve esta equipe?" 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all resize-none"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="flex items-center gap-3 px-1">
                  <input 
                    type="checkbox" 
                    id="is_active"
                    className="w-4 h-4 rounded text-blue-600"
                    checked={formData.is_active}
                    onChange={e => setFormData({...formData, is_active: e.target.checked})}
                    disabled={editingTeam?.id === 'comercial'}
                  />
                  <label htmlFor="is_active" className="text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer">Equipe Ativa para Atendimentos</label>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button type="button" onClick={() => { setShowModal(false); setEditingTeam(null); }} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all hover:bg-blue-700">{editingTeam ? 'Salvar Alterações' : 'Criar Equipe'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Members Modal */}
      <AnimatePresence>
        {showMembersModal && selectedTeam && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
                onClick={() => { setShowMembersModal(false); setSelectedTeam(null); }} 
              />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <Users className="w-6 h-6" />
                   </div>
                   <div>
                     <h2 className="text-xl font-bold text-slate-800 uppercase tracking-widest">Usuários Vinculados</h2>
                     <p className="text-xs text-slate-400 font-medium">Equipe: <span className="text-blue-600 font-bold">{selectedTeam.name}</span></p>
                   </div>
                </div>
                <button 
                  onClick={() => { setShowMembersModal(false); setSelectedTeam(null); }} 
                  className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex gap-0">
                {/* Linked Members List */}
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar border-r border-slate-50">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Integrantes da Equipe ({teamMembers.filter(m => m.is_active).length})</h3>
                   
                   {loadingMembers ? (
                     <div className="flex items-center justify-center py-10 opacity-30">
                        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                        <span className="text-xs font-bold uppercase tracking-widest">Carregando...</span>
                     </div>
                   ) : teamMembers.filter(m => m.is_active).length === 0 ? (
                     <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <UserPlus className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Nenhum usuário vinculado</p>
                        <p className="text-xs text-slate-400 max-w-[200px] mx-auto mt-1">Adicione usuários na lista à direita para que eles possam atender nesta fila.</p>
                     </div>
                   ) : (
                     <div className="space-y-4">
                       {teamMembers.filter(m => m.is_active).map(member => (
                         <div key={member.user_id} className="p-5 bg-white border border-slate-100 rounded-3xl hover:shadow-md transition-all group">
                            <div className="flex items-start justify-between mb-4">
                               <div className="flex items-center gap-4">
                                  <div className="relative">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 font-bold border border-slate-100">
                                       {member.user_name?.charAt(0) || 'U'}
                                    </div>
                                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${isOnline(member) ? 'bg-emerald-500' : 'bg-slate-300'}`} title={isOnline(member) ? 'Online' : 'Offline'}></div>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-slate-800">{member.user_name}</p>
                                      {isOnline(member) ? (
                                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100">Online</span>
                                      ) : (
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-50 px-1 py-0.5 rounded border border-slate-100">Offline</span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium">{member.user_email}</p>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                                      {member.role_in_team}
                                    </span>
                                  </div>
                               </div>
                               <button 
                                 onClick={() => handleRemoveMember(member.user_id)}
                                 className="p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                                 title="Remover da equipe"
                               >
                                 <UserX className="w-4 h-4" />
                               </button>
                            </div>

                            <div className="grid grid-cols-3 gap-3 border-t border-slate-50 pt-4">
                               <button 
                                 onClick={() => handleUpdateMember(member.user_id, { is_active: !member.is_active })}
                                 className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all ${member.is_active ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                               >
                                  {member.is_active ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                                  <span className="text-[8px] font-black uppercase tracking-tighter">Ativo</span>
                               </button>
                               <button 
                                 onClick={() => handleUpdateMember(member.user_id, { receives_queue: !member.receives_queue })}
                                 className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all ${member.receives_queue ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                               >
                                  <Layers className="w-4 h-4" />
                                  <span className="text-[8px] font-black uppercase tracking-tighter">Recebe Fila</span>
                               </button>
                               <button 
                                 onClick={() => handleUpdateMember(member.user_id, { is_available: !member.is_available })}
                                 className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all ${member.is_available ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                               >
                                  {member.is_available ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                  <span className="text-[8px] font-black uppercase tracking-tighter">Disponível</span>
                               </button>
                            </div>

                            <div className="mt-4 flex items-center justify-between px-1">
                               <div className="flex flex-col">
                                 <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Última Atribuição</span>
                                 <span className="text-[9px] font-bold text-slate-500">
                                   {member.last_assigned_at ? new Date(member.last_assigned_at).toLocaleString() : '---'}
                                 </span>
                               </div>
                               <div className="flex flex-col items-end">
                                 <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Total</span>
                                 <span className="text-[10px] font-black text-slate-700">{member.total_assigned || 0}</span>
                               </div>
                            </div>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                {/* Available Users List */}
                <div className="w-80 bg-slate-50/50 p-8 overflow-y-auto custom-scrollbar">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Adicionar Usuários</h3>
                   <div className="space-y-2">
                      {users.filter(u => u.active && !teamMembers.some(m => m.user_id === u.id && m.is_active)).map(user => (
                        <button 
                          key={user.id}
                          onClick={() => handleAddMember(user.id)}
                          className="w-full flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:bg-blue-50/10 transition-all text-left active:scale-95 group"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                             <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                                {user.name.charAt(0)}
                             </div>
                             <div className="min-w-0">
                                <p className="text-[11px] font-bold text-slate-700 truncate">{user.name}</p>
                                <p className="text-[9px] text-slate-400 truncate">{user.role}</p>
                             </div>
                          </div>
                          <Plus className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors shrink-0" />
                        </button>
                      ))}
                      {users.filter(u => u.active && !teamMembers.some(m => m.user_id === u.id && m.is_active)).length === 0 && (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">Todos os usuários ativos já estão nesta equipe ou não há usuários disponíveis.</p>
                      )}
                   </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex justify-end shrink-0">
                 <button 
                   onClick={() => { setShowMembersModal(false); setSelectedTeam(null); }} 
                   className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-slate-200 active:scale-95 transition-all"
                 >
                  Concluir Vínculos
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
