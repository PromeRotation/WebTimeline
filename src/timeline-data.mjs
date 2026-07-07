import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {DEFAULT_SKILL_DATABASE, classifyAction} from './skill-database.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')

const ACTION_LABELS = new Map([
	[7531, '铁壁'],
	[7533, '挑衅'],
	[7535, '雪仇'],
	[7537, '退避'],
	[7393, '至黑之夜'],
	[7394, '暗影墙'],
	[7395, '暗黑布道'],
	[7396, '行尸走肉'],
	[16472, '弗雷'],
	[25754, '献奉'],
])

const BOSS_DAMAGE_HINTS = new Map([
	['47764', 176000],
	['50722', 228000],
	['50179', 312000],
	['47952', 258000],
])

export async function loadFixture(relativePath) {
	const absolutePath = path.resolve(projectDir, relativePath)
	return JSON.parse(await readFile(absolutePath, 'utf8'))
}

export function flattenTimeline(timeline, skillDatabase = DEFAULT_SKILL_DATABASE) {
	const events = []
	let sequence = 0
	let currentPhase = 'P1'
	let currentPhaseStartMs = 0
	let cursorMs = 0

	function pushEvent(event) {
		events.push({
			id: `e-${++sequence}`,
			phase: currentPhase,
			phaseStartMs: currentPhaseStartMs,
			timeMs: cursorMs,
			...event,
		})
	}

	function walk(node) {
		if (!node || node.Enabled === false) {
			return
		}

		const phaseMatch = /^(P\d+)/i.exec(node.Name ?? '')
		if (phaseMatch) {
			currentPhase = phaseMatch[1].toUpperCase()
			currentPhaseStartMs = cursorMs
		}

		if (node.Type === 'delay') {
			cursorMs += Number(node.DelayMs ?? 0)
			pushEvent({
				kind: 'delay',
				name: node.Name ?? '延迟',
				source: 'timeline',
				durationMs: Number(node.DelayMs ?? 0),
			})
			return
		}

		if (node.Type === 'condition') {
			const condition = first(node.Conditions) ?? node.Condition
			const isCast = condition?.Type === 'CastStart'
			const actionId = condition?.ActionId ?? condition?.Regex
			const duration = parseCastDuration(node.Name)
			pushEvent({
				kind: isCast ? 'boss-cast' : condition?.Type === 'Weather' ? 'phase-sync' : 'condition',
				name: cleanName(node.Name),
				source: 'boss',
				actionId,
				damage: isCast ? BOSS_DAMAGE_HINTS.get(String(actionId)) ?? 0 : 0,
				castDurationMs: duration,
				castStartLabel: isCast ? '读条' : '',
				castEndLabel: isCast ? '结束' : '',
			})
		}

		if (node.Type === 'action') {
			for (const action of node.Actions ?? []) {
				const actionId = action.ActionId ?? action.Type
				const kind = action.Type === 'BatchTriggerQt' ? 'qt-control' : action.Type === 'UsePotion' ? 'potion' : 'player-action'
				const name = actionName(node.Name, action, skillDatabase)
				const classification = classifyAction(actionId, name, skillDatabase, {kind})
				const timelineLabel = cleanName(node.Name)
				pushEvent({
					kind,
					name,
					timelineLabel: timelineLabel === name ? '' : timelineLabel,
					source: 'timeline',
					actionId,
					target: action.Target ?? '',
					highPriority: Boolean(action.HighPriority),
					skillType: action.SkillType ?? action.Type,
					qtStates: action.QtStates ?? [],
					classification: classification.type,
					output: classification.output,
					potency: classification.potency,
					durationMs: classification.effectDurationMs ?? 0,
					count: 1,
				})
			}
		}

		for (const child of node.Children ?? []) {
			walk(child)
		}
	}

	walk(timeline.Root)
	return events
}

export function buildModeTracks(events) {
	const boss = events.filter(event => event.kind === 'boss-cast')
	const player = events.filter(event => ['player-action', 'potion', 'qt-control'].includes(event.kind))
	const mitigation = player.filter(isCoverageAction)
	const burst = buildBurstGroups(player)

	return {
		beginner: {
			boss: boss.filter((_, index) => index % 2 === 0).slice(0, 18),
			mitigation: mitigation.slice(0, 16),
			burst,
			qt: collectQtControls(player).slice(0, 18),
		},
		expert: {
			boss,
			player,
			mitigation,
			burst,
			qt: collectQtControls(player),
		},
	}
}

