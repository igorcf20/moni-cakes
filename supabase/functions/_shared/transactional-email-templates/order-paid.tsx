/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, Steps, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props { customerName?: string; orderShort?: string; total?: string; trackUrl?: string }

const Email = ({ customerName = 'cliente', orderShort = '', total = '', trackUrl = `${BRAND.url}/dashboard` }: Props) => (
  <Layout preview={`Pagamento confirmado — pedido #${orderShort}`}>
    <Heading style={styles.h1}>Pagamento confirmado ✅</Heading>
    <Text style={styles.text}>Olá {customerName}, recebemos o pagamento do pedido <strong>#{orderShort}</strong>{total ? ` no valor de ${total}` : ''}.</Text>
    <Steps current={2} />
    <Text style={styles.text}>A tua encomenda entra agora em fila de produção. Avisamos-te assim que sair para envio.</Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={trackUrl} style={styles.button}>Ver pedido</Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `Pagamento confirmado — Pedido #${d?.orderShort ?? ''}`,
  displayName: 'Cliente — Pagamento confirmado',
  previewData: { customerName: 'Joana', orderShort: '93AF8C09', total: '€42,50' },
} satisfies TemplateEntry