
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);

export const LOCAL_MODEL = 'opencv-sface-2021dec-yunet-2023mar';

const python = fileURLToPath(
  new URL(
    process.platform === 'win32'
      ? '.venv/Scripts/python.exe'
      : '.venv/bin/python',
    root
  )
);

const script = fileURLToPath(
  new URL('local/face_engine.py', root)
);

export function localInstallationPresent() {
  return existsSync(python) &&
    [
      'face_detection_yunet_2023mar.onnx',
      'face_recognition_sface_2021dec.onnx'
    ].every(name =>
      existsSync(
        fileURLToPath(new URL('models/' + name, root))
      )
    );
}

export function validLocalReference(reference) {
  if (
    reference?.kind !== 'local-sface' ||
    reference.model !== LOCAL_MODEL ||
    !Array.isArray(reference.embedding) ||
    reference.embedding.length !== 128 ||
    reference.embedding.some(value => !Number.isFinite(value))
  ) {
    return false;
  }

  return Math.abs(
    Math.hypot(...reference.embedding) - 1
  ) < 0.001;
}

function run(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let out = '';
    let done = false;

    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();

      finish(
        Object.assign(
          Error('El motor local no respondió a tiempo.'),
          { status: 503 }
        )
      );
    }, 30000);

    child.on('error', () =>
      finish(
        Object.assign(
          Error('No se pudo iniciar el motor facial local.'),
          { status: 503 }
        )
      )
    );

    child.stdin.on('error', () => {});

    // Native diagnostics must never be forwarded to the client.
    child.stderr.on('data', () => {});

    child.stdout.on('data', chunk => {
      out += chunk.toString();

      if (out.length > 20000) {
        child.kill();
        finish(Error('Invalid engine output'));
      }
    });

    child.on('close', code => {
      let result;

      try {
        result = JSON.parse(out);
      } catch {
        return finish(
          Object.assign(
            Error('El motor local no está disponible.'),
            { status: 503 }
          )
        );
      }

      if (code !== 0 || result.error) {
        const errors = {
          NO_FACE_DETECTED:
            'El detector no pudo localizar un rostro con suficiente confianza en esta imagen.',

          MULTIPLE_FACES:
            'Se detectó más de un rostro. La foto debe mostrar solo a la persona que se enrola.',

          FACE_TOO_SMALL:
            'El rostro ocupa muy poco espacio para generar una plantilla fiable.',

          IMAGE_QUALITY:
            'La foto necesita mayor nitidez e iluminación uniforme.',

          INVALID_IMAGE:
            'La imagen no tiene un formato o tamaño válido.'
        };

        return finish(
          Object.assign(
            Error(
              errors[result.error] ||
              'No se pudo validar el motor o sus modelos locales.'
            ),
            {
              status: errors[result.error] ? 422 : 503
            }
          )
        );
      }

      finish(null, result);
    });

    child.stdin.end(JSON.stringify(input));
  });
}

// NUEVA FUNCIÓN: comparación facial mediante similitud coseno.
export function compareLocalReferences(referenceA, referenceB) {
  if (
    !validLocalReference(referenceA) ||
    !validLocalReference(referenceB)
  ) {
    throw Object.assign(
      Error('Las plantillas faciales no son válidas o compatibles.'),
      { status: 422 }
    );
  }

  const similarity = referenceA.embedding.reduce(
    (total, value, index) =>
      total + value * referenceB.embedding[index],
    0
  );

  return {
    model: LOCAL_MODEL,
    similarity: Math.max(-1, Math.min(1, similarity))
  };
}

export function createLocalProvider() {
  return {
    async health() {
      return run({ operation: 'health' });
    },

    // ASISTIA_PASO309
    async liveness(bytes) {
      if (!Buffer.isBuffer(bytes) ||
          bytes.length < 1000 ||
          bytes.length > 2000000) {
        throw Object.assign(Error('Captura no valida.'), {status:422});
      }

      const result = await run({
        operation: 'liveness',
        image: bytes.toString('base64')
      });

      if (result.model !== 'MiniFASNetV2' ||
          result.livenessEvaluated !== true ||
          typeof result.livenessCandidate !== 'boolean' ||
          !Number.isFinite(result.livenessScore) ||
          result.livenessScore < 0 ||
          result.livenessScore > 1) {
        throw Object.assign(Error('Evaluacion pasiva no disponible.'), {status:503});
      }

      return {
        evaluada: true,
        candidata: result.livenessCandidate,
        puntuacion: result.livenessScore,
        modelo: result.model
      };
    },

    async pose(bytes) {
      if (!Buffer.isBuffer(bytes) || bytes.length < 1000) {
        throw Object.assign(Error('Captura no valida.'), { status: 422 });
      }

      const result = await run({
        operation: 'pose',
        image: bytes.toString('base64')
      });

      if (result.faceDetected !== true ||
          !Number.isFinite(result.yaw) ||
          !Number.isFinite(result.confidence)) {
        throw Object.assign(Error('Posicion facial no valida.'), { status: 422 });
      }

      return result;
    },

    async enroll(bytes) {
      const reference = await run({
        operation: 'extract',
        image: bytes.toString('base64')
      });

      if (!validLocalReference(reference)) {
        throw Error('Invalid local template');
      }

      return reference;
    },

    // There is no second template store:
    // encrypted reference in SQLite is the template.
    async remove() {},
  };
}
