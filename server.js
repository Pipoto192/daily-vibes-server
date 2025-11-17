const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'daily-vibes-secret-key-2024'; // In Production: Nutze Umgebungsvariable!

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Data Directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Admin usernames
const ADMIN_USERS = ['admin', 'dailyadmin'];

// Helper Functions
function loadData(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return filename === 'users.json' ? [] : 
           filename === 'photos.json' ? [] :
           filename === 'challenges.json' ? getDefaultChallenges() : 
           filename === 'notifications.json' ? [] : [];
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Fehler beim Laden von ${filename}:`, error);
    return [];
  }
}

function saveData(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Fehler beim Speichern von ${filename}:`, error);
    return false;
  }
}

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

function sendNotificationToUser(username, title, body, type, from, extra = {}) {
  const device = activeDevices.get(username);
  if (device && device.deviceToken) {
    // Log notification (in real app, this would send via FCM/APNs)
    console.log(`[NOTIFICATION] To: ${username}, Title: ${title}, Body: ${body}`);
    
    // Store notification for user to fetch
    const notifications = loadData('notifications.json');
    notifications.push({
      id: Date.now().toString(),
      username,
      title,
      body,
      type,
      from,
      ...extra,
      timestamp: new Date().toISOString(),
      read: false
    });
    saveData('notifications.json', notifications);
    return true;
  }
  return false;
}

function notifyFriendsAboutPhoto(username) {
  const users = loadData('users.json');
  const user = users.find(u => u.username === username);
  if (!user) return;
  
  const friends = user.friends || [];
  friends.forEach(friendUsername => {
    sendNotificationToUser(
      friendUsername,
      '📸 Neues Foto!',
      `${username} hat ein neues Foto hochgeladen!`,
      'new_photo',
      username
    );
  });
}

