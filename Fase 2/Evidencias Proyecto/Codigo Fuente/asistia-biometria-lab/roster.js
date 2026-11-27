import { createHash } from 'node:crypto';

export const rosterTemplate = '\uFEFFnombre;correo;curso;mayor_de_edad\r\nVoluntario de ejemplo;usuario19@example.com;Club;pendiente\r\n';

export function parseRoster(csv) {
  if(typeof csv!=='string'||Buffer.byteLength(csv)>512000)throw Error('Usa un CSV UTF-8 de hasta 500 KB.');
  const text=csv.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/)[0];const separator=first.includes(';')?';':',';
  const records=[];let record=[],field='',quoted=false,closed=false;
  for(let i=0;i<=text.length;i++){
    const c=text[i];
    if(quoted){if(c===undefined)throw Error('El CSV tiene comillas sin cerrar.');if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)throw Error('Comillas inválidas en el CSV.');quoted=true;continue;}
    if(c===separator||c==='\r'||c==='\n'||c===undefined){record.push(field);field='';closed=false;if(c!==separator){if(record.some(x=>x.trim()))records.push(record);record=[];if(c==='\r'&&text[i+1]==='\n')i++;}continue;}
    if(closed&&!/\s/.test(c))throw Error('Hay texto después de cerrar una celda entre comillas.');field+=c;
  }
  if(records.length<2||records.length>501)throw Error('Incluye entre 1 y 500 participantes.');
  const headers=records.shift().map(x=>x.trim().toLowerCase());
  if(headers.join(',')!=='nombre,correo,curso,mayor_de_edad')throw Error('Columnas requeridas: nombre;correo;curso;mayor_de_edad.');
  const seen=new Set(),rows=[],errors=[];let duplicates=0;
  records.forEach((cells,index)=>{
    const [name,email,course,adult]=cells.map(x=>x.trim());const normalized=(email||'').toLowerCase();
    if(cells.length!==4||!name||name.length>100||!email||email.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||!course||course.length>100||/[\r\n]/.test(name+course)||/^[=+@-]/.test(name)||/^[=+@-]/.test(course)||!['si','sí','no','pendiente'].includes((adult||'').toLowerCase())){
      errors.push({row:index+2,message:'Revisa nombre, correo, curso y mayoría de edad (si/no/pendiente).'});return;
    }
    if(seen.has(normalized)){duplicates++;if(adult.toLowerCase()==='no'){const existing=rows.find(row=>row.email===normalized);existing.adult=false;existing.ageStatus='minor';}return;}seen.add(normalized);
    rows.push({id:createHash('sha256').update(normalized).digest('hex'),name,email:normalized,course,adult:['si','sí'].includes(adult.toLowerCase()),ageStatus:adult.toLowerCase()==='no'?'minor':adult.toLowerCase()==='pendiente'?'unknown':'adult'});
  });
  return {rows,errors,duplicates,total:records.length};
}

