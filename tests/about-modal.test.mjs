import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

test('about modal app script is syntactically valid JavaScript', async () => {
	await execFileAsync(process.execPath, ['--check', 'public/app.js'])
})

test('side rail no longer renders 目标 or 备注 nav items', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const railSource = appSource.slice(
		appSource.indexOf('function renderSideRail'),
		appSource.indexOf('function renderSidebar'),
	)

	// The rail targets/notes items must be gone.
	assert.doesNotMatch(railSource, /id: 'targets'/)
	assert.doesNotMatch(railSource, /id: 'notes'/)
	assert.doesNotMatch(railSource, /rail\.targets/)
	assert.doesNotMatch(railSource, /rail\.notes/)

	// The old "settings" rail item must be gone too.
	assert.doesNotMatch(railSource, /id: 'settings'/)
	assert.doesNotMatch(railSource, /rail\.settings/)
})

test('side rail keeps only timeline, tools and about', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const railSource = appSource.slice(
		appSource.indexOf('function renderSideRail'),
		appSource.indexOf('function renderSidebar'),
	)

	assert.match(railSource, /id: 'timeline'/)
	assert.match(railSource, /id: 'tools'/)
	assert.match(railSource, /id: 'about'/)
	assert.match(railSource, /rail\.about/)
})

test('about rail item uses an info icon instead of the letter S', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	// An SVG info icon constant exists.
	assert.match(appSource, /const INFO_ICON_SVG = /)
	assert.match(appSource, /<circle cx="12" cy="12" r="10"/)

	// The about item references the SVG icon.
	const railSource = appSource.slice(
		appSource.indexOf('function renderSideRail'),
		appSource.indexOf('function renderSidebar'),
	)
	assert.match(railSource, /icon: INFO_ICON_SVG/)
})

test('about rail item opens a modal rather than switching section', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const railSource = appSource.slice(
		appSource.indexOf('function renderSideRail'),
		appSource.indexOf('function renderSidebar'),
	)

	// The about button uses data-action, not data-section.
	assert.match(railSource, /action: 'open-about'/)
})

test('clicking about opens the modal and close-about closes it', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /if \(action === 'open-about'\) \{[\s\S]*?state\.showAboutModal = true/)
	assert.match(appSource, /if \(action === 'close-about'\) \{[\s\S]*?state\.showAboutModal = false/)
	assert.match(appSource, /showAboutModal: false/)
})

test('about modal renders with backdrop, close button and compact panel', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function renderAboutModal\(model\)/)
	assert.match(appSource, /data-backdrop-close="about"/)
	assert.match(appSource, /data-action="close-about"/)
	assert.match(appSource, /class="modal-panel about-modal"/)
})

test('about modal is included in the main render output', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const renderBody = appSource.match(/function render\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''

	assert.match(renderBody, /renderAboutModal\(model\)/)
})

test('about modal contains author, version, updated time and supported jobs fields', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const modalSource = appSource.slice(
		appSource.indexOf('function renderAboutModal'),
		appSource.indexOf('function acrSupportStatus'),
	)

	assert.match(modalSource, /about\.author/)
	assert.match(modalSource, /about\.version/)
	assert.match(modalSource, /about\.updatedAt/)
	assert.match(modalSource, /about\.supportedJobs/)
	assert.match(modalSource, /APP_AUTHOR/)
	assert.match(modalSource, /APP_VERSION/)
	assert.match(modalSource, /APP_UPDATED_AT/)
})

test('about modal supported jobs count is derived from the ACR database', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const modalSource = appSource.slice(
		appSource.indexOf('function renderAboutModal'),
		appSource.indexOf('function acrSupportStatus'),
	)

	assert.match(modalSource, /acrDatabase\?\.jobs/)
	assert.match(modalSource, /acrSupportStatus\(job\)\.key === 'supported'/)
})

test('about modal can be dismissed via backdrop click and Escape key', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	// Backdrop click closes about modal.
	assert.match(appSource, /event\.target\.classList\?\.contains\('modal-backdrop'\)/)
	assert.match(appSource, /event\.target\.dataset\.backdropClose === 'about'/)

	// Escape key closes modals.
	assert.match(appSource, /document\.addEventListener\('keydown'/)
	assert.match(appSource, /event\.key !== 'Escape'/)
	assert.match(appSource, /state\.showAboutModal = false/)
})

test('about modal labels are translated across all three languages', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	const aboutKeys = [
		'about.title',
		'about.projectName',
		'about.intro',
		'about.author',
		'about.version',
		'about.updatedAt',
		'about.supportedJobs',
		'about.acrSource',
		'about.fflogs',
		'about.localImport',
		'about.port',
	]

	for (const key of aboutKeys) {
		const escaped = key.replace(/\./g, '\\.')
		const zhCN = new RegExp(`'${escaped}': '[^']+'`, '')
		assert.match(appSource, zhCN, `Missing zh-CN value for ${key}`)
	}
})

test('about modal CSS reuses the ACR modal shell and adds compact about styles', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.about-modal\s*\{[^}]*max-width:\s*min\(480px,\s*100%\)/s)
	assert.match(css, /\.about-list\s*\{/)
	assert.match(css, /\.about-row\s*\{[^}]*grid-template-columns:\s*minmax\(96px,\s*130px\)/s)
	assert.match(css, /\.side-rail-footer\s*\{[^}]*margin-top:\s*auto/s)
})
