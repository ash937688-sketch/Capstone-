import { useState } from 'react'

export default function AutorizacionPiloto({ request, canManage }) {
  const [email, setEmail] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [cursos, setCursos] = useState([])
  const [seleccionados, setSeleccionados] = useState([])

  async function cargarCursos() {
    setBusy(true)
    setMessage('')
    try {
      const result = await request('piloto/cursos')
      setCursos(result.cursos || [])
      setSeleccionados([])
      if (!result.cursos?.length) {
        setMessage('No hay asignaturas de prueba disponibles.')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function seleccionar(id) {
    setSeleccionados(prev => prev.includes(id)
      ? prev.filter(item => item !== id)
      : [...prev, id])
  }

  async function vincular(event) {
    event.preventDefault()
    if (!canManage || !confirmed || busy || !seleccionados.length) return

    setBusy(true)
    setMessage('')

    try {
      const result = await request('piloto/vincular', {
        email: email.trim().toLowerCase(),
        cursos: seleccionados,
        confirmed: true
      })
      setMessage(result.message)
      setConfirmed(false)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function autorizar() {
    if (!canManage || busy) return

    if (!window.confirm('Confirmas que el estudiante ha solicitado participar voluntariamente en el piloto?')) return

    setBusy(true)
    setMessage('')

    try {
      const result = await request('piloto/autorizar', {
        email: email.trim().toLowerCase(),
        confirmed: true
      })
      setMessage(result.message)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) return null

  return (
    <section className="entity-card">
      <h2>Participantes del piloto facial</h2>
      <p>Vincula estudiantes registrados con sus asignaturas de prueba.</p>

      <form onSubmit={vincular}>
        <label>
          Correo institucional
          <input
            type="email"
            value={email}
            placeholder="usuario9@example.com"
            onChange={e => {
              setEmail(e.target.value)
              setConfirmed(false)
            }}
            required
            disabled={busy}
          />
        </label>

        <div style={{margin:'16px 0'}}>
          <button type="button" onClick={cargarCursos} disabled={busy}>
            Cargar asignaturas disponibles
          </button>
        </div>

        {cursos.length > 0 && (
          <div style={{display:'grid',gap:10,marginBottom:16}}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSeleccionados(
                seleccionados.length === cursos.length
                  ? [] : cursos.map(c => c.id)
              )}
            >
              {seleccionados.length === cursos.length
                ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>

            {cursos.map(curso => (
              <label key={curso.id}>
                <input
                  type="checkbox"
                  checked={seleccionados.includes(curso.id)}
                  onChange={() => seleccionar(curso.id)}
                  disabled={busy}
                />
                {' '}{curso.nombre} {curso.seccion}
              </label>
            ))}

            <p>Asignaturas seleccionadas: {seleccionados.length}</p>
          </div>
        )}

        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            required
            disabled={busy}
          />
          Confirmo la vinculacion academica de prueba.
        </label>

        <div style={{marginTop:16}}>
          <button
            className="primary-action"
            disabled={busy || !confirmed || !seleccionados.length ||
              !email.trim().toLowerCase().endsWith('@duocuc.cl')}
          >
            {busy ? 'Procesando...' : 'Vincular estudiante'}
          </button>
        </div>

        <div style={{marginTop:12}}>
          <button
            type="button"
            onClick={autorizar}
            disabled={busy || !email.trim().toLowerCase().endsWith('@duocuc.cl')}
          >
            Autorizar participante
          </button>
        </div>

        {message && <p role="status">{message}</p>}
      </form>

      <p>La vinculacion no autoriza el tratamiento biometrico.
        Cada participante debe confirmar su mayoria de edad
        y aceptar personalmente el consentimiento correspondiente.</p>
    </section>
  )
}

