'use strict';
const crypto = require('crypto');
const db = require.main.require('./src/database');
const emailer = require.main.require('./src/emailer');
const meta = require.main.require('./src/meta');
const nconf = require.main.require('nconf');
const routes = require.main.require('./src/routes/helpers');
const user = require.main.require('./src/user');

const TTL = 600;
const VERIFIED_TTL = 900;
const COOLDOWN = 60;
const MAX_ATTEMPTS = 5;
const PREFIX = 'plugin:email-code:';
const EmailCode = module.exports;

const normalize = value => String(value || '').trim().toLowerCase();
const emailValid = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const hash = value => crypto.createHmac('sha256', String(nconf.get('secret'))).update(String(value)).digest('hex');
const emailHash = email => hash(normalize(email));
const codeHash = (email, code) => hash(normalize(email) + ':' + String(code));
const compare = (a, b) => {
	const x = Buffer.from(String(a));
	const y = Buffer.from(String(b));
	return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const codeKey = email => PREFIX + 'code:' + emailHash(email);
const verifiedKey = email => PREFIX + 'verified:' + emailHash(email);
const cooldownKey = email => PREFIX + 'cool:' + emailHash(email);

EmailCode.init = async ({ router }) => {
	routes.setupApiRoute(router, 'post', '/plugins/email-code/send', [], EmailCode.sendCode);
	routes.setupApiRoute(router, 'post', '/plugins/email-code/verify', [], EmailCode.verifyCode);
};

EmailCode.sendCode = async (req, res) => {
	if (req.loggedIn) return res.status(403).json({ error: 'email-code:registration-only' });
	const email = normalize(req.body && req.body.email);
	if (!emailValid(email)) return res.status(400).json({ error: 'email-code:invalid-email' });

	const ip = String(req.ip || req.socket && req.socket.remoteAddress || 'unknown');
	const ipKey = PREFIX + 'ipcool:' + hash(ip);
	const cooling = await Promise.all([db.get(ipKey), db.get(cooldownKey(email))]);
	if (cooling.some(Boolean)) return res.status(429).json({ error: 'email-code:wait-before-resend' });

	const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
	const key = codeKey(email);
	await db.set(key, JSON.stringify({ hash: codeHash(email, code), attempts: 0, created: Date.now() }));
	await db.expire(key, TTL);
	await Promise.all([
		db.set(ipKey, '1'), db.expire(ipKey, COOLDOWN),
		db.set(cooldownKey(email), '1'), db.expire(cooldownKey(email), COOLDOWN),
	]);
	await db.delete(verifiedKey(email));

	try {
		await emailer.sendToEmail('email-code', email, meta.config.defaultLang, {
			code, expiresMinutes: 10,
			subject: 'אימות כתובת הדואר האלקטרוני',
			site_title: meta.config.title || meta.config.browserTitle || 'NodeBB',
			rtl: true,
		});
		return res.json({ success: true });
	} catch (err) {
		await db.delete(key);
		await db.delete(cooldownKey(email));
		req.log && req.log.error(err);
		return res.status(500).json({ error: 'email-code:send-failed' });
	}
};

EmailCode.verifyCode = async (req, res) => {
	if (req.loggedIn) return res.status(403).json({ error: 'email-code:registration-only' });
	const email = normalize(req.body && req.body.email);
	const code = String(req.body && req.body.code || '').trim();
	if (!emailValid(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'email-code:wrong-code' });

	const key = codeKey(email);
	const raw = await db.get(key);
	if (!raw) return res.status(400).json({ error: 'email-code:code-expired' });
	let record;
	try { record = JSON.parse(raw); } catch (err) {
		await db.delete(key);
		return res.status(400).json({ error: 'email-code:code-expired' });
	}
	if (!record.created || Date.now() - Number(record.created) > TTL * 1000) {
		await db.delete(key);
		return res.status(400).json({ error: 'email-code:code-expired' });
	}
	record.attempts = Number(record.attempts || 0);
	if (record.attempts >= MAX_ATTEMPTS) {
		await db.delete(key);
		return res.status(429).json({ error: 'email-code:too-many-attempts' });
	}
	if (!compare(record.hash, codeHash(email, code))) {
		record.attempts += 1;
		await db.set(key, JSON.stringify(record));
		await db.expire(key, TTL);
		return res.status(400).json({ error: 'email-code:wrong-code' });
	}
	await db.delete(key);
	await db.set(verifiedKey(email), '1');
	await db.expire(verifiedKey(email), VERIFIED_TTL);
	return res.json({ success: true });
};

EmailCode.addRegistrationFields = async data => {
	const view = data.templateData || data;
	view.regFormEntry = view.regFormEntry || [];
	view.regFormEntry.push({
		styleName: 'email-code-entry',
		inputId: 'email-code-email',
		label: 'email-code:email-label',
		html: '<div class="d-flex flex-column gap-2"><input class="form-control" type="email" name="email" id="email-code-email" autocomplete="email" required maxlength="254" dir="ltr"><div class="d-flex gap-2"><input class="form-control" type="text" name="emailCode" id="email-code-value" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="קוד בן 6 ספרות" required><button class="btn btn-outline-primary text-nowrap" type="button" id="email-code-send">שליחת קוד</button></div><small class="form-text" id="email-code-status" aria-live="polite"></small></div>',
	});
	return data;
};

EmailCode.checkRegistration = async data => {
	const email = normalize(data.userData && data.userData.email || data.req && data.req.body && data.req.body.email);
	if (!emailValid(email)) throw new Error('[[email-code:invalid-email]]');
	if (!(await db.get(verifiedKey(email)))) throw new Error('[[email-code:verify-first]]');
	const existingUid = await db.sortedSetScore('email:uid', email);
	if (existingUid) throw new Error('[[error:email-taken]]');
	await db.delete(verifiedKey(email));
	data.userData.email = email;
	return data;
};

EmailCode.completeRegistration = async data => {
	if (!data || !data.uid) return data;
	try {
		const email = await user.getUserField(data.uid, 'email');
		if (email) await user.email.confirmByUid(data.uid);
	} catch (err) {
		if (global.winston) global.winston.error('[email-code] Could not finalize email confirmation: ' + err.message);
	}
	return data;
};
