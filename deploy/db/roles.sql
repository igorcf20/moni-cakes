-- Corre só na PRIMEIRA inicialização do volume de dados (init-scripts da imagem supabase/postgres).
-- Adaptado de supabase/docker volumes/db/roles.sql. Dá a palavra-passe POSTGRES_PASSWORD aos papéis
-- de serviço usados pelo auth (GoTrue), rest (PostgREST), storage e funções.
-- Mudar POSTGRES_PASSWORD depois disto NÃO altera estes papéis: é preciso ALTER USER manual.
-- Os ALTER USER abaixo levam a palavra-passe em texto: nunca podem ir para o registo da base
-- (além do log-ddl-off.sql, desliga-se aqui o registo nesta sessão).
SET log_statement = 'none';
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