export function buildTimelineRows(events, manualItems = [], simulatedItems = []) {
	const bossCasts = events
		.filter(event => event.kind === 'boss-cast')
		.map(event => ({
			id: event.id,
			type: 'cast',
			label: event.name,
			startMs: event.timeMs,
			endMs: event.timeMs + (event.castDurationMs ?? 4700),
			timeLabel: formatClock(event.timeMs),
			damage: event.damage ?? 0,
			actionId: event.actionId,
		}))

	const bossDamage = bossCasts.map(item => ({
		...item,
		id: `${item.id}-damage`,
		type: 'damage',
		label: item.damage > 0 ? `${item.damage}` : '0',
		startMs: item.endMs,
		endMs: item.endMs + 1200,
	}))

	const playerActions = events
		.filter(event => event.kind === 'player-action')
		.filter(event => !isCoverageAction(event))
		.map(event => actionItem(event, 'action'))

	const mitigationActions = events
		.filter(event => event.kind === 'player-action')
		.filter(isCoverageAction)
		.map(event => actionItem(event, 'action'))

	const qtPotion = events
		.filter(event => event.kind === 'qt-control' || event.kind === 'potion')
		.map(event => actionItem(event, event.kind === 'potion' ? 'potion' : 'qt'))

	const manual = manualItems.map((item, index) => ({
		id: item.id ?? `manual-${index}`,
		type: 'manual',
		label: item.name,
		startMs: item.timeMs ?? 0,
		endMs: (item.timeMs ?? 0) + 1600,
		timeLabel: formatClock(item.timeMs ?? 0),
		potency: item.potency ?? 0,
	}))

	const simulated = simulatedItems.map((event, index) => ({
		id: event.id ?? `simulated-${index}`,
		type: event.output ? 'simulated-gcd' : 'simulated-action',
		label: event.name,
		startMs: event.timeMs ?? 0,
		endMs: (event.timeMs ?? 0) + 1600,
		timeLabel: formatClock(event.timeMs ?? 0),
		actionId: event.actionId,
		potency: event.potency ?? 0,
		iconUrl: event.iconUrl ?? '',
		source: event.source ?? 'ACR',
		simulated: true,
		output: Boolean(event.output),
	}))

	return [
		{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: bossCasts.slice(0, 72)},
		{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: bossDamage.slice(0, 72)},
		{id: 'player-actions', label: 'Player Actions', accent: 'mint', items: playerActions.slice(0, 96)},
		{id: 'mitigation-actions', label: '减伤 / 奶轴', accent: 'mint', items: mitigationActions.slice(0, 160)},
		{id: 'acr-simulated', label: 'ACR 模拟', accent: 'sky', items: simulated},
		{id: 'qt-potion', label: 'QT / Potion', accent: 'violet', items: qtPotion.slice(0, 48)},
		{id: 'manual-insert', label: 'Manual Insert', accent: 'orange', items: manual},
	]
}

function isCoverageAction(event) {
	return event.classification === 'mitigation' || event.classification === 'healing'
}

function buildBurstGroups(playerEvents) {
	const potionEvents = playerEvents.filter(event => event.kind === 'potion' || /爆发药|弗雷|倾泻|爆发/.test(event.name))
	const groups = []
	for (let index = 0; index < Math.max(4, potionEvents.length); index++) {
		groups.push({
			window: index % 2 === 0 ? '120s' : '60s',
			name: index % 2 === 0 ? '120 爆发整合' : '60 爆发整合',
			timeMs: index * 60000,
			qt: index % 2 === 0 ? ['爆发药', '弗雷', '暗影使者', '倾泻爆发'] : ['弗雷', '暗影锋', '卸蓝'],
		})
	}
	return groups
}

function collectQtControls(events) {
	const controls = []
	for (const event of events) {
		if (event.kind === 'qt-control' && event.qtStates?.length) {
			for (const state of event.qtStates) {
				controls.push({
					name: state.Name,
					enabled: Boolean(state.Enabled),
					timeMs: event.timeMs,
				})
			}
		}
	}
	return controls
}

function actionItem(event, type) {
	const durationMs = actionDurationMs(event, type)
	const itemType = actionItemType(event, type)
	return {
		id: event.id,
		type: itemType,
		label: event.name,
		startMs: event.timeMs,
		endMs: event.timeMs + durationMs,
		timeLabel: formatClock(event.timeMs),
		actionId: event.actionId,
		potency: event.potency ?? 0,
		target: event.target,
		durationMs,
		classification: event.classification,
		iconUrl: event.iconUrl ?? '',
		timelineLabel: event.timelineLabel ?? '',
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
	}
}

function actionDurationMs(event, type) {
	const eventDuration = Number(event.durationMs ?? 0)
	if (eventDuration > 0) {
		return eventDuration
	}
	if (type === 'qt') {
		return 2500
	}
	return 1600
}

function actionItemType(event, fallbackType) {
	if (event.classification === 'mitigation' || event.classification === 'healing' || event.classification === 'dot') {
		return event.classification
	}
	return fallbackType
}

function formatClock(ms = 0) {
	const total = Math.max(0, Math.round(ms / 1000))
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function cleanName(name = '') {
	return name.replace(/\s*读条时间:.*/, '').replace(/\s*\[.*?\]/g, '').trim() || '事件'
}

function actionName(nodeName = '', action, skillDatabase = DEFAULT_SKILL_DATABASE) {
	if (action.Type === 'BatchTriggerQt') {
		return cleanName(nodeName)
	}
	if (action.Type === 'UsePotion') {
		return '爆发药'
	}
	const actionId = Number(action.ActionId)
	const databaseAction = Number.isFinite(actionId)
		? skillDatabase?.actionsById?.[actionId] ?? skillDatabase?.actionsById?.[String(actionId)]
		: null
	return databaseAction?.name || ACTION_LABELS.get(actionId) || `技能 ${action.ActionId}`
}

function parseCastDuration(name = '') {
	const match = /读条时间:(\d+(?:\.\d+)?)/.exec(name)
	return match ? Math.round(Number(match[1]) * 1000) : 4700
}

function first(value) {
	return Array.isArray(value) ? value[0] : value
}
