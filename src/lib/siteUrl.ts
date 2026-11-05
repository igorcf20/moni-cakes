// Endereço público da loja (ex.: https://print3d.com.br), usado em links de e-mail e no painel Admin.
// Vem de VITE_SITE_URL no build; sem ele, usa o endereço onde o site está aberto.
export function siteUrl(): string {
  const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  const base = env || (typeof window !== 'undefined' ? window.location.origin : '');
  return base.replace(/\/+$/, '');
}
