import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {
	buildFflogsComparisonFromEvents,
	parseFflogsReportUrl,
} from '../src/fflogs-comparison.mjs'
import {estimateDamage} from '../src/simulation.mjs'

const standardPayload = JSON.parse(await readFile(new URL('../data/fflogs-standard/VZRFDK4gcGaHWYXJ-fight-11.json', import.meta.url), 'utf8'))

test('parses FFLogs report links for local import', () => {
	const parsed = parseFflogsReportUrl('https://www.fflogs.com/reports/VHqxznv6bFcMPpLm?fight=10&type=damage-done')

	assert.deepEqual(parsed, {
		reportCode: 'VHqxznv6bFcMPpLm',
		fightId: 10,
		type: 'damage-done',
	})
})

test('builds a player comparison and auto-selects the current job', () => {
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 300, count: 1, output: true, weave: 'gcd', skillType: 'GCD', phase: 'P1'},
		{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 480, count: 1, output: true, weave: 'gcd', skillType: 'GCD', phase: 'P1'},
		{timeMs: 3200, actionId: 16472, name: 'Edge of Shadow', potency: 460, count: 1, output: true, weave: 'ogcd', skillType: 'oGCD', phase: 'P1'},
		{timeMs: 5000, actionId: 3632, name: 'Souleater', potency: 580, count: 1, output: true, weave: 'gcd', skillType: 'GCD', phase: 'P1'},
	]
	const expectedDamage = estimateDamage(simulatedEvents, {
		attackPower: 120,
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
	})

	const comparison = buildFflogsComparisonFromEvents(standardPayload, simulatedEvents, {
		currentJob: 'DRK',
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: false,
		calibrateSimulatedDamageToLog: false,
	})

	assert.equal(comparison.source.reportCode, 'VZRFDK4gcGaHWYXJ')
	assert.equal(comparison.source.fightId, 11)
	assert.equal(comparison.selectedActor.job, 'DRK')
	assert.equal(comparison.selectedActor.id, 632)
	assert.ok(comparison.actors.some(actor => actor.job === 'PLD'))
	const mirroredAutoDamage = standardPayload.events
		.filter(event => event.type === 'damage' && Number(event.sourceID) === Number(comparison.selectedActor.id) && [1, 7].includes(Number(event.ability?.guid ?? 0)))
		.reduce((total, event) => total + Number(event.amount ?? 0) + Number(event.overkill ?? 0), 0)
	assert.equal(comparison.simulated.damage.total, expectedDamage.total + mirroredAutoDamage)
	assert.ok(comparison.log.damage.total > 24000000)
	assert.ok(comparison.log.damage.phases.P1.damage > 0)
	assert.ok(comparison.log.skillCounts.total > 200)
	assert.ok(comparison.log.skillCounts.gcd > 100)
	assert.ok(comparison.log.gcdUtilization.percent > 80)
	assert.ok(comparison.log.healing.total > 0)
	assert.ok(comparison.deltas.damage.total !== 0)
	assert.ok(comparison.skillRows.some(row => row.actionId === 16472 || row.logCount > 0))
})

test('counts FFLogs skill usage from casts without damage or heal tick duplicates', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 31000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: '重斩', type: 128}},
			{timestamp: 1100, fight: 10, type: 'damage', packetID: 1, sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: '重斩', type: 128}, amount: 1000},
			{timestamp: 1100, fight: 10, type: 'calculateddamage', packetID: 1, sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: '重斩', type: 128}, amount: 1000},
			{timestamp: 1600, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 16470, name: '暗影锋', type: 32}},
			{timestamp: 1700, fight: 10, type: 'damage', packetID: 2, sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 16470, name: '暗影锋', type: 32}, amount: 500},
			{timestamp: 3000, fight: 10, type: 'heal', sourceID: 1, sourceIsFriendly: true, targetID: 1, ability: {guid: 1302, name: '生命再生', type: 8}, amount: 300, tick: true},
		],
	}

	const comparison = buildFflogsComparisonFromEvents(payload, [], {
		currentJob: 'DRK',
		actorId: 1,
	})

	assert.equal(comparison.selectedActor.damage, 1500)
	assert.equal(comparison.log.damage.total, 1500)
	assert.equal(comparison.log.healing.total, 300)
	assert.equal(comparison.log.skillCounts.total, 2)
	assert.equal(comparison.log.skillCounts.gcd, 1)
	assert.equal(comparison.log.skillCounts.ogcd, 1)
	assert.equal(comparison.log.skillCounts.byAction.find(row => row.actionId === 3617)?.total, 1)
	assert.equal(comparison.log.skillCounts.byAction.find(row => row.actionId === 16470)?.total, 1)
	assert.equal(comparison.log.skillCounts.byAction.some(row => row.actionId === 1302), false)
	assert.equal(comparison.skillRows.some(row => row.actionId === 1302), false)
})

