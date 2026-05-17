/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Building2, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  ArrowLeft,
  Camera,
  Save,
  Palette,
  Layout,
  Monitor,
  Maximize2,
  Minimize2,
  Type
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo';
import { toast } from 'sonner';
import { useAppStore } from '../../store/useAppStore';

export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { appearance, setAppearance } = useAppStore();

  const [form, setForm] = useState({
    companyName: appearance.companyName,
    systemName: appearance.systemName,
    logoUrl: appearance.logoUrl,
    primaryColor: appearance.primaryColor,
    theme: appearance.theme,
    menuStyle: appearance.menuStyle,
    density: appearance.density
  });

  const handleSave = () => {
    setAppearance(form);
    toast.success('Configurações atualizadas com sucesso!');
  };

  const handleUpdateLogo = () => {
    const newUrl = prompt('Insira a URL do novo logo:', form.logoUrl);
    if (newUrl) setForm({ ...form, logoUrl: newUrl });
  };

  const COLORS = [
    { name: 'Azul', value: '#2563eb' },
    { name: 'Verde Água', value: '#0d9488' },
    { name: 'Roxo', value: '#7c3aed' },
    { name: 'Laranja', value: '#ea580c' },
    { name: 'Dourado', value: '#ca8a04' },
    { name: 'Personalizado', value: '#000000' }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/app/ajustes')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Conta & Personalização</h1>
            <p className="text-slate-500 text-sm mt-1">Gerencie a identidade, aparência e informações da sua agência.</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95"
        >
          <Save className="w-4 h-4" />
          Salvar Aparência
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Visual Identity Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 flex flex-col items-center text-center">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Logo da Agência</h3>
            <div className="bg-slate-50 rounded-[2.5rem] p-10 border-2 border-dashed border-slate-100 relative group w-full flex justify-center">
              <Logo size="large" className="scale-110" />
              <button 
                onClick={handleUpdateLogo}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm rounded-[2.5rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white gap-2 font-bold text-sm"
              >
                <Camera className="w-5 h-5" />
                Alterar Logo
              </button>
            </div>
            <div className="mt-4 w-full">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block text-left mb-2">URL do Logo</label>
              <input 
                type="text" 
                value={form.logoUrl} 
                onChange={e => setForm({...form, logoUrl: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Cor Principal
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {COLORS.map(color => (
                <button 
                  key={color.value}
                  className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all ${form.primaryColor === color.value ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-slate-50'}`}
                  onClick={() => setForm({...form, primaryColor: color.value})}
                >
                  <div 
                    className="w-8 h-8 rounded-lg shadow-sm"
                    style={{ backgroundColor: color.value }}
                  />
                  <span className="text-[10px] font-bold text-slate-600">{color.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Tema do Sistema
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['light', 'dark', 'system'] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => setForm({...form, theme: t})}
                  className={`py-3 rounded-xl border-2 text-[10px] font-bold uppercase tracking-widest transition-all ${form.theme === t ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}
                >
                  {t === 'light' ? 'Claro' : t === 'dark' ? 'Escuro' : 'Auto'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Agency Information & Layout Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30">
               <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                 <Building2 className="w-4 h-4 text-primary" />
                 Nomes & Identificação
               </h3>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-2xl transition-all">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome da Agência</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text" 
                    value={form.companyName} 
                    onChange={e => setForm({...form, companyName: e.target.value})}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nome do Sistema (Sugestão IA)</label>
                <div className="relative">
                  <Type className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text" 
                    value={form.systemName} 
                    onChange={e => setForm({...form, systemName: e.target.value})}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-8 flex items-center gap-2">
              <Layout className="w-4 h-4 text-primary" />
              Layout & Navegação
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    Estilo do Menu
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'sidebar', name: 'Lateral Expandido', icon: Layout },
                      { id: 'compact', name: 'Lateral Compacto', icon: Minimize2 },
                      { id: 'top', name: 'Menu Superior', icon: Maximize2 }
                    ].map(style => (
                      <button 
                        key={style.id}
                        onClick={() => setForm({...form, menuStyle: style.id as any})}
                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${form.menuStyle === style.id ? 'border-primary bg-primary/5' : 'border-slate-50 hover:bg-slate-50'}`}
                      >
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.menuStyle === style.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                           <style.icon className="w-5 h-5" />
                         </div>
                         <div className="text-left">
                            <p className={`text-xs font-bold ${form.menuStyle === style.id ? 'text-primary' : 'text-slate-700'}`}>{style.name}</p>
                            <p className="text-[10px] text-slate-400">Alterar a posição da navegação principal.</p>
                         </div>
                      </button>
                    ))}
                  </div>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    Densidade da Interface
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'comfortable', name: 'Confortável', icon: Maximize2, desc: 'Mais espaçamento entre elementos.' },
                      { id: 'compact', name: 'Compacta', icon: Minimize2, desc: 'Mais informação em menos espaço.' }
                    ].map(d => (
                      <button 
                        key={d.id}
                        onClick={() => setForm({...form, density: d.id as any})}
                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${form.density === d.id ? 'border-primary bg-primary/5' : 'border-slate-50 hover:bg-slate-50'}`}
                      >
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.density === d.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                           <d.icon className="w-5 h-5" />
                         </div>
                         <div className="text-left">
                            <p className={`text-xs font-bold ${form.density === d.id ? 'text-primary' : 'text-slate-700'}`}>{d.name}</p>
                            <p className="text-[10px] text-slate-400">{d.desc}</p>
                         </div>
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          </div>

          <div className="p-6 bg-slate-900 rounded-3xl text-white flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold">Personalização Ativa</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Sua marca, suas regras.</p>
              </div>
            </div>
            <button 
              onClick={handleSave}
              className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
            >
              Aplicar Agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
