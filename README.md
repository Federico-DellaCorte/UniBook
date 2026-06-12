# UniBook

**Studente:** Federico Della Corte  
**Corso:** Tecnologie Informatiche per il Web - Politecnico di Milano  
**Traccia scelta:** Traccia 1 - Piattaforma di Prenotazione Risorse  
**Tecnologie principali:** Node.js, Express, SQLite, Handlebars, HTML, CSS, JavaScript  
**Presentazione progetto:** [Apri la presentazione UniBook](https://pitch.com/v/unibook-9b6m85)

---

## Descrizione generale

UniBook è una piattaforma web per la prenotazione di risorse universitarie condivise, come aule studio, sale riunioni, laboratori, postazioni informatiche e attrezzature. Il progetto è stato sviluppato sulla base della **Traccia 1 - Piattaforma di Prenotazione Risorse** del corso Tecnologie Informatiche per il Web.

L’applicazione realizza completamente il **Livello 1**, permettendo agli utenti di registrarsi, accedere, consultare l’elenco delle risorse, visualizzare il dettaglio di una risorsa, creare una prenotazione, vedere le proprie prenotazioni e cancellare quelle future. È inoltre presente un ruolo amministratore che può creare, modificare, disattivare, riattivare o eliminare risorse e visualizzare l’elenco complessivo delle prenotazioni.

Il progetto realizza anche il **Livello 2**, introducendo vincoli e logiche di business più articolate: controllo automatico dei conflitti temporali, durata massima delle prenotazioni, fasce orarie settimanali per ciascuna risorsa, ricerca di risorse disponibili per data e orario, filtri per tipologia e capienza, gestione degli stati delle prenotazioni e vista agenda/calendario.

Infine, UniBook include un’estensione di **Livello 3** tramite l’esportazione delle prenotazioni in formato `.ics`. Questa funzione permette all’utente di scaricare una prenotazione futura confermata e importarla in un calendario esterno, come Google Calendar, Apple Calendar, Outlook o Thunderbird. Il file `.ics` viene generato direttamente dal backend secondo il formato iCalendar, senza utilizzare librerie esterne dedicate.


---

## Sommario

- [Come avviare il progetto](#come-avviare-il-progetto)
- [Credenziali di test](#credenziali-di-test)
- [Come provare il progetto](#come-provare-il-progetto)
- [Livelli della traccia implementati](#livelli-della-traccia-implementati)
- [Funzionalità per l’utente](#funzionalità-per-lutente)
- [Funzionalità per l’amministratore](#funzionalità-per-lamministratore)
- [Database](#database)
- [Architettura del progetto](#architettura-del-progetto)
- [Sicurezza, validazione e autorizzazioni](#sicurezza-validazione-e-autorizzazioni)
- [Vincoli applicativi principali](#vincoli-applicativi-principali)
- [Gestione degli errori 404 e 500](#gestione-degli-errori-404-e-500)
- [Dipendenze](#dipendenze)
- [Nota sul repository GitHub](#nota-sul-repository-github)

---

## Come avviare il progetto

Questa sezione spiega passo per passo come scaricare, installare e avviare UniBook a partire dal repository GitHub.

L’obiettivo è, partendo da una cartella pulita, quello di installare le dipendenze, creare il database, inserire i dati di esempio e avviare l’applicazione senza dover configurare manualmente file aggiuntivi.

---

### 1. Scaricare il progetto da GitHub

Per prima cosa bisogna scaricare il repository del progetto.

Da terminale, eseguire:

```bash
git clone https://github.com/Federico-DellaCorte/UniBook.git
```

Poi entrare nella cartella del progetto:

```bash
cd UniBook
```

La cartella corretta è quella che contiene il file `package.json`.

Per verificare di essere nella cartella giusta, devono essere presenti file e cartelle come:

```text
package.json
package-lock.json
README.md
src/
views/
public/
```

Tutti i comandi successivi devono essere eseguiti da questa cartella.

---

### 2. Installare le dipendenze

Una volta entrati nella cartella del progetto, bisogna installare le dipendenze npm:

```bash
npm install
```

Questo comando legge i file `package.json` e `package-lock.json` e scarica tutte le librerie necessarie per eseguire UniBook.

La cartella `node_modules/` viene creata automaticamente da questo comando.

`node_modules/` non è inclusa nel repository GitHub perché contiene file generati automaticamente, spesso molto numerosi e legati all’ambiente locale. Per questo motivo è una pratica corretta caricare su GitHub `package.json` e `package-lock.json`, ma non `node_modules/`.

---

### 3. Creare il database

Dopo aver installato le dipendenze, bisogna creare il database SQLite dell’applicazione:

```bash
npm run db:init
```

Questo comando inizializza il database locale e crea il file:

```text
data/app.db
```

All’interno del database vengono create le tabelle necessarie al funzionamento del progetto, tra cui:

- utenti;
- risorse;
- disponibilità settimanali delle risorse;
- prenotazioni.

Non è necessario installare SQLite separatamente per avviare il progetto. UniBook utilizza SQLite tramite la dipendenza npm `better-sqlite3`.

Strumenti come SQLite CLI o DB Browser for SQLite sono utili solo se si vuole aprire e controllare manualmente il database, ma non sono obbligatori per eseguire l’applicazione.

---

### 4. Inserire i dati di esempio

Dopo aver creato il database, bisogna popolarlo con dati dimostrativi:

```bash
npm run seed
```

Questo comando inserisce dati già pronti per provare l’applicazione.

In particolare, vengono creati:

- un utente amministratore;
- due utenti standard;
- diverse risorse universitarie divise per categoria;
- le disponibilità settimanali delle risorse;
- alcune prenotazioni dimostrative future.

Il seed permette di testare subito il progetto senza dover creare manualmente utenti, risorse e prenotazioni.

---

### 5. Avviare il server

A questo punto è possibile avviare l’applicazione:

```bash
npm start
```

Il server Express viene avviato sulla porta predefinita `3000`.

Dopo l’avvio, aprire il browser e visitare:

```text
http://localhost:3000
```

Da questa pagina è possibile accedere all’applicazione, effettuare il login con le credenziali di test e provare le funzionalità utente e amministratore.

---

### 6. Sequenza completa dei comandi

Riassumendo, dopo aver clonato il repository, i comandi da eseguire sono:

```bash
cd UniBook
npm install
npm run db:init
npm run seed
npm start
```

I comandi devono essere eseguiti uno alla volta.

Se tutto è stato configurato correttamente, l’applicazione sarà disponibile all’indirizzo:

```text
http://localhost:3000
```

---

### 7. Avvio in modalità sviluppo

Durante lo sviluppo è possibile avviare il progetto con:

```bash
npm run dev
```

Questo comando usa `nodemon`, che riavvia automaticamente il server quando vengono modificati i file del progetto.

Per la semplice esecuzione del progetto è sufficiente usare:

```bash
npm start
```

---

### 8. Cambiare la porta del server

Per impostazione predefinita, UniBook viene avviato sulla porta `3000`.

Quindi, dopo aver eseguito:

```bash
npm start
```

l’applicazione sarà disponibile all’indirizzo:

```text
http://localhost:3000
```

Se la porta `3000` è già occupata da un altro programma, è possibile avviare UniBook su una porta diversa.

Il comando va eseguito **dal terminale aperto nella cartella principale del progetto**, cioè la cartella che contiene `package.json`.

Su Windows PowerShell:

```powershell
$env:PORT = 4000; npm start
```

Su macOS o Linux:

```bash
PORT=4000 npm start
```

In questo esempio il server viene avviato sulla porta `4000`, quindi l’applicazione sarà disponibile su:

```text
http://localhost:4000
```

Non bisogna modificare file del progetto per cambiare porta. La porta viene letta dalla variabile d’ambiente `PORT`; se questa variabile non viene impostata, il server usa automaticamente la porta `3000`.

---

### 9. Altri scenari 

Per ripartire da un database pulito, vedere la sezione [Ricreazione del database](#ricreazione-del-database) dentro [Database](#database): contiene i comandi PowerShell e Bash per rifare `data/app.db` da zero.

Per sapere quali file vengono caricati su GitHub e quali sono ignorati (`node_modules/`, `data/app.db`, eventuali `.env`), vedere la sezione finale [Nota sul repository GitHub](#nota-sul-repository-github).

---

## Credenziali di test

Dopo aver avviato il progetto, è possibile accedere all’applicazione usando alcune credenziali già inserite nel database tramite il comando:

```bash
npm run seed
```

Le credenziali di test permettono di provare sia il comportamento di un utente normale sia quello dell’amministratore.

| Username | Email | Password | Ruolo |
|---|---|---|---|
| `admin` | `admin@unibook.test` | `admin123` | Amministratore |
| `mario` | `mario@unibook.test` | `mario123` | Utente standard |
| `lucia` | `lucia@unibook.test` | `lucia123` | Utente standard |

Il login accetta sia lo username sia l’email.

Per esempio, per accedere come amministratore si può inserire:

```text
admin
admin123
```

oppure:

```text
admin@unibook.test
admin123
```

Le password non sono salvate in chiaro nel database. Nel database viene salvato soltanto l’hash generato con `bcrypt`. Le password sono riportate qui solo per rendere possibile la prova dell’applicazione.

---

## Come provare il progetto

Questa sezione propone un percorso reale per verificare le funzionalità principali di UniBook dopo l’avvio del server. Tutte le rotte indicate corrispondono a quelle effettivamente registrate in `src/routes/`.

Prima di partire, assicurarsi di aver eseguito `npm install`, `npm run db:init`, `npm run seed`, `npm start`, e di avere il browser aperto su <http://localhost:3000>.

---

### 1. Homepage e login

- Aprire `/`: la homepage mostra "Accedi" e "Registrati" se non si è autenticati.
- Aprire `/login` e accedere come utente standard:
  ```text
  Username: mario
  Password: mario123
  ```
- Dopo un login riuscito si viene reindirizzati a **`/dashboard`** con un messaggio flash di conferma. Lo stesso accade per l’admin.

> Il login accetta anche l’email (`mario@unibook.test`). Le password sono salvate in DB solo come hash bcrypt: il valore in chiaro nel README serve solo per i test.

---

### 2. Percorso utente standard - consultazione e prenotazione

1. **Indice categorie**: `/resources`. Si vedono le cinque categorie (aule, sale, laboratori, postazioni, attrezzature) come card, con sopra un form di ricerca avanzata.
2. **Lista per categoria**: clic su una card oppure `/resources?type=aula`. Mostra le risorse attive della categoria con il riassunto della disponibilità settimanale.
3. **Ricerca avanzata**: dal form sopra le card, oppure direttamente con URL del tipo:
   ```text
   /resources?type=aula&minCapacity=20&date=2026-06-05&start=09:00&end=11:00&q=studio
   ```
   I filtri sono combinabili. Le regole: gli orari devono andare a coppia (`start` + `end`) e richiedono anche `date`; un eventuale errore di forma viene mostrato sotto il campo.
4. **Scheda risorsa**: clic su un risultato (es. `/resources/1`). Mostra capienza, posizione, descrizione, **disponibilità settimanale** e la sezione *"Disponibilità e prenotazioni del giorno"*. Cambiando data dal selettore, la sezione si aggiorna via `fetch` chiamando `/api/availability` (verificabile dagli strumenti di sviluppo del browser → pannello Network). Il fallback server-side è disponibile anche con JavaScript disabilitato.
5. **Nuova prenotazione**: bottone "Prenota" → `/bookings/new?resourceId=1`. Scegliere data e slot a 30 minuti (le tendine `Ora inizio` / `Ora fine` propongono solo gli slot validi del giorno selezionato) e inviare. La submit va su `POST /bookings`; in caso di successo si viene reindirizzati a `/bookings/mine` con flash di conferma. In caso di errore, il form viene ripresentato con i messaggi inline per campo o un callout sopra al form.
6. **Verifica conflitti / capienza**: provare a creare una seconda prenotazione che si sovrapponga alla prima sulla stessa risorsa (o che ecceda la capienza in una risorsa con `capacity > 1`). Il server rifiuta e mostra il messaggio. Il controllo è eseguito lato server dentro una transazione `BEGIN IMMEDIATE`.
7. **Le mie prenotazioni**: `/bookings/mine` (tab *Prossime*), `/bookings/mine?view=calendar` (calendario settimanale con prev / oggi / next), `/bookings/mine?view=history` (storico, incluse le annullate).
8. **Annullamento**: dalla card di una prenotazione futura, bottone "Annulla" → `POST /bookings/:id/cancel`. La prenotazione resta nello storico con stato `cancelled`.
9. **Export `.ics`**: dalla card di una prenotazione futura confermata, bottone "Aggiungi al calendario" → `GET /bookings/:id/ics` scarica un file iCalendar (`text/calendar`). Importabile in Google Calendar, Apple Calendar, Outlook, Thunderbird.

---

### 3. Percorso amministratore

Uscire (`POST /logout` dal menu) e accedere come:

```text
Username: admin
Password: admin123
```

1. **Dashboard admin**: `/dashboard`, con CTA verso gestione risorse e gestione prenotazioni.
2. **Indice categorie risorse**: `/admin/resources`, con conteggi *totale / attive* per ogni categoria.
3. **Lista per categoria (admin)**: `/admin/resources?type=aula`. A differenza della lista utente, mostra **anche** le risorse disattivate con relativo badge.
4. **Creazione**: dal pulsante "+ Nuova risorsa" → `/admin/resources/new?type=aula`. Il form chiede nome, capienza (1..1499), posizione, descrizione e la disponibilità settimanale per ognuno dei 7 giorni.
5. **Modifica**: `/admin/resources/:id/edit`. Se la modifica può rendere invalide prenotazioni future confermate (es. cambio di categoria o riduzione della disponibilità), si viene portati su una pagina di **conferma intermedia** che elenca quante prenotazioni saranno annullate; se l’azione non ha impatto, viene applicata direttamente con flash di conferma.
6. **Disattivazione / riattivazione**: dalla lista per categoria.
   - Disattiva: `/admin/resources/:id/deactivate/confirm` (GET) → `POST /admin/resources/:id/deactivate`. La conferma intermedia compare solo se ci sono prenotazioni future confermate da annullare.
   - Riattiva: `POST /admin/resources/:id/reactivate` (diretto).
7. **Eliminazione definitiva**: `/admin/resources/:id/delete/confirm` → `POST /admin/resources/:id/delete`. Rimuove la risorsa e in cascata le sue prenotazioni, in transazione.
8. **Tutte le prenotazioni — vista elenco**: `/admin/bookings` (default `view=list`). Filtri: periodo (*tutte / future attive / storico*), tipologia, singola risorsa. I filtri sono passati in query string e l’URL è condivisibile.
9. **Tutte le prenotazioni — vista calendario**: `/admin/bookings?view=calendar`. Calendario settimanale con `?week=YYYY-MM-DD`, prev / today / next; i filtri della vista elenco vengono preservati nei link.

---

### 4. Errori 404 e 500

- **404 HTML** (utenti autenticati o no): aprire un URL inesistente, ad esempio
  ```text
  http://localhost:3000/pagina-che-non-esiste
  ```
  Viene mostrata la pagina personalizzata `views/pages/404.hbs` con il percorso richiesto in monospace.
- **404 JSON** (solo da utente autenticato, perché `/api/*` richiede sessione): aprire
  ```text
  http://localhost:3000/api/missing
  ```
  La risposta è `{"error":"Endpoint non trovato"}` con `Content-Type: application/json` e status 404.
- **500**: non c’è una rotta dedicata per provocarlo a comando; in caso di eccezione non gestita lato server, la pagina mostra `views/pages/500.hbs` mentre lo stack completo viene scritto su `console.error` lato server (mai esposto al browser).

---

### 5. Percorso rapido di smoke test

1. `npm start` → <http://localhost:3000>.
2. Login `mario` / `mario123`.
3. `/resources` → clic su un’aula → `/resources/:id` → cambio data e osserva la disponibilità aggiornata via AJAX.
4. Pulsante "Prenota" → crea una prenotazione valida.
5. Ricrea la stessa prenotazione (stesso intervallo, stessa risorsa): il server la rifiuta.
6. `/bookings/mine` → scarica il file `.ics` di quella prenotazione → aprilo o importalo in un calendario.
7. Annulla la prenotazione e controlla che compaia in `?view=history`.
8. Logout, login come `admin` / `admin123`.
9. `/admin/resources?type=aula` → crea una nuova aula con disponibilità solo lun–ven.
10. `/admin/bookings?view=calendar` → osserva la prenotazione fatta da `mario` nella settimana corrente.
11. `http://localhost:3000/non-esiste` → pagina 404 personalizzata.

---

## Livelli della traccia implementati

UniBook è stato sviluppato con l’obiettivo di coprire l’intero percorso previsto dalla **Traccia 1 - Piattaforma di Prenotazione Risorse**.

La traccia è divisa in tre livelli progressivi:

- **Livello 1**, dedicato al nucleo base dell’applicazione;
- **Livello 2**, dedicato a vincoli, disponibilità, conflitti e logiche più avanzate;
- **Livello 3**, dedicato a una funzionalità aggiuntiva tecnicamente significativa.

Il progetto implementa tutti e tre i livelli.

---

### Livello 1 - Prenotazioni base

Il Livello 1 richiede la realizzazione del nucleo principale di una piattaforma di prenotazione risorse.

In UniBook questo livello è implementato attraverso le funzionalità fondamentali dell’applicazione: utenti, autenticazione, risorse, prenotazioni e gestione amministrativa.

Gli utenti possono:

- registrarsi;
- accedere alla piattaforma tramite login;
- visualizzare l’elenco delle risorse prenotabili;
- visualizzare il dettaglio di una risorsa;
- creare una prenotazione indicando risorsa, data, ora di inizio e ora di fine;
- visualizzare le proprie prenotazioni;
- cancellare una propria prenotazione futura.

L’amministratore può:

- creare nuove risorse;
- modificare le informazioni di una risorsa esistente;
- disattivare una risorsa;
- riattivare una risorsa disattivata;
- eliminare definitivamente una risorsa;
- visualizzare l’elenco complessivo delle prenotazioni presenti nel sistema.

Questo livello rappresenta la base dell’applicazione: permette di gestire il ciclo essenziale di una prenotazione, dalla scelta della risorsa fino alla sua eventuale cancellazione.

---

### Livello 2 — Vincoli, disponibilità e gestione dei conflitti

Il Livello 2 richiede di estendere il progetto base introducendo regole applicative più articolate.

In UniBook questo livello è implementato attraverso controlli lato server, vincoli temporali, filtri di ricerca, stati delle prenotazioni e viste calendario.

Il sistema controlla automaticamente che una prenotazione sia valida prima di salvarla nel database.

In particolare, UniBook gestisce:

- il controllo dei conflitti temporali;
- la durata minima e massima delle prenotazioni;
- le fasce orarie settimanali disponibili per ciascuna risorsa;
- la ricerca di risorse disponibili per data e orario;
- i filtri per categoria, capienza e parola chiave;
- lo stato delle prenotazioni;
- la vista agenda o calendario delle prenotazioni.

Il controllo dei conflitti non è gestito solo nell’interfaccia grafica, ma viene eseguito nel backend. Questo significa che anche se un utente provasse a modificare manualmente una richiesta dal browser, il server verificherebbe comunque la validità della prenotazione prima di inserirla nel database.

Una parte importante del Livello 2 è la gestione della capienza. UniBook non si limita a verificare se una risorsa è già occupata, ma considera anche quante prenotazioni contemporanee può sostenere quella risorsa. Per esempio, una risorsa con capienza maggiore di 1 può accettare più prenotazioni nello stesso intervallo, fino al limite massimo consentito dalla capienza.

La creazione della prenotazione viene inoltre eseguita dentro una transazione. Questo serve a evitare casi critici in cui due utenti provano a prenotare contemporaneamente lo stesso ultimo posto disponibile.

---

### Livello 3 - Estensione: esportazione calendario `.ics`

Per il Livello 3 è stata implementata l’esportazione delle prenotazioni in formato `.ics` (standard iCalendar, RFC 5545).

L’utente può scaricare una prenotazione futura confermata come file calendario e importarla in un’applicazione di calendario personale. Per i dettagli sui calendari supportati e sui vincoli di accesso (solo prenotazioni future, solo se confermate, solo per il proprietario), vedere [Esportazione della prenotazione in formato `.ics`](#esportazione-della-prenotazione-in-formato-ics) nella sezione delle funzionalità utente.

Il file `.ics` viene generato direttamente dal backend, costruendo manualmente il contenuto del file secondo la struttura iCalendar, senza usare librerie esterne dedicate.

Questa funzionalità rappresenta l’estensione di Livello 3 perché introduce un’integrazione con strumenti esterni all’applicazione: la prenotazione non rimane solo dentro UniBook, ma può essere portata in un calendario personale dell’utente.

---

### Sintesi del livello raggiunto

| Livello | Stato | Come viene realizzato in UniBook |
|---|---|---|
| **Livello 1** | Implementato | Registrazione, login, risorse, dettaglio risorsa, creazione prenotazioni, cancellazione futura, gestione amministrativa |
| **Livello 2** | Implementato | Conflitti temporali, durata massima, fasce orarie, ricerca disponibilità, filtri, stati prenotazione, vista calendario |
| **Livello 3** | Implementato | Esportazione delle prenotazioni future confermate in formato `.ics` per calendari esterni |

In sintesi, UniBook implementa il nucleo funzionale richiesto dalla traccia, aggiunge le logiche avanzate di disponibilità e controllo dei conflitti, e include un’estensione di Livello 3 tramite integrazione con calendari esterni.

---

## Funzionalità per l’utente

In UniBook l’utente standard rappresenta la persona che vuole consultare e prenotare una risorsa universitaria condivisa.

Dopo la registrazione e il login, l’utente può accedere alle funzionalità principali della piattaforma: consultazione delle risorse, ricerca delle disponibilità, creazione delle prenotazioni, gestione delle proprie prenotazioni ed esportazione calendario.

---

### Registrazione e accesso

Un nuovo utente può registrarsi alla piattaforma creando un account personale.

Durante la registrazione, il sistema assegna automaticamente il ruolo di utente standard. Questo significa che un utente non può auto-attribuirsi privilegi da amministratore modificando il form o la richiesta inviata al server.

Dopo la registrazione, oppure usando un account già presente nel seed, l’utente può effettuare il login.

Il login accetta sia:

- username;
- email.

Le password non vengono salvate in chiaro nel database, ma solo come hash generato tramite `bcrypt`.

---

### Consultazione delle risorse

Una volta autenticato, l’utente può consultare le risorse disponibili nella piattaforma.

Le risorse sono organizzate per categoria. Le categorie gestite da UniBook sono:

- aule studio;
- sale riunioni;
- laboratori;
- postazioni informatiche;
- attrezzature condivise.

L’utente visualizza solo le risorse attive, cioè quelle che l’amministratore ha reso disponibili alla prenotazione.

Una risorsa disattivata dall’amministratore non viene proposta agli utenti come prenotabile.

---

### Ricerca e filtri

L’utente può cercare le risorse usando filtri combinabili.

La ricerca può tenere conto di:

- categoria della risorsa;
- capienza minima;
- parola chiave;
- data;
- fascia oraria.

Questa funzionalità serve a rendere la piattaforma utile anche quando le risorse sono molte. L’utente non deve controllare manualmente ogni singola risorsa, ma può restringere i risultati in base alle proprie esigenze.

Per esempio, può cercare una sala con una certa capienza minima oppure una risorsa disponibile in una specifica data e fascia oraria.

---

### Scheda dettaglio della risorsa

Ogni risorsa ha una scheda di dettaglio.

La scheda permette all’utente di visualizzare le informazioni principali della risorsa, come:

- nome;
- categoria;
- capienza;
- posizione;
- descrizione;
- disponibilità settimanale;
- occupazione nel giorno selezionato.

La disponibilità del giorno è mostrata in modo aggregato e non espone dati personali degli altri utenti. L’utente può quindi vedere se una risorsa è libera o occupata in determinati slot, senza conoscere l’identità di chi ha effettuato altre prenotazioni.

Questa scelta mantiene utile l’informazione sulla disponibilità, ma evita di mostrare dati non necessari.

---

### Aggiornamento disponibilità tramite AJAX

Nella scheda della risorsa è presente una funzionalità AJAX basata su `fetch`.

Quando l’utente cambia la data selezionata, la disponibilità giornaliera della risorsa viene aggiornata senza ricaricare tutta la pagina.

Il browser invia una richiesta all’endpoint JSON:

```text
/api/availability
```

Il server risponde con i dati di disponibilità della risorsa per quel giorno.

Questa funzionalità dimostra l’uso di JavaScript lato client per migliorare l’interazione con l’applicazione, mantenendo però la logica principale nel backend.

La disponibilità resta comunque gestita anche lato server: l’AJAX migliora l’esperienza utente, ma non sostituisce i controlli del backend.

---

### Creazione di una prenotazione

L’utente può creare una prenotazione scegliendo:

- risorsa;
- data;
- ora di inizio;
- ora di fine.

Gli orari sono organizzati in slot da 30 minuti.

Quando l’utente invia il form di prenotazione, il server controlla che la richiesta sia valida prima di salvarla nel database.

Il sistema verifica, tra le altre cose:

- che la risorsa esista;
- che la risorsa sia attiva;
- che la data e gli orari siano validi;
- che la prenotazione sia futura;
- che l’intervallo scelto rientri negli orari di apertura della risorsa;
- che la durata non superi il limite massimo previsto;
- che non ci siano conflitti temporali;
- che non venga superata la capienza della risorsa;
- che l’utente non superi i limiti applicativi previsti.

Se la prenotazione è valida, viene salvata nel database con stato `confirmed`.

Se invece la prenotazione viola una regola, non viene salvata e l’utente riceve un messaggio di errore.

---

### Controllo dei conflitti

Uno degli aspetti centrali di UniBook è il controllo dei conflitti temporali.

Il sistema impedisce di prenotare una risorsa quando l’intervallo richiesto non è disponibile.

Il controllo viene eseguito lato server, quindi non dipende solo dall’interfaccia grafica o da JavaScript nel browser.

Questo è importante perché la validazione lato client può migliorare l’esperienza utente, ma non è sufficiente per garantire la correttezza dei dati. La decisione finale viene sempre presa dal backend prima dell’inserimento nel database.

Per le risorse con capienza maggiore di 1, UniBook tiene conto anche del numero massimo di prenotazioni contemporanee ammesse. In questo modo una risorsa può accettare più prenotazioni nello stesso intervallo solo fino al limite consentito dalla sua capienza.

---

### Le mie prenotazioni

L’utente può visualizzare le proprie prenotazioni in un’area personale.

Questa sezione permette di distinguere tra:

- prenotazioni future;
- prenotazioni visualizzate in forma di calendario settimanale;
- prenotazioni passate o storico.

L’utente vede solo le proprie prenotazioni e non quelle degli altri utenti.

Questa separazione è importante perché ogni utente deve poter gestire il proprio spazio personale senza accedere a informazioni non autorizzate.

---

### Cancellazione di una prenotazione futura

L’utente può cancellare una propria prenotazione futura.

La cancellazione non elimina necessariamente il record dal database: la prenotazione viene mantenuta con stato `cancelled`.

Questa scelta permette di conservare una traccia storica dell’operazione, evitando di perdere completamente l’informazione sulla prenotazione originaria.

L’utente non può cancellare prenotazioni appartenenti ad altri utenti.

---

### Esportazione della prenotazione in formato `.ics`

Per le prenotazioni future confermate, UniBook permette all’utente di scaricare un file `.ics`.

Il formato `.ics` è un formato standard per lo scambio di eventi calendario.

Il file scaricato può essere importato in applicazioni esterne come:

- Google Calendar;
- Apple Calendar;
- Microsoft Outlook;
- Thunderbird.

Questa funzione permette all’utente di portare la prenotazione fuori da UniBook e inserirla nel proprio calendario personale.

L’esportazione è disponibile solo quando la prenotazione:

- appartiene all’utente autenticato;
- è futura;
- ha stato `confirmed`.

Questa funzionalità costituisce l’estensione di Livello 3 scelta per il progetto.

---

### Sintesi delle funzionalità utente

| Funzionalità | Descrizione |
|---|---|
| Registrazione | Creazione di un account utente standard |
| Login | Accesso tramite username o email |
| Consultazione risorse | Visualizzazione delle risorse prenotabili |
| Ricerca e filtri | Ricerca per categoria, capienza, parola chiave, data e fascia oraria |
| Dettaglio risorsa | Visualizzazione di informazioni, orari e disponibilità |
| Prenotazione | Creazione di una prenotazione futura valida |
| Controllo conflitti | Verifica lato server di disponibilità, capienza e sovrapposizioni |
| Area personale | Visualizzazione delle proprie prenotazioni |
| Cancellazione | Annullamento di una propria prenotazione futura |
| Export `.ics` | Download della prenotazione come evento calendario |

---

## Funzionalità per l’amministratore

In UniBook l’amministratore ha il compito di gestire le risorse prenotabili e di controllare l’insieme delle prenotazioni presenti nel sistema.

A differenza dell’utente standard, che può consultare e prenotare risorse, l’amministratore può intervenire sulla struttura della piattaforma: può creare nuove risorse, modificarle, disattivarle, riattivarle, eliminarle e visualizzare tutte le prenotazioni effettuate dagli utenti.

Le funzionalità amministrative sono protette: solo gli utenti con ruolo `admin` possono accedere alle pagine di amministrazione.

---

### Accesso all’area amministrativa

L’area amministrativa è accessibile solo dopo il login con un account amministratore.

Nel seed del progetto è già presente un account admin:

```text
Username: admin
Password: admin123
```

Un utente standard non può accedere alle rotte amministrative. Se prova a raggiungere una pagina riservata all’amministratore, viene reindirizzato alla propria dashboard e non può eseguire operazioni non autorizzate.

Questa separazione tra utente standard e amministratore è importante perché alcune operazioni, come eliminare o disattivare una risorsa, hanno effetto sull’intero sistema e non devono essere disponibili a tutti gli utenti.

---

### Gestione delle risorse

L’amministratore può gestire le risorse universitarie disponibili nella piattaforma.

Le risorse rappresentano gli oggetti prenotabili dagli utenti, per esempio:

- aule studio;
- sale riunioni;
- laboratori;
- postazioni informatiche;
- attrezzature condivise.

Per ogni risorsa l’amministratore può gestire informazioni come:

- nome;
- categoria;
- capienza;
- posizione;
- descrizione;
- stato attivo o disattivato;
- disponibilità settimanale.

La disponibilità settimanale indica in quali giorni e in quali orari una risorsa può essere prenotata.

---

### Creazione di una nuova risorsa

L’amministratore può creare una nuova risorsa inserendo i dati necessari alla prenotazione.

Quando viene creata una risorsa, il sistema salva nel database le sue informazioni principali e le disponibilità settimanali associate.

Questa funzionalità permette di estendere il catalogo delle risorse senza modificare il codice dell’applicazione. Per esempio, se l’università aggiunge una nuova aula studio o un nuovo laboratorio, l’amministratore può inserirlo direttamente dall’interfaccia web.

---

### Modifica di una risorsa esistente

L’amministratore può modificare una risorsa già presente nel sistema.

La modifica può riguardare dati descrittivi, come nome, posizione o descrizione, ma anche dati più importanti dal punto di vista applicativo, come:

- categoria;
- capienza;
- disponibilità settimanale;
- orari di apertura;
- orari di chiusura.

Queste modifiche possono avere effetto sulle prenotazioni future già esistenti. Per questo motivo UniBook prevede controlli aggiuntivi quando una modifica può incidere su prenotazioni confermate.

---

### Disattivazione di una risorsa

L’amministratore può disattivare una risorsa.

Disattivare una risorsa significa renderla non più prenotabile dagli utenti, senza però eliminarla definitivamente dal database.

Questa scelta è utile quando una risorsa non deve essere più disponibile per un certo periodo, per esempio perché:

- è temporaneamente non utilizzabile;
- è in manutenzione;
- non deve essere proposta agli utenti;
- si vuole conservarne lo storico senza cancellarla.

Una risorsa disattivata non viene mostrata agli utenti come risorsa prenotabile.

La disattivazione è quindi una forma di eliminazione logica, chiamata anche `soft delete`, perché la risorsa rimane nel database ma non è più disponibile per nuove prenotazioni.

---

### Riattivazione di una risorsa

Una risorsa disattivata può essere riattivata dall’amministratore.

La riattivazione rende nuovamente disponibile la risorsa agli utenti, che potranno tornare a visualizzarla e prenotarla secondo le sue fasce orarie.

Questa funzionalità è utile perché permette di sospendere temporaneamente una risorsa senza doverla eliminare e ricreare da zero.

---

### Eliminazione definitiva di una risorsa

Oltre alla disattivazione, l’amministratore può eliminare definitivamente una risorsa.

L’eliminazione definitiva è un’operazione più forte rispetto alla disattivazione, perché rimuove la risorsa dal sistema.

Questa operazione deve essere usata con maggiore attenzione, soprattutto se la risorsa ha prenotazioni associate.

Per questo motivo UniBook distingue tra:

- **disattivazione**, quando si vuole rendere una risorsa non prenotabile ma conservarla nel sistema;
- **eliminazione**, quando si vuole rimuovere definitivamente la risorsa.

In generale, la disattivazione è più adatta quando si vuole mantenere traccia della risorsa e delle sue informazioni. L’eliminazione definitiva è invece adatta quando la risorsa non deve più far parte del sistema.

---

### Conferme intermedie per operazioni sensibili

UniBook include un meccanismo di conferma per alcune operazioni amministrative.

Quando un’azione può avere effetto su prenotazioni future già confermate, il sistema mostra una pagina di conferma prima di completare l’operazione.

Questo può accadere, per esempio, quando l’amministratore:

- disattiva una risorsa con prenotazioni future;
- elimina una risorsa con prenotazioni future;
- modifica dati che possono rendere non più valide alcune prenotazioni future;
- cambia disponibilità o caratteristiche rilevanti della risorsa.

La conferma intermedia serve a evitare modifiche accidentali. L’amministratore viene informato dell’impatto dell’azione e può decidere consapevolmente se procedere.

Se invece l’azione non ha impatto su prenotazioni future confermate, il sistema può completarla direttamente senza mostrare una conferma aggiuntiva.

---

### Visualizzazione di tutte le prenotazioni

L’amministratore può visualizzare tutte le prenotazioni presenti nel sistema.

Questa funzionalità è diversa dalla sezione “Le mie prenotazioni” dell’utente standard.

L’utente standard vede solo le proprie prenotazioni, mentre l’amministratore ha una visione complessiva dell’utilizzo delle risorse.

L’elenco amministrativo delle prenotazioni consente di controllare:

- quale utente ha effettuato una prenotazione;
- quale risorsa è stata prenotata;
- data e orario della prenotazione;
- stato della prenotazione;
- categoria della risorsa.

Questa vista è utile per monitorare il funzionamento generale della piattaforma e verificare l’uso delle risorse condivise.

---

### Filtri sulle prenotazioni

Nell’area amministrativa, le prenotazioni possono essere filtrate.

I filtri permettono di restringere la visualizzazione in base a criteri come:

- periodo;
- tipologia di risorsa;
- singola risorsa;
- vista elenco o calendario.

Questa funzione è utile quando nel sistema sono presenti molte prenotazioni, perché consente all’amministratore di analizzare solo quelle rilevanti.

Per esempio, l’amministratore può controllare le prenotazioni di una determinata settimana oppure concentrarsi su una specifica categoria di risorse.

---

### Vista calendario amministrativa

Oltre alla vista elenco, l’amministratore può consultare una vista calendario delle prenotazioni.

La vista calendario permette di leggere le prenotazioni in modo temporale, osservando come sono distribuite durante la settimana.

Questa rappresentazione è utile perché rende più immediato capire:

- quali risorse sono più utilizzate;
- in quali fasce orarie ci sono più prenotazioni;
- se ci sono giorni particolarmente pieni;
- come si distribuisce l’uso delle risorse nel tempo.

La vista calendario non sostituisce l’elenco tabellare, ma lo affianca con una rappresentazione più visiva.

---

### Controllo delle autorizzazioni

Tutte le funzionalità amministrative sono protette da controlli di autorizzazione.

Il sistema distingue tra:

- utente anonimo;
- utente standard autenticato;
- amministratore autenticato.

Un utente anonimo deve prima effettuare il login.

Un utente standard non può usare le funzioni amministrative.

Solo un utente con ruolo `admin` può accedere alle pagine di gestione delle risorse e alla lista complessiva delle prenotazioni.

Questo controllo è fondamentale per evitare che utenti non autorizzati possano modificare risorse, eliminare dati o visualizzare informazioni che non competono al loro ruolo.

---

### Sintesi delle funzionalità amministratore

| Funzionalità | Descrizione |
|---|---|
| Accesso area admin | Accesso riservato agli utenti con ruolo `admin` |
| Creazione risorse | Inserimento di nuove risorse prenotabili |
| Modifica risorse | Aggiornamento di dati, capienza, descrizione e disponibilità |
| Disattivazione risorse | Rende una risorsa non prenotabile senza eliminarla dal database |
| Riattivazione risorse | Rende nuovamente prenotabile una risorsa disattivata |
| Eliminazione risorse | Rimuove definitivamente una risorsa dal sistema |
| Conferme intermedie | Richieste quando un’azione può influire su prenotazioni future |
| Visualizzazione prenotazioni | Vista complessiva di tutte le prenotazioni del sistema |
| Filtri prenotazioni | Filtri per periodo, categoria o singola risorsa |
| Vista calendario | Rappresentazione settimanale delle prenotazioni |
| Autorizzazioni | Protezione delle rotte amministrative tramite ruolo `admin` |

---

## Database

UniBook usa un database **SQLite** per salvare in modo persistente le informazioni principali dell’applicazione.

Il database viene creato automaticamente con il comando:

```bash
npm run db:init
```

Dopo la creazione delle tabelle, può essere popolato con dati di esempio tramite:

```bash
npm run seed
```

Il file del database viene generato localmente nella cartella:

```text
data/app.db
```

Questo file non deve essere scritto manualmente: viene creato dagli script del progetto.

---

### Perché viene usato SQLite

SQLite è un database leggero basato su file. Questo significa che non richiede l’installazione o la configurazione di un server database separato.

Nel progetto, SQLite viene usato tramite la libreria npm `better-sqlite3`, quindi per avviare UniBook non è necessario installare SQLite manualmente.

La scelta è coerente con un progetto web universitario perché permette di avere:

- persistenza dei dati;
- struttura relazionale;
- tabelle collegate tra loro;
- query SQL;
- database facilmente ricreabile;
- configurazione semplice.

SQLite CLI o DB Browser for SQLite possono essere usati per ispezionare il database, ma non sono obbligatori per eseguire il progetto.

---

### Tabelle principali

Il database di UniBook contiene quattro aree principali:

- utenti;
- risorse;
- disponibilità settimanali delle risorse;
- prenotazioni.

Queste informazioni sono salvate in tabelle separate, collegate tra loro tramite chiavi esterne.

---

### Tabella `users`

La tabella `users` contiene gli account registrati nella piattaforma.

Ogni utente ha:

- identificativo univoco;
- username;
- email;
- password hashata;
- ruolo;
- data di creazione.

I ruoli previsti sono:

```text
admin
user
```

Il ruolo `admin` identifica l’amministratore della piattaforma.

Il ruolo `user` identifica un utente standard, cioè un utente che può consultare e prenotare risorse.

Le password non vengono salvate in chiaro. Nel database viene salvato solo il valore hash generato con `bcrypt`.

Schema concettuale:

```text
users
- id
- username
- email
- password_hash
- role
- created_at
```

---

### Tabella `resources`

La tabella `resources` contiene le risorse prenotabili.

Una risorsa può rappresentare, per esempio:

- un’aula studio;
- una sala riunioni;
- un laboratorio;
- una postazione informatica;
- un’attrezzatura condivisa.

Ogni risorsa ha:

- nome;
- categoria;
- capienza;
- posizione;
- descrizione;
- stato attivo o disattivato.

Le categorie gestite dal progetto sono:

```text
aula
sala
laboratorio
postazione
attrezzatura
```

La colonna `active` indica se la risorsa è attualmente prenotabile.

- `active = 1`: la risorsa è attiva e può essere mostrata agli utenti;
- `active = 0`: la risorsa è disattivata e non viene proposta come prenotabile.

Questo permette all’amministratore di sospendere una risorsa senza eliminarla definitivamente dal database.

Schema concettuale:

```text
resources
- id
- name
- type
- capacity
- location
- description
- active
- opens_at
- closes_at
```

Le colonne `opens_at` e `closes_at` sono mantenute come informazioni legacy o di default. La disponibilità effettiva delle risorse viene gestita principalmente dalla tabella `resource_availability`.

---

### Tabella `resource_availability`

La tabella `resource_availability` contiene le fasce orarie settimanali in cui ogni risorsa è disponibile.

Ogni risorsa ha una riga di disponibilità per ciascun giorno della settimana.

Per ogni giorno viene indicato:

- se la risorsa è aperta;
- l’orario di apertura;
- l’orario di chiusura.

In questo modo due risorse possono avere orari diversi. Per esempio, un laboratorio può essere disponibile in certi giorni e orari, mentre un’attrezzatura può seguire regole differenti.

Schema concettuale:

```text
resource_availability
- id
- resource_id
- weekday
- is_open
- opens_at
- closes_at
```

Il campo `resource_id` collega la disponibilità alla risorsa corrispondente.

Questa tabella è importante per il Livello 2, perché permette di gestire fasce orarie disponibili per ciascuna risorsa.

---

### Tabella `bookings`

La tabella `bookings` contiene le prenotazioni effettuate dagli utenti.

Ogni prenotazione collega:

- un utente;
- una risorsa;
- un orario di inizio;
- un orario di fine;
- uno stato.

Schema concettuale:

```text
bookings
- id
- user_id
- resource_id
- start_at
- end_at
- status
- created_at
```

Il campo `user_id` collega la prenotazione all’utente che l’ha creata.

Il campo `resource_id` collega la prenotazione alla risorsa prenotata.

Gli stati principali sono:

```text
confirmed
cancelled
```

Una prenotazione confermata ha stato `confirmed`.

Quando un utente annulla una propria prenotazione futura, la prenotazione non viene semplicemente rimossa, ma viene aggiornata con stato `cancelled`.

Questa scelta permette di conservare una traccia storica delle prenotazioni annullate.

---

### Relazioni tra le tabelle

Le tabelle sono collegate tra loro.

Il rapporto principale è questo:

```text
users        1 ─── N bookings
resources    1 ─── N bookings
resources    1 ─── N resource_availability
```

Significa che:

- un utente può avere molte prenotazioni;
- una risorsa può avere molte prenotazioni;
- una risorsa può avere più righe di disponibilità settimanale;
- ogni prenotazione appartiene a un solo utente e a una sola risorsa.

Questa struttura consente di separare bene i concetti principali del progetto.

Gli utenti sono gestiti nella tabella `users`.

Le risorse sono gestite nella tabella `resources`.

Gli orari settimanali sono gestiti nella tabella `resource_availability`.

Le prenotazioni sono gestite nella tabella `bookings`.

---

### Indici del database

Il database contiene anche alcuni indici.

Gli indici servono a rendere più efficienti le query più frequenti, soprattutto quelle usate per cercare prenotazioni in base a risorsa, utente, stato e intervallo temporale.

Sono particolarmente importanti per il controllo dei conflitti temporali, perché il sistema deve verificare rapidamente se una risorsa ha già prenotazioni nello stesso intervallo.

Esempi di indici usati:

```text
idx_bookings_resource_time
idx_bookings_user
idx_bookings_user_time
idx_bookings_status_time
idx_availability_resource
```

---

### Dati inseriti dal seed

Il comando:

```bash
npm run seed
```

inserisce dati dimostrativi nel database.

Il seed crea:

- un utente amministratore;
- due utenti standard;
- diciotto risorse divise nelle categorie del progetto;
- le disponibilità settimanali delle risorse;
- alcune prenotazioni dimostrative future.

Gli utenti di test sono:

```text
admin
mario
lucia
```

Le risorse sono distribuite tra:

- aule;
- sale;
- laboratori;
- postazioni;
- attrezzature.

Le prenotazioni dimostrative vengono create su date future, in modo da poter testare subito l’applicazione anche rilanciando il seed in momenti diversi.

---

### Ricreazione del database

Il database può essere ricreato da zero in qualsiasi momento.

Su Windows PowerShell:

```powershell
Remove-Item .\data\app.db -ErrorAction SilentlyContinue
npm run db:init
npm run seed
```

Su macOS o Linux:

```bash
rm -f data/app.db
npm run db:init
npm run seed
```

Questa procedura elimina il database locale e lo ricrea partendo dagli script del progetto.

È utile per verificare che il repository GitHub contenga tutto il necessario per ricostruire l’applicazione.

---

### Ispezione del database

Per usare UniBook non è necessario aprire manualmente il database.

Tuttavia, se si vuole controllare il contenuto delle tabelle, è possibile usare strumenti come:

- DB Browser for SQLite;
- SQLite CLI.

Con DB Browser for SQLite si può aprire il file:

```text
data/app.db
```

e visualizzare direttamente tabelle, righe e query SQL.

Esempio di query per vedere le risorse divise per categoria:

```sql
SELECT type, active, COUNT(*) AS totale
FROM resources
GROUP BY type, active
ORDER BY type;
```

Esempio di query per vedere le prenotazioni future confermate:

```sql
SELECT b.id, u.username, r.name AS resource, b.start_at, b.end_at, b.status
FROM bookings b
JOIN users u ON u.id = b.user_id
JOIN resources r ON r.id = b.resource_id
WHERE b.status = 'confirmed'
  AND b.start_at >= datetime('now')
ORDER BY b.start_at;
```

Queste query sono utili solo per controllo o debug. L’uso normale dell’applicazione avviene tramite interfaccia web.

---

## Architettura del progetto

UniBook è organizzato seguendo una struttura modulare.

L’obiettivo dell’architettura è separare le responsabilità principali dell’applicazione, in modo che il codice sia più leggibile, manutenibile e facile da spiegare.

Il progetto usa:

- **Express** per il backend e la gestione delle rotte;
- **Handlebars** per generare le pagine HTML lato server;
- **SQLite** tramite `better-sqlite3` per la persistenza dei dati;
- **JavaScript lato client** per alcune interazioni dinamiche;
- **CSS** per lo stile dell’interfaccia.

---

### Struttura generale delle cartelle

La struttura principale di UniBook è organizzata in questo modo:

```text
UniBook/
├── src/
│   ├── server.js                     # Configura Express, middleware, rotte, errori 404/500 e avvio server
│   ├── constants.js                  # Categorie, limiti di durata, limiti giornalieri e capienza massima
│   ├── db/
│   │   ├── connection.js             # Connessione condivisa al database SQLite tramite better-sqlite3
│   │   ├── schema.sql                # Definizione delle tabelle e degli indici del database
│   │   ├── init.js                   # Script che crea o aggiorna la struttura del database
│   │   └── seed.js                   # Script che inserisce utenti, risorse e prenotazioni di esempio
│   ├── repositories/
│   │   ├── userRepo.js               # Query SQL relative agli utenti
│   │   ├── resourceRepo.js           # Query SQL relative alle risorse
│   │   ├── resourceAvailabilityRepo.js # Query SQL relative alle disponibilità settimanali
│   │   └── bookingRepo.js            # Query SQL relative alle prenotazioni
│   ├── services/
│   │   ├── bookingService.js         # Logica di creazione prenotazioni e controllo vincoli del Livello 2
│   │   ├── availabilityService.js    # Calcolo disponibilità, occupazione e capienza residua
│   │   ├── resourceAvailabilityService.js # Gestione delle fasce orarie settimanali delle risorse
│   │   └── icsService.js             # Generazione manuale del file calendario .ics
│   ├── routes/
│   │   ├── auth.routes.js            # Rotte per login, registrazione e logout
│   │   ├── resources.routes.js       # Rotte per elenco risorse, ricerca, filtri e dettaglio risorsa
│   │   ├── admin.resources.routes.js # Rotte amministratore per creazione, modifica, disattivazione ed eliminazione risorse
│   │   ├── bookings.routes.js        # Rotte per creazione, visualizzazione, cancellazione ed export .ics delle prenotazioni
│   │   ├── admin.bookings.routes.js  # Rotte amministratore per elenco e calendario di tutte le prenotazioni
│   │   └── api.routes.js             # Endpoint JSON usato da AJAX per la disponibilità delle risorse
│   ├── middleware/
│   │   ├── currentUser.js            # Rende disponibile l'utente corrente nelle pagine
│   │   ├── flash.js                  # Gestisce i messaggi temporanei mostrati dopo le operazioni
│   │   ├── requireAuth.js            # Protegge le pagine riservate agli utenti autenticati
│   │   └── requireAdmin.js           # Protegge le pagine riservate all'amministratore
│   └── helpers/
│       ├── dateTime.js               # Funzioni di supporto per date, orari e slot temporali
│       └── categoryStats.js          # Funzioni di supporto per conteggi e statistiche sulle categorie
├── views/
│   ├── layouts/
│   │   └── main.hbs                  # Layout principale comune alle pagine
│   ├── partials/                     # Componenti riutilizzabili delle pagine
│   └── pages/
│       ├── resources/                # Pagine utente per categorie, lista, ricerca e dettaglio risorsa
│       ├── bookings/                 # Pagine utente per nuova prenotazione e mie prenotazioni
│       ├── admin/resources/          # Pagine amministratore per gestione risorse
│       ├── admin/bookings/           # Pagine amministratore per lista e calendario prenotazioni
│       ├── 404.hbs                   # Pagina di errore 404 personalizzata
│       └── 500.hbs                   # Pagina di errore 500 personalizzata
├── public/
│   ├── css/
│   │   └── styles.css                # Stili CSS dell'interfaccia
│   └── js/                           # JavaScript lato client, incluso AJAX per disponibilità
├── package.json                      # Dipendenze e comandi npm
├── package-lock.json                 # Versioni esatte delle dipendenze
├── .gitignore                        # File e cartelle esclusi da Git
└── README.md                         # Documentazione del progetto
```

Durante l’esecuzione locale viene generata anche la cartella:

```text
data/
└── app.db                            # Database SQLite locale, non caricato su GitHub
```

Il file `data/app.db` viene creato con `npm run db:init` e popolato con `npm run seed`. Chi clona il repository può rigenerarlo seguendo i comandi indicati nella sezione di avvio.

Ogni cartella ha una responsabilità specifica: `src/` contiene il backend, `views/` contiene le pagine HTML generate da Handlebars, `public/` contiene CSS e JavaScript lato client, mentre `data/` viene creata localmente per contenere il database SQLite.
---

### Cartella `src/`

La cartella `src/` contiene il codice backend dell’applicazione.

Qui si trovano:

- configurazione del server Express;
- connessione al database;
- rotte;
- repository;
- servizi;
- middleware;
- funzioni di supporto.

È la parte dell’applicazione che gestisce la logica server-side.

---

### File `src/server.js`

Il file `src/server.js` è il punto di avvio dell’applicazione.

In questo file vengono configurati:

- Express;
- Handlebars;
- middleware globali;
- file statici;
- sessioni;
- utente corrente;
- messaggi flash;
- rotte applicative;
- gestione degli errori 404 e 500;
- avvio del server sulla porta configurata.

In pratica, `server.js` mette insieme i vari moduli dell’applicazione e avvia il server.

---

### Cartella `src/db/`

La cartella `src/db/` contiene tutto ciò che riguarda il database.

Contiene file come:

```text
connection.js
schema.sql
init.js
seed.js
```

Il file `connection.js` crea la connessione condivisa al database SQLite.

Il file `schema.sql` contiene le istruzioni SQL per creare tabelle e indici.

Il file `init.js` esegue l’inizializzazione del database.

Il file `seed.js` inserisce i dati dimostrativi.

Questa separazione permette di ricreare il database senza dover modificare manualmente il file `app.db`.

---

### Cartella `src/routes/`

La cartella `src/routes/` contiene le rotte dell’applicazione.

Le rotte definiscono gli URL disponibili e collegano le richieste HTTP alla logica applicativa.

Esempi di file presenti:

```text
auth.routes.js
resources.routes.js
bookings.routes.js
admin.resources.routes.js
admin.bookings.routes.js
api.routes.js
```

Ogni file gestisce un’area specifica.

Per esempio:

- `auth.routes.js` gestisce login, registrazione e logout;
- `resources.routes.js` gestisce consultazione e ricerca delle risorse;
- `bookings.routes.js` gestisce prenotazioni utente, cancellazione ed export `.ics`;
- `admin.resources.routes.js` gestisce le risorse lato amministratore;
- `admin.bookings.routes.js` gestisce la vista amministrativa delle prenotazioni;
- `api.routes.js` espone l’endpoint JSON usato da JavaScript lato client.

Nel progetto i router svolgono il ruolo di controller leggeri: ricevono la richiesta, leggono i dati necessari, chiamano service o repository e restituiscono una pagina o una risposta JSON.

---

### Cartella `src/repositories/`

La cartella `src/repositories/` contiene il codice che accede direttamente al database.

I repository isolano le query SQL dal resto dell’applicazione.

Esempi di repository:

```text
userRepo.js
resourceRepo.js
resourceAvailabilityRepo.js
bookingRepo.js
```

Questa separazione è importante perché evita di spargere query SQL in tutti i file del progetto.

Per esempio, invece di scrivere direttamente una query dentro una pagina o dentro una route, la route può chiamare una funzione del repository.

Tutte le query sono eseguite tramite prepared statements, cioè istruzioni SQL parametrizzate. Questo aumenta la sicurezza e riduce il rischio di SQL injection.

---

### Cartella `src/services/`

La cartella `src/services/` contiene la logica applicativa più importante.

I service non si limitano a leggere o scrivere dati, ma applicano le regole del dominio.

Esempi di file presenti:

```text
bookingService.js
availabilityService.js
resourceAvailabilityService.js
icsService.js
```

Il file `bookingService.js` gestisce la creazione delle prenotazioni e i vincoli del Livello 2, come conflitti temporali, durata massima, capienza, limiti utente e transazione.

Il file `availabilityService.js` calcola la disponibilità delle risorse e l’occupazione degli slot.

Il file `resourceAvailabilityService.js` gestisce la disponibilità settimanale delle risorse.

Il file `icsService.js` genera manualmente il contenuto del file `.ics` usato per l’esportazione calendario.

Questa separazione rende il progetto più ordinato: le rotte gestiscono la richiesta HTTP, mentre i service contengono la logica vera dell’applicazione.

---

### Cartella `src/middleware/`

La cartella `src/middleware/` contiene funzioni che si inseriscono nel flusso delle richieste Express.

Esempi di middleware:

```text
currentUser.js
flash.js
requireAuth.js
requireAdmin.js
```

`currentUser.js` rende disponibile nelle viste l’utente attualmente autenticato.

`flash.js` gestisce messaggi temporanei mostrati dopo operazioni come login, logout, creazione o cancellazione.

`requireAuth.js` protegge le pagine riservate agli utenti autenticati.

`requireAdmin.js` protegge le pagine riservate all’amministratore.

I middleware sono utili perché permettono di applicare controlli comuni senza riscriverli in ogni singola rotta.

---

### Cartella `src/helpers/`

La cartella `src/helpers/` contiene funzioni di supporto usate da più parti del progetto.

Per esempio, possono esserci helper per:

- gestione e formattazione di date e orari;
- generazione di slot temporali;
- normalizzazione dell’orario `24:00`;
- statistiche sulle categorie.

Queste funzioni non rappresentano una pagina o una rotta, ma aiutano il resto dell’applicazione a mantenere il codice più pulito.

---

### Cartella `views/`

La cartella `views/` contiene i template Handlebars usati per generare le pagine HTML.

Handlebars permette di creare pagine dinamiche lato server: il backend recupera i dati dal database e li passa al template, che genera l’HTML finale inviato al browser.

La struttura principale è:

```text
views/
├── layouts/
├── partials/
└── pages/
```

`layouts/` contiene la struttura generale della pagina, per esempio il layout principale comune a più viste.

`partials/` contiene componenti riutilizzabili, come messaggi flash, sezioni di disponibilità o parti ripetute dell’interfaccia.

`pages/` contiene le pagine vere e proprie dell’applicazione, come login, registrazione, dashboard, risorse, prenotazioni e pagine amministrative.

---

### Cartella `public/`

La cartella `public/` contiene i file statici serviti direttamente dal server.

Contiene principalmente:

```text
public/css/
public/js/
```

La cartella `public/css/` contiene il foglio di stile dell’applicazione.

La cartella `public/js/` contiene JavaScript eseguito nel browser.

Un esempio importante è il codice che aggiorna la disponibilità di una risorsa tramite `fetch`, senza ricaricare tutta la pagina.

---

### Cartella `data/`

La cartella `data/` contiene il database SQLite generato localmente.

Il file principale è:

```text
data/app.db
```

Questa cartella può essere ricreata con:

```bash
npm run db:init
npm run seed
```

Per questo motivo il database locale **non viene caricato su GitHub**: chi clona il repository può rigenerarlo con `npm run db:init` e `npm run seed`.

---

## Sicurezza, validazione e autorizzazioni

UniBook gestisce dati persistenti e operazioni riservate, quindi il progetto include controlli di sicurezza sia sull’autenticazione sia sulle operazioni applicative.

L’obiettivo non è affidarsi solo all’interfaccia grafica, ma verificare sempre lato server che l’utente possa davvero eseguire l’azione richiesta.

---

### Gestione delle password

Le password degli utenti non vengono salvate in chiaro nel database.

Quando un utente si registra o quando vengono creati gli utenti di test tramite seed, la password viene trasformata in un hash tramite `bcrypt`.

Nel database viene quindi salvato solo il campo:

```text
password_hash
```

Questa scelta è importante perché, anche aprendo direttamente il database, non è possibile leggere le password originali degli utenti.

Le password in chiaro presenti nel README servono solo per provare l’applicazione con gli account di test.

---

### Sessioni utente

Dopo il login, UniBook mantiene l’accesso dell’utente tramite sessione.

La sessione permette al server di ricordare che un determinato browser ha effettuato l’accesso.

Il cookie di sessione è configurato con opzioni di sicurezza come:

- `httpOnly`, per evitare che il cookie venga letto direttamente da JavaScript lato client;
- `sameSite`, per ridurre alcuni rischi legati a richieste provenienti da siti esterni;
- durata limitata della sessione.

Il logout avviene tramite richiesta `POST` e rigenera la sessione, così da chiudere correttamente l’accesso dell’utente.

---

### Ruoli applicativi

UniBook distingue due ruoli principali:

```text
user
admin
```

Il ruolo `user` identifica l’utente standard, che può consultare risorse, creare prenotazioni, vedere le proprie prenotazioni, annullare prenotazioni future ed esportare file `.ics`.

Il ruolo `admin` identifica l’amministratore, che può gestire le risorse e visualizzare tutte le prenotazioni del sistema.

Durante la registrazione pubblica il ruolo viene sempre impostato a `user`. Questo impedisce a un utente di registrarsi autonomamente come amministratore.

---

### Autorizzazioni

Le pagine riservate sono protette da middleware.

In particolare:

- `requireAuth` controlla che l’utente abbia effettuato il login;
- `requireAdmin` controlla che l’utente autenticato sia un amministratore.

Un utente anonimo viene rimandato alla pagina di login.

Un utente standard non può accedere alle pagine amministrative.

Inoltre, alcune operazioni controllano anche la proprietà del dato. Per esempio, un utente può cancellare o esportare in `.ics` solo le proprie prenotazioni, non quelle di altri utenti.

---

### Validazione degli input

Tutti i dati inviati dai form vengono controllati lato server.

Questo significa che UniBook non si fida soltanto dei controlli presenti nel browser.

La validazione riguarda, per esempio:

- campi testuali;
- email;
- numeri;
- date;
- orari;
- categoria della risorsa;
- capienza;
- intervalli temporali delle prenotazioni.

La validazione lato client può migliorare l’esperienza utente, ma la validazione decisiva avviene sempre nel backend.

---

### Query SQL sicure

L’accesso al database avviene tramite repository e prepared statements.

Le query non vengono costruite concatenando direttamente stringhe ricevute dall’utente.

Questa scelta riduce il rischio di SQL injection e rende più sicuro l’accesso ai dati.

---

## Vincoli applicativi principali

UniBook non si limita a salvare prenotazioni nel database, ma applica regole di business per evitare prenotazioni non valide.

Questi vincoli sono parte del Livello 2 della traccia.

| Vincolo | Valore o comportamento |
|---|---|
| Slot orario | 30 minuti |
| Durata minima prenotazione | 30 minuti |
| Durata massima per aule e sale | 5 ore |
| Durata massima per laboratori, postazioni e attrezzature | 4 ore |
| Massimo prenotazioni future attive per utente | 7 |
| Cancellazione prenotazione futura | Consentita al proprietario |
| Stati prenotazione | `confirmed`, `cancelled` |
| Capienza risorsa | Controllata lato server |
| Fasce orarie | Gestite per ogni risorsa e giorno della settimana |
| Sovrapposizioni temporali | Controllate prima del salvataggio |

---

### Controllo dei conflitti

Quando un utente crea una prenotazione, il sistema verifica se la risorsa è disponibile nell’intervallo richiesto.

Il controllo considera:

- data;
- ora di inizio;
- ora di fine;
- risorsa scelta;
- prenotazioni già presenti;
- capienza della risorsa;
- stato delle prenotazioni esistenti.

Una prenotazione cancellata non blocca più la disponibilità.

Una prenotazione confermata, invece, viene considerata nel calcolo dei conflitti.

---

### Capienza della risorsa

UniBook tiene conto anche della capienza.

Questo significa che una risorsa non viene considerata semplicemente “libera” o “occupata” in modo assoluto.

Per esempio, una risorsa con capienza maggiore di 1 può accettare più prenotazioni contemporanee, finché non viene raggiunto il limite massimo.

Il sistema calcola quindi quante prenotazioni sono già presenti nello stesso intervallo e accetta la nuova prenotazione solo se la capienza non viene superata.

---

### Transazione nella creazione della prenotazione

La creazione di una prenotazione avviene dentro una transazione.

In particolare, il controllo dei vincoli e l’inserimento della prenotazione vengono eseguiti come un’unica operazione protetta.

Questo serve a evitare problemi nel caso in cui due utenti provino a prenotare contemporaneamente la stessa risorsa o l’ultimo posto disponibile.

Senza transazione, potrebbe accadere che due richieste leggano entrambe una disponibilità ancora libera e inseriscano due prenotazioni incompatibili.

Con la transazione, invece, il controllo e l’inserimento vengono gestiti in modo atomico.

---

## Gestione degli errori 404 e 500

UniBook gestisce gli errori più comuni tramite middleware finali configurati in Express.

Questa parte è importante perché evita di lasciare all’utente pagine di errore generiche o messaggi tecnici non controllati.

---

### Errore 404

L’errore 404 indica che l’utente ha richiesto una pagina o un endpoint che non esiste.

Per esempio:

```text
http://localhost:3000/pagina-che-non-esiste
```

In questo caso UniBook mostra una pagina 404 personalizzata.

La pagina si trova in:

```text
views/pages/404.hbs
```

Per le rotte API, invece, UniBook restituisce una risposta JSON.

Per esempio:

```text
/api/missing
```

restituisce una risposta simile a:

```json
{
  "error": "Endpoint non trovato"
}
```

Questa distinzione è utile perché le pagine normali devono essere mostrate come HTML, mentre gli endpoint API devono rispondere in JSON.

---

### Errore 500

L’errore 500 indica un errore interno del server.

In questo caso UniBook mostra una pagina generica, senza esporre dettagli tecnici all’utente.

I dettagli dell’errore vengono eventualmente registrati lato server, ma non vengono mostrati nel browser.

Questa scelta è più sicura perché evita di esporre informazioni interne, come stack trace, query SQL o percorsi del progetto.

---

### Posizione dei middleware di errore

I middleware per 404 e 500 sono registrati alla fine della pipeline Express, dopo le rotte applicative.

Questo significa che:

- prima Express prova a trovare una rotta valida;
- se nessuna rotta risponde, viene attivato il 404;
- se durante l’esecuzione si verifica un errore non gestito, viene attivato il gestore 500.

Questa organizzazione è coerente con il funzionamento di Express.

---

## Dipendenze

UniBook usa poche dipendenze principali, scelte per mantenere il progetto semplice, leggibile e coerente con il corso.

Le dipendenze sono dichiarate nel file:

```text
package.json
```

Le versioni effettivamente installate sono fissate anche in:

```text
package-lock.json
```

---

### Dipendenze principali

| Pacchetto | Ruolo |
|---|---|
| `express` | Framework usato per creare il server web, definire rotte e gestire richieste HTTP |
| `express-handlebars` | Template engine usato per generare pagine HTML lato server |
| `better-sqlite3` | Libreria usata per collegare Node.js al database SQLite |
| `express-session` | Libreria usata per gestire le sessioni utente |
| `bcrypt` | Libreria usata per generare hash sicuri delle password |

---

### Dipendenza di sviluppo

| Pacchetto | Ruolo |
|---|---|
| `nodemon` | Strumento usato in sviluppo per riavviare automaticamente il server quando cambia il codice |

Per avviare normalmente l’applicazione basta usare:

```bash
npm start
```

---


## Nota sul repository GitHub

Il repository GitHub contiene il codice sorgente e i file necessari per ricostruire ed eseguire il progetto.

Alcuni file non vengono caricati perché sono generati automaticamente.
