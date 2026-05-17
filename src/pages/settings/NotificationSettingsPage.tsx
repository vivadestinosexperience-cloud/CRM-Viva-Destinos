/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Bell, 
  MessageSquare, 
  Smartphone, 
  Mail, 
  Zap, 
  ArrowLeft 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function NotificationSettingsPage() {
  const navigate = useNavigate();

  const handleSave = () => {
    toast.success('Configurações de notificações salvas!');
  };

  const notificationGroups = [
    {
      title: 'Atendimentos',
      settings: [
        { id: 'new_message', label: 'Nova mensagem recebida', description: 'Alertar quando um cliente enviar uma mensagem' },
        { id: 'assign', label: 'Conversa atribuída', description: 'Alertar quando uma conversa for transferida para você' },
        { id: 'sla', label: 'Tempo de espera excedido', description: 'Alertar quando um lead aguarda resposta há muito tempo' }
      ]
    },
    {
      title: 'Vendas & Viagens',
      settings: [
        { id: 'quote', label: 'Cotação aprovada', description: 'Alertar quando o cliente aprova um orçamento' },
        { id: 'payment', label: 'Reserva confirmada', description: 'Alertar sobre pagamentos recebidos' }
      ]
    },
    {
      title: 'Sistema',
      settings: [
        { id: 'disconnect', label: 'WhatsApp Desconectado', description: 'Alertar imediatamente se um canal perder a conexão' }
      ]
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/app/ajustes')} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Notificações</h1>
            <p className="text-slate-500 text-sm mt-1">Configure alertas de mensagens, tarefas, retomadas e reservas.</p>
          </div>
        </div>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95">
          Salvar Notificações
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {notificationGroups.map((group) => (
          <div key={group.title} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">{group.title}</h2>
            <div className="space-y-6">
              {group.settings.map((setting) => (
                <div key={setting.id} className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">{setting.label}</p>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-xs">{setting.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">APP</div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        <div className="bg-blue-50/50 rounded-3xl border border-blue-100 p-8 flex flex-col justify-between">
           <div className="space-y-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-blue-800">Alertas em Desktop</h3>
              <p className="text-sm text-blue-600/80 leading-relaxed">
                Para receber notificações mesmo com o navegador fechado, você deve autorizar a Viva Experience CRM a enviar notificações do sistema.
              </p>
           </div>
           <button onClick={() => toast.info('Permissão solicitada ao navegador')} className="mt-8 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100">
             Ativar Alertas de Desktop
           </button>
        </div>
      </div>
    </div>
  );
}
