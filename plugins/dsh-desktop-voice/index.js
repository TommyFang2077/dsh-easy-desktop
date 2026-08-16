import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Transform, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

export const name = 'dsh-desktop-voice'
export const inject = []

const execFileAsync = promisify(execFile)
const SHERPA_VERSION = '1.13.5'
const SENSEVOICE_VERSION = '2365baeacb507f821a0c8120fcee3d484dba7a07'
const SENSEVOICE_MODEL_BYTES = 239233841
const SENSEVOICE_TOKENS_BYTES = 315894
const SENSEVOICE_FILES = [
  {
    name: 'model.int8.onnx',
    bytes: SENSEVOICE_MODEL_BYTES,
    sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51',
  },
  {
    name: 'tokens.txt',
    bytes: SENSEVOICE_TOKENS_BYTES,
    sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc',
  },
]
const SENSEVOICE_BASE_URL =
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/' +
  SENSEVOICE_VERSION
const SENSEVOICE_DOWNLOAD_BYTES = SENSEVOICE_FILES.reduce((sum, file) => sum + file.bytes, 0)
const DOWNLOAD_PROGRESS_LIMIT = 95
let installPromise = null
let installState = { status: 'missing', percent: 0, stage: '' }
let sherpa = null
const recognizers = new Map()
let recognitionQueue = Promise.resolve()

const ENGINES = [
  { id: 'sensevoice', label: 'SenseVoice（本机离线，推荐）' },
  { id: 'openai', label: 'OpenAI 兼容接口' },
]
const ENGINE_IDS = new Set(ENGINES.map((item) => item.id))
const MODES = [
  { id: 'toggle', label: '点按开关（再按一次快捷键结束）' },
  { id: 'hold', label: '按住说话（松开快捷键结束）' },
]
const MODE_IDS = new Set(MODES.map((item) => item.id))
const LANGUAGES = [
  { id: '', label: '自动检测' },
  { id: 'zh', label: '中文' },
  { id: 'yue', label: '粤语' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
]
const LANGUAGE_IDS = new Set(LANGUAGES.map((item) => item.id))

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, 'dsh-desktop')
  return join(homedir(), '.config', 'dsh-desktop')
}

function configPath() {
  return join(configDir(), 'voice.json')
}

function voiceDataDir() {
  if (process.env.DSH_DESKTOP_VOICE_HOME) return process.env.DSH_DESKTOP_VOICE_HOME
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, 'dsh-desktop', 'voice')
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'dsh-desktop', 'Cache', 'voice')
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'dsh-desktop', 'voice')
  return join(homedir(), '.cache', 'dsh-desktop', 'voice')
}

function senseVoiceDir() {
  return join(voiceDataDir(), 'sensevoice')
}

function runtimeDir() {
  return join(voiceDataDir(), 'runtime')
}

function markerPath() {
  return join(senseVoiceDir(), 'installed.json')
}

function senseVoiceInstalled() {
  try {
    const marker = JSON.parse(readFileSync(markerPath(), 'utf8'))
    const runtime = JSON.parse(readFileSync(join(runtimeDir(), 'node_modules', 'sherpa-onnx', 'package.json'), 'utf8'))
    return (
      marker.modelVersion === SENSEVOICE_VERSION &&
      marker.runtimeVersion === SHERPA_VERSION &&
      runtime.version === SHERPA_VERSION &&
      SENSEVOICE_FILES.every((file) => statSync(join(senseVoiceDir(), file.name)).size === file.bytes)
    )
  } catch {
    return false
  }
}

function senseVoiceProgress() {
  if (senseVoiceInstalled()) return { status: 'installed', percent: 100, stage: 'SenseVoice 已安装' }
  if (installPromise) return { ...installState }
  if (installState.status === 'failed') return { ...installState }
  return { status: 'missing', percent: 0, stage: '' }
}

function senseVoiceStatus() {
  return senseVoiceProgress().status
}

function defaults() {
  return {
    enabled: true,
    engine: 'sensevoice',
    dictationMode: 'toggle',
    language: 'zh',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    microphoneDeviceId: '',
    microphoneDeviceLabel: '',
  }
}

