/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Button, Heading, Text, Section } from 'npm:@react-email/components@0.0.22'
import { Layout, Steps, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props { customerName?: string; orderShort?: string; trackUrl?: string }

const Email = ({ customerName = 'cliente', orderShort = '', trackUrl = `${BRAND.url}/dashboard` }: Props) => (
  <Layout preview={`O teu pedido #${orderShort} está em produção`}>
    <Heading style={styles.h1}>Em produção 🛠️</Heading>
    <Text style={styles.text}>Olá {customerName}, o pedido <strong>#{orderShort}</strong> entrou em produção. Estamos a tratar com todo o cuidado de cada detalhe.</Text>
    <Steps current={3} />
    <Text style={styles.muted}>Tempo médio de produção: 24h úteis. Avisamos-te assim que sair para envio com o código de rastreio.</Text>
    <Section style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <Button href={trackUrl} style={styles.button}>Acompanhar pedido</Button>
    </Section>
  </Layout>
)
export const template = {
  component: Email,
  subject: (d: Props) => `Pedido #${d?.orderShort ?? ''} em produção`,
  displayName: 'Cliente — Em produção',
  previewData: { customerName: 'Joana', orderShort: '93AF8C09' },
} satisfies TemplateEntry