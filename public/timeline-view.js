export function timelineDurationMs(rows, bossSource = null, phaseId = 'all') {
	const phase = phaseWindow(bossSource, phaseId)
	if (phase) {
		return Math.max(1000, phase.endMs - phase.startMs)
	}
	const sourceDurationMs = Number(bossSource?.lastSecond ?? 0) * 1000
	const rowDurationMs = Math.max(...rows.flatMap(row => row.items.map(item => item.endMs)), 600000)
	return Math.max(rowDurationMs, sourceDurationMs)
}

export function phaseOptions(bossSource = null) {
	const phases = Array.isArray(bossSource?.phases) ? bossSource.phases : []
	return phases.map((phase, index) => ({
		id: `p${phase.id ?? index + 1}`,
		label: `P${phase.id ?? index + 1}`,
		startMs: Math.round(Number(phase.startSecond ?? 0) * 1000),
		endMs: Math.round(Number(phases[index + 1]?.startSecond ?? bossSource?.lastSecond ?? 0) * 1000),
	}))
}

export function absoluteMsForPhaseTime(bossSource = null, phaseId = 'all', phaseTimeMs = 0) {
	const timeMs = Math.max(0, Math.round(Number(phaseTimeMs ?? 0)))
	const phase = phaseWindow(bossSource, phaseId)
	return phase ? phase.startMs + timeMs : timeMs
}

export function phaseLabelForTime(bossSource = null, phaseId = 'all', phaseTimeMs = 0) {
	const phase = phaseWindow(bossSource, phaseId)
	const normalizedPhaseTimeMs = Math.max(0, Math.round(Number(phaseTimeMs ?? 0)))
	return {
		phaseId: phase?.id ?? 'all',
		phaseLabel: phase?.label ?? '全部',
		phaseTimeMs: normalizedPhaseTimeMs,
		absoluteTimeMs: absoluteMsForPhaseTime(bossSource, phaseId, normalizedPhaseTimeMs),
	}
}

export function filterTimelineRowsByPhase(rows, bossSource = null, phaseId = 'all') {
	if (phaseId === 'all') {
		return rows
	}
	const phase = phaseWindow(bossSource, phaseId)
	if (!phase) {
		return rows
	}
	return rows
		.map(row => ({
			...row,
			items: row.items.filter(item => itemOverlapsPhase(item, phase, phaseId)),
		}))
		.filter(row => row.items.length > 0 || !isBossRow(row))
}

export function timelineRowsForPhase(rows, bossSource = null, phaseId = 'all') {
	if (phaseId === 'all') {
		return rows
	}
	const phase = phaseWindow(bossSource, phaseId)
	if (!phase) {
		return rows
	}
	return rows
		.map(row => {
			if (row.html) {
				return row
			}
			return {
				...row,
				items: (row.items ?? [])
					.filter(item => itemOverlapsPhase(item, phase, phaseId))
					.map(item => rebaseItemToPhase(item, phase, phaseId)),
			}
		})
		.filter(row => row.html || row.keepWhenEmpty || row.items.length > 0)
}

export function prepareBossTimelineRows(rows, bossSource = null, phaseId = 'all', bossItemLimit = Infinity) {
	return filterTimelineRowsByPhase(rows, bossSource, phaseId)
		.map(row => {
			const limit = itemLimitForBossRow(row, bossItemLimit)
			if (!Number.isFinite(limit)) {
				return row
			}
			return {
				...row,
				items: row.items.slice(0, limit),
			}
		})
		.filter(row => row.items.length > 0 || !isBossRow(row))
}

export function timelineTicks(maxTime, stepMs = 10000) {
	const duration = Math.max(0, Number(maxTime ?? 0))
	const step = Math.max(1000, Number(stepMs ?? 10000))
	const ticks = []
	for (let ms = 0; ms <= duration; ms += step) {
		const kind = ms % 60000 === 0 ? 'major' : ms % 30000 === 0 ? 'medium' : 'minor'
		ticks.push({
			ms,
			kind,
			label: kind === 'minor' ? '' : formatTickTime(ms),
		})
	}
	return ticks
}

