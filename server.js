const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const cron = require('node-cron');
const crypto = require('crypto');

let nodemailer = null;
let emailTransporter = null;

// Try to load nodemailer
try {
  nodemailer = require('nodemailer');
  console.log('✅ Nodemailer geladen, Version:', nodemailer.version || 'unbekannt');
  console.log('✅ Nodemailer Typ:', typeof nodemailer);
  console.log('✅ createTransport Typ:', typeof nodemailer.createTransport);
} catch (e) {
  console.warn('⚠️  Nodemailer konnte nicht geladen werden:', e.message);
  nodemailer = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'daily-vibes-secret-key-2024';

// Email transporter configuration (Brevo/Sendinblue)
if (nodemailer && typeof nodemailer.createTransport === 'function') {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      emailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      console.log('📧 Email-Service erfolgreich konfiguriert');
    } catch (error) {
      console.warn('⚠️  Email-Service Fehler:', error.message);
      emailTransporter = null;
    }
  } else {
    console.warn('⚠️  Email-Umgebungsvariablen fehlen (EMAIL_USER, EMAIL_PASS)');
  }
} else {
  console.warn('⚠️  Nodemailer nicht verfügbar - Email-Versand deaktiviert');
}

// MONGODB_URI is REQUIRED - no fallback to localhost
if (!process.env.MONGODB_URI) {
  console.error('❌ FEHLER: MONGODB_URI Umgebungsvariable nicht gesetzt!');
  console.error('📝 Bitte setze MONGODB_URI in Koyeb Environment Variables:');
  console.error('   mongodb+srv://dailyvibes:PASSWORD@dailyvibes.nj7bvvc.mongodb.net/dailyvibes?retryWrites=true&w=majority&appName=dailyvibes');
  process.exit(1);
}
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==================== MONGODB SCHEMAS ====================

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profileImage: { type: String, default: null },
  friends: [{ type: String }],
  pendingRequests: [{ type: String }],
  streak: { type: Number, default: 0 },
  lastPhotoDate: { type: String, default: null },
  achievements: [{ type: String }],
  memoriesPublic: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  verificationToken: { type: String, default: null },
  verificationTokenExpiry: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const photoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  date: { type: String, required: true },
  imageData: { type: String, required: true },
  caption: { type: String, default: '' },
  challenge: { type: String, required: true },
  likes: [{ type: String }],
  comments: [{
    username: String,
    text: String,
    timestamp: Date
  }],
  createdAt: { type: Date, default: Date.now }
});

const challengeSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  icon: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true }
});

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  type: { type: String, required: true },
  from: { type: String },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const challengeOverrideSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  challengeId: { type: Number, required: true }
});

