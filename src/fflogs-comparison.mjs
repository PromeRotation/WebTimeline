import {estimateDamage} from './simulation.mjs'
import {DEFAULT_SKILL_DATABASE} from './skill-database.mjs'

const DEFAULT_GCD_MS = 2500
const DEFAULT_ATTACK_POWER = 120
const MIN_CALIBRATION_HITS = 30
const PLAYER_PETS = new Set(['Pet', 'LimitBreak', 'NPC'])

const JOB_TYPE_TO_ID = new Map([
	['Paladin', 'PLD'],
	['Gladiator', 'PLD'],
	['Warrior', 'WAR'],
	['Marauder', 'WAR'],
	['DarkKnight', 'DRK'],
	['Gunbreaker', 'GNB'],
	['WhiteMage', 'WHM'],
	['Conjurer', 'WHM'],
	['Scholar', 'SCH'],
	['Astrologian', 'AST'],
	['Sage', 'SGE'],
	['Monk', 'MNK'],
	['Pugilist', 'MNK'],
	['Dragoon', 'DRG'],
	['Lancer', 'DRG'],
	['Ninja', 'NIN'],
	['Rogue', 'NIN'],
	['Samurai', 'SAM'],
	['Reaper', 'RPR'],
	['Viper', 'VPR'],
	['Bard', 'BRD'],
	['Archer', 'BRD'],
	['Machinist', 'MCH'],
	['Dancer', 'DNC'],
	['BlackMage', 'BLM'],
	['Thaumaturge', 'BLM'],
	['Summoner', 'SMN'],
	['Arcanist', 'SMN'],
	['RedMage', 'RDM'],
	['Pictomancer', 'PCT'],
	['BlueMage', 'BLU'],
])

const JOB_NAME_CN = new Map([
	['PLD', '骑士'],
	['WAR', '战士'],
	['DRK', '暗黑骑士'],
	['GNB', '绝枪战士'],
	['WHM', '白魔法师'],
	['SCH', '学者'],
	['AST', '占星术士'],
	['SGE', '贤者'],
	['MNK', '武僧'],
	['DRG', '龙骑士'],
	['NIN', '忍者'],
	['SAM', '武士'],
	['RPR', '钐镰客'],
	['VPR', '蝰蛇剑士'],
	['BRD', '吟游诗人'],
	['MCH', '机工士'],
	['DNC', '舞者'],
	['BLM', '黑魔法师'],
	['SMN', '召唤师'],
	['RDM', '赤魔法师'],
	['PCT', '绘灵法师'],
	['BLU', '青魔法师'],
])

const ACTION_JOB_HINTS = new Map([
	[3617, 'DRK'], [3623, 'DRK'], [3624, 'DRK'], [3632, 'DRK'], [7392, 'DRK'], [16470, 'DRK'], [16472, 'DRK'], [25755, 'DRK'], [25757, 'DRK'], [36926, 'DRK'], [36927, 'DRK'], [36928, 'DRK'], [36929, 'DRK'], [36930, 'DRK'], [36932, 'DRK'],
	[7381, 'PLD'], [7382, 'PLD'], [7383, 'PLD'], [7384, 'PLD'], [7385, 'PLD'], [7386, 'PLD'], [16457, 'PLD'], [16458, 'PLD'], [36918, 'PLD'], [36919, 'PLD'],
	[31, 'WAR'], [37, 'WAR'], [45, 'WAR'], [49, 'WAR'], [3549, 'WAR'], [3550, 'WAR'], [16465, 'WAR'], [36923, 'WAR'],
	[16137, 'GNB'], [16139, 'GNB'], [16141, 'GNB'], [16145, 'GNB'], [16146, 'GNB'], [25760, 'GNB'], [36934, 'GNB'],
	[119, 'WHM'], [120, 'WHM'], [121, 'WHM'], [16531, 'WHM'], [25860, 'WHM'], [37009, 'WHM'],
	[166, 'SCH'], [17869, 'SCH'], [25865, 'SCH'], [37013, 'SCH'],
	[3596, 'AST'], [3598, 'AST'], [3600, 'AST'], [25871, 'AST'], [37017, 'AST'],
	[24283, 'SGE'], [24289, 'SGE'], [24312, 'SGE'], [24313, 'SGE'], [37032, 'SGE'],
	[53, 'MNK'], [54, 'MNK'], [61, 'MNK'], [16473, 'MNK'], [36945, 'MNK'],
	[75, 'DRG'], [78, 'DRG'], [84, 'DRG'], [3554, 'DRG'], [16479, 'DRG'], [36955, 'DRG'],
	[2240, 'NIN'], [2242, 'NIN'], [2244, 'NIN'], [2254, 'NIN'], [36958, 'NIN'],
	[7477, 'SAM'], [7478, 'SAM'], [7479, 'SAM'], [7480, 'SAM'], [16481, 'SAM'], [36963, 'SAM'],
	[24373, 'RPR'], [24375, 'RPR'], [24377, 'RPR'], [24379, 'RPR'], [36969, 'RPR'],
	[34606, 'VPR'], [34607, 'VPR'], [34608, 'VPR'], [34620, 'VPR'], [34626, 'VPR'],
	[97, 'BRD'], [98, 'BRD'], [100, 'BRD'], [7409, 'BRD'], [16495, 'BRD'], [36978, 'BRD'],
	[2866, 'MCH'], [2868, 'MCH'], [2870, 'MCH'], [2872, 'MCH'], [7413, 'MCH'], [36980, 'MCH'],
	[15989, 'DNC'], [15990, 'DNC'], [15991, 'DNC'], [15992, 'DNC'], [36984, 'DNC'],
	[141, 'BLM'], [142, 'BLM'], [152, 'BLM'], [3577, 'BLM'], [7422, 'BLM'], [36987, 'BLM'],
	[3579, 'SMN'], [7426, 'SMN'], [25820, 'SMN'], [25823, 'SMN'], [36990, 'SMN'],
	[7503, 'RDM'], [7504, 'RDM'], [7505, 'RDM'], [7510, 'RDM'], [36999, 'RDM'],
	[34650, 'PCT'], [34653, 'PCT'], [34655, 'PCT'], [34664, 'PCT'],
])

