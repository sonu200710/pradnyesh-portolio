const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve portfolio files

const JWT_SECRET = 'super-secret-key-change-this-in-production';

const EMAIL_USER = process.env.EMAIL_USER || 'mistaripradnyesh@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'your-16-char-app-password-here';

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set. Email delivery may fail in production.');
}

// Gmail config - use environment variables for deployment
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// SQLite setup
const db = new sqlite3.Database('./portfolio.db', (err) => {
  if (err) {
    console.error('❌ SQLite error:', err.message);
  } else {
    console.log('✅ SQLite connected');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notified INTEGER NOT NULL DEFAULT 0
  )`);
});

const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const allQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const setupDefaultAdmin = async () => {
  try {
    const user = await getQuery('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!user) {
      const hash = await bcrypt.hash('admin123', 10);
      await runQuery(
        'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)',
        ['admin', hash, new Date().toISOString()]
      );
      console.log('✅ Default admin user created');
    }
  } catch (err) {
    console.error('❌ Admin setup error:', err.message);
  }
};

setupDefaultAdmin();

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getQuery('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get messages (protected)
app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const messages = await allQuery('SELECT id, name, email, message, timestamp FROM messages ORDER BY timestamp DESC LIMIT 100');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message + notification email
app.post('/api/send-message', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Save to SQLite
    const timestamp = new Date().toISOString();
    const result = await runQuery(
      'INSERT INTO messages (name, email, message, timestamp) VALUES (?, ?, ?, ?)',
      [name, email, message, timestamp]
    );
    const newMessage = { id: result.lastID, name, email, message, timestamp };

    // Send notification email to admin
    try {
      await transporter.sendMail({
        from: '"Portfolio Contact" <mistaripradnyesh@gmail.com>',
        to: 'mistaripradnyesh@gmail.com',
        subject: `New Message from ${name}`,
        text: `New contact form message from ${name}\nEmail: ${email}\nMessage:\n${message}\nTime: ${new Date(timestamp).toLocaleString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #212121; line-height: 1.6; max-width: 680px; margin: auto; padding: 20px; background: #ffffff; border: 1px solid #e6e6e6; border-radius: 10px;">
            <h2 style="margin-bottom: 16px; color: #1a73e8; font-size: 24px;">New Contact Form Message</h2>
            <p style="margin: 8px 0;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #1a73e8; text-decoration: none;">${email}</a></p>
            <p style="margin: 16px 0 8px 0; font-weight: 600;">Message:</p>
            <div style="padding: 14px 16px; background: #f4f8ff; border: 1px solid #d7e3fc; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word;">${message.replace(/\n/g, '<br>')}</div>
            <p style="margin: 18px 0 4px 0; color: #5f6368; font-size: 14px;">Received at ${new Date(timestamp).toLocaleString()}</p>
          </div>
        `
      });
      console.log(`✅ Notification email sent for message from ${name}`);
      // Send a confirmation email back to the person who submitted the form
      try {
        await transporter.sendMail({
          from: '"Portfolio Contact" <mistaripradnyesh@gmail.com>',
          to: email,
          subject: `Thanks for contacting Pradnyesh — I received your message`,
          text: `Hi ${name},\n\nThanks for reaching out. I received your message and will get back to you as soon as possible.\n\nYour message:\n${message}\n\nIf you need an immediate response, reply to this email or contact me at mistaripradnyesh@gmail.com.\n\n— Pradnyesh`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #212121; line-height: 1.6; max-width: 680px; margin: auto; padding: 20px; background: #ffffff; border: 1px solid #e6e6e6; border-radius: 10px;">
              <p style="margin: 0 0 12px 0; font-size: 16px;">Hi ${name},</p>
              <p style="margin: 0 0 14px 0; font-size: 15px;">Thanks for reaching out — I received your message and will get back to you as soon as possible.</p>
              <p style="margin: 0 0 8px 0; font-weight: 600;">Your message:</p>
              <div style="padding: 14px 16px; background: #f4f8ff; border: 1px solid #d7e3fc; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word;">${message.replace(/\n/g, '<br>')}</div>
              <p style="margin: 18px 0 0 0; font-size: 14px; color: #5f6368;">If you need an immediate response, reply to this email or contact me at <a href="mailto:mistaripradnyesh@gmail.com" style="color: #1a73e8;">mistaripradnyesh@gmail.com</a>.</p>
              <p style="margin: 16px 0 0 0; font-size: 14px;">— Pradnyesh</p>
            </div>
          `
        });
        console.log(`✅ Confirmation email sent to ${email}`);
      } catch (confirmErr) {
        console.error('Confirmation email failed:', confirmErr.message);
      }
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr.message);
    }

    res.json({ success: true, id: newMessage.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log('👤 Admin: /admin.html (admin/admin123)');
  console.log('📨 Form: /api/send-message');
  console.log('🔔 Email notifications enabled (update Gmail app password)');
  console.log('🗄️ SQLite + Auth ready!');
});

