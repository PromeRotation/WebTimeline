import {createReadStream} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createInterface} from 'node:readline'
import {
	isAbility,
	isCastStart,
	parseAbilityLine,
	parseCastLine,
	parseLogLine,
} from '../src/act-log-parser.mjs'

const LOG_PATH = path.resolve('..', '资源', 'logs', '过本actlogs.log')
const OUT_DIR = path.resolve('..', '资源', 'boss-data', '妖星乱舞绝境战')
const PULL_START = new Date('2026-06-30T01:27:55.000+08:00')
const PULL_END = new Date('2026-06-30T02:44:28.000+08:00')

const casts = []
const abilities = []
const actors = new Map()
const bossActorIds = new Set()
const castBySourceAndAction = new Map()

await mkdir(OUT_DIR, {recursive: true})

const reader = createInterface({
	input: createReadStream(LOG_PATH, {encoding: 'utf8'}),
	crlfDelay: Infinity,
})

for await (const line of reader) {
	const record = parseLogLine(line)
	const timestamp = toDate(record.timestamp)
	if (!timestamp || timestamp > PULL_END) {
		continue
	}

	collectActor(record)

	if (timestamp < PULL_START) {
		continue
	}

	if (isCastStart(record)) {
		const cast = withTiming(parseCastLine(record), timestamp)
		if (!isBossLike(cast.sourceId, cast.sourceName)) {
			continue
		}
		bossActorIds.add(cast.sourceId)
		casts.push(cast)
		castBySourceAndAction.set(castKey(cast.sourceId, cast.actionIdHex), cast)
		continue
	}

	if (isAbility(record)) {
		const ability = withTiming(parseAbilityLine(record), timestamp)
		const sourceIsBoss = isBossLike(ability.sourceId, ability.sourceName) || bossActorIds.has(ability.sourceId)
		if (!sourceIsBoss) {
			continue
		}
		const matchingCast = castBySourceAndAction.get(castKey(ability.sourceId, ability.actionIdHex))
		ability.castStartedAt = matchingCast?.timestamp ?? null
		ability.castOffsetSeconds = matchingCast ? roundSeconds(timestamp - new Date(matchingCast.timestamp)) : null
		ability.castDurationSeconds = matchingCast?.castDurationSeconds ?? null
		ability.damage = summarizeDamage(ability)
		abilities.push(ability)
	}
}

const grouped = summarizeByAction(casts, abilities)
const castRows = casts.map(toCastRow)
const abilityRows = abilities.map(toAbilityRow)
const payload = {
	meta: {
		name: '妖星乱舞绝境战 boss 技能数据',
		territoryId: 1363,
		sourceLog: LOG_PATH,
		pullStart: PULL_START.toISOString(),
		pullEnd: PULL_END.toISOString(),
		generatedAt: new Date().toISOString(),
		notes: [
			'castDurationSeconds 来自 ACT 20 读条开始行。',
			'releaseSeconds 来自 ACT 21/22 技能释放行相对本 pull 起点。',
			'damage.damageCandidateSum 是从 ACT effect raw value 的低 16 位候选值汇总；raw fields 已保留，后续可重新解码。',
		],
	},
	actors: [...actors.values()].filter(actor => isBossLike(actor.id, actor.name)),
	casts,
	abilities,
	summaryByAction: grouped,
}

