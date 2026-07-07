const EVENT_CAST_START = '20'
const EVENT_ABILITY = new Set(['21', '22'])

export function parseLogLine(line) {
	const parts = line.trimEnd().split('|')
	return {
		raw: line.trimEnd(),
		eventType: parts[0],
		timestamp: parts[1],
		fields: parts.slice(2),
	}
}

export function parseCastLine(record) {
	const fields = record.fields
	return {
		type: 'cast',
		timestamp: record.timestamp,
		sourceId: fields[0] ?? '',
		sourceName: fields[1] ?? '',
		actionIdHex: normalizeHex(fields[2]),
		actionId: parseHexInt(fields[2]),
		actionName: fields[3] ?? '',
		targetId: fields[4] ?? '',
		targetName: fields[5] ?? '',
		castDurationSeconds: Number(fields[6] ?? 0),
		position: {
			x: numberOrNull(fields[7]),
			y: numberOrNull(fields[8]),
			z: numberOrNull(fields[9]),
			heading: numberOrNull(fields[10]),
		},
		raw: record.raw,
	}
}

export function parseAbilityLine(record) {
	const fields = record.fields
	const effects = []
	for (let index = 0; index < 8; index += 1) {
		const effectType = fields[6 + index * 2]
		const rawValue = fields[7 + index * 2]
		if (!effectType || effectType === '0') {
			continue
		}
		effects.push({
			slot: index,
			type: normalizeHex(effectType),
			rawValue: normalizeHex(rawValue),
			decodedValue: decodeLittleEndianHex(rawValue),
			damageCandidate: decodeDamageCandidate(rawValue),
			isDamage: isDamageEffect(effectType),
		})
	}

	return {
		type: 'ability',
		timestamp: record.timestamp,
		sourceId: fields[0] ?? '',
		sourceName: fields[1] ?? '',
		actionIdHex: normalizeHex(fields[2]),
		actionId: parseHexInt(fields[2]),
		actionName: fields[3] ?? '',
		targetId: fields[4] ?? '',
		targetName: fields[5] ?? '',
		effects,
		targetCurrentHp: parseDecimalInt(fields[22]),
		targetMaxHp: parseDecimalInt(fields[23]),
		targetCurrentMp: parseDecimalInt(fields[24]),
		targetMaxMp: parseDecimalInt(fields[25]),
		sourceCurrentHp: parseDecimalInt(fields[32]),
		sourceMaxHp: parseDecimalInt(fields[33]),
		sequenceId: fields[42] ?? '',
		targetIndex: parseDecimalInt(fields[43]),
		targetCount: parseDecimalInt(fields[44]),
		raw: record.raw,
	}
}

export function isCastStart(record) {
	return record.eventType === EVENT_CAST_START
}

export function isAbility(record) {
	return EVENT_ABILITY.has(record.eventType)
}

export function decodeLittleEndianHex(value) {
	const hex = normalizeHex(value)
	if (!hex || hex.length % 2 !== 0) {
		return 0
	}
	const bytes = hex.match(/../g)
	if (!bytes) {
		return 0
	}
	return Number.parseInt([...bytes].reverse().join(''), 16)
}

export function decodeDamageCandidate(value) {
	const hex = normalizeHex(value)
	if (hex.length < 4) {
		return 0
	}
	const lowBytes = hex.slice(0, 4).match(/../g)
	return lowBytes ? Number.parseInt([...lowBytes].reverse().join(''), 16) : 0
}

export function parseHexInt(value) {
	const hex = normalizeHex(value)
	return hex ? Number.parseInt(hex, 16) : 0
}

export function isDamageEffect(value) {
	return normalizeHex(value).endsWith('03')
}

export function normalizeHex(value = '') {
	return String(value).trim().toUpperCase()
}

function numberOrNull(value) {
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

function parseDecimalInt(value) {
	const number = Number.parseInt(value ?? '', 10)
	return Number.isFinite(number) ? number : null
}
