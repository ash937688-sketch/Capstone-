import { useEffect, useState } from 'react'

export default function AsistenciaPiloto({ token, onRegistros }) {
  const [registros, setRegistros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [asignatura, setAsignatura] = useState('')
  const [fecha, setFecha] = useState('')

  useEffect(() => {
    if (!token) return

    let activo = true
    let ocupado = false
    const controlador = new AbortController()

    async function cargar() {
      if (!activo || ocupado) return
      ocupado = true

      try {
        const respuesta = await fetch('/api/academico/alumno/marcaciones-piloto', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controlador.signal,
          cache: 'no-store'
        })

        const datos = await respuesta.json()

        if (!respuesta.ok || !datos.ok) {
          throw new Error(datos.message || 'Error de consulta')
        }

        if (activo) {
          setRegistros(datos.marcaciones || [])
          onRegistros?.(datos.marcaciones || [])
          setError('')
        }
      } catch (e) {
        if (activo) {
          setError(e.message)
          onRegistros?.(null)
          setRegistros([])
        }
      } finally {
        ocupado = false
        if (activo) setCargando(false)
      }
    }

    setRegistros([])
    setCargando(true)
    onRegistros?.(null)
    cargar()

    const intervalo = setInterval(cargar, 5000)

    return () => {
      activo = false
      clearInterval(intervalo)
      controlador.abort()
    }
  }, [token])

  const asignaturas = [...new Set(registros.map(m => m.asignatura))].filter(Boolean).sort()

  const filtrados = registros.filter(m =>
    (!asignatura || m.asignatura === asignatura) &&
    (!fecha || m.fecha === fecha)
  )

  return (
    <section className="academico-seccion">
      <h2>Historial de asistencias faciales</h2>
      <p>Registros experimentales guardados en Firebase.</p>

      <div style={{display:'flex',flexWrap:'wrap',gap:16,margin:'16px 0'}}>
        <div className="academico-tarjeta">
          <h3>Total de marcaciones</h3>
          <strong style={{fontSize:28}}>{registros.length}</strong>
        </div>

        <div className="academico-tarjeta">
          <h3>Presentes</h3>
          <strong style={{fontSize:28,color:'#16a34a'}}>
            {registros.filter(m => m.estado === 'Presente').length}
          </strong>
        </div>
      </div>

      <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:16,alignItems:'end'}}>
        <label>
          Asignatura
          <select value={asignatura} onChange={e => setAsignatura(e.target.value)} style={{display:'block',padding:8}}>
            <option value="">Todas las asignaturas</option>
            {asignaturas.map(nombre => (
              <option key={nombre} value={nombre}>{nombre}</option>
            ))}
          </select>
        </label>

        <label>
          Fecha
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{display:'block',padding:8}} />
        </label>

        <button type="button" onClick={() => {
          setAsignatura('')
          setFecha('')
        }}>
          Limpiar filtros
        </button>
      </div>

      {cargando && <p>Consultando asistencias...</p>}
      {error && <p role="alert">{error}</p>}

      {!cargando && !error && (
        <>
          <p>Mostrando {filtrados.length} de {registros.length} registros.</p>

          {filtrados.length === 0 ? (
            <p>No hay asistencias para los filtros seleccionados.</p>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
                <thead>
                  <tr>
                    {['Asignatura','Fecha','Hora','Estado','Origen'].map(t => (
                      <th key={t} style={{padding:12,borderBottom:'1px solid #999'}}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(m => (
                    <tr key={m.id}>
                      <td style={{padding:12}}>{m.asignatura}</td>
                      <td style={{padding:12}}>{String(m.fecha || '').split('-').reverse().join('/')}</td>
                      <td style={{padding:12}}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('es-CL',{
                          timeZone:'America/Santiago',
                          hour:'2-digit',
                          minute:'2-digit'
                        }) : '-'}
                      </td>
                      <td style={{padding:12,color:'#16a34a',fontWeight:700}}>{m.estado}</td>
                      <td style={{padding:12}}>{m.origen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p style={{fontSize:12,opacity:0.75,marginTop:16}}>
        Registros experimentales sin validez academica oficial.
      </p>
    </section>
  )
}