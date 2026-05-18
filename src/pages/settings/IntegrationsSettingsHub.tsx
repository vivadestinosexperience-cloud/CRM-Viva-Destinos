/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  MessageSquare, 
  Instagram, 
  Facebook, 
  Globe, 
  Zap, 
  Webhook,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function IntegrationsSettingsHub() {
  const navigate = useNavigate();

  const integrations = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Z-API',
      description: 'Conecte seu WhatsApp via QR Code Z-API para atendimento e campanhas.',
      icon: MessageSquare,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      status: 'CONFIGURAR',
      path: '/app/ajustes/integracoes/whatsapp',
      active: true
    },
    {
      id: 'openai',
      name: 'IA Assistente',
      description: 'Ative resumos de conversas e sugestões de respostas com Gemini API.',
      icon: Zap,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      status: 'CONFIGURAR',
      path: '/app/ajustes/ai',
      active: true
    },
    {
      id: 'webhooks',
      name: 'Webhooks',
      description: 'Receba leads e eventos de sistemas externos via webhook.',
      icon: Webhook,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      status: 'EM BREVE',
      active: false
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
       <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/app/ajustes')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Canais & Integrações</h1>
          <p className="text-slate-500 text-sm mt-1">Centralize toda a comunicação da Viva Destinos em um só lugar.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all group flex flex-col justify-between h-full"
          >
            <div>
              <div className={`w-14 h-14 ${item.bg} ${item.color} rounded-2xl flex items-center justify-center mb-6 shadow-sm`}>
                <item.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">{item.name}</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-8">
                {item.description}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${item.active ? 'text-blue-600' : 'text-slate-300'}`}>
                {item.status}
              </div>
              {item.active ? (
                <button 
                  onClick={() => navigate(item.path!)}
                  className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all hover:bg-blue-700 active:scale-95"
                >
                  Configurar Agora
                </button>
              ) : (
                <button 
                  disabled
                  className="w-full py-3 bg-slate-50 text-slate-300 rounded-2xl font-bold text-xs uppercase tracking-widest border border-slate-100 cursor-not-allowed"
                >
                  Em breve
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
