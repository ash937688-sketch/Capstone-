
# AsistIA

## Sistema inteligente de verificación de identidad y gestión de asistencia académica

**Proyecto APT – Capstone 2026**  
**Ingeniería en Informática – Duoc UC, Sede San Bernardo**

---

## 1. Descripción del proyecto

AsistIA es un Proyecto de Aplicación Profesional (APT) desarrollado en la asignatura Capstone de la carrera de Ingeniería en Informática de Duoc UC, sede San Bernardo.

El proyecto consiste en el desarrollo de un Producto Mínimo Viable (MVP) orientado a mejorar la confiabilidad, seguridad y trazabilidad del registro de asistencia académica mediante mecanismos de verificación de identidad, validación del contexto académico y gestión digital de las marcaciones.

La solución integra una aplicación web adaptable a dispositivos móviles, autenticación y control de acceso por roles, gestión académica, reconocimiento facial, verificación mediante PIN dinámico, registro de asistencia y paneles de consulta.

El desarrollo se organiza mediante la metodología **Scrum**, utilizando seis sprints de trabajo, con apoyo de herramientas como Jira, GitHub y Visual Studio Code.

---

## 2. Problema que aborda

Los mecanismos tradicionales de registro de asistencia académica pueden presentar dificultades relacionadas con:

- Suplantación de identidad entre estudiantes.
- Marcaciones realizadas sin una verificación suficiente.
- Falta de trazabilidad de los registros.
- Procesos manuales que dificultan la supervisión.
- Limitaciones para consultar y administrar la información académica.

AsistIA aborda esta problemática mediante una solución tecnológica que combina verificación de identidad, validación académica y registro digital de asistencia.

---

## 3. Objetivo general

Desarrollar un sistema inteligente de gestión de asistencia académica que permita fortalecer la confiabilidad de las marcaciones mediante mecanismos de autenticación, reconocimiento facial, verificación alternativa de identidad, validación académica y trazabilidad de los registros.

## 4. Objetivos específicos

- Implementar un sistema de autenticación y gestión de usuarios.
- Establecer permisos diferenciados para estudiantes, docentes y administradores.
- Desarrollar mecanismos de enrolamiento y reconocimiento facial.
- Incorporar una alternativa de verificación mediante PIN dinámico.
- Gestionar información de cursos, asignaturas, horarios y sesiones académicas.
- Implementar funcionalidades para registrar y consultar asistencia.
- Desarrollar interfaces web adaptables a computadores y dispositivos móviles.
- Integrar los componentes mediante servicios de backend y bases de datos.
- Realizar pruebas funcionales y de integración.
- Documentar los resultados y evidencias del desarrollo.

---

## 5. Usuarios del sistema

AsistIA contempla tres perfiles principales:

### 5.1. Administrador

Responsable de la gestión institucional de usuarios y de las funcionalidades administrativas autorizadas.

Funciones contempladas:

- Administrar usuarios.
- Aprobar solicitudes de registro.
- Activar, desactivar y eliminar cuentas según permisos.
- Gestionar información académica.
- Consultar registros y resultados del sistema.

### 5.2. Docente

Usuario encargado de supervisar la información académica y los registros de asistencia correspondientes a sus asignaturas.

Funciones contempladas:

- Acceder mediante su cuenta institucional.
- Consultar información de asignaturas y sesiones.
- Revisar asistencia de estudiantes.
- Visualizar información y resúmenes académicos.

### 5.3. Estudiante

Usuario que accede a las funcionalidades habilitadas para su perfil.

Funciones contempladas:

- Registrarse mediante correo institucional.
- Activar su cuenta.
- Iniciar sesión.
- Realizar el proceso de enrolamiento facial.
- Utilizar los mecanismos de verificación de identidad.
- Registrar y consultar asistencia.

El acceso a cada funcionalidad se controla mediante permisos asociados al rol correspondiente.

---

## 6. Funcionalidades principales del MVP

### 6.1. Gestión de usuarios y autenticación

