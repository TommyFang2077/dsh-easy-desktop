import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('../ui/app.js', import.meta.url), 'utf8')
const loadApp = () => import(`data:text/javascript,${encodeURIComponent(`${appSource}\n// ${Math.random()}`)}`)


const nextTurn = () => new Promise(resolve => setImmediate(resolve))

function element(hidden = false) {
  return {
    disabled: false,
    hidden,
    textContent: '',
    listeners: new Map(),
    addEventListener(name, listener) {
      this.listeners.set(name, listener)
    },
  }
}

test('startup waits for an available signed shell update decision', async () => {
  const elements = new Map([
    ['status', element()],
    ['boot-progress', element(true)],
    ['progress-value', element()],
    ['progress-label', element()],
    ['spinner', element()],
    ['retry', element(true)],
    ['detail', element(true)],
    ['update-panel', element(true)],
    ['update-notes', element()],
    ['install-update', element()],
    ['skip-update', element()],
  ])
  const invokes = []
  globalThis.document = {
    readyState: 'complete',
    getElementById(id) {
      return elements.get(id)
    },
  }
  globalThis.window = {
    __TAURI__: {
      event: { async listen() {} },
      core: {
        async invoke(command) {
          invokes.push(command)
          if (command === 'check_shell_update') {
            return { version: '1.2.3', notes: 'signed release' }
          }
          return null
        },
      },
    },
  }

  await loadApp()
  await nextTurn()

  assert.deepEqual(invokes, ['check_shell_update'])
  assert.equal(elements.get('status').textContent, '发现壳更新 1.2.3')
  assert.equal(elements.get('update-notes').textContent, 'signed release')
  assert.equal(elements.get('update-panel').hidden, false)

  await elements.get('skip-update').listeners.get('click')()
  await nextTurn()
  assert.deepEqual(invokes, ['check_shell_update', 'skip_shell_update'])
  assert.equal(elements.get('update-panel').hidden, true)
})

test('startup deployment status shows determinate progress', async () => {
  const elements = new Map([
    ['status', element()],
    ['boot-progress', element(true)],
    ['progress-value', element()],
    ['spinner', element()],
    ['retry', element(true)],
    ['detail', element(true)],
    ['progress-label', element()],
    ['update-panel', element(true)],
    ['update-notes', element()],
    ['install-update', element()],
    ['skip-update', element()],
  ])
  const listeners = new Map()
  globalThis.document = {
    readyState: 'complete',
    getElementById(id) {
      return elements.get(id)
    },
  }
  globalThis.window = {
    __TAURI__: {
      event: {
        async listen(name, listener) {
          listeners.set(name, listener)
        },
      },
      core: { async invoke() { return null } },
    },
  }

  await loadApp()
  await nextTurn()
  listeners.get('status')({
    payload: { message: '正在首次部署 DeepSeek Harness（2/3）…', progress: 60 },
  })

  assert.equal(elements.get('status').textContent, '正在首次部署 DeepSeek Harness（2/3）…')
  assert.equal(elements.get('boot-progress').hidden, false)
  assert.equal(elements.get('progress-value').value, 60)
  assert.equal(elements.get('progress-label').textContent, '60%')
})
