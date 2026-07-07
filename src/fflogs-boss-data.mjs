import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {splitBossRowsBySourceName} from './boss-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')
const DEFAULT_REPORT_CODE = 'VZRFDK4gcGaHWYXJ'
const DEFAULT_FIGHT_ID = 11
const AUTO_ATTACK_ACTION_IDS = new Set([49744, 49746])
const IGNORED_VISUAL_ACTION_IDS = new Set([49539, 50516, 50517])
const DAMAGE_MATCH_EARLY_MS = 150
const DAMAGE_MATCH_LATE_MS = 1800
const VISUAL_GROUP_BUCKET_MS = 1000
const SOURCE_LABELS = new Map([
	['Kefka', '凯夫卡'],
	['Chaos', '卡奥斯'],
	['Exdeath', '艾克斯迪司'],
	['Neo Exdeath', '新生艾克斯迪司'],
	['Graven Image', '众神之像'],
	['black hole', '黑洞'],
])

const ACTION_LABELS = new Map([
	[49746, '攻击'],
	[49744, '攻击'],
	[50179, '恶狠狠毁荡'],
	[50401, '恶狠狠毁荡'],
	[50173, '增强型战栗 II'],
	[48370, '众神之像'],
	[47764, '玄乎乎魔法'],
	[47768, '扩大大冰封'],
	[47765, '扩大大冰封'],
	[47774, '扩大大冰封'],
	[47771, '扩大大冰封'],
	[47778, '呼啦啦爆炎'],
	[47782, '连环环陷阱'],
	[47783, '连环环陷阱'],
	[47784, '波动炮'],
	[47785, '波动弹'],
	[47786, '爆炸'],
	[47787, '大爆炸'],
	[47775, '劈啪啪暴雷'],
	[47777, '劈啪啪暴雷'],
	[47776, '劈啪啪暴雷'],
	[50722, '制裁之光'],
	[49739, '超驱动'],
	[47788, '重力弹'],
	[47792, '岩石弹'],
	[47793, '重力波'],
	[47791, '强重力'],
	[47801, '唰啦啦传送'],
	[47802, '唰啦啦传送'],
	[50516, '未知技能 C554'],
	[47797, '圣母的神气'],
	[47798, '睡魔的神气'],
	[50517, '未知技能 C555'],
	[47795, '圣母颂'],
	[49740, '终末双腕'],
	[47804, '遗弃末世'],
	[47806, '光之波动'],
	[47808, '咏唱危机·驱动'],
	[47809, '咏唱危机·散碎'],
	[47810, '咏唱危机·波动'],
	[47826, '未来终结'],
	[47832, '未来终结'],
	[47830, '未来终结'],
	[47836, '消灭之脚'],
	[47827, '过去终结'],
	[47833, '过去终结'],
	[47831, '过去终结'],
	[47837, '消灭之脚'],
	[47805, '制裁之光'],
	[47839, '异三角'],
	[47840, '异三角'],
	[47822, '破坏之翼'],
	[50311, '破坏之翼'],
	[47823, '破坏之翼'],
	[50167, '疼飕飕暴风'],
	[47842, '疯狂的定义'],
	[49890, '决战'],
	[49891, '决战'],
	[47858, '深层痛楚'],
	[47890, '暴雷'],
	[47881, '暴雷'],
	[47884, '暴雷'],
	[47862, '混沌之水'],
	[47861, '海啸'],
	[49878, '幻化'],
	[47870, '纬度聚爆'],
	[47871, '冲击波'],
	[47859, '混沌之炎'],
	[47860, '烈焰'],
	[47872, '本影爆碎'],
	[47891, '真空波'],
	[47843, '究极冲击波'],
	[47844, '究极冲击波'],
	[47846, '响亮亮耳光'],
	[47849, '响亮亮耳光'],
	[47850, '重冲击'],
	[47854, '本色出演的我'],
	[47856, '轰隆隆跺脚'],
	[47864, '龙卷风'],
	[47866, '地震'],
	[47868, '无之波动'],
	[47873, '诅咒敕令'],
	[47875, '轰击'],
	[47877, '顶起'],
	[49892, '以太连接'],
	[49893, '以太连接'],
	[47845, '放大'],
	[50545, '地震'],
	[50546, '地震'],
	[47866, '地震'],
	[47885, '冰封'],
	[47892, '大十字'],
	[47895, '死亡尖叫'],
	[47897, '死亡落雷'],
	[47898, '死亡波纹'],
	[47899, '死亡波纹'],
	[47906, '混沌之炎'],
	[47907, '混沌之炎'],
	[47908, '混沌之水'],
	[47900, '死亡波涛'],
	[47901, '死亡波涛'],
	[47925, '遗弃末世'],
	[47926, '遗弃末世'],
	[47927, '遗弃末地'],
	[47928, '遗弃末世'],
	[47929, '遗弃末狱'],
	[47930, '遗弃末点'],
	[47931, '混沌末世'],
	[47932, '混沌末世'],
	[47934, '混沌涡旋'],
	[47935, '混沌涡旋'],
	[47936, '连续究极'],
	[47937, '连续究极'],
	[47938, '三星'],
	[47939, '爆炎'],
	[47940, '冰封'],
	[47941, '暴雷'],
	[47951, '混沌洪水'],
	[47952, '大十字'],
	[47954, '核爆'],
	[47955, '混沌核爆'],
	[47956, '神圣'],
	[47957, '核爆扩散'],
	[47958, '混沌神圣'],
	[49471, '洪水'],
	[49738, '扑腾腾究极'],
	[49743, '二选一的灾祟'],
	[49769, '洪水'],
	[50771, '魔击'],
	[50772, '魔击'],
	[50773, '魔击'],
])

