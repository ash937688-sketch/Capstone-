import {createHash,randomInt,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
const reject=(status,message)=>{throw Object.assign(Error(message),{status});};
export function createEnrollmentEmailVerification({db,mail,now=Date.now}){
  if(!db.prepare('PRAGMA table_info(invites)').all().some(c=>c.name==='email_verified_at'))db.exec('ALTER TABLE invites ADD COLUMN email_verified_at INTEGER');
  db.exec('CREATE TABLE IF NOT EXISTS enrollment_email_challenges(invite_id TEXT PRIMARY KEY,hash BLOB,expires INTEGER,attempts INTEGER,last_sent INTEGER,window_start INTEGER,sent INTEGER)');
  function purge(){db.prepare('DELETE FROM enrollment_email_challenges WHERE invite_id NOT IN (SELECT id FROM invites)').run();}
  async function send(invite){
    if(invite.email_verified_at)return {verified:true};
    if(!mail.configured||typeof mail.sendVerificationCode!=='function')reject(503,'La verificación por correo no está disponible.');
    const previous=db.prepare('SELECT * FROM enrollment_email_challenges WHERE invite_id=?').get(invite.id),time=now();
    if(previous&&time-previous.last_sent<60000)reject(429,'Espera un minuto antes de solicitar otro código.');
    const sameWindow=previous&&time-previous.window_start<3600000;
    if(sameWindow&&previous.sent>=3)reject(429,'Máximo tres códigos por hora. Usa el último correo recibido.');
    const code=String(randomInt(1000000)).padStart(6,'0');
    db.prepare('INSERT OR REPLACE INTO enrollment_email_challenges VALUES(?,?,?,?,?,?,?)').run(invite.id,digest(code),time+600000,0,time,sameWindow?previous.window_start:time,sameWindow?previous.sent+1:1);
    try{await mail.sendVerificationCode({email:invite.email,code});}catch{reject(503,'No se confirmó el envío. Espera antes de volver a solicitarlo.');}
    return {sent:true,expiresInSeconds:600};
  }
  function confirm(invite,code){
    if(invite.email_verified_at)return {verified:true};
    const row=db.prepare('SELECT * FROM enrollment_email_challenges WHERE invite_id=?').get(invite.id);
    if(!row?.hash||row.expires<=now()||row.attempts>=5)reject(410,'El código venció o agotó sus intentos. Solicita otro.');
    db.prepare('UPDATE enrollment_email_challenges SET attempts=attempts+1 WHERE invite_id=?').run(invite.id);
    if(!/^\d{6}$/.test(String(code))||!timingSafeEqual(digest(String(code)),row.hash))reject(400,'El código de verificación no coincide.');
    db.prepare('UPDATE invites SET email_verified_at=?,verified=1,evidence=? WHERE id=?').run(now(),'Control del correo destinatario comprobado mediante código de un solo uso. No constituye cotejo de identidad facial.',invite.id);
    db.prepare('UPDATE enrollment_email_challenges SET hash=NULL WHERE invite_id=?').run(invite.id);
    return {verified:true};
  }
  return {send,confirm,purge};
}
