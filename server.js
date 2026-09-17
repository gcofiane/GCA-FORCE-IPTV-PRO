
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");

const app = express();

// ======================================================
// CONFIGURATION
// ======================================================

const PORT = process.env.PORT || 3000;

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "CHANGE_ME_ADMIN_TOKEN";

const JWT_SECRET =
  process.env.JWT_SECRET || "CHANGE_ME_JWT_SECRET";

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());

// ======================================================
// BASE DE DONNÉES SQLITE
// ======================================================

const db = new Database("database.db");

db.pragma("journal_mode = WAL");

// Table des appareils
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    active INTEGER DEFAULT 0,
    activation_code TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Table des codes d'activation
db.exec(`
  CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    active INTEGER DEFAULT 1,
    device_id TEXT DEFAULT '',
    expires_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Table DNS
db.exec(`
  CREATE TABLE IF NOT EXISTS dns_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ======================================================
// OUTILS
// ======================================================

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateToken(deviceId) {
  return jwt.sign(
    {
      device_id: deviceId
    },
    JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );
}

// ======================================================
// AUTHENTIFICATION ADMIN
// ======================================================

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({
      success: false,
      message: "Token admin manquant"
    });
  }

  const parts = auth.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({
      success: false,
      message: "Format du token invalide"
    });
  }

  const token = parts[1];

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      message: "Token admin incorrect"
    });
  }

  next();
}

// ======================================================
// AUTHENTIFICATION APPAREIL
// ======================================================

function deviceAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({
      success: false,
      message: "Token appareil manquant"
    });
  }

  const parts = auth.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({
      success: false,
      message: "Format du token invalide"
    });
  }

  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET);

    const device = db
      .prepare(
        "SELECT * FROM devices WHERE device_id = ? AND active = 1"
      )
      .get(decoded.device_id);

    if (!device) {
      return res.status(403).json({
        success: false,
        message: "Appareil non autorisé"
      });
    }

    req.device = device;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token appareil invalide ou expiré"
    });
  }
}

// ======================================================
// PAGE PRINCIPALE
// ======================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "GCA FORCE-IPTV PRO",
    message: "Backend REST opérationnel",
    version: "1.0.0"
  });
});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "GCA FORCE-IPTV PRO",
    timestamp: new Date().toISOString()
  });
});

// ======================================================
// CONNEXION ADMIN
// ======================================================

app.post("/api/admin/login", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Token manquant"
    });
  }

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      message: "Token admin incorrect"
    });
  }

  res.json({
    success: true,
    message: "Connexion administrateur réussie"
  });
});

// ======================================================
// INFORMATIONS ADMIN
// ======================================================

app.get("/api/admin", adminAuth, (req, res) => {
  const devices = db
    .prepare("SELECT * FROM devices ORDER BY id DESC")
    .all();

  const codes = db
    .prepare("SELECT * FROM activation_codes ORDER BY id DESC")
    .all();

  const dns = db
    .prepare("SELECT * FROM dns_servers ORDER BY id DESC")
    .all();

  res.json({
    success: true,
    service: "GCA FORCE-IPTV PRO",
    devices,
    activation_codes: codes,
    dns_servers: dns
  });
});

// ======================================================
// APPAREILS - LISTE
// ======================================================

app.get("/api/admin/devices", adminAuth, (req, res) => {
  const devices = db
    .prepare("SELECT * FROM devices ORDER BY id DESC")
    .all();

  res.json({
    success: true,
    devices
  });
});

// ======================================================
// AJOUTER UN APPAREIL
// ======================================================

