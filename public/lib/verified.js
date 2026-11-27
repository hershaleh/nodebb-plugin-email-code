'use strict';
$(document).ready(function () {
	const form = document.querySelector('form[component="register/local"]');
	const email = document.getElementById('email-code-email');
	const code = document.getElementById('email-code-value');
	const send = document.getElementById('email-code-send');
	const status = document.getElementById('email-code-status');
	const register = document.getElementById('register');
	if (!form || !email || !code || !send || !status || !register) return;

	let verifiedEmail = '';
	let verifying = false;
	let lastAttempt = '';
	register.disabled = true;

	const translations = {
		'email-code:sending': 'שולח קוד אימות…',
		'email-code:code-sent': 'הקוד נשלח. בדוק את תיבת הדואר.',
		'email-code:verified': 'כתובת המייל אומתה. אפשר להירשם.',
		'email-code:email-changed': 'כתובת המייל השתנתה. יש לאמת אותה מחדש.',
		'email-code:verify-first': 'יש לאמת את כתובת המייל לפני ההרשמה.',
		'email-code:wait-before-resend': 'יש להמתין דקה לפני שליחת קוד נוסף.',
		'email-code:invalid-email': 'כתובת הדואר האלקטרוני אינה תקינה.',
		'email-code:wrong-code': 'קוד האימות שגוי.',
		'email-code:code-expired': 'הקוד פג תוקף. יש לבקש קוד חדש.',
		'email-code:too-many-attempts': 'בוצעו יותר מדי ניסיונות. יש לבקש קוד חדש.',
		'email-code:send-failed': 'שליחת הקוד נכשלה. בדוק את הגדרות הדואר בפורום.',
	};
	const show = (message, error) => {
		status.textContent = translations[message] || message || '';
		status.classList.toggle('text-danger', !!error);
		status.classList.toggle('text-success', !error);
	};
	const post = async (action, payload) => {
		const response = await fetch((config.relative_path || '') + '/api/v3/plugins/email-code/' + action, {
			method: 'POST', credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-CSRF-Token': document.querySelector('input[name="_csrf"]')?.value || config.csrf_token || '',
			},
			body: JSON.stringify(payload),
		});
		const result = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(result.error || 'email-code:send-failed');
		return result;
	};
	const update = () => {
		register.disabled = !verifiedEmail || verifiedEmail !== email.value.trim().toLowerCase();
	};
	email.addEventListener('input', () => {
		if (verifiedEmail && verifiedEmail !== email.value.trim().toLowerCase()) {
			verifiedEmail = '';
			show('email-code:email-changed', true);
		}
		update();
	});
	send.addEventListener('click', async () => {
		const value = email.value.trim().toLowerCase();
		if (!value || !email.checkValidity()) { email.reportValidity(); return; }
		send.disabled = true;
		show('email-code:sending', false);
		try {
			await post('send', { email: value });
			show('email-code:code-sent', false);
			code.focus();
		} catch (err) {
			show(err.message, true);
		} finally {
			window.setTimeout(() => { send.disabled = false; }, 60000);
		}
	});
	code.addEventListener('input', async () => {
		verifiedEmail = '';
		update();
		const value = code.value.trim();
		const emailValue = email.value.trim().toLowerCase();
		const attempt = emailValue + ':' + value;
		if (!/^\d{6}$/.test(value) || attempt === lastAttempt || verifying) return;
		lastAttempt = attempt;
		verifying = true;
		try {
			await post('verify', { email: emailValue, code: value });
			verifiedEmail = emailValue;
			show('email-code:verified', false);
		} catch (err) {
			show(err.message, true);
		} finally {
			verifying = false;
			update();
		}
	});
	form.addEventListener('submit', event => {
		update();
		if (!verifiedEmail || verifiedEmail !== email.value.trim().toLowerCase()) {
			event.preventDefault();
			show('email-code:verify-first', true);
		}
	});
	update();
});
