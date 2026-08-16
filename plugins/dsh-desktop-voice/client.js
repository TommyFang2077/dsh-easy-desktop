window.__ModuleLoader__.load({
  id: 'dsh-desktop-voice',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var jsx = require('react/jsx-runtime')

    var css = [
      '.dshdvoice{width:100%;max-width:640px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}',
      '.dshdvoice h3{margin:0;font-size:15px;font-weight:600;line-height:22px}',
      '.dshdvoice p{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
      '.dshdvoice label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dshdvoice .head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.dshdvoice .row{flex-direction:row;align-items:center;gap:10px}',
      '.dshdvoice .openai{display:flex;flex-direction:column;gap:14px}',
      '.dshdvoice a{color:var(--dsw-alias-state-business-primary);text-decoration:none;font-size:12px;line-height:18px}',
      '.dshdvoice a:hover{text-decoration:underline}',
      '.dshdvoice input,.dshdvoice select{height:36px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit}',
      '.dshdvoice input:focus,.dshdvoice select:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
      '.dshdvoice input[type=checkbox]{width:16px;height:16px;padding:0}',
      '.dshdvoice button{align-self:flex-start;height:32px;padding:0 14px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;cursor:pointer}',
      '.dshdvoice button:disabled{opacity:.55;cursor:default}',
      '.dshdvoice .ok{color:var(--dsw-alias-state-success-primary)}',
      '.dshdvoice .err{color:var(--dsw-alias-state-error-primary)}',
      '.dshdvoice-mic{appearance:none;border:0;background:transparent;width:28px;height:28px;border-radius:8px;color:var(--dsw-alias-label-secondary);display:grid;place-items:center;cursor:pointer;padding:0}',
      '.dshdvoice-mic:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dshdvoice-mic:disabled{opacity:.4;cursor:default}',
      '.dshdvoice-mic.is-live{color:var(--dsw-alias-state-error-primary)}',
      '.dshdvoice-mic.is-live svg{animation:dshdvoice-pulse 1.1s ease-in-out infinite}',
      '@keyframes dshdvoice-pulse{0%,100%{opacity:1}50%{opacity:.45}}',
      '#dsh-desktop-dictation{position:fixed;left:50%;bottom:48px;z-index:2147483645;transform:translateX(-50%);max-width:min(36rem,calc(100vw - 3rem));display:none;align-items:center;gap:8px;padding:6px 12px;border-radius:10px;background:rgba(28,28,30,.92);color:#f5f5f7;font:13px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)}',
      '#dsh-desktop-dictation.open{display:flex}',
      '#dsh-desktop-dictation .label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#dsh-desktop-dictation .stop{appearance:none;border:0;background:rgba(255,255,255,.12);color:#f5f5f7;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;cursor:pointer;padding:0}',
      '#dsh-desktop-dictation .kbd{opacity:.55;font-size:11px;letter-spacing:.02em;flex:none}',
      '#dsh-desktop-dictation .progress{width:120px;height:6px;accent-color:var(--dsw-alias-state-business-primary)}',
      '#dsh-desktop-dictation .percent{min-width:30px;text-align:right;font-variant-numeric:tabular-nums;font-size:11px;opacity:.75}',
    ].join('')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="dsh-desktop-voice"]')) return
      var tag = document.createElement('style')
      tag.dataset.pluginCss = 'dsh-desktop-voice'
      tag.textContent = css
      document.head.appendChild(tag)
    }


    function isMac() {
      return /Mac|iPhone|iPad/.test(navigator.platform || '')
    }

    function shortcutLabel() {
      return isMac() ? '⌘E' : 'Ctrl+E'
    }

    function isDictationHotkey(event) {
      if (event.repeat || event.altKey || event.shiftKey) return false
      var mod = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      if (!mod) return false
      return event.key === 'e' || event.key === 'E' || event.code === 'KeyE'
    }

    var WORD_BOUNDARY = /^[\p{L}\p{N}]$/u
    var CJK_BOUNDARY = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u
    var NO_SPACE_BEFORE = /^[,.;:!?%。，、！？；：）)\]}]$/u
    var NO_SPACE_AFTER = /^[([{（《「『]$/u
    var SPACE_AFTER = /^[,.;:!?%]$/u

    function firstChar(text) {
      return Array.from(String(text || '').trimStart())[0] || ''
    }

    function lastChar(text) {
      var chars = Array.from(String(text || '').trimEnd())
      return chars.length ? chars[chars.length - 1] : ''
    }

    function formatSegment(previous, next) {
      var text = String(next || '').trim()
      if (!text) return ''
      if (!previous || /\s$/.test(previous) || /^\s/.test(text)) return text
      var prev = lastChar(previous)
      var cur = firstChar(text)
      if (!prev || !cur) return text
      if (CJK_BOUNDARY.test(prev) || CJK_BOUNDARY.test(cur) || NO_SPACE_BEFORE.test(cur) || NO_SPACE_AFTER.test(prev)) {
        return text
      }
      if ((WORD_BOUNDARY.test(prev) || SPACE_AFTER.test(prev)) && WORD_BOUNDARY.test(cur)) return ' ' + text
      return text
    }

    function remote() {
      return fetch('/dsh-desktop/voice').then(function (res) {
        if (!res.ok) throw new Error('load failed ' + res.status)
        return res.json()
      })
    }

    function installSenseVoice(form) {
      if (form && form.modelInstalled) return Promise.resolve(form)
      var size = (form && form.modelDownloadSizeMb) || 245
      if (!window.confirm('SenseVoice 离线语音模型尚未安装（约 ' + size + ' MB）。现在安装吗？')) {
        return Promise.reject(new Error('需要先安装 SenseVoice 离线语音模型'))
      }
      setState({ state: 'installing', partial: '', error: '', installPercent: 0, installStage: '正在准备安装…' })
      var stopped = false
      function pollProgress() {
        return fetch('/dsh-desktop/voice/model')
          .then(function (res) {
            if (!res.ok) return null
            return res.json()
          })
          .then(function (progress) {
            if (!progress || stopped || session.state !== 'installing') return
            setState({
              installPercent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
              installStage: progress.stage || '正在安装 SenseVoice…',
            })
          })
          .catch(function () {})
      }
      pollProgress()
      var timer = setInterval(pollProgress, 250)
      if (timer && typeof timer.unref === 'function') timer.unref()
      return fetch('/dsh-desktop/voice/model', { method: 'POST' }).then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error(body.error || 'SenseVoice 安装失败')
            setState({ installPercent: 100, installStage: 'SenseVoice 已安装' })
            return body
          })
        })
        .finally(function () {
          stopped = true
          clearInterval(timer)
        })
    }

    function transcribeBlob(blob, language) {
      var mime = blob.type || 'application/octet-stream'
      return fetch(
        '/dsh-desktop/voice/transcribe?language=' + encodeURIComponent(language || '') + '&mime=' + encodeURIComponent(mime),
        { method: 'POST', headers: { 'content-type': mime }, body: blob },
      ).then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || 'transcribe failed ' + res.status)
          return String(body.text || '').trim()
        })
      })
    }

    function pickRecorderMime() {
      if (!window.MediaRecorder) return ''
      var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      for (var i = 0; i < types.length; i++) {
        try {
          if (MediaRecorder.isTypeSupported(types[i])) return types[i]
        } catch (err) {}
      }
      return ''
    }

    function encodeWav(chunks, sampleRate) {
      var length = 0
      for (var i = 0; i < chunks.length; i++) length += chunks[i].length
      var samples = new Float32Array(length)
      var offset = 0
      for (var j = 0; j < chunks.length; j++) {
        samples.set(chunks[j], offset)
        offset += chunks[j].length
      }
      var buffer = new ArrayBuffer(44 + samples.length * 2)
      var view = new DataView(buffer)
      function str(at, value) {
        for (var n = 0; n < value.length; n++) view.setUint8(at + n, value.charCodeAt(n))
      }
      str(0, 'RIFF')
      view.setUint32(4, 36 + samples.length * 2, true)
      str(8, 'WAVE')
      str(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      str(36, 'data')
      view.setUint32(40, samples.length * 2, true)
      var idx = 44
      for (var s = 0; s < samples.length; s++, idx += 2) {
        var v = Math.max(-1, Math.min(1, samples[s]))
        view.setInt16(idx, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      }
      return new Blob([buffer], { type: 'audio/wav' })
    }

    function openMic(deviceId) {
      var audio = {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
      if (deviceId) audio.deviceId = { exact: deviceId }
      return navigator.mediaDevices.getUserMedia({ audio: audio }).catch(function (error) {
        if (!deviceId) throw error
        return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      })
    }

    var session = {
      state: 'idle',
      partial: '',
      error: '',
      stream: null,
      recorder: null,
      parts: [],
      wav: null,
      inserted: '',
      target: null,
      installPercent: 0,
      installStage: '',
      run: 0,
    }
    var listeners = []
    var cachedForm = null

    function currentForm() {
      return session.liveForm || cachedForm || (session.target && session.target.form && session.target.form()) || null
    }

    function emit() {
      for (var i = 0; i < listeners.length; i++) listeners[i]()
    }

    function setState(next) {
      for (var key in next) session[key] = next[key]
      renderIndicator()
      emit()
    }

    function indicatorEl() {
      var el = document.getElementById('dsh-desktop-dictation')
      if (el) return el
      el = document.createElement('div')
      el.id = 'dsh-desktop-dictation'
      el.innerHTML =
        '<svg class="mic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>' +
        '<span class="label"></span>' +
        '<progress class="progress" max="100" value="0" aria-label="SenseVoice 安装进度"></progress>' +
        '<span class="percent"></span>' +
        '<span class="kbd"></span>' +
        '<button class="stop" type="button" aria-label="停止听写"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor"/></svg></button>'
      document.documentElement.appendChild(el)
      el.querySelector('.stop').addEventListener('mousedown', function (event) {
        event.preventDefault()
      })
      el.querySelector('.stop').addEventListener('click', function () {
        stopDictation()
      })
      return el
    }

    function renderIndicator() {
      ensureCss()
      var el = indicatorEl()
      var open =
        session.state === 'installing' || session.state === 'starting' || session.state === 'listening' || session.state === 'stopping'
      el.classList.toggle('open', open)
      var label = el.querySelector('.label')
      var progress = el.querySelector('.progress')
      var percent = el.querySelector('.percent')
      var kbd = el.querySelector('.kbd')
      if (session.state === 'installing') label.textContent = session.installStage || '正在安装 SenseVoice…'
      else if (session.state === 'starting') label.textContent = '正在启动…'
      else if (session.state === 'stopping') label.textContent = '正在识别…'
      else label.textContent = session.partial || '正在听…'
      var installing = session.state === 'installing'
      progress.hidden = !installing
      progress.value = session.installPercent || 0
      percent.hidden = !installing
      percent.textContent = installing ? Math.round(session.installPercent || 0) + '%' : ''
      kbd.textContent = shortcutLabel()
      el.querySelector('.stop').hidden = session.state === 'stopping' || installing
    }

    function cleanupCapture() {
      if (session.recorder) {
        try {
          if (session.recorder.state !== 'inactive') session.recorder.stop()
        } catch (err) {}
        session.recorder = null
      }
      if (session.wav) {
        try {
          session.wav.processor.disconnect()
          session.wav.source.disconnect()
          session.wav.context.close()
        } catch (err) {}
        session.wav = null
      }
      if (session.stream) {
        session.stream.getTracks().forEach(function (track) {
          track.stop()
        })
        session.stream = null
      }
      session.parts = []
    }

    function appendToComposer(text) {
      var target = session.target
      if (!target || !text) return
      var chunk = formatSegment(session.inserted || (target.draft ? target.draft() : ''), text)
      if (!chunk) return
      if (target.setDraft && target.draft) {
        target.setDraft((target.draft() || '') + chunk)
      }
      session.inserted += chunk
    }

    function finishError(message) {
      cleanupCapture()
      setState({ state: 'idle', partial: '', error: message || '' })
    }

    function useSenseVoice(form) {
      return form.engine === 'sensevoice'
    }

    function startRecorder(form, runId) {
      return openMic(form.microphoneDeviceId).then(function (stream) {
        if (session.run !== runId) {
          stream.getTracks().forEach(function (track) {
            track.stop()
          })
          return
        }
        session.stream = stream
        var local = useSenseVoice(form)
        var mime = local ? '' : pickRecorderMime()
        if (!local && (mime || window.MediaRecorder)) {
          var recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
          session.parts = []
          recorder.ondataavailable = function (event) {
            if (event.data && event.data.size) session.parts.push(event.data)
          }
          session.recorder = recorder
          recorder.start(250)
        } else {
          var context = new AudioContext()
          var source = context.createMediaStreamSource(stream)
          var processor = context.createScriptProcessor(4096, 1, 1)
          var chunks = []
          processor.onaudioprocess = function (event) {
            chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
          }
          source.connect(processor)
          processor.connect(context.destination)
          session.wav = { context: context, source: source, processor: processor, chunks: chunks, sampleRate: context.sampleRate }
        }
        setState({ state: 'listening', partial: '', error: '' })
      })
    }

    function recordedBlob() {
      if (session.wav) return encodeWav(session.wav.chunks, session.wav.sampleRate)
      if (!session.parts.length) return null
      return new Blob(session.parts, { type: session.parts[0].type || 'audio/webm' })
    }

    function startDictation() {
      if (session.state !== 'idle') return
      var target = session.target
      if (!target) {
        setState({ error: '对话框还没就绪' })
        return
      }
      var runId = session.run + 1
      session.run = runId
      session.inserted = target.draft ? target.draft() : ''
      setState({ state: 'starting', partial: '', error: '' })
      remote()
        .catch(function () {
          return target.form ? target.form() : null
        })
        .then(function (form) {
          if (session.run !== runId) return
          if (!form || form.enabled === false) throw new Error('语音输入已关闭，请到设置 → 语音输入开启')
          session.liveForm = form
          cachedForm = form
          if (useSenseVoice(form)) {
            return installSenseVoice(form).then(function (installed) {
              if (session.run !== runId) return
              session.liveForm = installed
              cachedForm = installed
              return startRecorder(installed, runId)
            })
          }
          if (!form.apiKey) throw new Error('请先在设置 → 语音输入里填写 OpenAI API 密钥')
          return startRecorder(form, runId)
        })
        .catch(function (error) {
          if (session.run !== runId) return
          var message = String(error && error.message ? error.message : error)
          if (/NotAllowed|Permission/i.test(message)) message = '麦克风权限被拒绝，请在系统设置中允许后重试'
          finishError(message)
        })
    }

    function stopDictation() {
      if (session.state === 'idle' || session.state === 'stopping' || session.state === 'installing') return
      var runId = session.run
      var form = currentForm()
      setState({ state: 'stopping' })
      var recorder = session.recorder
      function afterBlob(blob) {
        cleanupCapture()
        if (session.run !== runId) return
        if (!blob || !blob.size) {
          setState({ state: 'idle', partial: '', error: '没有识别到语音' })
          return
        }
        transcribeBlob(blob, form && form.language)
          .then(function (text) {
            if (session.run !== runId) return
            if (text) appendToComposer(text)
            else setState({ error: '没有识别到语音' })
            setState({ state: 'idle', partial: '' })
          })
          .catch(function (error) {
            if (session.run !== runId) return
            finishError(String(error && error.message ? error.message : error))
          })
      }
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = function () {
          afterBlob(recordedBlob())
        }
        try {
          recorder.stop()
        } catch (err) {
          afterBlob(recordedBlob())
        }
        return
      }
      afterBlob(recordedBlob())
    }

    function toggleDictation() {
      if (session.state === 'installing') return
      if (session.state === 'listening' || session.state === 'starting') stopDictation()
      else startDictation()
    }

    if (typeof window !== 'undefined' && !window.__dshDesktopVoiceKeys) {
      window.__dshDesktopVoiceKeys = true
      window.addEventListener(
        'keydown',
        function (event) {
          if (!isDictationHotkey(event)) return
          var form = currentForm()
          var mode = form && form.dictationMode === 'hold' ? 'hold' : 'toggle'
          event.preventDefault()
          event.stopPropagation()
          if (mode === 'hold') {
            if (session.state === 'idle') startDictation()
            return
          }
          toggleDictation()
        },
        true,
      )
      window.addEventListener(
        'keyup',
        function (event) {
          var form = currentForm()
          if (!form || form.dictationMode !== 'hold') return
          var key = event.key === 'e' || event.key === 'E' || event.code === 'KeyE'
          var mod = event.key === 'Control' || event.key === 'Meta' || event.code.indexOf('Control') === 0 || event.code.indexOf('Meta') === 0
          if (!key && !mod) return
          event.preventDefault()
          stopDictation()
        },
        true,
      )
    }

    function MicIcon() {
      return jsx.jsxs('svg', {
        width: '16',
        height: '16',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        children: [
          jsx.jsx('path', { d: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z' }),
          jsx.jsx('path', { d: 'M19 10v1a7 7 0 0 1-14 0v-1' }),
          jsx.jsx('line', { x1: '12', y1: '19', x2: '12', y2: '22' }),
        ],
      })
    }

    function SquareIcon() {
      return jsx.jsx('svg', {
        width: '12',
        height: '12',
        viewBox: '0 0 12 12',
        'aria-hidden': true,
        children: jsx.jsx('rect', { x: '2', y: '2', width: '8', height: '8', rx: '1.5', fill: 'currentColor' }),
      })
    }

    function MicButton(props) {
      ensureCss()
      var formState = React.useState(null)
      var form = formState[0]
      var setForm = formState[1]
      var tickState = React.useState(0)
      var setTick = tickState[1]
      var draft = props.useInput ? props.useInput(function (s) { return s.draft }) : ''
      var draftRef = React.useRef(draft)
      draftRef.current = draft
      var formRef = React.useRef(form)
      formRef.current = form

      React.useEffect(function () {
        var live = true
        remote()
          .then(function (next) {
            if (live) {
              cachedForm = next
              setForm(next)
            }
          })
          .catch(function () {
            if (live) setForm({ enabled: true, engine: 'sensevoice', dictationMode: 'toggle', language: 'zh', modelInstalled: false })
          })
        return function () {
          live = false
        }
      }, [])

      React.useEffect(function () {
        function onChange() {
          setTick(function (n) { return n + 1 })
        }
        listeners.push(onChange)
        return function () {
          listeners = listeners.filter(function (fn) { return fn !== onChange })
        }
      }, [])

      React.useEffect(function () {
        session.target = {
          setDraft: props.inputActions && props.inputActions.setDraft,
          draft: function () {
            return draftRef.current || ''
          },
          form: function () {
            return formRef.current
          },
        }
      })

      var installing = session.state === 'installing'
      var live = installing || session.state === 'starting' || session.state === 'listening' || session.state === 'stopping'
      var title = installing
        ? '正在安装 SenseVoice…'
        : live
          ? '停止听写（' + shortcutLabel() + '）'
          : '语音输入（' + shortcutLabel() + '）'
      return jsx.jsx('button', {
        type: 'button',
        className: 'dshdvoice-mic' + (session.state === 'listening' ? ' is-live' : ''),
        'aria-label': title,
        title: session.error ? session.error : title,
        disabled: session.state === 'stopping' || installing,
        onMouseDown: function (event) {
          event.preventDefault()
        },
        onClick: function () {
          toggleDictation()
        },
        children: live && !installing && session.state !== 'starting' ? jsx.jsx(SquareIcon, {}) : jsx.jsx(MicIcon, {}),
      })
    }

    function VoiceSettings() {
      ensureCss()
      var state = React.useState({ status: 'loading' })
      var snap = state[0]
      var setSnap = state[1]
      var devicesState = React.useState([])
      var devices = devicesState[0]
      var setDevices = devicesState[1]

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

      function save() {
        if (snap.status !== 'ready' || snap.saving) return
        setSnap(Object.assign({}, snap, { saving: true, message: '' }))
        fetch('/dsh-desktop/voice', {
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
            cachedForm = form
            setSnap({ status: 'ready', form: form, message: '已保存', saving: false })
          })
          .catch(function (error) {
            setSnap(Object.assign({}, snap, { saving: false, message: String(error.message || error) }))
          })
      }

      function listMics() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then(function (stream) {
            stream.getTracks().forEach(function (track) { track.stop() })
            return navigator.mediaDevices.enumerateDevices()
          })
          .then(function (list) {
            setDevices(
              list
                .filter(function (item) { return item.kind === 'audioinput' })
                .map(function (item, index) {
                  return { id: item.deviceId, label: item.label || '麦克风 ' + (index + 1) }
                }),
            )
          })
          .catch(function () {})
      }

      if (snap.status === 'loading') {
        return jsx.jsx('div', { className: 'dshdvoice', children: jsx.jsx('p', { children: '正在读取语音输入配置…' }) })
      }
      if (snap.status === 'error') {
        return jsx.jsx('div', { className: 'dshdvoice', children: jsx.jsx('p', { className: 'err', children: snap.message }) })
      }
      var form = snap.form
      var options = form.options || {}
      var engines = options.engines || []
      var modes = options.modes || []
      var languages = options.languages || []
      var openai = form.engine === 'openai'
      var local = form.engine === 'sensevoice'
      return jsx.jsxs('div', {
        className: 'dshdvoice',
        children: [
          jsx.jsx('h3', { children: '语音输入' }),
          jsx.jsx('p', {
            children:
              '对着麦克风说话，文字写进对话框。快捷键 ' +
              shortcutLabel() +
              '，和 Orca 一样点按开关或按住说话。默认使用本机 SenseVoice；模型首次点击麦克风时按需安装，不包含在安装包内。',
          }),
          jsx.jsxs('label', {
            className: 'row',
            children: [
              jsx.jsx('input', {
                type: 'checkbox',
                checked: form.enabled !== false,
                onChange: function (event) {
                  patch('enabled', event.target.checked)
                },
              }),
              '启用语音输入',
            ],
          }),
          jsx.jsxs('label', {
            children: [
              '听写方式',
              jsx.jsx('select', {
                value: form.dictationMode || 'toggle',
                onChange: function (event) {
                  patch('dictationMode', event.target.value)
                },
                children: modes.map(function (item) {
                  return jsx.jsx('option', { value: item.id, children: item.label }, item.id)
                }),
              }),
            ],
          }),
          jsx.jsxs('label', {
            children: [
              '引擎',
              jsx.jsx('select', {
                value: form.engine || 'sensevoice',
                onChange: function (event) {
                  patch('engine', event.target.value)
                },
                children: engines.map(function (item) {
                  return jsx.jsx('option', { value: item.id, children: item.label }, item.id)
                }),
              }),
            ],
          }),
          local
            ? jsx.jsx('p', {
                className: form.modelInstalled ? 'ok' : '',
                children: form.modelInstalled
                  ? 'SenseVoice 离线模型已安装。'
                  : 'SenseVoice 离线模型未安装；点击对话框麦克风后会提示安装（约 ' +
                    (form.modelDownloadSizeMb || 245) +
                    ' MB）。',
              })
            : null,
          jsx.jsxs('label', {
            children: [
              '语言',
              jsx.jsx('select', {
                value: form.language || '',
                onChange: function (event) {
                  patch('language', event.target.value)
                },
                children: languages.map(function (item) {
                  return jsx.jsx('option', { value: item.id, children: item.label }, item.id)
                }),
              }),
            ],
          }),
          openai
            ? jsx.jsxs('div', {
                className: 'openai',
                children: [
                  jsx.jsxs('label', {
                    children: [
                      jsx.jsxs('span', {
                        className: 'head',
                        children: [
                          '接口地址',
                          jsx.jsx('a', { href: 'https://console.groq.com/keys', children: 'Groq 密钥' }),
                        ],
                      }),
                      jsx.jsx('input', {
                        value: form.baseUrl || '',
                        placeholder: 'https://api.openai.com/v1',
                        onChange: function (event) {
                          patch('baseUrl', event.target.value)
                        },
                      }),
                    ],
                  }),
                  jsx.jsxs('label', {
                    children: [
                      jsx.jsxs('span', {
                        className: 'head',
                        children: [
                          'API 密钥',
                          jsx.jsx('a', {
                            href: 'https://platform.openai.com/api-keys',
                            children: '获取 API',
                          }),
                        ],
                      }),
                      jsx.jsx('input', {
                        type: 'password',
                        value: form.apiKey || '',
                        onChange: function (event) {
                          patch('apiKey', event.target.value)
                        },
                      }),
                    ],
                  }),
                  jsx.jsxs('label', {
                    children: [
                      'Whisper 模型',
                      jsx.jsx('input', {
                        value: form.model || '',
                        placeholder: '例如 whisper-1 或 whisper-large-v3',
                        onChange: function (event) {
                          patch('model', event.target.value)
                        },
                      }),
                    ],
                  }),
                ],
              })
            : null,
          jsx.jsxs('label', {
            children: [
              jsx.jsxs('span', {
                className: 'head',
                children: [
                  '麦克风',
                  jsx.jsx('a', {
                    href: '#',
                    onClick: function (event) {
                      event.preventDefault()
                      listMics()
                    },
                    children: '列出设备',
                  }),
                ],
              }),
              jsx.jsxs('select', {
                value: form.microphoneDeviceId || '',
                onChange: function (event) {
                  var id = event.target.value
                  var match = devices.filter(function (item) { return item.id === id })[0]
                  patch('microphoneDeviceId', id)
                  patch('microphoneDeviceLabel', match ? match.label : '')
                },
                children: [jsx.jsx('option', { value: '', children: '系统默认' })].concat(
                  devices.map(function (item) {
                    return jsx.jsx('option', { value: item.id, children: item.label }, item.id)
                  }),
                ),
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
            id: 'dsh-desktop-voice',
            order: 13,
            label: '语音输入',
          },
          VoiceSettings,
        )
      })
      ctx.slots.inject('conversation.input.right', function () {
        return ctx.slots.register(
          {
            name: 'conversation.input.right',
            id: 'dsh-desktop-voice',
            order: 20,
            label: '语音输入',
          },
          MicButton,
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
