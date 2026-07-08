import test from 'node:test'
import assert from 'node:assert/strict'
import {buildKanoDrkSimulation} from '../src/acr-simulation.mjs'
import {buildSkillDatabase, fetchGarlandSkillSource} from '../src/skill-database.mjs'
import {
	collectPrototypeActionIds,
	loadPrototypeInputs,
} from '../src/prototype-generation.mjs'

test('prototype generation merges decompiled ACRs with source ACRs and PR runtime source', async () => {
	const inputs = await loadPrototypeInputs({
		timelinePath: '../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json',
		acrPackageRoot: '../资源/acr-packages/现在所有acr数据/ACR',
		decompiledRoot: '../资源/data/decompiled',
		sourceAcrPaths: ['F:/acr开发/KanoACR/Kano'],
		promeRotationSourcePath: '../资源/source/PromeRotation-1.0',
		loadBossTimeline: false,
	})
	const darkKnight = inputs.acrSources.find(source => source.package === 'KANO')
	const xszyys = inputs.acrSources.find(source => source.package === 'XSZYYS')
	const promeRotation = inputs.runtimeSources.find(source => source.package === 'PromeRotation')

	assert.ok(inputs.packages.includes('KANO'))
	assert.ok(inputs.packages.includes('XSZYYS'))
	assert.equal(darkKnight.source, '源码 ACR')
	assert.deepEqual(darkKnight.jobs, ['DRK'])
	assert.deepEqual(xszyys.jobs, ['PLD', 'WAR', 'DRK'])
	assert.equal(xszyys.source, '反编译 ACR')
	assert.equal(promeRotation.source, 'PR 本体源码')
	assert.ok(promeRotation.jobs.includes('WHM'))
})

test('prototype generation includes simulated ACR action IDs in Garland detail fetch set', async () => {
	const inputs = await loadPrototypeInputs({
		timelinePath: '../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json',
		acrPackageRoot: '../资源/acr-packages/现在所有acr数据/ACR',
		decompiledRoot: '../资源/data/decompiled',
		sourceAcrPaths: ['F:/acr开发/KanoACR/Kano'],
		loadBossTimeline: false,
	})
	const simulation = buildKanoDrkSimulation(buildSkillDatabase(), {durationMs: 130000})
	const ids = collectPrototypeActionIds(inputs.timeline, simulation.events)

	assert.ok(ids.includes(3617))
	assert.ok(ids.includes(16470))
	assert.ok(ids.includes(36932))
})

test('Garland skill source fetches details for every combat job action', async () => {
	const requested = []
	const browse = [
		{i: 90001, n: '贤者持续减伤', c: 1, j: 40, t: 4, l: 80},
		{i: 90002, n: '忍者DoT', c: 2, j: 30, t: 3, l: 70},
		{i: 90003, n: '非战斗技能', c: 3, j: 99, t: 4, l: 1},
	]
	const fetchImpl = async url => {
		if (url.includes('/browse/')) {
			return {ok: true, json: async () => ({browse})}
		}
		const id = Number(url.match(/\/(\d+)\.json$/)?.[1])
		requested.push(id)
		return {ok: true, json: async () => ({action: {description: `Action ${id} 持续时间：10秒`}})}
	}

	const source = await fetchGarlandSkillSource([90001], fetchImpl)

	assert.ok(requested.includes(90001))
	assert.ok(requested.includes(90002))
	assert.equal(requested.includes(90003), false)
	assert.equal(source.details[90002].description, 'Action 90002 持续时间：10秒')
})

test('KANO DRK simulation models blood delirium combo windows instead of plain bloodspillers', () => {
	const simulation = buildKanoDrkSimulation(buildSkillDatabase(), {durationMs: 600000})
	const count = actionId => simulation.events.filter(event => Number(event.actionId) === actionId).length

	assert.ok(count(36928) >= 9)
	assert.ok(count(36929) >= 9)
	assert.ok(count(36930) >= 9)
	assert.ok(count(36932) <= 7)
	assert.ok(count(16470) >= 30)
})
