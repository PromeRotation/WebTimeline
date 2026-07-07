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
	const events = flattenTimeline(timelineFixture, skillDatabase)
	const acrSimulation = options.acrSimulation ?? buildKanoDrkSimulation(skillDatabase, {durationMs: bossTimeline?.source?.lastSecond ? Math.round(bossTimeline.source.lastSecond * 1000) : 720000})
	const openerEvents = options.sourceOpener?.events ?? acrSimulation.events.filter(event => event.timeMs < (options.openerPanelEndMs ?? OPENER_PANEL_END_MS))
	const openerTitle = options.sourceOpener?.source?.name ?? timelineFixture.Meta?.Opener ?? '妖星100级起手'
	const openerSource = options.sourceOpener?.source?.source ?? 'ACR 模拟'
	const tracks = buildModeTracks(events)
	tracks.beginner.simulated = acrSimulation.events.slice(0, 64)
	tracks.expert.simulated = acrSimulation.events
	const timelineRows = mergeBossRows(buildTimelineRows(events, [], acrSimulation.events), bossTimeline)
	const damageEvents = acrSimulation.events.filter(event => event.output)
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
		onboarding: [
			{
				title: '以前写轴像在写小型程序',
				body: '过去主要靠 ACR 作者自己写时间轴，需要理解 PR 节点、触发条件、动作队列和时间偏移，很多操作接近代码编辑，耗时久、门槛高。',
			},
			{
				title: '现在用时间轴工作台把轴看清楚',
				body: '打开后先选职业、选 ACR，再看白轴；Boss 读条、人类技能、QT 控制、爆发药、减伤和输出被拆开，但仍然能整页预览。',
			},
			{
				title: '先调最常用的 60/120 爆发',
				body: '常用爆发窗口、QT 开关和时间轴动作放在同一块，可以先调爆发、调减伤，不需要先理解完整树结构。',
			},
			{
				title: '最后导出分享给自己或队友',
				body: '编辑完成后可以导出分享；需要精修逻辑时，也可以继续查看 Boss/玩家事件列、技能追踪器和插入栏。',
			},
		],
		editorModes: [
			{id: 'unified', label: '时间轴编辑', description: '当前主编辑视图'},
		],
		detailPanels: [
			{id: 'mitigation', label: '减伤 / 奶轴', events: tracks.beginner.mitigation},
			{id: 'damage', label: '输出轴', events: acrSimulation.events.filter(event => event.output).slice(0, 36)},
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
		},
		skillDatabase,
		sourceTimeline: timelineFixture,
		shareCard: {
			timelineName: timelineFixture.Meta?.Name ?? '妖星时间轴',
			title: '分享预览',
			subtitle: '个人展示模式：后续可生成只读链接，展示编辑者、职业、ACR 和模拟结果。',
		},
	}
}
