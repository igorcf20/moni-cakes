/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  orderShort?: string
  total?: string
  refundNote?: string
  trackUrl?: string
}

const Email = ({
  customerName = 'cliente',
  orderShort = '',
  total = '',
  refundNote = '',
  trackUrl = `${BRAND.url}/dashboard`,
}: Props) => (
  <Layout preview={`Reembolso processado — pedido #${orderShort}`}>
    <Heading style={styles.h1}>Reembolso processado</Heading>
    <Text style={styles.text}>
      Olá {customerName}, processámos o reembolso do teu pedido <strong>#{orderShort}</strong>
      {total ? <> no valor de <strong>{total}</strong></> : null}.
    </Text>
    <Text style={styles.muted}>
      O valor pode demorar entre <strong>1 a 5 dias úteis</strong> a aparecer na conta ou cartão utilizado no pagamento,
      consoante o banco e o método usado.
    </Text>
    {refundNote && (
      <div style={styles.card}>
        <Text style={{ ...styles.muted, margin: 0 }}>Nota da equipa</Text>
        <Text style={{ ...styles.text, margin: '4px 0 0' }}>{refundNote}</Text>
      </div>
    )}
    <Text style={styles.text}>
      Se após esse prazo o valor não chegar, responde a este email e ajudamos a confirmar a operação com o banco.
    </Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={trackUrl} style={styles.outlineButton}>Ver pedido</Button>
    </Section>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Reembolso do pedido #${d?.orderShort ?? ''} processado`,
  displayName: 'Cliente — Reembolso processado',
  previewData: {
    customerName: 'Joana',
    orderShort: '93AF8C09',
    total: '48,75 €',
    refundNote: 'Reembolso total após cancelamento aprovado.',
  },
} satisfies TemplateEntry