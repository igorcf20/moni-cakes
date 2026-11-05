/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Layout, Heading, Text, Button, s, BRAND } from './_brand.tsx'

interface Props { siteName: string; confirmationUrl: string }

export const MagicLinkEmail = ({ confirmationUrl }: Props) => (
  <Layout preview={`${BRAND.name}: seu link de acesso`}>
    <Heading style={s.h1}>Link de acesso</Heading>
    <Text style={s.text}>Clique no botão abaixo para entrar na sua conta em {BRAND.name}. Este link expira em breve.</Text>
    <Button style={s.button} href={confirmationUrl}>Entrar agora</Button>
    <Text style={s.muted}>Se você não pediu este link, pode ignorar este e-mail com segurança.</Text>
  </Layout>
)

export default MagicLinkEmail
