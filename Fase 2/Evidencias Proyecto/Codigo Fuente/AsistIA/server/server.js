import { pilotoAutorizado } from './pilotoAutorizado.mjs';
import { registrarAsistenciaFacial } from './asistenciaFacialRegistro.js';
import { verificarUsuarioFirebase } from "./firebaseAuth.js";
import { createEnrolmentPilotHandler } from './enrolmentPilot.js';
import { isPilotAdministrator, pilotAdminPathAllowed } from './pilotAdminAccess.js';
import { authFirebase } from "./firebaseAdmin.js";
import { createServer } from 'node:http'
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import nodemailer from 'nodemailer'
import { dbFirebase } from './firebaseAdmin.js'

const PORT = Number(process.env.PORT || 3001)

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  'http://localhost:5173'

const GMAIL_USER =
  process.env.GMAIL_USER || ''

const GMAIL_APP_PASSWORD =
  process.env.GMAIL_APP_PASSWORD || ''

mkdirSync(
  new URL('./data', import.meta.url),
  {
    recursive: true,
  }
)

const db = new DatabaseSync(
  new URL(
    './data/asistia.db',
    import.meta.url
  )
)

const sessions = new Map()

// PASO 187.11.2 - VALIDACION CENTRAL
const FIREBASE_ADMIN_UID = 'CJTqtki49Vgragr95W9tyLAjIj33';
const FIREBASE_ADMIN_EMAIL = 'usuario13@example.com';


// PASO 187.12.4 - DEMO
// Exclusivamente para desarrollo local. No habilitar en produccion.
const ASISTIA_DEMO_CUENTAS = {
  "8oLnumNuRFPoQ1BecZkJTcEwCeb2": {
    "email": "usuario14@example.com",
    "rol": "Administradora"
  },
  "bxmyLcWEgdhgAr9Pc09JfA0iyB82": {
    "email": "usuario15@example.com",
    "rol": "Docente"
  },
  "mfocD4TcwOfnApbXqQxJIezra4F3": {
    "email": "usuario16@example.com",
    "rol": "Alumno"
  }
};

function esCuentaDemoAutorizada(uid, email, rol) {
  // PASO 364.8 - Administradora demo autorizada en produccion.
  // Conserva las restricciones de solo lectura existentes.
  if (
    String(uid) === '8oLnumNuRFPoQ1BecZkJTcEwCeb2' &&
    String(email || '').trim().toLowerCase() === 'usuario14@example.com' &&
    rol === 'Administradora'
  ) {
    return true;
  }

  if (
    process.env.ASISTIA_DEMO_MODE !== '1' ||
    process.env.NODE_ENV === 'production'
  ) return false;

  const cuenta = ASISTIA_DEMO_CUENTAS[String(uid)];
  return Boolean(
    cuenta &&
    cuenta.email === String(email || '').trim().toLowerCase() &&
    cuenta.rol === rol
  );
}

function correoPermitidoFirebase(uid, email, rol, scope = null) {
  const correo = String(email || '').trim().toLowerCase();
  if (esCuentaDemoAutorizada(uid, correo, rol)) return true;
  if (isPilotAdministrator({ email: correo, role: rol, scope })) return true;

  if (
    uid === FIREBASE_ADMIN_UID &&
    correo === FIREBASE_ADMIN_EMAIL &&
    rol === 'Administradora'
  ) {
    return true;
  }

  if (rol === 'Alumno') {
    return correo.endsWith('@duocuc.cl');
  }

  if (rol === 'Docente') {
    return correo.endsWith('@profesor.duoc.cl');
  }

  return false;
}

async function validarSesionFirebaseActual(session) {
  if (!session.firebaseUid || !session.firebaseUser) {
    return false;
  }

  try {
    const cuenta = await authFirebase.getUser(session.firebaseUid);

    if (
      cuenta.disabled ||
      !cuenta.emailVerified ||
      !correoPermitidoFirebase(
        session.firebaseUid,
        cuenta.email,
        session.firebaseUser.role,
        session.firebaseUser.scope
      )
    ) {
      return false;
    }

    const perfilDoc = await dbFirebase
      .collection('usuarios')
      .doc(session.firebaseUid)
      .get();

    if (!perfilDoc.exists) return false;

    const perfil = perfilDoc.data() || {};

    if (
      perfil.activo !== true ||
      perfil.rol !== session.firebaseUser.role ||
      (perfil.alcance || null) !== (session.firebaseUser.scope || null) ||
      String(cuenta.email || '').toLowerCase() !==
        String(session.firebaseUser.email || '').toLowerCase()
    ) {
      return false;
    }

    if (
      perfil.correo &&
      String(perfil.correo).toLowerCase() !==
        String(cuenta.email || '').toLowerCase()
    ) {
      return false;
    }

    const revocadoDesde = Date.parse(
      cuenta.tokensValidAfterTime || ''
    );

    if (
      Number.isFinite(revocadoDesde) &&
      revocadoDesde > session.firebaseAuthenticatedAt
    ) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      'Error validando sesion Firebase:',
      error.code || error.message
    );
    return false;
  }
}

// ======================================================
// CORREO
// ======================================================

const mailer = nodemailer.createTransport({
  service: 'gmail',

  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
})

async function sendActivationEmail({
  name,
  email,
  token,
}) {
  const activationUrl =
    `${FRONTEND_URL}/activar-cuenta?token=${encodeURIComponent(token)}`

  await mailer.sendMail({
    from: `"AsistIA" <${GMAIL_USER}>`,
    to: email,

    subject:
      'AsistIA - Activa tu cuenta',

    text: `
Hola ${name}.

Tu solicitud de acceso a AsistIA fue aprobada.

Para activar tu cuenta y crear tu contraseña, abre el siguiente enlace:

${activationUrl}

Este enlace estará disponible durante 24 horas.

Si no realizaste esta solicitud, puedes ignorar este mensaje.

AsistIA
Gestión académica institucional
`,

    html: `
      <div
        style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: auto;
          color: #14213d;
        "
      >

        <div
          style="
            background: #06274d;
            padding: 25px;
            border-radius: 12px 12px 0 0;
            color: white;
          "
        >

          <h1
            style="
              margin: 0;
              font-size: 25px;
            "
          >
            AsistIA
          </h1>

          <p
            style="
              margin: 5px 0 0;
              opacity: .8;
            "
          >
            Gestión académica institucional
          </p>

        </div>

        <div
          style="
            padding: 30px;
            border: 1px solid #e4e9f1;
            border-top: 0;
            border-radius: 0 0 12px 12px;
          "
        >

          <h2>
            Tu solicitud fue aprobada
          </h2>

          <p>
            Hola <strong>${escapeHtml(name)}</strong>,
          </p>

          <p>
            Tu solicitud de acceso a
            <strong>AsistIA</strong>
            fue aprobada.
          </p>

          <p>
            Para activar tu cuenta,
            crea tu contraseña utilizando
            el siguiente botón:
          </p>

          <p
            style="
              text-align: center;
              margin: 30px 0;
            "
          >

            <a
              href="${activationUrl}"
              style="
                display: inline-block;
                padding: 13px 25px;
                border-radius: 8px;
                background: #0b63ce;
                color: white;
                text-decoration: none;
                font-weight: bold;
              "
            >
              Activar mi cuenta
            </a>

          </p>

          <p
            style="
              font-size: 13px;
              color: #667085;
            "
          >
            Este enlace estará disponible
            durante 24 horas y solo podrá
            utilizarse una vez.
          </p>

          <hr
            style="
              margin: 25px 0;
              border: 0;
              border-top: 1px solid #e4e9f1;
            "
          />

          <p
            style="
              font-size: 12px;
              color: #8994a5;
            "
          >
            Si no realizaste esta solicitud,
            puedes ignorar este mensaje.
          </p>

        </div>

      </div>
    `,
  })

  return activationUrl
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// ======================================================
// BASE DE DATOS
// ======================================================

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`)

db.exec(`
CREATE TABLE IF NOT EXISTS access_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
)
`)

db.exec(`
CREATE TABLE IF NOT EXISTS activation_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
`)

db.exec(`
UPDATE users
SET must_change_password = 0
`)

// ======================================================
// CORREGIR DOMINIO ANTIGUO DOCENTE
// ======================================================

try {
  db.prepare(`
    UPDATE users
    SET email = ?
    WHERE email = ?
  `).run(
    'usuario15@example.com',
    'usuario17@example.com'
  )
} catch {
  console.log(
    'Correo del docente demo ya actualizado.'
  )
}

// ======================================================
// CONTRASEÑAS
// ======================================================

function passwordHash(
  password,
  salt = randomBytes(16).toString('hex')
) {
  const hash =
    scryptSync(
      password,
      salt,
      64
    ).toString('hex')

  return `${salt}:${hash}`
}

function passwordMatches(
  password,
  stored
) {
  try {
    if (!stored) {
      return false
    }

    const [salt, key] =
      stored.split(':')

    if (!salt || !key) {
      return false
    }

    const storedBuffer =
      Buffer.from(
        key,
        'hex'
      )

    const suppliedBuffer =
      scryptSync(
        password,
        salt,
        64
      )

    if (
      storedBuffer.length !==
      suppliedBuffer.length
    ) {
      return false
    }

    return timingSafeEqual(
      storedBuffer,
      suppliedBuffer
    )
  } catch {
    return false
  }
}

function strongPassword(password) {
  return /(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/
    .test(password)
}

// ======================================================
// CORREOS DUOC
// ======================================================

function getDuocRole(email) {
  const normalized =
    String(email || '')
      .trim()
      .toLowerCase()

  if (
    normalized.endsWith(
      '@profesor.duoc.cl'
    )
  ) {
    return 'Docente'
  }

  if (
    normalized.endsWith(
      '@duocuc.cl'
    )
  ) {
    return 'Estudiante'
  }

  return null
}

function validDuocEmail(email) {
  return (
    getDuocRole(email) !== null
  )
}

// ======================================================
// USUARIOS INICIALES
// ======================================================
//
// Francisco ya NO está aquí.
// Eso permitirá eliminar su cuenta y después
// volver a registrarla normalmente.
//

const seed = db.prepare(`
INSERT OR IGNORE INTO users
(
  email,
  name,
  role,
  password_hash,
  must_change_password,
  status
)
VALUES (?, ?, ?, ?, 0, 'active')
`)

// ADMINISTRADOR
seed.run(
  'usuario5@example.com',
  'Administrador AsistIA',
  'Administradora',
  passwordHash('Duoc2026!')
)

// ALUMNO DEMO
seed.run(
  'usuario16@example.com',
  'Alumno Demostración',
  'Estudiante',
  passwordHash('Duoc2026!')
)

// DOCENTE DEMO
seed.run(
  'usuario15@example.com',
  'Docente Demostración',
  'Docente',
  passwordHash('Duoc2026!')
)

// ======================================================
// JSON
// ======================================================

function json(
  res,
  status,
  responseBody
) {
  res.writeHead(status, {
    'Content-Type':
      'application/json; charset=utf-8',

    'Access-Control-Allow-Origin':
      'http://localhost:5173',

    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',

    'Access-Control-Allow-Methods':
      'GET, POST, PUT, DELETE, OPTIONS',
  })

  res.end(
    JSON.stringify(
      responseBody
    )
  )
}

async function body(req) {
  let raw = ''

  for await (
    const chunk of req
  ) {
    raw += chunk
  }

  return JSON.parse(
    raw || '{}'
  )
}

// ======================================================
// OBJETOS PÚBLICOS
// ======================================================

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,

    mustChangePassword:
      Boolean(
        user.must_change_password
      ),

    lastLogin:
      user.last_login,

    createdAt:
      user.created_at,
  }
}

function publicRequest(request) {
  return {
    id: request.id,
    name: request.name,
    email: request.email,
    role: request.role,
    status: request.status,

    reviewedBy:
      request.reviewed_by,

    reviewedAt:
      request.reviewed_at,

    createdAt:
      request.created_at,
  }
}

// ======================================================
// SESIONES
// ======================================================

function getSession(req) {
  const token =
    (
      req.headers.authorization ||
      ''
    )
      .replace(
        'Bearer ',
        ''
      )
      .trim()

  if (!token) {
    return {
      ok: false,

      message:
        'No existe una sesión válida.',
    }
  }

  const session =
    sessions.get(token)

  if (!session) {
    return {
      ok: false,

      message:
        'Sesión no válida.',
    }
  }

  if (
    session.expires <
    Date.now()
  ) {
    sessions.delete(token)

    return {
      ok: false,

      message:
        'Tu sesión expiró. Ingresa nuevamente.',
    }
  }
  // PASO 187.10.3 - PUENTE FIREBASE
  // Sesion temporal emitida solo tras verificar Firebase.
  if (session.firebaseUser) {
    // PASO 187.11 - CONTROL DE SESION
    // La sesion se invalida cuando el perfil cambia.
    if (session.firebaseInvalidated) {
      sessions.delete(token);
      return {
        ok: false,
        message: 'Tu sesion fue revocada. Ingresa nuevamente.'
      };
    }

    return {
      ok: true,
      token,
      session,
      user: session.firebaseUser
    };
  }

  const user =
    db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
    `).get(
      session.userId
    )

  if (
    !user ||
    user.status !== 'active'
  ) {
    sessions.delete(token)

    return {
      ok: false,

      message:
        'Usuario no autorizado.',
    }
  }

  return {
    ok: true,
    token,
    session,
    user,
  }
}

function crearEventoAuditoria(auth, accion, modulo, registroId, detalle = {}) {
  return {
    usuarioId: String(auth.user.id),
    usuario: String(auth.user.name || auth.user.email || 'Administradora'),
    correoUsuario: String(auth.user.email || ''),
    rol: String(auth.user.role || ''),
    accion,
    modulo,
    registroId: String(registroId),
    detalle,
    fecha: new Date().toISOString(),
    resultado: 'Correcto',
  }
}
function requireAdmin(req) {
  const auth =
    getSession(req)

  if (!auth.ok) {
    return auth
  }

  if (
    auth.user.role !==
    'Administradora'
  ) {
    return {
      ok: false,
      forbidden: true,

      message:
        'Solo un administrador puede realizar esta acción.',
    }
  }

  return auth
}

// ======================================================
// CERRAR TODAS LAS SESIONES DE UN USUARIO
// ======================================================

function closeUserSessions(userId) {
  for (
    const [token, session]
    of sessions.entries()
  ) {
    if (
      session.userId ===
      userId
    ) {
      sessions.delete(token)
    }
  }
}

// ======================================================
// SERVIDOR
// ======================================================

const handleEnrolmentPilot = createEnrolmentPilotHandler({
  dbFirebase,
  readBody: body,
  getAccess(req) {
    const access = getSession(req);
    return { ...access, isDemo: access.ok && esCuentaDemoAutorizada(access.session?.firebaseUid, access.user.email, access.user.role) };
  },
});

