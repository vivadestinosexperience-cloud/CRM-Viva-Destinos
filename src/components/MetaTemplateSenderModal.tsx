import React, { useState, useEffect } from "react";
import { 
  X, 
  RefreshCw, 
  Send, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  PlusCircle,
  ExternalLink
} from "lucide-react";

interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
}

interface MetaTemplate {
  id: string;
  meta_template_id: string;
  name: string;
  display_name?: string;
  category: string;
  language: string;
  status: string;
  body_text?: string;
  components?: TemplateComponent[];
}

interface MetaTemplateSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  onSuccess: () => void;
}

export const MetaTemplateSenderModal: React.FC<MetaTemplateSenderModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  onSuccess
}) => {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedTemplate = templates.find(t => t.name === selectedTemplateName);

  // Load templates
  const loadTemplates = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/meta/templates", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTemplates(data.templates || []);
      } else {
        setErrorMsg(data.error || "Erro ao carregar os modelos de mensagens.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Erro de conexão ao carregar modelos.");
    } finally {
      setIsLoading(false);
    }
  };

  // Sync with Meta
  const handleSync = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/meta/templates/sync", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTemplates(data.templates || []);
        if (data.templates && data.templates.length > 0) {
          // Keep selection if exists, or pick first
          const stillExists = data.templates.some((t: any) => t.name === selectedTemplateName);
          if (!stillExists) {
            setSelectedTemplateName("");
          }
        }
      } else {
        setErrorMsg(data.error || "Erro ao sincronizar modelos com a Meta.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Falha ao sincronizar.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  // Handle template selection change
  useEffect(() => {
    if (selectedTemplate) {
      const text = selectedTemplate.body_text || "";
      // Match all {{1}}, {{2}} tags
      const regex = /\{\{(\d+)\}\}/g;
      let match;
      const discoveredVariables: number[] = [];
      while ((match = regex.exec(text)) !== null) {
        const val = parseInt(match[1]);
        if (!discoveredVariables.includes(val)) {
          discoveredVariables.push(val);
        }
      }
      discoveredVariables.sort((a, b) => a - b);
      
      // Initialize variables array with empty strings
      const initialVars = discoveredVariables.map(() => "");
      setVariables(initialVars);
    } else {
      setVariables([]);
    }
  }, [selectedTemplateName, templates]);

  const handleVariableChange = (index: number, val: string) => {
    const updated = [...variables];
    updated[index] = val;
    setVariables(updated);
  };

  // Generate dynamic live preview text
  const getPreviewText = () => {
    if (!selectedTemplate) return "";
    let body = selectedTemplate.body_text || "";
    variables.forEach((variableValue, index) => {
      const placeholder = `{{${index + 1}}}`;
      body = body.replace(
        new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"), 
        variableValue || `[Variável ${index + 1}]`
      );
    });
    return body;
  };

  // Send Template
  const handleSendTemplate = async () => {
    if (!selectedTemplate) return;
    setIsSending(true);
    setErrorMsg(null);

    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/omnichannel/conversations/${conversationId}/send-template`, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language || "pt_BR",
          variables: variables
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error || "Falha ao disparar modelo de mensagem.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Erro de conexão ao enviar.");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden transition-all duration-300 scale-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Modelos de Mensagens WhatsApp</h2>
              <p className="text-xs text-slate-500">Selecione e dispare modelos homologados pela Meta Cloud API</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {errorMsg && (
            <div className="flex gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="text-xs font-black uppercase text-slate-400 tracking-wider">Modelos Disponíveis</div>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-600 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Sincronizando..." : "Sincronizar da Meta"}
            </button>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aguardando modelos de mensagens...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-4">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-bold text-slate-700">Nenhum modelo localizado</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Sincronize com o painel da Meta ou acesse a sua conta Meta Business Suite para aprovar novos modelos.
                </p>
              </div>
              <a
                href="https://business.facebook.com/"
                target="_blank"
                referrerPolicy="no-referrer"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors"
              >
                Gerenciar no Meta Business Suite
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-2">Selecione o Modelo</label>
                <select
                  value={selectedTemplateName}
                  onChange={(e) => setSelectedTemplateName(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="">Selecione um modelo...</option>
                  {(() => {
                    const seen = new Set<string>();
                    return templates.filter((t) => {
                      const key = t.id || t.meta_template_id || t.name;
                      if (!key) return false;
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    });
                  })().map((template) => (
                    <option key={template.id || template.meta_template_id || template.name} value={template.name}>
                      {template.display_name || template.name} ({template.category}) - {template.status}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplate && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  
                  {/* Variables Fill Block */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Parâmetros dinâmicos</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        selectedTemplate.status === "APPROVED" 
                          ? "bg-emerald-50 text-emerald-600"
                          : selectedTemplate.status === "REJECTED"
                          ? "bg-rose-50 text-rose-600"
                          : "bg-amber-50 text-amber-600"
                      }`}>
                        {selectedTemplate.status === "APPROVED" && <CheckCircle2 className="w-3 h-3" />}
                        {selectedTemplate.status}
                      </span>
                    </div>

                    {variables.length === 0 ? (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 text-xs">
                        Este modelo não requer variáveis adicionais. O conteúdo é totalmente estático.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 pb-2">
                        {variables.map((vValue, index) => (
                          <div key={index} className="space-y-1">
                            <label className="block text-[10px] font-black uppercase text-slate-400">Variável {`{{${index + 1}}}`}</label>
                            <input
                              type="text"
                              required
                              value={vValue}
                              onChange={(e) => handleVariableChange(index, e.target.value)}
                              placeholder={`Valor do parâmetro dinâmico ${index + 1}`}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50/50 hover:bg-slate-50/20 focus:bg-white"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Real-time Web preview mockup */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Visualização em Tempo Real</h3>
                    
                    <div className="rounded-2xl bg-[#efeae2] p-4 border border-slate-200 aspect-[5/3.2] flex flex-col justify-end relative shadow-inner overflow-hidden">
                      <div className="absolute inset-0 opacity-[0.04] bg-repeat pointer-events-none" style={{ backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/d/dd/WhatsApp_Click-to-Chat_Logo.svg')", backgroundSize: "140px" }} />
                      
                      {/* WhatsApp Balloon */}
                      <div className="bg-white rounded-2xl rounded-tr-none px-3 py-2.5 max-w-[90%] self-end shadow-sm border border-[#e1e2e3] relative mb-1.5 z-10 select-none">
                        <div className="text-[12.5px] text-slate-800 leading-normal whitespace-pre-wrap select-all font-sans">
                          {getPreviewText() || <span className="text-slate-300 italic">Insira ou selecione um modelo...</span>}
                        </div>
                        <div className="text-[9px] text-slate-400 text-right mt-1 font-semibold leading-none">
                          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSendTemplate}
            disabled={!selectedTemplate || isSending || selectedTemplate.status !== "APPROVED"}
            className="px-5 py-2.5 bg-blue-600 border border-transparent disabled:opacity-50 text-white rounded-xl text-xs font-bold hover:bg-blue-700 flex items-center gap-2 transition-all shadow-md active:scale-95 hover:shadow-lg"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exibindo Disparo...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Disparar Modelo Aprovado
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