const GCD_ACTION_TYPE_MASK = 128 | 1024
const AUTO_ATTACK_IDS = new Set([1, 7])
const DAMAGE_POTENCY_ALIASES = new Map([
	[25756, 500],
	[25881, 570],
	[36933, 620],
	[17909, 500],
	[17908, 420],
	[17904, 240],
	[1000749, 50],
	[3624, 150],
])
const KNOWN_GCD_ACTION_IDS = new Set([
	3617, 3623, 3624, 3632, 7392, 36928, 36929, 36930, 36932,
	7381, 7382, 7383, 7384, 16458, 36918, 36919,
	31, 37, 45, 49, 3549, 3550, 16465, 36923,
	16137, 16139, 16141, 16143, 16145, 25760, 36934,
	119, 121, 16531, 25860, 37009,
	166, 17869, 25865, 37013,
	3596, 3598, 3600, 25871, 37017,
	24283, 24289, 24312, 24313, 37032,
	53, 54, 61, 16473, 36945,
	75, 78, 84, 3554, 16479, 36955,
	2240, 2242, 2244, 2254, 36958,
	7477, 7478, 7479, 7480, 16481, 36963,
	24373, 24375, 24377, 24379, 36969,
	34606, 34607, 34608, 34620, 34626,
	97, 98, 100, 7409, 16495, 36978,
	2866, 2868, 2870, 2872, 7413, 36980,
	15989, 15990, 15991, 15992, 36984,
	141, 142, 152, 3577, 7422, 36987,
	3579, 7426, 25820, 25823, 36990,
	7503, 7504, 7505, 7510, 36999,
	34650, 34653, 34655, 34664,
])

