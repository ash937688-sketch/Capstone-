import { createHash, randomUUID } from 'node:crypto';
import { createRekognitionProvider } from './biometricProvider.js';
import { createLocalProvider, localInstallationPresent, LOCAL_MODEL, validLocalReference } from './localBiometricProvider.js';

const DAY = 86400000;
const reject = (status, message) => { throw Object.assign(Error(message), { status }); };
export function biometricConfiguration(env = process.env) {
  const days = Number(env.BIOMETRIC_RETENTION_DAYS);
  const local = env.BIOMETRIC_PROVIDER === 'local-sface';
  const missing = [];
  if (!local && env.BIOMETRIC_PROVIDER !== 'aws-rekognition') missing.push('Seleccionar motor facial');
  if (local && !localInstallationPresent()) missing.push('Instalar motor local y modelos verificados');
  if (!local && !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(env.BIOMETRIC_AWS_REGION || '')) missing.push('Definir región de procesamiento');
  if (!local && !/^[a-zA-Z0-9_.-]{1,255}$/.test(env.BIOMETRIC_COLLECTION || '')) missing.push('Configurar colección dedicada');
  if (!Number.isInteger(days) || days < 1 || days > 3650) missing.push('Definir conservación entre 1 y 3650 días');
  if (!env.BIOMETRIC_CONTROLLER?.trim()) missing.push('Identificar responsable del tratamiento');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BIOMETRIC_CONTACT || '')) missing.push('Definir contacto para derechos');
  if (local ? env.BIOMETRIC_PERSONAL_PILOT !== 'yes' : env.BIOMETRIC_NOTICE_REVIEWED !== 'yes') missing.push(local ? 'Autorizar prueba local personal con aviso nuevo' : 'Revisar y aprobar el nuevo aviso');
  if (!local && env.BIOMETRIC_EXTERNAL_PROCESSING_APPROVED !== 'yes') missing.push('Aprobar proveedor, costos y tratamiento externo');
  if (env.BIOMETRIC_ENABLED !== 'yes') missing.push('Activar integración en el servidor');
  return { ready: !missing.length, missing, provider: local ? 'local-sface' : 'aws-rekognition', region: local ? 'Servidor local de AsistIA' : env.BIOMETRIC_AWS_REGION || '', collection: local ? LOCAL_MODEL : env.BIOMETRIC_COLLECTION || '', allowedEmails: String(env.BIOMETRIC_ALLOWED_EMAILS || '').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean), days, controller: env.BIOMETRIC_CONTROLLER?.trim() || '', contact: env.BIOMETRIC_CONTACT || '' };
}

