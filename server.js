const express=require('express'),Database=require('better-sqlite3'),crypto=require('crypto'),path=require('path');
const db=new Database(path.join(__dirname,'restoran.db'));db.pragma('journal_mode=WAL');
db.exec(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT DEFAULT '',price INTEGER NOT NULL,image TEXT DEFAULT '',category_id INTEGER,available INTEGER DEFAULT 1,extra INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT,type TEXT,address TEXT,note TEXT,delivery INTEGER,subtotal INTEGER,total INTEGER,status TEXT DEFAULT 'Yangi',items TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY,username TEXT,salt TEXT,hash TEXT);`);
const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
if(!db.prepare('SELECT 1 FROM admin').get()){const s=crypto.randomBytes(16).toString('hex');db.prepare('INSERT INTO admin VALUES(1,?,?,?)').run('admin',s,hash('admin123',s));}
if(!db.prepare('SELECT 1 FROM settings').get()){const st=db.prepare('INSERT INTO settings VALUES(?,?)');
Object.entries({name:'Lazzat Restoran',phone:'+998 90 123 45 67',address:'Toshkent, Amir Temur ko\'chasi 10',hours:'10:00 - 23:00',delivery:'15000',min:'30000',about:'Eng mazali taomlar, tez yetkazib berish va samimiy xizmat.'}).forEach(e=>st.run(...e));}
if(!db.prepare('SELECT 1 FROM categories').get()){
const U=id=>`https://images.unsplash.com/${id}?w=600&q=70`,c=db.prepare('INSERT INTO categories(name) VALUES(?)'),i=db.prepare('INSERT INTO items(name,description,price,image,category_id,available,extra) VALUES(?,?,?,?,?,?,?)');
const k={};['Burger','Pizza','Osh','Fast food','Salatlar','Ichimliklar','Shirinliklar'].forEach(n=>k[n]=c.run(n).lastInsertRowid);
[['Cheeseburger','Mol go\'shti, pishloq, yangi sabzavotlar',38000,'photo-1568901346375-23c9450c58cd','Burger',1,0],
['Margarita','Mozzarella va pomidor sousi',65000,'photo-1513104890138-7c749659a591','Pizza',1,0],
['Toshkent oshi','An\'anaviy devzira guruchli osh',45000,'photo-1633945274405-b6c8069047b0','Osh',1,0],
['Kartoshka fri','Qarsildoq kartoshka',15000,'photo-1573080496219-bb080dd4f877','Fast food',1,1],
['Sezar salati','Tovuq, parmezan, kruton',32000,'photo-1512621776951-a57141f2eefd','Salatlar',1,1],
['Coca-Cola 0.5L','Sovuq ichimlik',9000,'photo-1622483767028-3f66f32aef97','Ichimliklar',1,1],
['Cheesecake','Nozik shirinlik',28000,'photo-1578985545062-69928b1d9587','Shirinliklar',0,1]].forEach(x=>i.run(x[0],x[1],x[2],U(x[3]),k[x[4]],x[5],x[6]));}
if(!db.prepare('SELECT 1 FROM orders').get())db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('orders',1023)").run();
const S=()=>Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r=>[r.key,r.value]));
const sess=new Map(),err=(r,m,c=400)=>r.status(c).json({error:m});
const auth=(q,r,n)=>{const e=sess.get((q.headers.authorization||'').slice(7));if(!e||e<Date.now())return err(r,'Ruxsat yo\'q',401);n();};
const app=express();app.use(express.json({limit:'6mb'}));app.use(express.static(path.join(__dirname,'public')));
app.get('/api/public',(q,r)=>r.json({settings:S(),categories:db.prepare('SELECT * FROM categories ORDER BY id').all(),items:db.prepare('SELECT * FROM items ORDER BY id').all()}));
app.post('/api/orders',(q,r)=>{const b=q.body||{},st=S();let ph=String(b.phone||'').replace(/\D/g,'');if(ph.length===9)ph='998'+ph;
if(!/^998\d{9}$/.test(ph))return err(r,'Telefon raqami noto\'g\'ri');
const type=b.type==='delivery'?'delivery':'pickup',addr=String(b.address||'').trim();if(type==='delivery'&&!addr)return err(r,'Manzil kiriting');
if(!Array.isArray(b.items)||!b.items.length)return err(r,'Savat bo\'sh');
const get=db.prepare('SELECT * FROM items WHERE id=?'),lines=[];let sub=0;
for(const x of b.items){const it=get.get(+x.id),n=parseInt(x.qty);if(!it||!it.available||!(n>0&&n<100))return err(r,'Mahsulot mavjud emas: '+(it?it.name:x.id));lines.push({id:it.id,name:it.name,price:it.price,qty:n});sub+=it.price*n;}
if(sub<+st.min)return err(r,'Minimal buyurtma summasi: '+st.min+' so\'m');
const dl=type==='delivery'?+st.delivery:0,id=db.prepare('INSERT INTO orders(phone,type,address,note,delivery,subtotal,total,items,created) VALUES(?,?,?,?,?,?,?,?,?)').run('+'+ph,type,addr.slice(0,300),String(b.note||'').slice(0,500),dl,sub,sub+dl,JSON.stringify(lines),new Date().toLocaleString('sv')).lastInsertRowid;
r.json({id,total:sub+dl});});
app.post('/api/admin/login',(q,r)=>{const a=db.prepare('SELECT * FROM admin WHERE id=1').get(),b=q.body||{};
const ok=b.username===a.username&&crypto.timingSafeEqual(Buffer.from(hash(String(b.password||''),a.salt)),Buffer.from(a.hash));
if(!ok)return setTimeout(()=>err(r,'Login yoki parol xato',401),600);
const t=crypto.randomBytes(32).toString('hex');sess.set(t,Date.now()+8*3600e3);r.json({token:t});});
const A=express.Router();A.use(auth);app.use('/api/admin',A);
const P=o=>({...o,items:JSON.parse(o.items)});
A.get('/orders',(q,r)=>r.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all().map(P)));
A.put('/orders/:id/status',(q,r)=>{if(!['Yangi','Tayyorlanmoqda','Yetkazilmoqda','Yetkazildi','Bekor qilindi'].includes(q.body.status))return err(r,'Status xato');db.prepare('UPDATE orders SET status=? WHERE id=?').run(q.body.status,q.params.id);r.json({ok:1});});
A.get('/stats',(q,r)=>{const o=db.prepare('SELECT * FROM orders WHERE created LIKE ?').all(new Date().toLocaleString('sv').slice(0,10)+'%').map(P),v=o.filter(x=>x.status!=='Bekor qilindi');
r.json({orders:o.length,revenue:v.reduce((s,x)=>s+x.total,0),sold:v.reduce((s,x)=>s+x.items.reduce((a,i)=>a+i.qty,0),0),customers:new Set(o.map(x=>x.phone)).size,newOrders:db.prepare("SELECT COUNT(*) c FROM orders WHERE status='Yangi'").get().c});});
const ib=b=>[String(b.name||'').trim(),String(b.description||''),Math.max(0,parseInt(b.price)||0),String(b.image||''),b.category_id?+b.category_id:null,b.available?1:0,b.extra?1:0];
A.post('/items',(q,r)=>{const v=ib(q.body);if(!v[0])return err(r,'Nom kerak');r.json({id:db.prepare('INSERT INTO items(name,description,price,image,category_id,available,extra) VALUES(?,?,?,?,?,?,?)').run(...v).lastInsertRowid});});
A.put('/items/:id',(q,r)=>{const v=ib(q.body);if(!v[0])return err(r,'Nom kerak');db.prepare('UPDATE items SET name=?,description=?,price=?,image=?,category_id=?,available=?,extra=? WHERE id=?').run(...v,q.params.id);r.json({ok:1});});
A.delete('/items/:id',(q,r)=>{db.prepare('DELETE FROM items WHERE id=?').run(q.params.id);r.json({ok:1});});
A.post('/categories',(q,r)=>{const n=String(q.body.name||'').trim();if(!n)return err(r,'Nom kerak');r.json({id:db.prepare('INSERT INTO categories(name) VALUES(?)').run(n).lastInsertRowid});});
A.put('/categories/:id',(q,r)=>{const n=String(q.body.name||'').trim();if(!n)return err(r,'Nom kerak');db.prepare('UPDATE categories SET name=? WHERE id=?').run(n,q.params.id);r.json({ok:1});});
A.delete('/categories/:id',(q,r)=>{db.prepare('UPDATE items SET category_id=NULL WHERE category_id=?').run(q.params.id);db.prepare('DELETE FROM categories WHERE id=?').run(q.params.id);r.json({ok:1});});
A.put('/settings',(q,r)=>{const u=db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)');for(const k of ['name','phone','address','hours','delivery','min','about'])if(q.body[k]!==undefined)u.run(k,String(q.body[k]));
if(q.body.password){if(q.body.password.length<6)return err(r,'Parol kamida 6 belgi');const s=crypto.randomBytes(16).toString('hex');db.prepare('UPDATE admin SET salt=?,hash=? WHERE id=1').run(s,hash(q.body.password,s));}r.json({ok:1});});
app.listen(3000,()=>console.log('Sayt: http://localhost:3000   Admin: http://localhost:3000/admin.html'));
