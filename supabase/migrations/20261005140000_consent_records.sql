-- Registo das escolhas de cookies (prova do consentimento, LGPD art. 8 e RGPD art. 7.1).
-- Cada escolha feita no aviso do site grava uma linha: código da escolha (o mesmo guardado no aparelho do
-- visitante), categorias aceites, versão do texto, ação e sinal GPC. Sem IP nem dados do navegador.
-- Qualquer visitante pode inserir (a sua própria escolha); só administradores leem; ninguém altera nem apaga
-- pelo site. Admin > Privacidade e cookies mostra e exporta estes registos.
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  choices jsonb not null,
  policy_version integer not null check (policy_version between 1 and 1000),
  action text not null check (action in ('accept_all', 'reject_all', 'custom')),
  gpc boolean not null default false,
  locale text check (locale is null or locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  constraint consent_records_choices_shape check (
    jsonb_typeof(choices) = 'object'
    and choices ?& array['preferences', 'analytics', 'marketing']
    and jsonb_typeof(choices -> 'preferences') = 'boolean'
    and jsonb_typeof(choices -> 'analytics') = 'boolean'
    and jsonb_typeof(choices -> 'marketing') = 'boolean'
    and (choices - array['preferences', 'analytics', 'marketing']) = '{}'::jsonb
  )
);

create index if not exists consent_records_consent_id_idx on public.consent_records (consent_id);
create index if not exists consent_records_created_at_idx on public.consent_records (created_at desc);

alter table public.consent_records enable row level security;

drop policy if exists "Visitantes registam a própria escolha" on public.consent_records;
create policy "Visitantes registam a própria escolha" on public.consent_records
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "Administradores leem os registos" on public.consent_records;
create policy "Administradores leem os registos" on public.consent_records
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

grant insert on public.consent_records to anon, authenticated;
grant select on public.consent_records to authenticated;
