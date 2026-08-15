import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-desktop-vision'
export const inject = []

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI 兼容',
    baseUrl: 'https://api.openai.com/v1',
    apiUrl: 'https://platform.openai.com/api-keys',
    example: 'gpt-4o',
  },
  {
    id: 'gemini-api',
    label: 'Gemini API',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiUrl: 'https://aistudio.google.com/apikey',
    example: 'gemini-3.6-flash',
  },
  {
    id: 'anthropic',
    label: 'Anthropic API',
    baseUrl: 'https://api.anthropic.com',
    apiUrl: 'https://console.anthropic.com/settings/keys',
    example: 'claude-haiku-4-5-20251001',
  },
  {
    id: 'antigravity-cli',
    label: 'Antigravity CLI（免费）',
    baseUrl: '',
    apiUrl: 'https://antigravity.google/',
    example: 'gemini-3.6-flash-low',
  },
  {
    id: 'claude-cli',
    label: 'Claude Code 登录',
    baseUrl: '',
    apiUrl: 'https://code.claude.com',
    example: 'haiku',
  },
]
const PROVIDER_IDS = new Set(PROVIDERS.map((item) => item.id))

function providerOf(id) {
  return PROVIDERS.find((entry) => entry.id === id)
}

function officialBaseUrl(provider) {
  const item = providerOf(provider)
  return item ? item.baseUrl : ''
}

function officialApiUrl(provider) {
  const item = providerOf(provider)
  return item ? item.apiUrl : ''
}

function officialExample(provider) {
  const item = providerOf(provider)
  return item ? item.example : ''
}
const FORM_FIELDS = ['apiKey', 'baseUrl', 'model']

function configPath() {
  const home = process.env.MODLENS_HOME || join(homedir(), '.modlens')
  return join(home, 'config.json')
}

function loadConfig() {
  try {
    const data = JSON.parse(readFileSync(configPath(), 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function formOf(cfg, provider) {
  const id = PROVIDER_IDS.has(provider) ? provider : 'openai'
  const entry =
    cfg.providers && typeof cfg.providers === 'object' && typeof cfg.providers[id] === 'object'
      ? cfg.providers[id]
      : {}
  return {
    provider: id,
    apiKey: String(entry.apiKey || ''),
    baseUrl: String(entry.baseUrl || officialBaseUrl(id)),
    officialBaseUrl: officialBaseUrl(id),
    apiUrl: officialApiUrl(id),
    example: officialExample(id),
    model: String(entry.model || ''),
  }
}

function saveForm(values) {
  const provider = String(values.provider || 'openai').trim()
  if (!PROVIDER_IDS.has(provider)) {
    const error = new Error(`unknown provider: ${provider}`)
    error.status = 400
    throw error
  }
  const cfg = loadConfig()
  cfg.provider = provider
  if (!cfg.providers || typeof cfg.providers !== 'object') cfg.providers = {}
  if (!cfg.providers[provider] || typeof cfg.providers[provider] !== 'object') {
    cfg.providers[provider] = {}
  }
  const entry = cfg.providers[provider]
  for (const field of FORM_FIELDS) {
    const raw = String(values[field] || '').trim()
    if (raw) entry[field] = raw
    else delete entry[field]
  }
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, { encoding: 'utf8' })
  try {
    chmodSync(path, 0o600)
  } catch {
    // best-effort; some filesystems ignore mode
  }
  return formOf(cfg, provider)
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export function apply(ctx) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (scope) => {
    try {
      scope.webServer.register({
        name: 'dsh-desktop-modlens',
        kind: 'exact',
        path: '/dsh-desktop/modlens',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') {
              const cfg = loadConfig()
              const provider = new URL(req.url, 'http://localhost').searchParams.get('provider')
              json(res, 200, {
                ...formOf(cfg, provider || cfg.provider || 'openai'),
                options: PROVIDERS.map((item) => ({
                  id: item.id,
                  label: item.label,
                  officialBaseUrl: item.baseUrl,
                  apiUrl: item.apiUrl,
                  example: item.example,
                })),
              })
              return
            }
            if (req.method === 'PUT' || req.method === 'POST') {
              const body = await readJsonBody(req)
              json(res, 200, { ...saveForm(body), saved: true })
              return
            }
            res.writeHead(405).end()
          } catch (error) {
            json(res, error.status || 500, { error: String(error?.message || error) })
          }
        },
      })
    } catch (error) {
      console.error(`[dsh-desktop-vision] config route skipped: ${error}`)
    }
  })
}
