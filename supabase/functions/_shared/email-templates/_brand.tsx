/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Html, Preview, Section, Text, Link, Heading, Img, Button, Hr,
} from 'npm:@react-email/components@0.0.22'

import { fallbackBrand, type StoreBrandInfo } from '../storeBrand.ts'

// Marca da loja nos e-mails (tema claro: corpo #ffffff). Nome, frase e logótipo vêm do Admin: a função que envia
// chama applyBrand(await loadStoreBrand(sb)) antes de desenhar o e-mail. SITE_URL = endereço público da loja.
const START = fallbackBrand()

export const BRAND = {
  name: START.name,
  tagline: START.tagline,
  url: START.url,
  logoUrl: START.logoUrl,
  primary: '#FF5A0A',
  text: '#171717',
  muted: '#737373',
  border: '#EDE9E3',
}

/** Usa a marca gravada no Admin nos próximos e-mails desta função. */
export function applyBrand(b: StoreBrandInfo) {
  BRAND.name = b.name
  BRAND.tagline = b.tagline
  BRAND.url = b.url
  BRAND.logoUrl = b.logoUrl
}

export const s = {
  body: { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: 0, color: BRAND.text } as const,
  outer: { width: '100%', backgroundColor: '#FBF8F3', padding: '32px 12px' } as const,
  container: { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${BRAND.border}` } as const,
  header: { backgroundColor: '#ffffff', padding: '20px 28px', borderBottom: `1px solid ${BRAND.border}`, textAlign: 'left' as const },
  logo: { height: '52px', width: 'auto', display: 'block' } as const,
  content: { padding: '32px 28px' } as const,
  h1: { fontSize: '22px', fontWeight: 800 as const, color: BRAND.text, margin: '0 0 14px' } as const,
  text: { fontSize: '15px', lineHeight: '1.6', color: BRAND.text, margin: '0 0 14px' } as const,
  muted: { fontSize: '13px', lineHeight: '1.6', color: BRAND.muted, margin: '20px 0 0' } as const,
  button: { display: 'inline-block', backgroundColor: BRAND.primary, color: '#ffffff', fontWeight: 700 as const, fontSize: '15px', padding: '13px 24px', borderRadius: '12px', textDecoration: 'none' } as const,
  code: { display: 'inline-block', backgroundColor: '#f1f5f9', color: BRAND.text, fontFamily: 'monospace', fontSize: '28px', fontWeight: 700 as const, letterSpacing: '0.3em', padding: '14px 24px', borderRadius: '8px', margin: '8px 0 20px' } as const,
  footer: { padding: '18px 28px 26px', borderTop: `1px solid ${BRAND.border}`, color: BRAND.muted, fontSize: '12px', lineHeight: '1.6', backgroundColor: '#fcfcfd' } as const,
  link: { color: BRAND.primary, textDecoration: 'underline' } as const,
}

export const Layout = ({ preview, children }: { preview: string; children: React.ReactNode }) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={s.body}>
      <div style={s.outer}>
        <Container style={s.container}>
          <Section style={s.header}>
            {BRAND.logoUrl ? (
              <Link href={BRAND.url}>
                <Img src={BRAND.logoUrl} alt={BRAND.name} style={s.logo} />
              </Link>
            ) : (
              <Text style={{ fontSize: '22px', fontWeight: 800, color: BRAND.text, margin: 0 }}>{BRAND.name}</Text>
            )}
          </Section>
          <Section style={s.content}>{children}</Section>
          <Section style={s.footer}>
            {BRAND.tagline ? `${BRAND.name}. ${BRAND.tagline}` : BRAND.name}
            {BRAND.url && (<><br /><Link href={BRAND.url} style={{ color: BRAND.muted }}>{BRAND.url.replace(/^https?:\/\//, '')}</Link></>)}
          </Section>
        </Container>
      </div>
    </Body>
  </Html>
)

export { Heading, Text, Button, Link, Hr }
