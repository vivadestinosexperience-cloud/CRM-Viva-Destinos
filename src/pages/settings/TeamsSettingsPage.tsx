/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { Team } from '../../types';
import { toast } from 'sonner';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { safeAction } from '../../utils/safeAction';

export default function TeamsSettingsPage() {
  const navigate = useNavigate();
  const { teams, addTeam, deleteTeam, updateTeam } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    manager: ''
  });
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    safeAction(async () => {
      if (editingTeam) {
        await updateTeam({
          ...editingTeam,
          name: formData.name,
          manager_name: formData.manager || 'Não definido'
        });
        toast.success(`Equipe ${formData.name} atualizada!`);
      } else {
        const newTeam: Team = {
          id: `t${Date.now()}`,
          name: formData.name,
          manager_name: formData.manager || 'Não definido',
          members: []
        };
        await addTeam(newTeam);
        toast.success(`Equipe ${formData.name} criada!`);
      }
      setShowModal(false);
      setEditingTeam(null);
      setFormData({ name: '', manager: '' });
    }, { label: 'Erro ao salvar equipe' });
  };

  const handleAction = (action: string, team: Team) => {
    safeAction(async () => {
      if (action === 'Excluir') {
        await deleteTeam(team.id);
        toast.success(`Equipe ${team.name} removida.`);
      } else if (action === 'Editar') {
        setEditingTeam(team);
        setFormData({ name: team.name, manager: team.manager_name || '' });
        setShowModal(true);
      } else {
        toast.info(`Ação "${action}" para ${team.name} em desenvolvimento`);
      }
      setActiveMenuId(null);
    }, { label: `Erro ao executar ação: ${action}` });
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
            <h1 className="text-2xl font-bold text-slate-800">Equipes</h1>
            <p className="text-slate-500 text-sm mt-1">Gerencie os grupos de trabalho e seus responsáveis.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Criar Equipe
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team, index) => (
          <motion.div
            key={team.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 border border-slate-100">
                <Briefcase className="w-6 h-6" />
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
                               <button onClick={() => handleAction('Editar', team)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600">
                                  <Edit2 className="w-3.5 h-3.5" /> Editar
                               </button>
                               <button onClick={() => handleAction('Add Membros', team)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600">
                                  <UserPlus className="w-3.5 h-3.5" /> Add Membros
                               </button>
                               <div className="h-px bg-slate-50 my-1 mx-2" />
                               <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleAction('Excluir', team);
                                }} 
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-lg text-xs font-bold text-red-600"
                               >
                                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                               </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{team.name}</h3>
                    <p className="text-xs text-slate-400 font-medium mb-6 lowercase">Gestor: {team.manager_name || 'Não definido'}</p>
                    
                    <div className="flex items-center justify-between py-4 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-300" />
                        <span className="text-xs font-bold text-slate-600">
                          {team.members?.length || 0} Membros
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-slate-300" />
                        <span className="text-xs font-bold text-slate-600">
                          {team.whatsapp_ids?.length || 0} Canais
                        </span>
                      </div>
                    </div>
        
                    <button 
                      onClick={() => handleAction('Detalhes', team)}
                      className="w-full mt-2 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all border border-blue-50 active:scale-95"
                    >
                      Detalhes da Equipe
                    </button>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                onClick={() => { setShowModal(false); setEditingTeam(null); setFormData({ name: '', manager: '' }); }} 
              />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl border border-slate-100"
            >
              <h2 className="text-xl font-bold mb-6 text-slate-800 uppercase tracking-widest">{editingTeam ? 'Editar Equipe' : 'Criar Nova Equipe'}</h2>
              <form onSubmit={handleCreateTeam} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Equipe</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ex: Pós-Venda" 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Gestor Responsável</label>
                  <input 
                    type="text" 
                    placeholder="Nome do Gestor" 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    value={formData.manager}
                    onChange={e => setFormData({...formData, manager: e.target.value})}
                  />
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button type="button" onClick={() => { setShowModal(false); setEditingTeam(null); setFormData({ name: '', manager: '' }); }} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all hover:bg-blue-700">{editingTeam ? 'Salvar' : 'Criar Equipe'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
