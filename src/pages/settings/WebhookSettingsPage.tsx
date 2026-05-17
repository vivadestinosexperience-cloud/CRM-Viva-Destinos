/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Webhook, 
  Plus, 
  Search, 
  ArrowLeft,
  Copy,
  RefreshCw,
  Power,
  Trash2,
  Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export default function WebhookSettingsPage() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const [webhooks, setWebhooks] = useState([
    { id: 1, name: 'Lead Form Site Principal', url: 'https://api.vivadestinos.com.br/hooks/leads', event: 'Novo Lead', status: 'ACTIVE', lastRun: 'Há 5 min' },
    { id: 2, name: 'Z-API WhatsApp Integration', url: 'https://api.vivadestinos.com.br/hooks/whatsapp', event: 'Mensagem Recebida', status: 'ACTIVE', lastRun: 'Há 2 min' },
    { id: 3, name: 'RD Station Sync', url: 'https://webhooks.rdstation.com.br/v2/vivadestinos', event: 'Cotação Aprovada', status: 'INACTIVE', lastRun: 'Há 3 dias' },
  ]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Webhook configurado com sucesso!');
    setShowModal(false);
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada para a área de transferência');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/app/ajustes')} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Webhooks</h1>
            <p className="text-slate-500 text-sm mt-1">Gerencie endpoints para receber e enviar eventos externos.</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          Criar Webhook
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50">
            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <th className="px-8 py-5">Webhook / URL</th>
              <th className="px-8 py-5">Evento Ativador</th>
              <th className="px-8 py-5">Status</th>
              <th className="px-8 py-5">Último Disparo</th>
              <th className="px-8 py-5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {webhooks.map((hook) => (
              <tr key={hook.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-6">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">{hook.name}</p>
                    <div className="flex items-center gap-2 group">
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-sm">{hook.url}</p>
                      <button onClick={() => copyUrl(hook.url)} className="p-1 hover:bg-white border border-transparent hover:border-slate-100 rounded text-slate-400 hover:text-blue-600 transition-all">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">{hook.event}</span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${hook.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                    <span className={`text-[10px] font-black uppercase ${hook.status === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {hook.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </td>
                <td className="px-8 py-6 text-xs text-slate-500">{hook.lastRun}</td>
                <td className="px-8 py-6 text-right">
                  <div className="flex items-center justify-end gap-2 text-slate-400">
                     <button onClick={() => toast.info('Teste enviado para o endpoint')} className="p-2 hover:bg-white border border-transparent hover:border-slate-100 rounded-lg hover:text-blue-600">
                       <RefreshCw className="w-4 h-4" />
                     </button>
                     <button onClick={() => setWebhooks(webhooks.map(h => h.id === hook.id ? {...h, status: h.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'} : h))} className="p-2 hover:bg-white border border-transparent hover:border-slate-100 rounded-lg hover:text-amber-600">
                       <Power className="w-4 h-4" />
                     </button>
                     <button className="p-2 hover:bg-white border border-transparent hover:border-slate-100 rounded-lg hover:text-red-600">
                       <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
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
              <h2 className="text-xl font-bold mb-6 text-slate-800 uppercase tracking-widest">Novo Webhook</h2>
              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome de Identificação</label>
                  <input required type="text" placeholder="Ex: Lead Form Landing Page" className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">URL de Destino</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input required type="url" placeholder="https://api.exemplo.com/webhook" className="w-full pl-11 pr-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Evento Ativador</label>
                  <select className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm appearance-none cursor-pointer">
                    <option>Novo Lead Criado</option>
                    <option>Atendimento Finalizado</option>
                    <option>Cotação Aprovada</option>
                    <option>WhatsApp Desconectado</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all hover:bg-blue-700">Configurar Webhook</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