await writeFile(path.join(OUT_DIR, 'boss-actions.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
await writeFile(path.join(OUT_DIR, 'boss-casts.csv'), toCsv(castRows), 'utf8')
await writeFile(path.join(OUT_DIR, 'boss-abilities.csv'), toCsv(abilityRows), 'utf8')
await writeFile(path.join(OUT_DIR, 'boss-action-summary.csv'), toCsv(grouped), 'utf8')

console.log(`Exported ${casts.length} boss casts and ${abilities.length} boss ability rows to ${OUT_DIR}`)

function collectActor(record) {
	if (record.eventType !== '03' && record.eventType !== '261') {
		return
	}
	const fields = record.fields
	if (record.eventType === '03') {
		actors.set(fields[0], {
			id: fields[0],
			name: fields[1] ?? '',
			ownerId: fields[4] ?? '',
			level: fields[3] ?? '',
			bNpcNameId: fields[8] ?? '',
			bNpcId: fields[9] ?? '',
			maxHp: Number(fields[11] ?? 0),
		})
		return
	}
	if (fields[0] !== 'Add') {
		return
	}
	const id = fields[1]
	const actor = {id}
	for (let index = 2; index < fields.length - 1; index += 2) {
		actor[fields[index]] = fields[index + 1]
	}
	actors.set(id, {
		id,
		name: actor.Name ?? '',
		ownerId: actor.OwnerID ?? '',
		bNpcId: actor.BNpcID ?? '',
		bNpcNameId: actor.BNpcNameID ?? '',
		level: actor.Level ?? '',
		maxHp: Number(actor.MaxHP ?? 0),
		radius: Number(actor.Radius ?? 0),
	})
}

function isBossLike(id, name) {
	if (!id || !id.startsWith('4')) {
		return false
	}
	if (!name) {
		return false
	}
	const actor = actors.get(id)
	if (actor?.ownerId && actor.ownerId !== '0000') {
		return false
	}
	return true
}

function withTiming(event, timestamp) {
	return {
		...event,
		seconds: roundSeconds(timestamp - PULL_START),
		clock: formatClock(timestamp - PULL_START),
		isoTimestamp: timestamp.toISOString(),
	}
}

function summarizeDamage(ability) {
	const candidates = ability.effects
		.filter(effect => effect.isDamage)
		.map(effect => effect.damageCandidate)
		.filter(value => Number.isFinite(value) && value > 0)
	return {
		hits: candidates.length,
		damageCandidateSum: candidates.reduce((sum, value) => sum + value, 0),
		damageCandidateMax: candidates.length ? Math.max(...candidates) : 0,
	}
}

function summarizeByAction(castEvents, abilityEvents) {
	const rows = new Map()
	for (const cast of castEvents) {
		const key = actionKey(cast)
		const row = ensureSummary(rows, cast)
		row.castCount += 1
		row.castDurationSeconds = cast.castDurationSeconds
		row.firstCastSeconds ??= cast.seconds
		row.lastCastSeconds = cast.seconds
	}
	for (const ability of abilityEvents) {
		const row = ensureSummary(rows, ability)
		row.releaseCount += 1
		row.firstReleaseSeconds ??= ability.seconds
		row.lastReleaseSeconds = ability.seconds
		row.damageCandidateSum += ability.damage.damageCandidateSum
		row.damageCandidateMax = Math.max(row.damageCandidateMax, ability.damage.damageCandidateMax)
	}
	return [...rows.values()].sort((a, b) => (a.firstCastSeconds ?? a.firstReleaseSeconds ?? 0) - (b.firstCastSeconds ?? b.firstReleaseSeconds ?? 0))
}

function ensureSummary(rows, event) {
	const key = actionKey(event)
	if (!rows.has(key)) {
		rows.set(key, {
			sourceName: event.sourceName,
			actionId: event.actionId,
			actionIdHex: event.actionIdHex,
			actionName: event.actionName,
			castCount: 0,
			releaseCount: 0,
			castDurationSeconds: null,
			firstCastSeconds: null,
			lastCastSeconds: null,
			firstReleaseSeconds: null,
			lastReleaseSeconds: null,
			damageCandidateSum: 0,
			damageCandidateMax: 0,
		})
	}
	return rows.get(key)
}

function toCastRow(cast) {
	return {
		clock: cast.clock,
		seconds: cast.seconds,
		sourceName: cast.sourceName,
		sourceId: cast.sourceId,
		actionName: cast.actionName,
		actionId: cast.actionId,
		actionIdHex: cast.actionIdHex,
		targetName: cast.targetName,
		castDurationSeconds: cast.castDurationSeconds,
		expectedReleaseSeconds: roundSeconds(cast.seconds * 1000 + cast.castDurationSeconds * 1000),
	}
}

function toAbilityRow(ability) {
	return {
		clock: ability.clock,
		releaseSeconds: ability.seconds,
		sourceName: ability.sourceName,
		sourceId: ability.sourceId,
		actionName: ability.actionName,
		actionId: ability.actionId,
		actionIdHex: ability.actionIdHex,
		targetName: ability.targetName,
		targetId: ability.targetId,
		targetIndex: ability.targetIndex,
		targetCount: ability.targetCount,
		castDurationSeconds: ability.castDurationSeconds,
		castOffsetSeconds: ability.castOffsetSeconds,
		damageCandidateSum: ability.damage.damageCandidateSum,
		damageCandidateMax: ability.damage.damageCandidateMax,
		effects: ability.effects.map(effect => `${effect.type}:${effect.rawValue}:${effect.damageCandidate}:${effect.isDamage ? 'damage' : 'aux'}`).join(';'),
	}
}

function actionKey(event) {
	return `${event.sourceName}|${event.actionIdHex}|${event.actionName}`
}

function castKey(sourceId, actionIdHex) {
	return `${sourceId}|${actionIdHex}`
}

function toCsv(rows) {
	if (!rows.length) {
		return ''
	}
	const headers = Object.keys(rows[0])
	const lines = [headers.join(',')]
	for (const row of rows) {
		lines.push(headers.map(header => csvCell(row[header])).join(','))
	}
	return `${lines.join('\n')}\n`
}

function csvCell(value) {
	if (value === null || value === undefined) {
		return ''
	}
	const text = String(value)
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toDate(value) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function roundSeconds(ms) {
	return Math.round(ms / 10) / 100
}

function formatClock(ms) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000))
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = String(totalSeconds % 60).padStart(2, '0')
	return `${minutes}:${seconds}`
}
