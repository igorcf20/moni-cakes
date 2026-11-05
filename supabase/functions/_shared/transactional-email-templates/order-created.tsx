/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, Steps, OrderItemsTable, OrderItemLine, styles, BRAND, Hr } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  orderId?: string
  orderShort?: string
  total?: string
  items?: OrderItemLine[]
  trackUrl?: string
  paymentMethod?: string
  paymentInstructions?: string
}

const Email = ({
  customerName = 'cliente',
  orderShort = 'XXXXXX',
  total = '€0,00',
  items = [],
  trackUrl = `${BRAND.url}/dashboard`,
  paymentMethod = '',
  paymentInstructions = '',
}: Props) => (
  <Layout preview={`Recebemos seu pedido #${orderShort}`}>
    <Heading style={styles.h1}>Recebemos seu pedido</Heading>
    <Text style={styles.text}>Olá {customerName}, obrigado pelo seu pedido em {BRAND.name}. Aqui está o resumo:</Text>
    <Steps current={1} />
    <div style={styles.card}>
      <Text style={{ ...styles.muted, margin: 0 }}>Pedido</Text>
      <Text style={{ ...styles.h1, margin: '4px 0 12px' }}>#{orderShort}</Text>
      <OrderItemsTable items={items} />
      <table role="presentation" style={{ width: '100%', marginTop: 8 }}>
        <tbody>
          <tr>
            <td style={{ fontSize: 14, color: BRAND.muted }}>Total</td>
            <td style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, textAlign: 'right' }}>{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
    {paymentMethod && (
      <>
        <Heading style={styles.h2}>Pagamento</Heading>
        <Text style={styles.text}>Método escolhido: <strong>{paymentMethod}</strong></Text>
        {paymentInstructions && <Text style={styles.muted}>{paymentInstructions}</Text>}
      </>
    )}
    <Hr style={styles.hr} />
    <Text style={styles.text}>Você vai receber um e-mail assim que o pagamento for confirmado.</Text>
    <Section style={{ textAlign: 'center', padding: '8px 0 4px' }}>
      <Button href={trackUrl} style={styles.button}>Acompanhar pedido</Button>
    </Section>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Pedido #${d?.orderShort ?? ''} recebido: ${BRAND.name}`,
  displayName: 'Cliente: pedido recebido',
  previewData: {
    customerName: 'Joana',
    orderShort: '93AF8C09',
    total: '€42,50',
    items: [{ name: 'Produto de exemplo', qty: 1, total: '€21,25' }, { name: 'Outro produto, tamanho M', qty: 1, total: '€21,25' }],
    trackUrl: `${BRAND.url}/dashboard`,
    paymentMethod: 'MB WAY',
    paymentInstructions: 'Envie o pagamento para 912 345 678 com a referência #93AF8C09.',
  },
} satisfies TemplateEntry