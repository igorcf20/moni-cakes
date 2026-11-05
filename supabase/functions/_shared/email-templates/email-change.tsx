/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Layout, Heading, Text, Button, s } from './_brand.tsx'

interface Props { siteName: string; oldEmail: string; email: string; newEmail: string; confirmationUrl: string }

export const EmailChangeEmail = ({ oldEmail, newEmail, confirmationUrl }: Props) => (
  <Layout preview="Confirma a alteração do teu email">
    <Heading style={s.h1}>Alteração de email</Heading>
    <Text style={s.text}>Pediste para alterar o email da tua conta de <strong>{oldEmail}</strong> para <strong>{newEmail}</strong>. Confirma clicando no botão abaixo.</Text>
    <Button style={s.button} href={confirmationUrl}>Confirmar alteração</Button>
    <Text style={s.muted}>Se não foste tu, ignora este email — o teu email anterior continua ativo.</Text>
  </Layout>
)

export default EmailChangeEmail