export async function loadDefaultFflogsBossTimelineData(options = {}) {
	if (typeof options === 'string') {
		return buildBossTimelineFromFflogs(options)
	}
	return buildBossTimelineFromFflogsV1({
		fightsPath: 'data/fflogs-v1/VZRFDK4gcGaHWYXJ-fights.json',
		castsPath: 'data/fflogs-v1/VZRFDK4gcGaHWYXJ-fight-11-casts-hostile.json',
		damagePath: 'data/fflogs-v1/VZRFDK4gcGaHWYXJ-fight-11-damage-done-hostile.json',
		reportCode: DEFAULT_REPORT_CODE,
		fightId: DEFAULT_FIGHT_ID,
		...options,
	})
}

export async function buildBossTimelineFromFflogsV1({
	fightsPath,
	castsPath,
	damagePath,
	reportCode = DEFAULT_REPORT_CODE,
	fightId = DEFAULT_FIGHT_ID,
} = {}) {
	const fightsPayload = await readJson(resolveProjectPath(fightsPath))
	const castsPayload = await readJson(resolveProjectPath(castsPath))
	const damagePayload = await readJson(resolveProjectPath(damagePath))
	const fight = fightsPayload.fights.find(item => item.id === fightId)
	if (!fight) {
		throw new Error(`FFLogs fight ${fightId} not found in ${fightsPath}`)
	}
	const actorMap = new Map([
		...(fightsPayload.enemies ?? []),
		...(fightsPayload.enemyPets ?? []),
	].map(actor => [actor.id, actor]))
	const fightStart = Number(fight.start_time)
	const fightEnd = Number(fight.end_time)
	const castEvents = (castsPayload.events ?? []).filter(event => event.fight === fightId)
	const damageEvents = normalizedDamageEvents((damagePayload.events ?? []).filter(event => event.fight === fightId))
	const beginGroups = groupVisualEvents(castEvents
		.filter(event => event.type === 'begincast')
		.filter(event => !isIgnoredVisualAction(event))
		.filter(event => !isAutoAttack(event)), fightStart, actorMap)
	const releaseGroups = groupVisualEvents(castEvents
		.filter(event => event.type === 'cast')
		.filter(event => !isIgnoredVisualAction(event))
		.filter(event => !isAutoAttack(event)), fightStart, actorMap)
	const damageLookup = buildDamageLookup(damageEvents, actorMap)
	const casts = beginGroups.map((group, index) => toV1BeginCastItem(group, index, fightStart, actorMap))
		.sort(byStart)
	const releases = releaseGroups
		.map((group, index) => toV1ReleaseItem(group, index, fightStart, actorMap, damageLookup))
		.filter(item => item.damage > 0)
		.sort(byStart)

	return {
		source: {
			sourceType: 'fflogs-v1',
			encounterName: fight.name,
			territoryId: fight.zoneID,
			reportCode,
			fightId,
			sourceLog: `https://www.fflogs.com/reports/${reportCode}?fight=${fightId}&type=damage-done`,
			pullStart: String(fightStart),
			pullEnd: String(fightEnd),
			generatedAt: new Date().toISOString(),
			castCount: castEvents.filter(event => event.type === 'begincast').length,
			abilityCount: releases.reduce((sum, item) => sum + item.eventCount, 0),
			visualCastCount: casts.length,
			visualAbilityCount: releases.length,
			actionCount: new Set([...casts, ...releases].map(item => item.actionId)).size,
			damageAbilityCount: releases.filter(item => item.damage > 0).length,
			firstSecond: 0,
			lastSecond: Math.round((fightEnd - fightStart) / 10) / 100,
			phases: fight.phases?.map(phase => ({
				id: phase.id,
				startSecond: Math.round((phase.startTime - fightStart) / 10) / 100,
			})) ?? [],
		},
		rows: [
			{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: casts},
			{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: releases},
		],
		splitRows: splitBossRowsBySourceName([
			{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: casts},
			{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: releases},
		]),
		topDamageActions: topDamageActions(releases),
	}
}

