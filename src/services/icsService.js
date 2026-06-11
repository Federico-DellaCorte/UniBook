/*
 * Service per generare file calendario .ics.
 *
 * Questo file implementa la funzionalità di Livello 3 del progetto:
 * esportare una prenotazione futura confermata in formato iCalendar.
 *
 * Un file .ics è un file testuale standard che descrive uno o più eventi
 * calendario. Può essere importato da applicazioni come Google Calendar,
 * Apple Calendar, Outlook o Thunderbird.
 *
 * Nel nostro caso il file contiene:
 *   - un VCALENDAR, cioè il contenitore generale del calendario;
 *   - un VEVENT, cioè il singolo evento corrispondente alla prenotazione.
 *
 * VEVENT è quindi la parte del file .ics che rappresenta concretamente
 * l'evento: titolo, data di inizio, data di fine, luogo, descrizione e stato.
 *
 * Il progetto genera il file manualmente, senza usare una libreria npm esterna.
 * Questa scelta è utile perché il formato necessario è semplice e permette di
 * mostrare chiaramente come viene costruito l'evento calendario.
 *
 * L'export è pensato per prenotazioni future con status confirmed. Una
 * prenotazione cancellata o passata non viene proposta come evento da aggiungere
 * al calendario.
 *
 * Le date vengono emesse come orari locali, senza suffisso Z (Nel formato iCalendar, 
 * il suffisso Z alla fine di una data/ora significa che quell’orario è espresso in UTC,
 * cioè tempo universale coordinato.) e senza timezone
 * esplicita. Per il contesto del progetto, usato localmente e in ambito
 * universitario italiano, questa scelta è sufficiente e mantiene il file più
 * semplice.
 */

/*
 * Identificativo del programma che genera il file calendario.
 *
 * PRODID è una proprietà richiesta dal formato iCalendar e serve a indicare
 * quale applicazione ha prodotto il file .ics.
 *
 * Non cambia il comportamento dell'evento nel calendario, ma contribuisce a
 * rendere il file conforme allo standard.
 */
const PRODID = '-//UniBook//Politecnico di Milano TIW 2026//IT';

/*
 * Aggiunge uno zero davanti ai numeri a una cifra.
 *
 * Serve per costruire date e orari nel formato richiesto da iCalendar.
 * Per esempio:
 *   5  -> "05"
 *   12 -> "12"
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/*
 * Converte una data del database nel formato richiesto da iCalendar.
 *
 * Nel database le prenotazioni sono salvate così:
 *
 *   YYYY-MM-DD HH:MM
 *
 * Il formato iCalendar usato qui è:
 *
 *   YYYYMMDDTHHMMSS
 *
 * Esempio:
 *   2026-06-05 09:30
 *   diventa
 *   20260605T093000
 *
 * I secondi vengono sempre messi a 00 perché UniBook lavora con slot da
 * 30 minuti e non gestisce prenotazioni al secondo.
 */
function formatIcsLocalDateTime(isoDateTime) {
  const date = isoDateTime.substring(0, 10).replace(/-/g, '');
  const time = isoDateTime.substring(11, 16).replace(':', '');
  return `${date}T${time}00`;
}

/*
 * Genera il DTSTAMP dell'evento.
 *
 * DTSTAMP indica il momento in cui il file .ics viene creato.
 * Qui viene espresso in UTC, cioè nel tempo universale coordinato,
 * e per questo alla fine della stringa viene aggiunto il suffisso "Z".
 *
 * Nel formato iCalendar, la "Z" finale significa proprio:
 * "questo orario è in UTC".
 *
 * Esempio:
 *   20260525T143000Z
 *
 * significa 25 maggio 2026 alle 14:30 UTC.
 *
 * DTSTART e DTEND, invece, nel nostro file non hanno la Z perché rappresentano
 * l'orario locale della prenotazione, cioè l'orario che l'utente ha scelto
 * nell'applicazione.
 */
function nowUtcStamp() {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  );
}

/*
 * Rende sicuri i testi inseriti nel file .ics.
 *
 * Alcuni caratteri hanno significato speciale nel formato iCalendar, per
 * esempio backslash, punto e virgola, virgola e newline.
 *
 * Questa funzione li trasforma nella forma corretta, così titolo, luogo e
 * descrizione non rompono la struttura del file.
 *
 * Esempio: una descrizione con una nuova riga viene codificata usando \n
 * all'interno della proprietà DESCRIPTION.
 */
