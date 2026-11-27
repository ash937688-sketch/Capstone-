import { permitirMarcacionBiometrica, validarSolicitudAsistencia } from './asistenciaFacialPolicy.js';

export async function registrarAsistenciaFacial(datos) {
  const v = datos.verificacion || {};
  const autorizacion = permitirMarcacionBiometrica({ consentimientoVigente: v.consentimientoVigente === true, identidadVinculada: v.identidadVinculada === true, pruebaDeVidaValidada: v.pruebaDeVidaValidada === true, comparacionCalibrada: v.comparacionCalibrada === true, autorizacionInstitucional: v.autorizacionInstitucional === true });
  if (!autorizacion.ok) throw Object.assign(new Error('Verificacion biometrica no autorizada.'), { status: 403 });
  const validacion = validarSolicitudAsistencia(datos);
  if (!validacion.ok) throw Object.assign(new Error('Solicitud academica invalida.'), { status: 400 });
  throw Object.assign(new Error('Integracion pendiente: falta evidencia biometrica validada por el servidor.'), { status: 503 });
}
