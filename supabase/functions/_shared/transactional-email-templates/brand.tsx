/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Hr, Html, Preview, Section, Text, Link, Heading, Img,
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
  primaryDark: '#C2410C',
  text: '#171717',
  muted: '#737373',
  border: '#EDE9E3',
  surface: '#FBF8F3',
  radius: '10px',
}

/** Usa a marca gravada no Admin nos próximos e-mails desta função. */
export function applyBrand(b: StoreBrandInfo) {
  BRAND.name = b.name
  BRAND.tagline = b.tagline
  BRAND.url = b.url
  BRAND.logoUrl = b.logoUrl
}

export const styles = {
  body: { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: 0, color: BRAND.text } as const,
  outer: { width: '100%', backgroundColor: '#FBF8F3', padding: '32px 12px' } as const,
  container: { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: BRAND.radius, overflow: 'hidden', border: `1px solid ${BRAND.border}` } as const,
  headerBar: { backgroundColor: '#ffffff', padding: '20px 28px', textAlign: 'left' as const, borderBottom: `1px solid ${BRAND.border}` },
  logoImg: { height: '52px', width: 'auto', display: 'block' } as const,
  content: { padding: '32px 28px' } as const,
  h1: { fontSize: '22px', fontWeight: 800 as const, color: BRAND.text, margin: '0 0 12px', fontFamily: 'Inter, Arial, sans-serif' } as const,
  h2: { fontSize: '15px', fontWeight: 700 as const, color: BRAND.text, margin: '24px 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.08em' } as const,
  text: { fontSize: '15px', lineHeight: '1.6', color: BRAND.text, margin: '0 0 14px' } as const,
  muted: { fontSize: '13px', lineHeight: '1.6', color: BRAND.muted, margin: '0 0 10px' } as const,
  button: { display: 'inline-block', backgroundColor: BRAND.primary, color: '#ffffff', fontWeight: 700 as const, fontSize: '15px', padding: '13px 22px', borderRadius: '12px', textDecoration: 'none' } as const,
  outlineButton: { display: 'inline-block', backgroundColor: '#ffffff', color: BRAND.text, fontWeight: 600 as const, fontSize: '14px', padding: '11px 20px', borderRadius: '8px', textDecoration: 'none', border: `1px solid ${BRAND.border}` } as const,
  card: { backgroundColor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px', padding: '16px 18px', margin: '12px 0' } as const,
  table: { width: '100%', borderCollapse: 'collapse' as const, margin: '8px 0' } as const,
  tdLabel: { padding: '8px 0', fontSize: '13px', color: BRAND.muted, borderBottom: `1px solid ${BRAND.border}` } as const,
  tdValue: { padding: '8px 0', fontSize: '14px', color: BRAND.text, textAlign: 'right' as const, fontWeight: 600 as const, borderBottom: `1px solid ${BRAND.border}` } as const,
  hr: { borderColor: BRAND.border, margin: '24px 0' } as const,
  footer: { padding: '20px 28px 28px', borderTop: `1px solid ${BRAND.border}`, color: BRAND.muted, fontSize: '12px', lineHeight: '1.6', backgroundColor: '#fcfcfd' } as const,
  stepWrap: { width: '100%', borderCollapse: 'collapse' as const, margin: '18px 0 6px' } as const,
  stepCell: (active: boolean, done: boolean) => ({
    padding: '6px 4px',
    fontSize: '11px',
    textAlign: 'center' as const,
    color: active ? BRAND.text : done ? BRAND.text : BRAND.muted,
    fontWeight: (active ? 700 : 500) as 500 | 700,
  }),
  stepDot: (active: boolean, done: boolean) => ({
    width: '28px', height: '28px', lineHeight: '28px',
    borderRadius: '50%',
    margin: '0 auto 6px',
    fontSize: '12px',
    fontWeight: 700 as const,
    color: active || done ? '#ffffff' : BRAND.muted,
    backgroundColor: active || done ? BRAND.primary : '#e5e7eb',
    textAlign: 'center' as const,
    display: 'inline-block' as const,
  }),
}

export interface LayoutProps {
  preview: string
  children: React.ReactNode
  showFooter?: boolean
}

export const Layout = ({ preview, children, showFooter = true }: LayoutProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.body}>
      <div style={styles.outer}>
        <Container style={styles.container}>
          <Section style={styles.headerBar}>
            {BRAND.logoUrl ? (
              <Link href={BRAND.url}>
                <Img src={BRAND.logoUrl} alt={BRAND.name} style={styles.logoImg} />
              </Link>
            ) : (
              <Text style={{ fontSize: '22px', fontWeight: 800, color: BRAND.text, margin: 0 }}>{BRAND.name}</Text>
            )}
          </Section>
          <Section style={styles.content}>{children}</Section>
          {showFooter && (
            <Section style={styles.footer}>
              {BRAND.tagline ? `${BRAND.name}. ${BRAND.tagline}` : BRAND.name}
              {BRAND.url && (<><br /><Link href={BRAND.url} style={{ color: BRAND.muted }}>{BRAND.url.replace(/^https?:\/\//, '')}</Link></>)}
            </Section>
          )}
        </Container>
      </div>
    </Body>
  </Html>
)

export interface StepsProps {
  current: 1 | 2 | 3 | 4 | 5
}
const STEP_LABELS = ['Recebido', 'Pago', 'Em produção', 'Enviado', 'Entregue']
export const Steps = ({ current }: StepsProps) => (
  <table role="presentation" style={styles.stepWrap}>
    <tbody>
      <tr>
        {STEP_LABELS.map((label, i) => {
          const idx = (i + 1) as 1 | 2 | 3 | 4 | 5
          const done = idx < current
          const active = idx === current
          return (
            <td key={label} style={styles.stepCell(active, done)}>
              <div style={styles.stepDot(active, done)}>{done ? '✓' : idx}</div>
              {label}
            </td>
          )
        })}
      </tr>
    </tbody>
  </table>
)

export interface OrderItemLine {
  name: string
  qty: number | string
  total: string
}

export const OrderItemsTable = ({ items }: { items: OrderItemLine[] }) => (
  <table role="presentation" style={styles.table}>
    <tbody>
      {items.map((it, i) => (
        <tr key={i}>
          <td style={styles.tdLabel}>{it.name} <span style={{ color: BRAND.muted }}>× {it.qty}</span></td>
          <td style={styles.tdValue}>{it.total}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

export { Hr }