export async function buildBossTimelineFromFflogs(relativeOrAbsolutePath) {
	const filePath = path.isAbsolute(relativeOrAbsolutePath)
		? relativeOrAbsolutePath
		: path.resolve(projectDir, relativeOrAbsolutePath)
	const payload = JSON.parse(await readFile(filePath, 'utf8'))
	const enemyMap = new Map(payload.enemies.map(actor => [actor.id, actor]))
	const fightStart = Number(payload.fight.start_time)
	const fightEnd = Number(payload.fight.end_time)

	const casts = payload.events
		.filter(event => event.type === 'begincast' && enemyMap.has(event.sourceID))
		.filter(event => !isIgnoredVisualAction(event))
		.map((event, index) => toCastItem(event, index, payload, enemyMap))
		.sort(byStart)
	const damage = coalesceDamagePackets(
		payload.events.filter(event => event.type === 'calculateddamage' && enemyMap.has(event.sourceID)),
		payload,
		enemyMap,
	)

	return {
		source: {
			sourceType: 'fflogs',
			encounterName: payload.fight.name,
			territoryId: payload.fight.zoneID,
			reportCode: payload.reportCode,
			fightId: payload.fightId,
			actorId: payload.actorId,
			sourceLog: `https://xivanalysis.com/fflogs/${payload.reportCode}/${payload.fightId}/${payload.actorId}`,
			pullStart: String(fightStart),
			pullEnd: String(fightEnd),
			generatedAt: new Date().toISOString(),
			castCount: casts.length,
			abilityCount: damage.reduce((sum, item) => sum + item.eventCount, 0),
			visualCastCount: casts.length,
			visualAbilityCount: damage.length,
			actionCount: new Set([...casts, ...damage].map(item => item.actionId)).size,
			damageAbilityCount: damage.filter(item => item.damage > 0).length,
			firstSecond: 0,
			lastSecond: Math.round((fightEnd - fightStart) / 10) / 100,
			phases: payload.fight.phases?.map(phase => ({
				id: phase.id,
				startSecond: Math.round((phase.startTime - fightStart) / 10) / 100,
			})) ?? [],
		},
		rows: [
			{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: casts},
			{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: damage},
		],
		splitRows: splitBossRowsBySourceName([
			{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: casts},
			{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: damage},
		]),
		topDamageActions: topDamageActions(damage),
	}
}

function coalesceDamagePackets(events, payload, enemyMap) {
	const groups = new Map()
	for (const event of events) {
		const key = event.packetID != null
			? `packet:${event.packetID}:${event.ability?.guid ?? ''}:${event.sourceID}:${event.sourceInstance ?? ''}`
			: `event:${event.timestamp}:${event.ability?.guid ?? ''}:${event.sourceID}:${event.sourceInstance ?? ''}:${event.targetID ?? ''}:${event.targetInstance ?? ''}`
		if (!groups.has(key)) {
			groups.set(key, [])
		}
		groups.get(key).push(event)
	}

	return [...groups.values()]
		.map((group, index) => toDamageItem(group, index, payload, enemyMap))
		.sort(byStart)
}