function loadConfig() {
  try {
    const data = JSON.parse(readFileSync(configPath(), 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function formOf(cfg) {
  const base = defaults()
  const engine = ENGINE_IDS.has(cfg.engine) ? cfg.engine : base.engine
  const dictationMode = MODE_IDS.has(cfg.dictationMode) ? cfg.dictationMode : base.dictationMode
  const language = LANGUAGE_IDS.has(String(cfg.language ?? base.language))
    ? String(cfg.language ?? base.language)
    : base.language
  return {
    enabled: cfg.enabled !== false,
    engine,
    dictationMode,
    language,
    apiKey: String(cfg.apiKey || ''),
    baseUrl: String(cfg.baseUrl || base.baseUrl),
    model: String(cfg.model || base.model),
    microphoneDeviceId: String(cfg.microphoneDeviceId || ''),
    microphoneDeviceLabel: String(cfg.microphoneDeviceLabel || ''),
    modelInstalled: senseVoiceInstalled(),
    modelStatus: senseVoiceStatus(),
    modelDownloadSizeMb: 245,
    modelProgress: senseVoiceProgress(),
    options: {
      engines: ENGINES,
      modes: MODES,
      languages: LANGUAGES,
    },
  }
}

function saveForm(values) {
  const next = formOf({ ...loadConfig(), ...values })
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        enabled: next.enabled,
        engine: next.engine,
        dictationMode: next.dictationMode,
        language: next.language,
        apiKey: next.apiKey,
        baseUrl: next.baseUrl,
        model: next.model,
        microphoneDeviceId: next.microphoneDeviceId,
        microphoneDeviceLabel: next.microphoneDeviceLabel,
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8' },
  )
  try {
    chmodSync(path, 0o600)
  } catch {
    // best-effort; some filesystems ignore mode
  }
  return formOf(loadConfig())
}

function whisperLanguage(code) {
  const raw = String(code || '').trim().toLowerCase()
  if (!raw || raw === 'auto') return ''
  return raw.split(/[-_]/, 1)[0]
}

function transcriptionUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) return 'https://api.openai.com/v1/audio/transcriptions'
  if (/\/audio\/transcriptions$/i.test(trimmed)) return trimmed
  return `${trimmed}/audio/transcriptions`
}

function filenameFor(mime) {
  const type = String(mime || '').toLowerCase()
  if (type.includes('wav')) return 'audio.wav'
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3'
  if (type.includes('mp4') || type.includes('m4a')) return 'audio.m4a'
  if (type.includes('ogg')) return 'audio.ogg'
  return 'audio.webm'
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function readJsonBody(req) {
  const raw = (await readBody(req)).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function ensureModelFile(file, reportBytes) {
  const dest = join(senseVoiceDir(), file.name)
  try {
    if (statSync(dest).size === file.bytes && (await sha256File(dest)) === file.sha256) {
      reportBytes(file.bytes)
      return
    }
  } catch {}
  mkdirSync(dirname(dest), { recursive: true })
  const partial = `${dest}.part`
  rmSync(partial, { force: true })
  const response = await fetch(`${SENSEVOICE_BASE_URL}/${file.name}?download=true`, {
    signal: AbortSignal.timeout(900000),
  })
  if (!response.ok || !response.body) {
    throw new Error(`下载 ${file.name} 失败：HTTP ${response.status}`)
  }
  const hash = createHash('sha256')
  let bytes = 0
  const verify = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      reportBytes(chunk.length)
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(partial, { mode: 0o600 }))
    const digest = hash.digest('hex')
    if (bytes !== file.bytes || digest !== file.sha256) {
      throw new Error(`下载的 ${file.name} 校验失败`)
    }
    renameSync(partial, dest)
  } catch (error) {
    rmSync(partial, { force: true })
    throw error
  }
}

function npmInvocation() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return { file: process.execPath, prefix: [process.env.npm_execpath] }
  }
  const configured = process.env.DSH_DESKTOP_NPM
  if (configured) return { file: configured, prefix: [] }
  for (const candidate of ['/app/bin/npm', '/app/node24/bin/npm']) {
    if (existsSync(candidate)) return { file: candidate, prefix: [] }
  }
  if (process.platform === 'win32') return { file: 'cmd.exe', prefix: ['/d', '/s', '/c', 'npm.cmd'] }
  return { file: 'npm', prefix: [] }
}

