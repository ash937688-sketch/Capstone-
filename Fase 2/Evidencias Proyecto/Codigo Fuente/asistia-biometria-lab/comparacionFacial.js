import {
  createLocalProvider,
  compareLocalReferences,
  validLocalReference
} from './localBiometricProvider.js';

export async function compararRostro(imageBytes, reference) {
  if (!Buffer.isBuffer(imageBytes) || imageBytes.length < 1000) {
    throw Object.assign(Error('La captura facial no es valida.'), { status: 422 });
  }

  if (!validLocalReference(reference)) {
    throw Object.assign(Error('La plantilla enrolada no es valida.'), { status: 422 });
  }

  const provider = createLocalProvider();
  const captura = await provider.enroll(imageBytes);

  if (!validLocalReference(captura)) {
    throw Object.assign(Error('No se pudo generar la plantilla de la captura.'), { status: 422 });
  }

  const resultado = compareLocalReferences(reference, captura);

  return {
    modelo: resultado.model,
    similitud: resultado.similarity,
    umbral: 0.50,
    coincidenciaFacial: Number.isFinite(resultado.similarity)
      && resultado.similarity >= 0.50
  };
}