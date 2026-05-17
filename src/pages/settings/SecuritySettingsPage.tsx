/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Shield, 
  Lock, 
  Smartphone, 
  Eye, 
  History, 
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function SecuritySettingsPage() {
  const navigate = useNavigate();

  const handleSave = () => {
    toast.success('Políticas de segurança atualizadas!');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/app/ajustes')} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Segurança</h1>
            <p className="text-slate-500 text-sm mt-1">Configure política de senha, sessões e acessos.</p>
          </div>
        </div>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95">
          Salvar Segurança
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Password Policy */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
           <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4 flex items-center gap-2">
             <Lock className="w-4 h-4" />
             Política de Senhas
           </h2>
           <div className="space-y-5">
             {[
               { label: 'Tamanho Mínimo', value: '8 caracteres' },
               { label: 'Exigir Maiúsculas', active: true },
               { label: 'Exigir Números', active: true },
               { label: 'Exigir Caracteres Especiais', active: false },
               { label: 'Expiração de Senha', value: '90 dias' }
             ].map((policy, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{policy.label}</span>
                  {policy.value ? (
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{policy.value}</span>
                  ) : (
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked={policy.active} />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  )}
                </div>
             ))}
           </div>
        </div>

        {/* Multi-Factor Authentication */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
           <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4 flex items-center gap-2">
             <Smartphone className="w-4 h-4" />
             Autenticação em Duas Etapas (2FA)
           </h2>
           <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
             <Shield className="w-6 h-6 text-emerald-500 shrink-0" />
             <div className="space-y-2">
                <p className="text-sm font-bold text-slate-800">Proteção Extra da Conta</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ao ativar o 2FA, todos os usuários deverão confirmar o acesso via SMS ou Aplicativo de Autenticação.
                </p>
                <button onClick={() => toast.info('Funcionalidade sendo liberada para sua agência')} className="mt-2 text-xs font-bold text-blue-600 uppercase tracking-widest">Ativar agora</button>
             </div>
           </div>
        </div>

        {/* Active Sessions */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6 lg:col-span-2">
           <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4 flex items-center gap-2">
             <History className="w-4 h-4" />
             Sessões Ativas & Auditoria de Login
           </h2>
           <div className="overflow-x-auto">
             <table className="w-full text-left">
               <thead>
                 <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   <th className="px-4 py-2">Dispositivo / IP</th>
                   <th className="px-4 py-2">Localização</th>
                   <th className="px-4 py-2">Último Acesso</th>
                   <th className="px-4 py-2 text-right">Ação</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {[
                   { device: 'Safari on Mac OS (Seu dispositivo)', ip: '191.242.4.12', loc: 'São Paulo, BR', time: 'Agora' },
                   { device: 'WhatsApp Web Bridge', ip: '34.120.45.1', loc: 'Google Cloud (US)', time: 'Há 2 horas' },
                   { device: 'Chrome on Android', ip: '177.34.1.99', loc: 'Curitiba, BR', time: 'Ontem' },
                 ].map((session, i) => (
                   <tr key={i} className="hover:bg-slate-50 transition-colors">
                     <td className="px-4 py-4">
                       <p className="text-xs font-bold text-slate-800">{session.device}</p>
                       <p className="text-[10px] text-slate-400">IP: {session.ip}</p>
                     </td>
                     <td className="px-4 py-4 text-xs text-slate-600 font-medium">{session.loc}</td>
                     <td className="px-4 py-4 text-xs text-slate-500">{session.time}</td>
                     <td className="px-4 py-4 text-right">
                       <button onClick={() => toast.error('Sessão encerrada')} className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-widest">Encerrar</button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
}