export function parseFflogsReportUrl(value) {
	const url = new URL(String(value).trim())
	const match = /\/reports\/([^/?#]+)/.exec(url.pathname)
	if (!match) {
		throw new Error('请输入 FFLogs report 链接')
	}
	const fightId = Number(url.searchParams.get('fight'))
	if (!Number.isFinite(fightId) || fightId <= 0) {
		throw new Error('FFLogs 链接缺少 fight 参数')
	}
	return {
		reportCode: match[1],
		fightId,
		type: url.searchParams.get('type') || 'damage-done',
	}
}

export function buildFflogsComparisonFromEvents(payload, simulatedEvents = [], options = {}) {
	const fightId = Number(options.fightId ?? payload.fightId ?? payload.fight?.id)
	const fight = payload.fight ?? (payload.fights ?? []).find(item => Number(item.id) === fightId) ?? {}
	const reportCode = options.reportCode ?? payload.reportCode ?? ''
	const fightStart = Number(fight.start_time ?? minEventTimestamp(payload.events) ?? 0)
	const fightEnd = Number(fight.end_time ?? maxEventTimestamp(payload.events) ?? fightStart)
	const durationMs = Math.max(0, fightEnd - fightStart)
	const phases = buildPhaseWindows(fight, fightStart, fightEnd)
	const events = (payload.events ?? []).filter(event => !fightId || Number(event.fight ?? fightId) === fightId)
	const petOwnerIds = buildPetOwnerIds(payload)
	const actors = buildActors(payload, events, fightId, petOwnerIds)
	const selectedActor = selectActor(actors, options.currentJob, options.actorId)
	const logEvents = selectedActor ? events.filter(event => eventBelongsToActor(event, selectedActor.id, petOwnerIds)) : []
	const mirroredAutoAttackEvents = buildMirroredAutoAttackEvents(logEvents, {fightStart})
	const log = summarizeLogEvents(logEvents, {
		fightStart,
		fightEnd,
		phases,
		actor: selectedActor,
		actorId: selectedActor?.id,
	})
	const damageCalibration = options.calibrateSimulatedDamageToLog === false
		? null
		: calibrateDamageFromLogEvents(logEvents, {
			critRate: options.critRate,
			directRate: options.directRate,
			luck: options.luck,
		})
	const simulated = summarizeSimulatedEvents(simulatedEvents, {
		critRate: options.critRate,
		directRate: options.directRate,
		luck: options.luck,
		attackPower: damageCalibration?.attackPower,
		damageCalibration,
		durationMs,
		phases,
		autoAttackEvents: mirroredAutoAttackEvents,
		logGcdUtilizationByPhase: log.gcdUtilizationByPhase,
		scaleDamageToLogUptime: options.scaleSimulatedDamageToLogUptime,
		targetGcdUtilizationPercent: options.targetGcdUtilizationPercent,
	})

	return {
		source: {
			sourceType: payload.sourceType ?? 'fflogs-events',
			reportCode,
			fightId,
			encounterName: fight.name ?? '',
			zoneName: fight.zoneName ?? '',
			territoryId: fight.zoneID,
			sourceLog: reportCode && fightId ? `https://www.fflogs.com/reports/${reportCode}?fight=${fightId}&type=damage-done` : '',
			durationMs,
			lastSecond: Math.round(durationMs / 10) / 100,
			phases: phases.map(phase => ({
				id: phase.id,
				label: phase.label,
				startMs: phase.startMs,
				endMs: phase.endMs,
			})),
		},
		actors,
		selectedActor,
		log,
		simulated,
		deltas: buildDeltas(simulated, log),
		skillRows: buildSkillRows(simulated.skillCounts.byAction, log.skillCounts.byAction),
	}
}

function buildActors(payload, events, fightId, petOwnerIds = new Map()) {
	const rows = new Map()
	for (const actor of payload.friendlies ?? []) {
		if (PLAYER_PETS.has(actor.type) || !actorParticipates(actor, fightId)) {
			continue
		}
		const job = normalizeJob(actor.type)
		rows.set(Number(actor.id), {
			id: Number(actor.id),
			name: actor.name || `Player ${actor.id}`,
			server: actor.server ?? '',
			type: actor.type ?? '',
			job,
			jobName: JOB_NAME_CN.get(job) ?? job,
			icon: actor.icon ?? actor.type ?? job,
			source: 'fflogs-friendlies',
			damage: 0,
			healing: 0,
			casts: 0,
			actionHints: {},
		})
	}
	for (const event of events) {
		if (!event.sourceIsFriendly || !event.sourceID) {
			continue
		}
		const id = petOwnerIds.get(Number(event.sourceID)) ?? Number(event.sourceID)
		if (!rows.has(id)) {
			rows.set(id, {
				id,
				name: event.source?.name || `Actor ${id}`,
				server: '',
				type: '',
				job: '',
				jobName: '',
				icon: '',
				source: 'events',
				damage: 0,
				healing: 0,
				casts: 0,
				actionHints: {},
			})
		}
		const row = rows.get(id)
		if (event.type === 'cast') {
			row.casts += 1
		}
		if (event.type === 'damage') {
			row.damage += eventAmount(event)
		}
		if (event.type === 'heal') {
			row.healing += Number(event.amount ?? 0)
		}
		const hintedJob = ACTION_JOB_HINTS.get(Number(event.ability?.guid ?? 0))
		if (hintedJob) {
			row.actionHints[hintedJob] = (row.actionHints[hintedJob] ?? 0) + 1
		}
	}
	return [...rows.values()]
		.map(actor => {
			if (!actor.job) {
				actor.job = bestActionHint(actor.actionHints) || ''
				actor.jobName = JOB_NAME_CN.get(actor.job) ?? actor.job
			}
			delete actor.actionHints
			return actor
		})
		.filter(actor => actor.job || actor.damage > 0 || actor.healing > 0 || actor.casts > 0)
		.sort((left, right) => right.damage - left.damage || left.id - right.id)
}

function actorParticipates(actor, fightId) {
	if (!fightId || !Array.isArray(actor.fights)) {
		return true
	}
	return actor.fights.some(fight => Number(fight.id) === Number(fightId))
}

function buildPetOwnerIds(payload = {}) {
	const owners = new Map()
	for (const pet of payload.friendlyPets ?? []) {
		const petId = Number(pet.id)
		const ownerId = Number(pet.petOwner ?? pet.ownerID)
		if (Number.isFinite(petId) && Number.isFinite(ownerId) && ownerId > 0) {
			owners.set(petId, ownerId)
		}
	}
	return owners
}

function eventBelongsToActor(event, actorId, petOwnerIds = new Map()) {
	const sourceId = Number(event.sourceID)
	return sourceId === Number(actorId) || petOwnerIds.get(sourceId) === Number(actorId)
}

function normalizeJob(type) {
	return JOB_TYPE_TO_ID.get(String(type ?? '')) ?? String(type ?? '').toUpperCase()
}

function bestActionHint(hints = {}) {
	return Object.entries(hints).sort((left, right) => right[1] - left[1])[0]?.[0] ?? ''
}

function selectActor(actors, currentJob, actorId) {
	if (actorId != null) {
		return actors.find(actor => Number(actor.id) === Number(actorId)) ?? null
	}
	const job = String(currentJob ?? '').toUpperCase()
	return actors.find(actor => actor.job === job)
		?? actors.find(actor => actor.damage > 0)
		?? actors[0]
		?? null
}

function summarizeLogEvents(events, context) {
	const castEvents = normalizeActionEvents(events.filter(event => event.type === 'cast' && Number(event.sourceID) === Number(context.actorId)))
		.filter(event => !isAutoAttack(event))
	const autoAttackEvents = normalizeActionEvents(events.filter(event => event.type === 'damage' && Number(event.sourceID) === Number(context.actorId) && isAutoAttack(event)))
	const actionEvents = [...castEvents, ...autoAttackEvents].sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0))
	const damageEvents = normalizeActionEvents(events.filter(isDamageEvent))
	const healingEvents = normalizeActionEvents(events.filter(isHealingEvent)).filter(event => !isAutoAttack(event))
	const damage = summarizeAmountByPhase(damageEvents, context, eventAmount)
	const healing = summarizeAmountByPhase(healingEvents, context, event => Number(event.amount ?? 0))
	const skillCounts = summarizeSkillCounts(actionEvents)
	const gcdUtilizationByPhase = summarizeGcdUtilizationByPhase(castEvents.filter(isGcdEvent), context)
	return {
		actor: context.actor,
		damage,
		healing,
		skillCounts,
		gcdUtilization: gcdUtilization(skillCounts.gcd, context.fightEnd - context.fightStart),
		gcdUtilizationByPhase,
		events: actionEvents.slice(0, 240).map(event => normalizedEventForUi(event, context)),
	}
}

