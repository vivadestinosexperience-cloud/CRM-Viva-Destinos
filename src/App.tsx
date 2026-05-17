/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import LoginPage from './pages/LoginPage';
import MainLayout from './layouts/MainLayout';
import OmnichannelPage from './pages/OmnichannelPage';
import CRMPage from './pages/CRMPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import UserProfilePage from './pages/UserProfilePage';
import { authService } from './services/authService';
import Logo from './components/Logo';
import { useAppStore } from './store/useAppStore';

import { Toaster } from 'sonner';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { appearance, initializeAppData } = useAppStore();

  useEffect(() => {
    const checkAuth = async () => {
      const { session } = await authService.getSession();
      const authed = !!session;
      setIsAuthenticated(authed);
      if (authed) {
        initializeAppData();
      }
    };
    checkAuth();
  }, [initializeAppData]);

  // Sync primary color and theme to CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', appearance.primaryColor);
    
    // Simple dark shade for focus/hover
    // Note: In a real app we might use a color library like 'tinycolor2'
    const darkShade = appearance.primaryColor.startsWith('#') 
      ? appearance.primaryColor + 'ee' 
      : appearance.primaryColor;
    document.documentElement.style.setProperty('--primary-color-dark', darkShade);

    // Theme handling
    if (appearance.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (appearance.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    }

    // Density handling
    if (appearance.density === 'compact') {
      document.body.classList.add('density-compact');
    } else {
      document.body.classList.remove('density-compact');
    }
  }, [appearance]);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white space-y-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Logo size="large" />
        </motion.div>
        <div className="flex flex-col items-center gap-3">
          <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-blue-600"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] animate-pulse">
            Carregando Viva Experience CRM...
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route 
          path="/login" 
          element={!isAuthenticated ? <LoginPage onLogin={handleLogin} /> : <Navigate to="/app/atendimentos" />} 
        />
        <Route 
          path="/app" 
          element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}
        >
          <Route index element={<Navigate to="atendimentos" />} />
          <Route path="atendimentos" element={<OmnichannelPage />} />
          <Route path="clientes/*" element={<CRMPage />} />
          <Route path="relatorios/atendimentos" element={<ReportsPage />} />
          <Route path="ajustes/*" element={<SettingsPage />} />
          <Route path="meu-perfil" element={<UserProfilePage />} />
          <Route path="*" element={<Navigate to="atendimentos" />} />
        </Route>
        <Route path="/" element={<Navigate to={isAuthenticated ? "/app" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}
