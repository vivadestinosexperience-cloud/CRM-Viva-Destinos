/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Layers, 
  Plus, 
  Search, 
  MoreVertical, 
  ArrowLeft,
  Clock,
  Paintbrush,
  Edit2,
  Trash2,
  ToggleLeft,
  Settings as SettingsIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { Queue } from '../../types';
import { toast } from 'sonner';

export default function QueuesSettingsPage() {
  const navigate = useNavigate();
  const { queues, addQueue, deleteQueue, updateQueue } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6'
  });

  const handleCreateQueue = (e: React.FormEvent) => {
    e.preventDefault();
    const newQueue: Queue = {
      id: `q${Date.now()}`,
      name: formData.name,
      color: formData.color,
      active: true
    };
    addQueue(newQueue);
    setShowModal(false);
    setFormData({ name: '', color: '#3b82f6' });
    toast.success(`Fila ${formData.name} criada!`);
  };

  const handleAction = (action: string, queue: Queue) => {
    if (action === 'Excluir') {
      deleteQueue(queue.id);
      toast.success(`Fila ${queue.name} removida.`);
    } else {
      toast.info(`Fila ${queue.name}: Ação ${action} em desenvolvimento`);
    }
    setActiveMenuId(null);
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
            <h1 className="text-2xl font-bold text-slate-800">Filas de Atendimento</h1>
            <p className="text-slate-500 text-sm mt-1">Organize o fluxo de conversas por departamentos.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Criar Fila
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <th className="px-6 py-4">Fila</th>
              <th className="px-6 py-4">Equipe Responsável</th>
              <th className="px-6 py-4">SLA</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {queues.map((queue) => (
              <tr key={queue.id} className="hover:bg-slate-50/50 transition-all group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shadow-current-20"
                      style={{ backgroundColor: queue.color }}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{queue.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium lowercase">ID: {queue.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Comercial</span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">10 min</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Ativa</span>
                  </div>
                </td>
                <td className="px-6 py-5 text-right relative">
                   <button 
                    onClick={() => setActiveMenuId(activeMenuId === queue.id ? null : queue.id)}
                    className={`p-2 rounded-lg transition-all border active:scale-90 ${activeMenuId === queue.id ? 'bg-blue-50 border-blue-100 text-blue-600 shadow-sm' : 'hover:bg-white rounded-lg text-slate-400 hover:text-blue-600 border-transparent hover:border-slate-100'}`}
                   >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {activeMenuId === queue.id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, x: 10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: 10 }}
                          className="absolute right-16 top-4 z-[50] w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 text-left"
                        >
                           <button onClick={() => handleAction('Editar', queue)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600">
                              <Edit2 className="w-3.5 h-3.5" /> Editar
                           </button>
                           <button onClick={() => handleAction('SLA', queue)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600">
                              <SettingsIcon className="w-3.5 h-3.5" /> Configurações
                           </button>
                           <div className="h-px bg-slate-50 my-1 mx-2" />
                           <button onClick={() => handleAction('Excluir', queue)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-lg text-xs font-bold text-red-600">
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                           </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl border border-slate-100">
              <h2 className="text-xl font-bold mb-6 text-slate-800 uppercase tracking-widest">Criar Nova Fila</h2>
              <form onSubmit={handleCreateQueue} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Fila</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ex: Comercial" 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Cor da Fila</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color" 
                      className="w-12 h-12 rounded-xl overflow-hidden cursor-pointer"
                      value={formData.color}
                      onChange={e => setFormData({...formData, color: e.target.value})}
                    />
                    <input 
                      type="text" 
                      className="flex-1 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-mono"
                      value={formData.color}
                      onChange={e => setFormData({...formData, color: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all hover:bg-blue-700">Criar Fila</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
