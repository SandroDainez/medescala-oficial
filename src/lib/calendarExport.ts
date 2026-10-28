interface ShiftEvent {
  id: string;
  title: string;
  hospital: string;
  location?: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  sector_name?: string;
}

/** Como o arquivo chegou ao médico. A tela precisa saber para dizer o próximo passo. */
export type EntregaDoCalendario = 'compartilhado' | 'baixado' | 'falhou';

function dataHoraICS(data: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${data.getFullYear()}${p(data.getMonth() + 1)}${p(data.getDate())}` +
    `T${p(data.getHours())}${p(data.getMinutes())}00`
  );
}

/**
 * Início e fim do plantão. O gerador antigo carimbava a MESMA data nos dois:
 * um plantão das 19h às 7h virava um evento que termina doze horas antes de
 * começar, e o calendário recusa ou entorta o evento. Plantão noturno é metade
 * da escala de um médico.
 */
export function periodoDoPlantao(shift: ShiftEvent): { inicio: Date; fim: Date } {
  const inicio = new Date(`${shift.shift_date}T${shift.start_time}`);
  const fim = new Date(`${shift.shift_date}T${shift.end_time}`);

  if (fim <= inicio) {
    fim.setDate(fim.getDate() + 1);
  }

  return { inicio, fim };
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * O RFC 5545 limita a linha a 75 octetos; o que passa disso continua na linha
 * seguinte começando por espaço. Sem isso, um nome de hospital comprido pode
 * derrubar o parser mais rigoroso.
 */
export function dobrarLinhas(linhas: string[]): string[] {
  const dobradas: string[] = [];

  for (const linha of linhas) {
    if (linha.length <= 75) {
      dobradas.push(linha);
      continue;
    }
    dobradas.push(linha.slice(0, 75));
    for (let i = 75; i < linha.length; i += 74) {
      dobradas.push(' ' + linha.slice(i, i + 74));
    }
  }

  return dobradas;
}

export function generateICSFile(shifts: ShiftEvent[], calendarName: string = 'Meus Plantões'): string {
  // DTSTAMP é por definição em UTC. O gerador antigo escrevia a hora local e
  // carimbava "Z" em cima, afirmando um fuso que não era o do relógio.
  const agoraUtc = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MedEscala//Plantões//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
  ];

  for (const shift of shifts) {
    const { inicio, fim } = periodoDoPlantao(shift);
    const local = [shift.hospital, shift.location].filter(Boolean).join(' - ');
    // Quebra de linha de verdade: o join com '\\n' escrevia a barra invertida
    // literal, e o médico lia "Setor: UTI\nHospital: X" dentro do evento.
    const descricao = [
      shift.sector_name ? `Setor: ${shift.sector_name}` : '',
      shift.hospital ? `Hospital: ${shift.hospital}` : '',
      shift.location || '',
      '',
      'Gerenciado pelo MedEscala',
    ].filter(Boolean).join('\n');

    linhas.push(
      'BEGIN:VEVENT',
      `UID:${shift.id}@medescala`,
      `DTSTAMP:${agoraUtc}`,
      `DTSTART:${dataHoraICS(inicio)}`,
      `DTEND:${dataHoraICS(fim)}`,
      `SUMMARY:${escapeICSText(shift.title)}`,
      `LOCATION:${escapeICSText(local)}`,
      `DESCRIPTION:${escapeICSText(descricao)}`,
      // Os mesmos avisos do app: 1 dia e 1 hora antes.
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Plantão amanhã',
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Plantão em 1 hora',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  linhas.push('END:VCALENDAR');

  // O RFC exige CRLF. Vários apps toleram só \n, outros não.
  return dobrarLinhas(linhas).join('\r\n') + '\r\n';
}

function arquivoICS(content: string, filename: string): File {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  return new File([blob], filename, { type: 'text/calendar' });
}

export function downloadICSFile(content: string, filename: string = 'meus-plantoes.ics'): boolean {
  try {
    const url = URL.createObjectURL(arquivoICS(content, filename));

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revogar na mesma linha do clique cancelava o download antes de ele
    // começar em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (error) {
    console.error('[calendarExport] Falha ao baixar o arquivo:', error);
    return false;
  }
}

export async function shareICSFile(
  content: string,
  filename: string = 'meus-plantoes.ics',
): Promise<EntregaDoCalendario> {
  const file = arquivoICS(content, filename);

  // Num app salvo na tela de início (PWA), o download por link costuma ser
  // ignorado em silêncio pelo iOS — nada acontece e o médico acha que o app
  // falhou. O compartilhamento é o caminho que funciona ali: a folha do
  // sistema abre e o Calendário é uma das opções.
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Meus Plantões',
        text: 'Plantões do MedEscala para o seu calendário',
      });
      return 'compartilhado';
    } catch (error) {
      // Cancelar não é erro: o médico desistiu, e dizer "baixado" seria mentira.
      if ((error as DOMException)?.name === 'AbortError') {
        return 'falhou';
      }
      console.log('[calendarExport] Compartilhamento indisponível, tentando download');
    }
  }

  return downloadICSFile(content, filename) ? 'baixado' : 'falhou';
}