function summarizeSimulatedEvents(events, options) {
	const rebucketedEvents = events.filter(isSimulatedComparisonEvent).map(event => simulatedEventWithFflogsPhase(event, options.phases))
	const autoAttackEvents = (options.autoAttackEvents ?? []).map(event => simulatedEventWithFflogsPhase(event, options.phases))
	const estimatedDamageEvents = rebucketedEvents.filter(event => event.output)
	const exactDamageEvents = autoAttackEvents.filter(event => event.output && event.exactDamage != null)
	const damageProfile = {
		attackPower: Number(options.attackPower ?? DEFAULT_ATTACK_POWER),
		critRate: Number(options.critRate ?? 0.18),
		directRate: Number(options.directRate ?? 0.28),
		luck: options.luck ?? 'average',
	}
	const damage = estimateDamage(estimatedDamageEvents, damageProfile)
	damage.calibration = options.damageCalibration ?? null
	const skillCounts = summarizeSkillCounts([...rebucketedEvents, ...autoAttackEvents].filter(event => event.actionId || event.name))
	const actualGcdUtilization = gcdUtilization(skillCounts.gcd, options.durationMs || inferredDurationMs(events))
	const adjustedGcdUtilization = adjustedGcdUtilizationForTarget(actualGcdUtilization, options.targetGcdUtilizationPercent)
	const gcdEstimatedDamage = estimateDamage(estimatedDamageEvents.filter(isSimulatedGcd), damageProfile)
	const adjustedDamage = adjustedGcdUtilization.targeted
		? scaleEstimatedDamageToTargetGcdUtilization(damage, gcdEstimatedDamage, adjustedGcdUtilization)
		: options.scaleDamageToLogUptime === true
			? scaleEstimatedDamageToLogUptime(damage, gcdEstimatedDamage, options.logGcdUtilizationByPhase)
			: damage
	const normalizedDamage = mergeEstimatedAndExactDamage(adjustedDamage, exactDamageEvents)
	const healingEvents = rebucketedEvents.filter(event => event.classification === 'healing')
	const healing = {
		total: 0,
		phases: Object.fromEntries([...new Set(healingEvents.map(event => event.phase ?? '全局'))].map(phase => [phase, {damage: 0, events: healingEvents.filter(event => (event.phase ?? '全局') === phase).length}])),
	}
	const actionEvents = [...rebucketedEvents, ...autoAttackEvents].filter(event => event.actionId || event.name)
	return {
		damage: normalizedDamage,
		healing,
		skillCounts,
		gcdUtilization: adjustedGcdUtilization,
		events: actionEvents.slice(0, 240).map(event => ({
			timeMs: Number(event.timeMs ?? 0),
			actionId: Number(event.actionId ?? 0),
			actionName: event.name ?? '',
			type: isSimulatedGcd(event) ? 'gcd' : 'ability',
			phase: event.phase ?? '全局',
		})),
	}
}

