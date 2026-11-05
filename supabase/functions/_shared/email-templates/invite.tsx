/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Layout, Heading, Text, Button, s, BRAND } from './_brand.tsx'

interface Props { siteName: string; siteUrl: string; confirmationUrl: string }

export const InviteEmail = ({ confirmationUrl }: Props) => (
  <Layout preview={`${BRAND.name}: você recebeu um convite`}>
    <Heading style={s.h1}>Você tem um convite</Heading>
    <Text style={s.text}>Você recebeu um convite para criar sua conta em {BRAND.name}. Aceite o convite para começar.</Text>
    <Button style={s.button} href={confirmationUrl}>Aceitar convite</Button>
    <Text style={s.muted}>Se você não esperava este convite, pode ignorar este e-mail.</Text>
  </Layout>
)

export default InviteEmail
