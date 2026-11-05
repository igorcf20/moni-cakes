/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props { customerName?: string; orderShort?: string; reason?: string; trackUrl?: string }

const Email = ({ customerName = 'cliente', orderShort = '', reason = '', trackUrl = `${BRAND.url}/dashboard` }: Props) => (
  <Layout preview={`Encomenda #${orderShort} cancelada`}>
    <Heading style={styles.h1}>Encomenda cancelada</Heading>
    <Text style={styles.text}>Olá {customerName}, a loja aprovou a tua solicitação de cancelar a encomenda <strong>#{orderShort}</strong>. A encomenda foi cancelada no site.</Text>
    {reason && (
      <div style={styles.card}>
        <Text style={{ ...styles.muted, margin: 0 }}>Motivo</Text>
        <Text style={{ ...styles.text, margin: '4px 0 0' }}>{reason}</Text>
      </div>
    )}
    <Text style={styles.text}>Se já tinhas efetuado o pagamento, entraremos em contacto para o reembolso. Em caso de dúvida, responde a este email.</Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={trackUrl} style={styles.outlineButton}>Abrir encomenda</Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `Encomenda #${d?.orderShort ?? ''} cancelada`,
  displayName: 'Cliente — Encomenda cancelada',
  previewData: { customerName: 'Joana', orderShort: '93AF8C09', reason: 'A pedido do cliente.' },
} satisfies TemplateEntry