function adjustedGcdUtilizationForTarget(actual, targetPercent) {
	const target = Number(targetPercent)
	if (!Number.isFinite(target)) {
		return actual
	}
	const percent = Math.min(100, Math.max(0, target))
	const actualPercent = Number(actual.percent ?? 0)
	return {
		...actual,
		actualPercent,
		percent,
		targeted: true,
		scale: gcdUtilizationScale(percent, actualPercent),
	}
}

function buildMirroredAutoAttackEvents(events, context) {
	return normalizeActionEvents(events.filter(event => event.type === 'damage' && isAutoAttack(event)))
		.map((event, index) => ({
			id: `fflogs-auto-${index + 1}`,
			timeMs: Number(event.timestamp ?? 0) - Number(context.fightStart ?? 0),
			actionId: Number(event.ability?.guid ?? 7),
			name: event.ability?.name ?? 'Attack',
			output: true,
			exactDamage: eventAmount(event),
			count: 1,
			weave: 'auto',
			skillType: 'Auto',
			classification: 'damage',
		}))
}

function mergeEstimatedAndExactDamage(estimated, exactEvents = []) {
	const result = {
		total: estimated.total,
		unadjustedTotal: estimated.unadjustedTotal,
		adjustment: estimated.adjustment,
		calibration: estimated.calibration,
		phases: Object.fromEntries(Object.entries(estimated.phases).map(([phase, data]) => [phase, {
			damage: data.damage,
			unadjustedDamage: data.unadjustedDamage,
			adjustmentScale: data.adjustmentScale,
			events: data.events,
		}])),
	}
	for (const event of exactEvents) {
		const phase = event.phase ?? '鍏ㄥ眬'
		result.phases[phase] ??= {damage: 0, events: 0}
		const damage = Math.max(0, Math.round(Number(event.exactDamage ?? 0)))
		result.phases[phase].damage += damage
		if (result.phases[phase].unadjustedDamage != null) {
			result.phases[phase].unadjustedDamage += damage
		}
		result.phases[phase].events += Number(event.count ?? 1)
		result.total += damage
		if (result.unadjustedTotal != null) {
			result.unadjustedTotal += damage
		}
	}
	return result
}

function scaleEstimatedDamageToLogUptime(estimated, gcdEstimated, utilizationByPhase = {}) {
	const result = {
		total: 0,
		unadjustedTotal: estimated.total,
		calibration: estimated.calibration,
		adjustment: {
			type: 'log-gcd-utilization',
			scales: {},
		},
		phases: {},
	}
	for (const [phase, data] of Object.entries(estimated.phases ?? {})) {
		const scale = damageScaleForPhase(phase, utilizationByPhase)
		const unadjustedDamage = Math.max(0, Math.round(Number(data.damage ?? 0)))
		const unadjustedGcdDamage = Math.max(0, Math.round(Number(gcdEstimated.phases?.[phase]?.damage ?? 0)))
		const unadjustedNonGcdDamage = Math.max(0, unadjustedDamage - unadjustedGcdDamage)
		const damage = Math.round(unadjustedGcdDamage * scale) + unadjustedNonGcdDamage
		result.adjustment.scales[phase] = scale
		result.phases[phase] = {
			damage,
			unadjustedDamage,
			unadjustedGcdDamage,
			unadjustedNonGcdDamage,
			adjustmentScale: scale,
			events: data.events,
		}
		result.total += damage
	}
	return result
}

function scaleEstimatedDamageToTargetGcdUtilization(estimated, gcdEstimated, utilization = {}) {
	const scale = Number(utilization.scale ?? 1)
	const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 1
	const result = {
		total: 0,
		unadjustedTotal: estimated.total,
		calibration: estimated.calibration,
		adjustment: {
			type: 'target-gcd-utilization',
			targetPercent: utilization.percent,
			actualPercent: utilization.actualPercent,
			scales: {},
		},
		phases: {},
	}
	for (const [phase, data] of Object.entries(estimated.phases ?? {})) {
		const unadjustedDamage = Math.max(0, Math.round(Number(data.damage ?? 0)))
		const unadjustedGcdDamage = Math.max(0, Math.round(Number(gcdEstimated.phases?.[phase]?.damage ?? 0)))
		const unadjustedNonGcdDamage = Math.max(0, unadjustedDamage - unadjustedGcdDamage)
		const damage = Math.round(unadjustedGcdDamage * safeScale) + unadjustedNonGcdDamage
		result.adjustment.scales[phase] = Math.round(safeScale * 10000) / 10000
		result.phases[phase] = {
			damage,
			unadjustedDamage,
			unadjustedGcdDamage,
			unadjustedNonGcdDamage,
			adjustmentScale: safeScale,
			events: data.events,
		}
		result.total += damage
	}
	return result
}

