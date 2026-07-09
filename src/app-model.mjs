import {buildAcrDatabase} from './acr-database.mjs'
import {buildKanoDrkSimulation} from './acr-simulation.mjs'
import {mergeBossRows} from './boss-data.mjs'
import {buildModeTracks, buildTimelineRows, flattenTimeline} from './timeline-data.mjs'
import {estimateDamage} from './simulation.mjs'
import {buildSkillDatabase} from './skill-database.mjs'

const OPENER_PANEL_END_MS = 24000

export function createPrototypeModel(timelineFixture, packages = [], bossTimeline = null, options = {}) {
	const skillDatabase = options.skillDatabase ?? buildSkillDatabase(options.skillSource)
	const acrSources = options.acrSources ?? []
	const runtimeSources = options.runtimeSources ?? []
	const events = flattenTimeline(timelineFixture, skillDatabase)
	const blankPlayerTimeline = Boolean(options.blankPlayerTimeline)
	const visibleEvents = blankPlayerTimeline
		? events.filter(event => event.kind === 'boss-cast')
		: events
	const acrSimulation = options.acrSimulation ?? buildKanoDrkSimulation(skillDatabase, {durationMs: bossTimeline?.source?.lastSecond ? Math.round(bossTimeline.source.lastSecond * 1000) : 720000})
	const acrOpeners = buildAcrOpeners(options.sourceOpener)
	const visibleSimulationEvents = blankPlayerTimeline ? [] : acrSimulation.events
	const openerEvents = blankPlayerTimeline ? [] : options.sourceOpener?.events ?? acrSimulation.events.filter(event => event.timeMs < (options.openerPanelEndMs ?? OPENER_PANEL_END_MS))
	const openerTitle = options.sourceOpener?.source?.name ?? timelineFixture.Meta?.Opener ?? '妖星100级起手'
	const openerSource = options.sourceOpener?.source?.source ?? 'ACR 模拟'
	const tracks = buildModeTracks(visibleEvents)
	if (blankPlayerTimeline) {
		tracks.beginner.burst = []
		tracks.expert.burst = []
	}
	tracks.beginner.simulated = visibleSimulationEvents.slice(0, 64)
	tracks.expert.simulated = visibleSimulationEvents
	const timelineRows = mergeBossRows(buildTimelineRows(visibleEvents, [], visibleSimulationEvents), bossTimeline)
	const damageEvents = blankPlayerTimeline ? [] : acrSimulation.events.filter(event => event.output)
	const averageDamage = estimateDamage(damageEvents, {
		attackPower: 120,
		critRate: 0.18,
		directRate: 0.28,
		luck: 'average',
	})
	const luckyDamage = estimateDamage(damageEvents, {
		attackPower: 120,
		critRate: 0.18,
		directRate: 0.28,
		luck: 'lucky',
	})

	return {
		encounter: {
			name: timelineFixture.Meta?.Name ?? '未命名时间轴',
			territoryId: timelineFixture.Meta?.TerritoryId,
			jobId: timelineFixture.Meta?.JobId,
			job: 'DRK',
			opener: timelineFixture.Meta?.Opener ?? '手动填写起手',
			scope: '当前首版只做妖星乱舞绝境战',
		},
		editorModes: [
			{id: 'unified', label: '时间轴编辑', description: '当前主编辑视图'},
		],
		detailPanels: [
			{id: 'mitigation', label: '减伤 / 奶轴', events: tracks.beginner.mitigation},
			{id: 'damage', label: '输出轴', events: damageEvents.slice(0, 36)},
			{id: 'potion', label: '爆发药轴', events: tracks.expert.player.filter(event => event.kind === 'potion' || /爆发药/.test(event.name))},
			{id: 'opener', label: '起手', title: openerTitle, source: openerSource, events: openerEvents},
		],
		timelineRows,
		bossTimeline: bossTimeline ? {
			source: bossTimeline.source,
			topDamageActions: bossTimeline.topDamageActions,
		} : null,
		tracks,
		acrSimulation,
		acrOpeners,
		damage: {
			average: averageDamage,
			lucky: luckyDamage,
			events: damageEvents,
			logComparison: {
				source: '本地 ACT / FFLogs 导入入口',
				delta: Math.round(luckyDamage.total - averageDamage.total),
			},
		},
		acrDatabase: {
			...buildAcrDatabase(packages, acrSources),
			generatedAt: skillDatabase.source?.generatedAt ?? new Date().toISOString(),
			runtimeSources,
		},
		skillDatabase,
		sourceTimeline: blankPlayerTimeline ? null : timelineFixture,
		shareCard: {
			timelineName: timelineFixture.Meta?.Name ?? '妖星时间轴',
			title: '分享预览',
			subtitle: '个人展示模式：后续可生成只读链接，展示编辑者、职业、ACR 和模拟结果。',
		},
	}
}

function buildAcrOpeners(sourceOpener = null) {
	const job = sourceOpener?.source?.job
	const events = Array.isArray(sourceOpener?.events) ? sourceOpener.events : []
	if (!job || !events.length) {
		return {}
	}
	return {
		[job]: {
			source: {...sourceOpener.source},
			events: events.map(event => ({...event})),
		},
	}
}
