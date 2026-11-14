import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = fileURLToPath(new URL('../native/win32-x64/', import.meta.url))
const binaries = ['rustgis-cli.exe', 'geolibre.exe']
const manifest = resolve(target, 'checksums.json')

async function checksum(path) {
  const bytes = await readFile(path)
  const header = bytes.length >= 64 ? bytes.readUInt32LE(60) : 0
  if (bytes.toString('ascii', 0, 2) !== 'MZ' || header + 6 > bytes.length
      || bytes.readUInt32LE(header) !== 0x4550 || bytes.readUInt16LE(header + 4) !== 0x8664) {
    throw new Error(`Expected a Windows x64 executable: ${path}`)
  }
  return createHash('sha256').update(bytes).digest('hex')
}

async function main([cli, runner, notices, ...extra]) {
  if (cli === '--verify' && !runner) {
    const expected = JSON.parse(await readFile(manifest, 'utf8'))
    for (const name of binaries) {
      if (await checksum(resolve(target, name)) !== expected[name]) throw new Error(`Checksum mismatch: ${name}`)
    }
    await readFile(resolve(target, 'THIRD-PARTY-NOTICES.txt'))
    return
  }
  if (!cli || !runner || !notices || extra.length) {
    throw new Error('Usage: npm run stage:windows -- <rustgis-cli.exe> <geolibre.exe> <third-party-notices.txt>')
  }
  const sources = [resolve(cli), resolve(runner)]
  const hashes = await Promise.all(sources.map(checksum))
  const noticeText = await readFile(resolve(notices), 'utf8')
  if (!noticeText.trim()) throw new Error('Third-party notices must include the distributed runtimes’ license text and notices.')
  await mkdir(target, { recursive: true })
  for (const [index, name] of binaries.entries()) {
    await copyFile(sources[index], resolve(target, name))
  }
  await writeFile(resolve(target, 'THIRD-PARTY-NOTICES.txt'), noticeText)
  await writeFile(manifest, `${JSON.stringify(Object.fromEntries(binaries.map((name, index) => [name, hashes[index]])), null, 2)}\n`)
}

main(process.argv.slice(2)).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
