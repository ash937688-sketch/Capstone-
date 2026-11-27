import { useEffect, useState } from 'react'

export default function AsistenciaFacialDocente({ token }) {
  const [registros,setRegistros] = useState([])
  const [asignatura,setAsignatura] = useState('')
  const [fecha,setFecha] = useState('')
  const [error,setError] = useState('')
  const [cargando,setCargando] = useState(true)

  useEffect(() => {
    if (!token) return
    let activo = true
    let ocupado = false
    const controlador = new AbortController()

    async function cargar() {
      if (!activo || ocupado) return
      ocupado = true
      try {
        const r = await fetch('/api/academico/docente/marcaciones-piloto',{
          headers:{Authorization:`Bearer ${token}`},
          cache:'no-store',
          signal:controlador.signal
        })
        const d = await r.json()
        if (!r.ok || !d.ok) throw new Error(d.message || 'Error de consulta')
        if (activo) {
          setRegistros(d.marcaciones || [])
          setError('')
        }
      } catch(e) {
        if (activo) {
          setError(e.message)
          setRegistros([])
        }
      } finally {
        ocupado = false
        if (activo) setCargando(false)
      }
    }

    setRegistros([])
    setCargando(true)
    cargar()
    const intervalo = setInterval(cargar,5000)
    return () => {
      activo = false
      clearInterval(intervalo)
      controlador.abort()
    }
  },[token])

  const asignaturas = [...new Set(registros.map(m => m.asignatura))].sort()
  const visibles = registros.filter(m =>
    (!asignatura || m.asignatura === asignatura) &&
    (!fecha || m.fecha === fecha)
  )

  return (
    <section className="academico-seccion">
      <h2>Asistencias faciales</h2>
      <p>Registros experimentales de tus asignaturas. Sin validez academica oficial.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
        <select value={asignatura} onChange={e=>setAsignatura(e.target.value)}>
          <option value="">Todas las asignaturas</option>
          {asignaturas.map(a=><option key={a}>{a}</option>)}
        </select>
        <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} />
        <button type="button" onClick={()=>{setAsignatura('');setFecha('')}}>Limpiar filtros</button>
      </div>

      {cargando && <p>Cargando asistencias...</p>}
      {error && <p role="alert">{error}</p>}

      {!cargando && !error && <>
        <div className="academico-tarjeta">
          <h3>Marcaciones registradas: {visibles.length}</h3>
          <p>Presentes: {visibles.filter(m=>m.estado==='Presente').length}</p>
          <small>Actualizacion automatica cada 5 segundos</small>
        </div>

        <div style={{overflowX:'auto',marginTop:16}}>
          <table style={{width:'100%',textAlign:'left',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                {['Alumno','Asignatura','Fecha','Hora','Estado'].map(t=>
                  <th key={t} style={{padding:12}}>{t}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map(m=>
                <tr key={m.id} style={{borderBottom:'1px solid #8883'}}>
                  <td style={{padding:12}}>{m.alumno}</td>
                  <td style={{padding:12}}>{m.asignatura}</td>
                  <td style={{padding:12}}>{m.fecha.split('-').reverse().join('/')}</td>
                  <td style={{padding:12}}>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString('es-CL',{timeZone:'America/Santiago'}) : '-'}</td>
                  <td style={{padding:12,color:'#16a34a',fontWeight:700}}>{m.estado}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!visibles.length && <p>No hay marcaciones faciales para mostrar.</p>}
      </>}
    </section>
  )
}