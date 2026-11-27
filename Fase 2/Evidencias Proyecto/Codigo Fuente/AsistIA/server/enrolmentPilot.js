import { vincularParticipante } from './vincularParticipante.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createEnrollmentCampaign,readEnrollmentCandidates } from './enrollmentCampaign.js';

export const PILOT_EMAIL = 'usuario12@example.com';
export const PILOT_ID = 'ashly-tapia';

export function createLabClient({ base = 'http://127.0.0.1:5180', keyFile = new URL('../../asistia-biometria-lab/data/admin.key', import.meta.url) } = {}) {
  const parsed = new URL(base);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw Error('El puente del laboratorio debe ser local.');
  let cookie, expires=0;
  async function login() {
    const response=await fetch(new URL('/api/login',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:readFileSync(keyFile,'utf8').trim()}),signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw Error('No se pudo conectar al laboratorio.');
    cookie=response.headers.get('set-cookie')?.split(';')[0];expires=Date.now()+50*60000;
  }
  return async function request(path, body, binary=false) {
    if(!cookie || expires<Date.now()) await login();
    const call=()=>fetch(new URL('/api/admin/'+path,base),{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path==='photo-review'||path==='roster/send'||path.startsWith('biometric/')?120000:30000)});
    let response=await call();if(response.status===401){await login();response=await call();}
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Object.assign(Error(error.error||'No se pudo completar la operación del laboratorio.'),{status:response.status});}
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
}

