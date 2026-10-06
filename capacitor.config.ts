import { CapacitorConfig } from '@capacitor/cli';

/**
 * O app embarca o próprio build (dist) e NÃO carrega o site remoto.
 *
 * Havia aqui um `server.url` apontando para a Vercel: o aplicativo era uma casca
 * em volta do site. Isso reprova nas lojas (a Apple trata como app de
 * funcionalidade mínima) e deixa o app inútil sem internet — a escala nem abre.
 *
 * Para rodar contra um servidor de desenvolvimento, use CAP_SERVER_URL:
 *   CAP_SERVER_URL=http://192.168.0.10:5173 npx cap run ios
 * Nunca deixe essa variável definida ao gerar o pacote que vai para a loja.
 */
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.medescala.app',
  appName: 'MedEscala',
  webDir: 'dist',
  ...(devServerUrl
    ? { server: { url: devServerUrl, cleartext: true } }
    : {}),
};

export default config;
