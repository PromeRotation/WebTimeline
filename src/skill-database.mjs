const GARLAND_BROWSE_URL = 'https://garlandtools.cn/db/doc/browse/chs/2/action.json'
const GARLAND_ACTION_URL = id => `https://garlandtools.cn/db/doc/action/chs/2/${id}.json`

export const COMBAT_JOBS = [
	{id: 'PLD', jobId: 19, name: '骑士', role: 'Tank'},
	{id: 'WAR', jobId: 21, name: '战士', role: 'Tank'},
	{id: 'DRK', jobId: 32, name: '暗黑骑士', role: 'Tank'},
	{id: 'GNB', jobId: 37, name: '绝枪战士', role: 'Tank'},
	{id: 'WHM', jobId: 24, name: '白魔法师', role: 'Healer'},
	{id: 'SCH', jobId: 28, name: '学者', role: 'Healer'},
	{id: 'AST', jobId: 33, name: '占星术士', role: 'Healer'},
	{id: 'SGE', jobId: 40, name: '贤者', role: 'Healer'},
	{id: 'MNK', jobId: 20, name: '武僧', role: 'Melee'},
	{id: 'DRG', jobId: 22, name: '龙骑士', role: 'Melee'},
	{id: 'NIN', jobId: 30, name: '忍者', role: 'Melee'},
	{id: 'SAM', jobId: 34, name: '武士', role: 'Melee'},
	{id: 'RPR', jobId: 39, name: '钐镰客', role: 'Melee'},
	{id: 'VPR', jobId: 41, name: '蝰蛇剑士', role: 'Melee'},
	{id: 'BRD', jobId: 23, name: '吟游诗人', role: 'Physical Ranged'},
	{id: 'MCH', jobId: 31, name: '机工士', role: 'Physical Ranged'},
	{id: 'DNC', jobId: 38, name: '舞者', role: 'Physical Ranged'},
	{id: 'BLM', jobId: 25, name: '黑魔法师', role: 'Caster'},
	{id: 'SMN', jobId: 27, name: '召唤师', role: 'Caster'},
	{id: 'RDM', jobId: 35, name: '赤魔法师', role: 'Caster'},
	{id: 'PCT', jobId: 42, name: '绘灵法师', role: 'Caster'},
	{id: 'BLU', jobId: 36, name: '青魔法师', role: 'Limited'},
	{id: 'BST', jobId: 43, name: '驯兽师', role: 'Limited'},
]

const ROLE_ACTION_JOB_ID = 1
const COMBAT_JOB_IDS = new Set(COMBAT_JOBS.map(job => job.jobId))
const JOB_BY_ID = new Map(COMBAT_JOBS.map(job => [job.jobId, job]))

