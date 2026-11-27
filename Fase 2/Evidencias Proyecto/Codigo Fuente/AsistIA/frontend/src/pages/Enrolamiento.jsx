import AutorizacionPiloto from './AutorizacionPiloto.jsx'
import { useCallback, useEffect, useState } from 'react'
import { Users, Camera, CheckCircle2, Send, Search, ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import './Enrolamiento.css'
import BatchEnrolamiento from './BatchEnrolamiento.jsx'
import CampaignEnrolamiento from './CampaignEnrolamiento.jsx'
import BiometricEnrollment from './BiometricEnrollment.jsx'
import { enrollmentView, enrollmentLabels, templateLabel, formatEnrollmentDate as date } from './enrollmentView.js'

const emptyReview = { qualityChecked:false,authorizationChecked:false,identityChecked:false,method:'',evidence:'',note:'' }
const tabs = [{id:'people',label:'Participantes'},{id:'invitations',label:'Invitaciones'},{id:'accepted',label:'Fotos aceptadas'},{id:'recognition',label:'Estado del enrolamiento'}]

export default function Enrolamiento() {
  const { token,user,logout } = useAuth()
  const [data,setData] = useState(null),[loading,setLoading] = useState(true)
  const [error,setError] = useState(''),[notice,setNotice] = useState(''),[saving,setSaving] = useState(false)
  const [tab,setTab] = useState('people'),[search,setSearch] = useState(''),[selected,setSelected] = useState(null)
  const [photo,setPhoto] = useState(''),[review,setReview] = useState(emptyReview),[reviewError,setReviewError] = useState('')
  const [recipient,setRecipient] = useState(''),[requested,setRequested] = useState(false)
  const admin = user?.role === 'Administradora'
  const request = useCallback(async (path,body) => {
    const response = await fetch('/api/enrolamiento/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
    const result = await response.json()
    if(response.status===401){logout();throw Error('Tu sesión venció. Ingresa nuevamente para continuar.')}
    if(!response.ok || !result.ok)throw Error(result.message || 'No se pudo completar la operación.')
    return result
  },[token,logout])
  const load = useCallback(async () => {
    setLoading(true);setError('')
    try{setData(await request('resumen'))}catch(err){setError(err.message)}finally{setLoading(false)}
  },[request])
  useEffect(()=>{
    let active=true
    request('resumen').then(result=>{if(active)setData(result)}).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[request])
  useEffect(()=>{
    const timer=setInterval(()=>{if(document.visibilityState==='visible')request('resumen').then(setData).catch(()=>{})},15000)
    return()=>clearInterval(timer)
  },[request])
  useEffect(()=>{
    if(!notice)return
    const timer=setTimeout(()=>setNotice(''),8000)
    return()=>clearTimeout(timer)
  },[notice])
  useEffect(()=>{
    if(!selected?.hasImage)return
    let active=true,objectUrl
    const controller=new AbortController()
    fetch('/api/enrolamiento/foto?id='+encodeURIComponent(selected.id),{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(async response=>{if(response.status===401)logout();if(!response.ok)throw Error('La foto ya no está disponible o venció la sesión.');return response.blob()})
      .then(blob=>{objectUrl=URL.createObjectURL(blob);if(active)setPhoto(objectUrl);else URL.revokeObjectURL(objectUrl)})
      .catch(err=>{if(active&&err.name!=='AbortError')setReviewError(err.message)})
    return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[selected,token,logout])
  useEffect(()=>{
    if(!selected)return
    const close=event=>{if(event.key==='Escape'&&!saving)setSelected(null)}
    document.addEventListener('keydown',close)
    return()=>document.removeEventListener('keydown',close)
  },[selected,saving])
  const view=data?enrollmentView(data):{participants:[],approved:[],pending:[],waiting:[]}
  const filtered=view.participants.filter(person=>(person.name+' '+person.email).toLowerCase().includes(search.toLowerCase().trim()))
  const target=view.participants.find(person=>person.email===recipient)
  const blocked=target?.latest&&['review','approved','pending'].includes(target.latest.state)
  const open=row=>{setSelected(row);setPhoto('');setReview({...emptyReview});setReviewError('')}
  const update=event=>setReview(value=>({...value,[event.target.name]:event.target.type==='checkbox'?event.target.checked:event.target.value}))
  async function sendInvite(event){
    event.preventDefault();setSaving(true);setError('');setNotice('')
    try{const result=await request('invitacion',{email:recipient,authorizedInvitation:requested});setNotice(result.message);setRequested(false);await load()}catch(err){setError(err.message)}finally{setSaving(false)}
  }
  async function resend(){
    if(!window.confirm('¿Reemplazar el enlace anterior y enviar una nueva invitación a '+recipient+'? Debe usar el último correo.'))return
    setSaving(true);setError('')
    try{const result=await request('invitacion/reenviar',{id:target.latest.id,confirmed:true});setNotice(result.message);await load()}catch(err){setError(err.message)}finally{setSaving(false)}
  }
  async function saveReview(decision){
    setSaving(true);setReviewError('')
    try{
      if(decision==='approve'&&(!review.qualityChecked||!review.authorizationChecked))throw Error('Confirma que revisaste la foto y la autorización de la persona.')
      let evidence=selected.evidence||''
      if(decision==='approve'&&!selected.verified){
        if(!review.identityChecked)throw Error('Confirma que la foto corresponde a la persona indicada en la ficha.')
        evidence='La cuenta administradora confirmó que la foto corresponde a la persona de esta ficha.'
      }
      const note=review.note.trim()||(decision==='approve'?'Foto aceptada: rostro visible, calidad y autorización revisadas.':'')
      if(note.length<12)throw Error('Escribe una observación de al menos 12 caracteres, o déjala vacía al aceptar.')
      const result=await request('revision',{id:selected.id,...review,decision,note,evidence})
      setSelected(null);setNotice(result.message);if(decision==='approve')setTab('accepted');await load()
    }catch(err){setReviewError(err.message)}finally{setSaving(false)}
  }
  async function deletePhoto(){
    if(!window.confirm('¿Eliminar solo la foto temporal? La revisión y cualquier plantilla existente se conservan. Sin plantilla válida, hará falta otra captura.'))return
    setSaving(true);setReviewError('')
    try{const result=await request('eliminar-foto',{id:selected.id,confirmed:true});setSelected(null);setNotice(result.message);await load()}catch(err){setReviewError(err.message)}finally{setSaving(false)}
  }
  return <div className="entity-page enrolamiento-page">
    <header className="entity-header"><div><p className="entity-kicker">ADMINISTRACIÓN</p><h1>Enrolamiento</h1><p>Invita participantes, revisa sus fotos y consulta las aceptaciones.</p></div><div className="enrol-actions"><button className="secondary-action" onClick={load} disabled={loading||saving}>Actualizar</button>{admin&&<button className="primary-action" onClick={()=>setTab('invitations')}>Invitar participantes</button>}</div></header>
    {error&&<p className="page-notice" role="alert">{error}</p>}{notice&&<p className="page-notice" role="status">{notice}</p>}
    {loading&&!data&&<p role="status">Cargando participantes y revisiones…</p>}
    {data&&<>
      {admin&&!data.canManage&&<p className="enrol-info">Esta cuenta es de solo lectura. Usa la cuenta administrativa para enviar invitaciones o aceptar fotos.</p>}
      <div className="enrol-stats"><button onClick={()=>setTab('people')}><Users size={20}/><span><strong>{view.participants.length}</strong>Participantes</span></button><button onClick={()=>setTab('people')}><Camera size={20}/><span><strong>{view.pending.length}</strong>Fotos por revisar</span></button><button onClick={()=>setTab('accepted')}><CheckCircle2 size={20}/><span><strong>{view.approved.length}</strong>Fotos aceptadas</span></button><button onClick={()=>setTab(admin?'invitations':'people')}><Send size={20}/><span><strong>{view.waiting.length}</strong>Esperando fotografía</span></button></div>
      <nav className="enrol-tabs" aria-label="Secciones de enrolamiento" role="tablist">{tabs.filter(item=>admin||item.id!=='invitations').map(item=><button id={'tab-'+item.id} key={item.id} role="tab" aria-selected={tab===item.id} aria-controls={'panel-'+item.id} onClick={()=>setTab(item.id)}>{item.label}{item.id==='accepted'&&<span>{view.approved.length}</span>}</button>)}</nav>
      <section role="tabpanel" id={'panel-'+tab} aria-labelledby={'tab-'+tab}>
        {tab==='people'&&<section className="entity-card"><div className="enrol-section-title"><div><h2>Participantes</h2><p>Una fila por persona. Las invitaciones anteriores quedan en el historial.</p></div><label className="enrol-search"><Search size={17}/><input aria-label="Buscar participante por nombre o correo" placeholder="Buscar nombre o correo" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
          <div className="table-wrap"><table><thead><tr><th>Participante</th><th>Estado actual</th><th>Última revisión</th><th>Siguiente paso</th></tr></thead><tbody>{filtered.map(person=>{const row=person.latest;return <tr key={person.email}><td><strong>{person.name||'Participante'}</strong><small>{person.email}</small></td><td><span className={'enrol-status status-'+(row?.state||'none')}>{person.enrollment?templateLabel(person.enrollment):row?enrollmentLabels[row.state]||row.state:person.state==='approved'?'Aceptación registrada':'Sin invitación'}</span>{row?.state==='pending'&&<small>Enviada el {date(row.created)}</small>}</td><td>{row?.review?<><strong>{row.review.decision==='approve'?'Foto aceptada':'Foto rechazada'}</strong><small>{date(row.review.at)}</small></>:person.photoReview?.at?date(person.photoReview.at):'Todavía sin revisión'}</td><td>{admin&&row?.hasImage?<button className={row.state==='review'?'primary-action':'secondary-action'} onClick={()=>open(row)}>{row.state==='review'?'Revisar foto':'Ver aceptación'}</button>:row?.state==='pending'?<span>La persona debe enviar su foto</span>:admin?<button className="secondary-action" onClick={()=>{setRecipient(person.email);setRequested(false);setTab('invitations')}}>Gestionar invitación</button>:<span>Consulta a administración</span>}</td></tr>})}</tbody></table>{!filtered.length&&<p className="enrol-empty">No hay participantes que coincidan con la búsqueda.</p>}</div>
          <details className="enrol-details"><summary>Historial de invitaciones y revisiones</summary><p>Estos intentos no cambian la última aceptación registrada.</p>{view.participants.map(person=><section key={person.email}><h3>{person.name||person.email}</h3>{person.history.length?<ol className="enrol-history">{person.history.map(row=><li key={row.id}><strong>{enrollmentLabels[row.state]||row.state}</strong><span>{date(row.review?.at||row.created)}</span>{row.review?.note&&<p>{row.review.note}</p>}</li>)}</ol>:<p>Sin intentos en el registro temporal.</p>}</section>)}</details>
        </section>}
        {tab==='invitations'&&admin&&<><AutorizacionPiloto request={request} canManage={data.canManage}/><CampaignEnrolamiento request={request} canManage={data.canManage} onChanged={load}/><details className="enrol-details enrol-import" open={!!recipient}><summary>Casos individuales y reenvíos</summary><section className="entity-card"><h2>Gestionar una invitación individual</h2><p>Usa esta opción solo para un caso puntual o reemplazar un enlace. El envío general se prepara en el bloque de arriba.</p><form className="enrol-invite-form" onSubmit={sendInvite}><label>Participante<select value={recipient} required onChange={event=>{setRecipient(event.target.value);setRequested(false)}}><option value="">Seleccionar participante</option>{view.participants.map(person=><option key={person.email} value={person.email}>{person.name||'Participante'} · {person.email}</option>)}</select></label>
          {blocked?<div className="enrol-info"><strong>{enrollmentLabels[target.latest.state]}</strong><p>{target.latest.state==='pending'?'Ya existe una invitación para esta persona. Si necesitas otro correo, reemplaza el enlace anterior.':'Ya existe una foto recibida o aceptada. Consúltala en Participantes o Fotos aceptadas; no hace falta invitar otra vez.'}</p>{target.latest.state==='pending'&&<button type="button" className="secondary-action" disabled={!data.canManage||saving} onClick={resend}>Reenviar y reemplazar enlace</button>}</div>:<><p>La persona confirmará su mayoría de edad y consentimiento antes de aportar su foto.</p><label><input type="checkbox" checked={requested} onChange={event=>setRequested(event.target.checked)} required disabled={!data.canManage||saving}/>Tengo autorización para usar este correo y enviar la invitación.</label><button className="primary-action" disabled={!data.canManage||saving||!recipient}>{saving?'Enviando…':'Enviar invitación'}</button></>}
        </form></section></details><details className="enrol-details enrol-import"><summary>Importar una lista adicional desde CSV</summary><BatchEnrolamiento request={request} canManage={data.canManage} onChanged={load} importOnly/></details></>}
        {tab==='accepted'&&<section className="entity-card"><h2>Fotos aceptadas</h2><p>Aquí queda visible quién fue aceptado y cuándo. Ver una aceptación no vuelve a abrir el formulario de revisión.</p>{view.approved.length?<div className="table-wrap"><table><thead><tr><th>Participante</th><th>Fecha de aceptación</th><th>Registro de revisión</th><th>Foto</th></tr></thead><tbody>{view.approved.map(row=><tr key={row.id}><td><strong>{row.name||'Participante'}</strong><small>{row.email}</small><span className="enrol-status status-approved">Foto aceptada</span></td><td>{row.review?.at?date(row.review.at):<><span>Aceptación guardada</span>{row.recordedAt&&<small>Registro actualizado: {date(row.recordedAt)}</small>}</>}</td><td>{row.review?.note||'Aceptación registrada en AsistIA.'}{row.review?.reviewedBy&&<small>Cuenta revisora: {row.review.reviewedBy}</small>}</td><td>{admin&&row.hasImage?<button className="secondary-action" onClick={()=>open(row)}>Ver foto aceptada</button>:<span>Respaldo temporal no disponible</span>}</td></tr>)}</tbody></table></div>:<p className="enrol-empty">No hay fotos aceptadas todavía. Revisa las fotos recibidas desde Participantes.</p>}<div className="enrol-next"><p><strong>El consentimiento nuevo incluye todo el enrolamiento.</strong><br/>Al aceptar la foto se genera la plantilla automáticamente. Consulta aquí el resultado y cualquier problema pendiente, sin pedir a la persona que vuelva a entrar.</p><button className="secondary-action" onClick={()=>setTab('recognition')}>Ver registros faciales <ArrowRight size={16}/></button></div></section>}
        {tab==='recognition'&&<BiometricEnrollment request={request} canManage={data.canManage} onChanged={load} invites={data.invites}/>}
      </section><p className="enrol-footer">Las fotos tienen conservación temporal de siete días desde su invitación. La aceptación y la plantilla se muestran por separado. El tótem todavía requiere validación.</p>
    </>}
    {selected&&<div className="modal-backdrop"><section className="entity-modal enrol-review-modal" role="dialog" aria-modal="true" aria-labelledby="photo-review-title"><header><div><h2 id="photo-review-title">{selected.state==='review'?'Revisar fotografía':'Foto aceptada'}</h2><p>{selected.name} · {selected.email}</p></div><button type="button" className="secondary-action" onClick={()=>setSelected(null)} disabled={saving}>Cerrar</button></header><div className="modal-fields">
      {reviewError&&<p className="page-notice" role="alert">{reviewError}</p>}
      <div className="enrol-review-layout"><div><div className="enrol-photo">{photo?<img src={photo} alt={'Foto enviada por '+(selected.name||'el participante')}/>:<p>{selected.hasImage?'Cargando fotografía privada…':'La foto temporal ya no está disponible.'}</p>}</div><details className="enrol-details"><summary>Ver consentimiento recibido</summary><p>Versión: {selected.consent?.policy||'Sin registro'} · {date(selected.consent?.at)}</p><pre>{selected.consent?.notice}</pre></details></div>
      <div>{selected.review&&<div className="enrol-decision"><CheckCircle2 size={24}/><h3>{selected.review.decision==='approve'?'Esta foto ya fue aceptada':'Esta foto fue rechazada'}</h3><p>{date(selected.review.at)}</p><p>{selected.review.note}</p><p>No necesitas volver a completar la revisión.</p></div>}
      {selected.state==='review'&&data.canManage&&<div><h3>¿La foto cumple los requisitos?</h3><p>Confirma solo lo que hayas revisado. La fecha y la cuenta revisora se guardan automáticamente.</p><label><input name="qualityChecked" type="checkbox" checked={review.qualityChecked} onChange={update}/>La foto es nítida y muestra un solo rostro visible.</label><label><input name="authorizationChecked" type="checkbox" checked={review.authorizationChecked} onChange={update}/>Revisé que la persona dio su autorización.</label>
        <p className="enrol-info">Consentimiento: {selected.consent?.adult ? 'la persona declaró ser mayor de 18 años y autorizó el tratamiento antes de enviar su foto.' : 'Consulta la autorización registrada.'} No debes volver a acreditar su edad.</p>
        {selected.emailVerifiedAt&&<p className="enrol-info">Correo confirmado por código el {date(selected.emailVerifiedAt)}. Administración revisa calidad y autorización; no necesita conocer personalmente al estudiante. Esta comprobación acredita el control del correo, no un cotejo facial de identidad.</p>}
        {!selected.verified&&<label><input name="identityChecked" type="checkbox" checked={review.identityChecked} onChange={update}/>Reconozco a la persona de la foto y confirmo que corresponde a esta ficha.</label>}
        <label>Observación (opcional al aceptar, obligatoria al rechazar)<textarea name="note" maxLength={500} value={review.note} onChange={update} placeholder="Si la rechazas, explica qué debe corregir la persona."/></label><div className="enrol-actions"><button type="button" className="primary-action" disabled={saving||!photo} onClick={()=>saveReview('approve')}>{saving?'Guardando…':'Aceptar fotografía'}</button><button type="button" className="secondary-action" disabled={saving||!photo} onClick={()=>saveReview('reject')}>Rechazar fotografía</button></div><p className="enrol-muted">Rechazar elimina esta foto. No envía una nueva invitación automáticamente.</p></div>}
      {selected.state==='approved'&&<><p className="enrol-info">{selected.consent?.captureIncludesRecognition?'Esta persona ya dio el consentimiento completo. La plantilla se genera al aceptar su foto; consulta el resultado sin pedirle otro ingreso.':'Esta aceptación pertenece al aviso anterior, que solo autorizaba la foto. Se conserva como registro antiguo y no se amplía automáticamente.'}</p><button className="primary-action" onClick={()=>{setSelected(null);setTab('recognition')}}>Consultar registro facial</button>{data.canManage&&<details className="enrol-details"><summary>Opciones de conservación de la foto</summary><p>El respaldo mantiene su plazo original de siete días. Eliminarlo no borra una plantilla existente, pero sin plantilla válida podría hacer falta otra captura.</p><button type="button" className="secondary-action" disabled={saving} onClick={deletePhoto}>Eliminar solo foto temporal</button></details>}</>}
      </div></div>
    </div></section></div>}
  </div>
}

