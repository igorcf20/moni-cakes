/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  orderShort?: string
  total?: string
  reason?: string
  dashboardUrl?: string
}

const Email = ({
  customerName = 'cliente',
  orderShort = '',
  total = '',
  reason = '',
  dashboardUrl = `${BRAND.url}/dashboard`,
}: Props) => (
  <Layout preview={`Encomenda #${orderShort} — não foi possível cancelar`}>
    <Heading style={styles.h1}>Não foi possível cancelar</Heading>
    <Text style={styles.text}>Olá {customerName},</Text>
    <Text style={styles.text}>
      Não foi possível cancelar a tua encomenda <strong>#{orderShort}</strong>
      {total ? ` (${total})` : ''}. A encomenda segue ativa e em produção conforme o previsto.
    </Text>
    {reason && (
      <div style={styles.card}>
        <Text style={{ ...styles.muted, margin: 0 }}>Motivo</Text>
        <Text style={{ ...styles.text, margin: '4px 0 0' }}>{reason}</Text>
      </div>
    )}
    <Text style={styles.text}>
      Se tiveres alguma dúvida, responde a este e-mail e a nossa equipa ajuda-te.
    </Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={dashboardUrl} style={styles.button}>Ver encomenda</Button>
    </Section>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Encomenda #${d?.orderShort ?? ''} — não foi possível cancelar`,
  displayName: 'Cliente — Não foi possível cancelar',
  previewData: {
    customerName: 'Joana',
    orderShort: '93AF8C09',
    total: '€42,50',
    reason: 'A produção já iniciou.',
  },
} satisfies TemplateEntry