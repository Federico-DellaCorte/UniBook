/*
 * Rotte di consultazione delle risorse lato utente.
 *
 * Questo file gestisce le pagine in cui un utente autenticato esplora le
 * risorse prenotabili dell'università.
 *
 * Le rotte principali sono:
 *   - GET /resources
 *     mostra le categorie oppure i risultati della ricerca;
 *
 *   - GET /resources?type=aula
 *     mostra le risorse attive di una specifica categoria;
 *
 *   - GET /resources/:id
 *     mostra la scheda dettaglio di una singola risorsa attiva.
 *
 * In queste pagine vengono mostrate solo risorse attive. Le risorse disattivate
 * non sono visibili all'utente standard, perché non devono essere prenotabili.
 * La loro gestione resta riservata all'area amministrativa.
 *
 * Questo file non modifica il database: si occupa soprattutto di leggere dati,
 * prepararli per i template e applicare i filtri di ricerca scelti dall'utente.
 *
 * La ricerca delle risorse può filtrare per:
 *   - tipologia;
 *   - data;
 *   - intervallo orario;
 *   - capienza minima;
 *   - parola chiave.
 *
 * Quando l'utente cerca una fascia oraria specifica, la route usa
 * availabilityService per verificare se la risorsa ha davvero posti disponibili
 * in quell'intervallo.
 */

const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const resourceRepo = require('../repositories/resourceRepo');
const availabilityRepo = require('../repositories/resourceAvailabilityRepo');
const availabilityService = require('../services/availabilityService');
const {
  TYPE_KEYS,
  TYPE_META,
  RESOURCE_TYPES,
  MAX_CAPACITY,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES_BY_TYPE,
} = require('../constants');
const { buildUserCategoryStats } = require('../helpers/categoryStats');
const dt = require('../helpers/dateTime');

const router = express.Router();

/*
 * Protezione delle rotte /resources.
 *
 * Tutte le pagine di consultazione delle risorse richiedono il login.
 *
 * Il middleware requireAuth viene applicato solo agli URL che iniziano con
 * /resources. Questo è importante perché il router viene montato in server.js
 * senza un prefisso generale: usando '/resources' evitiamo di proteggere per
 * errore anche URL non collegati alle risorse.
 */
router.use('/resources', requireAuth);

/*
 * Costruisce le opzioni del filtro "tipologia" nel form di ricerca.
 *
 * Il form deve mostrare:
 *   - un'opzione vuota, cioè "Tutte le tipologie";
 *   - una voce per ogni categoria definita in RESOURCE_TYPES.
 *
 * selectedType indica la categoria attualmente selezionata dall'utente.
 * In questo modo, quando la pagina viene ricaricata dopo una ricerca, il form
 * mantiene visibile il filtro scelto.
 */
function buildSearchTypeOptions(selectedType) {
  return [
    { value: '', label: 'Tutte le tipologie', selected: !selectedType },
    ...RESOURCE_TYPES.map((m) => ({
      value: m.type,
      label: m.labelPlural,
      selected: m.type === selectedType,
    })),
  ];
}

/*
 * Legge e valida i parametri della ricerca risorse.
 *
 * I filtri arrivano dalla query string dell'URL, cioè da req.query.
 * Per esempio:
 *
 *   /resources?type=aula&date=2026-06-05&start=09:00&end=11:00
 *
 * Questa funzione normalizza i valori ricevuti, controlla eventuali errori e
 * restituisce un oggetto più comodo da usare nella rotta.
 *
 * I filtri supportati sono:
 *   - type: categoria della risorsa;
 *   - date: data richiesta;
 *   - start: ora di inizio;
 *   - end: ora di fine;
 *   - minCapacity: capienza minima;
 *   - q: parola chiave.
 *
 * Gli orari start ed end funzionano in coppia: se l'utente indica un orario di
 * inizio deve indicare anche un orario di fine e una data. Questo serve perché
 * la disponibilità reale può essere controllata solo su una fascia temporale
 * completa.
 *
 * La funzione distingue tre casi importanti:
 *   - hasIntervalFilter: data + start + end validi, quindi posso controllare
 *     la disponibilità precisa in quella fascia;
 *   - hasDateFilter: solo data valida, quindi posso filtrare le risorse aperte
 *     in quel giorno;
 *   - hasAnyFilter: esiste almeno un filtro attivo.
 */