function toCastItem(event, index, payload, enemyMap) {
	const startMs = relativeMs(event.timestamp, payload.fight.start_time)
	const matchingCast = findMatchingCast(event, payload.events)
	const endMs = matchingCast
		? relativeMs(matchingCast.timestamp, payload.fight.start_time)
		: startMs + 4700
	return {
		id: `fflogs-cast-${index}-${event.sourceID}-${event.sourceInstance ?? 0}-${event.ability?.guid}`,
		type: 'cast',
		label: actionLabel(event),
		startMs,
		endMs: Math.max(startMs + 500, endMs),
		timeLabel: formatClock(startMs),
		damage: 0,
		actionId: Number(event.ability?.guid ?? 0),
		actionName: actionLabel(event),
		sourceName: sourceName(event, enemyMap),
		sourceId: sourceId(event),
		targetName: targetName(event),
		targetId: targetId(event),
	}
}

function toDamageItem(group, index, payload, enemyMap) {
	const first = group[0]
	const startMs = relativeMs(first.timestamp, payload.fight.start_time)
	const damage = group.reduce((sum, event) => sum + Number(event.amount ?? 0) + Number(event.overkill ?? 0), 0)
	const targetNames = [...new Set(group.map(targetName).filter(Boolean))]
	const sourceIds = [...new Set(group.map(sourceId).filter(Boolean))]
	const countSuffix = group.length > 1 ? ` x${group.length}` : ''
	const baseLabel = actionLabel(first)
	const label = damage > 0 ? `${damage} ${baseLabel}${countSuffix}` : `${baseLabel}${countSuffix}`
	return {
		id: `fflogs-damage-${index}-${first.packetID ?? first.timestamp}-${first.sourceID}-${first.sourceInstance ?? 0}-${first.ability?.guid}`,
		type: 'damage',
		label,
		startMs,
		endMs: startMs + Math.min(2400, 700 + group.length * 180),
		timeLabel: formatClock(startMs),
		damage,
		actionId: Number(first.ability?.guid ?? 0),
		actionName: baseLabel,
		packetId: first.packetID ?? null,
		sourceName: sourceName(first, enemyMap),
		sourceId: sourceId(first),
		sourceIds,
		sourceCount: sourceIds.length,
		targetName: targetNames[0] ?? '',
		targetId: targetId(first),
		targetNames,
		targetCount: targetNames.length || group.length,
		eventCount: group.length,
	}
}

function findMatchingCast(beginCast, events) {
	return events.find(event =>
		event.type === 'cast'
		&& event.timestamp >= beginCast.timestamp
		&& event.sourceID === beginCast.sourceID
		&& (event.sourceInstance ?? 0) === (beginCast.sourceInstance ?? 0)
		&& event.ability?.guid === beginCast.ability?.guid
	)
}

function topDamageActions(items) {
	const rows = new Map()
	for (const item of items) {
		const key = `${item.sourceName}|${item.actionId}|${item.actionName}`
		if (!rows.has(key)) {
			rows.set(key, {
				sourceName: item.sourceName,
				actionName: item.actionName,
				actionId: item.actionId,
				actionIdHex: item.actionId.toString(16).toUpperCase(),
				castCount: 0,
				releaseCount: 0,
				damageCandidateSum: 0,
				damageCandidateMax: 0,
			})
		}
		const row = rows.get(key)
		row.releaseCount += item.eventCount ?? 1
		row.damageCandidateSum += item.damage
		row.damageCandidateMax = Math.max(row.damageCandidateMax, item.damage)
	}
	return [...rows.values()]
		.sort((left, right) => right.damageCandidateSum - left.damageCandidateSum)
		.slice(0, 16)
}

