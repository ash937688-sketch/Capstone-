# AsistIA · Biometría Lab — etapa 1

Flujo actual: **un código → un consentimiento completo → foto → enviar**. Al aceptar administración una foto con ese permiso, la plantilla se genera automáticamente. No se exige una segunda autorización o visita para envíos nuevos correctos. Los avisos antiguos siguen separados y no se amplían automáticamente. Ver [consentimiento único](docs/CONSENTIMIENTO-UNICO.md), que prevalece sobre los recorridos históricos de dos etapas descritos debajo.

Retención actualizada: para el aviso local nuevo `bio-local-v2`, generar una plantilla mantiene la foto cifrada como respaldo temporal durante la validación, hasta su límite original de siete días. La plantilla conserva su plazo separado. No se modifican autorizaciones históricas ni se amplía la conservación de la foto. Ver [decisión vigente](docs/RETENCION-FOTO-Y-PLANTILLA.md).

## Actualización vigente: motor local sin AWS

Se instaló y configuró YuNet + SFace de OpenCV para la prueba personal de **Ashly únicamente**, conservando la ficha y las bases existentes. La extracción se hace en el servidor local; la plantilla se cifra en SQLite y Firebase recibe solo referencias/estado observado. El contacto es `usuario10@example.com`. El nuevo aviso propone 365 días y exige aceptación expresa en la web antes de convertir. La foto no se convierte automáticamente. Hay un botón para enviar el aviso nuevo desde administración. Ver [ENROLAMIENTO-LOCAL.md](docs/ENROLAMIENTO-LOCAL.md) para pasos, pruebas, licencias y límites.

Esta configuración reemplaza la selección de AWS descrita debajo: no se requiere cuenta AWS ni se envían imágenes al conector externo. El tótem y la comparación/asistencia siguen deshabilitados hasta su validación y PAD. Las secciones posteriores conservan el historial previo.

## Actualización: plantillas persistentes, proveedor pendiente

El panel principal incluye **Enrolamiento persistente**. Se implementó un conector oficial de Amazon Rekognition para convertir una foto aprobada, solo tras nueva autorización `bio-v1`, en una referencia a una plantilla del proveedor. La foto se elimina después de confirmar la conversión; la plantilla tiene su propio plazo y eliminación durable por retirada/vencimiento. La autorización lab-v3 no se amplía. La usuaria confirmó que no tiene cuenta AWS ni proveedor: la integración permanece desactivada y no se enviaron rostros a AWS. No se habilitó reconocimiento, PAD ni asistencia de tótem. Requisitos, costos orientativos, límites y activación: [ENROLAMIENTO-PERSISTENTE.md](docs/ENROLAMIENTO-PERSISTENTE.md).

Prevalece esta actualización sobre las referencias históricas a ausencia de conector. El acceso administrativo actual utiliza `usuario10@example.com`; las menciones antiguas al correo de la participante como administrador corresponden a configuraciones anteriores.

## Acceso administrativo desde la página

El ingreso habitual ya no pide `data/admin.key`. Abrir la URL base del laboratorio, escribir `usuario12@example.com`, pulsar **Enviarme código por correo**, copiar el código de ese correo a la página y entrar. Es un código administrativo de un solo uso, de 8 dígitos, válido 10 minutos; no confundirlo con el código de invitación del participante. Solo el correo definido en `LAB_ADMIN_EMAIL` obtiene acceso. La clave local se conserva como recuperación técnica, no es necesaria en el uso diario. Nunca enviar esa clave permanente por correo.

Hay límites de solicitudes (3 cada 15 minutos, separadas al menos un minuto), 5 intentos de código por desafío y sesión de una hora. Los códigos se almacenan como hash en memoria y se invalidan al usarlos o reiniciar. La recuperación de la cuenta institucional depende de su proveedor. No habilitar correos de participantes como administradores sin autorización del responsable.

En **Ver foto y revisar**, los requisitos pendientes y los errores se muestran ahora dentro de la ventana. Se puede registrar ahí mismo una verificación real de identidad, revisar autorización y calidad, escribir el motivo y guardar la aceptación/rechazo. No marcar revisiones que no se realizaron. La aceptación confirma únicamente el estado del laboratorio: no conecta un motor de reconocimiento ni activa el tótem.

## Revisar y aceptar fotos

Las imágenes se guardan cifradas dentro de `data/lab.sqlite`, en la fila de su invitación; no se crean archivos públicos de fotos. La clave de cifrado local está en `data/encryption.key`. No compartir ninguno de esos archivos.

