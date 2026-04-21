import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tsconfig = JSON.parse(readFileSync(path.join(here, '..', 'tsconfig.json'), 'utf8')) as { compilerOptions?: { rootDir?: string } }
const dockerfile = readFileSync(path.join(here, '..', 'Dockerfile'), 'utf8')

test('api build output is rooted at src so runtime entrypoints land directly in dist', () => {
  assert.equal(tsconfig.compilerOptions?.rootDir, 'src')
})

test('api image starts from the flattened dist entrypoint', () => {
  assert.match(dockerfile, /CMD \["node", "apps\/api\/dist\/index\.js"\]/)
})
