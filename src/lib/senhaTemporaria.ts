// Senha de primeiro acesso de um administrador inicial.
//
// Não pode ser fixa: o Supabase Auth recusa senhas vazadas (`123456` entre
// elas) com 422, e o hospital nascia sem administrador nenhum. Também não pode
// ser impronunciável, porque alguém vai ditar isso por telefone — daí o
// alfabeto sem 0/O, 1/l/I e sem símbolos.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function gerarSenhaTemporaria(tamanho = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  let senha = '';

  for (let i = 0; i < tamanho; i += 1) {
    senha += ALFABETO[bytes[i] % ALFABETO.length];
  }

  return senha;
}