- Registro institucional de usuarios.
- Validación de dominios de correo autorizados.
- Solicitudes de registro pendientes de aprobación.
- Aprobación administrativa de cuentas.
- Envío de correos de activación.
- Activación mediante enlace temporal.
- Creación de contraseña por el usuario.
- Inicio de sesión.
- Control de acceso basado en roles.
- Administración de usuarios.
- Desactivación, reactivación y eliminación de cuentas.

### 6.2. Verificación mediante PIN dinámico

- Generación de PIN temporal de seis dígitos.
- Vigencia de cinco minutos.
- Validación del código.
- Control de expiración.
- Prevención de reutilización.
- Integración como mecanismo alternativo de verificación.

### 6.3. Gestión académica

- Gestión de información de estudiantes.
- Gestión de información de docentes.
- Administración de cursos y asignaturas.
- Organización de horarios y sesiones.
- Asociación de estudiantes con información académica.
- Validación del contexto de una clase.

### 6.4. Identificación facial

- Enrolamiento facial.
- Captura del rostro mediante cámara.
- Detección facial.
- Extracción de características biométricas.
- Almacenamiento protegido de plantillas faciales.
- Comparación con la identidad previamente registrada.
- Verificación de presencia real (*liveness detection*).
- Integración del resultado biométrico con el flujo de asistencia.

### 6.5. Registro de asistencia

- Verificación de identidad.
- Comprobación de clase activa.
- Validación de información académica.
- Asociación de la marcación al estudiante.
- Registro de fecha y hora.
- Confirmación de la asistencia.
- Consulta y trazabilidad de marcaciones.

### 6.6. Dashboard y consultas

- Interfaces diferenciadas por rol.
- Consulta de asistencia del estudiante.
- Revisión de asistencia por clase.
- Gestión académica desde el dashboard.
- Resúmenes de asistencia.
- Visualización de información relevante para docentes y administradores.

---

## 7. Arquitectura de la solución

AsistIA utiliza una arquitectura que separa la interfaz de usuario, la lógica de negocio, los servicios de backend y el almacenamiento de información.

### 7.1. Frontend

Desarrollado mediante **React y Vite**, permitiendo construir una aplicación web moderna, modular y adaptable a distintos dispositivos.

### 7.2. Backend

Desarrollado mediante **Node.js y Express**, encargado de:

- Procesar solicitudes del frontend.
- Gestionar autenticación y autorización.
- Aplicar reglas de negocio.
- Administrar usuarios.
- Procesar verificaciones.
- Coordinar registros de asistencia.
- Comunicarse con los servicios de almacenamiento.

### 7.3. Bases de datos

Durante el desarrollo se han utilizado:

- **SQLite:** almacenamiento local y pruebas de integración.
- **Cloud Firestore:** almacenamiento de información en componentes del proyecto.
- **Firebase Realtime Database:** servicios utilizados en componentes del prototipo.

La configuración definitiva depende del entorno y de los componentes integrados en la versión final.

### 7.4. Reconocimiento facial

El componente biométrico utiliza tecnologías de visión computacional:

- OpenCV.
- YuNet para detección facial.
- SFace para extracción y comparación de características.
- Plantillas biométricas protegidas.
- Servicios de procesamiento y verificación.

### 7.5. Interfaces

La solución contempla:

- Aplicación web adaptable a dispositivos móviles.
- Interfaz de identificación y marcación.
- Panel para estudiantes.
- Dashboard para docentes.
- Panel de administración.

---

## 8. Tecnologías y herramientas

| Categoría | Tecnología |
|---|---|
| Frontend | React |
| Herramienta frontend | Vite |
| Lenguaje | JavaScript |
| Backend | Node.js |
| Framework backend | Express |
| Autenticación y servicios | Firebase Authentication |
| Base de datos en la nube | Cloud Firestore |
| Servicios de datos | Firebase Realtime Database |
| Base de datos local | SQLite |
| Visión computacional | OpenCV |
| Detección facial | YuNet |
| Reconocimiento facial | SFace |
| Gestión ágil | Jira |
| Control de versiones | Git y GitHub |
| Editor de código | Visual Studio Code |

---

## 9. Metodología de desarrollo

El proyecto utiliza **Scrum** como marco de trabajo para organizar el desarrollo de manera iterativa e incremental.

