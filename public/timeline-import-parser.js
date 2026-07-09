const TIMELINE_IMPORT_KINDS = {
	trigger: Object.freeze({id: 'trigger', label: '传统触发轴'}),
	ptl: Object.freeze({id: 'ptl', label: 'PTL 时间轴'}),
	unknown: Object.freeze({id: 'unknown', label: '未知时间轴'}),
}

export function detectTimelineImportKind(timelineJson = {}) {
	if (!timelineJson || typeof timelineJson !== 'object') {
		return TIMELINE_IMPORT_KINDS.unknown
	}
	if (timelineJson.Root || timelineJson.root) {
		return TIMELINE_IMPORT_KINDS.trigger
	}
	if (Array.isArray(timelineJson.Anchors ?? timelineJson.anchors) || Array.isArray(timelineJson.Entries ?? timelineJson.entries)) {
		return TIMELINE_IMPORT_KINDS.ptl
	}
	return TIMELINE_IMPORT_KINDS.unknown
}

export function flattenPrTimeline(timelineJson, options = {}) {
	const events = []
	let sequence = 0
	const initialContext = {
		phase: options.initialPhase ?? 'P1',
		phaseStartMs: Number(options.initialPhaseStartMs ?? 0),
	}
	const actionReadyAtMs = new Map()
	const runtimeOptions = {...options, actionCooldownReadyMs}
	const eventIdPrefix = options.eventIdPrefix ?? 'import'

	function pushEvent(timeMs, event, context) {
		if (!event) {
			return
		}
		events.push({
			id: `${eventIdPrefix}-${++sequence}`,
			phase: context.phase,
			phaseStartMs: context.phaseStartMs,
			timeMs,
			...event,
		})
	}

	function walk(node, cursorMs, context = initialContext) {
		if (!node || node.Enabled === false) {
			return walkResult(cursorMs, false, context)
		}

		const type = nodeType(node)
		let nextContext = context
		const phaseMatch = /^(P\d+)/i.exec(node.Name ?? '')
		if (phaseMatch) {
			nextContext = {
				...context,
				phase: phaseMatch[1].toUpperCase(),
				phaseStartMs: cursorMs,
			}
		}

		if (type === 'delay') {
			const durationMs = Number(node.DelayMs ?? 0)
			const nextMs = cursorMs + durationMs
			pushEvent(nextMs, options.delayEvent?.({node, durationMs}), nextContext)
			return walkResult(nextMs, false, nextContext)
		}

		if (type === 'condition') {
			const {timeMs, resolved} = resolveConditionNodeTimeMs(node, cursorMs, runtimeOptions)
			const conditions = nodeConditions(node)
			if (!resolved.length && conditionMode(node) === 'wait' && conditions.length && shouldBlockOnUnresolvedCondition(node, conditions, options)) {
				return walkResult(cursorMs, true, nextContext)
			}
			for (const item of resolved) {
				pushEvent(item.timeMs, options.conditionEvent?.({node, condition: item.condition, timeMs: item.timeMs}), nextContext)
			}
			return walkResult(timeMs, false, nextContext)
		}

		if (type === 'branch') {
			const activeIndex = resolveBranchActiveIndex(node, cursorMs, runtimeOptions)
			const child = (node.Children ?? [])[activeIndex]
			return child ? walk(child, cursorMs, nextContext) : walkResult(cursorMs, false, nextContext)
		}

		if (type === 'action') {
			for (const action of nodeActions(node)) {
				const actionEvents = options.actionEvents?.({node, action, timeMs: cursorMs}) ?? []
				for (const event of actionEvents) {
					pushEvent(cursorMs, event, nextContext)
				}
				recordActionCooldown(action, cursorMs)
			}
		}

		const children = node.Children ?? []
		if (type === 'parallel') {
			let endMs = cursorMs
			for (const child of children) {
				const result = walk(child, cursorMs, nextContext)
				endMs = Math.max(endMs, result.timeMs)
			}
			return walkResult(endMs, false, nextContext)
		}

		let nextMs = cursorMs
		let childContext = nextContext
		for (const child of children) {
			const result = walk(child, nextMs, childContext)
			if (result.blocked) {
				return result
			}
			nextMs = result.timeMs
			childContext = result.context
		}
		return walkResult(nextMs, false, childContext)
	}

	const root = timelineJson?.Root ?? timelineJson?.root
	const result = walk(root, Number(options.initialTimeMs ?? 0), initialContext)
	return {events, endMs: result.timeMs}

	function recordActionCooldown(action, timeMs) {
		const actionId = Number(action?.ActionId)
		if (!Number.isFinite(actionId)) {
			return
		}
		const recastMs = Number(options.actionRecastMs?.({action, timeMs}) ?? 0)
		if (recastMs <= 0) {
			return
		}
		actionReadyAtMs.set(actionId, Math.max(Number(actionReadyAtMs.get(actionId) ?? 0), Number(timeMs ?? 0) + recastMs))
	}

	function actionCooldownReadyMs(condition, cursorMs) {
		if (conditionType(condition) !== 'skillcooldown') {
			return null
		}
		if (!isCooldownReadyWait(condition)) {
			return null
		}
		const actionId = Number(condition.ActionId ?? condition.Regex)
		if (!Number.isFinite(actionId)) {
			return null
		}
		const readyMs = Number(actionReadyAtMs.get(actionId) ?? cursorMs)
		return Math.max(Number(cursorMs ?? 0), readyMs)
	}
}

