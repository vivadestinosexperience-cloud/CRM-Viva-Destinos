import { KanbanBoard, KanbanCard, KanbanCardNote, KanbanStage } from '../types';

const BOARDS_KEY = 'viva_crm_kanban_boards';
const CARDS_KEY = 'viva_crm_kanban_cards';

// Predefined default boards to make the system fully functional and ready-to-use
const DEFAULT_BOARDS: KanbanBoard[] = [
  {
    id: 'reservas-viva',
    name: 'RESERVAS VIVA DESTINOS EXPERIENCE',
    description: 'Painel de Reservas e Vendas de Experiências',
    is_pinned: true,
    created_at: new Date('2026-05-12T10:00:00Z').toISOString(),
    stages: [
      { id: 'reservas-viva-interesse', name: 'DEMONSTROU INTERESSE', order: 1, color: 'emerald' },
      { id: 'reservas-viva-andamento', name: 'EM ANDAMENTO', order: 2, color: 'blue' },
      { id: 'reservas-viva-efetuada', name: 'RESERVA EFETUADA', order: 3, color: 'green' },
      { id: 'reservas-viva-perdida', name: 'RESERVA PERDIDA', order: 4, color: 'red' },
    ]
  }
];

export const getBoards = (): KanbanBoard[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(BOARDS_KEY);
  if (!stored) {
    localStorage.setItem(BOARDS_KEY, JSON.stringify(DEFAULT_BOARDS));
    return DEFAULT_BOARDS;
  }
  try {
    const list = JSON.parse(stored);
    // Auto-migration: if user still has the old default boards, replace or modify them to matches user request
    const hasOldVendaTitulos = list.some((b: any) => b.id === 'venda-titulos');
    const hasOldMiniVac = list.some((b: any) => b.id === 'mini-vac' && b.name.includes('MINI-VAC'));
    if (hasOldVendaTitulos || hasOldMiniVac) {
      // Perform clean migration to align with user's explicit instructions
      const migrated = list
        .filter((b: any) => b.id !== 'venda-titulos') // deleted Venda de Titulos
        .map((b: any) => {
          if (b.id === 'mini-vac') {
            return {
              ...b,
              id: 'reservas-viva',
              name: 'RESERVAS VIVA DESTINOS EXPERIENCE',
              description: 'Painel de Reservas e Vendas de Experiências',
              stages: [
                { id: 'reservas-viva-interesse', name: 'DEMONSTROU INTERESSE', order: 1, color: 'emerald' },
                { id: 'reservas-viva-andamento', name: 'EM ANDAMENTO', order: 2, color: 'blue' },
                { id: 'reservas-viva-efetuada', name: 'RESERVA EFETUADA', order: 3, color: 'green' },
                { id: 'reservas-viva-perdida', name: 'RESERVA PERDIDA', order: 4, color: 'red' },
              ]
            };
          }
          return b;
        });
      
      // If we don't have 'reservas-viva' at all after filtering, append it
      if (!migrated.some((b: any) => b.id === 'reservas-viva')) {
        migrated.unshift(DEFAULT_BOARDS[0]);
      }
      
      localStorage.setItem(BOARDS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return list;
  } catch (e) {
    return DEFAULT_BOARDS;
  }
};

export const saveBoards = (boards: KanbanBoard[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
};

export const getCards = (): KanbanCard[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(CARDS_KEY);
  if (!stored) {
    return [];
  }
  try {
    const list = JSON.parse(stored) as KanbanCard[];
    const seen = new Set<string>();
    let modified = false;
    const sanitized = list.map(c => {
      if (!c.id || seen.has(c.id)) {
        c.id = `card-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        modified = true;
      }
      seen.add(c.id);
      return c;
    });
    if (modified) {
      saveCards(sanitized);
    }
    return sanitized;
  } catch (e) {
    return [];
  }
};

export const saveCards = (cards: KanbanCard[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
};

export const createBoard = (name: string, description: string, stages: string[]): KanbanBoard => {
  const boards = getBoards();
  const newBoard: KanbanBoard = {
    id: `board-${Date.now()}`,
    name,
    description,
    created_at: new Date().toISOString(),
    stages: stages.map((stageName, idx) => ({
      id: `stage-${Date.now()}-${idx}`,
      name: stageName.trim(),
      order: idx + 1,
      color: ['blue', 'emerald', 'amber', 'purple', 'rose', 'indigo', 'slate'][idx % 7]
    }))
  };
  boards.push(newBoard);
  saveBoards(boards);
  return newBoard;
};

export const updateBoardStages = (boardId: string, updatedStages: KanbanStage[]): KanbanBoard | null => {
  const boards = getBoards();
  const index = boards.findIndex((b) => b.id === boardId);
  if (index === -1) return null;
  
  boards[index].stages = updatedStages;
  saveBoards(boards);
  return boards[index];
};

export const deleteBoard = (boardId: string): void => {
  const boards = getBoards();
  const updated = boards.filter((b) => b.id !== boardId);
  saveBoards(updated);

  // Also remove cards belonging to this board
  const cards = getCards();
  const remainingCards = cards.filter((c) => c.board_id !== boardId);
  saveCards(remainingCards);
};

export const createCard = (cardData: Omit<KanbanCard, 'id' | 'code' | 'created_at' | 'updated_at'>): KanbanCard => {
  const cards = getCards();
  
  // Generate a random code like VIV-17794 or CRM-12034 based on the board ID
  const prefix = cardData.board_id === 'reservas-viva' ? 'VIV' : 'CRM';
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const code = `${prefix}-${randomNum}`;

  const newCard: KanbanCard = {
    ...cardData,
    id: `card-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    code,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: []
  };

  cards.push(newCard);
  saveCards(cards);
  return newCard;
};

export const updateCard = (card: KanbanCard): KanbanCard => {
  const cards = getCards();
  const index = cards.findIndex((c) => c.id === card.id);
  const updatedCard = {
    ...card,
    updated_at: new Date().toISOString()
  };

  if (index !== -1) {
    cards[index] = updatedCard;
  } else {
    cards.push(updatedCard);
  }
  saveCards(cards);
  
  // Dispatch a custom event to notify components that are listening for updates
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent('viva_crm_kanban_updated'));
  }

  return updatedCard;
};

export const deleteCard = (cardId: string): void => {
  const cards = getCards();
  const updated = cards.filter((c) => c.id !== cardId);
  saveCards(updated);
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent('viva_crm_kanban_updated'));
  }
};

export const addCardNote = (cardId: string, content: string, createdByName: string): KanbanCardNote => {
  const cards = getCards();
  const cardIndex = cards.findIndex((c) => c.id === cardId);
  
  const newNote: KanbanCardNote = {
    id: `note-${Date.now()}`,
    card_id: cardId,
    content,
    created_by_name: createdByName,
    created_at: new Date().toISOString()
  };

  if (cardIndex !== -1) {
    const card = cards[cardIndex];
    if (!card.notes) card.notes = [];
    card.notes.unshift(newNote); // newest first
    card.updated_at = new Date().toISOString();
    cards[cardIndex] = card;
    saveCards(cards);
  }
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent('viva_crm_kanban_updated'));
  }

  return newNote;
};