function parseResourceSearch(query) {
  // Raccolgo i valori della query string e li porto in una forma stabile.
  // Le stringhe vengono ripulite con trim() per eliminare spazi inutili.
  const values = {
    type: query.type || '',
    date: (query.date || '').trim(),
    start: (query.start || '').trim(),
    end: (query.end || '').trim(),
    minCapacity: (query.minCapacity || '').toString().trim(),
    q: (query.q || '').trim(),
  };
  const errors = {};
  // Controllo che la tipologia richiesta sia una di quelle previste dal progetto.
  if (values.type && !TYPE_KEYS.includes(values.type)) {
    errors.type = 'Tipologia non valida.';
    values.type = '';
  }
  // Controllo che la data, se presente, sia in formato ISO valido.
  if (values.date && !dt.isValidIsoDate(values.date)) {
    errors.date = 'Data non valida (formato YYYY-MM-DD).';
  }

  // Slot inizio: 00:00..23:30. 24:00 non è ammesso come inizio.
  if (values.start) {
    if (values.start === '24:00') {
      errors.start = '24:00 non è ammesso come ora di inizio.';
    } else if (!dt.isValidStartSlot(values.start)) {
      errors.start = 'Ora di inizio non valida (slot a 30 minuti fra 00:00 e 23:30).';
    }
  }
  // Slot fine: 00:30..24:00.
  if (values.end && !dt.isValidEndSlot(values.end)) {
    errors.end = 'Ora di fine non valida (slot a 30 minuti fra 00:30 e 24:00).';
  }
  // Confronto strict in minuti del giorno (gestisce 24:00 = 1440).
  if (!errors.start && !errors.end && values.start && values.end &&
      dt.timeToMinutes(values.end) <= dt.timeToMinutes(values.start)) {
    errors.end = "L'ora di fine deve essere successiva all'ora di inizio.";
  }

  // Regole di accoppiamento data ↔ orari.
  // start o end non possono apparire da soli, e in entrambi i casi
  // serve anche la data. Messaggi inline distinti per essere
  // immediatamente azionabili.
  if (values.start && !values.end && !errors.end) {
    errors.end = "Indica anche l'ora di fine, oppure rimuovi l'ora di inizio.";
  }
  if (values.end && !values.start && !errors.start) {
    errors.start = "Indica anche l'ora di inizio, oppure rimuovi l'ora di fine.";
  }
  if ((values.start || values.end) && !values.date && !errors.date) {
    errors.date = 'Indica anche la data, oppure rimuovi gli orari.';
  }

  // Controllo la capienza minima richiesta, rispettando il limite massimo globale.
  let minCapacity = null;
  if (values.minCapacity) {
    const n = Number.parseInt(values.minCapacity, 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CAPACITY) {
      errors.minCapacity = `Inserisci un intero fra 1 e ${MAX_CAPACITY}.`;
    } else {
      minCapacity = n;
    }
  }

  // hasIntervalFilter è attivo solo con tutti e tre data/start/end
  // validi: applica il check capacity-aware sulla fascia.
  const hasIntervalFilter =
    values.date && values.start && values.end &&
    !errors.date && !errors.start && !errors.end;

  // Filtro solo data: permette di mostrare risorse aperte in quel giorno,
  // senza controllare la capienza su una fascia specifica.
  const hasDateFilter =
    values.date && !values.start && !values.end && !errors.date;

  const hasAnyFilter =
    !!values.type || hasIntervalFilter || hasDateFilter ||
    minCapacity !== null || !!values.q;

  return {
    values,
    errors,
    hasIntervalFilter,
    hasDateFilter,
    hasAnyFilter,
    minCapacity,
  };
}

/* 
 * GET /resources
 *
 * Mostra la pagina principale delle risorse oppure i risultati di ricerca.
 *
 * Questo endpoint gestisce tre modalità:
 *
 *   1. Nessun filtro
 *      Mostra le card delle categorie, con il form di ricerca in alto.
 *
 *   2. Solo filtro type
 *      Mostra la lista delle risorse attive di una singola categoria,
 *      per esempio tutte le aule o tutti i laboratori.
 *
 *   3. Ricerca avanzata
 *      Se sono presenti altri filtri, come data, orario, capienza minima o
 *      parola chiave, mostra la pagina dei risultati compatibili.
 *
 * La ricerca è server-side: i filtri arrivano dall'URL, vengono validati e poi
 * usati per interrogare il database. Questo rende la ricerca funzionante anche
 * senza JavaScript e permette di condividere/copiarne l'URL.
 */
