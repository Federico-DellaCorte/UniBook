/*
 * Utility per date, orari e slot temporali.
 *
 * Questo file centralizza tutte le funzioni di supporto legate al tempo:
 * validazione delle date, validazione degli orari, conversione tra orari e
 * minuti, generazione degli slot da 30 minuti, formattazione italiana delle
 * date, calcolo dei giorni della settimana e gestione del caso speciale 24:00.
 *
 * Nel progetto le prenotazioni vengono salvate nel database come stringhe nel
 * formato:
 *
 *   YYYY-MM-DD HH:MM
 *
 * Per esempio:
 *
 *   2026-06-05 09:30
 *
 * Usare sempre lo stesso formato è importante perché SQLite può confrontare
 * queste stringhe in modo coerente con l'ordine cronologico.
 *
 * Questo file evita di duplicare logica temporale in route, service e seed.
 * Se un domani si volessero cambiare gli slot da 30 minuti a 15 minuti, oppure
 * modificare la gestione di 24:00, questo sarebbe uno dei primi file da
 * controllare.
 */

/*
 * Regex per validare gli orari degli slot.
 *
 * SLOT_REGEX accetta gli orari utilizzabili come ora di inizio:
 * da 00:00 a 23:30, solo su multipli di 30 minuti.
 *
 * END_SLOT_REGEX accetta gli orari utilizzabili come ora di fine:
 * da 00:30 a 23:30 più il caso speciale 24:00.
 *
 * 24:00 è ammesso solo come fine, perché rappresenta il confine di fine giornata.
 * Non avrebbe senso usarlo come ora di inizio di una prenotazione.
 */
const SLOT_REGEX = /^([01]\d|2[0-3]):(00|30)$/;
const END_SLOT_REGEX = /^(([01]\d|2[0-3]):(00|30)|24:00)$/;

/*
 * Regex per validare il formato della data.
 *
 * Accetta solo stringhe nel formato YYYY-MM-DD.
 * Questa regex controlla la forma della stringa, ma non basta da sola a sapere
 * se la data esiste davvero. Per esempio, 2026-02-30 ha forma corretta ma non
 * è una data reale.
 *
 * Per questo isValidIsoDate() usa anche un oggetto Date per verificare la
 * coerenza effettiva di anno, mese e giorno.
 */
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/*
 * Aggiunge lo zero davanti ai numeri a una cifra.
 *
 * Serve per ottenere sempre date e orari con due cifre, per esempio:
 *   5  -> "05"
 *   12 -> "12"
 *
 * Questo è importante perché il formato YYYY-MM-DD HH:MM deve restare stabile.
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/*
 * Restituisce la data e l'ora attuali nel formato usato dal database.
 *
 * Il risultato è una stringa "YYYY-MM-DD HH:MM" basata sull'orario locale
 * della macchina.
 *
 * È utile quando il progetto deve confrontare una prenotazione con il momento
 * attuale, per esempio per capire se è futura o passata.
 */
