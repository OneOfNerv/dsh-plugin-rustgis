import { access } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

export function buildRunArgs({ data = [], project, steps, save }, cwd, commands, tools) {
  if (!steps.length || steps.length > 32) throw new Error('Provide 1–32 GIS steps.')
  const args = ['run', '--no-plugins']
  const localPath = path => {
    if (!path.trim() || /^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
      throw new Error('Use a local input or output path.')
    }
    return isAbsolute(path) ? path : resolve(cwd, path)
  }
  if (project) args.push('--project', localPath(project))
  for (const path of data) args.push('--data', localPath(path))
  for (const { id, params = {} } of steps) {
    if (!commands.has(id)) throw new Error(`Unknown or unavailable GIS command: ${id}`)
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error(`Parameters for ${id} must be a JSON object.`)
    }
    if (id === 'gp.run' && !tools.has(params.tool)) {
      throw new Error(`Unknown geoprocessing tool: ${params.tool}`)
    }
    args.push('--cmd', `${id}=${JSON.stringify(params)}`)
  }
  if (save) args.push('--save', localPath(save))
  return args
}

// These commands act on data in the private CLI session. Management of plugins,
// credentials, scripts and the desktop application belongs outside this tool.
const excluded = /^(?:gp\.(?:installGeolibre|uninstallGeolibre|finish|tools)$|info\.commands$)/
const namespaces = /^(?:gp|imagery|raster|cube|zarr|terrain|layer|table|selection|select|style|map|share|export|info)\./

export function createCatalog(commands, tools, manifests) {
  if (![commands, tools, manifests].every(Array.isArray)) throw new Error('Unexpected GIS catalog response.')
  const byManifest = new Map(manifests.map(entry => [entry.id, entry]))
  return {
    command: new Map(commands.filter(({ id }) => namespaces.test(id) && !excluded.test(id)).map(entry => [entry.id, entry])),
    tool: new Map(tools.map(entry => {
      const manifest = entry.id.startsWith('geolibre:') && byManifest.get(entry.id.slice('geolibre:'.length))
      return [entry.id, manifest ? { ...entry, manifest } : entry]
    })),
  }
}

export function searchCatalog(catalog, query, limit) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const matches = []
  for (const [kind, entries] of Object.entries(catalog)) {
    for (const { id, label, name, summary, toolbox, location } of entries.values()) {
      const title = label ?? name ?? id
      const content = [id, title, summary, toolbox, location].join(' ').toLowerCase()
      if (words.every(word => content.includes(word))) {
        matches.push({ kind, id, title, category: toolbox ?? location, summary })
      }
    }
  }
  const exact = ({ id, title }) => [id, title].some(value => value.toLowerCase() === query.trim().toLowerCase())
  matches.sort((a, b) => Number(exact(b)) - Number(exact(a)) || a.id.localeCompare(b.id))
  return { total: matches.length, matches: matches.slice(0, limit) }
}

export async function runProcess(ctx, executable, args, runner, exec, maxBytes) {
  exec.signal.throwIfAborted()
  const session = exec.agent?.session
  const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
  const cwd = exec.agent === undefined ? policy.workspaceRoot : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  const argv = [executable, ...(typeof args === 'function' ? args(cwd) : args)]
  await access(executable).catch(() => { throw new Error(`GIS executable is missing: ${executable}`) })
  const confined = policy.mode === 'danger-full-access' ? argv : (await ctx.sandbox.confine(argv, policy, exec.signal)).argv
  exec.signal.throwIfAborted()
  const process = ctx.subprocess.spawn({
    argv: confined,
    cwd,
    env: { RUSTGIS_GEOLIBRE: runner },
    signal: exec.signal,
    graceMs: 1500,
    stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes: 16_384 } },
  })
  const outcome = await process.done
  exec.signal.throwIfAborted()
  const stdout = process.collected.stdout?.readFrom(0)
  const stderr = process.collected.stderr?.readFrom(0)
  if (outcome.exitCode !== 0) {
    throw new Error(`GIS process failed (${outcome.exitCode ?? outcome.signal}): ${stderr?.text.trim() || stdout?.text.trim() || 'No diagnostics.'}`)
  }
  return { cwd, stdout: stdout?.text.trim() ?? '', stderr: stderr?.text.trim() ?? '', truncated: Boolean(stdout?.lossy || stderr?.lossy) }
}
