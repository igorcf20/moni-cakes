-- Corre só na PRIMEIRA inicialização do volume de dados. Adaptado de supabase/docker volumes/db/jwt.sql.
-- Duração dos tokens (JWT_EXP, em segundos) disponível em SQL como current_setting('app.settings.jwt_exp').
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
