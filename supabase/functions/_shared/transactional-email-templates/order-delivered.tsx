/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, Steps, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  orderShort?: string
  /** Deprecated — kept for backwards compatibility with earlier payloads. */
  reviewUrl?: string
  reviewProductsUrl?: string
  reviewBrandUrl?: string
}

const Email = ({
  customerName = 'cliente',
  orderShort = '',
  reviewUrl,
  reviewProductsUrl = reviewUrl || `${BRAND.url}/dashboard`,
  reviewBrandUrl = `${BRAND.url}/deixar-avaliacao`,
}: Props) => (
  <Layout preview={`Pedido #${orderShort} entregue`}>
    <Heading style={styles.h1}>Pedido entregue</Heading>
    <Text style={styles.text}>Olá {customerName}, o pedido <strong>#{orderShort}</strong> foi marcado como entregue. Esperamos que você goste.</Text>
    <Steps current={5} />
    <Text style={styles.text}>Sua opinião ajuda outros clientes: você pode avaliar os produtos que comprou e também a sua experiência de compra em {BRAND.name}.</Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={reviewProductsUrl} style={styles.button}>Avaliar os produtos</Button>
    </Section>
    <Section style={{ textAlign: 'center', padding: '4px 0 8px' }}>
      <Button href={reviewBrandUrl} style={{ ...styles.button, background: 'transparent', color: BRAND.primary, border: `1px solid ${BRAND.primary}` }}>
        Avaliar a loja
      </Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `Pedido #${d?.orderShort ?? ''} entregue`,
  displayName: 'Cliente: pedido entregue',
  previewData: { customerName: 'Joana', orderShort: '93AF8C09', reviewProductsUrl: `${BRAND.url}/avaliar/pedido/1`, reviewBrandUrl: `${BRAND.url}/deixar-avaliacao` },
} satisfies TemplateEntry