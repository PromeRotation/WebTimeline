import test from 'node:test'
import assert from 'node:assert/strict'
import {aggregateBossTimelineItems, loadDefaultBossTimelineData, mergeBossRows, splitBossRowsBySourceName} from '../src/boss-data.mjs'

test('loads parsed boss timeline data for the encounter', async () => {
	const bossTimeline = await loadDefaultBossTimelineData()

	assert.ok(bossTimeline)
	assert.equal(bossTimeline.source.territoryId, 1363)
	assert.ok(bossTimeline.source.castCount > 600)
	assert.ok(bossTimeline.source.abilityCount > 4000)
	assert.ok(bossTimeline.source.damageAbilityCount > 0)
	assert.ok(bossTimeline.source.lastSecond > bossTimeline.source.firstSecond)
	assert.equal(bossTimeline.rows.map(row => row.id).join(','), 'boss-casts,boss-damage')
	assert.ok(bossTimeline.rows[0].items.every(item => item.type === 'cast'))
	assert.ok(bossTimeline.rows[1].items.some(item => item.damage > 0))
})

test('merges parsed boss rows into existing timeline rows', async () => {
	const bossTimeline = await loadDefaultBossTimelineData()
	const merged = mergeBossRows([
		{id: 'boss-casts', items: [{id: 'old'}]},
		{id: 'player-actions', items: [{id: 'player'}]},
		{id: 'boss-damage', items: [{id: 'old-damage'}]},
	], bossTimeline)
	const castRows = merged.filter(row => row.groupId === 'boss-casts')
	const damageRows = merged.filter(row => row.groupId === 'boss-damage')

	assert.equal(castRows.reduce((sum, row) => sum + row.items.length, 0), bossTimeline.rows[0].items.length)
	assert.equal(damageRows.reduce((sum, row) => sum + row.items.length, 0), bossTimeline.rows[1].items.length)
	assert.ok(merged.some(row => row.id === 'player-actions' && row.items[0].id === 'player'))
})

test('splits parsed boss rows by boss source name for the left labels', async () => {
	const bossTimeline = await loadDefaultBossTimelineData()
	const splitRows = splitBossRowsBySourceName(bossTimeline.rows)
	const labels = splitRows.map(row => row.label)

	assert.ok(splitRows.length > bossTimeline.rows.length)
	assert.ok(labels.includes('凯夫卡 读条'))
	assert.ok(labels.includes('艾克斯迪司 读条'))
	assert.ok(labels.includes('卡奥斯 读条'))
	assert.ok(labels.includes('凯夫卡 伤害'))
	assert.ok(labels.includes('众神之像 伤害'))
	assert.ok(splitRows.every(row => row.items.every(item => item.sourceName)))
})

test('coalesces repeated boss effects into one visual timeline item', () => {
	const items = [
		{id: 'hit-1', type: 'damage', label: '100 死亡波涛', startMs: 120000, endMs: 121000, timeLabel: '2:00', sourceName: '新生艾克斯迪司', sourceId: '40000001', actionId: 47900, actionName: '死亡波涛', targetName: 'A', targetId: '1001', damage: 100},
		{id: 'hit-2', type: 'damage', label: '200 死亡波涛', startMs: 120000, endMs: 121000, timeLabel: '2:00', sourceName: '新生艾克斯迪司', sourceId: '40000002', actionId: 47900, actionName: '死亡波涛', targetName: 'B', targetId: '1002', damage: 200},
		{id: 'hit-3', type: 'damage', label: '300 其他技能', startMs: 120000, endMs: 121000, timeLabel: '2:00', sourceName: '新生艾克斯迪司', sourceId: '40000002', actionId: 47901, actionName: '其他技能', targetName: 'B', targetId: '1002', damage: 300},
	]

	const aggregated = aggregateBossTimelineItems(items)

	assert.equal(aggregated.length, 2)
	assert.equal(aggregated[0].damage, 300)
	assert.equal(aggregated[0].eventCount, 2)
	assert.equal(aggregated[0].sourceCount, 2)
	assert.equal(aggregated[0].targetCount, 2)
	assert.equal(aggregated[0].label, '300 死亡波涛 x2')
	assert.equal(aggregated[1].label, '300 其他技能')
})
