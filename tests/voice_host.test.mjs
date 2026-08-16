import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

function response() {
  return {
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status
      return this
    },
    end(body = '') {
      this.body = body
    },
  }
}

function request(method, url) {
  return {
    method,
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {},
  }
}

test('voice host reports and accepts an on-demand SenseVoice installation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-voice-test-'))
  process.env.DSH_DESKTOP_VOICE_HOME = home
  process.env.XDG_CONFIG_HOME = join(home, 'config')
  const configDir = join(home, 'config', 'dsh-desktop')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'voice.json'), JSON.stringify({ engine: 'auto' }))
  try {
    const routes = new Map()
    const plugin = await import(`../plugins/dsh-desktop-voice/index.js?test=${Date.now()}`)
    plugin.apply({
      inject(_dependencies, load) {
        load({
          webServer: {
            register(route) {
              routes.set(route.path, route.handler)
            },
          },
        })
      },
    })

    const configResponse = response()
    await routes.get('/dsh-desktop/voice')(request('GET', '/dsh-desktop/voice'), configResponse)
    assert.equal(configResponse.status, 200)
    const missing = JSON.parse(configResponse.body)
    assert.equal(missing.engine, 'sensevoice')
    assert.equal(missing.modelInstalled, false)
    assert.equal(missing.modelStatus, 'missing')
    assert.deepEqual(missing.options.engines.map((engine) => engine.id), ['sensevoice', 'openai'])

    const missingProgressResponse = response()
    await routes.get('/dsh-desktop/voice/model')(
      request('GET', '/dsh-desktop/voice/model'),
      missingProgressResponse,
    )
    assert.deepEqual(JSON.parse(missingProgressResponse.body), {
      status: 'missing',
      percent: 0,
      stage: '',
    })

    const modelDir = join(home, 'sensevoice')
    const packageDir = join(home, 'runtime', 'node_modules', 'sherpa-onnx')
    mkdirSync(modelDir, { recursive: true })
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(modelDir, 'model.int8.onnx'), '')
    truncateSync(join(modelDir, 'model.int8.onnx'), 239233841)
    writeFileSync(join(modelDir, 'tokens.txt'), '')
    truncateSync(join(modelDir, 'tokens.txt'), 315894)
    writeFileSync(
      join(modelDir, 'installed.json'),
      JSON.stringify({
        modelVersion: '2365baeacb507f821a0c8120fcee3d484dba7a07',
        runtimeVersion: '1.13.5',
      }),
    )
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ version: '1.13.5' }))

    const installResponse = response()
    await routes.get('/dsh-desktop/voice/model')(request('POST', '/dsh-desktop/voice/model'), installResponse)
    assert.equal(installResponse.status, 200)
    const installed = JSON.parse(installResponse.body)
    assert.equal(installed.installed, true)
    assert.equal(installed.modelInstalled, true)
    assert.equal(installed.modelStatus, 'installed')

    const installedProgressResponse = response()
    await routes.get('/dsh-desktop/voice/model')(
      request('GET', '/dsh-desktop/voice/model'),
      installedProgressResponse,
    )
    assert.deepEqual(JSON.parse(installedProgressResponse.body), {
      status: 'installed',
      percent: 100,
      stage: 'SenseVoice 已安装',
    })
  } finally {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.DSH_DESKTOP_VOICE_HOME
    rmSync(home, { recursive: true, force: true })
  }
})
