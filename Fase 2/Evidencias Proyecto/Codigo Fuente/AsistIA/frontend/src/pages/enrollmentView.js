export const enrollmentLabels = { pending:'Esperando fotografía',review:'Foto por revisar',approved:'Foto aceptada',approved_no_photo:'Foto aceptada · respaldo eliminado',rejected:'Foto rechazada',expired:'Invitación vencida',revoked:'Invitación reemplazada' }
export const formatEnrollmentDate = value => value ? new Date(value).toLocaleString('es-CL') : 'Sin fecha disponible'
export function templateLabel(row){
  if(!row)return ''
  if(row.templateReady)return 'Enrolamiento registrado'
  if(row.lastError)return 'Plantilla no generada: revisar problema'
  return {authorized:'Plantilla por generar',indexing:'Generando plantilla',deletion_pending:'Plantilla bloqueada',deleted:'Plantilla eliminada'}[row.state]||'Plantilla no disponible'
}
export function enrollmentView(data) {
  const people = new Map((data.participants || []).map(person => [person.email.toLowerCase(), { ...person, email:person.email.toLowerCase() }]))
  for (const invite of data.invites || []) if (!people.has(invite.email.toLowerCase())) people.set(invite.email.toLowerCase(), { name:invite.name,email:invite.email.toLowerCase() })
  const participants = [...people.values()].map(person => {
    const history = (data.invites || []).filter(row => row.email.toLowerCase() === person.email).sort((a,b) => b.created-a.created)
    const enrollment=(data.enrollments||[]).filter(row=>row.email?.toLowerCase()===person.email).sort((a,b)=>(b.created||0)-(a.created||0))[0]||null
    return { ...person,history,latest:history[0] || null,enrollment }
  }).sort((a,b) => (a.name || a.email).localeCompare(b.name || b.email,'es'))
  const approved = (data.invites || []).filter(row => ['approved','approved_no_photo'].includes(row.state)).map(row => ({ ...row,name:people.get(row.email.toLowerCase())?.name || row.name }))
  for (const person of participants) if (person.state === 'approved' && !approved.some(row => row.id === person.latestInviteId) && !person.history.some(row => row.id === person.latestInviteId)) approved.push({ id:person.latestInviteId || 'saved:'+person.email,email:person.email,name:person.name,state:'approved_no_photo',hasImage:false,review:person.photoReview || null,recordedAt:person.updatedAt,archived:true })
  return { participants,approved:approved.sort((a,b)=>(b.review?.at || 0)-(a.review?.at || 0)),pending:(data.invites || []).filter(row=>row.state==='review'),waiting:participants.filter(person=>person.latest?.state==='pending') }
}
