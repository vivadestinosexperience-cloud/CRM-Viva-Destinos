/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, MessageSquare, Download, Clock, CheckCircle2, ArrowRightLeft, Megaphone, Send, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store/useAppStore';

export default function ReportsPage() {
  const { customers, conversations, messages, users, teams, campaigns } = useAppStore();
  const [activeTab, setActiveTab] = useState<'ATENDIMENTOS' | 'CAMPANHAS'>('ATENDIMENTOS');

  const handleExport = () => {
    const headers = ['Data', 'Status', 'Cliente', 'Equipe', 'Mensagens'];
    const dataRows = conversations.map(c => [
      c.created_at,
      c.status,
      c.customer?.name || customers.find(cust => cust.id === c.customer_id)?.name || '---',
      teams.find(t => t.id === c.queue_id)?.name || '---',
      messages.filter(m => m.conversation_id === c.id).length
    ]);
    
    const csvContent = [headers, ...dataRows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "relatorio_viva_experience.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV exportado com sucesso!');
  };

  // Dynamic Chart Data (Last 24h)
  const now = new Date();
  const last24h = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(now);
    hour.setHours(now.getHours() - (23 - i), 0, 0, 0);
    const count = messages.filter(m => {
      const msgDate = new Date(m.created_at);
      return msgDate.getHours() === hour.getHours() && msgDate.getDate() === hour.getDate();
    }).length;
    return count;
  });

  const maxVolume = Math.max(...last24h, 1);
  const chartBars = last24h.map(v => (v / maxVolume) * 100);

  const totalConversations = conversations.length || 0;
  const resolvedConversations = conversations.filter(c => c.status === 'RESOLVED').length;
  const resolutionRate = totalConversations > 0 ? ((resolvedConversations / totalConversations) * 100).toFixed(1) : "0";

  const kpis = [
    { label: 'Total de Atendimentos', value: totalConversations.toString(), trend: 'Acumulado', icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Taxa de Resolução', value: `${resolutionRate}%`, trend: 'Geral', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Abertos / Em Curso', value: conversations.filter(c => c.status === 'OPEN').length.toString(), trend: 'Ativos', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Novos Clientes', value: customers.length.toString(), trend: '+12%', icon: Users, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  const statusDistribution = [
    { name: 'Abertos', value: conversations.filter(c => c.status === 'OPEN').length || 0, color: 'bg-blue-500' },
    { name: 'Em Atendimento', value: conversations.filter(c => c.status === 'OPEN').length || 0, color: 'bg-amber-500' }, // Simulating sub-status
    { name: 'Transferidos', value: conversations.filter(c => c.status === 'TRANSFERRED').length || 0, color: 'bg-purple-500' },
    { name: 'Resolvidos', value: resolvedConversations, color: 'bg-emerald-500' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans animate-in fade-in duration-500">
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Relatórios Operacionais</h2>
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit mt-2">
            <button 
              onClick={() => setActiveTab('ATENDIMENTOS')}
              className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'ATENDIMENTOS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Atendimentos
            </button>
            <button 
              onClick={() => setActiveTab('CAMPANHAS')}
              className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'CAMPANHAS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Campanhas
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 space-y-8">
        {activeTab === 'ATENDIMENTOS' ? (
          <>
            {/* Main KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               {kpis.map((kpi, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md group">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2.5 rounded-xl ${kpi.bg} ${kpi.color}`}>
                        <kpi.icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-widest`}>
                        {kpi.trend}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{kpi.label}</p>
                    <p className="text-2xl font-black text-slate-800 tracking-tight">{kpi.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Chart Display */}
              <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-bold text-slate-800">Volume de Mensagens (24h)</h3>
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 flex items-end justify-between gap-1 h-64 border-b border-slate-50 pb-2">
                  {chartBars.map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                       <div 
                        className="w-full bg-blue-100 rounded-t-lg transition-all duration-500 group-hover:bg-blue-600 cursor-help min-h-[4px]" 
                        style={{ height: `${Math.max(h, 2)}%` }}
                        title={`${last24h[i]} mensagens`}
                      ></div>
                      <span className="text-[7px] font-bold text-slate-300 hidden md:block">{(now.getHours() - (23 - i) + 24) % 24}h</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Distribution */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6">Distribuição por Status</h3>
                <div className="space-y-6">
                  {statusDistribution.map((status) => {
                     const percentage = totalConversations > 0 ? ((status.value / totalConversations) * 100).toFixed(0) : "0";
                     return (
                      <div key={status.name} className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider">
                          <span className="text-slate-500">{status.name}</span>
                          <span className="text-slate-800">{status.value} ({percentage}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                          <div className={`h-full ${status.color} transition-all duration-1000 shadow-sm`} style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                     );
                  })}
                </div>
                
                <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <div className="flex items-center gap-3 text-blue-600 mb-2">
                      <ArrowRightLeft className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Transferências</span>
                   </div>
                   <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                     O volume de transferências reflete a necessidade de escalonamento entre equipes. 
                     Mantenha este índice abaixo de 15% para melhor experiência do cliente.
                   </p>
                </div>
              </div>
            </div>

            {/* Team Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Performance por Consultor</h3>
              </div>
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                   <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <th className="px-8 py-5">Consultor</th>
                      <th className="px-8 py-5">Atendimentos</th>
                      <th className="px-8 py-5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {users.map((user) => {
                      const userConvs = conversations.filter(c => c.assigned_user_id === user.id || (c as any).responsibleId === user.id).length;
                      return (
                        <tr key={user.id} className="hover:bg-blue-50/20 transition-all group">
                           <td className="px-8 py-5">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm border-2 border-white shadow-sm ring-1 ring-slate-100 transition-all group-hover:rotate-6">
                                  {user.name.charAt(0)}
                                </div>
                                <div>
                                   <p className="text-sm font-bold text-slate-800">{user.name}</p>
                                   <p className="text-[10px] text-slate-400 font-medium uppercase">{user.role || 'Agente'}</p>
                                </div>
                             </div>
                           </td>
                           <td className="px-8 py-5 text-sm font-bold text-slate-600">
                             {userConvs} chats
                           </td>
                           <td className="px-8 py-5">
                             <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${userConvs > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                               {userConvs > 0 ? 'Ativo' : 'Inativo'}
                             </span>
                           </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Campaign KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Campanhas', value: campaigns.length, icon: Megaphone, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Total Enviados', value: campaigns.reduce((acc, c) => acc + c.sent_count, 0), icon: Send, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Taxa Média Leitura', value: '68%', icon: CheckCircle2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Falhas de Entrega', value: campaigns.reduce((acc, c) => acc + c.failed_count, 0), icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                     <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                       <stat.icon className="w-5 h-5" />
                     </div>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</p>
                </div>
              ))}
            </div>

            <section className="space-y-4">
               <h3 className="text-lg font-bold text-slate-800 tracking-tight">Desempenho de Campanhas Recentes</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {campaigns.map(campaign => (
                   <div key={campaign.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm group hover:shadow-xl transition-all">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="font-black text-slate-800 uppercase tracking-tight">{campaign.name}</h4>
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${campaign.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                          {campaign.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-8">
                         <div className="text-center">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Enviados</p>
                            <p className="text-lg font-black text-slate-700">{campaign.sent_count}</p>
                         </div>
                         <div className="w-px h-8 bg-slate-100" />
                         <div className="text-center">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Lidos</p>
                            <p className="text-lg font-black text-indigo-500">{campaign.read_count}</p>
                         </div>
                         <div className="w-px h-8 bg-slate-100" />
                         <div className="text-center">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">CTR</p>
                            <p className="text-lg font-black text-emerald-500">
                              {campaign.sent_count > 0 ? ((campaign.read_count / campaign.sent_count) * 100).toFixed(0) : 0}%
                            </p>
                         </div>
                      </div>

                      <div className="mt-8 flex items-center justify-between">
                         <p className="text-[9px] font-bold text-slate-400">Criada em {new Date(campaign.created_at).toLocaleDateString()}</p>
                         <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline decoration-2 underline-offset-4 transition-all">Ver Detalhes</button>
                      </div>
                   </div>
                 ))}
               </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
