import { consultarLaboratorioFacial } from "./asistenciaFacialLab.js";

export async function consultarEstadoIntegracionFacial() {
  const laboratorio = await consultarLaboratorioFacial(process.env.ASISTIA_FACIAL_LAB_URL);
  return {
    laboratorioConectado: laboratorio.conectado,
    reconocimientoDisponible: laboratorio.reconocimientoDisponible,
    pruebaDeVidaDisponible: laboratorio.pruebaDeVidaDisponible,
    marcacionHabilitada: false,
    motivo: laboratorio.motivo
  };
}
