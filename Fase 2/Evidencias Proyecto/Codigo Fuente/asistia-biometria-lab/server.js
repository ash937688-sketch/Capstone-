import { createLocalProvider } from './localBiometricProvider.js';
import { crearDesafio, consumirDesafio } from './desafioFacial.js';
import { comprobarMovimiento } from './pruebaMovimiento.js';

import http from 'node:http';
import https from 'node:https';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, createHash, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createMailDelivery } from './mail.js';
import { createRosterHandler } from './roster.js';
import { normalizeJpeg } from './imageValidation.js';
import { createBiometricEnrollment } from './biometricEnrollment.js';
import { compararRostro } from './comparacionFacial.js';
import { createEnrollmentNotifications } from './enrollmentNotifications.js';
import { createEnrollmentEmailVerification } from './enrollmentEmailVerification.js';

const hash = x => createHash('sha256').update(x).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function createLab(options = {}) {
  const dir = options.dataDir || fileURLToPath(new URL('./data/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const keyPath = resolve(dir, 'encryption.key');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
  const key = readFileSync(keyPath);
  const secretPath = resolve(dir, 'admin.key');
  if (!existsSync(secretPath)) writeFileSync(secretPath, token(), { mode: 0o600 });
  const adminKey = options.adminKey || readFileSync(secretPath, 'utf8').trim();
  const origin = options.origin || process.env.PUBLIC_ORIGIN || 'http://localhost:5180';
  const mailDelivery = options.mailDelivery || createMailDelivery(process.env,undefined,email=>!!db.prepare('SELECT email FROM invitation_recipient_authorizations WHERE email=? AND created>?').get(email,Date.now()-7*86400000));
  const adminEmail = String(options.adminEmail || process.env.LAB_ADMIN_EMAIL || '').trim().toLowerCase();
  const clockNow = options.now || Date.now;
  let adminChallenge = null;
  let adminMailLimit = { count: 0, until: 0, last: 0 };
  const db = new DatabaseSync(resolve(dir, 'lab.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, token_hash TEXT UNIQUE, expires INTEGER, state TEXT DEFAULT 'pending', verified INTEGER DEFAULT 0, evidence TEXT, consent TEXT, image TEXT, created INTEGER);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, invite_id TEXT, kind TEXT, detail TEXT, created INTEGER, dedupe TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS participant_drafts(id TEXT PRIMARY KEY, name TEXT NOT NULL, alias TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS enrolment_roster(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,course TEXT,adult INTEGER,created INTEGER,last_invite TEXT,delivery TEXT);
    CREATE TABLE IF NOT EXISTS invitation_recipient_authorizations(email TEXT PRIMARY KEY,created INTEGER NOT NULL);`);
  if (!db.prepare('PRAGMA table_info(participant_drafts)').all().some(column => column.name === 'email')) {
    db.exec('ALTER TABLE participant_drafts ADD COLUMN email TEXT');
  }
  if (!db.prepare('PRAGMA table_info(invites)').all().some(column => column.name === 'code_hash')) {
    db.exec('ALTER TABLE invites ADD COLUMN code_hash TEXT');
  }
  if (!db.prepare('PRAGMA table_info(invites)').all().some(column => column.name === 'photo_review')) {
    db.exec('ALTER TABLE invites ADD COLUMN photo_review TEXT');
  }
  if (!db.prepare('PRAGMA table_info(invites)').all().some(column => column.name === 'photo_deleted_at')) db.exec('ALTER TABLE invites ADD COLUMN photo_deleted_at INTEGER');
  db.exec('PRAGMA secure_delete=ON');
  const codeAttempts = new Map();
  const sessions = new Map(), attempts = new Map();
  const emailVerification=createEnrollmentEmailVerification({db,mail:mailDelivery,now:clockNow});
  const requireVerifiedEmail=options.requireVerifiedEmail??process.env.LAB_EMAIL_VERIFICATION==='yes';
  const purge = () => {
    const cutoff = Date.now() - 7 * 86400000;
    db.prepare('DELETE FROM events WHERE created < ? OR invite_id IN (SELECT id FROM invites WHERE created < ?)').run(cutoff, cutoff);
    const removed=db.prepare('DELETE FROM invites WHERE created < ?').run(cutoff).changes;
    db.prepare('DELETE FROM participant_drafts WHERE created < ?').run(cutoff);
    db.prepare('DELETE FROM enrolment_roster WHERE created < ?').run(cutoff);
    db.prepare('DELETE FROM invitation_recipient_authorizations WHERE created < ?').run(cutoff);
    emailVerification.purge();
    if(removed)db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  };
  purge();
  const retentionTimer = setInterval(purge, 60000);
  retentionTimer.unref();
  const event = (id, kind, detail, dedupe = null) => db.prepare('INSERT OR IGNORE INTO events(invite_id,kind,detail,created,dedupe) VALUES(?,?,?,?,?)').run(id, kind, detail, Date.now(), dedupe);
  async function issueInvitation({name,email,sendEmail}) {
    if(db.prepare("SELECT id FROM enrolment_roster WHERE email=? AND age_status IN ('minor','legacy_unconfirmed')").get(String(email).toLowerCase()))fail(403,'Este contacto está registrado como menor o tiene información antigua de edad que requiere revisión.');
    const raw=token(),id=token(),expires=Date.now()+86400000;
    const accessCode=String(randomInt(100000000)).padStart(8,'0');
    db.prepare('INSERT INTO invites(id,name,email,token_hash,code_hash,expires,created) VALUES(?,?,?,?,?,?,?)').run(id,name.trim(),email.toLowerCase(),hash(raw),hash(accessCode),expires,Date.now());
    event(id,'invitation_created','Invitación creada; correo todavía no enviado');
    let delivery='Borrador local: no se ha enviado correo.',emailAccepted=false;
    if(sendEmail===true){
      try{await mailDelivery.send({email,link:`${origin}/enrolar#${raw}`,accessCode,expires});emailAccepted=true;delivery='Correo aceptado por Gmail; recepción pendiente de confirmar.';event(id,'invitation_email_accepted',delivery);}
      catch{delivery='Envío no confirmado. No se reintenta automáticamente.';event(id,'invitation_email_failed',delivery);}
    }
    return {id,link:`${origin}/enrolar#${raw}`,accessCode,expires,delivery,emailAccepted};
  }
  const handleRoster=createRosterHandler({db,issueInvitation,event,canInvite:mailDelivery.canInvite||(()=>true),mailConfigured:!!mailDelivery.configured});
  function checkCode(row, code) {
    if (!row?.code_hash) fail(410, 'Invitación anterior reemplazada. Usa el nuevo enlace y código.');
    const now = Date.now();
    let attempt = codeAttempts.get(row.id);
    if (!attempt || attempt.until <= now) { attempt = { count: 0, until: now + 15 * 60000 }; codeAttempts.set(row.id, attempt); }
    if (attempt.count >= 8) fail(429, 'Demasiados códigos incorrectos. Espera 15 minutos.');
    const supplied = Buffer.from(hash(String(code || ''))), expected = Buffer.from(row.code_hash);
    if (!timingSafeEqual(supplied, expected)) { attempt.count++; fail(401, 'Introduce el código privado de 8 dígitos que acompaña tu invitación.'); }
  }
  function live(raw, code) {
    const row = db.prepare('SELECT * FROM invites WHERE token_hash=?').get(hash(raw || ''));
    if (!row || row.expires < Date.now() || row.state !== 'pending') fail(410, 'Invitación vencida, utilizada o revocada.');
    checkCode(row, code);
    if(db.prepare("SELECT id FROM enrolment_roster WHERE email=? AND age_status IN ('minor','legacy_unconfirmed')").get(row.email))fail(403,'Este contacto está registrado como menor o requiere revisar información de edad anterior. No se admite su fotografía.');
    return row;
  }
  function encrypt(data) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    return JSON.stringify({ iv: iv.toString('base64'), tag: (() => { const out = Buffer.concat([cipher.update(data), cipher.final()]); return { data: out.toString('base64'), auth: cipher.getAuthTag().toString('base64') }; })() });
  }
  function decrypt(serialized) {
    const encrypted = JSON.parse(serialized);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(encrypted.tag.auth, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted.tag.data, 'base64')), decipher.final()]);
  }
  let biometric;
  const notifications = createEnrollmentNotifications({ db, mailDelivery, isCurrent: row => {
    if (row.kind === 'photo_approved') return !!db.prepare("SELECT id FROM invites WHERE id=? AND email=? AND state IN ('approved','approved_no_photo')").get(row.invite_id,row.email);
    const record=biometric?.byId(row.id.replace(/^enrolled:/,''));
    return record?.state==='active' && record.email===row.email && record.expires>Date.now();
  }});
  biometric = createBiometricEnrollment({ db, encrypt, decrypt, isRegisteredParticipant:email=>{const row=db.prepare('SELECT age_status FROM enrolment_roster WHERE email=?').get(String(email).toLowerCase());return row?!['minor','legacy_unconfirmed'].includes(row.age_status):null;},registeredParticipantsAllowed:true,...options.biometric, onEnrolled: record => notifications.enqueue({id:'enrolled:'+record.id,inviteId:record.inviteId,email:record.email,kind:'enrolled'}) });
  let maintenanceRunning = false;
  async function maintainBiometrics() {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try { await biometric.maintenance(); await notifications.drain(); } catch { /* Durable jobs survive a restart. */ }
    finally { maintenanceRunning = false; }
  }
  const biometricTimer = setInterval(maintainBiometrics, 60000);
  biometricTimer.unref();
  async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, origin), path = url.pathname;
      if (!path.startsWith('/api/')) {
        const files = { '/': ['index.html','text/html'], '/enrolar': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'] };
        const file = files[path]; if (!file) fail(404, 'Ruta inexistente.');
        res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' }); return res.end(readFileSync(new URL('./public/' + file[0], import.meta.url)));
      }
      let body = {};
      if (req.method !== 'GET') {
const requestOrigin = req.headers.origin;
const allowedOrigins = new Set([
  origin,
  'http://localhost:5180',
  'http://127.0.0.1:5180'
]);

if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
  fail(403, 'Origen no permitido.');
}        if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Se requiere JSON.');
        let raw = '', size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 3_000_000) fail(413, 'Imagen demasiado grande. Máximo 2 MB.'); raw += chunk; }
        try { body = JSON.parse(raw || '{}'); } catch { fail(400, 'JSON inválido.'); }
      }
      if (path === '/api/info' && req.method === 'GET') return send(200, { controller: process.env.LAB_CONTROLLER || 'Pendiente de designación', contact: process.env.LAB_CONTACT || 'Pendiente de configurar', transport: process.env.LAB_TRANSPORT || 'Acceso local; sin túnel externo configurado.', retention: '7 días desde la creación; purga al iniciar y cada minuto mientras el servidor esté activo.', policy: 'lab-v3', recognition: false, pad: false, delivery: 'Borrador local; correo no enviado' });
      // Retención limitada: elimina también fotografías y autorizaciones asociadas.
      purge();
      if(path.startsWith('/api/email-verification/')&&req.method==='POST'){
        const row=live(body.token,body.code);
        if(path==='/api/email-verification/request')return send(200,await emailVerification.send(row));
        if(path==='/api/email-verification/confirm'){
          const result=emailVerification.confirm(row,body.verificationCode);
          event(row.id,'email_verified','Control del correo destinatario confirmado mediante código de un solo uso.');
          return send(200,result);
        }
      }
      // Public biometric actions require the same private invitation AND its code.
      if (path.startsWith('/api/biometric/') && req.method === 'POST') {
        const tokenHash = hash(body.token || '');
        const invite = db.prepare('SELECT * FROM invites WHERE token_hash=?').get(tokenHash);
        const persistent = biometric.credential(tokenHash);
        if (!invite && !persistent) fail(410, 'Registro no disponible.');
        checkCode(invite || persistent, body.code);
        if (path === '/api/biometric/status') return send(200, { enrollment: biometric.summary(persistent), offer: biometric.migrationOffer(), eligible: biometric.eligible(invite), consent: biometric.consentCopy(persistent) });
        if (path === '/api/biometric/authorize') {
          if (!invite) fail(409, 'Hace falta una nueva captura con su autorización.');
          const automatic=String(body.policy||'').startsWith('bio-migrate-v1-');
          if(automatic&&invite.expires<Date.now())fail(410,'El enlace de actualización venció. Solicita uno vigente; la foto conserva su plazo original.');
          let enrollment = biometric.authorize(invite, body),automaticError=null;
          event(invite.id, 'biometric_authorized', 'Nueva autorización expresa para plantilla; pendiente de conversión real.');
          if(automatic)try{enrollment=await biometric.enroll(enrollment.id);}catch(error){automaticError=error.message;enrollment=biometric.summary(biometric.byId(enrollment.id));}
          await notifications.drain();
          return send(201, { enrollment,automaticError,notificationStatus:notifications.state('enrolled:'+enrollment.id) });
        }
        if (path === '/api/biometric/withdraw') {
          if (!persistent) fail(404, 'No hay una solicitud biométrica.');
          biometric.revoke(persistent);
          await maintainBiometrics();
          return send(200, { enrollment: biometric.summary(biometric.byId(persistent.id)) });
        }
        fail(404, 'Operación biométrica inexistente.');
      }
      if (path === '/api/login/request-code' && req.method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const time = clockNow();
        if (adminMailLimit.until <= time) adminMailLimit = { count: 0, until: time + 15 * 60000, last: 0 };
        if (adminMailLimit.count >= 3 || (adminMailLimit.count && time - adminMailLimit.last < 60000)) fail(429, 'Espera antes de pedir otro código. Máximo 3 solicitudes cada 15 minutos.');
        adminMailLimit.count++; adminMailLimit.last = time;
        if (adminEmail && email === adminEmail) {
          if (!mailDelivery.configured) fail(503, 'El servicio de correo no está disponible.');
          const code = String(randomInt(100000000)).padStart(8, '0');
          const challenge = { hash: hash(code), email, expires: time + 10 * 60000, failures: 0 };
          adminChallenge = challenge;
          try { await mailDelivery.sendAdminCode({ email, code }); }
catch (error) { console.error('Error al enviar código administrativo:', error.message); if (adminChallenge === challenge) adminChallenge = null; fail(503, 'No se pudo confirmar el envío del código. Intenta más tarde.'); }        }
        return send(200, { message: 'Si tu correo tiene acceso de administración, recibirás un código. Revisa también Correo no deseado. Vence en 10 minutos.' });
      }
      if (path === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, now = Date.now();
        const limit = attempts.get(ip) || { count: 0, until: now + 60000 };
        if (limit.until < now) { limit.count = 0; limit.until = now + 60000; }
        limit.count++; attempts.set(ip, limit); if (limit.count > 10) fail(429, 'Espera un minuto antes de volver a intentar.');
        if (body.email !== undefined || body.code !== undefined) {
          const challenge = adminChallenge;
          if (!challenge || challenge.expires <= clockNow() || challenge.failures >= 5) fail(401, 'Código incorrecto, utilizado o vencido. Solicita uno nuevo.');
          if (String(body.email || '').trim().toLowerCase() !== challenge.email || !timingSafeEqual(Buffer.from(hash(String(body.code || ''))), Buffer.from(challenge.hash))) {
            challenge.failures++; fail(401, 'Código incorrecto. Revisa el último correo de acceso al panel.');
          }
          adminChallenge = null;
        } else {
          const a = Buffer.from(hash(String(body.key || ''))), b = Buffer.from(hash(adminKey));
          if (!timingSafeEqual(a, b)) fail(401, 'Clave incorrecta.');
        }
        const sid = token(); sessions.set(hash(sid), now + 3600000);
        res.setHeader('Set-Cookie', `lab_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${origin.startsWith('https:') ? '; Secure' : ''}`);
        return send(200, { ok: true });
      }
      if (path === '/api/internal/recognize' && req.method === 'POST') {
        const expected = String(process.env.ASISTIA_BIOMETRIA_SHARED_SECRET || '');
        const supplied = String(req.headers['x-asistia-internal-token'] || '');

        if (expected.length < 32 || supplied.length !== expected.length ||
            !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
          fail(401, 'Comunicacion interna no autorizada.');
        }

        const email = String(body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          fail(400, 'Correo del alumno invalido.');
        }

        if (body.operacion === 'crearDesafio') {
          const enrolamiento = biometric.obtenerReferenciaActivaPorCorreo(email);
          if (!enrolamiento) {
            fail(404, 'No existe un enrolamiento facial activo y unico.');
          }

          return send(200, {
            ok: true,
            desafio: crearDesafio(email)
          });
        }

        if (body.operacion === 'comprobarMovimiento') {
          const enrolamiento = biometric.obtenerReferenciaActivaPorCorreo(email);
          if (!enrolamiento) {
            fail(404, 'No existe un enrolamiento facial activo y unico.');
          }

          const desafio = consumirDesafio(body.desafioId, email);

          const decodificar = async imagen => {
            if (typeof imagen !== 'string' ||
                !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imagen)) {
              fail(400, 'Captura JPEG invalida.');
            }

            const bytes = Buffer.from(imagen.split(',')[1], 'base64');

            if (bytes.length < 1000 || bytes.length > 2000000 ||
                bytes[0] !== 255 || bytes[1] !== 216 ||
                bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
              fail(400, 'Captura fuera de formato.');
            }

            return (await normalizeJpeg(bytes)).bytes;
          };

          const inicial = await decodificar(body.imagenInicial);
          const final = await decodificar(body.imagenFinal);

          const resultado = await comprobarMovimiento(
            inicial,
            final,
            enrolamiento.reference,
            desafio.direccion
          );

          return send(200, {
            ok: true,
            ...resultado,
            identidadVerificada: false,
            pruebaDeVidaValidada: false,
            asistenciaAutorizada: false
          });
        }

