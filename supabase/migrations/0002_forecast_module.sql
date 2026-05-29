-- SIGO Forecast - S&OP operacional

create extension if not exists pgcrypto;

create table if not exists forecast_planos (
  id uuid primary key default gen_random_uuid(),
  regional text,
  id_local text,
  terceiro text,
  tipo text,
  qf integer not null default 0,
  pt integer not null default 0,
  total_planejado integer not null default 0,
  observacao text,
  semana_operacional text,
  mes_referencia text,
  data_formalizacao date,
  data_entrada_prevista date,
  motivo_revisao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid nullable
);

create table if not exists forecast_previsoes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references forecast_planos(id) on delete cascade,
  volume_previsto numeric not null default 0,
  produtividade_media numeric not null default 0,
  abs_percentual numeric not null default 0,
  abs_pessoas numeric,
  turnover_percentual numeric not null default 0,
  pessoas_disponiveis numeric not null default 0,
  capacidade_prevista numeric not null default 0,
  necessidade_pessoas numeric not null default 0,
  gap numeric not null default 0,
  status_risco text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists forecast_historico (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references forecast_planos(id) on delete cascade,
  campo_alterado text,
  valor_anterior text,
  valor_novo text,
  motivo text,
  alterado_por uuid nullable,
  created_at timestamptz not null default now()
);

create table if not exists forecast_parametros (
  id uuid primary key default gen_random_uuid(),
  id_local text,
  produtividade_padrao numeric not null default 0,
  abs_padrao_percentual numeric not null default 0,
  turnover_padrao_percentual numeric not null default 0,
  dias_entrada_alteracao integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_forecast_planos_unidade on forecast_planos(id_local);
create index if not exists idx_forecast_planos_periodo on forecast_planos(semana_operacional, mes_referencia);
create index if not exists idx_forecast_previsoes_plano on forecast_previsoes(plano_id, created_at desc);
create index if not exists idx_forecast_historico_plano on forecast_historico(plano_id, created_at desc);

create or replace function set_forecast_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_forecast_planos_updated_at on forecast_planos;
create trigger trg_forecast_planos_updated_at
before update on forecast_planos
for each row execute function set_forecast_updated_at();

drop trigger if exists trg_forecast_previsoes_updated_at on forecast_previsoes;
create trigger trg_forecast_previsoes_updated_at
before update on forecast_previsoes
for each row execute function set_forecast_updated_at();

drop trigger if exists trg_forecast_parametros_updated_at on forecast_parametros;
create trigger trg_forecast_parametros_updated_at
before update on forecast_parametros
for each row execute function set_forecast_updated_at();

alter table forecast_planos enable row level security;
alter table forecast_previsoes enable row level security;
alter table forecast_historico enable row level security;
alter table forecast_parametros enable row level security;

drop policy if exists "forecast_planos_auth_select" on forecast_planos;
create policy "forecast_planos_auth_select"
on forecast_planos for select
to authenticated
using (true);

drop policy if exists "forecast_planos_auth_insert" on forecast_planos;
create policy "forecast_planos_auth_insert"
on forecast_planos for insert
to authenticated
with check (true);

drop policy if exists "forecast_planos_auth_update" on forecast_planos;
create policy "forecast_planos_auth_update"
on forecast_planos for update
to authenticated
using (true)
with check (true);

drop policy if exists "forecast_planos_auth_delete" on forecast_planos;
create policy "forecast_planos_auth_delete"
on forecast_planos for delete
to authenticated
using (true);

drop policy if exists "forecast_previsoes_auth_select" on forecast_previsoes;
create policy "forecast_previsoes_auth_select"
on forecast_previsoes for select
to authenticated
using (true);

drop policy if exists "forecast_previsoes_auth_insert" on forecast_previsoes;
create policy "forecast_previsoes_auth_insert"
on forecast_previsoes for insert
to authenticated
with check (true);

drop policy if exists "forecast_previsoes_auth_update" on forecast_previsoes;
create policy "forecast_previsoes_auth_update"
on forecast_previsoes for update
to authenticated
using (true)
with check (true);

drop policy if exists "forecast_previsoes_auth_delete" on forecast_previsoes;
create policy "forecast_previsoes_auth_delete"
on forecast_previsoes for delete
to authenticated
using (true);

drop policy if exists "forecast_historico_auth_select" on forecast_historico;
create policy "forecast_historico_auth_select"
on forecast_historico for select
to authenticated
using (true);

drop policy if exists "forecast_historico_auth_insert" on forecast_historico;
create policy "forecast_historico_auth_insert"
on forecast_historico for insert
to authenticated
with check (true);

drop policy if exists "forecast_parametros_auth_select" on forecast_parametros;
create policy "forecast_parametros_auth_select"
on forecast_parametros for select
to authenticated
using (true);

drop policy if exists "forecast_parametros_auth_insert" on forecast_parametros;
create policy "forecast_parametros_auth_insert"
on forecast_parametros for insert
to authenticated
with check (true);

drop policy if exists "forecast_parametros_auth_update" on forecast_parametros;
create policy "forecast_parametros_auth_update"
on forecast_parametros for update
to authenticated
using (true)
with check (true);

drop policy if exists "forecast_parametros_auth_delete" on forecast_parametros;
create policy "forecast_parametros_auth_delete"
on forecast_parametros for delete
to authenticated
using (true);

insert into permissoes (id, chave, nome, categoria) values
  (15, 'acesso_forecast', 'Acesso ao Forecast S&OP', 'Operacional')
on conflict (id) do update set chave = excluded.chave, nome = excluded.nome, categoria = excluded.categoria;

select setval(pg_get_serial_sequence('permissoes', 'id'), greatest((select max(id) from permissoes), 1), true);

insert into perfil_permissoes (perfil_id, permissao_id)
select 1, id from permissoes where chave = 'acesso_forecast'
on conflict do nothing;
