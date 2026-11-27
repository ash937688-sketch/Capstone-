import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import {
  Bell,
  Building2,
  CheckCircle2,
  Link2,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  UserCog,
  X,
  Check,
  Ban,
  Mail,
  Trash2,
  UserMinus,
  UserCheck,
} from 'lucide-react'

import { useAuth } from '../auth/AuthContext'

const sections = [
  {
    id: 'institucion',
    label: 'Institución',
    icon: Building2,
  },
  {
    id: 'usuarios',
    label: 'Usuarios autorizados',
    icon: UserCog,
  },
  {
    id: 'seguridad',
    label: 'Seguridad',
    icon: LockKeyhole,
  },
  {
    id: 'notificaciones',
    label: 'Notificaciones',
    icon: Bell,
  },
  {
    id: 'integraciones',
    label: 'Integraciones',
    icon: Link2,
  },
]

export default function Configuracion() {
  const { user, token } = useAuth()

  const [section, setSection] =
    useState('institucion')

  const [notice, setNotice] =
    useState('')

  const [noticeError, setNoticeError] =
    useState(false)

  const [inviteModal, setInviteModal] =
    useState(false)

  const [users, setUsers] =
    useState([])

  const [requests, setRequests] =
    useState([])

  const [loadingUsers, setLoadingUsers] =
    useState(false)

  const [processingRequest, setProcessingRequest] =
    useState(null)

  const [processingUser, setProcessingUser] =
    useState(null)

  // CONFIGURACION INSTITUCIONAL FIREBASE ASISTIA
  const [institutionSettings, setInstitutionSettings] = useState(null)
  const [loadingInstitution, setLoadingInstitution] = useState(false)
  const [savingInstitution, setSavingInstitution] = useState(false)

  useEffect(() => {
    if (!token || user?.role !== 'Administradora') return

    let cancelled = false
    setLoadingInstitution(true)

    fetch('/api/configuracion/institucion', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'No se pudo cargar la institución.')
        }
        return data
      })
      .then(data => {
        if (!cancelled) setInstitutionSettings(data.institucion || {})
      })
      .catch(error => {
        if (!cancelled) showNotice(error.message, true)
      })
      .finally(() => {
        if (!cancelled) setLoadingInstitution(false)
      })

    return () => { cancelled = true }
  }, [token, user?.role])
  // =====================================================
  // MENSAJES
  // =====================================================

  const showNotice = (
    text,
    error = false
  ) => {
    setNotice(text)
    setNoticeError(error)

    setTimeout(() => {
      setNotice('')
      setNoticeError(false)
    }, 4000)
  }

  // =====================================================
  // CARGAR USUARIOS
  // =====================================================

  const loadUsers = async () => {
    if (!token) return

    setLoadingUsers(true)

    try {
      const response =
        await fetch(
          '/api/users',
          {
            method: 'GET',

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        )

      const result =
        await response.json()

      if (!result.ok) {
        showNotice(
          result.message ||
            'No fue posible cargar los usuarios.',
          true
        )

        return
      }

      setUsers(
        result.users || []
      )
    } catch {
      showNotice(
        'No se pudo conectar con el servidor.',
        true
      )
    } finally {
      setLoadingUsers(false)
    }
  }

  // =====================================================
  // CARGAR SOLICITUDES
  // =====================================================

  const loadRequests = async () => {
    if (!token) return

    try {
      const response =
        await fetch(
          '/api/access-requests',
          {
            method: 'GET',

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        )

      const result =
        await response.json()

      if (!result.ok) {
        showNotice(
          result.message ||
            'No fue posible cargar las solicitudes.',
          true
        )

        return
      }

      setRequests(
        result.requests || []
      )
    } catch {
      showNotice(
        'No se pudieron cargar las solicitudes.',
        true
      )
    }
  }

  const reloadAll = async () => {
    await Promise.all([
      loadUsers(),
      loadRequests(),
    ])
  }

  // =====================================================
  // CARGA INICIAL
  // =====================================================

  useEffect(() => {
    if (token) {
      reloadAll()
    }
  }, [token])

  // =====================================================
  // SOLO ADMINISTRADORA
  // =====================================================

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  if (
    user.role !==
    'Administradora'
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    )
  }

  // =====================================================
  // GUARDAR CONFIGURACIONES
  // =====================================================

  const saveSettings = async event => {
    event.preventDefault()

    if (section !== 'institucion') {
      showNotice('Esta sección todavía no tiene guardado funcional en el servidor.', true)
      return
    }

    const form = new FormData(event.currentTarget)
    const values = {
      institution: String(form.get('institution') || '').trim(),
      campus: String(form.get('campus') || '').trim(),
      contact: String(form.get('contact') || '').trim(),
      timezone: String(form.get('timezone') || '').trim(),
      attendanceAlert: form.get('attendanceAlert') === 'on',
      closeClass: form.get('closeClass') === 'on'
    }

    setSavingInstitution(true)

    try {
      const response = await fetch('/api/configuracion/institucion', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      })

      const result = await response.json()
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'No se pudo guardar la configuración.')
      }

      setInstitutionSettings(result.institucion)
      showNotice('Configuración institucional guardada en Firebase.')
    } catch (error) {
      showNotice(error.message, true)
    } finally {
      setSavingInstitution(false)
    }
  }
  // =====================================================
  // CREAR SOLICITUD DESDE ADMINISTRACIÓN
  // =====================================================

  const createInvitation = async (
    event
  ) => {
    event.preventDefault()

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

    if (!name) {
      return showNotice(
        'Debes ingresar el nombre completo.',
        true
      )
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
      return showNotice(
        'Solo se permiten correos @duocuc.cl para estudiantes o @profesor.duoc.cl para docentes.',
        true
      )
    }

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

            body:
              JSON.stringify({
                name,
                email,
              }),
          }
        )

      const result =
        await response.json()

      if (!result.ok) {
        return showNotice(
          result.message ||
            'No fue posible registrar la solicitud.',
          true
        )
      }

      setInviteModal(false)

      showNotice(
        'Solicitud registrada correctamente. Ahora puedes aprobarla para enviar el correo de activación.'
      )

      await loadRequests()

    } catch {
      showNotice(
        'No se pudo conectar con el servidor.',
        true
      )
    }
  }

  // =====================================================
  // APROBAR SOLICITUD
  // =====================================================

  const approveRequest =
    async (request) => {

      const confirmed =
        window.confirm(
          `¿Aprobar el acceso de ${request.name}?\n\nSe enviará automáticamente un correo a ${request.email} para que cree su propia contraseña.`
        )

      if (!confirmed) {
        return
      }

      setProcessingRequest(
        request.id
      )

      try {
        const response =
          await fetch(
            `/api/access-requests/${request.id}/approve`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization:
                  `Bearer ${token}`,
              },

              body:
                JSON.stringify({}),
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          return showNotice(
            result.message ||
              'No fue posible aprobar la solicitud.',
            true
          )
        }

        showNotice(
          result.message ||
            'Solicitud aprobada. El correo de activación fue enviado.'
        )

        await reloadAll()

      } catch {
        showNotice(
          'No se pudo conectar con el servidor.',
          true
        )
      } finally {
        setProcessingRequest(
          null
        )
      }
    }

  // =====================================================
  // RECHAZAR SOLICITUD
  // =====================================================

  const rejectRequest =
    async (request) => {

      const confirmed =
        window.confirm(
          `¿Rechazar la solicitud de ${request.name}?`
        )

      if (!confirmed) {
        return
      }

      setProcessingRequest(
        request.id
      )

      try {
        const response =
          await fetch(
            `/api/access-requests/${request.id}/reject`,
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          return showNotice(
            result.message ||
              'No fue posible rechazar la solicitud.',
            true
          )
        }

        showNotice(
          'Solicitud rechazada correctamente.'
        )

        await loadRequests()

      } catch {
        showNotice(
          'No se pudo conectar con el servidor.',
          true
        )
      } finally {
        setProcessingRequest(
          null
        )
      }
    }

  // =====================================================
  // ELIMINAR SOLICITUD
  // =====================================================

  const deleteRequest =
    async (request) => {

      const confirmed =
        window.confirm(
          `¿Eliminar definitivamente la solicitud de ${request.name}?\n\nEsto permitirá volver a solicitar acceso con ${request.email}.`
        )

      if (!confirmed) {
        return
      }

      setProcessingRequest(
        request.id
      )

      try {
        const response =
          await fetch(
            `/api/access-requests/${request.id}`,
            {
              method: 'DELETE',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          return showNotice(
            result.message ||
              'No fue posible eliminar la solicitud.',
            true
          )
        }

        showNotice(
          result.message ||
            'Solicitud eliminada correctamente.'
        )

        await loadRequests()

      } catch {
        showNotice(
          'No se pudo conectar con el servidor.',
          true
        )
      } finally {
        setProcessingRequest(
          null
        )
      }
    }

  // =====================================================
  // DESACTIVAR USUARIO
  // =====================================================

  const disableUser =
    async (item) => {

      const confirmed =
        window.confirm(
          `¿Desactivar la cuenta de ${item.name}?\n\nEl usuario no podrá iniciar sesión hasta que vuelvas a reactivarlo.`
        )

      if (!confirmed) {
        return
      }

      setProcessingUser(
        item.id
      )

      try {
        const response =
          await fetch(
            `/api/users/${item.id}/disable`,
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          return showNotice(
            result.message ||
              'No fue posible desactivar el usuario.',
            true
          )
        }

        showNotice(
          result.message ||
            'Usuario desactivado correctamente.'
        )

        await loadUsers()

      } catch {
        showNotice(
          'No se pudo conectar con el servidor.',
          true
        )
      } finally {
        setProcessingUser(
          null
        )
      }
    }

  // =====================================================
  // REACTIVAR USUARIO
  // =====================================================

  const enableUser =
    async (item) => {

      const confirmed =
        window.confirm(
          `¿Reactivar la cuenta de ${item.name}?`
        )

      if (!confirmed) {
        return
      }

      setProcessingUser(
        item.id
      )

      try {
        const response =
          await fetch(
            `/api/users/${item.id}/enable`,
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          return showNotice(
            result.message ||
              'No fue posible reactivar el usuario.',
            true
          )
        }

        showNotice(
          result.message ||
            'Usuario reactivado correctamente.'
        )

        await loadUsers()

      } catch {
        showNotice(
          'No se pudo conectar con el servidor.',
          true
        )
      } finally {
        setProcessingUser(
          null
        )
      }
    }

  // =====================================================
  // ELIMINAR USUARIO
  // =====================================================

  const deleteUser =
    async (item) => {

      const confirmed =
        window.confirm(
          `¿Eliminar definitivamente a ${item.name}?\n\nCorreo: ${item.email}\n\nSe eliminará su cuenta, tokens de activación y solicitud asociada. Después ese correo podrá registrarse nuevamente.`
        )

      if (!confirmed) {
        return
      }

      const secondConfirm =
        window.confirm(
          'Esta acción es permanente. ¿Confirmas la eliminación?'
        )

      if (!secondConfirm) {
        return
      }

      setProcessingUser(
        item.id
      )

      try {
        const response =
          await fetch(
            `/api/users/${item.id}`,
            {
              method: 'DELETE',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        const result =
          await response.json()

        if (!result.ok) {
          return showNotice(
            result.message ||
              'No fue posible eliminar el usuario.',
            true
          )
        }

        showNotice(
          result.message ||
            'Usuario eliminado correctamente.'
        )

        await reloadAll()

      } catch {
        showNotice(
          'No se pudo conectar con el servidor.',
          true
        )
      } finally {
        setProcessingUser(
          null
        )
      }
    }

  const current =
    sections.find(
      (item) =>
        item.id === section
    )

  const Icon =
    current.icon

  return (
    <div className="entity-page">

      <header className="entity-header">

        <div>

          <p className="entity-kicker">
            ADMINISTRACIÓN
          </p>

          <h1>
            Configuración
          </h1>

          <p>
            Control institucional,
            accesos, seguridad y
            conexiones de AsistIA.
          </p>

        </div>

      </header>

      {notice && (
        <div
          className={
            `page-notice ${
              noticeError
                ? 'notice-error'
                : ''
            }`
          }
        >

          <CheckCircle2
            size={17}
          />

          {notice}

        </div>
      )}

      <div className="config-layout">

        <aside className="config-menu">

          {sections.map(
            ({
              id,
              label,
              icon: ItemIcon,
            }) => (
              <button
                key={id}
                type="button"

                className={
                  section === id
                    ? 'active'
                    : ''
                }

                onClick={() =>
                  setSection(id)
                }
              >

                <ItemIcon
                  size={18}
                />

                <span>
                  {label}
                </span>

              </button>
            )
          )}

        </aside>

        <section className="config-content">

          <header>

            <div className="config-section-icon">

              <Icon
                size={22}
              />

            </div>

            <div>

              <h2>
                {current.label}
              </h2>

              <p>
                Administra las preferencias
                de este módulo.
              </p>

            </div>

            {section ===
              'usuarios' && (
              <button
                type="button"
                className="primary-action"

                onClick={() =>
                  setInviteModal(true)
                }
              >

                <Plus
                  size={17}
                />

                Nueva solicitud

              </button>
            )}

          </header>

          {section ===
          'usuarios' ? (

            <UsersSettings
              currentUser={user}

              users={users}
              requests={requests}

              loading={
                loadingUsers
              }

              processingRequest={
                processingRequest
              }

              processingUser={
                processingUser
              }

              approve={
                approveRequest
              }

              reject={
                rejectRequest
              }

              deleteRequest={
                deleteRequest
              }

              disableUser={
                disableUser
              }

              enableUser={
                enableUser
              }

              deleteUser={
                deleteUser
              }
            />

          ) : section === 'institucion' &&
              (loadingInstitution || institutionSettings === null) ? (

            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: '#64748b'
              }}
            >
              Cargando configuración institucional...
            </div>

          ) : (

            <SettingsForm
              section={section}

              onSubmit={
                saveSettings
              }
              institutionSettings={institutionSettings}
              loadingInstitution={loadingInstitution}
              savingInstitution={savingInstitution}
            />

          )}

        </section>

      </div>

      {inviteModal && (
        <InviteModal

          close={() =>
            setInviteModal(false)
          }

          submit={
            createInvitation
          }

        />
      )}

    </div>
  )
}

