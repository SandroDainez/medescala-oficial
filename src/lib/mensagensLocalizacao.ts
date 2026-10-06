/**
 * Mensagens de erro de localização do check-in.
 *
 * Separadas em um módulo próprio porque o texto depende de ONDE o médico está:
 * no aplicativo instalado não existe "navegador", e mandá-lo abrir as
 * "configurações do navegador" faz com que procure algo que não existe no
 * aparelho. Testado no iPhone: era exatamente o que a tela dizia.
 */

export type Plataforma = 'ios' | 'android' | 'web';

/** Onde o usuário precisa ir para liberar a localização, por plataforma. */
export function ondeLiberarLocalizacao(plataforma: Plataforma): string {
  switch (plataforma) {
    case 'ios':
      return 'Ajustes do iPhone, em Privacidade e Segurança → Localização → MedEscala';
    case 'android':
      return 'Configurações do aparelho, em Apps → MedEscala → Permissões';
    default:
      return 'configurações de localização do seu navegador';
  }
}

export function mensagemPermissaoNegada(plataforma: Plataforma): string {
  return `Permissão de localização negada. Para fazer o check-in, libere o acesso em ${ondeLiberarLocalizacao(
    plataforma,
  )} e tente de novo.`;
}

export function mensagemLocalizacaoIndisponivel(plataforma: Plataforma): string {
  return plataforma === 'web'
    ? 'Não foi possível obter sua localização. Verifique se a localização do aparelho está ligada.'
    : 'Não foi possível obter sua localização. Verifique se a localização do aparelho está ligada e se você não está no modo avião.';
}

export const MENSAGEM_TEMPO_ESGOTADO =
  'Tempo esgotado ao obter a localização. Em área fechada o sinal costuma demorar — chegue perto de uma janela e tente de novo.';

export const MENSAGEM_ERRO_GENERICO = 'Não foi possível obter sua localização. Tente de novo.';