export function flattenPtlTimeline(timelineJson, options = {}) {
	const anchors = ptlArray(timelineJson, 'Anchors')
	const entries = ptlArray(timelineJson, 'Entries')
	const functionalAnchors = anchors
		.filter(anchor => !ptlBool(anchor, 'IsCommentAnchor') && !ptlBool(anchor, 'IsTechnicalAnchor'))
		.sort((left, right) => ptlNumber(left, 'Time') - ptlNumber(right, 'Time') || ptlString(left, 'Guid').localeCompare(ptlString(right, 'Guid')))
	const events = []
	let sequence = 0
	let endMs = Math.max(...functionalAnchors.map(anchor => secondsToMs(ptlNumber(anchor, 'Time'))), 0)
	let currentPhase = 'P1'
	let currentPhaseStartMs = 0
	let phaseIndex = 1

	for (let index = 0; index < functionalAnchors.length - 1; index += 1) {
		const startAnchor = functionalAnchors[index]
		const endAnchor = functionalAnchors[index + 1]
		const startTimeSeconds = ptlNumber(startAnchor, 'Time')
		const endTimeSeconds = ptlNumber(endAnchor, 'Time')
		const segmentDurationSeconds = endTimeSeconds - startTimeSeconds
		if (segmentDurationSeconds <= 0) {
			continue
		}
		if (ptlBool(startAnchor, 'IsPhaseAnchor') || index === 0) {
			const nextPhase = phaseNameForAnchor(startAnchor, phaseIndex)
			if (nextPhase !== currentPhase || index === 0) {
				currentPhase = nextPhase
				phaseIndex += 1
			}
			currentPhaseStartMs = secondsToMs(startTimeSeconds)
		}
		const segmentEntries = entries
			.filter(entry => ptlEnabled(entry) && sameGuid(ptlString(entry, 'StartAnchorGuid'), ptlString(startAnchor, 'Guid')))
			.sort((left, right) => ptlNumber(left, 'Offset') - ptlNumber(right, 'Offset') || ptlString(left, 'Guid').localeCompare(ptlString(right, 'Guid')))
		for (const entry of segmentEntries) {
			const offsetSeconds = ptlNumber(entry, 'Offset')
			if (offsetSeconds < 0 || offsetSeconds >= segmentDurationSeconds) {
				options.warning?.({kind: 'ptl-entry-out-of-bounds', entry, startAnchor, endAnchor})
				continue
			}
			const entryStartMs = secondsToMs(startTimeSeconds + offsetSeconds)
			const entryGroup = ptlValue(entry, 'EntryGroup') ?? ptlValue(entry, 'EntryGroupDef') ?? {Type: 'serial', Enabled: true}
			const result = flattenPrTimeline({Root: entryGroup}, {
				...options,
				initialTimeMs: entryStartMs,
				initialPhase: currentPhase,
				initialPhaseStartMs: currentPhaseStartMs,
				eventIdPrefix: `ptl-${++sequence}`,
			})
			for (const event of result.events) {
				events.push({
					...event,
					ptlEntryName: ptlString(entry, 'Name'),
					ptlEntryGuid: ptlString(entry, 'Guid'),
					sourceKind: 'ptl',
				})
			}
			endMs = Math.max(endMs, result.endMs)
		}
	}

	return {
		events: events.sort((left, right) => eventTimeMs(left) - eventTimeMs(right)),
		endMs,
	}
}

