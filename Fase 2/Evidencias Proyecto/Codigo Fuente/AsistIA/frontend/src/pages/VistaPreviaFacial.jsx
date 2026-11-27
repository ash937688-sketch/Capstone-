// ASISTIA_FACIAL_PASO6_CAMARA_LOCAL
// Vista previa opt-in: no toma fotografias, no transmite imagenes, no almacena datos.
import { useEffect, useRef, useState } from 'react'

export default function VistaPreviaFacial({ horarios = [], token = '' }) {
  const [horarioSeleccionado, setHorarioSeleccionado] = useState('')
  const [respuestaServidor, setRespuestaServidor] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [activo, setActivo] = useState(false)
  // ASISTIA_FACIAL_PASO18_DETECCION_LOCAL
  const [rostros, setRostros] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  // ASISTIA_FACIAL_PASO7_DIAGNOSTICO_LOCAL
  const [diagnostico, setDiagnostico] = useState('')
  // ASISTIA_FACIAL_PASO8_GUIA_ENCUADRE
  const [calidad, setCalidad] = useState('')

  // Diagnostico optico local: procesa un fotograma en memoria, sin guardarlo ni enviarlo.
  // NO verifica identidad, rostro, vitalidad ni previene suplantaciones.
  // Diagnostico local de resolucion y orientacion, no reconocimiento de identidad.
  function revisarEncuadre() {
    const video = videoRef.current
    if (!video || !streamRef.current || video.readyState < 2) {
      setCalidad('Enciende la camara y espera a que aparezca la imagen.')
      return
    }
    const ancho = video.videoWidth
    const alto = video.videoHeight
    if (!ancho || !alto) {
      setCalidad('No se pudo leer la resolucion de la camara.')
    } else if (ancho < 320 || alto < 240) {
      setCalidad(`Resolucion ${ancho} x ${alto}: baja. Prueba otra camara o navegador.`)
    } else {
      setCalidad(`Resolucion ${ancho} x ${alto}: suficiente para vista previa. Ubica el rostro centrado, sin cubrirlo y con luz frontal. Esto no detecta ni verifica un rostro.`)
    }
  }
  function revisarIluminacion() {
    const video = videoRef.current
    if (!video || !streamRef.current || video.readyState < 2 || !video.videoWidth) {
      setDiagnostico('Enciende la camara y espera a que aparezca la imagen.')
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 48
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('canvas no disponible')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let suma = 0
      for (let i = 0; i < pixels.length; i += 4) {
        suma += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      }
      const promedio = suma / (pixels.length / 4)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      canvas.width = 0
      canvas.height = 0
      setDiagnostico(promedio < 55
        ? 'La imagen se ve oscura. Busca una fuente de luz frente a ti.'
        : promedio > 215
          ? 'La imagen tiene demasiada luz. Evita la luz directa frente a la camara.'
          : 'Iluminacion general aceptable para una vista previa. Esto NO valida identidad ni reconocimiento facial.')
    } catch {
      setDiagnostico('No se pudo analizar la iluminacion en este navegador.')
    }
  }
  // Deteccion experimental SOLO en el navegador. No identifica personas ni valida presencia real.
  async function detectarRostrosLocalmente() {
    if (!horarioSeleccionado || !horarios.some(h => String(h.horarioId || h.id) === horarioSeleccionado)) { setRostros("Primero selecciona una clase valida."); return; }
    const video = videoRef.current
    if (!streamRef.current || !video || video.readyState < 2) {
      setRostros('Primero enciende la camara y espera a que se vea la imagen.')
      return
    }
    if (!window.confirm('Prueba local: se enviara UN fotograma al detector OpenCV en este mismo computador (127.0.0.1:5181). No se guardara ni identificara tu rostro. ¿Autorizas este envio?')) return
    setRostros('Analizando fotograma en el detector local...')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      canvas.getContext('2d').drawImage(video, 0, 0, 640, 480)
      const jpeg = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
      canvas.width = 0; canvas.height = 0
      const response = await fetch('http://127.0.0.1:5181/api/detectar-prueba', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacion: true, imagen: jpeg })
      })
      const resultado = await response.json()
      if (streamRef.current) setRostros(resultado.mensaje || resultado.error || 'No se pudo analizar el fotograma.')
    } catch {
      setRostros('Detector local no disponible. Inicia el servicio del Paso 21 en otra ventana de PowerShell.')
    }
  }
  async function ejecutarDesafio() {
    const stream = streamRef.current;
    const clase = horarioSeleccionado;

    if (!stream || !clase || !token) return;

    const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

    const capturar = () => {
      const video = videoRef.current;

      if (streamRef.current !== stream ||
          !video || video.readyState < 2 || !video.videoWidth) {
        throw Error('Camara detenida o no disponible.');
      }

      const canvas = document.createElement('canvas');
      const escala = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));

      canvas.width = Math.round(video.videoWidth * escala);
      canvas.height = Math.round(video.videoHeight * escala);

      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

      const imagen = canvas.toDataURL('image/jpeg', 0.85);
      canvas.width = 0;
      canvas.height = 0;
      return imagen;
    };

    const solicitar = async datos => {
      const r = await fetch('/api/academico/alumno/asistencia-facial/registrar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          horarioId: clase,
          modoPrueba: true,
          ...datos
        })
      });

      const d = await r.json();

      if (!r.ok || !d.ok) {
        throw Error(d.message || 'No se pudo completar el desafio.');
      }

      return d.comparacion || {};
    };

    try {
      setRespuestaServidor('Mira directamente a la camara.');
      await esperar(1500);

      const imagenInicial = capturar();

      const respuesta = await solicitar({
        operacion: 'crearDesafio'
      });

      const desafio = respuesta.desafio;

      if (!desafio?.id) {
        throw Error('No se recibio el desafio facial.');
      }

      if (streamRef.current !== stream) return;

      setRespuestaServidor(
        'Gira suavemente la cabeza hacia tu ' +
        desafio.direccion + ' y manten la posicion.'
      );

      await esperar(4000);

      const imagenFinal = capturar();

      setRespuestaServidor('Comprobando movimiento y coincidencia facial...');

      const resultado = await solicitar({
        operacion: 'comprobarMovimiento',
        desafioId: desafio.id,
        imagenInicial,
        imagenFinal
      });

      if (streamRef.current !== stream) return;

      setRespuestaServidor(
        resultado.movimientoDetectado && resultado.coincidenciaFacial
          ? 'Movimiento y rostro coincidentes. Prueba experimental superada. Sin marcacion oficial.'
          : 'Movimiento o rostro no coincidente. Intenta nuevamente.'
      );

    } catch (e) {
      if (streamRef.current === stream) {
        setRespuestaServidor(e.message);
      }
    }
  }