function toV1BeginCastItem(group, index, fightStart, actorMap) {
	const first = group[0]
	const startMs = relativeMs(first.timestamp, fightStart)
	const durationMs = Math.max(...group.map(event => Number(event.duration ?? 0)).filter(Number.isFinite), 0)
	return {
		id: `fflogs-v1-cast-${index}-${first.sourceID}-${first.sourceInstance ?? 0}-${first.ability?.guid}`,
		type: 'cast',
		label: actionLabel(first),
		startMs,
		endMs: startMs + Math.max(500, durationMs || 4700),
		timeLabel: formatClock(startMs),
		damage: 0,
		actionId: Number(first.ability?.guid ?? 0),
		actionName: actionLabel(first),
		sourceName: sourceName(first, actorMap),
		sourceId: sourceId(first),
		sourceIds: uniqueValues(group, sourceId),
		sourceCount: uniqueValues(group, sourceId).length,
		targetName: targetName(first, actorMap),
		targetId: targetId(first),
		targetNames: uniqueValues(group, event => targetName(event, actorMap)),
		targetCount: uniqueValues(group, targetId).length || group.length,
		eventCount: group.length,
		sourceEventType: 'begincast',
	}
}

function toV1ReleaseItem(group, index, fightStart, actorMap, damageLookup) {
	const first = group[0]
	const startMs = relativeMs(first.timestamp, fightStart)
	const damagePackets = matchingDamagePackets(group, damageLookup, actorMap)
	const damage = damagePackets.reduce((sum, packet) => sum + packet.damage, 0)
	const eventCount = Math.max(group.length, damagePackets.reduce((sum, packet) => sum + packet.eventCount, 0))
	const sourceIds = uniqueValues(group, sourceId)
	const targetNames = uniqueValues(damagePackets, packet => packet.targetName).filter(Boolean)
	const baseLabel = actionLabel(first)
	return {
		id: `fflogs-v1-release-${index}-${first.sourceID}-${first.sourceInstance ?? 0}-${first.ability?.guid}-${Math.round(startMs / VISUAL_GROUP_BUCKET_MS)}`,
		type: 'damage',
		label: damage > 0 ? `${damage} ${baseLabel}` : baseLabel,
		startMs,
		endMs: startMs + Math.min(2400, 700 + eventCount * 120),
		timeLabel: formatClock(startMs),
		damage,
		actionId: Number(first.ability?.guid ?? 0),
		actionName: baseLabel,
		packetId: damagePackets[0]?.packetId ?? first.packetID ?? null,
		packetIds: damagePackets.map(packet => packet.packetId).filter(Boolean),
		sourceName: sourceName(first, actorMap),
		sourceId: sourceId(first),
		sourceIds,
		sourceCount: sourceIds.length,
		targetName: targetNames[0] ?? targetName(first, actorMap),
		targetId: targetId(first),
		targetNames,
		targetCount: targetNames.length || eventCount,
		eventCount,
		sourceEventType: 'cast-release',
	}
}

function normalizedDamageEvents(events) {
	const groups = new Map()
	for (const event of events.filter(item => !isAutoAttack(item))) {
		const key = damagePacketKey(event)
		if (!groups.has(key)) {
			groups.set(key, [])
		}
		groups.get(key).push(event)
	}
	return [...groups.values()].flatMap(group => {
		const damageEvents = group.filter(event => event.type === 'damage')
		return damageEvents.length ? damageEvents : group.filter(event => event.type === 'calculateddamage')
	})
}

function buildDamageLookup(events, actorMap) {
	const lookup = new Map()
	for (const group of groupVisualEvents(events, 0, actorMap, event => sourceActionKey(event, actorMap))) {
		const first = group[0]
		const key = sourceActionKey(first, actorMap)
		if (!lookup.has(key)) {
			lookup.set(key, [])
		}
		lookup.get(key).push({
			timestamp: Number(first.timestamp),
			packetId: first.packetID ?? null,
			damage: group.reduce((sum, event) => sum + Number(event.amount ?? 0) + Number(event.overkill ?? 0), 0),
			eventCount: group.length,
			targetName: targetName(first, actorMap),
			sourceName: sourceName(first, actorMap),
			actionId: Number(first.ability?.guid ?? 0),
		})
	}
	for (const items of lookup.values()) {
		items.sort((left, right) => left.timestamp - right.timestamp)
	}
	return lookup
}

function matchingDamagePackets(group, damageLookup, actorMap) {
	const matches = []
	const seen = new Set()
	for (const event of group) {
		const key = sourceActionKey(event, actorMap)
		const candidates = damageLookup.get(key) ?? []
		for (const candidate of candidates) {
			const delta = candidate.timestamp - Number(event.timestamp)
			const candidateKey = `${candidate.packetId ?? candidate.timestamp}:${candidate.targetName}:${candidate.damage}`
			if (delta < -DAMAGE_MATCH_EARLY_MS || delta > DAMAGE_MATCH_LATE_MS || seen.has(candidateKey)) {
				continue
			}
			seen.add(candidateKey)
			matches.push(candidate)
		}
	}
	return matches
}

