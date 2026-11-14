import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/index.js'

test('Windows x64 plugin registers all three definitions with the DSH schema compiler', {
  skip: process.platform !== 'win32' || process.arch !== 'x64',
}, () => {
  const names = []
  apply({ tools: { register: definition => names.push(definition.name) } })
  assert.deepEqual(names, ['gis_search', 'gis_describe', 'gis_run'])
})
