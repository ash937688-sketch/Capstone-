
import { dbFirebase } from "./firebaseAdmin.js";

async function probarConexion() {
  try {
    const referencia = dbFirebase.collection("prueba_conexion");

    await referencia.doc("estado").set({
      proyecto: "AsistIA",
      estado: "Conectado",
      fecha: new Date().toISOString(),
    });

    const documento = await referencia.doc("estado").get();

    console.log("Firebase conectado correctamente.");
    console.log("Datos guardados:", documento.data());

  } catch (error) {
    console.error("Error de conexión con Firebase:");
    console.error(error.code || error.message);
    process.exitCode = 1;
  }
}

probarConexion();
