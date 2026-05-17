/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  ArrowLeft,
  FileText,
  User,
  Clock,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AuditSettingsPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const logs = [
    { id: 1, user: 'Gustavo Alves', action: 'Permissão alterada', module: 'Segurança', target: 'Consultores', time: 'Agora', status: 'SUCCESS' },
    { id: 2, user: 'Maria Júlia', action: 'WhatsApp Desconectado', module: 'Canais', target: 'Pós-venda (+55 64...)', time: 'Há 12 min', status: 'WARNING' },
    { id: 3, user: 'Ana Luiza', action: 'Cotação Criada', module: 'Vendas', target: 'Lead: João Silva', time: 'Há 45 min', status: 'SUCCESS' },
    { id: 4, user: 'Sistema', action: 'Backup Automático', module: 'Database', target: 'Cloud Storage', time: 'Há 2 horas', status: 'SUCCESS' },
    { id: 5, user: 'Higor Santos', action: 'Login realizado', module: 'Sessão', target: 'IP 192.168.1.5', time: 'Há 4 horas', status: 'SUCCESS' },
    { id: 6, user: 'Gustavo Alves', action: 'Usuário Inativado', module: 'RH', target: 'Paula Souza', time: 'Ontem', status: 'SUCCESS' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/app/ajustes')} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Auditoria</h1>
            <p className="text-slate-500 text-sm mt-1">Acompanhe todos os logs de ações realizadas no Viva Experience CRM.</p>
          </div>
        </div>
        <button onClick={() => toast.info('Relatório exportado para CSV')} className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Exportar Logs
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden min-h-[600px]">
        <div className="p-6 border-b border-slate-50 flex items-center gap-4">
           <div className="relative flex-1">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
              type="text" 
              placeholder="Buscar por usuário, ação ou módulo..." 
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
             />
           </div>
           <button className="px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-600 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
             <Filter className="w-4 h-4" />
             Filtros
           </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                <th className="px-8 py-5">Horário</th>
                <th className="px-8 py-5">Usuário</th>
                <th className="px-8 py-5">Ação Realizada</th>
                <th className="px-8 py-5">Módulo</th>
                <th className="px-8 py-5">Detalhes</th>
                <th className="px-8 py-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.filter(l => l.user.toLowerCase().includes(searchTerm.toLowerCase()) || l.action.toLowerCase().includes(searchTerm.toLowerCase())).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-slate-300" />
                      <span className="text-xs font-medium text-slate-500">{log.time}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600">
                        {log.user.charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-slate-800">{log.user}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{log.module}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-xs font-medium text-slate-600 italic">"{log.target}"</span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button className="p-2 hover:bg-white rounded-lg text-slate-300 hover:text-blue-600 transition-all border border-transparent hover:border-slate-100">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