createServer(
  async (req, res) => {

    if (
      req.method ===
      'OPTIONS'
    ) {
      return json(
        res,
        204,
        {}
      )
    }

    try {

      // PASO 187.11.2 - COMPROBACION DE SESIONES ACTIVAS
      const encabezadoSesion = String(
        req.headers.authorization || ''
      );

      if (encabezadoSesion.startsWith('Bearer ')) {
        const tokenSesion = encabezadoSesion.slice(7).trim();
        const sesionActual = sessions.get(tokenSesion);

        // PASO 187.12.4 - DEMO: administradora demo solo lectura
        if (
          sesionActual?.firebaseUid &&
          esCuentaDemoAutorizada(
            sesionActual.firebaseUid,
            sesionActual.firebaseUser?.email,
            sesionActual.firebaseUser?.role
          ) &&
          sesionActual.firebaseUser?.role === 'Administradora' &&
          !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
          req.url !== '/api/auth/logout' &&
          // ASISTIA_187_14_87_EXCEPCION_TOTEM_DEMO
          !(
            req.url === '/api/academico/totem/pin-verificar-prueba' &&
            req.method === 'POST' &&
            process.env.ASISTIA_DEMO_MODE === '1' &&
            process.env.NODE_ENV !== 'production'
          )
        ) {
          return json(res, 403, {
            ok: false,
            message: 'La Administradora demo tiene acceso de solo lectura.'
          });
        }

        if (sesionActual && sesionActual.firebaseUid) {
          const valida = await validarSesionFirebaseActual(
            sesionActual
          );

          if (!valida) {
            sessions.delete(tokenSesion);

            return json(res, 401, {
              ok: false,
              message: 'Tu sesion ya no esta autorizada. Ingresa nuevamente.'
            });
          }
        }
      }
      const currentAccess = getSession(req);
      if (currentAccess.ok && isPilotAdministrator(currentAccess.user) && !pilotAdminPathAllowed(req.url)) {
        return json(res, 403, { ok: false, message: 'Tu cuenta administra únicamente el piloto de enrolamiento.' });
      }
      if (await handleEnrolmentPilot(req, res)) return;
      // =================================================
      // LOGIN
      // =================================================

      if (
        req.method ===
          'POST' &&
        req.url ===
          '/api/auth/login'
      ) {
        // PASO 187.12.3 - LOGIN SQLITE DESHABILITADO
        return json(res, 410, {
          ok: false,
          message: 'El acceso antiguo fue deshabilitado. Utiliza Firebase Authentication.'
        });


        const {
          email = '',
          password = '',
        } =
          await body(req)

        const normalizedEmail =
          String(email)
            .trim()
            .toLowerCase()

        if (
          !validDuocEmail(
            normalizedEmail
          )
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Solo se permiten correos institucionales de estudiantes @duocuc.cl o profesores @profesor.duoc.cl.',
            }
          )
        }

        const user =
          db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
          `).get(
            normalizedEmail
          )

        if (!user) {
          return json(
            res,
            401,
            {
              ok: false,

              message:
                'Correo o contraseña incorrectos, o usuario no autorizado.',
            }
          )
        }

        if (
          user.status ===
          'pending_activation'
        ) {
          return json(
            res,
            403,
            {
              ok: false,

              message:
                'Tu cuenta fue aprobada pero todavía debes activarla desde el enlace enviado a tu correo.',
            }
          )
        }

        if (
          user.status ===
          'disabled'
        ) {
          return json(
            res,
            403,
            {
              ok: false,

              message:
                'Tu cuenta está desactivada. Contacta a la administración.',
            }
          )
        }

        if (
          user.status !==
          'active'
        ) {
          return json(
            res,
            403,
            {
              ok: false,

              message:
                'Esta cuenta no se encuentra activa.',
            }
          )
        }

        if (
          !passwordMatches(
            password,
            user.password_hash
          )
        ) {
          return json(
            res,
            401,
            {
              ok: false,

              message:
                'Correo o contraseña incorrectos, o usuario no autorizado.',
            }
          )
        }

        db.prepare(`
          UPDATE users
          SET last_login =
            CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          user.id
        )

        const token =
          randomBytes(32)
            .toString('hex')

        sessions.set(
          token,
          {
            userId:
              user.id,

            expires:
              Date.now() +
              8 *
              60 *
              60_000,
          }
        )

        const updatedUser =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(
            user.id
          )

        return json(
          res,
          200,
          {
            ok: true,

            token,

            user:
              publicUser(
                updatedUser
              ),
          }
        )
      }

      // =================================================
      // SOLICITAR REGISTRO
      // =================================================

      if (
        req.method ===
          'POST' &&
        req.url ===
          '/api/auth/register-request'
      ) {

        const {
          name = '',
          email = '',
        } =
          await body(req)

        const normalizedName =
          String(name).trim()

        const normalizedEmail =
          String(email)
            .trim()
            .toLowerCase()

        if (!normalizedName) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Debes ingresar tu nombre completo.',
            }
          )
        }

        const role =
          getDuocRole(
            normalizedEmail
          )

        if (!role) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Solo se aceptan correos @duocuc.cl para estudiantes o @profesor.duoc.cl para docentes.',
            }
          )
        }

        const existingUser =
          db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
          `).get(
            normalizedEmail
          )

        if (
          existingUser
        ) {
          let message =
            'Este correo ya tiene una cuenta autorizada.'

          if (
            existingUser.status ===
            'pending_activation'
          ) {
            message =
              'Tu cuenta ya fue aprobada. Revisa tu correo para activarla.'
          }

          if (
            existingUser.status ===
            'disabled'
          ) {
            message =
              'Este correo tiene una cuenta desactivada. Contacta a la administración.'
          }

          return json(
            res,
            409,
            {
              ok: false,
              message,
            }
          )
        }

        const existingRequest =
          db.prepare(`
            SELECT *
            FROM access_requests
            WHERE email = ?
          `).get(
            normalizedEmail
          )

        if (
          existingRequest &&
          existingRequest.status ===
            'pending'
        ) {
          return json(
            res,
            409,
            {
              ok: false,

              message:
                'Ya existe una solicitud pendiente para este correo.',
            }
          )
        }

        if (
          existingRequest
        ) {
          db.prepare(`
            UPDATE access_requests
            SET
              name = ?,
              role = ?,
              status = 'pending',
              reviewed_by = NULL,
              reviewed_at = NULL,
              created_at = CURRENT_TIMESTAMP
            WHERE email = ?
          `).run(
            normalizedName,
            role,
            normalizedEmail
          )

          return json(
            res,
            200,
            {
              ok: true,

              message:
                'Solicitud enviada correctamente.',
            }
          )
        }

        db.prepare(`
          INSERT INTO access_requests
          (
            name,
            email,
            role,
            status
          )
          VALUES (
            ?,
            ?,
            ?,
            'pending'
          )
        `).run(
          normalizedName,
          normalizedEmail,
          role
        )

        return json(
          res,
          201,
          {
            ok: true,

            message:
              'Solicitud enviada correctamente. Un administrador deberá aprobarla.',
          }
        )
      }

      // =================================================
      // LISTAR USUARIOS
      // =================================================

      if (
        req.method ===
          'GET' &&
        req.url ===
          '/api/users'
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const users =
          db.prepare(`
            SELECT *
            FROM users
            ORDER BY created_at DESC
          `).all()

        return json(
          res,
          200,
          {
            ok: true,

            users:
              users.map(
                publicUser
              ),
          }
        )
      }

      // =================================================
      // DESACTIVAR USUARIO
      // POST /api/users/:id/disable
      // =================================================

      const disableMatch =
        req.url?.match(
          /^\/api\/users\/(\d+)\/disable$/
        )

      if (
        req.method ===
          'POST' &&
        disableMatch
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const userId =
          Number(
            disableMatch[1]
          )

        if (
          userId ===
          auth.user.id
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'No puedes desactivar tu propia cuenta de administrador.',
            }
          )
        }

        const target =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(
            userId
          )

        if (!target) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'Usuario no encontrado.',
            }
          )
        }

        db.prepare(`
          UPDATE users
          SET status = 'disabled'
          WHERE id = ?
        `).run(
          userId
        )

        closeUserSessions(
          userId
        )

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Usuario desactivado correctamente.',
          }
        )
      }

      // =================================================
      // REACTIVAR USUARIO
      // POST /api/users/:id/enable
      // =================================================

      const enableMatch =
        req.url?.match(
          /^\/api\/users\/(\d+)\/enable$/
        )

      if (
        req.method ===
          'POST' &&
        enableMatch
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const userId =
          Number(
            enableMatch[1]
          )

        const target =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(
            userId
          )

        if (!target) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'Usuario no encontrado.',
            }
          )
        }

        if (
          target.status !==
          'disabled'
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Solo se pueden reactivar cuentas desactivadas.',
            }
          )
        }

        db.prepare(`
          UPDATE users
          SET status = 'active'
          WHERE id = ?
        `).run(
          userId
        )

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Usuario reactivado correctamente.',
          }
        )
      }

      // =================================================
      // ELIMINAR USUARIO
      // DELETE /api/users/:id
      // =================================================

      const deleteUserMatch =
        req.url?.match(
          /^\/api\/users\/(\d+)$/
        )

      if (
        req.method ===
          'DELETE' &&
        deleteUserMatch
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const userId =
          Number(
            deleteUserMatch[1]
          )

        if (
          userId ===
          auth.user.id
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'No puedes eliminar tu propia cuenta de administrador.',
            }
          )
        }

        const target =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(
            userId
          )

        if (!target) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'Usuario no encontrado.',
            }
          )
        }

        closeUserSessions(
          userId
        )

        db.exec('BEGIN')

        try {

          db.prepare(`
            DELETE FROM activation_tokens
            WHERE user_id = ?
          `).run(
            userId
          )

          db.prepare(`
            DELETE FROM access_requests
            WHERE email = ?
          `).run(
            target.email
          )

          db.prepare(`
            DELETE FROM users
            WHERE id = ?
          `).run(
            userId
          )

          db.exec('COMMIT')

        } catch (error) {

          db.exec('ROLLBACK')
          throw error

        }

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Usuario eliminado correctamente. Ese correo puede volver a registrarse.',
          }
        )
      }

      // =================================================
      // LISTAR SOLICITUDES
      // =================================================

      if (
        req.method ===
          'GET' &&
        req.url ===
          '/api/access-requests'
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const requests =
          db.prepare(`
            SELECT *
            FROM access_requests
            ORDER BY
              CASE
                WHEN status = 'pending'
                THEN 0
                ELSE 1
              END,
              created_at DESC
          `).all()

        return json(
          res,
          200,
          {
            ok: true,

            requests:
              requests.map(
                publicRequest
              ),
          }
        )
      }

      // =================================================
      // ELIMINAR SOLICITUD
      // DELETE /api/access-requests/:id
      // =================================================

      const deleteRequestMatch =
        req.url?.match(
          /^\/api\/access-requests\/(\d+)$/
        )

      if (
        req.method ===
          'DELETE' &&
        deleteRequestMatch
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const requestId =
          Number(
            deleteRequestMatch[1]
          )

        const request =
          db.prepare(`
            SELECT *
            FROM access_requests
            WHERE id = ?
          `).get(
            requestId
          )

        if (!request) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'Solicitud no encontrada.',
            }
          )
        }

        const existingUser =
          db.prepare(`
            SELECT id
            FROM users
            WHERE email = ?
          `).get(
            request.email
          )

        if (
          existingUser
        ) {
          return json(
            res,
            409,
            {
              ok: false,

              message:
                'Existe una cuenta asociada a esta solicitud. Elimina primero el usuario.',
            }
          )
        }

        db.prepare(`
          DELETE FROM access_requests
          WHERE id = ?
        `).run(
          requestId
        )

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Solicitud eliminada correctamente.',
          }
        )
      }

      // =================================================
      // APROBAR SOLICITUD
      // =================================================

      const approveMatch =
        req.url?.match(
          /^\/api\/access-requests\/(\d+)\/approve$/
        )

      if (
        req.method ===
          'POST' &&
        approveMatch
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const requestId =
          Number(
            approveMatch[1]
          )

        const request =
          db.prepare(`
            SELECT *
            FROM access_requests
            WHERE id = ?
          `).get(
            requestId
          )

        if (!request) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'Solicitud no encontrada.',
            }
          )
        }

        if (
          request.status !==
          'pending'
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Esta solicitud ya fue revisada.',
            }
          )
        }

        const existingUser =
          db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
          `).get(
            request.email
          )

        if (
          existingUser
        ) {
          return json(
            res,
            409,
            {
              ok: false,

              message:
                'Ese correo ya tiene una cuenta registrada.',
            }
          )
        }

        const placeholderPassword =
          randomBytes(32)
            .toString('hex')

        const userResult =
          db.prepare(`
            INSERT INTO users
            (
              email,
              name,
              role,
              password_hash,
              must_change_password,
              status
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              0,
              'pending_activation'
            )
          `).run(
            request.email,
            request.name,
            request.role,

            passwordHash(
              placeholderPassword
            )
          )

        const userId =
          Number(
            userResult.lastInsertRowid
          )

        const activationToken =
          randomBytes(32)
            .toString('hex')

        const expiresAt =
          Date.now() +
          24 *
          60 *
          60 *
          1000

        db.prepare(`
          INSERT INTO activation_tokens
          (
            user_id,
            token,
            expires_at,
            used
          )
          VALUES (?, ?, ?, 0)
        `).run(
          userId,
          activationToken,
          expiresAt
        )

        try {

          await sendActivationEmail({
            name:
              request.name,

            email:
              request.email,

            token:
              activationToken,
          })

        } catch (mailError) {

          console.error(
            'Error enviando correo:',
            mailError
          )

          db.prepare(`
            DELETE FROM activation_tokens
            WHERE user_id = ?
          `).run(
            userId
          )

          db.prepare(`
            DELETE FROM users
            WHERE id = ?
          `).run(
            userId
          )

          return json(
            res,
            500,
            {
              ok: false,

              message:
                'No se pudo enviar el correo de activación. Verifica la configuración de Gmail.',
            }
          )
        }

        db.prepare(`
          UPDATE access_requests
          SET
            status = 'approved',
            reviewed_by = ?,
            reviewed_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          auth.user.id,
          requestId
        )

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Solicitud aprobada. Se envió un correo para que el usuario cree su contraseña.',
          }
        )
      }

      // =================================================
      // RECHAZAR SOLICITUD
      // =================================================

      const rejectMatch =
        req.url?.match(
          /^\/api\/access-requests\/(\d+)\/reject$/
        )

      if (
        req.method ===
          'POST' &&
        rejectMatch
      ) {

        const auth =
          requireAdmin(req)

        if (!auth.ok) {
          return json(
            res,
            auth.forbidden
              ? 403
              : 401,
            {
              ok: false,

              message:
                auth.message,
            }
          )
        }

        const requestId =
          Number(
            rejectMatch[1]
          )

        const request =
          db.prepare(`
            SELECT *
            FROM access_requests
            WHERE id = ?
          `).get(
            requestId
          )

        if (!request) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'Solicitud no encontrada.',
            }
          )
        }

        if (
          request.status !==
          'pending'
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Esta solicitud ya fue revisada.',
            }
          )
        }

        db.prepare(`
          UPDATE access_requests
          SET
            status = 'rejected',
            reviewed_by = ?,
            reviewed_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          auth.user.id,
          requestId
        )

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Solicitud rechazada correctamente.',
          }
        )
      }

      // =================================================
      // VALIDAR TOKEN DE ACTIVACIÓN
      // =================================================

      if (
        req.method ===
          'POST' &&
        req.url ===
          '/api/auth/activation-info'
      ) {

        const {
          token = '',
        } =
          await body(req)

        const activation =
          db.prepare(`
            SELECT
              activation_tokens.*,
              users.name,
              users.email,
              users.role,
              users.status AS user_status
            FROM activation_tokens
            JOIN users
              ON users.id =
                activation_tokens.user_id
            WHERE
              activation_tokens.token = ?
          `).get(
            token
          )

        if (!activation) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'El enlace de activación no es válido.',
            }
          )
        }

        if (
          activation.used
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Este enlace de activación ya fue utilizado.',
            }
          )
        }

        if (
          activation.expires_at <
          Date.now()
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Este enlace de activación expiró.',
            }
          )
        }

        return json(
          res,
          200,
          {
            ok: true,

            user: {
              name:
                activation.name,

              email:
                activation.email,

              role:
                activation.role,
            },
          }
        )
      }

      // =================================================
      // ACTIVAR CUENTA
      // =================================================

      if (
        req.method ===
          'POST' &&
        req.url ===
          '/api/auth/activate'
      ) {

        const {
          token = '',
          password = '',
        } =
          await body(req)

        if (
          !strongPassword(
            password
          )
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.',
            }
          )
        }

        const activation =
          db.prepare(`
            SELECT
              activation_tokens.*,
              users.status AS user_status
            FROM activation_tokens
            JOIN users
              ON users.id =
                activation_tokens.user_id
            WHERE
              activation_tokens.token = ?
          `).get(
            token
          )

        if (!activation) {
          return json(
            res,
            404,
            {
              ok: false,

              message:
                'El enlace de activación no es válido.',
            }
          )
        }

        if (
          activation.used
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Este enlace ya fue utilizado.',
            }
          )
        }

        if (
          activation.expires_at <
          Date.now()
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'El enlace de activación expiró.',
            }
          )
        }

        if (
          activation.user_status !==
          'pending_activation'
        ) {
          return json(
            res,
            400,
            {
              ok: false,

              message:
                'Esta cuenta ya fue activada o no puede activarse.',
            }
          )
        }

        db.exec('BEGIN')

        try {

          db.prepare(`
            UPDATE users
            SET
              password_hash = ?,
              status = 'active',
              must_change_password = 0
            WHERE id = ?
          `).run(
            passwordHash(
              password
            ),

            activation.user_id
          )

          db.prepare(`
            UPDATE activation_tokens
            SET used = 1
            WHERE id = ?
          `).run(
            activation.id
          )

          db.exec('COMMIT')

        } catch (error) {

          db.exec('ROLLBACK')
          throw error

        }

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Tu cuenta fue activada correctamente. Ya puedes iniciar sesión.',
          }
        )
      }

      // =================================================
      // CERRAR SESIÓN
      // =================================================

      if (
        req.method ===
          'POST' &&
        req.url ===
          '/api/auth/logout'
      ) {

        const token =
          (
            req.headers.authorization ||
            ''
          )
            .replace(
              'Bearer ',
              ''
            )
            .trim()

        if (token) {
          sessions.delete(
            token
          )
        }

        return json(
          res,
          200,
          {
            ok: true,

            message:
              'Sesión cerrada correctamente.',
          }
        )
      }

      // =================================================
      // =================================================
      // AUDITORIA FIRESTORE ASISTENCIALIA
            // PASO 187.7 FIREBASE AUTH - VERIFICACION AISLADA
      // PASO 187.10.3 - INTERCAMBIO FIREBASE
      if (req.method === 'POST' && req.url === '/api/auth/firebase/exchange') {
        const verificacion = await verificarUsuarioFirebase(req);

        if (!verificacion.ok) {
          return json(res, verificacion.status, {
            ok: false,
            message: verificacion.message
          });
        }

        const user = verificacion.user;
        if (!correoPermitidoFirebase(
          verificacion.uid,
          user.email,
          user.role,
          user.scope
        )) {
          return json(res, 403, {
            ok: false,
            message: 'Solo se permiten cuentas institucionales Duoc UC autorizadas.'
          });
        }

        const identidadFirebase = await authFirebase.verifyIdToken(
          String(req.headers.authorization || '').slice(7).trim(),
          true
        );

        const firebaseAuthenticatedAt =
          Number(identidadFirebase.auth_time) * 1000;

        if (
          !Number.isFinite(firebaseAuthenticatedAt) ||
          firebaseAuthenticatedAt <= 0
        ) {
          return json(res, 401, {
            ok: false,
            message: 'No fue posible validar la autenticacion.'
          });
        }

        const token = randomBytes(32).toString('hex');

        sessions.set(token, {
          firebaseUid: verificacion.uid,
          firebaseAuthenticatedAt,
          firebaseUser: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            scope: user.scope || null,
            status: 'active'
          },
          expires: Date.now() + 8 * 60 * 60_000
        });

        return json(res, 200, {
          ok: true,
          token,
          user
        });
      }
      if (req.method === 'GET' && req.url === '/api/firebase-auth/verificar') {
        const resultado = await verificarUsuarioFirebase(req);

        if (!resultado.ok) {
          return json(res, resultado.status, {
            ok: false,
            message: resultado.message
          });
        }

        return json(res, 200, {
          ok: true,
          user: resultado.user
        });
      }