export function createEnrolmentPilotHandler({ getAccess, readBody, dbFirebase, labRequest = createLabClient(), store, listInvitationCandidates }) {
  const pilotStore=store || {
    async get(){const doc=await dbFirebase.collection('enrolamiento_piloto').doc(PILOT_ID).get();return doc.exists?doc.data():null;},
    async participants(){const result=await dbFirebase.collection('enrolamientos').limit(500).get();return result.docs.map(doc=>doc.data()).filter(row=>row.email).map(row=>({email:row.email,name:row.nombre||row.name||'',state:row.state,updatedAt:row.updatedAt,latestInviteId:row.latestInviteId,photoReview:row.photoReview}));},
    async record(data,actor,action){
      const batch=dbFirebase.batch();
      batch.set(dbFirebase.collection('enrolamiento_piloto').doc(PILOT_ID),data,{merge:true});
      batch.set(dbFirebase.collection('auditoria').doc(),{usuarioId:actor.id,correoUsuario:actor.email,rol:actor.role,accion:action,modulo:'Enrolamiento piloto',registroId:PILOT_ID,fecha:new Date().toISOString(),resultado:'Correcto',detalle:{email:PILOT_EMAIL,soloPiloto:true}});
      await batch.commit();
    },
    async recordParticipant(data,actor,action,email){
      const id=createHash('sha256').update(email.toLowerCase()).digest('hex');
      const batch=dbFirebase.batch();
      batch.set(dbFirebase.collection('enrolamientos').doc(id),{email,...data},{merge:true});
      batch.set(dbFirebase.collection('auditoria').doc(),{usuarioId:actor.id,correoUsuario:actor.email,rol:actor.role,accion:action,modulo:'Enrolamiento',registroId:id,fecha:new Date().toISOString(),resultado:'Correcto'});
      await batch.commit();
    },
    async recordCampaign(data,actor,action){
      const batch=dbFirebase.batch();
      batch.set(dbFirebase.collection('enrolamiento_campanas').doc(data.campaignId),{...data,updatedAt:new Date().toISOString(),actor:actor.id},{merge:true});
      batch.set(dbFirebase.collection('auditoria').doc(),{usuarioId:actor.id,correoUsuario:actor.email,rol:actor.role,accion:action,modulo:'Enrolamiento',registroId:data.campaignId,fecha:new Date().toISOString(),resultado:'Lote procesado'});
      await batch.commit();
    },
  };
  const campaign=createEnrollmentCampaign({labRequest,record:(data,actor,action)=>pilotStore.recordCampaign?pilotStore.recordCampaign(data,actor,action):pilotStore.record(data,actor,action),listCandidates:listInvitationCandidates||(()=>readEnrollmentCandidates(dbFirebase,labRequest))});
  return async function handle(req,res) {
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/enrolamiento/'))return false;
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;};
    try {
      const access=getAccess(req);
      if(!access.ok || !access.session?.firebaseUid)return send(401,{ok:false,message:'Inicia sesión en AsistIA.'});
      const admin=access.user.role==='Administradora';
      const own=String(access.user.email).toLowerCase()===PILOT_EMAIL;
      if(!admin && !own)return send(403,{ok:false,message:'Este piloto está limitado a Ashly y administración.'});
      if(req.method!=='GET' && (!admin || access.isDemo))return send(403,{ok:false,message:access.isDemo?'La cuenta demo es de solo lectura.':'Solo administración puede gestionar el piloto.'});
      if(url.pathname.startsWith('/api/enrolamiento/campana/')){
        if(!admin)return send(403,{ok:false,message:'Solo administración puede preparar invitaciones a la base.'});
        if(req.method!=='POST')return send(405,{ok:false,message:'Método no permitido.'});
        const action=url.pathname==='/api/enrolamiento/campana/vista-previa'?'preview':url.pathname==='/api/enrolamiento/campana/enviar'?'send':null;
        if(!action)return send(404,{ok:false,message:'Operación de campaña inexistente.'});
        return send(200,{ok:true,...await campaign(action,await readBody(req),access.user)});
      }
      // ASISTIA PASO 261 - ASIGNATURAS DEL PILOTO
      if(url.pathname==='/api/enrolamiento/piloto/cursos'){
        if(!admin || access.isDemo)
          return send(403,{ok:false,message:'Solo administracion autorizada.'});

        if(req.method!=='GET')
          return send(405,{ok:false,message:'Metodo no permitido.'});

        const demo=await dbFirebase.collection('usuarios')
          .doc('mfocD4TcwOfnApbXqQxJIezra4F3').get();

        const demoId=demo.data()?.alumnoId;

        if(!demoId)
          return send(409,{ok:false,message:'No existe la ficha demo.'});

        const matriculas=await dbFirebase.collection('matriculas')
          .where('alumnoId','==',demoId).get();

        const ids=[...new Set(matriculas.docs
          .filter(d=>d.data().estado==='Activo' && d.data().esDemo===true)
          .map(d=>d.data().cursoId)
          .filter(Boolean))];

        const cursos=await Promise.all(ids.map(async id=>{
          const doc=await dbFirebase.collection('cursos').doc(id).get();
          const curso=doc.data()||{};

          return {
            id,
            nombre:curso.asignatura||curso.nombre||id,
            seccion:curso.seccion||''
          };
        }));

        return send(200,{ok:true,cursos});
      }

      // ASISTIA PASO 260 - VINCULACION ACADEMICA
      if(url.pathname==='/api/enrolamiento/piloto/vincular'){
        if(!admin || access.isDemo)
          return send(403,{ok:false,message:'Solo administracion autorizada.'});

        if(req.method!=='POST')
          return send(405,{ok:false,message:'Metodo no permitido.'});

        const data=await readBody(req);

        if(data.confirmed!==true)
          return send(400,{ok:false,message:'Confirma la vinculacion academica de prueba.'});

        const resultado=await vincularParticipante(
          data.email,
          data.cursos
        );

        return send(200,{
          ok:true,
          ...resultado,
          message:'Alumno vinculado correctamente con '+resultado.matriculas+' asignaturas de prueba.'
        });
      }

      // ASISTIA PASO 257 - AUTORIZACION INDIVIDUAL
      if(url.pathname==='/api/enrolamiento/piloto/autorizar'){
        if(!admin || access.isDemo)
          return send(403,{ok:false,message:'Solo administracion autorizada.'});

        if(req.method!=='POST')
          return send(405,{ok:false,message:'Metodo no permitido.'});

        const data=await readBody(req);
        const email=String(data.email||'').trim().toLowerCase();

        if(!/^[^\s@]+@duocuc\.cl$/.test(email) || data.confirmed!==true)
          return send(400,{ok:false,message:'Confirma el correo institucional y la participacion voluntaria.'});

        const usuarios=await dbFirebase.collection('usuarios')
          .where('email','==',email).limit(2).get();

        if(usuarios.size!==1)
          return send(404,{ok:false,message:'Debe existir una cuenta institucional registrada y aprobada.'});

        const usuario=usuarios.docs[0];
        const perfil=usuario.data();
        const uid=usuario.id;

        if(perfil.activo!==true || perfil.rol!=='Alumno')
          return send(403,{ok:false,message:'La cuenta debe estar activa y tener rol Alumno.'});

        const alumnoId=String(perfil.alumnoId||'');

        if(!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))
          return send(409,{ok:false,message:'Falta vincular la ficha academica del alumno.'});

        const alumno=await dbFirebase.collection('alumnos').doc(alumnoId).get();

        if(!alumno.exists || alumno.data().firebaseUid!==uid ||
           alumno.data().estado!=='Activo' || alumno.data().esDemo!==true)
          return send(409,{ok:false,message:'Se requiere una ficha academica activa del piloto.'});

        const batch=dbFirebase.batch();

        batch.set(dbFirebase.collection('participantes_piloto').doc(uid),{
          firebaseUid:uid,
          alumnoId,
          email,
          activo:true,
          mayorEdadConfirmada:false,
          autorizacionAdministrativa:true,
          autorizadoPor:access.user.email,
          autorizadoAt:new Date().toISOString()
        });

        batch.set(dbFirebase.collection('auditoria').doc(),{
          usuarioId:access.user.id,
          correoUsuario:access.user.email,
          rol:access.user.role,
          accion:'Autorizar participante del piloto facial',
          modulo:'Enrolamiento',
          registroId:uid,
          fecha:new Date().toISOString(),
          resultado:'Correcto'
        });

        await batch.commit();

        return send(200,{
          ok:true,
          message:'Participante autorizada. Falta completar su consentimiento y enrolamiento individual.'
        });
      }

      const pilot=await pilotStore.get();
      if(!admin&&(!pilot || pilot.email!==PILOT_EMAIL || pilot.enabled!==true))return send(409,{ok:false,message:'Tu ficha de enrolamiento no está habilitada.'});
      const roster=admin ? await labRequest('roster') : {participants:[]};
      const savedParticipants=admin&&pilotStore.participants?await pilotStore.participants():[];
      const people=new Map();
      if(pilot?.email===PILOT_EMAIL)people.set(PILOT_EMAIL,{email:PILOT_EMAIL,name:pilot.name||'Participante',adult:true,state:pilot.state,latestInviteId:pilot.latestInviteId,updatedAt:pilot.updatedAt,photoReview:pilot.photoReview});
      for(const row of savedParticipants){const email=String(row.email).toLowerCase();people.set(email,{...people.get(email),...row,email,name:row.name||people.get(email)?.name||''});}
      for(const row of roster.participants){const email=row.email.toLowerCase();people.set(email,{...people.get(email),...row,email});}
      if(url.pathname.startsWith('/api/enrolamiento/contactos')){
        if(!admin)return send(403,{ok:false,message:'Solo administración puede gestionar la carga masiva.'});
        const operations={'/api/enrolamiento/contactos':'roster','/api/enrolamiento/contactos/plantilla':'roster/template','/api/enrolamiento/contactos/vista-previa':'roster/preview','/api/enrolamiento/contactos/importar':'roster/import','/api/enrolamiento/contactos/enviar':'roster/send'};
        const target=operations[url.pathname];
        if(!target)return send(404,{ok:false,message:'Operación de contactos inexistente.'});
        if((['roster','roster/template'].includes(target)?'GET':'POST')!==req.method)return send(405,{ok:false,message:'Método no permitido.'});
        const result=await labRequest(target,req.method==='GET'?undefined:await readBody(req));
        if(target==='roster/import'||target==='roster/send')await pilotStore.record({lastBatchActionAt:new Date().toISOString()},access.user,target==='roster/import'?'Importación de contactos de enrolamiento':'Envío de invitaciones en lote');
        return send(200,{ok:true,...result});
      }
      const state=await labRequest('state');
      const allowedEmails=new Set([PILOT_EMAIL,...people.keys()]);
      const invites=state.invites.filter(row=>allowedEmails.has(row.email.toLowerCase()));
      const matching=id=>invites.find(row=>row.id===id);
      if(url.pathname==='/api/enrolamiento/biometria/completar'&&req.method==='POST'){
        if(!admin)return send(403,{ok:false,message:'Solo administración puede completar el registro.'});
        const body=await readBody(req),row=matching(body.id);
        if(!row)return send(404,{ok:false,message:'Registro fuera del ámbito administrativo.'});
        const result=await labRequest('biometric/complete',{id:row.id});
        const metadata={persistentEnrollment:{id:result.enrollment.id,inviteId:row.id,stateObserved:result.enrollment.state,expires:result.enrollment.expires,observedAt:new Date().toISOString()}};
        if(pilotStore.recordParticipant)await pilotStore.recordParticipant(metadata,access.user,'Generación del registro con consentimiento único',row.email);
        else await pilotStore.record(metadata,access.user,'Generación del registro con consentimiento único');
        return send(200,{ok:true,...result});
      }
      if(url.pathname==='/api/enrolamiento/invitacion/reenviar'&&req.method==='POST'){
        if(!admin)return send(403,{ok:false,message:'Solo administración puede reenviar invitaciones.'});
        const body=await readBody(req),row=matching(body.id);
        if(!row)return send(404,{ok:false,message:'Invitación fuera del ámbito administrativo.'});
        const result=await labRequest('invites/resend',{id:row.id,confirmed:body.confirmed});
        const metadata={latestInviteId:result.id,updatedAt:new Date().toISOString(),lastDelivery:result.delivery};
        if(pilotStore.recordParticipant)await pilotStore.recordParticipant(metadata,access.user,'Reenvío de invitación',row.email);
        else await pilotStore.record(metadata,access.user,'Reenvío de invitación');
        return send(200,{ok:true,message:result.delivery+' El enlace anterior fue reemplazado.'});
      }
      if(url.pathname==='/api/enrolamiento/biometria/autorizar-por-correo'&&req.method==='POST'){
        if(!admin)return send(403,{ok:false,message:'Solo administración puede enviar autorizaciones.'});
        const body=await readBody(req);
        if(!matching(body.id))return send(404,{ok:false,message:'Registro fuera del ámbito administrativo.'});
        const result=await labRequest('biometric/consent-invitation',{id:body.id,confirmed:body.confirmed});
        await pilotStore.record({lastBiometricInvitationAt:new Date().toISOString()},access.user,'Envío de nueva autorización biométrica');
        return send(200,{ok:true,...result});
      }
      if(url.pathname.startsWith('/api/enrolamiento/biometria')){
        const biometrics=await labRequest('biometric/state');
        const visible=biometrics.enrollments.filter(row=>allowedEmails.has(String(row.email).toLowerCase())||matching(row.inviteId));
        if(url.pathname==='/api/enrolamiento/biometria'&&req.method==='GET')return send(200,{ok:true,...biometrics,enrollments:visible});
        if(!admin)return send(403,{ok:false,message:'Solo administración puede gestionar plantillas.'});
        const operations={'/api/enrolamiento/biometria/convertir':'biometric/enroll','/api/enrolamiento/biometria/retirar':'biometric/revoke'};
        const target=operations[url.pathname];
        if(!target||req.method!=='POST')return send(404,{ok:false,message:'Operación biométrica inexistente.'});
        const body=await readBody(req);
        if(!visible.some(row=>row.id===body.id))return send(404,{ok:false,message:'Registro fuera del ámbito administrativo.'});
        const result=await labRequest(target,{id:body.id,confirmed:body.confirmed});
        const source=visible.find(row=>row.id===body.id);
        const participantEmail=source.email||matching(source.inviteId)?.email;
        const metadata={lastBiometricActionAt:new Date().toISOString(),persistentEnrollment:{id:result.enrollment.id,inviteId:result.enrollment.inviteId,stateObserved:result.enrollment.state,observedAt:new Date().toISOString(),expires:result.enrollment.expires}};
        const action=target==='biometric/enroll'?'Conversión real a plantilla facial':'Retirada de plantilla facial';
        if(pilotStore.recordParticipant&&participantEmail)await pilotStore.recordParticipant(metadata,access.user,action,participantEmail);
        else await pilotStore.record(metadata,access.user,action);
        return send(200,{ok:true,...result});
      }
      if(['/api/enrolamiento/piloto','/api/enrolamiento/resumen'].includes(url.pathname) && req.method==='GET'){
        const biometricState=await labRequest('biometric/state');
        const enrollments=biometricState.enrollments.filter(row=>allowedEmails.has(String(row.email).toLowerCase())||matching(row.inviteId));
        return send(200,{ok:true,enrollments,pilot:pilot?{name:pilot.name,email:pilot.email,firebaseUid:pilot.firebaseUid||null,academicRecordLinked:!!pilot.alumnoId}:null,participants:[...people.values()],canManage:admin&&!access.isDemo,recognitionEnabled:false,invites:invites.map(row=>({id:row.id,name:people.get(row.email.toLowerCase())?.name||row.name,email:row.email,state:row.state,verified:!!row.verified,emailVerifiedAt:row.email_verified_at||null,consentInvitationSentAt:state.events?.find(event=>event.invite_id===row.id&&event.kind==='biometric_invitation_attempt')?.created||null,authorized:!!row.consent,hasImage:!!row.hasImage,photoDeletedAt:row.photo_deleted_at,created:row.created,expires:row.expires,review:row.photo_review?JSON.parse(row.photo_review):null,consent:admin&&row.consent?JSON.parse(row.consent):undefined}))});
      }
      if(!admin)return send(403,{ok:false,message:'Solo administración puede realizar esta operación.'});
      if(url.pathname==='/api/enrolamiento/eliminar-foto'&&req.method==='POST'){
        const data=await readBody(req),row=matching(data.id);
        if(!row)return send(404,{ok:false,message:'Registro fuera del piloto.'});
        const result=await labRequest('photo-delete',{id:row.id,confirmed:data.confirmed});
        await pilotStore.record({updatedAt:new Date().toISOString(),lastPhotoDeletion:row.id},access.user,'Eliminación de foto temporal');
        return send(200,{ok:true,message:result.message});
      }
      if(url.pathname==='/api/enrolamiento/foto' && req.method==='GET'){
        if(!matching(url.searchParams.get('id')))return send(404,{ok:false,message:'Foto fuera del piloto.'});
        const image=await labRequest('photo?id='+encodeURIComponent(url.searchParams.get('id')),undefined,true);
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(image);return true;
      }
      if(url.pathname==='/api/enrolamiento/invitacion' && req.method==='POST'){
        const data=await readBody(req);
        const targetEmail=String(data.email||PILOT_EMAIL).trim().toLowerCase();
        if(!allowedEmails.has(targetEmail))return send(404,{ok:false,message:'Primero incorpora al participante desde la lista de contactos autorizados.'});
        if(data.authorizedInvitation!==true)return send(400,{ok:false,message:'Confirma que puedes enviar esta invitación. La persona declarará su mayoría de edad al abrirla.'});
        if(invites.some(row=>row.email.toLowerCase()===targetEmail&&(row.state==='review' || row.state==='approved' || row.state==='pending'&&row.expires>Date.now())))return send(409,{ok:false,message:'Ya hay una invitación vigente o foto recibida para esta persona. Revisa su estado antes de reenviar.'});
        const result=await labRequest('invites',{name:people.get(targetEmail)?.name||'Participante voluntario',email:targetEmail,invitationOnly:true,fictitious:true,sendEmail:true});
        const metadata={latestInviteId:result.id,updatedAt:new Date().toISOString(),lastDelivery:result.delivery};
        if(pilotStore.recordParticipant)await pilotStore.recordParticipant(metadata,access.user,'Invitación de enrolamiento',targetEmail);
        else await pilotStore.record(metadata,access.user,'Invitación de enrolamiento');
        return send(201,{ok:true,message:result.delivery});
      }
      if(url.pathname==='/api/enrolamiento/revision' && req.method==='POST'){
        const data=await readBody(req),row=matching(data.id);
        if(!row)return send(404,{ok:false,message:'Registro fuera del piloto.'});
        if(row.state!=='review')return send(409,{ok:false,message:'La foto ya no está pendiente de revisión.'});
        if(!['approve','reject'].includes(data.decision) || typeof data.note!=='string' || data.note.trim().length<12 || data.note.length>500)return send(400,{ok:false,message:'Elige una decisión y escribe el motivo (12 a 500 caracteres).'});
        if(data.decision==='approve' && (data.qualityChecked!==true || data.authorizationChecked!==true))return send(400,{ok:false,message:'Revisa calidad y autorización antes de aceptar.'});
        if(data.decision==='approve'&&!row.verified){
          if(data.identityChecked!==true || typeof data.evidence!=='string' || data.evidence.trim().length<12)return send(400,{ok:false,message:'Registra una revisión real de identidad por canal independiente.'});
          await labRequest('verify',{id:row.id,identityChecked:true,evidence:data.evidence});
        }
        const result=await labRequest('photo-review',{id:row.id,decision:data.decision,note:data.note,qualityChecked:data.qualityChecked,authorizationChecked:data.authorizationChecked});
        const reviewMetadata={latestInviteId:row.id,state:result.state,photoReview:{...(result.review||{}),reviewedBy:access.user.email},recognitionEnabled:false,updatedAt:new Date().toISOString()};
        if(result.enrollment)reviewMetadata.persistentEnrollment={id:result.enrollment.id,inviteId:row.id,stateObserved:result.enrollment.state,expires:result.enrollment.expires,observedAt:new Date().toISOString()};
        if(pilotStore.recordParticipant)await pilotStore.recordParticipant(reviewMetadata,access.user,'Revisión de enrolamiento',row.email);
        else await pilotStore.record(reviewMetadata,access.user,'Revisión de enrolamiento');
        const completion=result.enrollment?.templateReady?' Enrolamiento registrado: la plantilla quedó guardada. '+(result.enrollmentNotificationStatus==='accepted'?'Gmail aceptó el correo de confirmación.':'El correo de confirmación está pendiente o no confirmado.'):result.singleConsent?' No se pudo generar la plantilla. Consulta el motivo y reintenta en Estado del enrolamiento; la foto y el consentimiento se conservan dentro de sus plazos. '+(result.automaticError||''):' El aviso anterior solo autorizaba la foto. Este registro necesita actualización de consentimiento antes de generar la plantilla.';
        return send(200,{ok:true,state:result.state,notificationStatus:result.notificationStatus,message:result.state==='approved'?'Foto aceptada.'+completion:'Foto rechazada y eliminada del laboratorio.'});
      }
      return send(404,{ok:false,message:'Operación de enrolamiento inexistente.'});
    }catch(error){return send(error.status||503,{ok:false,message:error.status?error.message:'No se pudo conectar al piloto. Revisa que el laboratorio esté activo.'});}
  };
}




