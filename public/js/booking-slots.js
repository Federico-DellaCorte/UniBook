/*
 * Aggiornamento client-side degli slot di prenotazione.
 *
 * Questo file è JavaScript lato client: viene eseguito nel browser nella pagina
 * di creazione prenotazione, cioè views/pages/bookings/new.hbs.
 *
 * Il suo compito è aggiornare le select "Ora inizio" e "Ora fine" quando
 * l'utente cambia la data della prenotazione.
 *
 * I dati della disponibilità settimanale non vengono richiesti al server in
 * questo momento: sono già presenti nella pagina dentro lo script JSON con id
 * availability-data.
 *
 * Il flusso è:
 *   1. leggo la disponibilità settimanale incorporata nella pagina;
 *   2. quando cambia la data, calcolo il giorno della settimana;
 *   3. controllo se la risorsa è aperta in quel giorno;
 *   4. se è chiusa, svuoto e disabilito le select degli orari;
 *   5. se è aperta, genero gli slot da 30 minuti tra apertura e chiusura.
 *
 * Questo migliora l'esperienza utente perché evita di proporre orari non
 * coerenti con il giorno scelto.
 *
 * La validazione definitiva resta comunque lato server: bookingService controlla
 * sempre disponibilità, durata, limiti, conflitti e capienza prima di salvare
 * la prenotazione nel database.
 */

// Funzione auto-eseguita: isola lo script ed evita variabili globali nel browser.
(function () {
  // Recupero gli elementi HTML necessari: dati JSON, campo data, select orari e avviso chiusura.
  const dataEl = document.getElementById('availability-data');
  const dateInput = document.getElementById('date');
  const startSelect = document.getElementById('startTime');
  const endSelect = document.getElementById('endTime');
  const closedMessage = document.getElementById('closed-message');
  // Se la pagina non contiene gli elementi necessari, lo script termina senza errori.
  if (!dataEl || !dateInput || !startSelect || !endSelect) return;

  // Leggo e converto i dati JSON della disponibilità settimanale incorporati nel template.
  let availability;
  try {
    availability = JSON.parse(dataEl.textContent || '[]');
  } catch (_) {
    return;
  }

  // Indicizzo la disponibilità per giorno della settimana, così recupero subito la regola del giorno.
  const byWeekday = {};
  for (const a of availability) {
    byWeekday[a.weekday] = a;
  }

// Converte una data ISO nel formato weekday usato dal progetto: 1 = lunedì, 7 = domenica.
  function weekdayFromIsoDate(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const js = dt.getDay();
    return js === 0 ? 7 : js;
  }

  // Mantiene sempre due cifre negli orari, per esempio 9 diventa "09".
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // Converte un orario HH:MM in minuti dall'inizio della giornata.
  function timeToMinutes(s) {
    if (s === '24:00') return 1440;
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  }

  // Converte minuti dall'inizio della giornata nel formato HH:MM.
  function minutesToTime(t) {
    if (t === 1440) return '24:00';
    return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
  }

  // Genera gli slot validi di inizio e fine tra apertura e chiusura.
  function generateStartEndSlots(opens, closes) {
    const start = timeToMinutes(opens);
    const end = timeToMinutes(closes);
    const all = [];
    for (let t = start; t <= end; t += 30) all.push(minutesToTime(t));
    return { start: all.slice(0, -1), end: all.slice(1) };
  }

  // Sostituisce le option di una select con gli slot ricevuti.
  function fillSelect(selectEl, slots) {
    const placeholder = '<option value="">--</option>';
    const body = slots
      .map((s) => '<option value="' + s + '">' + s + '</option>')
      .join('');
    selectEl.innerHTML = placeholder + body;
  }

  // Aggiorna le select degli orari in base alla data scelta dall'utente.
  function refresh() {
    const date = dateInput.value;
    if (!date) return;
    const weekday = weekdayFromIsoDate(date);
    const day = byWeekday[weekday];

    if (!day || !day.is_open) {
      // Giorno chiuso: svuoto gli orari, disabilito le select e mostro l'avviso.
      const dayName = day && day.dayName ? day.dayName.toLowerCase() : 'questo giorno';
      fillSelect(startSelect, []);
      fillSelect(endSelect, []);
      startSelect.disabled = true;
      endSelect.disabled = true;
      if (closedMessage) {
        closedMessage.textContent = 'Risorsa chiusa di ' + dayName + '.';
        closedMessage.hidden = false;
      }
      return;
    }

    const { start: startSlots, end: endSlots } = generateStartEndSlots(day.opens_at, day.closes_at);
    fillSelect(startSelect, startSlots);
    fillSelect(endSelect, endSlots);
    startSelect.disabled = false;
    endSelect.disabled = false;
    if (closedMessage) {
      closedMessage.textContent = '';
      closedMessage.hidden = true;
    }
  }

  // Quando l'utente cambia data, rigenero gli slot disponibili.
  dateInput.addEventListener('change', refresh);
})();
