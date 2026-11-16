# Familio

Familiens ugeplan – madplan, aktiviteter, pligter og point. To dele:

| Side | Til | Adresse |
|---|---|---|
| `index.html` | Forældre-appen (Katrine og Morten) på telefonen | `https://familio.web.app/` |
| `tablet.html` | Tavlen på den låste iPad i køkkenet – ingen login for børnene | `https://familio.web.app/tablet.html` |

Ren HTML/CSS/JavaScript uden build-trin. Data ligger i Firebase (projekt **MK Work**, egen Firestore-database `familio`).

## Demo-tilstand

Så længe `js/config.js` ikke har en rigtig `apiKey`, kører appen i demo-tilstand: alt gemmes kun i browseren, og tavle og forældre-app synkroniserer mellem faner i samme browser. Prøv lokalt:

```
python3 -m http.server 8000
# åbn http://localhost:8000/ og http://localhost:8000/tablet.html
```

## Opsætning i Firebase (én gang)

1. **Web-app:** MK Work › Project settings › *Your apps* › tilføj web-app "Familio". Kopiér `firebaseConfig` ind i `js/config.js`.
2. **Database:** Firestore › *Create database* › navn `familio`, lokation `eur3`, *production mode*.
3. **Regler:** Firestore › vælg databasen `familio` › *Rules* › indsæt indholdet af `firestore.rules` › *Publish*.
   (Reglerne gælder kun `familio`-databasen – de andre apps i MK Work påvirkes ikke.)
4. **Login:** Authentication › *Sign-in method* › slå **E-mail/adgangskode** og **Anonymous** til.
5. **Brugere:** Authentication › *Users* › *Add user* for Katrine og Morten (fælles kode, mindst 6 tegn).
6. **Hosting:** Hosting › *Add another site* › `familio`.

## Første gang

1. Morten logger ind i forældre-appen og trykker **Opret familien** (opretter børn, pligter, mål og de faste aktiviteter).
2. Indstillinger › Forældre › tilføj Katrines e-mail.
3. Åbn `tablet.html` på iPad'en i Safari › Del › **Føj til hjemmeskærm** › åbn Familio fra hjemmeskærmen.
   Tavlen viser en kode – godkend den i forældre-appen under Indstillinger › Tablets.
4. På iPad'en: Indstillinger › Skærm og lysstyrke › Autolås › **Aldrig**, og evt. *Guidet adgang* så den bliver i Familio.

## Udgivelse

```
firebase deploy --only hosting:familio,firestore:familio
```

## Data

```
families/{familyId}             navn, admins, tablets, members, chores, goals, drivers, settings
families/{familyId}/events      aktiviteter (type once/rec, days, freq w1|w2|m1, exceptions pr. dato)
families/{familyId}/meals       aftensmad, id = dato
families/{familyId}/completions pligter krydset af, id = dato_pligt_barn
families/{familyId}/adjustments bonus/rettelser fra forældre
families/{familyId}/packed      huskeliste-afkrydsninger
families/{familyId}/pairing     tablets der venter på godkendelse
```

## Næste version

- Push-besked kl. 16 om øjenklap (Firebase Cloud Messaging + planlagt Cloud Function).
