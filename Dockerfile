# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (a única chave no build é a pública, papel anon, que fica no código do site de qualquer forma)
# Build do site (Vite) + nginx, que serve o site e é o gateway da API (/rest, /auth, /storage, /functions)
# no mesmo domínio. O site usa a própria origem como endereço do backend: o build não precisa do domínio.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Chave pública (ANON_KEY, papel anon), entra no código do site. A SERVICE_ROLE_KEY nunca vem para aqui
# (o vite.config.ts recusa uma chave que não seja de papel anon).
ARG VITE_SUPABASE_PUBLISHABLE_KEY
# Endereço público da loja para links de e-mail (opcional: sem ele usa o endereço aberto no navegador).
ARG VITE_SITE_URL=""
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY VITE_SITE_URL=$VITE_SITE_URL
# O vite.config.ts recusa construir sem a chave (sem a escrever no registo do build).
RUN npx vite build --mode production

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
