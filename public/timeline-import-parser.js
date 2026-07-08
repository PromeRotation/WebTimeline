export function flattenPrTimeline(timelineJson, options = {}) {
	const events = []
	let sequence = 0
	let currentPhase = 'P1'
	let currentPhaseStartMs = 0
	const actionReadyAtMs = new Map()
	const runtimeOptions = {...options, actionCooldownReadyMs}

	function pushEvent(timeMs, event) {
		if (!event) {
			return
		}
		events.push({
			id: `import-${++sequence}`,
			phase: currentPhase,
			phaseStartMs: currentPhaseStartMs,
			timeMs,
			...event,
		})
	}

	function walk(node, cursorMs) {
		if (!node || node.Enabled === false) {
			return walkResult(cursorMs)
		}

		const type = nodeType(node)
		const phaseMatch = /^(P\d+)/i.exec(node.Name ?? '')
		if (phaseMatch) {
			currentPhase = phaseMatch[1].toUpperCase()
			currentPhaseStartMs = cursorMs
		}

		if (type === 'delay') {
			const durationMs = Number(node.DelayMs ?? 0)
			const nextMs = cursorMs + durationMs
			pushEvent(nextMs, options.delayEvent?.({node, durationMs}))
			return walkResult(nextMs)
		}

		if (type === 'condition') {
			const {timeMs, resolved} = resolveConditionNodeTimeMs(node, cursorMs, runtimeOptions)
			const conditions = nodeConditions(node)
			if (!resolved.length && conditionMode(node) === 'wait' && conditions.length && shouldBlockOnUnresolvedCondition(node, conditions, options)) {
				return walkResult(cursorMs, true)
			}
			for (const item of resolved) {
				pushEvent(item.timeMs, options.conditionEvent?.({node, condition: item.condition, timeMs: item.timeMs}))
			}
			return walkResult(timeMs)
		}

		if (type === 'branch') {
			const activeIndex = resolveBranchActiveIndex(node, cursorMs, runtimeOptions)
			const child = (node.Children ?? [])[activeIndex]
			return child ? walk(child, cursorMs) : walkResult(cursorMs)
		}

		if (type === 'action') {
			for (const action of nodeActions(node)) {
				const actionEvents = options.actionEvents?.({node, action, timeMs: cursorMs}) ?? []
				for (const event of actionEvents) {
					pushEvent(cursorMs, event)
				}
				recordActionCooldown(action, cursorMs)
			}
		}

		const children = node.Children ?? []
		if (type === 'parallel') {
			let endMs = cursorMs
			for (const child of children) {
				const result = walk(child, cursorMs)
				endMs = Math.max(endMs, result.timeMs)
			}
			return walkResult(endMs)
		}

		let nextMs = cursorMs
		for (const child of children) {
			const result = walk(child, nextMs)
			if (result.blocked) {
				return result
			}
			nextMs = result.timeMs
		}
		return walkResult(nextMs)
	}

	const result = walk(timelineJson.Root, 0)
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

function walkResult(timeMs, blocked = false) {
	return {timeMs, blocked}
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
	if (timeMs < phase.startMs && phase.startMs - timeMs > 30000) {
		return phase.startMs + timeMs
	}
	return timeMs
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