if (req.method === 'GET' && req.url === '/api/auditoria') {
        const auth = requireAdmin(req)

        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message,
          })
        }

        const snapshot = await dbFirebase
          .collection('auditoria')
          .orderBy('fecha', 'desc')
          .limit(200)
          .get()

        const registros = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))

        return json(res, 200, {
          ok: true,
          registros,
        })
      }
      // =================================================
            // ASISTIA_187_14_51_API_AUSENCIA_DOCENTE
            // ASISTIA_PASO298_DOCENTE_FACIAL
      if (req.method === 'GET' && req.url === '/api/academico/docente/marcaciones-piloto') {
        const auth = getSession(req);
        if (!auth.ok) return json(res,401,{ok:false,message:'Sesion invalida.'});
        if (auth.user.role !== 'Docente') return json(res,403,{ok:false,message:'Solo docentes.'});

        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
        const uid = sessions.get(token)?.firebaseUid;
        if (!uid) return json(res,401,{ok:false,message:'Sesion Firebase requerida.'});

        const perfil = (await dbFirebase.collection('usuarios').doc(uid).get()).data() || {};
        const docenteId = String(perfil.docenteId || '');
        const idValido = /^[A-Za-z0-9_-]{1,128}$/;

        if (perfil.activo !== true || perfil.rol !== 'Docente' || !idValido.test(docenteId))
          return json(res,403,{ok:false,message:'Perfil no autorizado.'});

        const docente = (await dbFirebase.collection('docentes').doc(docenteId).get()).data() || {};
        if (docente.firebaseUid !== uid || docente.estado !== 'Activo')
          return json(res,403,{ok:false,message:'Vinculacion invalida.'});

        const horarios = await dbFirebase.collection('horarios').where('docenteId','==',docenteId).get();
        const registros = [];

        for (const h of horarios.docs) {
          const horario = h.data();
          const snap = await dbFirebase.collection('marcaciones_piloto').where('horarioId','==',h.id).get();

          for (const d of snap.docs) {
            const m = d.data();
            if (m.esDemo !== true || m.asistenciaOficial !== false || m.cursoId !== horario.cursoId || !idValido.test(m.alumnoId || '')) continue;

            const matriculas = await dbFirebase.collection('matriculas').where('alumnoId','==',m.alumnoId).get();
            if (!matriculas.docs.some(x => x.data().cursoId === m.cursoId && x.data().estado === 'Activo')) continue;

            const alumno = (await dbFirebase.collection('alumnos').doc(m.alumnoId).get()).data() || {};
            if (alumno.firebaseUid !== m.firebaseUid || alumno.estado !== 'Activo') continue;

            registros.push({
              id:d.id,
              alumno:alumno.nombre || 'Alumno',
              asignatura:m.asignatura || horario.asignatura || '',
              fecha:m.fecha || '',
              estado:m.estado || '',
              createdAt:m.createdAt || '',
              origen:'Facial experimental'
            });
          }
        }

        registros.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        return json(res,200,{ok:true,marcaciones:registros});
      }

if (req.method === 'POST' && req.url === '/api/academico/docente/ausencia') {
        const auth = getSession(req);
        if (!auth.ok) return json(res, 401, { ok: false, message: auth.message || 'Sesion no valida.' });
        if (auth.user.role !== 'Docente') return json(res, 403, { ok: false, message: 'Solo docentes pueden registrar ausencias.' });
        if (process.env.NODE_ENV === 'production' || process.env.ASISTIA_DEMO_MODE !== '1') {
          return json(res, 403, { ok: false, message: 'Operacion de prueba no disponible.' });
        }
        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, { ok: false, message: 'Autenticacion Firebase requerida.' });
        const uid = sesion.firebaseUid;
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : null;
        if (!perfil || perfil.activo !== true || perfil.rol !== 'Docente' || perfil.esDemo !== true ||
            !esCuentaDemoAutorizada(uid, auth.user.email, 'Docente')) {
          return json(res, 403, { ok: false, message: 'Docente de prueba no autorizado.' });
        }
        const idValido = /^[A-Za-z0-9_-]{1,128}$/;
        const docenteId = String(perfil.docenteId || '');
        if (!idValido.test(docenteId)) return json(res, 403, { ok: false, message: 'Vinculacion docente invalida.' });
        const docenteSnap = await dbFirebase.collection('docentes').doc(docenteId).get();
        if (!docenteSnap.exists || docenteSnap.data().firebaseUid !== uid ||
            docenteSnap.data().estado !== 'Activo' || docenteSnap.data().esDemo !== true) {
          return json(res, 403, { ok: false, message: 'Docente academico no autorizado.' });
        }
        const data = await body(req);
        const alumnoId = String(data.alumnoId || '').trim();
        const horarioId = String(data.horarioId || '').trim();
        const fecha = String(data.fecha || '').trim();
        const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
          !Number.isNaN(new Date(`${fecha}T12:00:00Z`).getTime()) &&
          new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) === fecha;
        if (!idValido.test(alumnoId) || !idValido.test(horarioId) || !fechaValida) {
          return json(res, 400, { ok: false, message: 'Datos de ausencia invalidos.' });
        }
        const [alumnoSnap, horarioSnap] = await Promise.all([
          dbFirebase.collection('alumnos').doc(alumnoId).get(),
          dbFirebase.collection('horarios').doc(horarioId).get()
        ]);
        if (!alumnoSnap.exists || alumnoSnap.data().estado !== 'Activo' || alumnoSnap.data().esDemo !== true) {
          return json(res, 400, { ok: false, message: 'Alumno de prueba no valido.' });
        }
        if (!horarioSnap.exists || horarioSnap.data().docenteId !== docenteId ||
            horarioSnap.data().estado !== 'Confirmada' || horarioSnap.data().esDemo !== true) {
          return json(res, 403, { ok: false, message: 'Horario no asignado al docente.' });
        }
        const horario = horarioSnap.data();
        const cursoId = String(horario.cursoId || '');
        if (!idValido.test(cursoId)) return json(res, 400, { ok: false, message: 'Curso invalido.' });
        const [cursoSnap, matriculaSnap] = await Promise.all([
          dbFirebase.collection('cursos').doc(cursoId).get(),
          dbFirebase.collection('matriculas').doc(`${alumnoId}_${cursoId}`).get()
        ]);
        if (!cursoSnap.exists || cursoSnap.data().estado !== 'Activo' || cursoSnap.data().esDemo !== true ||
            !matriculaSnap.exists || matriculaSnap.data().alumnoId !== alumnoId ||
            matriculaSnap.data().cursoId !== cursoId || matriculaSnap.data().estado !== 'Activo') {
          return json(res, 403, { ok: false, message: 'Alumno sin matricula activa en el curso.' });
        }
        const dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
        const dia = dias[new Date(`${fecha}T12:00:00Z`).getUTCDay()];
        const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (normalizar(horario.dia) !== normalizar(dia)) {
          return json(res, 400, { ok: false, message: 'La fecha no coincide con el horario.' });
        }
        const partes = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const parte = tipo => partes.find(p => p.type === tipo)?.value || '';
        const hoyChile = `${parte('year')}-${parte('month')}-${parte('day')}`;
        if (fecha !== hoyChile) {
          return json(res, 400, { ok: false, message: 'Solo se permite registrar ausencias del dia actual.' });
        }
        const id = `${alumnoId}_${horarioId}_${fecha}`;
        const ausenciaRef = dbFirebase.collection('ausencias').doc(id);
        const marcacionRef = dbFirebase.collection('marcaciones').doc(id);
        const auditoriaRef = dbFirebase.collection('auditoria').doc();
        const ahora = new Date().toISOString();
        const ausencia = {
          alumnoId, horarioId, cursoId, docenteId, fecha, estado: 'Pendiente',
          motivo: '', observaciones: '', esDemo: true, origen: 'DocenteDemo',
          alumno: alumnoSnap.data().nombre || '', rut: alumnoSnap.data().rut || '',
          codigo: cursoSnap.data().codigo || '', asignatura: cursoSnap.data().asignatura || '',
          seccion: cursoSnap.data().seccion || '', docente: docenteSnap.data().nombre || '',
          createdAt: ahora, updatedAt: ahora
        };
        try {
          await dbFirebase.runTransaction(async tx => {
            const [actualAusencia, actualMarcacion] = await Promise.all([
              tx.get(ausenciaRef), tx.get(marcacionRef)
            ]);
            if (actualAusencia.exists || actualMarcacion.exists) {
              const e = new Error('Ya existe asistencia o ausencia para esta clase y fecha.');
              e.status = 409;
              throw e;
            }
            tx.create(ausenciaRef, ausencia);
            tx.create(auditoriaRef, {
              usuarioId: String(auth.user.id || uid),
              usuario: String(auth.user.name || auth.user.email || ''),
              correoUsuario: String(auth.user.email || ''), rol: 'Docente',
              accion: 'Creacion', modulo: 'Ausencias academicas', registroId: id,
              detalle: { alumnoId, horarioId, cursoId, fecha, estado: 'Pendiente' },
              fecha: ahora, resultado: 'Correcto', esDemo: true
            });
          });
        } catch (e) {
          if (e.status === 409) return json(res, 409, { ok: false, message: e.message });
          throw e;
        }
        return json(res, 201, { ok: true, message: 'Ausencia registrada.', ausencia: { id, ...ausencia } });
      }
            // ASISTIA_187_14_53_SOLICITUD_JUSTIFICACION_ALUMNO
      if (req.method === 'POST' && req.url === '/api/academico/alumno/justificacion') {
        const auth = getSession(req);
        if (!auth.ok) return json(res, 401, { ok: false, message: auth.message || 'Sesion no valida.' });
        if (auth.user.role !== 'Alumno') return json(res, 403, { ok: false, message: 'Solo alumnos pueden solicitar justificaciones.' });
        if (process.env.NODE_ENV === 'production' || process.env.ASISTIA_DEMO_MODE !== '1') {
          return json(res, 403, { ok: false, message: 'Operacion de prueba no disponible.' });
        }
        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, { ok: false, message: 'Autenticacion Firebase requerida.' });
        const uid = sesion.firebaseUid;
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : null;
        if (!perfil || perfil.activo !== true || perfil.rol !== 'Alumno' || perfil.esDemo !== true ||
            !esCuentaDemoAutorizada(uid, auth.user.email, 'Alumno')) {
          return json(res, 403, { ok: false, message: 'Alumno de prueba no autorizado.' });
        }
        const alumnoId = String(perfil.alumnoId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId)) {
          return json(res, 403, { ok: false, message: 'Vinculacion de alumno invalida.' });
        }
        const alumnoSnap = await dbFirebase.collection('alumnos').doc(alumnoId).get();
        if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== uid ||
            alumnoSnap.data().estado !== 'Activo' || alumnoSnap.data().esDemo !== true) {
          return json(res, 403, { ok: false, message: 'Alumno academico no autorizado.' });
        }
        const data = await body(req);
        const ausenciaId = String(data.ausenciaId || '').trim();
        const motivo = String(data.motivo || '').trim();
        if (!/^[A-Za-z0-9_-]{1,400}$/.test(ausenciaId) || motivo.length < 10 || motivo.length > 500) {
          return json(res, 400, { ok: false, message: 'Indica una ausencia valida y un motivo de 10 a 500 caracteres.' });
        }
        const ausenciaRef = dbFirebase.collection('ausencias').doc(ausenciaId);
        const auditoriaRef = dbFirebase.collection('auditoria').doc();
        const ahora = new Date().toISOString();
        let resultado;
        try {
          resultado = await dbFirebase.runTransaction(async tx => {
            const snap = await tx.get(ausenciaRef);
            if (!snap.exists || snap.data().alumnoId !== alumnoId || snap.data().esDemo !== true) {
              const e = new Error('Ausencia no encontrada para este alumno.'); e.status = 404; throw e;
            }
            const actual = snap.data();
            if (actual.estado !== 'Pendiente') {
              const e = new Error('Esta ausencia ya fue resuelta.'); e.status = 409; throw e;
            }
            if (actual.solicitudJustificacion?.estado === 'Enviada') {
              const e = new Error('Esta ausencia ya tiene una solicitud enviada.'); e.status = 409; throw e;
            }
            const solicitud = { estado: 'Enviada', motivo, fechaSolicitud: ahora, alumnoUid: uid };
            tx.update(ausenciaRef, { solicitudJustificacion: solicitud, updatedAt: ahora });
            tx.create(auditoriaRef, {
              usuarioId: String(auth.user.id || uid), usuario: String(auth.user.name || auth.user.email || ''),
              correoUsuario: String(auth.user.email || ''), rol: 'Alumno', accion: 'Creacion',
              modulo: 'Solicitudes de justificacion', registroId: ausenciaId,
              detalle: { alumnoId, ausenciaId, accion: 'Solicitud enviada' },
              fecha: ahora, resultado: 'Correcto', esDemo: true
            });
            return solicitud;
          });
        } catch (e) {
          if (e.status === 404 || e.status === 409) return json(res, e.status, { ok: false, message: e.message });
          throw e;
        }
        return json(res, 201, { ok: true, message: 'Solicitud de justificacion enviada.', solicitud: resultado });
      }
      // ASISTIA_187_14_55_REVISION_DOCENTE
      if (req.method === 'POST' && req.url === '/api/academico/docente/revisar-justificacion') {
        const auth = getSession(req);
        if (!auth.ok) return json(res, 401, { ok: false, message: auth.message || 'Sesion no valida.' });
        if (auth.user.role !== 'Docente') return json(res, 403, { ok: false, message: 'Solo docentes pueden revisar justificaciones.' });
        if (process.env.NODE_ENV === 'production' || process.env.ASISTIA_DEMO_MODE !== '1') {
          return json(res, 403, { ok: false, message: 'Operacion de prueba no disponible.' });
        }
        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, { ok: false, message: 'Autenticacion Firebase requerida.' });
        const uid = sesion.firebaseUid;
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : null;
        if (!perfil || perfil.activo !== true || perfil.rol !== 'Docente' || perfil.esDemo !== true ||
            !esCuentaDemoAutorizada(uid, auth.user.email, 'Docente')) {
          return json(res, 403, { ok: false, message: 'Docente de prueba no autorizado.' });
        }
        const docenteId = String(perfil.docenteId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(docenteId)) {
          return json(res, 403, { ok: false, message: 'Vinculacion docente invalida.' });
        }
        const docenteSnap = await dbFirebase.collection('docentes').doc(docenteId).get();
        if (!docenteSnap.exists || docenteSnap.data().firebaseUid !== uid ||
            docenteSnap.data().estado !== 'Activo' || docenteSnap.data().esDemo !== true) {
          return json(res, 403, { ok: false, message: 'Docente academico no autorizado.' });
        }
        const data = await body(req);
        const ausenciaId = String(data.ausenciaId || '').trim();
        const decision = String(data.decision || '').trim();
        const observaciones = String(data.observaciones || '').trim();
        if (!/^[A-Za-z0-9_-]{1,400}$/.test(ausenciaId) ||
            !['Justificada', 'No justificada'].includes(decision) || observaciones.length > 500) {
          return json(res, 400, { ok: false, message: 'Datos de revision invalidos.' });
        }
        const ausenciaRef = dbFirebase.collection('ausencias').doc(ausenciaId);
        const auditoriaRef = dbFirebase.collection('auditoria').doc();
        const ahora = new Date().toISOString();
        try {
          await dbFirebase.runTransaction(async tx => {
            const ausenciaSnap = await tx.get(ausenciaRef);
            if (!ausenciaSnap.exists) {
              const e = new Error('Ausencia no encontrada.'); e.status = 404; throw e;
            }
            const ausencia = ausenciaSnap.data();
            if (ausencia.esDemo !== true || ausencia.estado !== 'Pendiente' ||
                ausencia.solicitudJustificacion?.estado !== 'Enviada') {
              const e = new Error('No existe una solicitud pendiente de revision.'); e.status = 409; throw e;
            }
            const horarioId = String(ausencia.horarioId || '');
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(horarioId)) {
              const e = new Error('Horario de la ausencia invalido.'); e.status = 403; throw e;
            }
            const horarioSnap = await tx.get(dbFirebase.collection('horarios').doc(horarioId));
            if (!horarioSnap.exists || horarioSnap.data().docenteId !== docenteId ||
                horarioSnap.data().esDemo !== true) {
              const e = new Error('Esta ausencia no pertenece a tus clases.'); e.status = 403; throw e;
            }
            const solicitud = ausencia.solicitudJustificacion;
            const revision = { ...solicitud, estado: 'Revisada', decision, observaciones,
              revisadoPor: uid, fechaRevision: ahora };
            tx.update(ausenciaRef, { estado: decision, solicitudJustificacion: revision,
              observaciones, updatedAt: ahora });
            tx.create(auditoriaRef, {
              usuarioId: String(auth.user.id || uid),
              usuario: String(auth.user.name || auth.user.email || ''),
              correoUsuario: String(auth.user.email || ''), rol: 'Docente',
              accion: 'Modificacion', modulo: 'Solicitudes de justificacion',
              registroId: ausenciaId,
              detalle: { ausenciaId, alumnoId: ausencia.alumnoId, horarioId,
                estadoAnterior: 'Pendiente', estadoNuevo: decision },
              fecha: ahora, resultado: 'Correcto', esDemo: true
            });
          });
        } catch (e) {
          if ([403, 404, 409].includes(e.status)) {
            return json(res, e.status, { ok: false, message: e.message });
          }
          throw e;
        }
        return json(res, 200, { ok: true, message: 'Justificacion revisada correctamente.',
          ausenciaId, estado: decision });
      }
