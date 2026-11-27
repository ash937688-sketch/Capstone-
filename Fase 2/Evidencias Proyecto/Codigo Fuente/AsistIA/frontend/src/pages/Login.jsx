import { useState } from 'react'
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'

import {
  Navigate,
  useLocation,
  useNavigate,
  Link,
} from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { user, login, resendVerification } = useAuth()

  const navigate = useNavigate()
  const location = useLocation()
  const adminAccess = new URLSearchParams(location.search).get('acceso') === 'administracion'

  const [show, setShow] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  const submit = async (event) => {
    event.preventDefault()

    setLoading(true)
    setMessage('')
    setNeedsVerification(false)

    const data =
      new FormData(event.currentTarget)

    try {
      const result = await login(
        data
          .get('email')
          .trim()
          .toLowerCase(),

        data.get('password'),

        data.get('remember') === 'on'
      )

      if (!result.ok) {
        setNeedsVerification(result.needsEmailVerification === true)
        return setMessage(
          result.message
        )
      }

      navigate(
        location.state?.from?.pathname ||
          (result.user?.scope === 'enrolamiento-piloto' ? '/enrolamiento' : '/'),
        {
          replace: true,
        }
      )
    } catch {
      setMessage(
        'No se pudo conectar con el servidor de acceso.'
      )
    } finally {
      setLoading(false)
    }
  }

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
            ACCESO AUTORIZADO
          </p>

          <h1>
            Tu comunidad académica,
            conectada de forma segura.
          </h1>

          <p>
            El acceso está reservado
            para estudiantes, docentes y cuentas
            de administración autorizadas.
          </p>

        </div>

        <p className="auth-visual-footer">
          © 2026 AsistIA · Acceso
          seguro y protegido
        </p>

      </section>

      <main className="auth-main">

        <div className="auth-card">

          <div className="auth-mobile-logo">
            A
          </div>

          <p className="auth-eyebrow">
            BIENVENIDO
          </p>

          <h2>
            {adminAccess ? 'Administración del piloto' : 'Inicia sesión'}
          </h2>

          <p className="auth-subtitle">
            {adminAccess ? 'Ingresa con la cuenta administrativa compartida y la contraseña del panel. No necesitas solicitar otro registro.' : 'Ingresa con tu correo y contraseña. También se admiten las cuentas administrativas habilitadas.'}
          </p>

          <form onSubmit={submit}>

            <Field
              icon={Mail}
              label="Correo electrónico"
              name="email"
              type="email"
              placeholder={adminAccess ? 'Cuenta administrativa autorizada' : 'Tu correo autorizado'}
              key={adminAccess ? 'administracion' : 'institucional'}
              defaultValue={adminAccess ? 'usuario10@example.com' : ''}
              required
            />

            <label className="auth-field">

              <span>
                Contraseña
              </span>

              <div>

                <LockKeyhole
                  size={18}
                />

                <input
                  name="password"
                  type={
                    show
                      ? 'text'
                      : 'password'
                  }
                  required
                />

                <button
                  type="button"
                  onClick={() =>
                    setShow(!show)
                  }
                  aria-label="Mostrar contraseña"
                >
                  {show
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

            <div className="auth-options">

              <label>

                <input
                  type="checkbox"
                  name="remember"
                  defaultChecked
                />

                {' '}
                Recordarme

              </label>

            </div>

            {message && (
              <div
                className="auth-message"
                role="alert"
              >
                {message}
              </div>
            )}

            <button
              className="auth-submit"
              disabled={loading}
            >
              {loading
                ? 'Verificando…'
                : 'Ingresar al sistema'
              }
            </button>

            {needsVerification && <button type="button" className="auth-submit" disabled={loading} onClick={async event => {
              const form = event.currentTarget.form
              if (!form.reportValidity()) return
              const values = new FormData(form)
              setLoading(true)
              try { const result = await resendVerification(String(values.get('email')).trim().toLowerCase(), String(values.get('password'))); setMessage(result.message) }
              finally { setLoading(false) }
            }}>Reenviar verificación de correo</button>}

          </form>

          <div className="auth-switch"><Link to={adminAccess ? '/login' : '/login?acceso=administracion'}>{adminAccess ? 'Acceso de participantes' : 'Entrar a administración del piloto'}</Link></div>
          {!adminAccess && <div className="auth-switch">

            <span>
              ¿Aún no tienes acceso?
            </span>

            {' '}

            <Link
              to="/registro"
              className="register-link"
            >
              <UserPlus
                size={14}
              />

              Solicitar acceso
            </Link>

          </div>}

        </div>

      </main>

    </div>
  )
}

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
