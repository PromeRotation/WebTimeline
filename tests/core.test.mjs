import test from 'node:test'
import assert from 'node:assert/strict'
import {loadFixture, flattenTimeline, buildModeTracks, buildTimelineRows} from '../src/timeline-data.mjs'
import {estimateDamage} from '../src/simulation.mjs'
import {buildAcrDatabase, discoverAcrSources, discoverSourceAcr} from '../src/acr-database.mjs'
import {createPrototypeModel} from '../src/app-model.mjs'
import {buildSkillDatabase, classifyAction, COMBAT_JOBS} from '../src/skill-database.mjs'
import {buildKanoDrkSimulation} from '../src/acr-simulation.mjs'
import {loadKanoDrkSourceOpener} from '../src/acr-source-opener.mjs'

test('flattens a PR tree timeline into editable events with cast badges', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const events = flattenTimeline(fixture)

	assert.equal(fixture.Meta.TerritoryId, 1363)
	assert.ok(events.length > 80)
	assert.ok(events.some(event => event.kind === 'boss-cast' && event.castEndLabel === '结束'))
	assert.ok(events.some(event => event.kind === 'player-action' && event.source === 'timeline'))
})

test('builds beginner and expert tracks from the same source events', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const tracks = buildModeTracks(flattenTimeline(fixture))

	assert.ok(tracks.beginner.burst.some(group => group.window === '60s' || group.window === '120s'))
	assert.ok(tracks.beginner.mitigation.length > 0)
	assert.ok(tracks.expert.boss.length > tracks.beginner.boss.length)
	assert.ok(tracks.expert.player.length > 0)
})

test('uses action ids for displayed skill names while preserving timeline labels', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const events = flattenTimeline(fixture)
	const blackestNight = events.find(event => Number(event.actionId) === 7393 && /黑盾/.test(event.timelineLabel ?? ''))
	const reprisal = events.find(event => Number(event.actionId) === 7535 && /血仇|雪仇/.test(event.timelineLabel ?? ''))
	const expectedNames = new Map([
		[3634, '弃明投暗'],
		[3638, '行尸走肉'],
		[16471, '暗黑布道'],
		[36927, '暗影卫'],
	])

	assert.equal(blackestNight.name, '至黑之夜')
	assert.match(blackestNight.timelineLabel, /高优/)
	assert.equal(reprisal.name, '雪仇')
	assert.match(reprisal.timelineLabel, /高优/)
	for (const [actionId, name] of expectedNames) {
		assert.equal(events.find(event => event.kind === 'player-action' && Number(event.actionId) === actionId)?.name, name)
	}
})

test('estimates phase and total damage with adjustable luck profile', async () => {
	const events = [
		{phase: 'P1', potency: 600, count: 2},
		{phase: 'P2', potency: 460, count: 1},
	]

	const average = estimateDamage(events, {attackPower: 120, critRate: 0.18, directRate: 0.28, luck: 'average'})
	const lucky = estimateDamage(events, {attackPower: 120, critRate: 0.18, directRate: 0.28, luck: 'lucky'})

	assert.equal(average.phases.P1.events, 2)
	assert.ok(average.total > 0)
	assert.ok(lucky.total > average.total)
})

test('marks unavailable jobs and ACRs as disabled while keeping known packages selectable', () => {
	const db = buildAcrDatabase(['KANO', 'MilkVio', 'Nag0mi'])

	const darkKnight = db.jobs.find(job => job.id === 'DRK')
	const blueMage = db.jobs.find(job => job.id === 'BLU')

	assert.equal(darkKnight.enabled, true)
	assert.ok(darkKnight.acrs.some(acr => acr.name === 'KANO' && acr.enabled))
	assert.equal(blueMage.enabled, false)
	assert.ok(db.packages.includes('MilkVio'))
})

