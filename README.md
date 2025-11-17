# Daily Vibes Server

Node.js/Express Backend für die Daily Vibes Flutter App.

## 🚀 Schnellstart

### 1. Server starten (Windows)
Doppelklick auf `server.bat` oder im Terminal:
```bash
cd flutter_server
server.bat
```

Das Batch-Script:
- ✅ Prüft ob Node.js installiert ist
- ✅ Installiert automatisch Dependencies (beim ersten Start)
- ✅ Startet den Server

### 2. Manueller Start
```bash
cd flutter_server
npm install
node server.js
```

## 📋 Voraussetzungen

- **Node.js** (Version 14 oder höher)
  - Download: https://nodejs.org/

## 🔧 Konfiguration

### Server-Adresse in Flutter App
Die App nutzt standardmäßig: `http://192.168.178.84:3000/api`

**Wichtig:** Ersetze die IP-Adresse mit deiner lokalen Netzwerk-IP:

1. Finde deine lokale IP:
   ```bash
   ipconfig
   ```
   Suche nach "IPv4-Adresse" (z.B. `192.168.1.100`)

2. Ändere in `lib/services/api_service.dart`:
   ```dart
   static const String baseUrl = 'http://DEINE_IP:3000/api';
   ```

### Port ändern
In `server.js` Zeile 11:
```javascript
const PORT = 3000; // Gewünschten Port eintragen
```

### JWT Secret ändern (Produktion)
In `server.js` Zeile 12:
```javascript
const JWT_SECRET = 'dein-sicherer-secret-key';
```

## 📁 Projektstruktur

```
flutter_server/
├── server.js           # Hauptserver mit allen Endpoints
├── server.bat          # Windows Start-Script
├── package.json        # Node.js Dependencies
├── README.md           # Diese Datei
└── data/              # JSON Datenbank
    ├── users.json     # Benutzerkonten
    ├── photos.json    # Hochgeladene Fotos
    └── challenges.json # Tägliche Challenges
```

## 🔗 API Endpoints

### Authentifizierung
- `POST /api/auth/register` - Neuen Account erstellen
- `POST /api/auth/login` - Einloggen

### Profil
- `GET /api/profile` - Eigenes Profil abrufen
- `POST /api/profile/image` - Profilbild ändern
- `POST /api/profile/email` - Email ändern
- `POST /api/profile/password` - Passwort ändern

### Challenges
- `GET /api/challenge/today` - Heutige Challenge abrufen

### Fotos
- `POST /api/photos/upload` - Foto hochladen
- `GET /api/photos/today` - Heutige Fotos von Freunden
- `GET /api/photos/me/today` - Eigenes heutiges Foto
- `GET /api/photos/memories` - Foto-Erinnerungen (Album)
- `POST /api/photos/like` - Foto liken/unliken
- `POST /api/photos/comment` - Kommentar hinzufügen

### Freunde
- `GET /api/friends` - Freundesliste abrufen
- `GET /api/friends/requests` - Freundschaftsanfragen abrufen
- `POST /api/friends/add` - Freundschaftsanfrage senden
- `POST /api/friends/accept` - Anfrage akzeptieren
- `POST /api/friends/remove` - Freundschaft beenden

### Benachrichtigungen
- `GET /api/notifications` - Benachrichtigungen abrufen
- `POST /api/notifications/read` - Als gelesen markieren

## 🛡️ Sicherheit

**Aktuelle Einstellungen (Development):**
- ⚠️ CORS: Alle Origins erlaubt
- ⚠️ JWT Secret: Hardcoded
- ⚠️ Passwörter: Bcrypt mit 10 Rounds
- ⚠️ Keine HTTPS Verschlüsselung

**Für Produktion ändern:**
1. CORS auf spezifische Domains beschränken
2. JWT Secret aus Umgebungsvariable laden
3. HTTPS/SSL einrichten
4. Rate Limiting aktivieren
5. Input Validation erweitern

## 💾 Daten

Alle Daten werden in JSON-Dateien unter `data/` gespeichert:

- **users.json**: Benutzerdaten (inkl. gehashte Passwörter)
- **photos.json**: Foto-Metadaten + Base64-Bilder
- **challenges.json**: Liste aller Challenges

Bei jedem API-Call werden die Dateien neu geladen/gespeichert.

## 🐛 Troubleshooting

### Server startet nicht
```
Error: Cannot find module 'express'
```
→ Lösung: `npm install` ausführen

### 404 Fehler in App
```
POST http://192.168.178.84:3000/api/... 404 (Not Found)
```
→ Lösung: 
1. Server läuft? Check Terminal-Ausgabe
2. IP-Adresse korrekt? Check `api_service.dart`
3. Handy im gleichen WLAN?

### CORS Fehler
```
Access to XMLHttpRequest has been blocked by CORS policy
```
→ Lösung: Server nutzt bereits `cors()` middleware - sollte nicht auftreten

### Keine Verbindung vom Handy
1. **Firewall prüfen**: Windows Firewall erlaubt Port 3000?
2. **Netzwerk prüfen**: Handy und PC im gleichen WLAN?
3. **IP-Adresse prüfen**: Mit `ipconfig` aktuelle IP checken

## 🔄 Daten zurücksetzen

Um alle Daten zu löschen:
1. Server stoppen (STRG+C)
2. Dateien in `data/` löschen oder leeren
3. Server neu starten (erstellt neue leere Dateien)

## 📝 Logs

Server gibt wichtige Events aus:
- ✅ Erfolgreiche Registrierungen/Logins
- ❌ Fehler beim Laden/Speichern von Daten
- 📨 API-Requests (nur Fehler)

## 🚀 Nächste Schritte

1. **Echtzeit-Updates**: WebSocket Integration für Live-Benachrichtigungen
2. **Datenbank**: Migration zu PostgreSQL/MongoDB
3. **Cloud-Speicher**: Bilder auf S3/Cloudinary statt Base64
4. **Push Notifications**: Firebase Cloud Messaging Integration
5. **Deployment**: Hosting auf Heroku/Railway/Vercel

## 📞 Support

Bei Fragen oder Problemen:
1. Logs prüfen (Terminal-Ausgabe)
2. Network-Tab in Browser DevTools checken
3. API mit Postman/Insomnia testen
