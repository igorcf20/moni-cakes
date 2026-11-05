/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Layout, Heading, Text, s } from './_brand.tsx'

interface Props { token: string }

export const ReauthenticationEmail = ({ token }: Props) => (
  <Layout preview="O teu código de verificação">
    <Heading style={s.h1}>Código de verificação</Heading>
    <Text style={s.text}>Usa o código abaixo para confirmares a tua identidade:</Text>
    <div style={s.code}>{token}</div>
    <Text style={s.muted}>Este código expira em breve. Se não foste tu, ignora este email.</Text>
  </Layout>
)

export default ReauthenticationEmail