// ASISTIA_187_14_19_API_ASISTENCIA_DOCENTE
      if (
        req.method === 'POST' &&
        req.url === '/api/academico/docente/asistencia'
      ) {
        const auth = getSession(req);

        if (!auth.ok) {
          return json(res, 401, {
            ok: false,
            message: auth.message || 'Sesion no valida.'
          });
        }

        if (auth.user.role !== 'Docente') {
          return json(res, 403, {
            ok: false,
            message: 'Solo un docente puede registrar asistencia.'
          });
        }

        const encabezado = String(req.headers.authorization || '');
        const token = encabezado.startsWith('Bearer ')
          ? encabezado.slice(7).trim()
          : '';
        const sesion = sessions.get(token);

        if (!sesion?.firebaseUid) {
          return json(res, 401, {
            ok: false,
            message: 'Se requiere autenticacion Firebase.'
          });
        }

        if (
          process.env.NODE_ENV === 'production' ||
          process.env.ASISTIA_DEMO_MODE !== '1'
        ) {
          return json(res, 403, {
            ok: false,
            message: 'Registro de prueba no disponible en este entorno.'
          });
        }

        const uid = sesion.firebaseUid;
        const perfilSnap = await dbFirebase
          .collection('usuarios')
          .doc(uid)
          .get();

        const perfil = perfilSnap.exists ? perfilSnap.data() : null;

        if (
          !perfil ||
          perfil.activo !== true ||
          perfil.rol !== 'Docente' ||
          perfil.esDemo !== true ||
          !esCuentaDemoAutorizada(uid, auth.user.email, 'Docente')
        ) {
          return json(res, 403, {
            ok: false,
            message: 'Docente de prueba no autorizado.'
          });
        }

        const docenteId = String(perfil.docenteId || '');

        if (!/^[A-Za-z0-9_-]{1,128}$/.test(docenteId)) {
          return json(res, 403, {
            ok: false,
            message: 'Vinculacion docente invalida.'
          });
        }

        const docenteSnap = await dbFirebase
          .collection('docentes')
          .doc(docenteId)
          .get();

        if (
          !docenteSnap.exists ||
          docenteSnap.data().firebaseUid !== uid ||
          docenteSnap.data().estado !== 'Activo' ||
          docenteSnap.data().esDemo !== true
        ) {
          return json(res, 403, {
            ok: false,
            message: 'Docente academico no autorizado.'
          });
        }

        const data = await body(req);

        const alumnoId = String(data.alumnoId || '').trim();
        const horarioId = String(data.horarioId || '').trim();
        const fecha = String(data.fecha || '').trim();
        const estado = String(data.estado || '').trim();

        const idValido = /^[A-Za-z0-9_-]{1,128}$/;
        const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
          !Number.isNaN(new Date(`${fecha}T12:00:00Z`).getTime()) &&
          new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) === fecha;

        if (
          !idValido.test(alumnoId) ||
          !idValido.test(horarioId) ||
          !fechaValida ||
          !['Presente', 'Atrasado'].includes(estado)
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Datos de asistencia invalidos.'
          });
        }

        const [alumnoSnap, horarioSnap] = await Promise.all([
          dbFirebase.collection('alumnos').doc(alumnoId).get(),
          dbFirebase.collection('horarios').doc(horarioId).get()
        ]);

        if (
          !alumnoSnap.exists ||
          alumnoSnap.data().estado !== 'Activo' ||
          alumnoSnap.data().esDemo !== true
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Alumno de prueba no valido.'
          });
        }

        if (
          !horarioSnap.exists ||
          horarioSnap.data().docenteId !== docenteId ||
          horarioSnap.data().estado !== 'Confirmada' ||
          horarioSnap.data().esDemo !== true
        ) {
          return json(res, 403, {
            ok: false,
            message: 'Este horario no esta asignado al docente.'
          });
        }

        const horario = horarioSnap.data();
        const cursoId = String(horario.cursoId || '');

        if (!idValido.test(cursoId)) {
          return json(res, 400, {
            ok: false,
            message: 'Curso invalido.'
          });
        }

        const [cursoSnap, matriculaSnap] = await Promise.all([
          dbFirebase.collection('cursos').doc(cursoId).get(),
          dbFirebase.collection('matriculas')
            .doc(`${alumnoId}_${cursoId}`).get()
        ]);

        if (
          !cursoSnap.exists ||
          cursoSnap.data().estado !== 'Activo' ||
          cursoSnap.data().esDemo !== true ||
          !matriculaSnap.exists ||
          matriculaSnap.data().alumnoId !== alumnoId ||
          matriculaSnap.data().cursoId !== cursoId ||
          matriculaSnap.data().estado !== 'Activo'
        ) {
          return json(res, 403, {
            ok: false,
            message: 'El alumno no tiene una matricula activa en el curso.'
          });
        }

        const dias = [
          'Domingo', 'Lunes', 'Martes', 'Miercoles',
          'Jueves', 'Viernes', 'Sabado'
        ];

        const diaReal = dias[
          new Date(`${fecha}T12:00:00Z`).getUTCDay()
        ];

        const normalizarDia = valor =>
          String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        if (normalizarDia(horario.dia) !== normalizarDia(diaReal)) {
          return json(res, 400, {
            ok: false,
            message: 'La fecha no coincide con el dia del horario.'
          });
        }

        const fechaHoyChile = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santiago',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());

        if (fecha !== fechaHoyChile) {
          return json(res, 400, {
            ok: false,
            message: 'Por ahora solo se permite registrar asistencia del dia actual.'
          });
        }

        const horaChile = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Santiago',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23'
        }).format(new Date());

        const id = `${alumnoId}_${horarioId}_${fecha}`;
        const marcacionRef = dbFirebase.collection('marcaciones').doc(id);
        const ausenciaRef = dbFirebase.collection('ausencias').doc(id);
        const auditoriaRef = dbFirebase.collection('auditoria').doc();

        const ahora = new Date().toISOString();

        const marcacion = {
          alumnoId,
          horarioId,
          cursoId,
          docenteId,
          fecha,
          hora: horaChile,
          estado,
          origen: 'DocenteDemo',
          esDemo: true,
          alumno: alumnoSnap.data().nombre || '',
          rut: alumnoSnap.data().rut || '',
          codigo: cursoSnap.data().codigo || '',
          asignatura: cursoSnap.data().asignatura || '',
          seccion: cursoSnap.data().seccion || '',
          docente: docenteSnap.data().nombre || '',
          sala: horario.sala || '',
          createdAt: ahora
        };

        try {
          await dbFirebase.runTransaction(async tx => {
            const [marcacionActual, ausenciaActual] =
              await Promise.all([
                tx.get(marcacionRef),
                tx.get(ausenciaRef)
              ]);

            if (marcacionActual.exists || ausenciaActual.exists) {
              const error = new Error(
                'Ya existe una marcacion o ausencia para esta clase y fecha.'
              );
              error.status = 409;
              throw error;
            }

            tx.create(marcacionRef, marcacion);

            tx.create(auditoriaRef, {
              usuarioId: String(auth.user.id || uid),
              usuario: String(auth.user.name || auth.user.email || ''),
              correoUsuario: String(auth.user.email || ''),
              rol: 'Docente',
              accion: 'Creacion',
              modulo: 'Asistencia academica',
              registroId: id,
              detalle: { alumnoId, horarioId, cursoId, fecha, estado },
              fecha: ahora,
              resultado: 'Correcto',
              esDemo: true
            });
          });
        } catch (error) {
          if (error.status === 409) {
            return json(res, 409, {
              ok: false,
              message: error.message
            });
          }
          throw error;
        }

        return json(res, 201, {
          ok: true,
          message: 'Asistencia registrada correctamente.',
          marcacion: { id, ...marcacion }
        });
      }
// ASISTIA_187_14_64_SPRINT2_SOLICITAR_PIN
      if (req.method === 'POST' && req.url === '/api/academico/alumno/pin-solicitar') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res, 401, {ok:false, message:'Sesion no valida.'});
        if (acceso.user.role !== 'Alumno') return json(res, 403, {ok:false, message:'Solo alumnos pueden solicitar PIN.'});
        const sesion = acceso.session;
        if (!sesion?.firebaseUid) return json(res, 401, {ok:false, message:'Se requiere sesion Firebase.'});
        const uid = String(sesion.firebaseUid);
        const perfil = await dbFirebase.collection('usuarios').doc(uid).get();
        if (!perfil.exists || perfil.data().rol !== 'Alumno' || perfil.data().activo !== true)
          return json(res, 403, {ok:false, message:'Cuenta de alumno no autorizada.'});
        const alumnoId = String(perfil.data().alumnoId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))
          return json(res, 403, {ok:false, message:'Cuenta sin alumno vinculado.'});
        const alumno = await dbFirebase.collection('alumnos').doc(alumnoId).get();
        if (!alumno.exists || alumno.data().firebaseUid !== uid || alumno.data().estado !== 'Activo')
          return json(res, 403, {ok:false, message:'Vinculacion del alumno no valida.'});

        const {randomInt, randomBytes: bytes, scryptSync: derive} = await import('node:crypto');
        const pin = String(randomInt(0, 1000000)).padStart(6, '0');
        const salt = bytes(16).toString('hex');
        const hash = derive(pin, salt, 32).toString('hex');
        const ref = dbFirebase.collection('pines_temporales').doc(uid);
        const ahora = Date.now();
        const vence = new Date(ahora + 5 * 60 * 1000).toISOString();
        try {
          await dbFirebase.runTransaction(async tx => {
            const previo = await tx.get(ref);
            const d = previo.exists ? previo.data() : {};
            const ultimo = Date.parse(d.solicitadoAt || '') || 0;
            if (ahora - ultimo < 60000) {
              const error = new Error('Espera 60 segundos antes de solicitar otro PIN.');
              error.status = 429;
              throw error;
            }
            tx.set(ref, {
              alumnoId, firebaseUid: uid, salt, hash,
              solicitadoAt: new Date(ahora).toISOString(),
              expiraAt: vence, usado: false, intentos: 0,
              esDemo: Boolean(alumno.data().esDemo)
            });
          });
        } catch (error) {
          if (error.status === 429) return json(res, 429, {ok:false, message:error.message});
          throw error;
        }
        await dbFirebase.collection('auditoria').add({
          accion:'Creacion', modulo:'PIN temporal', registroId:uid,
          usuarioId:uid, correoUsuario:String(acceso.user.email || ''),
          rol:'Alumno', detalle:{alumnoId, expiraAt:vence, evento:'Solicitud PIN'},
          fecha:new Date().toISOString(), resultado:'Correcto',
          esDemo:Boolean(alumno.data().esDemo)
        });
        return json(res, 201, {
          ok:true, pin, expiraAt:vence,
          message:'PIN generado. Valido durante 5 minutos. No lo compartas.'
        });
      }

      // ASISTIA_187_14_78_VALIDACION_PIN_PRUEBA
      // Solo administracion y datos demo; consume PIN pero NO registra asistencia.
      if (req.method === 'POST' && req.url === '/api/academico/totem/pin-verificar-prueba') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res, 401, {ok:false, message:'Sesion no valida.'});
        if (acceso.user.role !== 'Administradora' || !acceso.session?.firebaseUid)
          return json(res, 403, {ok:false, message:'Solo administracion Firebase puede ejecutar esta prueba.'});
        const datos = await body(req);
        const uidAlumno = String(datos?.firebaseUid || '');
        const horarioId = String(datos?.horarioId || '');
        const pin = String(datos?.pin || '');
        const idValido = /^[A-Za-z0-9_-]{1,128}$/;
        if (!idValido.test(uidAlumno) || !idValido.test(horarioId) || !/^\d{6}$/.test(pin))
          return json(res, 400, {ok:false, message:'Datos de prueba invalidos.'});
        const [perfilSnap, horarioSnap] = await Promise.all([
          dbFirebase.collection('usuarios').doc(uidAlumno).get(),
          dbFirebase.collection('horarios').doc(horarioId).get()
        ]);
        const perfil = perfilSnap.exists ? perfilSnap.data() : {};
        const horario = horarioSnap.exists ? horarioSnap.data() : {};
        const alumnoId = String(perfil.alumnoId || '');
        const cursoId = String(horario.cursoId || '');
        if (!perfilSnap.exists || perfil.rol !== 'Alumno' || perfil.activo !== true ||
            !idValido.test(alumnoId) || !idValido.test(cursoId) ||
            !horarioSnap.exists || horario.estado !== 'Confirmada' || horario.esDemo !== true)
          return json(res, 403, {ok:false, message:'Prueba no autorizada para este alumno u horario.'});
        const [alumnoSnap, cursoSnap, matriculaSnap] = await Promise.all([
          dbFirebase.collection('alumnos').doc(alumnoId).get(),
          dbFirebase.collection('cursos').doc(cursoId).get(),
          dbFirebase.collection('matriculas').doc(`${alumnoId}_${cursoId}`).get()
        ]);
        if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== uidAlumno ||
            alumnoSnap.data().estado !== 'Activo' || alumnoSnap.data().esDemo !== true ||
            !cursoSnap.exists || cursoSnap.data().estado !== 'Activo' || cursoSnap.data().esDemo !== true ||
            !matriculaSnap.exists || matriculaSnap.data().alumnoId !== alumnoId ||
            matriculaSnap.data().cursoId !== cursoId || matriculaSnap.data().estado !== 'Activo')
          return json(res, 403, {ok:false, message:'Prueba restringida a matriculas demo activas.'});
        const pinRef = dbFirebase.collection('pines_temporales').doc(uidAlumno);
        const eventoRef = dbFirebase.collection('auditoria').doc();
        const resultado = await dbFirebase.runTransaction(async tx => {
          const snap = await tx.get(pinRef);
          const dato = snap.exists ? snap.data() : {};
          const intentos = Number(dato.intentos || 0);
          const vigente = snap.exists && dato.firebaseUid === uidAlumno &&
            dato.alumnoId === alumnoId && dato.usado === false && dato.esDemo === true &&
            Number.isFinite(Date.parse(dato.expiraAt)) && Date.parse(dato.expiraAt) > Date.now() &&
            intentos < 5 && /^[a-f0-9]{32}$/.test(String(dato.salt || '')) &&
            /^[a-f0-9]{64}$/.test(String(dato.hash || ''));
          let valido = false;
          if (vigente) {
            const calculado = scryptSync(pin, dato.salt, 32);
            valido = timingSafeEqual(calculado, Buffer.from(dato.hash, 'hex'));
            tx.update(pinRef, valido
              ? {usado:true, usadoAt:new Date().toISOString(), usadoEnHorarioId:horarioId}
              : {intentos:intentos + 1});
          }
          tx.create(eventoRef, {
            accion:'Verificacion PIN demo', modulo:'Totem asistencia',
            registroId:horarioId, usuarioId:String(acceso.session.firebaseUid),
            rol:'Administradora', fecha:new Date().toISOString(),
            resultado:valido ? 'Correcto' : 'Rechazado', esDemo:true,
            detalle:{alumnoId, horarioId, evento:'Prueba sin marcacion', motivo:vigente ? (valido ? 'Valido' : 'PIN incorrecto') : 'PIN no disponible'}
          });
          return valido;
        });
        return json(res, resultado ? 200 : 403, {
          ok:resultado, verificado:resultado, asistenciaRegistrada:false,
          message:resultado
            ? 'PIN demo validado y consumido. No se registro asistencia.'
            : 'PIN invalido, vencido, bloqueado o ya utilizado.'
        });
      }

      if (req.method === 'POST' && req.url === '/api/academico/alumno/asistencia-facial/registrar') { const acceso = getSession(req); if (!acceso.ok) return json(res,401,{ok:false,message:'Sesion invalida.'}); if (acceso.user.role !== 'Alumno') return json(res,403,{ok:false,message:'Solo alumnos.'}); const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); const sesion = sessions.get(token); if (!sesion?.firebaseUid) return json(res,401,{ok:false,message:'Se requiere sesion Firebase.'}); const uid = String(sesion.firebaseUid); const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get(); const perfil = perfilSnap.exists ? perfilSnap.data() : {}; const alumnoId = String(perfil.alumnoId || ''); if (!perfilSnap.exists || perfil.activo !== true || perfil.rol !== 'Alumno' || !/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId)) return json(res,403,{ok:false,message:'Cuenta academica no autorizada.'}); const alumnoSnap = await dbFirebase.collection('alumnos').doc(alumnoId).get(); if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== uid || alumnoSnap.data().estado !== 'Activo') return json(res,403,{ok:false,message:'Vinculacion academica invalida.'}); const datos = await body(req); const modoPrueba = datos?.modoPrueba === true; /* ASISTIA_PASO157_MODO_PRUEBA */ const horarioId = String(datos?.horarioId || ''); if (!/^[A-Za-z0-9_-]{1,128}$/.test(horarioId)) return json(res,400,{ok:false,message:'Horario invalido.'}); const horarioSnap = await dbFirebase.collection('horarios').doc(horarioId).get(); if (!horarioSnap.exists || horarioSnap.data().estado !== 'Confirmada') return json(res,403,{ok:false,message:'Horario no autorizado.'}); const cursoId = String(horarioSnap.data().cursoId || ''); if (!/^[A-Za-z0-9_-]{1,128}$/.test(cursoId)) return json(res,403,{ok:false,message:'Curso invalido.'}); const matriculaSnap = await dbFirebase.collection('matriculas').doc(alumnoId + '_' + cursoId).get(); if (!matriculaSnap.exists || matriculaSnap.data().estado !== 'Activo' || matriculaSnap.data().alumnoId !== alumnoId || matriculaSnap.data().cursoId !== cursoId) return json(res,403,{ok:false,message:'El alumno no tiene matricula activa en esta clase.'}); const ahoraChile = new Date(); const partesChile = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ahoraChile).filter(x=>x.type!=='literal').map(x=>[x.type,x.value])); const diasChile = {sunday:'domingo',monday:'lunes',tuesday:'martes',wednesday:'miercoles',thursday:'jueves',friday:'viernes',saturday:'sabado'}; const normalizarDia = x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); const horario = horarioSnap.data(); if(!modoPrueba && normalizarDia(horario.dia)!==diasChile[String(partesChile.weekday).toLowerCase()]) return json(res,403,{ok:false,message:'La clase no corresponde al dia de hoy.'}); const horaActual = String(partesChile.hour).padStart(2,'0')+':'+String(partesChile.minute).padStart(2,'0'); if(!modoPrueba && (!/^\d{2}:\d{2}$/.test(String(horario.inicio||'')) || !/^\d{2}:\d{2}$/.test(String(horario.fin||'')) || horaActual<String(horario.inicio) || horaActual>String(horario.fin))) return json(res,403,{ok:false,message:'La clase esta fuera del horario autorizado.'}); const consentimientoSnap = await dbFirebase.collection('consentimientos_biometricos').doc(uid).get(); const consentimiento = consentimientoSnap.exists ? consentimientoSnap.data() : {}; const correoReconocimiento = String(perfil.email || perfil.correo || alumnoSnap.data().email || '').trim().toLowerCase();

        const versionPilotoValida =
          (correoReconocimiento === 'usuario18@example.com' &&
           consentimiento.version === 'PILOTO-VOLUNTARIO-2026-11-23-v1') ||
          (correoReconocimiento !== 'usuario18@example.com' &&
           process.env.ASISTIA_PILOTO_GRUPAL === 'yes' &&
           consentimiento.version === 'PILOTO-GRUPAL-v2' &&
           consentimiento.mayorEdadConfirmada === true);

        const consentimientoVigente =
          modoPrueba === true &&
          alumnoSnap.data().esDemo === true &&
          consentimiento.estado === 'Otorgado' &&
          consentimiento.firebaseUid === uid &&
          consentimiento.alumnoId === alumnoId &&
          versionPilotoValida &&
          await pilotoAutorizado(dbFirebase, uid, perfil, alumnoSnap.data()); if(!consentimientoVigente) return json(res,403,{ok:false,message:'Se requiere consentimiento biometrico definitivo y vigente.'}); const operacion = String(datos?.operacion || '');