function gcdUtilizationScale(targetPercent, actualPercent) {
	const actual = Number(actualPercent)
	const target = Number(targetPercent)
	if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(target)) {
		return 1
	}
	return target / actual
}

function calibrateDamageFromLogEvents(events = [], options = {}) {
	const rows = normalizeActionEvents(events.filter(isDamageEvent))
	let damage = 0
	let potency = 0
	let hits = 0
	let critHits = 0
	let directHits = 0
	let critDirectHits = 0
	let buffedHits = 0
	let bonusHits = 0
	for (const event of rows) {
		const actionId = Number(event.ability?.guid ?? event.actionId ?? 0)
		if (isAutoAttack(event)) {
			continue
		}
		const actionPotency = damagePotencyForAction(actionId)
		if (!actionPotency) {
			continue
		}
		const amount = eventAmount(event)
		const isCritical = isCriticalDamageEvent(event)
		const isDirect = isDirectDamageEvent(event)
		damage += amount
		potency += actionPotency
		hits += 1
		if (isCritical) {
			critHits += 1
		}
		if (isDirect) {
			directHits += 1
		}
		if (isCritical && isDirect) {
			critDirectHits += 1
		}
		if (hasDamageBuff(event)) {
			buffedHits += 1
		}
		if (Number(event.bonusPercent ?? 0)) {
			bonusHits += 1
		}
	}
	if (hits < MIN_CALIBRATION_HITS || potency <= 0) {
		return null
	}
	const profileMultiplier = estimateDamageProfileMultiplier(options)
	const attackPower = damage / Math.max(1, potency * profileMultiplier)
	return {
		type: 'fflogs-effective-attack-power',
		attackPower,
		defaultAttackPower: DEFAULT_ATTACK_POWER,
		sampleHits: hits,
		sampleDamage: Math.round(damage),
		samplePotency: potency,
		profileMultiplier,
		critHits,
		directHits,
		critDirectHits,
		buffedHits,
		bonusHits,
		critRate: Math.round((critHits / hits) * 1000) / 10,
		directRate: Math.round((directHits / hits) * 1000) / 10,
		buffedRate: Math.round((buffedHits / hits) * 1000) / 10,
	}
}

function damagePotencyForAction(actionId) {
	const alias = DAMAGE_POTENCY_ALIASES.get(Number(actionId))
	if (alias) {
		return alias
	}
	return Number(DEFAULT_SKILL_DATABASE.actionsById?.[String(actionId)]?.potency ?? DEFAULT_SKILL_DATABASE.actionsById?.[Number(actionId)]?.potency ?? 0)
}

function damageHitMultiplier(event) {
	const isCritical = isCriticalDamageEvent(event)
	const isDirect = isDirectDamageEvent(event)
	return (isCritical ? 1.45 : 1) * (isDirect ? 1.25 : 1)
}

function isCriticalDamageEvent(event) {
	return Number(event.hitType ?? 0) === 2
}

function isDirectDamageEvent(event) {
	return Boolean(event.directHit)
}

function hasDamageBuff(event) {
	const buffs = event.buffs
	if (Array.isArray(buffs)) {
		return buffs.length > 0
	}
	return String(buffs ?? '').trim().length > 0
}

function estimateDamageProfileMultiplier(options = {}) {
	const critRate = Math.min(1, Math.max(0, Number(options.critRate ?? 0.18)))
	const directRate = Math.min(1, Math.max(0, Number(options.directRate ?? 0.28)))
	const luckBonus = options.luck === 'lucky' ? 0.22 : options.luck === 'low' ? -0.12 : 0
	return (1 + critRate * 0.45) * (1 + directRate * 0.25) * (1 + luckBonus)
}

function damageScaleForPhase(phase, utilizationByPhase = {}) {
	const percent = Number(utilizationByPhase?.[phase]?.percent ?? 100)
	if (!Number.isFinite(percent)) {
		return 1
	}
	return Math.min(1, Math.max(0, percent / 100))
}

function simulatedEventWithFflogsPhase(event, phases = []) {
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	const phase = phaseForRelativeMs(timeMs, phases)
	return {
		...event,
		phase: phase?.label ?? event.phase ?? '鍏ㄥ眬',
		phaseStartMs: phase?.startMs ?? event.phaseStartMs,
	}
}

function normalizeActionEvents(events) {
	const hasDamageRows = events.some(event => event.type === 'damage')
	const hasHealRows = events.some(event => event.type === 'heal')
	const rows = new Map()
	for (const event of events) {
		if (event.type === 'calculateddamage' && hasDamageRows) {
			continue
		}
		if (event.type === 'calculatedheal' && hasHealRows) {
			continue
		}
		const key = event.packetID != null
			? `${event.type}:${event.packetID}:${event.sourceID}:${event.targetID ?? ''}:${event.ability?.guid ?? ''}`
			: `${event.type}:${event.timestamp}:${event.sourceID}:${event.targetID ?? ''}:${event.ability?.guid ?? ''}`
		if (!rows.has(key)) {
			rows.set(key, event)
		}
	}
	return [...rows.values()].sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0))
}

