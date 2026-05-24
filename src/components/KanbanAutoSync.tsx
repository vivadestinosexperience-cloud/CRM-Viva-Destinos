import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getBoards, getCards, createCard } from '../services/kanbanService';
import { toast } from 'sonner';

export default function KanbanAutoSync() {
  const { conversations, currentUser } = useAppStore();
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser || !conversations || conversations.length === 0) return;

    const listBoards = getBoards();
    // Locate the RESERVAS VIVA board
    const board = listBoards.find(b => b.id === 'reservas-viva');
    if (!board || board.stages.length === 0) return;

    const listCards = getCards();
    let updatedAny = false;

    conversations.forEach(conv => {
      // Basic check to ensure valid data
      if (!conv.id) return;

      // If already processed in this component instance session, skip
      if (processedRef.current.has(conv.id)) return;

      // Check if a card already exists in local storage for this conversation
      const cardExists = listCards.some(card => card.conversation_id === conv.id);
      
      if (!cardExists) {
        // Register it immediately in the processed set so we don't duplicate
        processedRef.current.add(conv.id);

        try {
          // Auto-create Kanban CRM Card
          const firstStage = board.stages[0]; // "DEMONSTROU INTERESSE"
          
          const nameField = conv.customer?.name || 'Novo Cliente Ativo';
          const tagNames = conv.tags ? conv.tags.map(t => t.name) : [];
          
          const newCard = createCard({
            board_id: board.id,
            stage_id: firstStage.id,
            title: nameField,
            description: `Card gerado automaticamente pelo atendimento de "${nameField}".`,
            conversation_id: conv.id,
            customer_id: conv.customer_id || undefined,
            responsible_id: conv.assigned_user_id || currentUser.id || undefined,
            tags: tagNames,
            value: 0
          });

          updatedAny = true;
          console.log(`[KanbanAutoSync] Created automatic card "${newCard.title}" (${newCard.code})`);
          toast.info(`Card CRM "${newCard.title}" criado automaticamente no painel RESERVAS VIVA.`);
        } catch (e) {
          console.error('[KanbanAutoSync] Error auto-creating card', e);
        }
      } else {
        // Even if it exists, mark it as processed in session to keep things fast
        processedRef.current.add(conv.id);
      }
    });

    if (updatedAny) {
      // Notify active components (like KanbanPage and OmnichannelPage sidebars) to redraw
      window.dispatchEvent(new CustomEvent('viva_crm_kanban_updated'));
    }
  }, [conversations, currentUser]);

  return null;
}
