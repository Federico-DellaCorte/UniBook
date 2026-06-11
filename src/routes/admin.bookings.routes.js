/*
 * Rotte amministrative per la consultazione delle prenotazioni.
 *
 * Questo file gestisce la sezione admin in cui l'amministratore può vedere
 * tutte le prenotazioni presenti nel sistema.
 *
 * A differenza delle rotte utente, che mostrano solo le prenotazioni del
 * proprietario, qui l'admin ha una visione globale: può consultare prenotazioni
 * di tutti gli utenti e di tutte le risorse.
 *
 * Le viste disponibili sono:
 *   - lista: tabella filtrabile delle prenotazioni;
 *   - calendario: vista settimanale delle prenotazioni.
 *
 * I filtri principali sono:
 *   - periodo: tutte, future attive, storico;
 *   - tipologia di risorsa;
 *   - singola risorsa;
 *   - settimana, nella vista calendario.
 *
 * I filtri viaggiano nella query string dell'URL, quindi la pagina filtrata può
 * essere aggiornata, salvata nei preferiti o condivisa mantenendo lo stesso stato.
 *
 * Questo file non modifica direttamente le prenotazioni: serve soprattutto per
 * consultazione e controllo amministrativo. Le azioni che impattano prenotazioni
 * future, come disattivazione o eliminazione di una risorsa, sono gestite nelle
 * rotte admin delle risorse.
 */

const express = require('express');

const requireAdmin = require('../middleware/requireAdmin');
const bookingRepo = require('../repositories/bookingRepo');
const resourceRepo = require('../repositories/resourceRepo');
const { TYPE_KEYS, TYPE_META, RESOURCE_TYPES } = require('../constants');
const dt = require('../helpers/dateTime');

const router = express.Router();

/*
 * Protezione delle rotte admin delle prenotazioni.
 *
 * Tutti gli URL che iniziano con /admin/bookings richiedono un utente
 * autenticato con ruolo admin.
 *
 * Il middleware viene applicato solo a questo prefisso, così non interferisce
 * con eventuali altre rotte o con la gestione generale degli errori 404.
 */
router.use('/admin/bookings', requireAdmin);

/*
 * Periodi selezionabili nel filtro admin.
 *
 * Questo array definisce sia i valori tecnici accettati dalla query string,
 * sia le etichette mostrate nel select della pagina.
 *
 * Centralizzare qui i periodi evita disallineamenti tra ciò che il template
 * mostra all'admin e ciò che la rotta accetta davvero.
 */
const PERIODS = [
  { value: 'all',     label: 'Tutte' },
  { value: 'future',  label: 'Future attive' },
  { value: 'history', label: 'Storico (passate o annullate)' },
];

/*
 * Prepara una prenotazione per la visualizzazione admin.
 *
 * Il database restituisce dati tecnici, come start_at, end_at, status e
 * resource_type. Questa funzione li trasforma in campi più leggibili per il
 * template: data italiana, ora di inizio, ora di fine, etichetta della categoria
 * e stato umano della prenotazione.
 *
 * Lo stato visibile viene calcolato combinando status e data:
 *   - status = cancelled  -> Annullata;
 *   - confirmed ma passata -> Conclusa;
 *   - confirmed e futura   -> Confermata.
 *
 * Questo permette alla vista admin di mostrare una tabella più chiara senza
 * inserire logica di formattazione dentro Handlebars.
 */
function decorateForAdmin(b, nowIso) {
  let statusKey;
  let statusLabel;
  if (b.status === 'cancelled') {
    statusKey = 'cancelled';
    statusLabel = 'Annullata';
  } else if (b.start_at < nowIso) {
    statusKey = 'past';
    statusLabel = 'Conclusa';
  } else {
    statusKey = 'active';
    statusLabel = 'Confermata';
  }

  const meta = TYPE_META[b.resource_type];
  return {
    ...b,
    date_label: dt.formatItalianDate(b.start_at),
    start_time: dt.extractTime(b.start_at),
    end_time: dt.endTimeDisplay(b.start_at, b.end_at),
    typeLabel: meta ? meta.labelSingular : b.resource_type,
    statusKey,
    statusLabel,
  };
}

