import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appShellSource = fs.readFileSync(path.join(__dirname, 'app-shell.tsx'), 'utf8')
const projectOverviewSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'projects', '[projectId]', 'page.tsx'), 'utf8')

test('app shell main content column can shrink instead of creating horizontal page scroll', () => {
  assert.match(appShellSource, /gridTemplateColumns:\s*'280px minmax\(0, 1fr\)'/)
  assert.match(appShellSource, /<section style=\{\{[^}]*minWidth:\s*0/s)
})

test('project overview summary and activity grids use wrapping columns instead of fixed overflow widths', () => {
  assert.doesNotMatch(projectOverviewSource, /gridTemplateColumns:\s*'minmax\(280px, 1\.4fr\) minmax\(180px, 0\.7fr\) minmax\(240px, 1fr\)'/)
  assert.doesNotMatch(projectOverviewSource, /gridTemplateColumns:\s*'170px minmax\(220px, 320px\) 1fr'/)
  assert.match(projectOverviewSource, /repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)/)
})
