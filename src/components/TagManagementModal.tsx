import React, { useState } from 'react';
import { Tag, X, Plus, Trash2, Pencil, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagType } from '../types';
import { getContrastTextColor } from '../utils/colorUtils';
import { toast } from 'sonner';

interface TagManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: TagType[];
  onAdd: (tag: Partial<TagType>) => Promise<void>;
  onUpdate: (tag: TagType) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#64748b', '#000000', '#ffffff', '#78350f'
];

export function TagManagementModal({ isOpen, onClose, tags, onAdd, onUpdate, onDelete }: TagManagementModalProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{ id: string; name: string; color: string } | null>(null);
  const [formData, setFormData] = useState({ name: '', color: '#3b82f6' });

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!formData.name.trim()) return toast.error('Nome da etiqueta é obrigatório');
    try {
      await onAdd({
        name: formData.name.trim(),
        color: formData.color
      });
      setFormData({ name: '', color: '#3b82f6' });
      setIsAdding(false);
      toast.success('Etiqueta criada com sucesso');
    } catch (err) {
      toast.error('Erro ao criar etiqueta');
    }
  };

  const handleSaveEdit = async () => {
    if (!editFormData || !editFormData.name.trim()) {
      return toast.error('Nome da etiqueta é obrigatório');
    }
    try {
      await onUpdate({
        id: editFormData.id,
        name: editFormData.name.trim(),
        color: editFormData.color,
        active: true
      });
      setEditingId(null);
      setEditFormData(null);
      toast.success('Etiqueta atualizada com sucesso');
    } catch (err) {
      toast.error('Erro ao atualizar etiqueta');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      toast.success('Etiqueta excluída com sucesso');
    } catch (err) {
      toast.error('Erro ao excluir etiqueta');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" />
              Gerenciar Etiquetas
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              {tags.map(tag => (
                <div key={tag.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 transition-all">
                  {editingId === tag.id ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={editFormData?.name || ''} 
                          onChange={(e) => setEditFormData(prev => prev ? { ...prev, name: e.target.value } : null)}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Nome da etiqueta"
                          autoFocus
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={handleSaveEdit}
                            className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-sm"
                            title="Salvar"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditFormData(null);
                            }}
                            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition-colors"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Seleção de cores interna no editor inline */}
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Selecione uma cor:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {COLORS.map(c => (
                            <button 
                              key={c}
                              type="button"
                              onClick={() => setEditFormData(prev => prev ? { ...prev, color: c } : null)}
                              className={`w-5 h-5 rounded-full border transition-all ${editFormData?.color === c ? 'border-slate-800 scale-110 shadow-sm' : 'border-white hover:scale-105'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <input 
                            type="color" 
                            value={editFormData?.color || '#3b82f6'}
                            onChange={(e) => setEditFormData(prev => prev ? { ...prev, color: e.target.value } : null)}
                            className="w-5 h-5 rounded-full border border-white shadow-sm cursor-pointer shrink-0"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full border border-black/10 shrink-0" 
                          style={{ backgroundColor: tag.color }} 
                        />
                        <span className="font-bold text-slate-700 text-sm">{tag.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditFormData({ id: tag.id, name: tag.name, color: tag.color });
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(tag.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isAdding ? (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-1.5">
                      Nome da Etiqueta
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: Urgente, Financeiro..."
                      className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      autoFocus
                    />
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-1.5">
                      Cor
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map(c => (
                        <button 
                          key={c}
                          type="button"
                          onClick={() => setFormData({...formData, color: c})}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${formData.color === c ? 'border-blue-600 scale-110 shadow-md' : 'border-white hover:scale-105'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <input 
                        type="color" 
                        value={formData.color}
                        onChange={(e) => setFormData({...formData, color: e.target.value})}
                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="flex-1 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      onClick={handleAdd}
                      className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
                    >
                      Criar Etiqueta
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Nova Etiqueta
                </button>
              )}
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:bg-slate-900 transition-all text-sm"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
