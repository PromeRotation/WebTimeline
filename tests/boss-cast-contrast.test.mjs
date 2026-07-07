import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('yellow boss cast bars use dedicated high contrast styling', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.cast\.boss-idx-2\s*\{/)
	assert.match(css, /#1f1707/)
	assert.match(css, /box-shadow:[^}]*rgba\(255,\s*213,\s*74,\s*0\.38\)/s)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.cast-badge\s*\{/)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.item-damage\s*\{/)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.cast-release\s*\{/)
})

test('standalone boss damage bubbles stay readable on the pale timeline grid', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.damage\s*\{/)
	assert.match(css, /\.xiva-item\.damage[^}]*#2a1b04/s)
	assert.match(css, /\.xiva-item\.damage[^}]*border-color:\s*rgba\(255,\s*213,\s*74,\s*0\.92\)/s)
	assert.match(css, /\.xiva-item\.damage \.cast-time\s*\{/)
	assert.match(css, /\.xiva-item\.damage \.cast-time[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.42\)/s)
	assert.match(css, /\.xiva-item\.damage \.item-damage\s*\{/)
	assert.match(css, /\.xiva-item\.damage \.item-damage[^}]*#ffd54a/s)
})

test('boss cast bubbles use structured rows for cast, damage and resolve timing', async () => {
	const [js, css] = await Promise.all([
		readFile('public/app.js', 'utf8'),
		readFile('public/styles.css', 'utf8'),
	])

	assert.match(js, /class="cast-main"/)
	assert.match(js, /class="cast-meta"/)
	assert.match(js, /class="cast-resolve"/)
	assert.match(css, /\.xiva-item\.cast\s*\{[^}]*min-width:\s*168px/s)
	assert.match(css, /\.xiva-item\.cast\s*\{[^}]*height:\s*52px/s)
	assert.match(css, /\.cast-main\s*\{/)
	assert.match(css, /\.cast-meta\s*\{/)
	assert.match(css, /\.cast-resolve\s*\{/)
	assert.match(css, /\.cast-name\s*\{[^}]*max-width:\s*none/s)
	assert.match(css, /\.xiva-item\.cast \.item-count\s*\{[^}]*right:\s*4px/s)
	assert.match(css, /\.xiva-item\.cast \.item-count\s*\{[^}]*top:\s*4px/s)
})
