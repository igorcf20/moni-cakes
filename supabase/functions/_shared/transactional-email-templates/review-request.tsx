/// <reference types="npm:@types/react@18.3.1" />
// Pedido de avaliação, alguns dias depois da entrega (fila review_requests; ver migration 20261008010000_review_requests.sql).
// Sai pela função de envio quando a loja tiver remetente de e-mail: review_requests_due() -> este modelo -> review_request_mark().
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  orderShort?: string
  reviewProductsUrl?: string
  reviewBrandUrl?: string
}

const Email = ({
  customerName = 'cliente',
  orderShort = '',
  reviewProductsUrl = `${BRAND.url}/dashboard`,
  reviewBrandUrl = `${BRAND.url}/deixar-avaliacao`,
}: Props) => (
  <Layout preview={`O que você achou do pedido #${orderShort}?`}>
    <Heading style={styles.h1}>O que você achou?</Heading>
    <Text style={styles.text}>Olá {customerName}, o seu pedido <strong>#{orderShort}</strong> chegou há alguns dias. Conte para outros clientes o que achou dos produtos: leva poucos segundos.</Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={reviewProductsUrl} style={styles.button}>Avaliar os produtos</Button>
    </Section>
    <Section style={{ textAlign: 'center', padding: '4px 0 8px' }}>
      <Button href={reviewBrandUrl} style={{ ...styles.button, background: 'transparent', color: BRAND.primary, border: `1px solid ${BRAND.primary}` }}>
        Avaliar a {BRAND.name}
      </Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `O que você achou do pedido #${d?.orderShort ?? ''}?`,
  displayName: 'Cliente: pedido de avaliação',
  previewData: { customerName: 'Joana', orderShort: '93AF8C09', reviewProductsUrl: `${BRAND.url}/avaliar/pedido/1`, reviewBrandUrl: `${BRAND.url}/deixar-avaliacao` },
} satisfies TemplateEntry