export function mergeBossCastAndDamageRows(rows) {
	const bossRows = rows.filter(isBossCastOrDamageRow)
	const otherRows = rows.filter(row => !isBossCastOrDamageRow(row))
	if (!bossRows.length) {
		return rows
	}

	const mergedBySource = new Map()
	const orderedSources = []
	const castItemsBySource = new Map()

	for (const row of bossRows) {
		if ((row.groupId ?? row.id) !== 'boss-casts') {
			continue
		}
		const sourceName = sourceNameForRow(row)
		const merged = ensureMergedBossRow(mergedBySource, orderedSources, sourceName, row)
		for (const item of row.items ?? []) {
			const castItem = {
				...item,
				type: 'cast',
				damage: Number(item.damage ?? 0),
				damageEventCount: Number(item.damageEventCount ?? 0),
				damageItems: Array.isArray(item.damageItems) ? [...item.damageItems] : [],
			}
			merged.items.push(castItem)
			const key = sourceKeyForName(sourceName)
			castItemsBySource.set(key, [...(castItemsBySource.get(key) ?? []), castItem])
		}
	}

	for (const row of bossRows) {
		if ((row.groupId ?? row.id) !== 'boss-damage') {
			continue
		}
		const sourceName = sourceNameForRow(row)
		const merged = ensureMergedBossRow(mergedBySource, orderedSources, sourceName, row)
		for (const damageItem of row.items ?? []) {
			const match = findMatchingCast(damageItem, castItemsBySource.get(sourceKeyForName(sourceName)) ?? [])
			if (match) {
				attachDamageToCast(match, damageItem)
				continue
			}
			merged.items.push(normalizeDamageOnlyItem(damageItem))
		}
	}

	const mergedRows = orderedSources
		.map(sourceName => mergedBySource.get(sourceKeyForName(sourceName)))
		.filter(Boolean)
		.map(row => ({
			...row,
			items: row.items.sort((left, right) => Number(left.startMs ?? 0) - Number(right.startMs ?? 0)),
		}))

	return [...mergedRows, ...otherRows]
}

function phaseWindow(bossSource, phaseId = 'all') {
	if (phaseId === 'all') {
		return null
	}
	return phaseOptions(bossSource).find(item => item.id === phaseId) ?? null
}

function itemOverlapsPhase(item, phase, phaseId = 'all') {
	const taggedPhase = normalizedPhaseId(item.phase)
	if (taggedPhase) {
		return taggedPhase === phaseId
	}
	const startMs = Number(item.startMs ?? 0)
	const endMs = Number(item.endMs ?? startMs)
	return endMs > phase.startMs && startMs < phase.endMs
}

function rebaseItemToPhase(item, phase, phaseId = 'all') {
	const absoluteStartMs = Number(item.startMs ?? 0)
	const absoluteEndMs = Number(item.endMs ?? absoluteStartMs)
	const taggedPhase = normalizedPhaseId(item.phase)
	const phaseStartMs = taggedPhase === phaseId && Number.isFinite(Number(item.phaseStartMs))
		? Number(item.phaseStartMs)
		: phase.startMs
	const phaseDurationMs = phase.endMs - phase.startMs
	const startMs = Math.max(0, absoluteStartMs - phaseStartMs)
	const endMs = Math.min(phaseDurationMs, Math.max(startMs, absoluteEndMs - phaseStartMs))
	return {
		...item,
		absoluteStartMs,
		absoluteEndMs,
		startMs,
		endMs,
		timeLabel: formatTickTime(startMs),
	}
}

function normalizedPhaseId(phase) {
	const match = /^p?(\d+)$/i.exec(String(phase ?? '').trim())
	return match ? `p${match[1]}` : ''
}

