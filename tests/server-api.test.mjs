import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {
	buildFflogsEventPayload,
	createFflogsComparison,
} from '../src/fflogs-api.mjs'

const fightsPayload = await readJson('../data/fflogs-v1/VZRFDK4gcGaHWYXJ-fights.json')
const standardPayload = await readJson('../data/fflogs-standard/VZRFDK4gcGaHWYXJ-fight-11.json')

test('builds a standard comparison payload from FFLogs endpoint data', () => {
	const payload = buildFflogsEventPayload({
		fightsPayload,
		reportCode: 'VZRFDK4gcGaHWYXJ',
		fightId: 11,
		events: standardPayload.events,
	})

	assert.equal(payload.reportCode, 'VZRFDK4gcGaHWYXJ')
	assert.equal(payload.fight.id, 11)
	assert.equal(payload.friendlies.length > 0, true)
	assert.equal(payload.events.length, standardPayload.events.length)
})

test('creates a comparison response for the tool page', () => {
	const comparison = createFflogsComparison({
		payload: {
			...standardPayload,
			friendlies: fightsPayload.friendlies,
		},
		currentJob: 'DRK',
		simulatedEvents: [
			{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 300, output: true, weave: 'gcd', phase: 'P1'},
			{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 480, output: true, weave: 'gcd', phase: 'P1'},
		],
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
	})

	assert.equal(comparison.selectedActor.job, 'DRK')
	assert.ok(comparison.log.damage.total > 24000000)
	assert.ok(comparison.simulated.damage.total > 0)
	assert.ok(comparison.deltas.skillCounts.total < 0)
})

test('passes adjustable GCD utilization through comparison API', () => {
	const comparison = createFflogsComparison({
		payload: {
			reportCode: 'synthetic',
			fightId: 10,
			fight: {id: 10, name: 'Synthetic', start_time: 1000, end_time: 11000},
			friendlies: [
				{name: 'DRK Player', id: 1, type: 'DarkKnight', fights: [{id: 10}]},
			],
			events: [],
		},
		currentJob: 'DRK',
		actorId: 1,
		simulatedEvents: [
			{timeMs: 0, actionId: 3617, name: 'Hard Slash', potency: 300, output: true, weave: 'gcd', phase: 'P1'},
			{timeMs: 2500, actionId: 3623, name: 'Syphon Strike', potency: 480, output: true, weave: 'gcd', phase: 'P1'},
			{timeMs: 5000, actionId: 3632, name: 'Souleater', potency: 480, output: true, weave: 'gcd', phase: 'P1'},
			{timeMs: 7500, actionId: 7392, name: 'Bloodspiller', potency: 600, output: true, weave: 'gcd', phase: 'P1'},
			{timeMs: 3200, actionId: 16470, name: 'Edge of Shadow', potency: 460, output: true, weave: 'ogcd', phase: 'P1'},
		],
		critRate: 0,
		directRate: 0,
		luck: 'average',
		targetGcdUtilizationPercent: 75,
	})

	assert.equal(comparison.simulated.gcdUtilization.percent, 75)
	assert.equal(comparison.simulated.gcdUtilization.targeted, true)
	assert.equal(comparison.simulated.damage.adjustment.type, 'target-gcd-utilization')
	assert.ok(comparison.simulated.damage.total < comparison.simulated.damage.unadjustedTotal)
})

async function readJson(relativePath) {
	return JSON.parse((await readFile(new URL(relativePath, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''))
}
