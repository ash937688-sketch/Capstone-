import AsistenciaFacialDocente from './AsistenciaFacialDocente'
import AsistenciaPiloto from './AsistenciaPiloto'
import VistaPreviaFacial from './VistaPreviaFacial'
// ASISTIA_187_14_60_NOMBRES_ASIGNATURAS
// ASISTIA_187_14_57_REPARADO
import { useEffect, useState } from 'react'
import './Academico.css'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// ASISTIA_187_14_29_PAGINAS_ACADEMICAS

const RUTAS = {
  '/academico/horario': ['Mi horario', 'alumno'],
  '/academico/cursos': ['Mis cursos', 'alumno'],
  '/academico/asistencia': ['Mi asistencia', 'alumno'],
  '/academico/justificaciones': ['Justificaciones', 'alumno'],
  '/academico/clases': ['Mis clases', 'docente'],
  '/academico/alumnos': ['Mis alumnos', 'docente'],
  '/academico/tomar-asistencia': ['Tomar asistencia', 'docente'],
  '/academico/reportes': ['Reportes', 'docente'],
  '/academico/perfil': ['Mi perfil', 'ambos']
}

const lista = (valor) => Array.isArray(valor) ? valor : []

function nombreCurso(cursos, id) {
  const curso = lista(cursos).find(c => String(c.id) === String(id))
  return curso?.nombre || curso?.asignatura || curso?.nombreCurso || id || 'Sin asignatura'
}

function nombreAlumno(alumnos, id) {
  const alumno = lista(alumnos).find(a => String(a.id) === String(id))
  return alumno?.nombre || alumno?.nombreCompleto || id || 'Sin nombre'
}

function fechaLegible(valor) {
  if (!valor) return 'Sin fecha'
  if (typeof valor === 'string') return valor
  return 'Fecha registrada'
}

// ASISTIA_187_14_74_ESTADO_REAL_FIREBASE
function EstadoEnrolamientoSeguro({ token }) {
  const [estado, setEstado] = useState({ cargando: true, error: '', datos: null })
  
  useEffect(() => {
    let vigente = true
    const controlador = new AbortController()
    async function consultar() {
      if (!token) {
        if (vigente) setEstado({ cargando: false, error: 'Inicia sesion para consultar el estado.', datos: null })
        return
      }
      try {
        const respuesta = await fetch('http://localhost:3001/api/academico/alumno/estado-enrolamiento', {
          method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: controlador.signal
        })
        const datos = await respuesta.json()
        if (!respuesta.ok || !datos.ok) throw new Error(datos.message || 'No fue posible consultar Firebase.')
        if (vigente) setEstado({ cargando: false, error: '', datos })
      } catch (error) {
        if (vigente && error.name !== 'AbortError') setEstado({ cargando: false, error: error.message || 'Error de conexion.', datos: null })
      }
    }
    consultar()
    return () => { vigente = false; controlador.abort() }
  }, [token])
  const datos = estado.datos
  const bloqueado = !datos || datos.habilitado !== true || datos.camaraHabilitada !== true || datos.capturaFacialHabilitada !== true
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #dce8fc', borderRadius: 12, background: '#f8fbff', margin: '14px 0' }} aria-live="polite">
      <strong>Estado verificado por el servidor</strong>
      {estado.cargando ? <p>Consultando Firebase...</p> : estado.error ? (
        <p role="alert">No se pudo verificar el enrolamiento: {estado.error}. Por seguridad, permanece bloqueado.</p>
      ) : (
        <>
          <p><strong>Enrolamiento:</strong> {bloqueado ? 'Bloqueado' : 'Pendiente de activacion operativa'}</p>
          <p><strong>Consentimiento:</strong> {datos.consentimiento?.estado || 'No otorgado'}</p>
          <p><strong>Documento:</strong> {datos.consentimiento?.version || 'Sin version'}</p>
          {datos.consentimiento?.esBorrador && <p>El documento es preliminar y no autoriza captura facial.</p>}
          {Array.isArray(datos.requisitosPendientes) && datos.requisitosPendientes.length > 0 && (
            <p><strong>Pendiente:</strong> {datos.requisitosPendientes.join('; ')}.</p>
          )}
        </>
      )}
      <p style={{ marginBottom: 0, fontSize: '.9rem' }}>La camara y la captura facial siguen desactivadas. Puedes utilizar el PIN desde Mi asistencia.</p>
    </div>
  )
}
function Tarjeta({ titulo, children }) {
  return (
    <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>{titulo}</h3>
      {children}
    </section>
  )
}

