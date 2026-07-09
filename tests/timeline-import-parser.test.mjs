import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {
	collectBossCastItems,
	detectTimelineImportKind,
	flattenPrTimeline,
	flattenPtlTimeline,
	resolveBossCastConditionTimeMs,
	tagEventsByPhaseWindows,
} from '../public/timeline-import-parser.js'
import * as timelineImportParser from '../public/timeline-import-parser.js'
import {buildSkillDatabase, classifyAction} from '../src/skill-database.mjs'

test('detects traditional PR trigger timelines separately from PTL timelines', () => {
	assert.deepEqual(detectTimelineImportKind({Root: {Type: 'serial'}}), {
		id: 'trigger',
		label: '传统触发轴',
	})
	assert.deepEqual(detectTimelineImportKind({
		Version: 1,
		Meta: {Name: 'PTL sample'},
		Anchors: [],
		Entries: [],
	}), {
		id: 'ptl',
		label: 'PTL 时间轴',
	})
})

test('flattens PTL entries from anchor time plus entry offset while keeping phase anchors', () => {
	const startAnchorGuid = '11111111-1111-1111-1111-111111111111'
	const phaseTwoAnchorGuid = '22222222-2222-2222-2222-222222222222'
	const endAnchorGuid = '33333333-3333-3333-3333-333333333333'
	const timeline = {
		Version: 1,
		Meta: {Name: 'PTL sample', JobId: 32, AcrAuthor: 'KANO'},
		Anchors: [
			{Guid: startAnchorGuid, Name: 'P1 Start', Time: 0, IsPhaseAnchor: true, Sync: {Type: 'InCombat'}},
			{Guid: phaseTwoAnchorGuid, Name: 'P2', Time: 120, IsPhaseAnchor: true},
			{Guid: endAnchorGuid, Name: 'End', Time: 180, IsEndAnchor: true},
		],
		Entries: [
			{
				Guid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				Name: 'P1 mitigation',
				StartAnchorGuid: startAnchorGuid,
				Offset: 10.5,
				EntryGroup: {
					Type: 'serial',
					Enabled: true,
					Children: [
						{Type: 'delay', Enabled: true, DelayMs: 500},
						{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 7531}]},
					],
				},
			},
			{
				Guid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
				Name: 'P2 burst',
				StartAnchorGuid: phaseTwoAnchorGuid,
				Offset: 2,
				EntryGroup: {
					Type: 'action',
					Enabled: true,
					Actions: [{Type: 'EnqueueSkill', ActionId: 16471}],
				},
			},
			{
				Guid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
				Name: 'Out of bounds',
				StartAnchorGuid: phaseTwoAnchorGuid,
				Offset: 90,
				EntryGroup: {
					Type: 'action',
					Enabled: true,
					Actions: [{Type: 'EnqueueSkill', ActionId: 99999}],
				},
			},
		],
	}
	const result = flattenPtlTimeline(timeline, {
		actionEvents: ({action, node}) => [{kind: 'player-action', name: node.Name, actionId: action.ActionId}],
		delayEvent: ({node}) => ({kind: 'delay', name: node.Name}),
	})
	const actions = result.events.filter(event => event.kind === 'player-action')

	assert.deepEqual(actions.map(event => [event.actionId, event.timeMs, event.phase, event.phaseStartMs]), [
		[7531, 11000, 'P1', 0],
		[16471, 122000, 'P2', 120000],
	])
	assert.equal(result.endMs, 180000)
})

