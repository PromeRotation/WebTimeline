import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('index.html opens the canonical home page by default', async () => {
	const html = await readFile('public/index.html', 'utf8')

	assert.match(html, /<!doctype html>/i)
	assert.match(html, /<title>WebTimeline<\/title>/)
	assert.match(html, /location\.replace\('\.\/home\.html'\)/)
	assert.match(html, /location\.replace\('\.\/app\.html'\)/)
	assert.doesNotMatch(html, /href="\.\/styles\.css"/)
	assert.doesNotMatch(html, /src="\.\/app\.js/)
})

test('home.html exists and contains the WebTimeline title', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /<!doctype html>/i)
	assert.match(html, /<title>WebTimeline<\/title>/)
})

test('app.html keeps the editor shell and app assets', async () => {
	const html = await readFile('public/app.html', 'utf8')

	assert.match(html, /<div id="app">/)
	assert.match(html, /href="\.\/styles\.css"/)
	assert.match(html, /src="\.\/app\.js/)
})

test('home page embeds the Moe-Counter SVG image', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /src="http:\/\/8\.138\.201\.201:18080\/@webtimeline\?theme=pr-lumina"/)
	// Counter image height is constrained to avoid layout blow-up.
	assert.match(html, /\.home-counter img\s*\{[^}]*height:\s*112px/s)
})

test('home page has an enter button linking to the main app', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /href="\.\/app\.html"/)
	assert.match(html, /data-i18n="enter"/)
})

test('home page inline script is syntactically valid', async () => {
	const html = await readFile('public/home.html', 'utf8')
	const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]

	assert.ok(script)
	assert.doesNotThrow(() => new Function(script))
})

test('home page includes a subtle terminal status strip', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /class="home-terminal"/)
	assert.match(html, /webtimeline/)
	assert.match(html, /--ready/)
})

test('home page footer shows version and author', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /v0\.1\.0/)
	assert.match(html, /pr大团体/)
})

test('home page supports three languages via i18n switcher', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /data-lang="zh-CN"/)
	assert.match(html, /data-lang="zh-TW"/)
	assert.match(html, /data-lang="ja-JP"/)

	// i18n dictionary has entries for all three languages.
	assert.match(html, /'zh-CN': \{/)
	assert.match(html, /'zh-TW': \{/)
	assert.match(html, /'ja-JP': \{/)
})

test('home page i18n covers all visible text fields', async () => {
	const html = await readFile('public/home.html', 'utf8')

	const keys = ['subtitle', 'counterPrefix', 'enter']
	for (const key of keys) {
		assert.match(html, new RegExp(`${key}:`), `Missing i18n key: ${key}`)
	}
})

test('home page uses Claude/Anthropic warm color palette', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /--paper:\s*#faf9f5/)
	assert.match(html, /--ink:\s*#1a1915/)
	assert.match(html, /--accent:\s*#cc785c/)
	assert.match(html, /color-scheme:\s*light/)
})

test('home page does NOT load the main app styles.css', async () => {
	const html = await readFile('public/home.html', 'utf8')

	// The home page must be fully self-contained.
	assert.doesNotMatch(html, /href="\.\/styles\.css"/)
	assert.doesNotMatch(html, /src="\.\/app\.js"/)
})

test('home page is responsive and prevents mobile overflow', async () => {
	const html = await readFile('public/home.html', 'utf8')

	assert.match(html, /<meta name="viewport"[^>]*width=device-width/)
	assert.match(html, /@media \(max-width:\s*480px\)/)
})
