/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Smartphone, Cloud, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  MoreVertical, Key, Globe, Database, Briefcase, Instagram, Facebook, MessageSquare, Info,
  ArrowLeft, ChevronRight, X, User as UserIcon, Smartphone as MobileIcon, Layers, Activity, History,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useAppStore } from '../../store/useAppStore';
import { authorizedFetch, safeReadJson } from '../../services/api';
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

  if (value.startsWith("data:image")) {
    return { value, type: 'IMAGE' };
  }

  if (value.startsWith("https://wa.me/")) {
    return { value, type: 'RAW' };
  }

  if (value.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
    return { value, type: 'IMAGE' };
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { value, type: 'RAW' };
  }

  if (value.length > 100 && !value.includes(" ")) {
     return { value: `data:image/png;base64,${value}`, type: 'IMAGE' };
  }

  return { value, type: 'RAW' };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'CONNECTED': { label: 'Conectado', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'DISCONNECTED': { label: 'Desconectado', color: 'text-rose-600', bg: 'bg-rose-50' },
  'CONNECTING': { label: 'Conectando', color: 'text-blue-600', bg: 'bg-blue-50' },
  'ERROR': { label: 'Erro', color: 'text-amber-600', bg: 'bg-amber-50' },
  'QR_PENDING': { label: 'Aguardando QR Code', color: 'text-indigo-600', bg: 'bg-indigo-50' }
};

