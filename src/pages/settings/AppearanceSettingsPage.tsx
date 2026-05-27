/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Palette, Sun, Moon, Monitor, Layout, ArrowLeft, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { safeAction } from '../../utils/safeAction';

export default function AppearanceSettingsPage() {
  const { appearance, setAppearance } = useAppStore();

  const handleSave = () => {
    safeAction(async () => {
      toast.success('Configurações de aparência salvas com sucesso!');
    });
  };

  const primaryColors = [
    { name: 'Azul Cósmico', value: '#0b2545' },
    { name: 'Azul Viva', value: '#2563eb' },
    { name: 'Esmeralda', value: '#10b981' },
    { name: 'Índigo', value: '#6366f1' },
    { name: 'Violeta', value: '#8b5cf6' },
    { name: 'Rosa Viva', value: '#ec4899' },
    { name: 'Slate Modern', value: '#475569' },
    { name: 'Ambient Coral', value: '#f43f5e' },
  ];

  const secondaryColors = [
    { name: 'Ouro Destinos', value: '#e5a93b' },
    { name: 'Ouro Real', value: '#D4AF37' },
    { name: 'Âmbar Solar', value: '#f59e0b' },
    { name: 'Prata Star', value: '#cbd5e1' },
    { name: 'Turquesa Mar', value: '#14b8a6' },
    { name: 'Violeta Light', value: '#a78bfa' },
    { name: 'Coral Quente', value: '#fb923c' },
  ];

  const activeSecondary = appearance.secondaryColor || '#e5a93b';

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.history.back()}
            className="p-2 hover:bg-white rounded-xl transition-all text-slate-500 shadow-sm border border-transparent hover:border-slate-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Aparência</h1>
            <p className="text-sm text-slate-500">Personalize a identidade visual e as cores da Viva Destinos Experience.</p>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--primary-color)] text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-[var(--primary-color)]/20 hover:opacity-95 transition-all active:scale-[0.98]"
        >
          <Save className="w-4 h-4" />
          Salvar Alterações
        </button>
      </div>

      {/* Live Brand Preview Card */}
      <div className="p-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50 relative overflow-hidden flex flex-col md:flex-row gap-8 items-center justify-between">
        <div className="space-y-3 max-w-md">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-wider text-amber-800 bg-amber-50 rounded-full border border-amber-200">
            <Sparkles className="w-3 h-3 text-amber-500" /> PREVIEW DA IDENTIDADE VISUAL
          </span>
          <h3 className="text-lg font-bold text-slate-800">Visualização em Tempo Real</h3>
          <p className="text-sm text-slate-500">
            Veja abaixo como o logotipo, a cor principal e os detalhes em ouro/secundários se combinam no topo e nos cards do seu sistema CRM.
          </p>
        </div>

        <div className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden flex flex-col items-center text-center space-y-4">
          {/* Subtle starry atmosphere inside preview card */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 to-slate-950 pointer-events-none" />
          
          <div className="relative z-10 w-24 h-24 rounded-full border-2 flex items-center justify-center p-2 bg-slate-950/80 shadow-lg"
               style={{ borderColor: activeSecondary }}>
            <img 
              src={appearance.logoUrl} 
              alt={appearance.companyName} 
              className="w-full h-full object-contain"
            />
          </div>

          <div className="relative z-10 space-y-1">
            <h4 className="text-md font-bold text-white tracking-wide">
              {appearance.companyName}
            </h4>
            <p className="text-[10px] font-semibold tracking-widest uppercase"
               style={{ color: activeSecondary }}>
              {appearance.systemName}
            </p>
          </div>

          <div className="relative z-10 w-full flex items-center justify-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full font-bold text-white shadow-sm"
                  style={{ backgroundColor: appearance.primaryColor }}>
              Cor Principal
            </span>
            <span className="text-xs px-3 py-1 rounded-full font-bold text-slate-900 shadow-sm"
                  style={{ backgroundColor: activeSecondary }}>
              Cor do Detalhe
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Primary Color Palette */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-50 text-[var(--primary-color)] rounded-xl">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 leading-none">Cor Principal</h2>
              <p className="text-xs text-slate-400 mt-1">Usada para sidebars, botões e elementos em destaque.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {primaryColors.map((color) => (
              <button
                key={color.value}
                onClick={() => setAppearance({ primaryColor: color.value })}
                className={`group flex flex-col items-center gap-2 p-2 rounded-2xl transition-all ${
                  appearance.primaryColor === color.value 
                    ? 'bg-slate-50 ring-2 ring-[var(--primary-color)]' 
                    : 'hover:bg-slate-50'
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-xl shadow-inner border border-black/5"
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate w-full text-center">
                  {color.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Color Palette */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 leading-none">Cor de Destaque (Secundária)</h2>
              <p className="text-xs text-slate-400 mt-1">Usada para realçar ícones, bordas finas e detalhes premium.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {secondaryColors.map((color) => (
              <button
                key={color.value}
                onClick={() => setAppearance({ secondaryColor: color.value })}
                className={`group flex flex-col items-center gap-2 p-2 rounded-2xl transition-all ${
                  activeSecondary === color.value 
                    ? 'bg-slate-50 ring-2 ring-[var(--primary-color)]' 
                    : 'hover:bg-slate-50'
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-xl shadow-inner border border-black/5"
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate w-full text-center">
                  {color.name}
                </span>
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
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                  appearance.theme === theme.id 
                    ? 'bg-slate-50 border-[var(--primary-color)] text-[var(--primary-color)] shadow-sm' 
                    : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
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
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                  appearance.density === d.id 
                    ? 'bg-slate-50 border-[var(--primary-color)] shadow-sm' 
                    : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div>
                  <p className={`text-sm font-bold ${appearance.density === d.id ? 'text-[var(--primary-color)]' : 'text-slate-800'}`}>
                    {d.name}
                  </p>
                  <p className="text-xs text-slate-500">{d.desc}</p>
                </div>
                {appearance.density === d.id && (
                  <div className="w-2 h-2 rounded-full shadow-lg"
                       style={{ backgroundColor: appearance.primaryColor }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
