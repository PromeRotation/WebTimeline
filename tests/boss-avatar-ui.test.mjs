import assert from 'node:assert/strict'
import {access, readFile} from 'node:fs/promises'
import test from 'node:test'

test('keeps pixel boss guidance out of the sidebar and attaches avatars to boss rows', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const styleSource = await readFile('public/styles.css', 'utf8')

	assert.equal(appSource.includes('像素 Boss 引导'), false)
	assert.equal(appSource.includes('左侧头像跟随编辑栏'), false)
	assert.match(appSource, /function renderBossAvatar\(/)
	assert.match(appSource, /renderBossAvatar\(row\.sourceName \?\? row\.label, row\.bossIndex\)/)
	assert.match(styleSource, /\.boss-avatar/)
})

test('boss avatars match the separate Chaos, Exdeath, Kefka references and use pixel icons for statue and black hole', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const styleSource = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /if \(text\.includes\('新生艾克斯迪司'\) \|\| \/neo\/i\.test\(text\)\) return 'exdeath'/)
	assert.match(appSource, /chaos:\s*\{\s*src:\s*'\/assets\/boss\/chaos\.png',\s*kind:\s*'image'\s*\}/)
	assert.match(appSource, /exdeath:\s*\{\s*src:\s*'\/assets\/boss\/exdeath\.png',\s*kind:\s*'image'\s*\}/)
	assert.match(appSource, /kefka:\s*\{\s*src:\s*'\/assets\/boss\/kefka\.gif',\s*kind:\s*'image'\s*\}/)
	assert.match(appSource, /statue:\s*\{\s*pixel:\s*'statue',\s*kind:\s*'pixel'\s*\}/)
	assert.match(appSource, /'black-hole':\s*\{\s*pixel:\s*'black-hole',\s*kind:\s*'pixel'\s*\}/)
	assert.match(appSource, /<img src="\$\{avatar\.src\}" alt="" loading="lazy" decoding="async">/)
	assert.match(appSource, /function renderBossPixelAvatar\(name\)/)
	assert.match(appSource, /BOSS_PIXEL_AVATARS = \{/)
	assert.doesNotMatch(appSource, /BOSS_AVATAR_PIXELS|boss-px|renderPixelBoss|return 'neo-exdeath'|BOSS_DUO_AVATAR_ASSET|exdeath-chaos\.png/)
	assert.doesNotMatch(styleSource, /\.boss-avatar-crop-left|\.boss-avatar-crop-right/)
	assert.match(styleSource, /\.boss-avatar-pixel-grid/)
	assert.match(styleSource, /\.boss-avatar-pixel-cell/)
	assert.doesNotMatch(styleSource, /\.boss-px|\.boss-avatar \.b\d+/)

	await access('public/assets/boss/chaos.png')
	await access('public/assets/boss/exdeath.png')
	await access('public/assets/boss/kefka.gif')
})