function Tabla({ columnas, filas, vacio = 'No hay registros disponibles.' }) {
  if (!filas.length) {
    return <p style={{ opacity: 0.7 }}>{vacio}</p>
  }

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        textAlign: 'left'
      }}>
        <thead>
          <tr>
            {columnas.map((col, i) => (
              <th key={i} style={{
                padding: '12px 10px',
                borderBottom: '1px solid #d5dbe3'
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td key={j} style={{
                  padding: '11px 10px',
                  borderBottom: '1px solid #e7eaf0'
                }}>
                  {celda === null || celda === undefined || celda === ''
                    ? '—'
                    : String(celda)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Academico() {
  const { user, token } = useAuth()
  const { pathname } = useLocation()
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [horarioId, setHorarioId] = useState('')
  // ASISTIA_FACIAL_PASO3_ESTADO
  const [preparacionFacial, setPreparacionFacial] = useState(null)
  const [preparacionFacialError, setPreparacionFacialError] = useState('')
  const [preparacionFacialCargando, setPreparacionFacialCargando] = useState(false)
  // ASISTIA_PASO150_CARGA_CLASES
  useEffect(() => {
    if (pathname !== '/academico/asistencia' || user?.role !== 'Alumno' || !token) return

    const controlador = new AbortController()
    setPreparacionFacialCargando(true)
    setPreparacionFacialError('')

    fetch('/api/academico/alumno/asistencia-facial/preparacion', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controlador.signal
    })
      .then(async respuesta => {
        const datos = await respuesta.json()
        if (!respuesta.ok || !datos.ok) {
          throw new Error(datos.message || `HTTP ${respuesta.status}`)
        }
        if (!controlador.signal.aborted) setPreparacionFacial(datos)
      })
      .catch(error => {
        if (!controlador.signal.aborted) {
          setPreparacionFacialError(error.message || 'Error cargando clases')
        }
      })
      .finally(() => {
        if (!controlador.signal.aborted) setPreparacionFacialCargando(false)
      })

    return () => controlador.abort()
  }, [pathname, token, user?.role])
  // ASISTIA_FACIAL_PASO5_DIAGNOSTICO_UI
  const [labFacial, setLabFacial] = useState(null)
  const [labFacialError, setLabFacialError] = useState('')
  const [labFacialCargando, setLabFacialCargando] = useState(false)
  // ASISTIA_FACIAL_PASO3_CONSULTA: solo lectura, sin captura ni marcacion.
  // ASISTIA_FACIAL_PASO5_CONSULTA_LAB: solo estado; no envia fotos ni datos biometricos.
  useEffect(() => {
    if (pathname !== '/academico/asistencia' || user?.role !== 'Alumno' || !token) return
    const controlador = new AbortController()
    setLabFacialCargando(true)
    setLabFacialError('')
    setLabFacial(null)
    fetch('/api/academico/alumno/asistencia-facial/laboratorio', {
      headers: { Authorization: `Bearer ${token}` }, signal: controlador.signal
    }).then(async respuesta => {
      const datos = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok || !datos.ok) throw new Error(datos.message || `Error HTTP ${respuesta.status}`)
      if (!controlador.signal.aborted) setLabFacial(datos)
    }).catch(error => {
      if (!controlador.signal.aborted) setLabFacialError(error.message || 'No se pudo consultar el laboratorio.')
    }).finally(() => {
      if (!controlador.signal.aborted) setLabFacialCargando(false)
    })
    return () => controlador.abort()
  }, [pathname, token, user?.role])

  // ASISTIA_187_14_49_ALUMNO_CORREGIDO
  const [busquedaCursosAlumno, setBusquedaCursosAlumno] = useState('')
  const [filtroDiaAlumno, setFiltroDiaAlumno] = useState('Todos')
  const [filtroAsistenciaAlumno, setFiltroAsistenciaAlumno] = useState('Todos')
  const [marcacionesPiloto, setMarcacionesPiloto] = useState(null)
  // ASISTIA_187_14_48_REPORTES_PERFIL_DOCENTE
  const [filtroReporteCurso, setFiltroReporteCurso] = useState('Todos')
  // ASISTIA_187_14_47_CLASES_ALUMNOS
  const [busquedaClases, setBusquedaClases] = useState('')
  const [filtroEstadoClases, setFiltroEstadoClases] = useState('Todos')
  const [busquedaAlumnos, setBusquedaAlumnos] = useState('')
  const [filtroCursoAlumnos, setFiltroCursoAlumnos] = useState('Todos')
  // ASISTIA_187_14_35_ASISTENCIA_INTERACTIVA
  const [estadosAsistencia, setEstadosAsistencia] = useState({})
  // ASISTIA_187_14_45_GUARDADO_ASISTENCIA
  // ASISTIA_187_14_46_GUARDADO_PARCIAL
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false)
  const [resultadoAsistencia, setResultadoAsistencia] = useState(null)
  // ASISTIA_187_14_56_REVISION_JUSTIFICACIONES_UI
  const [observacionesRevision, setObservacionesRevision] = useState({})
  const [revisandoAusenciaId, setRevisandoAusenciaId] = useState('')
  const [mensajeRevision, setMensajeRevision] = useState('')
  const [ausenciaJustificarId, setAusenciaJustificarId] = useState('')
  const [motivoJustificacion, setMotivoJustificacion] = useState('')
  const [enviandoJustificacion, setEnviandoJustificacion] = useState(false)
  const [resultadoJustificacion, setResultadoJustificacion] = useState('')
  // ASISTIA_187_14_68_UI_CONSENTIMIENTO
  const [bioInfo, setBioInfo] = useState(null)
  const [bioError, setBioError] = useState('')
  const [bioAcepta, setBioAcepta] = useState(false)
  const [bioGuardando, setBioGuardando] = useState(false)
  const [bioCargando, setBioCargando] = useState(false)

  useEffect(() => {
    if (pathname !== '/academico/perfil' || user?.role !== 'Alumno' || !token) return
    let activo = true
    setBioCargando(true)
    setBioError('')
    fetch('/api/academico/alumno/consentimiento-biometrico', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.message || `Error HTTP ${r.status}`)
      if (activo) setBioInfo(d)
    }).catch(e => { if (activo) setBioError(e.message || 'No se pudo consultar el consentimiento.') })
      .finally(() => { if (activo) setBioCargando(false) })
    return () => { activo = false }
  }, [pathname, token, user?.role])

  async function actualizarConsentimientoBiometrico(accion) {
    if (!token || bioGuardando || !bioInfo) return
    if (accion === 'aceptar' && !bioAcepta) return
    let mayorEdadConfirmada = false

    if (accion === 'aceptar' && bioInfo.version === 'PILOTO-GRUPAL-v2') {
      mayorEdadConfirmada = window.confirm(
        'Declaro que tengo 18 anos o mas y que mi participacion en este piloto es voluntaria.'
      )
      if (!mayorEdadConfirmada) return
    }

    setBioGuardando(true)
    setBioError('')
    try {
      const r = await fetch('/api/academico/alumno/consentimiento-biometrico', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion,
          version: bioInfo.version,
          consentimientoExplicito: accion === 'aceptar' && bioAcepta,
          mayorEdadConfirmada
        })
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.message || `Error HTTP ${r.status}`)
      setBioInfo(prev => ({ ...prev, estado: d.estado, actualizadoAt: d.actualizadoAt }))
      setBioAcepta(false)
    } catch (e) {
      setBioError(e.message || 'No se pudo actualizar la preferencia.')
    } finally {
      setBioGuardando(false)
    }
  }


  // ASISTIA_187_14_65_PIN_ALUMNO
  const [pinTemporal, setPinTemporal] = useState('')
  const [pinVence, setPinVence] = useState('')
  const [pinMensaje, setPinMensaje] = useState('')
  const [pinSolicitando, setPinSolicitando] = useState(false)


  const rol = user?.role === 'Docente' ? 'docente' : 'alumno'
  const [titulo] = RUTAS[pathname] || ['Espacio académico']

  useEffect(() => {
    let activo = true

    setDatos(null)
    setError('')
    setLoading(true)

    if (!token) {
      setError('No hay una sesión académica activa.')
      setLoading(false)
      return () => { activo = false }
    }

    async function cargar() {
      try {
        const respuesta = await fetch(`/api/academico/${rol}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        const resultado = await respuesta.json()

        if (!respuesta.ok || !resultado.ok) {
          throw new Error(
            resultado.message ||
            `No fue posible cargar la información (${respuesta.status}).`
          )
        }

        if (activo) setDatos(resultado)
      } catch (err) {
        if (activo) setError(err.message || 'Error de conexión.')
      } finally {
        if (activo) setLoading(false)
      }
    }

    cargar()
    return () => { activo = false }
  }, [rol, token])

  const cursos = lista(datos?.cursos)
  const horarios = lista(datos?.horarios)
  const alumnos = lista(datos?.alumnos)
  const matriculas = lista(datos?.matriculas)
  const marcaciones = lista(datos?.marcaciones)
  const ausencias = lista(datos?.ausencias)

  // ASISTIA_187_14_32_DISENO_PRO
  // ASISTIA_187_14_34_TODAS_LAS_PESTANAS
  const configuracionVisual = {
    '/academico/horario': {
      icono: '▦',
      descripcion: 'Organiza tu semana y consulta tus clases programadas.',
      indicadores: [
        ['Clases programadas', horarios.length, 'blue'],
        ['Asignaturas', cursos.length, 'green'],
        ['Días con clases', new Set(horarios.map(h => h.diaSemana ?? h.dia)).size, 'orange']
      ]
    },
    '/academico/cursos': {
      icono: '▤',
      descripcion: 'Consulta tus asignaturas y tu información académica.',
      indicadores: [
        ['Mis asignaturas', cursos.length, 'blue'],
        ['Matrículas activas', matriculas.filter(m => String(m.estado).toLowerCase() === 'activo').length, 'green'],
        ['Horarios asociados', horarios.length, 'purple']
      ]
    },
    '/academico/asistencia': {
      icono: '✓',
      descripcion: 'Revisa tus registros de asistencia, atrasos y ausencias.',
      indicadores: [
  ['Marcaciones piloto', marcacionesPiloto?.length ?? '-', 'blue'],
  ['Presentes piloto', marcacionesPiloto?.filter(m => m.estado === 'Presente').length ?? '-', 'green'],
  ['Atrasos piloto', marcacionesPiloto?.filter(m => ['Atrasado','Atraso'].includes(m.estado)).length ?? '-', 'orange'],
  ['Ausencias piloto', marcacionesPiloto?.filter(m => m.estado === 'Ausente').length ?? '-', 'red']
]
    },
    '/academico/justificaciones': {
      icono: '▣',
      descripcion: 'Consulta tus ausencias y el estado de los registros disponibles.',
      indicadores: [
        ['Ausencias registradas', ausencias.length, 'orange'],
        ['Asignaturas inscritas', cursos.length, 'blue'],
        ['Marcaciones', marcaciones.length, 'green']
      ]
    },
    '/academico/clases': {
      icono: '▦',
      descripcion: 'Gestiona visualmente tus clases y horarios asignados.',
      indicadores: [
        ['Clases asignadas', horarios.length, 'blue'],
        ['Asignaturas', cursos.length, 'green'],
        ['Días de clases', new Set(horarios.map(h => h.diaSemana ?? h.dia)).size, 'purple']
      ]
    },
    '/academico/alumnos': {
      icono: '♙',
      descripcion: 'Consulta los estudiantes vinculados a tus asignaturas.',
      indicadores: [
        ['Alumnos vinculados', alumnos.length, 'blue'],
        ['Matrículas', matriculas.length, 'green'],
        ['Asignaturas', cursos.length, 'purple']
      ]
    },
    '/academico/tomar-asistencia': {
      icono: '✓',
      descripcion: 'Selecciona una clase y consulta su nómina de estudiantes.',
      indicadores: []
    },
    '/academico/reportes': {
      icono: '▥',
      descripcion: 'Analiza los registros académicos de tus clases.',
      indicadores: [
        ['Asignaturas', cursos.length, 'blue'],
        ['Estudiantes', alumnos.length, 'green'],
        ['Marcaciones', marcaciones.length, 'purple'],
        ['Ausencias', ausencias.length, 'orange']
      ]
    },
    '/academico/perfil': {
      icono: '♙',
      descripcion: 'Consulta tus datos personales y tu vinculación académica.',
      indicadores: rol === 'docente'
        ? [
            ['Rol', 'Docente', 'blue'],
            ['Asignaturas', cursos.length, 'green'],
            ['Clases', horarios.length, 'purple']
          ]
        : [
            ['Rol', 'Alumno', 'blue'],
            ['Asignaturas', cursos.length, 'green'],
            ['Clases', horarios.length, 'purple']
          ]
    }
  }

  const visual = configuracionVisual[pathname] || {
    icono: '▦',
    descripcion: 'Información académica.',
    indicadores: []
  }
  // ASISTIA_187_14_65_SOLICITAR_PIN
  async function solicitarPinTemporal() {
    if (!token || pinSolicitando) return
    setPinSolicitando(true)
    setPinMensaje('')
    setPinTemporal('')
    setPinVence('')
    try {
      const respuesta = await fetch('/api/academico/alumno/pin-solicitar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const resultado = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(resultado.message || `Error HTTP ${respuesta.status}`)
      }
      setPinTemporal(String(resultado.pin || ''))
      setPinVence(String(resultado.expiraAt || ''))
      setPinMensaje('PIN generado. No lo compartas. Solo sirve durante 5 minutos.')
    } catch (err) {
      setPinMensaje(err.message || 'No se pudo generar el PIN.')
    } finally {
      setPinSolicitando(false)
    }
  }
  async function enviarJustificacion(e) {
    e.preventDefault()
    if (enviandoJustificacion || !token) return
    const ausenciaId = String(ausenciaJustificarId).trim()
    const motivo = motivoJustificacion.trim()
    if (!ausenciaId || motivo.length < 10 || motivo.length > 500) {
      setResultadoJustificacion('Selecciona una ausencia y escribe un motivo de 10 a 500 caracteres.')
      return
    }
    if (!ausencias.some(a => String(a.id) === ausenciaId &&
      String(a.estado) === 'Pendiente' && a.solicitudJustificacion?.estado !== 'Enviada')) {
      setResultadoJustificacion('Esta ausencia ya no está disponible para solicitar justificación.')
      return
    }
    setEnviandoJustificacion(true)
    setResultadoJustificacion('')
    try {
      const respuesta = await fetch('/api/academico/alumno/justificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ausenciaId, motivo })
      })
      const resultado = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok || !resultado.ok) throw new Error(resultado.message || `No se pudo enviar la solicitud (HTTP ${respuesta.status}).`)
      setDatos(actual => ({
        ...actual,
        ausencias: lista(actual?.ausencias).map(a =>
          String(a.id) === ausenciaId ? { ...a, solicitudJustificacion: resultado.solicitud || { estado: 'Enviada', motivo } } : a
        )
      }))
      setAusenciaJustificarId('')
      setMotivoJustificacion('')
      setResultadoJustificacion('Solicitud enviada correctamente. Queda pendiente de revisión.')
    } catch (err) {
      setResultadoJustificacion(err.message || 'Error de conexión al enviar la solicitud.')
    } finally {
      setEnviandoJustificacion(false)
    }
  }  async function revisarJustificacion(ausenciaId, decision) {
    if (!token || revisandoAusenciaId || !['Justificada', 'No justificada'].includes(decision)) return
    const ausencia = ausencias.find(a => String(a.id) === String(ausenciaId))
    if (!ausencia || String(ausencia.estado) !== 'Pendiente' || ausencia.solicitudJustificacion?.estado !== 'Enviada') {
      setMensajeRevision('Esta solicitud ya no se encuentra pendiente de revision.')
      return
    }
    if (!window.confirm(`¿Confirmas marcar esta solicitud como "${decision}"?`)) return
    setRevisandoAusenciaId(String(ausenciaId))
    setMensajeRevision('')
    try {
      const respuesta = await fetch('/api/academico/docente/revisar-justificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ausenciaId: String(ausenciaId),
          decision,
          observaciones: String(observacionesRevision[ausenciaId] || '').trim()
        })
      })
      const resultado = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(resultado.message || `No se pudo revisar la solicitud (HTTP ${respuesta.status}).`)
      }
      setDatos(actual => ({
        ...actual,
        ausencias: lista(actual?.ausencias).map(a =>
          String(a.id) === String(ausenciaId)
            ? { ...a, estado: decision, solicitudJustificacion: {
                ...a.solicitudJustificacion, estado: 'Revisada', decision,
                observaciones: String(observacionesRevision[ausenciaId] || '').trim()
              } }
            : a
        )
      }))
      setMensajeRevision(`Solicitud ${decision.toLowerCase()} correctamente.`)
    } catch (err) {
      setMensajeRevision(err.message || 'No fue posible conectar con el servidor.')
    } finally {
      setRevisandoAusenciaId('')
    }
  }
  function contenido() {
    switch (pathname) {
            case '/academico/horario': {
        const dias = [
          'Lunes', 'Martes', 'Miercoles',
          'Jueves', 'Viernes', 'Sabado'
        ]

        const normalizar = valor =>
          String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()

        const horariosFiltrados = horarios.filter(h =>
          filtroDiaAlumno === 'Todos' ||
          normalizar(h.dia) === normalizar(filtroDiaAlumno)
        )

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mi horario</h1>
              <p>Consulta tus clases y asignaturas programadas.</p>
            </div>

            <section className="academico-seccion">
              <h2>Filtrar por día</h2>
              <select
                value={filtroDiaAlumno}
                onChange={e => setFiltroDiaAlumno(e.target.value)}
                aria-label="Filtrar horario por día"
              >
                <option value="Todos">Toda la semana</option>
                {dias.map(dia => (
                  <option key={dia} value={dia}>{dia}</option>
                ))}
              </select>
            </section>

            <section className="academico-seccion">
              <h2>Clases programadas</h2>
              {horariosFiltrados.length === 0 ? (
                <p>No hay clases programadas para el filtro seleccionado.</p>
              ) : (
                <div className="academico-grid">
                  {horariosFiltrados.map(h => {
                    const curso = cursos.find(c =>
                      String(c.id) === String(h.cursoId)
                    )

                    return (
                      <article className="academico-tarjeta" key={h.id}>
                        <h3>{nombreCurso(cursos, h.cursoId)}</h3>
                        <p><strong>Día:</strong> {h.dia || 'No informado'}</p>
                        <p>
                          <strong>Horario:</strong>{' '}
                          {h.horaInicio || h.inicio || '—'} - {h.horaFin || h.fin || '—'}
                        </p>
                        <p><strong>Sala:</strong> {h.sala || 'No informada'}</p>
                        <p><strong>Estado:</strong> {h.estado || 'No informado'}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )
      }

      case '/academico/cursos': {
        const texto = busquedaCursosAlumno.trim().toLowerCase()

        const cursosFiltrados = cursos.filter(c =>
          !texto ||
          String(nombreCurso(cursos, c.id)).toLowerCase().includes(texto) ||
          String(c.id || '').toLowerCase().includes(texto)
        )

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mis cursos</h1>
              <p>Consulta tus asignaturas y matrículas.</p>
            </div>

            <section className="academico-seccion">
              <h2>Buscar asignaturas</h2>
              <input
                type="search"
                value={busquedaCursosAlumno}
                onChange={e => setBusquedaCursosAlumno(e.target.value)}
                placeholder="Buscar asignatura..."
                aria-label="Buscar cursos"
              />
              <p>Asignaturas encontradas: {cursosFiltrados.length}</p>
            </section>

            <section className="academico-seccion">
              <h2>Asignaturas inscritas</h2>
              {cursosFiltrados.length === 0 ? (
                <p>No se encontraron asignaturas.</p>
              ) : (
                <div className="academico-grid">
                  {cursosFiltrados.map(c => {
                    const matricula = matriculas.find(m =>
                      String(m.cursoId) === String(c.id)
                    )

                    const cantidadHorarios = horarios.filter(h =>
                      String(h.cursoId) === String(c.id)
                    ).length

                    return (
                      <article className="academico-tarjeta" key={c.id}>
                        <h3>{nombreCurso(cursos, c.id)}</h3>
                        <p><strong>Código:</strong> {c.id}</p>
                        <p>
                          <strong>Matrícula:</strong>{' '}
                          {matricula?.estado || 'Sin información'}
                        </p>
                        <p><strong>Horarios:</strong> {cantidadHorarios}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )
      }

      case '/academico/asistencia': {
        const registros = marcaciones.filter(m =>
          filtroAsistenciaAlumno === 'Todos' ||
          String(m.estado || '').toLowerCase() ===
            filtroAsistenciaAlumno.toLowerCase()
        )

        const presentes = marcaciones.filter(m =>
          String(m.estado || '').toLowerCase() === 'presente'
        ).length

        const atrasados = marcaciones.filter(m =>
          String(m.estado || '').toLowerCase() === 'atrasado'
        ).length

        const faltas = ausencias.length
        const total = presentes + atrasados + faltas

        const porcentaje = total > 0
          ? Math.round(((presentes + atrasados) / total) * 100)
          : 0

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mi asistencia</h1>
              <p>Consulta tus marcaciones y ausencias registradas.</p>
            </div>

            {/* ASISTIA_FACIAL_PASO6_CAMARA_LOCAL */}
            <VistaPreviaFacial horarios={preparacionFacial?.horarios || []} token={token} />
          <AsistenciaPiloto token={token} onRegistros={setMarcacionesPiloto} />
            {/* ASISTIA_FACIAL_PASO5_PANEL_LAB */}
            <section className="academico-seccion" aria-label="Estado del laboratorio facial">
              <h2>Estado del sistema facial</h2>
              {labFacialCargando && <p role="status">Comprobando laboratorio...</p>}
              {labFacialError && <p role="alert">No se pudo consultar el estado: {labFacialError}</p>}
              {labFacial && (
                <div>
                  <p><strong>Laboratorio:</strong> {labFacial.laboratorio?.conectado ? 'Conectado' : 'No conectado'}</p>
                  <p><strong>Reconocimiento:</strong> Implementado en modalidad experimental.</p>
                  
                  
                </div>
              )}
              <p><strong>Marcacion facial:</strong> Habilitada en modalidad experimental.</p>
            </section>
            {/* ASISTIA_FACIAL_PASO3_PANEL_SOLO_LECTURA */}
            <section className="academico-seccion" aria-label="Preparación de asistencia facial">
              <h2>Clases disponibles</h2>
              <p>Consulta tus clases disponibles para registrar asistencia facial.</p>
              {preparacionFacialCargando && <p role="status">Consultando clases...</p>}
              {preparacionFacialError && <p role="alert">{preparacionFacialError}</p>}
              {preparacionFacial && !preparacionFacialCargando && (
                <div>
                  <p><strong>Fecha:</strong> {preparacionFacial.fecha} · <strong>Día:</strong> {preparacionFacial.dia}</p>
                  {preparacionFacial.horarios?.length ? (
                    <ul>
                      {preparacionFacial.horarios.map(h => (
                        <li key={h.horarioId}>
                          {h.asignatura || nombreCurso(cursos, h.cursoId)} · {h.inicio || 'Sin hora'}–{h.fin || 'Sin hora'} ·{' '}
                          {h.asistenciaExistente ? 'Asistencia oficial registrada' : 'Sin asistencia oficial'}
                        </li>
                      ))}
                    </ul>
                  ) : <p>No se encontraron clases confirmadas para hoy.</p>}
                  <p><strong>Estado:</strong> Registro facial experimental habilitado para participantes autorizados.</p>
                </div>
              )}
            </section>
            {/* ASISTIA_187_14_71_PIN_EN_ASISTENCIA */}
            <section className="academico-seccion" aria-label="PIN temporal de asistencia">
              <h2>Mi PIN temporal</h2>
              <p>Solicita un código de 6 dígitos para utilizarlo en el tótem de asistencia. Caduca a los 5 minutos.</p>
              <button
                type="button"
                className="academico-btn academico-btn-principal"
                disabled={pinSolicitando}
                onClick={solicitarPinTemporal}
              >
                {pinSolicitando ? 'Generando PIN...' : 'Solicitar PIN'}
              </button>
              {pinTemporal && (
                <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
                  <strong style={{ fontSize: 32, letterSpacing: 7, fontVariantNumeric: 'tabular-nums' }}>
                    {pinTemporal}
                  </strong>
                  <p>Vence: {pinVence ? new Date(pinVence).toLocaleTimeString('es-CL') : 'en 5 minutos'}</p>
                </div>
              )}
              {pinMensaje && <p role="status" aria-live="polite">{pinMensaje}</p>}
            </section>

            <section className="academico-seccion">
              <h2>Resumen de asistencia oficial</h2>
              <div className="academico-grid">
                <article className="academico-tarjeta">
                  <h3>Presentes</h3>
                  <p>{presentes}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Atrasados</h3>
                  <p>{atrasados}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Ausencias</h3>
                  <p>{faltas}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Asistencia registrada</h3>
                  <p>{porcentaje}%</p>
                </article>
              </div>
            </section>

            <section className="academico-seccion">
              <h2>Historial de marcaciones oficiales</h2>
              <select
                value={filtroAsistenciaAlumno}
                onChange={e => setFiltroAsistenciaAlumno(e.target.value)}
                aria-label="Filtrar asistencia"
              >
                <option value="Todos">Todos los registros</option>
                <option value="Presente">Presentes</option>
                <option value="Atrasado">Atrasados</option>
              </select>

              {registros.length === 0 ? (
                <p>No hay marcaciones para el filtro seleccionado.</p>
              ) : (
                <div className="academico-grid">
                  {registros.map((m, i) => {
                    const horario = horarios.find(h =>
                      String(h.id) === String(m.horarioId)
                    )
                    const curso = cursos.find(c =>
                      String(c.id) === String(
                        horario?.cursoId || m.cursoId
                      )
                    )

                    return (
                      <article className="academico-tarjeta" key={m.id || i}>
                        <h3>{nombreCurso(cursos, horario?.cursoId || m.cursoId)}</h3>
                        <p><strong>Fecha:</strong> {m.fecha || 'No informada'}</p>
                        <p><strong>Estado:</strong> {m.estado || 'No informado'}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )
      }

      // ASISTIA_187_14_54_JUSTIFICACIONES_UI
      case '/academico/justificaciones': {
        const registros = ausencias
        const elegibles = registros.filter(a =>
          String(a.estado || '') === 'Pendiente' &&
          String(a.solicitudJustificacion?.estado || '') !== 'Enviada'
        )

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mis justificaciones</h1>
              <p>Consulta tus ausencias y envía solicitudes de justificación.</p>
            </div>

            
            <section className="academico-seccion">
              <h2>Ausencias registradas</h2>
              <p>Registros encontrados: {registros.length}</p>
              {registros.length === 0 ? (
                <p>No tienes ausencias registradas.</p>
              ) : (
                <div className="academico-grid">
                  {registros.map((a, i) => {
                    const horario = horarios.find(h => String(h.id) === String(a.horarioId))
                    const curso = cursos.find(c => String(c.id) === String(horario?.cursoId || a.cursoId))
                    return (
                      <article className="academico-tarjeta" key={a.id || i}>
                        <h3>{nombreCurso(cursos, horario?.cursoId || a.cursoId)}</h3>
                        <p><strong>Fecha:</strong> {a.fecha || 'No informada'}</p>
                        <p><strong>Estado de ausencia:</strong> {a.estado || 'No informado'}</p>
                        <p><strong>Solicitud:</strong> {a.solicitudJustificacion?.estado || 'Sin solicitud'}</p>
                        {a.solicitudJustificacion?.motivo && (
                          <p><strong>Motivo enviado:</strong> {a.solicitudJustificacion.motivo}</p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="academico-seccion">
              <h2>Solicitar justificación</h2>
              <p>Selecciona una ausencia pendiente y explica el motivo (10 a 500 caracteres). El envío no implica aprobación.</p>
              {elegibles.length === 0 ? (
                <p>No tienes ausencias pendientes disponibles para solicitar justificación.</p>
              ) : (
                <form onSubmit={enviarJustificacion}>
                  <label htmlFor="ausencia-justificar">Ausencia</label>
                  <select
                    id="ausencia-justificar"
                    value={ausenciaJustificarId}
                    onChange={e => { setAusenciaJustificarId(e.target.value); setResultadoJustificacion('') }}
                    required
                    disabled={enviandoJustificacion}
                  >
                    <option value="">Selecciona una ausencia</option>
                    {elegibles.map(a => {
                      const horario = horarios.find(h => String(h.id) === String(a.horarioId))
                      return <option key={a.id} value={a.id}>{nombreCurso(cursos, horario?.cursoId || a.cursoId)} · {a.fecha || 'Sin fecha'}</option>
                    })}
                  </select>
                  <label htmlFor="motivo-justificacion">Motivo de la solicitud</label>
                  <textarea
                    id="motivo-justificacion"
                    value={motivoJustificacion}
                    onChange={e => setMotivoJustificacion(e.target.value)}
                    minLength={10}
                    maxLength={500}
                    rows={4}
                    required
                    disabled={enviandoJustificacion}
                    placeholder="Explica el motivo de tu ausencia..."
                    style={{ width: '100%', padding: 12, marginTop: 8, marginBottom: 12, boxSizing: 'border-box' }}
                  />
                  <p>{motivoJustificacion.trim().length}/500 caracteres</p>
                  <button
                    type="submit"
                    className="academico-btn academico-btn-principal"
                    disabled={enviandoJustificacion || !ausenciaJustificarId || motivoJustificacion.trim().length < 10 || motivoJustificacion.trim().length > 500}
                  >
                    {enviandoJustificacion ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </form>
              )}
              {resultadoJustificacion && <p role="status" aria-live="polite" className="academico-nota">{resultadoJustificacion}</p>}
            </section>
          </>
        )
      }
      
case '/academico/clases': {
        const texto = busquedaClases.trim().toLowerCase()

        const horariosFiltrados = horarios.filter(h => {
          const curso = cursos.find(c => String(c.id) === String(h.cursoId))
          const coincideTexto = !texto ||
            String(curso?.nombre || h.cursoId || '').toLowerCase().includes(texto) ||
            String(h.dia || '').toLowerCase().includes(texto) ||
            String(h.sala || '').toLowerCase().includes(texto)

          const coincideEstado = filtroEstadoClases === 'Todos' ||
            String(h.estado || '').toLowerCase() === filtroEstadoClases.toLowerCase()

          return coincideTexto && coincideEstado
        })

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mis clases</h1>
              <p>Consulta tus asignaturas, horarios y clases programadas.</p>
            </div>

            <section className="academico-seccion">
              <h2>Buscar clases</h2>
              <div className="academico-acciones">
                <input
                  type="search"
                  value={busquedaClases}
                  onChange={e => setBusquedaClases(e.target.value)}
                  placeholder="Buscar asignatura, dia o sala..."
                  aria-label="Buscar clases"
                />
                <select
                  value={filtroEstadoClases}
                  onChange={e => setFiltroEstadoClases(e.target.value)}
                  aria-label="Filtrar clases por estado"
                >
                  <option value="Todos">Todos los estados</option>
                  <option value="Confirmada">Confirmadas</option>
                  <option value="Pendiente">Pendientes</option>
                  <option value="Cancelada">Canceladas</option>
                </select>
              </div>
              <p>Clases encontradas: {horariosFiltrados.length}</p>
            </section>

            <section className="academico-seccion">
              <h2>Programacion de clases</h2>
              {horariosFiltrados.length === 0 ? (
                <p>No se encontraron clases con los filtros seleccionados.</p>
              ) : (
                <div className="academico-grid">
                  {horariosFiltrados.map(h => {
                    const curso = cursos.find(c => String(c.id) === String(h.cursoId))
                    const inscritos = matriculas.filter(m =>
                      String(m.cursoId) === String(h.cursoId) &&
                      String(m.estado || '').toLowerCase() === 'activo'
                    )

                    return (
                      <article className="academico-tarjeta" key={h.id}>
                        <h3>{curso?.nombre || h.cursoId || 'Asignatura'}</h3>
                        <p><strong>Dia:</strong> {h.dia || 'No informado'}</p>
                        <p><strong>Horario:</strong> {h.horaInicio || '—'} - {h.horaFin || '—'}</p>
                        <p><strong>Sala:</strong> {h.sala || 'No informada'}</p>
                        <p><strong>Estado:</strong> {h.estado || 'No informado'}</p>
                        <p><strong>Alumnos matriculados:</strong> {inscritos.length}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )
      }
      case '/academico/alumnos': {
        const texto = busquedaAlumnos.trim().toLowerCase()

        const matriculasDocente = matriculas.filter(m =>
          cursos.some(c => String(c.id) === String(m.cursoId)) &&
          String(m.estado || '').toLowerCase() === 'activo'
        )

        const registros = matriculasDocente
          .filter(m => filtroCursoAlumnos === 'Todos' ||
            String(m.cursoId) === String(filtroCursoAlumnos))
          .filter(m => {
            const alumno = alumnos.find(a => String(a.id) === String(m.alumnoId))
            const nombre = String(alumno?.nombre || '').toLowerCase()
            return !texto ||
              nombre.includes(texto) ||
              String(m.alumnoId || '').toLowerCase().includes(texto)
          })

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mis alumnos</h1>
              <p>Revisa las matriculas y estudiantes de tus asignaturas.</p>
            </div>

            <section className="academico-seccion">
              <h2>Buscar estudiantes</h2>
              <div className="academico-acciones">
                <input
                  type="search"
                  value={busquedaAlumnos}
                  onChange={e => setBusquedaAlumnos(e.target.value)}
                  placeholder="Buscar por nombre o identificador..."
                  aria-label="Buscar alumnos"
                />
                <select
                  value={filtroCursoAlumnos}
                  onChange={e => setFiltroCursoAlumnos(e.target.value)}
                  aria-label="Filtrar alumnos por curso"
                >
                  <option value="Todos">Todos mis cursos</option>
                  {cursos.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre || c.id}
                    </option>
                  ))}
                </select>
              </div>
              <p>Matriculas encontradas: {registros.length}</p>
            </section>

            <section className="academico-seccion">
              <h2>Nomina de estudiantes</h2>
              {registros.length === 0 ? (
                <p>No se encontraron estudiantes con los filtros seleccionados.</p>
              ) : (
                <div className="academico-grid">
                  {registros.map(m => {
                    const alumno = alumnos.find(a => String(a.id) === String(m.alumnoId))
                    const curso = cursos.find(c => String(c.id) === String(m.cursoId))

                    return (
                      <article className="academico-tarjeta" key={`${m.alumnoId}-${m.cursoId}`}>
                        <h3>{alumno?.nombre || m.alumnoId}</h3>
                        <p><strong>Identificador:</strong> {m.alumnoId}</p>
                        <p><strong>Asignatura:</strong> {curso?.nombre || m.cursoId}</p>
                        <p><strong>Estado:</strong> {m.estado || 'No informado'}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )
      }
// ASISTIA_187_14_52_AUSENCIAS_UI
      case '/academico/tomar-asistencia': {
        const horariosDocente = horarios.filter(h =>
          String(h.estado ?? '').toLowerCase() === 'confirmada'
        )

        const horarioSeleccionado = horariosDocente.find(h =>
          String(h.id) === String(horarioId)
        )

        const inscritos = horarioSeleccionado
          ? matriculas.filter(m =>
              String(m.cursoId) === String(horarioSeleccionado.cursoId) &&
              String(m.estado ?? '').toLowerCase() === 'activo'
            )
          : []

        const identificadores = new Set(
          inscritos.map(m => String(m.alumnoId))
        )

        const seleccionados = Object.entries(estadosAsistencia)
          .filter(([id]) => identificadores.has(String(id)))

        const presentes = seleccionados.filter(
          ([, estado]) => estado === 'Presente'
        ).length

        const atrasados = seleccionados.filter(
          ([, estado]) => estado === 'Atrasado'
        ).length

        const ausentes = seleccionados.filter(
          ([, estado]) => estado === 'Ausente'
        ).length

        const pendientes = inscritos.length -
          presentes - atrasados - ausentes

        return (
          <>
            <AsistenciaFacialDocente token={token} />
            <div className="academico-metricas">
              <div className="academico-metrica academico-metrica-azul">
                <div className="academico-metrica-icono">▦</div>
                <div>
                  <span>Alumnos de la clase</span>
                  <strong>{inscritos.length}</strong>
                  <small>Matrículas activas</small>
                </div>
              </div>

              <div className="academico-metrica academico-metrica-verde">
                <div className="academico-metrica-icono">✓</div>
                <div>
                  <span>Presentes</span>
                  <strong>{presentes}</strong>
                  <small>Marcados en el formulario</small>
                </div>
              </div>

              <div className="academico-metrica academico-metrica-naranja">
                <div className="academico-metrica-icono">◷</div>
                <div>
                  <span>Atrasados</span>
                  <strong>{atrasados}</strong>
                  <small>Marcados en el formulario</small>
                </div>
              </div>

              <div className="academico-metrica academico-metrica-celeste">
                <div className="academico-metrica-icono">!</div>
                <div>
                  <span>Pendientes</span>
                  <strong>{pendientes}</strong>
                  <small>Sin selección</small>
                </div>
              </div>
            </div>

            <section className="panel academico-bloque">
              <div className="academico-bloque-cabecera">
                <span className="academico-paso">1</span>
                <div>
                  <h3>Seleccionar clase</h3>
                  <p>Elige una asignatura para preparar la asistencia.</p>
                </div>
              </div>

              <div className="academico-campo">
                <label htmlFor="horario-docente">
                  Asignatura y horario
                </label>

                <select
                  id="horario-docente"
                  className="academico-select"
                  value={horarioId}
                  onChange={e => {
                    setHorarioId(e.target.value)
                    setEstadosAsistencia({})
                  }}
                >
                  <option value="">Selecciona una clase</option>
                  {horariosDocente.map(h => (
                    <option key={h.id} value={h.id}>
                      {nombreCurso(cursos, h.cursoId)}
                      {' · '}
                      {h.diaSemana ?? h.dia ?? 'Día sin definir'}
                      {' · '}
                      {h.horaInicio ?? h.inicio ?? 'Sin hora'}
                      {' - '}
                      {h.horaFin ?? h.fin ?? ''}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="panel academico-bloque">
              <div className="academico-bloque-cabecera">
                <span className="academico-paso">2</span>
                <div>
                  <h3>Registro de asistencia</h3>
                  <p>
                    {horarioSeleccionado
                      ? `${nombreCurso(cursos, horarioSeleccionado.cursoId)} · ${inscritos.length} alumnos`
                      : 'Selecciona una clase para comenzar.'}
                  </p>
                </div>
              </div>

              {horarioSeleccionado && inscritos.length > 0 && (
                <>
                  <div className="academico-acciones">
                    <button
                      type="button"
                      className="academico-btn academico-btn-verde"
                      onClick={() => {
                        const nuevos = {}
                        inscritos.forEach(m => {
                          nuevos[m.alumnoId] = 'Presente'
                        })
                        setEstadosAsistencia(nuevos)
                      }}
                    >
                      ✓ Marcar todos presentes
                    </button>

                    <button
                      type="button"
                      className="academico-btn academico-btn-secundario"
                      onClick={() => setEstadosAsistencia({})}
                    >
                      Limpiar selección
                    </button>
                  </div>

                  <div className="academico-tabla-asistencia">
                    <table>
                      <thead>
                        <tr>
                          <th>N.º</th>
                          <th>Alumno</th>
                          <th>Identificador</th>
                          <th>Estado de asistencia</th>
                        </tr>
                      </thead>

                      <tbody>
                        {inscritos.map((m, indice) => (
                          <tr key={m.alumnoId}>
                            <td>{indice + 1}</td>
                            <td>
                              <strong>
                                {nombreAlumno(alumnos, m.alumnoId)}
                              </strong>
                            </td>
                            <td>{m.alumnoId}</td>
                            <td>
                              <div className="academico-opciones">
                                {['Presente', 'Atrasado', 'Ausente'].map(estado => (
                                  <button
                                    key={estado}
                                    type="button"
                                    aria-pressed={
                                      estadosAsistencia[m.alumnoId] === estado
                                    }
                                    className={
                                      'academico-opcion ' +
                                      'academico-opcion-' +
                                      estado.toLowerCase() +
                                      (estadosAsistencia[m.alumnoId] === estado
                                        ? ' seleccionada'
                                        : '')
                                    }
                                    onClick={() => {
                                      setEstadosAsistencia(actual => ({
                                        ...actual,
                                        [m.alumnoId]: estado
                                      }))
                                    }}
                                  >
                                    {estado}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="academico-total">
                    <span>
                      <strong>{presentes + atrasados + ausentes}</strong>
                      {' de '}
                      <strong>{inscritos.length}</strong>
                      {' alumnos seleccionados'}
                    </span>

                    <span>
                      Ausentes: <strong>{ausentes}</strong>
                      {' · '}
                      Pendientes: <strong>{pendientes}</strong>
                    </span>
                  </div>

                  <div className="academico-acciones-finales">
                    <button
  type="button"
  className="academico-btn academico-btn-principal"
  disabled={
    guardandoAsistencia || presentes + atrasados + ausentes === 0
  }
  onClick={async () => {
    if (guardandoAsistencia) return

    const fecha = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())

    const cantidad = presentes + atrasados + ausentes

    if (!window.confirm(
      `Se intentaran registrar ${cantidad} marcaciones para ${fecha}. ¿Deseas continuar?`
    )) return

    setGuardandoAsistencia(true)
    setResultadoAsistencia(null)

    let correctos = 0
    let duplicados = 0
    const errores = []

    try {
      for (const m of inscritos) {
        const estado = estadosAsistencia[m.alumnoId]

        if (!['Presente', 'Atrasado', 'Ausente'].includes(estado)) continue

        try {
          const respuesta = await fetch(estado === 'Ausente' ? '/api/academico/docente/ausencia' : '/api/academico/docente/asistencia', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              alumnoId: String(m.alumnoId),
              horarioId: String(horarioSeleccionado.id),
              fecha,
              estado
            })
          })

          const datosRespuesta = await respuesta.json().catch(() => ({}))

          if (respuesta.status === 201) {
            correctos++
          } else if (respuesta.status === 409) {
            duplicados++
            errores.push(
              `${nombreAlumno(alumnos, m.alumnoId)}: registro duplicado.`
            )
          } else {
            errores.push(
              `${nombreAlumno(alumnos, m.alumnoId)}: HTTP ${respuesta.status}. ${datosRespuesta.message || datosRespuesta.error || 'No se pudo registrar.'}`
            )

            if ([401, 403].includes(respuesta.status)) break
          }
        } catch {
          errores.push(
            `${nombreAlumno(alumnos, m.alumnoId)}: error de conexion.`
          )
        }
      }

      setResultadoAsistencia({
        fecha,
        correctos,
        duplicados,
        errores
      })
    } finally {
      setGuardandoAsistencia(false)
    }
  }}
>
  {guardandoAsistencia ? 'Registrando...' : 'Guardar asistencia'}
</button>
                  </div>
                </>
              )}

              {!horarioSeleccionado && (
                <div className="academico-estado-vacio">
                  Selecciona una clase para cargar los estudiantes.
                </div>
              )}

              {horarioSeleccionado && inscritos.length === 0 && (
                <div className="academico-estado-vacio">
                  No existen matrículas activas para esta clase.
                </div>
              )}

              {resultadoAsistencia && (
  <div className="academico-nota" role="status" aria-live="polite">
    <div>
      <strong>Resultado del registro</strong>
      <p>Fecha: {resultadoAsistencia.fecha}</p>
      <p>Registros creados: {resultadoAsistencia.correctos}</p>
      <p>Duplicados rechazados: {resultadoAsistencia.duplicados}</p>
      {resultadoAsistencia.errores.length > 0 && (
        <ul>
          {resultadoAsistencia.errores.map((mensaje, i) => (
            <li key={`${i}-${mensaje}`}>{mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  </div>
)}
<div className="academico-nota">
                <span className="academico-nota-icono">i</span>
                <p>
                  <strong>Modo preparación.</strong>
                  {' '}
                  Puedes seleccionar estados y revisar los totales.
                  Todavía no se guardan registros en Firebase.
                  El guardado se habilitará después de comprobar
                  las validaciones de la API.
                </p>
              </div>
            </section>
          </>
        )
      }
            case '/academico/reportes': {
        const cursosVisibles = cursos.filter(c =>
          filtroReporteCurso === 'Todos' ||
          String(c.id) === String(filtroReporteCurso)
        )

        const cursosIds = new Set(cursosVisibles.map(c => String(c.id)))

        const horariosVisibles = horarios.filter(h =>
          cursosIds.has(String(h.cursoId))
        )

        const horarioIds = new Set(horariosVisibles.map(h => String(h.id)))

        const matriculasVisibles = matriculas.filter(m =>
          cursosIds.has(String(m.cursoId)) &&
          String(m.estado || '').toLowerCase() === 'activo'
        )

        const marcasVisibles = marcaciones.filter(m =>
          horarioIds.has(String(m.horarioId))
        )

        const presentes = marcasVisibles.filter(m =>
          String(m.estado || '').toLowerCase() === 'presente'
        ).length

        const atrasados = marcasVisibles.filter(m =>
          String(m.estado || '').toLowerCase() === 'atrasado'
        ).length

        const ausentes = ausencias.filter(a =>
          horarioIds.has(String(a.horarioId))
        ).length

        const total = presentes + atrasados + ausentes
        const porcentaje = total > 0
          ? Math.round(((presentes + atrasados) / total) * 100)
          : 0

        return (
          <>
            <div className="academico-encabezado">
              <h1>Reportes académicos</h1>
              <p>Consulta los indicadores de asistencia de tus asignaturas.</p>
            </div>

            <section className="academico-seccion">
              <h2>Filtrar por asignatura</h2>
              <select
                value={filtroReporteCurso}
                onChange={e => setFiltroReporteCurso(e.target.value)}
                aria-label="Filtrar reportes por curso"
              >
                <option value="Todos">Todas mis asignaturas</option>
                {cursos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre || c.id}
                  </option>
                ))}
              </select>
            </section>

            <section className="academico-seccion">
              <h2>Resumen de asistencia oficial</h2>
              <div className="academico-grid">
                <article className="academico-tarjeta">
                  <h3>Presentes</h3>
                  <p>{presentes}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Atrasados</h3>
                  <p>{atrasados}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Ausencias registradas</h3>
                  <p>{ausentes}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Asistencia registrada</h3>
                  <p>{porcentaje}%</p>
                </article>
              </div>
              <p>
                El porcentaje considera las marcaciones y ausencias
                disponibles en los registros académicos.
              </p>
            </section>

            <section className="academico-seccion">
            <section className="academico-seccion">
              <h2>Solicitudes de justificacion pendientes</h2>
              <p>Revisa las solicitudes de tus estudiantes. Solo se muestran solicitudes enviadas y pendientes.</p>
              {mensajeRevision && <p className="academico-nota" role="status" aria-live="polite">{mensajeRevision}</p>}
              {ausencias.filter(a => String(a.estado) === 'Pendiente' && a.solicitudJustificacion?.estado === 'Enviada').length === 0 ? (
                <p>No hay solicitudes de justificacion pendientes de revision.</p>
              ) : (
                <div className="academico-grid">
                  {ausencias.filter(a => String(a.estado) === 'Pendiente' && a.solicitudJustificacion?.estado === 'Enviada').map(a => {
                    const horario = horarios.find(h => String(h.id) === String(a.horarioId))
                    return (
                      <article className="academico-tarjeta" key={a.id}>
                        <h3>{nombreCurso(cursos, horario?.cursoId || a.cursoId)}</h3>
                        <p><strong>Alumno:</strong> {nombreAlumno(alumnos, a.alumnoId)}</p>
                        <p><strong>Fecha:</strong> {a.fecha || 'No informada'}</p>
                        <p><strong>Motivo:</strong> {a.solicitudJustificacion.motivo || 'Sin motivo'}</p>
                        <label htmlFor={`observacion-revision-${a.id}`}>Observaciones (opcional)</label>
                        <textarea
                          id={`observacion-revision-${a.id}`}
                          rows={3}
                          maxLength={500}
                          value={observacionesRevision[a.id] || ''}
                          onChange={e => setObservacionesRevision(actual => ({ ...actual, [a.id]: e.target.value }))}
                          disabled={Boolean(revisandoAusenciaId)}
                          placeholder="Escribe una observacion para el estudiante..."
                          style={{ width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 8, marginBottom: 10 }}
                        />
                        <div className="academico-acciones">
                          <button type="button" className="academico-btn academico-btn-verde"
                            disabled={Boolean(revisandoAusenciaId)}
                            onClick={() => revisarJustificacion(a.id, 'Justificada')}>
                            {revisandoAusenciaId === String(a.id) ? 'Guardando...' : 'Aprobar justificacion'}
                          </button>
                          <button type="button" className="academico-btn academico-btn-secundario"
                            disabled={Boolean(revisandoAusenciaId)}
                            onClick={() => revisarJustificacion(a.id, 'No justificada')}>
                            Rechazar
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
              <h2>Detalle por asignatura</h2>
              {cursosVisibles.length === 0 ? (
                <p>No se encontraron asignaturas.</p>
              ) : (
                <div className="academico-grid">
                  {cursosVisibles.map(c => {
                    const ids = new Set(
                      horarios.filter(h =>
                        String(h.cursoId) === String(c.id)
                      ).map(h => String(h.id))
                    )
                    const p = marcaciones.filter(m =>
                      ids.has(String(m.horarioId)) &&
                      String(m.estado || '').toLowerCase() === 'presente'
                    ).length
                    const a = marcaciones.filter(m =>
                      ids.has(String(m.horarioId)) &&
                      String(m.estado || '').toLowerCase() === 'atrasado'
                    ).length
                    const faltas = ausencias.filter(aus =>
                      ids.has(String(aus.horarioId))
                    ).length
                    const inscritos = matriculasVisibles.filter(m =>
                      String(m.cursoId) === String(c.id)
                    ).length

                    return (
                      <article className="academico-tarjeta" key={c.id}>
                        <h3>{nombreCurso(cursos, c.id)}</h3>
                        <p>Estudiantes matriculados: {inscritos}</p>
                        <p>Presentes: {p}</p>
                        <p>Atrasados: {a}</p>
                        <p>Ausencias: {faltas}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )
      }
      // ASISTIA_187_14_50_PERFILES
      case '/academico/perfil': {
        const esDocente = rol === 'docente'
        const persona = esDocente ? datos.docente : datos.alumno
        const nombre = persona?.nombre || user?.nombre || 'Usuario'
        const identificador = persona?.id || 'No informado'
        const email = user?.email || 'No informado'

        const totalCursos = cursos.length
        const totalHorarios = horarios.length

        return (
          <>
            <div className="academico-encabezado">
              <h1>Mi perfil</h1>
              <p>
                Consulta tu información personal y académica
                registrada en AsistencialIA.
              </p>
            </div>

            <section className="academico-seccion">
              <h2>Información personal</h2>
              <div className="academico-grid">
                <article className="academico-tarjeta">
                  <h3>Nombre</h3>
                  <p>{nombre}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Correo electrónico</h3>
                  <p>{email}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Rol</h3>
                  <p>{esDocente ? 'Docente' : 'Alumno'}</p>
                </article>
                <article className="academico-tarjeta">
                  <h3>Identificador académico</h3>
                  <p>{identificador}</p>
                </article>
              </div>
            </section>

            <section className="academico-seccion">
              <h2>Información académica</h2>
              <div className="academico-grid">
                {esDocente ? (
                  <>
                    <article className="academico-tarjeta">
                      <h3>Especialidad</h3>
                      <p>{persona?.especialidad || 'No informada'}</p>
                    </article>
                    <article className="academico-tarjeta">
                      <h3>Asignaturas</h3>
                      <p>{totalCursos}</p>
                    </article>
                    <article className="academico-tarjeta">
                      <h3>Clases programadas</h3>
                      <p>{totalHorarios}</p>
                    </article>
                  </>
                ) : (
                  <>
                    <article className="academico-tarjeta">
                      <h3>Carrera</h3>
                      <p>{persona?.carrera || 'No informada'}</p>
                    </article>
                    <article className="academico-tarjeta">
                      <h3>Sede</h3>
                      <p>{persona?.sede || 'No informada'}</p>
                    </article>
                    <article className="academico-tarjeta">
                      <h3>Asignaturas inscritas</h3>
                      <p>{totalCursos}</p>
                    </article>
                    <article className="academico-tarjeta">
                      <h3>Horarios asignados</h3>
                      <p>{totalHorarios}</p>
                    </article>
                  </>
                )}
              </div>
            </section>

            {/* ASISTIA_187_14_68_CONSENTIMIENTO_EN_PERFIL */}
            {!esDocente && (
              <section className="academico-seccion asistia-consentimiento-v3" aria-label="Privacidad y consentimiento biométrico">
              {/* ASISTIA_187_14_70_ENLACES_LEGALES */}
              <nav aria-label="Documentos legales de AsistIA" style={{display:'flex',flexWrap:'wrap',gap:'12px',marginBottom:'20px'}}>
                <a href="/legal/privacidad.html" target="_blank" rel="noopener noreferrer" style={{color:'#1769cf',fontWeight:650,textDecoration:'underline'}}>Política de privacidad (borrador)</a>
                <a href="/legal/terminos.html" target="_blank" rel="noopener noreferrer" style={{color:'#1769cf',fontWeight:650,textDecoration:'underline'}}>Términos de uso (borrador)</a>
              </nav>
                <h2>Privacidad y enrolamiento facial</h2>
                <p><strong>Documento informativo preliminar.</strong> El reconocimiento facial todavía no está habilitado. Esta preferencia no activa la cámara ni constituye por sí sola un enrolamiento.</p>
                <p>Finalidad prevista: verificar la identidad del alumno para registrar asistencia. La alternativa de PIN temporal seguirá disponible sin reconocimiento facial.</p>
                <p>Antes de activar el sistema se deberán publicar la política de privacidad definitiva, los plazos de conservación, el responsable del tratamiento, los procedimientos para ejercer derechos y las medidas de seguridad aplicables.</p>
                {bioCargando && <p>Consultando estado en Firebase...</p>}
                {bioInfo && (
                  <>
                    <p><strong>Estado:</strong> {bioInfo.estado} · <strong>Versión:</strong> {bioInfo.version}</p>
                    {bioInfo.actualizadoAt && <p>Última actualización: {new Date(bioInfo.actualizadoAt).toLocaleString('es-CL')}</p>}
                    {bioInfo.estado !== 'Otorgado' ? (
                      <>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                          <input type="checkbox" checked={bioAcepta} onChange={e => setBioAcepta(e.target.checked)} />
                          <span>He leído la información preliminar y registro voluntariamente mi preferencia de participar en el futuro enrolamiento facial. Entiendo que no se capturan ni almacenan datos faciales en este paso y que puedo revocar mi decisión.</span>
                        </label>
                        <button type="button" disabled={!bioAcepta || bioGuardando} onClick={() => actualizarConsentimientoBiometrico('aceptar')}>
                          {bioGuardando ? 'Guardando...' : 'Registrar mi aceptación'}
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={bioGuardando} onClick={() => actualizarConsentimientoBiometrico('revocar')}>
                        {bioGuardando ? 'Guardando...' : 'Revocar consentimiento'}
                      </button>
                    )}
                  </>
                )}
                {bioError && <p role="alert" style={{ color: '#b91c1c' }}>{bioError}</p>}
                <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>La aceptación biométrica es independiente de los términos generales. No se exige para utilizar las demás funciones académicas.</p>
              </section>
            )}
            {/* ASISTIA_187_14_72_ENROLAMIENTO_PREPARACION */}
            {!esDocente && (
              <section className="academico-seccion" aria-label="Preparación de enrolamiento facial" style={{ marginTop: 20 }}>
                <h2>Enrolamiento facial</h2>
                <EstadoEnrolamientoSeguro token={token} />
                <p>El enrolamiento permitirá, en una futura versión, verificar tu identidad para registrar asistencia mediante reconocimiento facial. Siempre existirá una alternativa sin biometría.</p>
                <div style={{ padding: '16px 18px', border: '1px solid #dce8fc', background: '#f1f6ff', borderRadius: 12, margin: '16px 0' }}>
                  <strong>Estado del enrolamiento: No habilitado</strong>
                  <p style={{ margin: '8px 0 0' }}>La cámara y el almacenamiento de datos faciales están desactivados hasta aprobar la documentación definitiva y los controles de seguridad.</p>
                </div>
                <p><strong>Verificación del consentimiento en Firebase:</strong>{' '}
                  {bioCargando ? 'Consultando...' : bioError ? 'No se pudo verificar' : !bioInfo ? 'Sin datos' : bioInfo.estado !== 'Otorgado' ? 'Sin consentimiento vigente' : String(bioInfo.versión || '').startsWith('BORRADOR') ? 'Preferencia preliminar registrada (no válida para enrolamiento real)' : 'Consentimiento registrado (pendiente de válidación operativa)'}
                </p>
                <button type="button" className="academico-btn academico-btn-principal" disabled aria-disabled="true" title="Disponible cuando la política definitiva, el consentimiento y el backend de enrolamiento estén aprobados">
                  Iniciar enrolamiento facial (próximamente)
                </button>
                <p style={{ marginTop: 12, color: '#657a96', fontSize: '.9rem' }}>No se activa la cámara ni se guardan imágenes. El PIN temporal se solicita desde Mi asistencia.</p>
              </section>
            )}

            <section className="academico-seccion">
              <h2>Seguridad de la cuenta</h2>
              <p>
                Tu información académica se consulta de acuerdo
                con el rol de tu sesión autenticada.
                Los cambios de datos personales no están
                habilitados desde esta pantalla.
              </p>
            </section>
          </>
        )
      }
default:
        return <p>Sección académica no encontrada.</p>
    }
  }

  return (
    <div className="academico-pagina">
      <div style={{ marginBottom: 22 }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          ← Volver al panel
        </Link>
        <h1 style={{ margin: '16px 0 6px' }}>{titulo}</h1>
        <p style={{ opacity: 0.7, margin: 0 }}>
          {rol === 'docente' ? 'Espacio del docente' : 'Espacio del alumno'}
          {' · '}
          Información académica personal
        </p>
      </div>

      {!loading && !error && datos && visual.indicadores.length > 0 && (
        <div className="academico-resumen-global">
          {visual.indicadores.map(([etiqueta, valor, color]) => (
            <div
              key={etiqueta}
              className={`academico-resumen-card academico-resumen-${color}`}
            >
              <div className="academico-resumen-detalle">
                <span>{etiqueta}</span>
                <strong>{valor}</strong>
                <small>Información de tu espacio académico</small>
              </div>
              <span className="academico-resumen-decoracion" aria-hidden="true">
                {color === 'green' ? '✓' :
                 color === 'orange' ? '◷' :
                 color === 'purple' ? '▥' :
                 color === 'red' ? '!' : '▦'}
              </span>
            </div>
          ))}
        </div>
      )}
      {loading && (
        <Tarjeta titulo="Cargando información">
          <p>Consultando los registros académicos...</p>
        </Tarjeta>
      )}

      {!loading && error && (
        <Tarjeta titulo="No se pudo cargar la información">
          <p role="alert">{error}</p>
          <p>Verifica que el servidor esté activo y vuelve a ingresar.</p>
        </Tarjeta>
      )}

      {!loading && !error && datos && contenido()}
    </div>
  )
}
