const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DATA_DIR lets db.json live on a mounted persistent disk (set DATA_DIR to
// the disk's mount path, e.g. /data, in Render's environment variables).
// Falls back to the app folder itself if DATA_DIR isn't set, which is fine
// for local testing but will NOT survive a Render redeploy on its own.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'db.json');
const METRIC_KEYS = ['salary', 'profit_loss', 'vendor_expenses', 'pf', 'esic', 'labour_strength', 'billing', 'special_expenses', 'subcontractor_pl'];

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
function uid() {
  return crypto.randomBytes(6).toString('hex');
}

function defaultDb() {
  const s1 = uid(), s2 = uid(), s3 = uid();
  return {
    profiles: [
      { id: 'admin', label: 'Full access', passwordHash: sha256('Sitewise2026'), sections: 'all' },
      { id: 'payroll', label: 'Payroll access', passwordHash: sha256('Payroll2026'), sections: ['salary', 'pf', 'esic', 'labour_strength'] },
      { id: 'procurement', label: 'Procurement access', passwordHash: sha256('Vendor2026'), sections: ['vendor_expenses', 'billing', 'special_expenses', 'subcontractor_pl'] },
    ],
    state: {
      sites: [
        { id: s1, name: 'Site A - Andheri', type: 'Tender', location: 'Mumbai', incharge: 'Ramesh Kumar' },
        { id: s2, name: 'Site B - Thane', type: 'Tender', location: 'Thane', incharge: 'Suresh Patil' },
        { id: s3, name: 'Private Site - Bandra Residence', type: 'Private', location: 'Mumbai', incharge: 'Ramesh Kumar' },
      ],
      salary: { [s1]: { jan: 450000, feb: 460000, march: 470000 }, [s2]: { jan: 320000, feb: 325000, march: 330000 } },
      profit_loss: { [s1]: { jan: 180000, feb: -25000, march: 210000 }, [s2]: { jan: 90000, feb: 95000, march: -40000 } },
      vendor_expenses: { [s1]: { jan: 210000, feb: 198000, march: 225000 }, [s2]: { jan: 130000, feb: 140000, march: 128000 } },
      pf: { [s1]: { jan: 19000, feb: 19200, march: 19500 }, [s2]: { jan: 13500, feb: 13600, march: 13700 } },
      esic: { [s1]: { jan: 19000, feb: 19300, march: 19500 }, [s2]: { jan: 13500, feb: 13600, march: 13800 } },
      labour_strength: { [s1]: { jan: 42, feb: 45, march: 48 }, [s2]: { jan: 30, feb: 28, march: 33 } },
      billing: { [s1]: { jan: 900000, feb: 875000, march: 950000 }, [s3]: { jan: 350000, feb: 360000, march: 340000 } },
      special_expenses: { [s1]: { jan: 15000, feb: 0, march: 22000 }, [s2]: { jan: 0, feb: 8000, march: 0 } },
      subcontractor_pl: [
        { id: uid(), siteId: s1, name: 'ABC Electricals', jan: 25000, feb: -5000, march: 18000 },
        { id: uid(), siteId: s2, name: 'XYZ Plumbing', jan: 12000, feb: 14000, march: 9000 },
      ],
    },
  };
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    const db = defaultDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return db;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  // Migration: older databases stored a single combined 'pf_esic' field.
  // Move that into 'pf' so no existing numbers are lost, leave 'esic' empty
  // for the real split to be entered. Only runs once per database.
  if (db.state && db.state.pf_esic && !db.state.pf) {
    db.state.pf = db.state.pf_esic;
    db.state.esic = db.state.esic || {};
    delete db.state.pf_esic;
    db.profiles.forEach(p => {
      if (Array.isArray(p.sections) && p.sections.includes('pf_esic')) {
        p.sections = p.sections.filter(s => s !== 'pf_esic').concat(['pf', 'esic']);
      }
    });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }
  return db;
}
function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDb();
const sessions = new Map(); // token -> { profileId, loginAt, lastActive }

// Prune sessions that haven't been active in 7+ days, hourly.
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [token, s] of sessions.entries()) {
    if (s.lastActive < cutoff) sessions.delete(token);
  }
}, 60 * 60 * 1000);

