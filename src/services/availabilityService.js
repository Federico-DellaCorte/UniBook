/*
 * Service di disponibilità delle risorse.
 *
 * Questo file centralizza la logica che risponde alla domanda:
 * "questa risorsa è disponibile in questo giorno e in questa fascia oraria?"
 *
 * Non si limita a leggere le prenotazioni dal database, ma interpreta quei dati
 * insieme alla capienza della risorsa e alla disponibilità settimanale.
 *
 * Viene usato in più punti del progetto:
 *   - nella pagina dettaglio risorsa, per mostrare l'occupazione del giorno;
 *   - nella ricerca risorse, per mostrare solo risorse disponibili in una fascia;
 *   - nell'endpoint JSON /api/availability, chiamato via fetch dal browser;
 *   - nel bookingService, per calcolare la capienza contemporanea disponibile.
 *
 * La logica principale lavora su slot da 30 minuti e su intervalli semi-aperti:
 *
 *   [inizio, fine)
 *
 * Questo significa che lo slot include l'istante di inizio ma non quello di fine.
 * Per esempio, una prenotazione 10:00-11:00 e una 11:00-12:00 sono adiacenti,
 * ma non sono in conflitto.
 *
 * Tenere questa logica in un service unico evita incoerenze: la disponibilità
 * mostrata all'utente, quella usata dalla ricerca e quella controllata prima
 * della prenotazione devono seguire la stessa regola.
 */

const bookingRepo = require('../repositories/bookingRepo');
const availabilityRepo = require('../repositories/resourceAvailabilityRepo');
const dt = require('../helpers/dateTime');

/*
 * Calcola il picco massimo di occupazione contemporanea in un intervallo.
 *
 * Questa funzione serve soprattutto per risorse con capacity maggiore di 1.
 * In quel caso non basta sapere quante prenotazioni si sovrappongono in totale:
 * bisogna sapere quante sono contemporanee nello stesso momento.
 *
 * Esempio:
 *   capacity = 2
 *   prenotazione A: 10:00-11:00
 *   prenotazione B: 11:00-12:00
 *   nuova richiesta: 10:00-12:00
 *
 * A e B si sovrappongono entrambe alla nuova richiesta, ma non sono
 * contemporanee tra loro. Il picco reale è 1, quindi aggiungendo la nuova
 * prenotazione si arriva a 2: la richiesta può essere accettata.
 *
 * L'algoritmo usato è uno sweep-line:
 *   - per ogni prenotazione creo un evento di inizio e uno di fine;
 *   - ordino gli eventi nel tempo;
 *   - scorro gli eventi aumentando o diminuendo il numero di occupati;
 *   - salvo il valore massimo raggiunto.
 *
 * A parità di istante, gli eventi di fine vengono processati prima degli eventi
 * di inizio. Questo mantiene corretta la logica degli intervalli semi-aperti:
 * se una prenotazione finisce alle 11:00 e un'altra inizia alle 11:00, non si
 * sovrappongono.
 */
function computeMaxOccupancy(existingOverlaps, newStart, newEnd) {
  if (existingOverlaps.length === 0) return 0;

  const events = [];
  for (const b of existingOverlaps) {
    const cs = b.start_at < newStart ? newStart : b.start_at;
    const ce = b.end_at > newEnd ? newEnd : b.end_at;
    events.push({ t: ce, kind: 0 });
    events.push({ t: cs, kind: 1 });
  }
  events.sort((a, b) => {
    if (a.t !== b.t) return a.t < b.t ? -1 : 1;
    return a.kind - b.kind;
  });

  let occ = 0;
  let max = 0;
  for (const ev of events) {
    if (ev.kind === 1) {
      occ += 1;
      if (occ > max) max = occ;
    } else {
      occ -= 1;
    }
  }
  return max;
}

