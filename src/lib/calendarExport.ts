import { format, parseISO } from 'date-fns';

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

function formatICSDate(dateStr: string, timeStr: string): string {
  // Format: YYYYMMDDTHHMMSS
  const date = parseISO(dateStr);
  const [hours, minutes] = timeStr.split(':');
  const formatted = format(date, 'yyyyMMdd');
  return `${formatted}T${hours}${minutes}00`;
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateICSFile(shifts: ShiftEvent[], calendarName: string = 'Meus Plantões'): string {
  const events = shifts.map((shift) => {
    const dtStart = formatICSDate(shift.shift_date, shift.start_time);
    const dtEnd = formatICSDate(shift.shift_date, shift.end_time);
    const summary = escapeICSText(shift.title);
    const location = escapeICSText([shift.hospital, shift.location].filter(Boolean).join(' - '));
    const description = escapeICSText(
      [
        shift.sector_name ? `Setor: ${shift.sector_name}` : '',
        shift.hospital ? `Hospital: ${shift.hospital}` : '',
        shift.location || '',
      ]
        .filter(Boolean)
        .join('\\n')
    );

    return `BEGIN:VEVENT
UID:${shift.id}@medescala
DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss")}Z
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${summary}
LOCATION:${location}
DESCRIPTION:${description}
END:VEVENT`;
  });

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//MedEscala//Plantões//PT
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeICSText(calendarName)}
${events.join('\n')}
END:VCALENDAR`;
}

export function downloadICSFile(content: string, filename: string = 'meus-plantoes.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function shareICSFile(content: string, filename: string = 'meus-plantoes.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const file = new File([blob], filename, { type: 'text/calendar' });

  // Check if Web Share API is available and supports file sharing
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Meus Plantões',
        text: 'Exportar plantões para o calendário',
      });
      return true;
    } catch (error) {
      // User cancelled or share failed, fall back to download
      console.log('Share cancelled, falling back to download');
    }
  }
  
  // Fallback to download
  downloadICSFile(content, filename);
  return false;
}