function isBossRow(row) {
	const id = row.groupId ?? row.id
	return id === 'boss' || id === 'boss-casts' || id === 'boss-damage'
}

function itemLimitForBossRow(row, bossItemLimit) {
	if (!isBossRow(row)) {
		return Infinity
	}
	if (typeof bossItemLimit === 'number') {
		return bossItemLimit
	}
	const id = row.groupId ?? row.id
	return Number(bossItemLimit?.[id] ?? Infinity)
}

function formatTickTime(ms = 0) {
	const total = Math.max(0, Math.round(ms / 1000))
	const minutes = Math.floor(total / 60)
	const seconds = String(total % 60).padStart(2, '0')
	return `${minutes}:${seconds}`
}

function isBossCastOrDamageRow(row) {
	const id = row.groupId ?? row.id
	return id === 'boss-casts' || id === 'boss-damage'
}

function ensureMergedBossRow(mergedBySource, orderedSources, sourceName, sourceRow) {
	const key = sourceKeyForName(sourceName)
	if (!mergedBySource.has(key)) {
		orderedSources.push(sourceName)
		mergedBySource.set(key, {
			id: `boss-${key || orderedSources.length}`,
			groupId: 'boss',
			sourceName,
			label: sourceName,
			accent: sourceRow.accent ?? 'rose',
			items: [],
		})
	}
	const merged = mergedBySource.get(key)
	if (merged.accent === 'gold' && sourceRow.accent && sourceRow.accent !== 'gold') {
		merged.accent = sourceRow.accent
	}
	return merged
}

function sourceNameForRow(row) {
	const itemSourceName = (row.items ?? []).find(item => item.sourceName)?.sourceName
	return String(row.sourceName ?? itemSourceName ?? strippedBossRowLabel(row.label ?? row.id ?? 'Boss'))
}

function strippedBossRowLabel(label) {
	return String(label)
		.replace(/\s*(读条|傷害|伤害|casts?|damage)$/i, '')
		.trim() || 'Boss'
}

function sourceKeyForName(sourceName) {
	return String(sourceName ?? 'Boss').trim().toLowerCase()
}

function findMatchingCast(damageItem, castItems) {
	const damageActionId = damageItem.actionId == null ? '' : String(damageItem.actionId)
	const damageTime = Number(damageItem.startMs ?? 0)
	return castItems
		.filter(castItem => {
			const castActionId = castItem.actionId == null ? '' : String(castItem.actionId)
			if (damageActionId && castActionId && damageActionId !== castActionId) {
				return false
			}
			const castStart = Number(castItem.startMs ?? 0)
			const castEnd = Number(castItem.endMs ?? castStart)
			return damageTime >= castStart - 750 && damageTime <= castEnd + 3500
		})
		.sort((left, right) => {
			const leftEnd = Number(left.endMs ?? left.startMs ?? 0)
			const rightEnd = Number(right.endMs ?? right.startMs ?? 0)
			return Math.abs(damageTime - leftEnd) - Math.abs(damageTime - rightEnd)
		})[0]
}

function attachDamageToCast(castItem, damageItem) {
	const damage = Number(damageItem.damage ?? 0)
	const eventCount = Number(damageItem.eventCount ?? 1)
	castItem.damage = Number(castItem.damage ?? 0) + damage
	castItem.damageEventCount = Number(castItem.damageEventCount ?? 0) + eventCount
	castItem.eventCount = Math.max(Number(castItem.eventCount ?? 1), castItem.damageEventCount)
	castItem.damageItems = [...(castItem.damageItems ?? []), {...damageItem}]
}

function normalizeDamageOnlyItem(item) {
	return {
		...item,
		type: 'damage',
		label: item.actionName ?? strippedDamageLabel(item.label),
		damage: Number(item.damage ?? 0),
	}
}

function strippedDamageLabel(label = '') {
	return String(label).replace(/^[\d,.\s]+/, '').trim() || String(label)
}
