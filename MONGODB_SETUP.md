# MongoDB Atlas Setup für Daily Vibes

## Problem
Koyeb verwendet ephemere Container-Dateisysteme. Bei jedem Neustart (z.B. nach Inaktivität) gehen alle Daten in JSON-Dateien verloren. **Lösung: MongoDB Atlas** (kostenlose Cloud-Datenbank).

---

## Schritt 1: MongoDB Atlas Account erstellen

1. Gehe zu: **https://www.mongodb.com/cloud/atlas/register**
2. Erstelle einen kostenlosen Account
3. Wähle den **FREE (M0) Tier** aus (512 MB Speicher, kostenlos!)
4. Wähle einen Cloud-Provider und Region (z.B. AWS Frankfurt)
5. Cluster-Name: `dailyvibes` (oder beliebig)

---

## Schritt 2: Datenbank-Benutzer erstellen

1. Gehe zu **Database Access** (linke Seitenleiste)
2. Klicke auf **"Add New Database User"**
3. Wähle **"Password"** als Authentication Method
4. Erstelle:
   - **Username**: `dailyvibes`
   - **Password**: Generiere ein sicheres Passwort (z.B. `DV2024secure!`)
   - **Database User Privileges**: `Read and write to any database`
5. Klicke **"Add User"**

⚠️ **WICHTIG**: Notiere dir das Passwort!

---

## Schritt 3: Netzwerk-Zugriff konfigurieren

1. Gehe zu **Network Access** (linke Seitenleiste)
2. Klicke auf **"Add IP Address"**
3. Klicke auf **"Allow Access from Anywhere"** (wichtig für Koyeb!)
4. IP: `0.0.0.0/0` wird automatisch eingetragen
5. Klicke **"Confirm"**

⚠️ **Info**: Dies erlaubt Verbindungen von überall (notwendig für Koyeb, da die IP dynamisch ist)

---

## Schritt 4: Connection String kopieren

1. Gehe zu **Database** → **Connect**
2. Wähle **"Connect your application"**
3. Driver: **Node.js**, Version: **5.5 or later**
4. Kopiere den Connection String:
   ```
   mongodb+srv://dailyvibes:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

5. **Ersetze `<password>`** mit deinem echten Passwort!
   ```
   mongodb+srv://dailyvibes:DV2024secure!@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

## Schritt 5: Koyeb konfigurieren

### A) Umgebungsvariable setzen

1. Gehe zu deiner Koyeb App
2. Klicke auf **Settings** → **Environment Variables**
3. Füge hinzu:
   - **Key**: `MONGODB_URI`
   - **Value**: `mongodb+srv://dailyvibes:DV2024secure!@cluster0.xxxxx.mongodb.net/dailyvibes?retryWrites=true&w=majority`
   
   ⚠️ **Wichtig**: Füge `/dailyvibes` vor dem `?` hinzu (Datenbank-Name)!

4. Optional: Füge auch hinzu:
   - **Key**: `JWT_SECRET`
   - **Value**: Ein sicherer Random-String (z.B. `your-super-secret-jwt-key-2024`)

### B) package.json aktualisieren

Stelle sicher, dass `mongoose` in den Dependencies ist:
```json
"dependencies": {
  "mongoose": "^8.0.0",
  ...
}
```

### C) Server-Datei ändern

1. **Option A: Umbenennen** (empfohlen)
   - Benenne `server.js` → `server_old.js`
   - Benenne `server_mongodb.js` → `server.js`

2. **Option B: Ersetzen**
   - Lösche `server.js`
   - Benenne `server_mongodb.js` → `server.js`

### D) App neu deployen

1. Pushe die Änderungen zu GitHub:
   ```bash
   git add .
   git commit -m "Add MongoDB support"
   git push
   ```

2. Koyeb deployed automatisch neu

---

## Schritt 6: Testen

1. Warte bis Deployment abgeschlossen ist
2. Schaue in die Logs (Koyeb → Logs)
3. Du solltest sehen:
   ```
   ✅ MongoDB verbunden!
   ✅ Default Challenges initialisiert
   ✅ Daily Vibes Server (MongoDB) läuft!
   ```

4. Teste die App:
   - Erstelle einen neuen Account
   - Lade ein Foto hoch
   - **Wichtig**: Warte 10-15 Minuten (Koyeb Sleep)
   - App sollte wieder aufwachen und Daten sind noch da! ✅

