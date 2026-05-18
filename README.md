# Viva Experience CRM

Omnichannel CRM desenvolvido para a agência **Viva Destinos Experience**.

## 🚀 Tecnologias
- **Frontend:** React (Vite), TypeScript, Tailwind CSS, Framer Motion, Zustand.
- **Backend:** Node.js (Express), Gemini API (AI), Supabase (Auth & Database).
- **Integrações:** WhatsApp Cloud API, QR Provider, AI para resumos e sugestões.

## 🛠️ Funcionalidades
- **Omnichannel:** Gestão de chats de múltiplos canais de WhatsApp.
- **CRM de Clientes:** Base centralizada de leads com histórico e qualificação.
- **Chat Interno:** Comunicação em tempo real entre colaboradores.
- **Gestão de Equipes:** Organização de atendimentos por setores/equipes.
- **IA Integrada:** Resumos automáticos, classificação de leads e sugestão de respostas.

## ⚙️ Configuração
1. Clone o repositório.
2. Instale as dependências: `npm install`.
3. Configure o arquivo `.env` (veja `.env.example`).
4. Execute em modo desenvolvimento: `npm run dev`.

## 📦 Variáveis de Ambiente
- `VITE_SUPABASE_URL`: URL do projeto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Chave pública do Supabase.
- `GEMINI_API_KEY`: Chave da API Gemini (apenas backend).
- `META_WHATSAPP_VERIFY_TOKEN`: Token para verificação de webhooks Meta.

## 🤝 Contribuição
Projeto desenvolvido como core da operação digital da Viva Destinos.