test('rebuckets simulated damage into FFLogs fight phases by event time', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {
			id: 10,
			name: 'Synthetic',
			start_time: 1000,
			end_time: 16000,
			phases: [
				{id: 1, startTime: 1000},
				{id: 2, startTime: 6000},
				{id: 3, startTime: 11000},
			],
		},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: '重斩', type: 128}},
			{timestamp: 1200, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: '重斩', type: 128}, amount: 100},
		],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: '重斩', potency: 100, output: true, weave: 'gcd', phase: 'ACR'},
		{timeMs: 5000, actionId: 3623, name: '吸收斩', potency: 200, output: true, weave: 'gcd', phase: 'ACR'},
		{timeMs: 10000, actionId: 3632, name: '噬魂斩', potency: 300, output: true, weave: 'gcd', phase: 'ACR'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: false,
	})

	assert.deepEqual(Object.keys(comparison.simulated.damage.phases), ['P1', 'P2', 'P3'])
	assert.equal(comparison.simulated.damage.phases.P1.damage, 12000)
	assert.equal(comparison.simulated.damage.phases.P2.damage, 24000)
	assert.equal(comparison.simulated.damage.phases.P3.damage, 36000)
	assert.equal(comparison.simulated.damage.total, 72000)
	assert.equal(comparison.simulated.damage.phases.ACR, undefined)
	assert.equal(comparison.simulated.events[0].phase, 'P1')
	assert.equal(comparison.simulated.events[1].phase, 'P2')
	assert.equal(comparison.simulated.events[2].phase, 'P3')
})

test('adds equal auto attack counts to simulated and log comparison totals', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 21000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		friendlyPets: [
			{name: '英雄的掠影', id: 2, type: 'Pet', petOwner: 1, fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: '重斩', type: 128}},
			{timestamp: 1100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: '重斩', type: 128}, amount: 1000},
			{timestamp: 2100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 7, name: '攻击', type: 1}, amount: 100},
			{timestamp: 3100, fight: 10, type: 'damage', sourceID: 2, sourceIsFriendly: true, targetID: 99, ability: {guid: 25881, name: '暗影使者', type: 32}, amount: 500},
		],
	}

	const comparison = buildFflogsComparisonFromEvents(payload, [], {
		currentJob: 'DRK',
		actorId: 1,
	})

	assert.equal(comparison.selectedActor.damage, 1600)
	assert.equal(comparison.log.damage.total, 1600)
	assert.equal(comparison.log.skillCounts.total, 2)
	assert.equal(comparison.skillRows.some(row => row.actionId === 25881), false)
})

test('mirrors FFLogs auto attack count into simulated comparison rows', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 21000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: 'Hard Slash', type: 128}},
			{timestamp: 1100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: 'Hard Slash', type: 128}, amount: 1000},
			{timestamp: 2100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 7, name: 'Attack', type: 1}, amount: 100},
			{timestamp: 5100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 7, name: 'Attack', type: 1}, amount: 200},
		],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: false,
	})
	const autoRow = comparison.skillRows.find(row => row.actionId === 7)

	assert.equal(comparison.log.damage.total, 1300)
	assert.equal(comparison.simulated.damage.total, 12300)
	assert.equal(comparison.log.skillCounts.total, 3)
	assert.equal(comparison.simulated.skillCounts.total, 3)
	assert.equal(autoRow?.logCount, 2)
	assert.equal(autoRow?.simulatedCount, 2)
})

test('scales simulated estimated damage by log GCD utilization while preserving exact auto attacks', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: 'Hard Slash', type: 128}},
			{timestamp: 1100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: 'Hard Slash', type: 128}, amount: 1000},
			{timestamp: 2100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 7, name: 'Attack', type: 1}, amount: 100},
			{timestamp: 5100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 7, name: 'Attack', type: 1}, amount: 200},
		],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: true,
	})

	assert.equal(comparison.log.gcdUtilization.percent, 25)
	assert.equal(comparison.simulated.damage.phases.P1.damage, 6300)
	assert.equal(comparison.simulated.damage.total, 6300)
	assert.equal(comparison.simulated.damage.unadjustedTotal, 24300)
	assert.equal(comparison.simulated.damage.phases.P1.unadjustedDamage, 24300)
	assert.equal(comparison.simulated.damage.adjustment.scales.P1, 0.25)
})