export default function ChannelsSettingsPage() {
  const { whatsAppAccounts, addWhatsAppAccount, updateWhatsAppAccount, deleteWhatsAppAccount, isSaving, teams, users } = useAppStore();
  const [showZapiModal, setShowZapiModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    teamId: '',
    responsibleId: '',
    instanceId: '',
    instanceToken: '',
    clientToken: '',
    metaAppId: '',
    metaAppSecret: '',
    metaVerifyToken: ''
  });

  const [isCheckingConfig, setIsCheckingConfig] = useState(false);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ value: string; type: 'IMAGE' | 'RAW' } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<any | null>(null);
  const [qrAttempts, setQrAttempts] = useState(0);
  const [qrPollingActive, setQrPollingActive] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [configStatus, setConfigStatus] = useState<any | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<any | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosticData, setDiagnosticData] = useState<any | null>(null);
  const [isLoadingDiagnostic, setIsLoadingDiagnostic] = useState(false);
  const [providerType, setProviderType] = useState<'ZAPI' | 'META_CLOUD'>('ZAPI');

  // Meta connection states
  const [metaTestStatus, setMetaTestStatus] = useState<'NOT_TESTED' | 'TESTING' | 'SUCCESS' | 'FAILED'>('NOT_TESTED');
  const [isTestingMeta, setIsTestingMeta] = useState(false);
  const [metaTestError, setMetaTestError] = useState<string | null>(null);
  const [metaTestResults, setMetaTestResults] = useState<any | null>(null);
  const [metaTestPhoneInput, setMetaTestPhoneInput] = useState<string>('');


  const fetchDiagnostic = async () => {
    setIsLoadingDiagnostic(true);
    await safeAction(async () => {
      const res = await authorizedFetch('/api/zapi/diagnostic');
      const data = await safeReadJson(res);
      setDiagnosticData(data);
      setShowDiagnosticModal(true);
    }, { label: 'Erro ao buscar diagnóstico' });
    setIsLoadingDiagnostic(false);
  };

  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const refreshWebhookLogs = async () => {
    await fetchDiagnostic();
  };

  const handleReprocessLog = async (logId: string) => {
    toast.promise(
      authorizedFetch(`/api/zapi/webhook-logs/${logId}/reprocess`, { method: 'POST' })
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
      const [statusRes, urlsRes] = await Promise.all([
        authorizedFetch('/api/zapi/config-status'),
        authorizedFetch('/api/zapi/webhook-urls')
      ]);
      
      const statusData = await safeReadJson(statusRes);
      const urlsData = await safeReadJson(urlsRes);
      
      if (!statusRes.ok) throw statusData;
      if (!urlsRes.ok) throw urlsData;

      setConfigStatus(statusData);
      setWebhookInfo(urlsData);
      
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
    setProviderType('ZAPI');
    setMetaTestStatus('NOT_TESTED');
    setMetaTestError(null);
    setMetaTestResults(null);
    setMetaTestPhoneInput('');
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    setFormData({
      name: '',
      phone: '',
      teamId: '',
      responsibleId: '',
      instanceId: '',
      instanceToken: '',
      clientToken: '',
      metaAppId: '',
      metaAppSecret: '',
      metaVerifyToken: ''
    });
  };

  const handleTestMetaConnection = async (testPhoneNum?: string) => {
    if (!formData.instanceId.trim() || !formData.instanceToken.trim() || !formData.clientToken.trim()) {
      toast.error("Phone Number ID, Token de Acesso e WABA ID são obrigatórios para os testes.");
      return;
    }

    setMetaTestStatus('TESTING');
    setIsTestingMeta(true);
    setMetaTestError(null);
    setMetaTestResults(null);

    try {
      const response = await authorizedFetch("/api/meta/whatsapp/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instanceId: formData.instanceId.trim(),
          instanceToken: formData.instanceToken.trim(),
          clientToken: formData.clientToken.trim(),
          appId: formData.metaAppId.trim(),
          appSecret: formData.metaAppSecret.trim(),
          verifyToken: formData.metaVerifyToken.trim() || "viva_meta_verify_token_2026",
          testPhone: testPhoneNum || ""
        })
      });

      const resData = await safeReadJson(response);

      if (!response.ok) {
        setMetaTestStatus('FAILED');
        setMetaTestError(resData.error || "A validação falhou por um motivo desconhecido.");
        setMetaTestResults(resData.testResults || null);
        toast.error("Falha nos testes de conexão da Meta.");
        setIsTestingMeta(false);
        return;
      }

      setMetaTestStatus('SUCCESS');
      setMetaTestResults(resData);
      toast.success("Todos os testes obrigatórios de conexão passaram!");
      
      if (!formData.phone && resData.display_phone_number) {
        setFormData(prev => ({ ...prev, phone: resData.display_phone_number }));
      }
    } catch (err: any) {
      setMetaTestStatus('FAILED');
      setMetaTestError(err.message || "Erro de rede ou de sistema durante a validação.");
      toast.error("Erro inesperado ao testar conexão.");
    } finally {
      setIsTestingMeta(false);
    }
  };

  const handleSaveMetaChannel = async () => {
    if (!formData.name.trim()) {
      toast.error("Por favor, preencha o Nome do Canal.");
      return;
    }
    if (!formData.instanceId.trim() || !formData.instanceToken.trim()) {
      toast.error("Phone Number ID e Token de Acesso são obrigatórios.");
      return;
    }
    if (metaTestStatus !== 'SUCCESS') {
      toast.error("Não é possível ativar a integração enquanto os testes mínimos obrigatórios não passarem. Clique em 'Testar Conexão Meta WhatsApp' primeiro!");
      return;
    }

    if (!formData.metaAppId.trim() || !formData.metaAppSecret.trim()) {
      toast.warning("Validação avançada do token e assinatura do webhook exigem App ID e App Secret.", { duration: 6000 });
    }

    await safeAction(async () => {
      await addWhatsAppAccount({
        id: "",
        name: formData.name,
        type: 'WHATSAPP',
        provider: 'META_CLOUD',
        phone_number: formData.phone || '',
        status: 'CONNECTED',
        instance_id: formData.instanceId,
        instance_token: formData.instanceToken,
        client_token: formData.clientToken,
        is_active: true,
        team_id: formData.teamId || undefined,
        responsible_user_id: formData.responsibleId || undefined,
        meta_app_id: formData.metaAppId,
        meta_app_secret: formData.metaAppSecret,
        meta_verify_token: formData.metaVerifyToken
      });
      toast.success("Canal Meta Oficial adicionado com sucesso!");
      resetModal();
    }, { label: "Erro ao adicionar canal Meta" });
  };

  async function handleCheckConfig() {
    try {
      setIsCheckingConfig(true);
      setQrError(null);

      const response = await authorizedFetch("/api/zapi/config-status");
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
    await handleConnectWhatsapp();
  }

  function clearQrTimers() {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = null;
    }
  }

  async function checkZapiConnectionStatus() {
    try {
      const response = await authorizedFetch(`/api/zapi/status`);
      const data = await safeReadJson(response);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao verificar status.");
      }

      setConnectionStatus(data);

      if (data.connected === true) {
        setQrCodeData(null);
        setQrPollingActive(false);
        clearQrTimers();
        toast.success("WhatsApp conectado com sucesso.");
        handleConnectComplete(data.phone || data.raw?.smartphonePhone || data.raw?.phone);
        return true;
      }

      return false;
    } catch (error) {
      console.error("[ZAPI STATUS ERROR]", error);
      return false;
    }
  }

  async function generateQrCode() {
    try {
      setIsLoadingQr(true);
      setQrError(null);

      const statusResponse = await authorizedFetch("/api/zapi/config-status");
      const statusData = await safeReadJson(statusResponse);

      if (!statusResponse.ok || !statusData.configured) {
        const missing = Array.isArray(statusData.missing) ? statusData.missing.filter(Boolean) : [];
        setQrError(statusData.message || `Variáveis faltantes: ${missing.join(", ") || "não identificadas"}`);
        return;
      }

      const response = await authorizedFetch("/api/zapi/qrcode");
      const data = await safeReadJson(response);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Erro ao gerar QR Code.");
      }

      if (data.connected === true) {
        setQrCodeData(null);
        setConnectionStatus(data.status || data);
        setQrPollingActive(false);
        clearQrTimers();
        toast.success("WhatsApp já está conectado.");
        handleConnectComplete(data.status?.phone || data.phone || data.rawStatus?.phone);
        return;
      }

      const qr = data.qrCodeImage || data.qrCode || data.value;

      if (!qr || !String(qr).startsWith("data:image/")) {
        throw new Error("QR Code recebido, mas não é uma imagem válida.");
      }

      setQrCodeData({ value: qr, type: 'IMAGE' });
      setQrPollingActive(true);
      setQrAttempts((prev) => prev + 1);
    } catch (error) {
      console.error("[GENERATE QR ERROR]", error);
      setQrError(error instanceof Error ? error.message : "Erro ao gerar QR Code.");
      toast.error(error instanceof Error ? error.message : "Erro ao gerar QR Code.");
    } finally {
      setIsLoadingQr(false);
    }
  }

  function startStatusPolling() {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }

    statusIntervalRef.current = setInterval(async () => {
      const connected = await checkZapiConnectionStatus();
      if (connected) {
        clearQrTimers();
      }
    }, 3000);
  }

  function startQrAutoRefresh() {
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current);
    }

    qrIntervalRef.current = setInterval(async () => {
      const connected = await checkZapiConnectionStatus();

      if (connected) {
        clearQrTimers();
        return;
      }

      let attemptsCount = 0;
      setQrAttempts((prev) => {
        const next = prev + 1;
        attemptsCount = next;

        if (next > 3) {
          clearQrTimers();
          setQrPollingActive(false);
          toast.info("QR Code expirado. Clique em gerar novo QR Code.");
          return prev;
        }

        return next;
      });

      if (attemptsCount <= 3) {
        await generateQrCode();
      }
    }, 15000);
  }

  async function handleConnectWhatsapp() {
    setQrAttempts(0);
    setConnectionStatus(null);
    setQrError(null);

    const alreadyConnected = await checkZapiConnectionStatus();
    if (alreadyConnected) return;

    await generateQrCode();
    startStatusPolling();
    startQrAutoRefresh();
  }

  const handleConnectComplete = async (detectedPhone?: string) => {
    clearQrTimers();

    await safeAction(async () => {
      const newChannel: Partial<WhatsAppAccount> = {
        id: `ch-${Date.now()}`,
        name: formData.name || 'WhatsApp Z-API',
        type: 'WHATSAPP',
        provider: 'ZAPI',
        provider_type: 'zapi',
        phone_number: detectedPhone || formData.phone,
        status: 'CONNECTED',
        team_id: formData.teamId,
        responsible_user_id: formData.responsibleId,
        instance_id: formData.instanceId || undefined,
        instance_token: formData.instanceToken || undefined,
        client_token: formData.clientToken || undefined,
        is_active: true,
        created_at: new Date().toISOString()
      };
      await addWhatsAppAccount(newChannel as WhatsAppAccount);
      toast.success("Canal conectado com sucesso!");
      resetModal();
    });
  };

  const handleRestartZapi = async () => {
    setIsRestarting(true);
    await safeAction(async () => {
      const res = await authorizedFetch('/api/zapi/restart');
      const data = await safeReadJson(res);
      if (res.ok && data.success) {
        toast.success("Instância reiniciada com sucesso. Aguarde alguns segundos para gerar um novo QR.");
        setQrCodeData(null);
        clearQrTimers();
        setQrAttempts(0);
      } else {
        throw new Error(data.error || "Erro ao reiniciar na Z-API.");
      }
    }, { label: "Falha ao reiniciar" });
    setIsRestarting(false);
  };

  const handleDisconnectZapi = async () => {
    setIsDisconnecting(true);
    await safeAction(async () => {
      const res = await authorizedFetch('/api/zapi/disconnect');
      const data = await safeReadJson(res);
      if (res.ok && data.success) {
        toast.success("Sessão desconectada. Você já pode gerar um novo QR Code.");
        setQrCodeData(null);
        clearQrTimers();
        setQrAttempts(0);
        setConnectionStatus(null);
      } else {
        throw new Error(data.error || "Erro ao desconectar na Z-API.");
      }
    }, { label: "Falha ao desconectar" });
    setIsDisconnecting(false);
  };

  const checkExistingAccountStatus = async (account: WhatsAppAccount) => {
    await safeAction(async () => {
      const res = await fetch(`/api/zapi/status`);
      const data = await safeReadJson(res);
      
      let newStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'QR_PENDING' = 'DISCONNECTED';
      if (data.connected && data.smartphoneConnected) {
        newStatus = 'CONNECTED';
        toast.success(`Canal ${account.name} está Conectado!`);
      } else if (data.connected || data.status === 'CONNECTED') {
        newStatus = 'CONNECTING'; // Just waiting for smartphone
        toast.info(`Aparelho conectando...`);
      } else if (data.status === 'ERROR') {
        newStatus = 'ERROR';
      }

      updateWhatsAppAccount({ ...account, status: newStatus });
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

  const handleCleanupGroups = async () => {
    toast.promise(
      authorizedFetch('/api/zapi/cleanup-group-leaks', { method: 'POST' })
        .then(async res => {
          const data = await safeReadJson(res);
          if (!res.ok || !data.success) throw data;
          return data;
        }),
      {
        loading: 'Limpando fila operacional...',
        success: (data) => {
          refreshConfigStatus();
          return `Sucesso! ${data.updated} conversas de grupo removidas da fila.`;
        },
        error: (err) => `Erro na limpeza: ${getErrorMessage(err)}`
      }
    );
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
            onClick={fetchDiagnostic}
            disabled={isLoadingDiagnostic}
            className="flex items-center gap-2 px-6 py-4 bg-slate-800 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 transition-all shadow-sm"
          >
            <Activity className="w-4 h-4 text-blue-400" />
            {isLoadingDiagnostic ? 'Carregando...' : 'Diagnóstico do Sistema'}
          </button>
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
                  const res = await authorizedFetch('/api/zapi/register-all-webhooks', { method: 'POST' });
                  const data = await safeReadJson(res);
                  if (!res.ok || !data.success) throw data;
                  
                  const failed = (data.results || []).filter((r: any) => !r.success);
                  if (failed.length > 0) {
                    toast.warning(`Sincronizado com ${failed.length} falha(s).`);
                  } else {
                    toast.success("Todos os webhooks foram registrados na Z-API!");
                  }
                }, { label: 'Falha ao sincronizar webhooks' });
              }}
              className="flex items-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              <CheckCircle2 className="w-4 h-4" />
              Sincronizar Webhooks com Z-API
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="space-y-3">
              {[
                { key: 'received', label: 'Ao receber' },
                { key: 'sent', label: 'Ao enviar' },
                { key: 'disconnected', label: 'Ao desconectar' },
                { key: 'connected', label: 'Ao conectar' },
                { key: 'chatPresence', label: 'Presença do chat' },
                { key: 'messageStatus', label: 'Status da mensagem' },
              ].map((hook) => {
                const url = webhookInfo?.webhooks?.[hook.key] || `---`;
                
                return (
                  <div key={hook.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                    <div className="min-w-[120px] px-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{hook.label}</span>
                    </div>
                    <input 
                      type="text" 
                      readOnly 
                      value={url}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-mono text-slate-500 outline-none"
                    />
                    <button 
                      onClick={() => {
                        if (url !== '---') {
                          navigator.clipboard.writeText(url);
                          toast.success(`${hook.label} copiado!`);
                        }
                      }}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-[11px] text-slate-600 leading-relaxed font-medium space-y-1">
                <span className="font-extrabold text-blue-700 block uppercase tracking-wider text-[10px]">⚠️ Sincronização de Mensagens do Celular / WhatsApp Business</span>
                <p>
                  Para mensagens enviadas diretamente pelo celular, WhatsApp Business ou WhatsApp Web aparecerem no CRM, o webhook <strong className="text-blue-700 font-extrabold">Ao enviar</strong> precisa estar ativo na Z-API, com a opção <strong className="text-blue-700 font-extrabold">“Notificar as enviadas por mim também”</strong> obrigatoriamente ativa.
                </p>
              </div>
              
              <div className="pt-4 flex flex-wrap gap-3">
                <button 
                  onClick={async () => {
                    await safeAction(async () => {
                      const res = await authorizedFetch('/api/zapi/test-received-webhook', { method: 'POST' });
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
                  disabled={isLoadingDiagnostic}
                  className="flex items-center gap-2 px-6 py-4 bg-slate-100 text-slate-600 rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  <History className="w-4 h-4" />
                  {isLoadingDiagnostic ? 'Buscando...' : 'Ver últimos webhooks'}
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
                  Para que o Viva Experience CRM funcione corretamente em tempo real, você deve copiar as URLs acima e colar nos campos correspondentes no painel da Z-API (Webhook &gt; Configurar Webhooks) ou usar o botão de sincronização automática.
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

        {showDiagnosticModal && diagnosticData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Diagnóstico Omnichannel</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Status real da Z-API, webhooks e banco de dados</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    try {
                      const res = await authorizedFetch('/api/admin/cleanup-group-conversations', { method: 'POST' });
                      const data = await safeReadJson(res);
                      if (data.success) {
                        toast.success(data.message);
                        fetchDiagnostic();
                      } else {
                        toast.error('Erro: ' + data.error);
                      }
                    } catch (err) {
                      toast.error('Erro na limpeza.');
                    }
                  }}
                  className="px-4 py-2 bg-orange-50 text-orange-600 rounded-full text-[9px] font-black uppercase hover:bg-orange-100 transition-all border border-orange-100"
                >
                  Limpar Grupos
                </button>
                <button 
                  onClick={() => setShowDiagnosticModal(false)}
                  className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${diagnosticData.zapi?.connected ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                  <div className="flex items-center justify-between">
                    <Smartphone className={`w-8 h-8 ${diagnosticData.zapi?.connected ? 'text-emerald-500' : 'text-rose-500'}`} />
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${diagnosticData.zapi?.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {diagnosticData.zapi?.connected ? 'CONECTADO' : 'DESCONECTADO'}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase">Z-API</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Status da instância WhatsApp</p>
                  </div>
                  {diagnosticData.zapi?.smartphoneConnected ? (
                    <div className="bg-emerald-200/30 p-2 rounded-lg flex items-center gap-2">
                       <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                       <span className="text-[9px] font-black text-emerald-700 uppercase">Smarphone Conectado</span>
                    </div>
                  ) : (
                    <div className="bg-rose-200/30 p-2 rounded-lg flex items-center gap-2">
                       <AlertCircle className="w-3 h-3 text-rose-600" />
                       <span className="text-[9px] font-black text-rose-700 uppercase">Smarphone Desconectado</span>
                    </div>
                  )}
                </div>

                <div className="p-6 rounded-3xl border bg-blue-50 border-blue-100 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <Globe className="w-8 h-8 text-blue-500" />
                    <span className="text-[10px] font-black uppercase px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
                      ATIVO
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase">Webhooks</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Endpoint de recebimento</p>
                  </div>
                  <div className="bg-blue-100/50 p-2 rounded-lg truncate">
                    <span className="text-[8px] font-mono text-blue-800">{diagnosticData.webhooks?.receivedUrl}</span>
                  </div>
                </div>

                <div className="p-6 rounded-3xl border bg-slate-50 border-slate-200 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <Database className="w-8 h-8 text-slate-400" />
                    <span className="text-[10px] font-black uppercase px-3 py-1 bg-white border border-slate-200 text-slate-400 rounded-full">
                      BANCO OK
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase">Supabase</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Sincronização de tabelas</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Clientes</p>
                        <p className="text-sm font-black text-slate-800">{diagnosticData.database?.counts?.customers}</p>
                     </div>
                     <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Conversas</p>
                        <p className="text-sm font-black text-slate-800">{diagnosticData.database?.counts?.conversations}</p>
                     </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Últimos Logs de Webhook</h4>
                 <div className="overflow-hidden border border-slate-100 rounded-3xl">
                    <table className="w-full text-left text-xs">
                       <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                          <tr>
                             <th className="px-6 py-4">Evento</th>
                             <th className="px-6 py-4">Telefone</th>
                             <th className="px-6 py-4">Status</th>
                             <th className="px-6 py-4">Data</th>
                             <th className="px-6 py-4 text-right">Ações</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {diagnosticData.webhooks?.lastLogs?.map((log: any) => (
                             <tr key={log.id} className="hover:bg-slate-50/50 transition-all">
                                <td className="px-6 py-4 font-black uppercase text-[10px] text-slate-600">{log.event_type}</td>
                                <td className="px-6 py-4 font-mono font-bold text-blue-600">{log.phone_normalized || log.raw_phone}</td>
                                <td className="px-6 py-4">
                                   {log.processed ? (
                                       <span className="text-emerald-600 font-black uppercase text-[9px] bg-emerald-50 px-2 py-1 rounded-md">SUCESSO</span>
                                   ) : log.ignored ? (
                                       <div className="flex flex-col gap-0.5">
                                          <span className="text-orange-600 font-black uppercase text-[9px] bg-orange-50 px-2 py-1 rounded-md w-fit">IGNORADO</span>
                                          {log.error && <span className="text-[8px] text-orange-500 font-bold truncate max-w-[150px]" title={log.error}>{log.error}</span>}
                                       </div>
                                   ) : (
                                       <div className="flex flex-col gap-0.5">
                                          <span className="text-rose-600 font-black uppercase text-[9px] bg-rose-50 px-2 py-1 rounded-md w-fit">FALHA</span>
                                          {log.error && <span className="text-[8px] text-rose-500 font-bold truncate max-w-[150px]" title={log.error}>{log.error}</span>}
                                       </div>
                                   )}
                                </td>
                                <td className="px-6 py-4 text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                                 <td className="px-6 py-4 text-right">
                                    <button 
                                       onClick={() => handleReprocessLog(log.id)}
                                       className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[9px] font-black uppercase hover:bg-slate-200 transition-all border border-slate-200"
                                    >
                                       Reprocessar
                                    </button>
                                 </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

              <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Últimas Conversas no Banco</h4>
                 <div className="overflow-hidden border border-slate-100 rounded-3xl">
                    <table className="w-full text-left text-xs">
                       <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                          <tr>
                             <th className="px-6 py-4">Cliente</th>
                             <th className="px-6 py-4">Telefone</th>
                             <th className="px-6 py-4">Status</th>
                             <th className="px-6 py-4">Atendente</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {diagnosticData.database?.lastConversations?.map((conv: any) => (
                             <tr key={conv.id} className="hover:bg-slate-50/50 transition-all">
                                <td className="px-6 py-4 font-black uppercase text-[10px] text-slate-600">{conv.customer?.name || 'Cliente'}</td>
                                <td className="px-6 py-4 font-mono font-bold text-blue-600">{conv.customer_phone_normalized}</td>
                                <td className="px-6 py-4">
                                   <span className="bg-slate-100 px-2 py-1 rounded-lg font-black uppercase text-[8px] text-slate-500">{conv.status}</span>
                                </td>
                                <td className="px-6 py-4 text-slate-400">{conv.assigned_user_name || 'Desatendido'}</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnostic v1.0 • Process ID: {Math.random().toString(36).substring(7)}</p>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleCleanupGroups}
                  className="px-6 py-4 bg-amber-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all shadow-xl shadow-amber-100 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpar conversas de grupo da fila
                </button>
                
                <button 
                  onClick={() => setShowDiagnosticModal(false)}
                  className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

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
                                <Info className="w-3.5 h-3.5" /> Detalhes
                             </button>
                             <div className="h-px bg-slate-50 my-1 mx-2" />
                             <button 
                              onClick={(e) => { setActiveMenuId(null); handleDelete(e, account.id); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-xl text-xs font-bold text-red-600 transition-colors"
                             >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir
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
                    className="p-2 text-emerald-400 hover:text-emerald-600 transition-colors bg-white rounded-xl shadow-sm border border-emerald-100"
                  >
                    <CheckCircle2 className="w-4 h-4" />
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
              <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                   <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Adicionar Canal</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Selecione o provedor de WhatsApp</p>
                </div>
                <button onClick={resetModal} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 text-center">
                {/* Horizontal tabs to switch provider */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl max-w-md mx-auto mb-4">
                  <button
                    type="button"
                    onClick={() => setProviderType('ZAPI')}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                      providerType === 'ZAPI'
                        ? 'bg-white text-slate-800 shadow-md'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    WhatsApp Web (Z-API)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProviderType('META_CLOUD')}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                      providerType === 'META_CLOUD'
                        ? 'bg-white text-slate-800 shadow-md'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Oficial Meta Cloud API
                  </button>
                </div>

                {providerType === 'ZAPI' ? (
                  <>
                    {qrError && (
                      <div className="p-6 bg-red-50 border border-red-100 rounded-3xl flex flex-col gap-4 text-left">
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

                    <div className="flex flex-col items-center justify-center py-4 space-y-4">
                       {/* Connection status display */}
                       {connectionStatus && (
                         <div className={`w-full max-w-md p-4 rounded-2xl text-left border ${
                           connectionStatus.connected 
                             ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                             : "bg-amber-50 border-amber-100 text-amber-800"
                          }`}>
                           <p className="text-[10px] font-black uppercase tracking-wider mb-1">Status da Instância Z-API</p>
                           <div className="flex items-center justify-between text-xs font-bold">
                             <span className="flex items-center gap-1.5">
                               <div className={`w-2.5 h-2.5 rounded-full ${connectionStatus.connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                               {connectionStatus.connected ? "Conectado" : "Desconectado"}
                             </span>
                             {connectionStatus.phone && (
                               <span className="font-mono text-slate-600 bg-white/60 px-2 py-0.5 rounded">
                                 {connectionStatus.phone}
                               </span>
                             )}
                           </div>

                           {connectionStatus.error && (
                             <p className="text-[10px] text-red-500 mt-2 font-black leading-relaxed">
                               ⚠️ Z-API reportou: {String(connectionStatus.error)}
                             </p>
                           )}

                           {/* Diagnostics based on errors */}
                           {connectionStatus.error === "You need to restore the session" && (
                             <div className="mt-2.5 p-2 bg-red-100/40 rounded-xl text-[10px] text-red-700 font-semibold leading-relaxed border border-red-200/20">
                               <strong>Diagnóstico:</strong> A sessão precisa ser restaurada. Tente usar o botão abaixo <strong>Reiniciar Instância</strong> ou <strong>Desconectar Sessão</strong> antes de gerar um novo QR Code.
                             </div>
                           )}

                           {connectionStatus.error === "You are not connected" && qrAttempts > 0 && !qrPollingActive && (
                             <div className="mt-2.5 p-2 bg-amber-100/40 rounded-xl text-[10px] text-amber-700 font-semibold leading-relaxed border border-amber-200/40">
                               <strong>Diagnóstico:</strong> O QR foi lido, mas a instância ainda não conectou completamente. Por favor, clique em gerar um novo QR Code e tente novamente.
                             </div>
                           )}
                         </div>
                       )}

                       {isLoadingQr ? (
                         <div className="flex flex-col items-center gap-4 py-8">
                           <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
                           <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Iniciando conexão e obtendo QR Code...</p>
                         </div>
                       ) : qrCodeData ? (
                         <div className="space-y-4 flex flex-col items-center">
                           <div className="w-[220px] h-[220px] bg-white p-4 rounded-[2rem] border-4 border-emerald-100 shadow-2xl flex items-center justify-center relative">
                             {qrCodeData.type === 'IMAGE' ? (
                               <img 
                                 src={qrCodeData.value} 
                                 alt="QR Code Z-API" 
                                 className="w-full h-full object-contain"
                                 onError={() => setQrError("A imagem do QR Code não pôde ser carregada.")}
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

                           {/* Active Polling details */}
                           <div className="text-center space-y-1">
                             <p className="text-xs text-slate-800 font-black">
                               Abra o WhatsApp no celular &gt; Aparelhos conectados &gt; Conectar aparelho &gt; escaneie o QR Code.
                             </p>
                             <p className="text-[9px] font-medium text-slate-500 max-w-sm mx-auto">
                               Este QR Code expira em aproximadamente 20 segundos. Se não for escaneado, um novo QR será gerado automaticamente.
                             </p>
                             
                             {qrPollingActive && (
                               <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-black text-blue-600 uppercase tracking-wider mt-2">
                                 <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                                 Atualizando QR Code (Tentativa {qrAttempts} de 3)
                               </div>
                             )}
                           </div>
                         </div>
                       ) : (
                         <div className="text-center py-8 space-y-3 opacity-60">
                            <MobileIcon className="w-12 h-12 mx-auto text-slate-300" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aguardando geração do QR Code para conexão</p>
                            <p className="text-xs text-slate-500 max-w-xs mx-auto">Preencha o nome do canal e clique no botão azul abaixo para iniciar o processo.</p>
                         </div>
                       )}

                       {/* Action Buttons for diagnostic or session controls */}
                       <div className="w-full max-w-md pt-2 border-t border-slate-100 flex flex-col gap-2 text-left">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ações Administrativas / Diagnóstico</p>
                         <div className="grid grid-cols-2 gap-2">
                           <button
                             type="button"
                             disabled={isRestarting}
                             onClick={handleRestartZapi}
                             className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all"
                           >
                             {isRestarting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 text-amber-500" />}
                             Reiniciar Instância
                           </button>
                           <button
                             type="button"
                             disabled={isDisconnecting}
                             onClick={handleDisconnectZapi}
                             className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all"
                           >
                             {isDisconnecting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                             Desconectar Sessão
                           </button>
                         </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mx-4 text-left">
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

                      <div className="col-span-2 border-t border-slate-100 pt-4 mt-2 space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Configuração Personalizada da Z-API (Opcional)</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">ID da Instância (Opcional)</label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs"
                              placeholder="Deixe em branco para usar o padrão"
                              value={formData.instanceId}
                              onChange={(e) => setFormData({...formData, instanceId: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Token da Instância (Opcional)</label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs"
                              placeholder="Deixe em branco para usar o padrão"
                              value={formData.instanceToken}
                              onChange={(e) => setFormData({...formData, instanceToken: e.target.value})}
                            />
                          </div>
                          <div className="col-span-2 space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Client Token (Opcional)</label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs"
                              placeholder="Deixe em branco para usar o padrão"
                              value={formData.clientToken}
                              onChange={(e) => setFormData({...formData, clientToken: e.target.value})}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-left space-y-4">
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-blue-500" />
                          Instruções para Credenciamento Meta
                        </h4>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Acesse o painel do Facebook Business Developer e insira os dados gerados abaixo para poder integrar o número oficial. O webhook do Facebook deve apontar para:
                        </p>
                        <div className="mt-2.5 p-3 bg-slate-150 rounded-xl font-mono text-[9px] text-slate-600 break-all select-all flex items-center justify-between">
                          <span>{window.location.origin}/api/webhooks/meta</span>
                        </div>
                        <p className="text-[10px] text-amber-600 font-bold mt-2">
                          Verify Token a ser configurado no Facebook developers: <span className="font-mono bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">viva_meta_verify_token_2026</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-left">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Nome do Canal (Meta Oficial)</label>
                        <input 
                         type="text" 
                         className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                         placeholder="Ex: WhatsApp Meta Oficial"
                         value={formData.name}
                         onChange={(e) => setFormData({...formData, name: e.target.value})}
                       />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Equipe de Atendimento</label>
                        <select 
                         className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                         value={formData.teamId}
                         onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                       >
                         <option value="">Selecione...</option>
                         {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                       </select>
                      </div>

                      <div className="col-span-2 space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Número de Telefone Associado (Com DDI)</label>
                        <input 
                         type="text" 
                         className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs"
                         placeholder="Ex: 5511999999999"
                         value={formData.phone}
                         onChange={(e) => setFormData({...formData, phone: e.target.value})}
                       />
                      </div>

                      <div className="col-span-2 border-t border-slate-100 pt-4 mt-2 space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest leading-none">Credenciais Meta Developer</p>
                          <span className="bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Evite Erros Práticos</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2 col-span-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 block text-left">
                              Phone Number ID (ID do Telefone) <span className="text-red-500">*</span>
                            </label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                              placeholder="Ex: 559123456789123 (15-16 dígitos)"
                              value={formData.instanceId}
                              onChange={(e) => setFormData({...formData, instanceId: e.target.value})}
                            />
                            <div className="px-2 space-y-1 block text-left">
                              <span className="inline-block bg-blue-50 text-blue-700 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded leading-none">
                                Usado para enviar mensagens
                              </span>
                              <p className="text-[9px] text-amber-600 font-semibold leading-tight mt-1">
                                ⚠️ ATENÇÃO: Use o <b>ID do Telefone</b>. Não coloque o ID do App ou ID da conta empresarial (WABA) aqui. Caso contrário, ocorrerá o erro de objeto inexistente ("Object with ID does not exist").
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2 col-span-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 block text-left">
                              WhatsApp Business Account ID <span className="text-slate-400 font-medium">(Opcional)</span>
                            </label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                              placeholder="Ex: 1690946888711832"
                              value={formData.clientToken}
                              onChange={(e) => setFormData({...formData, clientToken: e.target.value})}
                            />
                            <div className="px-2 space-y-1 block text-left">
                              <span className="inline-block bg-emerald-50 text-emerald-700 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded leading-none">
                                Usado para criar e gerenciar modelos de mensagem
                              </span>
                              <p className="text-[9px] text-slate-400 leading-tight mt-1">
                                ID da Conta Comercial do WhatsApp (WABA) encontrado no painel do Facebook Developer.
                              </p>
                            </div>
                          </div>

                          <div className="col-span-2 space-y-2 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 block text-left">
                              Token de Acesso Permanente (Permanent Token / EAAB...) <span className="text-red-500">*</span>
                            </label>
                            <textarea 
                              rows={3}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-semibold text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                              placeholder="EAAB... (Inicie com EAAB)"
                              value={formData.instanceToken}
                              onChange={(e) => setFormData({...formData, instanceToken: e.target.value})}
                            />
                            <div className="p-3 bg-blue-50/50 border border-blue-100/30 rounded-xl space-y-1 block text-left">
                              <p className="text-[9px] text-blue-700 font-bold leading-relaxed">
                                💡 Checklist de Permissões da Meta para seu Token de Acesso:
                              </p>
                              <ul className="list-disc pl-4 text-[9px] text-slate-500 font-medium space-y-0.5">
                                <li>O Token deve ser gerado por um <b>Usuário do Sistema Admin</b> no painel de Configurações do Negócio.</li>
                                <li>Selecione as permissões <b>whatsapp_business_messaging</b> e <b>whatsapp_business_management</b>.</li>
                                <li><b>IMPORTANTÍSSIMO:</b> Após gerar o token, clique em "Atribuir Ativos" (Assign Assets) no Usuário do Sistema, selecione "Contas do WhatsApp", marque sua conta correspondente e dê a permissão de "Controle Total / Gerenciar". Sem essa associação de ativo, o Facebook retornará erro de objeto inexistente ("Object with ID does not exist").</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Configurações Avançadas da Meta (Opcionais) */}
                      <div className="col-span-2 border-t border-slate-100 pt-4 mt-2 space-y-4 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest leading-none">Configurações Avançadas (Opcional)</p>
                          <span className="bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Webhook & Debug Avançado</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2 col-span-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 block text-left">
                              Meta App ID (ID do Aplicativo)
                            </label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                              placeholder="Ex: 2220391788200892"
                              value={formData.metaAppId}
                              onChange={(e) => setFormData({...formData, metaAppId: e.target.value})}
                            />
                            <p className="text-[9px] text-slate-400 px-2 leading-tight">
                              Necessário para validação avançada do token (debug_token).
                            </p>
                          </div>
                          
                          <div className="space-y-2 col-span-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 block text-left">
                              Meta App Secret (Chave Secreta do App)
                            </label>
                            <input 
                              type="password" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                              placeholder="••••••••••••••••"
                              value={formData.metaAppSecret}
                              onChange={(e) => setFormData({...formData, metaAppSecret: e.target.value})}
                            />
                            <p className="text-[9px] text-slate-400 px-2 leading-tight">
                              Chave Secreta usada para validar a integridade da assinatura do webhook.
                            </p>
                          </div>

                          <div className="col-span-2 space-y-2 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 block text-left">
                              Token de Verificação do Webhook (Verify Token)
                            </label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-left"
                              placeholder="Ex: meu_token_de_verificacao_secreto"
                              value={formData.metaVerifyToken}
                              onChange={(e) => setFormData({...formData, metaVerifyToken: e.target.value})}
                            />
                            <p className="text-[9px] text-slate-400 px-2 leading-tight">
                              O <b>Verify Token</b> é um texto criado por você. Deve ser idêntico no painel da Meta Developers para comprovar a segurança na ativação dos recebimentos em tempo real.
                            </p>
                          </div>
                        </div>

                        {/* Meta WhatsApp Connection Tests and Validation Panel */}
                        <div className="col-span-2 border-t border-slate-100 pt-6 mt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <h4 className="text-xs font-bold text-slate-800">Validação e Testes de Conexão</h4>
                              <p className="text-[10px] text-slate-400">Verifique a integridade das credenciais antes de ativar o canal.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleTestMetaConnection()}
                              disabled={isTestingMeta}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm ${
                                isTestingMeta 
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                              }`}
                            >
                              <Activity className={`w-3.5 h-3.5 ${isTestingMeta ? 'animate-pulse' : ''}`} />
                              {isTestingMeta ? 'Testando...' : 'Testar Conexão Meta WhatsApp'}
                            </button>
                          </div>

                          {metaTestStatus !== 'NOT_TESTED' && (
                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                              {/* Step checks checklist list */}
                              <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-white border border-slate-100 rounded-xl space-y-1 shadow-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">Passo 1: Phone ID</span>
                                    {isTestingMeta ? (
                                      <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                                    ) : metaTestResults?.testResults?.step1 === 'passed' ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                    )}
                                  </div>
                                  <p className="text-[9px] font-bold text-slate-600">ID do Telefone Existe</p>
                                </div>

                                <div className="p-3 bg-white border border-slate-100 rounded-xl space-y-1 shadow-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">Passo 2: WABA Link</span>
                                    {isTestingMeta ? (
                                      <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                                    ) : metaTestResults?.testResults?.step2 === 'passed' ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                    )}
                                  </div>
                                  <p className="text-[9px] font-bold text-slate-600">Pertence à WABA</p>
                                </div>

                                <div className="p-3 bg-white border border-slate-100 rounded-xl space-y-1 shadow-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">Passo 3: Token Roles</span>
                                    {isTestingMeta ? (
                                      <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                                    ) : metaTestResults?.testResults?.step3 === 'passed' ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : metaTestResults?.testResults?.step3 === 'skipped' ? (
                                      <span className="text-[8px] font-bold text-slate-400 italic">Pular app-id</span>
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                    )}
                                  </div>
                                  <p className="text-[9px] font-bold text-slate-600">Token Permissões</p>
                                </div>
                              </div>

                              {/* Error Panel if failed */}
                              {metaTestStatus === 'FAILED' && metaTestError && (
                                <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl space-y-1">
                                  <div className="flex items-center gap-2 text-rose-800">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Falha de Validação Meta Cloud</span>
                                  </div>
                                  <p className="text-[10px] font-semibold text-rose-700 leading-relaxed pl-6">
                                    {metaTestError}
                                  </p>
                                </div>
                              )}

                              {/* Details dashboard if successful */}
                              {metaTestStatus === 'SUCCESS' && metaTestResults && (
                                <div className="space-y-3">
                                  <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
                                    <div className="flex items-center gap-1.5 text-emerald-800">
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span className="text-[10px] font-black uppercase tracking-wider">Meta WhatsApp Conectado</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-slate-600 font-medium pl-5">
                                      <div><b>Nome Verificado:</b> {metaTestResults.verified_name}</div>
                                      <div><b>Número do Telefone:</b> {metaTestResults.display_phone_number}</div>
                                      <div>
                                        <b>Qualidade do Canal:</b>{' '}
                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[8px] uppercase tracking-wider ${
                                          metaTestResults.quality_rating === 'GREEN' 
                                            ? 'bg-emerald-100 text-emerald-800' 
                                            : 'bg-amber-100 text-amber-800'
                                        }`}>
                                          {metaTestResults.quality_rating}
                                        </span>
                                      </div>
                                      <div><b>WABA ID:</b> {metaTestResults.waba_id}</div>
                                      <div><b>Phone Number ID:</b> {metaTestResults.phone_number_id}</div>
                                      <div className="col-span-2 text-[9px] text-slate-400 mt-1 italic">
                                        Testado em: {new Date(metaTestResults.last_test_at).toLocaleString()}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Test Message Sending (hello_world template format) */}
                                  <div className="p-3.5 bg-blue-50/40 border border-blue-100/30 rounded-xl space-y-2">
                                    <div className="space-y-0.5">
                                      <h5 className="text-[9px] font-black tracking-widest text-slate-500 uppercase">Enviar Mensagem de Teste (hello_world Template)</h5>
                                      <p className="text-[9px] text-slate-400">Insira um número válido com DDI (ex: 5511999999999) para receber o template do Facebook.</p>
                                    </div>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none font-bold text-xs"
                                        placeholder="Ex: 5511999999999"
                                        value={metaTestPhoneInput}
                                        onChange={(e) => setMetaTestPhoneInput(e.target.value)}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!metaTestPhoneInput.trim()) {
                                            toast.error("Insira o número de destino para o teste.");
                                            return;
                                          }
                                          handleTestMetaConnection(metaTestPhoneInput.trim());
                                        }}
                                        disabled={isTestingMeta}
                                        className="px-3.5 py-1.5 bg-blue-600 text-white font-bold text-[9px] uppercase tracking-wider rounded-lg hover:bg-blue-700 transition"
                                      >
                                        Enviar
                                      </button>
                                    </div>

                                    {metaTestResults.template_send_result && (
                                      <div className={`p-2.5 rounded-lg border text-[9px] font-semibold leading-relaxed ${
                                        metaTestResults.template_send_result.success
                                          ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                          : 'bg-rose-50 border-rose-100 text-rose-700'
                                      }`}>
                                        {metaTestResults.template_send_result.success 
                                          ? '✅ Mensagem hello_world enviada com sucesso! Verifique o aparelho do destinatário.'
                                          : `❌ Falha ao enviar mensagem de teste: ${metaTestResults.template_send_result.error}`
                                        }
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {providerType === 'ZAPI' ? (
                <div className="p-8 border-t border-slate-100 bg-slate-50 grid grid-cols-2 gap-4 shrink-0">
                   <button 
                     type="button"
                     onClick={checkZapiConnectionStatus}
                     className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm"
                   >
                     <Smartphone className="w-4 h-4 text-emerald-500" />
                     Verificar Conexão
                   </button>
                   <button 
                     type="button"
                     onClick={handleGenerateQrCode}
                     disabled={isLoadingQr}
                     className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                   >
                     <RefreshCw className="w-4 h-4" />
                     {qrPollingActive ? "Gerar Novo QR" : "Gerar QR Code"}
                   </button>
                </div>
              ) : (
                <div className="p-8 border-t border-slate-100 bg-slate-50 shrink-0">
                  <button 
                    type="button"
                    onClick={handleSaveMetaChannel}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-blue-100"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    {isSaving ? "Salvando..." : "Salvar Canal Meta Oficial"}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
