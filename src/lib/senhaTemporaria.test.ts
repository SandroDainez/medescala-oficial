import { describe, it, expect } from 'vitest';
import { gerarSenhaTemporaria } from './senhaTemporaria';

describe('gerarSenhaTemporaria', () => {
  it('tem o tamanho pedido', () => {
    expect(gerarSenhaTemporaria()).toHaveLength(12);
    expect(gerarSenhaTemporaria(20)).toHaveLength(20);
  });

  it('não repete entre chamadas', () => {
    const geradas = new Set(Array.from({ length: 50 }, () => gerarSenhaTemporaria()));
    expect(geradas.size).toBe(50);
  });

  it('nunca cai numa senha vazada — era o defeito que deixava hospital sem admin', () => {
    const vazadas = ['123456', '12345678', 'senha123', 'password', 'medescala'];
    for (let i = 0; i < 200; i += 1) {
      expect(vazadas).not.toContain(gerarSenhaTemporaria());
    }
  });

  it('evita caractere ambíguo, porque alguém vai ditar isso por telefone', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(gerarSenhaTemporaria(24)).not.toMatch(/[0O1lI]/);
    }
  });

  it('usa só letras e números — sem símbolo que se perde ao copiar', () => {
    expect(gerarSenhaTemporaria(64)).toMatch(/^[A-Za-z2-9]+$/);
  });
});
