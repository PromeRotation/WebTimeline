export function estimateDamage(events, profile = {}) {
	const attackPower = Number(profile.attackPower ?? 100)
	const critRate = clamp(Number(profile.critRate ?? 0.15), 0, 1)
	const directRate = clamp(Number(profile.directRate ?? 0.25), 0, 1)
	const luck = profile.luck ?? 'average'
	const luckBonus = luck === 'lucky' ? 0.22 : luck === 'low' ? -0.12 : 0
	const critMultiplier = 1 + critRate * 0.45
	const directMultiplier = 1 + directRate * 0.25
	const luckMultiplier = 1 + luckBonus

	const phases = {}
	let total = 0

	for (const event of events) {
		const count = Number(event.count ?? 1)
		const potency = Number(event.potency ?? 0)
		const damage = Math.round(potency * count * attackPower * critMultiplier * directMultiplier * luckMultiplier)
		const phase = event.phase ?? '全局'
		phases[phase] ??= {damage: 0, events: 0}
		phases[phase].damage += damage
		phases[phase].events += count
		total += damage
	}

	return {total, phases}
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value))
}
