import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('timelineCooldownBaselineEvents includes ACR simulated player actions for CD seed', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const baselineSource = appSource.slice(
		appSource.indexOf('function timelineCooldownBaselineEvents('),
		appSource.indexOf('function applyCooldownUsage('),
	)

	// Must include simulated events (opener / pre-pull skills from ACR)
	assert.match(baselineSource, /simulatedEvents/)
	assert.match(baselineSource, /state\.showAcrSimulation/)
	assert.match(baselineSource, /track\.simulated/)
	assert.match(baselineSource, /acrSimulation/)
	// Must NOT filter out simulated events
	assert.doesNotMatch(baselineSource, /!event\.simulated/)
	// Must filter for player-action kind only (not boss casts, not QT controls)
	assert.match(baselineSource, /event\.kind === 'player-action'/)
})

test('checkCooldownConflict function exists and returns detailed conflict info', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function checkCooldownConflict\(/)
	// Must use actionId-based cooldown key (not display name)
	assert.match(appSource, /cooldownKey = `action:\$\{resolvedActionId\}`/)
	// Must scan baseline events AND existing manual items
	assert.match(appSource, /timelineCooldownBaselineEvents\(\)/)
	assert.match(appSource, /state\.inserted/)
	// Must return conflict details: skillName, lastTimeMs, remainingMs, message
	assert.match(appSource, /conflict:\s*true/)
	assert.match(appSource, /skillName:/)
	assert.match(appSource, /lastTimeMs:/)
	assert.match(appSource, /remainingMs:/)
	assert.match(appSource, /readyAtMs/)
	assert.match(appSource, /recastMs/)
	// Message must include skill name, last time, current time, remaining seconds
	assert.match(appSource, /CD 冲突/)
	assert.match(appSource, /上次出现在/)
	assert.match(appSource, /还差/)
	assert.match(appSource, /s CD/)
})

test('resolveActionIdByName provides fallback for events missing actionId', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function resolveActionIdByName\(/)
	assert.match(appSource, /state\.model\?\.skillDatabase/)
	assert.match(appSource, /db\.skills\.find\(skill => skill\.name === name\)/)
})

test('insertSkillAtMs blocks insertion on CD conflict', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const insertSource = appSource.slice(
		appSource.indexOf('function insertSkillAtMs('),
		appSource.indexOf('function manualInsertStatusTime('),
	)

	// Must call checkCooldownConflict before inserting
	assert.match(insertSource, /const conflict = checkCooldownConflict\(actionId,\s*timeMs\)/)
	// Must block insertion and show error if conflict
	assert.match(insertSource, /if \(conflict\?\.conflict\) \{/)
	assert.match(insertSource, /setImportError\(conflict\.message\)/)
	assert.match(insertSource, /return/)
})

test('moveManualSkillAtTimeline blocks drag on CD conflict', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const moveSource = appSource.slice(
		appSource.indexOf('function moveManualSkillAtTimeline('),
		appSource.indexOf('function moveExistingTimelineEventAtTimeline('),
	)

	// Must call checkCooldownConflict with excludeId (to exclude the item being moved)
	assert.match(moveSource, /checkCooldownConflict\(item\.actionId,\s*timeMs,\s*\{excludeId:\s*manualId\}\)/)
	// Must block move and show error if conflict
	assert.match(moveSource, /if \(conflict\?\.conflict\) \{/)
	assert.match(moveSource, /setImportError\(conflict\.message\)/)
	assert.match(moveSource, /return/)
})

test('updateManualSkillTime blocks time edit on CD conflict', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const updateSource = appSource.slice(
		appSource.indexOf('function updateManualSkillTime('),
		appSource.indexOf('function updateManualSkillTarget('),
	)

	// Must call checkCooldownConflict with excludeId
	assert.match(updateSource, /checkCooldownConflict\(item\.actionId,\s*clamped\.absoluteTimeMs,\s*\{excludeId:\s*manualId\}\)/)
	// Must block update and show error if conflict
	assert.match(updateSource, /if \(conflict\?\.conflict\) \{/)
	assert.match(updateSource, /setImportError\(conflict\.message\)/)
	assert.match(updateSource, /return/)
})

test('moveExistingTimelineEventAtTimeline checks CD conflict for imported events', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const moveExistingSource = appSource.slice(
		appSource.indexOf('function moveExistingTimelineEventAtTimeline('),
		appSource.indexOf('function editableTimelineEventTargets('),
	)

	// Must check CD conflict before moving
	assert.match(moveExistingSource, /checkCooldownConflict\(target\.event\.actionId/)
	assert.match(moveExistingSource, /excludeId:\s*target\.event\.id/)
	// Must block move and show error if conflict
	assert.match(moveExistingSource, /if \(conflict\?\.conflict\) \{/)
	assert.match(moveExistingSource, /setImportError\(conflict\.message\)/)
	assert.match(moveExistingSource, /return/)
})

test('checkCooldownConflict handles unknown actionId gracefully', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const conflictSource = appSource.slice(
		appSource.indexOf('function checkCooldownConflict('),
		appSource.indexOf('function timelineCooldownBaselineEvents('),
	)

	// Must return unknown result when actionId can't be resolved
	assert.match(conflictSource, /unknown:\s*true/)
	assert.match(conflictSource, /缺少技能 ID，无法校验 CD/)
	// Must try name-based resolution as fallback
	assert.match(conflictSource, /resolveActionIdByName/)
})

test('manualCooldownKey uses actionId for normalization, not display name', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const keySource = appSource.slice(
		appSource.indexOf('function manualCooldownKey('),
		appSource.indexOf('function manualActionRecastMs('),
	)

	// Must use action:${actionId} for non-GCD actions
	assert.match(keySource, /return `action:\$\{actionId\}`/)
	// Must return empty string for missing actionId
	assert.match(keySource, /if \(!actionId\) \{/)
	assert.match(keySource, /return ''/)
})

test('CD conflict warning CSS provides high-contrast error styling', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.import-feedback\.error\s*\{/)
	assert.match(css, /\.import-feedback\.error[^}]*font-weight:\s*700/s)
})
