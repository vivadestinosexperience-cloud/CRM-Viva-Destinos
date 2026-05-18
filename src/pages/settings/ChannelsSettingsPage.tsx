/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Smartphone, Cloud, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  MoreVertical, Key, Globe, Database, Briefcase, Instagram, Facebook, MessageSquare, Info,
  ArrowLeft, ChevronRight, X, User as UserIcon, Smartphone as MobileIcon, Layers, Activity, History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useAppStore } from '../../store/useAppStore';
import { WhatsAppAccount } from '../../types';
import { toast } from 'sonner';
import { getErrorMessage as getGlobalErrorMessage } from '../../utils/getErrorMessage';
import { safeAction } from '../../utils/safeAction';

function getErrorMessage(error: any): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  if (error.error) return String(error.error);

  if (error.details) {
    if (typeof error.details === "string") return error.details;
    if (error.details.error) return String(error.details.error);
    if (error.details.message) return String(error.details.message);

    try {
      return JSON.stringify(error.details, null, 2);
    } catch {
      return "Erro detalhado indisponível.";
    }
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "Erro desconhecido.";
  }
}

function normalizeQrCodeValue(data: any): { value: string; type: 'IMAGE' | 'RAW' } | null {
  const possibleValue =
    data?.value ||
    data?.qrCode ||
    data?.qrcode ||
    data?.base64 ||
    data?.image ||
    data?.src ||
    null;

  if (!possibleValue) return null;

  const value = String(possibleValue).trim();

  if (!value) return null;

  // Se for uma imagem base64 ou URL de imagem (extensões comuns)
  if (value.startsWith("data:image")) {
    return { value, type: 'IMAGE' };
  }

  // Links do WhatsApp são PAYLOADS para serem transformados em QR Code, não são imagens
  if (value.startsWith("https://wa.me/")) {
    return { value, type: 'RAW' };
  }

  // URLs comuns de imagem
  if (value.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
    return { value, type: 'IMAGE' };
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    // Se for URL mas não sabermos se é imagem, tentamos RAW se não terminar em extensão de imagem
    // mas Z-API costuma mandar o link wa.me como payload
    return { value, type: 'RAW' };
  }

  // se vier apenas base64 puro sem prefixo, assumimos imagem
  if (value.length > 100 && !value.includes(" ")) {
     return { value: `data:image/png;base64,${value}`, type: 'IMAGE' };
  }

  // fallback para RAW
  return { value, type: 'RAW' };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'ESTÁVEL': { label: 'Estável', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'DISCONNECTED': { label: 'Desconectado', color: 'text-rose-600', bg: 'bg-rose-50' },
  'CONECTANDO': { label: 'Conectando', color: 'text-blue-600', bg: 'bg-blue-50' },
  'ERROR': { label: 'Erro', color: 'text-amber-600', bg: 'bg-amber-50' },
  'WAITING_QR': { label: 'Aguardando QR Code', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  'WAITING_CREDENTIALS': { label: 'Aguardando credenciais', color: 'text-slate-400', bg: 'bg-slate-50' }
};

export default function ChannelsSettingsPage() {
  const { whatsAppAccounts, addWhatsAppAccount, updateWhatsAppAccount, deleteWhatsAppAccount, isSaving, teams, users } = useAppStore();
  const [showZapiModal, setShowZapiModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    teamId: '',
    responsibleId: ''
  });

  const [isCheckingConfig, setIsCheckingConfig] = useState(false);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ value: string; type: 'IMAGE' | 'RAW' } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<any | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const safeReadJson = async (response: Response) => {
    const text = await response.text();
    if (!text) {
      return { success: false, error: "Resposta vazia do servidor.", status: response.status };
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { success: false, error: "Resposta inválida do servidor.", raw: text, status: response.status };
    }
  };

  const refreshWebhookLogs = async () => {
    setIsLoadingLogs(true);
    await safeAction(async () => {
      const res = await fetch('/api/zapi/webhook-logs');
      const data = await safeReadJson(res);
      if (!res.ok) throw data;
      setWebhookLogs(Array.isArray(data.logs) ? data.logs : []);
      setShowLogsModal(true);
    }, { label: 'Erro ao buscar logs de webhook' });
    setIsLoadingLogs(false);
  };

  const handleReprocessLog = async (logId: string) => {
    toast.promise(
      fetch(`/api/zapi/webhook-logs/${logId}/reprocess`, { method: 'POST' })
        .then(async res => {
          const data = await safeReadJson(res);
          if (!res.ok || !data.success) throw data;
          return data;
        }),
      {
        loading: 'Reprocessando webhook...',
        success: () => {
          refreshWebhookLogs();
          return 'Webhook reprocessado com sucesso!';
        },
        error: (err) => `Erro ao reprocessar: ${getErrorMessage(err)}`
      }
    );
  };

  const refreshConfigStatus = async () => {
    return safeAction(async () => {
      const [statusRes, infoRes] = await Promise.all([
        fetch('/api/zapi/config-status'),
        fetch('/api/webhook-info')
      ]);
      
      const statusData = await safeReadJson(statusRes);
      const infoData = await safeReadJson(infoRes);
      
      if (!statusRes.ok) throw statusData;
      if (!infoRes.ok) throw infoData;

      setConfigStatus(statusData);
      setWebhookUrl(infoData.webhookUrl || `${window.location.origin}/api/webhooks/zapi/received`);
      
      return statusData;
    }, { label: 'Erro ao verificar configuração', showToast: false });
  };

  useEffect(() => {
    refreshConfigStatus();
    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

  const resetModal = () => {
    setShowZapiModal(false);
    setQrCodeData(null);
    setQrError(null);
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    setFormData({
      name: '',
      phone: '',
      teamId: '',
      responsibleId: ''
    });
  };

  async function handleCheckConfig() {
    try {
      setIsCheckingConfig(true);
      setQrError(null);

      const response = await fetch("/api/zapi/config-status");
      const data = await safeReadJson(response);

      setConfigStatus(data);

      if (!response.ok || !data.configured) {
        const missing = Array.isArray(data.missing) ? data.missing.filter(Boolean) : [];
        setQrError(data.message || `Variáveis faltantes: ${missing.join(", ") || "não identificadas"}`);
        return;
      }

      toast.success("Z-API configurada no servidor.");
    } catch (error) {
      setQrError(getErrorMessage(error));
    } finally {
      setIsCheckingConfig(false);
    }
  }

  async function handleGenerateQrCode() {
    try {
      setIsLoadingQr(true);
      setQrError(null);
      setQrCodeData(null);

      const statusResponse = await fetch("/api/zapi/config-status");
      const statusData = await safeReadJson(statusResponse);

      if (!statusResponse.ok || !statusData.configured) {
        const missing = Array.isArray(statusData.missing) ? statusData.missing.filter(Boolean) : [];
        setQrError(statusData.message || `Variáveis faltantes: ${missing.join(", ") || "não identificadas"}`);
        return;
      }

      const response = await fetch("/api/zapi/qrcode");
      const data = await safeReadJson(response);

      console.log("QR Code response:", data);

      if (!response.ok) {
        throw data;
      }

      const normalized = normalizeQrCodeValue(data);

      if (!normalized) {
        throw {
          message: "A Z-API não retornou o QR Code em um formato válido.",
          details: data
        };
      }

      setQrCodeData(normalized);
      startStatusPolling();
    } catch (error) {
      setQrError(getErrorMessage(error));
    } finally {
      setIsLoadingQr(false);
    }
  }

  const startStatusPolling = () => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    statusIntervalRef.current = setInterval(async () => {
      await safeAction(async () => {
        const res = await fetch(`/api/zapi/status`);
        const data = await safeReadJson(res);
        
        if (data.status === 'CONNECTED') {
          handleConnectComplete(data.phone);
        }
      }, { showToast: false });
    }, 5000);
  };

  const handleConnectComplete = async (detectedPhone?: string) => {
     if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
     if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);

     await safeAction(async () => {
       const newChannel: Partial<WhatsAppAccount> = {
          id: `ch-${Date.now()}`,
          name: formData.name || 'WhatsApp Z-API',
          type: 'WHATSAPP',
          provider: 'ZAPI',
          provider_type: 'zapi',
          phone_number: detectedPhone || formData.phone,
          status: 'ESTÁVEL',
          team_id: formData.teamId,
          responsible_user_id: formData.responsibleId,
          created_at: new Date().toISOString()
       };
       await addWhatsAppAccount(newChannel as WhatsAppAccount);
       toast.success("Canal conectado com sucesso!");
       resetModal();
     });
  };

  const checkExistingAccountStatus = async (account: WhatsAppAccount) => {
    await safeAction(async () => {
      const res = await fetch(`/api/zapi/status`);
      const data = await safeReadJson(res);
      
      if (data.status === 'CONNECTED') {
        updateWhatsAppAccount({ ...account, status: 'ESTÁVEL' });
        toast.success(`Canal ${account.name} está Estável!`);
      } else {
        updateWhatsAppAccount({ ...account, status: data.status === 'WAITING_QR' ? 'WAITING_QR' : 'DISCONNECTED' });
        toast.error(`Canal ${account.name} não está conectado.`);
      }
    }, { label: 'Falha ao consultar status na Z-API' });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    safeAction(async () => {
      await deleteWhatsAppAccount(id);
      toast.success('Canal removido com sucesso');
    });
  };

  const handleCopySupportMessage = () => {
    const message = `Olá, preciso localizar ou gerar o Client Token / Token de Segurança da conta da Z-API.
No painel da instância só aparecem ID da instância e Token da instância.
A documentação informa que o endpoint /qr-code exige o header Client-Token.
Onde consigo gerar esse Client Token na minha conta trial?`;
    
    navigator.clipboard.writeText(message);
    toast.success("Mensagem copiada para a área de transferência.");
  };

  const isMissingClientToken = qrError?.toLowerCase().includes("client token");

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            Canais de atendimento
            <span className="bg-blue-100 text-blue-600 text-[10px] uppercase font-black px-3 py-1 rounded-full border border-blue-200">
              Omnichannel
            </span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Configure os canais usados para atendimento omnichannel da Viva Destinos.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={refreshConfigStatus}
            className="flex items-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4 text-emerald-500" />
            Verificar Configuração
          </button>
          <button 
            onClick={() => setShowZapiModal(true)}
            className="bg-blue-600 text-white p-4 rounded-3xl shadow-xl shadow-blue-200 hover:scale-105 active:scale-95 transition-all group"
          >
            <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </header>

      {/* Webhook Configuration Section */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Webhooks Z-API</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configuração de endpoints para eventos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={async () => {
                await safeAction(async () => {
                  const res = await fetch('/api/zapi/test-received-webhook', { method: 'POST' });
                  const data = await safeReadJson(res);
                  if (!res.ok || !data.success) throw data;
                  toast.success(data.message || "Simulação de recebimento enviada com sucesso!");
                }, { label: 'Falha ao testar recebimento' });
              }}
              className="flex items-center gap-2 px-6 py-4 bg-slate-50 text-slate-600 rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-200"
            >
              Testar Recebimento
            </button>
            <button 
              onClick={async () => {
                await safeAction(async () => {
                  const res = await fetch('/api/zapi/register-webhook-received', { method: 'POST' });
                  const data = await safeReadJson(res);
                  if (!res.ok || !data.success) throw data;
                  toast.success("Webhook principal registrado na Z-API com sucesso!");
                }, { label: 'Falha ao registrar webhook' });
              }}
              className="flex items-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              <CheckCircle2 className="w-4 h-4" />
              Registrar Webhook na Z-API
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="space-y-3">
              {[
                { label: 'Ao receber', path: '/api/webhooks/zapi/received' },
                { label: 'Ao enviar', path: '/api/webhooks/zapi/sent' },
                { label: 'Ao desconectar', path: '/api/webhooks/zapi/disconnected' },
                { label: 'Ao conectar', path: '/api/webhooks/zapi/connected' },
                { label: 'Presença do chat', path: '/api/webhooks/zapi/chat-presence' },
                { label: 'Status da mensagem', path: '/api/webhooks/zapi/message-status' },
              ].map((hook) => {
                const fullUrl = webhookUrl 
                  ? (webhookUrl.includes('/received') ? webhookUrl.replace('/api/webhooks/zapi/received', hook.path) : `${webhookUrl.split('/api/')[0]}${hook.path}`)
                  : `${window.location.origin}${hook.path}`;
                
                return (
                  <div key={hook.path} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                    <div className="min-w-[120px] px-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{hook.label}</span>
                    </div>
                    <input 
                      type="text" 
                      readOnly 
                      value={fullUrl}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-mono text-slate-500 outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(fullUrl);
                        toast.success(`${hook.label} copiado!`);
                      }}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              
              <div className="pt-4 flex flex-wrap gap-3">
                <button 
                  onClick={async () => {
                    await safeAction(async () => {
                      const res = await fetch('/api/zapi/test-received-webhook', { method: 'POST' });
                      const data = await safeReadJson(res);
                      if (!res.ok || !data.success) throw data;
                      toast.success("Webhook de teste disparado!");
                    }, { label: 'Erro no teste de webhook' });
                  }}
                  className="flex items-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  <Activity className="w-4 h-4" />
                  Testar Recebimento
                </button>
                <button 
                  onClick={refreshWebhookLogs}
                  disabled={isLoadingLogs}
                  className="flex items-center gap-2 px-6 py-4 bg-slate-100 text-slate-600 rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  <History className="w-4 h-4" />
                  {isLoadingLogs ? 'Buscando...' : 'Ver últimos webhooks'}
                </button>
              </div>
           </div>

           <div className="space-y-6">
              <div className="p-6 bg-slate-900 rounded-[2rem] text-white flex flex-col justify-center h-full">
                <h4 className="text-sm font-black uppercase tracking-tight mb-4 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-blue-400" />
                  Instruções
                </h4>
                <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                  Para que o Viva Experience CRM funcione corretamente em tempo real, você deve copiar as URLs acima e colar nos campos correspondentes no painel da Z-API (Webhook &gt; Configurar Webhooks).
                </p>
                <ul className="space-y-3">
                  {[
                    "As URLs acima são baseadas no ambiente atual.",
                    "Garanta que o webhook de 'Recebidos' esteja configurado.",
                    "Após configurar, o sistema receberá mensagens instantaneamente.",
                    "Você pode usar o botão 'Testar Recebimento' para validar localmente."
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-black flex items-center justify-center shrink-0 border border-slate-700">
                        {i + 1}
                      </span>
                      <span className="text-[11px] font-medium text-slate-300">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
           </div>
        </div>
      </section>

      {/* Webhook Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Logs de Diagnóstico</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Últimos 50 eventos recebidos da Z-API</p>
              </div>
              <button 
                onClick={() => setShowLogsModal(false)}
                className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {webhookLogs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <Activity className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">Nenhum log encontrado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {webhookLogs.map((log) => (
                    <div key={log.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight ${
                            log.event_type === 'received' ? 'bg-blue-100 text-blue-700' :
                            log.event_type === 'connected' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                            {log.event_type}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          {log.processed ? (
                            <span className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-black uppercase tracking-tight">
                              <div className="w-2 h-2 bg-emerald-600 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                              Sucesso
                            </span>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <span className="flex items-center gap-1.5 text-rose-600 text-[10px] font-black uppercase tracking-tight">
                                <div className="w-2 h-2 bg-rose-600 rounded-full" />
                                {log.error ? 'Falha' : 'Pendente'}
                              </span>
                              {log.event_type === 'received' && !log.conversation_id && !log.error && (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[8px] font-black uppercase rounded shadow-sm">
                                  Webhook recebido, mas não virou atendimento
                                </span>
                              )}
                            </div>
                          )}
                          
                          <button 
                            onClick={() => {
                              console.log("Full Payload:", log.payload);
                              const blob = new Blob([JSON.stringify(log.payload, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg text-[9px] font-black uppercase hover:bg-slate-100 transition-all active:scale-95"
                          >
                            <Info className="w-3 h-3" />
                            Ver Payload
                        </button>

                        {log.event_type === 'received' && !log.processed && (
                          <button 
                            onClick={() => handleReprocessLog(log.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-700 transition-all active:scale-95"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reprocessar
                          </button>
                        )}
                      </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white/50 p-4 rounded-xl border border-slate-100">
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Extraído</p>
                          <p className="text-[10px] font-mono text-slate-600 break-all">{log.raw_phone || '-'}</p>
                          {String(log.raw_phone || "").startsWith("120363") && (
                            <p className="text-[8px] text-amber-600 font-bold uppercase">⚠ Possível Grupo</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Normalizado</p>
                          <p className="text-[10px] font-mono font-bold text-blue-600">{log.phone_normalized || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Msg ID</p>
                          <p className="text-[10px] font-mono text-slate-500 truncate" title={log.message_id}>{log.message_id || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Conv ID</p>
                          <p className="text-[10px] font-mono text-slate-500 truncate" title={log.conversation_id}>{log.conversation_id || '-'}</p>
                        </div>
                      </div>

                      {log.error && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-3 items-start">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-red-600 font-medium leading-relaxed italic">
                            {log.error}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowLogsModal(false)}
                className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Grid of Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {whatsAppAccounts.map((account) => {
          const status = STATUS_CONFIG[account.status] || STATUS_CONFIG['ERROR'];
          return (
            <motion.div 
              layout
              key={account.id}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-6">
                   <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg bg-slate-800">
                     <MessageSquare className="w-6 h-6" />
                   </div>
                   <div className="flex items-center gap-2">
                     <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${status.bg} ${status.color}`}>
                        {status.label}
                     </span>
                     <div className="relative">
                       <button 
                        onClick={() => setActiveMenuId(activeMenuId === account.id ? null : account.id)}
                        className={`p-2 transition-all rounded-xl ${activeMenuId === account.id ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'hover:bg-slate-50 text-slate-300'}`}
                       >
                         <MoreVertical className="w-4 h-4" />
                       </button>

                       <AnimatePresence>
                        {activeMenuId === account.id && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50 overflow-hidden"
                          >
                             <button 
                              onClick={() => { setActiveMenuId(null); toast.info('Funcionalidade em desenvolvimento'); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                             >
                                <Info className="w-3.5 h-3.5" /> Informações Técnicas
                             </button>
                             <button 
                              onClick={() => { setActiveMenuId(null); toast.info('Configurando Webhook...'); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                             >
                                <Globe className="w-3.5 h-3.5" /> Configurar Webhook
                             </button>
                             <div className="h-px bg-slate-50 my-1 mx-2" />
                             <button 
                              onClick={() => { setActiveMenuId(null); toast.warning('Sessão desconectada remotamente'); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 rounded-xl text-xs font-bold text-amber-600 transition-colors"
                             >
                                <X className="w-3.5 h-3.5" /> Desconectar Sessão
                             </button>
                             <button 
                              onClick={(e) => { setActiveMenuId(null); handleDelete(e, account.id); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-xl text-xs font-bold text-red-600 transition-colors"
                             >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir Canal
                             </button>
                          </motion.div>
                        )}
                       </AnimatePresence>
                     </div>
                   </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-black text-slate-800 text-lg leading-tight mb-1">{account.name}</h3>
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      Provedor: Z-API
                    </p>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">
                      Limite: /24hrs
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Número</span>
                     <span className="text-xs font-black text-slate-700">{account.phone_number || account.number || '---'}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Equipe</span>
                     <span className="text-xs font-black text-slate-700">
                        {teams.find(t => t.id === account.team_id || t.id === account.default_team_id)?.name || 'Geral'}
                     </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-[10px] font-bold text-slate-500">
                    {users.find(u => u.id === account.responsible_user_id)?.name.split(' ')[0] || 'Sem Resp.'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => checkExistingAccountStatus(account)}
                    title="Verificar conexão"
                    className="p-2 text-emerald-400 hover:text-emerald-600 transition-colors bg-white rounded-xl shadow-sm border border-emerald-100"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                   <button 
                    onClick={() => setShowZapiModal(true)}
                    title="Novo QR Code"
                    className="p-2 text-blue-400 hover:text-blue-600 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(e, account.id)}
                    className="p-2 text-red-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {whatsAppAccounts.length === 0 && (
          <div className="col-span-full py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
             <Smartphone className="w-12 h-12 text-slate-300 mb-4" />
             <h3 className="text-lg font-black text-slate-400 uppercase tracking-tight">Nenhum canal configurado</h3>
             <p className="text-sm text-slate-400 mt-2 max-w-xs">Conecte o seu WhatsApp via Z-API para começar os atendimentos.</p>
          </div>
        )}
      </div>

      {/* Z-API Modal */}
      <AnimatePresence>
        {showZapiModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetModal}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                   <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Adicionar Canal</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">WhatsApp via Z-API</p>
                </div>
                <button onClick={resetModal} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                 <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] flex items-center gap-6">
                    <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center text-emerald-500 transition-transform">
                      <Smartphone className="w-8 h-8" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-lg font-black text-slate-800">WhatsApp via Z-API</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conexão por QR Code</p>
                    </div>
                 </div>

                 <p className="text-sm text-slate-500 font-medium px-4">
                   Use o botão abaixo para gerar o QR Code e conectar o WhatsApp da Z-API.
                 </p>

                 {qrError && (
                   <div className="p-6 bg-red-50 border border-red-100 rounded-3xl flex flex-col gap-4 mx-4">
                     <div className="flex items-start gap-4">
                       <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                       <div className="space-y-1">
                         <p className="text-xs font-black text-red-600 uppercase tracking-tight">Erro na Configuração</p>
                         <p className="text-[10px] text-red-500 font-medium whitespace-pre-wrap">
                           {qrError}
                         </p>
                       </div>
                     </div>

                     {isMissingClientToken && (
                        <div className="pt-4 border-t border-red-100 flex flex-col gap-3">
                           <p className="text-[10px] text-red-600 font-bold leading-relaxed">
                             Acesse o painel da Z-API &gt; Segurança &gt; Client Token. Se a opção não aparecer, solicite ao suporte da Z-API a liberação do Token de Segurança da conta.
                           </p>
                           <button 
                             onClick={handleCopySupportMessage}
                             className="w-full py-2.5 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-md shadow-red-100 flex items-center justify-center gap-2"
                           >
                             Copiar mensagem para suporte
                           </button>
                        </div>
                     )}
                   </div>
                 )}

                 {/* QR Code Display */}
                 <div className="flex flex-col items-center justify-center py-6">
                    {isLoadingQr ? (
                      <div className="flex flex-col items-center gap-4">
                        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Gerando QR Code...</p>
                      </div>
                    ) : qrCodeData ? (
                      <div className="space-y-6 flex flex-col items-center">
                        <div className="w-[220px] h-[220px] bg-white p-4 rounded-[2rem] border-4 border-emerald-100 shadow-2xl flex items-center justify-center">
                          {qrCodeData.type === 'IMAGE' ? (
                            <img 
                              src={qrCodeData.value} 
                              alt="Z-API QR Code" 
                              className="w-full h-full object-contain"
                              onError={() => {
                                console.error("Erro ao carregar QR Code Image:", qrCodeData.value);
                                setQrError("A imagem do QR Code não pôde ser carregada.");
                                setQrCodeData(null);
                              }}
                            />
                          ) : (
                            <QRCodeSVG 
                              value={qrCodeData.value}
                              size={180}
                              level="H"
                              includeMargin={false}
                            />
                          )}
                        </div>
                        <p className="text-sm text-slate-800 font-black text-center max-w-xs">
                          Escaneie o código acima no Menu "Aparelhos Conectados" do seu WhatsApp.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center space-y-2 opacity-40">
                         <MobileIcon className="w-12 h-12 mx-auto text-slate-300" />
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aguardando geração do QR Code</p>
                      </div>
                    )}
                 </div>

                 {/* Form Fields for identification */}
                 <div className="grid grid-cols-2 gap-4 mx-4">
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Nome do Canal</label>
                     <input 
                      type="text" 
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                      placeholder="Ex: Comercial Principal"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Equipe</label>
                     <select 
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                      value={formData.teamId}
                      onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                    >
                      <option value="">Selecione...</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                   </div>
                 </div>
              </div>

               {/* Footer Actions */}
               <div className="p-8 border-t border-slate-100 bg-slate-50 grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleCheckConfig}
                    disabled={isCheckingConfig}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm"
                  >
                    {isCheckingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4 text-blue-500" />}
                    Verificar Configuração
                  </button>
                  <button 
                    onClick={handleGenerateQrCode}
                    disabled={isLoadingQr}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                  >
                    <Smartphone className="w-4 h-4" />
                    Gerar QR Code
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
