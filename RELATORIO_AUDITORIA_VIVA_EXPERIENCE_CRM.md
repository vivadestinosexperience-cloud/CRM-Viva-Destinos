# RELATORIO_AUDITORIA_VIVA_EXPERIENCE_CRM.md

Este documento apresenta uma auditoria técnica detalhada da aplicação **Viva Experience CRM**, desenvolvida para a agência **Viva Destinos Experience**.

---

## 1. ESTRUTURA DE ARQUIVOS

O projeto segue uma arquitetura React moderna com Vite, Tailwind CSS e Zustand para gerenciamento de estado.

### Diretórios Principais

- **src/**: Raiz do código fonte.
  - **components/**: Componentes reutilizáveis (ex: `Logo.tsx`). Atualmente possui poucos componentes genéricos, com a maior parte da UI definida diretamente nas páginas.
  - **pages/**: Telas principais da aplicação.
    - `OmnichannelPage.tsx`: Tela de atendimento centralizado (WhatsApp/Chat). Funcional para troca de mensagens e simulação de IA.
    - `CRMPage.tsx`: Gestão de contatos e funil (Status: Parcial/Mock).
    - `LoginPage.tsx`: Tela de autenticação inicial.
    - `TravelPage.tsx`: Gestão de viagens, cotações e reservas (Status: Parcial/Mock).
    - `UserProfilePage.tsx`: Perfil do usuário logado e preferências de interface.
    - **settings/**: Subdiretório com módulos de configuração (Usuários, Equipes, WhatsApp, etc.).
  - **layouts/**: Estrutura de navegação principal.
    - `MainLayout.tsx`: Sidebar e Header persistentes.
  - **services/**: Camada de comunicação com APIs.
    - `authService.ts`: Integração com Supabase Auth.
    - `dataService.ts`: CRUDs genéricos para tabelas do Supabase.
  - **store/**: Estado global.
    - `useAppStore.ts`: Centraliza dados persistentes (localStorage) usando Zustand.
  - **integrations/supabase/**: Configuração do cliente Supabase.
  - **data/**: Mock data para desenvolvimento inicial.
  - **types/**: Definições de interfaces TypeScript para toda a aplicação.

---

## 2. ROTAS CRIADAS

A navegação é gerenciada pelo `react-router-dom` no arquivo `App.tsx` e sub-rotas em `SettingsPage.tsx`.

| Caminho da Rota | Componente | Status | No Menu? | Navega? |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `LoginPage` | Funcional | N/A | Sim |
| `/app/atendimentos` | `OmnichannelPage` | Funcional | Sim | Sim |
| `/app/meu-perfil` | `UserProfilePage` | Funcional | Usuário | Sim |
| `/app/ajustes` | `SettingsHub` | Funcional | Sim | Sim |
| `/app/ajustes/usuarios` | `UsersSettingsPage` | Funcional (Zustand) | Sim | Sim |
| `/app/ajustes/equipes` | `TeamsSettingsPage` | Funcional (Zustand) | Sim | Sim |
| `/app/ajustes/filas` | `QueuesSettingsPage` | Funcional (Zustand) | Sim | Sim |
| `/app/ajustes/permissões` | `PermissionsSettingsPage` | Parcial (UI) | Sim | Sim |
| `/app/ajustes/integracoes` | `IntegrationsSettingsHub` | Parcial (UI) | Sim | Sim |
| `/app/ajustes/integracoes/whatsapp` | `WhatsAppSettingsPage` | Funcional (Simulado) | Sim | Sim |
| `/app/ajustes/conta` | `AccountSettingsPage` | Funcional (Aparência) | Sim | Sim |
| `/app/ajustes/notificacoes` | `NotificationSettingsPage` | Placeholder | Sim | Sim |
| `/app/ajustes/seguranca` | `SecuritySettingsPage` | Placeholder | Sim | Sim |
| `/app/ajustes/auditoria` | `AuditSettingsPage` | Placeholder | Sim | Sim |
| `/app/ajustes/webhooks` | `WebhookSettingsPage` | Placeholder | Sim | Sim |
| `/app/ajustes/ia` | `AISettingsPage` | Parcial (Config) | Sim | Sim |
| `/app/crm/contatos` | `CRMPage` | Parcial (Mock) | Sim | Sim |
| `/app/crm/funil` | `CRMPage` | Parcial (Mock) | Sim | Sim |
| `/app/viagens/cotacoes` | `TravelPage` | Parcial (Mock) | Sim | Sim |
| `/app/viagens/reservas` | `TravelPage` | Parcial (Mock) | Sim | Sim |

**Rotas Faltantes ou em Placeholder:**
- CRM: Carteiras, Contatos avançados.
- Viagens: Destinos, Fornecedores.
- Automações: Campanhas, Chatbot, Sequências, Mensagens Agendadas, Modelos.
- Relatórios: Indicadores, Atendimentos, Viagens, WhatsApp.

---

## 3. BOTÕES E AÇÕES

### Menu Usuário (MainLayout)
- **Meu Perfil**: Navega para `/app/meu-perfil`. (OK)
- **Configurações**: Navega para `/app/ajustes`. (OK)
- **Sair**: Chama `authService.signOut()`. (OK)

### Meu Perfil (UserProfilePage)
- **Editar Informações**: Abre Modal. Salva no Zustand. (Funcional)
- **Alterar Senha**: Abre Modal. Simulação com toast. (Parcial)
- **Salvar Preferências**: Salva Tema/Densidade no Zustand. (Funcional)

### Conta & Aparência (AccountSettingsPage)
- **Alterar Logo**: Prompt para URL. Atualiza globalmente. (Funcional)
- **Cor Principal**: Seleção de cores. Atualiza CSS Variables. (Funcional)
- **Tema (Claro/Escuro)**: Altera classe `dark` no HTML. (Funcional)
- **Densidade**: Altera classes de espaçamento. (Funcional)

### Usuários (UsersSettingsPage)
- **Criar usuário**: Abre modal, adiciona ao Zustand. (Funcional)
- **Excluir**: Remove do Zustand. (Funcional)
- **Editar**: Abre modal com dados preenchidos. (Funcional)

### WhatsApp (WhatsAppSettingsPage)
- **Conectar Novo**: Abre modal de seleção (Oficial/QR). (Funcional)
- **Simular Conexão**: Gera status "CONNECTED" via mock. (Funcional)
- **Remover**: Exclui conta do Zustand. (Funcional)

---

## 4. CAMPOS E FORMULÁRIOS

| Formulário | Página | Campos Principais | Persistência | Validação |
| :--- | :--- | :--- | :--- | :--- |
| **Login** | `LoginPage` | Email, Senha | Supabase Auth | Básica |
| **Novo Usuário** | `UsersSettingsPage` | Nome, Email, Role, Equipe | Zustand | Básica |
| **Perfil** | `UserProfilePage` | Nome, Telefone, Avatar | Zustand | Básica |
| **Aparência** | `AccountSettingsPage` | Logo, Cor, Tema, Menu | Zustand | Reativa |
| **Nova Equipe** | `TeamsSettingsPage` | Nome, Gestor | Zustand | Básica |
| **Nova Fila** | `QueuesSettingsPage` | Nome, Cor | Zustand | Básica |

**Problemas:**
- A maioria das validações são apenas de campos obrigatórios (`required`).
- Não há feedback de erro detalhado vindo do backend em muitos formulários.

---

## 5. ESTADO GLOBAL E PERSISTÊNCIA

A aplicação utiliza **Zustand** com o middleware **persist** (`viva-crm-storage`).

- **Onde ficam os dados?**
  - **Usuários, Equipes, Filas, WhatsApps, Conversas, Mensagens:** Todos residem no `useAppStore.ts` e são persistidos no **localStorage**.
- **Supabase vs Zustand:**
  - Existe um conflito de arquitetura. Alguns componentes tentam buscar dados do Supabase, mas no final acabam lendo o estado global do Zustand que é inicializado com `MOCK_DATA`.
- **Persistência ao recarregar:** Sim, os dados alterados via interface permanecem após o F5 devido ao localStorage.

---

## 6. SUPABASE

- **Client:** Localizado em `src/integrations/supabase/client.ts`.
- **Services:** `authService.ts` (Login/Logout) e `dataService.ts` (Generic CRUD).
- **Status da Integração:** **Incompleta**. O login funciona via Supabase, mas a gestão de dados (mensagens, clientes, equipes) está rodando via Estado Global (Zustand) para visualização imediata, ignorando o banco de dados em tempo real em muitas telas.
- **Segurança:** Não foram encontradas chaves sensíveis expostas hardcoded nos arquivos auditados (usan-se variáveis de ambiente).

---

## 7. INTEGRAÇÃO WHATSAPP

- **Módulo:** `WhatsAppSettingsPage.tsx`
- **Funcionalidades:**
  - Lista de contas conectadas: **Funcional** (Zustand).
  - Botão Conectar: **Funcional**, abre modal.
  - Simulação de QR Code: **Funcional**, gera feedback visual.
  - Sincronização: **Visual/Mock**.
- **Atendimento:** Os números conectados aparecem corretamente no filtro de envio da `OmnichannelPage.tsx`.

---

## 8. CONFIGURAÇÕES E APARÊNCIA

- **Meu Perfil**: Completo e funcional.
- **Aparência (Conta)**: O sistema de temas (Dark/Light) e a cor customizada via CSS Variable (`--primary-color`) estão 100% integrados no root (`App.tsx`).
- **Navegação**: O estilo do menu (compacto/expandido) altera o comportamento da sidebar corretamente.

---

## 9. PRINCIPAIS PROBLEMAS ENCONTRADOS

1. **Problema: Arquitetura Híbrida Confusa (Supabase vs Zustand)**
   - **Arquivo:** `src/store/useAppStore.ts` e `src/services/dataService.ts`
   - **Impacto:** Os dados salvos no Estado Global não estão sendo sincronizados com o banco de dados real. Se outro usuário logar, ele verá os mocks, não os dados criados.
   - **Como corrigir:** Implementar hooks de sincronização nos services para atualizar o Zustand após chamadas ao Supabase.

2. **Problema: Páginas de Automação e Relatórios Vazias**
   - **Arquivo:** `src/pages/AutomationsPage.tsx`, `src/pages/ReportsPage.tsx`
   - **Impacto:** Experiência do usuário incompleta.
   - **Como corrigir:** Desenvolver os módulos básicos de Campanhas e Indicadores de Atendimento.

3. **Problema: Cadastro de Cliente Inexistente na Omnichannel**
   - **Arquivo:** `src/pages/OmnichannelPage.tsx`
   - **Impacto:** No modal "Nova Conversa", o usuário só pode selecionar clientes pré-existentes.
   - **Como corrigir:** Adicionar funcionalidade de "Criar Cliente" diretamente no modal de nova conversa.

4. **Problema: Falta de Real-time verdadeiro**
   - **Arquivo:** `src/pages/OmnichannelPage.tsx`
   - **Impacto:** Mensagens novas só aparecem se o usuário estiver na tela e o Zustand for atualizado localmente.
   - **Como corrigir:** Ativar o listener do Supabase real-time dentro do store ou da página.

---

## 10. PRIORIDADE DE CORREÇÃO

**Fase 1: Estabilização de Dados & Autenticação**
- Sincronizar Zustand com Supabase para Usuários e Equipes.
- Garantir que o `currentUser` venha da sessão do Supabase.

**Fase 2: Expansão de Atendimentos**
- Terminar ações de "Transferir" e "Agendar Retomada".
- Implementar histórico real de mensagens via banco de dados.

**Fase 3: Módulos de Viagens e CRM**
- Criar a UI real para Cotações e Reservas (atualmente placeholders).
- Vincular contatos do CRM com as conversas do WhatsApp.

**Fase 4: Automações e Inteligência**
- Conectar o Assistente IA com a API oficial do Gemini de forma persistente.
- Criar criador de modelos de mensagens (Templates).

---

## 11. TABELA FINAL DE STATUS

| Módulo | Criado? | Funcional? | Problema principal | Prioridade |
| :--- | :--- | :--- | :--- | :--- |
| **Login** | Sim | Sim | Nenhum | Baixa |
| **Atendimentos** | Sim | Parcial | Não sincroniza com DB | **Alta** |
| **WhatsApp** | Sim | Visual | É apenas simulação | Média |
| **Usuários** | Sim | Sim | Local apenas | Média |
| **Equipes** | Sim | Sim | Local apenas | Média |
| **Filas** | Sim | Sim | Local apenas | Média |
| **CRM** | Sim | Não | Placeholder/Mocks | Média |
| **Viagens** | Sim | Não | Placeholder/Mocks | **Alta** |
| **IA** | Sim | Parcial | Simulação no frontend | Baixa |
| **Aparência** | Sim | Sim | OK | Baixa |
| **Relatórios** | Sim | Não | Não iniciado | Baixa |

---
**Auditoria finalizada em:** 17 de Maio de 2026.
**Auditor:** AI Coding Agent.
