import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Trash2, ShieldAlert, CheckCircle, RefreshCw, Layers, Database } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { authorizedFetch, safeReadJson } from '../../services/api';
import { toast } from 'sonner';

export default function ProductionResetSettingsPage() {
  const navigate = useNavigate();
  const { initializeAppData, currentUser } = useAppStore();
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'ADMIN';

  const requiredWord = 'LIMPAR';

  const handleReset = async () => {
    if (typedConfirmation !== requiredWord) {
      toast.error(`Por favor, digite "${requiredWord}" para confirmar.`);
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Clear database elements
      const res = await authorizedFetch('/api/admin/reset-production-data', {
        method: 'POST',
      });
      const data = await safeReadJson(res);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro na resposta do servidor.');
      }

      // 2. Clear LocalStorage Kanban Cards
      localStorage.setItem('viva_crm_kanban_cards', JSON.stringify([]));

      // 3. Re-initialize state in store so it wipes immediately in the interface
      await initializeAppData();

      setIsCompleted(true);
      toast.success('Ambiente limpo com sucesso para PRODUÇÃO!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao restaurar banco produtivo: ' + (err.message || 'Erro de conexão'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-6">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito</h2>
        <p className="text-slate-500">Apenas administradores podem realizar a limpeza produtiva da plataforma.</p>
        <button
          onClick={() => navigate('/app/ajustes')}
          className="px-6 py-2.5 bg-slate-200 text-slate-700 font-medium rounded-2xl hover:bg-slate-300 transition-all text-sm uppercase tracking-wider"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/app/ajustes')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer text-slate-500 hover:text-slate-700"
          title="Voltar para Ajustes"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <span className="text-[10px] bg-rose-50 border border-rose-200 text-rose-600 font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full">
            Restrito à Administração
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Limpeza de Produção</h1>
          <p className="text-slate-500 text-sm mt-0.5">Zere todos os dados transacionais e prepare sua plataforma para produção.</p>
        </div>
      </div>

      {isCompleted ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 bg-white border border-emerald-100 rounded-3xl shadow-xl shadow-emerald-500/5 text-center space-y-6 max-w-2xl mx-auto"
        >
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500 border border-emerald-100 shadow-md">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Cochilo de Testes Removido!</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Excelente! Toda a base de dados de teste (contatos de teste, mensagens, atendimentos e colunas do Kanban) foi redefinida para zero absoluto.
            </p>
          </div>
          <p className="text-xs text-slate-400 bg-slate-50 py-2.5 rounded-xl border">
            A automação de criação automática de cards para novos clientes está ATIVA na fase "DEMONSTROU INTERESSE" do seu painel.
          </p>
          <div className="flex justify-center gap-4 pt-2">
            <button
              onClick={() => navigate('/app/kanban')}
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
            >
              Ir ao Painel CRM
            </button>
            <button
              onClick={() => navigate('/app/atendimentos')}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-500/15 transition-all cursor-pointer"
            >
              Ir ao Chat Multicanal
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Controls Card */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-100 p-6 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-600" />
              
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 uppercase tracking-wide text-xs">Aviso Crítico de Redefinição</h3>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                    Esta ação é <span className="font-bold text-rose-600 text-sm">irreversível</span>. Ela foi projetada especificamente para limpar a sujeira acumulada de mensagens fictícias e clientes fictícios durante homologação e simulação do CRM.
                  </p>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-4">
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Para prosseguir, digite <span className="text-rose-600 font-extrabold select-all px-1.5 py-0.5 rounded bg-rose-50 font-mono tracking-normal">{requiredWord}</span> abaixo:
                </label>
                <input
                  type="text"
                  placeholder="Digite aqui..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-blue-500/15 text-sm outline-none transition-all"
                  value={typedConfirmation}
                  onChange={(e) => setTypedConfirmation(e.target.value)}
                  disabled={isDeleting}
                />
              </div>

              <button
                onClick={handleReset}
                disabled={typedConfirmation !== requiredWord || isDeleting}
                className={`w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest text-white flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  typedConfirmation === requiredWord && !isDeleting
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/15'
                    : 'bg-slate-200 cursor-not-allowed text-slate-400'
                }`}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Formatando base para produção...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    LIMPAR E PREPARAR AMBIENTE PRODUTIVO
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Diagnostic Sidebar info */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5">
              <h3 className="font-bold text-slate-800 uppercase tracking-wide text-xs flex items-center gap-2">
                <Database className="w-4 h-4 text-rose-500" />
                Resumo De Limpeza
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-rose-600 tracking-widest">Wiped (Serão apagados):</span>
                  <ul className="text-xs text-slate-500 list-disc list-inside space-y-1.5 pl-1">
                    <li>Atendimentos (Conversas)</li>
                    <li>Histórico de Mensagens</li>
                    <li>Fila de Campanhas</li>
                    <li>Cards de Kanban locais</li>
                    <li>Notas e Etiquetas vinculadas</li>
                    <li>Clientes criados</li>
                    <li>Logs Webhook Z-API</li>
                  </ul>
                </div>

                <div className="h-px bg-slate-100" />

                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-widest">Kept (Serão preservados):</span>
                  <ul className="text-xs text-slate-500 list-disc list-inside space-y-1.5 pl-1">
                    <li>Usuários do CRM</li>
                    <li>Sua Equipe cadastrada</li>
                    <li>As Conexões do WhatsApp</li>
                    <li>Respostas Rápidas</li>
                    <li>Sua Fila de Atendimento</li>
                    <li>Tags Principais criadas</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
