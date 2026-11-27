import nodemailer from 'nodemailer';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createMailDelivery(env = process.env, injectedTransport,authorizedRecipient=()=>false) {
  const allowed = (env.LAB_MAIL_ALLOWED_TO || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const institutionDomains=(env.LAB_MAIL_ALLOWED_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
  const mayInvite=email=>allowed.includes(String(email).toLowerCase())||institutionDomains.includes(String(email).toLowerCase().split('@')[1])||authorizedRecipient(String(email).toLowerCase());
  const configured = !!(env.LAB_GMAIL_USER && env.LAB_GMAIL_APP_PASSWORD && allowed.length);
  const transporter = injectedTransport || (configured ? nodemailer.createTransport({
    service: 'gmail', auth: { user: env.LAB_GMAIL_USER, pass: env.LAB_GMAIL_APP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  }) : null);
  return {
    configured,
    canInvite:mayInvite,
    async sendVerificationCode({email,code}){
      if(!configured||!mayInvite(email))throw Error('Destinatario no habilitado.');
      const result=await transporter.sendMail({from:{name:'AsistIA · Verificación de correo',address:env.LAB_GMAIL_USER},to:{address:email},subject:'AsistIA: confirma tu correo para enrolarte',text:`Tu código de verificación es ${code}. Vence en 10 minutos y solo puede usarse una vez. Escríbelo en la página de enrolamiento que ya abriste. No compartas este código. Si no lo solicitaste, ignora este correo.`});
      if(!result.accepted?.some(address=>String(address).toLowerCase()===email.toLowerCase()))throw Error('Envío no confirmado.');
    },
    async sendEnrollmentUpdate({ email, kind, at }) {
      if (!configured || !mayInvite(email) || !['photo_approved','enrolled'].includes(kind)) throw Error('Notificación no habilitada.');
      const enrolled = kind === 'enrolled';
      const title = enrolled ? 'Tu enrolamiento quedó registrado' : 'Tu fotografía fue aprobada';
      const text = `${title}.\n\n${enrolled ? 'Se generó y guardó correctamente tu plantilla facial cifrada en el servidor local de AsistIA. No necesitas enviar otra foto por el vencimiento del respaldo temporal mientras la plantilla siga vigente y funcionando.' : 'Administración revisó y aceptó tu fotografía. Esta aprobación todavía no significa que la plantilla haya sido generada: recibirás una confirmación cuando quede guardada. En el flujo actual el consentimiento completo se recoge antes de la foto, por lo que no necesitas volver a autorizar. Si tu envío pertenece a un aviso antiguo o presenta un problema, administración revisará ese caso por separado.'}\n\nFecha del aviso: ${new Date(at).toLocaleString('es-CL',{timeZone:'America/Santiago'})} (Chile).\nEl tótem y la asistencia biométrica todavía requieren validación y no están habilitados. Este correo no acredita matrícula ni asistencia. La foto y la plantilla conservan los plazos que autorizaste. Puedes consultar el estado y retirar tu autorización desde tu enlace privado, o contactar a ${env.BIOMETRIC_CONTACT || 'usuario10@example.com'}.`;
      const result=await transporter.sendMail({from:{name:'AsistIA · Estado de enrolamiento',address:env.LAB_GMAIL_USER},to:{address:email},subject:enrolled?'AsistIA: tu enrolamiento quedó registrado':'AsistIA: tu fotografía fue aprobada',text,html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px"><h1>${esc(title)}</h1>${esc(text).split('\n').map(line=>`<p>${line}</p>`).join('')}</div>`});
      if (!result.accepted?.some(address=>String(address).toLowerCase()===email.toLowerCase())) throw Error('Notificación no confirmada.');
    },
    async sendConsent({ email, link, accessCode, expires, local }) {
      if (!configured || !mayInvite(email) || !/^https:\/\//.test(link)) throw Error('Envío no habilitado.');
      const text = `Tu foto de AsistIA ya fue revisada. Falta que tú decidas si autorizas crear la plantilla facial.\n\nAbre el enlace privado: ${link}\nCódigo privado: ${accessCode}\nRevisa antes de: ${new Date(expires).toLocaleString('es-CL',{timeZone:'America/Santiago'})} (Chile). La foto conserva su plazo original; este correo no lo amplía.\n\n${local ? 'La plantilla se generará en el computador servidor de AsistIA con OpenCV, sin AWS ni envío a un proveedor externo de reconocimiento.' : 'Lee en la página el proveedor y la región de procesamiento antes de decidir.'}\nLee el aviso actualizado y su plazo. Ninguna casilla está aceptada por ti. No se crea la plantilla por abrir el correo. Si aceptas expresamente el aviso actualizado, el servidor iniciará la generación automáticamente y te enviará la confirmación cuando se guarde correctamente. No necesitas repetir la foto si todavía está disponible.\n\nEl tótem y la asistencia biométrica siguen deshabilitados. Puedes no autorizar y usar asistencia manual. El enlace anterior fue reemplazado. No compartas este correo. La conexión web utiliza el túnel HTTPS informado y el computador debe estar encendido.`;
      const result = await transporter.sendMail({from:{name:'AsistIA · Autorización de plantilla',address:env.LAB_GMAIL_USER},to:{address:email},subject:local?'AsistIA: autoriza tu enrolamiento local, sin AWS':'AsistIA: revisa la autorización de tu plantilla',text,html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px"><h1>Continúa tu enrolamiento</h1>${esc(text).split('\n').map(line=>`<p>${line}</p>`).join('')}<p><a href="${esc(link)}">Revisar mi autorización</a></p></div>`});
      if (!result.accepted?.some(address=>String(address).toLowerCase()===email.toLowerCase())) throw Error('Envío no confirmado.');
    },
    async sendAdminCode({ email, code }) {
      if (!configured || !allowed.includes(email.toLowerCase())) throw Error('Correo administrativo no habilitado.');
      const result = await transporter.sendMail({
        from: { name: 'AsistIA · Acceso al panel', address: env.LAB_GMAIL_USER },
        to: { address: email },
        subject: 'AsistIA: código para entrar al panel de administración',
        text: `Tu código para entrar al panel de administración de AsistIA es: ${code}\n\nVence en 10 minutos y solo se puede usar una vez. No es el código de enrolamiento. No lo compartas: permite revisar y administrar las fotos del laboratorio. Si no solicitaste este acceso, ignora este correo.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h1>Entra a tu panel AsistIA</h1><p>Tu código de administración:</p><p style="font-size:30px;letter-spacing:4px;font-weight:bold">${esc(code)}</p><p>Vence en 10 minutos y es de un solo uso. Escríbelo en la página donde lo solicitaste.</p><p>No es el código de enrolamiento. No lo compartas: permite administrar las fotos del laboratorio. Si no pediste este acceso, ignora este mensaje.</p></div>`,
      });
      if (!result.accepted?.some(address => String(address).toLowerCase() === email.toLowerCase())) throw Error('Envío de código no confirmado.');
    },
    async send({ email, link, accessCode, expires }) {
      if (!configured) throw Error('Correo del laboratorio no configurado.');
      if (!mayInvite(email)) throw Error('Destinatario no habilitado para esta etapa.');
      if (!/^https:\/\//.test(link)) throw Error('La invitación por correo requiere HTTPS.');
      const date = new Date(expires).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
      const result = await transporter.sendMail({
        from: { name: 'AsistIA · Enrolamiento de prueba', address: env.LAB_GMAIL_USER },
        to: { address: email },
        subject: 'AsistIA: tu invitación para enrolarte',
        text: `Hola.\n\nTe invitamos a probar el enrolamiento de AsistIA.\nEnrolarme: ${link}\nCódigo privado: ${accessCode}\nVence: ${date} (Chile).\n\nAbre el enlace en Chrome o Safari desde tu celular. Lee la información y autoriza antes de aportar tu propia fotografía. La administradora revisará la identidad por un canal independiente antes de aceptar el registro. El enlace y el código no prueban identidad.\n\nEs una prueba voluntaria para adultos, sin reconocimiento facial ni tótem activo. No compartas la invitación. El computador debe permanecer encendido. El acceso HTTPS pasa por Cloudflare. Puedes retirar la autorización y eliminar datos desde tu enlace. No hay penalización por no participar.`,
        html: `<div style="font-family:Arial,sans-serif;background:#f2f5fa;padding:28px"><div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:30px"><p style="color:#147963;font-weight:bold">AsistIA · Enrolamiento de prueba</p><h1 style="color:#172c43;font-size:28px">Tu enrolamiento comienza aquí</h1><p>Hola. Abre esta invitación desde tu celular para conocer la prueba y decidir si quieres participar.</p><p style="margin:28px 0"><a href="${esc(link)}" style="background:#147963;color:white;padding:15px 26px;border-radius:9px;text-decoration:none;font-weight:bold">Enrolarme</a></p><p>Tu código privado: <strong style="font-size:24px;letter-spacing:3px">${esc(accessCode)}</strong></p><p>Vence: ${esc(date)} (Chile).</p><p>Usa Chrome o Safari. Primero lee el aviso y autoriza; después podrás aportar tu propia fotografía. Se guardará para revisión antes de habilitar cualquier uso. El enlace y el código no acreditan identidad.</p><p>Participación voluntaria, solo adultos. Sin reconocimiento facial ni tótem activo. Puedes retirar tu autorización y eliminar tus datos desde el enlace; puedes optar por asistencia manual sin penalización.</p><p style="color:#63758a;font-size:13px">No compartas este correo. El computador del laboratorio debe permanecer encendido. La conexión HTTPS pasa por Cloudflare. Si no puedes pulsar el botón, copia este enlace:</p><p style="word-break:break-all"><a href="${esc(link)}">${esc(link)}</a></p></div></div>`,
      });
      if (!result.accepted?.some(address => String(address).toLowerCase() === email.toLowerCase())) throw Error('El servidor no confirmó la aceptación del destinatario.');
      return { messageId: result.messageId };
    },
  };
}
