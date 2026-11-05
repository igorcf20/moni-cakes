/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, Steps, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props { customerName?: string; orderShort?: string; trackingCode?: string; trackingUrl?: string; carrier?: string; trackUrl?: string }

const Email = ({ customerName = 'cliente', orderShort = '', trackingCode = '', trackingUrl = '', carrier = 'transportadora', trackUrl = `${BRAND.url}/dashboard` }: Props) => (
  <Layout preview={`O teu pedido #${orderShort} foi enviado`}>
    <Heading style={styles.h1}>O teu pedido foi enviado 📦</Heading>
    <Text style={styles.text}>Olá {customerName}, o pedido <strong>#{orderShort}</strong> saiu para entrega via <strong>{carrier}</strong>.</Text>
    <Steps current={4} />
    {trackingCode && (
      <div style={styles.card}>
        <Text style={{ ...styles.muted, margin: 0 }}>Código de rastreio</Text>
        <Text style={{ ...styles.h1, margin: '4px 0 8px', fontFamily: 'Courier, monospace' }}>{trackingCode}</Text>
        {trackingUrl && (
          <Section style={{ textAlign: 'left' }}>
            <Button href={trackingUrl} style={styles.button}>Seguir encomenda</Button>
          </Section>
        )}
      </div>
    )}
    <Text style={styles.muted}>Podes acompanhar todos os detalhes na tua conta.</Text>
    <Section style={{ textAlign: 'center', padding: '8px 0 4px' }}>
      <Button href={trackUrl} style={styles.outlineButton}>Abrir pedido</Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `Pedido #${d?.orderShort ?? ''} enviado`,
  displayName: 'Cliente — Pedido enviado',
  previewData: { customerName: 'Joana', orderShort: '93AF8C09', trackingCode: 'RR123456789PT', trackingUrl: 'https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=RR123456789PT', carrier: 'CTT' },
} satisfies TemplateEntry