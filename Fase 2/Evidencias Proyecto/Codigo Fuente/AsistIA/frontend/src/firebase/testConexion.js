
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "./firebase";

export async function probarConexionFirebase() {
  try {
    const consulta = query(collection(db, "prueba_conexion"), limit(1));
    const resultado = await getDocs(consulta);

    console.log("Firebase respondió correctamente:", resultado.size);
    return true;
  } catch (error) {
    console.error("Error al consultar Firebase:", error.code, error.message);
    return false;
  }
}
