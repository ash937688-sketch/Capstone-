// AsistIA: reglas compartidas de asistencia. No activa reconocimiento biometrico.
export const ID_VALIDO = /^[A-Za-z0-9_-]{1,128}$/;
export const ESTADOS_VALIDOS = new Set(['Presente', 'Atrasado']);

export function fechaChile(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(ahora);
  const valor = tipo => partes.find(p => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function normalizarDia(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function validarSolicitudAsistencia({ alumnoId, horarioId, cursoId, fecha, estado, diaHorario }, ahora = new Date()) {
  if (![alumnoId, horarioId, cursoId].every(id => ID_VALIDO.test(String(id ?? ''))))
    return { ok: false, motivo: 'Identificadores invalidos' };
  if (!ESTADOS_VALIDOS.has(estado))
    return { ok: false, motivo: 'Estado invalido' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? '')) || fecha !== fechaChile(ahora))
    return { ok: false, motivo: 'Solo se admite la fecha actual de Chile' };
  const indice = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  if (normalizarDia(diaHorario) !== normalizarDia(dias[indice]))
    return { ok: false, motivo: 'Dia del horario no coincide' };
  return { ok: true, idMarcacion: `${alumnoId}_${horarioId}_${fecha}` };
}

export function permitirMarcacionBiometrica({ consentimientoVigente, identidadVinculada, pruebaDeVidaValidada, comparacionCalibrada, autorizacionInstitucional }) {
  return [consentimientoVigente, identidadVinculada, pruebaDeVidaValidada, comparacionCalibrada, autorizacionInstitucional].every(v => v === true);
}
