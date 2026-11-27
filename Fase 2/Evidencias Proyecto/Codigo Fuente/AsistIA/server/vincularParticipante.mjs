import { authFirebase, dbFirebase } from './firebaseAdmin.js';

export async function vincularParticipante(email, cursosSeleccionados) {
  email = String(email || '').trim().toLowerCase();

  if (!/^[^\s@]+@duocuc\.cl$/.test(email)) {
    throw Object.assign(Error('Correo institucional invalido.'), {status:400});
  }

  const usuario = await authFirebase.getUserByEmail(email);
  const uid = usuario.uid;

  if (usuario.disabled || !usuario.emailVerified) {
    throw Object.assign(Error('La cuenta debe estar activa y verificada.'), {status:403});
  }

  const perfilRef = dbFirebase.collection('usuarios').doc(uid);

  const demo = await dbFirebase.collection('usuarios')
    .doc('mfocD4TcwOfnApbXqQxJIezra4F3').get();

  const demoId = demo.data()?.alumnoId;

  if (!demoId) throw Error('No se encontro el alumno demo.');

  const matriculas = await dbFirebase.collection('matriculas')
    .where('alumnoId', '==', demoId).get();

  const disponibles = new Set(matriculas.docs
    .filter(d => d.data().estado === 'Activo' && d.data().esDemo === true)
    .map(d => d.data().cursoId));

  const cursos = Array.isArray(cursosSeleccionados)
    ? [...new Set(cursosSeleccionados)] : [];

  if (!cursos.length || cursos.some(id => !disponibles.has(id))) {
    throw Object.assign(Error('Selecciona asignaturas validas del piloto.'), {status:400});
  }

  const alumnoId = 'PILOTO_' + uid;
  const alumnoRef = dbFirebase.collection('alumnos').doc(alumnoId);

  await dbFirebase.runTransaction(async tx => {
    const actual = await tx.get(perfilRef);
    const ficha = await tx.get(alumnoRef);

    if (!actual.exists || actual.data().rol !== 'Alumno' ||
        actual.data().activo !== true) {
      throw Object.assign(Error('La cuenta no es un alumno activo.'), {status:403});
    }

    if (actual.data().alumnoId || ficha.exists) {
      throw Object.assign(Error('Ya existe una vinculacion. No se sobrescribiran datos.'), {status:409});
    }

    tx.create(alumnoRef, {
      firebaseUid: uid,
      nombre: actual.data().nombre || usuario.displayName || email,
      email,
      estado: 'Activo',
      esDemo: true,
      createdAt: new Date().toISOString()
    });

    tx.update(perfilRef, { alumnoId });

    for (const cursoId of cursos) {
      tx.create(dbFirebase.collection('matriculas').doc(alumnoId + '_' + cursoId), {
        alumnoId,
        cursoId,
        estado: 'Activo',
        esDemo: true
      });
    }
  });

  return { uid, alumnoId, matriculas: cursos.length };
}