if (typeof body.image !== 'string' ||
            !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image)) {
          fail(400, 'Se requiere una imagen JPEG valida.');
        }

        const data = Buffer.from(body.image.split(',')[1], 'base64');

        if (data.length < 1000 || data.length > 2000000 ||
            data[0] !== 255 || data[1] !== 216 ||
            data.at(-2) !== 255 || data.at(-1) !== 217) {
          fail(400, 'Imagen JPEG invalida.');
        }

        const enrolamiento = biometric.obtenerReferenciaActivaPorCorreo(email);

        if (!enrolamiento) {
          fail(404, 'No existe un enrolamiento facial activo y unico para este alumno.');
        }

        const normalized = await normalizeJpeg(data);
        // ASISTIA_PASO309
        const proveedorPasivo = createLocalProvider();
        const vidaPasiva = await proveedorPasivo.liveness(normalized.bytes);

        const resultado = await compararRostro(normalized.bytes, enrolamiento.reference);

        event(null, 'facial_comparison', 'Comparacion biometrica ejecutada; asistencia no autorizada.');

        return send(200, {
          ok: true,
          comparacionRealizada: true,
          modelo: resultado.modelo,
          similitud: resultado.similitud,
          umbral: resultado.umbral,
          coincidenciaFacial: resultado.coincidenciaFacial === true,
          pruebaDeVidaEvaluada: vidaPasiva.evaluada,
          pruebaDeVidaCandidata: vidaPasiva.candidata,
          modeloPruebaDeVida: vidaPasiva.modelo,
          identidadVerificada: false,
          pruebaDeVidaValidada: false,
          asistenciaAutorizada: false
        });
      }
      if (path.startsWith('/api/admin/') || path === '/api/recognize') {
        const sid = /(?:^|;\s*)lab_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
        if (!sid || !(sessions.get(hash(sid)) > Date.now())) fail(401, 'Inicia sesión como administradora.');
        if (path === '/api/admin/biometric/state' && req.method === 'GET') return send(200, { ...biometric.readiness(), enrollments: biometric.list() });
        if(path==='/api/admin/biometric/complete'&&req.method==='POST'){
          const row=db.prepare('SELECT * FROM invites WHERE id=?').get(body.id);
          const authorization=biometric.authorizeFromCapture(row);
          if(!authorization)fail(409,'Esta foto no tiene el consentimiento completo. No se amplía la autorización anterior.');
          const enrollment=authorization.templateReady?authorization:await biometric.enroll(authorization.id);
          await notifications.drain();
          return send(200,{enrollment,notificationStatus:notifications.state('enrolled:'+enrollment.id)});
        }
        if (path === '/api/admin/biometric/consent-invitation' && req.method === 'POST') {
          if (body.confirmed !== true) fail(400, 'Confirma el envío de la autorización.');
          const row = db.prepare('SELECT * FROM invites WHERE id=?').get(body.id);
          if(row?.consent&&JSON.parse(row.consent).captureIncludesRecognition)fail(409,'Esta persona ya aceptó el consentimiento completo. No necesita otro correo ni otro código.');
          if (!biometric.eligible(row)) fail(409, 'No hay una foto aprobada habilitada para esta primera prueba, o ya existe una autorización biométrica.');
          const recent = db.prepare("SELECT COUNT(*) AS n FROM events WHERE invite_id=? AND kind='biometric_invitation_attempt' AND created>?").get(row.id, Date.now()-86400000);
          if (recent.n >= 3) fail(429, 'Máximo tres envíos por registro al día. Revisa el último correo recibido.');
          if (!mailDelivery.configured || typeof mailDelivery.sendConsent !== 'function') fail(503, 'El envío de autorizaciones no está configurado.');
          const raw = token(), accessCode = String(randomInt(100000000)).padStart(8,'0');
          const expires = Math.min(Date.now()+86400000, row.created+7*86400000);
          db.prepare('UPDATE invites SET token_hash=?,code_hash=?,expires=? WHERE id=?').run(hash(raw),hash(accessCode),expires,row.id);
          event(row.id,'biometric_invitation_attempt','Enlace renovado para autorización local; no amplía la conservación de la foto.');
          try { await mailDelivery.sendConsent({email:row.email,link:`${origin}/enrolar#${raw}`,accessCode,expires,local:biometric.readiness().local}); }
          catch { fail(503,'No se confirmó el envío. No se reintentó automáticamente ni se creó una plantilla.'); }
          return send(200,{message:'Correo de autorización aceptado por Gmail; revisa la bandeja de la participante. El enlace anterior fue reemplazado. La foto mantiene su plazo original.'});
        }
        if (path === '/api/admin/biometric/enroll' && req.method === 'POST') {
          const enrollment = await biometric.enroll(body.id);
          await notifications.drain();
          event(enrollment.inviteId, 'biometric_converted', enrollment.photoRetained ? 'Plantilla creada; foto conservada temporalmente para validación, sin ampliar plazo. Tótem deshabilitado.' : 'Creación de plantilla confirmada; sin foto de respaldo. Tótem aún deshabilitado.');
          return send(200, { enrollment, notificationStatus:notifications.state('enrolled:'+enrollment.id) });
        }
        if (path === '/api/admin/biometric/revoke' && req.method === 'POST') {
          if (body.confirmed !== true) fail(400, 'Confirma la retirada de la plantilla.');
          const row = biometric.byId(body.id);
          if (!row) fail(404, 'Solicitud biométrica inexistente.');
          biometric.revoke(row); await maintainBiometrics();
          return send(200, { enrollment: biometric.summary(biometric.byId(row.id)) });
        }
        if(path.startsWith('/api/admin/roster')){
          try{const result=await handleRoster(path,req.method,body);if(result)return send(200,result);}
          catch(error){fail(error.status||400,error.message);}
        }
        if (path === '/api/admin/participants' && req.method === 'GET') return send(200, { participants: db.prepare('SELECT id,name,alias,email,created FROM participant_drafts ORDER BY created,id').all() });
        if (path === '/api/admin/state' && req.method === 'GET') return send(200, { invites: db.prepare('SELECT id,name,email,expires,state,verified,evidence,consent,created,photo_review,photo_deleted_at,email_verified_at,image IS NOT NULL AS hasImage FROM invites ORDER BY created DESC').all().map(r => ({ ...r, state: r.state === 'pending' && r.expires < Date.now() ? 'expired' : r.state })), events: db.prepare('SELECT * FROM events ORDER BY created DESC LIMIT 200').all() });
        if(path==='/api/admin/photo-delete'&&req.method==='POST'){
          if(body.confirmed!==true)fail(400,'Confirma la eliminación de la foto.');
          const row=db.prepare('SELECT * FROM invites WHERE id=?').get(body.id);
          if(!row?.image)fail(404,'No hay una foto almacenada en este registro.');
          if(row.state==='review')fail(409,'Primero completa la revisión o rechaza la foto.');
          db.prepare("UPDATE invites SET image=NULL,photo_deleted_at=?,state=CASE WHEN state='approved' THEN 'approved_no_photo' ELSE state END WHERE id=?").run(Date.now(),row.id);
          event(row.id,'photo_deleted','Foto eliminada por administración; revisión y cualquier plantilla asociada mantienen su propio ciclo.');
          const template=biometric.summary(biometric.byInvite(row.id));
          db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');return send(200,{ok:true,recognitionEnabled:false,message:template?.templateReady?'Foto eliminada. La plantilla cifrada se conserva con su plazo; el reconocimiento sigue pendiente de validación.':'Foto eliminada. Se conserva la revisión; sin una plantilla válida no se podrá reconocer el rostro.'});
        }
        if (path === '/api/admin/photo' && req.method === 'GET') {
          const row = db.prepare('SELECT image FROM invites WHERE id=?').get(url.searchParams.get('id'));
          if (!row?.image) fail(404, 'Fotografía no disponible.');
          const encrypted = JSON.parse(row.image);
          const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
          decipher.setAuthTag(Buffer.from(encrypted.tag.auth, 'base64'));
          const bytes = Buffer.concat([decipher.update(Buffer.from(encrypted.tag.data, 'base64')), decipher.final()]);
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Content-Disposition': 'inline' });
          return res.end(bytes);
        }
        if (path === '/api/admin/photo-review' && req.method === 'POST') {
          const row = db.prepare('SELECT * FROM invites WHERE id=?').get(body.id);
          if (!row || row.state !== 'review' || !row.image) fail(409, 'La foto no está pendiente de revisión.');
          if (!['approve','reject'].includes(body.decision) || typeof body.note !== 'string' || body.note.trim().length < 12 || body.note.length > 500) fail(400, 'Elige una decisión y registra el motivo (12 a 500 caracteres).');
          const acceptedConsent=row.consent?JSON.parse(row.consent):null;
          if (body.decision === 'approve' && (!row.verified || !acceptedConsent || acceptedConsent.policy !== 'lab-v3' && !acceptedConsent.captureIncludesRecognition || body.qualityChecked !== true || body.authorizationChecked !== true)) fail(409, 'Para aceptar, revisa identidad, autorización vigente y calidad de la foto.');
          const review = JSON.stringify({ decision: body.decision, note: body.note.trim(), at: Date.now(), qualityChecked: body.qualityChecked === true, authorizationChecked: body.authorizationChecked === true });
          const nextState = body.decision === 'approve' ? 'approved' : 'rejected';
          let automaticEnrollment=null,automaticError=null;
          db.exec('BEGIN IMMEDIATE');
          try {
            const result = db.prepare("UPDATE invites SET state=?,photo_review=?,image=CASE WHEN ?='rejected' THEN NULL ELSE image END WHERE id=? AND state='review'").run(nextState, review, nextState, row.id);
            if (!result.changes) fail(409, 'La foto ya fue revisada.');
            if(nextState==='approved')notifications.enqueue({id:'photo_approved:'+row.id,inviteId:row.id,email:row.email,kind:'photo_approved'});
            if(nextState==='approved'&&acceptedConsent?.captureIncludesRecognition)try{automaticEnrollment=biometric.authorizeFromCapture({...row,state:'approved',photo_review:review});}catch(error){if(!error.status)throw error;automaticError=error.message;}
            db.exec('COMMIT');
          } catch(error) {db.exec('ROLLBACK');throw error;}
          event(row.id, 'photo_' + nextState, 'Revisión manual: ' + body.note.trim());
          if(automaticEnrollment)try{automaticEnrollment=await biometric.enroll(automaticEnrollment.id);}catch(error){automaticError=error.message;automaticEnrollment=biometric.summary(biometric.byId(automaticEnrollment.id));}
          await notifications.drain();
          return send(200, { state: nextState, review:JSON.parse(review), singleConsent:!!acceptedConsent?.captureIncludesRecognition,enrollment:automaticEnrollment,automaticError,recognitionEnabled:false,notificationStatus:notifications.state('photo_approved:'+row.id),enrollmentNotificationStatus:automaticEnrollment?notifications.state('enrolled:'+automaticEnrollment.id):null });
        }
        if (path === '/api/admin/invites' && req.method === 'POST') {
          if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100 || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254 || body.adult !== true && body.invitationOnly !== true || body.fictitious !== true) fail(400, 'Usa un nombre, correo válido y confirma el propósito de invitación. La persona debe declarar su mayoría de edad antes de aportar su foto.');
          return send(201,await issueInvitation(body));
        }
        if (path === '/api/admin/invites/resend' && req.method === 'POST') {
          if(body.confirmed!==true)fail(400,'Confirma el reenvío y reemplazo de la invitación pendiente.');
          const row=db.prepare('SELECT * FROM invites WHERE id=?').get(body.id);
          if(!row||row.state!=='pending'||row.image)fail(409,'Solo puede reemplazarse una invitación pendiente sin foto recibida.');
          if(db.prepare("SELECT id FROM invites WHERE email=? AND id<>? AND (state IN ('review','approved') OR (state='pending' AND expires>?))").get(row.email,row.id,Date.now()))fail(409,'Existe otro registro vigente para esta participante. Revisa antes de reenviar.');
          const recent=db.prepare("SELECT COUNT(*) AS n FROM events e JOIN invites i ON e.invite_id=i.id WHERE i.email=? AND e.kind='invitation_replaced' AND e.created>?").get(row.email,Date.now()-86400000);
          if(recent.n>=3)fail(429,'Máximo tres reemplazos de invitación por participante al día.');
          const changed=db.prepare("UPDATE invites SET state='revoked',expires=? WHERE id=? AND state='pending'").run(Date.now(),row.id);
          if(!changed.changes)fail(409,'La invitación ya fue reemplazada o utilizada.');
          event(row.id,'invitation_replaced','Reenvío solicitado explícitamente; invitación anterior revocada.');
          return send(201,await issueInvitation({name:row.name,email:row.email,sendEmail:true}));
        }
        if (path === '/api/admin/verify' && req.method === 'POST') {
          if (body.identityChecked !== true && body.adult !== true || typeof body.evidence !== 'string' || body.evidence.trim().length < 12 || body.evidence.length > 400) fail(400, 'Confirma a quién corresponde la foto (sin números de documento).');
          const row = db.prepare('SELECT * FROM invites WHERE id=?').get(body.id); if (!row || !['pending','review'].includes(row.state) || (row.state === 'pending' && row.expires < Date.now())) fail(409, 'Invitación no disponible.');
          if(body.identityChecked===true&&JSON.parse(row.consent||'{}').adult!==true)fail(409,'Falta la declaración de mayoría de edad de la persona en su consentimiento.');
          db.prepare('UPDATE invites SET verified=1,evidence=? WHERE id=?').run(body.evidence.trim(), body.id); event(body.id, 'identity_review', 'Identidad revisada por administración; mayoría de edad registrada en el consentimiento del participante'); return send(200, { ok: true });
        }
        if (path === '/api/admin/manual' && req.method === 'POST') {
          const row = db.prepare('SELECT id FROM invites WHERE id=?').get(body.id); if (!row) fail(404, 'Participante inexistente.');
          event(body.id, 'manual_attendance', 'Asistencia de prueba registrada manualmente', `${body.id}:${new Date().toISOString().slice(0,10)}:manual`); return send(200, { ok: true });
        }
        if (path === '/api/admin/delete' && req.method === 'POST') {
          if (body.confirm !== 'ELIMINAR PRUEBAS') fail(400, 'Confirmación requerida.');
          db.exec('BEGIN; DELETE FROM events; DELETE FROM invites; DELETE FROM participant_drafts; DELETE FROM enrolment_roster; DELETE FROM enrollment_notifications; DELETE FROM invitation_recipient_authorizations; COMMIT; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'); return send(200, { ok: true });
        }
        if (path === '/api/admin/logout' && req.method === 'POST') { sessions.delete(hash(sid)); res.setHeader('Set-Cookie', 'lab_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(200, { ok: true }); }
      }
      if(path==='/api/status'&&req.method==='POST'){
        const row=db.prepare('SELECT * FROM invites WHERE token_hash=?').get(hash(body.token||''));
        if(!row||row.created+7*86400000<Date.now()){
          const persistent=biometric.credential(hash(body.token||''));
          if(!persistent)fail(410,'El registro ya no está disponible.');
          checkCode(persistent,body.code);
          return send(200,{name:'Participante de AsistIA',state:'persistent',verified:true,authorized:!!persistent.consent,hasImage:false,recognitionEnabled:false,retentionEnds:persistent.expires,singleConsent:JSON.parse(persistent.consent||'{}').workflow==='single-consent',enrollment:biometric.summary(persistent)});
        }
        checkCode(row,body.code);
        return send(200,{name:row.name,state:row.state==='pending'&&row.expires<Date.now()?'expired':row.state,verified:!!row.verified,authorized:!!row.consent,hasImage:!!row.image,photoDeletedAt:row.photo_deleted_at,recognitionEnabled:false,expires:row.expires,retentionEnds:row.created+7*86400000,emailVerificationRequired:requireVerifiedEmail&&!row.consent&&!row.email_verified_at,emailVerifiedAt:row.email_verified_at||null,enrollmentOffer:row.state==='pending'?biometric.captureOffer(row.email):undefined,singleConsent:!!(row.consent&&JSON.parse(row.consent).captureIncludesRecognition),enrollment:biometric.summary(biometric.byInvite(row.id))});
      }
      if(path==='/api/consent-copy'&&req.method==='POST'){
        const row=db.prepare('SELECT * FROM invites WHERE token_hash=?').get(hash(body.token||''))||biometric.credential(hash(body.token||''));
        if(!row)fail(410,'Registro no disponible.');checkCode(row,body.code);
        if(!row.consent)fail(409,'Todavía no hay autorización registrada.');
        const consent=JSON.parse(row.consent);
        return send(200,{text:`ASISTIA · CONSTANCIA DE AUTORIZACIÓN REGISTRADA\n\nParticipante: ${row.name||'Participante de AsistIA'}\nCorreo: ${row.email}\nFecha: ${new Date(consent.at).toISOString()}\nVersión: ${consent.policy}\nResponsable informado: ${consent.controller||'Consultar aviso aceptado'}\nContacto: ${consent.contact||'Consultar aviso aceptado'}\n\n${consent.notice}\n\nEsta constancia registra una declaración electrónica. No acredita por sí sola identidad ni cumplimiento jurídico. Estado actual: ${row.state}. Reconocimiento facial: no habilitado.`});
      }
      if (path === '/api/invitation' && req.method === 'POST') {
        const row = live(body.token, body.code); return send(200, { name: row.name, verified: !!row.verified, authorized: !!row.consent, expires: row.expires,enrollmentOffer:biometric.captureOffer(row.email) });
      }
      if (path === '/api/consent' && req.method === 'POST') {
        const row = live(body.token, body.code);
        if(requireVerifiedEmail&&!row.consent&&!row.email_verified_at)fail(403,'Confirma primero el código enviado al correo destinatario.');
        const unified=biometric.captureOffer(row.email);
        if(unified.available){
          if(body.adult!==true||body.authorized!==true||body.policy!==unified.policy)fail(400,'Lee el aviso completo y autoriza expresamente antes de tomar la fotografía.');
          if(row.consent&&JSON.parse(row.consent).captureIncludesRecognition)fail(409,'Tu autorización completa ya fue registrada. Puedes continuar con la fotografía.');
          const consent={policy:unified.policy,at:Date.now(),adult:true,voluntary:true,captureIncludesRecognition:true,biometric:unified,notice:unified.notice,controller:unified.controller,contact:unified.contact,transport:process.env.LAB_TRANSPORT||'Acceso local',legalValidation:'pending_review'};
          db.prepare("UPDATE invites SET consent=? WHERE id=? AND state='pending'").run(JSON.stringify(consent),row.id);
          event(row.id,'consent','Autorización única registrada para captura, plantilla y reconocimiento informado.');
          return send(200,{ok:true,singleConsent:true});
        }
        if (body.adult !== true || body.authorized !== true || body.policy !== 'lab-v3') fail(400, 'Se requiere autorización expresa del adulto voluntario.');
        db.prepare('UPDATE invites SET consent=? WHERE id=?').run(JSON.stringify({ policy: 'lab-v3', at: Date.now(), adult: true, voluntary: true, identityReview: row.evidence, legalValidation: 'pending_review', controller: process.env.LAB_CONTROLLER || 'Pendiente de designación', contact: process.env.LAB_CONTACT || 'Pendiente de configurar', transport: process.env.LAB_TRANSPORT || 'Acceso local', notice: readFileSync(new URL('./docs/CONSENTIMIENTO-lab-v3.md', import.meta.url), 'utf8') }), row.id);
        event(row.id, 'consent', 'Autorización lab-v3 registrada; validación de identidad y jurídica pendientes'); return send(200, { ok: true });
      }
      if (path === '/api/enroll' && req.method === 'POST') {
        const row = live(body.token, body.code); if (!row.consent) fail(403, 'Autoriza expresamente antes de enviar tu fotografía.');
        if (JSON.parse(row.consent).policy !== 'lab-v3'&&!JSON.parse(row.consent).captureIncludesRecognition) fail(403, 'Lee y autoriza el aviso actualizado antes de enviar tu fotografía.');
        if (typeof body.image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image)) fail(400, 'Se requiere una imagen JPEG.');
        const data = Buffer.from(body.image.split(',')[1], 'base64');
        if (data.length < 1000 || data.length > 2_000_000 || data[0] !== 255 || data[1] !== 216 || data.at(-2) !== 255 || data.at(-1) !== 217) fail(400, 'JPEG inválido o fuera de tamaño.');
        let normalized;
        try{normalized=await normalizeJpeg(data);}catch{fail(400,'La imagen no es un JPEG decodificable de al menos 480 × 480 y máximo 16 megapíxeles. Vuelve a capturar o cargar la foto.');}
        // La revisión de rostro y calidad no se finge: queda pendiente de revisión.
        const updated = db.prepare("UPDATE invites SET image=?,state='review' WHERE id=? AND state='pending' AND expires>? AND consent IS NOT NULL").run(encrypt(normalized.bytes), row.id, Date.now());
        if (!updated.changes) fail(409, 'Invitación ya utilizada.');
        event(row.id, 'image_received', 'Imagen cifrada recibida. Calidad facial y PAD pendientes; reconocimiento deshabilitado.');
        return send(200, { state: 'review', message: 'Imagen recibida. Pendiente de revisión de calidad facial; no habilita reconocimiento ni asistencia biométrica.' });
      }
      if (path === '/api/withdraw' && req.method === 'POST') {
        const persistent = biometric.credential(hash(body.token || ''));
        const row = db.prepare('SELECT id,email,code_hash FROM invites WHERE token_hash=?').get(hash(body.token || '')) || persistent; if (!row) fail(410, 'Solicitud no disponible.');
        checkCode(row, body.code);
        db.prepare('DELETE FROM enrollment_notifications WHERE email=?').run(row.email);
        db.prepare('DELETE FROM invitation_recipient_authorizations WHERE email=?').run(row.email);
        const biometricRows = persistent ? [persistent, ...biometric.list().filter(item=>item.email && item.email === row.email).map(item=>biometric.byId(item.id))] : biometric.list().filter(item=>item.email === row.email).map(item=>biometric.byId(item.id));
        for(const record of biometricRows)biometric.revoke(record);
        await maintainBiometrics();
        db.exec('BEGIN');
        try{db.prepare('DELETE FROM events WHERE invite_id IN (SELECT id FROM invites WHERE email=?)').run(row.email);db.prepare('DELETE FROM invites WHERE email=?').run(row.email);db.prepare('DELETE FROM enrolment_roster WHERE email=?').run(row.email);db.prepare('DELETE FROM participant_drafts WHERE email=?').run(row.email);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'); return send(200, { ok: true, biometricDeletionPending:biometricRows.some(record=>biometric.byId(record.id)?.state==='deletion_pending') });
      }
      if (path === '/api/recognize' && req.method === 'POST') { event(null, 'recognition_blocked', 'Sin comparación operativa ni PAD real'); fail(503, 'Reconocimiento bloqueado: faltan comparación facial operativa y PAD validado. El enrolamiento local no habilita asistencia.'); }
      fail(404, 'Ruta inexistente.');
    } catch (error) { send(error.status || 500, { error: error.status ? error.message : 'Error interno del laboratorio.' }); }
  }
  const server = process.env.TLS_CERT && process.env.TLS_KEY ? https.createServer({ cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }, handler) : http.createServer(handler);
  server.on('listening', maintainBiometrics);
  server.on('close', () => { clearInterval(retentionTimer); clearInterval(biometricTimer); });
  return { server, db, close: () => { server.close(); db.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lab = createLab();
  lab.server.listen(Number(process.env.PORT || 5180), process.env.HOST || '127.0.0.1', () => console.log('Laboratorio: ' + (process.env.PUBLIC_ORIGIN || 'http://localhost:5180') + '\nClave administrativa en data/admin.key (solo local).'));
}
