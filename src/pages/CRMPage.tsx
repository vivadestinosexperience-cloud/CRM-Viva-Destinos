/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Filter, 
  MoreHorizontal, 
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useAppStore } from '../store/useAppStore';
import { Customer } from '../types';

export default function CRMPage() {
  const { customers, addCustomer, deleteCustomer, isSaving } = useAppStore();
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    city: '',
    origin: 'Instagram',
    temperature: 'WARM'
  });

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast.error('Nome e Telefone são obrigatórios');
      return;
    }

    try {
      await addCustomer(formData as Customer);
      setShowNewContactModal(false);
      setFormData({
        name: '',
        phone: '',
        email: '',
        city: '',
        origin: 'Instagram',
        temperature: 'WARM'
      });
      toast.success('Cliente cadastrado com sucesso!');
    } catch (err) {
      toast.error('Erro ao cadastrar cliente');
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Remover permanentemente ${name}?`)) {
      deleteCustomer(id);
      toast.success('Cliente removido');
    }
    setActiveMenuId(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans animate-in fade-in duration-500">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Gestão de Clientes</h2>
          <p className="text-sm text-slate-500 mt-1">Base centralizada de contatos da Viva Destinos.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowNewContactModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input 
              type="text" 
              placeholder="Buscar por nome, telefone ou e-mail..." 
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Base Total</p>
            <p className="text-xl font-black text-slate-800 tracking-tight">{customers.length}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-8">
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificação</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contato</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status Lead</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Origem</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right px-10">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-blue-50/20 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 border border-white shadow-sm ring-1 ring-slate-100 transition-all group-hover:rotate-6">
                        {customer.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{customer.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {customer.city || 'Não informado'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="space-y-1">
                       <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
                         <Phone className="w-3 h-3 text-emerald-500" /> {customer.phone}
                       </p>
                       <p className="text-[10px] font-medium text-slate-400 flex items-center gap-2">
                         <Mail className="w-3 h-3" /> {customer.email || 'Sem e-mail'}
                       </p>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                     <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          customer.temperature === 'HOT' ? 'bg-red-50 text-red-600' : 
                          customer.temperature === 'COLD' ? 'bg-slate-100 text-slate-500' : 
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {customer.temperature === 'HOT' ? 'Foco Prioritário' : 
                           customer.temperature === 'COLD' ? 'Frio' : 'Qualificado'}
                        </span>
                     </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 uppercase">
                      {customer.origin || 'Instagram'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right relative px-10">
                    <button 
                      onClick={() => setActiveMenuId(activeMenuId === customer.id ? null : customer.id)}
                      className="p-2.5 hover:bg-white hover:shadow-md rounded-xl text-slate-300 hover:text-slate-600 transition-all active:scale-90"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>

                    <AnimatePresence>
                      {activeMenuId === customer.id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, x: 10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: 10 }}
                          className="absolute right-20 top-1/2 -translate-y-1/2 z-50 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 text-left"
                        >
                           <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-all text-xs font-bold text-slate-600">
                              <ArrowUpRight className="w-4 h-4 text-slate-400" />
                              Perfil Completo
                           </button>
                           <div className="h-px bg-slate-50 my-1 mx-2" />
                           <button 
                            onClick={() => handleDelete(customer.id, customer.name)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-xl transition-all text-xs font-bold text-red-600"
                           >
                              <Trash2 className="w-4 h-4 text-red-300" />
                              Excluir Cliente
                           </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200">
                        <Users className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-bold text-slate-400">Nenhum cliente encontrado na busca.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Contact Modal */}
      <AnimatePresence>
        {showNewContactModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewContactModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-10 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-[0.1em]">Novo Cadastro</h3>
                  <p className="text-xs text-slate-400 font-medium">Insira as informações básicas do lead.</p>
                </div>
                <button onClick={() => setShowNewContactModal(false)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-300 transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-10 space-y-8">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2 flex flex-col">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nome Completo</label>
                    <input 
                      type="text"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700"
                      placeholder="João da Silva"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2 flex flex-col">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">WhatsApp</label>
                      <input 
                        type="tel"
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700"
                        placeholder="+55"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">E-mail</label>
                      <input 
                        type="email"
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700"
                        placeholder="contato@ex.com"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Temperatura</label>
                        <select 
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700 appearance-none"
                          value={formData.temperature}
                          onChange={(e) => setFormData({...formData, temperature: e.target.value as any})}
                        >
                          <option value="COLD">Frio</option>
                          <option value="WARM">Morno / Qualificado</option>
                          <option value="HOT">Quente / Imediato</option>
                        </select>
                     </div>
                     <div className="space-y-2 flex flex-col">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Origem</label>
                        <select 
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700 appearance-none"
                          value={formData.origin}
                          onChange={(e) => setFormData({...formData, origin: e.target.value})}
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Google">Google Ads</option>
                          <option value="Site">Site Viva</option>
                          <option value="Indicação">Indicação</option>
                        </select>
                     </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-5 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowNewContactModal(false)}
                    className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="px-10 py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-blue-100 hover:brightness-110 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirmar Cadastro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
