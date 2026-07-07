import {readFile, readdir} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')

export async function loadDefaultBossTimelineData(relativeRoot = '../资源/data/boss-data') {
	const root = resolveProjectPath(relativeRoot)
	const entries = await readdir(root, {withFileTypes: true})
	const encounter = entries.find(entry => entry.isDirectory())
	if (!encounter) {
		return null
	}
	return loadBossTimelineData(path.join(root, encounter.name))
}

export async function loadBossTimelineData(relativeOrAbsolutePath) {
	const bossDir = resolveProjectPath(relativeOrAbsolutePath)
	const [casts, abilities, actionSummary, actionsMeta] = await Promise.all([
		readCsv(path.join(bossDir, 'boss-casts.csv')),
		readCsv(path.join(bossDir, 'boss-abilities.csv')),
		readCsv(path.join(bossDir, 'boss-action-summary.csv')),
		readActionsMeta(path.join(bossDir, 'boss-actions.json')),
	])

	const rawCastItems = casts.map(toCastItem)
	const rawAbilityItems = abilities.map(toAbilityItem)
	const castItems = aggregateBossTimelineItems(rawCastItems)
	const abilityItems = aggregateBossTimelineItems(rawAbilityItems)
	const firstSecond = Math.min(
		...casts.map(row => numberValue(row.seconds)).filter(Number.isFinite),
		...abilities.map(row => numberValue(row.releaseSeconds)).filter(Number.isFinite),
	)
	const lastSecond = Math.max(
		...casts.map(row => numberValue(row.expectedReleaseSeconds || row.seconds)).filter(Number.isFinite),
		...abilities.map(row => numberValue(row.releaseSeconds)).filter(Number.isFinite),
	)

	return {
		source: {
			encounterName: actionsMeta.name ?? path.basename(bossDir),
			territoryId: actionsMeta.territoryId ?? null,
			sourceLog: actionsMeta.sourceLog ?? '',
			pullStart: actionsMeta.pullStart ?? '',
			pullEnd: actionsMeta.pullEnd ?? '',
			generatedAt: actionsMeta.generatedAt ?? '',
			castCount: casts.length,
			abilityCount: abilities.length,
			visualCastCount: castItems.length,
			visualAbilityCount: abilityItems.length,
			actionCount: actionSummary.length,
			damageAbilityCount: abilities.filter(row => numberValue(row.damageCandidateSum) > 0).length,
			firstSecond: Number.isFinite(firstSecond) ? firstSecond : 0,
			lastSecond: Number.isFinite(lastSecond) ? lastSecond : 0,
		},
		rows: [
			{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: castItems},
			{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: abilityItems},
		],
		splitRows: splitBossRowsBySourceName([
			{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: castItems},
			{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: abilityItems},
		]),
		topDamageActions: actionSummary
			.map(row => ({
				sourceName: row.sourceName ?? '',
				actionName: row.actionName ?? '',
				actionId: numberValue(row.actionId),
				actionIdHex: row.actionIdHex ?? '',
				castCount: numberValue(row.castCount),
				releaseCount: numberValue(row.releaseCount),
				damageCandidateSum: numberValue(row.damageCandidateSum),
				damageCandidateMax: numberValue(row.damageCandidateMax),
			}))
			.sort((left, right) => right.damageCandidateSum - left.damageCandidateSum)
			.slice(0, 16),
	}
}

export function mergeBossRows(timelineRows, bossTimeline) {
	if (!bossTimeline?.rows?.length) {
		return timelineRows
	}
	const bossRows = bossTimeline.splitRows?.length ? bossTimeline.splitRows : bossTimeline.rows
	const insertAt = timelineRows.findIndex(row => row.id === 'boss-casts')
	const withoutBossRows = timelineRows.filter(row => row.id !== 'boss-casts' && row.id !== 'boss-damage')
	if (insertAt < 0) {
		return [...bossRows, ...withoutBossRows]
	}
	return [
		...withoutBossRows.slice(0, insertAt),
		...bossRows,
		...withoutBossRows.slice(insertAt),
	]
}

export function splitBossRowsBySourceName(rows) {
	return rows.flatMap(row => {
		const grouped = new Map()
		for (const item of row.items) {
			const sourceName = item.sourceName || 'Unknown Boss'
			if (!grouped.has(sourceName)) {
				grouped.set(sourceName, [])
			}
			grouped.get(sourceName).push(item)
		}
		return [...grouped.entries()]
			.sort(([leftName, leftItems], [rightName, rightItems]) => {
				const leftStart = Math.min(...leftItems.map(item => item.startMs))
				const rightStart = Math.min(...rightItems.map(item => item.startMs))
				return leftStart - rightStart || leftName.localeCompare(rightName, 'zh-Hans-CN')
			})
			.map(([sourceName, items], index) => ({
				id: `${row.id}-${sourceKey(sourceName)}`,
				groupId: row.id,
				sourceName,
				label: `${sourceName} ${bossRowTypeLabel(row.id)}`,
				accent: row.id === 'boss-casts' ? bossAccent(index) : 'gold',
				items,
			}))
	})
}

