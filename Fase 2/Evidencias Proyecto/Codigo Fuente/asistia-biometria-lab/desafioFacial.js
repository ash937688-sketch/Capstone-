import { randomUUID, randomInt } from 'node:crypto';

const desafios = new Map();

export function crearDesafio(email) {
  const ahora = Date.now();
  const correo = String(email).trim().toLowerCase();

  for (const [id, desafio] of desafios) {
    if (desafio.expira <= ahora || desafio.email === correo) {
      desafios.delete(id);
    }
  }

  const id = randomUUID();
  const direccion = randomInt(2) === 0
    ? 'izquierda'
    : 'derecha';

  const expira = ahora + 30000;

  desafios.set(id, {
    email: correo,
    direccion,
    expira
  });

  return { id, direccion, expira };
}

export function consumirDesafio(id, email) {
  const desafio = desafios.get(id);
  const correo = String(email).trim().toLowerCase();

  if (!desafio ||
      desafio.email !== correo ||
      desafio.expira <= Date.now()) {
    throw Object.assign(
      Error('Desafio facial invalido o vencido.'),
      { status: 422 }
    );
  }

  desafios.delete(id);

  return desafio;
}