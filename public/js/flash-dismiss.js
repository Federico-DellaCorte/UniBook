/*
 * Auto-dismiss dei messaggi flash.
 *
 * Scorre i messaggi flash presenti nella pagina, applica una
 * piccola animazione di scomparsa dopo circa cinque secondi e
 * rimuove il nodo dal DOM al termine della transizione. Non
 * aggiunge un pulsante di chiusura manuale: il messaggio sparisce
 * da solo, in modo discreto.
 *
 * Lo script è incluso con l'attributo defer dal layout principale,
 * quindi viene eseguito dopo il parsing del documento. Operare in
 * questo modo evita di dover ascoltare l'evento DOMContentLoaded e
 * mantiene la logica semplice.
 */

(function () {
  'use strict';

  // Tempo di permanenza visibile del messaggio prima di iniziare
  // la dissolvenza. Volutamente attorno ai cinque secondi: tempo
  // sufficiente perché l'utente possa leggere il messaggio senza
  // che resti permanente sulla pagina.
  var VISIBLE_MS = 5000;

  // Durata della transizione di scomparsa: deve combaciare con il
  // valore di transition definito nel CSS per la classe .flash,
  // così il nodo viene rimosso solo quando l'animazione è finita.
  var FADE_MS = 350;

  var messages = document.querySelectorAll('.flash');

  // Quando ci sono più messaggi in coda li facciamo sparire in
  // sequenza con un piccolo scarto, in modo che la sparizione di
  // gruppi non sia un effetto "lampo" troppo brusco.
  for (var i = 0; i < messages.length; i++) {
    (function (el, index) {
      setTimeout(function () {
        el.classList.add('flash--fading');
        setTimeout(function () {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }, FADE_MS);
      }, VISIBLE_MS + index * 150);
    })(messages[i], i);
  }
})();
