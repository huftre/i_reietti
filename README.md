# I REIETTI — sito Lega 2026/27

Questa versione del sito è organizzata in pagine separate e resta completamente compatibile con GitHub Pages.

## Pagine

- `index.html` — **HOME** con classifica del Campionato.
- `cintura.html` — **Cintura dei Reietti**.
- `reietto.html` — **Reietto del Mese**.
- `pagamenti.html` — situazione **quote e premi**.
- `admin.html` — area riservata con due sezioni separate: **risultati** e **pagamenti**.

## Numerazione Campionato

Nel file `data/results.csv` continua a essere usata la **giornata reale di Serie A**.

- Serie A 3 = **1ª giornata di Lega**
- Serie A 4 = **2ª giornata di Lega**
- Serie A 5 = **3ª giornata di Lega**
- e così via fino alla 38ª giornata di Serie A.

La conversione viene fatta automaticamente dal sito.

## MODIFICA FACILE — loghi squadre

Non devi modificare HTML o JavaScript.

Inserisci i PNG nella cartella `assets/teams/`. Il file deve avere **il nome della squadra**, sostituendo ogni spazio con `_`. Esempio: `Suino FC` → `Suino_FC.png`. Maiuscole e minuscole vanno rispettate. La corrispondenza completa è nel file `assets/teams/LEGGIMI.txt` e in `data/teams.json`.
Se un file non esiste, il sito mostra automaticamente un simbolo temporaneo.

## MODIFICA FACILE — premi, quote e giornate

I valori principali si trovano in `data/config.json`:

- `leagueStartSerieAMatchday`: giornata Serie A da cui parte il Campionato (attualmente `3`).
- `beltStartMatchday`: giornata Serie A da cui parte la Cintura (attualmente `3`).
- `startMatchday`: inizio del primo blocco Reietto del Mese (attualmente `4`).
- `monthlyPrize`: premio per ogni blocco Reietto del Mese (`20`).
- `teamFee`: quota totale per squadra (`110`).
- `installmentAmount`: importo di ogni rata (`55`).
- `prizes`: premi Campionato, Champions, Coppa Italia e Cintura.

## Aggiornare i risultati

1. Apri il sito pubblicato.
2. Vai su **Admin** e inserisci il codice.
3. Seleziona **Risultati e fantapunti**.
4. Scegli la giornata reale di Serie A, inserisci le 7 partite e genera `results.csv`.
5. Nel repository GitHub sostituisci `data/results.csv` con il file scaricato.

La Home aggiornerà automaticamente punti, vittorie, pareggi, sconfitte, gol, differenza reti e fantapunti.

### Ordinamento Campionato

1. Punti
2. Fantapunti totali
3. Differenza reti
4. Gol fatti
5. Gol subiti (meno è meglio)
6. Sorteggio tecnico stabile in caso di perfetta parità

## Aggiornare i pagamenti

1. Vai su **Admin → Quote e pagamenti**.
2. Inserisci la prima e seconda rata per ogni squadra.
3. Se già assegnate, scegli la vincitrice di Champions League e Coppa Italia.
4. Inserisci nella colonna **Premi pagati** quanto è stato effettivamente consegnato alla squadra.
5. Genera `payments.csv`.
6. Nel repository GitHub sostituisci `data/payments.csv`.

### Premi calcolati automaticamente

La pagina Pagamenti calcola automaticamente:

- **Campionato**: €450 / €320 / €200 / €110 al termine della 38ª giornata Serie A.
- **Reietto del Mese**: €20 per ogni blocco concluso.
- **Cintura dei Reietti**: €35 al detentore finale dopo la 38ª giornata.

Champions League e Coppa Italia (€110 ciascuna) vengono invece assegnate manualmente dall'Admin perché non dipendono dal file `results.csv`.

## File dati

### `data/results.csv`

```csv
giornata,squadra,avversario,fantapunti,gol_fatti,gol_subiti
```

### `data/payments.csv`

```csv
squadra,rata1,rata2,champions,coppa_italia,premi_pagati,note
```

`champions` e `coppa_italia` valgono `1` solo per la squadra vincitrice.

## Nota sulla protezione Admin

Il sito è statico e l'accesso Admin usa `sessionStorage` più l'impronta SHA-256 del codice. È una barriera pratica per evitare accessi casuali, non un'autenticazione server.


## Struttura pubblica aggiornata
- `index.html`: Home con i tre riepiloghi dinamici.
- `squadre.html`: 14 squadre con logo e motto.
- `campionato.html`: classifica del Campionato.
- `cintura.html`: Cintura dei Reietti.
- `reietto.html`: Reietto del Mese.
- `pagamenti.html`: sezione protetta dal codice 2023 (modificabile in `assets/payments-access.js`).
- `regolamento.html`: regolamento integrato, anche mobile, tramite immagini in `assets/regolamento-pages/`.
