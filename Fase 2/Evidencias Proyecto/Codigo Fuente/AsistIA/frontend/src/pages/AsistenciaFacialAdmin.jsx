import { useEffect, useState } from 'react'
import { ClipboardCheck, CheckCircle2, Users } from 'lucide-react'

export default function AsistenciaFacialAdmin({ token }) {
  const [registros,setRegistros] = useState([])
  const [alumno,setAlumno] = useState('')
  const [docente,setDocente] = useState('')
  const [asignatura,setAsignatura] = useState('')
  const [fecha,setFecha] = useState('')
  const [cargando,setCargando] = useState(true)
  const [error,setError] = useState('')

  useEffect(() => {
    if (!token) return
    let activo = true
    let ocupado = false
    const controlador = new AbortController()

    async function cargar() {
      if (!activo || ocupado) return
      ocupado = true
      try {
        const r = await fetch('/api/marcaciones-piloto',{
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

  const opciones = campo => [...new Set(registros.map(m=>m[campo]))].filter(Boolean).sort()

  const visibles = registros.filter(m =>
    (!alumno || m.alumno === alumno) &&
    (!docente || m.docente === docente) &&
    (!asignatura || m.asignatura === asignatura) &&
    (!fecha || m.fecha === fecha)
  )

  return (
    <section className="data-panel" style={{margin:'20px 0'}}>
      <div className="panel-header">
        <h2>Asistencias faciales experimentales</h2>
      </div>

      <div style={{padding:16}}>
        <p>Registros del piloto facial almacenados en Firebase. Sin validez acad&eacute;mica oficial.</p>

        <div className="entity-stats">
          <div className="stat-card">
            <div className="entity-stat-icon blue"><ClipboardCheck size={20}/></div>
            <div><span>Total facial</span><strong>{cargando || error ? '-' : registros.length}</strong></div>
          </div>
          <div className="stat-card">
            <div className="entity-stat-icon blue"><CheckCircle2 size={20}/></div>
            <div><span>Presentes</span><strong>{cargando || error ? '-' : registros.filter(m=>m.estado==='Presente').length}</strong></div>
          </div>
          <div className="stat-card">
            <div className="entity-stat-icon blue"><Users size={20}/></div>
            <div><span>Nombres de alumnos registrados</span><strong>{cargando || error ? '-' : opciones('alumno').filter(n=>n!=='Sin vinculacion').length}</strong></div>
          </div>
        </div>

        <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'16px 0'}}>
          <select aria-label="Alumno" value={alumno} onChange={e=>setAlumno(e.target.value)}>
            <option value="">Todos los alumnos</option>
            {opciones('alumno').map(a=><option key={a}>{a}</option>)}
          </select>

          <select aria-label="Docente" value={docente} onChange={e=>setDocente(e.target.value)}>
            <option value="">Todos los docentes</option>
            {opciones('docente').map(a=><option key={a}>{a}</option>)}
          </select>

          <select aria-label="Asignatura" value={asignatura} onChange={e=>setAsignatura(e.target.value)}>
            <option value="">Todas las asignaturas</option>
            {opciones('asignatura').map(a=><option key={a}>{a}</option>)}
          </select>

          <input aria-label="Fecha" type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>

          <button type="button" className="secondary-action" onClick={()=>{
            setAlumno('');setDocente('');setAsignatura('');setFecha('')
          }}>Limpiar filtros</button>
        </div>

        {cargando && <p>Cargando registros faciales...</p>}
        {error && <p role="alert">{error}</p>}

        {!cargando && !error && <>
          <p>Mostrando {visibles.length} de {registros.length} registros.</p>

          <div style={{overflowX:'auto'}}>
            <table className="entity-table">
              <thead><tr>
                {['Fecha','Hora','Alumno','Asignatura','Docente','Estado','Origen'].map(t=><th key={t}>{t}</th>)}
              </tr></thead>
              <tbody>
                {visibles.map(m=><tr key={m.id}>
                  <td>{m.fecha.split('-').reverse().join('/')}</td>
                  <td>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString('es-CL',{timeZone:'America/Santiago'}) : '-'}</td>
                  <td><strong>{m.alumno}</strong></td>
                  <td>{m.asignatura}</td>
                  <td>{m.docente}</td>
                  <td style={{color:m.estado==='Presente'?'#16a34a':'inherit',fontWeight:700}}>{m.estado}</td>
                  <td>{m.origen}</td>
                </tr>)}
              </tbody>
            </table>
          </div>

          {!visibles.length && <p>No hay registros para mostrar.</p>}
          <small>Actualizaci&oacute;n autom&aacute;tica cada 5 segundos.</small>
        </>}
      </div>
    </section>
  )
}