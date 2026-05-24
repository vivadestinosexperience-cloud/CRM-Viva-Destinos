/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Search, 
  ArrowLeft,
  Edit2,
  Trash2,
  Keyboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getErrorMessage } from '../../lib/error-utils';
import { quickReplyService } from '../../services/dataService';

export default function MessageTemplatesSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    shortcut: '',
    content: ''
  });
  const [editingReply, setEditingReply] = useState<any | null>(null);

  const fetchReplies = async () => {
    try {
      setLoading(true);
      const data = await quickReplyService.list();
      setQuickReplies(data);
    } catch (error) {
      toast.error(`Erro ao carregar modelos: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const filteredReplies = quickReplies.filter(item => 
    (item.shortcut || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.shortcut.trim() || !formData.content.trim()) {
      toast.error('Preencha todos os campos!');
      return;
    }

    try {
      setSaving(true);
      const cleanedShortcut = formData.shortcut.replace(/[\\/ ]/g, '').toLowerCase().trim();
      
      if (editingReply) {
        const updated = await quickReplyService.update(editingReply.id, {
          shortcut: cleanedShortcut,
          content: formData.content
        });
        setQuickReplies(prev => prev.map(item => item.id === editingReply.id ? updated : item));
        toast.success(`Modelo \\${cleanedShortcut} atualizado!`);
      } else {
        const created = await quickReplyService.create({
          shortcut: cleanedShortcut,
          content: formData.content
        });
        setQuickReplies(prev => [...prev, created]);
        toast.success(`Modelo \\${cleanedShortcut} criado com sucesso!`);
      }
      handleCloseModal();
    } catch (error) {
      toast.error(`Erro ao salvar modelo: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, shortcut: string) => {
    try {
      await quickReplyService.remove(id);
      setQuickReplies(prev => prev.filter(item => item.id !== id));
      toast.success(`Modelo \\${shortcut} removido.`);
    } catch (error) {
      toast.error(`Erro ao remover modelo: ${getErrorMessage(error)}`);
    }
  };

  const handleEdit = (reply: any) => {
    setEditingReply(reply);
    setFormData({
      shortcut: reply.shortcut,
      content: reply.content
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingReply(null);
    setFormData({ shortcut: '', content: '' });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/app/ajustes')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Modelos de Mensagem</h1>
            <p className="text-slate-500 text-sm mt-1">Crie respostas rápidas para os operadores usarem no chat omnichannel com o atalho <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-black text-xs">\</code>.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar modelos..." 
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
            Novo Modelo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Carregando modelos de resposta...</div>
        ) : filteredReplies.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filteredReplies.map((reply, index) => (
              <div 
                key={reply.id} 
                className="p-6 hover:bg-slate-50/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 font-extrabold text-xs tracking-wider rounded-xl uppercase">
                      <Keyboard className="w-3.5 h-3.5" />
                      \{reply.shortcut}
                    </span>
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleEdit(reply)}
                    className="p-2 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded-xl transition-all"
                    title="Editar"
                  >
                    <Edit2 className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(reply.id, reply.shortcut)}
                    className="p-2 hover:bg-slate-100 text-slate-500 hover:text-red-600 rounded-xl transition-all"
                    title="Excluir"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-700">Nenhum modelo cadastrado</h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto">Os modelos de resposta por atalho facilitam muito o dia a dia. Comece cadastrando um agora mesmo para poupar tempo!</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
            >
              Criar Primeiro Modelo
            </button>
          </div>
        )}
      </div>

      {/* Register/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">
                  {editingReply ? 'Editar Modelo' : 'Novo Modelo de Mensagem'}
                </h3>
                <button 
                  onClick={handleCloseModal}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Atalho de ativação</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-bold text-sm select-none">\</span>
                    <input 
                      type="text"
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700"
                      placeholder="boasvindas"
                      value={formData.shortcut}
                      onChange={e => setFormData({ ...formData, shortcut: e.target.value })}
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Ex: Digitar <code className="bg-slate-100 px-1 py-0.5 rounded font-black font-mono">\boasvindas</code> no chat carregará o conteúdo automaticamente.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Conteúdo da mensagem</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 resize-none h-32"
                    placeholder="Olá! Seja muito bem-vindo à Viva Destinos. Como posso te auxiliar em sua viagem hoje?"
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 py-3 border border-slate-200 text-slate-500 font-bold rounded-xl text-sm transition-all hover:bg-slate-50 active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Modelo'}
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
