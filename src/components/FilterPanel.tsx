import React from 'react';
import { X, Tag, User, LayoutGrid, SlidersHorizontal, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Team, Tag as TagType, WhatsAppAccount, User as UserType } from '../types';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  tags: TagType[];
  accounts: WhatsAppAccount[];
  users: UserType[];
  selectedTagIds: string[];
  setSelectedTagIds: (ids: string[]) => void;
  selectedAccountIds: string[];
  setSelectedAccountIds: (ids: string[]) => void;
  selectedUserIds: string[];
  setSelectedUserIds: (ids: string[]) => void;
  tagSearch: string;
  setTagSearch: (s: string) => void;
}

export function FilterPanel({
  isOpen,
  onClose,
  teams,
  tags,
  accounts,
  users,
  selectedTagIds,
  setSelectedTagIds,
  selectedAccountIds,
  setSelectedAccountIds,
  selectedUserIds,
  setSelectedUserIds,
  tagSearch,
  setTagSearch,
}: FilterPanelProps) {
  if (!isOpen) return null;

  const toggleFilter = (list: string[], setList: (l: string[]) => void, id: string) => {
    if (list.includes(id)) {
      setList(list.filter(i => i !== id));
    } else {
      setList([...list, id]);
    }
  };

  const filteredTags = tags.filter(t => (t.is_active !== false) && t.name.toLowerCase().includes(tagSearch.toLowerCase()));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[50] flex justify-end">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        />
        <motion.div 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-80 md:w-96 bg-white h-full shadow-2xl flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-blue-600" />
              Filtros Avançados
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* Canais */}
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <LayoutGrid className="w-3.5 h-3.5" /> Canais
              </h3>
              <div className="space-y-1.5">
                {accounts.map(acc => (
                  <button 
                    key={acc.id}
                    onClick={() => toggleFilter(selectedAccountIds, setSelectedAccountIds, acc.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${selectedAccountIds.includes(acc.id) ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm font-bold">{acc.name}</span>
                    </div>
                    {selectedAccountIds.includes(acc.id) && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </section>

            {/* Etiquetas */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" /> Etiquetas
                </h3>
                {selectedTagIds.length > 0 && (
                  <button 
                    onClick={() => setSelectedTagIds([])}
                    className="text-[10px] font-black uppercase text-red-500 hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
              
              <input 
                type="text" 
                placeholder="Buscar etiqueta..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs mb-3 outline-none focus:ring-2 focus:ring-blue-500"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
              />

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {filteredTags.map(tag => (
                  <button 
                    key={tag.id}
                    onClick={() => toggleFilter(selectedTagIds, setSelectedTagIds, tag.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${selectedTagIds.includes(tag.id) ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: tag.color }} />
                      <span className="text-sm font-bold">{tag.name}</span>
                    </div>
                    {selectedTagIds.includes(tag.id) && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </section>

            {/* Atendentes */}
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Atendentes
              </h3>
              <div className="space-y-1.5">
                {users.filter(u => u.active !== false).map(user => (
                  <button 
                    key={user.id}
                    onClick={() => toggleFilter(selectedUserIds, setSelectedUserIds, user.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${selectedUserIds.includes(user.id) ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black">
                        {user.name.charAt(0)}
                      </div>
                      <span className="text-sm font-bold">{user.name}</span>
                    </div>
                    {selectedUserIds.includes(user.id) && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
            <button 
              onClick={() => {
                setSelectedTagIds([]);
                setSelectedAccountIds([]);
                setSelectedUserIds([]);
              }}
              className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
            >
              Resetar
            </button>
            <button 
              onClick={onClose}
              className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white bg-blue-600 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
            >
              Aplicar Filtros
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
