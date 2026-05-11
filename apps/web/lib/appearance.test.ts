import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  clampFontScale,
  matchPreset,
  roundFontScale,
} from './appearance'

test('clampFontScale: clamps below min', () => {
  assert.equal(clampFontScale(0.1), FONT_SCALE_MIN)
})

test('clampFontScale: clamps above max', () => {
  assert.equal(clampFontScale(5), FONT_SCALE_MAX)
})

test('clampFontScale: passes through valid value', () => {
  assert.equal(clampFontScale(1.0), 1.0)
  assert.equal(clampFontScale(0.9), 0.9)
  assert.equal(clampFontScale(1.25), 1.25)
})

test('clampFontScale: NaN and non-numeric default to 1.0', () => {
  assert.equal(clampFontScale(NaN), FONT_SCALE_DEFAULT)
  assert.equal(clampFontScale('not-a-number'), FONT_SCALE_DEFAULT)
  assert.equal(clampFontScale(null), FONT_SCALE_DEFAULT)
  assert.equal(clampFontScale(undefined), FONT_SCALE_DEFAULT)
})

test('clampFontScale: coerces numeric string', () => {
  assert.equal(clampFontScale('1.1'), 1.1)
})

test('roundFontScale: rounds to 2 decimals', () => {
  assert.equal(roundFontScale(1.234), 1.23)
  assert.equal(roundFontScale(0.999), 1.0)
})

test('matchPreset: identifies preset values', () => {
  assert.equal(matchPreset(0.8), 'small')
  assert.equal(matchPreset(1.0), 'standard')
  assert.equal(matchPreset(1.25), 'large')
})

test('matchPreset: returns custom for off-preset values', () => {
  assert.equal(matchPreset(1.15), 'custom')
  assert.equal(matchPreset(0.9), 'custom')
})

test('matchPreset: tolerates floating-point noise', () => {
  assert.equal(matchPreset(0.8 + 0.0001), 'small')
})
