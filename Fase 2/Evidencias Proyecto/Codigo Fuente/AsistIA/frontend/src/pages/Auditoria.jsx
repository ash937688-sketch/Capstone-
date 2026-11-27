import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, RefreshCw, Search, Download, ShieldCheck,
  Clock3, Pencil, Plus, Trash2, AlertTriangle
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const normal = value =>
  String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()

const csv = value =>
  '"' + String(value ?? '').replaceAll('"', '""') + '"'

const fechaLegible = value => {
  if (!value) return '—'
  const fecha = new Date(value)
  return Number.isNaN(fecha.getTime())
    ? String(value)
    : fecha.toLocaleString('es-CL')
}

const detalleLegible = detalle => {
  if (!detalle || typeof detalle !== 'object') return '—'
  return Object.entries(detalle)
    .map(([campo, valor]) => {
      const texto = Array.isArray(valor)
        ? valor.join(', ')
        : typeof valor === 'object' && valor !== null
          ? JSON.stringify(valor)
          : String(valor ?? '')
      return `${campo}: ${texto}`
    })
    .join(' · ') || 'Sin detalles adicionales'
}

export default function Auditoria() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'

  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [accionFiltro, setAccionFiltro] = useState('Todas')
  const [moduloFiltro, setModuloFiltro] = useState('Todos')
  const [fechaFiltro, setFechaFiltro] = useState('')

  const cargar = useCallback(async () => {
    if (!token || !isAdmin) {
      setRegistros([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auditoria', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const resultado = await response.json().catch(() => ({}))

      if (!response.ok || !resultado.ok) {
        throw new Error(resultado.message || `Error HTTP ${response.status}`)
      }

      setRegistros(resultado.registros || [])
    } catch (e) {
      setError(e.message || 'No se pudo cargar la auditoría.')
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const modulos = useMemo(
    () => [...new Set(registros.map(r => r.modulo).filter(Boolean))].sort(),
    [registros]
  )

  const filtrados = useMemo(() => {
    return registros.filter(r => {
      const texto = [
        r.usuario, r.correoUsuario, r.rol, r.accion,
        r.modulo, r.registroId, detalleLegible(r.detalle),
      ].join(' ')

      const coincideTexto = normal(texto).includes(normal(query.trim()))
      const coincideAccion =
        accionFiltro === 'Todas' || r.accion === accionFiltro
      const coincideModulo =
        moduloFiltro === 'Todos' || r.modulo === moduloFiltro
      const coincideFecha =
        !fechaFiltro || String(r.fecha || '').slice(0, 10) === fechaFiltro

      return coincideTexto && coincideAccion && coincideModulo && coincideFecha
    })
  }, [registros, query, accionFiltro, moduloFiltro, fechaFiltro])

  const exportar = () => {
    const columnas = [
      'Fecha', 'Usuario', 'Correo', 'Rol', 'Accion',
      'Modulo', 'ID registro', 'Detalle', 'Resultado',
    ]

    const filas = filtrados.map(r => [
      r.fecha, r.usuario, r.correoUsuario, r.rol, r.accion,
      r.modulo, r.registroId, detalleLegible(r.detalle), r.resultado,
    ])

    const contenido = '\uFEFF' + [
      columnas.map(csv).join(';'),
      ...filas.map(f => f.map(csv).join(';')),
    ].join('\r\n')

    const blob = new Blob([contenido], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `auditoria_asistencialia_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    URL.revokeObjectURL(url)
  }

  if (!isAdmin) {
    return (
      <section className="entity-page auditoria-page">
        <h1>Auditoría</h1>
        <p>No tienes permisos para consultar el historial de auditoría.</p>
      </section>
    )
  }

  const creaciones = registros.filter(r => normal(r.accion).includes('creacion')).length
  const modificaciones = registros.filter(r => normal(r.accion).includes('modificacion')).length
  const eliminaciones = registros.filter(r => normal(r.accion).includes('eliminacion')).length

  return (
    <section className="entity-page auditoria-page">
      <header className="entity-header auditoria-header">
        <div>
          <h1>Auditoría del sistema</h1>
          <p>Historial de acciones registradas en AsistencialIA.</p>
        </div>
        <div className="entity-header-actions auditoria-actions">
          <button className="secondary-action" type="button" onClick={cargar} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="primary-action" type="button" onClick={exportar} disabled={!filtrados.length}>
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      </header>

      {error && (
        <div className="empty-search" role="alert">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      <div className="entity-stats auditoria-stats">
        {[
          { titulo: 'Eventos registrados', valor: registros.length, Icon: Activity },
          { titulo: 'Creaciones', valor: creaciones, Icon: Plus },
          { titulo: 'Modificaciones', valor: modificaciones, Icon: Pencil },
          { titulo: 'Eliminaciones', valor: eliminaciones, Icon: Trash2 },
        ].map(item => (
          <div className="stat-card" key={item.titulo}>
            <div className="stat-icon blue"><item.Icon size={22} /></div>
            <div className="stat-info">
              <span>{item.titulo}</span>
              <h3>{item.valor}</h3>
              <p>Eventos en el historial</p>
            </div>
          </div>
        ))}
      </div>

      <div className="auditoria-toolbar">
        <label>
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar usuario, acción o registro..."
          />
        </label>

        <select value={accionFiltro} onChange={e => setAccionFiltro(e.target.value)}>
          <option value="Todas">Todas las acciones</option>
          <option value="Creación">Creaciones</option>
          <option value="Modificación">Modificaciones</option>
          <option value="Eliminación">Eliminaciones</option>
        </select>

        <select value={moduloFiltro} onChange={e => setModuloFiltro(e.target.value)}>
          <option value="Todos">Todos los módulos</option>
          {modulos.map(modulo => (
            <option value={modulo} key={modulo}>{modulo}</option>
          ))}
        </select>

        <input
          type="date"
          aria-label="Filtrar por fecha"
          value={fechaFiltro}
          onChange={e => setFechaFiltro(e.target.value)}
        />
      </div>

      <div className="table-wrapper auditoria-table-wrapper">
        <table className="entity-table">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Módulo</th>
              <th>Detalle</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(r => (
              <tr key={r.id}>
                <td>{fechaLegible(r.fecha)}</td>
                <td>
                  <strong>{r.usuario || 'Usuario'}</strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {r.rol || ''}
                  </div>
                </td>
                <td>{r.accion || '—'}</td>
                <td>{r.modulo || '—'}</td>
                <td style={{ minWidth: 220, maxWidth: 380, overflowWrap: 'anywhere' }}>
                  {detalleLegible(r.detalle)}
                  {r.registroId && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      ID: {r.registroId}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`entity-status ${r.resultado === 'Correcto' ? 'status-green' : 'status-red'}`}>
                    {r.resultado || 'Registrado'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <div className="empty-search">Cargando historial desde Firebase...</div>
        )}

        {!loading && !error && filtrados.length === 0 && (
          <div className="empty-search">
            <ShieldCheck size={20} />
            {registros.length
              ? 'No hay eventos que coincidan con los filtros.'
              : 'Todavía no hay eventos de auditoría registrados.'}
          </div>
        )}
      </div>

      <footer className="data-footer">
        <span>Mostrando {filtrados.length} de {registros.length} eventos</span>
        <span><Clock3 size={14} /> Historial reciente</span>
      </footer>
    </section>
  )
}