La planificación se apoya en:

- Product Backlog.
- Historias de usuario.
- Criterios de aceptación.
- Sprint Backlog.
- Seis sprints de desarrollo.
- EDT/WBS.
- Carta Gantt.
- Seguimiento mediante Jira.
- Control de versiones mediante GitHub.
- Evidencias de avance.
- Pruebas funcionales y de integración.

De manera complementaria, se contempla el uso de prácticas de Desarrollo Guiado por Pruebas (TDD) en funcionalidades cuya lógica pueda verificarse mediante pruebas automatizadas.

---

## 10. Planificación y desarrollo de sprints

El proyecto contempla seis sprints organizados entre septiembre y noviembre de 2026.

| Sprint | Nombre | Período | Puntos planificados |
|---|---|---|---|
| Sprint 1 | Gestión de usuarios | 10 al 23 de septiembre | 9 |
| Sprint 2 | Verificación mediante PIN | 24 de septiembre al 7 de octubre | 14 |
| Sprint 3 | Gestión académica | 9 al 21 de octubre | 8 |
| Sprint 4 | Identificación facial | 22 de octubre al 4 de noviembre | 21 |
| Sprint 5 | Registro de asistencia | 5 al 18 de noviembre | 12 |
| Sprint 6 | Consulta y dashboard | 19 al 29 de noviembre | 14 |
| **Total** | **6 sprints** | **Septiembre–noviembre 2026** | **78 puntos** |

Los puntos corresponden a la estimación planificada y no representan por sí solos la cantidad de puntos efectivamente completados.

### Sprint 1: Gestión de usuarios

**Período:** 10 al 23 de septiembre de 2026.  
**Puntos planificados:** 9.

**Objetivo:** desarrollar las funcionalidades fundamentales para la administración de usuarios y el acceso a AsistIA.

Actividades:

- Implementación de autenticación.
- Registro de usuarios institucionales.
- Definición de roles.
- Control de acceso.
- Administración de cuentas.

**Resultado del desarrollo:** implementación de funcionalidades de autenticación, registro, activación y administración de usuarios.

### Sprint 2: Verificación mediante PIN

**Período:** 24 de septiembre al 7 de octubre de 2026.  
**Puntos planificados:** 14.

**Objetivo:** implementar un mecanismo alternativo de verificación de identidad mediante códigos temporales.

Actividades:

- Generación de PIN.
- Validación del código.
- Control de vigencia.
- Prevención de reutilización.
- Integración con los servicios de verificación.

**Resultado del desarrollo:** prototipo de generación y validación de PIN temporal.

### Sprint 3: Gestión académica

**Período:** 9 al 21 de octubre de 2026.  
**Puntos planificados:** 8.

**Objetivo:** desarrollar las estructuras y funcionalidades necesarias para administrar la información académica.

Actividades:

- Gestión de información de estudiantes y docentes.
- Organización de cursos.
- Administración de asignaturas.
- Definición de horarios y sesiones.
- Preparación de validaciones académicas.

**Resultado del desarrollo:** estructuras y componentes de gestión académica para apoyar el registro de asistencia.

### Sprint 4: Identificación facial

**Período:** 22 de octubre al 4 de noviembre de 2026.  
**Puntos planificados:** 21.

**Objetivo:** desarrollar los mecanismos de identificación biométrica del estudiante.

Historias de usuario:

- **HU-05:** Registro facial.
- **HU-06:** Identificación facial mediante tótem.
- **HU-07:** Verificación de presencia real (*liveness detection*).

Actividades:

- Enrolamiento facial.
- Captura de imágenes.
- Detección del rostro.
- Extracción de características biométricas.
- Comparación facial.
- Desarrollo de controles de presencia real.
- Integración con el sistema.

**Resultado del desarrollo:** componente de enrolamiento y reconocimiento facial, sujeto a validación integral de la captura móvil y de los controles contra suplantación.

### Sprint 5: Registro de asistencia

**Período:** 5 al 18 de noviembre de 2026.  
**Puntos planificados:** 12.

**Objetivo:** desarrollar el flujo de registro de asistencia asociado a la identidad y al contexto académico.

Historias de usuario:

