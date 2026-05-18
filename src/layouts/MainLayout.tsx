/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  MessageSquare, 
  Users, 
  Plane, 
  Zap, 
  BarChart3, 
  Settings, 
  Bell, 
  Search, 
  ChevronDown, 
  LogOut,
  User as UserIcon,
  Globe,
  Briefcase
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { motion, AnimatePresence } from 'motion/react';
import { authService } from '../services/authService';
import { safeAction } from '../utils/safeAction';
import Logo from '../components/Logo';
import { InternalChatDrawer } from '../components/internal-chat/InternalChatDrawer';

export default function MainLayout() {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { currentUser, users } = useAppStore();
  const [selectedInternalUserId, setSelectedInternalUserId] = useState<string | null>(null);

  if (!currentUser) return null;

  const activeUsers = users.filter(u => u.active && u.id !== currentUser.id);

  const handleLogout = async () => {
    await safeAction(async () => {
      await authService.signOut();
      window.location.reload(); 
    }, { label: 'Erro ao sair do sistema' });
  };

  const navItems = [
    { name: 'Atendimentos', icon: MessageSquare, path: '/app/atendimentos' },
    { name: 'Campanhas', icon: Zap, path: '/app/campanhas' },
    { name: 'Clientes', icon: Users, path: '/app/clientes' },
    { name: 'Relatórios', icon: BarChart3, path: '/app/relatorios/atendimentos' },
    { 
      name: 'Configurações', 
      icon: Settings, 
      path: '/app/ajustes',
      subItems: [
        { name: 'Usuários', path: '/app/ajustes/usuarios' },
        { name: 'Equipes', path: '/app/ajustes/equipes' },
        { name: 'Permissões', path: '/app/ajustes/permissoes' },
        { name: 'Canais de atendimento', path: '/app/ajustes/canais' },
        { name: 'Conta', path: '/app/ajustes/conta' },
        { name: 'Aparência', path: '/app/ajustes/aparencia' },
      ]
    },
  ];

  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Configurações']);

  const toggleMenu = (name: string) => {
    setExpandedMenus(prev => 
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Main Sidebar */}
      <aside className="w-20 lg:w-64 bg-white border-r border-slate-200 flex flex-col transition-all">
        <div className="p-6">
          <Logo size="small" />
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedMenus.includes(item.name);

            return (
              <div key={item.path} className="space-y-1">
                <NavLink
                  to={item.path}
                  end={item.path === '/app/ajustes'}
                  className={({ isActive }) => `
                    flex items-center justify-between px-3 py-3 rounded-xl transition-all group
                    ${isActive 
                      ? 'bg-blue-50 text-blue-600 shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
                  `}
                  onClick={(e) => {
                    if (hasSubItems) {
                      // If it's a mobile/collapsed view, we might want different behavior, 
                      // but for now let's just toggle the menu expansion.
                      toggleMenu(item.name);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    <span className="hidden lg:block font-medium">{item.name}</span>
                  </div>
                  {hasSubItems && (
                    <ChevronDown className={`w-4 h-4 transition-transform hidden lg:block ${isExpanded ? 'rotate-180' : ''}`} />
                  )}
                </NavLink>

                {hasSubItems && isExpanded && (
                  <div className="hidden lg:block pl-11 space-y-1">
                    {item.subItems.map(sub => (
                      <NavLink
                        key={sub.path}
                        to={sub.path}
                        className={({ isActive }) => `
                          block py-2 text-xs font-bold transition-all
                          ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}
                        `}
                      >
                        {sub.name}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
           <NavLink
              to="/app/ajustes/conta"
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all"
            >
              <Globe className="w-5 h-5" />
              <span className="hidden lg:block font-medium">Viva Destinos</span>
            </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar clientes ou mensagens..." 
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            <button className="relative p-2.5 text-slate-500 hover:bg-slate-50 rounded-xl transition-all">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>

            <div className="relative">
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 p-1 text-left hover:bg-slate-50 rounded-xl transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold overflow-hidden border-2 border-white shadow-sm ring-1 ring-slate-100">
                  {currentUser.avatar ? <img src={currentUser.avatar} alt={currentUser.name} /> : currentUser.name.charAt(0)}
                </div>
                <div className="hidden lg:block pr-2">
                  <p className="text-sm font-bold text-slate-800 leading-tight">{currentUser.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{currentUser.role} • ONLINE</p>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform hidden lg:block ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isUserMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 py-2 z-50"
                  >
                    <div className="px-4 py-3 border-b border-slate-50">
                      <p className="text-xs text-slate-400 font-medium">CONTA</p>
                    </div>
                    <button 
                      onClick={() => { navigate('/app/meu-perfil'); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 transition-all text-left"
                    >
                      <UserIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">Meu Perfil</span>
                    </button>
                    <button 
                      onClick={() => { navigate('/app/ajustes'); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 transition-all text-left"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="text-sm font-medium">Configurações</span>
                    </button>
                    <div className="h-px bg-slate-50 my-1"></div>
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-all font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm">Sair</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {/* Internal Chat Rail */}
      <aside className="w-16 bg-white border-l border-slate-200 hidden xl:flex flex-col items-center py-6 gap-4">
        <button 
          onClick={() => setSelectedInternalUserId('LIST')}
          className="p-3 mb-2 text-slate-400 hover:bg-slate-50 hover:text-blue-500 rounded-2xl transition-all shadow-sm border border-slate-100 group"
          title="Lista de Contatos Internos"
        >
          <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
        {activeUsers.map((user) => (
          <button 
            key={user.id} 
            onClick={() => setSelectedInternalUserId(user.id)}
            className="relative group cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold border-2 ${user.online ? 'border-emerald-100' : 'border-transparent'}`}>
              {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover rounded-xl" /> : user.name.charAt(0)}
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${
              user.online ? 'bg-emerald-500' : 'bg-slate-300'
            }`}></span>
            
            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-medium tracking-wide shadow-lg z-50">
              {user.name} • {user.role}
            </div>
          </button>
        ))}
        {activeUsers.length === 0 && (
          <p className="text-[8px] text-slate-400 text-center px-1">Nenhum usuário online</p>
        )}
      </aside>

      {/* Internal Chat Drawer */}
      <InternalChatDrawer 
        userId={selectedInternalUserId} 
        onClose={() => setSelectedInternalUserId(null)} 
      />
    </div>
  );
}