function escapeIcsText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/*
 * Spezza le righe troppo lunghe del file .ics.
 *
 * Lo standard iCalendar prevede che le righe molto lunghe vengano "foldate",
 * cioè divise su più righe. Le righe successive iniziano con uno spazio.
 *
 * Nella maggior parte dei casi i testi di UniBook sono brevi, ma questa funzione
 * rende il file più robusto se una risorsa ha nome, luogo o descrizione lunghi.
 */
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      parts.push(line.substring(0, 75));
      i = 75;
    } else {
      parts.push(' ' + line.substring(i, i + 74));
      i += 74;
    }
  }
  return parts.join('\r\n');
}

/*
 * Costruisce il contenuto completo del file .ics per una prenotazione.
 *
 * Questa è la funzione principale del service.
 *
 * Riceve due oggetti:
 *   - booking: contiene i dati della prenotazione, come id, start_at ed end_at;
 *   - resource: contiene i dati della risorsa, come nome, categoria, capienza,
 *     luogo e descrizione.
 *
 * A partire da questi dati costruisce una stringa di testo conforme al formato
 * iCalendar. La stringa contiene un VCALENDAR, cioè il contenitore generale, e
 * un VEVENT, cioè il singolo evento calendario relativo alla prenotazione.
 *
 * Le proprietà principali dell'evento sono:
 *   - UID: identificativo unico dell'evento;
 *   - DTSTAMP: momento in cui il file viene generato;
 *   - DTSTART: inizio della prenotazione;
 *   - DTEND: fine della prenotazione;
 *   - SUMMARY: titolo dell'evento;
 *   - LOCATION: luogo della risorsa;
 *   - DESCRIPTION: descrizione testuale;
 *   - STATUS: stato dell'evento.
 *
 * Il risultato finale non è ancora un file fisico: è una stringa. Sarà poi la
 * route a inviarla al browser con gli header corretti per far scaricare il file
 * .ics.
 */
function buildIcsForBooking(booking, resource) {
  // Stato dell'evento nel calendario.
  // L'export viene permesso solo per prenotazioni future confermate,
  // quindi lo stato dell'evento .ics è sempre CONFIRMED.
  const status = 'CONFIRMED';
  // Titolo dell'evento che comparirà nel calendario dell'utente.
  const summary = `UniBook · ${resource.name}`;
  // Luogo dell'evento. Se la risorsa non ha una location, uso stringa vuota.
  const location = resource.location || '';
  // Descrizione dell'evento.
  // Raccolgo alcune informazioni utili sulla prenotazione e sulla risorsa,
  // evitando dati personali non necessari.
  const descParts = [
    `Prenotazione UniBook (id ${booking.id})`,
    `Categoria: ${resource.type}`,
    `Capienza risorsa: ${resource.capacity}`,
  ];
  if (resource.description) {
    descParts.push(resource.description);
  }
  const description = descParts.join('\n');

  // UID dell'evento.
  // Serve al calendario esterno per identificare in modo stabile questa
  // prenotazione come evento unico.
  const uid = `unibook-booking-${booking.id}@unibook.local`;

  // Righe base del file iCalendar.
  // Qui viene costruita la struttura VCALENDAR + VEVENT come elenco di stringhe.
  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtcStamp()}`,
    `DTSTART:${formatIcsLocalDateTime(booking.start_at)}`,
    `DTEND:${formatIcsLocalDateTime(booking.end_at)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // Prima applico il folding alle righe troppo lunghe, poi unisco tutto con CRLF.
  // Il file termina con CRLF per essere più compatibile con i client calendario.
  return rawLines.map(foldLine).join('\r\n') + '\r\n';
}

/*
 * Genera il nome del file .ics da proporre al browser.
 *
 * Il nome contiene l'id della prenotazione, così è breve, prevedibile e privo
 * di caratteri problematici.
 *
 * Evitiamo di usare il nome della risorsa perché potrebbe contenere spazi,
 * accenti o simboli non sempre gestiti bene nei nomi file.
 */
function fileNameForBooking(booking) {
  return `unibook-booking-${booking.id}.ics`;
}

/*
 * Esportazione delle funzioni del service.
 *
 * buildIcsForBooking viene usata dalla route che deve generare il contenuto
 * del file .ics da inviare al browser.
 *
 * fileNameForBooking viene usata per costruire il nome del file scaricato,
 * per esempio unibook-booking-12.ics.
 *
 * _internal espone alcune funzioni interne solo per eventuali test mirati.
 * Non sono la parte principale del service, ma possono essere utili per
 * verificare separatamente formattazione delle date, escape del testo e folding
 * delle righe lunghe.
 */
module.exports = {
  buildIcsForBooking,
  fileNameForBooking,
  // Esposti per testabilità: la generazione di DTSTAMP e l'escape
  // sono i due punti più sensibili e meritano test mirati.
  _internal: { formatIcsLocalDateTime, escapeIcsText, foldLine, nowUtcStamp },
};
