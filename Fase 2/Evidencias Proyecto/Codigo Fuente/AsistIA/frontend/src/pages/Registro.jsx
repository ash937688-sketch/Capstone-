import { useState } from 'react'

import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import {
  Link,
  Navigate,
} from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function Registro() {
  const { user } = useAuth()

  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  // Si ya existe una sesión activa,
  // vuelve al panel principal.
  if (user) {
    return (
      <Navigate
        to="/"
        replace
      />
    )
  }

  // =====================================================
  // ENVIAR SOLICITUD DE ACCESO
  // =====================================================

  const submit = async (event) => {
    event.preventDefault()

    setMessage('')
    setSuccess(false)
    setLoading(true)

    const form =
      event.currentTarget

    const data =
      new FormData(form)

    const name =
      String(
        data.get('name') || ''
      ).trim()

    const email =
      String(
        data.get('email') || ''
      )
        .trim()
        .toLowerCase()

    // ================================================
    // VALIDACIONES FRONTEND
    // ================================================

    if (!name) {
      setMessage(
        'Debes ingresar tu nombre completo.'
      )

      setLoading(false)
      return
    }

    const isStudent =
      email.endsWith(
        '@duocuc.cl'
      )

    const isTeacher =
      email.endsWith(
        '@profesor.duoc.cl'
      )

    if (
      !isStudent &&
      !isTeacher
    ) {
      setMessage(
        'Solo se aceptan correos institucionales @duocuc.cl para estudiantes o @profesor.duoc.cl para docentes.'
      )

      setLoading(false)
      return
    }

    // ================================================
    // ENVIAR AL BACKEND
    // ================================================

    try {
      const response =
        await fetch(
          '/api/auth/register-request',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              name,
              email,
            }),
          }
        )

      const result =
        await response.json()

      // ==============================================
      // ERROR DEL SERVIDOR
      // ==============================================

      if (!result.ok) {
        setMessage(
          result.message ||
            'No fue posible enviar la solicitud.'
        )

        setSuccess(false)
      }

      // ==============================================
      // SOLICITUD ENVIADA CORRECTAMENTE
      // ==============================================

      else {
        setSuccess(true)

        setMessage(
          result.message ||
            'Solicitud enviada correctamente. Un administrador deberá autorizar tu acceso.'
        )

        form.reset()
      }

    } catch (error) {
      console.error(
        'Error enviando solicitud:',
        error
      )

      setSuccess(false)

      setMessage(
        'No se pudo conectar con el servidor. Verifica que el servidor de AsistIA esté ejecutándose.'
      )

    } finally {
      // Esto garantiza que el botón
      // siempre vuelva a su estado normal.
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">

      {/* ================================================
          PANEL IZQUIERDO
      ================================================ */}

      <section className="auth-visual">

        <div className="auth-brand">

          <span>
            A
          </span>

          <div>

            <strong>
              AsistIA
            </strong>

            <small>
              Gestión académica Duoc UC
            </small>

          </div>

        </div>

        <div className="auth-copy">

          <div className="auth-shield">

            <ShieldCheck
              size={34}
            />

          </div>

          <p className="auth-kicker">
            REGISTRO INSTITUCIONAL
          </p>

          <h1>
            Solicita acceso a
            AsistIA de forma segura.
          </h1>

          <p>
            Solo se aceptan solicitudes
            realizadas con correos
            institucionales de estudiantes
            y docentes.
          </p>

        </div>

        <p className="auth-visual-footer">
          © 2026 AsistIA ·
          Acceso institucional
        </p>

      </section>

      {/* ================================================
          FORMULARIO
      ================================================ */}

      <main className="auth-main">

        <div className="auth-card">

          <Link
            to="/login"
            className="back-button"
          >

            <ArrowLeft
              size={16}
            />

            Volver al inicio de sesión

          </Link>

          <div className="auth-mobile-logo">
            A
          </div>

          <p className="auth-eyebrow">
            SOLICITUD DE ACCESO
          </p>

          <h2>
            Regístrate
          </h2>

          <p className="auth-subtitle">
            Ingresa tus datos institucionales.
            Tu solicitud deberá ser aprobada
            por un administrador antes de
            poder iniciar sesión.
          </p>

          <form onSubmit={submit}>

            {/* NOMBRE */}

            <Field
              icon={UserRound}
              label="Nombre completo"
              name="name"
              type="text"
              placeholder="Nombre y apellido"
              autoComplete="name"
              required
            />

            {/* CORREO */}

            <Field
              icon={Mail}
              label="Correo institucional"
              name="email"
              type="email"
              placeholder="usuario7@example.com o usuario11@example.com"
              autoComplete="email"
              required
            />

            {/* INFORMACIÓN DE SEGURIDAD */}

            <div className="security-note">

              <ShieldCheck
                size={17}
              />

              <span>

                Estudiantes:
                <strong>
                  {' '}@duocuc.cl
                </strong>.

                {' '}

                Docentes:
                <strong>
                  {' '}@profesor.duoc.cl
                </strong>.

                {' '}

                Otros dominios serán
                rechazados.

              </span>

            </div>

            {/* MENSAJE */}

            {message && (
              <div
                className={
                  success
                    ? 'auth-message success'
                    : 'auth-message'
                }
                role="alert"
              >

                {success && (
                  <CheckCircle2
                    size={16}
                    style={{
                      marginRight: 6,
                      verticalAlign:
                        'middle',
                    }}
                  />
                )}

                {message}

              </div>
            )}

            {/* BOTÓN */}

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >

              {loading
                ? 'Enviando solicitud…'
                : success
                  ? 'Enviar otra solicitud'
                  : 'Solicitar acceso'
              }

            </button>

          </form>

          {/* VOLVER A LOGIN */}

          <div className="auth-switch">

            <span>
              ¿Ya tienes una cuenta?
            </span>

            {' '}

            <Link
              to="/login"
              className="register-link"
            >
              Iniciar sesión
            </Link>

          </div>

        </div>

      </main>

    </div>
  )
}

// =====================================================
// CAMPO REUTILIZABLE
// =====================================================

function Field({
  icon: Icon,
  label,
  ...props
}) {
  return (
    <label className="auth-field">

      <span>
        {label}
      </span>

      <div>

        <Icon
          size={18}
        />

        <input
          {...props}
        />

      </div>

    </label>
  )
}