const esDesafio = ['crearDesafio','comprobarMovimiento'].includes(operacion);

if (esDesafio && (!modoPrueba ||
    alumnoSnap.data().esDemo !== true ||
    String(perfil.email || perfil.correo || alumnoSnap.data().email || '').trim().toLowerCase() !== 'usuario18@example.com')) {
  return json(res,403,{ok:false,message:'Desafio disponible solo para el piloto personal.'});
}

const imagen = String(datos?.imagen || '');
if (!esDesafio && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imagen)) {
  return json(res,400,{ok:false,message:'Se requiere una captura facial JPEG.'});
}
const correoAlumno = String(perfil.email || perfil.correo || alumnoSnap.data().email || '').trim().toLowerCase();
if (!correoAlumno) return json(res,403,{ok:false,message:'No se encontro el correo academico del alumno.'});
const laboratorioUrl = String(process.env.ASISTIA_BIOMETRIA_URL || 'http://127.0.0.1:5180').replace(/\/+$/,'');
const claveInterna = String(process.env.ASISTIA_BIOMETRIA_SHARED_SECRET || '');
if (claveInterna.length < 32) return json(res,503,{ok:false,message:'Falta configurar la comunicacion segura con el laboratorio.'});
try {
  const respuestaFacial = await fetch(laboratorioUrl + '/api/internal/recognize', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Asistia-Internal-Token':claveInterna},
    body:JSON.stringify(esDesafio ? {
      email:correoAlumno,
      operacion,
      desafioId:datos.desafioId,
      imagenInicial:datos.imagenInicial,
      imagenFinal:datos.imagenFinal
    } : {
      email:correoAlumno,
      image:imagen
    }),
    signal:AbortSignal.timeout(20000)
  });
  const resultadoFacial = await respuestaFacial.json().catch(()=>({}));

  if (!respuestaFacial.ok) {
    return json(res, respuestaFacial.status, {
      ok:false,
      comparacion:resultadoFacial,
      asistenciaRegistrada:false,
      message:resultadoFacial.message || resultadoFacial.error || ('Error del laboratorio facial: HTTP ' + respuestaFacial.status)
    });
  }

    // ASISTIA_PASO311_PAD
  if (modoPrueba && !esDesafio) {
    if (resultadoFacial.pruebaDeVidaEvaluada !== true ||
        resultadoFacial.modeloPruebaDeVida !== 'MiniFASNetV2') {
      return json(res,503,{
        ok:false,
        asistenciaRegistrada:false,
        marcacionPilotoRegistrada:false,
        message:'Evaluacion facial pasiva no disponible.'
      });
    }

    if (resultadoFacial.pruebaDeVidaCandidata !== true) {
      return json(res,422,{
        ok:false,
        asistenciaRegistrada:false,
        marcacionPilotoRegistrada:false,
        message:'No se pudo validar la captura facial. Intenta nuevamente con iluminacion uniforme.'
      });
    }
  }

  // ASISTIA_MARCACION_PILOTO_235
  if (modoPrueba &&
      !esDesafio &&
      alumnoSnap.data().esDemo === true &&
      (await pilotoAutorizado(dbFirebase, uid, perfil, alumnoSnap.data())) &&
      resultadoFacial.coincidenciaFacial === true &&
      Number.isFinite(resultadoFacial.similitud) &&
      resultadoFacial.similitud >= 0.50) {

    const fecha = new Intl.DateTimeFormat('en-CA', {
      timeZone:'America/Santiago',
      year:'numeric', month:'2-digit', day:'2-digit'
    }).format(new Date());

    const id = `${alumnoId}_${horarioId}_${fecha}`;
    const ref = dbFirebase.collection('marcaciones_piloto').doc(id);

    await dbFirebase.runTransaction(async tx => {
      const existente = await tx.get(ref);

      if (!existente.exists) {
        tx.create(ref, {
          alumnoId,
          horarioId,
          cursoId,
          firebaseUid:uid,
          fecha,
          asignatura:horario.asignatura || '',
          estado:'Presente',
          origen:'Facial experimental',
          similitudFacial:resultadoFacial.similitud,
          createdAt:new Date().toISOString(),
          esDemo:true,
          asistenciaOficial:false,
          pruebaDeVidaEvaluada:true,
          pruebaDeVidaCandidata:true,
          modeloPruebaDeVida:'MiniFASNetV2',
          pruebaDeVidaValidada:false
        });
      }
    });

    return json(res,200,{
      ok:true,
      modoPrueba:true,
      marcacionPilotoRegistrada:true,
      asistenciaRegistrada:false,
      comparacion:resultadoFacial,
      message:'Asistencia de prueba registrada en Firebase.'
    });
  }

if (modoPrueba) {
    return json(res, 200, {
      ok:true,
      modoPrueba:true,
      comparacion:resultadoFacial,
      asistenciaRegistrada:false,
      message:'Comparacion facial de prueba completada. No se registro asistencia.'
    });
  }
  // Nunca registrar asistencia sin identidad y prueba de vida verificadas.
  if (resultadoFacial.identidadVerificada !== true ||
      resultadoFacial.pruebaDeVidaValidada !== true) {
    return json(res, 403, {
      ok:false,
      comparacion:resultadoFacial,
      identidadVerificada:resultadoFacial.identidadVerificada === true,
      pruebaDeVidaValidada:resultadoFacial.pruebaDeVidaValidada === true,
      asistenciaRegistrada:false,
      message:'Comparacion recibida, pero falta validar identidad y prueba de vida. No se registro asistencia.'
    });
  }

  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Santiago',
    year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());

  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone:'America/Santiago',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).format(new Date());

  const identificador = `${alumnoId}_${horarioId}_${fecha}`;
  const referencia = dbFirebase.collection('marcaciones').doc(identificador);

  const marcacion = {
    alumnoId,
    horarioId,
    fecha,
    hora,
    estado:'Presente',
    origen:'Facial',
    alumno:alumnoSnap.data().nombre || '',
    rut:alumnoSnap.data().rut || '',
    cursoId:horario.cursoId || '',
    docenteId:horario.docenteId || '',
    codigo:horario.codigo || '',
    asignatura:horario.asignatura || '',
    seccion:horario.seccion || '',
    docente:horario.docente || '',
    sala:horario.sala || '',
    createdAt:new Date().toISOString(),
    comparacionModelo:resultadoFacial.modelo || '',
    similitudFacial:resultadoFacial.similitud
  };

  const registrada = await dbFirebase.runTransaction(async tx => {
    const existente = await tx.get(referencia);
    if (existente.exists) return false;
    tx.create(referencia, marcacion);
    return true;
  });

  if (!registrada) {
    return json(res, 409, {
      ok:false,
      asistenciaRegistrada:false,
      message:'La asistencia de esta clase ya estaba registrada.'
    });
  }

  return json(res, 200, {
    ok:true,
    alumnoId,
    horarioId,
    fecha,
    hora,
    comparacion:resultadoFacial,
    identidadVerificada:true,
    pruebaDeVidaValidada:true,
    asistenciaRegistrada:true,
    message:'Asistencia registrada correctamente.'
  });
} catch {
  return json(res,503,{ok:false,message:'No fue posible conectar con el laboratorio biometrico.'});
} }
      // ASISTIA_FACIAL_PASO2_PREPARACION_SOLO_LECTURA
      // Consulta academica autenticada. No captura rostros, no registra asistencia.
            // ASISTIA_PASO287_HISTORIAL_PILOTO
      if (req.method === 'GET' && req.url === '/api/academico/alumno/marcaciones-piloto') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res,401,{ok:false,message:'Sesion invalida.'});
        if (acceso.user.role !== 'Alumno') return json(res,403,{ok:false,message:'Solo alumnos.'});

        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res,401,{ok:false,message:'Sesion Firebase requerida.'});

        const uid = String(sesion.firebaseUid);
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.data() || {};
        const alumnoId = String(perfil.alumnoId || '');

        if (perfil.activo !== true || perfil.rol !== 'Alumno' || !/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))
          return json(res,403,{ok:false,message:'Cuenta no autorizada.'});

        const alumno = await dbFirebase.collection('alumnos').doc(alumnoId).get();
        if (!alumno.exists || alumno.data().firebaseUid !== uid || alumno.data().estado !== 'Activo')
          return json(res,403,{ok:false,message:'Vinculacion invalida.'});

        const snap = await dbFirebase.collection('marcaciones_piloto').where('firebaseUid','==',uid).get();

        const marcaciones = snap.docs
          .filter(d => d.data().alumnoId === alumnoId && d.data().esDemo === true && d.data().asistenciaOficial === false)
          .map(d => {
            const m = d.data();
            return {
              id: d.id,
              asignatura: m.asignatura || '',
              fecha: m.fecha || '',
              estado: m.estado || '',
              origen: 'Facial experimental',
              createdAt: m.createdAt || ''
            };
          })
          .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

        return json(res,200,{ok:true,marcaciones});
      }

      if (req.method === 'GET' && req.url === '/api/academico/alumno/asistencia-facial/preparacion') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res, 401, {ok:false, message:'Sesion invalida.'});
        if (acceso.user.role !== 'Alumno') return json(res, 403, {ok:false, message:'Solo alumnos.'});
        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, {ok:false, message:'Se requiere sesion Firebase.'});
        const uid = String(sesion.firebaseUid);
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : {};
        const alumnoId = String(perfil.alumnoId || '');
        if (!perfilSnap.exists || perfil.activo !== true || perfil.rol !== 'Alumno' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))
          return json(res, 403, {ok:false, message:'Cuenta academica no autorizada.'});
        const alumnoSnap = await dbFirebase.collection('alumnos').doc(alumnoId).get();
        if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== uid || alumnoSnap.data().estado !== 'Activo')
          return json(res, 403, {ok:false, message:'Vinculacion academica invalida.'});
        const hoy = new Intl.DateTimeFormat('en-CA', {
          timeZone:'America/Santiago', year:'numeric', month:'2-digit', day:'2-digit'
        }).format(new Date());
        const dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
        const dia = dias[new Date(`${hoy}T12:00:00Z`).getUTCDay()];
        const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        const matriculasSnap = await dbFirebase.collection('matriculas').where('alumnoId','==',alumnoId).get();
        const cursoIds = new Set(matriculasSnap.docs.filter(d => d.data().estado === 'Activo').map(d => String(d.data().cursoId || '')));
        const horariosSnap = await dbFirebase.collection('horarios').get();
        const candidatos = horariosSnap.docs.filter(d => {
          const h = d.data();
          return h.estado === 'Confirmada' && cursoIds.has(String(h.cursoId || ''));
        });
        const horaPartes = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
        const horaActual = `${horaPartes.hour}:${horaPartes.minute}`;
        // ASISTIA_PASO153_NOMBRES_REALES
        const cursosSnap = await Promise.all(
          [...cursoIds].filter(Boolean).map(id => dbFirebase.collection('cursos').doc(id).get())
        );
        const nombresCursos = new Map(cursosSnap.filter(d => d.exists).map(d => {
          const curso = d.data();
          return [d.id, String(curso.nombre || curso.nombreCurso || curso.asignatura || curso.nombreAsignatura || '').trim()];
        }));

        const revisados = await Promise.all(candidatos.map(async d => {
          const h = d.data();
          const id = `${alumnoId}_${d.id}_${hoy}`;
          const registro = await dbFirebase.collection('marcaciones').doc(id).get();
          const dentroHorario = normalizar(h.dia) === normalizar(dia) &&
            /^\d{2}:\d{2}$/.test(String(h.inicio || '')) &&
            /^\d{2}:\d{2}$/.test(String(h.fin || '')) &&
            horaActual >= h.inicio && horaActual <= h.fin;
          return {horarioId:d.id, cursoId:String(h.cursoId), nombreCurso:nombresCursos.get(String(h.cursoId)) || String(h.cursoId), dia:h.dia,
            inicio:h.inicio || null, fin:h.fin || null,
            asistenciaExistente:registro.exists,
            disponibleParaMarcacion:!registro.exists && dentroHorario};
        }));
        return json(res, 200, {ok:true, fecha:hoy, dia, alumnoId,
          horarios:revisados, reconocimientoFacialHabilitado:false,
          asistenciaRegistrada:false,
          message:'Consulta academica preparada. La marcacion facial permanece bloqueada hasta validar identidad, prueba de vida y consentimiento definitivo.'});
      }
      // ASISTIA_FACIAL_PASO4_ESTADO_LAB
      // Solo consulta la disponibilidad del laboratorio. No envia imagenes ni datos personales.
      if (req.method === 'GET' && req.url === '/api/academico/alumno/asistencia-facial/laboratorio') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res, 401, {ok:false, message:'Sesion invalida.'});
        if (acceso.user.role !== 'Alumno') return json(res, 403, {ok:false, message:'Solo alumnos.'});
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, {ok:false, message:'Se requiere sesion Firebase.'});
        const perfilSnap = await dbFirebase.collection('usuarios').doc(String(sesion.firebaseUid)).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : {};
        if (!perfilSnap.exists || perfil.activo !== true || perfil.rol !== 'Alumno' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(String(perfil.alumnoId || '')))
          return json(res, 403, {ok:false, message:'Perfil academico no autorizado.'});
        const alumnoSnap = await dbFirebase.collection('alumnos').doc(String(perfil.alumnoId)).get();
        if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== sesion.firebaseUid || alumnoSnap.data().estado !== 'Activo')
          return json(res, 403, {ok:false, message:'Alumno no vinculado o inactivo.'});
        const { consultarLaboratorioFacial } = await import('./asistenciaFacialLab.js');
        const lab = await consultarLaboratorioFacial(process.env.ASISTIA_FACIAL_LAB_URL);
        return json(res, 200, {ok:true, laboratorio:lab,
          reconocimientoFacialHabilitado:false, asistenciaRegistrada:false,
          message:'Diagnostico de integracion. El reconocimiento y las marcaciones permanecen bloqueados.'});
      }
      // ASISTIA_187_14_73_ESTADO_ENROLAMIENTO_SEGURO
      // Endpoint solo de lectura. NO inicia camara, NO genera plantillas faciales.
      if (req.method === 'GET' && req.url === '/api/academico/alumno/estado-enrolamiento') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res, 401, {ok:false, message:'Sesion invalida.'});
        if (acceso.user.role !== 'Alumno') return json(res, 403, {ok:false, message:'Solo alumnos.'});
        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, {ok:false, message:'Se requiere sesion Firebase.'});
        const uid = String(sesion.firebaseUid);
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : {};
        if (!perfilSnap.exists || perfil.activo !== true || perfil.rol !== 'Alumno')
          return json(res, 403, {ok:false, message:'Cuenta no autorizada.'});
        const alumnoId = String(perfil.alumnoId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))
          return json(res, 403, {ok:false, message:'Alumno no vinculado.'});
        const alumnoSnap = await dbFirebase.collection('alumnos').doc(alumnoId).get();
        if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== uid || alumnoSnap.data().estado !== 'Activo')
          return json(res, 403, {ok:false, message:'Vinculacion invalida.'});
        const consentimientoSnap = await dbFirebase.collection('consentimientos_biometricos').doc(uid).get();
        const consentimiento = consentimientoSnap.exists ? consentimientoSnap.data() : {};
        const version = String(consentimiento.version || '');
        const estado = String(consentimiento.estado || 'No otorgado');
        return json(res, 200, {
          ok:true,
          habilitado:false,
          camaraHabilitada:false,
          capturaFacialHabilitada:false,
          almacenamientoBiometricoHabilitado:false,
          consentimiento:{estado, version, esBorrador:!version || version.startsWith('BORRADOR')},
          requisitosPendientes:['Politica definitiva de privacidad','Consentimiento definitivo verificable','Evaluacion de seguridad y retencion de datos','Alternativa de asistencia no biometrica'],
          message:'Enrolamiento facial no habilitado. Este endpoint no captura ni almacena biometria.'
        });
      }
      // ASISTIA_187_14_67_CONSENTIMIENTO_BIOMETRICO
      if (['GET', 'POST'].includes(req.method) && req.url === '/api/academico/alumno/consentimiento-biometrico') {
        const acceso = getSession(req);
        if (!acceso.ok) return json(res, 401, {ok:false, message:'Sesion invalida.'});
        if (acceso.user.role !== 'Alumno') return json(res, 403, {ok:false, message:'Solo alumnos.'});
        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
        const sesion = sessions.get(token);
        if (!sesion?.firebaseUid) return json(res, 401, {ok:false, message:'Se requiere sesion Firebase.'});
        const uid = String(sesion.firebaseUid);
        const perfilSnap = await dbFirebase.collection('usuarios').doc(uid).get();
        const perfil = perfilSnap.exists ? perfilSnap.data() : {};
        if (!perfilSnap.exists || perfil.activo !== true || perfil.rol !== 'Alumno')
          return json(res, 403, {ok:false, message:'Cuenta no autorizada.'});
        const alumnoId = String(perfil.alumnoId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))
          return json(res, 403, {ok:false, message:'Alumno no vinculado.'});
        const alumnoSnap = await dbFirebase.collection('alumnos').doc(alumnoId).get();
        if (!alumnoSnap.exists || alumnoSnap.data().firebaseUid !== uid || alumnoSnap.data().estado !== 'Activo')
          return json(res, 403, {ok:false, message:'Vinculacion invalida.'});
        const participanteRef = dbFirebase.collection('participantes_piloto').doc(uid);
        const participanteSnap = await participanteRef.get();
        const participante = participanteSnap.data() || {};
        const correoPiloto = String(perfil.email || perfil.correo || alumnoSnap.data().email || '').trim().toLowerCase();

        const esPilotoPersonal = correoPiloto === 'usuario18@example.com' &&
          await pilotoAutorizado(dbFirebase, uid, perfil, alumnoSnap.data());

        const esPilotoGrupal = alumnoSnap.data().esDemo === true &&
          correoPiloto.endsWith('@duocuc.cl') &&
          participante.activo === true &&
          participante.firebaseUid === uid &&
          participante.alumnoId === alumnoId &&
          participante.email === correoPiloto &&
          participante.autorizacionAdministrativa === true;

        const esPiloto = esPilotoPersonal || esPilotoGrupal;
