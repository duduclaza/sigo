# SIGO React + Express + Supabase

Projeto convertido para React/Vite no frontend, Express no backend e Supabase como banco/storage.

- `client/`: frontend React com Vite.
- `server/`: API Node.js Express.
- `supabase/schema.sql`: schema PostgreSQL, seeds e bucket de uploads.
- `supabase/migrations/`: migrations executadas automaticamente no deploy.
- `api/index.js`: entrada serverless da API para Vercel.

## Preparar o Supabase

1. Crie um projeto no Supabase.
2. Copie `.env.example` para `.env` ou `server/.env`.
3. Preencha `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` e, se desejar, SMTP.
4. Rode `npm.cmd run migrate` localmente ou deixe a Vercel executar automaticamente no deploy.

O usuario inicial criado pelo schema e:

- E-mail: `admin@sigo.com.br`
- Senha: `admin`

## Rodar localmente

```bash
npm.cmd run install:all
npm.cmd run migrate
npm.cmd run dev
```

URLs principais:

- App: `http://localhost:5173`
- API: `http://localhost:3001/api/health`
- Dashboard: `http://localhost:5173/dashboard`
- Painel de docas: `http://localhost:5173/painel`
- App do motorista: `http://localhost:5173/motorista`
- Check-in/Check-out: `http://localhost:5173/checkin`

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Preferencialmente use o diretório raiz do projeto. Se a Vercel estiver configurada com Root Directory `client`, o projeto também possui fallback em `client/vercel.json`.
3. O arquivo `vercel.json` já define:
   - Install Command: `npm install`
   - Build Command: `npm run vercel-build`
   - Output Directory: `client/dist`
   - API serverless em `/api/*`
4. Configure estas variáveis em Project Settings > Environment Variables:

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SUPABASE_BUCKET=sigo-uploads
JWT_SECRET=um-segredo-forte
JWT_EXPIRES_IN=12h
TIMEZONE=America/Sao_Paulo
APP_URL=https://seu-dominio.vercel.app
CLIENT_URL=https://seu-dominio.vercel.app
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=notificacoes@seudominio.com.br
SMTP_PASS=sua_senha_secreta
SMTP_SECURE=true
SMTP_FROM_EMAIL=notificacoes@seudominio.com.br
SMTP_FROM_NAME=SIGO - Sistema Operacional
```

`DATABASE_URL` deve ser a string de conexão Postgres do Supabase com SSL. Sem ela, o deploy na Vercel falha antes do build para evitar publicar a aplicação sem schema.

## Migrations

As migrations ficam em `supabase/migrations/*.sql` e são aplicadas por `scripts/migrate.js`.

- A Vercel roda `npm run migrate` automaticamente dentro de `npm run vercel-build`.
- Cada arquivo aplicado é registrado em `schema_migrations` com checksum.
- Não edite uma migration já aplicada em produção; crie um novo arquivo com prefixo incremental, por exemplo `0002_nova_tabela.sql`.
- `supabase/schema.sql` permanece como snapshot legível do schema inicial.

## Observacoes da conversao

- A sessao PHP foi substituida por JWT no Express.
- O Supabase e usado como banco e storage via service role no backend.
- As regras de perfis, permissoes, transportadoras, romaneios, docas e reportes foram migradas para rotas REST.
- Fotos de perfil e reportes agora vao para Supabase Storage no bucket `sigo-uploads`.
- O legado PHP, Composer, SQL MySQL antigo e arquivos de teste/migracao foram removidos da pasta principal.
