'use strict';
const crypto = require('crypto');
const db = require.main.require('./src/database');
const emailer = require.main.require('./src/emailer');
const meta = require.main.require('./src/meta');

const TTL = 600;
const COOLDOWN = 60;
const MAX_ATTEMPTS = 5;
const PREFIX = 'plugin:email-code:';

const normalize = value => String(value || '').trim().toLowerCase();
const emailValid = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const emailHash = email => crypto.createHash('sha256').update(email).digest('hex');
const codeHash = (email, code) => crypto.createHash('sha256').update(email + ':' + code).digest('hex');
const compare = (a, b) => {
 const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
 return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const EmailCode = module.exports;

EmailCode.init = async ({ app }) => {
 app.post('/api/v3/plugins/email-code/send', async (req, res) => {
  try {
   const email = normalize(req.body.email);
   if (!emailValid(email)) return res.status(400).json({ error: 'email-code:invalid-email' });
   const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
   const ipKey = PREFIX + 'ipcool:' + emailHash(ip);
   const mailKey = PREFIX + 'cool:' + emailHash(email);
   const cooling = await Promise.all([db.get(ipKey), db.get(mailKey)]);
   if (cooling.some(Boolean)) return res.status(429).json({ error: 'email-code:wait-before-resend' });

   const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
   const codeKey = PREFIX + 'code:' + emailHash(email);
   await db.set(codeKey, JSON.stringify({ hash: codeHash(email, code), attempts: 0 }));
   await db.expire(codeKey, TTL);
   await Promise.all([db.set(ipKey, '1'), db.expire(ipKey, COOLDOWN), db.set(mailKey, '1'), db.expire(mailKey, COOLDOWN)]);

   await emailer.sendToEmail('email-code', email, meta.config.defaultLang, {
    code, expiresMinutes: 10, subject: 'אימות כתובת הדואר האלקטרוני',
    site_title: meta.config.title || meta.config.browserTitle || 'NodeBB', rtl: true,
   });
   return res.json({ success: true });
  } catch (err) {
   req.log?.error(err);
   return res.status(500).json({ error: 'email-code:send-failed' });
  }
 });
};

EmailCode.addRegistrationFields = async data => {
 data.regFormEntry = data.regFormEntry || [];
 data.regFormEntry.push({
  styleName: 'email-code-entry', inputId: 'email-code-email', label: 'email-code:email-label',
  html: '<div class="d-flex flex-column gap-2"><input class="form-control" type="email" name="email" id="email-code-email" autocomplete="email" required maxlength="254" dir="ltr"><div class="d-flex gap-2"><input class="form-control" type="text" name="emailCode" id="email-code-value" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="קוד בן 6 ספרות" required><button class="btn btn-outline-primary text-nowrap" type="button" id="email-code-send">שליחת קוד</button></div><small class="form-text" id="email-code-status" aria-live="polite"></small></div>',
 });
 return data;
};

EmailCode.checkRegistration = async data => {
 const email = normalize(data.userData?.email || data.req?.body?.email);
 const code = String(data.req?.body?.emailCode || '').trim();
 if (!emailValid(email) || !/^\d{6}$/.test(code)) throw new Error('[[email-code:verify-first]]');
 const key = PREFIX + 'code:' + emailHash(email);
 const raw = await db.get(key);
 if (!raw) throw new Error('[[email-code:code-expired]]');
 let record;
 try { record = JSON.parse(raw); } catch { await db.delete(key); throw new Error('[[email-code:code-expired]]'); }
 record.attempts = Number(record.attempts || 0) + 1;
 if (record.attempts > MAX_ATTEMPTS) { await db.delete(key); throw new Error('[[email-code:too-many-attempts]]'); }
 if (!compare(record.hash, codeHash(email, code))) {
  await db.set(key, JSON.stringify(record)); await db.expire(key, TTL);
  throw new Error('[[email-code:wrong-code]]');
 }
 await db.delete(key);
 data.userData.email = email;
 return data;
};
