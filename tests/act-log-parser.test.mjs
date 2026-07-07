import test from 'node:test'
import assert from 'node:assert/strict'
import {
	decodeLittleEndianHex,
	parseAbilityLine,
	parseCastLine,
	parseLogLine,
} from '../src/act-log-parser.mjs'

test('parses ACT cast start lines with seconds and actor ids', () => {
	const line = '20|2026-06-30T01:33:16.1500000+08:00|40008364|凯夫卡|C403|恶狠狠毁荡|10091DD8|绫濑桃桃|4.700|100.02|99.87|0.00|3.12|755fb2a4f530bd02'
	const event = parseCastLine(parseLogLine(line))

	assert.equal(event.type, 'cast')
	assert.equal(event.sourceId, '40008364')
	assert.equal(event.sourceName, '凯夫卡')
	assert.equal(event.actionIdHex, 'C403')
	assert.equal(event.actionId, 50179)
	assert.equal(event.actionName, '恶狠狠毁荡')
	assert.equal(event.castDurationSeconds, 4.7)
	assert.equal(event.targetName, '绫濑桃桃')
})

test('parses ACT ability lines and decodes little-endian effect values', () => {
	const line = '21|2026-06-30T01:33:07.5500000+08:00|10075C70|小闪蝶|4061|必杀剑·闪影|40008364|凯夫卡|714003|734C4001|0|0|0|0|0|0|0|0|0|0|0|0|0|0|55994944|56331828|10000|10000|||100.02|92.02|0.00|0.02|226588|226588|10000|10000|||103.04|100.25|-0.02|-2.02|0000373B|0|1|00||01|4061|4061|0.600|0CCF|10484f87cd54b707'
	const event = parseAbilityLine(parseLogLine(line))

	assert.equal(decodeLittleEndianHex('734C4001'), 20991091)
	assert.equal(event.type, 'ability')
	assert.equal(event.actionId, 16481)
	assert.equal(event.effects[0].rawValue, '734C4001')
	assert.equal(event.effects[0].decodedValue, 20991091)
	assert.equal(event.effects[0].damageCandidate, 19571)
	assert.equal(event.targetCurrentHp, 55994944)
	assert.equal(event.targetMaxHp, 56331828)
})
