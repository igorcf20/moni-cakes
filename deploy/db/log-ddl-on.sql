-- Corre só na PRIMEIRA inicialização do volume de dados, no fim (migrations da imagem, como supabase_admin),
-- depois de todos os "ALTER USER ... WITH PASSWORD". Repõe o registo de DDL da imagem (log_statement = 'ddl'),
-- desligado por log-ddl-off.sql durante a inicialização.
ALTER SYSTEM RESET log_statement;
SELECT pg_reload_conf();
