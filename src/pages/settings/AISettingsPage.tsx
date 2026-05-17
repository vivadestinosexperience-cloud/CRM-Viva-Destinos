/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Zap, 
  MessageSquare, 
  Mic, 
  FileText, 
  Sparkles, 
  ArrowLeft,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AISettingsPage() {
  const navigate = useNavigate();

  const handleSave = () => {
    toast.success('Configurações de IA salvas com sucesso!');
  };

  const aiFeatures = [
    { 
      id: 'summary', 
      name: 'Resumo de Conversas', 
      description: 'Gera resumos automáticos de chats longos para facilitar a troca de equipe.', 
      icon: FileText,
      active: true 
    },
    { 
      id: 'suggestions', 
      name: 'Sugestões de Resposta', 
      description: 'Sugere respostas inteligentes baseadas no histórico da conversa e FAQ da agência.', 
      icon: MessageSquare,
      active: true 
    },
    { 
      id: 'audio', 
      name: 'Transcrição de Áudio', 
      description: 'Transcreve automaticamente áudios recebidos para texto.', 
      icon: Mic,
      active: false 
    },
    { 
      id: 'classification', 
      name: 'Classificação de Leads', 
      description: 'Identifica automaticamente a intenção de compra e o perfil do cliente.', 
      icon: Sparkles,
      active: true 
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
            <h1 className="text-2xl font-bold text-slate-800">Inteligência Artificial</h1>
            <p className="text-slate-500 text-sm mt-1">Configure recursos de IA para suporte ao atendimento e vendas.</p>
          </div>
        </div>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95">
          Salvar Configurações IA
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Model Selection */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Provedor & Modelo
            </h3>
            
            <div className="space-y-4">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Provedor Principal</label>
                  <select className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Gemini (Google AI Studio)</option>
                    <option>OpenAI (GPT-4o)</option>
                    <option>Claude (Anthropic)</option>
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Modelo Ativo</label>
                  <p className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg inline-block">gemini-3-flash-preview</p>
               </div>
               <div className="space-y-1.5 pt-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Temperatura de Resposta</label>
                  <input type="range" className="w-full" min="0" max="100" defaultValue="70" />
                  <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase">
                    <span>Preciso</span>
                    <span>Criativo</span>
                  </div>
               </div>
            </div>
          </div>

          <div className="p-6 bg-slate-900 rounded-3xl text-white space-y-4">
             <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
               <ShieldCheck className="w-5 h-5" />
             </div>
             <p className="text-sm font-bold">Privacidade Garantida</p>
             <p className="text-xs text-slate-400 leading-relaxed">
               Seus dados são usados apenas para processamento local na sua agência. Nenhum dado é usado para treinamento de modelos públicos.
             </p>
          </div>
        </div>

        {/* Features Column */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
           {aiFeatures.map((feature) => (
             <div key={feature.id} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 border border-slate-100">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{feature.name}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed mb-8">{feature.description}</p>
                </div>
                <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                   <span className={`text-[10px] font-black uppercase tracking-widest ${feature.active ? 'text-emerald-600' : 'text-slate-300'}`}>
                     {feature.active ? 'Ativo' : 'Inativo'}
                   </span>
                   <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked={feature.active} />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                   </label>
                </div>
             </div>
           ))}
           
           <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                Prompt Base da Agência
              </h3>
              <textarea 
                rows={4}
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-300"
                placeholder="Ex: Você é um assistente de viagens especializado em destinos de luxo para a Viva Destinos Experience. Seja sempre cordial e profissional..."
                defaultValue="Você é um assistente virtual experiente da Viva Destinos Experience. Ajude nossos consultores a fecharem mais vendas, resumindo as intenções dos leads e sugerindo roteiros personalizados baseados no perfil de cada viajante."
              />
           </div>
        </div>
      </div>
    </div>
  );
}
