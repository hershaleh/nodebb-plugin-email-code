'use strict';
$(document).ready(function () {
 const email = document.getElementById('email-code-email');
 const code = document.getElementById('email-code-value');
 const send = document.getElementById('email-code-send');
 const status = document.getElementById('email-code-status');
 if (!email || !code || !send || !status) return;
 send.addEventListener('click', async () => {
  if (!email.value.trim() || !email.checkValidity()) { email.reportValidity(); return; }
  send.disabled = true; status.textContent = 'שולח קוד...'; status.className = 'form-text';
  try {
   const response = await fetch(config.relative_path + '/api/v3/plugins/email-code/send', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': $('input[name="_csrf"]').val() },
    body: JSON.stringify({ email: email.value.trim() })
   });
   const result = await response.json();
   if (!response.ok) throw new Error(result.error || 'failed');
   status.textContent = 'הקוד נשלח. בדוק את תיבת הדואר.';
   status.classList.add('text-success'); code.focus();
  } catch (err) {
   status.textContent = err.message === 'email-code:wait-before-resend' ? 'יש להמתין דקה לפני שליחת קוד נוסף.' : 'שליחת הקוד נכשלה. בדוק את כתובת הדואר ונסה שוב.';
   status.classList.add('text-danger');
  } finally {
   setTimeout(() => { send.disabled = false; }, 60000);
  }
 });
});
