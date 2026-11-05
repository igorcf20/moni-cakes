/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, OrderItemsTable, OrderItemLine, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  orderShort?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  total?: string
  paymentMethod?: string
  items?: OrderItemLine[]
  adminUrl?: string
}

const Email = ({ orderShort = '', customerName = '', customerEmail = '', customerPhone = '', total = '', paymentMethod = '', items = [], adminUrl = `${BRAND.url}/shop-kodeadmin?tab=orders` }: Props) => (
  <Layout preview={`Nova encomenda #${orderShort} — ${customerName}`}>
    <Heading style={styles.h1}>Nova encomenda 💰</Heading>
    <Text style={styles.text}>Acabou de entrar uma nova encomenda na loja.</Text>
    <div style={styles.card}>
      <table role="presentation" style={styles.table}>
        <tbody>
          <tr><td style={styles.tdLabel}>Pedido</td><td style={styles.tdValue}>#{orderShort}</td></tr>
          <tr><td style={styles.tdLabel}>Cliente</td><td style={styles.tdValue}>{customerName || '—'}</td></tr>
          {customerEmail && <tr><td style={styles.tdLabel}>Email</td><td style={styles.tdValue}>{customerEmail}</td></tr>}
          {customerPhone && <tr><td style={styles.tdLabel}>Telefone</td><td style={styles.tdValue}>{customerPhone}</td></tr>}
          {paymentMethod && <tr><td style={styles.tdLabel}>Pagamento</td><td style={styles.tdValue}>{paymentMethod}</td></tr>}
          <tr><td style={styles.tdLabel}>Total</td><td style={{ ...styles.tdValue, fontSize: 16, color: BRAND.primary }}>{total}</td></tr>
        </tbody>
      </table>
    </div>
    {items.length > 0 && (
      <>
        <Heading style={styles.h2}>Itens</Heading>
        <OrderItemsTable items={items} />
      </>
    )}
    <Section style={{ textAlign: 'center', padding: '16px 0 4px' }}>
      <Button href={adminUrl} style={styles.button}>Abrir no painel admin</Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `🟢 Nova encomenda #${d?.orderShort ?? ''} — ${d?.total ?? ''}`,
  displayName: 'Admin — Nova encomenda',
  previewData: { orderShort: '93AF8C09', customerName: 'Joana Silva', customerEmail: 'joana@example.com', customerPhone: '+351 912 345 678', total: '€42,50', paymentMethod: 'MB WAY', items: [{ name: 'Produto de exemplo', qty: 1, total: '€21,25' }] },
} satisfies TemplateEntry