export function collectBossCastItems(timelineRows = []) {
	return (timelineRows ?? [])
		.filter(row => (row.groupId ?? row.id) === 'boss-casts')
		.flatMap(row => row.items ?? [])
		.filter(item => Number(item.actionId) && Number.isFinite(Number(item.startMs)))
		.map(item => ({
			...item,
			actionId: Number(item.actionId),
			startMs: Number(item.startMs),
		}))
		.sort((left, right) => left.startMs - right.startMs)
}

export function resolveBossCastConditionTimeMs(condition = {}, cursorMs = 0, bossCasts = []) {
	if (conditionType(condition) !== 'caststart') {
		return null
	}
	const actionIds = conditionActionIds(condition)
	if (!actionIds.length) {
		return null
	}
	const cursor = Number(cursorMs ?? 0)
	const match = bossCasts.find(item => actionIds.includes(Number(item.actionId)) && item.startMs >= cursor - 500)
	return match?.startMs ?? null
}

export function normalizePhaseTaggedEvents(events = [], bossSource = null) {
	const windows = phaseWindowsById(bossSource)
	if (!windows.size) {
		return events
	}
	return events.map(event => normalizePhaseTaggedEvent(event, windows))
}

function resolveConditionNodeTimeMs(node, cursorMs, options = {}) {
	const resolved = nodeConditions(node)
		.map(condition => ({
			condition,
			timeMs: resolvedConditionTimeMs(condition, cursorMs, options, node),
		}))
		.filter(item => Number.isFinite(item.timeMs))
	if (!resolved.length) {
		return {timeMs: cursorMs, resolved}
	}
	const times = resolved.map(item => item.timeMs)
	return {
		timeMs: node.UseAndLogic === false ? Math.min(...times) : Math.max(...times),
		resolved,
	}
}

function resolvedConditionTimeMs(condition, cursorMs, options = {}, node = null) {
	const cooldownMs = options.actionCooldownReadyMs?.(condition, cursorMs)
	if (cooldownMs != null) {
		const value = Number(cooldownMs)
		return Number.isFinite(value) ? value : null
	}
	const resolvedMs = options.resolveConditionTimeMs?.(condition, cursorMs, node)
	if (resolvedMs == null) {
		return null
	}
	const value = Number(resolvedMs)
	return Number.isFinite(value) ? value : null
}

function shouldBlockOnUnresolvedCondition(node, conditions, options = {}) {
	if (typeof options.shouldBlockOnUnresolvedCondition === 'function') {
		return Boolean(options.shouldBlockOnUnresolvedCondition({node, conditions}))
	}
	return true
}

function resolveBranchActiveIndex(node, cursorMs, options = {}) {
	const conditions = nodeConditions(node)
	if (!conditions.length) {
		return 0
	}
	if (conditions.some(condition => conditionType(condition) === 'caststart')) {
		return 1
	}
	const resolved = resolveConditionNodeTimeMs(node, cursorMs, options).resolved
	return resolved.length ? 0 : 1
}

function nodeType(node = {}) {
	return String(node.Type ?? '').toLowerCase()
}

function conditionType(condition = {}) {
	return String(condition.Type ?? '').toLowerCase()
}

function conditionActionIds(condition = {}) {
	const rawValue = condition.ActionId ?? condition.Regex
	return String(rawValue ?? '')
		.split('|')
		.map(value => Number(value.trim()))
		.filter(Number.isFinite)
}

function conditionMode(node = {}) {
	return String(node.Mode ?? 'wait').toLowerCase()
}

function isCooldownReadyWait(condition = {}) {
	const mode = String(condition.Mode ?? '<=').trim()
	const value = Number(condition.Value ?? 0)
	return (mode === '<=' || mode === '<') && value <= 0
}

function walkResult(timeMs, blocked = false, context = null) {
	return {timeMs, blocked, context}
}

function nodeConditions(node = {}) {
	if (Array.isArray(node.Conditions) && node.Conditions.length) {
		return node.Conditions
	}
	return node.Condition ? [node.Condition] : []
}

function nodeActions(node = {}) {
	if (Array.isArray(node.Actions) && node.Actions.length) {
		return node.Actions
	}
	return node.Action ? [node.Action] : []
}

