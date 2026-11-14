import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildRunArgs, createCatalog, runProcess, searchCatalog } from '../src/runtime.js'

const catalog = createCatalog(
  [{ id: 'gp.run' }, { id: 'gp.installGeolibre' }, { id: 'share.exportLayer' }],
  [{ id: 'geolibre:slope', name: 'Slope' }],
  [{ id: 'slope', parameters: [{ name: 'dem' }] }],
)

test('catalog joins runner parameters and excludes installation commands', () => {
  const result = searchCatalog(catalog, 'slope', 10)
  assert.deepEqual(result.matches.map(match => match.id), ['geolibre:slope'])
  assert.equal(catalog.tool.get('geolibre:slope').manifest.parameters[0].name, 'dem')
  assert.equal(catalog.command.has('gp.installGeolibre'), false)
})

test('run preserves Unicode paths and JSON as individual arguments', () => {
  const cwd = resolve('work')
  const request = { data: ['遥感 data.tif'], steps: [{ id: 'gp.run', params: { tool: 'geolibre:slope' } }], save: 'output.rgis' }
  assert.deepEqual(buildRunArgs(request, cwd, catalog.command, catalog.tool), [
    'run', '--no-plugins', '--data', resolve(cwd, '遥感 data.tif'), '--cmd', 'gp.run={"tool":"geolibre:slope"}', '--save', resolve(cwd, 'output.rgis'),
  ])
  request.steps[0].params.tool = 'missing'
  assert.throws(() => buildRunArgs(request, cwd, catalog.command, catalog.tool), /Unknown geoprocessing tool/)
})

test('process uses the caller workspace and exact confined argv', async () => {
  const exe = fileURLToPath(import.meta.url)
  const cwd = resolve('work')
  const policy = { mode: 'workspace-write', workspaceRoot: cwd }
  const signal = new AbortController().signal
  const confined = ['sandbox', exe, 'tools']
  const ctx = {
    sandboxPolicy: { resolve: () => policy },
    sandbox: { confine: async (argv, effectivePolicy, effectiveSignal) => {
      assert.deepEqual(argv, [exe, 'tools'])
      assert.equal(effectivePolicy, policy)
      assert.equal(effectiveSignal, signal)
      return { argv: confined }
    } },
    subprocess: { spawn: spec => {
      assert.equal(spec.argv, confined)
      assert.equal(spec.cwd, cwd)
      assert.equal(spec.env.RUSTGIS_GEOLIBRE, exe)
      assert.equal(spec.signal, signal)
      return { done: Promise.resolve({ exitCode: 0 }), collected: {} }
    } },
  }
  assert.equal((await runProcess(ctx, exe, ['tools'], exe, { signal }, 1024)).cwd, cwd)
})