// ======================================================
// USUARIOS Y SOLICITUDES
// ======================================================

function UsersSettings({
  currentUser,

  users,
  requests,

  loading,

  processingRequest,
  processingUser,

  approve,
  reject,
  deleteRequest,

  disableUser,
  enableUser,
  deleteUser,
}) {

  const pending =
    requests.filter(
      (request) =>
        request.status ===
        'pending'
    )

  const pendingActivation =
    users.filter(
      (item) =>
        item.status ===
        'pending_activation'
    )

  const activeUsers =
    users.filter(
      (item) =>
        item.status ===
        'active'
    )

  const disabledUsers =
    users.filter(
      (item) =>
        item.status ===
        'disabled'
    )

  const students =
    activeUsers.filter(
      (item) =>
        item.role ===
        'Estudiante'
    ).length

  const teachers =
    activeUsers.filter(
      (item) =>
        item.role ===
        'Docente'
    ).length

  return (
    <div className="authorized-users">

      {/* RESUMEN */}

      <div className="config-summary">

        <div>
          <strong>
            {activeUsers.length}
          </strong>

          <span>
            Usuarios activos
          </span>
        </div>

        <div>
          <strong>
            {students}
          </strong>

          <span>
            Estudiantes
          </span>
        </div>

        <div>
          <strong>
            {teachers}
          </strong>

          <span>
            Docentes
          </span>
        </div>

      </div>

      {/* =================================================
          SOLICITUDES PENDIENTES
      ================================================= */}

      <div
        style={{
          marginBottom: 28,
        }}
      >

        <h3
          style={{
            fontSize: 15,
            marginBottom: 4,
          }}
        >
          Solicitudes pendientes
        </h3>

        <p
          style={{
            fontSize: 10,
            color: '#8994a5',
            marginBottom: 12,
          }}
        >
          {pending.length}
          {' '}
          solicitud(es) por revisar
        </p>

        {pending.length === 0 ? (

          <div className="empty-search">
            No hay solicitudes pendientes.
          </div>

        ) : (

          <div className="table-wrapper">

            <table>

              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>

                {pending.map(
                  (request) => {

                    const processing =
                      processingRequest ===
                      request.id

                    return (
                      <tr
                        key={
                          request.id
                        }
                      >

                        <td>
                          <strong>
                            {request.name}
                          </strong>
                        </td>

                        <td>
                          {request.email}
                        </td>

                        <td>
                          {request.role}
                        </td>

                        <td>

                          <span className="entity-status status-orange">
                            Pendiente
                          </span>

                        </td>

                        <td>

                          <div className="row-actions">

                            <button
                              type="button"
                              title="Aprobar y enviar correo"

                              disabled={
                                processing
                              }

                              onClick={() =>
                                approve(
                                  request
                                )
                              }
                            >

                              <Check
                                size={16}
                              />

                            </button>

                            <button
                              type="button"
                              title="Rechazar solicitud"

                              disabled={
                                processing
                              }

                              onClick={() =>
                                reject(
                                  request
                                )
                              }
                            >

                              <Ban
                                size={16}
                              />

                            </button>

                            <button
                              type="button"
                              title="Eliminar solicitud"

                              disabled={
                                processing
                              }

                              onClick={() =>
                                deleteRequest(
                                  request
                                )
                              }
                            >

                              <Trash2
                                size={16}
                              />

                            </button>

                          </div>

                        </td>

                      </tr>
                    )
                  }
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

      {/* =================================================
          PENDIENTES DE ACTIVACIÓN
      ================================================= */}

      {pendingActivation.length >
        0 && (

        <div
          style={{
            marginBottom: 28,
          }}
        >

          <h3
            style={{
              fontSize: 15,
              marginBottom: 12,
            }}
          >
            Pendientes de activación
          </h3>

          <div className="table-wrapper">

            <table>

              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>

                {pendingActivation.map(
                  (item) => (
                    <tr
                      key={
                        item.email
                      }
                    >

                      <td>
                        <strong>
                          {item.name}
                        </strong>
                      </td>

                      <td>
                        {item.email}
                      </td>

                      <td>
                        {item.role}
                      </td>

                      <td>

                        <span className="entity-status status-orange">

                          <Mail
                            size={13}
                          />

                          {' '}
                          Esperando activación

                        </span>

                      </td>

                      <td>

                        <button
                          type="button"
                          className="delete-access"

                          disabled={
                            processingUser ===
                            item.id
                          }

                          title="Eliminar usuario pendiente"

                          onClick={() =>
                            deleteUser(
                              item
                            )
                          }
                        >

                          <Trash2
                            size={15}
                          />

                        </button>

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </div>
      )}

      {/* =================================================
          USUARIOS ACTIVOS
      ================================================= */}

      <h3
        style={{
          fontSize: 15,
          marginBottom: 12,
        }}
      >
        Usuarios con acceso
      </h3>

      {loading ? (

        <div className="empty-search">
          Cargando usuarios...
        </div>

      ) : (

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>
                <th>Usuario</th>
                <th>Correo institucional</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>

            </thead>

            <tbody>

              {activeUsers.map(
                (item) => {

                  const isMe =
                    item.id ===
                    currentUser.id

                  const processing =
                    processingUser ===
                    item.id

                  return (
                    <tr
                      key={
                        item.email
                      }
                    >

                      <td>

                        <strong>
                          {item.name}
                        </strong>

                        {isMe && (
                          <small
                            style={{
                              display: 'block',
                              color: '#8994a5',
                              marginTop: 3,
                            }}
                          >
                            Tu cuenta
                          </small>
                        )}

                      </td>

                      <td>
                        {item.email}
                      </td>

                      <td>
                        {item.role}
                      </td>

                      <td>

                        <span className="entity-status status-green">
                          Activo
                        </span>

                      </td>

                      <td>

                        {isMe ? (

                          <span
                            style={{
                              color: '#8994a5',
                              fontSize: 10,
                            }}
                          >
                            Protegida
                          </span>

                        ) : (

                          <div className="row-actions">

                            <button
                              type="button"

                              disabled={
                                processing
                              }

                              title="Desactivar usuario"

                              onClick={() =>
                                disableUser(
                                  item
                                )
                              }
                            >

                              <UserMinus
                                size={16}
                              />

                            </button>

                            <button
                              type="button"

                              disabled={
                                processing
                              }

                              title="Eliminar usuario"

                              onClick={() =>
                                deleteUser(
                                  item
                                )
                              }
                            >

                              <Trash2
                                size={16}
                              />

                            </button>

                          </div>

                        )}

                      </td>

                    </tr>
                  )
                }
              )}

            </tbody>

          </table>

        </div>

      )}

      {/* =================================================
          USUARIOS DESACTIVADOS
      ================================================= */}

      {disabledUsers.length >
        0 && (

        <div
          style={{
            marginTop: 28,
          }}
        >

          <h3
            style={{
              fontSize: 15,
              marginBottom: 12,
            }}
          >
            Usuarios desactivados
          </h3>

          <div className="table-wrapper">

            <table>

              <thead>

                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>

              </thead>

              <tbody>

                {disabledUsers.map(
                  (item) => (
                    <tr
                      key={
                        item.email
                      }
                    >

                      <td>
                        <strong>
                          {item.name}
                        </strong>
                      </td>

                      <td>
                        {item.email}
                      </td>

                      <td>
                        {item.role}
                      </td>

                      <td>

                        <span className="entity-status status-red">
                          Desactivado
                        </span>

                      </td>

                      <td>

                        <div className="row-actions">

                          <button
                            type="button"

                            disabled={
                              processingUser ===
                              item.id
                            }

                            title="Reactivar usuario"

                            onClick={() =>
                              enableUser(
                                item
                              )
                            }
                          >

                            <UserCheck
                              size={16}
                            />

                          </button>

                          <button
                            type="button"

                            disabled={
                              processingUser ===
                              item.id
                            }

                            title="Eliminar usuario"

                            onClick={() =>
                              deleteUser(
                                item
                              )
                            }
                          >

                            <Trash2
                              size={16}
                            />

                          </button>

                        </div>

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </div>
      )}

    </div>
  )
}

// ======================================================
// MODAL NUEVA SOLICITUD
// ======================================================

function InviteModal({
  close,
  submit,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={close}
    >

      <section
        className="entity-modal small-modal"

        onMouseDown={
          (event) =>
            event.stopPropagation()
        }
      >

        <header>

          <div>

            <p className="entity-kicker">
              NUEVA SOLICITUD
            </p>

            <h2>
              Registrar usuario
            </h2>

          </div>

          <button
            type="button"
            onClick={close}
          >

            <X
              size={20}
            />

          </button>

        </header>

        <form
          onSubmit={submit}
        >

          <div className="modal-fields single">

            <Field
              label="Nombre completo"
              name="name"
              value=""
            />

            <Field
              label="Correo institucional"
              name="email"
              value=""
              type="email"
            />

          </div>

          <div className="security-note">

            <ShieldCheck
              size={17}
            />

            <span>
              El rol se asignará automáticamente
              según el correo:
              estudiantes @duocuc.cl y docentes
              @profesor.duoc.cl.
              La contraseña será creada
              únicamente por el usuario
              después de la aprobación.
            </span>

          </div>

          <footer>

            <button
              type="button"
              className="secondary-action"

              onClick={close}
            >
              Cancelar
            </button>

            <button
              className="primary-action"
              type="submit"
            >

              <Plus
                size={17}
              />

              Registrar solicitud

            </button>

          </footer>

        </form>

      </section>

    </div>
  )
}

// ======================================================
// CONFIGURACIÓN GENERAL
// ======================================================

function SettingsForm({ section, onSubmit, institutionSettings, loadingInstitution, savingInstitution }) {
  return (
    <form
      className="config-form" key={section === "institucion" ? JSON.stringify(institutionSettings) : section}
      onSubmit={onSubmit}
    >

      {section ===
        'institucion' && (
        <>

          <div className="settings-grid">

            <Field
              label="Nombre de la institución"
              name="institution" value={institutionSettings?.institution ?? "Duoc UC"}
            />

            <Field
              label="Sede principal"
              name="campus" value={institutionSettings?.campus ?? "San Joaquín"}
            />

            <Field
              label="Correo de contacto"
              name="contact" value={institutionSettings?.contact ?? "usuario8@example.com"}
              type="email"
            />

            <Field
              label="Zona horaria"
              name="timezone" value={institutionSettings?.timezone ?? "America/Santiago"}
            />

          </div>

          <h3>
            Reglas académicas
          </h3>

          <Toggle
            label="Alerta bajo 75% de asistencia"
            name="attendanceAlert" checkedValue={institutionSettings?.attendanceAlert}
          />

          <Toggle
            label="Cerrar asistencia al terminar el módulo"
            name="closeClass" checkedValue={institutionSettings?.closeClass}
          />

        </>
      )}

      {section ===
        'seguridad' && (
        <>

          <h3>
            Políticas de acceso
          </h3>

          <Toggle
            label="Bloqueo después de 5 intentos fallidos"
            name="loginLock"
          />

          <Toggle
            label="Sesiones con duración máxima de 8 horas"
            name="sessionLimit"
          />

          <Field
            label="Minutos de bloqueo"
            name="lockMinutes"
            value="15"
            type="number"
          />

        </>
      )}

      {section ===
        'notificaciones' && (
        <>

          <h3>
            Comunicaciones automáticas
          </h3>

          <Toggle
            label="Avisar ausencias al correo institucional"
            name="absenceEmail"
          />

          <Toggle
            label="Enviar resumen diario a coordinación"
            name="dailySummary"
          />

          <Toggle
            label="Alertar incidencias de prioridad alta"
            name="incidentAlert"
          />

          <Field
            label="Hora del resumen diario"
            name="summaryTime"
            value="18:00"
            type="time"
          />

        </>
      )}

      {section ===
        'integraciones' && (
        <>

          <div className="integration-card">

            <div>

              <strong>
                Correo Gmail
              </strong>

              <span>
                Envío automático de enlaces
                de activación
              </span>

            </div>

            <em className="connection active">
              Configurado
            </em>

          </div>

          <div className="integration-card">

            <div>

              <strong>
                Base de datos SQLite
              </strong>

              <span>
                Autenticación, solicitudes
                y usuarios
              </span>

            </div>

            <em className="connection active">
              Conectada
            </em>

          </div>

          <div className="integration-card">

            <div>

              <strong>
                Experiencia Vivo Duoc UC
              </strong>

              <span>
                Sincronización académica futura
              </span>

            </div>

            <em className="connection">
              No configurada
            </em>

          </div>

        </>
      )}

      <footer>

        <button
          className="primary-action"
          type="submit"
        >

          <Save
            size={17}
          />

          {savingInstitution && section === "institucion" ? "Guardando..." : "Guardar cambios"}

        </button>

      </footer>

    </form>
  )
}

// ======================================================
// CAMPOS
// ======================================================

function Field({
  label,
  name,
  value,
  type = 'text',
}) {
  return (
    <label>

      {label}

      <input
        name={name}
        type={type}
        defaultValue={value}
        required
      />

    </label>
  )
}

function Toggle({ label, name, checkedValue }) {
  return (
    <label className="config-toggle">

      <span>

        <strong>
          {label}
        </strong>

        <small>
          Esta preferencia se aplicará
          a toda la institución.
        </small>

      </span>

      <input
        name={name}
        type="checkbox"
        defaultChecked={checkedValue ?? true}
      />

    </label>
  )
}