export function createRosterHandler({db,issueInvitation,event,canInvite=()=>true,mailConfigured=true}) {
  db.exec('CREATE TABLE IF NOT EXISTS enrolment_roster(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,course TEXT,adult INTEGER,created INTEGER,last_invite TEXT,delivery TEXT)');
  if(!db.prepare('PRAGMA table_info(enrolment_roster)').all().some(column=>column.name==='age_status')){db.exec("ALTER TABLE enrolment_roster ADD COLUMN age_status TEXT DEFAULT 'unknown'");db.prepare("UPDATE enrolment_roster SET age_status=CASE WHEN adult=1 THEN 'adult' ELSE 'legacy_unconfirmed' END").run();}
  const list=()=>db.prepare('SELECT * FROM enrolment_roster ORDER BY name,email').all().map(row=>({...row,adult:!!row.adult,ageStatus:row.age_status,mailAllowed:canInvite(row.email)}));
  return async(path,method,body)=>{
    if(path==='/api/admin/roster'&&method==='GET')return {participants:list()};
    if(path==='/api/admin/roster/template'&&method==='GET')return {csv:rosterTemplate};
    if(path==='/api/admin/roster/check'&&method==='POST'){
      if(!Array.isArray(body.emails)||body.emails.length>100)throw Object.assign(Error('Comprueba como máximo 100 correos por solicitud.'),{status:400});
      return {mailConfigured,results:body.emails.map(value=>{
        const email=String(value).trim().toLowerCase();let reason=null;
        if(!mailConfigured)reason='Servicio de correo no configurado';
        else if(!canInvite(email)&&body.databasePreview!==true)reason='Correo o dominio no habilitado para envío';
        else if(db.prepare("SELECT id FROM enrolment_roster WHERE email=? AND age_status='minor'").get(email))reason='Registrado como menor de edad';
        else if(db.prepare("SELECT id FROM enrolment_roster WHERE email=? AND age_status='legacy_unconfirmed'").get(email))reason='Información antigua de edad requiere revisión';
        else if(db.prepare("SELECT id FROM invites WHERE email=? AND (state IN ('review','approved') OR (state='pending' AND expires>?))").get(email,Date.now()))reason='Ya tiene invitación vigente o foto recibida';
        else if(db.prepare("SELECT id FROM biometric_enrollments WHERE email=? AND state IN ('authorized','indexing','active') AND expires>?").get(email,Date.now()))reason='Ya tiene un registro facial vigente';
        return {email,eligible:!reason,reason};
      })};
    }
    if(path==='/api/admin/roster/authorize-invitations'&&method==='POST'){
      if(body.confirmed!==true||!Array.isArray(body.emails)||!body.emails.length||body.emails.length>5)throw Object.assign(Error('Confirma un lote de hasta cinco destinatarios de la base revisada.'),{status:400});
      const rows=body.emails.map(value=>String(value).trim().toLowerCase());
      for(const email of rows)if(!db.prepare("SELECT id FROM enrolment_roster WHERE email=? AND age_status NOT IN ('minor','legacy_unconfirmed')").get(email))throw Object.assign(Error('Destinatario no registrado o no habilitado.'),{status:403});
      db.exec('BEGIN');try{for(const email of rows)db.prepare('INSERT INTO invitation_recipient_authorizations(email,created) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET created=excluded.created').run(email,Date.now());event(null,'campaign_recipient_authorized','Destinatarios de base revisada autorizados para invitación: '+rows.length);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return {authorized:rows.length};
    }
    if(['/api/admin/roster/preview','/api/admin/roster/import'].includes(path)&&method==='POST'){
      const parsed=parseRoster(body.csv),existing=new Set(list().map(row=>row.email));
      const preview={...parsed,existing:parsed.rows.filter(row=>existing.has(row.email)).length,newCount:parsed.rows.filter(row=>!existing.has(row.email)).length};
      if(path.endsWith('/preview'))return preview;
      if(body.confirmedAuthority!==true)throw Object.assign(Error('Confirma que tienes autorización para cargar estos contactos.'),{status:400});
      if(parsed.errors.length)throw Object.assign(Error('Corrige las filas con errores antes de importar.'),{status:400});
      const insert=db.prepare('INSERT OR IGNORE INTO enrolment_roster(id,name,email,course,adult,created,age_status) VALUES(?,?,?,?,?,?,?)');
      db.exec('BEGIN');let imported=0;
      try{for(const row of parsed.rows){imported+=insert.run(row.id,row.name,row.email,row.course,Number(row.adult),Date.now(),row.ageStatus).changes;if(row.ageStatus==='minor')db.prepare("UPDATE enrolment_roster SET age_status='minor',adult=0 WHERE email=?").run(row.email);else db.prepare("UPDATE enrolment_roster SET age_status=?,adult=? WHERE email=? AND age_status='legacy_unconfirmed'").run(row.ageStatus,Number(row.adult),row.email);}event(null,'roster_import','Contactos importados: '+imported);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return {imported,skipped:parsed.rows.length-imported+parsed.duplicates,participants:list()};
    }
    if(path==='/api/admin/roster/send'&&method==='POST'){
      if(body.confirmedInvitation!==true||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>5)throw Object.assign(Error('Confirma el envío y selecciona entre 1 y 5 destinatarios por solicitud.'),{status:400});
      const results=[];
      for(const id of new Set(body.ids)){
        const row=db.prepare('SELECT * FROM enrolment_roster WHERE id=?').get(String(id));
        if(!row||['minor','legacy_unconfirmed'].includes(row.age_status)||!canInvite(row.email)){results.push({id,status:'blocked',message:'Contacto no habilitado, edad antigua por revisar o registrado como menor. No se envió.'});continue;}
        const active=db.prepare("SELECT id FROM invites WHERE email=? AND (state IN ('review','approved') OR (state='pending' AND expires>?)) LIMIT 1").get(row.email,Date.now());
        if(active){results.push({id,status:'skipped',message:'Ya existe una invitación vigente o foto recibida.'});continue;}
        const result=await issueInvitation({name:row.name,email:row.email,sendEmail:true});
        db.prepare('UPDATE enrolment_roster SET last_invite=?,delivery=? WHERE id=?').run(result.id,result.delivery,id);
        results.push({id,status:result.emailAccepted?'accepted':'unconfirmed',message:result.delivery});
      }
      return {results};
    }
    return null;
  };
}