const DEFAULT_BROWSE_ACTIONS = [
	{i: 7531, n: '铁壁', c: 801, j: 1, t: 4, l: 8},
	{i: 7533, n: '挑衅', c: 803, j: 1, t: 4, l: 15},
	{i: 7535, n: '雪仇', c: 806, j: 1, t: 4, l: 22},
	{i: 7537, n: '退避', c: 810, j: 1, t: 4, l: 48},
	{i: 3617, n: '重斩', c: 3051, j: 32, t: 3, l: 1},
	{i: 3623, n: '吸收斩', c: 3052, j: 32, t: 3, l: 2},
	{i: 3624, n: '伤残', c: 3062, j: 32, t: 2, l: 15},
	{i: 3632, n: '噬魂斩', c: 3053, j: 32, t: 3, l: 26},
	{i: 3621, n: '释放', c: 3056, j: 32, t: 3, l: 6},
	{i: 16468, n: '刚魂', c: 3084, j: 32, t: 3, l: 72},
	{i: 7391, n: '寂灭', c: 3079, j: 32, t: 3, l: 62},
	{i: 7392, n: '血溅', c: 3080, j: 32, t: 3, l: 62},
	{i: 36928, n: '血红乱', c: 3095, j: 32, t: 3, l: 96},
	{i: 36929, n: '报应', c: 3096, j: 32, t: 3, l: 96},
	{i: 36930, n: '戮山', c: 3097, j: 32, t: 3, l: 96},
	{i: 36931, n: '刺穿', c: 3098, j: 32, t: 3, l: 96},
	{i: 36932, n: '掠影的蔑视', c: 3099, j: 32, t: 3, l: 100},
	{i: 16466, n: '暗黑波动', c: 3082, j: 32, t: 4, l: 30},
	{i: 16467, n: '暗黑锋', c: 3083, j: 32, t: 4, l: 40},
	{i: 3643, n: '精雕怒斩', c: 3058, j: 32, t: 4, l: 60},
	{i: 3641, n: '吸血深渊', c: 3059, j: 32, t: 4, l: 56},
	{i: 16469, n: '暗影波动', c: 3085, j: 32, t: 4, l: 74},
	{i: 16470, n: '暗影锋', c: 3086, j: 32, t: 4, l: 74},
	{i: 16472, n: '掠影示现', c: 3088, j: 32, t: 4, l: 80},
	{i: 25757, n: '暗影使者', c: 3090, j: 32, t: 4, l: 90},
	{i: 3639, n: '腐秽大地', c: 3063, j: 32, t: 4, l: 52},
	{i: 25755, n: '腐秽黑暗', c: 3091, j: 32, t: 4, l: 86},
	{i: 3629, n: '深恶痛绝', c: 3062, j: 32, t: 4, l: 15},
	{i: 7390, n: '血乱', c: 3078, j: 32, t: 4, l: 68},
	{i: 3634, n: '弃明投暗', c: 3076, j: 32, t: 4, l: 38},
	{i: 3636, n: '暗影墙', c: 3057, j: 32, t: 4, l: 38},
	{i: 3638, n: '行尸走肉', c: 3077, j: 32, t: 4, l: 50},
	{i: 7393, n: '至黑之夜', c: 3081, j: 32, t: 4, l: 70},
	{i: 16471, n: '暗黑布道', c: 3087, j: 32, t: 4, l: 76},
	{i: 25754, n: '献奉', c: 3089, j: 32, t: 4, l: 82},
	{i: 36927, n: '暗影卫', c: 3094, j: 32, t: 4, l: 92},
	{i: 137, n: '再生', c: 2628, j: 24, t: 2, l: 35},
	{i: 3569, n: '庇护所', c: 2632, j: 24, t: 4, l: 52},
	{i: 7432, n: '神祝祷', c: 2638, j: 24, t: 4, l: 66},
	{i: 7433, n: '全大赦', c: 2639, j: 24, t: 4, l: 70},
	{i: 16532, n: '天辉', c: 2641, j: 24, t: 2, l: 72},
	{i: 16536, n: '节制', c: 2645, j: 24, t: 4, l: 80},
	{i: 25861, n: '水流幕', c: 2648, j: 24, t: 4, l: 86},
	{i: 25862, n: '礼仪之铃', c: 2649, j: 24, t: 4, l: 90},
	{i: 37011, n: '神爱抚', c: 2128, j: 24, t: 4, l: 100},
	{i: 24298, n: '坚角清汁', c: 3666, j: 40, t: 4, l: 50},
	{i: 24300, n: '活化', c: 3668, j: 40, t: 4, l: 56},
	{i: 24302, n: '自生II', c: 3670, j: 40, t: 4, l: 60},
	{i: 24303, n: '白牛清汁', c: 3671, j: 40, t: 4, l: 62},
	{i: 24305, n: '输血', c: 3673, j: 40, t: 4, l: 70},
	{i: 24310, n: '整体论', c: 3678, j: 40, t: 4, l: 76},
	{i: 24311, n: '泛输血', c: 3679, j: 40, t: 4, l: 80},
	{i: 37035, n: '智慧之爱', c: 3690, j: 40, t: 4, l: 100},
]

