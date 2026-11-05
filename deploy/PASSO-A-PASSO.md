# Pôr a PRINT3D online em loja3d.kodemi.pt

Tudo corre no VPS `integranext-vps` (204.12.203.83), como `administrator`, só em `~/loja3d` e na porta local 8190.
Os outros sites do servidor não mudam. Nenhuma chave ou senha aparece no ecrã: são geradas e guardadas no VPS.

## Como entrar no VPS (Windows)

Abra o **PowerShell** (menu Iniciar > escreva PowerShell) e escreva:

```sh
ssh administrator@204.12.203.83
```

Na primeira vez responda `yes` e escreva a senha do servidor (não aparece enquanto escreve). Os comandos dos passos
abaixo são colados nessa janela (clique com o botão direito para colar). Para sair: `exit`.

## 0. Uma vez, antes de começar

- DNS do domínio kodemi.pt (painel onde gere o domínio): registo **A**, nome **loja3d**, valor **204.12.203.83**.
- No VPS: o utilizador `administrator` usa o Docker (`docker info` funciona) e há uns 6 GB livres em disco e 2 GB de memória.
- Para os timers correrem sem sessão aberta:

```sh
sudo loginctl enable-linger administrator
```

## 1. Chave de leitura do GitHub (no VPS)

```sh
mkdir -p ~/.ssh ~/loja3d && chmod 700 ~/.ssh ~/loja3d
ssh-keygen -q -t ed25519 -N "" -C loja3d-vps-deploy -f ~/.ssh/loja3d_deploy
printf '\nHost github-loja3d\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/loja3d_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
chmod 600 ~/.ssh/config
cat ~/.ssh/loja3d_deploy.pub
```

Copie a linha que aparece (começa por `ssh-ed25519`). É a chave **pública**, pode ser colada sem problema.

## 2. Cadastrar a chave no GitHub

github.com/igorcf20/loja3d > **Settings** > **Deploy keys** > **Add deploy key**: título `VPS`, cole a chave,
**sem** marcar "Allow write access" > **Add key**.

## 3. Instalar e publicar (no VPS)

```sh
(umask 077; echo 'SITE_URL=https://loja3d.kodemi.pt' >> ~/loja3d/env)
git clone -q git@github-loja3d:igorcf20/loja3d.git /tmp/loja3d-boot && bash /tmp/loja3d-boot/deploy/bootstrap.sh
```

Na primeira vez descarrega cerca de 4 GB de imagens e demora alguns minutos. No fim aparece **Pronto**.
A partir daqui, cada alteração publicada no GitHub entra no site sozinha em poucos minutos.

## 4. Ligar o domínio com HTTPS (no VPS)

```sh
sudo bash ~/loja3d/src/deploy/expose-domain.sh loja3d.kodemi.pt
```

Cria só o ficheiro deste subdomínio no nginx do servidor, testa, recarrega e pede o certificado HTTPS.
Se disser que falta o certbot: `sudo apt install certbot python3-certbot-nginx` e repita.
Depois: `bash ~/loja3d/sync.sh force`.

Abra **https://loja3d.kodemi.pt**.

## 5. Primeiro administrador

1. No site, crie a sua conta (Entrar > Criar conta).
2. No VPS, troque o e-mail pelo seu:

```sh
docker exec -it loja3d-db-1 psql -U postgres -c "insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'SEU-EMAIL' on conflict do nothing;"
```

3. No site, entre de novo e abra **/admin**: preencha os dados da loja (nome, e-mail, telefone, CNPJ),
   produtos, formas de entrega e de pagamento.

## Depois

- Cópias de segurança: todos os dias às 03:30 (base e ficheiros), em `~/loja3d/backups`.
  Fazer uma já: `systemctl --user start loja3d-backup.service`. Ver: `bash ~/loja3d/src/deploy/restore.sh --listar`.
  As cópias ficam só no VPS; guarde também uma cópia do `~/loja3d/env` fora do servidor.
- Estado: `docker ps --filter label=com.docker.compose.project=loja3d` e `journalctl --user -u loja3d-sync -n 50`.
- E-mails automáticos e pagamento online ainda não estão ligados (próximos passos).
- Entrar com Google ou Facebook (opcional): crie as credenciais (passos em Admin > Configurações > Segurança da conta),
  acrescente ao `~/loja3d/env` as linhas `GOOGLE_LOGIN_ENABLED=true`, `GOOGLE_CLIENT_ID=...` e `GOOGLE_CLIENT_SECRET=...`
  (ou `FACEBOOK_LOGIN_ENABLED=true`, `FACEBOOK_APP_ID=...`, `FACEBOOK_APP_SECRET=...`) e publique de novo:
  `systemctl --user start loja3d-sync.service`. Depois ligue o recurso em Admin > Recursos da loja.
- Perdeu o celular da verificação em dois passos e não há outro administrador: no VPS,
  `docker exec -it loja3d-db-1 psql -U postgres -c "delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'SEU-EMAIL');"`