test('assigns PTL events to technical phase anchors without using them as segment boundaries', () => {
	const startAnchorGuid = '11111111-1111-1111-1111-111111111111'
	const p2LabelGuid = '22222222-2222-2222-2222-222222222222'
	const mechanicTwoGuid = '33333333-3333-3333-3333-333333333333'
	const p3LabelGuid = '44444444-4444-4444-4444-444444444444'
	const mechanicThreeGuid = '55555555-5555-5555-5555-555555555555'
	const endAnchorGuid = '66666666-6666-6666-6666-666666666666'
	const timeline = {
		Version: 1,
		Meta: {Name: 'PTL technical phase sample'},
		Anchors: [
			{Guid: startAnchorGuid, Name: 'Start', Time: 0, Sync: {Type: 'InCombat'}},
			{Guid: p2LabelGuid, Name: 'Label: p2-success', Time: 120, IsPhaseAnchor: true, IsTechnicalAnchor: true},
			{Guid: mechanicTwoGuid, Name: 'P2 mechanic', Time: 140},
			{Guid: p3LabelGuid, Name: 'Label: p3-success', Time: 220, IsPhaseAnchor: true, IsTechnicalAnchor: true},
			{Guid: mechanicThreeGuid, Name: 'P3 mechanic', Time: 240},
			{Guid: endAnchorGuid, Name: 'End', Time: 300, IsEndAnchor: true},
		],
		Entries: [
			{
				Guid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				Name: 'P2 action',
				StartAnchorGuid: mechanicTwoGuid,
				Offset: 10,
				EntryGroup: {
					Type: 'action',
					Actions: [{Type: 'EnqueueSkill', ActionId: 16471}],
				},
			},
			{
				Guid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
				Name: 'P3 action',
				StartAnchorGuid: mechanicThreeGuid,
				Offset: 5,
				EntryGroup: {
					Type: 'action',
					Actions: [{Type: 'EnqueueSkill', ActionId: 7393}],
				},
			},
		],
	}

	const result = flattenPtlTimeline(timeline, {
		actionEvents: ({action, node}) => [{kind: 'player-action', name: node.Name, actionId: action.ActionId}],
	})
	const actions = result.events.filter(event => event.kind === 'player-action')

	assert.deepEqual(actions.map(event => [event.actionId, event.timeMs, event.phase, event.phaseStartMs]), [
		[16471, 150000, 'P2', 120000],
		[7393, 245000, 'P3', 220000],
	])
})

test('tags absolute PTL events by imported boss phase windows for phase filtering', () => {
	const source = {
		lastSecond: 500,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 208.97},
			{id: 3, startSecond: 428.52},
		],
	}
	const tagged = tagEventsByPhaseWindows([
		{kind: 'player-action', actionId: 7535, timeMs: 171700, phase: 'P1', phaseStartMs: 0},
		{kind: 'player-action', actionId: 16471, timeMs: 215101, phase: 'P1', phaseStartMs: 0},
		{kind: 'player-action', actionId: 7393, timeMs: 437000, phase: 'P1', phaseStartMs: 0},
	], source)

	assert.deepEqual(tagged.map(event => [event.actionId, event.phase, event.phaseStartMs]), [
		[7535, 'P1', 0],
		[16471, 'P2', 208970],
		[7393, 'P3', 428520],
	])
})

test('flattens PR parallel branches without serially accumulating their delays', () => {
	const timeline = {
		Root: {
			Type: 'parallel',
			Enabled: true,
			Children: [
				{
					Type: 'serial',
					Enabled: true,
					Children: [
						{Name: '第一读条', Type: 'condition', Enabled: true, Conditions: [{Type: 'CastStart', Regex: '100'}]},
						{Name: '延迟 1 秒', Type: 'delay', Enabled: true, DelayMs: 1000},
						{Name: '第一技能', Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90001}]},
					],
				},
				{
					Type: 'serial',
					Enabled: true,
					Children: [
						{Name: '第二读条', Type: 'condition', Enabled: true, Conditions: [{Type: 'CastStart', Regex: '200'}]},
						{Name: '延迟 2 秒', Type: 'delay', Enabled: true, DelayMs: 2000},
						{Name: '第二技能', Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90002}]},
					],
				},
			],
		},
	}
	const result = flattenPrTimeline(timeline, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, [
			{actionId: 100, startMs: 10000},
			{actionId: 200, startMs: 30000},
		]),
		actionEvents: ({action, node}) => [{kind: 'player-action', name: node.Name, actionId: action.ActionId}],
		conditionEvent: ({node}) => ({kind: 'boss-cast', name: node.Name}),
		delayEvent: ({node}) => ({kind: 'delay', name: node.Name, durationMs: node.DelayMs}),
	})
	const actions = result.events.filter(event => event.kind === 'player-action')

	assert.deepEqual(actions.map(event => [event.actionId, event.timeMs]), [
		[90001, 11000],
		[90002, 32000],
	])
	assert.equal(result.endMs, 32000)
})