function groupVisualEvents(events, fightStart, actorMap, keyPrefix = event => sourceActionKey(event, actorMap)) {
	const groups = new Map()
	for (const event of events) {
		const relative = Math.max(0, Number(event.timestamp ?? 0) - Number(fightStart ?? 0))
		const bucket = Math.round(relative / VISUAL_GROUP_BUCKET_MS) * VISUAL_GROUP_BUCKET_MS
		const key = `${keyPrefix(event)}|${bucket}`
		if (!groups.has(key)) {
			groups.set(key, [])
		}
		groups.get(key).push(event)
	}
	return [...groups.values()]
		.map(group => group.sort((left, right) => left.timestamp - right.timestamp || sourceId(left).localeCompare(sourceId(right))))
		.sort((left, right) => left[0].timestamp - right[0].timestamp)
}

function sourceActionKey(event, actorMap) {
	return `${sourceName(event, actorMap)}|${Number(event.ability?.guid ?? 0)}`
}

function damagePacketKey(event) {
	return event.packetID != null
		? `packet:${event.packetID}:${event.ability?.guid ?? ''}:${event.sourceID}:${event.sourceInstance ?? ''}:${event.targetID ?? ''}:${event.targetInstance ?? ''}`
		: `event:${event.timestamp}:${event.ability?.guid ?? ''}:${event.sourceID}:${event.sourceInstance ?? ''}:${event.targetID ?? ''}:${event.targetInstance ?? ''}`
}

function isAutoAttack(event) {
	return AUTO_ATTACK_ACTION_IDS.has(Number(event.ability?.guid ?? 0))
}

function isIgnoredVisualAction(event) {
	return IGNORED_VISUAL_ACTION_IDS.has(Number(event.ability?.guid ?? 0))
}

function sourceName(event, enemyMap) {
	const actorMap = enemyMap instanceof Map ? enemyMap : new Map()
	const name = event.source?.name ?? actorMap.get(event.sourceID)?.name ?? `Source ${event.sourceID}`
	return SOURCE_LABELS.get(name) ?? name
}

function sourceId(event) {
	return event.sourceInstance == null ? String(event.sourceID ?? '') : `${event.sourceID}.${event.sourceInstance}`
}

function targetName(event, enemyMap = new Map()) {
	const actorMap = enemyMap instanceof Map ? enemyMap : new Map()
	return event.target?.name ?? actorMap.get(event.targetID)?.name ?? (event.targetID ? `Target ${event.targetID}` : '')
}

function targetId(event) {
	return event.targetInstance == null ? String(event.targetID ?? '') : `${event.targetID}.${event.targetInstance}`
}

function actionLabel(event) {
	const actionId = Number(event.ability?.guid ?? 0)
	return ACTION_LABELS.get(actionId) || fallbackActionLabel(event.ability?.name, actionId)
}

function fallbackActionLabel(name, actionId) {
	const unknownMatch = /^unknown_([0-9a-f]+)$/i.exec(String(name ?? ''))
	if (unknownMatch) {
		return `未知技能 ${unknownMatch[1].toUpperCase()}`
	}
	return name || (actionId ? `技能 ${actionId}` : 'Boss 技能')
}

function uniqueValues(items, selector) {
	return [...new Set(items.map(selector).filter(Boolean))]
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8')
	return JSON.parse(text.replace(/^\uFEFF/, ''))
}

function resolveProjectPath(relativeOrAbsolutePath) {
	return path.isAbsolute(relativeOrAbsolutePath)
		? relativeOrAbsolutePath
		: path.resolve(projectDir, relativeOrAbsolutePath)
}

function relativeMs(timestamp, fightStart) {
	return Math.max(0, Math.round(Number(timestamp) - Number(fightStart)))
}

function byStart(left, right) {
	return left.startMs - right.startMs || left.endMs - right.endMs || left.label.localeCompare(right.label)
}

function formatClock(ms = 0) {
	const total = Math.max(0, Math.round(ms / 1000))
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
