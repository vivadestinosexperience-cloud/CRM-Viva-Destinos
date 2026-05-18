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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await authService.signIn(email, password);
    
    if (error) {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
    } else {
      onLogin();
    }
    
    setLoading(false);
  };

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