/*
 * Conta quanti posti sono occupati su una risorsa in uno slot a 30
 * minuti specifico, dato l'insieme completo delle prenotazioni
 * confermate del giorno. Lo slot ha confini semi-aperti [start, end),
 * coerente con tutto il resto del progetto.
 *
 * Una prenotazione che inizia esattamente alla fine dello slot (es.
 * 09:30 quando lo slot è 09:00–09:30) non occupa lo slot: in linea
 * con l'invariante "intervalli adiacenti non collidono".
 */
function countSlotOccupancy(slotStart, slotEnd, dayBookings) {
  let count = 0;
  for (const b of dayBookings) {
    if (b.start_at < slotEnd && b.end_at > slotStart) count += 1;
  }
  return count;
}

/*
 * Calcola l'occupazione giornaliera di una risorsa.
 *
 * Questa funzione costruisce l'elenco degli slot disponibili in un certo giorno
 * e per ciascuno calcola:
 *   - quanti posti sono occupati;
 *   - qual è la capienza totale;
 *   - quanti posti restano disponibili;
 *   - lo stato dello slot: free, partial o full.
 *
 * Se la risorsa non esiste, la data non è valida o la risorsa è chiusa in quel
 * giorno, la funzione restituisce isOpen: false e nessuno slot.
 *
 * I dati restituiti sono aggregati: non vengono esposti username, user_id o
 * dettagli personali di chi ha prenotato. Questo è importante perché nella
 * pagina dettaglio risorsa l'utente deve vedere la disponibilità, non i dati
 * degli altri utenti.
 *
 * Questa funzione è usata per mostrare all'utente una panoramica leggibile
 * della giornata selezionata.
 */
function computeDayOccupancy(resource, isoDate) {
  if (!resource || !dt.isValidIsoDate(isoDate)) {
    return { isOpen: false, capacity: resource ? resource.capacity : 0, slots: [] };
  }

  const weekday = dt.weekdayFromIsoDate(isoDate);
  const dayAvailability = availabilityRepo.findOne(resource.id, weekday);
  if (!dayAvailability || dayAvailability.is_open !== 1) {
    return { isOpen: false, capacity: resource.capacity, slots: [] };
  }

  // Carichiamo in un'unica query tutte le prenotazioni confermate
  // della risorsa che si sovrappongono al giorno richiesto. Lo
  // facciamo usando l'overlap classico contro l'intervallo
  // [00:00, 24:00) del giorno: con il formato "YYYY-MM-DD HH:MM"
  // l'ordinamento lessicografico coincide con il cronologico,
  // quindi possiamo usare findOverlapping del bookingRepo che già
  // accetta una finestra arbitraria.
  const dayStart = `${isoDate} 00:00`;
  const dayEnd = `${isoDate} 23:59`;
  const dayBookings = bookingRepo.findOverlapping(resource.id, dayStart, dayEnd);

  // Generiamo lo slot orario coerente con la finestra di apertura
  // del giorno specifico (non 24h): il dettaglio risorsa
  // mostra solo le ore in cui la risorsa è prenotabile.
  const slotEdges = dt.generateSlots(dayAvailability.opens_at, dayAvailability.closes_at);

  const slots = [];
  for (let i = 0; i < slotEdges.length - 1; i++) {
    const start = slotEdges[i];
    const end = slotEdges[i + 1];
    const occupied = countSlotOccupancy(
      `${isoDate} ${start}`,
      `${isoDate} ${end}`,
      dayBookings
    );
    const available = Math.max(0, resource.capacity - occupied);
    let status;
    if (occupied <= 0) status = 'free';
    else if (occupied >= resource.capacity) status = 'full';
    else status = 'partial';

    slots.push({
      start,
      end,
      occupied,
      capacity: resource.capacity,
      available,
      status,
    });
  }

  return {
    isOpen: true,
    capacity: resource.capacity,
    opensAt: dayAvailability.opens_at,
    closesAt: dayAvailability.closes_at,
    slots,
  };
}