const DEFAULT_DETAILS = {
	7531: {description: '一定时间内，将自身所受的伤害减轻20%'},
	7533: {description: '向目标进行挑衅，令目标对自身的仇恨变为最高后，继续提高自身仇恨'},
	7535: {description: '使自身周围的敌人攻击伤害降低10%'},
	7537: {description: '将自身仇恨的25%转移给目标队员'},
	3617: {description: '对目标发动物理攻击 威力：300'},
	3623: {description: '对目标发动物理攻击 威力：380'},
	3624: {description: '对目标发动无属性魔法攻击 威力：150', gcd: true},
	3632: {description: '对目标发动物理攻击 威力：480'},
	3621: {description: '对自身周围的敌人发动范围物理攻击 威力：120'},
	16468: {description: '对自身周围的敌人发动范围物理攻击 威力：160'},
	7391: {description: '对自身周围的敌人发动范围物理攻击 威力：240'},
	7392: {description: '对目标发动物理攻击 威力：600'},
	36928: {description: '对目标发动物理攻击 威力：620'},
	36929: {description: '对目标发动物理攻击 威力：720'},
	36930: {description: '对目标发动物理攻击 威力：820'},
	36931: {description: '向目标所在方向发出无属性直线范围物理攻击 威力：320'},
	36932: {description: '向目标所在方向发出无属性直线范围物理攻击 威力：1000'},
	16466: {description: '向目标所在方向发出无属性直线范围魔法攻击 威力：100'},
	16467: {description: '对目标发动无属性魔法攻击 威力：300'},
	3643: {description: '对目标发动物理攻击 威力：540 追加效果：恢复自身体力'},
	3641: {description: '对目标及其周围敌人发动无属性范围魔法攻击 威力：240'},
	16469: {description: '向目标所在方向发出无属性直线范围魔法攻击 威力：160'},
	16470: {description: '对目标发动无属性魔法攻击 威力：420'},
	16472: {description: '令英雄的掠影变为实体与自身并肩作战 英雄的掠影的攻击威力：420'},
	25757: {description: '向目标所在方向发出无属性直线范围魔法攻击 威力：570'},
	3639: {description: '指定地面产生伤害区域，范围内敌人受到无属性持续伤害 威力：50'},
	25755: {description: '腐秽大地变为腐秽黑暗，对范围内敌人造成无属性魔法伤害 威力：500'},
	3629: {description: '对目标发动无属性魔法攻击 威力：240'},
	7390: {description: '为自身附加血乱状态，不需要消耗暗血就可以发动血溅和寂灭'},
	3634: {description: '一定时间内，令自身所受到的物理伤害减轻10%、魔法伤害减轻20%'},
	3636: {description: '一定时间内，将自身所受的伤害减轻30% 持续时间：15秒'},
	3638: {description: '受到致命伤也不会陷入无法战斗状态，代价是自身体力降为1'},
	7393: {description: '为自身或一名队员附加能够抵御一定伤害的防护罩'},
	16471: {description: '一定时间内，令自身和周围队员所受到的物理伤害减轻5%、魔法伤害减轻10%', recast: 90000},
	25754: {description: '令自身或一名队员受到的伤害减轻10%'},
	36927: {description: '一定时间内，将自身所受的伤害减轻40%'},
	137: {description: '令目标体力持续恢复 恢复力：250 持续时间：18秒'},
	3569: {description: '以指定地点为中心产生治疗区域，持续恢复进入该区域的自身及队员的体力 恢复力：100 持续时间：24秒'},
	7432: {description: '为自身或一名队员附加能够抵御一定伤害的防护罩 持续时间：15秒'},
	7433: {description: '一定时间内，令自身和周围队员所受到的伤害减轻10% 持续时间：10秒'},
	16532: {description: '对目标发动无属性魔法攻击 威力：65 追加效果：无属性持续伤害 威力：65 持续时间：30秒'},
	16536: {description: '自身发动治疗魔法的治疗量提高20%，自身与周围队员受到的伤害减轻10% 持续时间：20秒 追加效果：神爱抚预备 持续时间：30秒'},
	25861: {description: '令自身或一名队员受到的伤害减轻15% 持续时间：8秒'},
	25862: {description: '在指定地点设置礼仪之铃，同时为自身附加5档礼仪之铃状态，消耗档数恢复自身和队员体力 持续时间：20秒'},
	37011: {description: '为自身及周围队员附加能够抵御一定伤害的防护罩 持续时间：10秒 追加效果：目标体力持续恢复 持续时间：15秒'},
}

