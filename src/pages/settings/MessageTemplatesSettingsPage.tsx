/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Search, 
  ArrowLeft,
  Edit2,
  Trash2,
  Keyboard,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Info,
  ExternalLink,
  Calendar,
  Sparkles,
  Clock,
  Eye,
  Copy,
  Send,
  MessageCircle,
  Smartphone,
  Check,
  ShieldAlert,
  HelpCircle,
  Zap,
  Globe,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getErrorMessage } from '../../lib/error-utils';
import { quickReplyService } from '../../services/dataService';
import { authorizedFetch, safeReadJson } from '../../services/api';

export default function MessageTemplatesSettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'local' | 'meta'>('local');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingMeta, setSyncingMeta] = useState(false);
  
  // Data States
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<any[]>([]);
  
  // Modals, Filter & Search States
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Official Meta Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');

  // Quick Reply Form
  const [formData, setFormData] = useState({
    shortcut: '',
    content: ''
  });
  const [editingReply, setEditingReply] = useState<any | null>(null);

  // META Templates Creator Form & Modal States
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  
  const [metaForm, setMetaForm] = useState({
    id: '',
    name: '',
    category: 'UTILITY',
    language: 'pt_BR',
    headerType: 'NONE', // NONE, TEXT, IMAGE, DOCUMENT, VIDEO
    headerText: '',
    bodyText: '',
    bodyExamples: [] as string[], // array indexes 1, 2, 3 corresponding to variables
    footerText: '',
    buttonType: 'NONE', // NONE, QUICK_REPLY, CTA
    quickRepliesList: ['', '', ''], // up to 3 quick replies
    ctaType1: 'NONE', // NONE, URL, PHONE_NUMBER
    ctaText1: '',
    ctaValue1: '',
    ctaType2: 'NONE', // NONE, URL, PHONE_NUMBER
    ctaText2: '',
    ctaValue2: '',
  });

  const getVariablesFromText = (text: string): number[] => {
    if (!text) return [];
    const matches = text.match(/\{\{([0-9]+)\}\}/g);
    if (!matches) return [];
    const nums = matches.map(m => Number(m.replace(/\{\{|\}\}/g, "")));
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  };

  const normalizeTemplateName = (input: string): string => {
    return input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9_\s-]/g, "")   // Keep only lower alpha, number, underscore, hyphen, space
      .replace(/[\s-]+/g, "_")         // Replace spaces and hyphens with single underscore
      .replace(/_+/g, "_")             // Avoid multiple underscores
      .trim();
  };

  // Load Data
  const fetchReplies = async () => {
    try {
      const data = await quickReplyService.list();
      setQuickReplies(data);
    } catch (error) {
      toast.error(`Erro ao carregar atalhos: ${getErrorMessage(error)}`);
    }
  };

  const fetchMetaTemplates = async () => {
    try {
      const res = await authorizedFetch('/api/meta/templates');
      const data = await safeReadJson(res);
      if (data.success && data.templates) {
        setMetaTemplates(data.templates);
      }
    } catch (error) {
      console.error("Erro ao buscar modelos Meta:", error);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchReplies(), fetchMetaTemplates()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Sync Meta Templates
  const handleMetaSync = async () => {
    try {
      setSyncingMeta(true);
      const res = await authorizedFetch('/api/meta/templates/sync', { method: 'POST' });
      const data = await safeReadJson(res);
      if (data.success) {
        setMetaTemplates(data.templates || []);
        toast.success(`Sincronização concluída! ${data.count || 0} modelos sincronizados com a Meta.`);
      } else {
        toast.error(`Erro ao sincronizar: ${data.error || 'Erro na API da Meta'}`);
      }
    } catch (error) {
      toast.error(`Falha ao conectar com o servidor: ${getErrorMessage(error)}`);
    } finally {
      setSyncingMeta(false);
    }
  };

  // Quick Reply Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.shortcut.trim() || !formData.content.trim()) {
      toast.error('Preencha todos os campos!');
      return;
    }

    try {
      setSaving(true);
      const cleanedShortcut = formData.shortcut.replace(/[\\/ ]/g, '').toLowerCase().trim();
      
      if (editingReply) {
        const updated = await quickReplyService.update(editingReply.id, {
          shortcut: cleanedShortcut,
          content: formData.content
        });
        setQuickReplies(prev => prev.map(item => item.id === editingReply.id ? updated : item));
        toast.success(`Modelo \\${cleanedShortcut} atualizado!`);
      } else {
        const created = await quickReplyService.create({
          shortcut: cleanedShortcut,
          content: formData.content
        });
        setQuickReplies(prev => [...prev, created]);
        toast.success(`Modelo \\${cleanedShortcut} criado com sucesso!`);
      }
      handleCloseModal();
    } catch (error) {
      toast.error(`Erro ao salvar modelo: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, shortcut: string) => {
    if (!confirm(`Remover o atalho \\${shortcut}?`)) return;
    try {
      await quickReplyService.remove(id);
      setQuickReplies(prev => prev.filter(item => item.id !== id));
      toast.success(`Modelo \\${shortcut} removido.`);
    } catch (error) {
      toast.error(`Erro ao remover modelo: ${getErrorMessage(error)}`);
    }
  };

  const handleEdit = (reply: any) => {
    setEditingReply(reply);
    setFormData({
      shortcut: reply.shortcut,
      content: reply.content
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingReply(null);
    setFormData({ shortcut: '', content: '' });
  };

  // Meta Single Sync
  const handleSingleTemplateSync = async (template: any) => {
    try {
      setSyncingMeta(true);
      const key = template.id || template.meta_template_id || template.name;
      const res = await authorizedFetch(`/api/meta/templates/${key}/sync-status`, {
        method: 'POST'
      });
      const data = await safeReadJson(res);
      if (data.success) {
        toast.success(`Status do modelo '${template.name}' atualizado com a Meta: ${data.template?.status || 'UNKNOWN'}`);
        fetchMetaTemplates();
      } else {
        toast.error(`Erro na sincronização: ${data.error || 'Erro inesperado'}`);
      }
    } catch (error) {
      toast.error(`Falha ao conectar: ${getErrorMessage(error)}`);
    } finally {
      setSyncingMeta(false);
    }
  };

  // Meta Single Delete (Draft Only)
  const handleMetaDelete = async (template: any) => {
    if (!confirm(`Excluir o modelo local (rascunho) '${template.name}'?`)) return;
    try {
      setSyncingMeta(true);
      const key = template.id || template.meta_template_id;
      const res = await authorizedFetch(`/api/meta/templates/${key}`, {
        method: 'DELETE'
      });
      const data = await safeReadJson(res);
      if (data.success) {
        toast.success("Modelo local excluído com sucesso.");
        fetchMetaTemplates();
      } else {
        toast.error(`Erro ao excluir: ${data.error || 'Erro inesperado'}`);
      }
    } catch (error) {
      toast.error(`Falha ao conectar: ${getErrorMessage(error)}`);
    } finally {
      setSyncingMeta(false);
    }
  };

  // Submit/Publish or Save Draft for WhatsApp template
  const validateTemplateVariables = (bodyText: string, bodyExamples: string[]): string | null => {
    const vars = getVariablesFromText(bodyText);
    if (vars.length === 0) return null;

    for (let i = 0; i < vars.length; i++) {
      if (vars[i] !== i + 1) {
        return `As variáveis precisam estar em ordem sequencial de 1 a n. Encontrado {{${vars[i]}}}, esperado {{${i + 1}}}.`;
      }
    }

    for (let i = 0; i < vars.length; i++) {
      const idx = vars[i];
      const val = bodyExamples[idx - 1];
      if (!val || !val.trim()) {
        return `Por favor, forneça um exemplo obrigatório de preenchimento para a variável {{${idx}}}.`;
      }
    }

    return null;
  };

  const buildComponentsPayload = (form: typeof metaForm) => {
    const components: any[] = [];

    // Header component
    if (form.headerType === 'TEXT' && form.headerText.trim()) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: form.headerText.trim()
      });
    } else if (form.headerType !== 'NONE') {
      components.push({
        type: "HEADER",
        format: form.headerType,
        example: {
          header_handle: ["https://developer.facebook.com/"]
        }
      });
    }

    // Body component
    const vars = getVariablesFromText(form.bodyText);
    const bodyComp: any = {
      type: "BODY",
      text: form.bodyText
    };

    if (vars.length > 0) {
      const exampleValues = vars.map(v => form.bodyExamples[v - 1] || "Exemplo");
      bodyComp.example = {
        body_text: [exampleValues]
      };
    }
    components.push(bodyComp);

    // Footer component
    if (form.footerText.trim()) {
      components.push({
        type: "FOOTER",
        text: form.footerText.trim()
      });
    }

    // Buttons component
    if (form.buttonType === 'QUICK_REPLY') {
      const qrs = form.quickRepliesList.filter(q => q.trim());
      if (qrs.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: qrs.map(text => ({
            type: "QUICK_REPLY",
            text: text.trim()
          }))
        });
      }
    } else if (form.buttonType === 'CTA') {
      const btns: any[] = [];
      if (form.ctaType1 !== 'NONE' && form.ctaText1.trim()) {
        const btn: any = {
          type: form.ctaType1,
          text: form.ctaText1.trim()
        };
        if (form.ctaType1 === 'URL') {
          btn.url = form.ctaValue1.trim() || "https://vivadestinos.com.br";
        } else {
          btn.phone_number = form.ctaValue1.trim() || "+5564993228859";
        }
        btns.push(btn);
      }
      if (form.ctaType2 !== 'NONE' && form.ctaText2.trim()) {
        const btn: any = {
          type: form.ctaType2,
          text: form.ctaText2.trim()
        };
        if (form.ctaType2 === 'URL') {
          btn.url = form.ctaValue2.trim() || "https://vivadestinos.com.br";
        } else {
          btn.phone_number = form.ctaValue2.trim() || "+5564993228859";
        }
        btns.push(btn);
      }
      if (btns.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: btns
        });
      }
    }

    return components;
  };

  const handleMetaSubmit = async (e: React.FormEvent, isDraftSubmit: boolean) => {
    e.preventDefault();

    if (!metaForm.name.trim()) {
      toast.error("Nome do modelo é obrigatório!");
      return;
    }

    const normalizedName = normalizeTemplateName(metaForm.name);
    if (!normalizedName) {
      toast.error("Nome de modelo inválido!");
      return;
    }

    if (!isDraftSubmit && !metaForm.bodyText.trim()) {
      toast.error("O corpo da mensagem é obrigatório!");
      return;
    }

    // Validate variables if not draft
    if (!isDraftSubmit) {
      const validationError = validateTemplateVariables(metaForm.bodyText, metaForm.bodyExamples);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    try {
      setSaving(true);
      const components = buildComponentsPayload(metaForm);

      const payload = {
        id: metaForm.id || undefined,
        name: normalizedName,
        display_name: metaForm.name,
        category: metaForm.category,
        language: metaForm.language,
        components: components,
        draft: isDraftSubmit,
        status: isDraftSubmit ? "DRAFT" : "PENDING"
      };

      const res = await authorizedFetch('/api/meta/templates/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await safeReadJson(res);

      if (data.success) {
        if (isDraftSubmit) {
          toast.success("Rascunho do modelo WhatsApp salvo com sucesso!");
        } else {
          toast.success("Modelo enviado para análise da Meta!");
        }
        setShowMetaModal(false);
        fetchMetaTemplates();
      } else {
        toast.error(`Erro ao criar modelo: ${data.error || 'Erro inesperado'}`);
      }
    } catch (error) {
      toast.error(`Falha ao salvar modelo Meta: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateMeta = (template: any) => {
    const rawName = `${template.name}_copia`;
    const format = normalizeTemplateName(rawName);

    // Parse existing components
    const comps = template.components || [];
    const bodyComp = comps.find((c: any) => c.type === "BODY") || {};
    const headerComp = comps.find((c: any) => c.type === "HEADER");
    const footerComp = comps.find((c: any) => c.type === "FOOTER");
    const buttonsComp = comps.find((c: any) => c.type === "BUTTONS");

    const headerType = headerComp?.format || (headerComp?.text ? 'TEXT' : 'NONE');
    const headerText = headerComp?.text || '';
    const bodyText = bodyComp?.text || '';
    
    // Extract examples
    const initialExamples: string[] = [];
    if (bodyComp?.example?.body_text?.[0]) {
      bodyComp.example.body_text[0].forEach((v: string, idx: number) => {
        initialExamples[idx] = v;
      });
    }

    const buttonType = buttonsComp ? (buttonsComp.buttons?.[0]?.type === 'QUICK_REPLY' ? 'QUICK_REPLY' : 'CTA') : 'NONE';
    const quickRepliesList = ['', '', ''];
    if (buttonType === 'QUICK_REPLY') {
      buttonsComp.buttons.forEach((b: any, idx: number) => {
        if (idx < 3) quickRepliesList[idx] = b.text;
      });
    }

    const ctaType1 = buttonType === 'CTA' && buttonsComp.buttons?.[0] ? buttonsComp.buttons[0].type : 'NONE';
    const ctaText1 = buttonType === 'CTA' && buttonsComp.buttons?.[0] ? buttonsComp.buttons[0].text : '';
    const ctaValue1 = buttonType === 'CTA' && buttonsComp.buttons?.[0] ? (buttonsComp.buttons[0].url || buttonsComp.buttons[0].phone_number || '') : '';

    const ctaType2 = buttonType === 'CTA' && buttonsComp.buttons?.[1] ? buttonsComp.buttons[1].type : 'NONE';
    const ctaText2 = buttonType === 'CTA' && buttonsComp.buttons?.[1] ? buttonsComp.buttons[1].text : '';
    const ctaValue2 = buttonType === 'CTA' && buttonsComp.buttons?.[1] ? (buttonsComp.buttons[1].url || buttonsComp.buttons[1].phone_number || '') : '';

    setMetaForm({
      id: '',
      name: format,
      category: template.category || 'UTILITY',
      language: template.language || 'pt_BR',
      headerType,
      headerText,
      bodyText,
      bodyExamples: initialExamples,
      footerText: footerComp?.text || '',
      buttonType,
      quickRepliesList,
      ctaType1,
      ctaText1,
      ctaValue1,
      ctaType2,
      ctaText2,
      ctaValue2,
    });

    setIsViewOnly(false);
    setShowMetaModal(true);
    toast.info("Modelo duplicado. Você pode alterar o nome e conteúdo à vontade.");
  };

  const handleEditMetaDraft = (template: any) => {
    // Parse existing components
    const comps = template.components || [];
    const bodyComp = comps.find((c: any) => c.type === "BODY") || {};
    const headerComp = comps.find((c: any) => c.type === "HEADER");
    const footerComp = comps.find((c: any) => c.type === "FOOTER");
    const buttonsComp = comps.find((c: any) => c.type === "BUTTONS");

    const headerType = headerComp?.format || (headerComp?.text ? 'TEXT' : 'NONE');
    const headerText = headerComp?.text || '';
    const bodyText = bodyComp?.text || '';
    
    // Extract examples
    const initialExamples: string[] = [];
    if (bodyComp?.example?.body_text?.[0]) {
      bodyComp.example.body_text[0].forEach((v: string, idx: number) => {
        initialExamples[idx] = v;
      });
    }

    const buttonType = buttonsComp ? (buttonsComp.buttons?.[0]?.type === 'QUICK_REPLY' ? 'QUICK_REPLY' : 'CTA') : 'NONE';
    const quickRepliesList = ['', '', ''];
    if (buttonType === 'QUICK_REPLY') {
      buttonsComp.buttons.forEach((b: any, idx: number) => {
        if (idx < 3) quickRepliesList[idx] = b.text;
      });
    }

    const ctaType1 = buttonType === 'CTA' && buttonsComp.buttons?.[0] ? buttonsComp.buttons[0].type : 'NONE';
    const ctaText1 = buttonType === 'CTA' && buttonsComp.buttons?.[0] ? buttonsComp.buttons[0].text : '';
    const ctaValue1 = buttonType === 'CTA' && buttonsComp.buttons?.[0] ? (buttonsComp.buttons[0].url || buttonsComp.buttons[0].phone_number || '') : '';

    const ctaType2 = buttonType === 'CTA' && buttonsComp.buttons?.[1] ? buttonsComp.buttons[1].type : 'NONE';
    const ctaText2 = buttonType === 'CTA' && buttonsComp.buttons?.[1] ? buttonsComp.buttons[1].text : '';
    const ctaValue2 = buttonType === 'CTA' && buttonsComp.buttons?.[1] ? (buttonsComp.buttons[1].url || buttonsComp.buttons[1].phone_number || '') : '';

    setMetaForm({
      id: template.id || '',
      name: template.name,
      category: template.category || 'UTILITY',
      language: template.language || 'pt_BR',
      headerType,
      headerText,
      bodyText,
      bodyExamples: initialExamples,
      footerText: footerComp?.text || '',
      buttonType,
      quickRepliesList,
      ctaType1,
      ctaText1,
      ctaValue1,
      ctaType2,
      ctaText2,
      ctaValue2,
    });

    setIsViewOnly(false);
    setShowMetaModal(true);
  };

  const handleViewMetaTemplate = (template: any) => {
    // Reuse edit parser to load fully parsed state in View-Only model
    handleEditMetaDraft(template);
    setIsViewOnly(true);
  };

  const handleSendToMetaAnalysis = async (template: any) => {
    try {
      setSyncingMeta(true);
      const res = await authorizedFetch('/api/meta/templates/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          category: template.category,
          language: template.language,
          components: template.components,
          draft: false,
          status: 'PENDING'
        })
      });

      const data = await safeReadJson(res);
      if (data.success) {
        toast.success("Modelo enviado com sucesso para análise da Meta!");
        fetchMetaTemplates();
      } else {
        toast.error(`Erro ao enviar para análise: ${data.error || 'Erro inesperado'}`);
      }
    } catch (error) {
      toast.error(`Falha ao conectar com o servidor: ${getErrorMessage(error)}`);
    } finally {
      setSyncingMeta(false);
    }
  };

  const openNewMetaModal = () => {
    setMetaForm({
      id: '',
      name: '',
      category: 'UTILITY',
      language: 'pt_BR',
      headerType: 'NONE',
      headerText: '',
      bodyText: '',
      bodyExamples: [],
      footerText: '',
      buttonType: 'NONE',
      quickRepliesList: ['', '', ''],
      ctaType1: 'NONE',
      ctaText1: '',
      ctaValue1: '',
      ctaType2: 'NONE',
      ctaText2: '',
      ctaValue2: '',
    });
    setIsViewOnly(false);
    setShowMetaModal(true);
  };

  // Filter lists based on search & meta filters
  const filteredReplies = quickReplies.filter(item => 
    (item.shortcut || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMetaTemplates = metaTemplates.filter(item => {
    const textMatch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (item.body_text || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (item.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const statusMatch = !statusFilter || String(item.status).toUpperCase() === statusFilter.toUpperCase();
    const categoryMatch = !categoryFilter || String(item.category).toUpperCase() === categoryFilter.toUpperCase();
    const languageMatch = !languageFilter || String(item.language).toLowerCase() === languageFilter.toLowerCase();
    
    return textMatch && statusMatch && categoryMatch && languageMatch;
  });

  const formatVariables = (text: string) => {
    if (!text) return '';
    const parts = text.split(/(\{\{[0-9]+\}\})/g);
    return parts.map((part, idx) => {
      if (part.match(/^\{\{[0-9]+\}\}$/)) {
        return (
          <span key={idx} className="inline-block px-1.5 py-0.5 mx-0.5 font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded font-black text-xs select-all">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const getStatusBadge = (status: string) => {
    const s = String(status || 'DRAFT').toUpperCase();
    if (s === 'APPROVED' || s === 'APPROVED_BY_META') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-emerald-100">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Aprovado pela Meta
        </span>
      );
    }
    if (s === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-rose-100">
          <XCircle className="w-3.5 h-3.5" />
          Rejeitado pela Meta
        </span>
      );
    }
    if (s === 'PAUSED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-slate-200">
          <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
          Pausado pela Meta
        </span>
      );
    }
    if (s === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-amber-200 animate-pulse">
          <Clock className="w-3.5 h-3.5" />
          Aguardando análise da Meta
        </span>
      );
    }
    if (s === 'DRAFT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-blue-100">
          <Edit2 className="w-3.5 h-3.5" />
          Rascunho
        </span>
      );
    }
    if (s === 'FLAGGED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          Alerta de qualidade
        </span>
      );
    }
    if (s === 'DISABLED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-800 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-red-200">
          <XCircle className="w-3.5 h-3.5" />
          Desativado
        </span>
      );
    }
    if (s === 'ERROR') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 text-rose-800 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-rose-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          Erro
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 font-extrabold text-[10px] tracking-wider rounded-lg uppercase border border-slate-200">
        <Clock className="w-3.5 h-3.5" />
        Status desconhecido
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      {/* Header with navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button 
            id="back_to_settings_btn"
            onClick={() => navigate('/app/ajustes')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-slate-800">Modelos de Mensagem</h1>
            <p className="text-slate-500 text-sm mt-1 text-left">Crie respostas rápidas para os operadores ou gerencie e envie novos modelos para aprovação direta da Meta.</p>
          </div>
        </div>

        {/* Toolbar Section based on active tab */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              id="template_search_input"
              type="text" 
              placeholder={activeTab === 'local' ? "Buscar respostas rápidas..." : "Buscar modelos Meta..."}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {activeTab === 'local' ? (
            <button 
              id="new_quick_reply_btn"
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Novo Atalho
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                id="new_meta_template_btn"
                onClick={openNewMetaModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Novo Modelo Meta
              </button>
              <button 
                id="sync_meta_btn"
                onClick={handleMetaSync}
                disabled={syncingMeta}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-4 h-4 ${syncingMeta ? 'animate-spin' : ''}`} />
                {syncingMeta ? 'Sincronizando...' : 'Sincronizar Meta'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Segmented Horizon Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl max-w-md">
        <button
          id="tab_local_btn"
          onClick={() => { setActiveTab('local'); setSearchQuery(''); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'local'
              ? 'bg-white text-slate-800 shadow-md'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Keyboard className="w-4 h-4 text-blue-500" />
          Respostas Rápidas (\)
        </button>
        <button
          id="tab_meta_btn"
          onClick={() => { setActiveTab('meta'); setSearchQuery(''); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'meta'
              ? 'bg-white text-slate-800 shadow-md'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4 text-emerald-500" />
          WhatsApp Oficial (Meta)
        </button>
      </div>

      {/* Meta Filter Row when active tab is Meta */}
      {activeTab === 'meta' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 border border-slate-100 rounded-2xl text-left">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Filtrar por Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-550"
            >
              <option value="">Todos os status...</option>
              <option value="DRAFT">Rascunho (Local)</option>
              <option value="PENDING">Aguardando análise da Meta</option>
              <option value="APPROVED">Aprovado pela Meta</option>
              <option value="REJECTED">Rejeitado pela Meta</option>
              <option value="PAUSED">Pausado pela Meta</option>
              <option value="FLAGGED">Alerta de qualidade</option>
              <option value="DISABLED">Desativado</option>
              <option value="ERROR">Erro</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Filtrar por Categoria</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-550"
            >
              <option value="">Todas as categorias...</option>
              <option value="UTILITY">UTILITY (Utilitários)</option>
              <option value="MARKETING">MARKETING (Comercial)</option>
              <option value="AUTHENTICATION">AUTHENTICATION (Segurança)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Filtrar por Idioma</label>
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-550"
            >
              <option value="">Todos os idiomas...</option>
              <option value="pt_BR">Português (pt_BR)</option>
              <option value="en_US">Inglês (en_US)</option>
              <option value="es_ES">Espanhol (es_ES)</option>
            </select>
          </div>
        </div>
      )}

      {/* Content Renderer */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden min-h-[300px]">
        {loading ? (
          <div className="p-16 text-center space-y-4">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Carregando modelos do sistema...</p>
          </div>
        ) : activeTab === 'local' ? (
          // QUICK REPLIES TAB DIRECT INTEGRATION
          filteredReplies.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {filteredReplies.map((reply) => (
                <div 
                  key={reply.id} 
                  id={`reply_card_${reply.id}`}
                  className="p-6 hover:bg-slate-50/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 max-w-3xl text-left">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 font-extrabold text-[10px] tracking-wider rounded-xl uppercase">
                        <Keyboard className="w-3.5 h-3.5" />
                        \{reply.shortcut}
                      </span>
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => handleEdit(reply)}
                      className="p-2 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded-xl transition-all"
                      title="Editar"
                    >
                      <Edit2 className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(reply.id, reply.shortcut)}
                      className="p-2 hover:bg-slate-100 text-slate-500 hover:text-red-600 rounded-xl transition-all"
                      title="Excluir"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-700">Nenhum atalho cadastrado</h3>
                <p className="text-slate-400 text-sm max-w-md mx-auto">Os modelos de resposta por atalho facilitam muito o dia a dia. Comece cadastrando um agora mesmo para poupar tempo!</p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
              >
                Criar Primeiro Atalho
              </button>
            </div>
          )
        ) : (
          // OFFICIAL META TEMPLATES TAB
          filteredMetaTemplates.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {filteredMetaTemplates.map((template) => (
                <div 
                  key={template.id} 
                  id={`meta_template_${template.id}`}
                  className="p-6 hover:bg-slate-50/50 transition-all flex flex-col md:flex-row md:items-start justify-between gap-6"
                >
                  <div className="space-y-4 max-w-4xl text-left flex-1">
                    {/* Header line */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-805 text-sm tracking-tight">{template.display_name || template.name}</span>
                      <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black uppercase tracking-wider">{template.category}</span>
                      <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-605 rounded text-[9px] font-black uppercase tracking-wider">{template.language}</span>
                      {getStatusBadge(template.status)}
                    </div>

                    {/* Rendered Template Box */}
                    <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 relative max-w-2xl">
                      {/* Header context */}
                      {template.header_text && (
                        <div className="font-black text-slate-900 text-sm border-b border-slate-100 pb-2 flex items-center gap-1">
                          <span className="text-[9px] uppercase tracking-wider text-slate-400">Título:</span>
                          <span>{template.header_text}</span>
                        </div>
                      )}

                      {/* Message Body Content */}
                      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{formatVariables(template.body_text)}</p>

                      {/* Footer text */}
                      {template.footer_text && (
                        <p className="text-xs text-slate-400 italic pt-1 mt-1 border-t border-slate-100/40">{template.footer_text}</p>
                      )}

                      {/* Buttons display */}
                      {template.buttons && Array.isArray(template.buttons) && template.buttons.length > 0 && (
                        <div className="pt-3 flex flex-wrap gap-2">
                          {template.buttons.map((btn: any, btnIdx: number) => (
                            <div key={btnIdx} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm flex items-center gap-1.5 select-none">
                              {btn.type === 'PHONE_NUMBER' ? '📞 Ligue:' : btn.type === 'URL' ? '🌐 Link:' : '💬 Botão:'}
                              <span>{btn.text || btn.url || btn.phone_number}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Metadata alignment and sub details */}
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Sincronizado: {template.synced_at ? new Date(template.synced_at).toLocaleString() : new Date().toLocaleString()}
                      </span>
                      {template.rejection_reason && (
                        <span className="text-rose-600 font-extrabold flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Motivo Rejeição: {template.rejection_reason}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    {/* Primary action based on status */}
                    {String(template.status).toUpperCase() === 'APPROVED' ? (
                      <button
                        onClick={() => {
                          toast.success("Abra a aba Conversas, clique em iniciar novo chat e selecione o canal Oficial para usar este modelo!");
                          navigate('/app/atendimento');
                        }}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Iniciar Chat com Modelo
                      </button>
                    ) : String(template.status).toUpperCase() === 'DRAFT' ? (
                      <button
                        onClick={() => handleSendToMetaAnalysis(template)}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <Send className="w-4 h-4" />
                        Enviar para Análise Meta
                      </button>
                    ) : (
                      <div className="text-[10px] text-slate-400 font-black uppercase text-center bg-slate-50 py-2 border border-slate-100 rounded-xl">
                        {String(template.status).toUpperCase() === 'PENDING' ? 'Aguardando Aprovação Meta' : 'Indisponível para Envio'}
                      </div>
                    )}

                    {/* Secondary Utility Controls */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleViewMetaTemplate(template)}
                        className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 font-bold text-[11px] text-slate-600 rounded-lg transition-colors flex items-center justify-center gap-1"
                        title="Visualizar modelo completo"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </button>
                      <button
                        onClick={() => handleDuplicateMeta(template)}
                        className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 font-bold text-[11px] text-slate-600 rounded-lg transition-colors flex items-center justify-center gap-1"
                        title="Duplicar modelo"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSingleTemplateSync(template)}
                        disabled={syncingMeta}
                        className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 font-bold text-[10px] text-slate-600 rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                        title="Consultar status de homologação da Meta em tempo real"
                      >
                        <RefreshCw className="w-3 h-3 text-emerald-500" />
                        Status Meta
                      </button>

                      {String(template.status).toUpperCase() === 'DRAFT' ? (
                        <button
                          onClick={() => handleEditMetaDraft(template)}
                          className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 font-bold text-[10px] text-blue-600 rounded-lg transition-colors flex items-center justify-center gap-1"
                          title="Editar rascunho de modelo"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Editar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMetaDelete(template)}
                          className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 font-bold text-[10px] text-rose-600 rounded-lg transition-colors flex items-center justify-center gap-1"
                          title="Excluir cópia local"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-700">Nenhum modelo WhatsApp localizado</h3>
                <p className="text-slate-400 text-sm max-w-lg mx-auto">Sincronize sua conta com a Meta ou clique no botão acima para criar o seu primeiro modelo aprovado oficial!</p>
              </div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={openNewMetaModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
                >
                  Criar Primeiro Modelo Meta
                </button>
                <button
                  onClick={handleMetaSync}
                  disabled={syncingMeta}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {syncingMeta ? 'Buscando da Meta...' : 'Sincronizar Conta da Meta'}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* Info Context Card */}
      <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-3xl flex items-start gap-4 text-left">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="space-y-1 font-medium">
          <p className="text-xs font-black uppercase tracking-wider text-blue-700">Fluxo de Homologação da Meta</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Ao criar e "Enviar para análise da Meta", o modelo entrará no estado <strong>Aguardando análise da Meta</strong>. A Meta homologa modelos geralmente em poucos minutos ou até 24 horas. Para receber atualizações automáticas dos modelos na hora que forem liberados, certifique-se de assinar o evento <code className="bg-blue-100 px-1 py-0.5 rounded font-bold font-mono text-[9px]">message_template_status_update</code> no painel de Webhooks do seu painel Meta de Desenvolvedores.
          </p>
        </div>
      </div>

      {/* Quick Reply Modal (Local Shortcuts) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800 text-left">
                  {editingReply ? 'Editar Modelo' : 'Novo Modelo de Resposta Rápida'}
                </h3>
                <button 
                  onClick={handleCloseModal}
                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-655 rounded-full"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Atalho de ativação</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-black text-sm select-none">\</span>
                    <input 
                      type="text"
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700"
                      placeholder="boasvindas"
                      value={formData.shortcut}
                      onChange={e => setFormData({ ...formData, shortcut: e.target.value })}
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">Ex: Digitar <code className="bg-slate-100 px-1 py-0.5 rounded font-black font-mono">\boasvindas</code> no chat carregará o conteúdo automaticamente.</p>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Conteúdo da resposta</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 resize-none h-32"
                    placeholder="Olá! Seja muito bem-vindo à Viva Destinos. Como posso te auxiliar hoje?"
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 py-3 border border-slate-200 text-slate-500 font-bold rounded-xl text-sm transition-all hover:bg-slate-50 active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Modelo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WhatsApp Official (Meta) Creator & View Modal */}
      <AnimatePresence>
        {showMetaModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-5xl shadow-2xl space-y-6 my-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 text-left flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-blue-500" />
                    {isViewOnly ? 'Visualizar Modelo Meta' : metaForm.id ? 'Editar Rascunho de Modelo' : 'Novo Modelo WhatsApp'}
                  </h3>
                  <p className="text-xs text-slate-400 text-left">Defina as opções de componente seguindo as regras oficiais de homologação.</p>
                </div>
                <button 
                  onClick={() => setShowMetaModal(false)}
                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-655 rounded-full"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Inputs Form column */}
                <form className="lg:col-span-7 space-y-4 max-h-[70vh] overflow-y-auto pr-2 text-left">
                  {/* Model Name */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Nome de Identificação (sem acentos ou maiúsculas)</label>
                    <input 
                      type="text"
                      disabled={isViewOnly || !!(metaForm.id && !isViewOnly)} // cannot change name of already saved templates
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700 disabled:opacity-75"
                      placeholder="Ex: confirmacao_de_agendamento"
                      value={metaForm.name}
                      onChange={e => setMetaForm({ ...metaForm, name: normalizeTemplateName(e.target.value) })}
                      onBlur={e => setMetaForm({ ...metaForm, name: normalizeTemplateName(e.target.value) })}
                      required
                    />
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Será formatado automaticamente. Letras minúsculas e underline. Ex: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-amber-600">confirmacao_de_reserva</code>
                    </p>
                  </div>

                  {/* Category & Language Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Categoria</label>
                      <select
                        disabled={isViewOnly}
                        value={metaForm.category}
                        onChange={e => setMetaForm({ ...metaForm, category: e.target.value })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                      >
                        <option value="UTILITY">UTILITY (Transacionais, Reservas, Avisos)</option>
                        <option value="MARKETING">MARKETING (Ofertas, Reengajamento, Boas-vindas)</option>
                        <option value="AUTHENTICATION">AUTHENTICATION (Códigos OTP, Senhas)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 text-left">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Idioma Principal</label>
                      <select
                        disabled={isViewOnly}
                        value={metaForm.language}
                        onChange={e => setMetaForm({ ...metaForm, language: e.target.value })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                      >
                        <option value="pt_BR">Português (pt_BR)</option>
                        <option value="en_US">Inglês (en_US)</option>
                        <option value="es_ES">Espanhol (es_ES)</option>
                      </select>
                    </div>
                  </div>

                  {/* Header Type Trigger */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Tipo de Cabeçalho (Header)</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {['NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          disabled={isViewOnly}
                          onClick={() => setMetaForm({ ...metaForm, headerType: type, headerText: '' })}
                          className={`py-2 px-1 text-[10px] font-black rounded-lg uppercase tracking-wider transition-all border ${
                            metaForm.headerType === type 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-100' 
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {type === 'NONE' ? 'Nenhum' : type === 'TEXT' ? 'Texto' : type === 'IMAGE' ? 'Imagem' : type === 'DOCUMENT' ? 'Documento' : 'Vídeo'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Header Text (Condicional) */}
                  {metaForm.headerType === 'TEXT' && (
                    <div className="space-y-1.5 text-left">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Texto do Cabeçalho</label>
                      <input 
                        type="text"
                        disabled={isViewOnly}
                        maxLength={60}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700"
                        placeholder="Ex: Confirmação de Viagem!"
                        value={metaForm.headerText}
                        onChange={e => setMetaForm({ ...metaForm, headerText: e.target.value })}
                        required
                      />
                    </div>
                  )}

                  {/* Body Text (Obrigatório) */}
                  <div className="space-y-1.5 text-left bg-slate-50 p-4 border border-slate-100 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Corpo da Mensagem (Body) <span className="text-rose-500 font-bold">*</span></label>
                      <span className="text-[10px] text-slate-400 font-bold">Max 1024 caracteres</span>
                    </div>
                    <textarea 
                      disabled={isViewOnly}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 resize-none h-32 font-semibold"
                      placeholder={`Olá, {{1}}!\nSua reserva para {{2}} foi confirmada com sucesso em {{3}}.`}
                      value={metaForm.bodyText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMetaForm({ ...metaForm, bodyText: val });
                      }}
                      required
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/50 pt-3">
                      <span className="text-[10px] font-medium text-slate-400 leading-normal max-w-sm">
                        Use chaves numeradas sequencialmente como <strong className="text-blue-500 font-black font-mono">{"{{1}}"}</strong>, <strong className="text-blue-500 font-black font-mono">{"{{2}}"}</strong> para marcar valores variáveis.
                      </span>
                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const current = getVariablesFromText(metaForm.bodyText);
                            const nextNum = current.length + 1;
                            setMetaForm({ ...metaForm, bodyText: metaForm.bodyText + ` {{${nextNum}}}` });
                          }}
                          className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-blue-50 hover:bg-blue-105 text-blue-600 rounded-lg border border-blue-100 transition-all active:scale-95"
                        >
                          + Inserir {"{{x}}"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Variables Examples Form list */}
                  {getVariablesFromText(metaForm.bodyText).length > 0 && (
                    <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        Exemplos de preenchimento obrigatórios
                      </p>
                      <p className="text-[11px] text-amber-700 leading-normal font-medium">
                        Meta exige exemplos reais para validar que o modelo não infrinja as políticas nas variáveis dinâmicas.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {getVariablesFromText(metaForm.bodyText).map((idx) => (
                          <div key={idx} className="space-y-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Exemplo {"{{"}{idx}{"}}"}</label>
                            <input
                              type="text"
                              required
                              disabled={isViewOnly}
                              placeholder="Ex: Gustavo"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                              value={metaForm.bodyExamples[idx - 1] || ''}
                              onChange={(e) => {
                                const updated = [...metaForm.bodyExamples];
                                updated[idx - 1] = e.target.value;
                                setMetaForm({ ...metaForm, bodyExamples: updated });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer Text */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Rodapé (Footer - Opcional)</label>
                    <input 
                      type="text"
                      disabled={isViewOnly}
                      maxLength={60}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700"
                      placeholder="Ex: Viva Destinos Experience"
                      value={metaForm.footerText}
                      onChange={e => setMetaForm({ ...metaForm, footerText: e.target.value })}
                    />
                  </div>

                  {/* Buttons Trigger option */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Menu Dedicado de Botões</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'NONE', label: 'Nenhum' },
                        { key: 'QUICK_REPLY', label: 'Resposta Rápida (Até 3)' },
                        { key: 'CTA', label: 'Links & Telefones (Até 2)' }
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          disabled={isViewOnly}
                          onClick={() => setMetaForm({ ...metaForm, buttonType: item.key })}
                          className={`py-2 px-1 text-[10px] font-black rounded-lg uppercase tracking-wider transition-all border ${
                            metaForm.buttonType === item.key 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-100' 
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Replies Details Fields */}
                  {metaForm.buttonType === 'QUICK_REPLY' && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Definir Respostas Rápidas</p>
                      {[0, 1, 2].map((idx) => (
                        <div key={idx} className="space-y-1 text-left">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Texto do Botão #{idx + 1}</label>
                          <input
                            type="text"
                            disabled={isViewOnly}
                            maxLength={25}
                            placeholder="Ex: Sim, Confirmar!"
                            className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                            value={metaForm.quickRepliesList[idx] || ''}
                            onChange={(e) => {
                              const updated = [...metaForm.quickRepliesList];
                              updated[idx] = e.target.value;
                              setMetaForm({ ...metaForm, quickRepliesList: updated });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Call to Actions Details Fields */}
                  {metaForm.buttonType === 'CTA' && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Definir Botões de Ação Dinâmica</p>
                      
                      {/* Button 1 */}
                      <div className="space-y-2 border-b border-slate-200/50 pb-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Ação #1</label>
                            <select
                              disabled={isViewOnly}
                              value={metaForm.ctaType1}
                              onChange={e => setMetaForm({ ...metaForm, ctaType1: e.target.value, ctaText1: '', ctaValue1: '' })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                            >
                              <option value="NONE">Inativo</option>
                              <option value="URL">🌐 Link Externo (URL)</option>
                              <option value="PHONE_NUMBER">📞 Chamar Telefone</option>
                            </select>
                          </div>
                          {metaForm.ctaType1 !== 'NONE' && (
                            <div className="space-y-1 text-left">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Texto Botão #1</label>
                              <input
                                type="text"
                                maxLength={25}
                                disabled={isViewOnly}
                                placeholder="Ex: Ver Detalhes"
                                className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                                value={metaForm.ctaText1}
                                onChange={e => setMetaForm({ ...metaForm, ctaText1: e.target.value })}
                              />
                            </div>
                          )}
                        </div>
                        {metaForm.ctaType1 !== 'NONE' && (
                          <div className="space-y-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                              {metaForm.ctaType1 === 'URL' ? 'URL do Link (Ex: https://...)' : 'Número de Telefone (Ex: +55...)'}
                            </label>
                            <input
                              type="text"
                              disabled={isViewOnly}
                              placeholder={metaForm.ctaType1 === 'URL' ? "https://vivadestinos.com.br" : "+5564993228859"}
                              className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                              value={metaForm.ctaValue1}
                              onChange={e => setMetaForm({ ...metaForm, ctaValue1: e.target.value })}
                            />
                          </div>
                        )}
                      </div>

                      {/* Button 2 */}
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Ação #2</label>
                            <select
                              disabled={isViewOnly}
                              value={metaForm.ctaType2}
                              onChange={e => setMetaForm({ ...metaForm, ctaType2: e.target.value, ctaText2: '', ctaValue2: '' })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                            >
                              <option value="NONE">Inativo</option>
                              <option value="URL">🌐 Link Externo (URL)</option>
                              <option value="PHONE_NUMBER">📞 Chamar Telefone</option>
                            </select>
                          </div>
                          {metaForm.ctaType2 !== 'NONE' && (
                            <div className="space-y-1 text-left">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Texto Botão #2</label>
                              <input
                                type="text"
                                maxLength={25}
                                disabled={isViewOnly}
                                placeholder="Ex: Ligar pra Agência"
                                className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                                value={metaForm.ctaText2}
                                onChange={e => setMetaForm({ ...metaForm, ctaText2: e.target.value })}
                              />
                            </div>
                          )}
                        </div>
                        {metaForm.ctaType2 !== 'NONE' && (
                          <div className="space-y-1 text-left">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                              {metaForm.ctaType2 === 'URL' ? 'URL do Link (Ex: https://...)' : 'Número de Telefone (Ex: +55...)'}
                            </label>
                            <input
                              type="text"
                              disabled={isViewOnly}
                              placeholder={metaForm.ctaType2 === 'URL' ? "https://vivadestinos.com.br" : "+5564993228859"}
                              className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                              value={metaForm.ctaValue2}
                              onChange={e => setMetaForm({ ...metaForm, ctaValue2: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </form>

                {/* Real-time WhatsApp Device Preview Mockup column */}
                <div className="lg:col-span-5 self-start sticky top-2 flex flex-col items-center bg-slate-100 p-6 rounded-3xl border border-slate-205/60 min-h-[460px] justify-between">
                  <div className="w-full space-y-4">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center justify-center gap-1">
                      <Smartphone className="w-4 h-4 text-slate-400" />
                      Visualização em tempo real (Mockup)
                    </p>

                    {/* Speech bubble */}
                    <div className="w-full max-w-[280px] bg-white rounded-2xl shadow-md border border-slate-200/50 p-3 mx-auto text-left relative overflow-hidden text-xs space-y-2">
                      {/* Optional Header visual mockup */}
                      {metaForm.headerType !== 'NONE' && (
                        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 font-extrabold text-slate-800 text-[11px] leading-tight select-none">
                          {metaForm.headerType === 'TEXT' ? (
                            metaForm.headerText || "Texto de Cabeçalho..."
                          ) : (
                            <div className="flex items-center gap-1 text-slate-505">
                              {metaForm.headerType === 'IMAGE' ? '🖼️ [Mídia: Imagem Anexa]' : metaForm.headerType === 'VIDEO' ? '🎥 [Mídia: Vídeo Anexo]' : '📄 [Mídia: Documento PDF]'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Main raw body block replacing variables with examples on the view */}
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-[11px] font-medium selection:bg-blue-105">
                        {(() => {
                          let display = metaForm.bodyText || "Olá, {{1}}! Selecione este modelo para iniciar o suporte.";
                          const vars = getVariablesFromText(display);
                          vars.forEach(v => {
                            const val = metaForm.bodyExamples[v - 1] || `{{${v}}}`;
                            display = display.replace(new RegExp(`\\{\\{${v}\\}\\}`, "g"), `[${val}]`);
                          });
                          return display;
                        })()}
                      </p>

                      {/* Optional footer visual mockup */}
                      {metaForm.footerText && (
                        <p className="text-[9px] text-slate-400 border-t border-slate-100 pt-1 leading-none italic select-none">
                          {metaForm.footerText}
                        </p>
                      )}

                      {/* Buttons visual triggers in the phone frame */}
                      {metaForm.buttonType === 'QUICK_REPLY' && metaForm.quickRepliesList.some(q => q.trim()) && (
                        <div className="border-t border-slate-100/80 -mx-3 -mb-3 bg-slate-50 divide-y divide-slate-100 select-none">
                          {metaForm.quickRepliesList.filter(q => q.trim()).map((q, idx) => (
                            <div key={idx} className="py-2 text-[11px] font-bold text-center text-blue-600 hover:bg-slate-100/50 cursor-pointer active:bg-slate-150">
                              {q}
                            </div>
                          ))}
                        </div>
                      )}

                      {metaForm.buttonType === 'CTA' && (metaForm.ctaText1.trim() || metaForm.ctaText2.trim()) && (
                        <div className="border-t border-slate-100/80 -mx-3 -mb-3 bg-slate-50 divide-y divide-slate-100 select-none">
                          {metaForm.ctaType1 !== 'NONE' && metaForm.ctaText1.trim() && (
                            <div className="py-2 text-[11px] font-bold text-center text-blue-600 flex items-center justify-center gap-1 hover:bg-slate-100/50 cursor-pointer">
                              {metaForm.ctaType1 === 'URL' ? '🌐' : '📞'}
                              {metaForm.ctaText1}
                            </div>
                          )}
                          {metaForm.ctaType2 !== 'NONE' && metaForm.ctaText2.trim() && (
                            <div className="py-2 text-[11px] font-bold text-center text-blue-600 flex items-center justify-center gap-1 hover:bg-slate-100/50 cursor-pointer">
                              {metaForm.ctaType2 === 'URL' ? '🌐' : '📞'}
                              {metaForm.ctaText2}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions buttons inside creator modal */}
                  <div className="w-full space-y-3 pt-6 border-t border-slate-200/50">
                    {isViewOnly ? (
                      <button
                        type="button"
                        onClick={() => setShowMetaModal(false)}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md transition-all active:scale-95"
                      >
                        Fechar
                      </button>
                    ) : (
                      <>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={(e) => handleMetaSubmit(e, true)}
                            disabled={saving}
                            className="flex-1 py-3 bg-white hover:bg-slate-50 text-slate-600 border border-slate-205 font-bold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
                          >
                            Salvar Rascunho (Local)
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleMetaSubmit(e, false)}
                            disabled={saving}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-105 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {saving ? 'Enviando...' : 'Enviar Análise Meta'}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMetaModal(false)}
                          className="w-full py-2 bg-slate-150 hover:bg-slate-200 text-slate-500 font-bold rounded-xl text-xs transition-colors"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