function normalizePhaseTaggedEvent(event = {}, windows) {
	const phaseId = normalizedPhaseId(event.phase)
	const phase = phaseId ? windows.get(phaseId) : null
	if (!phase) {
		return event
	}
	const currentTimeMs = eventTimeMs(event)
	if (!Number.isFinite(currentTimeMs)) {
		return {
			...event,
			phaseStartMs: phase.startMs,
		}
	}
	const originalPhaseStartMs = Number(event.phaseStartMs)
	const nextTimeMs = normalizedPhaseEventTimeMs(currentTimeMs, originalPhaseStartMs, phase)
	const deltaMs = nextTimeMs - currentTimeMs
	const next = {
		...event,
		phaseStartMs: phase.startMs,
	}
	if (event.timeMs != null) {
		next.timeMs = nextTimeMs
	}
	if (event.startMs != null) {
		next.startMs = shiftedMs(event.startMs, deltaMs)
	} else if (event.timeMs == null) {
		next.startMs = nextTimeMs
	}
	if (event.endMs != null) {
		next.endMs = shiftedMs(event.endMs, deltaMs)
	}
	return next
}

function normalizedPhaseEventTimeMs(timeMs, originalPhaseStartMs, phase) {
	if (Number.isFinite(originalPhaseStartMs) && originalPhaseStartMs > 0 && Math.abs(originalPhaseStartMs - phase.startMs) > 1) {
		return phase.startMs + Math.max(0, timeMs - originalPhaseStartMs)
	}
	if (timeMs < phase.startMs && phase.startMs - timeMs > 30000 && looksPhaseRelativeTimeMs(timeMs, phase)) {
		return phase.startMs + timeMs
	}
	return timeMs
}

function looksPhaseRelativeTimeMs(timeMs, phase) {
	const phaseDurationMs = Math.max(0, Number(phase.endMs ?? 0) - Number(phase.startMs ?? 0))
	if (phaseDurationMs > 0) {
		return timeMs <= phaseDurationMs + 30000
	}
	return timeMs <= 300000
}

function eventTimeMs(event = {}) {
	const value = Number(event.timeMs ?? event.startMs)
	return Number.isFinite(value) ? value : NaN
}

function shiftedMs(value, deltaMs) {
	const number = Number(value)
	return Number.isFinite(number) ? number + deltaMs : value
}

function phaseWindowsById(bossSource = null) {
	const phases = Array.isArray(bossSource?.phases) ? bossSource.phases : []
	const lastMs = Math.round(Number(bossSource?.lastSecond ?? 0) * 1000)
	return new Map(phases.map((phase, index) => {
		const id = normalizedPhaseId(phase.id)
		const startMs = Math.round(Number(phase.startSecond ?? 0) * 1000)
		const endMs = Math.round(Number(phases[index + 1]?.startSecond ?? bossSource?.lastSecond ?? 0) * 1000)
		return [id || `p${index + 1}`, {
			id: id || `p${index + 1}`,
			startMs,
			endMs: endMs || lastMs,
		}]
	}).filter(([id]) => id))
}

function normalizedPhaseId(phase) {
	const match = /^p?(\d+)$/i.exec(String(phase ?? '').trim())
	return match ? `p${match[1]}` : ''
}

function ptlValue(object = {}, pascalName) {
	const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1)
	return object?.[pascalName] ?? object?.[camelName]
}

function ptlArray(object = {}, pascalName) {
	const value = ptlValue(object, pascalName)
	return Array.isArray(value) ? value : []
}

function ptlString(object = {}, pascalName) {
	const value = ptlValue(object, pascalName)
	return value == null ? '' : String(value)
}

function ptlNumber(object = {}, pascalName) {
	const value = Number(ptlValue(object, pascalName) ?? 0)
	return Number.isFinite(value) ? value : 0
}

function ptlBool(object = {}, pascalName) {
	return Boolean(ptlValue(object, pascalName))
}

function ptlEnabled(object = {}) {
	const value = ptlValue(object, 'Enabled')
	return value !== false
}

function sameGuid(left, right) {
	return String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase()
}

function secondsToMs(seconds) {
	return Math.round(Number(seconds ?? 0) * 1000)
}

function phaseNameForAnchor(anchor = {}, fallbackIndex = 1) {
	const name = ptlString(anchor, 'Name')
	const match = /(?:^|[^a-z0-9])p\s*([0-9]+)/i.exec(name)
	if (match) {
		return `P${match[1]}`
	}
	return `P${fallbackIndex}`
}
