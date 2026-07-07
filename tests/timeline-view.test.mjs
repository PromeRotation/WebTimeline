import test from 'node:test'
import assert from 'node:assert/strict'
import * as timelineView from '../public/timeline-view.js'

const {filterTimelineRowsByPhase, phaseOptions, timelineDurationMs} = timelineView

test('uses the imported boss fight duration even when visible rows are truncated', () => {
	const rows = [
		{items: [{endMs: 120000}]},
		{items: [{endMs: 300000}]},
	]
	const source = {lastSecond: 1112.15}

	assert.equal(timelineDurationMs(rows, source), 1112150)
})

test('uses the selected phase duration for the ruler instead of the whole fight', () => {
	const source = {
		lastSecond: 300,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 100},
			{id: 3, startSecond: 240},
		],
	}
	const rows = [
		{items: [{endMs: 260000}]},
	]

	assert.equal(timelineDurationMs(rows, source, 'p2'), 140000)
})

test('filters and rebases every timeline row to the selected phase window', () => {
	assert.equal(typeof timelineView.timelineRowsForPhase, 'function')

	const source = {
		lastSecond: 300,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 100},
			{id: 3, startSecond: 200},
		],
	}
	const rows = [
		{id: 'boss-casts-chaos', groupId: 'boss-casts', items: [{label: 'P2 boss', startMs: 120000, endMs: 125000}]},
		{id: 'player-actions', items: [{label: 'P2 player', startMs: 150000, endMs: 151000}, {label: 'P3 player', startMs: 240000, endMs: 241000}]},
		{id: 'qt-potion', items: [{label: 'P2 QT', startMs: 130000, endMs: 131000}]},
		{id: 'focus-add', html: '<button>+</button>', items: []},
	]

	const rebased = timelineView.timelineRowsForPhase(rows, source, 'p2')

	assert.deepEqual(rebased.map(row => row.id), ['boss-casts-chaos', 'player-actions', 'qt-potion', 'focus-add'])
	assert.deepEqual(rebased.find(row => row.id === 'boss-casts-chaos').items.map(item => item.startMs), [20000])
	assert.deepEqual(rebased.find(row => row.id === 'player-actions').items.map(item => item.label), ['P2 player'])
	assert.deepEqual(rebased.find(row => row.id === 'player-actions').items.map(item => item.startMs), [50000])
	assert.deepEqual(rebased.find(row => row.id === 'qt-potion').items.map(item => item.timeLabel), ['0:30'])
	assert.equal(rebased.find(row => row.id === 'boss-casts-chaos').items[0].absoluteStartMs, 120000)
})

test('keeps focused skill rows visible even when the selected phase has no hits', () => {
	const source = {
		lastSecond: 300,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 100},
			{id: 3, startSecond: 200},
		],
	}
	const rows = [
		{
			id: 'focus-7393',
			label: '至黑之夜',
			keepWhenEmpty: true,
			items: [{label: 'P3 黑盾', startMs: 240000, endMs: 247000}],
		},
	]

	const rebased = timelineView.timelineRowsForPhase(rows, source, 'p2')

	assert.deepEqual(rebased.map(row => row.id), ['focus-7393'])
	assert.deepEqual(rebased[0].items, [])
})

test('uses imported phase tags for player timeline rows before absolute boss windows', () => {
	const source = {
		lastSecond: 1200,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 200},
			{id: 3, startSecond: 400},
			{id: 4, startSecond: 700},
			{id: 5, startSecond: 900},
		],
	}
	const rows = [
		{
			id: 'mitigation-actions',
			items: [
				{label: 'P5 黑盾', phase: 'P5', phaseStartMs: 437900, startMs: 482300, endMs: 489300},
				{label: 'P4 雪仇', phase: 'P4', phaseStartMs: 350000, startMs: 352000, endMs: 362000},
			],
		},
		{
			id: 'acr-simulated',
			items: [
				{label: 'P5 ACR', startMs: 935000, endMs: 936600},
				{label: 'P3 ACR', startMs: 500000, endMs: 501600},
			],
		},
	]

	const rebased = timelineView.timelineRowsForPhase(rows, source, 'p5')

	assert.deepEqual(rebased.map(row => row.id), ['mitigation-actions', 'acr-simulated'])
	assert.deepEqual(rebased.find(row => row.id === 'mitigation-actions').items.map(item => item.label), ['P5 黑盾'])
	assert.equal(rebased.find(row => row.id === 'mitigation-actions').items[0].startMs, 44400)
	assert.deepEqual(rebased.find(row => row.id === 'acr-simulated').items.map(item => item.label), ['P5 ACR'])
	assert.equal(rebased.find(row => row.id === 'acr-simulated').items[0].startMs, 35000)
})

test('converts selected phase-relative drop time into absolute fight time', () => {
	assert.equal(typeof timelineView.absoluteMsForPhaseTime, 'function')
	assert.equal(typeof timelineView.phaseLabelForTime, 'function')

	const source = {
		lastSecond: 1200,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 200},
			{id: 3, startSecond: 400},
			{id: 4, startSecond: 700},
			{id: 5, startSecond: 900},
		],
	}

	assert.equal(timelineView.absoluteMsForPhaseTime(source, 'p5', 20000), 920000)
	assert.equal(timelineView.absoluteMsForPhaseTime(source, 'all', 20000), 20000)
	assert.deepEqual(timelineView.phaseLabelForTime(source, 'p5', 20000), {
		phaseId: 'p5',
		phaseLabel: 'P5',
		phaseTimeMs: 20000,
		absoluteTimeMs: 920000,
	})
})

