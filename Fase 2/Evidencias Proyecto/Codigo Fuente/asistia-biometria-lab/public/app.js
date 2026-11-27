const app = document.querySelector('#app'), notice = document.querySelector('#notice');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let stream, image, info, enrollmentCode;
const tell = s => { notice.textContent = s; };
async function api(path, body) {
  if (body && (['invitation', 'status', 'consent-copy', 'consent', 'enroll', 'withdraw'].includes(path) || path.startsWith('biometric/')||path.startsWith('email-verification/'))) body = { ...body, code: enrollmentCode };
  const res = await fetch('/api/' + path, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw Error(data.error); return data;
}
function on(id, action) { document.getElementById(id)?.addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; try { await action(e); } catch(err) { tell(err.message); } finally { b.disabled = false; } }); }
function stop() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
window.addEventListener('pagehide', stop);
function policy() { return `<h3>Información y autorización para registrar tu fotografía</h3><p><strong>Finalidad.</strong> Registrar y conservar tu fotografía de rostro para probar el enrolamiento voluntario en AsistIA Biometría Lab. Al enviarla, quedará asociada a tu ficha de prueba, junto con tu correo, la revisión de identidad y el registro de tu autorización.</p><p><strong>Alcance de esta autorización.</strong> Solo cubre esta prueba aislada. El reconocimiento facial, las plantillas biométricas y el tótem todavía no están activados. Usar tu fotografía posteriormente para identificarte o marcar asistencia requiere informar ese tratamiento y gestionar la autorización que corresponda antes de habilitarlo. Tu imagen no se incorpora a la página principal de AsistIA.</p><p><strong>Responsable:</strong> ${escape(info.controller)}. <strong>Contacto para tus derechos:</strong> ${escape(info.contact)}.</p><p><strong>Conservación y seguridad.</strong> La imagen se guarda cifrada en el equipo del laboratorio. Se elimina a los 7 días desde la creación de la invitación; la purga se ejecuta cada minuto con el servidor activo y al reiniciarlo. Si el equipo está apagado, la eliminación se ejecuta al iniciar de nuevo. La clave está en el mismo equipo: el cifrado no elimina todos los riesgos de acceso indebido. No se realiza publicación ni se conecta un proveedor de reconocimiento. Transporte: ${escape(info.transport)}</p><p><strong>Tu decisión y tus derechos.</strong> Puedes no participar y optar por asistencia manual sin penalización. Puedes solicitar acceso, rectificación, eliminación u oposición mediante el contacto anterior, y retirar tu autorización y eliminar tus datos desde tu enlace. No autorizar impide registrar la foto en esta prueba, pero no te excluye de la alternativa manual.</p><p><strong>Marco de referencia.</strong> Ley 19.628 y diseño considerando la Ley 21.719 de Chile. Aviso lab-v3 para revisión jurídica; no constituye una certificación de cumplimiento. La aceptación electrónica no prueba por sí sola identidad o representación legal. Solo participan adultos voluntarios. Puedes registrar la autorización y enviar tu foto para revisión; eso no acredita identidad ni habilita el reconocimiento.</p>`; }
function cameraMarkup() { return `<video id="video" autoplay muted playsinline></video><p id="cameraStatus" class="muted">La cámara está apagada.</p><button id="startCamera">Activar cámara frontal</button><button id="stopCamera" class="secondary">Apagar cámara</button>`; }
function bindCamera() {
  on('startCamera', async () => { if (!window.isSecureContext) throw Error('La cámara necesita HTTPS confiable en el teléfono.'); if (!navigator.mediaDevices?.getUserMedia) throw Error('Este navegador no ofrece acceso a cámara.'); stop(); stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720}},audio:false}); document.querySelector('#video').srcObject=stream; await document.querySelector('#video').play(); document.querySelector('#cameraStatus').textContent='Cámara local activa. Sin detección de rostros, identificación ni PAD.'; });
  on('stopCamera', () => { stop(); document.querySelector('#cameraStatus').textContent='Cámara apagada.'; });
}
async function login() {
  stop(); app.innerHTML=`<span class="badge">Administración del laboratorio</span><h1>Entra con tu correo.</h1><p>No necesitas abrir la terminal ni buscar una clave en archivos.</p><section><h2>Acceso al panel</h2><form id="requestAdminCode"><label for="adminEmail">Tu correo autorizado de administración</label><input id="adminEmail" type="email" autocomplete="email" required><button>Enviarme código por correo</button></form><p id="adminCodeStatus" role="status"></p><form id="adminCodeForm" hidden><label for="adminCode">Código de administración de 8 dígitos</label><input id="adminCode" inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" autocomplete="one-time-code" required><button>Entrar al panel</button></form><p class="muted">El código vence en 10 minutos y solo sirve una vez. Es distinto al código de enrolamiento de los participantes. La sesión del panel dura una hora.</p></section><div class="warning">Aquí puedes revisar y aceptar fotos del laboratorio. El reconocimiento facial y el tótem aún no están habilitados.</div>`;
  let requestedEmail;
  document.querySelector('#requestAdminCode').onsubmit=async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
    try {
      const email=document.querySelector('#adminEmail').value.trim();
      const result=await api('login/request-code',{email});
      requestedEmail=email;document.querySelector('#adminCodeStatus').textContent=result.message;
      document.querySelector('#adminCodeForm').hidden=false;document.querySelector('#adminCode').focus();
      button.textContent='Reenviar código';
    }catch(error){tell(error.message);}finally{button.disabled=false;}
  };
  document.querySelector('#adminCodeForm').onsubmit=async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
    try {await api('login',{email:requestedEmail,code:document.querySelector('#adminCode').value});await dashboard();tell('Sesión iniciada. Ya puedes revisar tus fotos.');}
    catch(error){tell(error.message);button.disabled=false;}
  };
}
async function dashboard() {
  stop(); const data=await api('admin/state');
  app.innerHTML=`<span class="badge">Administración · Pruebas aisladas</span><h1>Biometría, paso a paso.</h1><p class="muted">Gestiona invitaciones y revisa cada etapa del laboratorio.</p><nav><button id="refresh" class="secondary">Actualizar</button><button id="lab" class="secondary">Laboratorio de cámara</button><button id="logout" class="secondary">Cerrar sesión</button></nav><div class="stats"><div class="card"><strong>${data.invites.length}</strong>Invitaciones</div><div class="card"><strong>${data.invites.filter(x=>x.state==='review').length}</strong>Imágenes pendientes</div><div class="card"><strong>${data.events.filter(x=>x.kind==='manual_attendance').length}</strong>Entradas manuales</div></div><div class="grid"><section><h2>Nueva invitación</h2><form id="invite"><label for="name">Alias ficticio del participante</label><input id="name" required maxlength="100" placeholder="Voluntario Alfa"><label for="email">Correo autorizado para la prueba</label><input id="email" type="email" required maxlength="254" placeholder="usuario20@example.com"><label><input id="adult" type="checkbox" required>Es un adulto voluntario (18 años o más).</label><label><input id="fiction" type="checkbox" required>Usaré un alias ficticio; no son datos de un estudiante menor.</label><button>Preparar invitación</button></form><div id="delivery" class="warning">Correo de prueba habilitado solo para Ashly. Marca «Enviar por correo» para enviarlo; sin marcar se genera un borrador.</div></section><section><h2>Antes de capturar</h2><p>1. Genera el enlace y entrégalo por un canal autorizado.</p><p>2. Verifica al adulto presencialmente o mediante un canal independiente. Registra una referencia mínima, sin documentos de identidad.</p><p>3. El adulto lee y autoriza; después puede capturar o cargar la fotografía.</p><div class="warning">La revisión de calidad facial sigue pendiente. Este flujo no genera plantillas biométricas.</div></section></div><section><h2>Invitaciones y autorizaciones</h2><div class="scroll"><table><thead><tr><th>Participante</th><th>Estado</th><th>Autorización</th><th>Acciones</th></tr></thead><tbody>${data.invites.map(r=>`<tr><td>${escape(r.name)}<br><small>${escape(r.email)}</small></td><td>${escape(({pending:'Pendiente',review:'Imagen recibida · revisión pendiente',expired:'Vencida',approved:'Foto aceptada · laboratorio',rejected:'Foto rechazada'})[r.state]||r.state)}<br><small>Vence: ${escape(new Date(r.expires).toLocaleString())}</small></td><td>${r.verified?'Identidad revisada':'Sin verificar'}<br>${r.consent?'Autorización lab-v3 registrada':'Sin autorización'}</td><td>${['pending','review'].includes(r.state)&&!r.verified?`<button data-verify="${escape(r.id)}">Verificar adulto</button>`:''}${r.hasImage ? `<button data-photo="${escape(r.id)}">Ver foto y revisar</button>` : ''}<button class="secondary" data-manual="${escape(r.id)}">Entrada manual</button></td></tr>`).join('')||'<tr><td colspan="4">Aún no hay invitaciones.</td></tr>'}</tbody></table></div></section><section><h2>Resultados e intentos</h2><p class="muted">No hay resultados de reconocimiento facial. Los eventos siguientes corresponden al flujo de pruebas.</p><div class="scroll"><table><tr><th>Fecha</th><th>Evento</th><th>Detalle</th></tr>${data.events.map(r=>`<tr><td>${escape(new Date(r.created).toLocaleString())}</td><td>${escape(r.kind)}</td><td>${escape(r.detail)}</td></tr>`).join('')}</table></div></section><section><h2>Eliminar datos de prueba</h2><p>Elimina invitaciones, imágenes, autorizaciones y eventos del laboratorio.</p><button id="delete" class="danger">Eliminar todas las pruebas</button></section><dialog id="verifyDialog"><form id="verifyForm"><h2>Verificación independiente</h2><p>Confirma identidad y mayoría de edad del adulto por un canal distinto al enlace. No adjuntes documentos.</p><label for="evidence">Método, fecha y referencia de revisión</label><textarea id="evidence" required minlength="12" maxlength="400"></textarea><label><input id="verifiedAdult" type="checkbox" required>He verificado que tiene 18 años o más.</label><button>Registrar revisión</button><button type="button" id="cancelVerify" class="secondary">Cancelar</button></form></dialog>`;
  const emailChoice = document.createElement('label');
  emailChoice.innerHTML = '<input id="sendEmail" type="checkbox">Enviar invitación por correo (solo Ashly en esta etapa).';
  document.querySelector('#invite button').before(emailChoice);
  // Las fichas preparadas solo se consultan con sesión administrativa.
  const roster = await api('admin/participants');
  const drafts = document.createElement('section');
  drafts.innerHTML = `<h2>Participantes preparados para enrolamiento</h2><p>Estas fichas todavía no son invitaciones ni enrolamientos. Cada persona debe confirmar su mayoría de edad, autorizar y aportar su propia fotografía. No se han asignado fotos.</p><div class="scroll"><table><thead><tr><th>Ficha privada</th><th>Alias para la prueba</th><th>Pendientes</th><th>Acción</th></tr></thead><tbody>${roster.participants.map(p=>`<tr><td>${escape(p.name)}<br><small>${escape(p.email || 'Correo pendiente')}</small></td><td>${escape(p.alias)}</td><td>${p.email ? '' : 'Correo · '}Verificación de identidad · autorización · fotografía</td><td><button class="secondary" data-prepare="${escape(p.alias)}">Preparar invitación</button></td></tr>`).join('') || '<tr><td colspan="4">No hay fichas preparadas.</td></tr>'}</tbody></table></div><p class="muted">El nombre solo aparece en este panel privado; la invitación utiliza el alias ficticio. Las fichas se eliminan con las pruebas o a los 7 días.</p>`;
  document.querySelector('.grid').before(drafts);
  drafts.querySelectorAll('[data-prepare]').forEach(button=>button.onclick=()=>{
    document.querySelector('#name').value=button.dataset.prepare;
    document.querySelector('#email').value=roster.participants.find(p=>p.alias===button.dataset.prepare)?.email || '';
    document.querySelector('#adult').checked=false;
    document.querySelector('#fiction').checked=false;
    document.querySelector('#invite').scrollIntoView({behavior:'smooth',block:'center'});
    document.querySelector('#email').focus();
    tell('Completa el correo autorizado y confirma los requisitos. Todavía no se ha generado ni enviado una invitación.');
  });
  // Habilitar el laboratorio de cámara para pruebas.
document.querySelector('#lab').hidden = false;
on('lab', cameraLab);

on('lab', cameraLab);
  on('refresh',dashboard);on('logout',async()=>{await api('admin/logout',{});await login();});
  document.querySelectorAll('[data-photo]').forEach(button=>button.onclick=async()=>{
    try {
      const row=data.invites.find(item=>item.id===button.dataset.photo);
      const response=await fetch('/api/admin/photo?id='+encodeURIComponent(row.id));
      if(!response.ok) throw Error('No se pudo abrir la fotografía. Inicia sesión de nuevo si venció.');
      const photoUrl=URL.createObjectURL(await response.blob());
      const dialog=document.createElement('dialog');
      dialog.innerHTML=`<h2>Revisar fotografía</h2><p>${escape(row.name)} · ${escape(row.email)}</p><img id="reviewPhoto" alt="Fotografía privada enviada para revisión" class="review-photo"><p>${row.verified?'Identidad revisada':'Identidad pendiente: registra la revisión desde Verificar adulto antes de aceptar.'}</p><details><summary>Ver autorización registrada</summary><pre class="review-record">${escape(row.consent || 'Sin autorización registrada')}</pre></details><p>La aceptación es manual y solo para el laboratorio. No activa reconocimiento facial.</p>${row.state==='review'?'<form id="photoReviewForm"><label><input id="qualityChecked" type="checkbox">Revisé que la imagen corresponde a un rostro visible, nítido y con iluminación adecuada.</label><label><input id="authorizationChecked" type="checkbox">Revisé el registro de autorización y los antecedentes necesarios para esta prueba.</label><label for="reviewDecision">Decisión</label><select id="reviewDecision"><option value="approve">Aceptar foto para el laboratorio</option><option value="reject">Rechazar y eliminar foto</option></select><label for="reviewNote">Motivo de la decisión</label><textarea id="reviewNote" minlength="12" maxlength="500" required></textarea><button>Guardar revisión</button></form>':'<p>Estado: '+escape(row.state)+'.</p>'}<button id="closePhoto" class="secondary">Cerrar</button>`;
      app.append(dialog);dialog.querySelector('#reviewPhoto').src=photoUrl;
      dialog.addEventListener('close',()=>{URL.revokeObjectURL(photoUrl);dialog.remove();},{once:true});
      dialog.querySelector('#closePhoto').onclick=()=>dialog.close();
      const form=dialog.querySelector('#photoReviewForm');
      if(form) {
        const errorBox=document.createElement('p');errorBox.id='reviewError';errorBox.setAttribute('role','alert');form.prepend(errorBox);
        if(!row.verified) form.insertAdjacentHTML('afterbegin','<fieldset><legend>Revisión de identidad pendiente</legend><p>Para aceptar la foto, registra aquí una revisión real por un canal independiente del enlace. No guardes documentos ni sus números.</p><label><input id="photoIdentityChecked" type="checkbox">He verificado la identidad y mayoría de edad del adulto.</label><label for="photoIdentityEvidence">Método, fecha y referencia de la revisión</label><textarea id="photoIdentityEvidence" maxlength="400"></textarea></fieldset>');
      }
      if(form) form.onsubmit=async event=>{
        event.preventDefault();const submit=form.querySelector('button');submit.disabled=true;
        try {
          const errorBox=form.querySelector('#reviewError');errorBox.textContent='';
          if(form.querySelector('#reviewDecision').value==='approve') {
            if(!form.querySelector('#qualityChecked').checked || !form.querySelector('#authorizationChecked').checked) throw Error('Antes de aceptar, marca las revisiones de calidad y autorización.');
            if(!row.verified) {
              const evidence=form.querySelector('#photoIdentityEvidence').value.trim();
              if(!form.querySelector('#photoIdentityChecked').checked || evidence.length<12) throw Error('Falta la revisión de identidad: confirma que la realizaste y escribe el método y la referencia (mínimo 12 caracteres).');
              await api('admin/verify',{id:row.id,adult:true,evidence});row.verified=true;
            }
          }
          const result=await api('admin/photo-review',{id:row.id,decision:form.querySelector('#reviewDecision').value,note:form.querySelector('#reviewNote').value,qualityChecked:form.querySelector('#qualityChecked').checked,authorizationChecked:form.querySelector('#authorizationChecked').checked});
          dialog.close();await dashboard();tell(result.state==='approved'?'Foto aceptada para el laboratorio. Reconocimiento facial deshabilitado.':'Foto rechazada y eliminada. Genera una invitación nueva para repetir el registro.');
        }catch(error){form.querySelector('#reviewError').textContent=error.message;form.querySelector('#reviewError').scrollIntoView({block:'nearest'});submit.disabled=false;}
      };
      dialog.showModal();
    }catch(error){tell(error.message);}
  });
  document.querySelector('#invite').onsubmit=async e=>{e.preventDefault();try{const r=await api('admin/invites',{name:document.querySelector('#name').value,email:document.querySelector('#email').value,adult:document.querySelector('#adult').checked,fictitious:document.querySelector('#fiction').checked,sendEmail:document.querySelector('#sendEmail').checked}); const box=document.querySelector('#delivery');box.replaceChildren();const p=document.createElement('p');p.textContent=r.delivery;const a=document.createElement('a');a.href=r.link;a.textContent=r.link;const code = document.createElement('p'); code.textContent = 'Código privado: ' + r.accessCode; box.append(p,a,code);tell('Invitación preparada. Revisa abajo el estado del correo. El enlace y el código solo se muestran ahora.');}catch(err){tell(err.message);}};
  let selected; document.querySelectorAll('[data-verify]').forEach(b=>b.onclick=()=>{selected=b.dataset.verify;document.querySelector('#verifyDialog').showModal();});
  on('cancelVerify',()=>document.querySelector('#verifyDialog').close());
  document.querySelector('#verifyForm').onsubmit=async e=>{e.preventDefault();try{await api('admin/verify',{id:selected,evidence:document.querySelector('#evidence').value,adult:document.querySelector('#verifiedAdult').checked});await dashboard();tell('Revisión independiente registrada.');}catch(err){tell(err.message);}};
  document.querySelectorAll('[data-manual]').forEach(b=>b.onclick=async()=>{try{await api('admin/manual',{id:b.dataset.manual});await dashboard();tell('Entrada manual de prueba registrada. Se evita duplicar participante/día UTC.');}catch(err){tell(err.message);}});
  on('delete',async()=>{const confirm=prompt('Para eliminar los datos del laboratorio escribe ELIMINAR PRUEBAS');if(confirm){await api('admin/delete',{confirm});await dashboard();tell('Datos de prueba eliminados.');}});
}
async function cameraLab() {
  stop(); app.innerHTML=`<span class="badge">Cámara · Diagnóstico local</span><h1>Prueba la entrada simulada.</h1><button id="back" class="secondary">Volver al panel</button><section>${cameraMarkup()}<div class="warning">La imagen solo se muestra en este dispositivo. No se detectan personas ni se identifican rostros. PAD sin proveedor: no es posible rechazar fotos impresas, pantallas o videos con garantías.</div><button id="recognize">Comprobar disponibilidad de reconocimiento</button><h2>Matriz de pruebas pendiente</h2><p>Adulto caminando · Foto impresa · Foto en pantalla · Video reproducido · Contraluz · Varios rostros. Todos pendientes hasta integrar y validar un SDK real.</p></section>`;bindCamera();on('back',dashboard);on('recognize',async()=>{await api('recognize',{});});
}
function enrollmentGate() {
  app.innerHTML = `<section><span class="badge">Enrolamiento privado</span><h1>Comencemos tu prueba.</h1><p>Introduce el código de 8 dígitos que recibiste junto con este enlace. No necesitas iniciar sesión en Google ni en Cloudflare.</p><form id="codeForm"><label for="privateCode">Código privado</label><input id="privateCode" type="password" inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" autocomplete="off" required><button>Continuar</button></form><p class="muted">El enlace y el código protegen el acceso; la revisión de identidad y tu autorización se realizan después.</p></section>`;
  document.querySelector('#codeForm').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    enrollmentCode = document.querySelector('#privateCode').value;
    try { await enrollment(); tell('Código aceptado.'); }
    catch (error) { enrollmentCode = undefined; tell(error.message); button.disabled = false; }
  };
}
async function persistentEnrollment(raw) {
  const data = await api('biometric/status', { token: raw });
  const box = document.createElement('section'); box.id = 'persistentEnrollment';
  app.append(box);
  const labels = { authorized: 'Autorización registrada: administración debe generar la plantilla.', indexing: 'Conversión no confirmada: administración debe revisar o reintentar.', active: 'Plantilla creada. El reconocimiento todavía requiere validación.', deletion_pending: 'Uso bloqueado. Eliminación pendiente de confirmar.', deleted: 'Plantilla eliminada.' };
  if(data.consent?.workflow==='migration-approved-photo')labels.authorized='Autorización recibida. El servidor tiene pendiente generar la plantilla automáticamente.';
  box.innerHTML = `<h2>Enrolamiento persistente</h2><p>Esta etapa permite conservar una plantilla facial durante el plazo informado, sin guardar permanentemente la fotografía original. Es una autorización distinta a la prueba de siete días.</p>`;
  if (data.enrollment) {
    const row = data.enrollment;
    box.insertAdjacentHTML('beforeend', `<p>${row.photoRetained ? `La foto cifrada se mantiene como respaldo temporal para validación${row.photoRetentionEnds ? ' hasta ' + escape(new Date(row.photoRetentionEnds).toLocaleString()) : ''}. Su plazo no se amplía por crear la plantilla.` : 'No hay una foto de respaldo en este registro. La plantilla tiene su propio plazo de conservación.'}</p>`);
    box.insertAdjacentHTML('beforeend', `<p role="status"><strong>${escape(labels[row.state] || row.state)}</strong></p><p>Plazo de conservación informado hasta ${escape(new Date(row.expires).toLocaleString())}.</p>${row.needsNewPhoto ? '<p>La foto temporal ya no está disponible. Contacta a administración para una nueva captura.</p>' : ''}<p>El tótem y el reconocimiento de asistencia todavía no están habilitados.</p>${data.consent ? '<button id="biometricCopy" class="secondary">Descargar autorización de plantilla</button>' : ''}${!['deleted','deletion_pending'].includes(row.state) ? '<button id="biometricWithdraw" class="secondary">Retirar autorización de plantilla</button>' : ''}`);
    on('biometricCopy', () => {
      const blob = new Blob([`${data.consent.notice}\n\nFecha de aceptación: ${new Date(data.consent.at).toISOString()}\nVersión: ${data.consent.policy}`], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'autorizacion-plantilla-asistia.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    on('biometricWithdraw', async () => {
      if (!confirm('¿Bloquear el uso de tu plantilla y solicitar su eliminación?')) return;
      const result = await api('biometric/withdraw', { token: raw });
      await enrollment(); tell(labels[result.enrollment.state] || result.enrollment.state);
    });
    return;
  }
  if (!data.offer.available) { const p = document.createElement('p'); p.textContent = data.offer.message; box.append(p); return; }
  if (!data.eligible) { box.insertAdjacentHTML('beforeend', '<p>Primero administración debe revisar tu identidad y aprobar una fotografía disponible.</p>'); return; }
  if(data.offer.workflow==='migration-approved-photo')box.insertAdjacentHTML('beforeend','<p><strong>Tu foto ya está aceptada. No necesitas volver a tomarla.</strong> Al aceptar este aviso se generará la plantilla automáticamente con la foto disponible.</p>');
  const processing = data.offer.local ? 'procesar mi foto con OpenCV en el servidor local de AsistIA, sin enviarla a un proveedor externo de reconocimiento,' : `enviar mi foto a ${escape(data.offer.provider)} en la región ${escape(data.offer.region)}`;
  box.insertAdjacentHTML('beforeend', `<h3>Lee la nueva autorización</h3><pre class="biometric-notice">${escape(data.offer.notice)}</pre><form id="biometricConsent"><label><input id="biometricAdult" type="checkbox" required>Confirmo que soy mayor de 18 años y participo voluntariamente.</label><label><input id="biometricAuthorize" type="checkbox" required>He leído el aviso y autorizo expresamente generar y conservar mi plantilla facial, ${processing} y usarla para la finalidad informada durante ${escape(data.offer.retentionDays)} días. Entiendo que puedo optar por asistencia manual y retirar esta autorización.</label><button>Autorizar mi plantilla facial</button></form>`);
  document.querySelector('#biometricConsent').onsubmit = async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { const result=await api('biometric/authorize', { token: raw, policy: data.offer.policy, adult: document.querySelector('#biometricAdult').checked, authorized: document.querySelector('#biometricAuthorize').checked }); await enrollment(); tell(result.enrollment.templateReady?'Enrolamiento registrado: tu plantilla quedó guardada.':result.automaticError?'Autorización guardada. La conversión necesita revisión de administración; no hace falta aceptar otra vez.':'Autorización registrada. La generación de la plantilla está pendiente.'); }
    catch (error) { tell(error.message); button.disabled = false; }
  };
}
async function enrollment() {
  const raw=location.hash.slice(1); // El fragmento nunca se envía como URL al servidor.
  const row=await api('status',{token:raw});
  if(row.state==='pending'&&row.emailVerificationRequired){
    app.innerHTML=`<section><h1>Confirma tu correo</h1><p>Enviaremos un código nuevo al correo destinatario de esta invitación. No puedes cambiar el destinatario desde este enlace.</p><button id="sendEmailCode">Enviar código a mi correo</button><form id="emailCodeForm" hidden><label>Código de seis dígitos recibido por correo<input id="emailCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button>Confirmar y continuar</button></form><p>Vence en diez minutos. Esta comprobación confirma el control del correo; no es un cotejo facial ni un inicio de sesión institucional DUOC.</p></section>`;
    on('sendEmailCode',async()=>{await api('email-verification/request',{token:raw});document.querySelector('#emailCodeForm').hidden=false;tell('Código enviado al correo de tu invitación. Revisa también spam.');});
    document.querySelector('#emailCodeForm').onsubmit=async event=>{
      event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
      try{await api('email-verification/confirm',{token:raw,verificationCode:document.querySelector('#emailCode').value});await enrollment();tell('Correo confirmado. Continúa con tu consentimiento y fotografía.');}catch(error){tell(error.message);button.disabled=false;}
    };
    return;
  }
  if(row.state!=='pending'){
    const states={review:'Foto recibida: revisión pendiente',approved:'Registro aprobado: foto temporal',approved_no_photo:'Registro aprobado: foto eliminada',persistent:'Tu enrolamiento persistente',rejected:'Foto rechazada: solicita otra invitación',expired:'Invitación vencida',revoked:'Invitación cancelada'};
    app.innerHTML=`<section><span class="badge">Estado de tu enrolamiento</span><h1>${escape(states[row.state]||row.state)}</h1><p>${escape(row.name)}</p><p>Autorización: ${row.authorized?'registrada':'pendiente'}. Identidad: ${row.verified?'revisada':'pendiente'}.</p><p>${row.hasImage?'Tu foto está cifrada en el laboratorio para esta prueba.':'No hay una foto almacenada en este registro.'}</p><p>El tótem todavía no está habilitado. ${row.state === 'persistent' ? 'Puedes consultar tu plantilla en la sección siguiente.' : `Conservación de la prueba original hasta ${escape(new Date(row.retentionEnds).toLocaleString())}; si el servicio está apagado, se purga al reiniciar.`}</p><button id="refreshStatus">Actualizar estado</button>${row.authorized && row.state !== 'persistent' ? '<button id="consentCopy" class="secondary">Descargar mi autorización de prueba</button>' : ''}<details><summary>Mis derechos y eliminación</summary><p>Puedes retirar tu autorización y eliminar los registros y contactos asociados a tu correo. El uso de la plantilla se bloquea y su eliminación externa debe confirmarse. Esto no elimina tu cuenta de acceso a AsistIA.</p><button id="withdrawStatus" class="secondary">Retirar autorización y eliminar mis datos de enrolamiento</button></details></section>`;
    on('refreshStatus',enrollment);
    on('consentCopy',async()=>{const result=await api('consent-copy',{token:raw});const url=URL.createObjectURL(new Blob([result.text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='mi-autorizacion-asistia.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    on('withdrawStatus',async()=>{if(confirm('¿Eliminar tus datos de enrolamiento y contactos?')){const result=await api('withdraw',{token:raw});app.textContent=result.biometricDeletionPending?'Datos locales de enrolamiento eliminados y uso de plantilla bloqueado. Eliminación externa pendiente de confirmar.':'Tus datos de enrolamiento y plantillas fueron eliminados.';}});
    if(row.singleConsent){
      const box=document.createElement('section');box.innerHTML=`<h2>${row.enrollment?.templateReady?'Enrolamiento registrado':'Solicitud recibida'}</h2><p>${row.enrollment?.templateReady?'Tu plantilla facial quedó guardada. Recibirás el aviso por correo. El tótem sigue pendiente de validación.':'Ya aceptaste el consentimiento completo y enviaste tu foto. No necesitas otra autorización ni volver a ingresar un código para completar esta solicitud. Administración revisará la foto y se te avisará cuando la plantilla esté registrada.'}</p>${row.enrollment?.lastError?`<p class="warning">La generación no se confirmó. Administración debe revisar el registro: ${escape(row.enrollment.lastError)}</p>`:''}${row.enrollment?.expires?`<p>Plazo informado de la plantilla: hasta ${escape(new Date(row.enrollment.expires).toLocaleString())}.</p>`:''}`;app.append(box);
    }else await persistentEnrollment(raw);
    return;
  }
  const unified=row.enrollmentOffer?.available?row.enrollmentOffer:null;
  const consentMarkup=unified?`<h3>Una sola autorización para tu enrolamiento</h3><p>Usaremos tu foto para revisar tu identidad y generar una plantilla facial cifrada en el servidor local de AsistIA. Esa plantilla permitirá comparar tu rostro para asistencia cuando el reconocimiento y el tótem estén validados. No se enviará a AWS.</p><p>Foto temporal: hasta siete días desde la invitación. Plantilla: ${escape(unified.retentionDays)} días desde tu aceptación, o hasta que retires tu autorización. Puedes optar por asistencia manual sin penalización.</p><p>Responsable: ${escape(unified.controller)}. Contacto: ${escape(unified.contact)}.</p><details><summary>Leer el aviso completo y mis derechos</summary><pre class="biometric-notice">${escape(unified.notice)}</pre></details>`:policy();
  const consentText=unified?`He leído el aviso y autorizo expresamente la captura, envío, revisión y almacenamiento temporal de mi foto, la generación de mi plantilla facial cifrada y su uso para reconocimiento en AsistIA durante los plazos informados. Entiendo que puedo no participar o retirar mi autorización.`:'He leído el aviso lab-v3 y autorizo expresamente la captura, el envío y el almacenamiento de mi fotografía de rostro, asociada a mi ficha, para esta prueba de enrolamiento y durante el plazo informado.';
  app.innerHTML=`<span class="badge">Enrolamiento privado · Adultos voluntarios</span><h1>Hola, ${escape(row.name)}.</h1><p class="muted">1. Acepta el consentimiento · 2. Toma tu foto · 3. Envíala y listo</p><section><h2>Autoriza tu enrolamiento</h2>${consentMarkup}<form id="consent"><label><input id="isAdult" type="checkbox" required>Confirmo que tengo 18 años o más y participo voluntariamente.</label><label><input id="authorize" type="checkbox" required>${consentText}</label><button>Autorizar y registrar mi foto</button></form><details><summary>Opciones de privacidad</summary><p id="rightsHint">Si decides no participar, puedes cancelar tu invitación.</p><button id="withdraw" class="secondary">${row.authorized?'Retirar autorización y eliminar mis datos':'Cancelar invitación'}</button></details></section><section id="capture" hidden><h2>Toma o sube tu fotografía</h2><p>Una persona adulta, de frente, con luz uniforme y sin filtros. Administración revisará la foto antes de completar el registro.</p>${cameraMarkup()}<button id="snap">Capturar fotografía</button><label for="file">O seleccionar una imagen</label><input id="file" type="file" accept="image/jpeg,image/png,image/webp"><img id="preview" alt="Vista previa local de la fotografía"><p id="quality" class="muted"></p><button id="submit" disabled>Enviar mi fotografía</button></section>`;
  on('withdraw',async()=>{if(confirm('¿Cancelar tu participación y eliminar los datos de esta prueba, si existen?')){await api('withdraw',{token:raw});stop();app.textContent='Tus datos de prueba fueron eliminados.';}});
  document.querySelector('#consent')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;try{await api('consent',{token:raw,adult:document.querySelector('#isAdult').checked,authorized:document.querySelector('#authorize').checked,policy:unified?.policy||'lab-v3'});document.querySelector('#capture').hidden=false;document.querySelector('#consent').hidden=true;document.querySelector('#withdraw').textContent='Retirar autorización y eliminar mis datos';document.querySelector('#rightsHint').textContent='Tu autorización está registrada. Puedes retirarla y eliminar tus datos.';tell('Autorización registrada. Toma tu foto y confirma el envío.');}catch(err){tell(err.message);button.disabled=false;}});
  if(row.singleConsent&&row.authorized){document.querySelector('#capture').hidden=false;document.querySelector('#consent').hidden=true;}
  bindCamera();
  function prepare(source,w,h) {
    if(w<480||h<480) throw Error('Resolución insuficiente: mínimo 480 × 480.');
    const scale=Math.min(1,1280/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;const light=sum/(pixels.length/4);
    if(light<35||light>225)throw Error('Iluminación extrema. Usa una luz uniforme y repite.');
    image=canvas.toDataURL('image/jpeg',.85);if(image.length>2_666_000)throw Error('Imagen demasiado grande.');document.querySelector('#preview').src=image;document.querySelector('#quality').textContent=`${canvas.width} × ${canvas.height}. Resolución e iluminación básicas aceptadas; calidad facial NO verificada.`;document.querySelector('#submit').disabled=false;
  }
  on('snap',()=>{image=null;document.querySelector('#submit').disabled=true;const v=document.querySelector('#video');if(!stream||!v.videoWidth)throw Error('Activa la cámara y espera a ver la imagen.');prepare(v,v.videoWidth,v.videoHeight);stop();});
  document.querySelector('#file').onchange=async e=>{image=null;document.querySelector('#submit').disabled=true;const f=e.target.files[0];if(!f)return;try{if(f.size>10_000_000)throw Error('Archivo demasiado grande (máximo 10 MB antes de reducir).');const bitmap=await createImageBitmap(f);try{prepare(bitmap,bitmap.width,bitmap.height);}finally{bitmap.close();}}catch(err){tell(err.message);}};
  on('submit',async()=>{if(!image)throw Error('Selecciona una imagen válida.');await api('enroll',{token:raw,image});stop();image=null;await enrollment();tell('Foto enviada. Puedes consultar aquí el estado de tu revisión.');});
}
try { info=await api('info');if(location.pathname==='/enrolar'){enrollmentGate();}else{try{await dashboard();}catch{await login();}} }catch(err){tell(err.message);app.innerHTML='<section><h1>No se puede continuar.</h1><p>Solicita una invitación nueva si el enlace venció o ya fue utilizado. Para retirar datos de una invitación utilizada, contacta a la administradora o utiliza el botón siguiente.</p><button id="removeExpired" class="secondary">Eliminar datos de este enlace</button></section>';on('removeExpired',async()=>{if(confirm('¿Eliminar los datos asociados a este enlace?')){await api('withdraw',{token:location.hash.slice(1)});app.textContent='Datos de prueba eliminados.';}});}
