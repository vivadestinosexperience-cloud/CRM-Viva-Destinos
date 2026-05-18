import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getErrorMessage } from '../utils/getErrorMessage';

export default function DebugPage() {
  const { whatsAppAccounts } = useAppStore();
  const [configStatus, setConfigStatus] = useState<any>(null);
  const [debugLog, setDebugLog] = useState<any>(null);

  useEffect(() => {
    fetch('/api/zapi/config-status')
      .then(res => res.json())
      .then(setConfigStatus)
      .catch(err => setConfigStatus({ error: getErrorMessage(err) }));

    fetch('/api/zapi/debug-config')
      .then(res => res.json())
      .then(setDebugLog)
      .catch(err => setDebugLog({ error: getErrorMessage(err) }));
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="p-10 text-center">
        <h1 className="text-2xl font-bold">Acesso Restrito</h1>
        <p>Este painel está disponível apenas em ambiente de desenvolvimento.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-mono text-xs">
      <header>
        <h1 className="text-2xl font-bold uppercase tracking-widest border-b-4 border-slate-800 pb-2">DEBUG PANEL</h1>
        <p className="text-slate-500 mt-2">Ambiente: {process.env.NODE_ENV}</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-bold bg-slate-800 text-white px-4 py-1">Supabase Status</h2>
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
           <p>Connected: {window.location.hostname !== 'localhost' ? 'CLOUD' : 'LOCAL'}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold bg-slate-800 text-white px-4 py-1">Z-API Config Status</h2>
        <pre className="bg-slate-900 text-emerald-400 p-6 rounded-xl overflow-auto shadow-2xl">
          {JSON.stringify(configStatus, null, 2)}
        </pre>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold bg-slate-800 text-white px-4 py-1">Z-API Debug Config</h2>
        <pre className="bg-slate-900 text-blue-400 p-6 rounded-xl overflow-auto shadow-2xl">
          {JSON.stringify(debugLog, null, 2)}
        </pre>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold bg-slate-800 text-white px-4 py-1">Canais na Store</h2>
        <pre className="bg-slate-900 text-amber-400 p-6 rounded-xl overflow-auto shadow-2xl">
          {JSON.stringify(whatsAppAccounts, null, 2)}
        </pre>
      </section>
    </div>
  );
}
