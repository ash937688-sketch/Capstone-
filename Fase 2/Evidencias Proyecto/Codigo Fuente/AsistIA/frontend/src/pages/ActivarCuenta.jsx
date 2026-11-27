import { useEffect, useState } from 'react'

import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import {
  Link,
  useSearchParams,
} from 'react-router-dom'

export default function ActivarCuenta() {
  const [searchParams] = useSearchParams()

  const token =
    searchParams.get('token') || ''

  const [account, setAccount] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  const [sending, setSending] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [success, setSuccess] =
    useState(false)

  const [showPassword, setShowPassword] =
    useState(false)

  const [showConfirm, setShowConfirm] =
    useState(false)

  // ==========================================
  // VALIDAR TOKEN AL ABRIR LA PÁGINA
  // ==========================================

  useEffect(() => {
    const validateToken =
      async () => {

        if (!token) {
          setMessage(
            'El enlace de activación no contiene un token válido.'
          )

          setLoading(false)
          return
        }

        try {
          const response =
            await fetch(
              '/api/auth/activation-info',
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    token,
                  }),
              }
            )

          const result =
            await response.json()

          if (!result.ok) {
            setMessage(
              result.message ||
                'El enlace de activación no es válido.'
            )

            return
          }

          setAccount(
            result.user
          )
        } catch {
          setMessage(
            'No se pudo conectar con el servidor.'
          )
        } finally {
          setLoading(false)
        }
      }

    validateToken()

  }, [token])

  // ==========================================
  // CREAR CONTRASEÑA
  // ==========================================

  const submit =
    async (event) => {

      event.preventDefault()

      setMessage('')
      setSuccess(false)
      setSending(true)

      const data =
        new FormData(
          event.currentTarget
        )

      const password =
        String(
          data.get('password') || ''
        )

      const confirmPassword =
        String(
          data.get(
            'confirmPassword'
          ) || ''
        )

      if (
        password !==
        confirmPassword
      ) {
        setMessage(
          'Las contraseñas no coinciden.'
        )

        setSending(false)
        return
      }

      if (
        !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/
          .test(password)
      ) {
        setMessage(
          'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.'
        )

        setSending(false)
        return
      }

      try {
        const response =
          await fetch(
            '/api/auth/activate',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  token,
                  password,
                }),
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          setMessage(
            result.message ||
              'No fue posible activar la cuenta.'
          )

          return
        }

        setSuccess(true)

        setMessage(
          'Tu cuenta fue activada correctamente. Ya puedes iniciar sesión.'
        )

      } catch {
        setMessage(
          'No se pudo conectar con el servidor.'
        )
      } finally {
        setSending(false)
      }
    }

  // ==========================================
  // CARGANDO
  // ==========================================

  if (loading) {
    return (
      <div className="auth-page">

        <main
          className="auth-main"
          style={{
            width: '100%',
          }}
        >

          <div className="auth-card">

            <p className="auth-eyebrow">
              ACTIVACIÓN DE CUENTA
            </p>

            <h2>
              Verificando enlace...
            </h2>

            <p className="auth-subtitle">
              Estamos validando tu
              solicitud de acceso.
            </p>

          </div>

        </main>

      </div>
    )
  }

  // ==========================================
  // TOKEN INVÁLIDO
  // ==========================================

  if (!account) {
    return (
      <div className="auth-page">

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
              ACTIVACIÓN SEGURA
            </p>

            <h1>
              Protegemos el acceso
              a tu cuenta.
            </h1>

            <p>
              Los enlaces de activación
              son personales, temporales
              y solo pueden utilizarse
              una vez.
            </p>

          </div>

        </section>

        <main className="auth-main">

          <div className="auth-card">

            <XCircle
              size={42}
              style={{
                marginBottom: 15,
              }}
            />

            <h2>
              No se puede activar
              esta cuenta
            </h2>

            <div
              className="auth-message"
            >
              {message}
            </div>

            <Link
              to="/login"
              className="auth-submit"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                textDecoration:
                  'none',
                marginTop: 15,
              }}
            >
              Volver al inicio
            </Link>

          </div>

        </main>

      </div>
    )
  }

  return (
    <div className="auth-page">

      {/* PANEL IZQUIERDO */}

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
            CUENTA APROBADA
          </p>

          <h1>
            Crea tu contraseña
            de acceso.
          </h1>

          <p>
            Tu solicitud fue aprobada.
            Ahora debes establecer tu
            contraseña personal para
            activar definitivamente
            tu cuenta.
          </p>

        </div>

        <p className="auth-visual-footer">
          © 2026 AsistIA ·
          Acceso seguro
        </p>

      </section>

      {/* FORMULARIO */}

      <main className="auth-main">

        <div className="auth-card">

          <p className="auth-eyebrow">
            ACTIVAR CUENTA
          </p>

          <h2>
            Bienvenido,
            {' '}
            {account.name}
          </h2>

          <p className="auth-subtitle">
            {account.email}
            {' · '}
            {account.role}
          </p>

          {!success ? (

            <form onSubmit={submit}>

              <label className="auth-field">

                <span>
                  Nueva contraseña
                </span>

                <div>

                  <LockKeyhole
                    size={18}
                  />

                  <input
                    name="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                  >

                    {showPassword
                      ? (
                        <EyeOff
                          size={18}
                        />
                      )
                      : (
                        <Eye
                          size={18}
                        />
                      )
                    }

                  </button>

                </div>

              </label>

              <label className="auth-field">

                <span>
                  Confirmar contraseña
                </span>

                <div>

                  <LockKeyhole
                    size={18}
                  />

                  <input
                    name="confirmPassword"
                    type={
                      showConfirm
                        ? 'text'
                        : 'password'
                    }
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirm(
                        !showConfirm
                      )
                    }
                  >

                    {showConfirm
                      ? (
                        <EyeOff
                          size={18}
                        />
                      )
                      : (
                        <Eye
                          size={18}
                        />
                      )
                    }

                  </button>

                </div>

              </label>

              <div className="security-note">

                <ShieldCheck
                  size={17}
                />

                <span>
                  Utiliza mínimo
                  8 caracteres,
                  una mayúscula,
                  una minúscula
                  y un número.
                </span>

              </div>

              {message && (
                <div
                  className="auth-message"
                >
                  {message}
                </div>
              )}

              <button
                className="auth-submit"
                disabled={sending}
              >

                {sending
                  ? 'Activando cuenta…'
                  : 'Crear contraseña y activar'
                }

              </button>

            </form>

          ) : (

            <div>

              <div
                className="auth-message success"
              >

                <CheckCircle2
                  size={18}
                />

                {message}

              </div>

              <Link
                to="/login"
                className="auth-submit"
                style={{
                  display: 'flex',
                  justifyContent:
                    'center',
                  alignItems:
                    'center',
                  textDecoration:
                    'none',
                  marginTop: 15,
                }}
              >
                Iniciar sesión
              </Link>

            </div>

          )}

        </div>

      </main>

    </div>
  )
}