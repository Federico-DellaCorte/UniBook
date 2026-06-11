/*
 * Aggiornamento AJAX della disponibilità giornaliera nella scheda risorsa.
 *
 * Questo file è JavaScript lato client: viene eseguito nel browser nella pagina
 * dettaglio di una risorsa, cioè views/pages/resources/show.hbs.
 *
 * Il suo compito è aggiornare la sezione "Disponibilità e prenotazioni del
 * giorno" quando l'utente cambia la data selezionata.
 *
 * Il flusso è:
 *   1. intercetto il cambio data o l'invio del form;
 *   2. evito il normale reload della pagina;
 *   3. chiamo l'endpoint /api/availability con fetch;
 *   4. ricevo dal server una risposta JSON con apertura, chiusura e slot;
 *   5. ricostruisco il pannello HTML della disponibilità giornaliera.
 *
 * Questo è un esempio di AJAX/fetch: il browser comunica con il backend in modo
 * asincrono e aggiorna solo una parte della pagina.
 *
 * Se JavaScript non è disponibile, il form GET resta comunque funzionante:
 * la pagina viene ricaricata con ?date=... e il server renderizza la stessa
 * informazione lato backend. Questo si chiama miglioramento progressivo.
 *
 * La risposta dell'API contiene solo dati aggregati sulla disponibilità, non
 * username o dati personali degli utenti che hanno prenotato.
 */

// Funzione auto-eseguita: isola lo script ed evita variabili globali nel browser.
(function () {
  'use strict';

  // Recupero il contenitore principale della sezione disponibilità giornaliera.
  const root = document.getElementById('day-view');
  if (!root) return;

  // Recupero gli elementi necessari: id risorsa, input data, pannello e form.
  const resourceId = root.getAttribute('data-resource-id');
  const dateInput = document.getElementById('day-date');
  const panel = document.getElementById('day-view__panel');
  const form = root.querySelector('.day-view__form');
  if (!resourceId || !dateInput || !panel || !form) return;

 // Costruisce l'HTML del pannello usando i dati JSON ricevuti dall'API.
  function renderPanel(data) {
    if (!data || !data.isOpen) {
      return (
        '<p class="day-view__title">' +
        formatDateLabel(data && data.date) +
        ' <span class="day-view__hours">chiusa</span></p>' +
        '<p class="callout callout--warning">Risorsa chiusa in questo giorno.</p>'
      );
    }

    const slots = Array.isArray(data.slots) ? data.slots : [];
    const head =
      '<p class="day-view__title">' +
      formatDateLabel(data.date) +
      ' <span class="day-view__hours">aperta ' +
      escapeHtml(data.opensAt) +
      '–' +
      escapeHtml(data.closesAt) +
      '</span></p>';

    if (slots.length === 0) {
      return head + '<p class="empty-state">Nessuno slot prenotabile in questa data.</p>';
    }

    let body = '<ul class="day-view__slots">';
    for (const s of slots) {
      const statusLabel =
        s.status === 'free' ? 'libera' :
        s.status === 'full' ? 'piena' : 'parzialmente occupata';
      body +=
        '<li class="day-view__slot day-view__slot--' + escapeHtml(s.status) + '">' +
        '<span class="day-view__slot-time">' + escapeHtml(s.start) + '–' + escapeHtml(s.end) + '</span>' +
        '<span class="day-view__slot-occupancy">' + s.occupied + '/' + s.capacity + ' posti occupati</span>' +
        '<span class="day-view__slot-status">' + statusLabel + '</span>' +
        '</li>';
    }
    body += '</ul>';
    return head + body;
  }

  // Formatta una data ISO in una label leggibile in italiano.
  function formatDateLabel(iso) {
    if (!iso || typeof iso !== 'string') return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const names = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const name = names[d.getDay()];
    return name + ' ' + parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  // Protegge il markup convertendo caratteri speciali in entità HTML.
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Mostra un errore nel pannello se la richiesta AJAX fallisce.
  function showError(message) {
    panel.innerHTML =
      '<p class="callout callout--danger" role="alert">' +
      escapeHtml(message) +
      '</p>';
  }

  // Chiede al server la disponibilità della data scelta e aggiorna il pannello.
  function refresh(date) {
    const url =
      '/api/availability?resourceId=' + encodeURIComponent(resourceId) +
      '&date=' + encodeURIComponent(date);

    // Richiesta fetch all'endpoint JSON della disponibilità.
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(
            function (body) { throw new Error(body && body.error ? body.error : 'Errore ' + r.status); },
            function () { throw new Error('Errore ' + r.status); }
          );
        }
        return r.json();
      })
      .then(function (data) {
        panel.innerHTML = renderPanel(data);
        // Aggiorno l'URL con la data selezionata senza aggiungere una nuova voce nella cronologia.
        const qs = new URLSearchParams(window.location.search);
        qs.set('date', date);
        const newUrl = window.location.pathname + '?' + qs.toString();
        window.history.replaceState(null, '', newUrl);
      })
      .catch(function (err) {
        showError('Impossibile aggiornare la disponibilità: ' + err.message);
      });
  }

  // Aggiornamento automatico quando l'utente cambia la data.
  dateInput.addEventListener('change', function () {
    if (dateInput.value) refresh(dateInput.value);
  });
  // Intercetto anche il submit del form e lo trasformo in aggiornamento AJAX.
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (dateInput.value) refresh(dateInput.value);
  });
})();
