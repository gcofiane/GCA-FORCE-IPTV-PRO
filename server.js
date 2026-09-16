const express=require("express");
const cors=require("cors");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const Database=require("better-sqlite3");

const app=express(), db=new Database("gca_force.db");
const PORT=process.env.PORT||8080;
const JWT_SECRET=process.env.JWT_SECRET||"CHANGE_THIS_SECRET_IN_PRODUCTION";
app.use(cors()); app.use(express.json());

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',
 active INTEGER NOT NULL DEFAULT 1,expires_at TEXT
);
CREATE TABLE IF NOT EXISTS activation_codes(
 id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,expires_at TEXT,used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS devices(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,device_id TEXT NOT NULL,device_name TEXT,platform TEXT,created_at TEXT NOT NULL,
 UNIQUE(user_id,device_id),FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS dns_servers(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,base_url TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 100,active INTEGER NOT NULL DEFAULT 1
);
`);

try{
  const a=db.prepare("SELECT id FROM users WHERE email=?").get("admin@gcaforce.local");
  if(!a) db.prepare("INSERT INTO users(email,password,role,expires_at) VALUES(?,?,?,?)")
    .run("admin@gcaforce.local",bcrypt.hashSync("ChangeMe123!",10),"admin","2099-12-31");
  const u=db.prepare("SELECT id FROM users WHERE email=?").get("demo@gcaforce.local");
  if(!u) db.prepare("INSERT INTO users(email,password,role,expires_at) VALUES(?,?,?,?)")
    .run("demo@gcaforce.local",bcrypt.hashSync("Demo123!",10),"user","2099-12-31");
  const c=db.prepare("SELECT id FROM activation_codes WHERE code=?").get("GCA-DEMO-2026");
  if(!c) db.prepare("INSERT INTO activation_codes(code,expires_at) VALUES(?,?)").run("GCA-DEMO-2026","2099-12-31");
  if(!db.prepare("SELECT id FROM dns_servers LIMIT 1").get())
    db.prepare("INSERT INTO dns_servers(name,base_url,priority) VALUES(?,?,?)").run("DNS 1","https://example-authorized-server.invalid",1);
}catch(e){console.error(e)}

function auth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    const token=h.startsWith("Bearer ")?h.slice(7):"";
    req.user=jwt.verify(token,JWT_SECRET); next();
  }catch(e){res.status(401).json({error:"unauthorized"});}
}
function admin(req,res,next){if(req.user.role!=="admin") return res.status(403).json({error:"admin_only"});next();}

app.get("/health",(req,res)=>res.json({ok:true,service:"GCA FORCE-IPTV PRO"}));

app.post("/api/login",(req,res)=>{
  const {email,password}=req.body||{}, u=db.prepare("SELECT * FROM users WHERE email=? AND active=1").get(email);
  if(!u||!bcrypt.compareSync(password||"",u.password)) return res.status(401).json({error:"invalid_credentials"});
  const token=jwt.sign({id:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:"30d"});
  res.json({token,user:{id:u.id,email:u.email,role:u.role,expiresAt:u.expires_at}});
});

app.post("/api/activate",auth,(req,res)=>{
  const {code,deviceId,deviceName,platform}=req.body||{};
  const c=db.prepare("SELECT * FROM activation_codes WHERE code=? AND used=0").get(code);
  if(!c) return res.status(400).json({error:"invalid_or_used_code"});
  db.prepare("UPDATE activation_codes SET used=1 WHERE id=?").run(c.id);
  db.prepare("UPDATE users SET expires_at=? WHERE id=?").run(c.expires_at,req.user.id);
  db.prepare("INSERT OR IGNORE INTO devices(user_id,device_id,device_name,platform,created_at) VALUES(?,?,?,?,?)")
    .run(req.user.id,deviceId,deviceName,platform,new Date().toISOString());
  res.json({ok:true,expiresAt:c.expires_at});
});

app.get("/api/dns",auth,(req,res)=>{
  const rows=db.prepare("SELECT id,name,base_url,priority,active FROM dns_servers WHERE active=1 ORDER BY priority").all();
  res.json({servers:rows});
});

app.post("/api/devices/register",auth,(req,res)=>{
  const {deviceId,deviceName,platform}=req.body||{};
  if(!deviceId) return res.status(400).json({error:"device_id_required"});
  const count=db.prepare("SELECT COUNT(*) n FROM devices WHERE user_id=?").get(req.user.id).n;
  const exists=db.prepare("SELECT id FROM devices WHERE user_id=? AND device_id=?").get(req.user.id,deviceId);
  if(!exists && count>=5) return res.status(409).json({error:"device_limit_reached",limit:5});
  db.prepare("INSERT OR IGNORE INTO devices(user_id,device_id,device_name,platform,created_at) VALUES(?,?,?,?,?)")
    .run(req.user.id,deviceId,deviceName,platform,new Date().toISOString());
  res.json({ok:true});
});

app.get("/api/devices",auth,(req,res)=>{
  res.json({devices:db.prepare("SELECT id,device_id,device_name,platform,created_at FROM devices WHERE user_id=? ORDER BY id DESC").all(req.user.id)});
});

app.get("/api/admin/overview",auth,admin,(req,res)=>{
  res.json({
    users:db.prepare("SELECT COUNT(*) n FROM users WHERE role='user'").get().n,
    devices:db.prepare("SELECT COUNT(*) n FROM devices").get().n,
    codes:db.prepare("SELECT COUNT(*) n FROM activation_codes WHERE used=0").get().n,
    dns:db.prepare("SELECT COUNT(*) n FROM dns_servers WHERE active=1").get().n
  });
});
app.get("/api/admin/users",auth,admin,(req,res)=>res.json({users:db.prepare("SELECT id,email,role,active,expires_at FROM users ORDER BY id DESC").all()}));
app.get("/api/admin/dns",auth,admin,(req,res)=>res.json({servers:db.prepare("SELECT * FROM dns_servers ORDER BY priority").all()}));
app.post("/api/admin/dns",auth,admin,(req,res)=>{
  const {name,baseUrl,priority=100}=req.body||{};
  if(!name||!baseUrl) return res.status(400).json({error:"name_and_base_url_required"});
  const info=db.prepare("INSERT INTO dns_servers(name,base_url,priority) VALUES(?,?,?)").run(name,baseUrl,priority);
  res.json({id:info.lastInsertRowid});
});
app.post("/api/admin/codes",auth,admin,(req,res)=>{
  const {code,expiresAt}=req.body||{};
  if(!code) return res.status(400).json({error:"code_required"});
  db.prepare("INSERT INTO activation_codes(code,expires_at) VALUES(?,?)").run(code,expiresAt||"2099-12-31");
  res.json({ok:true});
});

app.listen(PORT,()=>console.log(`GCA FORCE-IPTV PRO API listening on ${PORT}`));
