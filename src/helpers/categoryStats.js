/*
 * Helper per costruire le statistiche delle categorie di risorse.
 *
 * Questo file prepara i dati usati nelle pagine con le card delle categorie,
 * per esempio /resources e /admin/resources.
 *
 * Il repository delle risorse restituisce conteggi grezzi, cioè dati del tipo:
 *
 *   { aula: 4, sala: 3, laboratorio: 2 }
 *
 * I template Handlebars, però, hanno bisogno di dati più comodi da mostrare:
 * nome della categoria, numero di risorse, testo già formattato e, per l'admin,
 * conteggio totale e conteggio delle sole risorse attive.
 *
 * Questo helper fa proprio questa trasformazione: prende i conteggi dal
 * repository e li converte in array di oggetti pronti per la vista.
 *
 * In questo modo evitiamo di mettere logica di presentazione dentro i template
 * e manteniamo separate le responsabilità:
 *   - resourceRepo legge i dati dal database;
 *   - categoryStats prepara i dati per l'interfaccia;
 *   - le view si limitano a mostrarli.
 */

const { RESOURCE_TYPES } = require('../constants');
const resourceRepo = require('../repositories/resourceRepo');

/*
 * Formatta il numero totale di risorse in italiano.
 *
 * Serve per evitare testi grammaticalmente sbagliati nei template:
 *   - 1 risorsa;
 *   - 0 risorse;
 *   - 2 risorse.
 *
 * In questo modo la view non deve contenere condizioni sul singolare/plurale.
 */
function formatResourceCount(n) {
  return n === 1 ? '1 risorsa' : `${n} risorse`;
}

/*
 * Formatta il numero di risorse attive in italiano.
 *
 * Viene usata soprattutto nella vista amministratore, dove è utile distinguere
 * tra risorse totali e risorse attualmente attive.
 *
 * Anche qui viene gestito il singolare/plurale:
 *   - 1 attiva;
 *   - 0 attive;
 *   - 2 attive.
 */
function formatActiveCount(n) {
  return n === 1 ? '1 attiva' : `${n} attive`;
}

/*
 * Costruisce le statistiche delle categorie per l'utente standard.
 *
 * L'utente normale deve vedere solo le risorse attive, cioè quelle realmente
 * disponibili e prenotabili. Per questo la funzione usa countActiveByType().
 *
 * Per ogni categoria definita in RESOURCE_TYPES viene creato un oggetto con:
 *   - type: identificativo tecnico della categoria;
 *   - labelPlural: nome mostrato nell'interfaccia;
 *   - count: numero di risorse attive;
 *   - countText: testo già pronto per la card.
 *
 * Anche se una categoria non ha risorse attive, viene comunque inclusa con
 * conteggio 0. Questo mantiene stabile la struttura delle card.
 */
function buildUserCategoryStats() {
  const activeByType = resourceRepo.countActiveByType();
  return RESOURCE_TYPES.map((meta) => {
    const count = activeByType[meta.type] || 0;
    return {
      type: meta.type,
      labelPlural: meta.labelPlural,
      count,
      countText: count === 1 ? '1 risorsa disponibile' : `${count} risorse disponibili`,
    };
  });
}

/*
 * Costruisce le statistiche delle categorie per l'amministratore.
 *
 * A differenza dell'utente standard, l'admin deve vedere sia le risorse attive
 * sia quelle disattivate. Per questo la funzione recupera due conteggi:
 *   - totale delle risorse per categoria;
 *   - numero di risorse attive per categoria.
 *
 * Il risultato permette alle card admin di mostrare, per ogni categoria, quante
 * risorse esistono complessivamente e quante sono attualmente attive.
 *
 * Questa distinzione è utile perché una risorsa disattivata non è prenotabile
 * dagli utenti, ma resta nel database e può essere gestita dall'admin.
 */
function buildAdminCategoryStats() {
  const totalByType = resourceRepo.countAllByType();
  const activeByType = resourceRepo.countActiveByType();
  return RESOURCE_TYPES.map((meta) => {
    const total = totalByType[meta.type] || 0;
    const active = activeByType[meta.type] || 0;
    return {
      type: meta.type,
      labelPlural: meta.labelPlural,
      total,
      active,
      countText: formatResourceCount(total),
      activeText: formatActiveCount(active),
    };
  });
}

/*
 * Esportazione delle funzioni helper.
 *
 * Le route possono importare queste funzioni per preparare le statistiche delle
 * categorie prima di renderizzare le pagine Handlebars.
 */
module.exports = {
  buildUserCategoryStats,
  buildAdminCategoryStats,
  formatResourceCount,
};
