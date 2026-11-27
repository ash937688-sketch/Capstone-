import { getAuth } from "firebase-admin/auth";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rutaCredenciales = join(
  __dirname,
  "firebase-service-account.json"
);

const credenciales = JSON.parse(
  readFileSync(rutaCredenciales, "utf8")
);

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(credenciales),
  });

export const dbFirebase = getFirestore(app);
export const authFirebase = getAuth(app);

export default app;
