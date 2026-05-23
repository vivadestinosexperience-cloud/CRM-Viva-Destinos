import React from 'react';
import { X, User, Phone, Mail, Calendar, Clock, MessageSquare, Tag, ExternalLink, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getContrastTextColor } from '../utils/colorUtils';

interface LeadDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: any;
  onUnlinkTag: (tagId: string) => Promise<void>;
  loading?: boolean;
}

const formatBRDate = (dateString?: string) => {
  if (!dateString) return '---';
  const date = new Date(dateString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export function LeadDetailsModal({ isOpen, onClose, details, onUnlinkTag, loading }: LeadDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white relative">
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-2xl shadow-inner uppercase">
                {details?.customer?.name?.charAt(0) || 'L'}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{details?.customer?.name || 'Detalhes do Lead'}</h2>
                <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full tracking-widest">
                  Protocolo: {details?.id?.split('-')[0] || '---'}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-full transition-all">
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-30">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="font-bold text-slate-500 uppercase tracking-widest text-xs">Carregando informações...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna 1: Informações de Contato */}
                <div className="space-y-8">
                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                       <User className="w-3.5 h-3.5" /> Informações de Contato
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
                          <Phone className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Telefone</p>
                          <p className="font-bold text-slate-700">{details?.customer?.phone || '---'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</p>
                          <p className="font-bold text-slate-700">{details?.customer?.email || 'Não informado'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Canal de Entrada</p>
                          <p className="font-bold text-slate-700">{details?.source || 'WhatsApp Z-API'}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                       <Tag className="w-3.5 h-3.5" /> Etiquetas Atuais
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {details?.tags && details.tags.filter((t: any) => t && t.id).length > 0 ? (
                        details.tags.filter((tag: any) => tag && tag.id).map((tag: any) => (
                          <div 
                            key={tag.id}
                            className="group relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all hover:scale-105"
                            style={{ backgroundColor: tag.color || '#eee', color: getContrastTextColor(tag.color) }}
                          >
                            {tag.name}
                            <button 
                              onClick={() => onUnlinkTag(tag.id)}
                              className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                            
                            {/* Tooltip com histórico */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[9px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none shadow-xl">
                              <p className="font-black uppercase tracking-widest mb-1 border-b border-white/10 pb-1">Histórico</p>
                              <p>Adicionado por: <span className="text-blue-300 font-bold">{tag.linked_by_name || 'Sistema'}</span></p>
                              <p>Em: {formatBRDate(tag.linked_at)}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm italic text-slate-400">Nenhuma etiqueta vinculada.</p>
                      )}
                    </div>
                  </section>Section ends here
                </div>

                {/* Coluna 2: Atendimento e Prazos */}
                <div className="space-y-8">
                  <section className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                       <History className="w-3.5 h-3.5" /> Jornada do Atendimento
                    </h3>
                    <div className="space-y-6">
                      <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                        <div className="relative">
                          <div className="absolute -left-[30px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-50 shadow-sm" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Criado em</p>
                            <p className="font-bold text-slate-700 text-sm">{formatBRDate(details?.created_at)}</p>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-[30px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50 shadow-sm" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Primeira Resposta</p>
                            <p className="font-bold text-slate-700 text-sm">{formatBRDate(details?.first_interaction_at)}</p>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-[30px] top-1 w-3 h-3 rounded-full bg-slate-400 ring-4 ring-slate-100 shadow-sm" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Última Atividade</p>
                            <p className="font-bold text-slate-700 text-sm">{formatBRDate(details?.last_interaction_at)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</p>
                           <p className="font-black text-blue-600 text-xs uppercase">{details?.status || '---'}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Mensagens</p>
                           <p className="font-black text-slate-700 text-sm">{details?.total_messages || 0}</p>
                        </div>
                      </div>
                    </div>
                  </section>Section ends here

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                       <User className="w-3.5 h-3.5" /> Atendente Responsável
                    </h3>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold uppercase text-xs">
                        {details?.assigned_user_name?.charAt(0) || '-'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-700 text-sm">{details?.assigned_user_name || 'Aguardando Atendente'}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{details?.team_name || 'Fila Geral'}</p>
                      </div>
                    </div>
                  </section>Section ends here
                </div>
              </div>
            )}
          </div>

          <div className="p-6 md:p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
             <button 
              onClick={onClose}
              className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-900 transition-all text-xs shadow-xl shadow-slate-200"
            >
              Concluir Visualização
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
