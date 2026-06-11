/*
 * Sincronizzazione della disponibilità settimanale nei form admin.
 *
 * Questo file è JavaScript lato client: viene caricato nel browser nelle pagine
 * admin di creazione e modifica risorsa, cioè nei template che includono il
 * partial weekly-availability.hbs.
 *
 * Il suo compito è rendere più chiara l'interazione con i giorni della settimana.
 * Per ogni blocco .weekly-day controlla la checkbox "Aperta":
 *   - se il giorno è aperto, i select di apertura e chiusura restano abilitati;
 *   - se il giorno è chiuso, i select vengono disabilitati;
 *   - il contenitore riceve o perde la classe weekly-day--closed, usata dal CSS
 *     per mostrare visivamente il giorno come chiuso.
 *
 * Questo script non salva dati e non effettua richieste al server.
 * Modifica solo l'interfaccia nel browser.
 *
 * La validazione definitiva resta comunque lato server: anche se il browser
 * abilita o disabilita i campi, resourceAvailabilityService ricontrolla sempre
 * la disponibilità settimanale quando il form viene inviato.
 *
 * Lo script è caricato con defer, quindi parte dopo che l'HTML è stato letto dal
 * browser. Per questo può cercare gli elementi nel DOM senza usare
 * DOMContentLoaded.
 */

// Funzione auto-eseguita: isola lo script ed evita variabili globali nel browser.
(function () {
  // Recupero tutti i blocchi giorno presenti nel partial weekly-availability.hbs.
  const dayBlocks = document.querySelectorAll('.weekly-day');
  // Se la pagina non contiene disponibilità settimanali, lo script termina subito.
  if (dayBlocks.length === 0) return;

  // Sincronizza un singolo giorno: stato grafico e abilitazione dei select orari.
  function syncDay(block) {
    const checkbox = block.querySelector('.weekly-day__checkbox');
    const selects = block.querySelectorAll('.weekly-day__select');
    if (!checkbox) return;

    const open = checkbox.checked;
    block.classList.toggle('weekly-day--closed', !open);
    selects.forEach((sel) => {
      sel.disabled = !open;
    });
  }

  // Applico la sincronizzazione iniziale e registro il listener sulla checkbox.
  dayBlocks.forEach((block) => {
    const checkbox = block.querySelector('.weekly-day__checkbox');
    if (!checkbox) return;
    // Lo stato iniziale è già corretto perché renderizzato dal
    // server, ma forziamo il sync per coprire eventuali
    // disallineamenti (autofill del browser, ecc.).
    syncDay(block);
    checkbox.addEventListener('change', () => syncDay(block));
  });
})();
