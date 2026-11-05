/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  orderShort?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  total?: string
  reason?: string
  adminUrl?: string
}

const Email = ({
  orderShort = '',
  customerName = '',
  customerEmail = '',
  customerPhone = '',
  total = '',
  reason = '',
  adminUrl = `${BRAND.url}/shop-kodeadmin?tab=orders`,
}: Props) => (
  <Layout preview={`Encomenda #${orderShort} — cliente pediu para cancelar`}>
    <Heading style={styles.h1}>Cliente pediu para cancelar ⚠️</Heading>
    <Text style={styles.text}>
      O cliente <strong>{customerName || '—'}</strong> pediu para cancelar a encomenda{' '}
      <strong>#{orderShort}</strong>{total ? ` (${total})` : ''}.
    </Text>
    <div style={styles.card}>
      {(customerEmail || customerPhone) && (
        <Text style={{ ...styles.muted, margin: 0 }}>
          {customerEmail}{customerEmail && customerPhone ? ' · ' : ''}{customerPhone}
        </Text>
      )}
      {reason && (
        <>
          <Text style={{ ...styles.muted, margin: '10px 0 0' }}>Motivo indicado</Text>
          <Text style={{ ...styles.text, margin: '4px 0 0' }}>{reason}</Text>
        </>
      )}
      {!reason && (
        <Text style={{ ...styles.text, margin: '10px 0 0' }}>Sem motivo indicado.</Text>
      )}
    </div>
    <Text style={styles.text}>
      Aprova ou recusa no painel — se a produção já iniciou, recusa e responde ao cliente.
    </Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={adminUrl} style={styles.button}>Rever no painel</Button>
    </Section>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `⚠️ Encomenda #${d?.orderShort ?? ''} — cliente pediu para cancelar`,
  displayName: 'Admin — Cliente pediu para cancelar',
  previewData: {
    orderShort: '93AF8C09',
    customerName: 'Joana Silva',
    customerEmail: 'joana@example.com',
    customerPhone: '+351 912 345 678',
    total: '€42,50',
    reason: 'Enganei-me no tamanho da arte.',
  },
} satisfies TemplateEntry