const DEFAULT_DETAIL_IDS = Object.keys(DEFAULT_DETAILS).map(Number)
const ACTION_CLASSIFICATION_OVERRIDES = new Map([
	[24298, {type: 'mitigation', output: false, potency: 0, effectDurationMs: 15000}],
	[24300, {type: 'healing', output: false, potency: 0, effectDurationMs: 30000}],
	[24302, {type: 'healing', output: false, potency: 0, effectDurationMs: 15000}],
	[24303, {type: 'mitigation', output: false, potency: 0, effectDurationMs: 15000}],
	[24305, {type: 'mitigation', output: false, potency: 0, effectDurationMs: 15000}],
	[24310, {type: 'mitigation', output: false, potency: 0, effectDurationMs: 30000}],
	[24311, {type: 'mitigation', output: false, potency: 0, effectDurationMs: 15000}],
	[37035, {type: 'healing', output: false, potency: 0, effectDurationMs: 20000}],
])
const EFFECT_DURATION_OVERRIDES_MS = new Map([
	[137, 18000],
	[3569, 24000],
	[7432, 15000],
	[7433, 10000],
	[7531, 20000],
	[7535, 15000],
	[3634, 10000],
	[3636, 15000],
	[3638, 10000],
	[7393, 7000],
	[16532, 30000],
	[16536, 20000],
	[16471, 15000],
	[25754, 10000],
	[25861, 8000],
	[25862, 20000],
	[36927, 15000],
	[37011, 10000],
])
const RECAST_OVERRIDES_MS = new Map([
	[7531, 90000],
	[7533, 30000],
	[7535, 60000],
	[7537, 120000],
	[3634, 120000],
	[3636, 120000],
	[3638, 300000],
	[7390, 60000],
	[7393, 15000],
	[16471, 90000],
	[25754, 60000],
	[36927, 120000],
])

export function buildSkillDatabase(source = {}) {
	const browse = Array.isArray(source.browse) && source.browse.length ? source.browse : DEFAULT_BROWSE_ACTIONS
	const details = mergeActionDetails(DEFAULT_DETAILS, source.details ?? {})
	const filtered = browse.filter(item => isCombatAction(item))
	const skills = filtered.map(item => actionRecord(item, details[item.i]))
	const actionsById = Object.fromEntries(skills.map(skill => [skill.id, skill]))
	const jobs = COMBAT_JOBS.map(job => ({
		...job,
		skillCount: skills.filter(skill => skill.jobId === job.jobId).length,
	}))

	return {
		source: {
			name: source.sourceName ?? 'Garland Tools CN',
			url: source.url ?? GARLAND_BROWSE_URL,
			generatedAt: source.generatedAt ?? '',
			actionCount: skills.length,
			detailedActionCount: Object.keys(details).length,
		},
		jobs,
		skills,
		actionsById,
	}
}

function mergeActionDetails(defaults = {}, overrides = {}) {
	const result = {...defaults}
	for (const [id, detail] of Object.entries(overrides)) {
		result[id] = {
			...(defaults[id] ?? {}),
			...(detail ?? {}),
		}
	}
	return result
}

