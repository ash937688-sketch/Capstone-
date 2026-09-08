# AsistIA

## Sistema inteligente de verificación de identidad y gestión de asistencia

AsistIA es un Proyecto APT desarrollado en la asignatura Capstone de la carrera de Ingeniería en Informática de Duoc UC, sede San Bernardo.

El proyecto propone el desarrollo de un Producto Mínimo Viable (MVP) orientado a fortalecer la confiabilidad del registro de asistencia académica mediante mecanismos de verificación de identidad, validación del contexto académico y trazabilidad de las marcaciones.

## Problema que aborda

Los sistemas tradicionales de registro de asistencia pueden presentar dificultades relacionadas con la suplantación de identidad, la confiabilidad de las marcaciones y la trazabilidad de la información.

AsistIA busca abordar esta problemática mediante una solución que permita verificar la identidad del estudiante antes de registrar su asistencia y validar que la marcación corresponda al contexto académico definido.

## Usuarios principales

La solución considera tres tipos principales de usuarios:

- Estudiantes.
- Docentes.
- Administradores.

Cada usuario contará con funcionalidades y permisos de acuerdo con su rol dentro del sistema.

## Funcionalidades principales del MVP

El alcance definido para el MVP considera:

- Gestión de usuarios y roles.
- Enrolamiento facial asociado al mecanismo biométrico.
- Reconocimiento facial mediante un prototipo de tótem.
- Detección de presencia real (liveness detection).
- Generación y validación de un PIN dinámico, temporal y de un solo uso mediante el tótem.
- Gestión de cursos, asignaturas, horarios y sesiones.
- Registro y clasificación de asistencia.
- PWA para estudiantes.
- Dashboard para docentes y administradores.
- Auditoría y trazabilidad básica de marcaciones y operaciones relevantes.

## Componentes de la solución

AsistIA contempla la integración de los siguientes componentes:

- Prototipo de tótem inteligente.
- Mecanismo de reconocimiento facial y liveness detection.
- PWA para estudiantes.
- Dashboard para docentes y administradores.
- Backend y servicios de API.
- Base de datos.
- Mecanismo alternativo de verificación mediante PIN dinámico.
- Control de acceso basado en roles.
- Auditoría y trazabilidad.

## Metodología de trabajo

El proyecto utiliza **Scrum** como marco de trabajo para organizar y gestionar el desarrollo de manera iterativa.

La planificación se apoya en:

- Product Backlog.
- Estructura de Desglose del Trabajo (EDT/WBS).
- Carta Gantt.
- Criterios de aceptación.
- Evidencias de avance.

De manera complementaria se utilizará **Desarrollo Guiado por Pruebas (TDD)** en aquellas funcionalidades cuya lógica pueda ser verificada mediante pruebas automatizadas.

## Equipo de trabajo

### Ashly Tapia
**Rol:** Scrum Master y Developer.

Responsabilidades principales:
- Coordinación y seguimiento del equipo.
- Prototipo de tótem.
- Reconocimiento facial.
- Liveness detection.
- Seguridad.
- Integración y pruebas.

### Francisco Ossandón
**Rol:** Developer.

Responsabilidades principales:
- Diseño e implementación de base de datos.
- Backend.
- Servicios de API.
- Generación y validación del PIN dinámico.
- Reglas de registro de asistencia.
- Control de acceso basado en roles.
- Auditoría.
- Integración entre componentes.

### Fernanda Fernández
**Rol:** Product Owner y Developer.

Responsabilidades principales:
- Organización y priorización del Product Backlog.
- PWA para estudiantes.
- Dashboard para docentes y administradores.
- Interfaces.
- Criterios de aceptación.
- Validación funcional y de usabilidad.

## Arquitectura

La arquitectura de AsistIA contempla la interacción entre las interfaces de usuario, el prototipo de tótem, los servicios de backend y la base de datos.

Los estudiantes podrán interactuar con el sistema mediante la PWA y el tótem, mientras que docentes y administradores accederán a las funciones correspondientes mediante el dashboard.

El backend centralizará las reglas de negocio, autenticación, autorización, validación de asistencia, PIN dinámico, auditoría y comunicación con la base de datos.

La arquitectura será documentada y actualizada durante las siguientes etapas de desarrollo del proyecto.

## Tecnologías

Las tecnologías específicas utilizadas para la implementación serán documentadas y actualizadas en este repositorio a medida que avance el desarrollo del MVP.

Esta sección se mantendrá actualizada para reflejar únicamente las tecnologías efectivamente utilizadas por el equipo.

## Ejecución local

Las instrucciones para instalar dependencias, configurar el entorno y ejecutar localmente los componentes de AsistIA serán incorporadas cuando se encuentre disponible la primera versión ejecutable del MVP.

## Estructura del repositorio

El repositorio se encuentra organizado de acuerdo con las fases del Proyecto APT:

- `Fase 1`: definición y planificación del Proyecto APT.
- `Fase 2`: desarrollo y evidencias del proyecto.
- `Fase 3`: validación, cierre y evidencias finales.

## Estado del proyecto

**Fase actual:** Fase 1 – Definición del Proyecto APT.

Durante esta fase se ha trabajado en la definición del problema, objetivos, alcance, factibilidad, metodología, Product Backlog, EDT/WBS, Carta Gantt, roles del equipo y planificación general del proyecto.

La planificación considera un período de desarrollo de **16 semanas**, finalizando durante la última semana de noviembre de 2026.

---

**Proyecto APT – Capstone 2026**  
**Ingeniería en Informática – Duoc UC, Sede San Bernardo**
