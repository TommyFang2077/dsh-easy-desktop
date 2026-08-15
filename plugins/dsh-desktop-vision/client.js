window.__ModuleLoader__.load({
  id: 'dsh-desktop-vision',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var jsx = require('react/jsx-runtime')

    var css = [
      '.dshdv{width:100%;max-width:640px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}',
      '.dshdv h3{margin:0;font-size:15px;font-weight:600;line-height:22px}',
      '.dshdv p{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
      '.dshdv label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dshdv .head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.dshdv a{color:var(--dsw-alias-state-business-primary);text-decoration:none;font-size:12px;line-height:18px}',
      '.dshdv a:hover{text-decoration:underline}',
      '.dshdv input,.dshdv select{height:36px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit}',
      '.dshdv input:focus,.dshdv select:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
      '.dshdv button{align-self:flex-start;height:32px;padding:0 14px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;cursor:pointer}',
      '.dshdv button:disabled{opacity:.55;cursor:default}',
      '.dshdv .ok{color:var(--dsw-alias-state-success-primary)}',
      '.dshdv .err{color:var(--dsw-alias-state-error-primary)}',
    ].join('')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="dsh-desktop-vision"]')) return
      var tag = document.createElement('style')
      tag.dataset.pluginCss = 'dsh-desktop-vision'
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function remote(provider) {
      var q = provider ? '?provider=' + encodeURIComponent(provider) : ''
      return fetch('/dsh-desktop/modlens' + q).then(function (res) {
        if (!res.ok) throw new Error('load failed ' + res.status)
        return res.json()
      })
    }

    function VisionSettings() {
      ensureCss()
      var state = React.useState({ status: 'loading' })
      var snap = state[0]
      var setSnap = state[1]
      React.useEffect(function () {
        var live = true
        remote()
          .then(function (form) {
            if (live) setSnap({ status: 'ready', form: form, message: '' })
          })
          .catch(function (error) {
            if (live) setSnap({ status: 'error', message: String(error.message || error) })
          })
        return function () {
          live = false
        }
      }, [])

      function patch(field, value) {
        setSnap(function (cur) {
          if (cur.status !== 'ready') return cur
          return { status: 'ready', form: Object.assign({}, cur.form, { [field]: value }), message: '' }
        })
      }

      function onProvider(id) {
        remote(id)
          .then(function (form) {
            setSnap({ status: 'ready', form: form, message: '' })
          })
          .catch(function () {
            patch('provider', id)
          })
      }

      function save() {
        if (snap.status !== 'ready' || snap.saving) return
        setSnap(Object.assign({}, snap, { saving: true, message: '' }))
        fetch('/dsh-desktop/modlens', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(snap.form),
        })
          .then(function (res) {
            return res.json().then(function (body) {
              if (!res.ok) throw new Error(body.error || 'save failed')
              return body
            })
          })
          .then(function (form) {
            setSnap({ status: 'ready', form: form, message: '已保存', saving: false })
          })
          .catch(function (error) {
            setSnap(Object.assign({}, snap, { saving: false, message: String(error.message || error) }))
          })
      }

      if (snap.status === 'loading') {
        return jsx.jsx('div', { className: 'dshdv', children: jsx.jsx('p', { children: '正在读取 ModLens 配置…' }) })
      }
      if (snap.status === 'error') {
        return jsx.jsx('div', { className: 'dshdv', children: jsx.jsx('p', { className: 'err', children: snap.message }) })
      }
      var form = snap.form
      var remoteEngine = form.provider === 'openai' || form.provider === 'gemini-api' || form.provider === 'anthropic'
      var options = form.options || []
      var current = options.filter(function (item) { return item.id === form.provider })[0]
      var apiUrl = (current && current.apiUrl) || form.apiUrl || ''
      var example = (current && current.example) || form.example || ''
      var getApi = apiUrl
        ? jsx.jsx('a', { href: apiUrl, children: '获取 API' })
        : null
      return jsx.jsxs('div', {
        className: 'dshdv',
        children: [
          jsx.jsx('h3', { children: 'ModLens 视觉模型' }),
          jsx.jsx('p', {
            children:
              '纯文本对话模型读图时使用这里的引擎。已声明视觉能力的模型（如 Qwen）不会走这条桥。',
          }),
          jsx.jsxs('label', {
            children: [
              '引擎',
              jsx.jsx('select', {
                value: form.provider,
                onChange: function (event) {
                  onProvider(event.target.value)
                },
                children: options.map(function (item) {
                  return jsx.jsx('option', { value: item.id, children: item.label }, item.id)
                }),
              }),
            ],
          }),
          jsx.jsxs('label', {
            children: [
              '接口地址',
              jsx.jsx('input', {
                value: form.baseUrl || '',
                disabled: !remoteEngine,
                placeholder: form.officialBaseUrl || '',
                onChange: function (event) {
                  patch('baseUrl', event.target.value)
                },
              }),
            ],
          }),
          jsx.jsxs('label', {
            children: [
              jsx.jsxs('span', { className: 'head', children: ['API 密钥', getApi] }),
              jsx.jsx('input', {
                type: 'password',
                value: form.apiKey || '',
                disabled: !remoteEngine,
                onChange: function (event) {
                  patch('apiKey', event.target.value)
                },
              }),
            ],
          }),
          jsx.jsxs('label', {
            children: [
              '视觉模型',
              jsx.jsx('input', {
                value: form.model || '',
                placeholder: example ? '例如 ' + example : '',
                onChange: function (event) {
                  patch('model', event.target.value)
                },
              }),
            ],
          }),
          jsx.jsx('button', {
            type: 'button',
            disabled: !!snap.saving,
            onClick: save,
            children: snap.saving ? '保存中…' : '保存',
          }),
          snap.message
            ? jsx.jsx('p', {
                className: /失败|failed|error/i.test(snap.message) ? 'err' : 'ok',
                children: snap.message,
              })
            : null,
        ],
      })
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          {
            name: 'settings.section',
            id: 'modlens-vision',
            order: 12,
            label: '视觉模型',
          },
          VisionSettings,
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
