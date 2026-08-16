import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const CLIENT = new URL('../plugins/dsh-desktop-voice/client.js', import.meta.url)

function loadVoiceClient({ confirmInstall = () => false, engine = 'sensevoice', holdInstall = false } = {}) {
  let plugin
  const registered = new Map()
  const indicatorParts = {
    '.label': { textContent: '' },
    '.kbd': { textContent: '' },
    '.stop': { hidden: false },
    '.progress': { hidden: true, value: 0 },
    '.percent': { hidden: true, textContent: '' },
  }
  const indicator = {
    classList: { toggle() {} },
    querySelector(selector) {
      return indicatorParts[selector]
    },
  }
  const window = {
    __ModuleLoader__: {
      load(definition) {
        plugin = definition.factory((id) => {
          if (id === 'react') return React
          if (id === 'react/jsx-runtime') return jsx
          throw new Error(`unexpected module: ${id}`)
        })
      },
    },
    addEventListener() {},
    confirm: confirmInstall,
  }
  const document = {
    querySelector() {
      return {}
    },
    getElementById() {
      return indicator
    },
  }
  const jsx = {
    jsx(type, props, key) {
      return { type, props: props || {}, key }
    },
    jsxs(type, props, key) {
      return { type, props: props || {}, key }
    },
  }
  let hooks = []
  let hookIndex = 0
  const React = {
    useState(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], (next) => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next
      }]
    },
    useRef(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    useEffect(effect, dependencies) {
      const index = hookIndex++
      const previous = hooks[index]
      const changed = !dependencies || !previous || dependencies.some((value, i) => value !== previous[i])
      hooks[index] = dependencies || null
      if (changed) effect()
    },
  }
  const requests = []
  let micRequests = 0
  const context = {
    AudioContext: function AudioContext() {},
    Blob,
    DataView,
    Float32Array,
    MediaRecorder: undefined,
    URL,
    clearTimeout,
    clearInterval,
    console,
    document,
    encodeURIComponent,
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET' })
      if (url === '/dsh-desktop/voice') {
        return {
          ok: true,
          async json() {
            return {
              enabled: true,
              engine,
              dictationMode: 'toggle',
              language: 'zh',
              modelInstalled: false,
            }
          },
        }
      }
      if (url === '/dsh-desktop/voice/model' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          async json() {
            return { status: 'installing', percent: 42, stage: '正在下载 SenseVoice 模型…' }
          },
        }
      }
      if (url === '/dsh-desktop/voice/model' && options.method === 'POST') {
        if (holdInstall) return new Promise(() => {})
        return {
          ok: true,
          async json() {
            return { installed: true }
          },
        }
      }
      throw new Error(`unexpected request: ${options.method || 'GET'} ${url}`)
    },
    navigator: {
      language: 'zh-CN',
      platform: 'Linux x86_64',
      mediaDevices: {
        getUserMedia() {
          micRequests += 1
          return new Promise(() => {})
        },
      },
    },
    setInterval,
    setTimeout,
    window,
  }
  vm.runInNewContext(readFileSync(CLIENT, 'utf8'), context, { filename: CLIENT.pathname })
  plugin.apply({
    slots: {
      inject(_name, register) {
        register()
      },
      register(meta, component) {
        registered.set(meta.name, component)
      },
    },
  })
  const MicButton = registered.get('conversation.input.right')
  assert.equal(typeof MicButton, 'function')
  const VoiceSettings = registered.get('settings.section')
  assert.equal(typeof VoiceSettings, 'function')
  const props = {
    inputActions: { setDraft() {} },
    useInput() {
      return ''
    },
  }
  return {
    indicatorParts,
    requests,
    get micRequests() {
      return micRequests
    },
    async renderMicReady() {
      hooks = []
      hookIndex = 0
      MicButton(props)
      await new Promise((resolve) => setTimeout(resolve, 0))
      hookIndex = 0
      return MicButton(props)
    },
    async renderSettingsReady() {
      hooks = []
      hookIndex = 0
      VoiceSettings({})
      await new Promise((resolve) => setTimeout(resolve, 0))
      hookIndex = 0
      return VoiceSettings({})
    },
  }
}

test('microphone click offers to install a missing SenseVoice model', async () => {
  let prompts = 0
  const harness = loadVoiceClient({
    confirmInstall(message) {
      prompts += 1
      assert.match(message, /SenseVoice/)
      assert.match(message, /安装/)
      return true
    },
  })
  const button = await harness.renderMicReady()
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(prompts, 1)
  assert.deepEqual(
    harness.requests.filter((request) => request.method === 'POST'),
    [{ url: '/dsh-desktop/voice/model', method: 'POST' }],
  )
  assert.equal(harness.micRequests, 1)
})

function textOf(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.props && node.props.children)
}

test('OpenAI fields only render for the OpenAI engine', async () => {
  const localSettings = textOf(await loadVoiceClient({ engine: 'sensevoice' }).renderSettingsReady())
  assert.doesNotMatch(localSettings, /接口地址|API 密钥|Whisper 模型/)

  const openAISettings = textOf(await loadVoiceClient({ engine: 'openai' }).renderSettingsReady())
  assert.match(openAISettings, /接口地址/)
  assert.match(openAISettings, /API 密钥/)
  assert.match(openAISettings, /Whisper 模型/)
})

test('model installation renders live progress', async () => {
  const harness = loadVoiceClient({ confirmInstall: () => true, holdInstall: true })
  const button = await harness.renderMicReady()
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(harness.indicatorParts['.progress'].hidden, false)
  assert.equal(harness.indicatorParts['.progress'].value, 42)
  assert.equal(harness.indicatorParts['.percent'].textContent, '42%')
})
