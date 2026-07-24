# I REIETTI — Dashboard Fantacalcio 2026/27

Sito statico pronto per **GitHub Pages**, dedicato alle competizioni:

- **Cintura dei Reietti**: assegnazione iniziale alla 4ª giornata alla squadra con più fantapunti; dalla giornata successiva la cintura passa allo sfidante soltanto in caso di sconfitta del detentore.
- **Reietto del Mese**: sette blocchi da cinque giornate, dalla 4ª alla 38ª, con premio di **€25** alla squadra con la somma fantapunti più alta in ciascun blocco.

Il sito non usa database, framework o servizi esterni. Tutto viene letto dai file nella cartella `data`.

## Contenuto del progetto

```text
index.html                 Dashboard pubblica
admin.html                 Strumento locale per aggiornare i risultati
assets/styles.css          Grafica responsive
assets/app.js              Calcoli e visualizzazione delle competizioni
assets/admin.js            Generazione guidata del CSV
assets/favicon.svg         Icona del sito
data/config.json           Nome lega, stagione e parametri
 data/teams.json           Elenco delle 14 squadre
 data/results.csv          Risultati ufficiali pubblicati
 data/results.demo.csv     Dati dimostrativi
.nojekyll                  Compatibilità GitHub Pages
```

## 1. Squadre configurate

Il file `data/teams.json` contiene già le 14 squadre della lega:

| ID dati | Squadra | Sigla |
|---|---|---|
| `squadra-01` | Corazzata2000 | C2000 |
| `squadra-02` | SS FEL LAZIO | FEL |
| `squadra-03` | TigerTeam | TIG |
| `squadra-04` | Annusate Milano | ANM |
| `squadra-05` | Masterchef United | MCU |
| `squadra-06` | Mandraketeam | MAN |
| `squadra-07` | SkibidiBobby | SKB |
| `squadra-08` | Tetta Pig | TET |
| `squadra-09` | Suino FC | SFC |
| `squadra-10` | F.C. Salvezza | SAL |
| `squadra-11` | Foreign Fighters | FFI |
| `squadra-12` | BULLDOZER MK | BDM |
| `squadra-13` | Hogiaperso82 | HOG |
| `squadra-14` | Divano Kiev | DKV |

I nomi, le sigle e le emoji possono essere modificati in `data/teams.json`. **Non modificare gli `id`** dopo aver iniziato a caricare i risultati, altrimenti i dati precedenti non saranno più associati correttamente.

Puoi modificare nome della lega, stagione, premio e giornate in `data/config.json`.

## 2. Pubblicare su GitHub Pages

1. Crea un nuovo repository GitHub, per esempio `i-reietti`.
2. Carica **il contenuto di questa cartella** nella radice del repository.
3. Apri **Settings → Pages**.
4. In **Build and deployment**, scegli **Deploy from a branch**.
5. Seleziona il branch `main` e la cartella `/ (root)`.
6. Salva. GitHub mostrerà l’indirizzo pubblico dopo il primo deploy.

Di solito l’indirizzo avrà questa forma:

```text
https://NOME-UTENTE.github.io/i-reietti/
```

## 3. Aggiornare una giornata

Apri la pagina:

```text
https://NOME-UTENTE.github.io/i-reietti/admin.html
```

La pagina amministrativa:

1. carica automaticamente il `results.csv` già pubblicato;
2. permette di scegliere la giornata;
3. presenta sette righe, una per ogni partita;
4. controlla che le 14 squadre compaiano una sola volta;
5. genera il nuovo `results.csv`.

Dopo aver premuto **Aggiungi giornata al file**:

- usa **Scarica results.csv**, oppure
- usa **Copia CSV negli appunti**.

Poi apri `data/results.csv` nel repository GitHub, sostituisci il contenuto e conferma il commit. GitHub Pages aggiornerà automaticamente il sito.

> La pagina `admin.html` lavora nel browser e non invia dati a server esterni. Non può scrivere direttamente nel repository senza un sistema di autenticazione GitHub, quindi il commit finale resta manuale.

## 4. Formato dei dati

Ogni giornata contiene **14 righe**, una per squadra.

```csv
giornata,squadra,avversario,fantapunti,gol_fatti,gol_subiti
4,squadra-01,squadra-02,78.5,4,2
4,squadra-02,squadra-01,71,2,4
```

Le righe delle due squadre devono essere speculari. La pagina `admin.html` lo fa automaticamente.

### Significato delle colonne

| Colonna | Descrizione |
|---|---|
| `giornata` | Giornata di Serie A, da 4 a 38 |
| `squadra` | ID presente in `teams.json` |
| `avversario` | ID della squadra affrontata |
| `fantapunti` | Punteggio fantacalcio della giornata |
| `gol_fatti` | Gol ottenuti nello scontro diretto |
| `gol_subiti` | Gol dell’avversario |

I gol sono necessari per calcolare il passaggio della **Cintura dei Reietti**. I fantapunti sono necessari per il **Reietto del Mese**.

## 5. Regole gestite automaticamente

### Cintura dei Reietti

- Il calcolo parte dalla 4ª giornata.
- La prima Cintura va all’unica squadra con il punteggio più alto.
- In caso di vittoria o pareggio, il detentore conserva la Cintura.
- In caso di sconfitta, la Cintura passa all’avversario.
- La dashboard mostra detentore, giornata di conquista, difese consecutive e cronologia.
- Se alla 4ª giornata due squadre hanno lo stesso massimo di fantapunti, il sito segnala una **parità da risolvere**, senza inventare un criterio di spareggio.

### Reietto del Mese

I blocchi sono:

1. giornate 4–8;
2. giornate 9–13;
3. giornate 14–18;
4. giornate 19–23;
5. giornate 24–28;
6. giornate 29–33;
7. giornate 34–38.

La dashboard mostra classifica, fantapunti totali, media e avanzamento del blocco. Il premio configurato è di €25 per ciascun blocco.

## 6. Anteprima locale

Non aprire direttamente `index.html` con un doppio clic, perché alcuni browser bloccano la lettura dei file CSV locali.

Dalla cartella del progetto esegui:

```bash
python3 -m http.server 8000
```

Poi visita:

```text
http://localhost:8000/
```

Per vedere i dati dimostrativi senza modificare `results.csv`:

```text
http://localhost:8000/?demo=1
```

La stessa opzione funziona anche sul sito GitHub Pages aggiungendo `?demo=1` all’indirizzo.

## 7. Backup

Prima di ogni aggiornamento puoi usare **Scarica backup JSON** nella pagina amministrativa. GitHub conserva inoltre la cronologia di tutte le versioni del file tramite i commit.