const version = esPilotoPersonal ? 'PILOTO-VOLUNTARIO-2026-11-23-v1' : esPilotoGrupal ? (process.env.ASISTIA_PILOTO_GRUPAL === 'yes' ? 'PILOTO-GRUPAL-v2' : 'BORRADOR-PILOTO-GRUPAL-v2') : 'BORRADOR-2026-10-13-v1';
        const consentimientoRef = dbFirebase.collection('consentimientos_biometricos').doc(uid);
        if (req.method === 'GET') {
          const registro = await consentimientoRef.get();
          const dato = registro.exists ? registro.data() : {};
          return json(res, 200, {ok:true, version, estado:dato.version === version ? (dato.estado || 'No otorgado') : 'No otorgado',
            actualizadoAt:dato.actualizadoAt || null,
            aviso:esPilotoPersonal ? 'Prueba voluntaria con tu propio rostro. Se enviara una captura al servidor para compararla con tu referencia biometrica cifrada. La prueba no registra asistencia. Puedes rechazar o revocar el consentimiento y solicitar la eliminacion de tu referencia. Utiliza solamente datos propios.' : (esPilotoGrupal && version === 'PILOTO-GRUPAL-v2' ?
'Piloto academico experimental y voluntario para mayores de 18 anos. Responsable y contacto: Francisco Ossandon, usuario18@example.com. Tu captura sera comparada con tu plantilla facial cifrada. Las coincidencias podran generar marcaciones experimentales en Firebase, sin validez academica oficial. No existe prueba de vida validada. Puedes rechazar o revocar tu consentimiento, solicitar la eliminacion de tus datos y utilizar una alternativa manual sin penalizacion. Al aceptar autorizas expresamente la reutilizacion de tu plantilla facial existente, previamente obtenida con tu consentimiento, para este piloto experimental. Se mantiene su vencimiento original y no se amplian los plazos de conservacion. No constituye un despliegue institucional de Duoc UC.' :
'Documento informativo preliminar. No habilita el reconocimiento facial.')});
        }
        const cuerpo = await body(req);
        const accion = String(cuerpo?.accion || '');
        if (!['aceptar','revocar'].includes(accion))
          return json(res, 400, {ok:false, message:'Accion invalida.'});
        if (accion === 'aceptar' && (cuerpo?.version !== version || cuerpo?.consentimientoExplicito !== true))
          return json(res, 400, {ok:false, message:'Se requiere consentimiento expreso y version vigente.'});
        const ahora = new Date().toISOString();
        if (accion === 'aceptar' && esPilotoGrupal) {
          if (version !== 'PILOTO-GRUPAL-v2')
            return json(res, 409, {ok:false, message:'El consentimiento grupal aun no esta habilitado.'});

          if (cuerpo.mayorEdadConfirmada !== true)
            return json(res, 400, {ok:false, message:'Debes declarar personalmente tu mayoria de edad.'});
        }

        const estado = accion === 'aceptar' ? 'Otorgado' : 'Revocado';
        await dbFirebase.runTransaction(async tx => {
          if (esPilotoGrupal && accion === 'aceptar') {
            const autorizacionActual = await tx.get(participanteRef);
            const p = autorizacionActual.data() || {};

            if (p.activo !== true ||
                p.autorizacionAdministrativa !== true ||
                p.firebaseUid !== uid ||
                p.alumnoId !== alumnoId ||
                p.email !== correoPiloto) {
              throw Error('La autorizacion del participante ya no esta vigente.');
            }
          }

          const anterior = await tx.get(consentimientoRef);
          const dato = anterior.exists ? anterior.data() : {};
          if (esPilotoGrupal) {
            tx.update(participanteRef, {
              mayorEdadConfirmada: accion === 'aceptar',
              declaracionPersonalAt: accion === 'aceptar' ? ahora : null
            });
          }

          tx.set(consentimientoRef, {firebaseUid:uid, alumnoId, estado, version,
            actualizadoAt:ahora, otorgadoAt:accion === 'aceptar' ? ahora : (dato.otorgadoAt || null),
            revocadoAt:accion === 'revocar' ? ahora : null, mayorEdadConfirmada:esPilotoGrupal && accion === 'aceptar' && cuerpo.mayorEdadConfirmada === true, esDemo:Boolean(alumnoSnap.data().esDemo)});
          const evento = dbFirebase.collection('auditoria').doc();
          tx.set(evento, {accion:accion === 'aceptar' ? 'Consentimiento otorgado' : 'Consentimiento revocado',
            modulo:'Biometria', registroId:uid, usuarioId:uid,
            rol:'Alumno', fecha:ahora, resultado:'Correcto',
            detalle:{alumnoId, version, estado}, esDemo:Boolean(alumnoSnap.data().esDemo)});
        });
        return json(res, 200, {ok:true, estado, version, actualizadoAt:ahora,
          message:'Preferencia registrada. El enrolamiento facial aun no esta habilitado.'});
      }

      // PASO 187.14.8 - API ACADEMICA POR ROL
      // =================================================
      if (
        req.method === 'GET' &&
        ['/api/academico/docente', '/api/academico/alumno'].includes(req.url)
      ) {
        const auth = getSession(req);

        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message || 'Sesion no autorizada.'
          });
        }

        const rolRequerido = req.url === '/api/academico/docente'
          ? 'Docente'
          : 'Alumno';

        if (auth.user.role !== rolRequerido) {
          return json(res, 403, {
            ok: false,
            message: 'No tienes permiso para consultar este panel.'
          });
        }

        const bearer = String(req.headers.authorization || '');
        const token = bearer.startsWith('Bearer ')
          ? bearer.slice(7).trim()
          : '';

        const sesion = sessions.get(token);

        if (!sesion?.firebaseUid) {
          return json(res, 401, {
            ok: false,
            message: 'Se requiere una sesion Firebase valida.'
          });
        }

        const uid = sesion.firebaseUid;
        const perfilSnap = await dbFirebase
          .collection('usuarios')
          .doc(uid)
          .get();

        if (
          !perfilSnap.exists ||
          perfilSnap.data().activo !== true ||
          perfilSnap.data().rol !== rolRequerido
        ) {
          return json(res, 403, {
            ok: false,
            message: 'Perfil academico no autorizado.'
          });
        }

        const perfil = perfilSnap.data();

        if (rolRequerido === 'Docente') {
          const docenteId = String(perfil.docenteId || '');

          if (!/^[A-Za-z0-9_-]{1,128}$/.test(docenteId)) {
            return json(res, 403, {
              ok: false,
              message: 'No existe un docente vinculado a esta cuenta.'
            });
          }

          const docenteSnap = await dbFirebase
            .collection('docentes')
            .doc(docenteId)
            .get();

          if (
            !docenteSnap.exists ||
            docenteSnap.data().firebaseUid !== uid ||
            docenteSnap.data().estado !== 'Activo'
          ) {
            return json(res, 403, {
              ok: false,
              message: 'Vinculacion del docente no valida.'
            });
          }

          const horariosSnap = await dbFirebase
            .collection('horarios')
            .where('docenteId', '==', docenteId)
            .get();

          const horarios = horariosSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));

          const horarioIds = new Set(horarios.map(h => h.id));
          const cursoIds = new Set(horarios.map(h => h.cursoId));

          const [cursosSnap, marcacionesSnap, ausenciasSnap] =
            await Promise.all([
              dbFirebase.collection('cursos').get(),
              dbFirebase.collection('marcaciones').get(),
              dbFirebase.collection('ausencias').get()
            ]);

          const cursos = cursosSnap.docs
            .filter(d => cursoIds.has(d.id))
            .map(d => ({ id: d.id, ...d.data() }));

                    // ASISTIA_187_14_22_NOMINA
          const [matriculasDocSnap, alumnosDocSnap] = await Promise.all([
            dbFirebase.collection('matriculas').get(),
            dbFirebase.collection('alumnos').get()
          ]);

          const matriculasDocente = matriculasDocSnap.docs
            .filter(d =>
              cursoIds.has(d.data().cursoId) &&
              d.data().estado === 'Activo'
            )
            .map(d => ({
              id: d.id,
              alumnoId: d.data().alumnoId,
              cursoId: d.data().cursoId,
              estado: d.data().estado
            }));

          const alumnoIdsDocente = new Set(
            matriculasDocente.map(m => m.alumnoId)
          );

          const alumnosDocente = alumnosDocSnap.docs
            .filter(d =>
              alumnoIdsDocente.has(d.id) &&
              d.data().estado === 'Activo'
            )
            .map(d => ({
              id: d.id,
              nombre: d.data().nombre || ''
            }));
const marcaciones = marcacionesSnap.docs
            .filter(d => horarioIds.has(d.data().horarioId))
            .map(d => ({ id: d.id, ...d.data() }));

          const ausencias = ausenciasSnap.docs
            .filter(d => horarioIds.has(d.data().horarioId))
            .map(d => ({ id: d.id, ...d.data() }));

          return json(res, 200, {
            ok: true,
            docente: {
              id: docenteSnap.id,
              nombre: docenteSnap.data().nombre,
              especialidad: docenteSnap.data().especialidad
            },
            matriculas: matriculasDocente,
            alumnos: alumnosDocente,
            cursos,
            horarios,
            marcaciones,
            ausencias
          });
        }

        const alumnoId = String(perfil.alumnoId || '');

        if (!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId)) {
          return json(res, 403, {
            ok: false,
            message: 'No existe un alumno vinculado a esta cuenta.'
          });
        }

        const alumnoSnap = await dbFirebase
          .collection('alumnos')
          .doc(alumnoId)
          .get();

        if (
          !alumnoSnap.exists ||
          alumnoSnap.data().firebaseUid !== uid ||
          alumnoSnap.data().estado !== 'Activo'
        ) {
          return json(res, 403, {
            ok: false,
            message: 'Vinculacion del alumno no valida.'
          });
        }

        const [matriculasSnap, marcacionesSnap, ausenciasSnap] =
          await Promise.all([
            dbFirebase.collection('matriculas')
              .where('alumnoId', '==', alumnoId).get(),
            dbFirebase.collection('marcaciones')
              .where('alumnoId', '==', alumnoId).get(),
            dbFirebase.collection('ausencias')
              .where('alumnoId', '==', alumnoId).get()
          ]);

        const matriculas = matriculasSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        const cursoIds = new Set(
          matriculas.map(m => m.cursoId).filter(Boolean)
        );

        const [cursosSnap, horariosSnap] = await Promise.all([
          dbFirebase.collection('cursos').get(),
          dbFirebase.collection('horarios').get()
        ]);

        const cursos = cursosSnap.docs
          .filter(d => cursoIds.has(d.id))
          .map(d => ({ id: d.id, ...d.data() }));

        const horarios = horariosSnap.docs
          .filter(d => cursoIds.has(d.data().cursoId))
          .map(d => ({ id: d.id, ...d.data() }));

        return json(res, 200, {
          ok: true,
          alumno: {
            id: alumnoSnap.id,
            nombre: alumnoSnap.data().nombre,
            carrera: alumnoSnap.data().carrera,
            sede: alumnoSnap.data().sede
          },
          matriculas,
          cursos,
          horarios,
          marcaciones: marcacionesSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })),
          ausencias: ausenciasSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        });
      }
      // MODULO FIRESTORE ALUMNOS ASISTIA
      // =================================================

      // GET /api/alumnos
      if (req.method === 'GET' && req.url === '/api/alumnos') {
        const auth = requireAdmin(req)

        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message,
          })
        }

        const snapshot = await dbFirebase
          .collection('alumnos')
          .get()

        const alumnos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))

        alumnos.sort((a, b) =>
          String(a.nombre || '').localeCompare(
            String(b.nombre || ''),
            'es'
          )
        )

        return json(res, 200, {
          ok: true,
          alumnos,
        })
      }

      // POST /api/alumnos
      if (req.method === 'POST' && req.url === '/api/alumnos') {
        const auth = requireAdmin(req)

        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message,
          })
        }

        const data = await body(req)

        const alumno = {
          nombre: String(data.nombre || '').trim(),
          rut: String(data.rut || '').trim().toUpperCase(),
          correo: String(data.correo || '').trim().toLowerCase(),
          carrera: String(data.carrera || '').trim(),
          sede: String(data.sede || '').trim(),
          estado: String(data.estado || 'Activo').trim(),
        }

        if (
          !alumno.nombre ||
          !alumno.rut ||
          !alumno.carrera ||
          !alumno.sede
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Nombre, RUT, carrera y sede son obligatorios.',
          })
        }

        if (
          alumno.nombre.length > 120 ||
          alumno.rut.length > 20 ||
          alumno.correo.length > 160 ||
          alumno.carrera.length > 120 ||
          alumno.sede.length > 120 ||
          !['Activo', 'Inactivo', 'Seguimiento'].includes(alumno.estado)
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Datos del alumno no validos.',
          })
        }

        if (
          alumno.correo &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alumno.correo)
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Correo electronico no valido.',
          })
        }

        const duplicado = await dbFirebase
          .collection('alumnos')
          .where('rut', '==', alumno.rut)
          .limit(1)
          .get()

        if (!duplicado.empty) {
          return json(res, 409, {
            ok: false,
            message: 'Ya existe un alumno con ese RUT.',
          })
        }

        const ahora = new Date().toISOString()

        const nuevo = {
          ...alumno,
          createdAt: ahora,
          updatedAt: ahora,
        }

        const referencia = dbFirebase.collection('alumnos').doc()
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.set(referencia, nuevo)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Creación', 'Alumnos', referencia.id, {
            nombre: nuevo.nombre,
            estado: nuevo.estado,
          })
        )

        await batch.commit()

        return json(res, 201, {
          ok: true,
          alumno: {
            id: referencia.id,
            ...nuevo,
          },
        })
      }

      // PUT y DELETE /api/alumnos/:id
      const alumnoMatch = req.url?.match(
        /^\/api\/alumnos\/([A-Za-z0-9_-]{1,128})$/
      )

      if (
        alumnoMatch &&
        (req.method === 'PUT' || req.method === 'DELETE')
      ) {
        const auth = requireAdmin(req)

        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message,
          })
        }

        const referencia = dbFirebase
          .collection('alumnos')
          .doc(alumnoMatch[1])

        const documento = await referencia.get()

        if (!documento.exists) {
          return json(res, 404, {
            ok: false,
            message: 'Alumno no encontrado.',
          })
        }

        if (req.method === 'DELETE') {
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()

          batch.delete(referencia)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Eliminación', 'Alumnos', referencia.id, {
              nombre: documento.data().nombre,
            })
          )

          await batch.commit()

          return json(res, 200, {
            ok: true,
            message: 'Alumno eliminado correctamente.',
          })
        }

        const data = await body(req)

        const alumno = {
          nombre: String(data.nombre || '').trim(),
          rut: String(data.rut || '').trim().toUpperCase(),
          correo: String(data.correo || '').trim().toLowerCase(),
          carrera: String(data.carrera || '').trim(),
          sede: String(data.sede || '').trim(),
          estado: String(data.estado || 'Activo').trim(),
        }

        if (
          !alumno.nombre ||
          !alumno.rut ||
          !alumno.carrera ||
          !alumno.sede
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Nombre, RUT, carrera y sede son obligatorios.',
          })
        }

        if (
          alumno.nombre.length > 120 ||
          alumno.rut.length > 20 ||
          alumno.correo.length > 160 ||
          alumno.carrera.length > 120 ||
          alumno.sede.length > 120 ||
          !['Activo', 'Inactivo', 'Seguimiento'].includes(alumno.estado)
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Datos del alumno no validos.',
          })
        }

        if (
          alumno.correo &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alumno.correo)
        ) {
          return json(res, 400, {
            ok: false,
            message: 'Correo electronico no valido.',
          })
        }

        if (alumno.rut !== documento.data().rut) {
          const duplicado = await dbFirebase
            .collection('alumnos')
            .where('rut', '==', alumno.rut)
            .get()

          if (
            duplicado.docs.some(doc => doc.id !== referencia.id)
          ) {
            return json(res, 409, {
              ok: false,
              message: 'Ya existe otro alumno con ese RUT.',
            })
          }
        }

        const cambios = {
          ...alumno,
          updatedAt: new Date().toISOString(),
        }

        const camposModificados = Object.keys(alumno).filter(
          campo => documento.data()[campo] !== alumno[campo]
        )

        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.update(referencia, cambios)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Modificación', 'Alumnos', referencia.id, {
            nombre: alumno.nombre,
            camposModificados,
          })
        )

        await batch.commit()

        return json(res, 200, {
          ok: true,
          alumno: {
            id: referencia.id,
            ...documento.data(),
            ...cambios,
          },
        })
      }

      // GET /api/firebase/status
      if (
        req.method === 'GET' &&
        req.url === '/api/firebase/status'
      ) {
        const auth = requireAdmin(req)

        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message,
          })
        }

        const documento = await dbFirebase
          .collection('prueba_conexion')
          .doc('estado')
          .get()

        return json(res, 200, {
          ok: true,
          firebase: 'connected',
          testDocumentExists: documento.exists,
        })
      }
      // =================================================
      // MODULO FIRESTORE DOCENTES ASISTIA
      // =================================================
            // AUDITORIA PASO 185 DOCENTES CURSOS HORARIOS