async function installSherpaRuntime() {
  try {
    const pkg = JSON.parse(readFileSync(join(runtimeDir(), 'node_modules', 'sherpa-onnx', 'package.json'), 'utf8'))
    if (pkg.version === SHERPA_VERSION) return
  } catch {}
  mkdirSync(runtimeDir(), { recursive: true })
  const npm = npmInvocation()
  try {
    await execFileAsync(
      npm.file,
      [
        ...npm.prefix,
        'install',
        '--prefix',
        runtimeDir(),
        '--no-audit',
        '--no-fund',
        '--omit=dev',
        '--save-exact',
        `sherpa-onnx@${SHERPA_VERSION}`,
      ],
      { timeout: 300000, maxBuffer: 1024 * 1024 },
    )
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim()
    throw new Error(`安装离线识别运行时失败：${detail}`)
  }
}

async function installSenseVoice() {
  if (senseVoiceInstalled()) return { ...formOf(loadConfig()), installed: true }
  if (!installPromise) {
    installState = { status: 'installing', percent: 0, stage: '正在准备离线识别运行时…' }
    installPromise = (async () => {
      mkdirSync(senseVoiceDir(), { recursive: true })
      rmSync(markerPath(), { force: true })
      let downloadedBytes = 0
      const reportBytes = (bytes) => {
        downloadedBytes += bytes
        installState = {
          status: 'installing',
          percent: Math.min(
            DOWNLOAD_PROGRESS_LIMIT,
            Math.floor((downloadedBytes / SENSEVOICE_DOWNLOAD_BYTES) * DOWNLOAD_PROGRESS_LIMIT),
          ),
          stage: '正在下载 SenseVoice 模型…',
        }
      }
      const runtime = installSherpaRuntime()
      await Promise.all(SENSEVOICE_FILES.map((file) => ensureModelFile(file, reportBytes)))
      installState = {
        status: 'installing',
        percent: DOWNLOAD_PROGRESS_LIMIT,
        stage: '正在完成离线识别运行时…',
      }
      await runtime
      const partial = `${markerPath()}.part`
      writeFileSync(
        partial,
        `${JSON.stringify({ modelVersion: SENSEVOICE_VERSION, runtimeVersion: SHERPA_VERSION }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
      renameSync(partial, markerPath())
      installState = { status: 'installed', percent: 100, stage: 'SenseVoice 已安装' }
    })()
      .catch((error) => {
        installState = {
          status: 'failed',
          percent: installState.percent,
          stage: String(error?.message || error),
        }
        throw error
      })
      .finally(() => {
        installPromise = null
      })
  }
  await installPromise
  return { ...formOf(loadConfig()), installed: true }
}

function sherpaModule() {
  if (!sherpa) {
    const require = createRequire(join(runtimeDir(), 'package.json'))
    sherpa = require('sherpa-onnx')
  }
  return sherpa
}

function senseVoiceRecognizer(language) {
  const code = whisperLanguage(language)
  if (recognizers.has(code)) return recognizers.get(code)
  const runtime = sherpaModule()
  const recognizer = runtime.createOfflineRecognizer({
    modelConfig: {
      senseVoice: {
        model: join(senseVoiceDir(), 'model.int8.onnx'),
        language: code,
        useInverseTextNormalization: 1,
      },
      tokens: join(senseVoiceDir(), 'tokens.txt'),
    },
  })
  recognizers.set(code, recognizer)
  return recognizer
}

function enqueueRecognition(task) {
  const next = recognitionQueue.then(task, task)
  recognitionQueue = next.catch(() => {})
  return next
}

async function transcribeSenseVoice(audio, mime, language) {
  if (!senseVoiceInstalled()) {
    const error = new Error('SenseVoice 离线模型尚未安装')
    error.status = 409
    throw error
  }
  if (!String(mime).toLowerCase().includes('wav')) {
    const error = new Error('SenseVoice 离线识别需要 WAV 音频')
    error.status = 415
    throw error
  }
  const path = join(tmpdir(), `dsh-desktop-voice-${randomUUID()}.wav`)
  writeFileSync(path, audio, { mode: 0o600 })
  try {
    return await enqueueRecognition(() => {
      const runtime = sherpaModule()
      const recognizer = senseVoiceRecognizer(language)
      const wave = runtime.readWave(path)
      const stream = recognizer.createStream()
      try {
        stream.acceptWaveform(wave.sampleRate, wave.samples)
        recognizer.decode(stream)
        return String(recognizer.getResult(stream).text || '').trim()
      } finally {
        stream.free()
      }
    })
  } finally {
    rmSync(path, { force: true })
  }
}

async function transcribeOpenAI(cfg, audio, mime, language) {
  if (!cfg.apiKey) {
    const error = new Error('未配置 OpenAI API 密钥')
    error.status = 400
    throw error
  }
  const form = new FormData()
  form.append('file', new Blob([audio], { type: mime }), filenameFor(mime))
  form.append('model', cfg.model || 'whisper-1')
  form.append('response_format', 'json')
  if (language) form.append('language', language)
  const response = await fetch(transcriptionUrl(cfg.baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  let body = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { error: text.slice(0, 400) }
  }
  if (!response.ok) {
    const detail = body.error?.message || body.error || body.message || text.slice(0, 400)
    const error = new Error(String(detail || `OpenAI 接口返回 ${response.status}`))
    error.status = response.status
    throw error
  }
  return String(body.text || body.transcript || '').trim()
}

async function transcribe(req) {
  const cfg = formOf(loadConfig())
  const url = new URL(req.url, 'http://localhost')
  const mime = String(req.headers['content-type'] || url.searchParams.get('mime') || 'application/octet-stream')
  const language = whisperLanguage(url.searchParams.get('language') || cfg.language)
  const audio = await readBody(req)
  if (!audio.length) {
    const error = new Error('没有收到音频')
    error.status = 400
    throw error
  }
  const transcript =
    cfg.engine === 'openai'
      ? await transcribeOpenAI(cfg, audio, mime, language)
      : await transcribeSenseVoice(audio, mime, language)
  if (!transcript) {
    const error = new Error('没有识别到语音')
    error.status = 422
    throw error
  }
  return { text: transcript }
}

export function apply(ctx) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (scope) => {
    try {
      scope.webServer.register({
        name: 'dsh-desktop-voice',
        kind: 'exact',
        path: '/dsh-desktop/voice',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') {
              json(res, 200, formOf(loadConfig()))
              return
            }
            if (req.method === 'PUT' || req.method === 'POST') {
              json(res, 200, { ...saveForm(await readJsonBody(req)), saved: true })
              return
            }
            res.writeHead(405).end()
          } catch (error) {
            json(res, error.status || 500, { error: String(error?.message || error) })
          }
        },
      })
      scope.webServer.register({
        name: 'dsh-desktop-voice-model',
        kind: 'exact',
        path: '/dsh-desktop/voice/model',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') {
              json(res, 200, senseVoiceProgress())
              return
            }
            if (req.method === 'POST') {
              json(res, 200, await installSenseVoice())
              return
            }
            res.writeHead(405).end()
          } catch (error) {
            json(res, error.status || 500, { error: String(error?.message || error) })
          }
        },
      })
      scope.webServer.register({
        name: 'dsh-desktop-voice-transcribe',
        kind: 'exact',
        path: '/dsh-desktop/voice/transcribe',
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') {
              res.writeHead(405).end()
              return
            }
            json(res, 200, await transcribe(req))
          } catch (error) {
            json(res, error.status || 500, { error: String(error?.message || error) })
          }
        },
      })
    } catch (error) {
      console.error(`[dsh-desktop-voice] routes skipped: ${error}`)
    }
  })
}