function getDefaultChallenges() {
  return [
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
}

// JWT Middleware
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

    const users = loadData('users.json');

    if (users.find(u => u.username === username)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Benutzername bereits vergeben' 
      });
    }

    if (users.find(u => u.email === email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email bereits registriert' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      username,
      email,
      password: hashedPassword,
      profileImage: null,
      friends: [],
      pendingRequests: [],
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveData('users.json', users);

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      message: 'Registrierung erfolgreich',
      data: {
        token,
        user: sanitizeUser(newUser)
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

    const users = loadData('users.json');
    const user = users.find(u => u.username === username);

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

// ==================== PROFILE ENDPOINTS ====================

app.get('/api/profile', authenticateToken, (req, res) => {
  try {
    const username = req.user.username;
    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    
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
    
    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }
    
    user.profileImage = profileImage;
    saveData('users.json', users);
    
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
    
    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    
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
    
    if (users.some(u => u.email === newEmail && u.username !== username)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email wird bereits verwendet' 
      });
    }
    
    user.email = newEmail;
    saveData('users.json', users);
    
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
    
    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    
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
    saveData('users.json', users);
    
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

// Helper function to update user streak
function updateUserStreak(username, todayStr) {
  const users = loadData('users.json');
  const user = users.find(u => u.username === username);
  
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
    // Continue streak
    user.streak += 1;
  } else if (user.lastPhotoDate === todayStr) {
    // Already posted today, don't change streak
    return;
  } else {
    // Streak broken, start new streak
    user.streak = 1;
  }

  user.lastPhotoDate = todayStr;
  
  // Check for streak achievements
  checkAchievements(user);
  
  saveData('users.json', users);
}

// Helper function to check and award achievements
function checkAchievements(user) {
  if (!user.achievements) user.achievements = [];

  // 7-day streak achievement
  if (user.streak >= 7 && !user.achievements.includes('streak_7')) {
    user.achievements.push('streak_7');
  }

  // 30-day streak achievement
  if (user.streak >= 30 && !user.achievements.includes('streak_30')) {
    user.achievements.push('streak_30');
  }
}

// Admin Middleware
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

// ==================== CHALLENGE ENDPOINTS ====================

app.get('/api/challenge/today', authenticateToken, (req, res) => {
  try {
    const challenges = loadData('challenges.json');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Check for admin override
    const overrideFile = path.join(DATA_DIR, 'challenge_override.json');
    let todayChallenge;
    
    if (fs.existsSync(overrideFile)) {
      const override = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
      if (override.date === todayStr && override.challengeId) {
        todayChallenge = challenges.find(c => c.id === override.challengeId);
      }
    }
    
    // Fallback to day-based selection
    if (!todayChallenge) {
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
        ...todayChallenge,
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

// Admin: Set today's challenge
app.post('/api/admin/challenge/set', authenticateAdmin, (req, res) => {
  try {
    const { challengeId } = req.body;
    const challenges = loadData('challenges.json');
    
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge nicht gefunden' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const override = { date: today, challengeId };
    
    fs.writeFileSync(
      path.join(DATA_DIR, 'challenge_override.json'),
      JSON.stringify(override, null, 2)
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

// Admin: Get all challenges
app.get('/api/admin/challenges', authenticateAdmin, (req, res) => {
  try {
    const challenges = loadData('challenges.json');
    res.json({ success: true, data: { challenges } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Admin: Get all photos
app.get('/api/admin/photos', authenticateAdmin, (req, res) => {
  try {
    const photos = loadData('photos.json');
    res.json({ success: true, data: { photos } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== PHOTO ENDPOINTS ====================

// Get user stats (streak and achievements)
app.get('/api/users/stats', authenticateToken, (req, res) => {
  try {
    const username = req.user.username;
    const users = loadData('users.json');
    const user = users.find(u => u.username === username);

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

app.post('/api/photos/upload', authenticateToken, (req, res) => {
  try {
    const { imageData, caption } = req.body;
    const username = req.user.username;

    if (!imageData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bild erforderlich' 
      });
    }

    const photos = loadData('photos.json');
    const challenges = loadData('challenges.json');
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const todayChallenge = challenges[dayOfYear % challenges.length];

    // Check if user already has 3 photos today
    const todayPhotosCount = photos.filter(
      p => p.username === username && p.date === todayStr
    ).length;

    if (todayPhotosCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Du hast heute bereits 3 Fotos hochgeladen'
      });
    }

    const newPhoto = {
      id: `${username}_${todayStr}_${Date.now()}`,
      username,
      date: todayStr,
      imageData,
      caption: caption || '',
      challenge: todayChallenge.title,
      likes: [],
      comments: [],
      createdAt: today.toISOString()
    };

    photos.push(newPhoto);

    saveData('photos.json', photos);

    // Update user streak if this is their first photo today
    if (todayPhotosCount === 0) {
      updateUserStreak(username, todayStr);
    }

    // Notify friends about new photo
    notifyFriendsAboutPhoto(username);

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

app.get('/api/photos/today', authenticateToken, (req, res) => {
  try {
    const photos = loadData('photos.json');
    const users = loadData('users.json');
    const today = new Date().toISOString().split('T')[0];
    const username = req.user.username;

    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Benutzer nicht gefunden' 
      });
    }

    const friends = user.friends || [];
    const todayPhotos = photos.filter(p => 
      p.date === today && friends.includes(p.username)
    ).map(photo => {
      const photoUser = users.find(u => u.username === photo.username);
      return {
        ...photo,
        userProfileImage: photoUser?.profileImage || null
      };
    });

    res.json({
      success: true,
      photos: todayPhotos
    });
  } catch (error) {
    console.error('Fotos-Laden-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/photos/me/today', authenticateToken, (req, res) => {
  try {
    const photos = loadData('photos.json');
    const today = new Date().toISOString().split('T')[0];
    const username = req.user.username;

    const myPhotos = photos.filter(p => 
      p.username === username && p.date === today
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.json({
      success: true,
      photos: myPhotos
    });
  } catch (error) {
    console.error('Mein-Foto-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/photos/memories', authenticateToken, (req, res) => {
  try {
    const photos = loadData('photos.json');
    const username = req.user.username;
    const today = new Date().toISOString().split('T')[0];

    const myMemories = photos
      .filter(p => p.username === username && p.date !== today)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: { photos: myMemories }
    });
  } catch (error) {
    console.error('Memories-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/photos/like', authenticateToken, (req, res) => {
  try {
    const { photoUsername, photoDate } = req.body;
    const username = req.user.username;

    const photos = loadData('photos.json');
    const photo = photos.find(
      p => p.username === photoUsername && p.date === photoDate
    );

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
        sendNotificationToUser(
          photoUsername,
          '❤️ Neuer Like!',
          `${username} hat dein Foto geliked!`,
          'like',
          username
        );
      }
    }

    saveData('photos.json', photos);

    res.json({
      success: true,
      message: 'Like aktualisiert'
    });
  } catch (error) {
    console.error('Like-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/photos/comment', authenticateToken, (req, res) => {
  try {
    const { photoUsername, photoDate, text } = req.body;
    const username = req.user.username;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Kommentar darf nicht leer sein' 
      });
    }

    const photos = loadData('photos.json');
    const photo = photos.find(
      p => p.username === photoUsername && p.date === photoDate
    );

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
      timestamp: new Date().toISOString()
    });

    saveData('photos.json', photos);

    // Notify photo owner about new comment
    if (photoUsername !== username) {
      sendNotificationToUser(
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

// Delete photo (only own photos)
app.delete('/api/photos/delete', authenticateToken, (req, res) => {
  try {
    const { photoId } = req.body;
    const username = req.user.username;

    const photos = loadData('photos.json');
    const photoIndex = photos.findIndex(p => p.id === photoId);

    if (photoIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Foto nicht gefunden' 
      });
    }

    // Check if user owns this photo
    if (photos[photoIndex].username !== username) {
      return res.status(403).json({ 
        success: false, 
        message: 'Du kannst nur deine eigenen Fotos löschen' 
      });
    }

    photos.splice(photoIndex, 1);
    saveData('photos.json', photos);

    res.json({ success: true, message: 'Foto gelöscht' });
  } catch (error) {
    console.error('Delete-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== FRIENDS ENDPOINTS ====================

app.get('/api/friends', authenticateToken, (req, res) => {
  try {
    const users = loadData('users.json');
    const username = req.user.username;
    const user = users.find(u => u.username === username);

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

app.post('/api/friends/add', authenticateToken, (req, res) => {
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

    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    const friend = users.find(u => u.username === friendUsername);

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
    saveData('users.json', users);

    // Send notification to friend
    sendNotificationToUser(
      friendUsername,
      '👋 Neue Freundschaftsanfrage!',
      `${username} möchte dein Freund sein`
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

app.post('/api/friends/accept', authenticateToken, (req, res) => {
  try {
    const { friendUsername } = req.body;
    const username = req.user.username;

    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    const friend = users.find(u => u.username === friendUsername);

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

    saveData('users.json', users);

    res.json({
      success: true,
      message: 'Freundschaft akzeptiert'
    });
  } catch (error) {
    console.error('Freund-Akzeptieren-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.post('/api/friends/remove', authenticateToken, (req, res) => {
  try {
    const { friendUsername } = req.body;
    const username = req.user.username;

    const users = loadData('users.json');
    const user = users.find(u => u.username === username);
    const friend = users.find(u => u.username === friendUsername);

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

    saveData('users.json', users);

    res.json({
      success: true,
      message: 'Freundschaft beendet'
    });
  } catch (error) {
    console.error('Freund-Entfernen-Fehler:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

app.get('/api/friends/requests', authenticateToken, (req, res) => {
  try {
    const users = loadData('users.json');
    const username = req.user.username;
    const user = users.find(u => u.username === username);

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

app.post('/api/notifications/read', authenticateToken, (req, res) => {
  try {
    const username = req.user.username;
    let notifications = loadData('notifications.json');
    
    // Delete all user's notifications instead of marking as read
    notifications = notifications.filter(n => n.username !== username);
    
    saveData('notifications.json', notifications);
    res.json({ success: true, message: 'Benachrichtigungen gelöscht' });
  } catch (error) {
    console.error('Delete notifications error:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== NOTIFICATION ENDPOINTS ====================

// Register device token
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

// Get notifications for user
app.get('/api/notifications', authenticateToken, (req, res) => {
  try {
    const username = req.user.username;
    const notifications = loadData('notifications.json');
    
    const userNotifications = notifications
      .filter(n => n.username === username)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);
    
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

// Mark notification as read
app.post('/api/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    const notifications = loadData('notifications.json');
    
    const notification = notifications.find(n => n.id === id && n.username === username);
    if (notification) {
      notification.read = true;
      saveData('notifications.json', notifications);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// ==================== SERVER START ====================

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ==================== CRON JOBS ====================

// Daily VibeTime notification at 10:00
cron.schedule('0 10 * * *', () => {
  console.log('[CRON] Sending daily VibeTime notifications...');
  const users = loadData('users.json');
  const challenges = loadData('challenges.json');
  
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const todayChallenge = challenges[dayOfYear % challenges.length];
  
  users.forEach(user => {
    sendNotificationToUser(
      user.username,
      '📸 VibeTime!',
      `Neue Challenge: ${todayChallenge.icon} ${todayChallenge.title}`
    );
  });
  
  console.log(`[CRON] Sent VibeTime notifications to ${users.length} users`);
});

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n========================================');
  console.log('   ✅ Daily Vibes Server läuft!');
  console.log('========================================');
  console.log(`\n📱 Lokaler Zugriff:    http://localhost:${PORT}`);
  console.log(`🌐 Netzwerk-Zugriff:   http://${localIP}:${PORT}`);
  console.log(`\n💾 Daten-Ordner:       ${DATA_DIR}`);
  console.log('\n🔧 API Endpoints verfügbar unter: /api/...');
  console.log('🔔 Notifications: VibeTime täglich um 10:00');
  console.log('\n⏹️  Zum Beenden: STRG+C\n');
});