export function aggregateBossTimelineItems(items) {
	const groups = new Map()
	for (const item of items) {
		const key = visualEventKey(item)
		if (!groups.has(key)) {
			groups.set(key, [])
		}
		groups.get(key).push(item)
	}

	return [...groups.values()].map(group => {
		if (group.length === 1) {
			return {
				...group[0],
				eventCount: 1,
				sourceCount: group[0].sourceId ? 1 : 0,
				targetCount: group[0].targetId || group[0].targetName ? 1 : numberValue(group[0].targetCount),
			}
		}

		const first = group[0]
		const damage = group.reduce((sum, item) => sum + numberValue(item.damage), 0)
		const sourceCount = uniqueCount(group, item => item.sourceId)
		const targetCount = uniqueCount(group, item => item.targetId || item.targetName)
		const baseLabel = baseActionLabel(first)
		const countSuffix = group.length > 1 ? ` x${group.length}` : ''
		const label = first.type === 'damage' && damage > 0
			? `${damage} ${baseLabel}${countSuffix}`
			: `${baseLabel}${countSuffix}`

		return {
			...first,
			id: `${first.id}-group-${group.length}`,
			label,
			damage,
			endMs: Math.max(...group.map(item => item.endMs)),
			eventCount: group.length,
			sourceCount,
			targetCount,
			sourceIds: [...new Set(group.map(item => item.sourceId).filter(Boolean))],
			targetNames: [...new Set(group.map(item => item.targetName).filter(Boolean))],
		}
	})
}

async function readCsv(filePath) {
	const text = await readFile(filePath, 'utf8')
	const [header = [], ...records] = parseCsv(text)
	return records
		.filter(record => record.some(value => value !== ''))
		.map(record => Object.fromEntries(header.map((key, index) => [key, record[index] ?? ''])))
}

async function readActionsMeta(filePath) {
	try {
		const data = JSON.parse(await readFile(filePath, 'utf8'))
		return data.meta ?? {}
	} catch {
		return {}
	}
}

function toCastItem(row, index) {
	const startSeconds = numberValue(row.seconds)
	const releaseSeconds = numberValue(row.expectedReleaseSeconds)
	const durationSeconds = numberValue(row.castDurationSeconds)
	const startMs = Math.round(startSeconds * 1000)
	const endMs = Number.isFinite(releaseSeconds)
		? Math.round(releaseSeconds * 1000)
		: startMs + Math.round((Number.isFinite(durationSeconds) ? durationSeconds : 4.7) * 1000)

	return {
		id: `boss-cast-${index}-${row.sourceId}-${row.actionId}`,
		type: 'cast',
		label: actionLabel(row),
		startMs,
		endMs,
		timeLabel: row.clock || formatClock(startMs),
		damage: 0,
		actionId: numberValue(row.actionId),
		actionIdHex: row.actionIdHex ?? '',
		actionName: actionLabel(row),
		sourceName: row.sourceName ?? '',
		sourceId: row.sourceId ?? '',
		targetName: row.targetName ?? '',
	}
}

function toAbilityItem(row, index) {
	const startSeconds = numberValue(row.releaseSeconds)
	const startMs = Math.round(startSeconds * 1000)
	const damage = numberValue(row.damageCandidateSum)
	const targetCount = Math.max(1, numberValue(row.targetCount))
	return {
		id: `boss-ability-${index}-${row.sourceId}-${row.actionId}-${row.targetIndex}`,
		type: 'damage',
		label: damage > 0 ? `${damage} ${actionLabel(row)}` : actionLabel(row),
		startMs,
		endMs: startMs + Math.min(2400, 700 + targetCount * 180),
		timeLabel: row.clock || formatClock(startMs),
		damage,
		actionId: numberValue(row.actionId),
		actionIdHex: row.actionIdHex ?? '',
		actionName: actionLabel(row),
		sourceName: row.sourceName ?? '',
		sourceId: row.sourceId ?? '',
		targetName: row.targetName ?? '',
		targetId: row.targetId ?? '',
		targetIndex: numberValue(row.targetIndex),
		targetCount,
	}
}

function actionLabel(row) {
	return row.actionName || (row.actionId ? `Action ${row.actionId}` : 'Boss Action')
}

function visualEventKey(item) {
	return [
		item.type,
		item.sourceName || '',
		item.startMs,
		item.actionId || item.actionIdHex || baseActionLabel(item),
		baseActionLabel(item),
	].join('|')
}

function baseActionLabel(item) {
	return String(item.actionName || item.label || 'Boss Action')
		.replace(/^\d+\s+/, '')
		.replace(/\s+x\d+$/, '')
		.trim() || 'Boss Action'
}

function uniqueCount(items, selector) {
	const values = new Set(items.map(selector).filter(Boolean))
	return values.size
}

function parseCsv(text) {
	const rows = []
	let row = []
	let value = ''
	let quoted = false

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]
		const next = text[index + 1]
		if (char === '"') {
			if (quoted && next === '"') {
				value += '"'
				index += 1
			} else {
				quoted = !quoted
			}
			continue
		}
		if (char === ',' && !quoted) {
			row.push(value)
			value = ''
			continue
		}
		if ((char === '\n' || char === '\r') && !quoted) {
			if (char === '\r' && next === '\n') {
				index += 1
			}
			row.push(value)
			rows.push(row)
			row = []
			value = ''
			continue
		}
		value += char
	}

	if (value || row.length) {
		row.push(value)
		rows.push(row)
	}
	return rows
}

function numberValue(value) {
	const number = Number(value)
	return Number.isFinite(number) ? number : 0
}

function sourceKey(value) {
	return String(value || 'unknown')
		.trim()
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
		.replace(/^-+|-+$/g, '') || 'unknown'
}

function bossAccent(index) {
	return ['rose', 'sky', 'violet', 'orange', 'mint'][index % 5]
}

function bossRowTypeLabel(rowId) {
	return rowId === 'boss-casts' ? '读条' : '伤害'
}

function formatClock(ms = 0) {
	const total = Math.max(0, Math.round(ms / 1000))
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function resolveProjectPath(relativeOrAbsolutePath) {
	return path.isAbsolute(relativeOrAbsolutePath)
		? relativeOrAbsolutePath
		: path.resolve(projectDir, relativeOrAbsolutePath)
}
