import { randomUUID,createHash } from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
export async function readEnrollmentCandidates(dbFirebase,labRequest){
  const collections=await Promise.all(['usuarios','alumnos'].map(name=>dbFirebase.collection(name).select('nombre','nombres','apellidos','correo','email','activo','estado','alcance','mayorDeEdad').limit(5001).get()));
  const rows=[];
  collections.forEach((snapshot,index)=>snapshot.docs.forEach(doc=>{const value=doc.data();rows.push({name:value.nombre||[value.nombres,value.apellidos].filter(Boolean).join(' ')||'Participante',email:value.correo||value.email||'',source:index?'Alumnos':'Usuarios',inactive:value.activo===false||['inactivo','deshabilitado','retirado'].includes(String(value.estado||'').toLowerCase()),technical:value.alcance==='enrolamiento-piloto',ageStatus:value.mayorDeEdad===false?'minor':value.mayorDeEdad===true?'adult':'unknown'});}));
  const roster=await labRequest('roster');
  for(const person of roster.participants)rows.push({name:person.name,email:person.email,course:person.course,ageStatus:person.ageStatus||'unknown',source:'Contactos de enrolamiento'});
  return rows;
}
export function createEnrollmentCampaign({listCandidates,labRequest,record,now=Date.now}){
  const plans=new Map();
  return async function campaign(action,body,actor){
    for(const [id,plan]of plans)if(plan.expires<now()&&!plan.busy)plans.delete(id);
    if(action==='preview'){
      const candidates=await listCandidates();if(candidates.length>5000)fail(413,'La base supera 5000 registros. No se preparó ni envió una lista parcial.');
      const rows=[],seen=new Map();let duplicates=0;
      for(const candidate of candidates){
        const email=String(candidate.email||'').trim().toLowerCase();
        const name=String(candidate.name||'Participante').trim().slice(0,100);
        let reason=candidate.inactive?'Registro inactivo':candidate.technical?'Cuenta administrativa compartida o técnica':candidate.ageStatus==='minor'?'Registrado como menor de edad':null;
        if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||email.length>254)reason='Correo ausente o inválido';
        const course=String(candidate.course||'Base de AsistIA').slice(0,100);
        if(!name||/[\r\n]/.test(name+course)||/^[=+@-]/.test(name)||/^[=+@-]/.test(course))reason='Nombre o grupo no válido para importación';
        if(seen.has(email)&&email){duplicates++;const previous=seen.get(email);if(reason){previous.reason=reason;previous.eligible=false;}if(candidate.ageStatus==='minor')previous.ageStatus='minor';continue;}
        const row={id:createHash('sha256').update(email||String(rows.length)).digest('hex'),name,email,course,ageStatus:candidate.ageStatus||'unknown',source:candidate.source||'Base',reason,eligible:!reason};rows.push(row);if(email)seen.set(email,row);
      }
      const check=rows.filter(row=>row.eligible);
      for(let index=0;index<check.length;index+=100){const result=await labRequest('roster/check',{emails:check.slice(index,index+100).map(row=>row.email),databasePreview:true});for(const item of result.results){const row=check.find(value=>value.email===item.email);if(row&&!item.eligible){row.reason=item.reason;row.eligible=false;}}}
      const id=randomUUID(),expires=now()+15*60000;
      if([...plans.values()].filter(plan=>plan.actor===actor.id).length>=10)fail(429,'Ya hay varias vistas previas abiertas. Espera a que venzan.');
      const recipients=rows.filter(row=>row.eligible);
      plans.set(id,{actor:actor.id,expires,recipients,next:0,busy:false,results:[]});
      return {id,expires,total:candidates.length,unique:rows.length,duplicates,eligible:recipients.length,excluded:rows.length-recipients.length,rows};
    }
    if(action!=='send')fail(404,'Operación de campaña inexistente.');
    const plan=plans.get(body.id);
    if(!plan||plan.actor!==actor.id||plan.expires<now())fail(409,'La vista previa venció o no pertenece a tu sesión. Prepara la lista nuevamente.');
    if(body.confirmed!==true)fail(400,'Confirma que revisaste la lista y autorizas las invitaciones a esa base.');
    if(plan.busy)fail(409,'Ya se está procesando este lote. Revisa el avance antes de repetir.');
    if(body.offset!==plan.next)fail(409,'El avance cambió. No se repite automáticamente un lote anterior.');
    const batch=plan.recipients.slice(plan.next,plan.next+5);if(!batch.length)return {next:plan.next,done:true,results:[],total:plan.recipients.length};
    plan.busy=true;
    try{
      const csv='nombre;correo;curso;mayor_de_edad\n'+batch.map(row=>[row.name,row.email,row.course,row.ageStatus==='adult'?'si':'pendiente'].map(quote).join(';')).join('\n');
      await labRequest('roster/import',{csv,confirmedAuthority:true});
      await labRequest('roster/authorize-invitations',{emails:batch.map(row=>row.email),confirmed:true});
      const result=await labRequest('roster/send',{ids:batch.map(row=>row.id),confirmedInvitation:true});
      plan.next+=batch.length;plan.results.push(...result.results);plan.expires=now()+15*60000;
      await record({campaignId:body.id,processed:plan.next,total:plan.recipients.length},actor,'Envío de invitaciones a la base revisada');
      const done=plan.next>=plan.recipients.length,halted=result.results.some(row=>row.status==='unconfirmed');
      if(done||halted)plans.delete(body.id);
      return {next:plan.next,done,halted,total:plan.recipients.length,results:result.results};
    }catch(error){plans.delete(body.id);throw error;}finally{plan.busy=false;}
  };
}
