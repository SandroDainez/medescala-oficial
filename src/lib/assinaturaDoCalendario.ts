// Endereço que o celular consulta para manter a escala em dia.
//
// Assinar não é o mesmo que importar: o aparelho guarda este endereço e volta
// nele sozinho, algumas vezes por dia. Trocou um plantão na escala, troca no
// calendário do médico, sem ninguém fazer nada.

export const CAMINHO_DO_CALENDARIO = '/functions/v1/calendario-plantoes';

export interface EnderecoDoCalendario {
  /** Para abrir no navegador ou conferir o conteúdo. */
  https: string;
  /** O que o iPhone e o Android entendem como "assinar este calendário". */
  webcal: string;
}

export function montarEnderecoDoCalendario(baseUrl: string, token: string): EnderecoDoCalendario {
  const base = baseUrl.replace(/\/+$/, '');
  const https = `${base}${CAMINHO_DO_CALENDARIO}?chave=${encodeURIComponent(token)}`;

  // webcal:// é o mesmo endereço com outro protocolo. É ele que faz o sistema
  // abrir o app de calendário em vez de baixar um arquivo solto.
  return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}

/**
 * Nunca mostrar o endereço inteiro numa tela que pode ser vista por cima do
 * ombro, ou numa captura de tela enviada ao suporte. Quem precisa do endereço
 * completo usa o botão de copiar.
 */
export function mascararToken(token: string): string {
  if (token.length <= 10) return '••••••';
  return `${token.slice(0, 4)}${'•'.repeat(12)}${token.slice(-4)}`;
}
