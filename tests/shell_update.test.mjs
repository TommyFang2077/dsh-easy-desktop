import assert from 'node:assert/strict'
import test from 'node:test'

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

  await import(new URL('../ui/app.js?update-test', import.meta.url))
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