export function classifyAction(actionId, fallbackName = '', skillDatabase = DEFAULT_SKILL_DATABASE, event = {}) {
	if (event.kind === 'potion') {
		return {type: 'potion', output: false, potency: 0, source: 'event-kind'}
	}
	if (event.kind === 'qt-control') {
		return {type: 'qt', output: false, potency: 0, source: 'event-kind'}
	}

	const id = Number(actionId)
	const action = Number.isFinite(id) ? findAction(skillDatabase, id) : null
	const name = fallbackName || action?.name || ''
	const result = action ? classifyActionData(action, name) : classifyActionData({name, description: ''}, name)
	return {
		type: result.type,
		output: result.output,
		potency: result.potency,
		effectDurationMs: result.effectDurationMs,
		source: action ? 'skill-database' : 'unknown-action',
	}
}

export async function fetchGarlandSkillSource(actionIds = [], fetchImpl = globalThis.fetch) {
	if (typeof fetchImpl !== 'function') {
		throw new Error('fetch is not available')
	}

	const browseResponse = await fetchImpl(GARLAND_BROWSE_URL)
	if (!browseResponse.ok) {
		throw new Error(`Garland browse fetch failed: ${browseResponse.status}`)
	}
	const browsePayload = await browseResponse.json()
	const browse = browsePayload.browse ?? []
	const browseDetailIds = browse
		.filter(isCombatAction)
		.map(item => Number(item.i))
		.filter(Number.isFinite)
	const ids = [...new Set([...DEFAULT_DETAIL_IDS, ...browseDetailIds, ...actionIds.map(Number).filter(Number.isFinite)])]
	const detailsEntries = await mapWithConcurrency(ids, 16, async id => {
		try {
			const response = await fetchImpl(GARLAND_ACTION_URL(id))
			if (!response.ok) {
				return null
			}
			const payload = await response.json()
			return [id, normalizeDetail(payload.action ?? payload)]
		} catch {
			return null
		}
	})

	return {
		sourceName: 'Garland Tools CN',
		url: GARLAND_BROWSE_URL,
		generatedAt: new Date().toISOString(),
		browse,
		details: Object.fromEntries(detailsEntries.filter(Boolean)),
	}
}

async function mapWithConcurrency(items, concurrency, mapper) {
	const result = new Array(items.length)
	let nextIndex = 0
	const workers = Array.from({length: Math.max(1, Math.min(concurrency, items.length))}, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex++
			result[index] = await mapper(items[index], index)
		}
	})
	await Promise.all(workers)
	return result
}

function actionRecord(item, detail = {}) {
	const job = JOB_BY_ID.get(Number(item.j)) ?? null
	const data = {
		id: Number(item.i),
		name: detail.name ?? item.n ?? `Action ${item.i}`,
		description: stripHtml(detail.description ?? ''),
		jobId: Number(item.j),
		job: job?.id ?? (Number(item.j) === ROLE_ACTION_JOB_ID ? 'ROLE' : ''),
		jobName: job?.name ?? (Number(item.j) === ROLE_ACTION_JOB_ID ? '通用职能' : ''),
		role: job?.role ?? 'Role',
		icon: Number(item.c ?? detail.icon ?? 0),
		iconUrl: iconUrl(item.c ?? detail.icon),
		category: actionCategoryName(item.t ?? detail.category),
		level: Number(item.l ?? detail.level ?? 0),
		castMs: Number(detail.cast ?? 0),
		recastMs: recastMsForAction(item, detail),
		gcd: Boolean(detail.gcd ?? (Number(item.t) === 2 || Number(item.t) === 3)),
	}
	const classification = classifyActionData(data, data.name)
	return {
		...data,
		type: classification.type,
		output: classification.output,
		potency: classification.potency,
		effectDurationMs: classification.effectDurationMs,
	}
}

