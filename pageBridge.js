(function() {
  function readFromMonaco() {
    try {
      const monaco = window.monaco;
      if (!monaco || !monaco.editor) return null;
      const getEditors = monaco.editor.getEditors?.bind(monaco.editor);
      if (typeof getEditors === 'function') {
        const editors = getEditors() || [];
        const focused = editors.find(e => e?.hasTextFocus?.());
        const target = focused || editors[0];
        if (target && target.getModel) {
          const model = target.getModel();
          if (model) {
            return {
              code: model.getValue(),
              language: model.getLanguageId?.() || null,
              source: 'monaco:editor'
            };
          }
        }
      }
      const models = monaco.editor.getModels?.() || [];
      if (models.length > 0) {
        let best = models[0];
        for (let i = 1; i < models.length; i++) {
          if ((models[i]?.getValueLength?.() || 0) > (best?.getValueLength?.() || 0)) {
            best = models[i];
          }
        }
        return {
          code: best.getValue?.() || '',
          language: best.getLanguageId?.() || null,
          source: 'monaco:model'
        };
      }
    } catch (_) {}
    return null;
  }

  function readFromCodeMirror() {
    try {
      const cmEls = Array.from(document.querySelectorAll('.CodeMirror'));
      for (const el of cmEls) {
        const cm = el && el.CodeMirror;
        if (cm && typeof cm.getValue === 'function') {
          return { code: cm.getValue(), language: null, source: 'codemirror' };
        }
      }
    } catch (_) {}
    return null;
  }

  function readFromTextareas() {
    try {
      const ta = document.querySelector('textarea');
      if (ta && ta.value && ta.value.trim().length > 0) {
        return { code: ta.value, language: null, source: 'textarea' };
      }
    } catch (_) {}
    return null;
  }

  function readEditorCode() {
    return readFromMonaco() || readFromCodeMirror() || readFromTextareas();
  }

  window.addEventListener('message', function(evt) {
    try {
      const data = evt?.data;
      if (!data || data.type !== 'leetcodeCodeRequest') return;
      const reqId = data.requestId;
      const result = readEditorCode();
      const payload = result ? {
        ok: true,
        code: result.code || '',
        language: result.language || null,
        source: result.source || null,
        length: (result.code || '').length
      } : { ok: false, error: 'No editor code detected' };
      window.postMessage({ type: 'leetcodeCodeResponse', requestId: reqId, ...payload }, '*');
    } catch (err) {
      window.postMessage({ type: 'leetcodeCodeResponse', ok: false, error: String(err && err.message || err) }, '*');
    }
  }, false);

  // Page-world debug function callable from the page DevTools console
  window.debugLeetCodeEditorCapture = function() {
    try {
      const res = readEditorCode();
      if (res) {
        console.log('🧪 Captured editor code (page):', { language: res.language, length: (res.code || '').length, preview: (res.code || '').slice(0, 200) });
        return res;
      }
      console.warn('🧪 No editor code detected');
      return null;
    } catch (err) {
      console.warn('🧪 Failed to capture editor code:', err);
      return null;
    }
  };
})();


