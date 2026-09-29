# Doca — React + TypeScript + Supabase

Versão em stack React da SaaS Doca (operação de base franqueada J&T). Reescrita a partir do artifact
original em HTML/JS puro, mantendo toda a funcionalidade: upload das planilhas do JMS, painel do dia,
histórico e ranking, conferência de carga por câmera, fechamento de pagamento, ocorrências/clientes,
alertas de SLA, motoristas, múltiplas bases e exportações.

## Stack

- **React 19 + TypeScript + Vite**
- **Supabase** (Postgres + Auth + RLS) como backend — multiusuário, sincroniza entre dispositivos
- **ExcelJS** para ler as planilhas .xlsx/.csv do JMS (carregado sob demanda)
- **html5-qrcode** para a conferência de carga pela câmera (carregado sob demanda)
- **jsPDF** para exportar o fechamento em PDF (carregado sob demanda)
- Design inspirado no visual da Apple (mesmo sistema visual do artifact publicado)

## Rodando localmente

```bash
npm install
cp .env.example .env   # já vem preenchido com o projeto Supabase "Doca" criado para você
npm run dev
```

Abre em `http://localhost:5173`. Crie uma conta (e-mail/senha) na primeira tela — o Supabase Auth cuida
do cadastro e login.

## Banco de dados (Supabase)

Já criei e configurei um projeto Supabase chamado **Doca** (projeto separado do seu "J&T Hub", que é
outro produto — o hub de revenda de fretes):

- URL: `https://zpvbhwzoxmqtzghjicqf.supabase.co`
- Projeto na organização `sultujisatpnmcwhwvjv`, região `sa-east-1` (São Paulo)
- Tabelas: `bases`, `base_members`, `drivers`, `days` (histórico), `occurrences`, `payouts`
- Row Level Security ativado em tudo: cada usuário só vê as bases das quais é membro
  (`owner`/`editor`/`viewer`, papel gerenciado em `base_members`)
- Quem cria uma base vira automaticamente `owner` dela (trigger `handle_new_base`)

As credenciais em `.env.example` são a **publishable key** (segura para expor no front-end — é o
equivalente moderno da antiga `anon key`). A chave que dá acesso total ao banco (service role) **não**
está em lugar nenhum deste projeto.

### Convidar alguém para uma base

Por enquanto isso é feito direto no banco (não tem tela para isso ainda — ver "Próximos passos"):

```sql
insert into base_members (base_id, user_id, role)
values ('<id da base>', '<id do usuário no auth.users>', 'editor');
```

## Build para produção / deploy

```bash
npm run build
```

Gera uma pasta `dist/` estática — pode subir em Vercel, Netlify, Cloudflare Pages ou qualquer hospedagem
de site estático. Lembre de configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` como variáveis de
ambiente da hospedagem (não hardcoded, para poder trocar de projeto Supabase sem rebuild).

## Estrutura

```
src/
  lib/         funções puras: formatação, parsing de planilha, cálculo (recompute), tipos
  hooks/       auth, contexto de dados (DocaContext), navegação, dialog, toast
  components/  Auth, Header, Sidebar, TabStrip
  pages/       uma tela por módulo do menu (Entregas, Histórico, Motoristas, Conferência,
               Fechamento, Ajustes, Bases, Clientes, Integrações, Alertas, Cabine)
  styles/      global.css — o design system (tokens de cor, tipografia, componentes)
```

## O que ficou diferente da versão artifact

- **Persistência real**: antes usava o banco embutido do Claude Artifacts (ou localStorage como
  fallback). Agora é Postgres de verdade, com controle de acesso por usuário/base.
- **Autenticação de verdade**: login por e-mail/senha via Supabase Auth, em vez do usuário implícito do
  Claude.
- **Multiusuário real**: várias pessoas podem acessar a mesma base ao mesmo tempo, cada uma com seu
  papel (dono, editor, leitor).

## Próximos passos sugeridos

- Tela para convidar/gerenciar membros de uma base (hoje é só via SQL)
- Confirmação de e-mail no cadastro (hoje depende da configuração padrão do Supabase Auth)
- Testes automatizados dos cálculos em `lib/compute.ts` (é a parte mais sensível do sistema)
- PWA (ícone de instalar, funcionar offline) — dá pra adicionar com `vite-plugin-pwa` sem mudar a
  arquitetura