test('applies log GCD utilization only to simulated GCD damage', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: 'Hard Slash', type: 128}},
			{timestamp: 1100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: 'Hard Slash', type: 128}, amount: 1000},
		],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 5000, actionId: 16470, name: 'Edge of Shadow', potency: 100, output: true, weave: 'ogcd', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: true,
	})

	assert.equal(comparison.log.gcdUtilization.percent, 25)
	assert.equal(comparison.simulated.damage.total, 18000)
	assert.equal(comparison.simulated.damage.unadjustedTotal, 36000)
	assert.equal(comparison.simulated.damage.phases.P1.damage, 18000)
	assert.equal(comparison.simulated.damage.phases.P1.unadjustedDamage, 36000)
})

test('does not apply log GCD utilization as a damage penalty by default', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3617, name: 'Hard Slash', type: 128}},
			{timestamp: 1100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3617, name: 'Hard Slash', type: 128}, amount: 1000},
		],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 5000, actionId: 16470, name: 'Edge of Shadow', potency: 100, output: true, weave: 'ogcd', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
	})

	assert.equal(comparison.log.gcdUtilization.percent, 25)
	assert.equal(comparison.simulated.damage.total, 36000)
	assert.equal(comparison.simulated.damage.adjustment, undefined)
})

test('applies adjustable target GCD utilization to simulated GCD damage', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 5000, actionId: 3632, name: 'Souleater', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 7500, actionId: 7392, name: 'Bloodspiller', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 8200, actionId: 16470, name: 'Edge of Shadow', potency: 100, output: true, weave: 'ogcd', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
		targetGcdUtilizationPercent: 50,
	})

	assert.equal(comparison.simulated.gcdUtilization.percent, 50)
	assert.equal(comparison.simulated.gcdUtilization.actualPercent, 100)
	assert.equal(comparison.simulated.damage.total, 36000)
	assert.equal(comparison.simulated.damage.unadjustedTotal, 60000)
	assert.equal(comparison.simulated.damage.adjustment.type, 'target-gcd-utilization')
	assert.equal(comparison.simulated.damage.adjustment.scales.P1, 0.5)
})

test('counts Unmend as a DRK GCD in FFLogs casts', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [
			{timestamp: 1000, fight: 10, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: {guid: 3624, name: '伤残', type: 1024}},
			{timestamp: 1100, fight: 10, type: 'damage', sourceID: 1, sourceIsFriendly: true, targetID: 99, ability: {guid: 3624, name: '伤残', type: 1024}, amount: 1000},
		],
	}

	const comparison = buildFflogsComparisonFromEvents(payload, [], {
		currentJob: 'DRK',
		actorId: 1,
	})

	assert.equal(comparison.log.skillCounts.gcd, 1)
	assert.equal(comparison.log.skillCounts.ogcd, 0)
	assert.equal(comparison.log.gcdUtilization.percent, 25)
	assert.equal(comparison.log.skillCounts.byAction.find(row => row.actionId === 3624)?.gcd, 1)
})

test('calibrates simulated damage from a large FFLogs sample instead of using fixed attack power', async () => {
	const payload = JSON.parse(await readFile(new URL('../data/fflogs-cache/VHqxznv6bFcMPpLm-fight-10.json', import.meta.url), 'utf8'))
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: '重斩', potency: 300, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 2500, actionId: 3623, name: '吸收斩', potency: 380, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 5000, actionId: 3632, name: '噬魂斩', potency: 480, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 5700, actionId: 16470, name: '暗影锋', potency: 460, output: true, weave: 'ogcd', phase: 'P1'},
	]

	const calibrated = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: false,
	})
	const fixed = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: false,
		calibrateSimulatedDamageToLog: false,
	})

	assert.equal(calibrated.simulated.damage.calibration.type, 'fflogs-effective-attack-power')
	assert.ok(calibrated.simulated.damage.calibration.attackPower > 70)
	assert.ok(calibrated.simulated.damage.calibration.attackPower < 90)
	assert.ok(calibrated.simulated.damage.total < fixed.simulated.damage.total)
})

