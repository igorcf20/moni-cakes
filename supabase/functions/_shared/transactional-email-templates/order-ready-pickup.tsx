/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, Steps, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  orderShort?: string
  pickupAddress?: string
  pickupHours?: string
  trackUrl?: string
}

const Email = ({
  customerName = 'cliente',
  orderShort = '',
  pickupAddress = '',
  pickupHours = 'Segunda a sexta, 9h–18h',
  trackUrl = `${BRAND.url}/dashboard`,
}: Props) => (
  <Layout preview={`A tua encomenda #${orderShort} está pronta para levantamento`}>
    <Heading style={styles.h1}>A tua encomenda está pronta</Heading>
    <Text style={styles.text}>
      Olá {customerName}, a encomenda <strong>#{orderShort}</strong> já está pronta para ser levantada.
    </Text>
    <Steps current={4} />
    <div style={styles.card}>
      <Text style={{ ...styles.muted, margin: 0 }}>Local de levantamento</Text>
      <Text style={{ ...styles.text, margin: '4px 0 12px', fontWeight: 700 }}>{pickupAddress}</Text>
      <Text style={{ ...styles.muted, margin: 0 }}>Horário</Text>
      <Text style={{ ...styles.text, margin: '4px 0 0' }}>{pickupHours}</Text>
    </div>
    <Text style={styles.muted}>Traz um documento de identificação e o número do pedido.</Text>
    <Section style={{ textAlign: 'center', padding: '8px 0 4px' }}>
      <Button href={trackUrl} style={styles.button}>Abrir pedido</Button>
    </Section>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Pedido #${d?.orderShort ?? ''} pronto para levantamento`,
  displayName: 'Cliente — Pronto para levantamento',
  previewData: {
    customerName: 'Joana',
    orderShort: '93AF8C09',
    pickupAddress: 'Rua Exemplo 123',
    pickupHours: 'Segunda a sexta, 9h–18h',
  },
} satisfies TemplateEntry