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
  customerName = '',
  orderShort = '',
  total = '',
  reason = '',
  dashboardUrl = `${BRAND.url}/dashboard`,
}: Props) => (
  <Layout preview={`Recebemos o teu pedido — #${orderShort}`}>
    <Heading style={styles.h1}>Recebemos o teu pedido</Heading>
    <Text style={styles.text}>Olá {customerName || 'cliente'},</Text>
    <Text style={styles.text}>
      Recebemos o teu pedido para cancelar a encomenda <strong>#{orderShort}</strong>
      {total ? ` (${total})` : ''}. A nossa equipa vai analisar em até <strong>24 horas úteis</strong>.
    </Text>
    {reason && (
      <div style={styles.card}>
        <Text style={{ ...styles.muted, margin: 0 }}>Motivo indicado</Text>
        <Text style={{ ...styles.text, margin: '4px 0 0' }}>{reason}</Text>
      </div>
    )}
    <Text style={styles.text}>
      Importante: como muitos dos nossos produtos são personalizados, se a produção já
      tiver iniciado o pedido pode ser recusado, conforme os nossos termos.
      Vamos confirmar por e-mail o resultado.
    </Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={dashboardUrl} style={styles.button}>Ver o meu pedido</Button>
    </Section>
    <Text style={{ ...styles.muted, marginTop: 12 }}>
      Se precisares de falar connosco entretanto, responde a este e-mail.
    </Text>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Recebemos o teu pedido — #${d?.orderShort ?? ''}`,
  displayName: 'Cliente — Pedido para cancelar recebido',
  previewData: {
    customerName: 'Joana',
    orderShort: '93AF8C09',
    total: '€42,50',
    reason: 'Enganei-me no tamanho.',
  },
} satisfies TemplateEntry