test('real FFLogs comparison stays near the parsed simulated axis without uptime double-penalty', async () => {
	const payload = JSON.parse(await readFile(new URL('../data/fflogs-cache/VHqxznv6bFcMPpLm-fight-10.json', import.meta.url), 'utf8'))
	const model = JSON.parse(await readFile(new URL('../public/data/prototype.json', import.meta.url), 'utf8'))
	const simulatedEvents = [
		...(model.tracks?.expert?.simulated ?? model.acrSimulation?.events ?? []),
		...((model.tracks?.expert?.player ?? []).filter(event => !event.output && event.source !== 'KANO ACR' && !event.simulated)),
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
	})

	assert.ok(Math.abs(comparison.deltas.damage.percent) < 5)
	assert.equal(comparison.simulated.damage.adjustment, undefined)
	assert.equal(comparison.log.skillCounts.byAction.find(row => row.actionId === 3624)?.gcd, 16)
	assert.ok(comparison.log.gcdUtilization.percent > 89)
})

test('FFLogs calibration absorbs realized crit direct and raid buff damage', () => {
	const events = []
	for (let index = 0; index < 30; index += 1) {
		events.push({
			timestamp: 1000 + index * 2500,
			fight: 10,
			type: 'cast',
			sourceID: 1,
			sourceIsFriendly: true,
			ability: {guid: 3617, name: 'Hard Slash', type: 128},
		})
		events.push({
			timestamp: 1100 + index * 2500,
			fight: 10,
			type: 'damage',
			packetID: index + 1,
			sourceID: 1,
			sourceIsFriendly: true,
			targetID: 99,
			ability: {guid: 3617, name: 'Hard Slash', type: 128},
			amount: 60000,
			hitType: 2,
			directHit: true,
			bonusPercent: 10,
			buffs: 'party-buff.',
		})
	}
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 76000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events,
	}
	const comparison = buildFflogsComparisonFromEvents(payload, [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 300, output: true, weave: 'gcd', phase: 'P1'},
	], {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
		scaleSimulatedDamageToLogUptime: false,
	})

	assert.equal(comparison.simulated.damage.calibration.sampleHits, 30)
	assert.equal(Math.round(comparison.simulated.damage.total), 60000)
	assert.equal(comparison.simulated.damage.calibration.sampleDamage, 1800000)
})

test('counts grouped simulated skill uses in total and gcd buckets', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, count: 3, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 1000, actionId: 16470, name: 'Edge of Shadow', potency: 100, count: 2, output: true, weave: 'ogcd', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
	})

	assert.equal(comparison.simulated.skillCounts.total, 5)
	assert.equal(comparison.simulated.skillCounts.actions, 5)
	assert.equal(comparison.simulated.skillCounts.auto, 0)
	assert.equal(comparison.simulated.skillCounts.gcd, 3)
	assert.equal(comparison.simulated.skillCounts.ogcd, 2)
	assert.equal(comparison.simulated.skillCounts.byAction.find(row => row.actionId === 3617)?.gcd, 3)
	assert.equal(comparison.simulated.skillCounts.byAction.find(row => row.actionId === 16470)?.ogcd, 2)
})

test('filters actionless simulated controls while keeping mitigation skill counts', () => {
	const payload = {
		reportCode: 'synthetic',
		fightId: 10,
		fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
		friendlies: [
			{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
		],
		events: [],
	}
	const simulatedEvents = [
		{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 100, output: true, weave: 'gcd', phase: 'P1'},
		{timeMs: 1000, actionId: 7393, name: '至黑之夜', potency: 0, output: false, weave: 'ogcd', classification: 'mitigation', phase: 'P1'},
		{timeMs: 2000, actionId: '', name: '开启留黑盾蓝', potency: 0, output: false, weave: 'ogcd', classification: 'utility', phase: 'P1'},
		{timeMs: 3000, actionId: '', name: '关闭存黑盾蓝QT', potency: 0, output: false, weave: 'ogcd', kind: 'qt-control', classification: 'qt', phase: 'P1'},
	]

	const comparison = buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob: 'DRK',
		actorId: 1,
		critRate: 0,
		directRate: 0,
		luck: 'average',
	})

	assert.equal(comparison.simulated.skillCounts.total, 2)
	assert.equal(comparison.simulated.skillCounts.gcd, 1)
	assert.equal(comparison.simulated.skillCounts.ogcd, 1)
	assert.equal(comparison.simulated.skillCounts.byAction.some(row => row.actionName === '开启留黑盾蓝'), false)
	assert.equal(comparison.simulated.skillCounts.byAction.find(row => row.actionId === 7393)?.ogcd, 1)
})
