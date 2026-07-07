import {DEFAULT_SKILL_DATABASE, classifyAction} from './skill-database.mjs'

const KANO_DRK_OPENER = [
	{timeMs: 0, actionId: 3617, label: '重斩', weave: 'gcd'},
	{timeMs: 700, actionId: 16470, label: '暗影锋', weave: 'ogcd'},
	{timeMs: 2500, actionId: 3623, label: '吸收斩', weave: 'gcd'},
	{timeMs: 3200, actionId: 16472, label: '弗雷', weave: 'ogcd'},
	{timeMs: 3900, actionId: 7531, label: '铁壁', weave: 'ogcd'},
	{timeMs: 5000, actionId: 3632, label: '噬魂斩', weave: 'gcd'},
	{timeMs: 5700, actionId: 7390, label: '血乱', weave: 'ogcd'},
	{timeMs: 6400, actionId: 3636, label: '暗影墙', weave: 'ogcd'},
	{timeMs: 7500, actionId: 3617, label: '重斩', weave: 'gcd'},
	{timeMs: 8200, actionId: 3639, label: '腐秽大地', weave: 'ogcd'},
	{timeMs: 8900, actionId: 3634, label: '弃明投暗', weave: 'ogcd'},
	{timeMs: 10000, actionId: 36928, label: '血红乱', weave: 'gcd'},
	{timeMs: 10700, actionId: 25757, label: '暗影使者', weave: 'ogcd'},
	{timeMs: 11400, actionId: 25754, label: '献奉', weave: 'ogcd'},
	{timeMs: 12500, actionId: 36929, label: '报应', weave: 'gcd'},
	{timeMs: 13200, actionId: 16470, label: '暗影锋', weave: 'ogcd'},
	{timeMs: 13900, actionId: 3643, label: '精雕怒斩', weave: 'ogcd'},
	{timeMs: 15000, actionId: 36930, label: '戮山', weave: 'gcd'},
	{timeMs: 15700, actionId: 25757, label: '暗影使者', weave: 'ogcd'},
	{timeMs: 16400, actionId: 7393, label: '至黑之夜', weave: 'ogcd'},
	{timeMs: 17500, actionId: 36932, label: '掠影的蔑视', weave: 'gcd'},
	{timeMs: 18200, actionId: 7537, label: '退避', weave: 'ogcd'},
	{timeMs: 20000, actionId: 7392, label: '血溅', weave: 'gcd'},
	{timeMs: 20700, actionId: 25755, label: '腐秽黑暗', weave: 'ogcd'},
	{timeMs: 22500, actionId: 3623, label: '吸收斩', weave: 'gcd'},
	{timeMs: 23200, actionId: 16470, label: '暗影锋', weave: 'ogcd'},
]

const KANO_DRK_LOOP_GCDS = [
	3617,
	3623,
	3632,
	3617,
	3623,
	3632,
	7392,
	3617,
	3623,
	3632,
	7392,
	3617,
	3623,
	3632,
]

const KANO_DRK_RECURRING_OGCDS = [
	{intervalMs: 17500, offsetMs: 700, actionId: 16470, label: '暗影锋'},
	{intervalMs: 60000, offsetMs: 5700, actionId: 7390, label: '血乱'},
	{intervalMs: 60000, offsetMs: 13200, actionId: 3643, label: '精雕怒斩'},
	{intervalMs: 90000, offsetMs: 8200, actionId: 3639, label: '腐秽大地'},
	{intervalMs: 90000, offsetMs: 20700, actionId: 25755, label: '腐秽黑暗'},
	{intervalMs: 120000, offsetMs: 3200, actionId: 16472, label: '弗雷'},
	{intervalMs: 120000, offsetMs: 10700, actionId: 25757, label: '暗影使者'},
	{intervalMs: 120000, offsetMs: 15700, actionId: 25757, label: '暗影使者'},
]

export function buildKanoDrkSimulation(skillDatabase = DEFAULT_SKILL_DATABASE, options = {}) {
	const durationMs = Number(options.durationMs ?? 720000)
	const events = [
		...KANO_DRK_OPENER,
		...buildRecurringLoop(durationMs),
	]
		.filter(event => event.timeMs <= durationMs)
		.sort((left, right) => left.timeMs - right.timeMs || weaveOrder(left.weave) - weaveOrder(right.weave))
		.map((event, index) => toSimulationEvent(event, index, skillDatabase))

	return {
		source: {
			acr: 'KANO',
			job: 'DRK',
			mode: '高难 100 级',
			name: 'KANO DRK ACR 模拟输出循环',
			durationMs,
		},
		events,
	}
}

function buildRecurringLoop(durationMs) {
	const events = []
	let nextDeliriumMs = 70000
	let nextDisesteemMs = 130000
	for (let timeMs = 25000, index = 0; timeMs <= durationMs; timeMs += 2500, index += 1) {
		if (timeMs >= nextDeliriumMs && timeMs < nextDeliriumMs + 7500) {
			events.push({
				timeMs,
				actionId: [36928, 36929, 36930][Math.floor((timeMs - nextDeliriumMs) / 2500)],
				weave: 'gcd',
			})
			if (timeMs === nextDeliriumMs + 5000) {
				nextDeliriumMs += 60000
			}
			continue
		}
		if (timeMs >= nextDisesteemMs) {
			events.push({
				timeMs,
				actionId: 36932,
				weave: 'gcd',
			})
			nextDisesteemMs += 120000
			continue
		}
		events.push({
			timeMs,
			actionId: KANO_DRK_LOOP_GCDS[index % KANO_DRK_LOOP_GCDS.length],
			weave: 'gcd',
		})
	}

	for (const ogcd of KANO_DRK_RECURRING_OGCDS) {
		for (let cycleMs = ogcd.intervalMs; cycleMs <= durationMs; cycleMs += ogcd.intervalMs) {
			events.push({
				timeMs: cycleMs + ogcd.offsetMs,
				actionId: ogcd.actionId,
				label: ogcd.label,
				weave: 'ogcd',
			})
		}
	}
	return events
}

function toSimulationEvent(event, index, skillDatabase) {
	const action = findAction(skillDatabase, event.actionId)
	const name = event.label ?? action?.name ?? `技能 ${event.actionId}`
	const classification = classifyAction(event.actionId, name, skillDatabase, {kind: 'player-action'})
	return {
		id: `kano-sim-${index + 1}`,
		kind: 'player-action',
		source: 'KANO ACR',
		acr: 'KANO',
		job: 'DRK',
		simulated: true,
		phase: 'ACR',
		timeMs: event.timeMs,
		name,
		actionId: event.actionId,
		skillType: event.weave === 'gcd' ? 'GCD' : 'oGCD',
		weave: event.weave,
		target: 'target',
		classification: classification.type,
		output: classification.output,
		potency: classification.potency,
		durationMs: classification.effectDurationMs ?? 0,
		iconUrl: action?.iconUrl ?? '',
		count: 1,
	}
}

function findAction(skillDatabase, actionId) {
	return skillDatabase?.actionsById?.[actionId] ?? skillDatabase?.actionsById?.[String(actionId)] ?? null
}

function weaveOrder(weave) {
	return weave === 'gcd' ? 0 : 1
}
