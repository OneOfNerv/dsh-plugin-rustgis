import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { buildRunArgs, createCatalog, runProcess, searchCatalog } from './runtime.js'

export const name = 'rustgis-tools'
export const inject = ['tools', 'sandbox', 'sandboxPolicy', 'subprocess', 'workingDirectory']

const native = file => fileURLToPath(new URL(`../native/win32-x64/${file}`, import.meta.url))
const cli = native('rustgis-cli.exe')
const runner = native('geolibre.exe')
const output = {
  schema: { type: 'string' },
  render: (_args, text) => [{ type: 'text', text }],
}

export function apply(ctx) {
  if (process.platform !== 'win32' || process.arch !== 'x64') return

  // Cache only successful catalogs, and never share a pending process owned by
  // another caller's cancellation signal or workspace policy.
  let catalog
  async function getCatalog(exec) {
    if (catalog) return catalog
    await access(runner).catch(() => { throw new Error('The packaged GeoLibre runner is missing. Install the Windows x64 release tarball.') })
    const read = async (exe, args) => {
      const result = await runProcess(ctx, exe, args, runner, exec, 64 * 1024 * 1024)
      if (result.truncated) throw new Error('The GIS catalog exceeded the capture limit.')
      return JSON.parse(result.stdout)
    }
    const commands = await read(cli, ['commands', '--no-plugins'])
    const tools = await read(cli, ['tools', '--no-plugins'])
    const manifests = await read(runner, ['manifests'])
    if (!tools.some(entry => entry.id.startsWith('geolibre:'))) {
      throw new Error('RustGIS did not load the packaged GeoLibre toolbox.')
    }
    catalog = createCatalog(commands, tools, manifests)
    return catalog
  }

  ctx.tools.register(defineTool({
    name: 'gis_search',
    description: 'Search RustGIS commands and GeoLibre geoprocessing tools by keyword. Use gis_describe for parameters.',
    parameters: { query: { type: 'string' }, limit: { type: 'integer' } },
    timeoutMs: 90_000,
    output,
    async execute({ query = '', limit = 20 }, exec) {
      return JSON.stringify(searchCatalog(await getCatalog(exec), query, Math.max(1, Math.min(limit, 50))))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'gis_describe',
    description: 'Get the parameter description for an exact GIS command or geoprocessing tool ID.',
    parameters: {
      kind: { type: 'string', enum: ['command', 'tool'], required: true },
      id: { type: 'string', required: true },
    },
    timeoutMs: 90_000,
    output,
    async execute({ kind, id }, exec) {
      const entry = (await getCatalog(exec))[kind].get(id)
      if (!entry) throw new Error(`Unknown GIS ${kind}: ${id}`)
      return JSON.stringify(entry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'gis_run',
    description: 'Run ordered RustGIS commands in a private GIS session. For a tool, use id gp.run and params {tool, params}. Add an export command to write results, or save the project. Paths are relative to the session working directory.',
    parameters: {
      data: { type: 'array', items: { type: 'string' }, description: 'Local input datasets to open before running the steps.' },
      project: { type: 'string', description: 'Optional local .rgis project to open.' },
      steps: {
        type: 'array', required: true, items: {
          type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true },
            params: { type: 'object', additionalProperties: true },
          },
        },
      },
      save: { type: 'string', description: 'Optional output .rgis project path.' },
    },
    timeoutMs: 30 * 60_000,
    output,
    async execute(request, exec) {
      const { command, tool } = await getCatalog(exec)
      const result = await runProcess(ctx, cli, cwd => buildRunArgs(request, cwd, command, tool), runner, exec, 32_768)
      return JSON.stringify(result)
    },
  }))
}