function currentLocalIsoMinute() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    ` ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/*
 * Unisce data e ora in un unico timestamp.
 *
 * Riceve:
 *   - dateStr: una data nel formato YYYY-MM-DD;
 *   - timeStr: un orario nel formato HH:MM.
 *
 * Restituisce la stringa completa usata nelle colonne start_at ed end_at:
 *
 *   YYYY-MM-DD HH:MM
 */
function combineDateTime(dateStr, timeStr) {
  return `${dateStr} ${timeStr}`;
}


function isValidSlot(timeStr) {
  return typeof timeStr === 'string' && SLOT_REGEX.test(timeStr);
}

/*
 * Controlla se un orario è valido come ora di inizio.
 *
 * L'ora di inizio deve essere compresa tra 00:00 e 23:30 e deve cadere su uno
 * slot da 30 minuti.
 *
 * 24:00 non è accettato come inizio, perché rappresenta solo la fine giornata.
 */
function isValidStartSlot(timeStr) {
  return typeof timeStr === 'string' && SLOT_REGEX.test(timeStr);
}

/*
 * Controlla se un orario è valido come ora di fine.
 *
 * Accetta gli slot da 00:30 a 23:30 e anche 24:00.
 *
 * 24:00 viene trattato come fine della giornata, non come orario interno al
 * giorno successivo scelto dall'utente.
 */
function isValidEndSlot(timeStr) {
  return typeof timeStr === 'string' && END_SLOT_REGEX.test(timeStr);
}

/*
 * Converte un orario HH:MM in minuti dall'inizio della giornata.
 *
 * Esempi:
 *   00:00 -> 0
 *   09:30 -> 570
 *   24:00 -> 1440
 *
 * Se l'input non è valido restituisce NaN, cioè Not-a-Number.
 * NaN segnala che il risultato non è un numero valido e permette al chiamante
 * di riconoscere un errore invece di continuare con un calcolo sbagliato.
 */
function timeToMinutes(timeStr) {
  if (typeof timeStr !== 'string') return NaN;
  if (timeStr === '24:00') return 24 * 60;
  if (!SLOT_REGEX.test(timeStr)) return NaN;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/*
 * Converte minuti dall'inizio della giornata in formato HH:MM.
 *
 * Esempi:
 *   0    -> "00:00"
 *   570  -> "09:30"
 *   1440 -> "24:00"
 *
 * È la funzione inversa di timeToMinutes() ed è usata per generare gli slot.
 */
function minutesToTime(minutes) {
  if (minutes === 1440) return '24:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/*
 * Verifica se una stringa è una data ISO valida nel formato YYYY-MM-DD.
 *
 * Prima controlla la forma con DATE_REGEX, poi costruisce un oggetto Date e
 * confronta anno, mese e giorno ottenuti con quelli originali.
 *
 * Questo secondo controllo serve a intercettare date formalmente corrette ma
 * inesistenti, come 2026-02-30.
 */
function isValidIsoDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  // Controllo che la data sia "reale" (es. 31 di un mese che ne ha 30
  // non lo è): ricostruiamo l'oggetto Date e ne riformattiamo i
  // componenti, confrontandoli con l'input originale.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

/*
 * Genera tutti gli estremi degli slot tra apertura e chiusura.
 *
 * Esempio:
 *   generateSlots("09:00", "11:00")
 *   -> ["09:00", "09:30", "10:00", "10:30", "11:00"]
 *
 * La funzione restituisce gli estremi, non direttamente le fasce.
 * Le fasce vere si ottengono prendendo coppie consecutive:
 *   09:00-09:30, 09:30-10:00, ...
 */
function generateSlots(opensAt, closesAt) {
  const startMinutes = timeToMinutes(opensAt);
  const endMinutes = timeToMinutes(closesAt);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return [];

  const slots = [];
  for (let t = startMinutes; t <= endMinutes; t += 30) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

/*
 * Genera gli orari validi come inizio prenotazione.
 *
 * Esclude l'ultimo estremo, perché non si può iniziare una prenotazione
 * esattamente all'orario di chiusura: non ci sarebbe spazio per uno slot
 * successivo.
 */
function generateStartSlots(opensAt, closesAt) {
  const all = generateSlots(opensAt, closesAt);
  // L'ultimo edge ("closesAt") non è mai un inizio valido perché
  // dovrebbe essere coppia con un end successivo che non esiste.
  return all.slice(0, -1);
}

/*
 * Genera gli orari validi come fine prenotazione.
 *
 * Esclude il primo estremo, perché non si può finire una prenotazione
 * esattamente all'orario di apertura senza avere un inizio precedente.
 */
function generateEndSlots(opensAt, closesAt) {
  const all = generateSlots(opensAt, closesAt);
  return all.slice(1);
}

/*
 * Normalizza l'orario di fine prenotazione per il database.
 *
 * Il caso speciale è endTime = "24:00".
 *
 * Nel form l'utente può scegliere 24:00 per indicare la fine della giornata.
 * Nel database, però, non conviene salvare "YYYY-MM-DD 24:00", perché potrebbe
 * creare problemi nei confronti cronologici.
 *
 * Per questo 24:00 viene convertito in:
 *
 *   giorno successivo 00:00
 *
 * Esempio:
 *   2026-06-05 + 24:00 -> 2026-06-06 00:00
 *
 * Dal punto di vista dell'utente la prenotazione resta comunque nel giorno
 * scelto, fino al confine di mezzanotte.
 */
function normalizeBookingEndAt(isoDate, endTime) {
  if (endTime === '24:00') {
    return `${addDaysToIsoDate(isoDate, 1)} 00:00`;
  }
  return `${isoDate} ${endTime}`;
}

/*
 * Controlla se inizio e fine appartengono allo stesso giorno logico.
 *
 * Di solito significa che start_at ed end_at hanno la stessa data.
 *
 * Viene accettato anche il caso speciale in cui end_at è la mezzanotte del
 * giorno successivo, perché rappresenta l'orario 24:00 scelto dall'utente.
 *
 * Serve a impedire prenotazioni che attraversano davvero la mezzanotte.
 */
function isSameLogicalDay(startAt, endAt) {
  if (startAt.substring(0, 10) === endAt.substring(0, 10)) return true;
  const next = addDaysToIsoDate(startAt.substring(0, 10), 1);
  return endAt === `${next} 00:00`;
}

/*
 * Restituisce l'ora di fine da mostrare all'utente.
 *
 * Se nel database end_at è stato normalizzato come giorno successivo 00:00,
 * questa funzione lo riconverte visivamente in "24:00".
 *
 * In questo modo l'utente vede l'orario che ha scelto nel form, anche se il
 * database usa una rappresentazione più comoda per i confronti.
 */
function endTimeDisplay(startAt, endAt) {
  if (endAt.substring(0, 10) !== startAt.substring(0, 10) && endAt.endsWith(' 00:00')) {
    return '24:00';
  }
  return endAt.substring(11, 16);
}

/*
 * Restituisce la data di oggi nel formato YYYY-MM-DD.
 *
 * È utile nei form, per esempio per impostare la data minima selezionabile
 * quando l'utente crea una nuova prenotazione.
 */
function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/*
 * Converte una data ISO nel formato italiano DD/MM/YYYY.
 *
 * Serve per mostrare date più leggibili nei template e nei messaggi.
 */
function formatItalianDate(isoOrIsoMinute) {
  const datePart = isoOrIsoMinute.substring(0, 10);
  const [y, m, d] = datePart.split('-');
  return `${d}/${m}/${y}`;
}

/*
 * Versione breve della data italiana: DD/MM.
 *
 * Utile quando l'anno non serve, per esempio in alcune viste compatte o
 * messaggi sintetici.
 */
function formatItalianDateShort(isoOrIsoMinute) {
  const datePart = isoOrIsoMinute.substring(0, 10);
  const [, m, d] = datePart.split('-');
  return `${d}/${m}`;
}

/*
 * Estrae solo la parte oraria HH:MM da un timestamp YYYY-MM-DD HH:MM.
 */
function extractTime(isoMinute) {
  return isoMinute.substring(11, 16);
}

/*
 * Nomi dei giorni della settimana.
 *
 * Nel progetto la convenzione interna è:
 *   1 = lunedì
 *   2 = martedì
 *   ...
 *   7 = domenica
 *
 * JavaScript invece usa Date.getDay() con:
 *   0 = domenica
 *   1 = lunedì
 *   ...
 *   6 = sabato
 *
 * Le funzioni qui sotto fanno da traduzione tra la convenzione JavaScript e
 * quella più naturale usata nel database resource_availability.
 */
const WEEKDAY_NAMES_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const WEEKDAY_NAMES_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/*
 * Converte una data ISO nel numero del giorno della settimana usato dal DB.
 *
 * Restituisce 1 per lunedì, ..., 7 per domenica.
 */
function weekdayFromIsoDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const js = dt.getDay();
  return js === 0 ? 7 : js;
}

/*
 * Restituisce il nome esteso del giorno, per esempio "Lunedì".
 */
function weekdayNameLong(weekday) {
  return WEEKDAY_NAMES_LONG[weekday - 1] || '';
}

/*
 * Restituisce il nome breve del giorno, per esempio "Lun".
 */
function weekdayNameShort(weekday) {
  return WEEKDAY_NAMES_SHORT[weekday - 1] || '';
}

/*
 * Crea un riassunto leggibile della disponibilità settimanale.
 *
 * Riceve le 7 righe di disponibilità di una risorsa e raggruppa i giorni
 * consecutivi che hanno lo stesso stato e lo stesso orario.
 *
 * Esempio:
 *   Lun–Ven 08:00–22:00
 *   Sab 10:00–18:00
 *   Dom chiusa
 *
 * Questa funzione non cambia i dati: li trasforma solo in stringhe più comode
 * da mostrare nei template.
 */
function summarizeWeeklyAvailability(availability) {
  if (!Array.isArray(availability) || availability.length === 0) return [];

  const segments = [];
  let cur = null;

  for (let i = 0; i < availability.length; i++) {
    const a = availability[i];
    const key = a.is_open ? `${a.opens_at}|${a.closes_at}` : 'closed';
    if (!cur || cur.key !== key) {
      if (cur) segments.push(cur);
      cur = { startIdx: i, endIdx: i, key, sample: a };
    } else {
      cur.endIdx = i;
    }
  }
  if (cur) segments.push(cur);

  return segments.map((seg) => {
    const startName = WEEKDAY_NAMES_SHORT[seg.startIdx];
    const dayLabel = seg.startIdx === seg.endIdx
      ? startName
      : `${startName}–${WEEKDAY_NAMES_SHORT[seg.endIdx]}`;
    const hourLabel = seg.sample.is_open
      ? `${seg.sample.opens_at}–${seg.sample.closes_at}`
      : 'chiusa';
    return `${dayLabel} ${hourLabel}`;
  });
}

/*
 * Aggiunge o sottrae giorni a una data ISO.
 *
 * Riceve una data nel formato YYYY-MM-DD e un numero di giorni delta.
 * Se delta è positivo va avanti nel tempo, se è negativo torna indietro.
 *
 * È usata soprattutto nelle viste calendario, per spostarsi da una settimana
 * alla precedente o alla successiva.
 */
function addDaysToIsoDate(isoDate, delta) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/*
 * Restituisce il lunedì della settimana a cui appartiene una certa data.
 *
 * Serve per costruire viste calendario settimanali sempre allineate da lunedì
 * a domenica.
 */
function mondayOfWeek(isoDate) {
  const weekday = weekdayFromIsoDate(isoDate); // 1..7
  return addDaysToIsoDate(isoDate, -(weekday - 1));
}

/*
 * Costruisce l'elenco dei sette giorni di una settimana.
 *
 * Riceve il lunedì in formato ISO e restituisce un array con data ISO, numero
 * del giorno, nome breve, nome lungo e label già pronte per il template.
 */
function weekDayList(mondayIso) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDaysToIsoDate(mondayIso, i);
    const [y, m, d] = iso.split('-');
    out.push({
      iso,
      weekday: i + 1,
      dayShort: WEEKDAY_NAMES_SHORT[i],
      dayLong: WEEKDAY_NAMES_LONG[i],
      label: `${d}/${m}`,
      labelFull: `${d}/${m}/${y}`,
    });
  }
  return out;
}

/*
 * Restituisce tutti gli slot validi come ora di inizio.
 *
 * È mantenuta come funzione di compatibilità storica e richiama allStartSlots().
 * Oggi il progetto distingue tra slot di inizio e slot di fine, perché 24:00
 * è valido solo come fine.
 */
function allHalfHourSlots() {
  // Mantenuto come alias di `allStartSlots`: storicamente usato
  // dall'admin per popolare i select di disponibilità settimanale,
  // dove però servono in realtà due elenchi distinti (vedi sotto).
  return allStartSlots();
}

/*
 * Tutti gli slot ammessi come ORA INIZIO: 00:00..23:30 (48 valori).
 * Usato nei form (ricerca risorse, disponibilità settimanale admin,
 * prenotazione utente) per popolare i select "ora inizio".
 */
function allStartSlots() {
  const slots = [];
  for (let t = 0; t < 24 * 60; t += 30) slots.push(minutesToTime(t));
  return slots;
}

/*
 * Tutti gli slot ammessi come ORA FINE: 00:30..24:00 (48 valori).
 * Usato nei form per popolare i select "ora fine". Include 24:00
 * come fine giornata; non include 00:00 (che sarebbe < 00:30, e
 * non avrebbe coppia di inizio precedente valida).
 */
function allEndSlots() {
  const slots = [];
  for (let t = 30; t <= 24 * 60; t += 30) slots.push(minutesToTime(t));
  return slots;
}

/*
 * Esportazione delle utility temporali.
 *
 * Route, service, seed e template helper possono importare queste funzioni per
 * lavorare con date, orari, slot, giorni della settimana e formati leggibili
 * senza duplicare la logica temporale in più file.
 */
module.exports = {
  currentLocalIsoMinute,
  combineDateTime,
  isValidSlot,
  isValidStartSlot,
  isValidEndSlot,
  isValidIsoDate,
  generateSlots,
  generateStartSlots,
  generateEndSlots,
  todayIsoDate,
  formatItalianDate,
  formatItalianDateShort,
  extractTime,
  endTimeDisplay,
  weekdayFromIsoDate,
  weekdayNameLong,
  weekdayNameShort,
  summarizeWeeklyAvailability,
  allHalfHourSlots,
  allStartSlots,
  allEndSlots,
  addDaysToIsoDate,
  mondayOfWeek,
  weekDayList,
  timeToMinutes,
  minutesToTime,
  normalizeBookingEndAt,
  isSameLogicalDay,
};