test('keeps PR phase state isolated between parallel sibling branches', () => {
	const result = flattenPrTimeline({
		Root: {
			Type: 'parallel',
			Enabled: true,
			Children: [
				{
					Name: 'phase branch',
					Type: 'serial',
					Enabled: true,
					Children: [
						{Name: 'P5', Type: 'serial', Enabled: true, Children: [
							{Type: 'delay', Enabled: true, DelayMs: 1000},
							{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90011}]},
						]},
					],
				},
				{
					Name: 'qt init branch',
					Type: 'serial',
					Enabled: true,
					Children: [
						{Name: 'QT init', Type: 'action', Enabled: true, Actions: [{Type: 'BatchTriggerQt'}]},
					],
				},
			],
		},
	}, {
		actionEvents: ({action, node}) => [{
			kind: action.Type === 'BatchTriggerQt' ? 'qt-control' : 'player-action',
			actionId: action.ActionId ?? action.Type,
			name: node.Name,
		}],
	})
	const phaseAction = result.events.find(event => event.actionId === 90011)
	const qtInit = result.events.find(event => event.actionId === 'BatchTriggerQt')

	assert.equal(phaseAction.phase, 'P5')
	assert.equal(phaseAction.phaseStartMs, 0)
	assert.equal(qtInit.phase, 'P1')
	assert.equal(qtInit.phaseStartMs, 0)
})

test('collects boss cast rows and resolves repeated CastStart conditions to the next matching occurrence', () => {
	const bossCasts = collectBossCastItems([
		{id: 'boss-casts-a', groupId: 'boss-casts', items: [{actionId: 50179, startMs: 10000}]},
		{id: 'boss-casts-b', groupId: 'boss-casts', items: [{actionId: '50179', startMs: 90000}]},
		{id: 'boss-damage', groupId: 'boss-damage', items: [{actionId: 50179, startMs: 12000}]},
	])

	assert.equal(resolveBossCastConditionTimeMs({Type: 'CastStart', Regex: '50179'}, 0, bossCasts), 10000)
	assert.equal(resolveBossCastConditionTimeMs({Type: 'CastStart', Regex: '50179'}, 20000, bossCasts), 90000)
	assert.equal(resolveBossCastConditionTimeMs({Type: 'SkillCooldown', ActionId: 50179}, 0, bossCasts), null)
})

test('matches PR loader behavior for case-insensitive node types and singular Action payloads', () => {
	const result = flattenPrTimeline({
		Root: {
			Type: 'Serial',
			Enabled: true,
			Children: [
				{Type: 'Delay', Enabled: true, DelayMs: 2500},
				{Type: 'Action', Enabled: true, Action: {Type: 'EnqueueSkill', ActionId: 90003}},
			],
		},
	}, {
		actionEvents: ({action}) => [{kind: 'player-action', actionId: action.ActionId}],
	})

	assert.deepEqual(result.events.map(event => [event.actionId, event.timeMs]), [
		[90003, 2500],
	])
})

test('resolves PR wait conditions with AND at the latest condition and OR at the earliest condition', () => {
	const bossCasts = [
		{actionId: 100, startMs: 10000},
		{actionId: 200, startMs: 30000},
	]
	const result = flattenPrTimeline({
		Root: {
			Type: 'serial',
			Enabled: true,
			Children: [
				{
					Name: 'AND sync',
					Type: 'condition',
					Enabled: true,
					Mode: 'wait',
					UseAndLogic: true,
					Conditions: [
						{Type: 'CastStart', Regex: '100'},
						{Type: 'CastStart', Regex: '200'},
					],
				},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90004}]},
				{
					Name: 'OR sync',
					Type: 'condition',
					Enabled: true,
					Mode: 'wait',
					UseAndLogic: false,
					Conditions: [
						{Type: 'CastStart', Regex: '200'},
						{Type: 'CastStart', Regex: '100'},
					],
				},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90005}]},
			],
		},
	}, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, bossCasts),
		conditionEvent: ({condition}) => ({kind: 'boss-cast', actionId: Number(condition.Regex)}),
		actionEvents: ({action}) => [{kind: 'player-action', actionId: action.ActionId}],
	})
	const actions = result.events.filter(event => event.kind === 'player-action')
	const syncedCasts = result.events.filter(event => event.kind === 'boss-cast')

	assert.deepEqual(actions.map(event => [event.actionId, event.timeMs]), [
		[90004, 30000],
		[90005, 30000],
	])
	assert.deepEqual(syncedCasts.map(event => [event.actionId, event.timeMs]), [
		[100, 10000],
		[200, 30000],
		[200, 30000],
	])
})

