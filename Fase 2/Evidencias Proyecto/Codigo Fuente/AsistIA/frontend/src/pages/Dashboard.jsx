import {
  Users,
  UserX,
  Clock3,
  LogOut,
  ScanFace,
  CalendarDays,
  Bell,
  SlidersHorizontal,
  GraduationCap,
  UserRound,
  BookOpen,
  School,
  Check,
  X,
  FileText,
  Settings,
  ClipboardCheck,
  AlertTriangle,
  CalendarCheck,
} from 'lucide-react'

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const fechaActual =
    new Date().toLocaleDateString(
      'es-CL',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
    )

  const horaActual =
    new Date().getHours()

  let saludo = 'Buenos días'

  if (
    horaActual >= 12 &&
    horaActual < 20
  ) {
    saludo = 'Buenas tardes'
  }

  if (
    horaActual >= 20 ||
    horaActual < 6
  ) {
    saludo = 'Buenas noches'
  }

  const role =
    user?.role || ''

  if (role === 'Alumno') {
    return (
      <StudentDashboard
        user={user}
        saludo={saludo}
        fechaActual={fechaActual}
        navigate={navigate}
      />
    )
  }

  if (role === 'Docente') {
    return (
      <TeacherDashboard
        user={user}
        saludo={saludo}
        fechaActual={fechaActual}
        navigate={navigate}
      />
    )
  }  
  if (role !== 'Administradora') {
    return (
      <section className="panel" style={{ padding: 24, margin: 24 }}>
        <h2>Acceso no disponible</h2>
        <p>Tu cuenta no tiene un rol autorizado para este panel.</p>
      </section>
    )
  }


  return (
    <AdminDashboard
      user={user}
      saludo={saludo}
      fechaActual={fechaActual}
      navigate={navigate}
    />
  )
}

/* =====================================================
   DASHBOARD ADMINISTRADOR
===================================================== */