En el panel administrativo, seleccionar **Ver foto y revisar**. Solo una sesión de administración puede recuperar la imagen, mediante una respuesta privada `no-store`. Revisar el registro de autorización, registrar una verificación de identidad real con **Verificar adulto** y revisar visualmente la calidad. Después se puede aceptar o rechazar la foto con motivo. Aceptar exige identidad revisada, autorización lab-v3 y confirmación de revisión manual; deja estado `approved` solo para el laboratorio. Rechazar deja estado `rejected` y elimina la imagen cifrada de la fila. Para repetir una foto rechazada, generar invitación nueva. No garantiza borrado forense ni borra copias externas.

La aprobación no habilita motor facial, tótem ni asistencia biométrica. La decisión y fecha quedan registradas. No se aprobó automáticamente la fotografía de ningún participante. Los datos siguen sujetos a retención y retiro.

## Corrección del flujo de enrolamiento (lab-v3)

La interfaz ya no oculta la autorización cuando la identidad está pendiente. Tras validar enlace y código, todo adulto ve el aviso y casillas expresas sin marcar. Al autorizar se habilitan cámara y carga; el servidor admite la imagen provisionalmente en `review` aunque la identidad siga sin verificar. El registro de consentimiento conserva `legalValidation=pending_review`; no acredita identidad ni validez jurídica. No se activa reconocimiento ni asistencia biométrica. La administradora puede revisar identidad antes o después de recibir la foto. No se admiten imágenes sin autorización expresa de la versión actual.

Este cambio reemplaza las instrucciones históricas que exigían verificar identidad antes de mostrar la autorización o recibir la foto. Ver `docs/CONSENTIMIENTO-lab-v3.md`. Prueba de regresión de interfaz en `test/enrollment-ui.test.js`: reproduce identidad pendiente y comprueba formulario visible, cancelación secundaria y cámara/carga visibles después de autorizar; no utiliza una cámara física ni autoriza por la usuaria.

## Correo de prueba activado

Corrección confirmada por Ashly: su destinatario es `usuario12@example.com`. Se actualizó la ficha y la lista permitida, se invalidaron las cuatro invitaciones pendientes dirigidas al Gmail anterior y Gmail aceptó una nueva invitación al institucional. La recepción debe confirmarla la usuaria.

El laboratorio tiene su propia dependencia Nodemailer y credenciales en `.env` privado (`LAB_GMAIL_USER`, `LAB_GMAIL_APP_PASSWORD`). Solo permite enviar a `usuario12@example.com` mediante `LAB_MAIL_ALLOWED_TO`; no cambia el servidor principal. En el panel, marcar “Enviar invitación por correo” antes de preparar una invitación. Sin marcar, solo genera un borrador. Gmail aceptó una invitación real para Ashly el 11 noviembre 2026; la recepción en su bandeja debe confirmarla ella. Asunto: “AsistIA: tu invitación para enrolarte”. Incluye botón Enrolarme y código privado. No se enviaron invitaciones a compañeros.

Eventos distinguen `invitation_email_accepted` y `invitation_email_failed`. La aceptación SMTP no confirma entrega final; no hay reintentos automáticos ni cola persistente. No repetir el envío por un retraso sin revisar los eventos. Las instrucciones anteriores sobre ausencia de envío corresponden al estado previo a esta actualización. Ejecutar `npm.cmd ci` al instalar el laboratorio en otro equipo. SMTP requiere red habilitada en el proceso servidor.

## Fichas de los tres participantes

Se prepararon fichas privadas para Ashly Tapia, Fernanda Fernández y Francisco Ossandon, con alias de prueba Alfa, Beta y Gamma. Incluyen los correos indicados por la usuaria, sin fotografías ni correos inventados, no declaran mayoría de edad y no constituyen enrolamientos. En el panel, “Preparar invitación” completa el alias; la administradora debe completar los requisitos antes de generar el enlace. Cada adulto aporta su propia imagen después de autorizar. El acceso al laboratorio de tótem se ha ocultado mientras se trabaja en enrolamiento.

Para volver a preparar esas fichas después de eliminarlas: `node prepare-companions.js`. La preparación es explícita; no reaparecen al reiniciar. Se eliminan con “Eliminar todas las pruebas” o por la retención de 7 días. Solo el panel privado muestra los nombres.

Aplicación independiente en Node 24, JavaScript de navegador y SQLite local. Sin dependencias npm, Firebase, acceso a la base principal ni cambios al frontend existente. Puerto 5180. No admite menores. Usar primero alias y correos ficticios; adultos reales solo después de designar responsable y revisar los documentos jurídicos.

## Iniciar en Windows

```powershell
Set-Location 'C:\Users\ashly\Downloads\AsistIA - copia\asistia-biometria-lab'
npm.cmd test
npm.cmd start
```

Abrir http://localhost:5180. En otra terminal local consultar la clave:

```powershell
Get-Content .\data\admin.key
```

