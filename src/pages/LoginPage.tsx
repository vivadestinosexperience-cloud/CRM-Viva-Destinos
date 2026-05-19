/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { authService } from '../services/authService';
import { toast } from 'sonner';
import Logo from '../components/Logo';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('admin@viva.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPasswords, setNewPasswords] = useState({ password: '', confirm: '' });
  const [tempUserId, setTempUserId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await authService.signIn(email, password);
    
    if (error) {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
      setLoading(false);
    } else if (data?.user) {
      // Check if user must change password
      const { user } = await authService.getCurrentUser();
      if (user?.profile?.must_change_password) {
        setMustChangePassword(true);
        setTempUserId(user.id);
        setLoading(false);
      } else {
        onLogin();
      }
    } else {
       setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswords.password !== newPasswords.confirm) {
      toast.error("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_user_id: tempUserId, password: newPasswords.password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha');
      
      toast.success("Senha alterada com sucesso! Bem-vindo.");
      onLogin();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-center">
          <Logo size="large" className="mb-6 mx-auto" />
          <h1 className="text-xl font-bold text-slate-800 tracking-tight mb-2 uppercase tracking-widest">Alterar Sua Senha</h1>
          <p className="text-slate-400 text-xs mb-8 uppercase tracking-widest leading-relaxed">Você recebeu uma senha provisória e precisa cadastrar uma nova senha segura para continuar.</p>
          
          <form onSubmit={handleChangePassword} className="space-y-4 text-left">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-2">Nova Senha</label>
              <input 
                type="password" 
                required
                className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-medium"
                placeholder="Mínimo 8 caracteres"
                value={newPasswords.password}
                onChange={(e) => setNewPasswords({...newPasswords, password: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-2">Confirmar Nova Senha</label>
              <input 
                type="password" 
                required
                className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-medium"
                placeholder="Repita a nova senha"
                value={newPasswords.confirm}
                onChange={(e) => setNewPasswords({...newPasswords, confirm: e.target.value})}
              />
            </div>
            <button 
              disabled={loading}
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Salvar e Acessar CRM'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden opacity-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500 rounded-full blur-3xl -ml-48 -mb-48"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 relative z-10 border border-slate-100"
      >
        <div className="text-center mb-10 flex flex-col items-center">
          <Logo size="large" className="mb-6" />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Acesse o Viva Experience CRM</h1>
          <p className="text-slate-500 mt-2 text-sm">Acesse a central omnichannel da sua agência</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-bold flex items-center gap-2 animate-shake">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
            <input 
              type="email" 
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Senha</label>
              <button 
                type="button"
                onClick={() => toast.info('Entre em contato com o administrador para resets de senha via painel Supabase.')}
                className="text-sm text-blue-600 hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
            <input 
              type="password" 
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
          >
            Entrar no CRM
          </button>
        </form>

        <div className="mt-8 pt-6 border-top border-slate-100 text-center">
          <p className="text-sm text-slate-400">
            Viva Destinos Experience &copy; 2026<br/>
            Gestão inteligente de viagens e atendimentos
          </p>
        </div>
      </motion.div>
    </div>
  );
}