/*
 * Raggruppa slot consecutivi con la stessa occupazione.
 *
 * Senza questa funzione, una giornata molto libera potrebbe essere mostrata con
 * tante righe ripetitive da 30 minuti. Per esempio:
 *
 *   10:00-10:30 libero
 *   10:30-11:00 libero
 *   11:00-11:30 libero
 *
 * possono diventare una sola fascia:
 *
 *   10:00-11:30 libero
 *
 * Due slot vengono accorpati solo se:
 *   - hanno lo stesso numero di posti occupati;
 *   - hanno lo stesso stato;
 *   - sono davvero consecutivi, cioè la fine del primo coincide con l'inizio
 *     del secondo.
 *
 * Questa funzione non cambia la logica della disponibilità: serve solo a
 * presentare i dati in modo più compatto e leggibile.
 */
function groupConsecutiveSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return [];

  const groups = [];
  let cur = { ...slots[0] };
  for (let i = 1; i < slots.length; i++) {
    const s = slots[i];
    if (s.occupied === cur.occupied && s.status === cur.status && cur.end === s.start) {
      cur.end = s.end;
    } else {
      groups.push(cur);
      cur = { ...s };
    }
  }
  groups.push(cur);
  return groups;
}

/*
 * Verifica se una risorsa è disponibile in uno specifico intervallo.
 *
 * Questa funzione viene usata soprattutto dalla ricerca pubblica delle risorse.
 * Per esempio, se l'utente cerca un'aula disponibile il 10 giugno dalle 10:00
 * alle 12:00, questa funzione controlla se quella risorsa ha posti liberi in
 * quella fascia.
 *
 * La funzione controlla:
 *   - se il giorno è aperto;
 *   - se l'intervallo richiesto rientra negli orari di apertura;
 *   - se esistono prenotazioni sovrapposte;
 *   - se la capienza residua è sufficiente.
 *
 * Restituisce un oggetto con:
 *   - available: true/false;
 *   - peakOccupied: picco massimo di posti occupati;
 *   - remaining: posti residui;
 *   - reason: motivo dell'indisponibilità, se presente.
 *
 * Non controlla vincoli personali dell'utente, come limite giornaliero,
 * massimo di prenotazioni future o overlap dell'utente. Questi controlli
 * dipendono dall'utente autenticato e vengono applicati dopo, nel
 * bookingService, al momento della creazione effettiva della prenotazione.
 */
function isResourceAvailableForInterval(resource, isoDate, startTime, endTime) {
  const weekday = dt.weekdayFromIsoDate(isoDate);
  const dayAvailability = availabilityRepo.findOne(resource.id, weekday);
  if (!dayAvailability || dayAvailability.is_open !== 1) {
    return { available: false, peakOccupied: 0, remaining: 0, reason: 'closed' };
  }
  if (startTime < dayAvailability.opens_at || endTime > dayAvailability.closes_at) {
    return { available: false, peakOccupied: 0, remaining: 0, reason: 'out_of_window' };
  }

  const startAt = `${isoDate} ${startTime}`;
  const endAt = `${isoDate} ${endTime}`;
  const overlaps = bookingRepo.findOverlapping(resource.id, startAt, endAt);

  if (resource.capacity <= 1) {
    if (overlaps.length > 0) {
      return { available: false, peakOccupied: 1, remaining: 0, reason: 'full' };
    }
    return { available: true, peakOccupied: 0, remaining: resource.capacity };
  }

  const peak = computeMaxOccupancy(overlaps, startAt, endAt);
  const remaining = resource.capacity - peak;
  if (remaining <= 0) {
    return { available: false, peakOccupied: peak, remaining: 0, reason: 'full' };
  }
  return { available: true, peakOccupied: peak, remaining };
}

/*
 * Esportazione delle funzioni del service.
 *
 * Le route e gli altri service possono usare queste funzioni per calcolare
 * disponibilità, occupazione giornaliera, gruppi di slot e capienza residua,
 * senza duplicare la logica in più punti del progetto.
 */
module.exports = {
  computeMaxOccupancy,
  computeDayOccupancy,
  groupConsecutiveSlots,
  isResourceAvailableForInterval,
};
