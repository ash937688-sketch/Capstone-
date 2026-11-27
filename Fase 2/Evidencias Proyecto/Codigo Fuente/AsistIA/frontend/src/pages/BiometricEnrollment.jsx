import { useCallback, useEffect, useState } from 'react'

export default function BiometricEnrollment({request,canManage,onChanged,invites=[]}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState('')
  const load=useCallback(async()=>{setData(await request('biometria'))},[request])
  useEffect(()=>{
    let active=true
    const refresh=()=>request('biometria').then(result=>{if(active)setData(result)}).catch(err=>{if(active)setError(err.message)})
    refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},15000)
    return()=>{active=false;clearInterval(timer)}
  },[request])
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),8000);return()=>clearTimeout(timer)},[notice])
  async function act(person,action){
    if(action==='retirar'&&!window.confirm('¿Eliminar la plantilla de '+person.name+'? Dejará de estar disponible para reconocimiento.'))return
    if(action==='autorizar-por-correo'&&!window.confirm('¿Enviar una solicitud de consentimiento a '+person.email+'? El enlace anterior será reemplazado. No necesita otra foto mientras la actual esté disponible.'))return
    setBusy(person.email);setError('');setNotice('')
    try{
      const id=['completar','autorizar-por-correo'].includes(action)?person.invite.id:person.enrollment.id
      const result=await request('biometria/'+action,{id,confirmed:true})
      if(action==='autorizar-por-correo')setNotice(result.message)
      else if(action==='retirar')setNotice('Plantilla bloqueada y eliminación solicitada.')
      else if(result.enrollment?.templateReady)setNotice('Plantilla de '+person.name+' generada y guardada. No necesita volver a enrolarse.')
      else throw Error(result.enrollment?.lastError||'La generación no se confirmó. Revisa el estado del registro.')
      await load();await onChanged?.()
    }catch(err){setError(err.message);try{await load()}catch{/* Preserve the actionable error. */}}finally{setBusy('')}
  }
  const people=data?enrollmentProgress(invites,data.enrollments):[]
  return <section className="entity-card"><h2>Plantillas para el tótem</h2>
    <p><strong>La plantilla se genera antes de usar el tótem.</strong> El recorrido es: confirmar correo → consentir y enviar foto → revisar calidad → guardar plantilla. El tótem comparará una nueva captura con esa plantilla; no realiza el enrolamiento inicial.</p>
    {error&&<p className="page-notice" role="alert">{error}</p>}{notice&&<p className="page-notice" role="status">{notice}</p>}
    {!data?<p>Cargando estado real del servidor…</p>:<>
      <p className="enrol-info"><strong>{people.filter(p=>p.ready).length} plantillas listas de {people.length} participantes.</strong> El reconocimiento del tótem todavía no está habilitado.</p>
      <button type="button" className="secondary-action" disabled={!!busy} onClick={()=>{setError('');load().catch(err=>setError(err.message))}}>Actualizar estados</button>
      <div className="table-wrap"><table><thead><tr><th>Participante</th><th>Estado y siguiente paso</th><th>Acción</th></tr></thead><tbody>{people.map(person=><tr key={person.email}>
        <td><strong>{person.name}</strong><small>{person.email}</small></td>
        <td><strong>{person.status}</strong>
          {person.ready&&<p>Ya está guardada. No debes generarla otra vez. Vigente hasta {new Date(person.enrollment.expires).toLocaleDateString('es-CL')}.</p>}
          {person.enrollment?.lastError&&<p role="alert">{person.enrollment.lastError}</p>}
          {person.retry&&<p>Usa la foto y el consentimiento existentes; reintentar no pide otro enrolamiento.</p>}
          {person.needsConsent&&<p>La foto ya está aceptada, pero el aviso que aceptó esta persona solo cubría la fotografía. Debe autorizar la plantilla desde su correo, una sola vez.{person.invite.consentInvitationSentAt&&<> Solicitud enviada el {new Date(person.invite.consentInvitationSentAt).toLocaleString('es-CL')}.</>}</p>}
          {person.invite?.state==='review'&&!person.ready&&<p>Revisa la calidad en Participantes. Al aceptar se genera automáticamente.</p>}
          {person.enrollment?.needsNewPhoto&&<p>El respaldo venció; ya no puede reintentarse con esa foto.</p>}
        </td><td>
          {canManage&&(person.retry||person.complete)&&<button type="button" disabled={!!busy||!data.configured||person.enrollment?.needsNewPhoto} onClick={()=>act(person,person.complete?'completar':'convertir')}>{busy===person.email?'Generando y guardando…':'Reintentar con la foto guardada'}</button>}
          {canManage&&person.needsConsent&&person.invite.hasImage&&<button type="button" disabled={!!busy} onClick={()=>act(person,'autorizar-por-correo')}>{busy===person.email?'Enviando…':person.invite.consentInvitationSentAt?'Reenviar solicitud de consentimiento':'Solicitar consentimiento por correo'}</button>}
          {person.ready&&<span>Completado</span>}
          {canManage&&person.enrollment&&!['deleted','deletion_pending'].includes(person.enrollment.state)&&<details><summary>Privacidad</summary><p>Esta acción elimina la plantilla; no forma parte del enrolamiento normal.</p><button type="button" className="secondary-action" disabled={!!busy} onClick={()=>act(person,'retirar')}>Eliminar plantilla</button></details>}
        </td></tr>)}</tbody></table></div>
      {!people.length&&<p>No hay registros de enrolamiento todavía.</p>}
      <details className="enrol-details"><summary>Procesamiento y conservación</summary><p>Motor: {data.provider||'Sin configurar'}. La foto se conserva hasta siete días desde la invitación; la plantilla tiene el plazo informado en el consentimiento. El control del correo no demuestra por sí solo que la foto pertenezca al titular. Antes de usar asistencia real faltan validar comparación y detección de suplantaciones.</p></details>
    </>}
  </section>
}

function enrollmentProgress(invites,enrollments){
  const people=new Map()
  for(const row of [...invites].sort((a,b)=>a.created-b.created))people.set(row.email,{email:row.email,name:row.name||row.email,invite:row})
  for(const row of [...enrollments].sort((a,b)=>a.created-b.created)){
    if(!row.email)continue
    const person=people.get(row.email)||{email:row.email,name:row.email}
    people.set(row.email,{...person,enrollment:row})
  }
  return [...people.values()].map(person=>{
    const {invite,enrollment}=person
    const ready=!!enrollment?.templateReady
    const retry=enrollment&&['authorized','indexing'].includes(enrollment.state)
    const complete=!enrollment&&invite?.state==='approved'&&invite?.consent?.captureIncludesRecognition
    const needsConsent=!enrollment&&invite?.state==='approved'&&!invite?.consent?.captureIncludesRecognition
    const status=ready?'Plantilla lista':retry?(enrollment.lastError?'Generación fallida':'Generación pendiente'):complete?'Generación pendiente':needsConsent?'Falta consentimiento para la plantilla':invite?.state==='review'?'Foto por revisar':invite?.state==='pending'?'Esperando fotografía':enrollment?.state==='deleted'?'Plantilla eliminada':enrollment?.state==='deletion_pending'?'Plantilla bloqueada':'Sin enrolamiento vigente'
    return {...person,ready,retry,complete,needsConsent,status}
  }).sort((a,b)=>a.name.localeCompare(b.name,'es'))
}