function allowedSections(profile) {
  return profile.sections === 'all' ? ['dashboard', 'site_master', ...METRIC_KEYS] : profile.sections;
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Not logged in.' });
  const profile = db.profiles.find(p => p.id === session.profileId);
  if (!profile) return res.status(401).json({ error: 'Session invalid.' });
  session.lastActive = Date.now();
  req.profile = profile;
  req.sessionToken = token;
  next();
}
function requireAdmin(req, res, next) {
  if (req.profile.id !== 'admin') return res.status(403).json({ error: 'Only the full-access login can do this.' });
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const hash = sha256(password);
  const profile = db.profiles.find(p => p.passwordHash === hash);
  if (!profile) return res.status(401).json({ error: 'Incorrect password.' });
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessions.set(token, { profileId: profile.id, loginAt: now, lastActive: now });
  res.json({
    token,
    profile: { id: profile.id, label: profile.label, sections: allowedSections(profile) },
  });
});

app.post('/api/logout', auth, (req, res) => {
  sessions.delete(req.sessionToken);
  res.json({ ok: true });
});

app.get('/api/admin/sessions', auth, requireAdmin, (req, res) => {
  const now = Date.now();
  const list = Array.from(sessions.entries()).map(([token, s]) => {
    const profile = db.profiles.find(p => p.id === s.profileId);
    return {
      label: profile ? profile.label : s.profileId,
      loginAt: s.loginAt,
      lastActive: s.lastActive,
      secondsSinceActive: Math.round((now - s.lastActive) / 1000),
      isThisSession: token === req.sessionToken,
    };
  }).sort((a, b) => b.lastActive - a.lastActive);
  res.json(list);
});

app.get('/api/state', auth, (req, res) => {
  const allowed = allowedSections(req.profile);
  const sections = {};
  METRIC_KEYS.forEach(key => {
    if (allowed.includes(key)) sections[key] = db.state[key];
  });
  res.json({ sites: db.state.sites, sections, canEditSites: allowed.includes('site_master') });
});

app.post('/api/state/section', auth, (req, res) => {
  const { key, value } = req.body || {};
  const allowed = allowedSections(req.profile);
  if (!METRIC_KEYS.includes(key) || !allowed.includes(key)) {
    return res.status(403).json({ error: 'Not allowed to edit this section.' });
  }
  db.state[key] = value;
  saveDb(db);
  res.json({ ok: true });
});

app.post('/api/state/sites', auth, requireAdmin, (req, res) => {
  const { sites } = req.body || {};
  if (!Array.isArray(sites)) return res.status(400).json({ error: 'Invalid sites payload.' });
  db.state.sites = sites;
  saveDb(db);
  res.json({ ok: true });
});

app.get('/api/admin/profiles', auth, requireAdmin, (req, res) => {
  res.json(db.profiles.map(p => ({ id: p.id, label: p.label, sections: allowedSections(p) })));
});

app.post('/api/admin/set-password', auth, requireAdmin, (req, res) => {
  const { profileId, password } = req.body || {};
  const profile = db.profiles.find(p => p.id === profileId);
  if (!profile) return res.status(404).json({ error: 'Login not found.' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password too short.' });
  profile.passwordHash = sha256(password);
  saveDb(db);
  res.json({ ok: true });
});

app.get('/api/admin/backup', auth, requireAdmin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="khfm-backup.json"');
  res.json(db);
});

app.post('/api/admin/restore', auth, requireAdmin, (req, res) => {
  const incoming = req.body;
  if (!incoming || !incoming.profiles || !incoming.state) {
    return res.status(400).json({ error: 'That does not look like a valid KHFM backup file.' });
  }
  db = incoming;
  saveDb(db);
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('KHFM report server running on port ' + PORT));
