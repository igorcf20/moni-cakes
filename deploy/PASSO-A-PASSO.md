# Pôr a Moni Cakes online em monicakes.kodemi.pt

Tudo corre no VPS `integranext-vps` (204.12.203.83), como `administrator`, só em `~/monicakes` e na porta local 8191.
Os outros sites do servidor não mudam. Nenhuma chave ou senha aparece no ecrã: são geradas e guardadas no VPS.

A Moni Cakes fica **ao lado** da loja3d (que continua em `~/loja3d`, porta 8190, e não muda): pasta, projeto Docker
(`monicakes`), volumes, porta, timers (`monicakes-sync`, `monicakes-backup`), chave do GitHub e ficheiro do nginx são
todos próprios. As imagens Docker do backend são as mesmas da loja3d, por isso não descarrega os 4 GB outra vez.

## Como entrar no VPS (Windows)

Abra o **PowerShell** (menu Iniciar > escreva PowerShell) e escreva:

```sh
ssh administrator@204.12.203.83
```

Na primeira vez responda `yes` e escreva a senha do servidor (não aparece enquanto escreve). Os comandos dos passos
abaixo são colados nessa janela (clique com o botão direito para colar). Para sair: `exit`.

## 0. Uma vez, antes de começar

- DNS do domínio kodemi.pt (painel onde gere o domínio): registo **A**, nome **monicakes**, valor **204.12.203.83**.
- O site publica o ramo `main` do repositório `igorcf20/moni-cakes`: junte antes o pull request da loja no `main`.
- No VPS: o utilizador `administrator` usa o Docker (`docker info` funciona), há uns 3 GB livres em disco e pelo menos
  2 GB de memória disponível **além** da loja3d (`free -m`, coluna available): cada loja usa até ~1,5 GB.
- Para os timers correrem sem sessão aberta:

```sh
sudo loginctl enable-linger administrator
```

## 1. Chave de leitura do GitHub (no VPS)

```sh
mkdir -p ~/.ssh ~/monicakes && chmod 700 ~/.ssh ~/monicakes
ssh-keygen -q -t ed25519 -N "" -C monicakes-vps-deploy -f ~/.ssh/monicakes_deploy
printf '\nHost github-monicakes\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/monicakes_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
chmod 600 ~/.ssh/config
cat ~/.ssh/monicakes_deploy.pub
```

Copie a linha que aparece (começa por `ssh-ed25519`). É a chave **pública**, pode ser colada sem problema.

## 2. Cadastrar a chave no GitHub

github.com/igorcf20/moni-cakes > **Settings** > **Deploy keys** > **Add deploy key**: título `VPS`, cole a chave,
**sem** marcar "Allow write access" > **Add key**.

## 3. Instalar e publicar (no VPS)

```sh
(umask 077; echo 'SITE_URL=https://monicakes.kodemi.pt' >> ~/monicakes/env)
git clone -q git@github-monicakes:igorcf20/moni-cakes.git /tmp/monicakes-boot && bash /tmp/monicakes-boot/deploy/bootstrap.sh
```

As imagens do backend já estão no VPS (são as da loja3d); o build do site demora alguns minutos. No fim aparece **Pronto**.
A partir daqui, cada alteração publicada no GitHub entra no site sozinha em poucos minutos.

## 4. Ligar o domínio com HTTPS (no VPS)

```sh
sudo bash ~/monicakes/src/deploy/expose-domain.sh monicakes.kodemi.pt
```

Cria só o ficheiro deste subdomínio no nginx do servidor, testa, recarrega e pede o certificado HTTPS.
Se disser que falta o certbot: `sudo apt install certbot python3-certbot-nginx` e repita.
Depois: `bash ~/monicakes/sync.sh force`.

Abra **https://monicakes.kodemi.pt**.

## 5. Primeiro administrador

1. No site, crie a sua conta (Entrar > Criar conta).
2. No VPS, troque o e-mail pelo seu:

```sh
docker exec -it monicakes-db-1 psql -U postgres -c "insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'SEU-EMAIL' on conflict do nothing;"
```

3. No site, entre de novo e abra **/admin**: preencha os dados da loja (nome, e-mail, telefone, CNPJ),
   produtos, formas de entrega e de pagamento.

## Depois

- Cópias de segurança: todos os dias às 03:30 (base e ficheiros), em `~/monicakes/backups`.
  Fazer uma já: `systemctl --user start monicakes-backup.service`. Ver: `bash ~/monicakes/src/deploy/restore.sh --listar`.
  As cópias ficam só no VPS; guarde também uma cópia do `~/monicakes/env` fora do servidor.
- Estado: `docker ps --filter label=com.docker.compose.project=monicakes` e `journalctl --user -u monicakes-sync -n 50`.
- E-mails automáticos e pagamento online ainda não estão ligados (próximos passos).
- Entrar com Google ou Facebook (opcional): crie as credenciais (passos em Admin > Configurações > Segurança da conta),
  acrescente ao `~/monicakes/env` as linhas `GOOGLE_LOGIN_ENABLED=true`, `GOOGLE_CLIENT_ID=...` e `GOOGLE_CLIENT_SECRET=...`
  (ou `FACEBOOK_LOGIN_ENABLED=true`, `FACEBOOK_APP_ID=...`, `FACEBOOK_APP_SECRET=...`) e publique de novo:
  `systemctl --user start monicakes-sync.service`. Depois ligue o recurso em Admin > Recursos da loja.
- Perdeu o celular da verificação em dois passos e não há outro administrador: no VPS,
  `docker exec -it monicakes-db-1 psql -U postgres -c "delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'SEU-EMAIL');"`