const User = mongoose.model('User', userSchema);
const Photo = mongoose.model('Photo', photoSchema);
const Challenge = mongoose.model('Challenge', challengeSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const ChallengeOverride = mongoose.model('ChallengeOverride', challengeOverrideSchema);

// ==================== MONGODB CONNECTION ====================

mongoose.connect(MONGODB_URI)
.then(async () => {
  console.log('✅ MongoDB verbunden!');
  await initializeDefaultChallenges();
})
.catch(err => {
  console.error('❌ MongoDB Verbindungsfehler:', err);
  process.exit(1);
});

// Initialize default challenges if none exist
async function initializeDefaultChallenges() {
  const count = await Challenge.countDocuments();
  if (count === 0) {
    const defaultChallenges = [
      { id: 1, icon: '😊', title: 'Lächeln', description: 'Zeige dein schönstes Lächeln!' },
      { id: 2, icon: '✌️', title: 'Peace', description: 'Zeig das Peace-Zeichen!' },
      { id: 3, icon: '💼', title: 'Arbeitsplatz', description: 'Zeig deinen Arbeitsplatz ohne aufzuräumen' },
      { id: 4, icon: '🌅', title: 'Morgenblick', description: 'Das Erste nach dem Aufwachen' },
      { id: 5, icon: '🍿', title: 'Snack-Time', description: 'Dein aktueller Snack' },
      { id: 6, icon: '🪟', title: 'Fensterblick', description: 'Foto aus deinem Fenster' },
      { id: 7, icon: '👟', title: 'Schuhe', description: 'Die Schuhe die du gerade trägst' },
      { id: 8, icon: '🎧', title: 'Musik', description: 'Was hörst du gerade?' },
      { id: 9, icon: '☕', title: 'Getränk', description: 'Dein aktuelles Getränk' },
      { id: 10, icon: '📱', title: 'Handy', description: 'Dein Handy-Bildschirm' }
    ];
    await Challenge.insertMany(defaultChallenges);
    console.log('✅ Default Challenges initialisiert');
  }
}

// ==================== HELPER FUNCTIONS ====================

function sanitizeUser(user) {
  return {
    username: user.username,
    email: user.email,
    profileImage: user.profileImage || null,
    createdAt: user.createdAt
  };
}

// Notification Helper Functions
const activeDevices = new Map(); // username -> { deviceToken, platform }

async function sendNotificationToUser(username, title, body, type, from, extra = {}) {
  const device = activeDevices.get(username);
  if (device && device.deviceToken) {
    console.log(`[NOTIFICATION] To: ${username}, Title: ${title}, Body: ${body}`);
  }
  
  // Store notification for user to fetch
  const notification = new Notification({
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    username,
    title,
    body,
    type,
    from,
    ...extra,
    timestamp: new Date(),
    read: false
  });
  
  await notification.save();
  return true;
}

async function notifyFriendsAboutPhoto(username) {
  const user = await User.findOne({ username });
  if (!user) return;
  
  const friends = user.friends || [];
  for (const friendUsername of friends) {
    await sendNotificationToUser(
      friendUsername,
      '📸 Neues Foto!',
      `${username} hat ein neues Foto hochgeladen!`,
      'new_photo',
      username
    );
  }
}

async function updateUserStreak(username, todayStr) {
  const user = await User.findOne({ username });
  if (!user) return;

  // Initialize streak fields if they don't exist
  if (!user.streak) user.streak = 0;
  if (!user.lastPhotoDate) user.lastPhotoDate = null;
  if (!user.achievements) user.achievements = [];

  const yesterday = new Date(todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Check if user posted yesterday
  if (user.lastPhotoDate === yesterdayStr) {
    user.streak += 1;
  } else if (user.lastPhotoDate === todayStr) {
    return;
  } else {
    user.streak = 1;
  }

  user.lastPhotoDate = todayStr;
  checkAchievements(user);
  await user.save();
}

function checkAchievements(user) {
  if (!user.achievements) user.achievements = [];

  if (user.streak >= 7 && !user.achievements.includes('streak_7')) {
    user.achievements.push('streak_7');
  }

  if (user.streak >= 30 && !user.achievements.includes('streak_30')) {
    user.achievements.push('streak_30');
  }
}

// ==================== JWT MIDDLEWARE ====================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Kein Token vorhanden' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Ungültiger Token' });
    }
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    const ADMIN_USERS = ['admin'];
    if (ADMIN_USERS.includes(req.user.username)) {
      next();
    } else {
      res.status(403).json({ success: false, message: 'Admin-Rechte erforderlich' });
    }
  });
}

