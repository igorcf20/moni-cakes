/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Heading, Text } from 'npm:@react-email/components@0.0.22'
import { Layout, styles, BRAND } from './brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  email?: string
  subject?: string
  message?: string
}

const Email = ({ name = '', email = '', subject = '', message = '' }: Props) => (
  <Layout preview={`Nova mensagem de contacto — ${name}`}>
    <Heading style={styles.h1}>Nova mensagem de contacto ✉️</Heading>
    <Text style={styles.text}>Recebeste uma nova mensagem através do formulário do site.</Text>
    <div style={styles.card}>
      <table role="presentation" style={styles.table}>
        <tbody>
          <tr><td style={styles.tdLabel}>Nome</td><td style={styles.tdValue}>{name || '—'}</td></tr>
          <tr><td style={styles.tdLabel}>Email</td><td style={styles.tdValue}>{email || '—'}</td></tr>
          <tr><td style={styles.tdLabel}>Assunto</td><td style={{ ...styles.tdValue, color: BRAND.primary }}>{subject || '—'}</td></tr>
        </tbody>
      </table>
    </div>
    <Heading style={styles.h2}>Mensagem</Heading>
    <Text style={{ ...styles.text, whiteSpace: 'pre-wrap' }}>{message || '—'}</Text>
  </Layout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `📩 Contacto: ${d?.subject || 'Nova mensagem'} — ${d?.name || ''}`,
  displayName: 'Admin — Mensagem de contacto',
  previewData: { name: 'Joana Silva', email: 'joana@example.com', subject: 'Dúvida sobre um produto', message: 'Olá, gostava de saber...' },
} satisfies TemplateEntry