router.get('/resources', (req, res) => {
  // Leggo e valido tutti i filtri presenti nella query string.
  const search = parseResourceSearch(req.query);
  // Verifico se l'utente ha scelto solo una categoria, senza altri filtri.
  const onlyTypeFilter =
    !!search.values.type && Object.keys(search.errors).length === 0 &&
    !search.hasIntervalFilter && !search.hasDateFilter &&
    search.minCapacity === null && !search.values.q;

  // Caso classico: lista delle risorse attive di una singola categoria.
  if (onlyTypeFilter) {
    const meta = TYPE_META[search.values.type];
    const resources = resourceRepo.findActiveByType(search.values.type);
    const decorated = resources.map((r) => ({
      ...r,
      availabilitySummary: dt.summarizeWeeklyAvailability(
        availabilityRepo.findByResourceId(r.id)
      ),
    }));

    return res.render('pages/resources/list', {
      title: `${meta.labelPlural} · UniBook`,
      type: search.values.type,
      categoryLabel: meta.labelPlural,
      resources: decorated,
      countText:
        decorated.length === 1
          ? '1 risorsa disponibile'
          : `${decorated.length} risorse disponibili`,
    });
  }

  // Caso ricerca avanzata: almeno un filtro attivo oppure errori da mostrare nel form.
  if (search.hasAnyFilter || Object.keys(search.errors).length > 0) {
    // Prima applico i filtri anagrafici: categoria, capienza minima e parola chiave.
    let resources = resourceRepo.searchActive({
      type: search.values.type || null,
      minCapacity: search.minCapacity,
      q: search.values.q || null,
    });

    // Se l'utente ha indicato data e fascia oraria, controllo la disponibilità reale
    // della risorsa in quell'intervallo.
    if (search.hasIntervalFilter) {
      const { date, start, end } = search.values;
      const matches = [];
      for (const r of resources) {
      // availabilityService verifica apertura, orario e capienza residua della risorsa. 
        const verdict = availabilityService.isResourceAvailableForInterval(
          r, date, start, end
        );
      // Controllo anche che la durata richiesta rispetti minimo e massimo della categoria. 
        const duration = dt.timeToMinutes(end) - dt.timeToMinutes(start);
        const maxDur = MAX_DURATION_MINUTES_BY_TYPE[r.type];
        const durationOk =
          duration >= MIN_DURATION_MINUTES &&
          (!maxDur || duration <= maxDur);

        if (verdict.available && durationOk) {
          matches.push({ ...r, remainingSeats: verdict.remaining });
        }
      }
      resources = matches;
      // Se l'utente ha indicato solo la data, filtro le risorse aperte in quel giorno.
    } else if (search.hasDateFilter) {
      // Solo data, senza fascia oraria: filtriamo per "giorno aperto".
      // Non possiamo (e non vogliamo) valutare la capacity perché
      // l'utente non ha indicato un intervallo di interesse.
      const { date } = search.values;
      const weekday = dt.weekdayFromIsoDate(date);
      const matches = [];
      for (const r of resources) {
        const dayRow = availabilityRepo.findOne(r.id, weekday);
        if (dayRow && dayRow.is_open === 1) matches.push(r);
      }
      resources = matches;
    }
    // Preparo i dati per la vista: etichetta della categoria e riassunto settimanale.
    const decorated = resources.map((r) => ({
      ...r,
      typeLabel: TYPE_META[r.type] ? TYPE_META[r.type].labelPlural : r.type,
      availabilitySummary: dt.summarizeWeeklyAvailability(
        availabilityRepo.findByResourceId(r.id)
      ),
    }));
    // Nessun filtro: mostro la pagina indice con le card delle categorie.
    return res.render('pages/resources/search-results', {
      title: 'Ricerca risorse · UniBook',
      values: search.values,
      errors: search.errors,
      typeOptions: buildSearchTypeOptions(search.values.type),
      // Slot start/end sono passati al form di ricerca per popolare
      // i due select. Includiamo "" come opzione "Qualsiasi" già
      // nel template (vedi resources-search-form.hbs).
      startSlots: dt.allStartSlots(),
      endSlots: dt.allEndSlots(),
      resources: decorated,
      hasIntervalFilter: search.hasIntervalFilter,
      hasDateFilter: search.hasDateFilter,
      countText:
        decorated.length === 1
          ? '1 risorsa compatibile'
          : `${decorated.length} risorse compatibili`,
      minDate: dt.todayIsoDate(),
    });
  }

  // Forma (a): nessun filtro, mostra le card di categoria con il
  // form di ricerca in cima.
  const categories = buildUserCategoryStats();
  return res.render('pages/resources/categories', {
    title: 'Risorse · UniBook',
    categories,
    values: search.values,
    errors: search.errors,
    typeOptions: buildSearchTypeOptions(search.values.type),
    startSlots: dt.allStartSlots(),
    endSlots: dt.allEndSlots(),
    minDate: dt.todayIsoDate(),
  });
});