test('builds complete combat job ACR data from discovered ACR support', () => {
	const db = buildAcrDatabase(['KANO', 'MilkVio', 'Nero'], [
		{package: 'KANO', jobs: ['DRK'], source: '反编译 ACR'},
		{package: 'MilkVio', jobs: ['PLD', 'WAR', 'WHM', 'PCT'], source: '反编译 ACR'},
		{package: 'Nero', jobs: ['VPR'], source: '反编译 ACR'},
	])

	assert.deepEqual(db.jobs.map(job => job.id), COMBAT_JOBS.map(job => job.id))
	assert.equal(db.jobs.find(job => job.id === 'WHM').enabled, true)
	assert.ok(db.jobs.find(job => job.id === 'VPR').acrs.some(acr => acr.name === 'Nero' && acr.enabled))
	assert.equal(db.jobs.find(job => job.id === 'BLU').enabled, false)
})

test('discovers job support from decompiled ACR folders', async () => {
	const sources = await discoverAcrSources('../资源/data/decompiled')
	const byPackage = new Map(sources.map(source => [source.package, source.jobs]))

	assert.deepEqual(byPackage.get('Ahxq').sort(), ['DNC', 'MCH', 'VPR'])
	assert.ok(byPackage.get('MilkVio').includes('WHM'))
	assert.ok(byPackage.get('MilkVio').includes('PCT'))
	assert.ok(byPackage.get('XSZYYS').includes('PLD'))
	assert.ok(byPackage.get('Wotou').includes('BRD'))
})

test('discovers KANO DRK support from the source ACR project', async () => {
	const source = await discoverSourceAcr('F:/acr开发/KanoACR/Kano')

	assert.equal(source.package, 'KANO')
	assert.deepEqual(source.jobs, ['DRK'])
	assert.equal(source.source, '源码 ACR')
	assert.match(source.path, /KanoACR[\\/]Kano/)
})

test('classifies Garland-backed skills so mitigation and invuln actions are not output', () => {
	const skillDatabase = buildSkillDatabase({
		browse: [
			{i: 7393, n: '至黑之夜', c: 3081, j: 32, t: 4, l: 70},
			{i: 16467, n: '暗黑锋', c: 3083, j: 32, t: 4, l: 40},
			{i: 3638, n: '行尸走肉', c: 3077, j: 32, t: 4, l: 50},
			{i: 7531, n: '铁壁', c: 801, j: 1, t: 4, l: 8},
		],
		details: {
			7393: {description: '为自身或一名队员附加能够抵御一定伤害的防护罩'},
			16467: {description: '对目标发动无属性魔法攻击 威力：300'},
			3638: {description: '效果中受到致命伤也不会陷入无法战斗状态'},
			7531: {description: '一定时间内，将自身所受的伤害减轻20%'},
		},
	})

	assert.equal(classifyAction(7393, '高优 黑盾 一仇', skillDatabase).output, false)
	assert.equal(classifyAction(3638, '强制 无敌', skillDatabase).output, false)
	assert.equal(classifyAction(7531, '高优 铁壁', skillDatabase).type, 'mitigation')
	assert.equal(classifyAction(16467, '暗黑锋', skillDatabase).potency, 300)
	assert.equal(classifyAction(16467, '暗黑锋', skillDatabase).output, true)
})