- **HU-11:** Comprobar clase activa.
- **HU-12:** Registrar asistencia con información académica.
- **HU-13:** Confirmar la marcación.

Actividades:

- Validación de clase activa.
- Asociación del estudiante a la sesión.
- Implementación de reglas de marcación.
- Confirmación del registro.
- Integración con los mecanismos de identificación.

**Resultado del desarrollo:** flujo de registro de asistencia preparado para su validación integral con el reconocimiento facial.

### Sprint 6: Consulta y dashboard

**Período:** 19 al 29 de noviembre de 2026.  
**Puntos planificados:** 14.

**Objetivo:** desarrollar las funcionalidades de consulta y visualización de información académica y asistencia.

Historias de usuario:

- **HU-15:** Consultar asistencia.
- **HU-17:** Revisar asistencia de una clase.
- **HU-18:** Gestionar información académica mediante dashboard.
- **HU-19:** Visualizar resumen de asistencia.

Actividades:

- Desarrollo de interfaces de consulta.
- Visualización de información por rol.
- Dashboard académico.
- Resúmenes de asistencia.
- Pruebas funcionales.
- Validación de integración.

**Resultado esperado al cierre:** funcionalidades de consulta y dashboard integradas al MVP, con información proveniente de registros de asistencia validados.

---

## 11. Equipo de trabajo

### Ashly Tapia

**Rol:** Scrum Master y Developer.

Responsabilidades:

- Coordinación y seguimiento del equipo.
- Gestión de actividades Scrum.
- Prototipo de tótem.
- Reconocimiento facial.
- Liveness detection.
- Seguridad.
- Integración y pruebas.

### Francisco Ossandón

**Rol:** Developer.

Responsabilidades:

- Diseño e implementación de bases de datos.
- Desarrollo de backend.
- Implementación de servicios de API.
- Generación y validación del PIN dinámico.
- Reglas de registro de asistencia.
- Control de acceso basado en roles.
- Auditoría y trazabilidad.
- Integración entre componentes.
- Pruebas técnicas.

### Fernanda Fernández

**Rol:** Product Owner y Developer.

Responsabilidades:

- Organización y priorización del Product Backlog.
- Definición de requerimientos.
- Aplicación web para estudiantes.
- Dashboard para docentes y administradores.
- Desarrollo de interfaces.
- Criterios de aceptación.
- Validación funcional y de usabilidad.

---

## 12. Ejecución local

### Requisitos

- Node.js.
- npm.
- Visual Studio Code u otro editor compatible.
- Configuración de variables de entorno.
- Dependencias correspondientes a los servicios utilizados.

### Backend

Ingresar a la carpeta del backend:

```bash
cd server
npm install
npm start
```

### Frontend

Ingresar a la carpeta del frontend:

```bash
cd frontend
npm install
npm run dev
```

La aplicación frontend normalmente estará disponible en:

```text
http://localhost:5173/
```

La dirección y los comandos pueden variar según la configuración del proyecto.

### Consideraciones de ejecución

- Configurar las variables de entorno necesarias.
- Mantener las credenciales fuera del repositorio público.
- Verificar la conexión entre frontend y backend.
- Configurar los servicios de almacenamiento utilizados.
- Habilitar un contexto seguro para el uso de la cámara desde dispositivos móviles.
- Instalar las dependencias del componente biométrico.

---

## 13. Estructura del repositorio

El repositorio se organiza de acuerdo con las fases del Proyecto APT.

### Fase 1: Definición y planificación

Documentación relacionada con:

- Definición del problema.
- Justificación.
- Objetivos.
- Alcance.
- Factibilidad.
- Product Backlog.
- EDT/WBS.
- Carta Gantt.
- Roles y responsabilidades.
- Planificación del desarrollo.

### Fase 2: Desarrollo y evidencias

Documentación y evidencias relacionadas con:

- Implementación del proyecto.
- Seguimiento de sprints.
- Evidencias grupales.
- Evidencias individuales.
- Desarrollo técnico.
- Pruebas funcionales.
- Resultados obtenidos.

### Fase 3: Validación y cierre

Documentación relacionada con:

