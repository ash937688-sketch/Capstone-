import { authFirebase, dbFirebase } from "./firebaseAdmin.js";

export async function verificarUsuarioFirebase(req) {
  const encabezado = String(req.headers.authorization || "");

  if (!encabezado.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      message: "No se proporciono un token de autenticacion."
    };
  }

  const token = encabezado.slice(7).trim();

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "El token esta vacio."
    };
  }

  try {
    const identidad = await authFirebase.verifyIdToken(token, true);

    if (!identidad.email_verified) {
      return {
        ok: false,
        status: 403,
        message: "Debes verificar tu correo electronico."
      };
    }

    const documento = await dbFirebase
      .collection("usuarios")
      .doc(identidad.uid)
      .get();

    if (!documento.exists) {
      return {
        ok: false,
        status: 403,
        message: "Tu cuenta no tiene un perfil autorizado."
      };
    }

    const perfil = documento.data() || {};

    if (perfil.activo !== true) {
      return {
        ok: false,
        status: 403,
        message: "Tu cuenta esta deshabilitada."
      };
    }

    const rolesPermitidos = [
      "Administradora",
      "Docente",
      "Alumno"
    ];

    if (!rolesPermitidos.includes(perfil.rol)) {
      return {
        ok: false,
        status: 403,
        message: "El perfil no tiene un rol valido."
      };
    }

    return {
      ok: true,
      uid: identidad.uid,
      user: {
        id: identidad.uid,
        name: String(perfil.nombre || identidad.name || ""),
        email: String(identidad.email || ""),
        role: perfil.rol,
        scope: perfil.alcance || null,
        activo: true
      }
    };
  } catch (error) {
    console.error(
      "Error al verificar Firebase Authentication:",
      error.code || error.message
    );

    return {
      ok: false,
      status: 401,
      message: "No fue posible verificar la sesion."
    };
  }
}

export async function requerirRolFirebase(req, rolesPermitidos) {
  const autenticacion = await verificarUsuarioFirebase(req);

  if (!autenticacion.ok) {
    return autenticacion;
  }

  if (!rolesPermitidos.includes(autenticacion.user.role)) {
    return {
      ok: false,
      status: 403,
      message: "No tienes permisos para esta operacion."
    };
  }

  return autenticacion;
}