/* 
 * GET /resources/:id
 *
 * Mostra la scheda dettaglio di una singola risorsa.
 *
 * La rotta riceve l'id della risorsa dall'URL. Per esempio:
 *
 *   /resources/5
 *
 * Prima controlla che l'id sia numerico e positivo. Poi verifica che la risorsa
 * esista e sia attiva. Se la risorsa è disattivata o inesistente, l'utente viene
 * rimandato alla pagina delle risorse con un messaggio flash.
 *
 * La scheda mostra:
 *   - dati principali della risorsa;
 *   - categoria;
 *   - disponibilità settimanale;
 *   - occupazione aggregata del giorno selezionato;
 *   - pulsante per procedere alla prenotazione.
 *
 * L'occupazione giornaliera è privacy-safe: mostra solo dati aggregati, come
 * posti occupati e disponibili, ma non mostra username o dati personali di chi
 * ha prenotato.
 */
router.get('/resources/:id', (req, res) => {
  // Converto l'id dell'URL in numero intero.
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    req.flash('error', 'Identificativo risorsa non valido.');
    return res.redirect('/resources');
  }

  // Recupero la risorsa dal database e controllo che sia ancora attiva.
  const resource = resourceRepo.findById(id);
  if (!resource || resource.active !== 1) {
    req.flash('error', 'Risorsa non trovata o non più disponibile.');
    return res.redirect('/resources');
  }

  const meta = TYPE_META[resource.type];

  // Recupero le sette righe di disponibilità settimanale e aggiungo il nome del giorno.
  const availability = availabilityRepo.findByResourceId(resource.id).map((row) => ({
    weekday: row.weekday,
    dayName: dt.weekdayNameLong(row.weekday),
    is_open: row.is_open === 1,
    opens_at: row.opens_at,
    closes_at: row.closes_at,
  }));

  const today = dt.todayIsoDate();
  const queryDate = (req.query.date || '').trim();
  // La data mostrata nella sezione giornaliera arriva dalla query string;
  // se manca o non è valida, uso la data di oggi.
  const selectedDate = queryDate && dt.isValidIsoDate(queryDate) ? queryDate : today;
  const dayWeekday = dt.weekdayFromIsoDate(selectedDate);
  // Calcolo l'occupazione della risorsa nel giorno selezionato.
  const day = availabilityService.computeDayOccupancy(resource, selectedDate);
  // Raggruppo slot consecutivi con la stessa occupazione per rendere la vista più leggibile.
  const groupedSlots = availabilityService.groupConsecutiveSlots(day.slots);

  return res.render('pages/resources/show', {
    title: `${resource.name} · UniBook`,
    resource,
    typeLabel: meta ? meta.labelSingular : resource.type,
    categoryLabel: meta ? meta.labelPlural : 'Risorse',
    availability,
    dayView: {
      date: selectedDate,
      dayName: dt.weekdayNameLong(dayWeekday),
      isOpen: day.isOpen,
      capacity: day.capacity,
      opensAt: day.opensAt,
      closesAt: day.closesAt,
      slots: groupedSlots,
    },
    minDate: today,
  });
});

/*
 * Esportazione del router delle risorse.
 *
 * server.js importa questo router e lo monta nell'app Express, rendendo attive
 * tutte le rotte di consultazione delle risorse definite in questo file.
 */
module.exports = router;