- Validación del MVP.
- Evaluación de resultados.
- Evidencias finales.
- Conclusiones.
- Reflexiones del proyecto.
- Presentación académica.
- Cierre del Proyecto APT.

---

## 14. Pruebas y validación

El desarrollo de AsistIA considera pruebas sobre los siguientes componentes:

- Registro y autenticación de usuarios.
- Activación de cuentas.
- Control de acceso por roles.
- Administración de usuarios.
- Generación y validación de PIN.
- Comunicación entre frontend y backend.
- Operaciones de bases de datos.
- Enrolamiento facial.
- Detección y comparación de rostros.
- Validación del contexto académico.
- Registro y confirmación de asistencia.
- Consulta de registros.
- Visualización de información en dashboards.

### Flujo integral de asistencia

El flujo funcional previsto para el MVP es:

1. El estudiante accede a AsistIA.
2. Se habilita la cámara del dispositivo.
3. Se captura el rostro del estudiante.
4. El sistema procesa la imagen.
5. Se compara el rostro con la plantilla previamente enrolada.
6. Se verifica la identidad y se aplican los controles de seguridad.
7. Se valida la sesión académica correspondiente.
8. Se registra la asistencia.
9. Se muestra la confirmación.
10. El registro queda disponible para consulta.

Este flujo constituye el criterio principal de validación de la integración final del sistema.

---

## 15. Seguridad y protección de datos

AsistIA considera medidas de seguridad debido al tratamiento de información personal, académica y biométrica.

Entre ellas:

- Autenticación de usuarios.
- Autorización basada en roles.
- Validación de correos institucionales.
- Activación mediante enlaces temporales.
- Restricción de operaciones administrativas.
- Control de vigencia del PIN.
- Protección de credenciales.
- Almacenamiento protegido de plantillas biométricas.
- Trazabilidad de operaciones.
- Controles de prevención de suplantación.

El uso del reconocimiento facial en un entorno institucional real requiere validar los controles biométricos, las condiciones de seguridad y el tratamiento adecuado de los datos personales.

---

## 16. Estado y cierre del proyecto

**Proyecto:** AsistIA.  
**Etapa académica:** Fase 3 – Validación y cierre.  
**Período de desarrollo:** septiembre a noviembre de 2026.  
**Sprints planificados:** 6.  
**Fecha de cierre planificada:** última semana de noviembre de 2026.

El MVP contempla la integración de:

- Gestión de usuarios y roles.
- Autenticación institucional.
- Verificación mediante PIN.
- Gestión académica.
- Enrolamiento y reconocimiento facial.
- Registro de asistencia.
- Consultas y dashboards.
- Servicios de backend.
- Bases de datos.
- Seguridad y trazabilidad.

### Criterio de finalización

El proyecto se considerará técnicamente finalizado una vez que se hayan completado y validado las funcionalidades comprometidas para el MVP, especialmente la identificación facial desde un dispositivo móvil y su integración con el registro de asistencia.

La finalización de los seis sprints y la documentación de las pruebas permitirán respaldar el cierre académico del proyecto.

---

## 17. Proyección futura

AsistIA se desarrolla como un prototipo académico con posibilidades de evolución.

Entre las mejoras futuras se consideran:

- Fortalecimiento del reconocimiento facial.
- Optimización de los controles de presencia real.
- Mejoras de seguridad biométrica.
- Ampliación de los reportes académicos.
- Estadísticas de asistencia.
- Automatización de procesos.
- Pruebas de rendimiento.
- Escalabilidad.
- Evaluación de despliegue institucional.

---

## 18. Información académica

**Nombre del proyecto:** AsistIA  
**Asignatura:** Capstone – Proyecto APT  
**Carrera:** Ingeniería en Informática  
**Institución:** Duoc UC  
**Sede:** San Bernardo  
**Año:** 2026  
**Metodología:** Scrum  
**Cantidad de sprints:** 6  
**Duración de planificación general:** 16 semanas  

---

**AsistIA – Proyecto APT Capstone 2026**  
**Ingeniería en Informática – Duoc UC, Sede San Bernardo**

*Tecnología e innovación para una gestión de asistencia académica más confiable.*