async function consultarAutorizacion() {
    const video = videoRef.current;

    if (!horarioSeleccionado || !token || !streamRef.current || !video || video.readyState < 2 || !video.videoWidth) {
      setRespuestaServidor('Selecciona una clase y enciende la camara antes de continuar.');
      return;
    }

    try {
      setRespuestaServidor('Capturando rostro y enviando al servidor...');

      const canvas = document.createElement('canvas');
      const escala = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * escala);
      canvas.height = Math.round(video.videoHeight * escala);

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo preparar la captura.');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imagen = canvas.toDataURL('image/jpeg', 0.85);

      canvas.width = 0;
      canvas.height = 0;

      const r = await fetch('/api/academico/alumno/asistencia-facial/registrar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          horarioId: horarioSeleccionado, imagen, modoPrueba: true })
      });

      const d = await r.json().catch(() => ({}));

      const resultado = d.comparacion || {};
      const mensaje = d.marcacionPilotoRegistrada === true
      ? 'Asistencia de prueba registrada correctamente en Firebase.'
      : d.asistenciaRegistrada === true
        ? 'Asistencia registrada correctamente en Firebase.'
        : typeof resultado.similitud === 'number'
          ? `${resultado.coincidenciaFacial === true ? 'Rostro coincidente' : resultado.coincidenciaFacial === false ? 'Rostro no coincidente' : 'Rostro comparado'}. Similitud: ${resultado.similitud.toFixed(4)}. Pendiente de prueba de vida.`
          : d.message || resultado.error || `No se completo el reconocimiento (HTTP ${r.status}).`;

      setRespuestaServidor(mensaje);
    } catch (e) {
      setRespuestaServidor(e.message || 'Error de conexión con el servidor.');
    }
  }
  function detener() {
    const stream = streamRef.current
    streamRef.current = null
    if (stream) stream.getTracks().forEach(track => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setActivo(false)
    setDiagnostico('')
    setCalidad('')
  }

  useEffect(() => () => {
    const stream = streamRef.current
    if (stream) stream.getTracks().forEach(track => track.stop())
  }, [])

  async function iniciar() {
    if (cargando || activo) return
    if (!horarioSeleccionado || !horarios.some(h => String(h.horarioId || h.id) === horarioSeleccionado)) {
      setError('Primero selecciona una clase disponible para iniciar la prueba facial.')
      return
    }
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La cámara requiere HTTPS o localhost y un navegador compatible.')
      return
    }
    setCargando(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setTimeout(() => {
          const video = videoRef.current
          if (streamRef.current && video && video.readyState >= 2 && video.videoWidth > 0) {
            consultarAutorizacion()
          }
        }, 2500)
        setActivo(true)
    setRespuestaServidor('Cámara activa. Coloca tu rostro frente a ella.')
    // La captura se realiza desde el boton existente mientras
    // se prepara la deteccion automatica de rostro en el navegador.
      } else {
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    } catch (e) {
      detener()
      setError(e?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Puedes habilitarlo en tu navegador.'
        : 'No fue posible iniciar la cámara. Revisa permisos y disponibilidad.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="academico-seccion" aria-label="Vista previa local de camara">
      <h2>Registro de asistencia facial</h2>
      <p role="status"><strong>Clases disponibles: {new Set(horarios.map(h => h.horarioId || h.id)).size}</strong></p>
      {horarios.length === 0 && <p>Las clases todavía no se han cargado en esta pantalla.</p>}
      <label htmlFor="horario-facial">Selecciona tu clase:</label>
      <select id="horario-facial" value={horarioSeleccionado} disabled={activo || cargando} onChange={e => { setHorarioSeleccionado(e.target.value); setError(""); setRostros("") }}><option value="">Seleccionar clase</option>{horarios.filter((h,i,lista) =>
  lista.findIndex(x => (x.horarioId || x.id) === (h.horarioId || h.id)) === i
).map(h => {
  const nombre = h.nombreCurso || h.asignatura || h.nombreAsignatura || h.curso?.nombre || h.cursoId
  const similares = horarios.filter(x =>
    x.cursoId === h.cursoId &&
    x.dia === h.dia &&
    x.inicio === h.inicio &&
    x.fin === h.fin
  )
  const bloque = similares.findIndex(x =>
    (x.horarioId || x.id) === (h.horarioId || h.id)
  ) + 1
  return (
    <option key={h.horarioId || h.id} value={h.horarioId || h.id}>
      {nombre}
      {h.dia ? ` - ${h.dia}` : ''}
      {h.inicio && h.fin ? ` - ${h.inicio} a ${h.fin}` : ''}
      {similares.length > 1 ? ` - Bloque ${bloque}` : ''}
    </option>
  )
})}</select>{horarioSeleccionado && <p role="status">Clase seleccionada: {horarios.find(h => String(h.horarioId || h.id) === horarioSeleccionado)?.nombreCurso || horarios.find(h => String(h.horarioId || h.id) === horarioSeleccionado)?.asignatura || horarios.find(h => String(h.horarioId || h.id) === horarioSeleccionado)?.cursoId || horarioSeleccionado}</p>}
      <p>Selecciona tu clase y activa la cámara frontal. El sistema comparará automáticamente tu rostro con tu plantilla biométrica autorizada. Si existe coincidencia, podrá registrar tu asistencia experimental.</p>
      <video ref={videoRef} muted playsInline autoPlay
        aria-label="Vista previa de camara frontal"
        style={{ display: activo || cargando ? 'block' : 'none', width: '100%', maxWidth: 420, borderRadius: 12, transform: 'scaleX(-1)' }} />
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={!activo || !horarioSeleccionado || !token} onClick={consultarAutorizacion}>Registrar asistencia facial</button>
      {respuestaServidor && <p role="status">{respuestaServidor}</p>}
      {!activo ? <button type="button" disabled={cargando} onClick={iniciar}>
        {cargando ? 'Iniciando cámara...' : 'Activar cámara frontal'}
      </button> : <button type="button" onClick={detener}>Apagar cámara</button>}
      {/* ASISTIA_FACIAL_PASO8_GUIA_ENCUADRE */}
      {activo && <button type="button" onClick={revisarEncuadre}>
        Revisar resolución y encuadre
      </button>}
      {calidad && <p role="status" aria-live="polite">{calidad}</p>}
      <p>Mantén tu rostro centrado, con buena iluminación y sin accesorios que lo oculten.</p>
      {activo && <button type="button" onClick={revisarIluminacion}>
        Revisar iluminación (solo en este dispositivo)
      </button>}
      {diagnostico && <p role="status" aria-live="polite">{diagnostico}</p>}
      
      {/* ASISTIA_FACIAL_PASO18_DETECCION_LOCAL */}
      {activo && <button type="button" onClick={detectarRostrosLocalmente}>
        Detectar rostro localmente (experimental)
      </button>}
      {rostros && <p role="status" aria-live="polite">{rostros}</p>}
      
      
      
      <p><strong>Modalidad:</strong> Registro facial experimental, sin validez académica oficial. Prueba de vida pendiente de validación.</p>
    </section>
  )
}

