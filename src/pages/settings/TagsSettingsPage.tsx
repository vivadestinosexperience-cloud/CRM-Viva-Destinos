/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Tag as TagIcon, 
  Plus, 
  Search, 
  MoreVertical, 
  ArrowLeft,
  Edit2,
  Trash2,
  Circle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { Tag } from '../../types';
import { toast } from 'sonner';
import { getErrorMessage } from '../../lib/error-utils';

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Violet
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#64748B', // Slate
];

export default function TagsSettingsPage() {
  const navigate = useNavigate();
  const { tags, addTag, deleteTag, updateTag } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    color: PRESET_COLORS[0],
    category: ''
  });
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tag.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTag) {
        await updateTag({
          ...editingTag,
          name: formData.name,
          color: formData.color,
          category: formData.category
        });
        toast.success(`Etiqueta ${formData.name} atualizada!`);
      } else {
        const newTag: Tag = {
          id: Math.random().toString(36).substr(2, 9),
          name: formData.name,
          color: formData.color,
          category: formData.category,
          active: true
        };
        await addTag(newTag);
        toast.success(`Etiqueta ${formData.name} criada!`);
      }
      handleCloseModal();
    } catch (error) {
      toast.error(`Erro ao salvar etiqueta: ${getErrorMessage(error)}`);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTag(null);
    setFormData({ name: '', color: PRESET_COLORS[0], category: '' });
  };

  const handleAction = (action: string, tag: Tag) => {
    if (action === 'Excluir') {
      deleteTag(tag.id);
      toast.success(`Etiqueta ${tag.name} removida.`);
    } else if (action === 'Editar') {
      setEditingTag(tag);
      setFormData({ 
        name: tag.name, 
        color: tag.color || PRESET_COLORS[0], 
        category: tag.category || '' 
      });
      setShowModal(true);
    }
    setActiveMenuId(null);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/app/ajustes')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Etiquetas (Tags)</h1>
            <p className="text-slate-500 text-sm mt-1">Organize e categorize seus clientes e conversas.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar etiquetas..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Criar Etiqueta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredTags.length > 0 ? (
          filteredTags.map((tag, index) => (
            <motion.div
              key={tag.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg"
                  style={{ backgroundColor: tag.color || '#CBD5E1' }}
                >
                  <TagIcon className="w-5 h-5" />
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenuId(activeMenuId === tag.id ? null : tag.id)}
                    className={`p-2 rounded-lg transition-all border ${activeMenuId === tag.id ? 'bg-blue-50 border-blue-100 text-blue-600' : 'hover:bg-slate-50 text-slate-400 border-transparent'}`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {activeMenuId === tag.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        className="absolute right-0 top-full mt-2 z-[50] w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2"
                      >
                         <button onClick={() => handleAction('Editar', tag)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 font-sans">
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                         </button>
                         <div className="h-px bg-slate-50 my-1 mx-2" />
                         <button 
                          onClick={() => handleAction('Excluir', tag)} 
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-lg text-xs font-bold text-red-600 font-sans"
                         >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                         </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              <h3 className="text-base font-bold text-slate-800 mb-1">{tag.name}</h3>
              {tag.category && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-full">
                  {tag.category}
                </span>
              )}
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto text-slate-400">
              <TagIcon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-slate-500 font-medium">Nenhuma etiqueta encontrada.</p>
              <p className="text-slate-400 text-sm">Tente ajustar sua busca ou crie uma nova etiqueta.</p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                onClick={handleCloseModal} 
              />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 font-sans"
            >
              <h2 className="text-xl font-bold mb-6 text-slate-800 uppercase tracking-widest">
                {editingTag ? 'Editar Etiqueta' : 'Criar Nova Etiqueta'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Etiqueta</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ex: Cliente VIP, Prospect, Urgente" 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Categoria (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Comercial, Status, Origem" 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Cor</label>
                  <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({...formData, color})}
                        className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${formData.color === color ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                      >
                        {formData.color === color && <Circle className="w-3 h-3 text-white fill-current" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={handleCloseModal} 
                    className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all hover:bg-blue-700 active:scale-95"
                  >
                    {editingTag ? 'Salvar Alterações' : 'Criar Etiqueta'}
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
