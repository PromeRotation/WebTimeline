import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {DEFAULT_SKILL_DATABASE, classifyAction} from './skill-database.mjs'

const DEFAULT_KANO_OPENER_PATH = 'F:/acr开发/KanoACR/Kano/Opener/MtFruLevel100Opener.cs'
const GCD_STEP_MS = 2500
const WEAVE_OFFSET_MS = 700
const DRK_LEVEL_100_ADJUSTED_ACTIONS = new Map([
	[3636, 36927],
])

export async function loadKanoDrkSourceOpener(skillDatabase = DEFAULT_SKILL_DATABASE, options = {}) {
	const sourcePath = path.resolve(options.sourcePath ?? DEFAULT_KANO_OPENER_PATH)
	const source = await readFile(sourcePath, 'utf8')
	const constants = parseUintConstants(source)
	const name = decodeCSharpString(extractConstString(source, 'Name') ?? 'MT妖星乱舞100级起手')
	const sequenceBody = extractInCombatSequenceBody(source)
	const actions = parseInCombatSequence(sequenceBody, constants, options)
	const events = actions.map((action, index) => toOpenerEvent(action, index, skillDatabase))

	return {
		source: {
			acr: 'KANO',
			job: 'DRK',
			name,
			path: sourcePath,
			source: 'ACR 源码',
		},
		events,
	}
}

function parseUintConstants(source) {
	const constants = new Map()
	const pattern = /const\s+uint\s+(\w+)\s*=\s*(\d+)\s*;/g
	for (const match of source.matchAll(pattern)) {
		constants.set(match[1], Number(match[2]))
	}
	return constants
}

function extractConstString(source, constName) {
	const pattern = new RegExp(`const\\s+string\\s+${constName}\\s*=\\s*"((?:\\\\.|[^"])*)"\\s*;`)
	return pattern.exec(source)?.[1] ?? null
}

function extractInCombatSequenceBody(source) {
	const marker = 'public List<PAction> InCombatSequence'
	const markerIndex = source.indexOf(marker)
	if (markerIndex < 0) {
		return ''
	}
	const getIndex = source.indexOf('get', markerIndex)
	const openIndex = source.indexOf('{', getIndex)
	return extractBalancedBlock(source, openIndex)
}

function parseInCombatSequence(body, constants, options = {}) {
	const actions = []
	let gcdIndex = 0
	let weaveIndex = 0

	const tokens = body.match(/AddPotionIfEnabled\(sequence\)|sequence\.Add\((?:G|O)\([^;]+?\)\)|(?:G|O)\([^;\n]+?\)/g) ?? []
	for (const token of tokens) {
		if (token.startsWith('AddPotionIfEnabled')) {
			if (options.includePotion !== false) {
				actions.push({
					timeMs: timeForAction('ogcd', gcdIndex, weaveIndex),
					actionId: Number(options.potionActionId ?? 44162),
					label: '爆发药',
					weave: 'item',
					sourceLine: token,
					conditional: true,
				})
				weaveIndex += 1
			}
			continue
		}

		const action = parseActionToken(token, constants)
		if (!action) {
			continue
		}
		action.timeMs = timeForAction(action.weave, gcdIndex, weaveIndex)
		actions.push(action)

		if (action.weave === 'gcd') {
			gcdIndex += 1
			weaveIndex = 0
		} else {
			weaveIndex += 1
		}
	}

	return actions
}

function parseActionToken(token, constants) {
	const match = /(?:sequence\.Add\()?([GO])\((\w+)(?:,\s*([^)]+))?\)/.exec(token)
	if (!match) {
		return null
	}
	const actionId = constants.get(match[2])
	if (!actionId) {
		return null
	}
	return {
		actionId,
		weave: match[1] === 'G' ? 'gcd' : 'ogcd',
		target: normalizeTarget(match[3]),
		sourceLine: token,
	}
}

function timeForAction(weave, gcdIndex, weaveIndex) {
	if (weave === 'gcd') {
		return gcdIndex * GCD_STEP_MS
	}
	const currentGcdStartMs = Math.max(0, gcdIndex - 1) * GCD_STEP_MS
	return currentGcdStartMs + WEAVE_OFFSET_MS + weaveIndex * WEAVE_OFFSET_MS
}

function toOpenerEvent(action, index, skillDatabase) {
	const actionId = adjustDrkLevel100Action(action.actionId)
	const skill = findAction(skillDatabase, actionId)
	const name = action.label ?? skill?.name ?? `技能 ${actionId}`
	const classification = classifyAction(actionId, name, skillDatabase, {kind: action.weave === 'item' ? 'potion' : 'player-action'})
	return {
		id: `kano-source-opener-${index + 1}`,
		kind: action.weave === 'item' ? 'potion' : 'player-action',
		source: 'KANO ACR 源码',
		acr: 'KANO',
		job: 'DRK',
		opener: true,
		conditional: Boolean(action.conditional),
		phase: 'Opener',
		timeMs: action.timeMs,
		name,
		actionId,
		sourceActionId: action.actionId,
		skillType: action.weave === 'gcd' ? 'GCD' : action.weave === 'item' ? 'Item' : 'oGCD',
		weave: action.weave,
		target: action.target ?? 'target',
		classification: classification.type,
		output: classification.output,
		potency: classification.potency,
		iconUrl: skill?.iconUrl ?? '',
		count: 1,
		sourceLine: action.sourceLine,
	}
}

function adjustDrkLevel100Action(actionId) {
	return DRK_LEVEL_100_ADJUSTED_ACTIONS.get(Number(actionId)) ?? actionId
}

function extractBalancedBlock(source, openIndex) {
	if (openIndex < 0) {
		return ''
	}
	let depth = 0
	for (let index = openIndex; index < source.length; index += 1) {
		const char = source[index]
		if (char === '{') {
			depth += 1
		}
		if (char === '}') {
			depth -= 1
			if (depth === 0) {
				return source.slice(openIndex + 1, index)
			}
		}
	}
	return ''
}

function decodeCSharpString(value) {
	return String(value).replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/\\"/g, '"')
}

function normalizeTarget(raw = '') {
	const value = String(raw).trim()
	if (!value) {
		return 'target'
	}
	if (value.includes('Self')) {
		return 'self'
	}
	if (value.includes('Party2')) {
		return 'party2'
	}
	return value
}

function findAction(skillDatabase, actionId) {
	return skillDatabase?.actionsById?.[actionId] ?? skillDatabase?.actionsById?.[String(actionId)] ?? null
}