test('flattens PR branch nodes by selecting only the runtime active child', () => {
	const result = flattenPrTimeline({
		Root: {
			Type: 'branch',
			Enabled: true,
			Children: [
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90006}]},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90007}]},
			],
		},
	}, {
		actionEvents: ({action}) => [{kind: 'player-action', actionId: action.ActionId}],
	})

	assert.deepEqual(result.events.map(event => event.actionId), [90006])
})

test('blocks a serial branch after an unresolved PR wait condition', () => {
	const result = flattenPrTimeline({
		Root: {
			Type: 'parallel',
			Enabled: true,
			Children: [
				{
					Type: 'serial',
					Enabled: true,
					Children: [
						{Type: 'condition', Enabled: true, Mode: 'wait', Conditions: [{Type: 'CastStart', Regex: '100'}]},
						{Type: 'delay', Enabled: true, DelayMs: 3000},
						{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90008}]},
						{Type: 'condition', Enabled: true, Mode: 'wait', Conditions: [{Type: 'CastStart', Regex: '200'}]},
						{Type: 'delay', Enabled: true, DelayMs: 3000},
						{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90009}]},
					],
				},
				{
					Type: 'serial',
					Enabled: true,
					Children: [
						{Type: 'delay', Enabled: true, DelayMs: 1000},
						{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 90010}]},
					],
				},
			],
		},
	}, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, [
			{actionId: 100, startMs: 10000},
		]),
		actionEvents: ({action}) => [{kind: 'player-action', actionId: action.ActionId}],
	})

	assert.deepEqual(result.events.filter(event => event.kind === 'player-action').map(event => [event.actionId, event.timeMs]), [
		[90008, 13000],
		[90010, 1000],
	])
})

test('PR timeline import can continue past non-cast sync waits and resolve multi-id cast waits', () => {
	const result = flattenPrTimeline({
		Root: {
			Type: 'serial',
			Enabled: true,
			Children: [
				{Type: 'condition', Enabled: true, Mode: 'wait', Conditions: [{Type: 'InCombat'}]},
				{Type: 'condition', Enabled: true, Mode: 'wait', Conditions: [{Type: 'Weather', ActionId: 77}]},
				{Type: 'condition', Enabled: true, Mode: 'wait', Conditions: [{Type: 'CastStart', Regex: '47768|47774'}]},
				{Type: 'delay', Enabled: true, DelayMs: 1000},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 7433}]},
				{Type: 'condition', Enabled: true, Mode: 'wait', Conditions: [{Type: 'ActionEffect', Regex: '47784'}]},
				{Type: 'delay', Enabled: true, DelayMs: 1000},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 16536}]},
			],
		},
	}, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, [
			{actionId: 47774, startMs: 30000},
		]),
		shouldBlockOnUnresolvedCondition: ({conditions}) => conditions.some(condition => condition.Type === 'CastStart'),
		actionEvents: ({action}) => [{kind: 'player-action', actionId: action.ActionId}],
	})

	assert.deepEqual(result.events.filter(event => event.kind === 'player-action').map(event => [event.actionId, event.timeMs]), [
		[7433, 31000],
		[16536, 32000],
	])
})

test('resolves PR SkillCooldown waits from previously enqueued action recasts', () => {
	const result = flattenPrTimeline({
		Root: {
			Type: 'serial',
			Enabled: true,
			Children: [
				{Type: 'delay', Enabled: true, DelayMs: 1000},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 16471}]},
				{Type: 'delay', Enabled: true, DelayMs: 3000},
				{
					Type: 'condition',
					Enabled: true,
					Mode: 'wait',
					Conditions: [{Type: 'SkillCooldown', ActionId: 16471, Mode: '<=', Value: 0}],
				},
				{Type: 'action', Enabled: true, Actions: [{Type: 'EnqueueSkill', ActionId: 16471}]},
			],
		},
	}, {
		actionRecastMs: ({action}) => Number(action.ActionId) === 16471 ? 90000 : 0,
		actionEvents: ({action}) => [{kind: 'player-action', actionId: action.ActionId}],
	})

	assert.deepEqual(result.events.filter(event => event.kind === 'player-action').map(event => [event.actionId, event.timeMs]), [
		[16471, 1000],
		[16471, 91000],
	])
	assert.equal(result.endMs, 91000)
})

