/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Layout, Heading, Text, Button, s, BRAND } from './_brand.tsx'

interface Props { siteName: string; siteUrl: string; recipient: string; confirmationUrl: string }

export const SignupEmail = ({ recipient, confirmationUrl }: Props) => (
  <Layout preview={`${BRAND.name}: confirme seu e-mail para começar`}>
    <Heading style={s.h1}>Boas-vindas</Heading>
    <Text style={s.text}>Obrigado por se cadastrar em {BRAND.name}. Para começar a fazer pedidos, confirme seu e-mail ({recipient}) no botão abaixo.</Text>
    <Button style={s.button} href={confirmationUrl}>Confirmar e-mail</Button>
    <Text style={s.muted}>Se não foi você quem criou esta conta, pode ignorar este e-mail com segurança.</Text>
  </Layout>
)

export default SignupEmail