const defaultProviderFactory = settings => settings.provider === 'local-sface' ? createLocalProvider() : createRekognitionProvider(settings);
export function createBiometricEnrollment({ db, encrypt, decrypt, now = Date.now, config = biometricConfiguration(), providerFactory = defaultProviderFactory, onEnrolled = () => {},isRegisteredParticipant=()=>null,registeredParticipantsAllowed=false }) {
  db.exec(`CREATE TABLE IF NOT EXISTS biometric_enrollments(
    id TEXT PRIMARY KEY, invite_id TEXT UNIQUE NOT NULL, email TEXT, token_hash TEXT, code_hash TEXT,
    state TEXT NOT NULL, consent TEXT, provider_config TEXT NOT NULL, reference TEXT, remote_possible INTEGER DEFAULT 0,
    created INTEGER NOT NULL, expires INTEGER NOT NULL, updated INTEGER NOT NULL, last_error TEXT);
    CREATE INDEX IF NOT EXISTS biometric_expiry ON biometric_enrollments(state,expires);`);
  if (!db.prepare('PRAGMA table_info(biometric_enrollments)').all().some(column => column.name === 'remote_possible')) db.exec('ALTER TABLE biometric_enrollments ADD COLUMN remote_possible INTEGER DEFAULT 0');
  const busy = new Set();
  const byId = id => db.prepare('SELECT * FROM biometric_enrollments WHERE id=?').get(id);
  const byInvite = id => db.prepare('SELECT * FROM biometric_enrollments WHERE invite_id=?').get(id);
  const credential = tokenHash => db.prepare('SELECT * FROM biometric_enrollments WHERE token_hash=?').get(tokenHash);
  const canEnroll = email => {
    const correo = String(email || '').trim().toLowerCase();
    const registered = isRegisteredParticipant(correo);

    return correo.endsWith('@duocuc.cl') &&
      registered !== false &&
      config.allowedEmails?.includes(correo) === true;
  };
  const eligible = invite => !!(config.ready && invite?.state === 'approved' && invite.verified && invite.image && canEnroll(invite.email) && !byInvite(invite.id));
  function offer() {
    if (!config.ready) return { available: false, message: 'El enrolamiento persistente aún requiere configurar proveedor, responsable, conservación y aprobación del aviso.' };
    const notice = `ENROLAMIENTO BIOMÉTRICO PERSISTENTE · versión bio-v1\nResponsable: ${config.controller}. Contacto para ejercer derechos: ${config.contact}.\nFinalidad: generar una plantilla facial vinculada a tu ficha para comparar tu rostro al registrar asistencia en AsistIA, una vez validado y habilitado el tótem. La aprobación de tu fotografía no equivale a esta autorización.\nProveedor: Amazon Web Services, Amazon Rekognition; región ${config.region}. Tu fotografía será transmitida a ese proveedor para obtener una plantilla. La colección facial conserva vectores, no la fotografía original. La referencia a la plantilla queda protegida en el servidor de AsistIA.\nConservación: ${config.days} días desde esta autorización, o hasta que retires tu autorización, lo que ocurra primero. La foto temporal se elimina del registro del laboratorio solo después de confirmar la creación de la plantilla; mientras tanto sigue aplicando su plazo original de 7 días. Si falla la conversión o ya no existe foto, se informará que hace falta una nueva captura. La plantilla no exige capturas semanales, aunque una renovación, un cambio de modelo o un problema de calidad puede requerir una nueva captura.\nPuedes no autorizar, retirar tu autorización y solicitar acceso, rectificación o eliminación mediante el contacto informado. Existe la alternativa de asistencia manual sin penalización. Al retirar o vencer se bloquea inmediatamente el uso local de la plantilla y se solicita su eliminación al proveedor. Si el proveedor está caído, se conserva una solicitud mínima de borrado y se reintenta con el servicio activo; no se confirma el borrado externo antes de verificarlo. Las copias de seguridad y su eliminación deben quedar cubiertas por la política del responsable.\nLa plantilla facial es un dato biométrico sensible, incluso sin guardar la fotografía. Esta autorización no habilita por sí sola reconocimiento ni asistencia: faltan validación del motor, PAD real y pruebas de operación. Solo adultos voluntarios. No se ha certificado cumplimiento institucional. No aceptes si el responsable, la finalidad o el proveedor no corresponden al uso que solicitaste.`;
    const local = config.provider === 'local-sface';
    const localNotice = `ENROLAMIENTO BIOMÉTRICO LOCAL · versión bio-local-v2
Responsable del piloto experimental: ${config.controller}. Contacto para derechos: ${config.contact}.
Finalidad: generar una plantilla facial vinculada a tu ficha para comparar tu propio rostro en pruebas experimentales de AsistIA, previa autorización individual, sin registrar asistencia académica oficial. Aprobar tu foto no equivale a esta autorización.
Procesamiento: OpenCV YuNet y SFace instalados en el computador servidor de AsistIA. La extracción y el almacenamiento de la plantilla son locales: no se envía tu foto ni tu plantilla a AWS ni a un proveedor de reconocimiento externo. El acceso a la web puede usar el transporte HTTPS configurado, incluido el túnel de Cloudflare informado en la prueba original; el correo y la ficha de acceso siguen utilizando los servicios existentes. No es un sistema completamente desconectado de internet.
Datos: fotografía temporal de rostro, plantilla matemática de 128 valores, correo de vinculación, revisión de identidad y evidencia de tu autorización. La plantilla también es un dato biométrico sensible. Se guarda cifrada en la base local, nunca en el navegador ni en el correo, y Firebase conserva solo referencias y estado de gestión.
Conservación de la plantilla: ${config.days} días desde esta aceptación, o hasta que retires tu autorización, lo que ocurra primero. No necesitas reenrolarte semanalmente mientras la plantilla sea válida y funcione. Puede requerirse una nueva captura por cambios de modelo o problemas de calidad. La foto cifrada se mantiene como respaldo temporal para validar el enrolamiento; crear la plantilla no la elimina inmediatamente. Mantiene su plazo original máximo de siete días desde la invitación, sin ampliación por aceptar este aviso ni por generar la plantilla. Puedes eliminarla antes desde tus derechos de eliminación o solicitarlo al contacto. Aunque la validación no haya terminado, al cumplirse ese plazo se elimina conforme a la autorización original. La plantilla tiene su propio plazo y no se elimina porque venza la foto. Las copias de seguridad requieren una política separada; el borrado local no garantiza borrado forense del dispositivo.
Tu participación es voluntaria y solo para adultos. Puedes no autorizar y utilizar asistencia manual sin penalización. Puedes retirar tu autorización desde tu enlace privado, o solicitar acceso, rectificación o eliminación mediante el contacto indicado. Retirar o vencer bloquea su uso y elimina la plantilla cifrada del registro local. Los borrados se mantienen pendientes si falla la operación y se reintentan al iniciar y cada minuto mientras el servidor esté activo. Si el equipo está apagado, el mantenimiento se ejecuta al reiniciar. Se conserva un estado mínimo de borrado confirmado durante siete días, sin correo, consentimiento ni plantilla, y después se elimina.
Este es un piloto experimental voluntario de AsistIA, no una autorización ni un despliegue institucional de Duoc UC. El aviso requiere revisión antes de uso institucional. El motor no certifica identidad ni detecta por sí solo fotos impresas, pantallas o videos. Crear una plantilla no habilita por sí solo el reconocimiento ni la asistencia oficial: quedan pendientes validación de exactitud, PAD y operación segura. No se afirma cumplimiento legal certificado.`;
    const fullNotice = local ? localNotice : notice + '\nDespués de confirmar el borrado externo se conserva un estado mínimo de confirmación, sin correo, consentimiento ni referencia de plantilla, durante siete días para que puedas consultar el resultado; luego se elimina con el servicio activo.';
    const policy = (local ? 'bio-local-v2-' : 'bio-v1-') + createHash('sha256').update(fullNotice).digest('hex').slice(0, 20);
    return { available: true, policy, notice: fullNotice, photoHandling: local ? 'temporary-validation-backup' : 'delete-after-conversion', provider: local ? 'OpenCV SFace local' : 'Amazon Rekognition', local, region: config.region, retentionDays: config.days };
  }
  function summary(row) {
    if (!row) return null;
    const expired = row.expires <= now();
    const source = db.prepare('SELECT * FROM invites WHERE id=?').get(row.invite_id);
    return { id: row.id, inviteId: row.invite_id, email: row.email, state: expired && row.state !== 'deleted' ? 'deletion_pending' : row.state,
      templateReady: row.state === 'active' && !expired, recognitionEnabled: false, expires: row.expires, created: row.created,
      photoRetained: !!source?.image, photoRetentionEnds: source?.created ? source.created + 7 * DAY : null,
      needsNewPhoto: row.state === 'authorized' && !source?.image,
      lastError: row.last_error || null };
  }
  function migrationOffer(){
    const base=offer();
    if(!base.available||!base.local)return base;
    const notice=`ACTUALIZACIÓN DE AUTORIZACIÓN · bio-migrate-v1\nTu fotografía ya fue aceptada y su identidad fue revisada por administración. No necesitas volver a tomarla mientras esté disponible dentro de su plazo original. Al aceptar este aviso, autorizas generar automáticamente tu plantilla cifrada usando esa foto. El servidor iniciará la conversión y te enviará la confirmación solo si se guarda correctamente. No necesitas volver a pedir que aprueben la foto. Si la conversión falla, administración verá el problema para corregirlo.\n\n${base.notice}`;
    return {...base,notice,policy:'bio-migrate-v1-'+createHash('sha256').update(notice).digest('hex').slice(0,20),workflow:'migration-approved-photo'};
  }
  function captureOffer(email) {
    if(config.provider!=='local-sface'||!config.ready||!canEnroll(email))return {available:false};
    const base=offer();
    const notice=`AUTORIZACIÓN ÚNICA DE ENROLAMIENTO · enrol-local-v1\nAntes de tomar o subir tu foto, autorizas en este mismo acto su captura, envío al servidor de AsistIA, almacenamiento temporal y revisión humana, la generación de una plantilla facial cifrada y su uso para comparar tu rostro al registrar asistencia cuando el sistema haya sido validado y habilitado. Son datos biométricos sensibles. No tendrás que aceptar otra autorización para generar esta plantilla.\n\n${base.notice}\n\nRecorrido: aceptas este aviso, tomas o subes tu propia fotografía y confirmas el envío. Administración revisa tu identidad, autorización y calidad de la foto. Si la acepta, el servidor genera la plantilla localmente y te avisa por correo cuando quede guardada. Si hay un problema, se informa para corregirlo; no se simula un enrolamiento exitoso. El enlace privado permite consultar el estado y ejercer tus derechos, sin obligarte a entrar de nuevo para terminar un envío correcto. La foto temporal vence siete días después de crear la invitación, aunque la revisión no haya terminado. La plantilla vence ${config.days} días después de esta aceptación, o antes si retiras tu autorización. Los participantes expresamente autorizados podrán realizar comparaciones faciales y marcaciones experimentales en Firebase. Estas marcaciones no constituyen asistencia académica oficial. El sistema todavía no dispone de una prueba de vida validada.`;
    return {...base,notice,policy:'enrol-local-v1-'+createHash('sha256').update(notice).digest('hex').slice(0,20),controller:config.controller,contact:config.contact,workflow:'single-consent',settings:{provider:config.provider,region:config.region,collection:config.collection}};
  }
  function authorizeFromCapture(invite) {
    const accepted=invite?.consent?JSON.parse(invite.consent):null;
    if(!accepted?.captureIncludesRecognition||accepted.biometric?.workflow!=='single-consent')return null;
    if(invite.state!=='approved'||!invite.verified||!invite.image)reject(409,'Primero revisa y acepta la fotografía.');
    const previous=byInvite(invite.id);if(previous)return summary(previous);
    const snapshot=accepted.biometric,settings=snapshot.settings;
    if(!config.ready||settings?.provider!=='local-sface'||settings.provider!==config.provider||settings.collection!==config.collection||settings.region!==config.region)reject(409,'La configuración cambió desde la autorización. Administración debe revisar el registro.');
    if(!canEnroll(invite.email))reject(403,'Participante fuera del registro habilitado.');
    if(!Number.isInteger(snapshot.retentionDays)||snapshot.retentionDays<1||snapshot.retentionDays>3650||!Number.isFinite(accepted.at)||accepted.at>now()||accepted.at+snapshot.retentionDays*DAY<=now())reject(409,'La autorización no es válida o venció.');
    const expected='enrol-local-v1-'+createHash('sha256').update(snapshot.notice).digest('hex').slice(0,20);
    if(snapshot.policy!==expected||accepted.policy!==snapshot.policy)reject(409,'No se pudo verificar el aviso aceptado.');
    const id=randomUUID();
    db.prepare(`INSERT INTO biometric_enrollments(id,invite_id,email,token_hash,code_hash,state,consent,provider_config,created,expires,updated) VALUES(?,?,?,?,?,'authorized',?,?,?,?,?)`).run(id,invite.id,invite.email,invite.token_hash,invite.code_hash,JSON.stringify({...snapshot,at:accepted.at,adult:true,voluntary:true,emailVerifiedAt:invite.email_verified_at||null,identityEvidence:invite.evidence,review:invite.photo_review}),JSON.stringify(settings),accepted.at,accepted.at+snapshot.retentionDays*DAY,now());
    return summary(byId(id));
  }
  function authorize(invite, body) {
    const current = String(body.policy||'').startsWith('bio-migrate-v1-')?migrationOffer():offer();
    if (!current.available) reject(503, current.message);
    if (!canEnroll(invite.email)) reject(403, 'Participante fuera del registro habilitado.');
    if (body.authorized !== true || body.adult !== true || body.policy !== current.policy) reject(400, 'Lee el aviso vigente y autoriza expresamente la plantilla y el tratamiento informado.');
    if (invite.state !== 'approved' || !invite.verified || !invite.image) reject(409, 'Primero debe existir una fotografía aprobada con identidad revisada.');
    if (byInvite(invite.id)) reject(409, 'Este registro ya tiene una solicitud biométrica. Consulta su estado.');
    const time = now(), id = randomUUID();
    db.prepare(`INSERT INTO biometric_enrollments(id,invite_id,email,token_hash,code_hash,state,consent,provider_config,created,expires,updated)
      VALUES(?,?,?,?,?,'authorized',?,?,?,?,?)`).run(id, invite.id, invite.email, invite.token_hash, invite.code_hash,
      JSON.stringify({ ...current, at: time, adult: true, voluntary: true, identityEvidence: invite.evidence, review: invite.photo_review }),
      JSON.stringify({ provider: config.provider, region: config.region, collection: config.collection }), time, time + config.days * DAY, time);
    return summary(byId(id));
  }
  function revoke(row) {
    if (!row || row.state === 'deleted') return;
    // Keep only the minimum routing information until remote deletion has been confirmed.
    db.prepare("UPDATE biometric_enrollments SET state='deletion_pending',email=NULL,consent=NULL,updated=? WHERE id=?").run(now(), row.id);
  }
  async function remove(row) {
    if (busy.has(row.id)) return false;
    busy.add(row.id);
    try {
      const current = byId(row.id);
      if (current.state !== 'deletion_pending') return false;
      if (current.remote_possible) await providerFactory(JSON.parse(current.provider_config)).remove(current.id, current.reference ? JSON.parse(decrypt(current.reference).toString()) : null);
      db.prepare("UPDATE biometric_enrollments SET state='deleted',reference=NULL,consent=NULL,email=NULL,last_error=NULL,updated=? WHERE id=?").run(now(), row.id);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
      return true;
    } catch {
      db.prepare('UPDATE biometric_enrollments SET last_error=? WHERE id=?').run('Eliminación externa pendiente de confirmar. Se reintentará.', row.id);
      return false;
    } finally { busy.delete(row.id); }
  }
  async function maintenance() {
    for (const row of db.prepare("SELECT * FROM biometric_enrollments WHERE expires<=? AND state NOT IN ('deleted','deletion_pending')").all(now())) revoke(row);
    for (const row of db.prepare("SELECT * FROM biometric_enrollments WHERE state='deletion_pending'").all()) await remove(row);
    for(const row of db.prepare("SELECT * FROM biometric_enrollments WHERE state='authorized' AND expires>?").all(now())){
      if(['single-consent','migration-approved-photo'].includes(JSON.parse(row.consent||'{}').workflow)&&db.prepare("SELECT id FROM invites WHERE id=? AND state='approved' AND image IS NOT NULL").get(row.invite_id))try{await enroll(row.id);}catch{/* Report failure to administration; never request a second consent automatically. */}
    }
    // Short-lived, non-identifying tombstones allow the holder to confirm completion.
    db.prepare("DELETE FROM biometric_enrollments WHERE state='deleted' AND updated<?").run(now() - 7 * DAY);
  }
  async function enroll(id) {
    if (!config.ready) reject(503, 'La integración biométrica no está activada y aprobada.');
    const row = byId(id);
    if (!row) reject(404, 'Solicitud biométrica inexistente.');
    if (busy.has(id)) reject(409, 'La solicitud ya se está procesando.');
    if (row.expires <= now() || !['authorized', 'indexing'].includes(row.state)) reject(409, 'Solicitud vencida, retirada o ya procesada.');
    const invite = db.prepare('SELECT * FROM invites WHERE id=?').get(row.invite_id);
    if (!invite?.image || invite.state !== 'approved' || !invite.verified) reject(409, 'No existe una foto aprobada disponible. Hace falta una captura nueva.');
    const oldConfig = JSON.parse(row.provider_config);
    if ((oldConfig.provider || 'aws-rekognition') !== config.provider || oldConfig.region !== config.region || oldConfig.collection !== config.collection) reject(409, 'El motor cambió desde la autorización. Revisa el consentimiento antes de continuar.');
    busy.add(id);
    db.prepare("UPDATE biometric_enrollments SET state='indexing',remote_possible=1,updated=?,last_error=NULL WHERE id=?").run(now(), id);
    try {
      const reference = await providerFactory(oldConfig).enroll(decrypt(invite.image), id);
      if (oldConfig.provider === 'local-sface' ? !validLocalReference(reference) : reference?.faceIds?.length !== 1 || typeof reference.faceIds[0] !== 'string') throw Error('Invalid provider response');
      const current = byId(id);
      // A withdrawal or expiry during the network call always wins over enrollment.
      const withdrawn = current.state === 'deletion_pending' || current.expires <= now();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE biometric_enrollments SET reference=?,state=?,updated=? WHERE id=?').run(encrypt(Buffer.from(JSON.stringify(reference))), withdrawn ? 'deletion_pending' : 'active', now(), id);
        // Honor the accepted snapshot. Older notices promised deletion on conversion.
        const keepBackup = oldConfig.provider === 'local-sface' && JSON.parse(row.consent).photoHandling === 'temporary-validation-backup';
        if (!keepBackup || withdrawn) db.prepare("UPDATE invites SET image=NULL,photo_deleted_at=?,state='approved_no_photo' WHERE id=?").run(now(), invite.id);
        if (!withdrawn) onEnrolled({id,inviteId:invite.id,email:row.email});
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
    } catch (error) {
      const detail=error.status===422?error.message:'Conversión no confirmada. La foto se conserva dentro de su plazo; administración puede reintentar.';
      db.prepare('UPDATE biometric_enrollments SET last_error=? WHERE id=? AND state NOT IN (\'deleted\',\'deletion_pending\')').run(detail, id);
      if (error.status) throw error;
      reject(503, 'No se confirmó la creación de la plantilla. No se activó el reconocimiento.');
    } finally { busy.delete(id); }
    if (byId(id).state === 'deletion_pending') await remove(byId(id));
    return summary(byId(id));
  }
  const obtenerReferenciaActiva = id => {
    const row = byId(id);
    if (!row || row.state !== "active" || !row.reference || row.expires <= now()) return null;
    const reference = JSON.parse(decrypt(row.reference).toString());
    return validLocalReference(reference) ? reference : null;
  };

  const obtenerReferenciaActivaPorCorreo = email => {
    const correo = String(email || '').trim().toLowerCase();
    if (!correo || correo.length > 254) return null;
    const rows = db.prepare("SELECT id FROM biometric_enrollments WHERE lower(email)=? AND state='active' AND expires>? ORDER BY created DESC LIMIT 2").all(correo, now());
    if (rows.length !== 1) return null;
    const reference = obtenerReferenciaActiva(rows[0].id);
    return reference ? { id: rows[0].id, reference } : null;
  };
  return { offer, migrationOffer, captureOffer, authorizeFromCapture, authorize, enroll, revoke, maintenance, obtenerReferenciaActiva, obtenerReferenciaActivaPorCorreo, byId, byInvite, credential, summary, eligible,
    list: () => db.prepare('SELECT * FROM biometric_enrollments ORDER BY created DESC').all().map(summary),
    readiness: () => ({ configured: config.ready, local: config.provider === 'local-sface', provider: config.ready ? (config.provider === 'local-sface' ? 'OpenCV SFace · servidor local, sin AWS' : 'Amazon Rekognition') : null,registeredParticipantsAllowed,allowedEmails: config.allowedEmails || [], missing: config.missing || [], recognitionEnabled: false, padEnabled: false }),
    consentCopy: row => row?.consent ? JSON.parse(row.consent) : null };
}