function classifyActionData(action, fallbackName = '') {
	const explicit = ACTION_CLASSIFICATION_OVERRIDES.get(Number(action.id))
	if (explicit) {
		return {...explicit}
	}
	const name = action.name || fallbackName || ''
	const description = stripHtml(action.description ?? '')
	const text = `${name} ${description}`
	const potency = extractPotency(description)
	const hasOffensiveText = /攻击|伤害|持续伤害|威力/.test(description)
	const hasDamage = potency > 0 && hasOffensiveText
	const mitigation = /减轻|防护罩|无法战斗|攻击伤害降低|吸收.*伤害|无敌/.test(text)
	const effectDurationMs = effectDurationForAction(action, description)
	const hasDot = /持续伤害/.test(description) && effectDurationMs > 0
	const healing = /恢复|治疗|体力恢复|复活|复生/.test(text)

	if (hasDot) {
		return {type: 'dot', output: true, potency, effectDurationMs}
	}
	if (hasDamage) {
		return {type: 'damage', output: true, potency, effectDurationMs: 0}
	}
	if (healing && !mitigation) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs}
	}
	if (mitigation) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs}
	}
	if (healing) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs}
	}
	return {type: 'utility', output: false, potency: 0, effectDurationMs}
}

function effectDurationForAction(action, description = '') {
	const override = EFFECT_DURATION_OVERRIDES_MS.get(Number(action.id))
	if (override) {
		return override
	}
	return extractEffectDurationMs(description)
}

function recastMsForAction(item = {}, detail = {}) {
	const id = Number(item.i ?? detail.id)
	const override = RECAST_OVERRIDES_MS.get(id)
	if (override) {
		return override
	}
	return Number(detail.recast ?? 0)
}

function extractEffectDurationMs(description = '') {
	const text = stripHtml(description)
	const values = [...text.matchAll(/持续时间[：:]\s*(\d+(?:\.\d+)?)\s*秒/g)]
		.map(match => Number(match[1]))
		.filter(value => Number.isFinite(value) && value > 0 && value <= 120)
	if (!values.length) {
		return 0
	}
	return Math.round(Math.max(...values) * 1000)
}

function extractPotency(description = '') {
	const text = stripHtml(description)
	const matches = [...text.matchAll(/(?:攻击威力|威力)[：:]\s*(\d+)/g)]
	const values = matches.map(match => normalizePotency(match[1])).filter(value => value > 0)
	return values.length ? Math.max(...values) : 0
}

function normalizePotency(raw) {
	const value = Number(raw)
	if (!Number.isFinite(value) || value <= 0) {
		return 0
	}
	if (value <= 2000) {
		return value
	}
	if (String(raw).startsWith('1000')) {
		return 1000
	}
	return Number(String(raw).slice(0, 3))
}

function findAction(skillDatabase, id) {
	if (!skillDatabase) {
		return null
	}
	if (skillDatabase.actionsById?.[id]) {
		return skillDatabase.actionsById[id]
	}
	return skillDatabase.skills?.find(skill => Number(skill.id) === id) ?? null
}

function isCombatAction(item) {
	const jobId = Number(item.j)
	return COMBAT_JOB_IDS.has(jobId) || jobId === ROLE_ACTION_JOB_ID
}

function actionCategoryName(category) {
	const id = Number(category)
	if (id === 2) return '魔法'
	if (id === 3) return '战技'
	if (id === 4) return '能力'
	if (id === 9 || id === 15) return '极限技'
	return '技能'
}

function normalizeDetail(detail = {}) {
	return {
		name: detail.name,
		description: detail.description,
		icon: detail.icon,
		category: detail.category,
		cast: detail.cast,
		recast: detail.recast,
		gcd: detail.gcd,
		level: detail.level,
	}
}

function iconUrl(icon) {
	const id = Number(icon)
	return id ? `https://garlandtools.cn/files/icons/action/${id}.png` : ''
}

function stripHtml(value = '') {
	return String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export const DEFAULT_SKILL_DATABASE = buildSkillDatabase()
