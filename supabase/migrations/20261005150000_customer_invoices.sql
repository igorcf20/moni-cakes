-- Faturas na área do cliente (aba Faturas de /dashboard) e PDF do documento fiscal por pedido.
--
-- order_invoices era só da FIZ (Portugal) e só o servidor escrevia. Passa a servir qualquer país:
--   document_path  PDF do documento fiscal (NF-e no Brasil, fatura em Portugal...) no bucket privado
--                  "invoices", caminho <order_id>/<ficheiro>.pdf, enviado pelo Admin no pedido
--   provider       'fiz' (emitida pela integração) ou 'manual' (PDF enviado pelo Admin)
-- O cliente não lê a tabela (tem erros internos): usa a função my_invoices(), que devolve só o número,
-- a data e o PDF dos documentos dos seus próprios pedidos. O PDF só é lido pelo dono do pedido e por admins.

alter table public.order_invoices add column if not exists document_path text;
alter table public.order_invoices drop constraint if exists order_invoices_document_path_check;
alter table public.order_invoices add constraint order_invoices_document_path_check
  check (document_path is null or document_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$');

-- Admin envia, troca ou remove o documento de um pedido.
drop policy if exists "Admins write order invoices" on public.order_invoices;
create policy "Admins write order invoices" on public.order_invoices
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create or replace function public.my_invoices()
returns table (order_id uuid, number text, issued_at timestamptz, document_path text)
language sql
stable
security definer
set search_path = public
as $$
  select i.order_id, i.number, i.issued_at, i.document_path
    from public.order_invoices i
    join public.orders o on o.id = i.order_id
   where o.user_id = auth.uid()
     and (i.number is not null or i.document_path is not null);
$$;

revoke all on function public.my_invoices() from public, anon;
grant execute on function public.my_invoices() to authenticated;

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists "Admins manage invoice files" on storage.objects;
create policy "Admins manage invoice files" on storage.objects
  for all to authenticated
  using (bucket_id = 'invoices' and public.has_role(auth.uid(), 'admin'::app_role))
  with check (bucket_id = 'invoices' and public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Customers read own invoice files" on storage.objects;
create policy "Customers read own invoice files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and o.user_id = auth.uid()
    )
  );