function AdminDashboard({
  user,
  saludo,
  fechaActual,
  navigate,
}) {
  const { token } = useAuth()
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [periodo, setPeriodo] = useState('hoy')

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    let activo = true

    const cargarDatos = async () => {
      setLoading(true)
      setError('')

      try {
        const rutas = [
          'alumnos',
          'docentes',
          'cursos',
          'horarios',
          'marcaciones',
          'ausencias',
          'incidencias',
        ]

        const respuestas = await Promise.all(
          rutas.map(async (ruta) => {
            const response = await fetch(`/api/${ruta}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            })

            const resultado = await response.json()

            if (!response.ok || !resultado.ok) {
              throw new Error(resultado.message || `Error al cargar ${ruta}`)
            }

            return resultado[ruta] || []
          })
        )

        if (activo) {
          setDatos(Object.fromEntries(
            rutas.map((ruta, index) => [ruta, respuestas[index]])
          ))
        }
      } catch (err) {
        if (activo) setError(err.message || 'No se pudieron cargar los datos.')
      } finally {
        if (activo) setLoading(false)
      }
    }

    cargarDatos()

    return () => {
      activo = false
    }
  }, [token, refreshKey])

  const alumnos = datos?.alumnos || []
  const docentes = datos?.docentes || []
  const cursos = datos?.cursos || []
  const horarios = datos?.horarios || []
  const marcaciones = datos?.marcaciones || []
  const ausencias = datos?.ausencias || []
  const incidencias = datos?.incidencias || []

  const notificacionesPendientes = incidencias.filter(
    i => i.estado === 'Abierta' || i.estado === 'En proceso'
  ).length

  const actualizarPanel = () => {
    setRefreshKey(valor => valor + 1)
  }

  const hoy = [
    new Date().getFullYear(),
    String(new Date().getMonth() + 1).padStart(2, '0'),
    String(new Date().getDate()).padStart(2, '0'),
  ].join('-')

  const diasPeriodo = periodo === '7dias' ? 7 : periodo === '30dias' ? 30 : 1

  const inicioPeriodo = new Date()
  inicioPeriodo.setHours(0, 0, 0, 0)
  inicioPeriodo.setDate(inicioPeriodo.getDate() - (diasPeriodo - 1))

  const fechaInicio = [
    inicioPeriodo.getFullYear(),
    String(inicioPeriodo.getMonth() + 1).padStart(2, '0'),
    String(inicioPeriodo.getDate()).padStart(2, '0'),
  ].join('-')

  const dentroPeriodo = fecha =>
    typeof fecha === 'string' &&
    fecha >= fechaInicio &&
    fecha <= hoy

  const marcacionesHoy = marcaciones.filter(m => dentroPeriodo(m.fecha))
  const ausenciasHoy = ausencias.filter(a => dentroPeriodo(a.fecha))
  const horariosPorId = new Map(horarios.map(h => [h.id, h]))

  const convertirMinutos = hora => {
    if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) return null
    const [h, m] = hora.split(':').map(Number)
    return h * 60 + m
  }

  const atrasosHoy = marcacionesHoy.filter(m => {
    const horario = horariosPorId.get(m.horarioId)
    if (!horario) return false

    const llegada = convertirMinutos(m.hora)
    const inicio = convertirMinutos(horario.inicio)

    return llegada !== null &&
      inicio !== null &&
      llegada - inicio > 5
  })

  const formatoNumero = valor =>
    loading || error ? '—' : valor.toLocaleString('es-CL')

  const actividadReciente = [
    ...marcaciones.map(m => ({
      id: `m-${m.id}`,
      tipo: 'Marcación',
      descripcion: 'Entrada registrada',
      fecha: m.fecha || '',
      hora: m.hora || '',
      alumno: m.alumno || 'Sin nombre',
      curso: m.asignatura || m.codigo || 'Sin asignatura',
      estado: m.estado || 'Presente',
      clase: m.estado === 'Pendiente' ? 'pending' : 'valid',
      icono: <Check size={13} />,
    })),
    ...ausencias.map(a => ({
      id: `a-${a.id}`,
      tipo: 'Ausencia',
      descripcion: a.motivo || 'Ausencia registrada',
      fecha: a.fecha || '',
      hora: '',
      alumno: a.alumno || 'Sin nombre',
      curso: a.asignatura || a.codigo || 'Sin asignatura',
      estado: a.estado || 'Pendiente',
      clase: a.estado === 'Justificada' ? 'valid' : 'danger',
      icono: <X size={13} />,
    })),
    ...incidencias.map(i => ({
      id: `i-${i.id}`,
      tipo: 'Incidencia',
      descripcion: i.titulo || i.descripcion || 'Incidencia registrada',
      fecha: String(i.fecha || i.createdAt || '').slice(0, 10),
      hora: String(i.hora || '').slice(0, 5),
      alumno: i.alumno || i.reportadoPor || '—',
      curso: i.asignatura || i.codigo || '—',
      estado: i.estado || 'Registrada',
      clase: i.estado === 'Resuelta' ? 'valid' : 'pending',
      icono: <AlertTriangle size={13} />,
    })),
  ]
    .filter(item =>
      item.fecha &&
      `${item.fecha} ${item.hora || '00:00'}` <=
        `${hoy} ${new Date().toTimeString().slice(0, 5)}`
    )
    .sort((a, b) =>
      `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`)
    )
    .slice(0, 8)
  const tituloDistribucion =
    periodo === 'hoy'
      ? 'Distribución de asistencia hoy'
      : periodo === '7dias'
        ? 'Distribución de asistencia · últimos 7 días'
        : 'Distribución de asistencia · últimos 30 días'
  const stats = [
    {
      title: periodo === 'hoy' ? 'Presentes hoy' : 'Marcaciones del período',
      value: formatoNumero(marcacionesHoy.filter(m => m.estado !== 'Pendiente').length),
      percent: periodo === 'hoy' ? 'Marcaciones registradas hoy' : 'Registros del período seleccionado',
      color: 'green',
      icon: Users,
    },
    {
      title: periodo === 'hoy' ? 'Ausentes hoy' : 'Ausencias del período',
      value: formatoNumero(ausenciasHoy.length),
      percent: periodo === 'hoy' ? 'Ausencias registradas hoy' : 'Registros del período seleccionado',
      color: 'red',
      icon: UserX,
    },
    {
      title: periodo === 'hoy' ? 'Atrasos hoy' : 'Atrasos del período',
      value: formatoNumero(atrasosHoy.length),
      percent: 'Más de 5 minutos',
      color: 'orange',
      icon: Clock3,
    },
    {
      title: 'Incidencias registradas',
      value: formatoNumero(incidencias.length),
      percent: 'Total histórico',
      color: 'purple',
      icon: AlertTriangle,
    },
    {
      title: 'Marcaciones totales',
      value: formatoNumero(marcaciones.length),
      percent: 'Total histórico',
      color: 'blue',
      icon: ScanFace,
    },
  ]
  return (
    <>
      <DashboardHeader
        saludo={saludo}
        name={user?.name}
        subtitle="Resumen general de asistencia institucional"
        fechaActual={fechaActual}
        notificationCount={notificacionesPendientes}
        onNotificationClick={() => navigate('/incidencias')}
        onRefresh={actualizarPanel}
        refreshing={loading}
        periodo={periodo}
        onPeriodoChange={setPeriodo}
      />

      {loading && (
        <p role="status">Cargando estadísticas institucionales...</p>
      )}

      {error && (
        <p role="alert" style={{ color: '#dc2626' }}>
          No se pudieron cargar las estadísticas: {error}
        </p>
      )}

      <StatsGrid
        stats={stats}
      />

      <section className="middle-grid">

        <AttendanceChart marcaciones={marcaciones} ausencias={ausencias} />

        <AttendanceDonut marcaciones={marcacionesHoy} ausencias={ausenciasHoy} atrasos={atrasosHoy} titulo={tituloDistribucion} />

        <div className="panel summary-panel">

          <h3>
            Resumen general
          </h3>

          <SummaryItem
            icon={
              <GraduationCap size={20} />
            }
            label="Total de estudiantes"
            value={formatoNumero(alumnos.length)}
          />

          <SummaryItem
            icon={
              <UserRound size={20} />
            }
            label="Total de docentes"
            value={formatoNumero(docentes.length)}
          />

          <SummaryItem
            icon={
              <BookOpen size={20} />
            }
            label="Cursos activos"
            value={formatoNumero(cursos.filter(c => c.estado === "Activo").length)}
          />

          <SummaryItem
            icon={
              <School size={20} />
            }
            label="Aulas activas"
            value={formatoNumero(new Set(horarios.filter(h => h.estado !== "Cancelada").map(h => h.sala).filter(Boolean)).size)}
          />

        </div>

      </section>

      <section className="bottom-grid">

        <div className="panel activity-panel">

          <h3>
            Actividad reciente
          </h3>

          <div className="table-wrapper">

            <table>

              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Hora</th>
                  <th>Usuario</th>
                  <th>Curso</th>
                  <th>Estado</th>
                </tr>
              </thead>

              <tbody>
                {actividadReciente.map(item => (
                  <Row
                    key={item.id}
                    icon={item.icono}
                    type={item.tipo}
                    description={item.descripcion}
                    date={`${item.fecha} ${item.hora}`.trim()}
                    user={item.alumno}
                    course={item.curso}
                    status={item.estado}
                    statusClass={item.clase}
                  />
                ))}

                {!loading && !error && actividadReciente.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{
                      textAlign: 'center',
                      padding: 24,
                      color: '#64748b',
                    }}>
                      Todavía no hay actividad registrada.
                    </td>
                  </tr>
                )}

                {error && (
                  <tr>
                    <td colSpan={6}>
                      No fue posible cargar la actividad.
                    </td>
                  </tr>
                )}
              </tbody>

            </table>

          </div>

          <button
            className="link-button"
            onClick={() =>
              navigate('/marcaciones')
            }
          >
            Ver toda la actividad
          </button>

        </div>

        <div className="panel quick-panel">

          <h3>
            Accesos rápidos
          </h3>

          <div className="quick-grid">

            <Quick
              icon={<ScanFace size={22} />}
              text="Marcaciones"
              color="blue"
              onClick={() =>
                navigate('/marcaciones')
              }
            />

            <Quick
              icon={<UserX size={22} />}
              text="Ver ausencias"
              color="red"
              onClick={() =>
                navigate('/ausencias')
              }
            />

            <Quick
              icon={<Clock3 size={22} />}
              text="Ver atrasos"
              color="orange"
              onClick={() =>
                navigate('/atrasos')
              }
            />

            <Quick
              icon={<FileText size={22} />}
              text="Generar informe"
              color="green"
              onClick={() =>
                navigate('/reportes')
              }
            />

            <Quick
              icon={<CalendarDays size={22} />}
              text="Horario de clases"
              color="purple"
              onClick={() =>
                navigate('/horarios')
              }
            />

            <Quick
              icon={<Settings size={22} />}
              text="Configuración"
              color="gray"
              onClick={() =>
                navigate('/configuracion')
              }
            />

          </div>

        </div>

      </section>

      <DashboardFooter />
    </>
  )
}

/* =====================================================
   DASHBOARD DOCENTE
===================================================== */

/* ASISTIA_187_14_12: PANELES ACADEMICOS FIRESTORE */

const DIAS_ACADEMICOS = [
  'domingo', 'lunes', 'martes', 'miercoles',
  'jueves', 'viernes', 'sabado'
]

function normalizarAcademico(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function esHorarioHoy(horario) {
  const dia = normalizarAcademico(
    horario.diaSemana ?? horario.dia ?? horario.dia_semana
  )
  const actual = new Date().getDay()

  if (/^[0-6]$/.test(dia)) return Number(dia) === actual
  if (/^[1-7]$/.test(dia)) return Number(dia) % 7 === actual

  return dia === DIAS_ACADEMICOS[actual]
}

function textoHorario(horario) {
  const inicio = horario.horaInicio ?? horario.inicio ?? ''
  const fin = horario.horaFin ?? horario.fin ?? ''
  return [inicio, fin].filter(Boolean).join(' - ') || 'Sin hora'
}

function nombreCursoAcademico(cursos, id) {
  const curso = cursos.find(c => c.id === id)
  return curso?.nombre ?? curso?.asignatura ?? curso?.nombreCurso ??
    id ?? 'Sin asignatura'
}

function esAtrasoAcademico(marca) {
  return ['atraso', 'atrasado', 'tarde', 'tardanza'].includes(
    normalizarAcademico(marca.estado ?? marca.tipo ?? marca.resultado)
  )
}

function esPresenteAcademico(marca) {
  return ['presente', 'asistio', 'asistencia', 'puntual'].includes(
    normalizarAcademico(marca.estado ?? marca.tipo ?? marca.resultado)
  ) || esAtrasoAcademico(marca)
}

function esAusenteAcademico(marca) {
  return ['ausente', 'ausencia', 'falta', 'inasistencia'].includes(
    normalizarAcademico(marca.estado ?? marca.tipo ?? marca.resultado)
  )
}

function usePanelAcademico(rol, token) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    setDatos(null)
    setError('')
    setLoading(true)

    if (!token) {
      setError('No hay una sesión activa.')
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
            resultado.message || `Error HTTP ${respuesta.status}`
          )
        }

        if (activo) setDatos(resultado)
      } catch (err) {
        if (activo) {
          setError(err.message || 'No se pudo consultar Firestore.')
        }
      } finally {
        if (activo) setLoading(false)
      }
    }

    cargar()
    return () => { activo = false }
  }, [rol, token])

  return { datos, loading, error }
}

function EstadoPanelAcademico({ loading, error }) {
  if (loading) {
    return <section className="panel" style={{ padding: 24 }}>
      Cargando información académica...
    </section>
  }

  if (error) {
    return <section className="panel" style={{ padding: 24 }}>
      <h3>No fue posible cargar el panel</h3>
      <p>{error}</p>
    </section>
  }

  return null
}

function TarjetasAcademicas({ items }) {
  return (
    <section className="entity-stats">
      {items.map(({ title, value, percent, color, icon: Icon }) => (
        <article key={title}>
          <div className={`entity-stat-icon ${color}`}>
            <Icon size={20} />
          </div>
          <div>
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{percent}</small>
          </div>
        </article>
      ))}
    </section>
  )
}

function TeacherDashboard({
  user, saludo, fechaActual, navigate
}) {
  const { token } = useAuth()
  const { datos, loading, error } = usePanelAcademico('docente', token)

  const cursos = datos?.cursos ?? []
  const horarios = datos?.horarios ?? []
  const marcaciones = datos?.marcaciones ?? []
  const ausencias = datos?.ausencias ?? []
  const hoy = horarios.filter(esHorarioHoy)

  const stats = [
    {
      title: 'Clases de hoy',
      value: hoy.length,
      percent: 'Según horario registrado',
      color: 'blue', icon: BookOpen
    },
    {
      title: 'Cursos asignados',
      value: cursos.length,
      percent: 'Vinculados a tus horarios',
      color: 'green', icon: GraduationCap
    },
    {
      title: 'Ausencias registradas',
      value: ausencias.length,
      percent: 'En tus horarios',
      color: 'red', icon: UserX
    },
    {
      title: 'Marcaciones registradas',
      value: marcaciones.length,
      percent: 'En tus horarios',
      color: 'orange', icon: Clock3
    }
  ]

  return (
    <>
      <DashboardHeader
        saludo={saludo}
        name={user?.name}
        subtitle="Tus asignaturas y registros académicos"
        fechaActual={fechaActual}
        showFilter={false}
      />

      <EstadoPanelAcademico loading={loading} error={error} />

      {!loading && !error && datos && (
        <>
          <TarjetasAcademicas items={stats} />

          <section className="middle-grid">
            <div className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <h3>Mis clases de hoy</h3>
                  <span>Horario registrado en Firestore</span>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Horario</th>
                      <th>Asignatura</th>
                      <th>Sección</th>
                      <th>Sala</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoy.length === 0 ? (
                      <tr>
                        <td colSpan={4}>Sin clases registradas para hoy.</td>
                      </tr>
                    ) : hoy.map(h => (
                      <tr key={h.id}>
                        <td>{textoHorario(h)}</td>
                        <td>{nombreCursoAcademico(cursos, h.cursoId)}</td>
                        <td>{h.seccion ?? '—'}</td>
                        <td>{h.sala ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel summary-panel">
              <h3>Gestión docente</h3>
              <SummaryItem
                icon={<BookOpen size={20} />}
                label="Cursos asignados"
                value={cursos.length}
              />
              <SummaryItem
                icon={<CalendarDays size={20} />}
                label="Bloques de horario"
                value={horarios.length}
              />
              <SummaryItem
                icon={<ClipboardCheck size={20} />}
                label="Marcaciones observadas"
                value={marcaciones.length}
              />
              <SummaryItem
                icon={<AlertTriangle size={20} />}
                label="Ausencias registradas"
                value={ausencias.length}
              />
            </div>

            <div className="panel quick-panel">
              <h3>Mis asignaturas</h3>
              {cursos.length === 0 ? (
                <p>Sin asignaturas vinculadas.</p>
              ) : cursos.map(c => (
                <p key={c.id}>
                  <BookOpen size={16} style={{ verticalAlign: 'middle' }} />
                  {' '}{nombreCursoAcademico(cursos, c.id)}
                </p>
              ))}
            </div>
          </section>
        </>
      )}

      <DashboardFooter />
    </>
  )
}

function StudentDashboard({
  user, saludo, fechaActual, navigate
}) {
  const { token } = useAuth()
  const { datos, loading, error } = usePanelAcademico('alumno', token)

  const cursos = datos?.cursos ?? []
  const matriculas = (datos?.matriculas ?? [])
    .filter(m => normalizarAcademico(m.estado) === 'activo')
  const horarios = datos?.horarios ?? []
  const marcaciones = datos?.marcaciones ?? []
  const ausencias = datos?.ausencias ?? []
  const hoy = horarios.filter(esHorarioHoy)

  const presentes = marcaciones.filter(esPresenteAcademico).length
  const faltasEnMarcas = marcaciones.filter(esAusenteAcademico).length
  const observadas = presentes + faltasEnMarcas
  const porcentaje = observadas
    ? `${Math.round(presentes * 100 / observadas)}%`
    : 'Sin datos'
  const atrasos = marcaciones.filter(esAtrasoAcademico).length

  const stats = [
    {
      title: 'Mi asistencia observada',
      value: porcentaje,
      percent: 'Solo marcaciones con estado reconocible',
      color: 'green', icon: ScanFace
    },
    {
      title: 'Cursos inscritos',
      value: matriculas.length,
      percent: 'Matrículas activas',
      color: 'blue', icon: BookOpen
    },
    {
      title: 'Ausencias registradas',
      value: ausencias.length,
      percent: 'En colección de ausencias',
      color: 'red', icon: UserX
    },
    {
      title: 'Atrasos registrados',
      value: atrasos,
      percent: 'En marcaciones identificadas',
      color: 'orange', icon: Clock3
    }
  ]

  return (
    <>
      <DashboardHeader
        saludo={saludo}
        name={user?.name}
        subtitle="Tu información académica en Firestore"
        fechaActual={fechaActual}
        showFilter={false}
      />

      <EstadoPanelAcademico loading={loading} error={error} />

      {!loading && !error && datos && (
        <>
          <TarjetasAcademicas items={stats} />

          <section className="middle-grid">
            <div className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <h3>Mi horario de hoy</h3>
                  <span>Asignaturas matriculadas</span>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Horario</th>
                      <th>Asignatura</th>
                      <th>Sección</th>
                      <th>Sala</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoy.length === 0 ? (
                      <tr>
                        <td colSpan={4}>Sin clases registradas para hoy.</td>
                      </tr>
                    ) : hoy.map(h => (
                      <tr key={h.id}>
                        <td>{textoHorario(h)}</td>
                        <td>{nombreCursoAcademico(cursos, h.cursoId)}</td>
                        <td>{h.seccion ?? '—'}</td>
                        <td>{h.sala ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel summary-panel">
              <h3>Mi resumen académico</h3>
              <SummaryItem
                icon={<ScanFace size={20} />}
                label="Asistencia observada"
                value={porcentaje}
              />
              <SummaryItem
                icon={<BookOpen size={20} />}
                label="Matrículas activas"
                value={matriculas.length}
              />
              <SummaryItem
                icon={<UserX size={20} />}
                label="Ausencias registradas"
                value={ausencias.length}
              />
              <SummaryItem
                icon={<Clock3 size={20} />}
                label="Atrasos identificados"
                value={atrasos}
              />
            </div>

            <div className="panel quick-panel">
              <h3>Mis cursos</h3>
              {cursos.length === 0 ? (
                <p>Sin cursos matriculados.</p>
              ) : cursos.map(c => (
                <p key={c.id}>
                  <BookOpen size={16} style={{ verticalAlign: 'middle' }} />
                  {' '}{nombreCursoAcademico(cursos, c.id)}
                </p>
              ))}
            </div>
          </section>
        </>
      )}

      <DashboardFooter />
    </>
  )
}

/* =====================================================
   COMPONENTES REUTILIZABLES
===================================================== */
function DashboardHeader({
  saludo,
  name,
  subtitle,
  fechaActual,
  showFilter = true,
  notificationCount = null,
  onNotificationClick,
  onRefresh,
  refreshing = false,
  periodo,
  onPeriodoChange,
}) {
  return (
    <header className="topbar">

      <div>

        <h1>
          {saludo}, {name}
        </h1>

        <p>
          {subtitle}
        </p>

      </div>

      <div className="top-actions">

        <button
          className="date-button"
          type="button"
        >

          <CalendarDays
            size={18}
            strokeWidth={1.8}
          />

          {fechaActual}

        </button>

        <button
          className="notification"
          type="button"
          onClick={onNotificationClick}
          disabled={!onNotificationClick}
          title="Ver incidencias pendientes"
          aria-label={
            notificationCount === null
              ? 'Notificaciones no disponibles'
              : `${notificationCount} incidencias pendientes`
          }
        >
          <Bell size={21} strokeWidth={1.8} />

          {notificationCount !== null && notificationCount > 0 && (
            <span>{notificationCount}</span>
          )}
        </button>

        {onRefresh && (
          <button
            className="filter-button"
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Actualizar datos desde Firebase"
          >
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        )}

        {showFilter && onPeriodoChange && (
          <label
            className="filter-button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <SlidersHorizontal size={17} strokeWidth={1.8} />
            <span>Período</span>
            <select
              aria-label="Filtrar estadísticas por período"
              value={periodo}
              onChange={e => onPeriodoChange(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="hoy" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>Hoy</option>
              <option value="7dias" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>Últimos 7 días</option>
              <option value="30dias" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>Últimos 30 días</option>
            </select>
          </label>
        )}

      </div>

    </header>
  )
}

function StatsGrid({
  stats,
}) {
  return (
    <section className="stats-grid">

      {stats.map((item) => {
        const Icon =
          item.icon

        return (
          <div
            className="stat-card"
            key={item.title}
          >

            <div
              className={
                `stat-icon ${item.color}`
              }
            >

              <Icon
                size={23}
                strokeWidth={1.8}
              />

            </div>

            <div className="stat-info">

              <span>
                {item.title}
              </span>

              <h3>
                {item.value}
              </h3>

              <p className={item.color}>
                {item.percent}
              </p>

            </div>

          </div>
        )
      })}

    </section>
  )
}

function AttendanceChart({ marcaciones = [], ausencias = [] }) {
  const dias = Array.from({ length: 7 }, (_, index) => {
    const fecha = new Date()
    fecha.setHours(12, 0, 0, 0)
    fecha.setDate(fecha.getDate() - (6 - index))

    const clave = [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1).padStart(2, '0'),
      String(fecha.getDate()).padStart(2, '0'),
    ].join('-')

    const presentes = marcaciones.filter(
      m => m.fecha === clave && m.estado !== 'Pendiente'
    ).length

    const faltas = ausencias.filter(a => a.fecha === clave).length
    const total = presentes + faltas

    return {
      clave,
      etiqueta: fecha.toLocaleDateString('es-CL', { weekday: 'short' }),
      presentes,
      faltas,
      porcentaje: total ? Math.round(presentes * 100 / total) : null,
    }
  })

  const puntos = dias
    .map((dia, index) => ({
      ...dia,
      x: 40 + index * 100,
      y: dia.porcentaje === null
        ? null
        : 220 - dia.porcentaje * 1.8,
    }))

  const segmentos = []
  let segmento = []

  puntos.forEach(p => {
    if (p.y === null) {
      if (segmento.length) segmentos.push(segmento)
      segmento = []
    } else {
      segmento.push(p)
    }
  })

  if (segmento.length) segmentos.push(segmento)

  const hayDatos = dias.some(d => d.porcentaje !== null)

  return (
    <div className="panel chart-panel">
      <div className="panel-header">
        <div>
          <h3>Asistencia por día</h3>
          <span>Últimos 7 días · Registros observados</span>
        </div>
        <span className="small-button">7 días</span>
      </div>

      <div className="line-chart">
        <div className="y-label y100">100%</div>
        <div className="y-label y75">75%</div>
        <div className="y-label y50">50%</div>
        <div className="y-label y25">25%</div>
        <div className="y-label y0">0%</div>

        <svg viewBox="0 0 700 260" className="chart-svg">
          {segmentos.map((s, index) => (
            <polyline
              key={index}
              points={s.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#0b63ce"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {puntos.filter(p => p.y !== null).map(p => (
            <circle
              key={p.clave}
              cx={p.x}
              cy={p.y}
              r="6"
              fill="#0b63ce"
            >
              <title>
                {`${p.clave}: ${p.porcentaje}% (${p.presentes} marcaciones, ${p.faltas} ausencias)`}
              </title>
            </circle>
          ))}
        </svg>

        <div className="chart-days">
          {dias.map(d => (
            <span key={d.clave} title={d.clave}>
              {d.etiqueta}
            </span>
          ))}
        </div>

        {!hayDatos && (
          <p style={{ textAlign: 'center', color: '#64748b' }}>
            Sin registros de asistencia en los últimos 7 días.
          </p>
        )}

        {dias.filter(d => d.porcentaje !== null).length === 1 && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            Solo existe un día con registros. La línea aparecerá
            cuando haya asistencia registrada en más fechas.
          </p>
        )}
      </div>
    </div>
  )
}
function AttendanceDonut({
  marcaciones = [],
  ausencias = [],
  atrasos = [],
  titulo = 'Distribución de asistencia hoy',
}) {
  const presentes = marcaciones.filter(
    m => m.estado !== 'Pendiente'
  ).length

  const faltas = ausencias.length
  const pendientes = marcaciones.filter(
    m => m.estado === 'Pendiente'
  ).length

  const total = presentes + faltas + pendientes

  const porcentaje = total
    ? Math.round(presentes * 1000 / total) / 10
    : 0

  const proporcionPresentes = total ? presentes * 100 / total : 0
  const proporcionAusentes = total ? faltas * 100 / total : 0

  const fondo = total
    ? `conic-gradient(
        #159957 0% ${proporcionPresentes}%,
        #ef4444 ${proporcionPresentes}% ${proporcionPresentes + proporcionAusentes}%,
        #64748b ${proporcionPresentes + proporcionAusentes}% 100%
      )`
    : 'conic-gradient(#e2e8f0 0% 100%)'

  return (
    <div className="panel donut-panel">
      <h3>{titulo}</h3>

      <div className="donut-content">
        <div className="donut" style={{ background: fondo }}>
          <div className="donut-center">
            <strong>{porcentaje.toLocaleString('es-CL')}%</strong>
            <span>Presentes</span>
          </div>
        </div>

        <div className="legend">
          <LegendItem
            color="green-bg"
            label="Presentes"
            value={presentes}
          />
          <LegendItem
            color="red-bg"
            label="Ausentes"
            value={faltas}
          />
          <LegendItem
            color="orange-bg"
            label="Atrasos (incluidos en presentes)"
            value={atrasos.length}
          />
          <LegendItem
            color="purple-bg"
            label="Pendientes"
            value={pendientes}
          />
        </div>
      </div>

      <p style={{
        fontSize: 12,
        color: '#64748b',
        marginTop: 12,
      }}>
        Porcentaje sobre registros observados, no sobre
        todas las clases programadas.
      </p>
    </div>
  )
}
function LegendItem({
  color,
  label,
  value,
}) {
  return (
    <div>

      <span
        className={`dot ${color}`}
      />

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  )
}

function SummaryItem({
  icon,
  label,
  value,
}) {
  return (
    <div className="summary-item">

      <div className="summary-icon">
        {icon}
      </div>

      <div>

        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

      </div>

    </div>
  )
}

function Row({
  icon,
  type,
  description,
  date,
  user,
  course,
  status,
  statusClass,
}) {
  return (
    <tr>

      <td>
        <span className="row-icon">
          {icon}
        </span>

        {type}
      </td>

      <td>
        {description}
      </td>

      <td>
        {date}
      </td>

      <td>
        {user}
      </td>

      <td>
        {course}
      </td>

      <td>

        <span
          className={
            `badge ${statusClass}`
          }
        >
          {status}
        </span>

      </td>

    </tr>
  )
}

function Quick({
  icon,
  text,
  color,
  onClick,
}) {
  return (
    <button
      className="quick-card"
      onClick={onClick}
      type="button"
    >

      <div
        className={
          `quick-icon ${color}`
        }
      >
        {icon}
      </div>

      <span>
        {text}
      </span>

    </button>
  )
}

function DashboardFooter() {
  return (
    <footer>
      © 2026 AsistIA · Instituto Profesional
    </footer>
  )
}

export default Dashboard