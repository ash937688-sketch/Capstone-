import { createLocalProvider } from './localBiometricProvider.js';
import { compararRostro } from './comparacionFacial.js';

export async function comprobarMovimiento(inicial, final, referencia, direccion) {
  if (!['izquierda', 'derecha'].includes(direccion)) {
    throw Object.assign(Error('Desafio no valido.'), { status: 422 });
  }

  const provider = createLocalProvider();

  const [poseA, poseB, rostroA, rostroB] = await Promise.all([
    provider.pose(inicial),
    provider.pose(final),
    compararRostro(inicial, referencia),
    compararRostro(final, referencia)
  ]);

  const cambio = poseB.yaw - poseA.yaw;
  const movimiento = direccion === 'izquierda'
    ? cambio <= -0.12
    : cambio >= 0.12;

  return {
    movimientoDetectado: movimiento,
    coincidenciaFacial:
      rostroA.coincidenciaFacial &&
      rostroB.coincidenciaFacial,
    cambioOrientacion: cambio,
    similitudInicial: rostroA.similitud,
    similitudFinal: rostroB.similitud,
    pruebaExperimental: true,
    pruebaDeVidaValidada: false
  };
}