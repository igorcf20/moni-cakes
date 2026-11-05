-- Corre só na PRIMEIRA inicialização do volume de dados, antes de todos os outros scripts (00-...).
-- A imagem supabase/postgres regista os comandos DDL (log_statement = 'ddl'), e a inicialização corre
-- "ALTER USER ... WITH PASSWORD '<POSTGRES_PASSWORD>'" (roles.sql e o migrate.sh da própria imagem):
-- sem isto, a palavra-passe da base ficava em texto no registo do contentor (docker logs).
-- O registo de DDL volta ao valor normal no fim da inicialização (log-ddl-on.sql).
ALTER SYSTEM SET log_statement = 'none';
SELECT pg_reload_conf();
-- O postmaster aplica a nova configuração de forma assíncrona: esperar antes da ligação seguinte.
SELECT pg_sleep(1);