if (req.method === 'GET' && req.url === '/api/docentes') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const snapshot = await dbFirebase.collection('docentes').get()
        const docentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        docentes.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
        return json(res, 200, { ok: true, docentes })
      }

      if (req.method === 'POST' && req.url === '/api/docentes') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const data = await body(req)
        const docente = {
          nombre: String(data.nombre || '').trim(),
          correo: String(data.correo || '').trim().toLowerCase(),
          especialidad: String(data.especialidad || '').trim(),
          cursos: Number(data.cursos),
          jornada: String(data.jornada || '').trim(),
          estado: String(data.estado || 'Activo').trim(),
        }
        if (!docente.nombre || !docente.correo || !docente.especialidad || !Number.isInteger(docente.cursos) || docente.cursos < 0 || docente.cursos > 100 || !['Diurna', 'Vespertina', 'Mixta'].includes(docente.jornada) || !['Activo', 'Inactivo', 'Pendiente'].includes(docente.estado) || docente.nombre.length > 120 || docente.correo.length > 160 || docente.especialidad.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(docente.correo)) {
          return json(res, 400, { ok: false, message: 'Datos del docente invalidos. Revisa nombre, correo, especialidad, cursos, jornada y estado.' })
        }
        const duplicados = await dbFirebase.collection('docentes').where('correo', '==', docente.correo).limit(1).get()
        if (!duplicados.empty) return json(res, 409, { ok: false, message: 'Ya existe un docente con ese correo.' })
        const ahora = new Date().toISOString()
        const nuevo = { ...docente, createdAt: ahora, updatedAt: ahora }
        const referencia = dbFirebase.collection('docentes').doc()
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.set(referencia, nuevo)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Creación', 'Docentes', referencia.id, {
            camposRegistrados: Object.keys(nuevo).filter(
              campo => !['createdAt', 'updatedAt'].includes(campo)
            )
          })
        )

        await batch.commit()
        return json(res, 201, { ok: true, docente: { id: referencia.id, ...nuevo } })
      }

      const docenteMatch = req.url?.match(/^\/api\/docentes\/([A-Za-z0-9_-]{1,128})$/)
      if (docenteMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const referencia = dbFirebase.collection('docentes').doc(docenteMatch[1])
        const existente = await referencia.get()
        if (!existente.exists) return json(res, 404, { ok: false, message: 'Docente no encontrado.' })
        if (req.method === 'DELETE') {
          const horariosAsociados = await dbFirebase.collection('horarios')
            .where('docenteId', '==', referencia.id)
            .limit(1)
            .get()
          if (!horariosAsociados.empty) {
            return json(res, 409, {
              ok: false,
              message: 'No se puede eliminar este docente porque tiene horarios asociados.'
            })
          }
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()

          batch.delete(referencia)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Eliminación', 'Docentes', referencia.id, {
              registroEliminado: true
            })
          )

          await batch.commit()
          return json(res, 200, { ok: true, message: 'Docente eliminado correctamente.' })
        }
        const data = await body(req)
        const docente = {
          nombre: String(data.nombre || '').trim(),
          correo: String(data.correo || '').trim().toLowerCase(),
          especialidad: String(data.especialidad || '').trim(),
          cursos: Number(data.cursos),
          jornada: String(data.jornada || '').trim(),
          estado: String(data.estado || 'Activo').trim(),
        }
        if (!docente.nombre || !docente.correo || !docente.especialidad || !Number.isInteger(docente.cursos) || docente.cursos < 0 || docente.cursos > 100 || !['Diurna', 'Vespertina', 'Mixta'].includes(docente.jornada) || !['Activo', 'Inactivo', 'Pendiente'].includes(docente.estado) || docente.nombre.length > 120 || docente.correo.length > 160 || docente.especialidad.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(docente.correo)) {
          return json(res, 400, { ok: false, message: 'Datos del docente invalidos. Revisa nombre, correo, especialidad, cursos, jornada y estado.' })
        }
        if (docente.correo !== existente.data().correo) {
          const duplicados = await dbFirebase.collection('docentes').where('correo', '==', docente.correo).get()
          if (duplicados.docs.some(doc => doc.id !== referencia.id)) return json(res, 409, { ok: false, message: 'Ya existe otro docente con ese correo.' })
        }
        const cambios = { ...docente, updatedAt: new Date().toISOString() }
        const camposModificados = Object.keys(cambios).filter(
          campo => campo !== 'updatedAt' &&
            JSON.stringify(existente.data()[campo]) !== JSON.stringify(cambios[campo])
        )

        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.update(referencia, cambios)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Modificación', 'Docentes', referencia.id, {
            camposModificados
          })
        )

        await batch.commit()
        return json(res, 200, { ok: true, docente: { id: referencia.id, ...existente.data(), ...cambios } })
      }
      // =================================================
      // MODULO FIRESTORE CURSOS ASISTIA
      // =================================================
      const normalizarCurso = (data) => ({
        codigo: String(data.codigo ?? '').trim().toUpperCase(),
        asignatura: String(data.asignatura ?? '').trim(),
        seccion: String(data.seccion ?? '').trim().toUpperCase(),
        docente: String(data.docente ?? '').trim(),
        horario: String(data.horario ?? '').trim(),
        inscritos: Number(data.inscritos),
        cupos: Number(data.cupos),
        periodo: String(data.periodo ?? '').trim(),
        estado: String(data.estado ?? 'Activo').trim(),
      })
      const cursoValido = (curso, raw) => (
        curso.codigo.length >= 2 && curso.codigo.length <= 30 &&
        curso.asignatura.length >= 2 && curso.asignatura.length <= 160 &&
        curso.seccion.length >= 1 && curso.seccion.length <= 30 &&
        curso.docente.length <= 160 && curso.horario.length <= 160 &&
        curso.periodo.length >= 3 && curso.periodo.length <= 40 &&
        ['Activo', 'Inactivo'].includes(curso.estado) &&
        raw.inscritos !== '' && raw.inscritos !== null && raw.inscritos !== undefined &&
        raw.cupos !== '' && raw.cupos !== null && raw.cupos !== undefined &&
        Number.isInteger(curso.inscritos) && Number.isInteger(curso.cupos) &&
        curso.inscritos >= 0 && curso.cupos >= 1 && curso.cupos <= 1000 &&
        curso.inscritos <= curso.cupos
      )
      if (req.method === 'GET' && req.url === '/api/cursos') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const snapshot = await dbFirebase.collection('cursos').get()
        const cursos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        cursos.sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es') || String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es'))
        return json(res, 200, { ok: true, cursos })
      }

      if (req.method === 'POST' && req.url === '/api/cursos') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const data = await body(req)
        const curso = normalizarCurso(data)
        if (!cursoValido(curso, data)) return json(res, 400, { ok: false, message: 'Datos del curso invalidos. Revisa codigo, asignatura, seccion, periodo, inscritos y cupos.' })
        const duplicados = await dbFirebase.collection('cursos').where('codigo', '==', curso.codigo).get()
        if (duplicados.docs.some(doc => doc.data().seccion === curso.seccion && doc.data().periodo === curso.periodo)) {
          return json(res, 409, { ok: false, message: 'Ya existe un curso con ese codigo, seccion y periodo.' })
        }
        const ahora = new Date().toISOString()
        const nuevo = { ...curso, createdAt: ahora, updatedAt: ahora }
        const referencia = dbFirebase.collection('cursos').doc()
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.set(referencia, nuevo)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Creación', 'Cursos', referencia.id, {
            camposRegistrados: Object.keys(nuevo).filter(
              campo => !['createdAt', 'updatedAt'].includes(campo)
            )
          })
        )

        await batch.commit()
        return json(res, 201, { ok: true, curso: { id: referencia.id, ...nuevo } })
      }

      const cursoMatch = req.url?.match(/^\/api\/cursos\/([A-Za-z0-9_-]{1,128})$/)
      if (cursoMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const referencia = dbFirebase.collection('cursos').doc(cursoMatch[1])
        const existente = await referencia.get()
        if (!existente.exists) return json(res, 404, { ok: false, message: 'Curso no encontrado.' })
        if (req.method === 'DELETE') {
          const horariosAsociados = await dbFirebase.collection('horarios')
            .where('cursoId', '==', referencia.id)
            .limit(1)
            .get()
          if (!horariosAsociados.empty) {
            return json(res, 409, {
              ok: false,
              message: 'No se puede eliminar este curso porque tiene horarios asociados.'
            })
          }
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()

          batch.delete(referencia)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Eliminación', 'Cursos', referencia.id, {
              registroEliminado: true
            })
          )

          await batch.commit()
          return json(res, 200, { ok: true, message: 'Curso eliminado correctamente.' })
        }
        const data = await body(req)
        const curso = normalizarCurso(data)
        if (!cursoValido(curso, data)) return json(res, 400, { ok: false, message: 'Datos del curso invalidos. Revisa codigo, asignatura, seccion, periodo, inscritos y cupos.' })
        const duplicados = await dbFirebase.collection('cursos').where('codigo', '==', curso.codigo).get()
        if (duplicados.docs.some(doc => doc.id !== referencia.id && doc.data().seccion === curso.seccion && doc.data().periodo === curso.periodo)) {
          return json(res, 409, { ok: false, message: 'Ya existe otro curso con ese codigo, seccion y periodo.' })
        }
        const cambios = { ...curso, updatedAt: new Date().toISOString() }
        const camposModificados = Object.keys(cambios).filter(
          campo => campo !== 'updatedAt' &&
            JSON.stringify(existente.data()[campo]) !== JSON.stringify(cambios[campo])
        )

        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.update(referencia, cambios)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Modificación', 'Cursos', referencia.id, {
            camposModificados
          })
        )

        await batch.commit()
        return json(res, 200, { ok: true, curso: { id: referencia.id, ...existente.data(), ...cambios } })
      }
      // =================================================
      // MODULO FIRESTORE HORARIOS ASISTIA
      // =================================================
      const normalizarHorario = (data) => ({
        cursoId: String(data.cursoId ?? '').trim(),
        docenteId: String(data.docenteId ?? '').trim(),
        dia: String(data.dia ?? '').trim(),
        inicio: String(data.inicio ?? '').trim(),
        fin: String(data.fin ?? '').trim(),
        sala: String(data.sala ?? '').trim(),
        modalidad: String(data.modalidad ?? '').trim(),
        estado: String(data.estado ?? 'Confirmada').trim(),
      })
      const minutosHorario = (hora) => {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora)) return NaN
        const [h, m] = hora.split(':').map(Number)
        return h * 60 + m
      }
      const horarioValido = (h) => (
        /^[A-Za-z0-9_-]{1,128}$/.test(h.cursoId) &&
        /^[A-Za-z0-9_-]{1,128}$/.test(h.docenteId) &&
        ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].includes(h.dia) &&
        Number.isFinite(minutosHorario(h.inicio)) &&
        Number.isFinite(minutosHorario(h.fin)) &&
        minutosHorario(h.inicio) < minutosHorario(h.fin) &&
        h.sala.length >= 1 && h.sala.length <= 80 &&
        ['Presencial', 'Online', 'Hibrida', 'HÃ­brida'].includes(h.modalidad) &&
        ['Confirmada', 'Pendiente', 'Cancelada'].includes(h.estado)
      )
      const validarReferenciasHorario = async (h) => {
        const [cursoDoc, docenteDoc] = await Promise.all([
          dbFirebase.collection('cursos').doc(h.cursoId).get(),
          dbFirebase.collection('docentes').doc(h.docenteId).get(),
        ])
        if (!cursoDoc.exists) return { error: 'El curso seleccionado no existe.' }
        if (!docenteDoc.exists) return { error: 'El docente seleccionado no existe.' }
        const curso = cursoDoc.data()
        const docente = docenteDoc.data()
        if (curso.estado !== 'Activo') return { error: 'El curso seleccionado debe estar activo.' }
        if (docente.estado !== 'Activo') return { error: 'El docente seleccionado debe estar activo.' }
        return { curso, docente }
      }
      const conflictoHorario = async (h, periodo, ignorarId = '') => {
        if (h.estado === 'Cancelada') return null
        const snapshot = await dbFirebase.collection('horarios').get()
        const dia = h.dia.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        for (const doc of snapshot.docs) {
          if (doc.id === ignorarId) continue
          const otro = doc.data()
          if (otro.estado === 'Cancelada' || otro.periodo !== periodo) continue
          if (String(otro.dia || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '') !== dia) continue
          if (!(minutosHorario(h.inicio) < minutosHorario(otro.fin) && minutosHorario(otro.inicio) < minutosHorario(h.fin))) continue
          if (otro.docenteId === h.docenteId) return 'El docente ya tiene una clase en ese horario.'
          if (h.modalidad !== 'Online' && otro.modalidad !== 'Online' && String(otro.sala || '').toLowerCase() === h.sala.toLowerCase()) return 'La sala ya esta ocupada en ese horario.'
          if (otro.cursoId === h.cursoId) return 'La seccion ya tiene una clase en ese horario.'
        }
        return null
      }
      if (req.method === 'GET' && req.url === '/api/horarios') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const snapshot = await dbFirebase.collection('horarios').get()
        const horarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        const dias = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
        horarios.sort((a, b) => dias.indexOf(a.dia) - dias.indexOf(b.dia) || String(a.inicio).localeCompare(String(b.inicio)))
        return json(res, 200, { ok: true, horarios })
      }
      if (req.method === 'POST' && req.url === '/api/horarios') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const data = await body(req)
        const horario = normalizarHorario(data)
        if (!horarioValido(horario)) return json(res, 400, { ok: false, message: 'Datos de horario invalidos. Revisa curso, docente, dia, horas, sala, modalidad y estado.' })
        const referencias = await validarReferenciasHorario(horario)
        if (referencias.error) return json(res, 400, { ok: false, message: referencias.error })
        const conflicto = await conflictoHorario(horario, referencias.curso.periodo)
        if (conflicto) return json(res, 409, { ok: false, message: conflicto })
        const ahora = new Date().toISOString()
        const nuevo = {
          ...horario, periodo: referencias.curso.periodo,
          codigo: referencias.curso.codigo, asignatura: referencias.curso.asignatura,
          seccion: referencias.curso.seccion, docente: referencias.docente.nombre,
          createdAt: ahora, updatedAt: ahora,
        }
        const referencia = dbFirebase.collection('horarios').doc()
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.set(referencia, nuevo)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Creación', 'Horarios', referencia.id, {
            camposRegistrados: Object.keys(nuevo).filter(
              campo => !['createdAt', 'updatedAt'].includes(campo)
            )
          })
        )

        await batch.commit()
        return json(res, 201, { ok: true, horario: { id: referencia.id, ...nuevo } })
      }
      const horarioMatch = req.url?.match(/^\/api\/horarios\/([A-Za-z0-9_-]{1,128})$/)
      if (horarioMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const referencia = dbFirebase.collection('horarios').doc(horarioMatch[1])
        const existente = await referencia.get()
        if (!existente.exists) return json(res, 404, { ok: false, message: 'Horario no encontrado.' })
        if (req.method === 'DELETE') {
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()

          batch.delete(referencia)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Eliminación', 'Horarios', referencia.id, {
              registroEliminado: true
            })
          )

          await batch.commit()
          return json(res, 200, { ok: true, message: 'Horario eliminado correctamente.' })
        }
        const data = await body(req)
        const horario = normalizarHorario(data)
        if (!horarioValido(horario)) return json(res, 400, { ok: false, message: 'Datos de horario invalidos. Revisa curso, docente, dia, horas, sala, modalidad y estado.' })
        const referencias = await validarReferenciasHorario(horario)
        if (referencias.error) return json(res, 400, { ok: false, message: referencias.error })
        const conflicto = await conflictoHorario(horario, referencias.curso.periodo, referencia.id)
        if (conflicto) return json(res, 409, { ok: false, message: conflicto })
        const cambios = {
          ...horario, periodo: referencias.curso.periodo,
          codigo: referencias.curso.codigo, asignatura: referencias.curso.asignatura,
          seccion: referencias.curso.seccion, docente: referencias.docente.nombre,
          updatedAt: new Date().toISOString(),
        }
        const camposModificados = Object.keys(cambios).filter(
          campo => campo !== 'updatedAt' &&
            JSON.stringify(existente.data()[campo]) !== JSON.stringify(cambios[campo])
        )

        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.update(referencia, cambios)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Modificación', 'Horarios', referencia.id, {
            camposModificados
          })
        )

        await batch.commit()
        return json(res, 200, { ok: true, horario: { id: referencia.id, ...existente.data(), ...cambios } })
      }
      // AUDITORIA PASO 185.4 - MARCACIONES Y AUSENCIAS
      // MODULO FIRESTORE MARCACIONES ASISTIA
      const fechaMarcacionValida = (valor) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
        const fecha = new Date(`${valor}T12:00:00Z`)
        return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
      }
      const diasMarcacion = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
      const normalizarDiaMarcacion = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const marcacionesPath = req.url?.split('?')[0]
            // ASISTIA_PASO302_ADMIN_FACIAL
      if (req.method === 'GET' && marcacionesPath === '/api/marcaciones-piloto') {
        const auth = requireAdmin(req);
        if (!auth.ok) return json(res,auth.forbidden ? 403 : 401,{ok:false,message:auth.message});

        const acceso = getSession(req);
        if (!acceso.ok || acceso.user.role !== 'Administradora')
          return json(res,403,{ok:false,message:'Acceso restringido.'});

        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
        const sesion = sessions.get(token);

        if (!sesion?.firebaseUid || acceso.user.scope || sesion.scope || sesion.user?.scope || acceso.user.isDemo || sesion.isDemo)
          return json(res,403,{ok:false,message:'Se requiere administracion general.'});

        const perfil = (await dbFirebase.collection('usuarios').doc(sesion.firebaseUid).get()).data() || {};

        if (perfil.activo !== true || perfil.rol !== 'Administradora' || perfil.scope || perfil.esDemo === true)
          return json(res,403,{ok:false,message:'Perfil administrativo no autorizado.'});

        const snapshot = await dbFirebase.collection('marcaciones_piloto').get();
        const registros = [];
        const idValido = /^[A-Za-z0-9_-]{1,128}$/;

        const cache = new Map();
        async function ficha(coleccion,id) {
          if (!idValido.test(String(id || ''))) return {};
          const clave = coleccion + '/' + id;
          if (!cache.has(clave))
            cache.set(clave,(await dbFirebase.collection(coleccion).doc(id).get()).data() || {});
          return cache.get(clave);
        }

        for (const doc of snapshot.docs) {
          const m = doc.data();
          if (m.esDemo !== true || m.asistenciaOficial !== false) continue;

          const alumno = await ficha('alumnos',m.alumnoId);
          const horario = await ficha('horarios',m.horarioId);
          const docente = await ficha('docentes',horario.docenteId);

          registros.push({
            id:doc.id,
            alumno:alumno.firebaseUid === m.firebaseUid ? alumno.nombre || 'Alumno' : 'Sin vinculacion',
            docente:docente.nombre || horario.docente || 'Sin asignar',
            asignatura:m.asignatura || horario.asignatura || '',
            fecha:m.fecha || '',
            estado:m.estado || '',
            createdAt:m.createdAt || '',
            origen:'Facial experimental'
          });
        }

        registros.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        return json(res,200,{ok:true,marcaciones:registros});
      }

