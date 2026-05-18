/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Palette, Sun, Moon, Monitor, Layout, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { safeAction } from '../../utils/safeAction';

export default function AppearanceSettingsPage() {
  const { appearance, setAppearance, isSaving } = useAppStore();

  const handleSave = () => {
    safeAction(async () => {
      toast.success('Configurações de aparência salvas com sucesso!');
    });
  };

  const colors = [
    { name: 'Azul Viva', value: '#2563eb' },
    { name: 'Esmeralda', value: '#10b981' },
    { name: 'Índigo', value: '#6366f1' },
    { name: 'Violeta', value: '#8b5cf6' },
    { name: 'Rosa', value: '#ec4899' },
    { name: 'Slate', value: '#475569' },
    { name: 'Ambient', value: '#dc2626' },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <button 
            onClick={() => window.history.back()}
            className="p-2 hover:bg-white rounded-xl transition-all text-slate-500 shadow-sm border border-transparent hover:border-slate-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Aparência</h1>
            <p className="text-sm text-slate-500">Personalize a identidade visual do seu CRM.</p>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-[0.98]"
        >
          <Save className="w-4 h-4" />
          Salvar Alterações
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Color Palette */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
               <Palette className="w-5 h-5" />
             </div>
             <h2 className="font-bold text-slate-800">Cor Principal</h2>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {colors.map((color) => (
              <button
                key={color.value}
                onClick={() => setAppearance({ primaryColor: color.value })}
                className={`group flex flex-col items-center gap-2 p-2 rounded-2xl transition-all ${appearance.primaryColor === color.value ? 'bg-slate-50 ring-2 ring-blue-500' : 'hover:bg-slate-50'}`}
              >
                <div 
                  className="w-10 h-10 rounded-xl shadow-inner border border-black/5"
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate w-full text-center">{color.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Theme Select */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
               <Sun className="w-5 h-5" />
             </div>
             <h2 className="font-bold text-slate-800">Tema do Sistema</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'light', name: 'Claro', icon: Sun },
              { id: 'dark', name: 'Escuro', icon: Moon },
              { id: 'system', name: 'Sistema', icon: Monitor },
            ].map((theme) => (
              <button
                key={theme.id}
                onClick={() => setAppearance({ theme: theme.id as any })}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${appearance.theme === theme.id ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
              >
                <theme.icon className="w-5 h-5" />
                <span className="text-xs font-bold">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Density Select */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
               <Layout className="w-5 h-5" />
             </div>
             <h2 className="font-bold text-slate-800">Densidade da Interface</h2>
          </div>
          
          <div className="space-y-3">
            {[
              { id: 'comfortable', name: 'Confortável', desc: 'Espaçamento amplo para melhor leitura.' },
              { id: 'compact', name: 'Compacto', desc: 'Mais informações visíveis na mesma tela.' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setAppearance({ density: d.id as any })}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${appearance.density === d.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}
              >
                <div>
                   <p className={`text-sm font-bold ${appearance.density === d.id ? 'text-blue-600' : 'text-slate-800'}`}>{d.name}</p>
                   <p className="text-xs text-slate-500">{d.desc}</p>
                </div>
                {appearance.density === d.id && <div className="w-2 h-2 bg-blue-600 rounded-full shadow-lg shadow-blue-200" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