La sesión dura una hora. No compartir esa clave ni la carpeta `data`. Al reiniciar se cierran las sesiones. Eliminar datos desde el panel; no borrar claves de cifrado con datos pendientes.

## Flujo de prueba

1. Generar invitación con alias ficticio y correo autorizado de adulto. Guardar el enlace: aparece una sola vez. Vence en 24 horas. **No se envía correo**: se muestra un borrador/enlace para entrega manual. La conexión SMTP autenticada, dominios institucionales permitidos, cola y reintentos son pendientes.
2. Registrar revisión independiente de identidad y mayoría de edad desde el panel. La declaración de ser adulto y poseer el enlace no sustituyen esa revisión. No guardar números o fotografías de documentos.
3. Abrir el enlace, leer lab-v1, autorizar expresamente y capturar/cargar fotografía. Resolución e iluminación se revisan en el navegador; se normaliza a JPEG sin metadatos originales. El servidor limita formato/tamaño, no realiza una decodificación ni una evaluación facial confiable: queda `review`, nunca “identificado”.
4. La imagen se cifra con AES-256-GCM. La base solo guarda el hash del enlace. Una segunda captura con el mismo enlace se rechaza. No existe motor de reconocimiento ni PAD conectado.
5. Registrar entrada manual como alternativa. Se deduplica por participante/día UTC, solo para este laboratorio. No representa control de asistencia productivo.
6. El participante puede retirar autorización y eliminar datos mediante su enlace; la administradora puede eliminar todo desde el panel. La eliminación lógica y VACUUM no garantizan borrado forense en SSD ni eliminan copias externas.

## Abrir desde teléfono por HTTPS

`http://IP-del-PC:5180` no es un contexto seguro para cámara en teléfonos. `localhost` en el teléfono se refiere al teléfono.

Opción preparada: TLS directo con certificado confiable en tu teléfono, emitido para el nombre/IP del PC. Obtener el certificado de tu administrador o una herramienta de certificados de desarrollo; no subir claves privadas a servicios externos.

1. Copiar `.env.example` a `.env` dentro del laboratorio.
2. Configurar `HOST=0.0.0.0`, `PUBLIC_ORIGIN=https://NOMBRE-O-IP-DEL-PC:5180`, `TLS_CERT=certs/lab.pem`, `TLS_KEY=certs/lab-key.pem`. Certificado y URL deben coincidir y la CA debe ser confiable en iPhone/Android.
3. Reiniciar el laboratorio. Permitir puerto 5180 en firewall **solo en red privada** y conectar ambos dispositivos a esa red.
4. Abrir esa URL exacta en Safari iPhone o Chrome Android. Generar invitaciones después de fijar la URL. Aceptar permiso de cámara. Apagarla con el botón al terminar.

Alternativa: túnel HTTPS con proveedor aprobado hacia `http://127.0.0.1:5180`, y establecer `PUBLIC_ORIGIN` a su URL antes de reiniciar. Evitar autenticación del túnel que impida abrir invitaciones. El túnel es un tercero con acceso potencial al tráfico: revisar tratamiento, región y contrato antes de usar fotos reales.

**No se ha emitido certificado, abierto firewall, contratado ni creado un túnel público. No hay URL móvil HTTPS activa aún.** El equipo no tiene `cloudflared` ni `openssl` disponibles en PATH. Se necesita elegir hostname/certificado o proveedor de túnel. No se han enviado correos.

## Límites y siguientes etapas

- Cámara frontal real mediante getUserMedia, vista previa y captura. Sin inferencia de paso por puerta, seguimiento de personas o reconocimiento facial.
- Sin aprobación de calidad facial: falta decodificación segura de imágenes en servidor, detector de rostro, nitidez, pose, oclusión y revisión humana.
- Integrar proveedor de reconocimiento y PAD solo después de revisión técnica, jurídica, costos y autorización. No hay puntuaciones inventadas ni registro automático de entradas biométricas.
- Retención: 7 días, purga al iniciar, cada minuto y al atender solicitudes. Si el servicio permanece detenido, los archivos permanecen hasta reiniciar: borrar antes de archivar/apagar o programar mantenimiento externo. No es una política de retención productiva.
- Clave de cifrado junto a base: usar BitLocker/permisos de Windows; esto no protege frente a una cuenta del equipo comprometida. Sin KMS, roles múltiples ni auditoría inmutable.
- Rate limit de login en memoria; para exposición amplia hacen falta límites distribuidos, monitoreo y protección de infraestructura.
- No hay envío automático SMTP, aprobación de representantes legales, verificación documental remota, producción ni integración principal.

Ver `docs/REVISION-JURIDICA.md` y `docs/PAD.md`. Pruebas automatizadas HTTP en `test/lab.test.js`; cámara física y navegadores móviles requieren prueba manual y aún no están verificados.
