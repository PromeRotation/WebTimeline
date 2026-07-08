import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('i18n system defines three supported languages', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /const SUPPORTED_LANGUAGES = \['zh-CN', 'zh-TW', 'ja-JP'\]/)
	assert.match(appSource, /const LANGUAGE_STORAGE_KEY = 'webtimelineLanguage'/)
	assert.match(appSource, /'zh-CN': '简中'/)
	assert.match(appSource, /'zh-TW': '繁中'/)
	assert.match(appSource, /'ja-JP': '日本語'/)
})

test('i18n dictionary has matching keys across all three languages', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const dictMatch = appSource.match(/const I18N = \{([\s\S]*?)\n\}/)
	assert.ok(dictMatch, 'I18N dictionary not found')

	const extractKeys = (lang) => {
		const langBlock = appSource.match(new RegExp(`'${lang}': \\{([\\s\\S]*?)\\n\\t\\},`))
		if (!langBlock) return new Set()
		const keys = []
		for (const line of langBlock[1].split('\n')) {
			const keyMatch = line.match(/^\t+'([^']+)':/)
			if (keyMatch) keys.push(keyMatch[1])
		}
		return new Set(keys)
	}

	const zhCNKeys = extractKeys('zh-CN')
	const zhTWKeys = extractKeys('zh-TW')
	const jaJPKeys = extractKeys('ja-JP')

	assert.ok(zhCNKeys.size > 50, `zh-CN should have many keys, got ${zhCNKeys.size}`)
	assert.equal(zhTWKeys.size, zhCNKeys.size, `zh-TW should have same key count as zh-CN (${zhTWKeys.size} vs ${zhCNKeys.size})`)
	assert.equal(jaJPKeys.size, zhCNKeys.size, `ja-JP should have same key count as zh-CN (${jaJPKeys.size} vs ${zhCNKeys.size})`)

	for (const key of zhCNKeys) {
		assert.ok(zhTWKeys.has(key), `zh-TW missing key: ${key}`)
		assert.ok(jaJPKeys.has(key), `ja-JP missing key: ${key}`)
	}
})

test('i18n helper functions exist and follow the expected API', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function detectLanguage\(\)/)
	assert.match(appSource, /function t\(key, fallback = ''\)/)
	assert.match(appSource, /function setLanguage\(lang\)/)
	assert.match(appSource, /function renderLanguageSwitcher\(\)/)
})

test('detectLanguage defaults to zh-CN and reads from localStorage', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /localStorage\.getItem\(LANGUAGE_STORAGE_KEY\)/)
	assert.match(appSource, /return 'zh-CN'/)
})

test('setLanguage persists to localStorage and updates document lang', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /localStorage\.setItem\(LANGUAGE_STORAGE_KEY, next\)/)
	assert.match(appSource, /document\.documentElement\.lang = next/)
	assert.match(appSource, /state\.language = next/)
})

test('language switcher renders buttons for all supported languages', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /class="lang-switcher"/)
	assert.match(appSource, /data-lang="\$\{lang\}"/)
	assert.match(appSource, /aria-pressed=/)
	assert.match(appSource, /LANGUAGE_LABELS\[lang\]/)
})

test('state.language is initialized from detectLanguage', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /language: detectLanguage\(\)/)
})

test('init sets document.documentElement.lang from state.language', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /document\.documentElement\.lang = state\.language/)
})

test('click handler processes language switcher buttons', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /data-lang/)
	assert.match(appSource, /setLanguage\(langTarget\.dataset\.lang\)/)
})

test('t() falls back to zh-CN then to fallback then to key', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /I18N\[lang\]\?\.\[key\] \?\? I18N\['zh-CN'\]\?\.\[key\]/)
	assert.match(appSource, /return value != null && value !== '' \? value : \(fallback \|\| key\)/)
})

test('i18n covers core UI areas', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	const requiredKeys = [
		'nav.timeline', 'nav.tools', 'nav.teamMode', 'rail.about',
		'label.mode', 'label.job', 'label.acr',
		'mode.browse', 'mode.edit',
		'action.import', 'action.export', 'action.insert', 'action.close',
		'overview.title', 'overview.boss', 'overview.mitigation',
		'category.all', 'category.output', 'category.mitigation',
		'insert.title', 'burst.title', 'potion.title',
		'fflogs.eyebrow', 'fflogs.title', 'fflogs.placeholder',
		'tool.eyebrow', 'tool.title',
		'boot.loading', 'empty.noData',
		'acr.title', 'acr.status.supported',
		'focus.eyebrow', 'focus.searchPlaceholder',
	]

	for (const key of requiredKeys) {
		assert.match(appSource, new RegExp(`'${key.replace(/\./g, '\\.')}':`), `Missing i18n key: ${key}`)
	}
})