app.post("/api/admin/devices", adminAuth, (req, res) => {
  const {
    device_id,
    name = "",
    active = 0
  } = req.body;

  if (!device_id) {
    return res.status(400).json({
      success: false,
      message: "device_id obligatoire"
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO devices
        (device_id, name, active)
        VALUES (?, ?, ?)
      `)
      .run(
        device_id,
        name,
        active ? 1 : 0
      );

    res.json({
      success: true,
      message: "Appareil ajouté",
      id: result.lastInsertRowid
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Cet appareil existe déjà"
    });
  }
});

// ======================================================
// ACTIVER / DÉSACTIVER UN APPAREIL
// ======================================================

app.patch("/api/admin/devices/:id", adminAuth, (req, res) => {
  const id = req.params.id;
  const { active } = req.body;

  const result = db
    .prepare(`
      UPDATE devices
      SET active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(
      active ? 1 : 0,
      id
    );

  if (result.changes === 0) {
    return res.status(404).json({
      success: false,
      message: "Appareil introuvable"
    });
  }

  res.json({
    success: true,
    message: active
      ? "Appareil activé"
      : "Appareil désactivé"
  });
});

// ======================================================
// SUPPRIMER UN APPAREIL
// ======================================================

app.delete("/api/admin/devices/:id", adminAuth, (req, res) => {
  const result = db
    .prepare("DELETE FROM devices WHERE id = ?")
    .run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({
      success: false,
      message: "Appareil introuvable"
    });
  }

  res.json({
    success: true,
    message: "Appareil supprimé"
  });
});

// ======================================================
// CODES D'ACTIVATION - LISTE
// ======================================================

app.get("/api/admin/codes", adminAuth, (req, res) => {
  const codes = db
    .prepare(
      "SELECT * FROM activation_codes ORDER BY id DESC"
    )
    .all();

  res.json({
    success: true,
    codes
  });
});

// ======================================================
// CRÉER UN CODE D'ACTIVATION
// ======================================================

app.post("/api/admin/codes", adminAuth, (req, res) => {
  let code = req.body.code;

  if (!code) {
    code = generateCode();
  }

  code = code.toUpperCase();

  const expiresAt =
    req.body.expires_at || null;

  try {
    const result = db
      .prepare(`
        INSERT INTO activation_codes
        (code, active, expires_at)
        VALUES (?, 1, ?)
      `)
      .run(
        code,
        expiresAt
      );

    res.json({
      success: true,
      message: "Code créé",
      code,
      id: result.lastInsertRowid
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Ce code existe déjà"
    });
  }
});

// ======================================================
// ACTIVER / DÉSACTIVER UN CODE
// ======================================================

app.patch("/api/admin/codes/:id", adminAuth, (req, res) => {
  const { active } = req.body;

  const result = db
    .prepare(`
      UPDATE activation_codes
      SET active = ?
      WHERE id = ?
    `)
    .run(
      active ? 1 : 0,
      req.params.id
    );

  if (result.changes === 0) {
    return res.status(404).json({
      success: false,
      message: "Code introuvable"
    });
  }

  res.json({
    success: true,
    message: active
      ? "Code activé"
      : "Code désactivé"
  });
});

// ======================================================
// SUPPRIMER UN CODE
// ======================================================

app.delete("/api/admin/codes/:id", adminAuth, (req, res) => {
  const result = db
    .prepare(
      "DELETE FROM activation_codes WHERE id = ?"
    )
    .run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({
      success: false,
      message: "Code introuvable"
    });
  }

  res.json({
    success: true,
    message: "Code supprimé"
  });
});

// ======================================================
// ACTIVATION D'UN APPAREIL
// ======================================================

app.post("/api/auth/activate", (req, res) => {
  const {
    device_id,
    code,
    name = ""
  } = req.body;

  if (!device_id || !code) {
    return res.status(400).json({
      success: false,
      message: "device_id et code sont obligatoires"
    });
  }

  const activationCode = db
    .prepare(`
      SELECT *
      FROM activation_codes
      WHERE code = ?
      AND active = 1
    `)
    .get(code.toUpperCase());

  if (!activationCode) {
    return res.status(403).json({
      success: false,
      message: "Code d'activation invalide"
    });
  }

  // Vérification de l'expiration
  if (
    activationCode.expires_at &&
    new Date(activationCode.expires_at) < new Date()
  ) {
    return res.status(403).json({
      success: false,
      message: "Code d'activation expiré"
    });
  }

  // Vérifier si l'appareil existe
  let device = db
    .prepare(
      "SELECT * FROM devices WHERE device_id = ?"
    )
    .get(device_id);

  if (device) {
    db.prepare(`
      UPDATE devices
      SET active = 1,
          activation_code = ?,
          name = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE device_id = ?
    `).run(
      code.toUpperCase(),
      name,
      device_id
    );
  } else {
    db.prepare(`
      INSERT INTO devices
      (device_id, name, active, activation_code)
      VALUES (?, ?, 1, ?)
    `).run(
      device_id,
      name,
      code.toUpperCase()
    );
  }

  // Marquer le code comme utilisé
  db.prepare(`
    UPDATE activation_codes
    SET active = 0,
        device_id = ?
    WHERE id = ?
  `).run(
    device_id,
    activationCode.id
  );

  const token = generateToken(device_id);

  res.json({
    success: true,
    message: "Appareil activé avec succès",
    device_id,
    token
  });
});

// ======================================================
// INFORMATIONS DE L'APPAREIL CONNECTÉ
// ======================================================

app.get("/api/device/me", deviceAuth, (req, res) => {
  res.json({
    success: true,
    device: req.device
  });
});

// ======================================================
// DNS - LISTE PUBLIQUE
// ======================================================

app.get("/api/dns", (req, res) => {
  const dns = db
    .prepare(`
      SELECT id, name, url
      FROM dns_servers
      WHERE active = 1
      ORDER BY id ASC
    `)
    .all();

  res.json({
    success: true,
    dns
  });
});

// ======================================================
// DNS - ADMIN
// ======================================================

app.post("/api/admin/dns", adminAuth, (req, res) => {
  const {
    name,
    url
  } = req.body;

  if (!name || !url) {
    return res.status(400).json({
      success: false,
      message: "name et url sont obligatoires"
    });
  }

  const result = db
    .prepare(`
      INSERT INTO dns_servers
      (name, url, active)
      VALUES (?, ?, 1)
    `)
    .run(
      name,
      url
    );

  res.json({
    success: true,
    message: "DNS ajouté",
    id: result.lastInsertRowid
  });
});

// ======================================================
// ERREUR 404
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route introuvable",
    path: req.path
  });
});

// ======================================================
// GESTION DES ERREURS
// ======================================================

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Erreur interne du serveur"
  });
});

// ======================================================
// DÉMARRAGE
// ======================================================

app.listen(PORT, () => {
  console.log(
    GCA FORCE-IPTV PRO API listening on port ${PORT}
  );
});