function summarizeAmountByPhase(events, context, amountSelector) {
	const result = {total: 0, phases: {}}
	for (const event of events) {
		const amount = Math.max(0, Math.round(Number(amountSelector(event) ?? 0)))
		const phase = phaseForTimestamp(event.timestamp, context.phases, context.fightStart)
		result.total += amount
		result.phases[phase] ??= {damage: 0, events: 0}
		result.phases[phase].damage += amount
		result.phases[phase].events += 1
	}
	return result
}

function summarizeGcdUtilizationByPhase(events, context) {
	const result = {}
	for (const phase of context.phases ?? []) {
		result[phase.label] = {
			percent: 0,
			gcdCount: 0,
			expectedGcds: expectedGcdsForDuration(Number(phase.endMs ?? 0) - Number(phase.startMs ?? 0)),
			gcdMs: DEFAULT_GCD_MS,
		}
	}
	for (const event of events) {
		const phase = phaseForTimestamp(event.timestamp, context.phases, context.fightStart)
		result[phase] ??= {
			percent: 0,
			gcdCount: 0,
			expectedGcds: 0,
			gcdMs: DEFAULT_GCD_MS,
		}
		result[phase].gcdCount += skillUseCount(event)
	}
	for (const row of Object.values(result)) {
		row.percent = row.expectedGcds ? Math.min(100, Math.round((row.gcdCount / row.expectedGcds) * 1000) / 10) : 0
	}
	return result
}

function summarizeSkillCounts(events) {
	const byAction = new Map()
	let total = 0
	let actions = 0
	let auto = 0
	let gcd = 0
	let ogcd = 0
	let healing = 0
	for (const event of events) {
		const actionId = Number(event.ability?.guid ?? event.actionId ?? 0)
		const actionName = event.ability?.name ?? event.name ?? `技能 ${actionId}`
		const isHealing = isHealingEvent(event) || event.classification === 'healing'
		const isGcd = isGcdEvent(event) || isSimulatedGcd(event)
		const isAuto = isAutoAttack(event)
		const count = skillUseCount(event)
		const key = actionId || actionName
		if (!byAction.has(key)) {
			byAction.set(key, {
				actionId,
				actionName,
				total: 0,
				auto: 0,
				gcd: 0,
				ogcd: 0,
				healing: 0,
			})
		}
		const row = byAction.get(key)
		row.total += count
		if (isAuto) {
			row.auto += count
			auto += count
		} else if (isGcd) {
			row.gcd += count
			gcd += count
		} else {
			row.ogcd += count
			ogcd += count
		}
		if (isHealing) {
			row.healing += count
			healing += count
		}
		if (!isAuto) {
			actions += count
		}
		total += count
	}
	return {
		total,
		actions,
		auto,
		gcd,
		ogcd,
		healing,
		unique: byAction.size,
		byAction: [...byAction.values()].sort((left, right) => right.total - left.total || left.actionName.localeCompare(right.actionName)),
	}
}

function buildDeltas(simulated, log) {
	return {
		damage: {
			total: simulated.damage.total - log.damage.total,
			percent: percentDelta(simulated.damage.total, log.damage.total),
		},
		skillCounts: {
			total: simulated.skillCounts.total - log.skillCounts.total,
			actions: simulated.skillCounts.actions - log.skillCounts.actions,
			auto: simulated.skillCounts.auto - log.skillCounts.auto,
			gcd: simulated.skillCounts.gcd - log.skillCounts.gcd,
			ogcd: simulated.skillCounts.ogcd - log.skillCounts.ogcd,
		},
		gcdUtilization: {
			points: simulated.gcdUtilization.percent - log.gcdUtilization.percent,
		},
		healing: {
			total: simulated.healing.total - log.healing.total,
			percent: percentDelta(simulated.healing.total, log.healing.total),
		},
	}
}

function buildSkillRows(simRows = [], logRows = []) {
	const rows = new Map()
	for (const row of simRows) {
		const key = row.actionId || row.actionName
		rows.set(key, {
			actionId: row.actionId,
			actionName: row.actionName,
			simulatedCount: row.total,
			logCount: 0,
			delta: row.total,
		})
	}
	for (const row of logRows) {
		const key = row.actionId || row.actionName
		const existing = rows.get(key) ?? {
			actionId: row.actionId,
			actionName: row.actionName,
			simulatedCount: 0,
			logCount: 0,
			delta: 0,
		}
		existing.logCount = row.total
		existing.delta = existing.simulatedCount - existing.logCount
		rows.set(key, existing)
	}
	return [...rows.values()]
		.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || (right.logCount + right.simulatedCount) - (left.logCount + left.simulatedCount))
		.slice(0, 80)
}

