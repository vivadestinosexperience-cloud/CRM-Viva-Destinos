import React, { useEffect, useState } from 'react';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  MessageSquare, 
  Tag as TagIcon,
  Info,
  Clock,
  ExternalLink,
  Users,
  UserCheck,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { authorizedFetch } from '../services/api';

interface LeadDetailsModalProps {
  conversationId: string;
  onClose: () => void;
}

export default function LeadDetailsModal({ conversationId, onClose }: LeadDetailsModalProps) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDetails();
  }, [conversationId]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      const res = await authorizedFetch(`/api/omnichannel/conversations/${conversationId}/details`);
      const data = await res.json();
      if (!res.ok) throw data;
      setDetails(data.details);
    } catch (err: any) {
      toast.error('Erro ao carregar detalhes do lead');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const formatDatePT = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Não registrada';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch (e) {
      return 'Data inválida';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
        <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Carregando detalhes...</p>
        </div>
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{details.customer?.name || 'Lead'}</h2>
              <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">Detalhes Completos do Lead</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Info Section */}
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Informações de Contato</h3>
                
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <Phone className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Telefone</p>
                    <p className="text-sm font-bold text-slate-700">{details.customer?.phone || details.customer_phone_normalized}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                  <Mail className="w-4 h-4 text-emerald-500" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">E-mail</p>
                    <p className="text-sm font-bold text-slate-700">{details.customer?.email || 'Não informado'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Atribuição e Origem</h3>
                
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <Users className="w-4 h-4 text-violet-500" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Equipe</p>
                    <p className="text-sm font-bold text-slate-700">{details.team_name || 'Comercial'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                  <UserCheck className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Responsável</p>
                    <p className="text-sm font-bold text-slate-700">{details.assigned_user_name || 'Sem responsável'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                  <Zap className="w-4 h-4 text-pink-500" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Origem do Lead</p>
                    <p className="text-sm font-bold text-slate-700 capitalize">{details.origin || details.source || 'Z-API WhatsApp'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Section */}
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Linha do Tempo</h3>
                
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <Calendar className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Criação do Lead</p>
                    <p className="text-sm font-bold text-slate-700">{formatDatePT(details.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                  <Clock className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Primeira Interação</p>
                    <p className="text-sm font-bold text-slate-700">{formatDatePT(details.first_interaction_at)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                  <MessageSquare className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Última Interação</p>
                    <p className="text-sm font-bold text-slate-700">{formatDatePT(details.last_interaction_at)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                  <Info className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total de Mensagens</p>
                    <p className="text-sm font-bold text-emerald-600">{details.total_messages} mensagens</p>
                  </div>
                </div>
              </div>

              {/* Tags Section */}
              <div className="space-y-1 pt-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Etiquetas Vinculadas</h3>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  {details.tags && details.tags.length > 0 ? (
                    details.tags.map((tag: any) => (
                      <span 
                        key={tag.id}
                        className="px-2 py-1 rounded-lg text-[10px] font-black text-white uppercase tracking-wider shadow-sm"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">Nenhuma etiqueta vinculada</span>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-50 flex items-center justify-end gap-3 bg-slate-50/30">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95"
          >
            Fechar
          </button>
          <button 
            onClick={() => window.open(`https://wa.me/${details.customer_phone_normalized}`, '_blank')}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700 active:scale-95"
          >
            <ExternalLink className="w-4 h-4" /> WhatsApp
          </button>
        </div>
      </motion.div>
    </div>
  );
}