---

## Migration vorhandener Daten (Optional)

Falls du bereits Benutzer/Fotos in den JSON-Dateien hast:

### Lokale Migration

1. Installiere Dependencies:
   ```bash
   cd flutter_server
   npm install
   ```

2. Erstelle `migrate.js`:
   ```javascript
   const mongoose = require('mongoose');
   const fs = require('fs');
   const path = require('path');

   // Deine MongoDB URI hier einfügen
   const MONGODB_URI = 'mongodb+srv://dailyvibes:DV2024secure!@cluster0.xxxxx.mongodb.net/dailyvibes';

   // Schemas (kopiert aus server_mongodb.js)
   const userSchema = new mongoose.Schema({
     username: String,
     email: String,
     password: String,
     profileImage: String,
     friends: [String],
     pendingRequests: [String],
     streak: Number,
     lastPhotoDate: String,
     achievements: [String],
     createdAt: Date
   });

   const photoSchema = new mongoose.Schema({
     id: String,
     username: String,
     date: String,
     imageData: String,
     caption: String,
     challenge: String,
     likes: [String],
     comments: [{
       username: String,
       text: String,
       timestamp: Date
     }],
     createdAt: Date
   });

   const User = mongoose.model('User', userSchema);
   const Photo = mongoose.model('Photo', photoSchema);

   async function migrate() {
     await mongoose.connect(MONGODB_URI);
     console.log('Connected to MongoDB');

     // Load JSON files
     const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
     const photos = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'photos.json')));

     // Insert users
     for (const user of users) {
       await User.findOneAndUpdate(
         { username: user.username },
         user,
         { upsert: true }
       );
     }
     console.log(`✅ ${users.length} users migrated`);

     // Insert photos
     for (const photo of photos) {
       await Photo.findOneAndUpdate(
         { id: photo.id },
         photo,
         { upsert: true }
       );
     }
     console.log(`✅ ${photos.length} photos migrated`);

     await mongoose.disconnect();
     console.log('Migration complete!');
   }

   migrate().catch(console.error);
   ```

3. Führe Migration aus:
   ```bash
   node migrate.js
   ```

---

## Vorteile von MongoDB

✅ **Persistent**: Daten bleiben bei Server-Neustarts erhalten  
✅ **Kostenlos**: 512 MB Speicher (ausreichend für viele Benutzer)  
✅ **Skalierbar**: Bei Bedarf einfach upgraden  
✅ **Automatische Backups**: MongoDB Atlas macht regelmäßig Snapshots  
✅ **Geografisch verteilt**: Schnelle Zugriffe weltweit  

---

## Troubleshooting

### "MongooseServerSelectionError: Could not connect"
- **Lösung**: Prüfe ob IP-Whitelist `0.0.0.0/0` enthält
- **Lösung**: Prüfe ob Passwort korrekt ist (keine Sonderzeichen-Encoding-Probleme)

### "Authentication failed"
- **Lösung**: Prüfe Username/Passwort in Connection String
- **Lösung**: Prüfe ob Database User existiert

### "App startet nicht auf Koyeb"
- **Lösung**: Prüfe Logs in Koyeb Dashboard
- **Lösung**: Stelle sicher dass `MONGODB_URI` Umgebungsvariable gesetzt ist
- **Lösung**: Prüfe ob `mongoose` in `package.json` steht

### "Daten sind immer noch weg nach Neustart"
- **Lösung**: Du benutzt wahrscheinlich noch die alte `server.js`
- **Lösung**: Stelle sicher dass du `server_mongodb.js` verwendest

---

## Kosten

**MongoDB Atlas M0 (Free Tier)**:
- ✅ 512 MB Storage
- ✅ Shared RAM
- ✅ Shared vCPU
- ✅ **$0.00 / Monat**

**Koyeb Free Tier**:
- ✅ 1 App
- ✅ 2 GB RAM
- ✅ 1 vCPU
- ✅ **$0.00 / Monat**

**💡 Total: Komplett kostenlos!**

---

## Support

Bei Fragen:
- MongoDB Atlas Docs: https://docs.atlas.mongodb.com/
- Koyeb Docs: https://www.koyeb.com/docs
