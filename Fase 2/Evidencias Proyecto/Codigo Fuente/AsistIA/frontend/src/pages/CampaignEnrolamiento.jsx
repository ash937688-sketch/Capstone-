import { useRef,useState } from 'react'

export default function CampaignEnrolamiento({request,canManage,onChanged}){
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[sending,setSending]=useState(false)
  const [confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('')
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(0)
  const stop=useRef(false)
  async function prepare(){
    setBusy(true);setError('');setConfirmed(false);setPreview(null);setPage(0)
    try{setPreview(await request('campana/vista-previa',{}));setStatus('Vista previa preparada. No se ha enviado ningún correo.')}catch(err){setError(err.message)}finally{setBusy(false)}
  }
  async function send(){
    if(!preview||!confirmed)return
    stop.current=false;setBusy(true);setSending(true);setError('')
    let next=0,accepted=0,skipped=0,unconfirmed=0,halted=false
    try{
      while(next<preview.eligible&&!stop.current){
        const result=await request('campana/enviar',{id:preview.id,offset:next,confirmed:true})
        next=result.next
        for(const row of result.results)if(row.status==='accepted')accepted++;else if(row.status==='unconfirmed')unconfirmed++;else skipped++
        setStatus(`Procesados ${next} de ${preview.eligible}. Aceptados por el servidor de correo: ${accepted}; omitidos: ${skipped}; sin confirmar: ${unconfirmed}.`)
        if(result.halted){halted=true;break}
        if(result.done)break
      }
      setStatus(`${halted?'Envío detenido por entregas sin confirmar. Revisa los estados antes de repetir.':stop.current?'Envío detenido después del último lote.':'Envío terminado.'} Procesados ${next} de ${preview.eligible}. Aceptados por el servidor de correo: ${accepted}; omitidos: ${skipped}; sin confirmar: ${unconfirmed}. La aceptación no garantiza llegada a la bandeja.`)
      setPreview(null);await onChanged?.()
    }catch(err){setError('El envío se detuvo: '+err.message+'. Prepara una nueva vista previa para comprobar lo ya procesado antes de continuar.');setPreview(null)}finally{setBusy(false);setSending(false);setConfirmed(false)}
  }
  const rows=(preview?.rows||[]).filter(row=>(filter==='all'||(filter==='included'?row.eligible:!row.eligible))&&(row.name+' '+row.email).toLowerCase().includes(query.toLowerCase().trim()))
  const pages=Math.max(1,Math.ceil(rows.length/50)),current=Math.min(page,pages-1)
  return <section className="entity-card"><h2>Invitar a toda la base de AsistIA</h2><p>Prepara una campaña para los usuarios, alumnos y contactos de enrolamiento registrados. No necesitas marcar personas una por una. Los correos repetidos se unen y se omiten quienes ya tienen una invitación vigente o un registro recibido.</p>
    <p className="enrol-info">Cada persona confirmará que es mayor de edad y aceptará el consentimiento al abrir su invitación, antes de tomar la foto. Enviar el correo no registra aceptación ni enrola a nadie.</p>
    {error&&<p className="page-notice" role="alert">{error}</p>}{status&&<p className="page-notice" role="status">{status}</p>}
    <button className="primary-action" type="button" disabled={!canManage||busy} onClick={prepare}>{busy&&!sending?'Preparando lista…':'Preparar invitaciones para toda la base'}</button>
    {sending&&<button type="button" className="secondary-action" onClick={()=>{stop.current=true;setStatus('Se detendrá después de terminar el lote actual de hasta cinco destinatarios.')}}>Detener después del lote actual</button>}
    {preview&&<><div className="campaign-summary"><p><strong>{preview.total}</strong> registros revisados</p><p><strong>{preview.eligible}</strong> recibirán invitación</p><p><strong>{preview.excluded}</strong> excluidos</p><p><strong>{preview.duplicates}</strong> duplicados unidos</p></div>
      <div className="enrol-actions"><label>Buscar en la lista<input value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} placeholder="Nombre o correo"/></label><label>Mostrar<select value={filter} onChange={event=>{setFilter(event.target.value);setPage(0)}}><option value="all">Todos los registros únicos</option><option value="included">Recibirán invitación</option><option value="excluded">Excluidos y motivos</option></select></label></div>
      <div className="table-wrap"><table><thead><tr><th>Participante</th><th>Fuente</th><th>Resultado</th></tr></thead><tbody>{rows.slice(current*50,current*50+50).map((row,index)=><tr key={row.id+index}><td><strong>{row.name}</strong><small>{row.email||'Sin correo'}</small></td><td>{row.source}</td><td>{row.eligible?<><span className="enrol-status status-approved">Recibirá invitación</span><small>Confirmará edad y consentimiento en la página.</small></>:row.reason}</td></tr>)}</tbody></table>{!rows.length&&<p>No hay registros con ese filtro.</p>}</div>
      <div className="enrol-actions"><button type="button" className="secondary-action" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</button><span>Página {current+1} de {pages} · {rows.length} registros</span><button type="button" className="secondary-action" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Siguiente</button></div>
      <label><input type="checkbox" checked={confirmed} disabled={!canManage||busy} onChange={event=>setConfirmed(event.target.checked)}/>Revisé los destinatarios y autorizo usar estos correos para enviar {preview.eligible} invitaciones. Cada persona decidirá si participa y confirmará su mayoría de edad.</label>
      <button type="button" className="primary-action" disabled={!canManage||busy||!confirmed||!preview.eligible} onClick={send}>Enviar {preview.eligible} invitaciones a la base revisada</button>
      <p className="enrol-muted">La vista previa vence tras 15 minutos de inactividad. Los correos se envían individualmente, en lotes de cinco, sin mostrar a otros destinatarios. Se respetan las restricciones del remitente y se detiene el envío si aparecen entregas sin confirmar.</p>
    </>}
  </section>
}
