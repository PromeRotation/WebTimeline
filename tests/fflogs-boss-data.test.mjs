import test from 'node:test'
import assert from 'node:assert/strict'
import {buildBossTimelineFromFflogs, buildBossTimelineFromFflogsV1} from '../src/fflogs-boss-data.mjs'

test('builds a standard boss timeline from FFLogs fight events', async () => {
	const timeline = await buildBossTimelineFromFflogs('data/fflogs-standard/VZRFDK4gcGaHWYXJ-fight-11.json')

	assert.equal(timeline.source.sourceType, 'fflogs')
	assert.equal(timeline.source.reportCode, 'VZRFDK4gcGaHWYXJ')
	assert.equal(timeline.source.fightId, 11)
	assert.ok(timeline.source.lastSecond > 1100 && timeline.source.lastSecond < 1120)
	assert.ok(timeline.rows[0].items.length > 150)
	assert.ok(timeline.rows[1].items.length > 500)
	assert.ok(timeline.rows[0].items.every(item => item.startMs >= 0 && item.endMs <= timeline.source.lastSecond * 1000 + 1000))
	assert.ok(timeline.rows[1].items.every(item => item.startMs >= 0 && item.startMs <= timeline.source.lastSecond * 1000 + 1000))
	assert.ok(timeline.splitRows.some(row => row.label === '凯夫卡 读条'))
	assert.ok(timeline.splitRows.some(row => row.label === '卡奥斯 伤害'))
	assert.ok(timeline.rows[0].items.some(item => item.label === '恶狠狠毁荡'))
	assert.ok(timeline.rows[1].items.some(item => item.label.includes('制裁之光')))
	assert.ok(timeline.rows[0].items.some(item => item.actionId === 47936 && item.label === '连续究极'))
	assert.ok(timeline.rows[0].items.some(item => item.actionId === 49743 && item.label === '二选一的灾祟'))
	assert.ok(timeline.rows[0].items.every(item => !String(item.label).includes('未知技能')))
	assert.ok(timeline.rows[0].items.every(item => ![49539, 50516, 50517].includes(Number(item.actionId))))
	assert.ok(timeline.rows[1].items.some(item => item.actionId === 47951 && item.label.includes('混沌洪水')))
})

test('coalesces FFLogs damage packets by packet id', async () => {
	const timeline = await buildBossTimelineFromFflogs('data/fflogs-standard/VZRFDK4gcGaHWYXJ-fight-11.json')
	const damageRows = timeline.splitRows.filter(row => row.groupId === 'boss-damage')
	const multiTargetItems = damageRows.flatMap(row => row.items).filter(item => item.eventCount > 1)

	assert.ok(multiTargetItems.length > 0)
	assert.ok(multiTargetItems.some(item => item.packetId && item.targetCount > 1))
	assert.ok(multiTargetItems.every(item => !String(item.label).match(/\sx1$/)))
})

test('builds a compact boss timeline from FFLogs V1 kill events', async () => {
	const timeline = await buildBossTimelineFromFflogsV1({
		fightsPath: 'data/fflogs-v1/VZRFDK4gcGaHWYXJ-fights.json',
		castsPath: 'data/fflogs-v1/VZRFDK4gcGaHWYXJ-fight-11-casts-hostile.json',
		damagePath: 'data/fflogs-v1/VZRFDK4gcGaHWYXJ-fight-11-damage-done-hostile.json',
		reportCode: 'VZRFDK4gcGaHWYXJ',
		fightId: 11,
	})
	const castItems = timeline.rows.find(row => row.id === 'boss-casts').items
	const releaseItems = timeline.rows.find(row => row.id === 'boss-damage').items

	assert.equal(timeline.source.sourceType, 'fflogs-v1')
	assert.equal(timeline.source.fightId, 11)
	assert.ok(timeline.source.lastSecond > 1110 && timeline.source.lastSecond < 1113)
	assert.ok(castItems.length < 180)
	assert.ok(releaseItems.length < 260)
	assert.ok(castItems.some(item => item.label === '恶狠狠毁荡'))
	assert.ok(releaseItems.some(item => item.label.includes('恶狠狠毁荡')))
	assert.ok(releaseItems.some(item => item.actionId === 47778 && item.eventCount === 8))
	assert.ok(releaseItems.every(item => item.actionId !== 49746 && item.actionId !== 49744))
	assert.ok(releaseItems.every(item => item.sourceEventType === 'cast-release'))
	assert.ok(releaseItems.every(item => !String(item.label).match(/\sx1$/)))
	assert.ok([...castItems, ...releaseItems].every(item => !String(item.actionName).startsWith('unknown_')))
	assert.ok(castItems.every(item => !String(item.label).includes('未知技能')))
	assert.ok(castItems.every(item => ![49539, 50516, 50517].includes(Number(item.actionId))))
})