// ==================== AUTH ENDPOINTS ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Alle Felder sind erforderlich' 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Passwörter stimmen nicht überein' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Passwort muss mindestens 6 Zeichen lang sein' 
      });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ 
          success: false, 
          message: 'Benutzername bereits vergeben' 
        });
      }
      return res.status(400).json({ 
        success: false, 
        message: 'Email bereits registriert' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate verification token valid for 24 hours
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);
    
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      profileImage: null,
      friends: [],
      pendingRequests: [],
      emailVerified: false,
      verificationToken,
      verificationTokenExpiry: tokenExpiry,
      createdAt: new Date()
    });

    await newUser.save();

    // Send verification email
    const verificationLink = `${process.env.APP_URL || 'https://dailyvibes.vercel.app'}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: `Daily Vibes <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '📸 Daily Vibes - Bestätige deine Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #FF6B9D 0%, #FFA07A 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 32px;">📸 Daily Vibes</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Willkommen, ${username}! 🎉</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Vielen Dank für deine Registrierung bei Daily Vibes! Um deinen Account zu aktivieren, 
              bestätige bitte deine Email-Adresse.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" 
                 style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #FF6B9D 0%, #FFA07A 100%); 
                        color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                ✅ Email bestätigen
              </a>
            </div>
            <p style="color: #999; font-size: 14px;">
              Oder kopiere diesen Link in deinen Browser:<br>
              <a href="${verificationLink}" style="color: #FF6B9D; word-break: break-all;">${verificationLink}</a>
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              ⏰ Dieser Link ist 24 Stunden gültig.<br>
              Hast du dich nicht registriert? Ignoriere diese Email einfach.
            </p>
          </div>
        </div>
      `
    };

    // Try to send email
    let emailSent = false;
    if (emailTransporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        await emailTransporter.sendMail(mailOptions);
        emailSent = true;
      } catch (emailError) {
        console.error('Email-Send-Fehler:', emailError);
        // Continue registration even if email fails
      }
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      message: emailSent 
        ? 'Registrierung erfolgreich! Bitte bestätige deine Email.' 
        : 'Registrierung erfolgreich! Email-Versand fehlgeschlagen - bitte kontaktiere Support.',
      data: {
        token,
        user: sanitizeUser(newUser),
        emailVerified: false,
        emailSent
      }
    });
  } catch (error) {
    console.error('Register-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Benutzername und Passwort erforderlich' 
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Ungültige Anmeldedaten' 
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Ungültige Anmeldedaten' 
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Bitte bestätige erst deine Email-Adresse. Prüfe dein Postfach.',
        emailVerified: false 
      });
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      message: 'Login erfolgreich',
      data: {
        token,
        user: sanitizeUser(user)
      }
    });
  } catch (error) {
    console.error('Login-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== EMAIL VERIFICATION ====================

app.post('/api/auth/send-verification', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    if (user.emailVerified) {
      return res.json({ 
        success: true, 
        message: 'Email bereits verifiziert' 
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    // Send verification email
    const verificationLink = `${process.env.APP_URL || 'https://dailyvibes.vercel.app'}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Daily Vibes - Email Bestätigung',
      html: `
        <h2>Willkommen bei Daily Vibes!</h2>
        <p>Hallo ${user.username},</p>
        <p>Bitte bestätige deine Email-Adresse, indem du auf den folgenden Link klickst:</p>
        <a href="${verificationLink}" style="display: inline-block; padding: 10px 20px; background-color: #FF6B9D; color: white; text-decoration: none; border-radius: 5px;">Email bestätigen</a>
        <p>Oder kopiere diesen Link in deinen Browser:</p>
        <p>${verificationLink}</p>
        <p>Dieser Link ist 24 Stunden gültig.</p>
      `
    };

    if (emailTransporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await emailTransporter.sendMail(mailOptions);
      res.json({ 
        success: true, 
        message: 'Bestätigungs-Email gesendet' 
      });
    } else {
      // For development: return token directly
      res.json({ 
        success: true, 
        message: 'Email-Service nicht konfiguriert',
        devToken: verificationToken 
      });
    }
  } catch (error) {
    console.error('Send-Verification-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Verification Token erforderlich' 
      });
    }

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ungültiger Bestätigungslink' 
      });
    }

    // Check if token is expired
    if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bestätigungslink ist abgelaufen. Bitte fordere einen neuen an.' 
      });
    }

    user.emailVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpiry = null;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Email erfolgreich verifiziert! Du kannst dich jetzt einloggen.' 
    });
  } catch (error) {
    console.error('Verify-Email-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== PROFILE ENDPOINTS ====================

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }
    
    res.json({
      success: true,
      data: { user: sanitizeUser(user) }
    });
  } catch (error) {
    console.error('Profil-Lade-Fehler:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Serverfehler' 
    });
  }
});

app.post('/api/profile/image', authenticateToken, async (req, res) => {
  try {
    const { profileImage } = req.body;
    const username = req.user.username;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }
    
    user.profileImage = profileImage;
    await user.save();
    
    res.json({
      success: true,
      message: 'Profilbild aktualisiert',
      data: { user: sanitizeUser(user) }
    });
  } catch (error) {
    console.error('Profilbild-Fehler:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Serverfehler' 
    });
  }
});

