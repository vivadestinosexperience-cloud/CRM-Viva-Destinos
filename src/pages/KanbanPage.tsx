import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Trash2, 
  ChevronLeft, 
  Cog, 
  Pin, 
  ExternalLink, 
  User as UserIcon, 
  Calendar, 
  Tag as TagIcon, 
  DollarSign, 
  MessageCircle, 
  Save, 
  X, 
  Clock, 
  Briefcase,
  Layers,
  Check,
  Edit,
  ArrowRight,
  UserCheck,
  Building,
  ArrowUpRight
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { 
  getBoards, 
  saveBoards, 
  getCards, 
  saveCards, 
  createBoard, 
  deleteBoard, 
  createCard, 
  updateCard, 
  deleteCard, 
  addCardNote 
} from '../services/kanbanService';
import { KanbanBoard, KanbanCard, KanbanStage, KanbanCardNote, Conversation } from '../types';
import { toast } from 'sonner';

export default function KanbanPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { currentUser, users, conversations, customers } = useAppStore();

  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [activeBoard, setActiveBoard] = useState<KanbanBoard | null>(null);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('ALL');

  // Modals / Overlays
  const [showCreateBoardModal, setShowCreateBoardModal] = useState(false);
  const [showConfigColumnsModal, setShowConfigColumnsModal] = useState(false);
  const [showCreateCardModal, setShowCreateCardModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);

  // Board Edit Form States
  const [showEditBoardModal, setShowEditBoardModal] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');
  const [editBoardAllowedUsers, setEditBoardAllowedUsers] = useState<string[]>([]);

  // Safe Sandboxed Confirmation Modals
  const [boardToDelete, setBoardToDelete] = useState<{ id: string, name: string } | null>(null);
  const [cardToDelete, setCardToDelete] = useState<{ id: string, title: string } | null>(null);

  // New Board Creator Form
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [newBoardStagesRaw, setNewBoardStagesRaw] = useState('DEMONSTROU INTERESSE, EM ANDAMENTO, RESERVA EFETUADA, RESERVA PERDIDA');

  // New Card Creator Form
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');
  const [newCardStageId, setNewCardStageId] = useState('');
  const [newCardConvId, setNewCardConvId] = useState('');
  const [newCardRespId, setNewCardRespId] = useState('');
  const [newCardValue, setNewCardValue] = useState(0);
  const [newCardDueDate, setNewCardDueDate] = useState('');
  const [newCardCampaign, setNewCardCampaign] = useState('');
  const [newCardTags, setNewCardTags] = useState('');

  // Selected Card Details Workspace
  const [cardDetailsTab, setCardDetailsTab] = useState<'notes' | 'history'>('notes');
  const [newNoteText, setNewNoteText] = useState('');
  const [editingCardDesc, setEditingCardDesc] = useState('');
  const [editingCardValue, setEditingCardValue] = useState(0);
  const [editingCardCampaign, setEditingCardCampaign] = useState('');
  const [editingCardRespId, setEditingCardRespId] = useState('');
  const [editingCardDueDate, setEditingCardDueDate] = useState('');
  const [editingCardTagsRaw, setEditingCardTagsRaw] = useState('');

  // Local storage re-loading
  const refreshKanbanData = () => {
    let listBoards = getBoards();
    const listCards = getCards();
    
    // Filter boards by visibility permissions (allowed_users list)
    if (currentUser) {
      listBoards = listBoards.filter(b => {
        if (!b.allowed_users || b.allowed_users.length === 0) return true;
        return b.allowed_users.includes(currentUser.id);
      });
    }

    setBoards(listBoards);
    setCards(listCards);

    if (boardId) {
      const active = listBoards.find(b => b.id === boardId);
      setActiveBoard(active || null);
    } else {
      setActiveBoard(null);
    }
  };

  useEffect(() => {
    refreshKanbanData();
    
    // Listen to updates from other views (like OmnichannelPage changes)
    const handleUpdateEvent = () => {
      refreshKanbanData();
    };
    window.addEventListener('viva_crm_kanban_updated', handleUpdateEvent);
    return () => {
      window.removeEventListener('viva_crm_kanban_updated', handleUpdateEvent);
    };
  }, [boardId]);

  // Check query params to select card (used when navigating from Omnichannel link)
  useEffect(() => {
    if (cards.length > 0) {
      const searchParams = new URLSearchParams(window.location.search);
      const cardIdParam = searchParams.get('openCardId');
      if (cardIdParam) {
        const found = cards.find(c => c.id === cardIdParam);
        if (found) {
          setSelectedCard(found);
          setEditingCardDesc(found.description || '');
          setEditingCardValue(found.value || 0);
          setEditingCardCampaign(found.campaign || '');
          setEditingCardRespId(found.responsible_id || '');
          setEditingCardDueDate(found.due_date || '');
          setEditingCardTagsRaw((found.tags || []).join(', '));
        }
      }
    }
  }, [cards]);

  // Handle board creation
  const handleCreateBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) {
      toast.error('O nome do painel é obrigatório.');
      return;
    }
    const stageList = newBoardStagesRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (stageList.length === 0) {
      toast.error('Adicione pelo menos uma fase (coluna).');
      return;
    }

    const created = createBoard(newBoardName.trim(), newBoardDesc.trim(), stageList);
    toast.success(`Painel "${created.name}" criado com sucesso!`);
    setShowCreateBoardModal(false);
    
    // Reset form
    setNewBoardName('');
    setNewBoardDesc('');
    setNewBoardStagesRaw('DEMONSTROU INTERESSE, EM ANDAMENTO, RESERVA EFETUADA, RESERVA PERDIDA');
    
    // Go to new board
    navigate(`/app/paineis/${created.id}`);
  };

  // Handle board update (name, description, visibility permissions)
  const handleSaveBoardEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoard) return;

    if (!editBoardName.trim()) {
      toast.error('O nome do painel é obrigatório.');
      return;
    }

    const listBoards = getBoards();
    const bdIdx = listBoards.findIndex(b => b.id === activeBoard.id);
    if (bdIdx !== -1) {
      listBoards[bdIdx].name = editBoardName.trim();
      listBoards[bdIdx].description = editBoardDesc.trim();
      listBoards[bdIdx].allowed_users = editBoardAllowedUsers;
      saveBoards(listBoards);
      
      toast.success('Painel atualizado com sucesso!');
      setShowEditBoardModal(false);
      refreshKanbanData();
    }
  };

  // Delete Board
  const handleDeleteBoard = (id: string, name: string) => {
    setBoardToDelete({ id, name });
  };

  const handleConfirmDeleteBoardActual = () => {
    if (!boardToDelete) return;
    deleteBoard(boardToDelete.id);
    toast.success('Painel excluído com sucesso.');
    refreshKanbanData();
    if (boardId === boardToDelete.id) {
      navigate('/app/paineis');
    }
    setBoardToDelete(null);
  };

  // Toggle stage/board pin in homepage
  const togglePinBoard = (board: KanbanBoard) => {
    const list = getBoards();
    const idx = list.findIndex(b => b.id === board.id);
    if (idx !== -1) {
      list[idx].is_pinned = !list[idx].is_pinned;
      saveBoards(list);
      toast.success(list[idx].is_pinned ? 'Painel fixado!' : 'Painel desafixado.');
      refreshKanbanData();
    }
  };

  // Create new card
  const handleAddNewCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardTitle.trim()) {
      toast.error('O título do card é obrigatório.');
      return;
    }
    if (!newCardStageId) {
      toast.error('Selecione uma fase de atendimento.');
      return;
    }

    const tagsList = newCardTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const newCardObj = createCard({
      board_id: boardId!,
      stage_id: newCardStageId,
      title: newCardTitle.trim(),
      description: newCardDesc.trim(),
      conversation_id: newCardConvId || undefined,
      responsible_id: newCardRespId || currentUser?.id,
      customer_id: conversations.find(c => c.id === newCardConvId)?.customer_id || undefined,
      due_date: newCardDueDate || undefined,
      tags: tagsList,
      value: Number(newCardValue) || 0,
      campaign: newCardCampaign.trim() || undefined,
    });

    toast.success(`Card "${newCardObj.title}" criado e vinculado com sucesso!`);
    setShowCreateCardModal(false);

    // Reset card form
    setNewCardTitle('');
    setNewCardDesc('');
    setNewCardStageId('');
    setNewCardConvId('');
    setNewCardRespId('');
    setNewCardValue(0);
    setNewCardDueDate('');
    setNewCardCampaign('');
    setNewCardTags('');

    refreshKanbanData();
  };

  // Card movement dragging support
  const onDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('text/plain', cardId);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;

    const allCards = getCards();
    const matchedIdx = allCards.findIndex(c => c.id === cardId);
    if (matchedIdx !== -1) {
      const cardToUpdate = allCards[matchedIdx];
      if (cardToUpdate.stage_id !== targetStageId) {
        cardToUpdate.stage_id = targetStageId;
        updateCard(cardToUpdate);
        toast.info(`Card "${cardToUpdate.title}" movido.`);
        refreshKanbanData();
        
        // Also update open card details live if opened
        if (selectedCard?.id === cardId) {
          setSelectedCard({ ...cardToUpdate });
        }
      }
    }
  };

  // Quick phase change (button click)
  const quickMoveCardStage = (card: KanbanCard, stageId: string) => {
    const allCards = getCards();
    const matchedIdx = allCards.findIndex(c => c.id === card.id);
    if (matchedIdx !== -1) {
      allCards[matchedIdx].stage_id = stageId;
      const updated = updateCard(allCards[matchedIdx]);
      setSelectedCard(updated);
      refreshKanbanData();
      toast.success('Fase de atendimento atualizada!');
    }
  };

  // Save edits of current Card
  const saveCardDetailChanges = () => {
    if (!selectedCard) return;
    const tagList = editingCardTagsRaw
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const updated: KanbanCard = {
      ...selectedCard,
      description: editingCardDesc,
      value: editingCardValue,
      campaign: editingCardCampaign,
      responsible_id: editingCardRespId || undefined,
      due_date: editingCardDueDate || undefined,
      tags: tagList
    };

    updateCard(updated);
    setSelectedCard(updated);
    toast.success('Campos do Card atualizados com sucesso!');
    refreshKanbanData();
  };

  // Delete card from UI
  const handleDeleteCard = (cardId: string) => {
    const cd = cards.find(c => c.id === cardId);
    setCardToDelete({ id: cardId, title: cd?.title || 'este card' });
  };

  const handleConfirmDeleteCardActual = () => {
    if (!cardToDelete) return;
    deleteCard(cardToDelete.id);
    toast.success('Card removido com sucesso.');
    setSelectedCard(null);
    setCardToDelete(null);
    refreshKanbanData();
  };

  // Create card annotation
  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard || !newNoteText.trim()) return;

    const adderName = currentUser?.name || 'Operador';
    const note = addCardNote(selectedCard.id, newNoteText.trim(), adderName);
    
    // Sync current visual component state
    const refreshedCardList = getCards();
    const currentCard = refreshedCardList.find(c => c.id === selectedCard.id);
    if (currentCard) {
      setSelectedCard(currentCard);
    }
    setNewNoteText('');
    toast.success('Anotação registrada com sucesso!');
    refreshKanbanData();
  };

  // Configure Stages list modal save
  const [stagesConfigRaw, setStagesConfigRaw] = useState('');
  useEffect(() => {
    if (activeBoard) {
      setStagesConfigRaw(activeBoard.stages.map(s => s.name).join('\n'));
    }
  }, [showConfigColumnsModal, activeBoard]);

  const handleSaveColumnsConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoard) return;

    const listNames = stagesConfigRaw
      .split('\n')
      .map(n => n.trim())
      .filter(Boolean);

    if (listNames.length === 0) {
      toast.error('O painel precisa de pelo menos uma coluna.');
      return;
    }

    const compiledStages: KanbanStage[] = listNames.map((name, idx) => {
      // Find matches to keep existing IDs, colors if names aren't changed
      const existing = activeBoard.stages.find(s => s.name.toUpperCase() === name.toUpperCase());
      return {
        id: existing?.id || `stage-${Date.now()}-${idx}`,
        name,
        order: idx + 1,
        color: existing?.color || ['blue', 'emerald', 'amber', 'purple', 'rose', 'indigo', 'slate'][idx % 7]
      };
    });

    const listBoards = getBoards();
    const bdIdx = listBoards.findIndex(b => b.id === activeBoard.id);
    if (bdIdx !== -1) {
      listBoards[bdIdx].stages = compiledStages;
      saveBoards(listBoards);
      toast.success('Colunas reconfiguradas com sucesso!');
      setShowConfigColumnsModal(false);
      refreshKanbanData();
    }
  };

  // Find linked customer for each Card
  const getCardCustomer = (card: KanbanCard) => {
    if (card.customer_id) {
      const cust = customers.find(c => c.id === card.customer_id);
      if (cust) return cust;
    }
    // Fallback: look at conversation
    if (card.conversation_id) {
      const conv = conversations.find(c => c.id === card.conversation_id);
      if (conv?.customer) return conv.customer;
      if (conv?.customer_id) {
        const custVal = customers.find(c => c.id === conv.customer_id);
        if (custVal) return custVal;
      }
    }
    return null;
  };

  // Get active operator display
  const getUserDisplay = (userId?: string) => {
    if (!userId) return 'Sem Operador';
    const found = users.find(u => u.id === userId);
    return found ? found.name : 'Operador';
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50/50">
      
      {/* 1. HOMEPAGE VIEW (All boards summary list) */}
      {!activeBoard && (
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-md">
                <Briefcase className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">Painéis de Venda & CRM</h1>
              <p className="text-slate-500 text-sm max-w-2xl mx-auto leading-relaxed">
                Controle suas vendas, crie funis, acompanhe tarefas e atividades utilizando os painéis de estilo Kanban integrados, unificados em tempo real com seu chat.
              </p>
              
              <button
                onClick={() => setShowCreateBoardModal(true)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4" /> Criar Novo Painel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {boards.map((board) => {
                const boardCards = cards.filter(c => c.board_id === board.id);
                return (
                  <div 
                    key={board.id} 
                    className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{board.name}</h3>
                          <p className="text-xs text-slate-400 font-medium">{board.description || 'Painel de atendimento corporativo.'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => togglePinBoard(board)}
                            className={`p-2 rounded-xl border transition-all ${board.is_pinned ? 'bg-amber-50 text-amber-500 border-amber-200' : 'bg-slate-50 text-slate-300 border-slate-100 hover:text-slate-400'}`}
                            title="Fixar Painel"
                          >
                            <Pin className="w-3.5 h-3.5 fill-current" />
                          </button>
                          <button
                            onClick={() => handleDeleteBoard(board.id, board.name)}
                            className="p-2 rounded-xl bg-red-50 text-red-400 border border-red-100 hover:bg-red-100 transition-all"
                            title="Excluir Painel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-1.5">
                        {board.stages.map((stg) => {
                          const count = boardCards.filter(c => c.stage_id === stg.id).length;
                          return (
                            <span key={stg.id} className="text-[9px] font-black uppercase tracking-wider bg-slate-50 border border-slate-200/60 text-slate-500 px-2 py-1 rounded-lg">
                              {stg.name} ({count})
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold">
                        <Layers className="w-3.5 h-3.5 shrink-0" />
                        <span>{boardCards.length} {boardCards.length === 1 ? 'Card cadastrado' : 'Cards cadastrados'}</span>
                      </div>
                      
                      <button
                        onClick={() => navigate(`/app/paineis/${board.id}`)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl tracking-wide transition-all cursor-pointer shadow-sm shadow-slate-900/10"
                      >
                        <span>Abrir</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <div 
                onClick={() => setShowCreateBoardModal(true)}
                className="bg-slate-50 hover:bg-white border-2 border-dashed border-slate-200 hover:border-blue-500/50 rounded-3xl p-8 transition-all flex flex-col items-center justify-center text-center space-y-3 cursor-pointer select-none group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-500 flex items-center justify-center transition-all">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-600 group-hover:text-blue-600 uppercase tracking-widest block">Novo Painel de Vendas</span>
                  <span className="text-[10px] text-slate-400 block max-w-xs">Escolha suas próprias colunas personalizáveis como "Demostrou Interesse", "Em andamento", etc.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BOARD INNER KANBAN VIEW (Active columns list) */}
      {activeBoard && (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Header */}
          <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/app/paineis')}
                className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 border border-transparent transition-all cursor-pointer"
                title="Voltar para painéis"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <span>{activeBoard.name}</span>
                  <button
                    onClick={() => {
                      setEditBoardName(activeBoard.name);
                      setEditBoardDesc(activeBoard.description || '');
                      setEditBoardAllowedUsers(activeBoard.allowed_users || []);
                      setShowEditBoardModal(true);
                    }}
                    className="p-1 hover:bg-slate-105 hover:text-blue-600 rounded-lg text-slate-400 transition cursor-pointer"
                    title="Editar nome e permissões do Painel"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{activeBoard.description || 'Funil de Vendas CRM'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar cards..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-250 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-700"
                />
              </div>

              <select
                value={responsibleFilter}
                onChange={(e) => setResponsibleFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="ALL">Todo mundo</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>

              <button
                onClick={() => setShowConfigColumnsModal(true)}
                className="p-2.5 rounded-xl border border-slate-250 hover:bg-slate-100 text-slate-500 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                title="Configurar etapas/colunas"
              >
                <Cog className="w-4 h-4" />
                <span className="hidden lg:inline font-bold">Configurar Colunas</span>
              </button>

              <button
                onClick={() => {
                  setNewCardStageId(activeBoard.stages[0]?.id || '');
                  setShowCreateCardModal(true);
                }}
                className="p-2 px-3.5 rounded-xl bg-blue-600 text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-black uppercase tracking-wider shadow-sm hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Card</span>
              </button>
            </div>
          </header>

          {/* Kanban Columns viewport Container */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-5 items-stretch custom-scrollbar select-none bg-slate-100/40">
            {activeBoard.stages.map((stage) => {
              // Filter cards belonging to this board column
              const stageCards = cards.filter(card => {
                if (card.board_id !== activeBoard.id) return false;
                if (card.stage_id !== stage.id) return false;
                
                // Matches search keyword
                if (searchTerm.trim()) {
                  const check = searchTerm.toLowerCase();
                  const matchTitle = card.title.toLowerCase().includes(check);
                  const matchCode = card.code.toLowerCase().includes(check);
                  const cust = getCardCustomer(card);
                  const matchCust = cust ? cust.name.toLowerCase().includes(check) || cust.phone.includes(check) : false;
                  if (!matchTitle && !matchCode && !matchCust) return false;
                }

                // Operator filter
                if (responsibleFilter !== 'ALL' && card.responsible_id !== responsibleFilter) return false;

                return true;
              });

              return (
                <div 
                  key={stage.id} 
                  className="w-80 border border-slate-200/50 bg-slate-50 rounded-2xl flex flex-col shrink-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, stage.id)}
                >
                  {/* Stage Header */}
                  <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0`} style={{ 
                        backgroundColor: stage.color === 'emerald' ? '#10b981' : 
                                        stage.color === 'blue' ? '#3b82f6' : 
                                        stage.color === 'green' ? '#22c55e' : 
                                        stage.color === 'red' ? '#ef4444' : 
                                        stage.color === 'amber' ? '#f59e0b' : 
                                        stage.color === 'indigo' ? '#6366f1' : 
                                        stage.color === 'violet' ? '#8b5cf6' : 
                                        stage.color === 'fuchsia' ? '#d946ef' : 
                                        stage.color === 'pink' ? '#ec4899' : 
                                        stage.color === 'purple' ? '#a855f7' : '#94a3b8' 
                      }} />
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider truncate" title={stage.name}>
                        {stage.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-extrabold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full select-none">
                        {stageCards.length}
                      </span>
                      <button
                        onClick={() => {
                          setNewCardStageId(stage.id);
                          setShowCreateCardModal(true);
                        }}
                        className="p-1 rounded bg-slate-50 hover:bg-slate-150 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                        title="Adicionar card coluna"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stage Cards scrollable List */}
                  <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar min-h-[150px]">
                    {stageCards.map((card) => {
                      const cust = getCardCustomer(card);
                      const respName = getUserDisplay(card.responsible_id);

                      return (
                        <div
                          key={card.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, card.id)}
                          onClick={() => {
                            setSelectedCard(card);
                            setEditingCardDesc(card.description || '');
                            setEditingCardValue(card.value || 0);
                            setEditingCardCampaign(card.campaign || '');
                            setEditingCardRespId(card.responsible_id || '');
                            setEditingCardDueDate(card.due_date || '');
                            setEditingCardTagsRaw((card.tags || []).join(', '));
                          }}
                          className="p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer select-none space-y-2 group active:scale-[0.98]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[9px] font-black text-slate-400 bg-slate-50 border px-1 rounded">
                              {card.code}
                            </span>

                            {card.conversation_id && (
                              <span className="flex items-center gap-1 text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 py-0.5 rounded uppercase tracking-wider">
                                <MessageCircle className="w-2.5 h-2.5" /> Atendimento
                              </span>
                            )}
                          </div>

                          <h4 className="text-xs font-black text-slate-700 leading-tight group-hover:text-blue-600 transition-colors">
                            {card.title}
                          </h4>

                          {card.description && (
                            <p className="text-[10px] text-slate-400 line-clamp-2 font-medium">
                              {card.description}
                            </p>
                          )}

                          {card.tags && card.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {card.tags.map(t => (
                                <span key={t} className="text-[8px] font-extrabold px-1.5 py-0.5 bg-slate-50 border text-slate-400 uppercase tracking-widest rounded-md">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-1 text-slate-400 text-[10px] font-bold">
                              <UserIcon className="w-3 h-3 text-slate-300" />
                              <span className="truncate max-w-[100px] text-slate-500">{respName}</span>
                            </div>

                            {card.value ? (
                              <div className="text-[10px] text-emerald-600 font-extrabold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.value)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {stageCards.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-2xl select-none">
                        <Layers className="w-6 h-6 text-slate-300/60 mb-1" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sem Itens</span>
                        <span className="text-[9px] text-slate-300">Nenhum card nesta fase</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. CARD DETAILS SIDEBAR / FULL SCREEN MODAL (3rd mockup) */}
      {selectedCard && (() => {
        const cardBoard = boards.find(b => b.id === selectedCard.board_id) || activeBoard;
        const stagesList = cardBoard?.stages || [];
        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-full md:w-[700px] lg:w-[900px] bg-white h-screen flex flex-col md:flex-row overflow-hidden shadow-2xl relative animate-in slide-in-from-right duration-350">
              
              {/* Left Side: CRM fields */}
              <div className="w-full md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto border-r border-slate-100 bg-slate-50/50">
                <div className="space-y-6">
                  
                  {/* Header title */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-150 px-1.5 py-0.5 rounded border uppercase">
                          {selectedCard.code}
                        </span>
                        <h2 className="text-xl font-bold text-slate-800 leading-tight mt-1">{selectedCard.title}</h2>
                      </div>

                      <button
                        onClick={() => setSelectedCard(null)}
                        className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {/* Active stage badge */}
                      <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full font-bold text-[10px] uppercase">
                        {stagesList.find(s => s.id === selectedCard.stage_id)?.name || 'FASE ATIVA'}
                      </span>
                    </div>
                  </div>

                <div className="h-px bg-slate-100" />

                {/* Main Fields edit form */}
                <div className="space-y-4">
                  
                  {/* Responsible Operator Selector */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Responsável pelo Card
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={editingCardRespId}
                        onChange={(e) => setEditingCardRespId(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                      >
                        <option value="">Selecione um operador...</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Customer Information (Contacts Section) */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      Contato do Atendimento
                    </span>

                    {getCardCustomer(selectedCard) ? (
                      (() => {
                        const cust = getCardCustomer(selectedCard)!;
                        return (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold overflow-hidden">
                                {cust.name.charAt(0)}
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-slate-800 leading-none">{cust.name}</h4>
                                <span className="text-[10px] text-slate-400 font-medium block mt-1">{cust.phone}</span>
                              </div>
                            </div>

                            {/* Linked Tag display */}
                            {cust.tags && cust.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {cust.tags.map(tg => (
                                  <span key={tg} className="text-[8px] font-extrabold bg-blue-50 border border-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                                    {tg}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Critical feature: Direct chat linkage launcher */}
                            {selectedCard.conversation_id ? (
                              <button
                                onClick={() => {
                                  setSelectedCard(null);
                                  navigate(`/app/atendimentos/${selectedCard.conversation_id}`);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 p-2 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-[10px] rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Abrir Conversa do Cliente</span>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <p className="text-[10px] text-amber-600 font-bold bg-amber-50 rounded-xl p-2 border border-amber-100 text-center">
                                Chat da conversa desvinculado de atendimento automático.
                              </p>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed">
                        <UserIcon className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-400 font-bold block">Nenhum cliente associado</span>
                      </div>
                    )}
                  </div>

                  {/* Description Box */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Descrição & Anotações de Venda
                    </label>
                    <textarea
                      value={editingCardDesc}
                      onChange={(e) => setEditingCardDesc(e.target.value)}
                      placeholder="Adicione uma descrição do status do interesse, perfil do cliente, detalhes do roteiro preferencial..."
                      rows={3}
                      className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 placeholder-slate-400"
                    />
                  </div>

                  {/* Due Date & Financial Values */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Previsão / Vencimento
                      </label>
                      <input
                        type="date"
                        value={editingCardDueDate}
                        onChange={(e) => setEditingCardDueDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Valor Distribuído (R$)
                      </label>
                      <input
                        type="number"
                        value={editingCardValue}
                        onChange={(e) => setEditingCardValue(parseFloat(e.target.value) || 0)}
                        placeholder="Ex: 1500"
                        className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                      />
                    </div>
                  </div>

                  {/* Campaign & Tags */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Campanha / Origem
                      </label>
                      <input
                        type="text"
                        value={editingCardCampaign}
                        onChange={(e) => setEditingCardCampaign(e.target.value)}
                        placeholder="Ex: TRÁFEGO PAGO"
                        className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Etiquetas (/ para separar)
                      </label>
                      <input
                        type="text"
                        value={editingCardTagsRaw}
                        onChange={(e) => setEditingCardTagsRaw(e.target.value)}
                        placeholder="Ex: LEAD TÍTULO, VIP"
                        className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Delete / Save Row */}
              <div className="pt-6 border-t border-slate-100 mt-6 flex justify-between items-center bg-white p-4 rounded-2xl">
                <button
                  onClick={() => handleDeleteCard(selectedCard.id)}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] rounded-xl uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir Card
                </button>

                <button
                  onClick={saveCardDetailChanges}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-xl uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all shadow-md"
                >
                  <Save className="w-3.5 h-3.5" /> Salvar Campos
                </button>
              </div>
            </div>

            {/* Right Side: Notes CRM history */}
            <div className="w-full md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto bg-white">
              <div className="space-y-6 flex-1 flex flex-col">
                
                {/* Tabs selection block */}
                <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                  <button
                    onClick={() => setCardDetailsTab('notes')}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${cardDetailsTab === 'notes' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Anotações / Registro CRM
                  </button>
                  <button
                    onClick={() => setCardDetailsTab('history')}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${cardDetailsTab === 'history' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Movimentar de Fase
                  </button>
                </div>

                {/* TAB content: Anotações/Atendimentos CRM */}
                {cardDetailsTab === 'notes' && (
                  <div className="flex-1 flex flex-col justify-between gap-6">
                    
                    {/* Note creator */}
                    <form onSubmit={handleAddNote} className="space-y-3">
                      <div className="space-y-1">
                        <textarea
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          placeholder="Adicionar nota de negociação (ex: cliente quer viajar em Janeiro, vai fechar na segunda, hotel 5 estrelas)..."
                          rows={3}
                          className="w-full p-3.5 text-xs text-slate-700 bg-slate-50 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium placeholder-slate-400"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={!newNoteText.trim()}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          Salvar Registro
                        </button>
                      </div>
                    </form>

                    {/* Notes grid list scroll */}
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-[380px] pr-1.5 custom-scrollbar">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pb-1">
                        Histórico de Notas Registradas
                      </span>
                      
                      {(selectedCard.notes || []).length === 0 ? (
                        <div className="text-center py-8 border border-dashed text-slate-300 rounded-2xl">
                          <MessageCircle className="w-6 h-6 mx-auto mb-1" />
                          <span className="text-[10px] font-bold block">Nenhum registro ainda</span>
                          <span className="text-[9px] block">Crie anotações para salvar o histórico deste lead.</span>
                        </div>
                      ) : (
                        (selectedCard.notes || []).map((note) => (
                          <div key={note.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wide">
                                {note.created_by_name}
                              </span>
                              <span className="text-[9px] text-slate-450 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(note.created_at).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-605 leading-relaxed whitespace-pre-wrap">
                              {note.content}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                  </div>
                )}

                {/* TAB content: Stage / Fase fast move selection */}
                {cardDetailsTab === 'history' && (
                  <div className="flex-1 space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Selecione a fase atual do card:
                      </span>
                      <p className="text-[10px] text-slate-400">Clique para mover o lead rapidamente a qualquer momento. Sincroniza instantaneamente.</p>
                    </div>

                    <div className="space-y-2.5">
                      {stagesList.map((stg) => {
                        const isCurrent = stg.id === selectedCard.stage_id;
                        return (
                          <button
                            key={stg.id}
                            onClick={() => quickMoveCardStage(selectedCard, stg.id)}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${isCurrent ? 'bg-blue-50/50 border-blue-200 text-blue-700 font-extrabold' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100/50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" style={{ 
                                backgroundColor: stg.color === 'emerald' ? '#10b981' : 
                                                stg.color === 'blue' ? '#3b82f6' : 
                                                stg.color === 'green' ? '#22c55e' : 
                                                stg.color === 'red' ? '#ef4444' : 
                                                stg.color === 'amber' ? '#f59e0b' : 
                                                stg.color === 'indigo' ? '#6366f1' : 
                                                stg.color === 'violet' ? '#8b5cf6' : 
                                                stg.color === 'fuchsia' ? '#d946ef' : 
                                                stg.color === 'pink' ? '#ec4899' : 
                                                stg.color === 'purple' ? '#a855f7' : '#94a3b8' 
                              }} />
                              <span className="text-xs uppercase tracking-wide">{stg.name}</span>
                            </div>

                            {isCurrent && (
                              <Check className="w-4 h-4 text-blue-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
        );
      })()}

      {/* 4. DIALOGS MODALS */}

      {/* Edit Board Modal */}
      {showEditBoardModal && activeBoard && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in scale-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Editar Painel & Permissões</h3>
              <button onClick={() => setShowEditBoardModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBoardEdit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Nome do Painel
                </label>
                <input
                  type="text"
                  required
                  value={editBoardName}
                  onChange={(e) => setEditBoardName(e.target.value)}
                  placeholder="Nome do painel"
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Descrição do Painel
                </label>
                <input
                  type="text"
                  value={editBoardDesc}
                  onChange={(e) => setEditBoardDesc(e.target.value)}
                  placeholder="Descrição do painel"
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                />
              </div>

              {/* Permissão de Visualização */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Usuários com acesso de Visualização
                </label>
                <p className="text-[10px] text-slate-400 mb-2">Selecione quais operadores conseguem ver este painel. Se nenhum for marcado, todos os usuários visualizam por padrão.</p>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
                  {users.map(u => {
                    const isSelected = editBoardAllowedUsers.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 text-xs text-slate-600 font-semibold cursor-pointer py-1 px-1.5 hover:bg-white rounded-lg transition-all">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditBoardAllowedUsers([...editBoardAllowedUsers, u.id]);
                            } else {
                              setEditBoardAllowedUsers(editBoardAllowedUsers.filter(id => id !== u.id));
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span>{u.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditBoardModal(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-55 font-bold uppercase rounded-xl tracking-wide cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all shadow-md"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Board Confirmation Modal */}
      {boardToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl animate-in scale-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Excluir Painel CRM?</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Tem certeza que deseja excluir o painel <span className="font-extrabold text-slate-800">"{boardToDelete.name}"</span>? 
                Todos os cards e históricos de negociação vinculados a ele serão excluídos permanentemente do sistema CRM. Esta ação não poderá ser desfeita.
              </p>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => setBoardToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteBoardActual}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all shadow-lg shadow-red-600/15"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Card Confirmation Modal */}
      {cardToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl animate-in scale-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Remover Card?</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Deseja realmente remover permanentemente o card <span className="font-extrabold text-slate-800">"{cardToDelete.title}"</span> do Painel de CRM?
              </p>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => setCardToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteCardActual}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all shadow-lg shadow-red-600/15"
              >
                Sim, Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4.1 Created Board Modal */}
      {showCreateBoardModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in scale-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Criar Novo Painel (CRM)</h3>
              <button onClick={() => setShowCreateBoardModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Nome do Painel
                </label>
                <input
                  type="text"
                  required
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="Ex: MINI-VAC MULTIPROPRIEDADE"
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Descrição do Painel
                </label>
                <input
                  type="text"
                  value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                  placeholder="Ex: SDR MINI-VAC"
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Colunas/Etapas do Funil (Separadas por Vírgula)
                </label>
                <p className="text-[10px] text-slate-400 mb-1.5">Cada nome será uma coluna de fase Kanban personalizável.</p>
                <textarea
                  required
                  rows={3}
                  value={newBoardStagesRaw}
                  onChange={(e) => setNewBoardStagesRaw(e.target.value)}
                  placeholder="Ex: DEMONSTROU INTERESSE, EM ANDAMENTO, RESERVA EFETUADA, RESERVA PERDIDA"
                  className="w-full px-3 py-1.5 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateBoardModal(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 font-bold uppercase rounded-xl tracking-wide cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all shadow-md"
                >
                  Criar Painel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4.2 Configure Stages List Modal */}
      {showConfigColumnsModal && activeBoard && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in scale-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Configurar Colunas/Etapas</h3>
              <button onClick={() => setShowConfigColumnsModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveColumnsConfig} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Editar Colunas/Etapas (Uma por Linha)
                </label>
                <p className="text-[10px] text-slate-400">Edite, adicione ou mude a ordem de cada linha de coluna. Aperte "Enter" para pular de linha.</p>
              </div>

              <textarea
                required
                rows={8}
                value={stagesConfigRaw}
                onChange={(e) => setStagesConfigRaw(e.target.value)}
                placeholder="Ex: DEMONSTROU INTERESSE&#10;EM ANDAMENTO&#10;RESERVA EFETUADA"
                className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-750 font-semibold"
              />

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowConfigColumnsModal(false)}
                  className="px-4 py-2 text-xs text-slate-505 hover:bg-slate-55 font-bold uppercase rounded-xl tracking-wide cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-905 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all"
                >
                  Salvar Colunas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4.3 Create New Card Modal (links to active conversations search) */}
      {showCreateCardModal && activeBoard && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh] animate-in scale-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Criar Novo Card de Atendimento</h3>
              <button onClick={() => setShowCreateCardModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewCard} className="space-y-4">
              
              {/* Card Title */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Título do Card (Nome do Lead)
                </label>
                <input
                  type="text"
                  required
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  placeholder="Ex: Vitinhohsagazz ou Maria Alice"
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                />
              </div>

              {/* Stage Selection */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Fase do Funil
                </label>
                <select
                  required
                  value={newCardStageId}
                  onChange={(e) => setNewCardStageId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                >
                  <option value="">Selecione uma fase...</option>
                  {activeBoard.stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Conversation Linker (Real API Search integration) */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Vincular Atendimento do Chat (Opcional)
                </label>
                <select
                  value={newCardConvId}
                  onChange={(e) => {
                    setNewCardConvId(e.target.value);
                    // Pre-fill card title if conversation is selected
                    const selectedConv = conversations.find(c => c.id === e.target.value);
                    const cust = selectedConv?.customer || customers.find(cu => cu.id === selectedConv?.customer_id);
                    if (cust && !newCardTitle) {
                      setNewCardTitle(cust.name);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                >
                  <option value="">Nenhuma conversa vinculada (Atendimento Manual)</option>
                  {conversations.map(c => {
                    const cust = c.customer || customers.find(cu => cu.id === c.customer_id);
                    const name = cust ? cust.name : 'Cliente desconhecido';
                    const phone = cust ? cust.phone : 'Sem número';
                    const lastMsg = c.last_message ? ` - ${c.last_message}` : '';
                    return (
                      <option key={c.id} value={c.id}>
                        {name} ({phone}){lastMsg.substring(0, 40)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Descrição do Negócio (Notas Iniciais)
                </label>
                <textarea
                  value={newCardDesc}
                  onChange={(e) => setNewCardDesc(e.target.value)}
                  placeholder="Ex: Demonstrou interesse no pacote do feriado, precisa confirmar acompanhantes..."
                  rows={2}
                  className="w-full px-3 py-1.5 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-705 placeholder-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Financial Value */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="number"
                    value={newCardValue}
                    onChange={(e) => setNewCardValue(parseFloat(e.target.value) || 0)}
                    placeholder="Ex: 5000"
                    className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Previsão de Fechamento / Vencimento
                  </label>
                  <input
                    type="date"
                    value={newCardDueDate}
                    onChange={(e) => setNewCardDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Operator Selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Operador Responsável
                  </label>
                  <select
                    value={newCardRespId}
                    onChange={(e) => setNewCardRespId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                  >
                    <option value="">Selecione o operador...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                {/* Campaign Origin */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Origem / Campanha do Lead
                  </label>
                  <input
                    type="text"
                    value={newCardCampaign}
                    onChange={(e) => setNewCardCampaign(e.target.value)}
                    placeholder="Ex: TRÁFEGO PAGO"
                    className="w-full px-3 py-2 text-xs border border-slate-250 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateCardModal(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 font-bold uppercase rounded-xl tracking-wide cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-xl tracking-wide cursor-pointer transition-all shadow-md"
                >
                  Criar e Vincular Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