test('extracts coverage durations for mitigation and healer-over-time actions', () => {
	const skillDatabase = buildSkillDatabase({
		browse: [
			{i: 7531, n: '铁壁', c: 801, j: 1, t: 4, l: 8},
			{i: 7533, n: '挑衅', c: 803, j: 1, t: 4, l: 15},
			{i: 7537, n: '退避', c: 810, j: 1, t: 4, l: 48},
			{i: 40001, n: '示例持续治疗', c: 4050, j: 24, t: 4, l: 90},
			{i: 40002, n: '示例DoT', c: 4051, j: 24, t: 3, l: 90},
			{i: 40003, n: '示例治疗区域', c: 4052, j: 24, t: 4, l: 90},
		],
		details: {
			7531: {description: '一定时间内，将自身所受的伤害减轻20% 持续时间：20秒'},
			7533: {description: '向目标进行挑衅，令目标对自身的仇恨变为最高后，继续提高自身仇恨'},
			7537: {description: '将自身仇恨的25%转移给目标队员'},
			40001: {description: '恢复目标体力 追加效果：持续恢复 持续时间：15秒'},
			40002: {description: '目标受到无属性持续伤害 威力：75 持续时间：30秒'},
			40003: {description: '持续恢复进入该区域的自身及队员的体力 恢复力：100 持续时间：24秒 追加效果：区域内的自身和队员所受的体力恢复效果提高10%'},
		},
	})

	assert.equal(skillDatabase.actionsById[7531].effectDurationMs, 20000)
	assert.equal(skillDatabase.actionsById[7533].type, 'utility')
	assert.equal(skillDatabase.actionsById[7533].effectDurationMs, 0)
	assert.equal(skillDatabase.actionsById[7537].type, 'utility')
	assert.equal(skillDatabase.actionsById[40001].type, 'healing')
	assert.equal(skillDatabase.actionsById[40001].effectDurationMs, 15000)
	assert.equal(classifyAction(40001, '', skillDatabase).effectDurationMs, 15000)
	assert.equal(skillDatabase.actionsById[40002].type, 'dot')
	assert.equal(skillDatabase.actionsById[40002].output, true)
	assert.equal(skillDatabase.actionsById[40002].potency, 75)
	assert.equal(skillDatabase.actionsById[40002].effectDurationMs, 30000)
	assert.equal(classifyAction(40002, '', skillDatabase).type, 'dot')
	assert.equal(classifyAction(40002, '', skillDatabase).effectDurationMs, 30000)
	assert.equal(skillDatabase.actionsById[40003].type, 'healing')
	assert.equal(skillDatabase.actionsById[40003].effectDurationMs, 24000)
})

test('bundled skill fallback keeps WHM coverage and DoT durations', () => {
	const skillDatabase = buildSkillDatabase()
	const expectations = new Map([
		[7432, {type: 'mitigation', durationMs: 15000}],
		[25861, {type: 'mitigation', durationMs: 8000}],
		[16536, {type: 'mitigation', durationMs: 20000}],
		[37011, {type: 'mitigation', durationMs: 10000}],
		[3569, {type: 'healing', durationMs: 24000}],
		[25862, {type: 'healing', durationMs: 20000}],
		[7433, {type: 'mitigation', durationMs: 10000}],
		[16532, {type: 'dot', durationMs: 30000}],
	])

	for (const [actionId, expected] of expectations) {
		const action = skillDatabase.actionsById[actionId]
		const classification = classifyAction(actionId, '', skillDatabase)
		assert.equal(action.type, expected.type)
		assert.equal(action.effectDurationMs, expected.durationMs)
		assert.equal(classification.type, expected.type)
		assert.equal(classification.effectDurationMs, expected.durationMs)
	}
})

test('uses Garland public icon file URLs for skill icons', () => {
	const skillDatabase = buildSkillDatabase({
		browse: [
			{i: 3617, n: '重斩', c: 3051, j: 32, t: 3, l: 1},
		],
	})
	const hardSlash = skillDatabase.actionsById[3617].iconUrl

	assert.equal(hardSlash, 'https://garlandtools.cn/files/icons/action/3051.png')
})

test('simulates the KANO DRK opener and recurring ACR output loop', () => {
	const skillDatabase = buildSkillDatabase()
	const simulation = buildKanoDrkSimulation(skillDatabase, {durationMs: 130000})

	assert.equal(simulation.source.acr, 'KANO')
	assert.equal(simulation.source.job, 'DRK')
	assert.ok(simulation.events.length > 40)
	assert.deepEqual(simulation.events.slice(0, 5).map(event => event.actionId), [3617, 16470, 3623, 16472, 7531])
	assert.ok(simulation.events.some(event => event.actionId === 16472 && event.timeMs >= 119000))
	assert.ok(simulation.events.some(event => event.actionId === 16470 && event.output && event.iconUrl))
	assert.ok(simulation.events.some(event => event.actionId === 7531 && !event.output))
})