app.post('/api/profile/email', authenticateToken, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    const username = req.user.username;
    
    if (!newEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email und Passwort erforderlich' 
      });
    }
    
    if (!newEmail.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ungültige Email-Adresse' 
      });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Falsches Passwort' 
      });
    }
    
    const emailExists = await User.findOne({ email: newEmail, username: { $ne: username } });
    if (emailExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email wird bereits verwendet' 
      });
    }
    
    user.email = newEmail;
    await user.save();
    
    res.json({
      success: true,
      message: 'Email aktualisiert',
      data: { user: sanitizeUser(user) }
    });
  } catch (error) {
    console.error('Email-Änderungs-Fehler:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Serverfehler' 
    });
  }
});

app.post('/api/profile/password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const username = req.user.username;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Altes und neues Passwort erforderlich' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Passwort muss mindestens 6 Zeichen lang sein' 
      });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }
    
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Falsches altes Passwort' 
      });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    
    res.json({
      success: true,
      message: 'Passwort aktualisiert'
    });
  } catch (error) {
    console.error('Passwort-Änderungs-Fehler:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Serverfehler' 
    });
  }
});

// ==================== CHALLENGE ENDPOINTS ====================

app.get('/api/challenge/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let todayChallenge;
    
    // Check for admin override
    const override = await ChallengeOverride.findOne({ date: todayStr });
    if (override) {
      todayChallenge = await Challenge.findOne({ id: override.challengeId });
    }
    
    // Fallback to day-based selection
    if (!todayChallenge) {
      const challenges = await Challenge.find().sort({ id: 1 });
      const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
      todayChallenge = challenges[dayOfYear % challenges.length];
    }

    const startTime = new Date();
    startTime.setHours(0, 0, 0, 0);
    
    const endTime = new Date(startTime);
    endTime.setHours(23, 59, 59, 999);

    res.json({
      success: true,
      challenge: {
        ...todayChallenge.toObject(),
        date: todayStr,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    });
  } catch (error) {
    console.error('Challenge-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/admin/challenge/set', authenticateAdmin, async (req, res) => {
  try {
    const { challengeId } = req.body;
    
    const challenge = await Challenge.findOne({ id: challengeId });
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge nicht gefunden' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    await ChallengeOverride.findOneAndUpdate(
      { date: today },
      { date: today, challengeId },
      { upsert: true }
    );
    
    res.json({ 
      success: true, 
      message: `Challenge "${challenge.title}" für heute gesetzt`,
      challenge 
    });
  } catch (error) {
    console.error('Set Challenge Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/admin/challenges', authenticateAdmin, async (req, res) => {
  try {
    const challenges = await Challenge.find().sort({ id: 1 });
    res.json({ success: true, data: { challenges } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/admin/photos', authenticateAdmin, async (req, res) => {
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    res.json({ success: true, data: { photos } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== PHOTO ENDPOINTS ====================

app.get('/api/users/stats', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    res.json({
      success: true,
      streak: user.streak || 0,
      achievements: user.achievements || []
    });
  } catch (error) {
    console.error('Stats-Fehler:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Serverfehler' 
    });
  }
});

app.post('/api/photos/upload', authenticateToken, async (req, res) => {
  try {
    const { imageData, caption } = req.body;
    const username = req.user.username;

    if (!imageData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bild erforderlich' 
      });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Check if user already has 3 photos today
    const todayPhotosCount = await Photo.countDocuments({
      username,
      date: todayStr
    });

    if (todayPhotosCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Du hast heute bereits 3 Fotos hochgeladen'
      });
    }

    // Get today's challenge
    const challenges = await Challenge.find().sort({ id: 1 });
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const todayChallenge = challenges[dayOfYear % challenges.length];

    const newPhoto = new Photo({
      id: `${username}_${todayStr}_${Date.now()}`,
      username,
      date: todayStr,
      imageData,
      caption: caption || '',
      challenge: todayChallenge.title,
      likes: [],
      comments: [],
      createdAt: new Date()
    });

    await newPhoto.save();

    // Update user streak if this is their first photo today
    if (todayPhotosCount === 0) {
      await updateUserStreak(username, todayStr);
    }

    // Notify friends about new photo
    await notifyFriendsAboutPhoto(username);

    res.json({
      success: true,
      message: 'Foto hochgeladen',
      photo: newPhoto
    });
  } catch (error) {
    console.error('Upload-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/photos/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const username = req.user.username;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    const friends = user.friends || [];
    const todayPhotos = await Photo.find({
      date: today,
      username: { $in: friends }
    });

    const photosWithProfiles = await Promise.all(
      todayPhotos.map(async (photo) => {
        const photoUser = await User.findOne({ username: photo.username });
        return {
          ...photo.toObject(),
          userProfileImage: photoUser?.profileImage || null,
          userStreak: photoUser?.streak || 0,
          userAchievements: photoUser?.achievements || []
        };
      })
    );

    res.json({
      success: true,
      photos: photosWithProfiles
    });
  } catch (error) {
    console.error('Fotos-Laden-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/photos/me/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const username = req.user.username;

    const myPhotos = await Photo.find({
      username,
      date: today
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      photos: myPhotos
    });
  } catch (error) {
    console.error('Mein-Foto-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/photos/memories', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const today = new Date().toISOString().split('T')[0];

    const myMemories = await Photo.find({
      username,
      date: { $ne: today }
    }).sort({ date: -1 });

    res.json({
      success: true,
      data: { photos: myMemories }
    });
  } catch (error) {
    console.error('Memories-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/photos/like', authenticateToken, async (req, res) => {
  try {
    const { photoUsername, photoDate } = req.body;
    const username = req.user.username;

    const photo = await Photo.findOne({
      username: photoUsername,
      date: photoDate
    });

    if (!photo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Foto nicht gefunden' 
      });
    }

    if (!photo.likes) photo.likes = [];

    const likeIndex = photo.likes.indexOf(username);
    if (likeIndex >= 0) {
      photo.likes.splice(likeIndex, 1);
    } else {
      photo.likes.push(username);
      // Send notification to photo owner
      if (photoUsername !== username) {
        await sendNotificationToUser(
          photoUsername,
          '❤️ Neuer Like!',
          `${username} hat dein Foto geliked!`,
          'like',
          username
        );
      }
    }

    await photo.save();

    res.json({
      success: true,
      message: 'Like aktualisiert'
    });
  } catch (error) {
    console.error('Like-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/photos/comment', authenticateToken, async (req, res) => {
  try {
    const { photoUsername, photoDate, text } = req.body;
    const username = req.user.username;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Kommentar darf nicht leer sein' 
      });
    }

    const photo = await Photo.findOne({
      username: photoUsername,
      date: photoDate
    });

    if (!photo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Foto nicht gefunden' 
      });
    }

    if (!photo.comments) photo.comments = [];

    photo.comments.push({
      username,
      text: text.trim(),
      timestamp: new Date()
    });

    await photo.save();

    // Notify photo owner about new comment
    if (photoUsername !== username) {
      await sendNotificationToUser(
        photoUsername,
        '💬 Neuer Kommentar',
        `${username} hat dein Foto kommentiert: "${text.trim()}"`,
        'comment',
        username
      );
    }

    res.json({ success: true, message: 'Kommentar hinzugefügt' });
  } catch (error) {
    console.error('Kommentar-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.delete('/api/photos/delete', authenticateToken, async (req, res) => {
  try {
    const { photoId } = req.body;
    const username = req.user.username;

    const photo = await Photo.findOne({ id: photoId });

    if (!photo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Foto nicht gefunden' 
      });
    }

    if (photo.username !== username) {
      return res.status(403).json({ 
        success: false, 
        message: 'Du kannst nur deine eigenen Fotos löschen' 
      });
    }

    await Photo.deleteOne({ id: photoId });

    res.json({ success: true, message: 'Foto gelöscht' });
  } catch (error) {
    console.error('Delete-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== MEMORY ENDPOINTS ====================

// Get memory calendar (dates with photos)
app.get('/api/memories/calendar', authenticateToken, async (req, res) => {
  try {
    const { username, year, month } = req.query;
    const requestingUser = req.user.username;

    // Check if requesting own calendar or friend's calendar
    const targetUsername = username || requestingUser;

    // If requesting friend's calendar, check if memories are public
    if (targetUsername !== requestingUser) {
      const targetUser = await User.findOne({ username: targetUsername });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
      }

      // Check if they are friends
      const currentUser = await User.findOne({ username: requestingUser });
      if (!currentUser.friends.includes(targetUsername)) {
        return res.status(403).json({ success: false, message: 'Nicht berechtigt' });
      }

      // Check if memories are public
      if (!targetUser.memoriesPublic) {
        return res.status(403).json({ success: false, message: 'Memories sind privat' });
      }
    }

    // Get all photos for the user
    let query = { username: targetUsername };
    
    // Filter by year and month if provided
    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query.date = { $gte: startDate, $lte: endDate };
    }

    const photos = await Photo.find(query).select('date');
    
    // Group by date and count
    const calendar = photos.reduce((acc, photo) => {
      if (!acc[photo.date]) {
        acc[photo.date] = 0;
      }
      acc[photo.date]++;
      return acc;
    }, {});

    res.json({
      success: true,
      data: { calendar, username: targetUsername }
    });
  } catch (error) {
    console.error('Calendar-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Get memories for a specific date
app.get('/api/memories/date/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    const { username } = req.query;
    const requestingUser = req.user.username;

    // Check if requesting own memories or friend's memories
    const targetUsername = username || requestingUser;

    // If requesting friend's memories, check if memories are public
    if (targetUsername !== requestingUser) {
      const targetUser = await User.findOne({ username: targetUsername });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
      }

      // Check if they are friends
      const currentUser = await User.findOne({ username: requestingUser });
      if (!currentUser.friends.includes(targetUsername)) {
        return res.status(403).json({ success: false, message: 'Nicht berechtigt' });
      }

      // Check if memories are public
      if (!targetUser.memoriesPublic) {
        return res.status(403).json({ success: false, message: 'Memories sind privat' });
      }
    }

    const photos = await Photo.find({
      username: targetUsername,
      date: date
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      data: { photos, date, username: targetUsername }
    });
  } catch (error) {
    console.error('Date-Memories-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Toggle memories public/private
app.post('/api/memories/toggle-privacy', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    }

    user.memoriesPublic = !user.memoriesPublic;
    await user.save();

    res.json({
      success: true,
      message: user.memoriesPublic ? 'Memories sind jetzt öffentlich' : 'Memories sind jetzt privat',
      data: { memoriesPublic: user.memoriesPublic }
    });
  } catch (error) {
    console.error('Toggle-Privacy-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Get memories privacy status
app.get('/api/memories/privacy', authenticateToken, async (req, res) => {
  try {
    const { username } = req.query;
    const targetUsername = username || req.user.username;

    const user = await User.findOne({ username: targetUsername });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    }

    res.json({
      success: true,
      data: { memoriesPublic: user.memoriesPublic || false, username: targetUsername }
    });
  } catch (error) {
    console.error('Privacy-Status-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Get friend's memories overview (only if public)
app.get('/api/friends/:username/memories', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const requestingUser = req.user.username;

    // Check if they are friends
    const currentUser = await User.findOne({ username: requestingUser });
    const targetUser = await User.findOne({ username });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    }

    if (!currentUser.friends.includes(username)) {
      return res.status(403).json({ success: false, message: 'Nicht berechtigt' });
    }

    if (!targetUser.memoriesPublic) {
      return res.status(403).json({ success: false, message: 'Memories sind privat' });
    }

    const today = new Date().toISOString().split('T')[0];
    const memories = await Photo.find({
      username,
      date: { $ne: today }
    }).sort({ date: -1 }).limit(50);

    res.json({
      success: true,
      data: { photos: memories, username }
    });
  } catch (error) {
    console.error('Friend-Memories-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== FRIENDS ENDPOINTS ====================

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    const friends = (user.friends || []).map(friendUsername => ({
      username: friendUsername
    }));

    res.json({
      success: true,
      data: { friends }
    });
  } catch (error) {
    console.error('Freunde-Laden-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/friends/add', authenticateToken, async (req, res) => {
  try {
    const { friendUsername } = req.body;
    const username = req.user.username;

    if (!friendUsername) {
      return res.status(400).json({ 
        success: false, 
        message: 'Benutzername erforderlich' 
      });
    }

    if (friendUsername === username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Du kannst dich nicht selbst als Freund hinzufügen' 
      });
    }

    const user = await User.findOne({ username });
    const friend = await User.findOne({ username: friendUsername });

    if (!friend) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    if (!user.friends) user.friends = [];
    if (!user.pendingRequests) user.pendingRequests = [];
    if (!friend.pendingRequests) friend.pendingRequests = [];

    if (user.friends.includes(friendUsername)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bereits befreundet' 
      });
    }

    if (friend.pendingRequests.includes(username)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Anfrage bereits gesendet' 
      });
    }

    friend.pendingRequests.push(username);
    await friend.save();

    // Send notification to friend
    await sendNotificationToUser(
      friendUsername,
      '👋 Neue Freundschaftsanfrage!',
      `${username} möchte dein Freund sein`,
      'friend_request',
      username
    );

    res.json({
      success: true,
      message: 'Freundschaftsanfrage gesendet'
    });
  } catch (error) {
    console.error('Freund-Hinzufügen-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { friendUsername } = req.body;
    const username = req.user.username;

    const user = await User.findOne({ username });
    const friend = await User.findOne({ username: friendUsername });

    if (!friend) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    if (!user.pendingRequests) user.pendingRequests = [];
    if (!user.friends) user.friends = [];
    if (!friend.friends) friend.friends = [];

    if (!user.pendingRequests.includes(friendUsername)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Keine Anfrage vorhanden' 
      });
    }

    user.pendingRequests = user.pendingRequests.filter(u => u !== friendUsername);
    user.friends.push(friendUsername);
    friend.friends.push(username);

    await user.save();
    await friend.save();

    res.json({
      success: true,
      message: 'Freundschaft akzeptiert'
    });
  } catch (error) {
    console.error('Freund-Akzeptieren-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/friends/remove', authenticateToken, async (req, res) => {
  try {
    const { friendUsername } = req.body;
    const username = req.user.username;

    const user = await User.findOne({ username });
    const friend = await User.findOne({ username: friendUsername });

    if (!friend) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    if (!user.friends) user.friends = [];
    if (!friend.friends) friend.friends = [];

    user.friends = user.friends.filter(u => u !== friendUsername);
    friend.friends = friend.friends.filter(u => u !== username);

    await user.save();
    await friend.save();

    res.json({
      success: true,
      message: 'Freundschaft beendet'
    });
  } catch (error) {
    console.error('Freund-Entfernen-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    const requests = (user.pendingRequests || []).map(reqUsername => ({
      username: reqUsername
    }));

    res.json({
      success: true,
      data: { requests }
    });
  } catch (error) {
    console.error('Anfragen-Laden-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== NOTIFICATIONS ENDPOINTS ====================

app.post('/api/notifications/register', authenticateToken, (req, res) => {
  try {
    const { deviceToken, platform } = req.body;
    const username = req.user.username;
    
    activeDevices.set(username, { deviceToken, platform });
    
    res.json({
      success: true,
      message: 'Device token registered'
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    
    const userNotifications = await Notification.find({ username })
      .sort({ timestamp: -1 })
      .limit(50);
    
    const unreadCount = userNotifications.filter(n => !n.read).length;
    
    res.json({
      success: true,
      data: {
        notifications: userNotifications,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    
    await Notification.findOneAndUpdate(
      { id, username },
      { read: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/notifications/read', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    
    await Notification.deleteMany({ username });
    
    res.json({ success: true, message: 'Benachrichtigungen gelöscht' });
  } catch (error) {
    console.error('Delete notifications error:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== CRON JOBS ====================

cron.schedule('0 10 * * *', async () => {
  console.log('[CRON] Sending daily VibeTime notifications...');
  
  const users = await User.find();
  const challenges = await Challenge.find().sort({ id: 1 });
  
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const todayChallenge = challenges[dayOfYear % challenges.length];
  
  for (const user of users) {
    await sendNotificationToUser(
      user.username,
      '📸 VibeTime!',
      `Neue Challenge: ${todayChallenge.icon} ${todayChallenge.title}`,
      'daily_challenge',
      'system'
    );
  }
  
  console.log(`[CRON] Sent VibeTime notifications to ${users.length} users`);
});

// ==================== SERVER START ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('   ✅ Daily Vibes Server (MongoDB) läuft!');
  console.log('========================================');
  console.log(`\n📱 Server läuft auf Port: ${PORT}`);
  console.log(`💾 Datenbank: MongoDB`);
  console.log(`\n🔧 API Endpoints verfügbar unter: /api/...`);
  console.log('🔔 Notifications: VibeTime täglich um 10:00');
  console.log('\n⏹️  Zum Beenden: STRG+C\n');
});
