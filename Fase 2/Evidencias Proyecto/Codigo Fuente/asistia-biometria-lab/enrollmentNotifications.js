// Durable, at-most-once automatic SMTP attempt. An uncertain delivery is never silently retried.
export function createEnrollmentNotifications({ db, mailDelivery, isCurrent, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS enrollment_notifications(
    id TEXT PRIMARY KEY,invite_id TEXT NOT NULL,email TEXT NOT NULL,kind TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,updated INTEGER NOT NULL);`);
  db.prepare("UPDATE enrollment_notifications SET state='unconfirmed' WHERE state='sending'").run();
  let running = false;
  const enqueue = ({ id, inviteId, email, kind }) => db.prepare("INSERT OR IGNORE INTO enrollment_notifications(id,invite_id,email,kind,created,updated) VALUES(?,?,?,?,?,?)").run(id, inviteId, email, kind, now(), now());
  const state = id => db.prepare('SELECT state FROM enrollment_notifications WHERE id=?').get(id)?.state || null;
  async function drain() {
    if (running) return;
    running = true;
    try {
      db.prepare('DELETE FROM enrollment_notifications WHERE created<?').run(now()-7*86400000);
      if (!mailDelivery.configured || typeof mailDelivery.sendEnrollmentUpdate !== 'function') return;
      for (const row of db.prepare("SELECT * FROM enrollment_notifications WHERE state='pending' ORDER BY created").all()) {
        if (!isCurrent(row)) { db.prepare("UPDATE enrollment_notifications SET state='cancelled',updated=? WHERE id=?").run(now(),row.id); continue; }
        db.prepare("UPDATE enrollment_notifications SET state='sending',updated=? WHERE id=? AND state='pending'").run(now(),row.id);
        try {
          await mailDelivery.sendEnrollmentUpdate({ email:row.email,kind:row.kind,at:now() });
          db.prepare("UPDATE enrollment_notifications SET state='accepted',updated=? WHERE id=?").run(now(),row.id);
        } catch { db.prepare("UPDATE enrollment_notifications SET state='unconfirmed',updated=? WHERE id=?").run(now(),row.id); }
      }
    } finally { running = false; }
  }
  return { enqueue, drain, state };
}