test('reads the KANO DRK opener directly from the ACR source file', async () => {
	const opener = await loadKanoDrkSourceOpener(buildSkillDatabase(), {
		sourcePath: 'F:/acr开发/KanoACR/Kano/Opener/MtFruLevel100Opener.cs',
	})

	assert.equal(opener.source.name, 'MT妖星乱舞100级起手')
	assert.equal(opener.source.source, 'ACR 源码')
	assert.deepEqual(opener.events.slice(0, 6).map(event => event.actionId), [3617, 44162, 16470, 3623, 16472, 7531])
	assert.deepEqual(opener.events.slice(0, 6).map(event => event.timeMs), [0, 700, 1400, 2500, 3200, 3900])
	assert.equal(opener.events.find(event => event.actionId === 44162).skillType, 'Item')
	assert.ok(opener.events.some(event => event.actionId === 36927 && event.name === '暗影卫'))
	assert.equal(opener.events.some(event => event.actionId === 3636), false)
	assert.ok(opener.events.some(event => event.actionId === 7537 && event.target === 'party2'))
	assert.ok(opener.events.slice(-3).every(event => event.actionId === 16470 || event.actionId === 3623 || event.actionId === 25755))
})

test('keeps mitigation, invuln and utility actions out of the output axis', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const model = createPrototypeModel(fixture, ['KANO', 'MilkVio', 'Nag0mi'])
	const damagePanel = model.detailPanels.find(panel => panel.id === 'damage')
	const forbidden = /无敌|黑盾|铁壁|献奉|暗黑布道|暗影卫|弃明投暗|挑衅|退避|雪仇/

	assert.deepEqual(damagePanel.events.filter(event => forbidden.test(event.name)).map(event => event.name), [])
	assert.deepEqual(model.damage.events.filter(event => forbidden.test(event.name)).map(event => event.name), [])
})

test('uses simulated ACR output for the damage panel without counting simulated mitigations', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const model = createPrototypeModel(fixture, ['KANO', 'MilkVio', 'Nag0mi'])
	const damagePanel = model.detailPanels.find(panel => panel.id === 'damage')

	assert.ok(model.acrSimulation.events.some(event => event.source === 'KANO ACR' && event.simulated))
	assert.ok(damagePanel.events.some(event => event.source === 'KANO ACR' && event.output))
	assert.equal(damagePanel.events.some(event => /铁壁|暗影墙|献奉|黑盾/.test(event.name)), false)
	assert.ok(model.damage.average.total > 0)
})

test('adds the timeline opener as a detail panel beside mitigation, damage and potion', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const sourceOpener = await loadKanoDrkSourceOpener(buildSkillDatabase())
	const model = createPrototypeModel(fixture, ['KANO', 'MilkVio', 'Nag0mi'], null, {sourceOpener})
	const openerPanel = model.detailPanels.find(panel => panel.id === 'opener')

	assert.equal(openerPanel.label, '起手')
	assert.equal(openerPanel.title, 'MT妖星乱舞100级起手')
	assert.equal(openerPanel.source, 'ACR 源码')
	assert.deepEqual(openerPanel.events.slice(0, 6).map(event => event.actionId), [3617, 44162, 16470, 3623, 16472, 7531])
	assert.ok(openerPanel.events.some(event => event.iconUrl))
})

test('creates a front-end model for the first WebTimeline prototype', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const model = createPrototypeModel(fixture, ['KANO', 'MilkVio', 'Nag0mi'])

	assert.equal(model.encounter.territoryId, 1363)
	assert.deepEqual(model.editorModes.map(mode => mode.id), ['unified'])
	assert.deepEqual(model.detailPanels.map(panel => panel.id), ['mitigation', 'damage', 'potion', 'opener'])
	assert.equal(model.onboarding.length, 4)
	assert.equal(model.shareCard.timelineName, model.encounter.name)
	assert.equal(model.shareCard.title, '分享预览')
})

test('onboarding explains the unified editor flow without stale mode names', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const model = createPrototypeModel(fixture, ['KANO', 'MilkVio', 'Nag0mi'])
	const onboardingText = model.onboarding.map(step => `${step.title} ${step.body}`).join('\n')

	assert.match(onboardingText, /ACR 作者/)
	assert.match(onboardingText, /代码编辑/)
	assert.match(onboardingText, /耗时/)
	assert.match(onboardingText, /门槛高/)
	assert.match(onboardingText, /选职业/)
	assert.match(onboardingText, /选 ACR/)
	assert.match(onboardingText, /看白轴/)
	assert.match(onboardingText, /调爆发/)
	assert.match(onboardingText, /调减伤/)
	assert.match(onboardingText, /导出分享/)
	assert.match(onboardingText, /时间轴工作台/)
	assert.equal(onboardingText.includes('统一编辑器'), false)
	assert.equal(onboardingText.includes('新手模式'), false)
	assert.equal(onboardingText.includes('高手模式'), false)
})