if (marcacionesPath === '/api/marcaciones' && (req.method === 'GET' || req.method === 'POST')) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        if (req.method === 'GET') {
          const snapshot = await dbFirebase.collection('marcaciones').get()
          const marcaciones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          marcaciones.sort((a, b) => `${b.fecha || ''} ${b.hora || ''}`.localeCompare(`${a.fecha || ''} ${a.hora || ''}`))
          return json(res, 200, { ok: true, marcaciones })
        }
        const data = await body(req)
        const alumnoId = String(data.alumnoId || '').trim()
        const horarioId = String(data.horarioId || '').trim()
        const fecha = String(data.fecha || '').trim()
        const hora = String(data.hora || '').trim()
        const estado = String(data.estado || 'Presente').trim()
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId) || !/^[A-Za-z0-9_-]{1,128}$/.test(horarioId) ||
            !fechaMarcacionValida(fecha) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora) ||
            !['Presente', 'Atrasado', 'Pendiente'].includes(estado)) {
          return json(res, 400, { ok: false, message: 'Datos de marcacion invalidos.' })
        }
        const [alumnoDoc, horarioDoc] = await Promise.all([
          dbFirebase.collection('alumnos').doc(alumnoId).get(),
          dbFirebase.collection('horarios').doc(horarioId).get(),
        ])
        if (!alumnoDoc.exists || alumnoDoc.data().estado !== 'Activo') return json(res, 400, { ok: false, message: 'El alumno debe existir y estar activo.' })
        if (!horarioDoc.exists || horarioDoc.data().estado === 'Cancelada') return json(res, 400, { ok: false, message: 'El horario debe existir y no estar cancelado.' })
        const horario = horarioDoc.data()
        const diaFecha = diasMarcacion[new Date(`${fecha}T12:00:00Z`).getUTCDay()]
        if (normalizarDiaMarcacion(horario.dia) !== normalizarDiaMarcacion(diaFecha)) {
          return json(res, 400, { ok: false, message: 'La fecha no corresponde al dia del horario seleccionado.' })
        }
        const identificador = `${alumnoId}_${horarioId}_${fecha}`
        const referencia = dbFirebase.collection('marcaciones').doc(identificador)
        const ahora = new Date().toISOString()
        const marcacion = {
          alumnoId, horarioId, fecha, hora, estado, origen: 'Manual',
          alumno: alumnoDoc.data().nombre || '', rut: alumnoDoc.data().rut || '',
          cursoId: horario.cursoId || '', docenteId: horario.docenteId || '',
          codigo: horario.codigo || '', asignatura: horario.asignatura || '',
          seccion: horario.seccion || '', docente: horario.docente || '',
          sala: horario.sala || '', createdAt: ahora,
        }
        try {
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()
          batch.create(referencia, marcacion)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Creación', 'Marcaciones', referencia.id, {
              fecha: marcacion.fecha,
              estado: marcacion.estado
            })
          )
          await batch.commit()
        } catch (error) {
          if (error.code === 6 || error.code === 'already-exists' || error.code === 'ALREADY_EXISTS') {
            return json(res, 409, { ok: false, message: 'Este alumno ya tiene una marcacion para esa clase y fecha.' })
          }
          throw error
        }
        return json(res, 201, { ok: true, marcacion: { id: referencia.id, ...marcacion } })
      }
      const marcacionMatch = marcacionesPath?.match(/^\/api\/marcaciones\/([A-Za-z0-9_-]{1,400})$/)
      if (marcacionMatch && req.method === 'DELETE') {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const referencia = dbFirebase.collection('marcaciones').doc(marcacionMatch[1])
        const existente = await referencia.get()
        if (!existente.exists) return json(res, 404, { ok: false, message: 'Marcacion no encontrada.' })
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()
        batch.delete(referencia)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Eliminación', 'Marcaciones', referencia.id, {
            fecha: existente.data().fecha || '',
            estado: existente.data().estado || ''
          })
        )
        await batch.commit()
        return json(res, 200, { ok: true, message: 'Marcacion eliminada correctamente.' })
      }
      // MODULO FIRESTORE AUSENCIAS ASISTIA
      const ausenciasPath = req.url?.split('?')[0]
      const validarFechaAusencia = (v) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
        const d = new Date(`${v}T12:00:00Z`)
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
      }
      const diasAusencia = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
      const normalizarDiaAusencia = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const ausenciaIdValido = v => /^[A-Za-z0-9_-]{1,128}$/.test(v)
      if (ausenciasPath === '/api/ausencias' && (req.method === 'GET' || req.method === 'POST')) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        if (req.method === 'GET') {
          const snap = await dbFirebase.collection('ausencias').get()
          const ausencias = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          ausencias.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
          return json(res, 200, { ok: true, ausencias })
        }
        const data = await body(req)
        const alumnoId = String(data.alumnoId || '').trim()
        const horarioId = String(data.horarioId || '').trim()
        const fecha = String(data.fecha || '').trim()
        const motivo = String(data.motivo || '').trim()
        const observaciones = String(data.observaciones || '').trim()
        if (!ausenciaIdValido(alumnoId) || !ausenciaIdValido(horarioId) || !validarFechaAusencia(fecha) ||
            motivo.length > 160 || observaciones.length > 1000) {
          return json(res, 400, { ok: false, message: 'Datos de ausencia invalidos.' })
        }
        const [alumnoDoc, horarioDoc] = await Promise.all([
          dbFirebase.collection('alumnos').doc(alumnoId).get(),
          dbFirebase.collection('horarios').doc(horarioId).get(),
        ])
        if (!alumnoDoc.exists || alumnoDoc.data().estado !== 'Activo') return json(res, 400, { ok: false, message: 'El alumno debe estar activo.' })
        if (!horarioDoc.exists || horarioDoc.data().estado === 'Cancelada') return json(res, 400, { ok: false, message: 'La clase no existe o esta cancelada.' })
        const horario = horarioDoc.data()
        const dia = diasAusencia[new Date(`${fecha}T12:00:00Z`).getUTCDay()]
        if (normalizarDiaAusencia(horario.dia) !== normalizarDiaAusencia(dia)) return json(res, 400, { ok: false, message: 'La fecha no corresponde al dia de la clase.' })
        const id = `${alumnoId}_${horarioId}_${fecha}`
        const ausenciaRef = dbFirebase.collection('ausencias').doc(id)
        const marcacionRef = dbFirebase.collection('marcaciones').doc(id)
        const ahora = new Date().toISOString()
        const ausencia = {
          alumnoId, horarioId, fecha, motivo, observaciones, estado: 'Pendiente',
          alumno: alumnoDoc.data().nombre || '', rut: alumnoDoc.data().rut || '',
          cursoId: horario.cursoId || '', codigo: horario.codigo || '',
          asignatura: horario.asignatura || '', seccion: horario.seccion || '',
          docente: horario.docente || '', createdAt: ahora, updatedAt: ahora,
        }
        try {
          await dbFirebase.runTransaction(async tx => {
            const [marcacionDoc, ausenciaDoc] = await Promise.all([tx.get(marcacionRef), tx.get(ausenciaRef)])
            if (marcacionDoc.exists) { const e = new Error('El alumno ya tiene una marcacion para esta clase y fecha.'); e.status = 409; throw e }
            if (ausenciaDoc.exists) { const e = new Error('Ya existe una ausencia para este alumno, clase y fecha.'); e.status = 409; throw e }
            tx.create(ausenciaRef, ausencia)
            const eventoRef = dbFirebase.collection('auditoria').doc()
            tx.create(
              eventoRef,
              crearEventoAuditoria(auth, 'Creación', 'Ausencias', ausenciaRef.id, {
                fecha: ausencia.fecha,
                estado: ausencia.estado
              })
            )
          })
        } catch (e) {
          if (e.status === 409) return json(res, 409, { ok: false, message: e.message })
          throw e
        }
        return json(res, 201, { ok: true, ausencia: { id, ...ausencia } })
      }
      const ausenciaMatch = ausenciasPath?.match(/^\/api\/ausencias\/([A-Za-z0-9_-]{1,400})$/)
      if (ausenciaMatch && ['PUT', 'DELETE'].includes(req.method)) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const ref = dbFirebase.collection('ausencias').doc(ausenciaMatch[1])
        const actual = await ref.get()
        if (!actual.exists) return json(res, 404, { ok: false, message: 'Ausencia no encontrada.' })
        if (req.method === 'DELETE') {
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()
          batch.delete(ref)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Eliminación', 'Ausencias', ref.id, {
              fecha: actual.data().fecha || '',
              estado: actual.data().estado || ''
            })
          )
          await batch.commit()
          return json(res, 200, { ok: true, message: 'Ausencia eliminada.' })
        }
        const data = await body(req)
        const estado = String(data.estado || '').trim()
        const motivo = String(data.motivo || '').trim()
        const observaciones = String(data.observaciones || '').trim()
        if (!['Pendiente', 'Justificada', 'No justificada'].includes(estado) || motivo.length > 160 || observaciones.length > 1000) {
          return json(res, 400, { ok: false, message: 'Datos de justificacion invalidos.' })
        }
        const cambios = { estado, motivo, observaciones, updatedAt: new Date().toISOString() }
        const camposModificados = ['estado', 'motivo', 'observaciones'].filter(
          campo => actual.data()[campo] !== cambios[campo]
        )
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()
        batch.update(ref, cambios)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Modificación', 'Ausencias', ref.id, {
            camposModificados
          })
        )
        await batch.commit()
        return json(res, 200, { ok: true, ausencia: { id: ref.id, ...actual.data(), ...cambios } })
      }
      // =================================================
      // AUDITORIA PASO 185.5 - INCIDENCIAS
      // MODULO FIRESTORE INCIDENCIAS ASISTIA
      // =================================================
      const incidenciasPath = req.url?.split('?')[0]
      const categoriasIncidencia = ['Asistencia', 'Atraso', 'Conducta', 'Problema tecnico', 'Otra']
      const prioridadesIncidencia = ['Baja', 'Media', 'Alta']
      const estadosIncidencia = ['Abierta', 'En proceso', 'Resuelta']
      if (incidenciasPath === '/api/incidencias' && ['GET', 'POST'].includes(req.method)) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        if (req.method === 'GET') {
          const snapshot = await dbFirebase.collection('incidencias').get()
          const incidencias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          incidencias.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          return json(res, 200, { ok: true, incidencias })
        }
        const data = await body(req)
        const titulo = String(data.titulo ?? '').trim()
        const descripcion = String(data.descripcion ?? '').trim()
        const categoria = String(data.categoria ?? '').trim()
        const prioridad = String(data.prioridad ?? 'Media').trim()
        const alumnoId = String(data.alumnoId ?? '').trim()
        const observaciones = String(data.observaciones ?? '').trim()
        if (titulo.length < 3 || titulo.length > 160 || descripcion.length < 5 || descripcion.length > 3000 ||
            !categoriasIncidencia.includes(categoria) || !prioridadesIncidencia.includes(prioridad) ||
            observaciones.length > 2000 || (alumnoId && !/^[A-Za-z0-9_-]{1,128}$/.test(alumnoId))) {
          return json(res, 400, { ok: false, message: 'Datos de incidencia invalidos. Revisa titulo, descripcion, categoria y prioridad.' })
        }
        let alumno = ''
        let rut = ''
        if (alumnoId) {
          const alumnoDoc = await dbFirebase.collection('alumnos').doc(alumnoId).get()
          if (!alumnoDoc.exists) return json(res, 404, { ok: false, message: 'Alumno no encontrado.' })
          alumno = String(alumnoDoc.data().nombre || '')
          rut = String(alumnoDoc.data().rut || '')
        }
        const ahora = new Date().toISOString()
        const incidencia = { titulo, descripcion, categoria, prioridad, alumnoId, alumno, rut,
          observaciones, estado: 'Abierta', createdAt: ahora, updatedAt: ahora }
        const ref = dbFirebase.collection('incidencias').doc()
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.set(ref, incidencia)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Creación', 'Incidencias', ref.id, {
            titulo: incidencia.titulo,
            categoria: incidencia.categoria,
            prioridad: incidencia.prioridad
          })
        )

        await batch.commit()
        return json(res, 201, { ok: true, incidencia: { id: ref.id, ...incidencia } })
      }
      const incidenciaMatch = incidenciasPath?.match(/^\/api\/incidencias\/([A-Za-z0-9_-]{1,128})$/)
      if (incidenciaMatch && ['PUT', 'DELETE'].includes(req.method)) {
        const auth = requireAdmin(req)
        if (!auth.ok) return json(res, auth.forbidden ? 403 : 401, { ok: false, message: auth.message })
        const ref = dbFirebase.collection('incidencias').doc(incidenciaMatch[1])
        const actual = await ref.get()
        if (!actual.exists) return json(res, 404, { ok: false, message: 'Incidencia no encontrada.' })
        if (req.method === 'DELETE') {
          const eventoRef = dbFirebase.collection('auditoria').doc()
          const batch = dbFirebase.batch()

          batch.delete(ref)
          batch.set(
            eventoRef,
            crearEventoAuditoria(auth, 'Eliminación', 'Incidencias', ref.id, {
              titulo: actual.data().titulo || '',
              estado: actual.data().estado || ''
            })
          )

          await batch.commit()
          return json(res, 200, { ok: true, message: 'Incidencia eliminada.' })
        }
        const data = await body(req)
        const estado = String(data.estado ?? '').trim()
        const observaciones = String(data.observaciones ?? '').trim()
        if (!estadosIncidencia.includes(estado) || observaciones.length > 2000) {
          return json(res, 400, { ok: false, message: 'Estado u observaciones invalidos.' })
        }
        const cambios = { estado, observaciones, updatedAt: new Date().toISOString() }
        const camposModificados = ['estado', 'observaciones'].filter(
          campo => actual.data()[campo] !== cambios[campo]
        )
        const eventoRef = dbFirebase.collection('auditoria').doc()
        const batch = dbFirebase.batch()

        batch.update(ref, cambios)
        batch.set(
          eventoRef,
          crearEventoAuditoria(auth, 'Modificación', 'Incidencias', ref.id, {
            titulo: actual.data().titulo || '',
            camposModificados
          })
        )

        await batch.commit()
        return json(res, 200, { ok: true, incidencia: { id: ref.id, ...actual.data(), ...cambios } })
      }
      // MODULO CONFIGURACION INSTITUCIONAL ASISTIA
      if (req.url?.split('?')[0] === '/api/configuracion/institucion' &&
          ['GET', 'PUT'].includes(req.method)) {

        const auth = requireAdmin(req)
        if (!auth.ok) {
          return json(res, auth.forbidden ? 403 : 401, {
            ok: false,
            message: auth.message
          })
        }

        const ref = dbFirebase.collection('configuracion').doc('institucion')

        if (req.method === 'GET') {
          const documento = await ref.get()
          return json(res, 200, {
            ok: true,
            institucion: documento.exists ? documento.data() : null
          })
        }

        const datos = await body(req)
        const institution = String(datos.institution ?? '').trim()
        const campus = String(datos.campus ?? '').trim()
        const contact = String(datos.contact ?? '').trim().toLowerCase()
        const timezone = String(datos.timezone ?? '').trim()

        if (!institution || institution.length > 120 ||
            !campus || campus.length > 120 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ||
            contact.length > 160 ||
            !/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(timezone)) {
          return json(res, 400, {
            ok: false,
            message: 'Revisa el nombre, sede, correo y zona horaria.'
          })
        }

        const institucion = {
          institution,
          campus,
          contact,
          timezone,
          attendanceAlert: datos.attendanceAlert === true,
          closeClass: datos.closeClass === true,
          updatedAt: new Date().toISOString()
        }

        await ref.set(institucion)

        return json(res, 200, {
          ok: true,
          institucion,
          message: 'Configuracion institucional guardada.'
        })
      }
      // RUTA NO ENCONTRADA
      // =================================================

      return json(
        res,
        404,
        {
          ok: false,

          message:
            'Ruta no encontrada.',
        }
      )

    } catch (error) {

      console.error(
        'Error del servidor:',
        error
      )

      return json(
        res,
        500,
        {
          ok: false,

          message:
            'Error interno del servidor.',
        }
      )
    }
  }
).listen(
  PORT,

  async () => {

    console.log(
      `AsistIA API ejecutándose en http://localhost:${PORT}`
    )

    if (
      !GMAIL_USER ||
      !GMAIL_APP_PASSWORD
    ) {
      console.warn(
        'Gmail no está configurado correctamente en .env'
      )

      return
    }

    try {

      await mailer.verify()

      console.log(
        `Gmail conectado correctamente: ${GMAIL_USER}`
      )

    } catch (error) {

      console.error(
        'No se pudo conectar con Gmail:',
        error.message
      )

    }
  }
)


// ASISTIA_187_14_51_AUSENCIAS
// Registro de ausencias:
// - Requiere sesion Firebase verificada.
// - Solo docentes activos y autorizados.
// - Solo alumnos matriculados en cursos asignados.
// - Solo horarios confirmados y fecha permitida.
// - No debe coexistir ausencia y marcacion del mismo alumno/clase/fecha.
// - Las escrituras deben ser atomicas y auditadas.
// Estado: pendiente de conectar al controlador validado.







