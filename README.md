# Familio

Familiens ugeplan – madplan, aktiviteter, pligter og point. To dele:

| Side | Til | Adresse |
|---|---|---|
| `index.html` | Forældre-appen (Katrine og Morten) på telefonen | `https://familio.web.app/` |
| `tablet.html` | Tavlen på den låste iPad i køkkenet – ingen login for børnene | `https://familio.web.app/tablet.html` |

Ren HTML/CSS/JavaScript uden build-trin. Data ligger i Firebase (projekt **MK Work**, egen Firestore-database `familio`). Login med Google; hver familie har sit eget id, og forældre tilslutter sig med en invitationskode – så appen kan bruges af alle familier.

## Demo-tilstand

Så længe `js/config.js` ikke har en rigtig `apiKey`, kører appen i demo-tilstand: alt gemmes kun i browseren, og tavle og forældre-app synkroniserer mellem faner i samme browser. Prøv lokalt:

```
python3 -m http.server 8000
# åbn http://localhost:8000/ og http://localhost:8000/tablet.html
```

## Opsætning i Firebase (én gang)

1. **Web-app:** MK Work › Project settings › *Your apps* › tilføj web-app "Familio". Kopiér `firebaseConfig` ind i `js/config.js` og sæt `authDomain: 'familio.web.app'`.
2. **Database:** Firestore › *Create database* › navn `familio`, lokation `eur3`, *production mode*.
3. **Regler:** Firestore › vælg databasen `familio` › *Rules* › indsæt indholdet af `firestore.rules` › *Publish*.
   (Reglerne gælder kun `familio`-databasen – de andre apps i MK Work påvirkes ikke.)
4. **Login:** Authentication › *Sign-in method* › slå **Google** og **Anonymous** til (Anonymous bruges kun af tavlen).
5. **Hosting:** Hosting › *Add another site* › `familio`. Tjek at `familio.web.app` står under Authentication › Settings › *Authorized domains*.

## Første gang

1. Log ind med Google i forældre-appen › **Opret ny familie** (navn, hvad børnene kalder dig, børnenes navne).
2. Indstillinger › **Inviter forælder** › send linket/koden til den anden forælder. Hun/han logger ind med Google og tilslutter sig. Alle forældre har samme rettigheder.
3. Åbn `tablet.html` på iPad'en i Safari › Del › **Føj til hjemmeskærm** › åbn Familio fra hjemmeskærmen.
   Tavlen viser en kode på 6 tegn – skriv den i forældre-appen under Indstillinger › Tablets › **Tilknyt**.
4. På iPad'en: Indstillinger › Skærm og lysstyrke › Autolås › **Aldrig**, og evt. *Guidet adgang* så den bliver i Familio.

## Point

- Lille pligt 5 point, stor pligt 10, daglig opgave 10.
- Standardmål pr. barn: 120 point om ugen og 450 om måneden (månedsbelønning 100 kr. i lommepenge). Rettes pr. barn under Pligter & point.
- Forældre kan give bonus (5/10/20 point med en grund) – den fejres på tavlen. "Træk 5 point fra" er kun til at rette fejl.

## Udgivelse

```
firebase deploy --only hosting:familio,firestore:familio
```

## Data

```
users/{uid}                     familyId for en forælder
invites/{kode}                  invitationskoder (familyId, udløber efter 7 dage)
pairing/{kode}                  tablets der venter på at blive tilknyttet
tabletLinks/{uid}               hvilken familie en tablet hører til
families/{familyId}             navn, parents, parentNames, tablets, members, chores, goals, drivers, settings
families/{familyId}/events      aktiviteter (type once/rec, days, freq w1|w2|m1, exceptions pr. dato)
families/{familyId}/meals       aftensmad, id = dato
families/{familyId}/completions pligter krydset af, id = dato_pligt_barn
families/{familyId}/adjustments bonus (kind 'bonus') og rettelser (kind 'fix')
families/{familyId}/packed      huskeliste-afkrydsninger
```

## Næste version

- Push-besked kl. 16 om øjenklap (Firebase Cloud Messaging + planlagt Cloud Function).