function buildPhaseWindows(fight = {}, fightStart = 0, fightEnd = fightStart) {
	const starts = (fight.phases ?? []).map((phase, index) => ({
		id: `P${phase.id ?? index + 1}`,
		label: `P${phase.id ?? index + 1}`,
		startMs: Math.max(0, Number(phase.startTime ?? fightStart) - fightStart),
	})).sort((left, right) => left.startMs - right.startMs)
	if (!starts.length) {
		starts.push({id: 'P1', label: 'P1', startMs: 0})
	}
	const durationMs = Math.max(0, fightEnd - fightStart)
	return starts.map((phase, index) => ({
		...phase,
		endMs: starts[index + 1]?.startMs ?? durationMs,
	}))
}

function phaseForTimestamp(timestamp, phases, fightStart = 0) {
	const relativeMs = Number(timestamp ?? 0) - Number(fightStart ?? 0)
	return phaseForRelativeMs(relativeMs, phases)?.label ?? 'P1'
}

function phaseForRelativeMs(relativeMs, phases) {
	let current = phases[0]
	for (const phase of phases) {
		if (relativeMs >= phase.startMs) {
			current = phase
		}
	}
	return current ?? null
}

function normalizedEventForUi(event, context) {
	return {
		timeMs: Number(event.timestamp ?? 0) - context.fightStart,
		actionId: Number(event.ability?.guid ?? 0),
		actionName: event.ability?.name ?? '',
		type: isHealingEvent(event) ? 'healing' : isDamageEvent(event) ? 'damage' : isGcdEvent(event) ? 'gcd' : 'ability',
		amount: isHealingEvent(event) ? Number(event.amount ?? 0) : isDamageEvent(event) ? eventAmount(event) : 0,
		phase: phaseForTimestamp(event.timestamp, context.phases, context.fightStart),
	}
}

function gcdUtilization(gcdCount, durationMs) {
	const duration = Math.max(0, Number(durationMs ?? 0))
	const expected = expectedGcdsForDuration(duration)
	const percent = expected ? Math.min(100, Math.round((gcdCount / expected) * 1000) / 10) : 0
	return {percent, gcdCount, expectedGcds: expected, gcdMs: DEFAULT_GCD_MS}
}

function expectedGcdsForDuration(durationMs) {
	const duration = Math.max(0, Number(durationMs ?? 0))
	return duration > 0 ? Math.max(1, Math.floor(duration / DEFAULT_GCD_MS)) : 0
}

function isDamageEvent(event) {
	return event.type === 'damage' || event.type === 'calculateddamage'
}

function isHealingEvent(event) {
	return event.type === 'heal' || event.type === 'calculatedheal'
}

function eventAmount(event) {
	return Number(event.amount ?? 0) + Number(event.overkill ?? 0)
}

function isGcdEvent(event) {
	const actionId = Number(event.ability?.guid ?? event.actionId ?? 0)
	const abilityType = Number(event.ability?.type ?? 0)
	return event.type === 'cast' && KNOWN_GCD_ACTION_IDS.has(actionId) && Boolean(abilityType & GCD_ACTION_TYPE_MASK)
}

function isAutoAttack(event) {
	return AUTO_ATTACK_IDS.has(Number(event.ability?.guid ?? event.actionId ?? 0))
}

function isSimulatedGcd(event) {
	return String(event.weave ?? event.skillType ?? '').toLowerCase() === 'gcd'
}

function isSimulatedComparisonEvent(event = {}) {
	if (!event || event.type === 'burst-package' || event.kind === 'boss-cast') {
		return false
	}
	if (event.kind === 'qt-control' || event.type === 'qt' || event.classification === 'qt') {
		return false
	}
	const actionId = Number(event.actionId ?? 0)
	if (Number.isFinite(actionId) && actionId > 0) {
		return true
	}
	return Boolean(
		event.output
		|| event.classification === 'damage'
		|| event.classification === 'output'
		|| event.classification === 'mitigation'
		|| event.classification === 'healing'
		|| event.classification === 'potion'
		|| event.kind === 'potion'
	)
}

function skillUseCount(event) {
	const count = Number(event.count ?? 1)
	return Number.isFinite(count) && count > 0 ? count : 1
}

function percentDelta(left, right) {
	return right ? Math.round(((left - right) / right) * 1000) / 10 : 0
}

function inferredDurationMs(events) {
	return Math.max(0, ...events.map(event => Number(event.timeMs ?? event.startMs ?? 0))) || 0
}

function minEventTimestamp(events = []) {
	return Math.min(...events.map(event => Number(event.timestamp ?? Infinity)))
}

function maxEventTimestamp(events = []) {
	return Math.max(...events.map(event => Number(event.timestamp ?? 0)))
}
