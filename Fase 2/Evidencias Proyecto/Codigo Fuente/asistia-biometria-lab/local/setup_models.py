"""Download only public OpenCV models/licenses; never reads participant data."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent / 'models'
MODELS = {
    'face_detection_yunet_2023mar.onnx': ('face_detection_yunet', '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'),
    'face_recognition_sface_2021dec.onnx': ('face_recognition_sface', '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79'),
}
ROOT.mkdir(exist_ok=True)
manifest = {}
for name, (directory, expected) in MODELS.items():
    target = ROOT / name
    url = f'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/{directory}/{name}'
    data = target.read_bytes() if target.exists() else urlopen(url, timeout=90).read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected:
        raise RuntimeError(f'Integrity verification failed: {name}')
    target.write_bytes(data)
    license_url = f'https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/{directory}/LICENSE'
    license_data = urlopen(license_url, timeout=30).read()
    (ROOT / f'{directory}.LICENSE').write_bytes(license_data)
    manifest[name] = {'sha256': digest, 'source': url, 'license_source': license_url}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'models_verified': len(manifest)}))