test('filters boss rows to the selected phase and hides absent bosses', () => {
	const source = {
		lastSecond: 300,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 100},
			{id: 3, startSecond: 200},
		],
	}
	const rows = [
		{id: 'boss-casts-kefka', groupId: 'boss-casts', items: [{startMs: 20000, endMs: 25000}]},
		{id: 'boss-casts-chaos', groupId: 'boss-casts', items: [{startMs: 130000, endMs: 135000}]},
		{id: 'player-actions', items: [{startMs: 150000, endMs: 151000}, {startMs: 240000, endMs: 241000}]},
	]

	const filtered = filterTimelineRowsByPhase(rows, source, 'p2')

	assert.deepEqual(phaseOptions(source).map(phase => phase.id), ['p1', 'p2', 'p3'])
	assert.deepEqual(filtered.map(row => row.id), ['boss-casts-chaos', 'player-actions'])
	assert.equal(filtered.find(row => row.id === 'player-actions').items.length, 1)
})

test('filters selected boss phase before applying visible item limits', () => {
	const source = {
		lastSecond: 400,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 100},
			{id: 3, startSecond: 200},
		],
	}
	const rows = [
		{
			id: 'boss-casts-kefka',
			groupId: 'boss-casts',
			items: [
				{label: 'P1 A', startMs: 10000, endMs: 11000},
				{label: 'P1 B', startMs: 20000, endMs: 21000},
				{label: 'P1 C', startMs: 30000, endMs: 31000},
				{label: 'P3 A', startMs: 220000, endMs: 221000},
			],
		},
	]

	assert.equal(typeof timelineView.prepareBossTimelineRows, 'function')

	const prepared = timelineView.prepareBossTimelineRows(rows, source, 'p3', 2)

	assert.deepEqual(prepared.map(row => row.items.map(item => item.label)), [['P3 A']])
})

test('builds dense timeline ticks for the xivanalysis-style ruler', () => {
	assert.equal(typeof timelineView.timelineTicks, 'function')

	const ticks = timelineView.timelineTicks(65000)

	assert.deepEqual(ticks.map(tick => tick.ms), [0, 10000, 20000, 30000, 40000, 50000, 60000])
	assert.equal(ticks.find(tick => tick.ms === 10000).kind, 'minor')
	assert.equal(ticks.find(tick => tick.ms === 30000).kind, 'medium')
	assert.equal(ticks.find(tick => tick.ms === 60000).kind, 'major')
	assert.deepEqual(ticks.filter(tick => tick.label).map(tick => tick.label), ['0:00', '0:30', '1:00'])
})

test('merges boss cast and damage rows with damage shown on cast items', () => {
	assert.equal(typeof timelineView.mergeBossCastAndDamageRows, 'function')

	const rows = [
		{
			id: 'boss-casts-kefka',
			groupId: 'boss-casts',
			sourceName: 'Kefka',
			label: 'Kefka 读条',
			accent: 'rose',
			items: [
				{
					id: 'cast-1',
					type: 'cast',
					label: 'Forsaken',
					actionId: 100,
					sourceName: 'Kefka',
					startMs: 10000,
					endMs: 15000,
					timeLabel: '0:10',
					damage: 0,
					eventCount: 1,
				},
			],
		},
		{
			id: 'boss-damage-kefka',
			groupId: 'boss-damage',
			sourceName: 'Kefka',
			label: 'Kefka 伤害',
			accent: 'gold',
			items: [
				{
					id: 'damage-1',
					type: 'damage',
					label: '12345 Forsaken',
					actionId: 100,
					actionName: 'Forsaken',
					sourceName: 'Kefka',
					startMs: 15100,
					endMs: 15300,
					timeLabel: '0:15',
					damage: 12345,
					eventCount: 8,
				},
			],
		},
		{
			id: 'boss-damage-statue',
			groupId: 'boss-damage',
			sourceName: 'Statue',
			label: 'Statue 伤害',
			accent: 'gold',
			items: [
				{
					id: 'damage-2',
					type: 'damage',
					label: '9000 Ray',
					actionId: 200,
					actionName: 'Ray',
					sourceName: 'Statue',
					startMs: 22000,
					endMs: 22500,
					timeLabel: '0:22',
					damage: 9000,
					eventCount: 1,
				},
			],
		},
	]

	const merged = timelineView.mergeBossCastAndDamageRows(rows)
	const kefka = merged.find(row => row.sourceName === 'Kefka')
	const statue = merged.find(row => row.sourceName === 'Statue')

	assert.deepEqual(merged.map(row => row.label), ['Kefka', 'Statue'])
	assert.equal(kefka.groupId, 'boss')
	assert.equal(kefka.items.length, 1)
	assert.equal(kefka.items[0].type, 'cast')
	assert.equal(kefka.items[0].label, 'Forsaken')
	assert.equal(kefka.items[0].damage, 12345)
	assert.equal(kefka.items[0].damageEventCount, 8)
	assert.equal(kefka.items[0].eventCount, 8)
	assert.equal(kefka.items[0].damageItems.length, 1)
	assert.equal(statue.groupId, 'boss')
	assert.equal(statue.items.length, 1)
	assert.equal(statue.items[0].type, 'damage')
	assert.equal(statue.items[0].label, 'Ray')
	assert.equal(statue.items[0].damage, 9000)
})
