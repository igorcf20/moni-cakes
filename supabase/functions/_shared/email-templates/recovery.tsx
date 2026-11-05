/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Layout, Heading, Text, Button, s } from './_brand.tsx'

interface Props { siteName: string; confirmationUrl: string }

export const RecoveryEmail = ({ confirmationUrl }: Props) => (
  <Layout preview="Recuperar a tua palavra-passe">
    <Heading style={s.h1}>Recuperar palavra-passe</Heading>
    <Text style={s.text}>Recebemos um pedido para repor a tua palavra-passe. Clica no botão abaixo para definires uma nova.</Text>
    <Button style={s.button} href={confirmationUrl}>Definir nova palavra-passe</Button>
    <Text style={s.muted}>Se não foste tu a fazer este pedido, ignora este email. A tua palavra-passe atual continua válida.</Text>
  </Layout>
)

export default RecoveryEmail