test('builds xivanalysis-style rows and positioned items for the main timeline panel', async () => {
	const fixture = await loadFixture('../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json')
	const rows = buildTimelineRows(flattenTimeline(fixture), [{name: '手动黑盾', timeMs: 90000, potency: 0}], [{name: '暗影锋', timeMs: 1200, potency: 420, output: true}])

	assert.deepEqual(rows.map(row => row.id), ['boss-casts', 'boss-damage', 'player-actions', 'mitigation-actions', 'acr-simulated', 'qt-potion', 'manual-insert'])
	assert.ok(rows.every(row => row.items.every(item => typeof item.startMs === 'number' && typeof item.endMs === 'number')))
	assert.ok(rows.find(row => row.id === 'boss-casts').items.some(item => item.type === 'cast'))
	assert.equal(rows.find(row => row.id === 'player-actions').items.some(item => item.type === 'mitigation' || item.type === 'healing'), false)
	assert.ok(rows.find(row => row.id === 'mitigation-actions').items.some(item => item.type === 'mitigation'))
	assert.ok(rows.find(row => row.id === 'acr-simulated').items.some(item => item.type === 'simulated-gcd'))
	assert.ok(rows.find(row => row.id === 'manual-insert').items.some(item => item.label === '手动黑盾'))
	assert.ok(rows.find(row => row.id === 'qt-potion').items.some(item => item.type === 'qt' || item.type === 'potion'))
})

test('separates mitigation and healer coverage from GCD actions while keeping DoT as output duration bars', () => {
	const events = [
		{id: 'mit-1', kind: 'player-action', name: '铁壁', timelineLabel: '高优 铁壁', timeMs: 10000, actionId: 7531, classification: 'mitigation', durationMs: 20000, potency: 0},
		{id: 'heal-1', kind: 'player-action', name: '示例持续治疗', timeMs: 16000, actionId: 40001, classification: 'healing', durationMs: 15000, potency: 0},
		{id: 'dot-1', kind: 'player-action', name: '示例DoT', timeMs: 17000, actionId: 40002, classification: 'dot', durationMs: 30000, potency: 75, output: true},
		{id: 'util-1', kind: 'player-action', name: '挑衅', timelineLabel: '强制 挑衅', timeMs: 18000, actionId: 7533, classification: 'utility', durationMs: 0, potency: 0},
	]
	const tracks = buildModeTracks(events)
	const rows = buildTimelineRows(events)
	const playerRow = rows.find(item => item.id === 'player-actions')
	const mitigationRow = rows.find(item => item.id === 'mitigation-actions')
	const mitigation = mitigationRow.items.find(item => item.id === 'mit-1')
	const healing = mitigationRow.items.find(item => item.id === 'heal-1')
	const dot = playerRow.items.find(item => item.id === 'dot-1')
	const utility = playerRow.items.find(item => item.id === 'util-1')

	assert.equal(playerRow.items.some(item => item.id === 'mit-1' || item.id === 'heal-1'), false)
	assert.ok(tracks.expert.mitigation.some(event => event.id === 'heal-1'))
	assert.equal(tracks.expert.mitigation.some(event => event.id === 'dot-1'), false)
	assert.equal(mitigation.type, 'mitigation')
	assert.equal(mitigation.label, '铁壁')
	assert.equal(mitigation.timelineLabel, '高优 铁壁')
	assert.equal(mitigation.endMs - mitigation.startMs, 20000)
	assert.equal(healing.type, 'healing')
	assert.equal(healing.endMs - healing.startMs, 15000)
	assert.equal(dot.type, 'dot')
	assert.equal(dot.potency, 75)
	assert.equal(dot.endMs - dot.startMs, 30000)
	assert.equal(utility.type, 'action')
	assert.equal(utility.label, '挑衅')
	assert.equal(utility.timelineLabel, '强制 挑衅')
	assert.equal(utility.endMs - utility.startMs, 1600)
})
