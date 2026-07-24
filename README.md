# I Reietti — Dashboard 2026/27

Dashboard statica per GitHub Pages dedicata a:

- **Cintura dei Reietti**, attiva dalla 4ª giornata;
- **Reietto del Mese**, suddiviso in sette blocchi da cinque giornate con premio di €25;
- classifica generale dei fantapunti;
- pannello integrato per generare il file `results.csv` aggiornato.

## Pubblicazione iniziale su GitHub Pages

1. Crea un nuovo repository GitHub, per esempio `i-reietti`.
2. Carica **tutto il contenuto di questa cartella**, mantenendo le sottocartelle `assets` e `data`.
3. Apri **Settings → Pages**.
4. In **Build and deployment** scegli **Deploy from a branch**.
5. Seleziona il branch `main`, cartella `/ (root)`, quindi salva.
6. Dopo il primo deploy, GitHub mostrerà l’indirizzo pubblico della dashboard.

## Accesso al pannello aggiornamento

Nella dashboard sono presenti i pulsanti **Area aggiornamento**, **Carica la prima giornata** e **Aggiorna i dati**.

Premendo uno di questi pulsanti compare una finestra che richiede il codice. Il codice configurato è:

```text
020523
```

Con il codice corretto si apre `admin.html`. Con un codice errato compare il messaggio **Non sei autorizzato**.

### Limite importante della protezione

Il sito non utilizza server, database o servizi esterni. Il controllo del codice avviene quindi nel browser. È utile per evitare accessi casuali, ma **non equivale a un vero sistema di autenticazione**: una persona con competenze tecniche potrebbe analizzare o modificare il codice della pagina.

La protezione effettiva della pubblicazione rimane GitHub: soltanto chi ha permessi di scrittura sul repository può sostituire `data/results.csv` e modificare il sito online.

## Aggiornare una giornata

1. Apri la dashboard pubblicata su GitHub Pages.
2. Premi **Area aggiornamento**.
3. Inserisci il codice.
4. Attendi il caricamento automatico del file `data/results.csv` già online.
5. Scegli la giornata, dalla 4ª alla 38ª.
6. Inserisci le sette partite:
   - squadra A e squadra B;
   - fantapunti di entrambe;
   - gol fantacalcistici di entrambe.
7. Controlla il riepilogo.
8. Premi **Genera e scarica results.csv**.

Il file scaricato contiene **tutte le giornate precedenti più quella appena inserita**. Se la giornata era già presente, viene sostituita.

## Caricare il CSV su GitHub

1. Apri il repository su GitHub.
2. Entra nella cartella `data`.
3. Apri `results.csv`.
4. Scegli la modifica o la sostituzione del file.
5. Carica il nuovo `results.csv` scaricato dal pannello.
6. Conferma il commit.

Dopo il nuovo deploy, la dashboard mostrerà i dati aggiornati.

## Formato del file risultati

Il file usa queste colonne:

```csv
giornata,squadra,avversario,fantapunti,gol_fatti,gol_subiti
```

Le squadre sono salvate tramite gli identificativi presenti in `data/teams.json`. Non è necessario scriverli manualmente: il pannello li genera da solo.

## File principali

```text
index.html                  dashboard pubblica
admin.html                  pannello protetto dal codice
assets/app.js               calcoli delle competizioni
assets/access.js            popup e verifica del codice
assets/admin.js              generazione del CSV
assets/styles.css            grafica responsive
data/results.csv             archivio pubblicato
data/teams.json              nomi delle 14 squadre
data/config.json             impostazioni della stagione
assets/logo-i-reietti.png    logo trasparente
```

## Cambiare il codice di accesso

Nel file `assets/access.js` è presente l’impronta SHA-256 del codice. Per cambiare codice bisogna calcolare l’impronta del nuovo valore e sostituire la costante `ACCESS_HASH`.

Questa operazione è descritta nel codice con appositi commenti. Non inserire password GitHub, token o altre credenziali nel progetto.
