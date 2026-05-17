/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Layers, 
  MessageSquare, 
  ShieldCheck, 
  Settings, 
  Briefcase,
  Palette
} from 'lucide-react';
import { motion } from 'motion/react';

export default function SettingsHub() {
  const navigate = useNavigate();

  const settingCards = [
    {
      id: 'usuarios',
      name: 'Usuários',
      description: 'Gerencie os usuários que podem acessar a ferramenta.',
      icon: Users,
      color: 'bg-blue-500',
      path: '/app/ajustes/usuarios'
    },
    {
      id: 'equipes',
      name: 'Equipes',
      description: 'Organize consultores, atendimento e equipes da agência.',
      icon: Briefcase,
      color: 'bg-emerald-500',
      path: '/app/ajustes/equipes'
    },
    {
      id: 'filas',
      name: 'Filas',
      description: 'Configure filas de atendimento e distribuição de conversas.',
      icon: Layers,
      color: 'bg-amber-500',
      path: '/app/ajustes/filas'
    },
    {
      id: 'permissoes',
      name: 'Permissões',
      description: 'Defina o que cada perfil pode visualizar e executar.',
      icon: ShieldCheck,
      color: 'bg-purple-500',
      path: '/app/ajustes/permissoes'
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'Conecte e configure canais de WhatsApp Oficial e QR Provider.',
      icon: MessageSquare,
      color: 'bg-green-500',
      path: '/app/ajustes/integracoes/whatsapp'
    },
    {
      id: 'conta',
      name: 'Conta',
      description: 'Configure dados da agência, logo e horários de atendimento.',
      icon: Settings,
      color: 'bg-slate-500',
      path: '/app/ajustes/conta'
    },
    {
      id: 'aparencia',
      name: 'Aparência',
      description: 'Personalize o tema, cores e densidade visual do CRM.',
      icon: Palette,
      color: 'bg-pink-500',
      path: '/app/ajustes/aparencia'
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configurações</h1>
        <p className="text-slate-500 text-sm mt-1">Gerencie as preferências e estrutura da agência Viva Destinos Experience.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingCards.map((card, index) => (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => navigate(card.path)}
            className="flex flex-col text-left p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all group"
          >
            <div className={`w-12 h-12 rounded-2xl ${card.color} flex items-center justify-center text-white mb-5 shadow-lg shadow-${card.color.split('-')[1]}-100`}>
              <card.icon className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors uppercase tracking-wide text-xs mb-2">
              {card.name}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {card.description}
            </p>
            <div className="mt-6 flex items-center text-blue-600 font-bold text-xs uppercase tracking-widest gap-2">
              Acessar
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                →
              </motion.span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
