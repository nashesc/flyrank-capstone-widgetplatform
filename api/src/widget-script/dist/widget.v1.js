(function () { 
   const currentScript = document.currentScript;
   const scriptUrl = new URL(currentScript.src);
   const widgetId = scriptUrl.searchParams.get('id');
   if (!widgetId) return;
   const apiOrigin = scriptUrl.origin;
   let idempotencyKeyForAttempt = null;

   function buildField(fieldDef, formEl) {
      const wrapper = document.createElement('div');
      const label = document.createElement('label');
      label.textContent = fieldDef.label;
      wrapper.appendChild(label);
      let input;
      if (fieldDef.type === 'textarea') 
         input = document.createElement('textarea');
      else if (fieldDef.type === 'checkbox') { 
         input = document.createElement('input'); input.type = 'checkbox'; 
      }
      else { 
         input = document.createElement('input'); input.type = fieldDef.type === 'email' ? 'email' : 'text'; 
      }
      input.name = fieldDef.name;
      if (fieldDef.required) input.required = true;
      wrapper.appendChild(input);
      formEl.appendChild(wrapper);
   }

   function renderWidget(publicConfig) {
      const mount = document.createElement('div');
      mount.setAttribute('data-flyrank-widget', widgetId);
      const title = document.createElement('h3');
      title.textContent = publicConfig.title;
      mount.appendChild(title);
      if (publicConfig.description) {
         const desc = document.createElement('p');
         desc.textContent = publicConfig.description;
         mount.appendChild(desc);
      }
      const formEl = document.createElement('form');
      (publicConfig.fields || []).forEach(function (fieldDef) { buildField(fieldDef, formEl); });
      const honeypot = document.createElement('input');
      honeypot.type = 'text'; honeypot.name = '_hp'; honeypot.tabIndex = -1;
      honeypot.setAttribute('aria-hidden', 'true'); honeypot.style.display = 'none';
      formEl.appendChild(honeypot);
      const submitButton = document.createElement('button');
      submitButton.type = 'submit'; submitButton.textContent = publicConfig.button_text || 'Submit';
      formEl.appendChild(submitButton);
      formEl.addEventListener('submit', function (submitEvent) {
         submitEvent.preventDefault();
         if (!idempotencyKeyForAttempt) idempotencyKeyForAttempt = crypto.randomUUID();
         const payload = { _hp: (formEl.elements._hp && formEl.elements._hp.value) || '' };
         (publicConfig.fields || []).forEach(function (fieldDef) {
         const el = formEl.elements[fieldDef.name];
         payload[fieldDef.name] = fieldDef.type === 'checkbox' ? !!el.checked : el.value;
         });
         fetch(apiOrigin + '/api/submissions', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKeyForAttempt },
         body: JSON.stringify({ widgetId: widgetId, data: payload }),
         }).then(function (response) {
         if (response.ok) idempotencyKeyForAttempt = null;
         });
      });
      mount.appendChild(formEl);
      currentScript.parentNode.insertBefore(mount, currentScript.nextSibling);
   }
   fetch(apiOrigin + '/api/widgets/' + widgetId + '/config').then(function (r) { return r.json(); }).then(renderWidget);

})()