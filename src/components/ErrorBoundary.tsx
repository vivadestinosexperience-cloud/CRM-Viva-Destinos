import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, MessageSquare } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/app/atendimentos';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-10 text-center space-y-8">
            <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto text-amber-500 shadow-inner">
              <AlertTriangle className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-800">Algo deu errado</h1>
              <p className="text-slate-500">
                A aplicação encontrou um erro inesperado nesta tela.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar página
              </button>
              
              <button 
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-6 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95"
              >
                <MessageSquare className="w-4 h-4" />
                Voltar para Atendimentos
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="pt-6 border-t border-slate-50 text-left">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Detalhes Técnicos</p>
                <pre className="bg-slate-50 p-4 rounded-xl text-[10px] text-slate-500 overflow-auto max-h-40 font-mono">
                  {this.state.error.toString()}
                  {"\n"}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