/*
 * Costruisce una query string mantenendo i filtri attivi.
 *
 * Serve per generare link di navigazione senza perdere lo stato corrente della
 * pagina. Per esempio, se l'admin sta filtrando per categoria e passa dalla
 * vista lista alla vista calendario, i filtri devono restare applicati.
 *
 * baseFilters contiene i filtri già attivi.
 * overrides contiene solo i valori da cambiare, per esempio view o week.
 *
 * I valori vuoti, null o undefined vengono ignorati, così l'URL resta pulito.
 */
function buildQueryString(baseFilters, overrides) {
  const merged = { ...baseFilters, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === null || v === undefined || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/* 
 * GET /admin/bookings
 *
 * Mostra la sezione amministrativa delle prenotazioni.
 *
 * La rotta può renderizzare due viste:
 *   - vista lista;
 *   - vista calendario settimanale.
 *
 * La scelta dipende dal parametro query view:
 *   - view=list oppure valore mancante -> tabella;
 *   - view=calendar -> calendario.
 *
 * La rotta normalizza i filtri ricevuti dalla query string, ignorando valori
 * non validi invece di generare errore. Questo rende la navigazione più robusta
 * anche se l'URL viene modificato manualmente.
 *
 * I dati vengono recuperati tramite bookingRepo e poi decorati con
 * decorateForAdmin(), così i template ricevono già informazioni formattate e
 * pronte da mostrare.
 */
router.get('/admin/bookings', (req, res) => {
  // Normalizzazione dei parametri: accettiamo solo valori previsti,
  // tutto il resto viene ignorato (nessun errore 400 per evitare di
  // confondere chi naviga manualmente).
  const periodInput = req.query.period;
  const period = PERIODS.some((p) => p.value === periodInput) ? periodInput : 'all';

  const typeInput = req.query.type;
  const type = TYPE_KEYS.includes(typeInput) ? typeInput : null;

  const resourceIdInput = Number.parseInt(req.query.resourceId, 10);
  const resourceId = Number.isInteger(resourceIdInput) && resourceIdInput > 0 ? resourceIdInput : null;

  const view = req.query.view === 'calendar' ? 'calendar' : 'list';

  // Filtri correnti usati per ricostruire link e tab senza perdere lo stato.
  const baseFilters = { period, type, resourceId, view };

  // Recupero tutte le risorse per popolare il filtro "singola risorsa" dell'admin.
  const allResources = resourceRepo.findAll();
  // Raggruppo le risorse per categoria, così il select può essere più leggibile.
  const resourceGroups = RESOURCE_TYPES.map((meta) => ({
    label: meta.labelPlural,
    items: allResources
      .filter((r) => r.type === meta.type)
      .map((r) => ({
        id: r.id,
        name: r.name + (r.active === 0 ? ' (disattivata)' : ''),
        selected: r.id === resourceId,
      })),
  }));
  const periodOptions = PERIODS.map((p) => ({ ...p, selected: p.value === period }));
  const typeOptions = [
    { value: '', label: 'Tutte le tipologie', selected: type === null },
    ...RESOURCE_TYPES.map((meta) => ({
      value: meta.type,
      label: meta.labelPlural,
      selected: meta.type === type,
    })),
  ];

  // Link per passare da lista a calendario mantenendo gli stessi filtri.
  const tabs = {
    listUrl: '/admin/bookings' + buildQueryString(baseFilters, { view: 'list' }),
    calendarUrl: '/admin/bookings' + buildQueryString(baseFilters, { view: 'calendar' }),
  };

  // Vista calendario: costruisco una settimana lunedì-domenica e distribuisco
  // le prenotazioni nei rispettivi giorni.
  if (view === 'calendar') {
    // Settimana da mostrare: query string ?week=YYYY-MM-DD oppure
    // la settimana corrente. Tutte le settimane usano il lunedì
    // come primo giorno (allineato a resource_availability).
    const weekParam = (req.query.week || '').trim();
    const anchor = weekParam && dt.isValidIsoDate(weekParam) ? weekParam : dt.todayIsoDate();
    const monday = dt.mondayOfWeek(anchor);
    const sundayPlusOne = dt.addDaysToIsoDate(monday, 7); // domenica esclusa, lunedì successivo incluso
    const days = dt.weekDayList(monday);

    // Recupero tutte le prenotazioni che cadono nella settimana mostrata,
    // applicando eventuali filtri su categoria o risorsa.
    const bookings = bookingRepo.findInRange({
      rangeStart: `${monday} 00:00`,
      rangeEnd: `${sundayPlusOne} 00:00`,
      type,
      resourceId,
      status: 'all',
    });

    // Distribuzione per giorno: una stessa prenotazione viene
    // attribuita al giorno della sua start_at (le regole applicative
    // vietano gli intervalli che attraversano la mezzanotte, quindi
    // nessun booking viene "splittato").
    const nowIso = dt.currentLocalIsoMinute();
    // Preparo una mappa data -> prenotazioni, per riempire le colonne del calendario.
    const byDay = new Map();
    for (const d of days) byDay.set(d.iso, []);
    for (const b of bookings) {
      const iso = b.start_at.substring(0, 10);
      if (byDay.has(iso)) {
        byDay.get(iso).push(decorateForAdmin(b, nowIso));
      }
    }
    const calendarDays = days.map((d) => ({
      ...d,
      isToday: d.iso === dt.todayIsoDate(),
      items: byDay.get(d.iso) || [],
    }));

    // Link di navigazione settimanale: settimana precedente, settimana corrente
    // e settimana successiva, mantenendo i filtri attivi.
    const nav = {
      prevWeekUrl: '/admin/bookings' + buildQueryString(baseFilters, {
        view: 'calendar',
        week: dt.addDaysToIsoDate(monday, -7),
      }),
      todayWeekUrl: '/admin/bookings' + buildQueryString(baseFilters, {
        view: 'calendar',
        week: dt.todayIsoDate(),
      }),
      nextWeekUrl: '/admin/bookings' + buildQueryString(baseFilters, {
        view: 'calendar',
        week: dt.addDaysToIsoDate(monday, 7),
      }),
    };

    return res.render('pages/admin/bookings/calendar', {
      title: 'Calendario prenotazioni · UniBook',
      tabs,
      filters: { period, type, resourceId, view, week: monday },
      periodOptions,
      typeOptions,
      resourceGroups,
      calendarDays,
      weekLabel: `${days[0].labelFull} – ${days[6].labelFull}`,
      nav,
      hideStatusFilter: false,
      summary:
        bookings.length === 1
          ? '1 prenotazione in questa settimana'
          : `${bookings.length} prenotazioni in questa settimana`,
    });
  }

  // Vista lista: comportamento storico, esteso con la tab bar.
  const bookings = bookingRepo.listForAdmin({ period, type, resourceId });
  const nowIso = dt.currentLocalIsoMinute();
  const decorated = bookings.map((b) => decorateForAdmin(b, nowIso));

  res.render('pages/admin/bookings/list', {
    title: 'Tutte le prenotazioni · UniBook',
    bookings: decorated,
    filters: { period, type, resourceId, view },
    periodOptions,
    typeOptions,
    resourceGroups,
    tabs,
    summary: buildSummaryText(decorated.length, period, type, resourceId, allResources),
  });
});

/*
 * Costruisce il testo di riepilogo dei risultati.
 *
 * La lista admin mostra una frase compatta che spiega quanti risultati sono
 * stati trovati e quali filtri sono attivi.
 *
 * Esempi:
 *   - "3 prenotazioni";
 *   - "2 prenotazioni · future attive";
 *   - "1 prenotazione · su Aula Studio Leonardo";
 *   - "5 prenotazioni · di tipo aula".
 *
 * Questa funzione serve solo alla presentazione: non filtra i dati, ma descrive
 * in modo leggibile il risultato dei filtri già applicati.
 */
function buildSummaryText(count, period, type, resourceId, allResources) {
  const parts = [];
  parts.push(count === 1 ? '1 prenotazione' : `${count} prenotazioni`);

  if (period === 'future') parts.push('future attive');
  else if (period === 'history') parts.push('nello storico');

  if (resourceId) {
    const r = allResources.find((x) => x.id === resourceId);
    if (r) parts.push(`su "${r.name}"`);
  } else if (type) {
    const meta = TYPE_META[type];
    if (meta) parts.push(`di tipo ${meta.labelSingular.toLowerCase()}`);
  }

  return parts.join(' · ');
}

/*
 * Esportazione del router amministrativo delle prenotazioni.
 *
 * server.js importa questo router e lo monta nell'app Express, rendendo attive
 * le rotte admin definite in questo file.
 */
module.exports = router;