test('normalizes phase-tagged PR events against imported boss phase windows', () => {
	assert.equal(typeof timelineImportParser.normalizePhaseTaggedEvents, 'function')

	const source = {
		lastSecond: 800,
		phases: [
			{id: 1, startSecond: 0},
			{id: 2, startSecond: 208.97},
			{id: 3, startSecond: 428.52},
		],
	}
	const normalized = timelineImportParser.normalizePhaseTaggedEvents([
		{phase: 'P2', phaseStartMs: 0, timeMs: 8500, durationMs: 10000},
		{phase: 'P2', phaseStartMs: 0, timeMs: 371034, durationMs: 10000},
		{phase: 'P3', phaseStartMs: 155300, timeMs: 156300, startMs: 156300, endMs: 171300},
	], source)

	assert.deepEqual(normalized.map(event => [event.phase, event.phaseStartMs, event.timeMs]), [
		['P2', 208970, 217470],
		['P2', 208970, 371034],
		['P3', 428520, 429520],
	])
	assert.equal(normalized[2].startMs, 429520)
	assert.equal(normalized[2].endMs, 444520)
})

test('does not double-shift absolute PR trigger times that are slightly before a boss phase window', () => {
	const source = {
		lastSecond: 1095,
		phases: [
			{id: 1, startSecond: 0},
			{id: 5, startSecond: 897.51},
		],
	}
	const normalized = timelineImportParser.normalizePhaseTaggedEvents([
		{phase: 'P5', phaseStartMs: 0, timeMs: 2000, actionId: 16471},
		{phase: 'P5', phaseStartMs: 0, timeMs: 844374, actionId: 16471},
	], source)

	assert.deepEqual(normalized.map(event => event.timeMs), [899510, 844374])
	assert.deepEqual(normalized.map(event => event.phaseStartMs), [897510, 897510])
})

test('imports the real Sage PR timeline with mitigation and healing durations from the skill database', async () => {
	const timeline = JSON.parse(await readFile('C:/Users/Administrator/AppData/Roaming/XIVLauncherCN/pluginConfigs/PromeRotation/Timelines/贤者轴_P1.json', 'utf8'))
	const skillDatabase = buildSkillDatabase()
	const bossCasts = [
		{actionId: 48370, startMs: 26865},
		{actionId: 47764, startMs: 33009},
		{actionId: 50722, startMs: 58335},
		{actionId: 50179, startMs: 10779},
		{actionId: 50179, startMs: 93118},
		{actionId: 47801, startMs: 147576},
	]
	const {events} = flattenPrTimeline(timeline, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, bossCasts),
		actionEvents: ({action}) => {
			const classification = classifyAction(action.ActionId, '', skillDatabase, {kind: 'player-action'})
			return [{
				kind: 'player-action',
				actionId: action.ActionId,
				classification: classification.type,
				durationMs: classification.effectDurationMs ?? 0,
			}]
		},
	})
	const actions = events.filter(event => event.kind === 'player-action')
	const durations = new Map(actions.map(event => [Number(event.actionId), event.durationMs]))

	assert.equal(actions.length, 13)
	assert.equal(durations.get(24298), 15000)
	assert.equal(durations.get(24302), 15000)
	assert.equal(durations.get(24310), 30000)
	assert.equal(durations.get(37035), 20000)
	assert.equal(durations.get(24300), 30000)
	assert.equal(durations.get(24303), 15000)
	assert.equal(actions.every(event => event.durationMs > 0), true)
	assert.equal(actions.some(event => Number(event.actionId) === 24302 && event.timeMs === 167576), false)
	assert.equal(actions.some(event => Number(event.actionId) === 24298 && event.timeMs === 187576), false)
})
