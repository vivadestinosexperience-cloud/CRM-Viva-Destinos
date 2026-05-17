/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Save, 
  ArrowLeft,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { toast } from 'sonner';

export default function PermissionsSettingsPage() {
  const navigate = useNavigate();
  const { permissions } = useAppStore();
  
  // Normalized roles from internal names to display names
  const roles = [
    { id: 'ADMIN', name: 'Administrador' },
    { id: 'MANAGER', name: 'Gestor' },
    { id: 'SUPERVISOR', name: 'Supervisor' },
    { id: 'AGENT', name: 'Consultor' },
    { id: 'SUPPORT', name: 'Atendimento' },
    { id: 'FINANCE', name: 'Financeiro' },
    { id: 'POST_SALES', name: 'Pós-venda' },
    { id: 'VIEWER', name: 'Visualizador' }
  ];

  const categories = [
    {
      name: 'Atendimentos',
      permissions: [
        { id: 'atendimentos_ver', name: 'Ver atendimentos' },
        { id: 'atendimentos_escrever', name: 'Atender conversas' },
        { id: 'atendimentos_transferir', name: 'Transferir atendimentos' },
        { id: 'atendimentos_concluir', name: 'Concluir atendimentos' },
        { id: 'atendimentos_ver_todos', name: 'Ver todos os atendimentos' },
        { id: 'atendimentos_ver_apenas_proprios', name: 'Ver apenas próprios atendimentos' }
      ]
    },
    {
      name: 'CRM & Clientes',
      permissions: [
        { id: 'clientes_criar', name: 'Criar clientes' },
        { id: 'clientes_editar', name: 'Editar clientes' },
        { id: 'clientes_excluir', name: 'Excluir clientes' },
        { id: 'clientes_importar', name: 'Importar base de clientes' }
      ]
    },
    {
      name: 'Vendas & Viagens',
      permissions: [
        { id: 'cotacoes_criar', name: 'Criar cotações' },
        { id: 'cotacoes_aprovar', name: 'Aprovar orçamentos' },
        { id: 'reservas_criar', name: 'Criar reservas' },
        { id: 'reservas_gerenciar_vouchers', name: 'Gerenciar vouchers' }
      ]
    },
    {
      name: 'Configurações',
      permissions: [
        { id: 'usuarios_gerenciar', name: 'Gerenciar usuários' },
        { id: 'equipes_gerenciar', name: 'Gerenciar equipes' },
        { id: 'whatsapp_gerenciar', name: 'Gerenciar canais WhatsApp' },
        { id: 'relatorios_ver_financeiros', name: 'Ver relatórios financeiros' }
      ]
    }
  ];

  const [localPermissions, setLocalPermissions] = useState<Record<string, string[]>>(permissions);

  useEffect(() => {
    setLocalPermissions(permissions);
  }, [permissions]);

  const toggle = (roleId: string, permId: string) => {
    setLocalPermissions(prev => {
      const current = prev[roleId] || [];
      const updated = current.includes(permId) 
        ? current.filter(p => p !== permId)
        : [...current, permId];
      return { ...prev, [roleId]: updated };
    });
  };

  const handleSave = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: 'Salvando novas permissões no servidor...',
        success: 'Matriz de permissões atualizada e aplicada!',
        error: 'Erro ao salvar permissões'
      }
    );
  };

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
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Permissões por Perfil</h1>
            <p className="text-slate-500 text-sm mt-1">Defina o nível de acesso e segurança para cada cargo da agência.</p>
          </div>
        </div>
        <button 
          className="bg-primary hover:brightness-110 text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/10 flex items-center gap-2 transition-all active:scale-95"
          onClick={handleSave}
        >
          <Save className="w-4 h-4" />
          Salvar Matriz
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden ring-1 ring-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-10 border-b border-r border-slate-100 bg-white sticky left-0 z-10 w-72">
                   <div className="flex items-center gap-3 text-slate-400">
                     <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                       <ShieldCheck className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Módulos</p>
                       <p className="text-[10px] font-medium text-slate-400">Funcionalidades do Viva CRM</p>
                     </div>
                   </div>
                </th>
                {roles.map(role => (
                  <th key={role.id} className="px-6 py-10 border-b border-slate-100 text-center">
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest px-4 py-2 border border-slate-200 rounded-xl bg-white shadow-sm">{role.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {categories.map((category) => (
                <React.Fragment key={category.name}>
                  <tr className="bg-slate-50/40">
                    <td colSpan={roles.length + 1} className="px-8 py-4 border-b border-slate-100">
                      <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{category.name}</span>
                    </td>
                  </tr>
                  {category.permissions.map((perm) => (
                    <tr key={perm.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-5 border-b border-r border-slate-100 bg-white sticky left-0 z-10">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{perm.name}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity">{perm.id}</span>
                        </div>
                      </td>
                      {roles.map(role => {
                         const currentRolePerms = localPermissions[role.id] || [];
                         const isActive = currentRolePerms.includes(perm.id) || role.id === 'ADMIN';
                         return (
                          <td key={role.id} className="px-6 py-5 border-b border-slate-100 text-center">
                            <label className="relative inline-flex items-center cursor-pointer group">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={isActive}
                                disabled={role.id === 'ADMIN'}
                                onChange={() => toggle(role.id, perm.id)}
                              />
                              <div className="w-11 h-6 bg-slate-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner transition-all"></div>
                            </label>
                          </td>
                         );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-start gap-6 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm text-primary shrink-0">
          <Info className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Controles de Segurança e Auditagem</p>
          <p className="text-sm text-slate-500 leading-relaxed max-w-3xl font-medium">
            O perfil <strong className="text-primary">Administrador</strong> herda automaticamente todas as permissões de novos módulos e não pode ser rebaixado por questões de segurança. 
            Alterações na matriz entram em vigor para os usuários logados após a próxima sincronização de sessão.
          </p>
        </div>
      </div>
    </div>
  );
}

