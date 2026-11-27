"""Offline stdin/stdout engine. Does not open sockets or write images/templates."""
import base64
import hashlib
import json
import sys
from pathlib import Path
import cv2
import numpy as np
cv2.setNumThreads(2)

ROOT = Path(__file__).resolve().parent.parent / 'models'
FILES = {
    'face_detection_yunet_2023mar.onnx': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    'face_recognition_sface_2021dec.onnx': '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
}

def main():
    for name, digest in FILES.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
            raise ValueError('MODEL_INTEGRITY')
    request = json.loads(sys.stdin.buffer.read(2_800_000))
    if request.get('operation') == 'health':
        print(json.dumps({'ready': True, 'opencv': cv2.__version__, 'model': 'opencv-sface-2021dec-yunet-2023mar', 'dimensions': 128}))
        return
    raw = base64.b64decode(request['image'], validate=True)
    if len(raw) > 2_000_000:
        raise ValueError('INVALID_IMAGE')
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if image is None or min(image.shape[:2]) < 480 or max(image.shape[:2]) > 1280:
        raise ValueError('INVALID_IMAGE')
    # YuNet is scale-sensitive. Detect at its working resolution and at the
    # original resolution; align/extract from the unchanged full-quality image.
    candidates = []
    for longest in sorted(set([min(640, max(image.shape[:2])), max(image.shape[:2])])):
        scale = longest / max(image.shape[:2])
        resized = cv2.resize(image, (round(image.shape[1]*scale), round(image.shape[0]*scale)))
        detector = cv2.FaceDetectorYN.create(str(ROOT / 'face_detection_yunet_2023mar.onnx'), '', (resized.shape[1], resized.shape[0]), 0.9, 0.3, 5000)
        _, faces = detector.detect(resized)
        if faces is not None and len(faces) > 1:
            raise ValueError('MULTIPLE_FACES')
        if faces is not None and len(faces) == 1:
            face = faces[0].copy()
            face[:14:2] *= image.shape[1] / resized.shape[1]
            face[1:14:2] *= image.shape[0] / resized.shape[0]
            candidates.append(face)
    if not candidates:
        raise ValueError('NO_FACE_DETECTED')
    face = max(candidates, key=lambda candidate: float(candidate[-1]))
    if min(face[2], face[3]) < 100:
        raise ValueError('FACE_TOO_SMALL')
    eye_a = face[4:6]
    eye_b = face[6:8]
    nose = face[8:10]
    eye_center = (eye_a + eye_b) / 2
    eye_distance = float(np.linalg.norm(eye_b - eye_a))

    if request.get('operation') == 'pose':
        if eye_distance < 10:
            raise ValueError('IMAGE_QUALITY')

        axis = (eye_b - eye_a) / eye_distance
        yaw = float(np.dot(nose - eye_center, axis) / eye_distance)

        print(json.dumps({
            'faceDetected': True,
            'yaw': yaw,
            'confidence': float(face[-1])
        }))
        return

    # ASISTIA_PASO306_LIVENESS
    if request.get('operation') == 'liveness':
        model_path = ROOT / 'MiniFASNetV2.onnx'
        expected = 'b32929adc2d9c34b9486f8c4c7bc97c1b69bc0ea9befefc380e4faae4e463907'

        if hashlib.sha256(model_path.read_bytes()).hexdigest() != expected:
            raise ValueError('MODEL_INTEGRITY')

        h, w = image.shape[:2]
        x, y, bw, bh = map(int, face[:4])
        scale = min((h - 1) / bh, (w - 1) / bw, 2.7)

        cx, cy = x + bw / 2, y + bh / 2
        nw, nh = bw * scale, bh * scale

        x1 = max(0, int(cx - nw / 2))
        y1 = max(0, int(cy - nh / 2))
        x2 = min(w - 1, int(cx + nw / 2))
        y2 = min(h - 1, int(cy + nh / 2))

        crop = image[y1:y2+1, x1:x2+1]

        if crop.size == 0:
            raise ValueError('IMAGE_QUALITY')

        crop = cv2.resize(crop, (80, 80))
        tensor = np.ascontiguousarray(
            crop.astype(np.float32).transpose(2, 0, 1)[None]
        )

        net = cv2.dnn.readNetFromONNX(str(model_path))
        net.setInput(tensor)
        logits = net.forward().reshape(-1).astype(np.float64)

        if logits.size != 3 or not np.isfinite(logits).all():
            raise ValueError('INVALID_FEATURE')

        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()

        score = float(probabilities[1])
        real = bool(np.argmax(probabilities) == 1 and score >= 0.90)

        print(json.dumps({
            'model': 'MiniFASNetV2',
            'livenessEvaluated': True,
            'livenessCandidate': real,
            'livenessScore': score,
            'experimental': True,
            'pruebaDeVidaValidada': False
        }))
        return

    recognizer = cv2.FaceRecognizerSF.create(str(ROOT / 'face_recognition_sface_2021dec.onnx'), '')
    aligned = recognizer.alignCrop(image, face)
    aligned_gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
    # Basic rejection heuristics, not biometric accuracy/PAD certification.
    # Measure on the canonical 112px aligned face, never on arbitrarily sized
    # phone crops. Laplacian variance otherwise changes with capture resolution.
    if float(aligned_gray.mean()) < 35 or float(aligned_gray.mean()) > 225 or float(cv2.Laplacian(aligned_gray, cv2.CV_64F).var()) < 25:
        raise ValueError('IMAGE_QUALITY')
    embedding = recognizer.feature(aligned).reshape(-1).astype(np.float32)
    norm = float(np.linalg.norm(embedding))
    if embedding.size != 128 or not np.isfinite(embedding).all() or norm < 1e-8:
        raise ValueError('INVALID_FEATURE')
    embedding /= norm
    print(json.dumps({'kind': 'local-sface', 'model': 'opencv-sface-2021dec-yunet-2023mar', 'embedding': embedding.tolist()}))

try:
    main()
except ValueError as error:
    allowed = {'MODEL_INTEGRITY', 'INVALID_IMAGE', 'NO_FACE_DETECTED', 'MULTIPLE_FACES', 'FACE_TOO_SMALL', 'IMAGE_QUALITY', 'INVALID_FEATURE'}
    code = str(error) if str(error) in allowed else 'INVALID_INPUT'
    print(json.dumps({'error': code}))
    sys.exit(2)
except Exception:
    # Never echo participant input or sensitive vectors in diagnostics.
    print(json.dumps({'error': 'ENGINE_UNAVAILABLE'}))
    sys.exit(3)
