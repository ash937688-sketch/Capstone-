// Adaptador de diagnostico seguro: no transmite rostros, tokens ni identificadores.
export function interpretarInfoLaboratorio(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info))
    return { conectado:false, reconocimientoDisponible:false, pruebaDeVidaDisponible:false, motivo:'Respuesta no valida' };
  return {
    conectado:true,
    reconocimientoDisponible:info.recognition === true,
    pruebaDeVidaDisponible:info.pad === true,
    motivo:info.recognition === true && info.pad === true ? 'Requiere validacion institucional adicional' : 'Reconocimiento o prueba de vida no habilitados'
  };
}
export async function consultarLaboratorioFacial(url, fetchImpl = fetch) {
  // Solo conexiones loopback HTTP, para evitar SSRF y exposicion de biometria.
  let destino;
  try { destino = new URL(url); } catch { return {conectado:false,reconocimientoDisponible:false,pruebaDeVidaDisponible:false,motivo:'ASISTIA_FACIAL_LAB_URL no configurada'}; }
  if (destino.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(destino.hostname) ||
      destino.username || destino.password || destino.search || destino.hash || destino.pathname !== '/')
    return {conectado:false,reconocimientoDisponible:false,pruebaDeVidaDisponible:false,motivo:'URL de laboratorio no permitida'};
  try {
    const response = await fetchImpl(new URL('/api/info',destino), {method:'GET',redirect:'error',signal:AbortSignal.timeout(1500)});
    if (!response.ok) throw new Error('HTTP no disponible');
    return interpretarInfoLaboratorio(await response.json());
  } catch {
    return {conectado:false,reconocimientoDisponible:false,pruebaDeVidaDisponible:false,motivo:'Laboratorio no accesible'};
  }
}
