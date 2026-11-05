/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props { orderShort?: string; customerName?: string; total?: string; reason?: string; adminUrl?: string }

const Email = ({ orderShort = '', customerName = '', total = '', reason = '', adminUrl = `${BRAND.url}/shop-kodeadmin?tab=orders` }: Props) => (
  <Layout preview={`Encomenda #${orderShort} cancelada`}>
    <Heading style={styles.h1}>Encomenda cancelada ⚠️</Heading>
    <Text style={styles.text}>A encomenda <strong>#{orderShort}</strong> de <strong>{customerName || '—'}</strong> foi cancelada{total ? ` (${total})` : ''}.</Text>
    {reason && (
      <div style={styles.card}>
        <Text style={{ ...styles.muted, margin: 0 }}>Motivo</Text>
        <Text style={{ ...styles.text, margin: '4px 0 0' }}>{reason}</Text>
      </div>
    )}
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={adminUrl} style={styles.button}>Ver no painel</Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `🔴 Encomenda #${d?.orderShort ?? ''} cancelada`,
  displayName: 'Admin — Encomenda cancelada',
  previewData: { orderShort: '93AF8C09', customerName: 'Joana Silva', total: '€42,50', reason: 'A pedido do cliente.' },
} satisfies TemplateEntry