import {
	clampTimelineZoom,
	scrollLeftForDrag,
	scrollLeftForZoom,
	shouldStartTimelineDrag,
	timelineWheelPanDelta,
	timelineMsFromClientX,
	touchCenterX,
	touchDistance,
	zoomFromPinch,
	zoomFromWheelDelta,
} from './timeline-interactions.js'
import {assignTimelineLanes, timelineLaneCount} from './timeline-layout.js'
import {
	filterTimelineRowsByPhase,
	mergeBossCastAndDamageRows,
	absoluteMsForPhaseTime,
	phaseLabelForTime,
	phaseOptions,
	prepareBossTimelineRows,
	timelineDurationMs,
	timelineRowsForPhase,
	timelineTicks,
} from './timeline-view.js'
import {
	collectBossCastItems,
	flattenPrTimeline,
	normalizePhaseTaggedEvents,
	resolveBossCastConditionTimeMs,
} from './timeline-import-parser.js'

const state = {
	model: null,
	panel: 'mitigation',
	phase: 'all',
	onboarding: Number(localStorage.getItem('webtimelineOnboardingDone') ?? 0) ? -1 : 0,
	job: 'DRK',
	acr: 'KANO',
	critRate: 18,
	directRate: 28,
	luck: 'average',
	inserted: [],
	insertSkillId: '',
	focusedSkills: [],
	openDetailCollapses: [],
	focusQuery: '',
	importStatus: '',
	importError: '',
	showInsertDrawer: false,
	insertSkillCategory: 'output',
	potionAttribute: 'strength',
	qtDraftStates: {},
	showFocusPicker: false,
	showAcrModal: false,
	showAcrSimulation: localStorage.getItem('webtimelineShowAcrSimulation') !== '0',
	editorMode: 'browse',
	section: 'timeline',
	insertFloatPos: loadInsertFloatPos(),
	timelineZoom: clampTimelineZoom(localStorage.getItem('webtimelineTimelineZoom') ?? 1.65),
	currentTimelineJson: null,
	baseAcrSimulation: null,
	fflogsUrl: 'https://www.fflogs.com/reports/VHqxznv6bFcMPpLm?fight=10&type=damage-done',
	fflogsComparison: null,
	fflogsActorId: '',
	fflogsStatus: '',
	fflogsError: '',
	fflogsTargetGcdUtilization: 100,
}

const DEFAULT_TIMELINE_IMPORTS = [
	{
		id: 'kano-drk',
		label: '导入黑骑轴',
		url: assetUrl('resources/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json'),
	},
	{
		id: 'whm-02',
		label: '导入白魔轴',
		url: assetUrl('resources/timelines/时间轴参考/绝妖星白触发轴WHM02.json'),
	},
]

function assetUrl(relativePath) {
	return new URL(relativePath, import.meta.url).toString()
}

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
	[44162, '爆发药'],
])

const BOSS_DAMAGE_HINTS = new Map([
	['47764', 176000],
	['50722', 228000],
	['50179', 312000],
	['47952', 258000],
])

const POTION_ATTRIBUTES = [
	{id: 'strength', label: '刚力', shortLabel: '力', role: '力量系'},
	{id: 'dexterity', label: '巧力', shortLabel: '巧', role: '敏捷系'},
	{id: 'intelligence', label: '智力', shortLabel: '智', role: '法系输出'},
	{id: 'mind', label: '意力', shortLabel: '意', role: '治疗系'},
]

const COMBAT_POTION_TIERS = [
	{id: 'gemdraught-g2', tier: '7.x', level: 100, label: '2级', familyLabel: '宝药', name: 'Grade 2 Gemdraught'},
	{id: 'gemdraught-g1', tier: '7.x', level: 100, label: '1级', familyLabel: '宝药', name: 'Grade 1 Gemdraught'},
	{id: 'tincture-g8', tier: '6.x', level: 90, label: '8级', familyLabel: '幻药', name: 'Grade 8 Tincture'},
	{id: 'tincture-g7', tier: '6.x', level: 90, label: '7级', familyLabel: '幻药', name: 'Grade 7 Tincture'},
	{id: 'tincture-g6', tier: '6.x', level: 90, label: '6级', familyLabel: '幻药', name: 'Grade 6 Tincture'},
	{id: 'tincture-g5', tier: '5.x', level: 80, label: '5级', familyLabel: '幻药', name: 'Grade 5 Tincture'},
	{id: 'tincture-g4', tier: '5.x', level: 80, label: '4级', familyLabel: '幻药', name: 'Grade 4 Tincture'},
	{id: 'tincture-g3', tier: '5.x', level: 80, label: '3级', familyLabel: '幻药', name: 'Grade 3 Tincture'},
	{id: 'tincture-g2', tier: '4.x', level: 70, label: '2级', familyLabel: '幻药', name: 'Grade 2 Tincture'},
	{id: 'tincture-g1', tier: '4.x', level: 70, label: '1级', familyLabel: '幻药', name: 'Grade 1 Tincture'},
]

const app = document.querySelector('#app')

let timelineDrag = null
let timelinePinch = null
let suppressTimelineClick = false
let insertFloatDrag = null
let suppressInsertFloatClick = false
let insertSkillDrag = null
let suppressInsertSkillClick = false
let timelineDragGuideFrame = null
let timelineDragGuidePending = null
let timelineDragGuideCache = null

init()

async function init() {
	const response = await fetch(assetUrl('data/prototype.json'))
	state.model = await response.json()
	state.baseAcrSimulation = state.model.acrSimulation
	state.currentTimelineJson = state.model.sourceTimeline ?? null
	render()
}

document.addEventListener('click', event => {
	if (suppressInsertFloatClick || suppressInsertSkillClick) {
		suppressInsertFloatClick = false
		suppressInsertSkillClick = false
		return
	}
	const target = event.target.closest('[data-action], [data-panel], [data-section], [data-insert-category], [data-potion-attribute], [data-phase], [data-toggle], [data-focus-skill], [data-remove-focus], [data-import-default], [data-manual-id]')
	if (!target) {
		return
	}

	if (target.dataset.section) {
		state.section = target.dataset.section
		render()
		return
	}

	if (target.dataset.panel) {
		state.panel = target.dataset.panel
		render()
		return
	}

	if (target.dataset.insertCategory) {
		state.insertSkillCategory = target.dataset.insertCategory
		render()
		return
	}

	if (target.dataset.potionAttribute) {
		setPotionAttribute(target.dataset.potionAttribute)
		return
	}

	if (target.dataset.phase) {
		state.phase = target.dataset.phase
		render()
		return
	}

	if (target.dataset.toggle === 'acr-simulation') {
		if (target.closest('summary')) {
			event.preventDefault()
			event.stopPropagation()
		}
		state.showAcrSimulation = !state.showAcrSimulation
		localStorage.setItem('webtimelineShowAcrSimulation', state.showAcrSimulation ? '1' : '0')
		render()
		return
	}

	if (target.dataset.toggle === 'insert-drawer') {
		if (canEditTimeline()) {
			state.showInsertDrawer = !state.showInsertDrawer
		}
		render()
		return
	}

	if (target.dataset.toggle === 'editor-mode') {
		state.editorMode = state.editorMode === 'edit' ? 'browse' : 'edit'
		if (!canEditTimeline()) {
			state.showInsertDrawer = false
		}
		render()
		return
	}

	const action = target.dataset.action
	if (action === 'remove-focused-skill') {
		removeFocusedSkill(target.dataset.focusSkill ?? target.dataset.removeFocus)
		return
	}

	if (action === 'locate-timeline-event') {
		event.preventDefault()
		event.stopPropagation()
		locateTimelineEvent(target.dataset.timelineEventKey)
		return
	}

	if (target.dataset.focusSkill) {
		event.preventDefault()
		event.stopPropagation()
		rememberOpenDetailCollapses()
		addFocusedSkill(target.dataset.focusSkill)
		return
	}

	if (target.dataset.removeFocus) {
		removeFocusedSkill(target.dataset.removeFocus)
		return
	}

	if (action === 'skip-onboarding') {
		state.onboarding = -1
		localStorage.setItem('webtimelineOnboardingDone', '1')
		render()
		return
	}
	if (action === 'next-onboarding') {
		state.onboarding += 1
		render()
		return
	}
	if (action === 'insert-skill') {
		insertManualSkill()
		return
	}
	if (action === 'quick-insert-skill') {
		insertSkillAtVisibleTimeline(target.dataset.dragSkill)
		return
	}
	if (action === 'quick-insert-potion') {
		insertPotionAtVisibleTimeline(target.dataset.potionId)
		return
	}
	if (action === 'quick-insert-burst') {
		insertBurstPackageAtVisibleTimeline(target.dataset.burstIndex)
		return
	}
	if (action === 'quick-insert-burst-qt') {
		insertBurstQtAtVisibleTimeline(target.dataset.burstIndex, target.dataset.burstTimeMs)
		return
	}
	if (action === 'toggle-qt-draft') {
		toggleQtDraftState(target.dataset.qtInsert)
		return
	}
	if (action === 'insert-qt-draft') {
		insertQtDraftAtVisibleTimeline()
		return
	}
	if (action === 'remove-manual-skill') {
		event.preventDefault()
		event.stopPropagation()
		removeManualSkill(target.dataset.manualId)
		return
	}
	if (action === 'remove-timeline-event') {
		event.preventDefault()
		event.stopPropagation()
		removeTimelineEvent(target.dataset.timelineEventKey)
		return
	}
	if (action === 'nudge-manual-skill') {
		nudgeManualSkill(target.dataset.manualId, Number(target.dataset.deltaMs ?? 0))
		return
	}
	if (action === 'duplicate-manual-skill') {
		duplicateManualSkill(target.dataset.manualId)
		return
	}
	if (action === 'open-focus-picker') {
		state.showFocusPicker = true
		render()
		return
	}
	if (action === 'close-focus-picker') {
		state.showFocusPicker = false
		render()
		return
	}
	if (action === 'open-acr-database') {
		state.showAcrModal = true
		render()
		return
	}
	if (action === 'close-acr-database') {
		state.showAcrModal = false
		render()
		return
	}
	if (action === 'import-timeline') {
		document.querySelector('[data-field="timeline-import"]')?.click()
		return
	}
	if (action === 'export-timeline') {
		exportTimeline()
		return
	}
	if (action === 'load-fflogs-comparison') {
		loadFflogsComparison()
		return
	}
	if (action === 'apply-log-gcd-utilization') {
		const percent = Number(state.fflogsComparison?.log?.gcdUtilization?.percent)
		if (Number.isFinite(percent)) {
			setFflogsTargetGcdUtilization(percent)
		}
		return
	}
	if (action === 'reset-gcd-utilization') {
		setFflogsTargetGcdUtilization(100)
		return
	}
	if (target.dataset.importDefault) {
		importDefaultTimeline(target.dataset.importDefault)
		return
	}
})

document.addEventListener('toggle', event => {
	const detail = event.target instanceof Element ? event.target.closest('.detail-collapse') : null
	if (!detail || detail !== event.target) {
		return
	}
	setDetailCollapseOpen(detail.dataset.detailCollapse, detail.open)
}, true)

document.addEventListener('dragstart', event => {
	const manual = event.target.closest('[data-manual-id]')
	if (manual) {
		if (!canEditTimeline()) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('application/x-webtimeline-manual', manual.dataset.manualId)
		event.dataTransfer.setData('text/plain', manual.dataset.manualId)
		return
	}

	const timelineEvent = event.target.closest('[data-timeline-event-key]')
	if (timelineEvent) {
		if (!canEditTimeline() || !timelineEvent.dataset.timelineEventKey) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('application/x-webtimeline-event', timelineEvent.dataset.timelineEventKey)
		event.dataTransfer.setData('text/plain', timelineEvent.dataset.timelineEventKey)
		return
	}

	const burst = event.target.closest('[data-drag-burst]')
	if (burst) {
		if (!canEditTimeline() || !burst.dataset.dragBurst) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'copy'
		event.dataTransfer.setData('application/x-webtimeline-burst', burst.dataset.dragBurst)
		event.dataTransfer.setData('text/plain', burst.dataset.dragBurst)
		return
	}

	const qt = event.target.closest('[data-drag-qt]')
	if (qt) {
		if (!canEditTimeline() || !qt.dataset.dragQt) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'copy'
		event.dataTransfer.setData('application/x-webtimeline-qt', qt.dataset.dragQt)
		event.dataTransfer.setData('text/plain', qt.dataset.dragQt)
		return
	}

	const potion = event.target.closest('[data-drag-potion]')
	if (potion) {
		if (!canEditTimeline() || !potion.dataset.dragPotion) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'copy'
		event.dataTransfer.setData('application/x-webtimeline-potion', potion.dataset.dragPotion)
		event.dataTransfer.setData('text/plain', potion.dataset.dragPotion)
		return
	}

	const skill = event.target.closest('[data-drag-skill]')
	if (!skill || !canEditTimeline() || skill.dataset.dragLocked === 'true') {
		event.preventDefault()
		return
	}
	event.dataTransfer.effectAllowed = 'copy'
	event.dataTransfer.setData('application/x-webtimeline-skill', skill.dataset.dragSkill)
	event.dataTransfer.setData('text/plain', skill.dataset.dragSkill)
})

document.addEventListener('dragover', event => {
	const timeline = findTimeline(event.target)
	if (!timeline || !canEditTimeline() || !hasTimelineDropData(event.dataTransfer)) {
		return
	}
	event.preventDefault()
	event.dataTransfer.dropEffect = dataTransferHasType(event.dataTransfer, 'application/x-webtimeline-manual')
		? 'move'
		: dataTransferHasType(event.dataTransfer, 'application/x-webtimeline-event') ? 'move' : 'copy'
	scheduleTimelineDragGuide(timeline, event.clientX)
})

document.addEventListener('drop', event => {
	const timeline = findTimeline(event.target)
	if (!timeline || !canEditTimeline()) {
		return
	}
	const manualId = event.dataTransfer.getData('application/x-webtimeline-manual')
	if (manualId) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		moveManualSkillAtTimeline(manualId, event, timeline)
		return
	}
	const existingEventKey = event.dataTransfer.getData('application/x-webtimeline-event')
	if (existingEventKey) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		moveExistingTimelineEventAtTimeline(existingEventKey, event, timeline)
		return
	}
	const qtKey = event.dataTransfer.getData('application/x-webtimeline-qt')
	if (qtKey) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		insertQtAtTimeline(qtKey, event, timeline)
		return
	}
	const burstIndex = event.dataTransfer.getData('application/x-webtimeline-burst')
	if (burstIndex) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		insertBurstPackageAtTimeline(burstIndex, event, timeline)
		return
	}
	const potionId = event.dataTransfer.getData('application/x-webtimeline-potion')
	if (potionId) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		insertPotionAtTimeline(potionId, event, timeline)
		return
	}
	const actionId = event.dataTransfer.getData('application/x-webtimeline-skill')
	if (!actionId) {
		return
	}
	event.preventDefault()
	hideTimelineDragGuide(timeline)
	insertSkillAtTimeline(actionId, event, timeline)
})

document.addEventListener('dragleave', event => {
	const timeline = findTimeline(event.target)
	if (!timeline || timeline.contains(event.relatedTarget)) {
		return
	}
	hideTimelineDragGuide(timeline)
})

document.addEventListener('dragend', () => {
	hideTimelineDragGuide()
})

document.addEventListener('click', event => {
	if (!suppressTimelineClick || !findTimeline(event.target)) {
		return
	}
	event.preventDefault()
	event.stopPropagation()
	suppressTimelineClick = false
}, true)

document.addEventListener('wheel', event => {
	const timeline = findTimeline(event.target)
	if (!timeline) {
		return
	}

	event.preventDefault()
	if (event.ctrlKey) {
		const rect = timeline.getBoundingClientRect()
		setTimelineZoom(zoomFromWheelDelta(state.timelineZoom, event.deltaY), timeline, event.clientX - rect.left)
		return
	}

	timeline.scrollLeft += timelineWheelPanDelta(event)
}, {passive: false})

document.addEventListener('pointerdown', event => {
	const skillCard = event.target instanceof Element ? event.target.closest('[data-drag-skill], [data-drag-burst], [data-drag-qt], [data-drag-potion]') : null
	if (skillCard && canStartInsertSkillDrag(skillCard, event)) {
		startInsertSkillDrag(event, skillCard)
		skillCard.setPointerCapture?.(event.pointerId)
		return
	}

	const insertHandle = event.target instanceof Element ? event.target.closest('[data-insert-float-handle], [data-insert-panel-handle]') : null
	if (insertHandle && canEditTimeline()) {
		if (insertHandle.matches('[data-insert-panel-handle]') && event.target.closest('button, input, select, textarea, label')) {
			return
		}
		startInsertFloatDrag(event)
		insertHandle.setPointerCapture?.(event.pointerId)
		return
	}

	const timeline = findTimeline(event.target)
	if (!shouldStartTimelineDrag({
		hasTimeline: Boolean(timeline),
		button: event.button,
		ctrlKey: event.ctrlKey,
		timelinePinchActive: Boolean(timelinePinch),
		interactiveTarget: isTimelineInteractiveTarget(event.target),
	})) {
		return
	}

	startTimelineDrag(timeline, event)
	timeline.setPointerCapture?.(event.pointerId)
})

document.addEventListener('pointermove', event => {
	if (insertSkillDrag && insertSkillDrag.pointerId === event.pointerId) {
		moveInsertSkillDrag(event)
		return
	}

	if (insertFloatDrag && insertFloatDrag.pointerId === event.pointerId) {
		moveInsertFloat(event)
		return
	}

	if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) {
		return
	}

	const deltaX = event.clientX - timelineDrag.startX
	const deltaY = event.clientY - timelineDrag.startY
	if (!timelineDrag.dragging && Math.hypot(deltaX, deltaY) > 3) {
		timelineDrag.dragging = true
		timelineDrag.timeline.classList.add('is-dragging')
	}
	if (!timelineDrag.dragging) {
		return
	}

	event.preventDefault()
	timelineDrag.timeline.scrollLeft = scrollLeftForDrag({
		startScrollLeft: timelineDrag.scrollLeft,
		startX: timelineDrag.startX,
		currentX: event.clientX,
	})
}, {passive: false})

document.addEventListener('pointerup', event => {
	endInsertSkillDrag(event)
	endInsertFloatDrag(event)
	endTimelineDrag(event)
})
document.addEventListener('pointercancel', event => {
	cancelInsertSkillDrag(event)
	endInsertFloatDrag(event)
	endTimelineDrag(event)
})

document.addEventListener('mousedown', event => {
	const timeline = findTimeline(event.target)
	if (!shouldStartTimelineDrag({
		hasTimeline: Boolean(timeline),
		button: event.button,
		ctrlKey: event.ctrlKey,
		timelinePinchActive: Boolean(timelinePinch),
		interactiveTarget: isTimelineInteractiveTarget(event.target),
	})) {
		return
	}
	startTimelineDrag(timeline, event)
})

document.addEventListener('mousemove', event => {
	if (!timelineDrag || timelineDrag.pointerId != null) {
		return
	}

	const deltaX = event.clientX - timelineDrag.startX
	const deltaY = event.clientY - timelineDrag.startY
	if (!timelineDrag.dragging && Math.hypot(deltaX, deltaY) > 3) {
		timelineDrag.dragging = true
		timelineDrag.timeline.classList.add('is-dragging')
	}
	if (!timelineDrag.dragging) {
		return
	}

	event.preventDefault()
	timelineDrag.timeline.scrollLeft = scrollLeftForDrag({
		startScrollLeft: timelineDrag.scrollLeft,
		startX: timelineDrag.startX,
		currentX: event.clientX,
	})
}, {passive: false})

document.addEventListener('mouseup', event => {
	if (!timelineDrag || timelineDrag.pointerId != null) {
		return
	}
	endTimelineDrag(event)
})

document.addEventListener('touchstart', event => {
	if (event.touches.length !== 2) {
		return
	}
	const timeline = findTimeline(event.target)
	if (!timeline) {
		return
	}

	const rect = timeline.getBoundingClientRect()
	timelinePinch = {
		timeline,
		startDistance: touchDistance(event.touches[0], event.touches[1]),
		startZoom: state.timelineZoom,
	}
	timelineDrag = null
	timeline.classList.add('is-zooming')
	setTimelineZoom(state.timelineZoom, timeline, touchCenterX(event.touches[0], event.touches[1], rect.left))
}, {passive: false})

document.addEventListener('touchmove', event => {
	if (!timelinePinch || event.touches.length < 2) {
		return
	}

	event.preventDefault()
	const rect = timelinePinch.timeline.getBoundingClientRect()
	const centerX = touchCenterX(event.touches[0], event.touches[1], rect.left)
	const nextZoom = zoomFromPinch(
		timelinePinch.startZoom,
		timelinePinch.startDistance,
		touchDistance(event.touches[0], event.touches[1]),
	)
	setTimelineZoom(nextZoom, timelinePinch.timeline, centerX)
}, {passive: false})

document.addEventListener('touchend', endTimelinePinch)
document.addEventListener('touchcancel', endTimelinePinch)

document.addEventListener('input', event => {
	const burstTimeTarget = event.target.closest('[data-burst-time]')
	if (burstTimeTarget) {
		updateBurstPlannerTime(burstTimeTarget)
		return
	}

	const detailTimeTarget = event.target.closest('[data-detail-time]')
	if (detailTimeTarget) {
		updateDetailEventTime(detailTimeTarget.dataset.detailTime, detailTimeTarget.value)
		return
	}

	const manualTimeTarget = event.target.closest('[data-manual-time]')
	if (manualTimeTarget) {
		updateManualSkillTime(manualTimeTarget.dataset.manualTime, manualTimeTarget.value)
		return
	}

	const target = event.target.closest('[data-field]')
	if (!target) {
		return
	}

	if (target.dataset.field === 'skill-id') {
		state.insertSkillId = target.value.trim()
		const preview = document.querySelector('[data-insert-id-preview]')
		if (preview) {
			preview.textContent = insertIdPreviewName()
		}
		return
	}
	if (target.dataset.field === 'fflogs-url') {
		state.fflogsUrl = target.value
		render()
		return
	}
	if (target.dataset.field === 'fflogs-gcd-utilization') {
		setFflogsTargetGcdUtilization(target.value, {silent: true})
		return
	}

	state[target.dataset.field] = target.value
	if (target.dataset.field === 'critRate' || target.dataset.field === 'directRate' || target.dataset.field === 'luck') {
		updateDamage()
		if (state.fflogsComparison) {
			loadFflogsComparison({silent: true})
		}
	}
	if (target.dataset.field === 'job') {
		const selectedJob = state.model.acrDatabase.jobs.find(job => job.id === state.job)
		state.acr = selectedJob?.acrs.find(acr => acr.enabled)?.name ?? selectedJob?.acrs[0]?.name ?? ''
		render()
	}
	if (target.dataset.field === 'focus-query') {
		state.focusQuery = target.value
		render()
	}
})

document.addEventListener('change', event => {
	const detailTimeTarget = event.target.closest('[data-detail-time]')
	if (detailTimeTarget) {
		updateDetailEventTime(detailTimeTarget.dataset.detailTime, detailTimeTarget.value)
		return
	}

	const detailTarget = event.target.closest('[data-detail-target]')
	if (detailTarget) {
		updateDetailEventTarget(detailTarget.dataset.detailTarget, detailTarget.value)
		return
	}

	const manualTimeTarget = event.target.closest('[data-manual-time]')
	if (manualTimeTarget) {
		updateManualSkillTime(manualTimeTarget.dataset.manualTime, manualTimeTarget.value)
		return
	}

	const importTarget = event.target.closest('[data-field="timeline-import"]')
	if (importTarget?.files?.length) {
		importTimelineFile(importTarget.files[0])
		importTarget.value = ''
	}
	const actorTarget = event.target.closest('[data-field="fflogs-actor"]')
	if (actorTarget) {
		state.fflogsActorId = actorTarget.value
		loadFflogsComparison({actorId: state.fflogsActorId})
		return
	}
})

function render() {
	const model = state.model
	if (!model) {
		return
	}
	hideTimelineDragGuide()

	app.innerHTML = `
		${renderOnboarding(model)}
		<div class="app-shell">
			<main class="workspace">
				${renderTopbar(model)}
				${renderImportFeedback()}
				${state.section === 'tools' ? renderToolPanel(model) : renderUnifiedEditor(model)}
			</main>
			${renderInsertFloat(model)}
			${renderAcrDock(model)}
		</div>
		${renderFocusSkillModal(model)}
		${renderAcrModal(model)}
	`
	updateDamage()
}

function renderImportFeedback() {
	if (!state.importStatus && !state.importError) {
		return ''
	}
	const message = state.importError || state.importStatus
	const kind = state.importError ? 'error' : 'success'
	return `<div class="import-feedback ${kind}" role="status">${escapeHtml(message)}</div>`
}

function renderOnboarding(model) {
	if (state.onboarding < 0) {
		return ''
	}
	const step = model.onboarding[state.onboarding]
	const isLast = state.onboarding === model.onboarding.length - 1
	return `
		<section class="onboarding" role="dialog" aria-modal="true">
			<div class="onboarding-panel">
				<div class="onboarding-boss-avatar" aria-hidden="true">${renderBossAvatar('凯夫卡')}</div>
				<div class="onboarding-copy">
					<p class="eyebrow">新手引导 ${state.onboarding + 1}/${model.onboarding.length}</p>
					<h1>${step.title}</h1>
					<p>${step.body}</p>
					<div class="onboarding-progress">
						${model.onboarding.map((_, index) => `<span class="${index === state.onboarding ? 'active' : ''}"></span>`).join('')}
					</div>
					<div class="button-row">
						<button class="ghost" data-action="skip-onboarding">跳过</button>
						<button class="primary" data-action="${isLast ? 'skip-onboarding' : 'next-onboarding'}">${isLast ? '进入编辑器' : '下一步'}</button>
					</div>
				</div>
			</div>
		</section>
	`
}

function renderSidebar(model) {
	return `
		<aside class="guide-rail">
			<div class="brand-lockup">
				<div class="brand-boss-avatar" aria-hidden="true">${renderBossAvatar('凯夫卡')}</div>
				<div>
					<p class="eyebrow">WebTimeline</p>
					<strong>妖星编辑器</strong>
				</div>
			</div>
			<nav class="rail-nav" aria-label="编辑分区">
				<button class="rail-item active">时间轴编辑</button>
				<button class="rail-item">FFLogs 对比</button>
				<button class="rail-item">伤害模拟</button>
				<button class="rail-item muted">8人团队模式</button>
			</nav>
			<section class="share-mini">
				<p class="eyebrow">${model.shareCard.timelineName ?? model.encounter.name}</p>
				<strong>${model.shareCard.title}</strong>
				<span>${model.shareCard.subtitle}</span>
			</section>
		</aside>
	`
}

function renderCompactNav(model) {
	return `
		<div class="compact-nav">
			<div class="brand-lockup compact-brand">
				<div class="brand-boss-avatar" aria-hidden="true">${renderBossAvatar('凯夫卡')}</div>
				<div>
					<p class="eyebrow">WebTimeline</p>
					<strong>妖星编辑器</strong>
				</div>
			</div>
			<nav class="rail-nav compact-rail" aria-label="编辑分区">
				<button class="rail-item ${state.section === 'timeline' ? 'active' : ''}" data-section="timeline">时间轴编辑</button>
				<button class="rail-item ${state.section === 'tools' ? 'active' : ''}" data-section="tools">工具</button>
				<button class="rail-item muted">8人团队模式</button>
			</nav>
			<section class="share-mini compact-share">
				<p class="eyebrow">${model.shareCard.timelineName ?? model.encounter.name}</p>
				<strong>${model.shareCard.title}</strong>
			</section>
		</div>
	`
}

function renderTopbar(model) {
	const selectedJob = model.acrDatabase.jobs.find(job => job.id === state.job) ?? model.acrDatabase.jobs[0]
	return `
		<header class="topbar">
			<div class="topbar-main">
				${renderCompactNav(model)}
				<div class="topbar-title">
					<div class="topbar-meta">
						<p class="eyebrow">Territory ${model.encounter.territoryId} / ${model.encounter.job}</p>
						${renderJobAcrStatus(model, selectedJob)}
					</div>
					<h2>${model.encounter.name}</h2>
				</div>
			</div>
			<div class="topbar-controls">
				<button class="ghost mode-toggle ${state.editorMode === 'edit' ? 'active' : ''}" data-toggle="editor-mode">${state.editorMode === 'edit' ? '编辑模式' : '浏览模式'}</button>
				<label>
					<span>职业</span>
					<select data-field="job">
						${model.acrDatabase.jobs.map(job => `<option value="${job.id}" ${job.id === state.job ? 'selected' : ''} ${job.enabled ? '' : 'disabled'}>${job.name}${job.enabled ? '' : '（未接入）'}</option>`).join('')}
					</select>
				</label>
				<label>
					<span>ACR</span>
					<select data-field="acr">
						${selectedJob.acrs.map(acr => `<option value="${acr.name}" ${acr.name === state.acr ? 'selected' : ''} ${acr.enabled ? '' : 'disabled'}>${acr.name}</option>`).join('')}
					</select>
				</label>
				${DEFAULT_TIMELINE_IMPORTS.map(source => `<button class="ghost compact" data-import-default="${source.id}">${source.label}</button>`).join('')}
				<button class="ghost" data-action="import-timeline">导入</button>
				<button class="ghost" data-action="export-timeline">导出</button>
				<input class="hidden-file-input" type="file" accept=".json,application/json" data-field="timeline-import">
			</div>
		</header>
	`
}

function renderJobAcrStatus(model, selectedJob) {
	const job = selectedJob ?? model.acrDatabase.jobs.find(item => item.id === state.job)
	const acr = job?.acrs.find(item => item.name === state.acr)
	const status = acrSupportStatus(job, acr)
	return `
		<div class="job-acr-status">
			<span class="current">当前选择</span>
			<span>职业：${job?.name ?? state.job ?? 'unknown'}</span>
			<span>ACR：${acr?.name ?? state.acr ?? '未指定'}</span>
			${renderAcrStatusBadge(status)}
		</div>
	`
}

function renderUnifiedEditor(model) {
	const track = model.tracks.expert
	return `
		<div class="unified-grid">
			<section class="timeline-panel">
				${renderLaneTimeline(track)}
			</section>
			<section class="detail-panel">
				${renderPanelTabs(model)}
				${renderDetailPanel(model)}
			</section>
		</div>
	`
}

function renderInsertFloat(model) {
	if (!canEditTimeline() || state.section !== 'timeline') {
		return ''
	}
	const x = Math.round(Number(state.insertFloatPos?.x ?? 28))
	const y = Math.round(Number(state.insertFloatPos?.y ?? 520))
	const placement = insertFloatPlacement({x, y})
	const classes = [
		'insert-float',
		state.showInsertDrawer ? 'has-drawer' : '',
		placement.alignRight ? 'align-right' : 'align-left',
		placement.alignUp ? 'align-up' : 'align-down',
	].filter(Boolean).join(' ')
	return `
		<div class="${classes}" style="left:${x}px; top:${y}px;">
			<button class="insert-float-button ${state.showInsertDrawer ? 'active' : ''}" data-toggle="insert-drawer" data-insert-float-handle="true" title="拖动移动，点击打开编程模式面板" aria-label="拖动移动，点击打开编程模式面板">
				<img class="insert-float-avatar" src="./assets/ui/programming-mode-button.jpg" alt="" loading="lazy" decoding="async">
				<span class="insert-float-state" aria-hidden="true"></span>
			</button>
			${state.showInsertDrawer ? renderSkillDrawer(model.tracks.expert) : ''}
		</div>
	`
}

function renderBurstPlanner(bursts, options = {}) {
	const limit = Number(options.limit ?? 4)
	const className = options.className ?? ''
	return `
		<div class="burst-strip compact ${className}">
			${bursts.slice(0, limit).map((burst, index) => {
				const burstId = burst.burstIndex ?? index
				const burstTimeMs = Number(burst.timeMs ?? burst.startMs ?? index * 60000)
				const burstLabel = burst.window === '120s' ? '120 爆发' : '60 爆发'
				const qtItems = Array.isArray(burst.qt) ? burst.qt : []
				return `
				<article class="burst-window ${burst.window === '120s' ? 'major' : 'minor'}">
					<div>
						<span>${burst.window}</span>
						<strong>${burstLabel}</strong>
					</div>
					<div class="qt-pills">
						${qtItems.map(qt => `<button data-qt="${qt}">${qt}</button>`).join('') || '<span>暂无 QT</span>'}
					</div>
					<label>
						<span data-burst-time-label="${burstId}">${formatTime(burstTimeMs)}</span>
						<input type="range" min="0" max="720" value="${Math.round(burstTimeMs / 1000)}" data-burst-time="${burstId}" aria-label="${burstLabel} 时间">
					</label>
					<button class="mini-button" data-action="quick-insert-burst-qt" data-burst-index="${burstId}" data-burst-time-ms="${burstTimeMs}">插入QT</button>
				</article>
			`}).join('')}
		</div>
	`
}

function renderLaneTimeline(track) {
	const rows = buildVisualTimelineRows(track)
	const maxTime = timelineDurationMs(rows, state.model.bossTimeline?.source, state.phase)
	const phases = phaseOptions(state.model.bossTimeline?.source)
	const baseWidth = timelineBaseWidth(maxTime)
	const timelineWidth = Math.round(baseWidth * state.timelineZoom)
	const sourceSummary = state.model.bossTimeline
		? `boss-data / ${state.model.bossTimeline.source.castCount} casts / ${state.model.bossTimeline.source.abilityCount} releases`
		: `Unified view / ${rows.reduce((sum, row) => sum + row.items.length, 0)} items`
	return `
		<div class="xiva-shell" data-base-width="${baseWidth}" data-zoom="${state.timelineZoom.toFixed(2)}" style="--timeline-width:${timelineWidth}px">
			<div class="xiva-toolbar">
				<div>
					<strong>Timeline</strong>
					<span>${sourceSummary}</span>
				</div>
				<div class="phase-switch" aria-label="Boss phase filter">
					<button class="${state.phase === 'all' ? 'active' : ''}" data-phase="all">全部</button>
					${phases.map(phase => `<button class="${state.phase === phase.id ? 'active' : ''}" data-phase="${phase.id}">${phase.label}</button>`).join('')}
				</div>
				<div class="xiva-legend">
					<span><i class="legend-cast"></i>Boss</span>
					<span><i class="legend-action"></i>输出</span>
					<span><i class="legend-mitigation"></i>减伤</span>
					<span><i class="legend-burst"></i>爆发</span>
					<span><i class="legend-simulated"></i>ACR</span>
				</div>
				<button class="sim-toggle ${state.showAcrSimulation ? 'active' : ''}" data-toggle="acr-simulation">${state.showAcrSimulation ? '隐藏 ACR 模拟' : '显示 ACR 模拟'}</button>
			</div>
			<div class="xiva-timeline">
				${renderTimelineDragGuide()}
				<div class="xiva-label xiva-axis-label">Time</div>
				<div class="xiva-track xiva-axis">${renderTimelineAxis(maxTime)}</div>
				${rows.map(row => renderTimelineRow(row, maxTime, timelineWidth)).join('')}
			</div>
		</div>
	`
}

function renderSkillDrawer(track) {
	const groups = insertSkillGroups(track)
	const activeGroup = groups.find(group => group.id === state.insertSkillCategory) ?? groups[0]
	return `
		<section class="skill-drawer floating-skill-drawer">
			<div class="section-heading insert-panel-heading" data-insert-panel-handle="true" title="拖动移动插入技能面板">
				<div>
					<p class="eyebrow">插入技能</p>
					<h3>拖入时间轴或点击卡片立即生成手动技能</h3>
				</div>
				${renderInsertTool()}
			</div>
			<div class="insert-category-tabs">
				${groups.map(group => `<button class="${group.id === activeGroup.id ? 'active' : ''}" data-insert-category="${group.id}">${group.label}<small>${group.skills.length}</small></button>`).join('')}
			</div>
			${activeGroup.id === 'burst' ? renderBurstInsertPanel(activeGroup.skills) : activeGroup.id === 'potion' ? renderPotionInsertPanel(activeGroup.skills) : renderInsertSkillGroupContent(activeGroup)}
		</section>
	`
}

function renderInsertSkillGroupContent(activeGroup) {
	return activeGroup.id === 'qt' ? renderQtGamePanel(activeGroup.skills) : `
		<div class="skill-strip">
			${activeGroup.skills.length ? activeGroup.skills.map(event => event.type === 'burst-insert' ? renderBurstInsertCard(event) : event.type === 'qt-insert' ? renderQtInsertCard(event) : renderSkillCard(event)).join('') : '<p class="empty-state">这个分类暂无技能</p>'}
		</div>
	`
}

function renderQtGamePanel(skills = []) {
	return `
		<div class="qt-game-panel">
			<p class="qt-panel-note">点击左侧 QT 只会切换本次草稿；右侧确认要写入的逻辑，没问题后再插入。</p>
			<div class="qt-game-layout">
				<div class="qt-game-grid">
					${skills.length ? skills.map(renderQtInsertCard).join('') : '<p class="empty-state">暂时没有解析到 QT 状态</p>'}
				</div>
				${renderQtDraftPanel(skills)}
			</div>
		</div>
	`
}

function renderQtDraftPanel(skills = []) {
	const changes = qtDraftChanges(skills)
	return `
		<aside class="qt-draft-panel">
			<div class="qt-draft-heading">
				<strong>本次插入逻辑</strong>
				<small>${changes.length} 项变更</small>
			</div>
			<div class="qt-draft-logic">
				${changes.length ? changes.map(change => `
					<div class="qt-draft-row">
						<span>${escapeHtml(change.name)}</span>
						<strong>${change.enabled ? '开启' : '关闭'}</strong>
					</div>
				`).join('') : '<p class="empty-state">先点击左侧 QT 开关</p>'}
			</div>
			<button class="mini-button qt-draft-insert" data-action="insert-qt-draft" ${changes.length ? '' : 'disabled'}>插入</button>
		</aside>
	`
}

function renderBurstInsertPanel(bursts) {
	const choices = uniqueBurstInsertChoices(bursts)
	return `
		<div class="insert-burst-panel">
			<div class="insert-burst-heading">
				<strong>爆发包</strong>
				<span>拖到时间轴或点击插入 60 / 120 爆发模板</span>
			</div>
			<div class="insert-burst-card-grid">
				${choices.length ? choices.map(renderBurstInsertCard).join('') : '<p class="empty-state">暂无可插入的爆发包</p>'}
			</div>
		</div>
	`
}

function renderPotionInsertPanel(potions = []) {
	const activeAttribute = activePotionAttribute()
	return `
		<div class="insert-potion-panel">
			<div class="insert-burst-heading">
				<strong>爆发药</strong>
				<span>先选属性，再在下方选择等级；插入后作为 30 秒爆发药窗口，冷却按 4:30 处理</span>
			</div>
			<div class="potion-attribute-grid" role="tablist" aria-label="爆发药属性">
				${POTION_ATTRIBUTES.map(attribute => `
					<button class="potion-attribute-card ${attribute.id === activeAttribute.id ? 'active' : ''}" type="button" data-potion-attribute="${attribute.id}" aria-pressed="${attribute.id === activeAttribute.id ? 'true' : 'false'}" title="选择${escapeHtml(attribute.label)}药">
						<strong>${escapeHtml(attribute.label)}</strong>
						<small>${escapeHtml(attribute.role)}</small>
					</button>
				`).join('')}
			</div>
			<div class="insert-potion-card-grid">
				${potions.length ? potions.map(renderPotionInsertCard).join('') : '<p class="empty-state">暂无可插入的爆发药</p>'}
			</div>
		</div>
	`
}

function uniqueBurstInsertChoices(bursts) {
	const sixtySecondBurst = (bursts ?? []).find(burst => burst.window === '60s') ?? fallbackBurstInsertChoice('60s')
	const oneTwentySecondBurst = (bursts ?? []).find(burst => burst.window === '120s') ?? fallbackBurstInsertChoice('120s')
	return [sixtySecondBurst, oneTwentySecondBurst].filter(Boolean)
}

function fallbackBurstInsertChoice(window) {
	return {
		id: `burst-insert-${window}`,
		type: 'burst-insert',
		window,
		name: window === '120s' ? '120 爆发包' : '60 爆发包',
		timeMs: window === '120s' ? 120000 : 60000,
		durationMs: 12000,
		source: 'manual',
		items: [],
		qt: [],
		burstIndex: window,
	}
}

function insertSkillGroups(track) {
	const currentJobSkills = currentJobInsertSkills()
	const timelineSkills = [
		...(track.mitigation ?? []),
		...mainActionTimelineEvents(track.player ?? []),
		...(state.showAcrSimulation ? state.model.acrSimulation?.events ?? [] : []),
	].filter(event => isCurrentJobInsertEvent(event)).map(event => ({
		...event,
		sidebarType: insertSidebarType(event),
	}))
	const skills = uniqueSkillEvents([...timelineSkills, ...currentJobSkills])
		.sort(compareInsertSkills)
	const burstGroups = burstInsertGroups(track)
	const qtControls = insertQtControls(track)
	const groups = [
		{id: 'all', label: '全部', skills},
		{id: 'output', label: '输出', skills: skills.filter(event => event.sidebarType === 'output')},
		{id: 'mitigation', label: '减伤', skills: skills.filter(event => event.sidebarType === 'mitigation')},
		{id: 'potion', label: '爆发药', skills: potionInsertItems()},
		{id: 'qt', label: 'QT', skills: qtControls},
		{id: 'burst', label: '爆发', skills: burstGroups},
	]
	if (!groups.some(group => group.id === state.insertSkillCategory)) {
		state.insertSkillCategory = 'all'
	}
	return groups
}

function potionInsertItems() {
	return potionInsertItemsForAttribute(activePotionAttribute())
}

function potionInsertItemsForAttribute(attribute) {
	return COMBAT_POTION_TIERS.map((tier, index) => ({
		...tier,
		potionId: `${tier.id}-${attribute.id}`,
		attributeId: attribute.id,
		attributeLabel: attribute.label,
		attributeRole: attribute.role,
		type: 'potion-insert',
		name: `${tier.label}${attribute.label}药`,
		label: `${tier.label}${attribute.label}药`,
		cnName: `${tier.label}${attribute.label}之${tier.familyLabel}`,
		timeMs: index * 1000,
		durationMs: 30000,
		recastMs: 270000,
		source: 'manual',
		sidebarType: 'potion',
	}))
}

function potionInsertById(potionId) {
	return allPotionInsertItems().find(item => item.potionId === potionId) ?? potionInsertItems()[0] ?? null
}

function allPotionInsertItems() {
	return POTION_ATTRIBUTES.flatMap(attribute => potionInsertItemsForAttribute(attribute))
}

function activePotionAttribute() {
	return POTION_ATTRIBUTES.find(attribute => attribute.id === state.potionAttribute) ?? POTION_ATTRIBUTES[0]
}

function setPotionAttribute(attributeId) {
	state.potionAttribute = POTION_ATTRIBUTES.some(attribute => attribute.id === attributeId)
		? attributeId
		: POTION_ATTRIBUTES[0].id
	render()
}

function potionAttributeLabel(attributeId) {
	return POTION_ATTRIBUTES.find(attribute => attribute.id === attributeId)?.label ?? POTION_ATTRIBUTES[0].label
}

function currentJobInsertSkills() {
	return state.model.skillDatabase?.skills
		?.filter(skill => skill.job === state.job)
		?.map(skill => skillToInsertEvent(skill)) ?? []
}

function isCurrentJobInsertEvent(event = {}) {
	const action = actionById(event.actionId)
	return Boolean(action?.job === state.job || event.job === state.job)
}

function skillToInsertEvent(skill) {
	return {
		id: `skill-${skill.id}`,
		name: skill.name,
		actionId: String(skill.id),
		timeMs: 0,
		kind: 'player-action',
		source: 'skill-database',
		classification: skill.type ?? 'unknown',
		output: Boolean(skill.output),
		potency: Number(skill.potency ?? 0),
		durationMs: Number(skill.effectDurationMs ?? 0),
		iconUrl: skill.iconUrl ?? '',
		skillType: skill.category ?? '',
		sidebarType: insertSidebarType(skill),
	}
}

function insertSidebarType(event) {
	if (event.kind === 'potion' || event.type === 'potion' || event.classification === 'potion' || /爆发药/.test(event.name ?? '')) {
		return 'potion'
	}
	if (isInsertOutputOverride(event)) {
		return 'output'
	}
	if (event.classification === 'mitigation' || event.classification === 'healing' || event.type === 'mitigation' || event.type === 'healing') {
		return 'mitigation'
	}
	if (event.output || event.classification === 'damage' || event.classification === 'dot' || event.classification === 'output') {
		return 'output'
	}
	return 'other'
}

function isInsertOutputOverride(event = {}) {
	const name = `${event.name ?? ''} ${event.label ?? ''} ${event.timelineLabel ?? ''}`
	const actionId = Number(event.actionId ?? event.id)
	return actionId === 7390 || /血乱|嗜血/.test(name)
}

function burstInsertGroups(track) {
	return (track.burst ?? state.model.tracks.beginner?.burst ?? []).map((burst, index) => ({
		id: `burst-insert-${index}`,
		type: 'burst-insert',
		window: burst.window ?? (Number(burst.timeMs ?? index * 60000) % 120000 === 0 ? '120s' : '60s'),
		name: burst.window === '120s' ? '120 爆发包' : '60 爆发包',
		timeMs: Number(burst.timeMs ?? index * 60000),
		source: burst.source ?? 'ACR',
		items: Array.isArray(burst.items) ? burst.items : [],
		qt: Array.isArray(burst.qt) ? burst.qt : [],
		burstIndex: index,
	}))
}

function insertQtControls(track) {
	const stateItems = qtStatePanelItems(track)
	if (stateItems.length) {
		return stateItems.map((item, index) => ({
			...item,
			id: `qt-insert-${index}`,
			type: 'qt-insert',
			qtIndex: index,
		}))
	}
	return (timelineQtEvents(track) ?? []).map((event, index) => {
		const name = event.name ?? event.label ?? 'QT 控制'
		const defaultEnabled = Boolean(event.defaultEnabled ?? event.enabled ?? false)
		const enabled = Boolean(event.nextEnabled ?? !defaultEnabled)
		return {
			id: `qt-insert-${index}`,
			type: 'qt-insert',
			name,
			label: event.label ?? name,
			timeMs: Number(event.timeMs ?? event.startMs ?? 0),
			source: event.source ?? 'timeline',
			defaultEnabled,
			nextEnabled: enabled,
			onCount: Number(event.onCount ?? (defaultEnabled ? 1 : 0)),
			offCount: Number(event.offCount ?? (defaultEnabled ? 0 : 1)),
			qtStates: event.qtStates?.length ? event.qtStates : [{Name: name, Enabled: enabled}],
			qtIndex: index,
		}
	})
}

function qtStatePanelItems(track = {}) {
	const playerEvents = Array.isArray(track.player) && track.player.length
		? track.player
		: state.model?.tracks?.expert?.player ?? []
	const states = new Map()
	for (const event of playerEvents) {
		if (event.kind !== 'qt-control' || !Array.isArray(event.qtStates) || !event.qtStates.length) {
			continue
		}
		const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
		for (const rawState of event.qtStates) {
			const name = String(rawState.Name ?? rawState.name ?? '').trim()
			if (!name) {
				continue
			}
			const enabled = Boolean(rawState.Enabled ?? rawState.enabled)
			const entry = states.get(name) ?? {
				name,
				label: name,
				source: event.source ?? 'ACR',
				order: states.size,
				onCount: 0,
				offCount: 0,
				lastTimeMs: -1,
				defaultEnabled: false,
			}
			entry.onCount += enabled ? 1 : 0
			entry.offCount += enabled ? 0 : 1
			if (timeMs >= entry.lastTimeMs) {
				entry.lastTimeMs = timeMs
				entry.timeMs = timeMs
				entry.source = event.source ?? entry.source
				entry.defaultEnabled = enabled
			}
			states.set(name, entry)
		}
	}
	return [...states.values()]
		.sort((left, right) => left.order - right.order)
		.map(item => {
			const name = item.name
			const enabled = !item.defaultEnabled
			return {
				name,
				label: item.label,
				timeMs: Number(item.timeMs ?? 0),
				source: item.source,
				defaultEnabled: Boolean(item.defaultEnabled),
				nextEnabled: enabled,
				onCount: item.onCount,
				offCount: item.offCount,
				qtStates: [{Name: name, Enabled: enabled}],
			}
		})
}

function qtDraftKey(event = {}) {
	return String(event.qtIndex ?? event.name ?? '')
}

function qtDraftEnabledFor(event = {}) {
	const key = qtDraftKey(event)
	if (Object.hasOwn(state.qtDraftStates, key)) {
		return Boolean(state.qtDraftStates[key])
	}
	return Boolean(event.defaultEnabled)
}

function qtDraftStateFor(event = {}) {
	return {
		Name: event.name,
		Enabled: qtDraftEnabledFor(event),
	}
}

function qtDraftChanges(skills = insertQtControls(state.model.tracks.expert)) {
	return (skills ?? [])
		.filter(event => qtDraftEnabledFor(event) !== Boolean(event.defaultEnabled))
		.map(event => ({
			name: event.name,
			enabled: qtDraftEnabledFor(event),
			qtIndex: event.qtIndex,
			qtState: qtDraftStateFor(event),
		}))
}

function toggleQtDraftState(qtIndex) {
	const qt = qtInsertByIndex(qtIndex)
	if (!qt) {
		setImportError('没有找到这个 QT 控制节点')
		return
	}
	const key = qtDraftKey(qt)
	const enabled = !qtDraftEnabledFor(qt)
	state.qtDraftStates = {
		...state.qtDraftStates,
		[key]: enabled,
	}
	setImportStatus(`已暂存 ${qt.name} -> ${enabled ? '开启' : '关闭'}`)
}

function compareInsertSkills(left, right) {
	if (left.type === 'burst-insert' || right.type === 'burst-insert') {
		return Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0)
	}
	const leftLevel = Number(actionById(left.actionId)?.level ?? 0)
	const rightLevel = Number(actionById(right.actionId)?.level ?? 0)
	return leftLevel - rightLevel || String(left.name).localeCompare(String(right.name), 'zh-CN')
}

function renderBurstInsertCard(event) {
	const count = burstInsertSkillNames(event).length
	const burstId = event.burstIndex
	return `
		<div class="skill-card burst-insert-card" draggable="true" data-action="quick-insert-burst" data-burst-index="${burstId}" data-drag-burst="${event.burstIndex}" title="点击插入这个爆发包中可识别的职业技能，也可以拖入时间轴">
			<span class="skill-icon fallback">${event.window === '120s' ? '120' : '60'}</span>
			<strong>${event.name}</strong>
			<small>${formatTime(event.timeMs)} / ${count} 项</small>
			<button type="button" data-action="quick-insert-burst" data-burst-index="${burstId}" title="插入爆发包">+</button>
		</div>
	`
}

function renderPotionInsertCard(event) {
	const attributeLabel = potionAttributeLabel(event.attributeId)
	const title = `${event.cnName} / ${event.name} / ${attributeLabel} / 30s / 4:30`
	return `
		<div class="skill-card potion-insert-card" draggable="true" data-action="quick-insert-potion" data-potion-id="${event.potionId}" data-drag-potion="${event.potionId}" title="${escapeHtml(title)}">
			<span class="skill-icon fallback potion-icon">${escapeHtml(attributeLabel)}</span>
			<strong>${escapeHtml(event.label)}</strong>
			<small><span class="potion-tier-pill">${escapeHtml(event.tier)}</span>${escapeHtml(event.familyLabel)} / Lv.${event.level} / 30s</small>
			<button type="button" data-action="quick-insert-potion" data-potion-id="${event.potionId}" title="插入爆发药">+</button>
		</div>
	`
}

function renderQtInsertCard(event) {
	const enabled = qtDraftEnabledFor(event)
	const title = `${event.name}：点击切换为${enabled ? '关闭' : '开启'}，拖拽到时间轴可直接插入当前草稿状态`
	return `
		<div class="qt-game-toggle ${qtDraftEnabledFor(event) ? 'is-on' : 'is-off'} qt-insert-card" draggable="true" data-action="toggle-qt-draft" data-qt-insert="${event.qtIndex}" data-drag-qt="${event.qtIndex}" data-qt-enabled="${qtDraftEnabledFor(event) ? 'true' : 'false'}" title="${escapeHtml(title)}">
			<span class="qt-game-dot" aria-hidden="true"></span>
			<strong>${escapeHtml(event.name)}</strong>
			<small>${enabled ? '开' : '关'}</small>
		</div>
	`
}

function burstInsertSkillNames(event) {
	return [...(event.items ?? []).map(item => item.name ?? item.label), ...(event.qt ?? [])].filter(Boolean)
}

function renderSkillCard(event) {
	const draggable = isDraggableSkillCard(event)
	const lockedText = event.sidebarType === 'acr' ? 'ACR 自动技能已锁定，可关注查看，后续高手模式再允许复制为手动技能。' : '切到编辑模式后可拖入时间轴'
	const title = draggable ? '拖入时间轴' : lockedText
	return `
		<div class="skill-card ${event.sidebarType === 'acr' ? 'simulated acr-locked' : ''} ${draggable ? '' : 'locked'}" draggable="${draggable ? 'true' : 'false'}" data-action="quick-insert-skill" data-drag-skill="${event.actionId}" data-drag-locked="${draggable ? 'false' : 'true'}" data-skill-source="${event.sidebarType}" title="${title}">
			${renderIcon(event.name, event.iconUrl)}
			<strong>${event.name}</strong>
			<small>${insertSkillCardMeta(event)}</small>
			<button type="button" data-action="quick-insert-skill" data-drag-skill="${event.actionId}" title="插入到手动队列">+</button>
		</div>
	`
}

function insertSkillCardMeta(event) {
	if (event.sidebarType === 'acr') {
		return 'ACR 锁定'
	}
	const action = actionById(event.actionId)
	const level = action?.level ? `Lv.${action.level}` : ''
	const typeLabel = insertSidebarLabel(event.sidebarType) || manualClassificationLabel(event) || event.skillType || event.sidebarType
	return [typeLabel, level].filter(Boolean).join(' / ') || formatTime(event.timeMs)
}

function insertSidebarLabel(type) {
	if (type === 'output') return '输出'
	if (type === 'mitigation') return '减伤'
	if (type === 'potion') return '爆发药'
	return ''
}

function isDraggableSkillCard(event) {
	return canEditTimeline() && event.sidebarType !== 'acr'
}

function qtInsertByIndex(qtIndex) {
	return insertQtControls(state.model.tracks.expert).find(item => String(item.qtIndex) === String(qtIndex))
}

function burstInsertByIndex(burstIndex) {
	const burst = burstInsertGroups(state.model.tracks.expert).find(item => String(item.burstIndex) === String(burstIndex))
	if (burst) {
		return burst
	}
	return ['60s', '120s'].includes(String(burstIndex)) ? fallbackBurstInsertChoice(String(burstIndex)) : null
}

function renderEventChip(event, index, laneType) {
	const colorClass = laneType === 'boss' ? `boss-color-${index % 4}` : laneType
	const style = event.timeMs ? `style="left:calc(${Math.min(94, event.timeMs / 720000 * 100)}%);"` : ''
	const damage = event.damage == null ? '' : `<small class="damage">${event.damage || 0}</small>`
	const badge = event.kind === 'boss-cast'
		? `<span class="corner start">${event.castStartLabel}</span><span class="corner end">${event.castEndLabel}</span>`
		: ''
	return `
		<button class="event-chip ${colorClass}" ${style} title="${event.name}">
			${badge}
			${laneType !== 'boss' ? renderIcon(event.name) : '<span class="cast-dot"></span>'}
			<span>${event.name}</span>
			${damage}
			<em>${formatTime(event.timeMs)}</em>
		</button>
	`
}

function buildVisualTimelineRows(track) {
	const parsedBossCastRows = state.model.timelineRows.filter(row => (row.groupId ?? row.id) === 'boss-casts')
	const parsedBossDamageRows = state.model.timelineRows.filter(row => (row.groupId ?? row.id) === 'boss-damage')
	const boss = track.boss.slice(0, 72)
	const player = track.player ?? []
	const mitigation = track.mitigation ?? []
	const simulated = state.showAcrSimulation
		? (track.simulated ?? state.model.acrSimulation?.events ?? [])
		: []
	const manual = manualQueueEvents().map((item, index) => timelineManualItem(item, index))
	const qtSource = timelineQtEvents(track)
	const burstPackages = buildBurstPackageItems(track.burst ?? state.model.tracks.beginner?.burst ?? [])
	const focused = focusedSkillRows()
	const castItems = boss.map(event => ({
		id: event.id,
		type: 'cast',
		label: event.name,
		startMs: event.timeMs,
		endMs: event.timeMs + (event.castDurationMs ?? 4700),
		timeLabel: formatTime(event.timeMs),
		damage: event.damage ?? 0,
	}))
	const bossCastRows = parsedBossCastRows.length
		? parsedBossCastRows
		: [{id: 'boss-casts', label: 'Boss Casts', accent: 'rose', items: castItems}]
	const bossDamageRows = parsedBossDamageRows.length
		? parsedBossDamageRows
		: [{id: 'boss-damage', label: 'Boss Damage', accent: 'gold', items: castItems.map(item => ({...item, id: `${item.id}-dmg`, type: 'damage', label: String(item.damage ?? 0), startMs: item.endMs, endMs: item.endMs + 1200}))}]
	const bossRows = prepareBossTimelineRows(mergeBossCastAndDamageRows([...bossCastRows, ...bossDamageRows]), state.model.bossTimeline?.source, 'all', Infinity)
	const rows = [
		...bossRows,
		{id: 'output-actions', label: '输出轴', accent: 'mint', items: buildOutputLaneItems(player, qtSource, manual)},
		{id: 'mitigation-actions', label: '减伤 / 奶轴', accent: 'mint', items: buildMitigationLaneItems(mitigation, manual, qtSource)},
		{id: 'burst-integration', label: '爆发', accent: 'orange', items: buildBurstLaneItems(burstPackages, qtSource, manual)},
		{id: 'acr-simulated', label: 'ACR 模拟', accent: 'sky', items: simulated.map(event => timelineItemForEvent(event, {defaultType: event.output ? 'simulated-gcd' : 'simulated-action', simulated: true}))},
		{id: 'focus-add', label: '+ 关注技能', labelHtml: renderFocusAddLabel(), accent: 'sky', html: renderFocusAddRow(), items: []},
		...focused,
	].filter(row => row.id !== 'acr-simulated' || row.items.length)
	let bossIndex = 0
	return timelineRowsForPhase(rows, state.model.bossTimeline?.source, state.phase)
		.map(limitVisibleTimelineRowItems)
		.map(row => row.groupId === 'boss' ? {...row, bossIndex: bossIndex++} : row)
}

function buildOutputLaneItems(player = [], qtSource = [], manual = []) {
	const playerItems = mainActionTimelineEvents(player)
		.filter(event => !isBurstTimelineEvent(event))
		.map(event => timelineItemForEvent(event, {defaultType: event.potency > 0 ? 'gcd' : 'action'}))
	const qtItems = qtSource
		.filter(event => timelineFunctionalLane(event) === 'output')
		.map(event => timelineItemForEvent(event, {defaultType: 'action'}))
	const manualItems = manual.filter(event => timelineFunctionalLane(event) === 'output')
	return sortTimelineItems([...playerItems, ...qtItems, ...manualItems])
}

function buildMitigationLaneItems(mitigation = [], manual = [], qtSource = []) {
	const mitigationItems = mitigation
		.filter(event => timelineFunctionalLane(event) === 'mitigation')
		.map(event => timelineItemForEvent(event, {defaultType: 'action'}))
	const qtItems = qtSource
		.filter(event => timelineFunctionalLane(event) === 'mitigation')
		.map(event => timelineItemForEvent(event, {defaultType: 'action'}))
	const manualItems = manual.filter(event => timelineFunctionalLane(event) === 'mitigation')
	return sortTimelineItems(uniqueTimelineDisplayEvents([...mitigationItems, ...qtItems, ...manualItems]))
}

function buildBurstLaneItems(burstPackages = [], qtSource = [], manual = []) {
	const qtItems = qtSource
		.filter(event => timelineFunctionalLane(event) === 'burst')
		.map(event => timelineItemForEvent(event, {defaultType: timelineEventType(event)}))
	const manualItems = manual.filter(event => timelineFunctionalLane(event) === 'burst')
	return sortTimelineItems([...burstPackages, ...qtItems, ...manualItems])
}

function timelineQtEvents(track = {}) {
	const parsed = state.model.timelineRows.find(row => row.id === 'qt-potion')?.items ?? []
	const trackQt = (track.qt ?? []).map((event, index) => ({
		id: event.id ?? `track-qt-${index}`,
		type: event.type ?? 'qt',
		name: event.name ?? event.label ?? 'QT',
		label: event.label ?? event.name ?? 'QT',
		timeMs: Number(event.timeMs ?? event.startMs ?? 0),
		startMs: Number(event.startMs ?? event.timeMs ?? 0),
		endMs: Number(event.endMs ?? event.timeMs ?? event.startMs ?? 0) || Number(event.timeMs ?? event.startMs ?? 0) + 2500,
		durationMs: Number(event.durationMs ?? 2500),
		classification: event.classification ?? 'qt',
		kind: event.kind ?? 'qt-control',
		source: event.source ?? 'timeline',
		actionId: event.actionId,
		iconUrl: event.iconUrl ?? '',
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
	}))
	return uniqueTimelineEvents([...parsed.map(parsedTimelineItemToEvent), ...trackQt])
}

function limitVisibleTimelineRowItems(row) {
	const limits = {
		'output-actions': 220,
		'mitigation-actions': 160,
		'burst-integration': 120,
		'acr-simulated': 420,
	}
	const limit = limits[row.id]
	if (!limit || row.html || row.keepWhenEmpty || (row.items ?? []).length <= limit) {
		return row
	}
	return {
		...row,
		items: row.items.slice(0, limit),
	}
}

function renderTimelineAxis(maxTime) {
	return timelineTicks(maxTime).map(tick => `
		<div class="xiva-tick ${tick.kind}" style="left:${timelinePercent(tick.ms, maxTime)}%">
			${tick.label ? `<span>${tick.label}</span>` : ''}
		</div>
	`).join('')
}

function renderTimelineDragGuide() {
	return `
		<div class="timeline-drag-guide" aria-hidden="true">
			<div class="timeline-drag-guide-line"></div>
			<div class="timeline-drag-guide-bubble">
				<strong data-guide-phase>全部</strong>
				<span data-guide-time>0:00</span>
				<small data-guide-absolute></small>
			</div>
			<div class="timeline-drag-guide-delta" data-guide-delta></div>
		</div>
	`
}

function renderTimelineRow(row, maxTime, timelineWidth = 0) {
	const rowClass = row.groupId === 'boss' ? 'boss-row' : ''
	const rowLabel = renderTimelineRowLabel(row)
	if (row.html) {
		return `
			<div class="xiva-label ${row.accent} ${rowClass}">
				${rowLabel}
			</div>
			<div class="xiva-track xiva-row-track ${row.accent} ${rowClass} focus-add-track" data-row-id="${row.id}" data-drop-lane="${timelineDropLaneForRow(row)}">
				${row.html}
			</div>
		`
	}
	const items = assignTimelineLanes(row.items, {
		durationMs: maxTime,
		trackWidthPx: timelineWidth,
		minVisualWidthPx: row.groupId === 'boss' ? 180 : 0,
		minVisualGapPx: row.groupId === 'boss' ? 12 : 0,
		laneGapMs: row.groupId === 'boss' ? 800 : 0,
	})
	const lanes = timelineLaneCount(items)
	return `
		<div class="xiva-label ${row.accent} ${rowClass}" style="--lane-count:${lanes}">
			${rowLabel}
		</div>
		<div class="xiva-track xiva-row-track ${row.accent} ${rowClass}" style="--lane-count:${lanes}" data-row-id="${row.id}" data-drop-lane="${timelineDropLaneForRow(row)}">
			${renderTimelineGrid(maxTime)}
			${items.map(item => renderTimelineItem(item, maxTime, row.bossIndex)).join('')}
		</div>
	`
}

function timelineDropLaneForRow(row = {}) {
	if (row.id === 'output-actions') return 'output'
	if (row.id === 'mitigation-actions') return 'mitigation'
	if (row.id === 'burst-integration') return 'burst'
	return 'locked'
}

function timelineDropLaneForTarget(target) {
	return target?.closest?.('[data-drop-lane]')?.dataset.dropLane ?? 'locked'
}

function timelineDropLaneAtClientPoint(clientX, clientY) {
	const target = document.elementFromPoint(clientX, clientY)
	return timelineDropLaneForTarget(target)
}

function actionTimelineDropLane(actionId) {
	const action = actionById(actionId)
	const classification = classifyImportedAction(actionId, action?.name ?? '', 'player-action')
	if (classification.type === 'mitigation' || classification.type === 'healing') {
		return 'mitigation'
	}
	if (classification.output || classification.type === 'damage' || classification.type === 'dot' || classification.type === 'output') {
		return 'output'
	}
	return 'output'
}

function canDropActionOnTimelineLane(actionId, dropLane) {
	if (dropLane === 'locked') {
		return false
	}
	return actionTimelineDropLane(actionId) === dropLane
}

function canDropBurstPackageOnTimelineLane(dropLane) {
	return dropLane === 'burst'
}

function canDropPotionOnTimelineLane(dropLane) {
	return dropLane === 'burst'
}

function renderTimelineRowLabel(row) {
	if (row.labelHtml) {
		return row.labelHtml
	}
	if (row.groupId !== 'boss') {
		return `<span>${row.label}</span>`
	}
	return `${renderBossAvatar(row.sourceName ?? row.label, row.bossIndex)}<span class="boss-label-name">${row.label}</span>`
}

function renderTimelineGrid(maxTime) {
	const ticks = timelineTicks(maxTime).map(tick => `<i class="${tick.kind}" style="left:${timelinePercent(tick.ms, maxTime)}%"></i>`)
	return `<div class="xiva-grid">${ticks.join('')}</div>`
}

function renderTimelineItem(item, maxTime, bossIndex) {
	const itemLabel = displayNameForAction(item)
	const timelineLabel = item.timelineLabel || (itemLabel !== item.label ? item.label : '')
	const start = timelinePercent(item.startMs, maxTime)
	const pointTypes = [`action`, `gcd`, `potion`, `simulated-gcd`, `simulated-action`]
	const width = pointTypes.includes(item.type) ? null : Math.max(item.type === `cast` ? 0.8 : 0.45, timelinePercent(item.endMs, maxTime) - start)
	const icon = renderTimelineIcon(item, itemLabel)
	const lane = Math.max(0, Number(item.lane ?? 0))
	const countBadge = item.eventCount > 1 ? `<b class="item-count">x${item.eventCount}</b>` : ``
	const isCast = item.type === `cast`
	const isDamage = item.type === `damage`
	const bossLaneTop = `calc(7px + ${lane} * 62px)`
	const damage = Number(item.damage ?? 0)
	const startTimeLabel = item.timeLabel ?? formatTime(item.startMs)
	const endTimeLabel = formatTime(item.endMs ?? item.startMs)
	const sourceKind = sourceClassForTimelineItem(item)
	const sourceBadge = renderTimelineSourceBadge(item)
	if (isCast) {
		const highDamageClass = damage >= 200000 ? 'high-damage' : ''
		const noDamageClass = damage <= 0 ? 'no-damage' : ''
		const tooltipParts = [item.label, `${startTimeLabel}`, `${endTimeLabel}`, `${formatDamage(damage)}`]
		if (item.eventCount > 1) tooltipParts.push(`x${item.eventCount}`)
		const tooltip = tooltipParts.join(` / `)
		const bossColorClass = `boss-idx-${(bossIndex ?? 0) % 5}`
		return `
			<button class="xiva-item cast ${bossColorClass} ${highDamageClass} ${noDamageClass}" style="left:${start}%; top:${bossLaneTop}; ${width == null ? `` : `width:${width}%;`}" data-boss-idx="${bossIndex ?? 0}" title="${tooltip}">
				<span class="cast-main">
					<b class="cast-badge">读条</b>
					<span class="cast-name">${item.label}</span>
					<strong class="item-damage">${formatDamage(damage)}</strong>
				</span>
				<span class="cast-meta">
					<small class="cast-time">开始 ${startTimeLabel}</small>
					<em class="cast-start" aria-label="释放判定">判定</em>
					<small class="cast-resolve">${endTimeLabel}</small>
					<em class="cast-release">结束</em>
				</span>
				${countBadge}
			</button>
		`
	}
	if (isDamage) {
		const damageLabel = damage > 0 ? formatDamage(damage) : '0'
		const tooltip = [itemLabel, `判定 ${startTimeLabel}`, `伤害 ${damageLabel}`]
		if (item.eventCount > 1) tooltip.push(`x${item.eventCount}`)
		return `
			<button class="xiva-item damage boss-damage-card" style="left:${start}%; top:${bossLaneTop}; ${width == null ? `` : `width:${width}%;`}" title="${tooltip.join(' / ')}">
				<strong class="boss-damage-name">${itemLabel}</strong>
				<span class="boss-damage-meta">
					<small class="boss-damage-time">判定 ${startTimeLabel}</small>
					<b class="boss-damage-value">${damageLabel}</b>
				</span>
				${countBadge}
			</button>
		`
	}
	if (item.type === 'focus-tracker') {
		const eventLabel = item.eventLabel && item.eventLabel !== item.label ? ` / ${item.eventLabel}` : ''
		return `
			<button class="xiva-item focus-tracker focus-tracker-item" style="left:${start}%; top:calc(7px + ${lane} * 42px);" title="${item.label}${eventLabel} / ${startTimeLabel} / ${item.sourceLabel}">
				${renderIcon(item.label, item.iconUrl)}
				<span class="focus-tracker-name">${item.label}</span>
				<small class="focus-tracker-time">${startTimeLabel}</small>
				<em class="focus-tracker-source">${item.sourceLabel}</em>
			</button>
		`
	}
	if (item.type === 'burst-package') {
		const editableBurstPackage = canEditTimeline() && Boolean(item.manualId)
		const timeLabel = burstPackageTimeLabel(item, startTimeLabel)
		const absoluteLabel = burstPackageAbsoluteLabel(item)
		const absoluteText = absoluteLabel ? `<small class="burst-package-absolute">${absoluteLabel}</small>` : ''
		const adjustedLabel = hasMeaningfulCdAdjustment(item) ? `<em class="burst-package-adjusted">顺延 +${formatDuration(item.cdAdjustedMs)}</em>` : ''
		const tooltip = [
			item.label,
			`判定 ${timeLabel}`,
			absoluteLabel,
			hasMeaningfulCdAdjustment(item) ? `爆发窗口已顺延 +${formatDuration(item.cdAdjustedMs)}` : '',
			`${item.skillCount} 个技能`,
			item.sourceLabel,
			editableBurstPackage ? '可拖动调整时间' : '',
		].filter(Boolean).join(' / ')
		return `
			<button class="xiva-item burst-package ${item.window === '120s' ? 'major' : 'minor'} ${editableBurstPackage ? 'editable' : 'locked'}" style="left:${start}%; top:calc(7px + ${lane} * 42px); ${width == null ? `` : `width:${width}%;`}" title="${tooltip}" draggable="${editableBurstPackage ? 'true' : 'false'}" ${item.manualId ? `data-manual-id="${item.manualId}"` : ''} data-source-kind="${sourceKind}" data-locate-event-key="${item.locateEventKey}">
				<strong>${item.label}</strong>
				<span class="burst-package-time">判定 ${burstPackageTimeLabel(item, startTimeLabel)}${absoluteText}</span>
				<small class="burst-package-count">${item.skillCount} 技能</small>
				<em class="burst-package-source">${item.sourceLabel}</em>
				${adjustedLabel}
				${editableBurstPackage ? `<b class="manual-grip">拖</b>${renderTimelineDeleteButton(item, editableBurstPackage)}` : ''}
			</button>
		`
	}
	const damageBadge = isDamage || damage > 0 ? `<strong class="item-damage">${formatDamage(damage)}</strong>` : ``
	if (item.manualId) {
		const editable = canEditTimeline()
		const cdLabel = hasMeaningfulCdAdjustment(item) ? `队列CD调整 +${formatDuration(item.cdAdjustedMs)}` : ''
		const tooltip = [itemLabel, timelineLabel ? `原轴：${timelineLabel}` : '', cdLabel, startTimeLabel, editable ? '可拖动调整时间' : ''].filter(Boolean).join(' / ')
		return `
			<button class="xiva-item ${item.type} editable-manual source-${sourceKind} ${editable ? 'editable' : 'locked'}" style="left:${start}%; top:calc(7px + ${lane} * 42px); ${width == null ? `` : `width:${width}%;`}" title="${tooltip}" draggable="${editable ? 'true' : 'false'}" data-manual-id="${item.manualId}" data-source-kind="${sourceKind}" data-locate-event-key="${item.locateEventKey}">
				${icon}
				<span>${itemLabel}</span>
				<small>${startTimeLabel}</small>
				${damageBadge}
				${sourceBadge}
				${cdLabel ? `<em class="manual-cd-badge">${cdLabel}</em>` : ''}
				${editable ? `<b class="manual-grip">拖</b>${renderTimelineDeleteButton(item, editable)}` : ''}
			</button>
		`
	}
	const editableEvent = canEditTimeline() && Boolean(item.editableEventKey)
	return `
		<button class="xiva-item ${item.type} source-${sourceKind} ${editableEvent ? 'editable-timeline-event editable' : ''}" style="left:${start}%; top:calc(7px + ${lane} * 42px); ${width == null ? `` : `width:${width}%;`}" title="${[itemLabel, timelineLabel ? `原轴：${timelineLabel}` : '', startTimeLabel, editableEvent ? '可拖动调整时间' : ''].filter(Boolean).join(' / ')}" draggable="${editableEvent ? 'true' : 'false'}" data-source-kind="${sourceKind}" data-locate-event-key="${item.locateEventKey}" ${item.editableEventKey ? `data-timeline-event-key="${item.editableEventKey}"` : ''}>
			${icon}
			<span>${itemLabel}</span>
			<small class="${isDamage ? `cast-time` : ``}">${startTimeLabel}</small>
			${damageBadge}
			${sourceBadge}
			${countBadge}
			${renderTimelineDeleteButton(item, editableEvent)}
		</button>
	`
}

function renderTimelineDeleteButton(item = {}, canDelete = false) {
	if (!canDelete) {
		return ''
	}
	if (item.manualId) {
		return `<i class="timeline-delete-button manual-remove" data-action="remove-manual-skill" data-manual-id="${item.manualId}" title="删除技能">×</i>`
	}
	if (item.editableEventKey) {
		return `<i class="timeline-delete-button manual-remove" data-action="remove-timeline-event" data-timeline-event-key="${item.editableEventKey}" title="删除技能">×</i>`
	}
	return ''
}

function renderTimelineIcon(item = {}, itemLabel = '') {
	if (item.kind === 'qt-control' || item.type === 'qt' || item.classification === 'qt') {
		return '<span class="skill-icon fallback qt-fallback" aria-hidden="true">QT</span>'
	}
	if (item.type === 'potion') {
		return renderPotionTimelineIcon(item)
	}
	const iconTypes = [`action`, `gcd`, `potion`, `simulated-gcd`, `simulated-action`, `mitigation`, `healing`]
	return iconTypes.includes(item.type) || item.type === `dot` ? renderIcon(itemLabel, item.iconUrl) : ``
}

function renderPotionTimelineIcon(item = {}) {
	return `<span class="skill-icon fallback potion-timeline-icon" aria-hidden="true" title="${escapeHtml(displayNameForAction(item))}">药</span>`
}

function hasMeaningfulCdAdjustment(event = {}) {
	return Number(event.cdAdjustedMs ?? 0) >= 1000
}

function burstPackageTimeLabel(item = {}, fallbackLabel = '') {
	if (state.phase !== 'all') {
		return fallbackLabel || formatTime(item.startMs ?? item.timeMs ?? 0)
	}
	return formatTime(item.timeMs ?? item.absoluteStartMs ?? item.startMs ?? 0)
}

function burstPackageAbsoluteLabel(item = {}) {
	if (state.phase === 'all') {
		return ''
	}
	const absoluteTimeMs = Number(item.timeMs ?? item.absoluteStartMs ?? item.startMs ?? 0)
	return `全局 ${formatTime(absoluteTimeMs)}`
}

function renderTimelineSourceBadge(item) {
	const label = sourceLabelForTimelineItem(item)
	return label ? `<em class="source-badge">${label}</em>` : ''
}

function sourceClassForTimelineItem(item) {
	if (item.type === 'simulated-gcd' || item.type === 'simulated-action' || item.simulated) {
		return 'acr'
	}
	if (item.type === 'mitigation') {
		return 'mitigation'
	}
	if (item.type === 'healing') {
		return 'healing'
	}
	if (item.type === 'dot') {
		return 'dot'
	}
	if (item.type === 'potion') {
		return 'potion'
	}
	if (item.manualId) {
		return 'editable'
	}
	return 'import'
}

function sourceLabelForTimelineItem(item) {
	if (item.type === 'simulated-gcd' || item.type === 'simulated-action' || item.simulated) {
		return 'ACR 自动'
	}
	if (item.type === 'mitigation') {
		return '减伤'
	}
	if (item.type === 'healing') {
		return '治疗'
	}
	if (item.type === 'dot') {
		return 'DoT'
	}
	if (item.type === 'potion') {
		return '爆发药'
	}
	return ''
}

function timelineItemForEvent(event, options = {}) {
	const durationMs = Number(event.durationMs ?? 0) > 0 ? Number(event.durationMs) : 1600
	const type = timelineEventType(event, options.defaultType ?? 'action')
	const label = displayNameForAction(event)
	return {
		id: event.id,
		type,
		label,
		timelineLabel: event.timelineLabel || (label !== event.name ? event.name : ''),
		startMs: Number(event.timeMs ?? event.startMs ?? 0),
		endMs: Number(event.timeMs ?? event.startMs ?? 0) + durationMs,
		timeLabel: formatTime(Number(event.timeMs ?? event.startMs ?? 0)),
		actionId: event.actionId,
		potency: event.potency ?? 0,
		iconUrl: event.iconUrl ?? '',
		output: Boolean(event.output),
		simulated: Boolean(options.simulated ?? event.simulated),
		durationMs,
		classification: event.classification,
		kind: event.kind,
		source: event.source,
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
		manualId: event.manualId,
		editableEventKey: canEditTimelineItem(event) ? timelineEventEditKey(event) : '',
		locateEventKey: detailTimelineEventKey(event),
		cdAdjustedMs: event.cdAdjustedMs ?? 0,
		requestedTimeMs: event.requestedTimeMs ?? event.timeMs ?? event.startMs ?? 0,
	}
}

function canEditTimelineItem(event = {}) {
	return !event.manualId
		&& !event.simulated
		&& event.source !== 'KANO ACR'
		&& event.kind !== 'boss-cast'
		&& event.type !== 'cast'
		&& ['player-action', 'potion', 'qt-control'].includes(event.kind ?? 'player-action')
}

function timelineEventEditKey(event = {}) {
	return [
		event.id ?? '',
		event.actionId ?? '',
		event.name ?? event.label ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		event.kind ?? '',
		event.classification ?? event.type ?? '',
	].map(value => encodeURIComponent(String(value ?? ''))).join('::')
}

function detailTimelineEventKey(event = {}) {
	const actionId = event.actionId ?? actionByName(displayNameForAction(event))?.id ?? ''
	const timeMs = Math.round(Number(event.timeMs ?? event.startMs ?? 0))
	const kind = event.kind ?? event.classification ?? event.type ?? ''
	return [
		actionId,
		timeMs,
		kind,
	].map(value => encodeURIComponent(String(value ?? ''))).join('::')
}

function manualQueueEvents() {
	return normalizeManualQueue(state.inserted)
}

function fflogsComparisonEvents() {
	if (!state.model?.tracks?.expert) {
		return []
	}
	return uniqueComparisonEvents([
		...fflogsCurrentSimulationEvents(),
		...fflogsCurrentTimelineEvents(),
		...manualQueueEvents(),
	])
		.filter(isFflogsComparisonEvent)
		.map(fflogsComparisonEvent)
}

function fflogsCurrentSimulationEvents() {
	return fflogsAcrSimulationEvents(state.model.tracks.expert)
}

function fflogsAcrSimulationEvents(track = {}) {
	if (Array.isArray(track.simulated) && track.simulated.length) {
		return track.simulated
	}
	if (Array.isArray(state.model?.acrSimulation?.events) && state.model.acrSimulation.events.length) {
		return state.model.acrSimulation.events
	}
	return state.model?.damage?.events ?? []
}

function fflogsCurrentTimelineEvents() {
	const track = state.model?.tracks?.expert ?? {}
	return (track.player ?? [])
		.filter(event => !event.output && event.source !== 'KANO ACR' && !event.simulated)
}

function isFflogsComparisonEvent(event = {}) {
	if (!event || event.type === 'burst-package' || event.kind === 'boss-cast') {
		return false
	}
	if (event.kind === 'qt-control' || event.type === 'qt' || event.classification === 'qt') {
		return false
	}
	return Boolean(
		Number(event.actionId)
		|| event.output
		|| event.classification === 'damage'
		|| event.classification === 'output'
		|| event.classification === 'mitigation'
		|| event.classification === 'healing'
		|| event.classification === 'potion'
		|| event.kind === 'potion',
	)
}

function fflogsComparisonEvent(event = {}) {
	const action = actionById(event.actionId)
	const timeMs = Math.max(0, Math.round(Number(event.timeMs ?? event.startMs ?? 0)))
	const phase = event.phase ?? fflogsComparisonPhaseForTime(timeMs)
	return {
		...event,
		timeMs,
		requestedTimeMs: Number(event.requestedTimeMs ?? timeMs),
		phase,
		phaseStartMs: event.phaseStartMs ?? fflogsComparisonPhaseStartMs(phase),
		kind: event.kind ?? 'player-action',
		name: displayNameForAction(event),
		actionId: Number(event.actionId ?? 0) || '',
		source: event.source ?? (event.simulated ? 'ACR' : 'timeline'),
		classification: event.classification ?? action?.type ?? (event.output ? 'damage' : 'unknown'),
		output: Boolean(event.output ?? action?.output),
		potency: Number(event.potency ?? action?.potency ?? 0),
		count: Number(event.count ?? 1) || 1,
		iconUrl: event.iconUrl ?? action?.iconUrl ?? '',
		skillType: event.skillType ?? (action?.gcd ? 'GCD' : action?.category ?? ''),
		weave: event.weave ?? (action?.gcd ? 'gcd' : action ? 'ogcd' : undefined),
		simulated: Boolean(event.simulated),
	}
}

function uniqueComparisonEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = fflogsComparisonEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function fflogsComparisonEventKey(event = {}) {
	const timeMs = Math.round(Number(event.timeMs ?? event.startMs ?? 0))
	const id = String(event.id ?? '')
	if (id) {
		return `${id}|${timeMs}|${event.source ?? ''}`
	}
	return [
		event.actionId || event.name || event.label || '',
		timeMs,
		event.source ?? '',
		event.kind ?? event.type ?? '',
		event.classification ?? '',
	].join('|')
}

function fflogsComparisonPhaseForTime(timeMs) {
	const phases = phaseOptions(state.model?.bossTimeline?.source)
	const phase = phases.find(item => timeMs >= item.startMs && timeMs < item.endMs) ?? phases.at(-1)
	return phase?.label ?? '全局'
}

function fflogsComparisonPhaseStartMs(phaseLabel) {
	const phases = phaseOptions(state.model?.bossTimeline?.source)
	const phase = phases.find(item => item.label === phaseLabel || item.id === String(phaseLabel).toLowerCase())
	return phase?.startMs
}

function normalizeManualStateQueue() {
	state.inserted = normalizeManualQueue(state.inserted).map(({_queueIndex, ...event}) => event)
}

function normalizeManualQueue(events = [], baselineEvents = timelineCooldownBaselineEvents()) {
	const nextReadyByKey = new Map()
	let queueReadyMs = 0
	let gcdReadyMs = 0
	const baselines = baselineEvents
		.map((event, index) => ({
			...event,
			_queueIndex: index,
			isManual: false,
			requestedTimeMs: Number(event.timeMs ?? event.startMs ?? 0),
		}))
		.sort((left, right) => Number(left.requestedTimeMs ?? 0) - Number(right.requestedTimeMs ?? 0) || left._queueIndex - right._queueIndex)
	const manuals = events
		.map((event, index) => ({
			...event,
			_queueIndex: index,
			isManual: true,
			requestedTimeMs: Number(event.requestedTimeMs ?? event.timeMs ?? 0),
		}))
		.sort((left, right) => Number(left.requestedTimeMs ?? 0) - Number(right.requestedTimeMs ?? 0) || left._queueIndex - right._queueIndex)
	const normalizedManual = []
	let baselineIndex = 0
	const processBaseline = baseline => {
		const action = actionById(baseline.actionId)
		applyCooldownUsage({
			timeMs: Math.max(0, Math.round(Number(baseline.requestedTimeMs ?? baseline.timeMs ?? baseline.startMs ?? 0))),
			event: baseline,
			action,
			cooldownKey: manualCooldownKey(baseline, action),
			recastMs: manualActionRecastMs(baseline, action),
			lockMs: manualActionQueueLockMs(baseline, action),
			nextReadyByKey,
			setQueueReadyMs: value => {
				queueReadyMs = Math.max(queueReadyMs, value)
			},
			setGcdReadyMs: value => {
				gcdReadyMs = Math.max(gcdReadyMs, value)
			},
		})
	}
	const processBaselinesUpTo = timeMs => {
		while (baselineIndex < baselines.length && Number(baselines[baselineIndex].requestedTimeMs ?? 0) <= timeMs) {
			processBaseline(baselines[baselineIndex])
			baselineIndex += 1
		}
	}
	for (const event of manuals) {
		const action = actionById(event.actionId)
		const requestedTimeMs = Math.max(0, Math.round(Number(event.requestedTimeMs ?? event.timeMs ?? event.startMs ?? 0)))
		const cooldownKey = manualCooldownKey(event, action)
		const recastMs = manualActionRecastMs(event, action)
		const lockMs = manualActionQueueLockMs(event, action)
		processBaselinesUpTo(requestedTimeMs)
		let actualTimeMs = nextManualReadyTime({
			requestedTimeMs,
			event,
			action,
			cooldownKey,
			recastMs,
			queueReadyMs,
			gcdReadyMs,
			nextReadyByKey,
		})
		while (baselineIndex < baselines.length && baselineConflictsWithManual(baselines[baselineIndex], {
			actualTimeMs,
			event,
			action,
			cooldownKey,
			recastMs,
			lockMs,
		})) {
			processBaseline(baselines[baselineIndex])
			baselineIndex += 1
			actualTimeMs = nextManualReadyTime({
				requestedTimeMs,
				event,
				action,
				cooldownKey,
				recastMs,
				queueReadyMs,
				gcdReadyMs,
				nextReadyByKey,
			})
		}
		const normalized = {
			...event,
			timeMs: actualTimeMs,
			requestedTimeMs,
			cdAdjustedMs: Math.max(0, actualTimeMs - requestedTimeMs),
			cooldownKey,
			recastMs,
		}
		applyCooldownUsage({
			timeMs: actualTimeMs,
			event,
			action,
			cooldownKey,
			recastMs,
			lockMs,
			nextReadyByKey,
			setQueueReadyMs: value => {
				queueReadyMs = Math.max(queueReadyMs, value)
			},
			setGcdReadyMs: value => {
				gcdReadyMs = Math.max(gcdReadyMs, value)
			},
		})
		normalizedManual.push(normalized)
	}
	return normalizedManual.sort((left, right) => Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0) || Number(left._queueIndex ?? 0) - Number(right._queueIndex ?? 0))
}

function nextManualReadyTime({
	requestedTimeMs,
	event,
	action,
	cooldownKey,
	recastMs,
	queueReadyMs,
	gcdReadyMs,
	nextReadyByKey,
}) {
	if (event.type === 'burst-package') {
		return cooldownKey && recastMs > 0
			? Math.max(requestedTimeMs, Number(nextReadyByKey.get(cooldownKey) ?? 0))
			: requestedTimeMs
	}
	let actualTimeMs = Math.max(requestedTimeMs, queueReadyMs)
	if (isGcdAction(event, action)) {
		actualTimeMs = Math.max(actualTimeMs, gcdReadyMs)
	}
	if (cooldownKey && recastMs > 0) {
		actualTimeMs = Math.max(actualTimeMs, Number(nextReadyByKey.get(cooldownKey) ?? 0))
	}
	return actualTimeMs
}

function baselineConflictsWithManual(baseline = {}, manual = {}) {
	const baselineTimeMs = Math.max(0, Math.round(Number(baseline.requestedTimeMs ?? baseline.timeMs ?? baseline.startMs ?? 0)))
	if (baselineTimeMs < manual.actualTimeMs) {
		return true
	}
	if (baselineTimeMs < manual.actualTimeMs + manual.lockMs) {
		return true
	}
	const baselineAction = actionById(baseline.actionId)
	if (isGcdAction(manual.event, manual.action) && isGcdAction(baseline, baselineAction) && baselineTimeMs < manual.actualTimeMs + Math.max(manual.recastMs, 2500)) {
		return true
	}
	const baselineKey = manualCooldownKey(baseline, baselineAction)
	return Boolean(manual.cooldownKey && baselineKey === manual.cooldownKey && baselineTimeMs < manual.actualTimeMs + manual.recastMs)
}

function timelineCooldownBaselineEvents() {
	if (!state.model?.tracks?.expert) {
		return []
	}
	const track = state.model.tracks.expert
	return [
		...mainActionTimelineEvents(track.player ?? []),
		...(track.mitigation ?? []),
		...timelineQtEvents(track),
		...buildBurstPackageItems(track.burst ?? state.model.tracks.beginner?.burst ?? []),
		...(state.showAcrSimulation ? [] : []),
	].filter(event => (event.type === 'burst-package' || Number(event.actionId)) && !event.simulated)
}

function applyCooldownUsage({
	timeMs,
	event,
	action,
	cooldownKey,
	recastMs,
	lockMs,
	nextReadyByKey,
	setQueueReadyMs,
	setGcdReadyMs,
}) {
	const usedAtMs = Math.max(0, Math.round(Number(timeMs ?? 0)))
	setQueueReadyMs(usedAtMs + lockMs)
	if (isGcdAction(event, action)) {
		setGcdReadyMs(usedAtMs + Math.max(recastMs, 2500))
	}
	if (cooldownKey && recastMs > 0) {
		nextReadyByKey.set(cooldownKey, Math.max(Number(nextReadyByKey.get(cooldownKey) ?? 0), usedAtMs + recastMs))
	}
}

function isGcdAction(event = {}, action = null) {
	return Boolean(action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD')
}

function timelineFunctionalLane(event = {}) {
	if (event.type === 'burst-package') {
		return 'burst'
	}
	if (isPotionTimelineEvent(event) || isBurstTimelineEvent(event)) {
		return 'burst'
	}
	if (isCoverageTimelineEvent(event) && !isOutputTimelineEvent(event)) {
		return 'mitigation'
	}
	return 'output'
}

function timelineEventType(event = {}, fallbackType = 'action') {
	if (isPotionTimelineEvent(event)) {
		return 'potion'
	}
	if (isDotTimelineEvent(event)) {
		return 'dot'
	}
	if (isCoverageTimelineEvent(event) && !isOutputTimelineEvent(event)) {
		return event.classification
	}
	if (isGcdAction(event, actionById(event.actionId))) {
		return event.simulated ? 'simulated-gcd' : 'gcd'
	}
	return fallbackType
}

function isOutputTimelineEvent(event = {}) {
	return Boolean(
		event.output
		|| event.potency > 0
		|| event.classification === 'damage'
		|| event.classification === 'output'
		|| event.type === 'damage'
		|| event.type === 'output'
		|| isDotTimelineEvent(event)
		|| isInsertOutputOverride(event)
	)
}

function isDotTimelineEvent(event = {}) {
	return event?.classification === 'dot' || event?.type === 'dot'
}

function isPotionTimelineEvent(event = {}) {
	return event.kind === 'potion'
		|| event.type === 'potion'
		|| event.classification === 'potion'
		|| /爆发药/.test(`${event.name ?? ''} ${event.label ?? ''} ${event.timelineLabel ?? ''}`)
}

function isBurstTimelineEvent(event = {}) {
	if (isPotionTimelineEvent(event)) {
		return true
	}
	const text = `${event.name ?? ''} ${event.label ?? ''} ${event.timelineLabel ?? ''}`
	return /爆发|爆发药|倾泻|弗雷|血乱|嗜血|留黑盾蓝|卸蓝|暗影使者|暗影锋/.test(text)
}

function parsedTimelineItemToEvent(item = {}) {
	const startMs = Number(item.startMs ?? item.timeMs ?? 0)
	return {
		...item,
		name: item.name ?? item.label,
		timeMs: startMs,
		durationMs: Number(item.durationMs ?? 0) || Math.max(0, Number(item.endMs ?? startMs) - startMs) || (item.type === 'qt' ? 2500 : 1600),
		kind: item.kind ?? (item.type === 'potion' ? 'potion' : 'qt-control'),
		classification: item.classification ?? item.type ?? 'qt',
		source: item.source ?? 'timeline',
	}
}

function uniqueTimelineEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = `${event.id ?? ''}|${event.actionId ?? ''}|${event.name ?? event.label ?? ''}|${event.timeMs ?? event.startMs ?? 0}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function uniqueTimelineDisplayEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = timelineDisplayEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function timelineDisplayEventKey(event = {}) {
	if (event.manualId) {
		return `manual:${event.manualId}`
	}
	return [
		event.actionId ?? '',
		event.label ?? event.name ?? '',
		Math.round(Number(event.startMs ?? event.timeMs ?? 0)),
		event.type ?? '',
	].join('|')
}

function sortTimelineItems(items = []) {
	return [...items].sort((left, right) => Number(left.startMs ?? left.timeMs ?? 0) - Number(right.startMs ?? right.timeMs ?? 0))
}

function timelineManualItem(item, index) {
	const id = item.id ?? `manual-${index}`
	const durationMs = Number(item.durationMs ?? actionById(item.actionId)?.effectDurationMs ?? 0) || 1600
	if (item.type === 'burst-package') {
		return {
			id,
			manualId: id,
			type: 'burst-package',
			label: item.name ?? item.label ?? (item.window === '120s' ? '120 爆发包' : '60 爆发包'),
			window: item.window,
			startMs: item.timeMs ?? 0,
			endMs: (item.timeMs ?? 0) + Number(item.durationMs ?? 12000),
			timeLabel: formatTime(item.timeMs ?? 0),
			skillCount: Number(item.skillCount ?? burstSkillCount(item)),
			sourceLabel: item.sourceLabel ?? burstSourceLabel(item),
			source: item.source,
			kind: item.kind ?? 'burst-package',
			locateEventKey: detailTimelineEventKey(item),
			requestedTimeMs: item.requestedTimeMs ?? item.timeMs ?? 0,
			cdAdjustedMs: item.cdAdjustedMs ?? 0,
			recastMs: item.recastMs ?? manualActionRecastMs(item),
			cooldownKey: item.cooldownKey,
			phase: item.phase,
			phaseStartMs: item.phaseStartMs,
		}
	}
	return {
		id,
		manualId: id,
		type: manualTimelineItemType(item),
		label: item.name,
		startMs: item.timeMs ?? 0,
		endMs: (item.timeMs ?? 0) + durationMs,
		timeLabel: formatTime(item.timeMs ?? 0),
		potency: item.potency ?? 0,
		iconUrl: item.iconUrl ?? '',
		actionId: item.actionId,
		output: Boolean(item.output),
		classification: item.classification,
		durationMs,
		source: item.source,
		kind: item.kind ?? 'player-action',
		locateEventKey: detailTimelineEventKey(item),
		cdAdjustedMs: item.cdAdjustedMs ?? 0,
		requestedTimeMs: item.requestedTimeMs ?? item.timeMs ?? 0,
		phase: item.phase,
		phaseStartMs: item.phaseStartMs,
	}
}

function manualTimelineItemType(item = {}) {
	return timelineEventType(item, isOutputTimelineEvent(item) ? 'action' : 'action')
}

function manualCooldownKey(event = {}, action = null) {
	if (event.type === 'burst-package') {
		return `burst-package:${event.window ?? '60s'}`
	}
	const actionId = event.actionId ?? action?.id
	if (!actionId) {
		return ''
	}
	if (action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD') {
		return 'gcd'
	}
	return `action:${actionId}`
}

function manualActionRecastMs(event = {}, action = null) {
	if (event.type === 'burst-package') {
		return event.window === '120s' ? 120000 : 60000
	}
	const recastMs = Number(event.recastMs ?? action?.recastMs ?? 0)
	if (recastMs > 0) {
		return recastMs
	}
	if (action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD') {
		return 2500
	}
	return 0
}

function manualActionQueueLockMs(event = {}, action = null) {
	if (event.type === 'burst-package') {
		return 0
	}
	if (action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD') {
		return 2500
	}
	return 700
}

function buildBurstPackageItems(bursts = []) {
	return bursts.map((burst, index) => {
		const startMs = Number(burst.timeMs ?? burst.startMs ?? index * 60000)
		return {
			id: `burst-package-${index}`,
			type: 'burst-package',
			label: burst.window === '120s' ? '120 爆发包' : '60 爆发包',
			window: burst.window ?? (startMs % 120000 === 0 ? '120s' : '60s'),
			startMs,
			endMs: startMs + Number(burst.durationMs ?? 12000),
			timeLabel: formatTime(startMs),
			skillCount: burstSkillCount(burst),
			sourceLabel: burstSourceLabel(burst),
			expandedItems: Array.isArray(burst.items) ? burst.items : [],
		}
	})
}

function burstSkillCount(burst) {
	if (Array.isArray(burst.items)) {
		return burst.items.length
	}
	if (Array.isArray(burst.qt)) {
		return burst.qt.length
	}
	return 0
}

function burstSourceLabel(burst) {
	if (burst.sourceLabel) {
		return burst.sourceLabel
	}
	if (burst.source === 'manual') {
		return '用户手动'
	}
	if (burst.source === 'import' || burst.source === 'timeline') {
		return '导入'
	}
	return 'ACR'
}

function focusTrackerItemForEvent(event, skill, actionId, index) {
	const durationMs = Number(event.durationMs ?? 0) > 0 ? Number(event.durationMs) : 1600
	return {
		id: `focus-${actionId}-${index}`,
		type: 'focus-tracker',
		label: skill?.name ?? event.name ?? `技能 ${actionId}`,
		eventLabel: event.name,
		startMs: event.timeMs,
		endMs: event.timeMs + durationMs,
		timeLabel: formatTime(event.timeMs),
		actionId: event.actionId,
		iconUrl: event.iconUrl ?? skill?.iconUrl ?? '',
		sourceLabel: focusSourceLabel(event),
		durationMs,
	}
}

function focusSourceLabel(event) {
	if (event?.simulated || event?.source === 'KANO ACR') {
		return 'ACR 自动'
	}
	if (event?.source === 'manual') {
		return '用户手动'
	}
	return '导入时间轴'
}

function coverageItemType(event) {
	if (isDotTimelineEvent(event)) {
		return 'dot'
	}
	if (isCoverageTimelineEvent(event)) {
		return event.classification
	}
	return null
}

function isCoverageTimelineEvent(event) {
	return event?.classification === 'mitigation' || event?.classification === 'healing'
}

function mainActionTimelineEvents(events = []) {
	return events.filter(event => event.kind === 'player-action' && !isCoverageTimelineEvent(event))
}

function timelinePercent(ms, maxTime) {
	return Math.min(100, Math.max(0, (ms / Math.max(1, maxTime)) * 100))
}

function timelineBaseWidth(maxTime) {
	return Math.max(1400, Math.ceil(maxTime / 1000) * 3)
}

function findTimeline(target) {
	return target instanceof Element ? target.closest('.xiva-timeline') : null
}

function findTimelineAtClientPoint(clientX, clientY) {
	const target = document.elementFromPoint(clientX, clientY)
	const directTimeline = findTimeline(target)
	if (directTimeline) {
		return directTimeline
	}
	return Array.from(document.querySelectorAll('.xiva-timeline')).find(timeline => {
		const rect = timeline.getBoundingClientRect()
		return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
	}) ?? null
}

function isTimelineInteractiveTarget(target) {
	return target instanceof Element && Boolean(target.closest('button, input, select, textarea, label, [data-action], [data-focus-skill], [data-panel], [data-phase], [data-toggle], [draggable="true"]'))
}

function hasTimelineDropData(dataTransfer) {
	return dataTransferHasType(dataTransfer, 'application/x-webtimeline-skill')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-manual')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-event')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-qt')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-burst')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-potion')
}

function dataTransferHasType(dataTransfer, type) {
	return Array.from(dataTransfer?.types ?? []).includes(type)
}

function scheduleTimelineDragGuide(timeline, clientX) {
	if (!timeline || !canEditTimeline()) {
		return
	}
	timelineDragGuidePending = {timeline, clientX}
	if (timelineDragGuideFrame != null) {
		return
	}
	timelineDragGuideFrame = requestAnimationFrame(flushTimelineDragGuide)
}

function flushTimelineDragGuide() {
	timelineDragGuideFrame = null
	const pending = timelineDragGuidePending
	timelineDragGuidePending = null
	if (!pending) {
		return
	}
	showTimelineDragGuide(pending.timeline, pending.clientX)
}

function showTimelineDragGuide(timeline, clientX) {
	const context = timelineDragGuideContext(timeline)
	if (!context || !canEditTimeline()) {
		return
	}
	const dropInfo = timelineDropInfoForClientX(clientX, timeline, context)
	const trackX = Math.max(0, clientX - context.trackLeft)
	const guideLeftPx = context.trackContentLeft + trackX
	const nearest = nearestTimelineGuideEventFromCache(context.events, dropInfo.absoluteTimeMs)
	const delta = renderTimelineGuideDelta(nearest, dropInfo.absoluteTimeMs, {
		guideLeftPx,
		trackWidth: context.trackWidth,
		maxTime: context.maxTime,
	})
	timeline.dataset.guideVisible = 'true'
	timeline.style.setProperty('--guide-left', `${Math.round(guideLeftPx)}px`)
	timeline.style.setProperty('--guide-delta-left', `${Math.round(delta.leftPx)}px`)
	if (context.phaseTarget) context.phaseTarget.textContent = dropInfo.phaseLabel ?? '全部'
	if (context.timeTarget) context.timeTarget.textContent = formatTime(dropInfo.phaseTimeMs ?? 0)
	if (context.absoluteTarget) context.absoluteTarget.textContent = dropInfo.phaseId === 'all' ? '' : `全局 ${formatTime(dropInfo.absoluteTimeMs)}`
	if (context.deltaTarget) {
		context.deltaTarget.textContent = delta.label
		context.deltaTarget.dataset.empty = delta.label ? 'false' : 'true'
	}
}

function hideTimelineDragGuide(timeline = null) {
	if (timelineDragGuideFrame != null) {
		cancelAnimationFrame(timelineDragGuideFrame)
		timelineDragGuideFrame = null
	}
	timelineDragGuidePending = null
	if (!timeline || timelineDragGuideCache?.timeline === timeline) {
		timelineDragGuideCache = null
	}
	const timelines = timeline ? [timeline] : Array.from(document.querySelectorAll('.xiva-timeline'))
	for (const item of timelines) {
		delete item.dataset.guideVisible
		item.querySelector('[data-guide-delta]')?.replaceChildren()
	}
}

function timelineDragGuideContext(timeline) {
	if (!timeline) {
		return null
	}
	const axis = timeline.querySelector('.xiva-axis')
	const axisScrollWidth = axis?.scrollWidth ?? 0
	const timelineScrollWidth = timeline.scrollWidth
	const cacheValid = timelineDragGuideCache
		&& timelineDragGuideCache.timeline === timeline
		&& timelineDragGuideCache.phase === state.phase
		&& timelineDragGuideCache.zoom === state.timelineZoom
		&& timelineDragGuideCache.axisScrollWidth === axisScrollWidth
		&& timelineDragGuideCache.timelineScrollWidth === timelineScrollWidth
	if (cacheValid) {
		const rect = timeline.getBoundingClientRect()
		const axisRect = axis?.getBoundingClientRect()
		timelineDragGuideCache.trackLeft = axisRect?.left ?? rect.left
		timelineDragGuideCache.trackContentLeft = (axisRect?.left ?? rect.left) - rect.left + timeline.scrollLeft
		return timelineDragGuideCache
	}
	const rect = timeline.getBoundingClientRect()
	const axisRect = axis?.getBoundingClientRect()
	const trackLeft = axisRect?.left ?? rect.left
	const rows = buildVisualTimelineRows(state.model.tracks.expert).filter(row => !row.html)
	const maxTime = timelineDurationMs(rows, state.model.bossTimeline?.source, state.phase)
	timelineDragGuideCache = {
		timeline,
		phase: state.phase,
		zoom: state.timelineZoom,
		axisScrollWidth,
		timelineScrollWidth,
		trackLeft,
		trackContentLeft: (axisRect?.left ?? rect.left) - rect.left + timeline.scrollLeft,
		trackWidth: axisScrollWidth || Math.max(1, timelineScrollWidth - (trackLeft - rect.left)),
		maxTime,
		events: timelineGuideEvents()
			.map(event => ({
				...event,
				guideTimeMs: Number(event.timeMs ?? event.startMs ?? 0),
			}))
			.sort((left, right) => left.guideTimeMs - right.guideTimeMs),
		phaseTarget: timeline.querySelector('[data-guide-phase]'),
		timeTarget: timeline.querySelector('[data-guide-time]'),
		absoluteTarget: timeline.querySelector('[data-guide-absolute]'),
		deltaTarget: timeline.querySelector('[data-guide-delta]'),
	}
	return timelineDragGuideCache
}

function nearestTimelineGuideEvent(timeMs) {
	return nearestTimelineGuideEventFromCache(timelineGuideEvents(), timeMs)
}

function nearestTimelineGuideEventFromCache(events = [], timeMs) {
	const targetTimeMs = Number(timeMs ?? 0)
	let nearest = null
	let nearestDeltaAbs = Infinity
	for (const event of events) {
		const eventTimeMs = Number(event.guideTimeMs ?? event.timeMs ?? event.startMs ?? 0)
		const deltaMs = targetTimeMs - eventTimeMs
		const deltaAbs = Math.abs(deltaMs)
		if (deltaAbs < nearestDeltaAbs) {
			nearest = {...event, deltaMs}
			nearestDeltaAbs = deltaAbs
		}
	}
	return nearest
}

function timelineGuideEvents() {
	const track = state.model?.tracks?.expert ?? {}
	const manual = manualQueueEvents()
	return [
		...mainActionTimelineEvents(track.player ?? []),
		...(track.mitigation ?? []),
		...timelineQtEvents(track),
		...manual,
		...buildBurstPackageItems(track.burst ?? []),
	]
		.filter(event => !event.simulated && event.kind !== 'boss-cast' && event.type !== 'cast' && event.type !== 'damage')
		.filter(event => Number.isFinite(Number(event.timeMs ?? event.startMs ?? 0)))
}

function renderTimelineGuideDelta(nearest, dropTimeMs, options = {}) {
	if (!nearest) {
		return {label: '', leftPx: 0}
	}
	const eventTimeMs = Number(nearest.timeMs ?? nearest.startMs ?? 0)
	const deltaMs = Math.round(Number(dropTimeMs ?? 0) - eventTimeMs)
	const absSeconds = Math.abs(deltaMs) / 1000
	const sign = deltaMs >= 0 ? '+' : '-'
	const label = `${displayNameForAction(nearest)} ${sign}${formatDeltaSeconds(absSeconds)}`
	const maxTime = Number(options.maxTime ?? 0) || timelineDurationMs(buildVisualTimelineRows(state.model.tracks.expert), state.model.bossTimeline?.source, state.phase)
	const eventViewMs = timelineGuideViewTimeMs(eventTimeMs)
	const eventLeftPx = timelinePercent(eventViewMs, maxTime) / 100 * Number(options.trackWidth ?? 0)
	const leftPx = (eventLeftPx + Number(options.guideLeftPx ?? eventLeftPx)) / 2
	return {
		label,
		leftPx,
	}
}

function timelineGuideViewTimeMs(absoluteTimeMs) {
	if (state.phase === 'all') {
		return Number(absoluteTimeMs ?? 0)
	}
	const phase = phaseOptions(state.model.bossTimeline?.source).find(item => item.id === state.phase)
	return Math.max(0, Number(absoluteTimeMs ?? 0) - Number(phase?.startMs ?? 0))
}

function locateTimelineEvent(eventKey) {
	const key = String(eventKey ?? '')
	if (!key) {
		return
	}
	const target = document.querySelector(`[data-locate-event-key="${cssEscape(key)}"]`)
	if (!target) {
		if (state.phase !== 'all') {
			state.phase = 'all'
			render()
			requestAnimationFrame(() => locateTimelineEvent(key))
			return
		}
		setImportError('当前时间轴视图里没有找到这个技能')
		return
	}
	const timeline = target.closest('.xiva-timeline')
	if (timeline) {
		scrollTimelineToElement(timeline, target)
	}
	target.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'})
	flashTimelineElement(target)
}

function removeTimelineEvent(eventKey) {
	if (!canEditTimeline()) {
		return
	}
	const targets = editableTimelineEventTargets(eventKey)
	if (!targets.length) {
		setImportError('没有找到可删除的时间轴技能')
		render()
		return
	}
	for (const target of targets) {
		removeEditableTimelineEvent(target.event)
	}
	setImportStatus(`已删除 ${displayNameForAction(targets[0].event)}`)
	render()
}

function removeEditableTimelineEvent(event) {
	const track = state.model.tracks.expert
	removeEventFromArray(track.player, event)
	removeEventFromArray(track.mitigation, event)
	removeEventFromArray(track.qt, event)
	removeEventFromArray(track.boss, event)
	for (const burst of track.burst ?? []) {
		removeEventFromArray(burst.items, event)
		removeEventFromArray(burst.qt, event)
	}
	for (const panel of state.model.detailPanels ?? []) {
		removeEventFromArray(panel.events, event)
	}
	removeEventFromTimelineRows(event)
}

function removeEventFromArray(events = [], event) {
	if (!Array.isArray(events) || !event) {
		return false
	}
	const index = events.indexOf(event)
	if (index >= 0) {
		events.splice(index, 1)
		return true
	}
	return false
}

function removeEventFromTimelineRows(event) {
	for (const row of state.model?.timelineRows ?? []) {
		if (!Array.isArray(row.items)) {
			continue
		}
		row.items = row.items.filter(item => !timelineRowItemMatchesEvent(item, event))
	}
}

function timelineRowItemMatchesEvent(item = {}, event = {}) {
	const rowEvent = parsedTimelineItemToEvent(item)
	return timelineEventEditKey(rowEvent) === timelineEventEditKey(event)
		|| detailTimelineEventKey(rowEvent) === detailTimelineEventKey(event)
}

function scrollTimelineToElement(timeline, target) {
	const timelineRect = timeline.getBoundingClientRect()
	const targetRect = target.getBoundingClientRect()
	const targetCenter = targetRect.left - timelineRect.left + timeline.scrollLeft + targetRect.width / 2
	timeline.scrollTo({
		left: Math.max(0, targetCenter - timeline.clientWidth / 2),
		behavior: 'smooth',
	})
}

function flashTimelineElement(target) {
	target.classList.remove('timeline-locate-flash')
	void target.offsetWidth
	target.classList.add('timeline-locate-flash')
	window.setTimeout(() => target.classList.remove('timeline-locate-flash'), 2200)
}

function cssEscape(value) {
	return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&')
}

function formatDeltaSeconds(seconds = 0) {
	const rounded = Math.round(Number(seconds) * 10) / 10
	return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}s`
}

function canEditTimeline() {
	return state.editorMode === 'edit'
}

function insertFloatPlacement(pos = state.insertFloatPos) {
	const x = Number(pos?.x ?? 28)
	const y = Number(pos?.y ?? 520)
	const viewportWidth = window.innerWidth || 1280
	const viewportHeight = window.innerHeight || 720
	return {
		alignRight: x > viewportWidth - 760,
		alignUp: y > viewportHeight - 430,
	}
}

function loadInsertFloatPos() {
	try {
		const saved = JSON.parse(localStorage.getItem('webtimelineInsertFloatPos') ?? '{}')
		return clampInsertFloatPos({
			x: Number(saved.x ?? 28),
			y: Number(saved.y ?? 520),
		})
	} catch {
		return {x: 28, y: 520}
	}
}

function saveInsertFloatPos(pos) {
	localStorage.setItem('webtimelineInsertFloatPos', JSON.stringify(clampInsertFloatPos(pos)))
}

function clampInsertFloatPos(pos) {
	const maxX = Math.max(8, window.innerWidth - 92)
	const maxY = Math.max(8, window.innerHeight - 70)
	return {
		x: Math.round(Math.min(maxX, Math.max(8, Number(pos.x ?? 28)))),
		y: Math.round(Math.min(maxY, Math.max(8, Number(pos.y ?? 520)))),
	}
}

function startInsertFloatDrag(event) {
	insertFloatDrag = {
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
		originX: Number(state.insertFloatPos?.x ?? 28),
		originY: Number(state.insertFloatPos?.y ?? 520),
		dragging: false,
	}
}

function moveInsertFloat(event) {
	const deltaX = event.clientX - insertFloatDrag.startX
	const deltaY = event.clientY - insertFloatDrag.startY
	if (!insertFloatDrag.dragging && Math.hypot(deltaX, deltaY) > 3) {
		insertFloatDrag.dragging = true
	}
	if (!insertFloatDrag.dragging) {
		return
	}
	event.preventDefault()
	state.insertFloatPos = clampInsertFloatPos({
		x: insertFloatDrag.originX + deltaX,
		y: insertFloatDrag.originY + deltaY,
	})
	const float = document.querySelector('.insert-float')
	if (float) {
		float.style.left = `${state.insertFloatPos.x}px`
		float.style.top = `${state.insertFloatPos.y}px`
	}
}

function endInsertFloatDrag(event) {
	if (!insertFloatDrag || insertFloatDrag.pointerId !== event.pointerId) {
		return
	}
	if (insertFloatDrag.dragging) {
		suppressInsertFloatClick = true
		saveInsertFloatPos(state.insertFloatPos)
		setTimeout(() => {
			suppressInsertFloatClick = false
		}, 0)
	}
	insertFloatDrag = null
}

function canStartInsertSkillDrag(skillCard, event) {
	return canEditTimeline()
		&& event.button === 0
		&& skillCard.dataset.dragLocked !== 'true'
		&& Boolean(skillCard.dataset.dragSkill || skillCard.dataset.dragBurst || skillCard.dataset.dragQt || skillCard.dataset.dragPotion)
		&& !event.target.closest('button, input, select, textarea, label')
}

function startInsertSkillDrag(event, skillCard) {
	const rect = skillCard.getBoundingClientRect()
	insertSkillDrag = {
		pointerId: event.pointerId,
		dragType: skillCard.dataset.dragQt ? 'qt' : skillCard.dataset.dragBurst ? 'burst' : skillCard.dataset.dragPotion ? 'potion' : 'skill',
		actionId: skillCard.dataset.dragSkill,
		burstIndex: skillCard.dataset.dragBurst,
		qtIndex: skillCard.dataset.dragQt,
		potionId: skillCard.dataset.dragPotion,
		card: skillCard,
		startX: event.clientX,
		startY: event.clientY,
		offsetX: event.clientX - rect.left,
		offsetY: event.clientY - rect.top,
		width: rect.width,
		height: rect.height,
		label: skillCard.querySelector('strong')?.textContent?.trim() ?? '',
		dragging: false,
		ghost: null,
		dropTarget: null,
	}
}

function moveInsertSkillDrag(event) {
	const deltaX = event.clientX - insertSkillDrag.startX
	const deltaY = event.clientY - insertSkillDrag.startY
	if (!insertSkillDrag.dragging && Math.hypot(deltaX, deltaY) > 5) {
		insertSkillDrag.dragging = true
		insertSkillDrag.card.classList.add('is-pointer-dragging')
		insertSkillDrag.ghost = createInsertSkillDragGhost()
		document.body.classList.add('is-insert-skill-dragging')
	}
	if (!insertSkillDrag.dragging) {
		return
	}

	event.preventDefault()
	positionInsertSkillDragGhost(event)
	updateInsertSkillDropTarget(findTimelineAtClientPoint(event.clientX, event.clientY))
	updateInsertSkillDragPreview(event)
}

function endInsertSkillDrag(event) {
	if (!insertSkillDrag || insertSkillDrag.pointerId !== event.pointerId) {
		return
	}
	const wasDragging = insertSkillDrag.dragging
	const actionId = insertSkillDrag.actionId
	const burstIndex = insertSkillDrag.burstIndex
	const qtIndex = insertSkillDrag.qtIndex
	const potionId = insertSkillDrag.potionId
	const dragType = insertSkillDrag.dragType
	if (wasDragging) {
		event.preventDefault()
	}
	cleanupInsertSkillDrag(event, {suppressClick: wasDragging})
	if (wasDragging) {
		if (dragType === 'burst') {
			insertBurstPackageAtClientPoint(burstIndex, event.clientX, event.clientY)
		} else if (dragType === 'potion') {
			insertPotionAtClientPoint(potionId, event.clientX, event.clientY)
		} else if (dragType === 'qt') {
			insertQtAtClientPoint(qtIndex, event.clientX, event.clientY)
		} else {
			insertSkillAtClientPoint(actionId, event.clientX, event.clientY)
		}
	}
}

function cancelInsertSkillDrag(event) {
	if (!insertSkillDrag || insertSkillDrag.pointerId !== event.pointerId) {
		return
	}
	cleanupInsertSkillDrag(event, {suppressClick: insertSkillDrag.dragging})
}

function cleanupInsertSkillDrag(event, {suppressClick = false} = {}) {
	const card = insertSkillDrag?.card
	card?.releasePointerCapture?.(event.pointerId)
	card?.classList.remove('is-pointer-dragging')
	insertSkillDrag?.ghost?.remove()
	if (insertSkillDrag?.dropTarget) {
		hideTimelineDragGuide(insertSkillDrag.dropTarget)
	}
	insertSkillDrag?.dropTarget?.classList.remove('is-skill-drop-target')
	document.body.classList.remove('is-insert-skill-dragging')
	insertSkillDrag = null
	if (suppressClick) {
		suppressInsertSkillClick = true
		setTimeout(() => {
			suppressInsertSkillClick = false
		}, 0)
	}
}

function createInsertSkillDragGhost() {
	const ghost = document.createElement('div')
	ghost.className = 'skill-drag-ghost'
	ghost.style.width = `${Math.round(insertSkillDrag.width)}px`
	ghost.style.minHeight = `${Math.round(insertSkillDrag.height)}px`
	ghost.innerHTML = renderDropTimePreview({
		label: insertSkillDrag.label || '插入技能',
		overTimeline: false,
	})
	document.body.append(ghost)
	return ghost
}

function positionInsertSkillDragGhost(event) {
	if (!insertSkillDrag.ghost) {
		return
	}
	insertSkillDrag.ghost.style.left = `${event.clientX - insertSkillDrag.offsetX}px`
	insertSkillDrag.ghost.style.top = `${event.clientY - insertSkillDrag.offsetY}px`
}

function updateInsertSkillDropTarget(target) {
	const timeline = target?.classList?.contains('xiva-timeline') ? target : findTimeline(target)
	if (timeline === insertSkillDrag.dropTarget) {
		return
	}
	insertSkillDrag.dropTarget?.classList.remove('is-skill-drop-target')
	insertSkillDrag.dropTarget = timeline
	insertSkillDrag.dropTarget?.classList.add('is-skill-drop-target')
	if (!timeline) {
		hideTimelineDragGuide()
	}
}

function updateInsertSkillDragPreview(event) {
	if (!insertSkillDrag?.ghost) {
		return
	}
	const timeline = findTimelineAtClientPoint(event.clientX, event.clientY)
	if (timeline) {
		scheduleTimelineDragGuide(timeline, event.clientX)
	}
	const info = dropTimeInfoForClientPoint(event.clientX, event.clientY, timelineDragGuideContext(timeline))
	insertSkillDrag.ghost.innerHTML = renderDropTimePreview({
		label: insertSkillDrag.label || '插入技能',
		...info,
	})
}

function dropTimeInfoForClientPoint(clientX, clientY, context = null) {
	const timeline = context?.timeline ?? findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		return {overTimeline: false}
	}
	const phaseInfo = timelineDropInfoForClientX(clientX, timeline, context)
	return {
		overTimeline: true,
		timeline,
		...phaseInfo,
	}
}

function renderDropTimePreview(info = {}) {
	const label = escapeHtml(info.label || '插入技能')
	if (!info.overTimeline) {
		return `
			<span class="skill-drag-ghost-name">${label}</span>
			<span class="skill-drag-ghost-time">拖到时间轴上</span>
		`
	}
	const phaseLabel = escapeHtml(info.phaseLabel ?? '全部')
	const phaseTime = formatTime(info.phaseTimeMs ?? 0)
	const absoluteTime = formatTime(info.absoluteTimeMs ?? info.phaseTimeMs ?? 0)
	const absolute = info.phaseId === 'all' ? '' : `<span class="skill-drag-ghost-absolute">全局 ${absoluteTime}</span>`
	return `
		<span class="skill-drag-ghost-name">${label}</span>
		<span class="skill-drag-ghost-phase">${phaseLabel}</span>
		<span class="skill-drag-ghost-time">${phaseTime}</span>
		${absolute}
	`
}

function setTimelineZoom(nextZoom, anchorTimeline = null, viewportX = 0) {
	const zoom = clampTimelineZoom(nextZoom)
	const previousScrollWidth = anchorTimeline?.scrollWidth ?? 0
	const previousScrollLeft = anchorTimeline?.scrollLeft ?? 0
	state.timelineZoom = zoom
	localStorage.setItem('webtimelineTimelineZoom', String(zoom))
	timelineDragGuideCache = null

	for (const shell of document.querySelectorAll('.xiva-shell')) {
		const baseWidth = Number(shell.dataset.baseWidth ?? 0)
		if (!baseWidth) {
			continue
		}
		shell.dataset.zoom = zoom.toFixed(2)
		shell.style.setProperty('--timeline-width', `${Math.round(baseWidth * zoom)}px`)
	}

	if (anchorTimeline) {
		anchorTimeline.scrollLeft = scrollLeftForZoom({
			scrollLeft: previousScrollLeft,
			viewportX,
			previousScrollWidth,
			nextScrollWidth: anchorTimeline.scrollWidth,
		})
	}
}

function startTimelineDrag(timeline, event) {
	timelineDrag = {
		pointerId: event.pointerId,
		timeline,
		startX: event.clientX,
		startY: event.clientY,
		scrollLeft: timeline.scrollLeft,
		dragging: false,
	}
}

function endTimelineDrag(event) {
	if (!timelineDrag || (timelineDrag.pointerId != null && timelineDrag.pointerId !== event.pointerId)) {
		return
	}

	if (timelineDrag.pointerId != null) {
		timelineDrag.timeline.releasePointerCapture?.(event.pointerId)
	}
	timelineDrag.timeline.classList.remove('is-dragging')
	if (timelineDrag.dragging) {
		suppressTimelineClick = true
		setTimeout(() => {
			suppressTimelineClick = false
		}, 0)
	}
	timelineDrag = null
}

function endTimelinePinch() {
	if (!timelinePinch) {
		return
	}
	timelinePinch.timeline.classList.remove('is-zooming')
	timelinePinch = null
}

function renderPanelTabs(model) {
	const panels = [{id: 'overview', label: '整页总览'}, ...model.detailPanels, {id: 'qt', label: 'QT'}, {id: 'burst', label: '爆发'}]
	return `
		<div class="panel-tabs">
			${panels.map(panel => `<button class="${state.panel === panel.id ? 'active' : ''}" data-panel="${panel.id}">${panel.label}</button>`).join('')}
		</div>
	`
}

function renderDetailPanel(model) {
	if (state.panel === 'overview') {
		return renderOverviewPanel(model)
	}
	if (state.panel === 'qt') {
		return renderQtDetailPanel()
	}
	if (state.panel === 'burst') {
		return renderBurstGroupsInDetailPanel(model.tracks.expert.burst)
	}
	const panel = model.detailPanels.find(item => item.id === state.panel)
	if (!panel) {
		return '<div class="detail-list"><p class="empty-state">没有找到这个栏目。</p></div>'
	}
	const events = detailPanelEvents(panel)
	const controls = panel?.id === 'damage' ? renderOutputSimulationControl() : ''
	return `
		<div class="detail-list">
			${renderDetailCollapse({
				id: panel.id,
				label: panel.title ?? panel.label,
				count: events.length,
				events,
				controls,
				open: isDetailCollapseOpen(panel.id),
				body: events.length
					? events.map((event, index) => renderDetailEventRow(panel, event, index)).join('')
					: '<p class="empty-state">当前 P / 当前过滤条件下暂无数据</p>',
			})}
			${renderManualEditor(panel.id)}
		</div>
	`
}

function detailPanelEvents(panel) {
	if (!panel) {
		return []
	}
	if (panel.id === 'damage') {
		return detailEventsForCurrentPhase(outputDetailEvents())
	}
	if (panel.id === 'mitigation') {
		return uniqueDetailDisplayEvents(detailEventsForCurrentPhase(uniqueDetailEvents([
			...(panel.events ?? []),
			...manualEventsForPanel('mitigation').map(detailManualEvent),
		])))
	}
	if (panel.id === 'potion') {
		return detailEventsForCurrentPhase(uniqueDetailEvents([
			...(panel.events ?? []),
			...manualEventsForPanel('potion').map(detailManualEvent),
		]))
	}
	if (panel.id === 'opener') {
		return detailEventsForCurrentPhase(uniqueDetailEvents([
			...(panel.events ?? []),
			...manualEventsForPanel('opener').map(detailManualEvent),
		]))
	}
	return detailEventsForCurrentPhase(panel.events ?? [])
}

function outputDetailEvents() {
	const track = state.model?.tracks?.expert ?? {}
	const panel = state.model?.detailPanels?.find(item => item.id === 'damage')
	const importedPanelEvents = (panel?.events ?? [])
		.filter(event => !event.simulated && event.source !== 'KANO ACR')
		.filter(isOutputTimelineEvent)
	const importedTimelineEvents = mainActionTimelineEvents(track.player ?? [])
		.filter(event => timelineFunctionalLane(event) === 'output')
		.filter(isOutputTimelineEvent)
	const manual = manualEventsForPanel('damage').map(detailManualEvent)
	const simulated = state.showAcrSimulation
		? (track.simulated ?? state.model.acrSimulation?.events ?? []).filter(event => event.output)
		: []
	return uniqueDetailEvents([
		...importedPanelEvents,
		...importedTimelineEvents,
		...manual,
		...simulated,
	]).sort(compareDetailEvents)
}

function detailManualEvent(event) {
	return {
		...event,
		id: event.id,
		manualId: event.id,
		source: event.source ?? 'manual',
	}
}

function detailEventsForCurrentPhase(events = []) {
	return events
		.filter(detailEventInCurrentPhase)
		.sort(compareDetailEvents)
}

function detailEventInCurrentPhase(event = {}) {
	if (state.phase === 'all') {
		return true
	}
	const taggedPhase = normalizedDetailPhaseId(event.phase)
	if (taggedPhase) {
		return taggedPhase === state.phase
	}
	const window = currentPhaseEditWindow()
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	const endMs = timeMs + Number(event.durationMs ?? event.castDurationMs ?? 1600)
	return endMs > window.startMs && timeMs < window.endMs
}

function uniqueDetailEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = detailEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function uniqueDetailDisplayEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = detailDisplayEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function detailDisplayEventKey(event = {}) {
	if (event.manualId) {
		return `manual:${event.manualId}`
	}
	return [
		event.actionId ?? '',
		event.name ?? event.label ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		event.classification ?? event.type ?? '',
	].join('|')
}

function detailEventKey(event = {}) {
	return [
		event.manualId ? `manual:${event.manualId}` : event.id ?? '',
		event.actionId ?? '',
		event.name ?? event.label ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		event.source ?? '',
		event.simulated ? 'simulated' : '',
	].join('|')
}

function compareDetailEvents(left, right) {
	return Number(left.timeMs ?? left.startMs ?? 0) - Number(right.timeMs ?? right.startMs ?? 0)
}

function detailEditKey(panel, event, index) {
	return [
		panel?.id ?? 'detail',
		event.manualId ?? event.id ?? index,
		event.actionId ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		index,
	].map(value => encodeURIComponent(String(value ?? ''))).join('::')
}

function canEditDetailEvent(panel, event = {}) {
	if (event.type === 'burst-package' && !event.manualId) {
		return false
	}
	return panel?.id !== 'boss'
		&& event.kind !== 'boss-cast'
		&& event.type !== 'cast'
		&& event.source !== 'KANO ACR'
		&& !event.simulated
}

function shouldShowDetailTargetControl(panel, event = {}) {
	return panel?.id === 'mitigation' || isCoverageTimelineEvent(event) || Boolean(event.targetRequired)
}

function canEditDetailTarget(panel, event = {}) {
	return shouldShowDetailTargetControl(panel, event) && canEditDetailEvent(panel, event)
}

function renderDetailCollapse({id, label, count, events = [], body = '', controls = '', open = false}) {
	const expandedBody = body || '<p class="empty-state">暂无数据</p>'
	return `
		<details class="detail-collapse" data-detail-collapse="${id}" ${open ? 'open' : ''}>
			<summary>
				<div class="detail-collapse-head">
					<div>
						<strong>${label}</strong>
						<span>${state.phase === 'all' ? '全局时间' : `${state.phase.toUpperCase()} 内时间`} / ${canEditTimeline() ? '编辑模式可调整手动技能' : '浏览模式只显示位置'}</span>
					</div>
					<span class="detail-count-badge overview-count">${count} 项</span>
				</div>
			</summary>
			<div class="detail-expanded-list">
				${controls}
				${expandedBody}
			</div>
		</details>
	`
}

function rememberOpenDetailCollapses() {
	state.openDetailCollapses = [...document.querySelectorAll('.detail-collapse[open]')]
		.map(detail => detail.dataset.detailCollapse)
		.filter(Boolean)
}

function isDetailCollapseOpen(id) {
	return state.openDetailCollapses.includes(String(id))
}

function setDetailCollapseOpen(id, isOpen) {
	const normalizedId = String(id ?? '').trim()
	if (!normalizedId) {
		return
	}
	const openIds = new Set(state.openDetailCollapses)
	if (isOpen) {
		openIds.add(normalizedId)
	} else {
		openIds.delete(normalizedId)
	}
	state.openDetailCollapses = [...openIds]
}

function renderOutputSimulationControl() {
	return `
		<div class="detail-sim-toggle">
			<span>${state.showAcrSimulation ? '输出轴包含 ACR 模拟技能' : '输出轴仅显示导入 / 手动技能'}</span>
			<button class="sim-toggle ${state.showAcrSimulation ? 'active' : ''}" data-toggle="acr-simulation">${state.showAcrSimulation ? '隐藏 ACR 模拟' : '显示 ACR 模拟'}</button>
		</div>
	`
}

function detailEventTimeLabel(event = {}) {
	if (event.window) {
		return event.window
	}
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	if (state.phase !== 'all') {
		return `${state.phase.toUpperCase()} ${formatTime(phaseRelativeMsForEvent(event))}`
	}
	const taggedPhase = normalizedDetailPhaseId(event.phase)
	if (taggedPhase && Number.isFinite(Number(event.phaseStartMs))) {
		return `${taggedPhase.toUpperCase()} ${formatTime(Math.max(0, timeMs - Number(event.phaseStartMs)))}`
	}
	return formatTime(timeMs)
}

function detailSourceLabel(event = {}) {
	if (event.manualId || event.source === 'manual') {
		return '用户手动'
	}
	if (event.simulated || event.source === 'KANO ACR') {
		return 'ACR 自动'
	}
	if (event.source === 'timeline') {
		return '导入时间轴'
	}
	return event.source
}

function phaseRelativeMsForEvent(event = {}) {
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	if (state.phase === 'all') {
		return Math.max(0, timeMs)
	}
	const taggedPhase = normalizedDetailPhaseId(event.phase)
	if (taggedPhase === state.phase && Number.isFinite(Number(event.phaseStartMs))) {
		return Math.max(0, timeMs - Number(event.phaseStartMs))
	}
	const window = currentPhaseEditWindow()
	return Math.max(0, timeMs - window.startMs)
}

function currentPhaseEditWindow() {
	const phase = phaseOptions(state.model?.bossTimeline?.source).find(item => item.id === state.phase)
	if (state.phase !== 'all' && phase) {
		return {
			phaseId: phase.id,
			startMs: phase.startMs,
			endMs: phase.endMs,
			durationMs: Math.max(1000, phase.endMs - phase.startMs),
		}
	}
	const rows = buildVisualTimelineRows(state.model.tracks.expert).filter(row => !row.html)
	const durationMs = timelineDurationMs(rows, state.model.bossTimeline?.source, 'all')
	return {
		phaseId: 'all',
		startMs: 0,
		endMs: durationMs,
		durationMs,
	}
}

function clampMsToCurrentPhase(phaseTimeMs) {
	const window = currentPhaseEditWindow()
	const clampedPhaseTimeMs = Math.min(window.durationMs, Math.max(0, Math.round(Number(phaseTimeMs ?? 0))))
	const absoluteTimeMs = absoluteMsForPhaseTime(state.model.bossTimeline?.source, state.phase, clampedPhaseTimeMs)
	return {
		phaseId: window.phaseId,
		phaseTimeMs: clampedPhaseTimeMs,
		absoluteTimeMs: Math.min(window.endMs, Math.max(window.startMs, absoluteTimeMs)),
		phaseStartMs: window.startMs,
	}
}

function normalizedDetailPhaseId(phase) {
	const match = /^p?(\d+)$/i.exec(String(phase ?? '').trim())
	return match ? `p${match[1]}` : ''
}

function detailFocusActionId(event = {}, eventName = '') {
	const explicitId = String(event.actionId ?? '').trim()
	if (explicitId) {
		return explicitId
	}
	return String(actionByName(eventName)?.id ?? '').trim()
}

function renderDetailEventRow(panel, event, index) {
	const eventName = displayNameForAction(event)
	const timelineLabel = event.timelineLabel || (eventName !== event.name ? event.name : '')
	const timeLabel = detailEventTimeLabel(event)
	const meta = [timeLabel, timelineLabel ? `原轴：${timelineLabel}` : '', event.skillType, detailSourceLabel(event), event.classification].filter(Boolean).join(' / ')
	const canEditTime = canEditTimeline() && canEditDetailEvent(panel, event)
	const canEditTarget = canEditTimeline() && canEditDetailTarget(panel, event)
	const timelineEventKey = detailTimelineEventKey(event)
	const seconds = Math.round(phaseRelativeMsForEvent(event) / 1000)
	const timeControl = canEditTimeline()
		? canEditTime
			? `<label class="detail-time-field"><span>${state.phase === 'all' ? '全局秒' : `${state.phase.toUpperCase()} 秒`}</span><input type="number" min="0" max="${Math.round(currentPhaseEditWindow().durationMs / 1000)}" step="1" value="${seconds}" data-detail-time="${detailEditKey(panel, event, index)}"></label>`
			: `<span class="detail-locked-time" title="Boss 技能默认锁定">${timeLabel}</span>`
		: `<span class="detail-locked-time">${timeLabel}</span>`
	const targetControl = renderDetailTargetControl(panel, event, index, canEditTarget)
	return `
		<div class="detail-row ${targetControl ? 'has-target-detail-row' : ''} ${canEditTime ? 'editable-detail-row' : 'locked-detail-row'}">
			${renderIcon(eventName, event.iconUrl)}
			<div>
				<strong>${eventName}</strong>
				<span class="detail-meta">${meta}</span>
			</div>
			${timeControl}
			${targetControl}
			<div class="detail-actions">
				<button class="mini-button" data-action="locate-timeline-event" data-timeline-event-key="${timelineEventKey}" title="跳转到时间轴上的这个技能" ${timelineEventKey ? '' : 'disabled'}>追踪</button>
			</div>
		</div>
	`
}

function renderDetailTargetControl(panel, event, index, canEditTarget) {
	if (!shouldShowDetailTargetControl(panel, event)) {
		return ''
	}
	const options = targetOptions()
		.map(option => `<option value="${option.value}" ${String(event.target ?? '') === option.value ? 'selected' : ''}>${option.label}</option>`)
		.join('')
	const warning = event.targetRequired && !event.target
		? '<span class="target-required-warning">必须选择目标</span>'
		: ''
	return `
		<label class="detail-target-field">
			<span>目标</span>
			<select data-detail-target="${detailEditKey(panel, event, index)}" ${canEditTarget ? '' : 'disabled'}>
				${options}
			</select>
			${warning}
		</label>
	`
}

function renderManualEditor(panelId = 'all') {
	const events = detailEventsForCurrentPhase(manualEventsForPanel(panelId).map(detailManualEvent))
	const canEdit = canEditTimeline()
	return `
		<section class="manual-editor">
			<div class="manual-editor-heading">
				<div>
					<strong>手动轴编辑</strong>
					<span>${canEdit ? '可以改时间、微调、复制或删除用户手动技能' : '浏览模式下锁定，切到编辑模式后可调整'}</span>
				</div>
				<small>${events.length} 项</small>
			</div>
			${events.length ? events.map(event => renderManualEditorRow(event, canEdit)).join('') : '<p class="empty-state">当前分类还没有手动技能，可先从上方复制或从技能列拖入。</p>'}
		</section>
	`
}

function renderManualEditorRow(event, canEdit) {
	const eventName = displayNameForAction(event)
	const timelineLabel = event.timelineLabel || (eventName !== event.name ? event.name : '')
	const seconds = Math.round(phaseRelativeMsForEvent(event) / 1000)
	const cdLabel = hasMeaningfulCdAdjustment(event) ? `队列已顺延 +${formatDuration(event.cdAdjustedMs)}` : ''
	const meta = [timelineLabel ? `原轴：${timelineLabel}` : '', manualClassificationLabel(event), event.source === 'manual' ? '用户手动' : event.source, cdLabel].filter(Boolean).join(' / ')
	return `
		<div class="manual-edit-row">
			${renderIcon(eventName, event.iconUrl)}
			<div class="manual-edit-main">
				<strong>${eventName}</strong>
				<span>${formatTime(event.timeMs ?? 0)}${meta ? ` · ${meta}` : ''}</span>
			</div>
			<label class="manual-time-field">
				<span>${state.phase === 'all' ? '全局秒' : `${state.phase.toUpperCase()} 秒`}</span>
				<input type="number" min="0" max="1200" step="1" value="${seconds}" data-manual-time="${event.id}" ${canEdit ? '' : 'disabled'}>
			</label>
			<div class="manual-edit-actions">
				<button class="mini-button" data-action="nudge-manual-skill" data-manual-id="${event.id}" data-delta-ms="-1000" ${canEdit ? '' : 'disabled'}>-1s</button>
				<button class="mini-button" data-action="nudge-manual-skill" data-manual-id="${event.id}" data-delta-ms="1000" ${canEdit ? '' : 'disabled'}>+1s</button>
				<button class="mini-button" data-action="duplicate-manual-skill" data-manual-id="${event.id}" ${canEdit ? '' : 'disabled'}>复制</button>
				<button class="mini-button danger" data-action="remove-manual-skill" data-manual-id="${event.id}" ${canEdit ? '' : 'disabled'}>删除</button>
			</div>
		</div>
	`
}

function targetOptions() {
	return [
		{value: '', label: '请选择'},
		{value: 'Target', label: 'Boss / Target'},
		{value: 'Self', label: '自己 / Self'},
		{value: 'TargetOfTarget', label: '目标的目标'},
		{value: 'Party2', label: '队友 2'},
		{value: 'Party3', label: '队友 3'},
		{value: 'Party4', label: '队友 4'},
		{value: 'Party5', label: '队友 5'},
		{value: 'Party6', label: '队友 6'},
		{value: 'Party7', label: '队友 7'},
		{value: 'Party8', label: '队友 8'},
		{value: 'PartyMember2', label: 'PartyMember2'},
		{value: 'PartyMember3', label: 'PartyMember3'},
		{value: 'PartyMember4', label: 'PartyMember4'},
		{value: 'PartyMember5', label: 'PartyMember5'},
		{value: 'PartyMember6', label: 'PartyMember6'},
		{value: 'PartyMember7', label: 'PartyMember7'},
		{value: 'PartyMember8', label: 'PartyMember8'},
	]
}

function manualEventsForPanel(panelId) {
	const events = [...state.inserted].sort((left, right) => Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0))
	if (panelId === 'mitigation') {
		return events.filter(event => event.classification === 'mitigation' || event.classification === 'healing')
	}
	if (panelId === 'damage') {
		return events.filter(event => event.output || event.classification === 'damage' || event.classification === 'output')
	}
	if (panelId === 'potion') {
		return events.filter(event => event.classification === 'potion' || event.kind === 'potion' || /爆发药/.test(event.name ?? ''))
	}
	if (panelId === 'qt') {
		return events.filter(event => event.kind === 'qt-control' || event.type === 'qt' || event.classification === 'qt')
	}
	if (panelId === 'opener') {
		return events.filter(event => Number(event.timeMs ?? 0) <= 24000)
	}
	return events
}

function manualClassificationLabel(event) {
	if (event.classification === 'mitigation') return '减伤'
	if (event.classification === 'healing') return '治疗'
	if (event.classification === 'potion') return '爆发药'
	if (event.output || event.classification === 'damage' || event.classification === 'output') return '输出'
	return event.classification ?? ''
}

function requiresManualTargetChoice(action = null, classification = '') {
	const type = String(classification || action?.type || '').toLowerCase()
	if (['mitigation', 'healing', 'invuln'].includes(type)) {
		return true
	}
	const text = `${action?.name ?? ''} ${action?.category ?? ''} ${action?.skillType ?? ''}`
	return /无敌|减伤|治疗|回复|护盾|防护|铁壁|雪仇|黑盾|至黑|行尸|暗影墙|暗黑布道|献奉|神祝祷|水流幕|庇护|礼仪之铃|天赐|医济/i.test(text)
}

function defaultManualTargetForAction(action = null, classification = '') {
	if (requiresManualTargetChoice(action, classification)) {
		return ''
	}
	if (action?.output || classification === 'damage' || classification === 'dot' || classification === 'output') {
		return 'Target'
	}
	return ''
}

function renderOverviewPanel(model) {
	const sections = overviewSections(model)
	return `
		<div class="detail-list overview-panel">
			<h3>整页总览</h3>
			<div class="overview-grid">
				${sections.map(section => `
					<article class="overview-section">
						${renderDetailCollapse({
							id: `overview-${section.id}`,
							label: section.label,
							count: section.events.length,
							events: section.events,
							controls: section.id === 'damage' ? renderOutputSimulationControl() : '',
							open: isDetailCollapseOpen(`overview-${section.id}`),
							body: section.events.length
								? section.events.map((event, index) => renderDetailEventRow(section, event, index)).join('')
								: '<p class="empty-state">暂无数据</p>',
						})}
					</article>
				`).join('')}
			</div>
		</div>
	`
}

function overviewSections(model) {
	const bossEvents = (model.tracks.expert.boss ?? []).filter(event => event.kind === 'boss-cast' || event.type === 'cast')
	const mitigationPanel = model.detailPanels.find(panel => panel.id === 'mitigation')
	const potionPanel = model.detailPanels.find(panel => panel.id === 'potion')
	const openerPanel = model.detailPanels.find(panel => panel.id === 'opener')
	return [
		{id: 'boss', label: 'Boss 读条', events: detailEventsForCurrentPhase(bossEvents)},
		{id: 'mitigation', label: '减伤 / 奶轴', events: detailPanelEvents(mitigationPanel)},
		{id: 'damage', label: '输出轴', events: detailEventsForCurrentPhase(outputDetailEvents())},
		{id: 'potion', label: '爆发药轴', events: detailPanelEvents(potionPanel)},
		{id: 'opener', label: '起手', events: detailPanelEvents(openerPanel)},
	]
}

function renderBurstGroupsInDetailPanel(bursts) {
	const burstEvents = detailEventsForCurrentPhase(buildBurstPackageItems(bursts))
	const panel = virtualDetailPanel('burst', '爆发', burstEvents)
	return `
		<div class="detail-list burst-detail-list">
			${renderDetailCollapse({
				id: panel.id,
				label: panel.label,
				count: burstEvents.length,
				events: burstEvents,
				open: isDetailCollapseOpen('burst'),
				body: burstEvents.length
					? burstEvents.map((event, index) => renderDetailEventRow(panel, event, index)).join('')
					: '<p class="empty-state">当前 P / 当前过滤条件下暂无爆发数据</p>',
			})}
		</div>
	`
}

function renderQtDetailPanel() {
	const events = detailEventsForCurrentPhase(qtDetailEvents())
	const panel = virtualDetailPanel('qt', 'QT 控制', events)
	return `
		<div class="detail-list qt-detail-list">
			${renderDetailCollapse({
				id: panel.id,
				label: panel.label,
				count: events.length,
				events,
				open: isDetailCollapseOpen('qt'),
				body: events.length
					? events.map((event, index) => renderDetailEventRow(panel, event, index)).join('')
					: '<p class="empty-state">当前 P / 当前过滤条件下暂无 QT 节点</p>',
			})}
			${renderManualEditor('qt')}
		</div>
	`
}

function qtDetailEvents() {
	const qtEvents = editableQtEvents()
	const manualQtEvents = manualEventsForPanel('qt').map(detailManualEvent)
	return uniqueDetailEvents([
		...qtEvents,
		...manualQtEvents,
	]).sort(compareDetailEvents)
}

function editableQtEvents() {
	return (state.model.tracks.expert.qt ?? []).map(normalizeEditableQtEvent)
}

function normalizeEditableQtEvent(event = {}, index = 0) {
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	const durationMs = Number(event.durationMs ?? 2500)
	event.id ??= `track-qt-${index}`
	event.type ??= 'qt'
	event.kind ??= 'qt-control'
	event.name ??= event.label ?? 'QT 控制'
	event.label ??= event.name
	event.timeMs = timeMs
	event.startMs = Number(event.startMs ?? timeMs)
	event.endMs = Number(event.endMs ?? timeMs + durationMs)
	event.durationMs = durationMs
	event.classification ??= 'qt'
	event.source ??= 'timeline'
	return event
}

function virtualDetailPanel(id, label, events = []) {
	return {id, label, events, virtual: true}
}

function renderFocusSkillModal(model) {
	if (!state.showFocusPicker) {
		return ''
	}
	const selectedJob = model.acrDatabase.jobs.find(job => job.id === state.job) ?? model.acrDatabase.jobs[0]
	const query = normalizeSearchText(state.focusQuery)
	const groups = groupedFocusCandidates(query)
	return `
		<div class="modal-backdrop" role="dialog" aria-modal="true">
			<section class="modal-panel focus-skill-modal">
				<div class="modal-header">
					<div>
						<p class="eyebrow">技能追踪器</p>
						<h3>${selectedJob?.name ?? state.job} 关注技能</h3>
						<p class="focus-tracker-help">追踪当前职业的任意技能，显示出现次数、时间点和来源。</p>
					</div>
					<button class="mini-button" data-action="close-focus-picker">关闭</button>
				</div>
				<input class="modal-search" data-field="focus-query" value="${escapeHtml(state.focusQuery)}" placeholder="搜索技能名或技能 ID">
				${renderFocusSkillSection({
					id: 'current-job',
					title: '当前职业技能',
					description: `${selectedJob?.name ?? state.job} 与通用职业技能`,
					skills: groups.current,
					open: true,
				})}
				<details class="focus-skill-section other-skills">
					<summary>
						<span>
							<strong>其他技能</strong>
							<small>其他职业、导入轴里出现过的技能，默认收起</small>
						</span>
						<em>${groups.other.length} 个</em>
					</summary>
					${renderFocusSkillGrid(groups.other, 'other-skills')}
				</details>
			</section>
		</div>
	`
}

function renderFocusSkillSection({id, title, description, skills}) {
	return `
		<section class="focus-skill-section" data-focus-section="${id}">
			<div class="focus-skill-section-heading">
				<span>
					<strong>${title}</strong>
					<small>${description}</small>
				</span>
				<em>${skills.length} 个</em>
			</div>
			${renderFocusSkillGrid(skills, id)}
		</section>
	`
}

function renderFocusSkillGrid(skills, sectionId) {
	return `
		<div class="focus-skill-grid" data-focus-section="${sectionId}">
			${skills.map(skill => renderFocusSkillOption(skill)).join('') || '<p class="empty-state">没有找到技能</p>'}
		</div>
	`
}

function renderFocusSkillOption(skill) {
	const tracked = state.focusedSkills.includes(String(skill.id))
	const occurrences = timelineEventsForAction(skill.id)
	return `
		<button class="focus-skill-option ${tracked ? 'active' : ''}" data-focus-skill="${skill.id}">
			${renderIcon(skill.name, skill.iconUrl)}
			<span>
				<strong>${skill.name}</strong>
				<small>${skill.id} / ${skill.jobName || skill.job || '通用'} / 本轴 ${occurrences.length} 次</small>
			</span>
			<em>${tracked ? '已追踪' : '+'}</em>
		</button>
	`
}

function renderInsertTool() {
	return `
		<div class="insert-tool compact">
			<div class="insert-row">
				<input data-field="skill-id" value="${escapeHtml(state.insertSkillId)}" placeholder="技能 ID">
				<span class="insert-id-preview" data-insert-id-preview>${escapeHtml(insertIdPreviewName())}</span>
				<button class="primary" data-action="insert-skill">插入</button>
			</div>
		</div>
	`
}

function renderToolPanel(model) {
	return `
		<section class="tool-panel" aria-label="工具">
			<div class="section-heading tool-heading">
				<div>
					<p class="eyebrow">工具</p>
					<h3>模拟估值 / FFLogs 对比</h3>
				</div>
				<span class="status-pill">妖星首版</span>
			</div>
			${renderFflogsComparisonPanel(model)}
			<div class="tool-grid">
			<section class="sim-panel">
				<div class="section-heading">
					<div>
						<p class="eyebrow">伤害模拟计算</p>
						<h3>分 P 与整体估值</h3>
					</div>
					<select data-field="luck">
						<option value="average" ${state.luck === 'average' ? 'selected' : ''}>平均</option>
						<option value="lucky" ${state.luck === 'lucky' ? 'selected' : ''}>好运直暴</option>
						<option value="low" ${state.luck === 'low' ? 'selected' : ''}>保守</option>
					</select>
				</div>
				<label class="slider">暴击概率 <input data-field="critRate" type="range" min="0" max="60" value="${state.critRate}"><span>${state.critRate}%</span></label>
				<label class="slider">直击概率 <input data-field="directRate" type="range" min="0" max="60" value="${state.directRate}"><span>${state.directRate}%</span></label>
				<div class="damage-total" data-damage-total>--</div>
				<div class="phase-damage" data-phase-damage></div>
				<p class="hint">可与当前 ACT log、FFLogs 榜一轴和导入轴做模拟对比。</p>
			</section>
			</div>
		</section>
	`
}

function renderFflogsComparisonPanel(model) {
	const comparison = state.fflogsComparison
	return `
		<section class="fflogs-panel">
			<div class="section-heading">
				<div>
					<p class="eyebrow">FFLogs 对比模式</p>
					<h3>当前轴 vs 日志实战轴</h3>
				</div>
				<span class="status-pill">${comparison ? '已解析' : '待导入'}</span>
			</div>
			<div class="fflogs-import-row">
				<input data-field="fflogs-url" value="${escapeHtml(state.fflogsUrl)}" placeholder="粘贴 FFLogs report 链接">
				<button class="primary" data-action="load-fflogs-comparison">${state.fflogsStatus ? '解析中' : '解析 FFLogs'}</button>
			</div>
			${state.fflogsStatus ? `<p class="hint">${escapeHtml(state.fflogsStatus)}</p>` : ''}
			${state.fflogsError ? `<p class="import-feedback error">${escapeHtml(state.fflogsError)}</p>` : ''}
			${comparison ? renderFflogsComparisonResult(comparison, model) : '<p class="hint">导入链接后会自动匹配当前职业，解析本地缓存事件，并对比伤害、技能数、GCD 利用率和治疗量。</p>'}
		</section>
	`
}

function renderFflogsComparisonResult(comparison, model) {
	const actors = comparison.actors ?? []
	const selectedActor = comparison.selectedActor ?? {}
	return `
		<div class="fflogs-meta">
			<span>${escapeHtml(comparison.source?.encounterName || model.encounter.name)}</span>
			<span>${escapeHtml(comparison.source?.sourceLog || state.fflogsUrl)}</span>
			<label>
				<span>角色</span>
				<select data-field="fflogs-actor">
					${actors.map(actor => `<option value="${actor.id}" ${Number(actor.id) === Number(selectedActor.id) ? 'selected' : ''}>${escapeHtml(actor.name)} / ${escapeHtml(actor.job || '未知')} / ${formatDamage(actor.damage)}</option>`).join('')}
				</select>
			</label>
		</div>
		<div class="fflogs-metric-grid">
			${renderCompareMetric('伤害', comparison.simulated.damage.total, comparison.log.damage.total, comparison.deltas.damage.total, comparison.deltas.damage.percent, 'damage', renderDamageAdjustmentBreakdown(comparison))}
			${renderCompareMetric('全部技能数', comparison.simulated.skillCounts.total, comparison.log.skillCounts.total, comparison.deltas.skillCounts.total, null, 'count', renderSkillCountBreakdown(comparison))}
			${renderCompareMetric('GCD 利用率', comparison.simulated.gcdUtilization.percent, comparison.log.gcdUtilization.percent, comparison.deltas.gcdUtilization.points, null, 'percent', renderGcdUtilizationControl(comparison))}
			${renderCompareMetric('治疗量', comparison.simulated.healing.total, comparison.log.healing.total, comparison.deltas.healing.total, comparison.deltas.healing.percent, 'damage')}
		</div>
		<div class="fflogs-detail-grid">
			<section>
				<h4>分 P 伤害</h4>
				${renderPhaseCompareTable(comparison)}
			</section>
			<section>
				<h4>技能数量差异</h4>
				${renderSkillCompareTable(comparison.skillRows ?? [])}
			</section>
		</div>
	`
}

function renderDamageAdjustmentBreakdown(comparison) {
	const damage = comparison.simulated?.damage ?? {}
	const calibration = damage.calibration
	if (!calibration && !damage.adjustment) {
		return ''
	}
	const adjustedTotal = Number(damage.total ?? 0)
	const unadjustedTotal = Number(damage.unadjustedTotal ?? adjustedTotal)
	const adjustmentDelta = adjustedTotal - unadjustedTotal
	const phaseScales = Object.entries(damage.adjustment?.scales ?? {})
		.map(([phase, scale]) => `${escapeHtml(phase)} ${(Number(scale) * 100).toFixed(1)}%`)
		.join(' / ')
	const calibrationRows = calibration ? [
		`FFLogs 实战标定 ${formatNumber(calibration.attackPower, 1)} / 默认 ${formatNumber(calibration.defaultAttackPower ?? 120, 0)}`,
		`样本 ${formatMetricValue(calibration.sampleHits, 'count')} 命中 / ${formatDamage(calibration.sampleDamage)}`,
		`实战暴击 ${formatNumber(calibration.critRate, 1)}% / 直击 ${formatNumber(calibration.directRate, 1)}%`,
		`带 buff 命中 ${formatNumber(calibration.buffedRate, 1)}%`,
	] : []
	const adjustmentRows = damage.adjustment ? [
		`校正前 ${formatDamage(unadjustedTotal)}`,
		damage.adjustment.type === 'target-gcd-utilization'
			? `按目标 GCD ${formatNumber(damage.adjustment.targetPercent, 1)}% ${formatSignedDamage(adjustmentDelta)}`
			: `按日志 GCD 利用率 ${formatSignedDamage(adjustmentDelta)}`,
		phaseScales,
	] : ['GCD 利用率仅作对比显示，伤害不再二次折扣']
	return `
		<div class="fflogs-metric-detail">
			${[...calibrationRows, ...adjustmentRows].filter(Boolean).map(row => `<span>${escapeHtml(row)}</span>`).join('')}
		</div>
	`
}

function renderGcdUtilizationControl(comparison) {
	const target = clampPercent(state.fflogsTargetGcdUtilization)
	const actual = Number(comparison.simulated?.gcdUtilization?.actualPercent ?? comparison.simulated?.gcdUtilization?.percent ?? target)
	const logPercent = Number(comparison.log?.gcdUtilization?.percent ?? 0)
	const targetDiff = target - logPercent
	return `
		<div class="gcd-utilization-control">
			<label>
				<span>模拟利用率</span>
				<input data-field="fflogs-gcd-utilization" type="range" min="50" max="100" step="0.1" value="${formatNumber(target, 1)}">
				<strong>${formatNumber(target, 1)}%</strong>
			</label>
			<div class="gcd-utilization-actions">
				<button class="mini-button" data-action="apply-log-gcd-utilization">套用日志 ${formatNumber(logPercent, 1)}%</button>
				<button class="mini-button" data-action="reset-gcd-utilization">重置 100%</button>
			</div>
			<span>原始模拟 ${formatNumber(actual, 1)}% / 目标差 ${formatSignedNumber(targetDiff, 1)}pt</span>
		</div>
	`
}

function renderCompareMetric(label, simulated, logValue, delta, deltaPercent, type, detail = '') {
	const deltaClass = Number(delta) >= 0 ? 'positive' : 'negative'
	const deltaLabel = type === 'percent'
		? `${formatSignedNumber(delta, 1)}pt`
		: type === 'count'
			? formatSignedInteger(delta)
			: `${formatSignedDamage(delta)}${deltaPercent == null ? '' : ` / ${formatSignedNumber(deltaPercent, 1)}%`}`
	return `
		<article class="fflogs-metric">
			<span>${label}</span>
			<div>
				<strong>${formatMetricValue(simulated, type)}</strong>
				<small>模拟</small>
			</div>
			<div>
				<strong>${formatMetricValue(logValue, type)}</strong>
				<small>日志</small>
			</div>
			<em class="${deltaClass}">${deltaLabel}</em>
			${detail}
		</article>
	`
}

function renderSkillCountBreakdown(comparison) {
	const simulated = comparison.simulated?.skillCounts ?? {}
	const logValue = comparison.log?.skillCounts ?? {}
	const deltas = comparison.deltas?.skillCounts ?? {}
	return `
		<div class="fflogs-metric-detail">
			<span>动作 ${formatMetricValue(simulated.actions, 'count')} / ${formatMetricValue(logValue.actions, 'count')} <b class="${Number(deltas.actions ?? 0) >= 0 ? 'positive' : 'negative'}">${formatSignedInteger(deltas.actions ?? 0)}</b></span>
			<span>自动攻击 ${formatMetricValue(simulated.auto, 'count')} / ${formatMetricValue(logValue.auto, 'count')} <b class="${Number(deltas.auto ?? 0) >= 0 ? 'positive' : 'negative'}">${formatSignedInteger(deltas.auto ?? 0)}</b></span>
		</div>
	`
}

function renderPhaseCompareTable(comparison) {
	const phaseKeys = [...new Set([
		...Object.keys(comparison.simulated.damage.phases ?? {}),
		...Object.keys(comparison.log.damage.phases ?? {}),
	])]
	return `
		<div class="compare-table">
			<div class="compare-row header"><span>P</span><span>模拟</span><span>日志</span><span>差值</span></div>
			${phaseKeys.map(phase => {
				const simulated = Number(comparison.simulated.damage.phases?.[phase]?.damage ?? 0)
				const logValue = Number(comparison.log.damage.phases?.[phase]?.damage ?? 0)
				return `<div class="compare-row"><span>${escapeHtml(phase)}</span><span>${formatDamage(simulated)}</span><span>${formatDamage(logValue)}</span><span class="${simulated - logValue >= 0 ? 'positive' : 'negative'}">${formatSignedDamage(simulated - logValue)}</span></div>`
			}).join('')}
		</div>
	`
}

function renderSkillCompareTable(rows) {
	return `
		<div class="compare-table skill-table">
			<div class="compare-row header"><span>技能</span><span>模拟</span><span>日志</span><span>差值</span></div>
			${rows.slice(0, 18).map(row => `<div class="compare-row"><span>${escapeHtml(row.actionName || `技能 ${row.actionId}`)}</span><span>${row.simulatedCount}</span><span>${row.logCount}</span><span class="${row.delta >= 0 ? 'positive' : 'negative'}">${formatSignedInteger(row.delta)}</span></div>`).join('')}
		</div>
	`
}

function renderAcrDock(model) {
	return `
		<div class="acr-dock">
			<button class="acr-dock-title" data-action="open-acr-database">ACR 数据库</button>
		</div>
	`
}

function renderAcrModal(model) {
	if (!state.showAcrModal) {
		return ''
	}
	const generatedAt = formatGeneratedAt(model.acrDatabase.generatedAt || model.skillDatabase?.source?.generatedAt)
	const supportedJobs = model.acrDatabase.jobs.filter(job => acrSupportStatus(job).key === 'supported').length
	const waitingJobs = model.acrDatabase.jobs.filter(job => acrSupportStatus(job).key === 'waiting').length
	const unsupportedJobs = model.acrDatabase.jobs.length - supportedJobs - waitingJobs
	return `
		<div class="modal-backdrop" role="dialog" aria-modal="true">
			<section class="modal-panel acr-db-modal">
				<div class="modal-header">
					<div>
						<p class="eyebrow">ACR 数据库</p>
						<h3>职业 / 作者 / 生成时间</h3>
					</div>
					<button class="mini-button" data-action="close-acr-database">关闭</button>
				</div>
				<div class="acr-db-summary">
					<span>数据库生成时间：${generatedAt}</span>
					<span>ACR 包：${model.acrDatabase.packages.length}</span>
					<span>职业：${model.acrDatabase.jobs.length}</span>
					<span>已支持：${supportedJobs}</span>
					<span>未支持：${unsupportedJobs}</span>
					<span>等待接入：${waitingJobs}</span>
				</div>
				<div class="package-line">${model.acrDatabase.packages.map(name => `<span>${name}</span>`).join('')}</div>
				<div class="acr-db-grid">
					${model.acrDatabase.jobs.map(job => {
						const primaryAcr = job.acrs.find(acr => acr.enabled) ?? job.acrs[0]
						return `
						<article class="acr-job-card ${job.enabled ? '' : 'disabled'}">
							<div>
								<strong>${job.name}</strong>
								<small>${job.id} / ${job.role}</small>
							</div>
							${renderAcrField('支持状态：', renderAcrStatusBadge(acrSupportStatus(job, primaryAcr)))}
							${renderAcrField('作者：', primaryAcr?.author ?? primaryAcr?.name ?? '未指定')}
							${renderAcrField('数据来源：', publicAcrSourceLabel(primaryAcr?.source ?? model.skillDatabase?.source?.name))}
							<div class="acr-chip-list">
								${job.acrs.map(acr => `<span class="${acr.enabled ? '' : 'disabled'}" title="${publicAcrSourceLabel(acr.source)}">${acr.name}<small>${publicAcrSourceLabel(acr.source)}</small></span>`).join('')}
							</div>
						</article>
					`}).join('')}
				</div>
			</section>
		</div>
	`
}

function acrSupportStatus(job, acr) {
	if (!job) {
		return {key: 'waiting', label: '等待接入'}
	}
	if (!job.enabled) {
		return {key: 'unsupported', label: '未支持'}
	}
	if (acr && !acr.enabled) {
		return {key: 'unsupported', label: '未支持'}
	}
	if (!job.acrs?.length) {
		return {key: 'waiting', label: '等待接入'}
	}
	if (!acr && !job.acrs.some(item => item.enabled)) {
		return {key: 'waiting', label: '等待接入'}
	}
	return {key: 'supported', label: '已支持'}
}

function renderAcrStatusBadge(status) {
	const safeStatus = status ?? {key: 'waiting', label: '等待接入'}
	return `<span class="acr-status ${safeStatus.key}">${safeStatus.label}</span>`
}

function renderAcrField(label, value) {
	const content = value == null || value === '' ? '未指定' : value
	return `<div class="acr-field"><span>${label}</span><strong>${content}</strong></div>`
}

function publicAcrSourceLabel(source = '') {
	const value = String(source ?? '').trim()
	if (!value) {
		return '未指定'
	}
	if (/反编译|decompiled/i.test(value)) {
		return 'ACR 数据'
	}
	return value
}

function renderIcon(name = '', explicitUrl = '') {
	if (explicitUrl) {
		return `<img class="skill-icon" src="${explicitUrl}" alt="">`
	}
	const action = findActionByName(name)
	if (action?.iconUrl) {
		return `<img class="skill-icon" src="${action.iconUrl}" alt="">`
	}
	return `<span class="skill-icon fallback">${name.slice(0, 1) || '技'}</span>`
}

function findActionByName(name = '') {
	return state.model?.skillDatabase?.skills?.find(skill => name.includes(skill.name) || skill.name.includes(name))
}

function uniqueSkillEvents(events) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const id = String(event.actionId ?? event.name ?? '')
		if (!id || seen.has(id)) {
			continue
		}
		seen.add(id)
		result.push(event)
	}
	return result
}

function uniqueSkillsById(skills) {
	const seen = new Set()
	const result = []
	for (const skill of skills) {
		const id = String(skill?.id ?? '')
		if (!id || seen.has(id)) {
			continue
		}
		seen.add(id)
		result.push(skill)
	}
	return result
}

function uniqueFocusEvents(events) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = focusEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function focusEventKey(event) {
	return [
		String(event?.actionId ?? ''),
		Math.round(Number(event?.timeMs ?? 0)),
		focusSourceLabel(event),
	].join('|')
}

function renderFocusAddRow() {
	return `
		<div class="focus-add-control">
			<button data-action="open-focus-picker">+ 关注技能</button>
			<span>${state.focusedSkills.length ? `已追踪 ${state.focusedSkills.length} 个技能` : '点击选择当前职业技能'}</span>
		</div>
	`
}

function renderFocusAddLabel() {
	return `<button class="focus-label-button" data-action="open-focus-picker">+ 关注技能</button>`
}

function renderFocusedSkillLabel(skill, actionId, count) {
	return `
		<span class="focus-label">
			<span class="focus-label-name">${escapeHtml(skill?.name ?? `技能 ${actionId}`)}</span>
			<small>${count} 次</small>
			<button class="focus-label-remove" data-action="remove-focused-skill" data-focus-skill="${actionId}" title="取消关注">×</button>
		</span>
	`
}

function focusedSkillRows() {
	return state.focusedSkills
		.map(actionId => {
			const skill = actionById(actionId)
			const items = timelineEventsForAction(actionId)
				.map((event, index) => focusTrackerItemForEvent(event, skill, actionId, index))
			return {
				id: `focus-${actionId}`,
				label: skill?.name ?? `技能 ${actionId}`,
				labelHtml: renderFocusedSkillLabel(skill, actionId, items.length),
				accent: 'sky',
				keepWhenEmpty: true,
				items,
			}
		})
}

function focusCandidates() {
	const track = state.model.tracks.expert
	return uniqueSkillEvents([
		...(state.showAcrSimulation ? state.model.acrSimulation.events : []),
		...(track.mitigation ?? []),
		...mainActionTimelineEvents(track.player ?? []),
		...state.inserted,
	]).filter(event => Number(event.actionId))
}

function groupedFocusCandidates(query = '') {
	const skills = state.model.skillDatabase?.skills ?? []
	const timelineEvents = focusCandidates()
	const timelineActionIds = new Set(timelineEvents.map(event => String(event.actionId)))
	const timelineSkills = timelineEvents
		.map(event => actionById(event.actionId) ?? {
			id: Number(event.actionId),
			name: event.name,
			job: event.job ?? state.job,
			jobName: event.jobName ?? event.job ?? state.job,
			iconUrl: event.iconUrl ?? '',
			category: event.skillType ?? event.classification ?? '技能',
			level: 0,
		})
	const allSkills = uniqueSkillsById([...skills, ...timelineSkills])
		.filter(skill => Number(skill.id))
		.filter(skill => focusSkillMatchesQuery(skill, query))
		.sort(compareFocusSkills)
	const current = allSkills.filter(skill => isCurrentJobFocusSkill(skill) && timelineActionIds.has(String(skill.id)))
	return {
		current,
		other: allSkills.filter(skill => !current.includes(skill)),
	}
}

function isCurrentJobFocusSkill(skill) {
	return skill.job === state.job || skill.job === 'ROLE'
}

function focusSkillMatchesQuery(skill, query = '') {
	if (!query) {
		return true
	}
	const haystack = normalizeSearchText(`${skill.id} ${skill.name} ${skill.jobName ?? ''} ${skill.job ?? ''} ${skill.category ?? ''}`)
	return haystack.includes(query)
}

function compareFocusSkills(left, right) {
	const leftCurrent = isCurrentJobFocusSkill(left) ? 0 : 1
	const rightCurrent = isCurrentJobFocusSkill(right) ? 0 : 1
	if (leftCurrent !== rightCurrent) {
		return leftCurrent - rightCurrent
	}
	const leftCount = timelineEventsForAction(left.id).length
	const rightCount = timelineEventsForAction(right.id).length
	if (leftCount !== rightCount) {
		return rightCount - leftCount
	}
	return Number(left.level ?? 0) - Number(right.level ?? 0) || String(left.name).localeCompare(String(right.name), 'zh-CN')
}

function timelineEventsForAction(actionId) {
	const id = String(actionId)
	return uniqueFocusEvents([
		...(state.showAcrSimulation ? state.model.acrSimulation.events : []),
		...mainActionTimelineEvents(state.model.tracks.expert.player ?? []),
		...(state.model.tracks.expert.mitigation ?? []),
		...state.inserted,
	].filter(event => String(event.actionId) === id))
}

function addFocusedSkill(actionId) {
	const id = String(actionId)
	if (!id || state.focusedSkills.includes(id)) {
		return
	}
	state.focusedSkills.push(id)
	const skill = actionById(id)
	setImportStatus(`已追踪 ${skill?.name ?? `技能 ${id}`}`)
	state.showFocusPicker = false
	render()
}

function removeFocusedSkill(actionId) {
	const id = String(actionId ?? '')
	if (!id) {
		return
	}
	state.focusedSkills = state.focusedSkills.filter(skillId => skillId !== id)
	render()
}

function actionById(actionId) {
	return state.model.skillDatabase?.actionsById?.[String(actionId)] ?? null
}

function actionByName(name = '') {
	const normalizedName = String(name ?? '').trim()
	if (!normalizedName) {
		return null
	}
	return state.model.skillDatabase?.skills?.find(skill => skill.name === normalizedName)
		?? state.model.skillDatabase?.skills?.find(skill => normalizedName.includes(skill.name) || skill.name.includes(normalizedName))
		?? null
}

function insertIdPreviewName(id = state.insertSkillId) {
	const normalizedId = String(id ?? '').trim()
	if (!normalizedId) {
		return '输入 ID 后自动匹配技能名'
	}
	const action = actionById(normalizedId)
	if (!action) {
		return '未找到该技能 ID'
	}
	const job = action.jobName || action.job || '未知职业'
	return `${action.name} / ${job}`
}

function displayNameForAction(event = {}) {
	if (event.kind === 'potion' || event.type === 'potion') {
		const attributeLabel = potionAttributeLabel(event.attributeId)
		return event.name ?? event.label ?? `${attributeLabel}爆发药`
	}
	if (event.kind === 'qt-control' || event.type === 'qt') {
		return event.name ?? event.label ?? 'QT 控制'
	}
	const actionId = Number(event.actionId)
	if (!Number.isFinite(actionId)) {
		return event.name ?? event.label ?? '技能'
	}
	return ACTION_LABELS.get(actionId)
		?? actionById(actionId)?.name
		?? event.name
		?? event.label
		?? `技能 ${actionId}`
}

function renderBossAvatar(name, index = 0) {
	const key = bossAvatarKey(name, index)
	const avatar = BOSS_AVATAR_ASSETS[key] ?? BOSS_AVATAR_ASSETS[BOSS_AVATAR_KEYS[index % BOSS_AVATAR_KEYS.length]]
	if (avatar.kind === 'pixel') {
		return `<span class="boss-avatar boss-avatar-${key} boss-avatar-pixel boss-avatar-pixel-${avatar.pixel}" aria-hidden="true">${renderBossPixelAvatar(avatar.pixel)}</span>`
	}
	return `<span class="boss-avatar boss-avatar-${key}" aria-hidden="true"><img src="${avatar.src}" alt="" loading="lazy" decoding="async"></span>`
}

function renderBossPixelAvatar(name) {
	const cells = BOSS_PIXEL_AVATARS[name] ?? BOSS_PIXEL_AVATARS['black-hole']
	return `<span class="boss-avatar-pixel-grid">${cells.map(cell => `<i class="boss-avatar-pixel-cell p${cell}"></i>`).join('')}</span>`
}

function bossAvatarKey(name, index = 0) {
	const text = String(name ?? '')
	if (text.includes('凯夫卡') || /kefka/i.test(text)) return 'kefka'
	if (text.includes('卡奥斯') || /chaos/i.test(text)) return 'chaos'
	if (text.includes('新生艾克斯迪司') || /neo/i.test(text)) return 'exdeath'
	if (text.includes('艾克斯迪司') || /exdeath/i.test(text)) return 'exdeath'
	if (text.includes('众神之像') || /statue|graven/i.test(text)) return 'statue'
	if (text.includes('黑洞') || /black hole/i.test(text)) return 'black-hole'
	return BOSS_AVATAR_KEYS[index % BOSS_AVATAR_KEYS.length]
}

const BOSS_AVATAR_KEYS = ['kefka', 'chaos', 'exdeath', 'exdeath', 'statue', 'black-hole']

const BOSS_AVATAR_ASSETS = {
	kefka: {src: '/assets/boss/kefka.gif', kind: 'image'},
	chaos: {src: '/assets/boss/chaos.png', kind: 'image'},
	exdeath: {src: '/assets/boss/exdeath.png', kind: 'image'},
	statue: {pixel: 'statue', kind: 'pixel'},
	'black-hole': {pixel: 'black-hole', kind: 'pixel'},
}

const BOSS_PIXEL_AVATARS = {
	statue: [
		0,0,1,1,1,1,1,1,0,0,
		0,1,2,2,2,2,2,2,1,0,
		1,2,2,3,2,2,3,2,2,1,
		1,2,4,2,2,2,2,4,2,1,
		0,1,2,2,5,5,2,2,1,0,
		0,1,6,2,2,2,2,6,1,0,
		1,6,6,1,2,2,1,6,6,1,
		1,0,6,1,1,1,1,6,0,1,
	],
	'black-hole': [
		0,0,0,4,4,4,4,0,0,0,
		0,0,4,3,3,3,3,4,0,0,
		0,4,3,2,2,2,2,3,4,0,
		4,3,2,1,1,1,1,2,3,4,
		4,3,2,1,0,0,1,2,3,4,
		0,4,3,2,1,1,2,3,4,0,
		0,0,4,3,2,2,3,4,0,0,
		0,0,0,4,4,4,4,0,0,0,
	],
}

function insertManualSkill() {
	if (!canEditTimeline()) {
		return
	}
	const id = document.querySelector('[data-field="skill-id"]')?.value.trim()
	const action = state.model.skillDatabase?.actionsById?.[id]
	const name = action?.name ?? `技能 ${id}`
	const output = Boolean(action?.output)
	if (!id) return
	state.insertSkillId = id
	const timeMs = 90000 + state.inserted.length * 8000
	const manualId = `manual-${Date.now()}`
	state.inserted.push({
		id: manualId,
		name,
		actionId: id,
		timeMs,
		requestedTimeMs: timeMs,
		kind: 'player-action',
		source: 'manual',
		classification: action?.type ?? 'unknown',
		output,
		potency: output ? Number(action?.potency ?? 0) : 0,
		recastMs: Number(action?.recastMs ?? 0),
		iconUrl: action?.iconUrl ?? '',
		count: 1,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	setImportStatus(adjusted > 0 ? `已插入 ${name}，队列已顺延到 ${formatTime(inserted.timeMs)}` : `已插入 ${name} 到 ${formatTime(timeMs)}`)
	render()
}

function insertSkillAtTimeline(actionId, event, timeline) {
	const dropLane = timelineDropLaneForTarget(event.target)
	if (!canDropActionOnTimelineLane(actionId, dropLane)) {
		setImportError('这个技能不能放到当前功能行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertSkillAtMs(actionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertSkillAtClientPoint(actionId, clientX, clientY) {
	if (!canEditTimeline() || !actionId) {
		return false
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('没有放到时间轴区域，技能未插入')
		render()
		return false
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	if (!canDropActionOnTimelineLane(actionId, dropLane)) {
		setImportError('这个技能不能放到当前功能行')
		return false
	}
	const dropInfo = timelineDropInfoForClientX(clientX, timeline)
	insertSkillAtMs(actionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
	return true
}

function insertSkillAtVisibleTimeline(actionId) {
	if (!canEditTimeline() || !actionId) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		insertSkillAtMs(actionId, 90000 + state.inserted.length * 8000)
		return
	}
	const dropInfo = timelineDropInfoForVisibleCenter(timeline)
	insertSkillAtMs(actionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertPotionAtVisibleTimeline(potionId) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const dropInfo = timeline ? timelineDropInfoForVisibleCenter(timeline) : null
	const timeMs = dropInfo?.absoluteTimeMs ?? visibleTimelineCenterMs()
	insertPotionAtMs(potionId, timeMs, {phaseInfo: dropInfo})
}

function insertQtAtVisibleTimeline(qtIndex) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const timeMs = timeline ? timelineDropInfoForVisibleCenter(timeline).absoluteTimeMs : visibleTimelineCenterMs()
	insertQtAtMs(qtIndex, timeMs)
}

function insertQtDraftAtVisibleTimeline() {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const dropInfo = timeline ? timelineDropInfoForVisibleCenter(timeline) : null
	const timeMs = dropInfo?.absoluteTimeMs ?? visibleTimelineCenterMs()
	insertQtDraftAtMs(timeMs, {phaseInfo: dropInfo})
}

function insertQtAtTimeline(qtIndex, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertQtAtMs(qtIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertQtAtClientPoint(qtIndex, clientX, clientY) {
	if (!canEditTimeline() || !qtIndex) {
		return false
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('没有放到时间轴区域，QT 未插入')
		render()
		return false
	}
	const dropInfo = timelineDropInfoForClientX(clientX, timeline)
	insertQtAtMs(qtIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
	return true
}

function insertPotionAtTimeline(potionId, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const dropLane = timelineDropLaneForTarget(event.target)
	if (!canDropPotionOnTimelineLane(dropLane)) {
		setImportError('爆发药只能放到爆发行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertPotionAtMs(potionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertPotionAtClientPoint(potionId, clientX, clientY) {
	if (!canEditTimeline()) {
		return false
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('没有放到时间轴区域，爆发药未插入')
		render()
		return false
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	if (!canDropPotionOnTimelineLane(dropLane)) {
		setImportError('爆发药只能放到爆发行')
		return false
	}
	const dropInfo = dropTimeInfoForClientPoint(clientX, clientY, timelineDragGuideContext(timeline))
	insertPotionAtMs(potionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
	return true
}

function insertQtAtMs(qtIndex, timeMs, options = {}) {
	const qt = qtInsertByIndex(qtIndex)
	if (!qt) {
		setImportError('没有找到这个 QT 控制节点')
		render()
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	insertManualQtControl(qt.name, timeMs, {
		phaseInfo,
		renderAfterInsert: false,
		enabled: qtDraftEnabledFor(qt),
		qtStates: [qtDraftStateFor(qt)],
	})
	setImportStatus(`已插入 QT：${qt.name} -> ${qtDraftEnabledFor(qt) ? '开' : '关'} 到 ${formatTime(timeMs)}`)
	render()
}

function insertQtDraftAtMs(timeMs, options = {}) {
	const changes = qtDraftChanges()
	if (!changes.length) {
		setImportError('还没有选择要变更的 QT')
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const qtStates = changes.map(change => change.qtState)
	insertManualQtControl('QT 草稿', timeMs, {
		phaseInfo,
		renderAfterInsert: false,
		enabled: qtStates.some(item => item.Enabled),
		qtStates,
	})
	state.qtDraftStates = {}
	setImportStatus(`已插入 ${changes.length} 个 QT 变更 到 ${formatTime(timeMs)}`)
}

function insertBurstQtAtVisibleTimeline(burstIndex, requestedTimeMs) {
	if (!canEditTimeline()) {
		return
	}
	const burst = burstInsertByIndex(burstIndex)
	if (!burst) {
		return
	}
	const fallbackMs = visibleTimelineCenterMs()
	const timeMs = Number.isFinite(Number(requestedTimeMs)) ? Number(requestedTimeMs) : Number(burst.timeMs ?? fallbackMs)
	const qtNames = [...new Set(burst.qt ?? [])]
	if (!qtNames.length) {
		setImportError(`${burst.name} 暂无 QT 开关`)
		render()
		return
	}
	const phaseInfo = phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	qtNames.forEach((qtName, index) => {
		insertManualQtControl(qtName, timeMs + index * 300, {phaseInfo, renderAfterInsert: false})
	})
	setImportStatus(`已插入 ${burst.name} QT 到 ${formatTime(timeMs)}`)
	render()
}

function insertManualQtControl(name, timeMs, options = {}) {
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const enabled = Boolean(options.enabled)
	const qtStates = Array.isArray(options.qtStates) && options.qtStates.length
		? options.qtStates
		: [{Name: name, Enabled: enabled}]
	state.inserted.push({
		id: `manual-qt-${Date.now()}-${state.inserted.length}`,
		name,
		timelineLabel: `QT: ${name}`,
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		kind: 'qt-control',
		source: 'manual',
		classification: 'qt',
		output: false,
		potency: 0,
		durationMs: 2500,
		count: 1,
		enabled,
		qtStates,
	})
	normalizeManualStateQueue()
	if (options.renderAfterInsert !== false) {
		render()
	}
}

function updateBurstPlannerTime(input) {
	const index = input.dataset.burstTime
	const seconds = Math.max(0, Math.round(Number(input.value ?? 0)))
	const timeMs = seconds * 1000
	const card = input.closest('.burst-window')
	const label = card?.querySelector(`[data-burst-time-label="${index}"]`)
	const button = card?.querySelector('[data-action="quick-insert-burst-qt"]')
	if (label) {
		label.textContent = formatTime(timeMs)
	}
	if (button) {
		button.dataset.burstTimeMs = String(timeMs)
	}
}

function insertBurstPackageAtVisibleTimeline(burstIndex) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const dropInfo = timeline ? timelineDropInfoForVisibleCenter(timeline) : null
	const timeMs = dropInfo?.absoluteTimeMs ?? visibleTimelineCenterMs()
	insertBurstPackageAtMs(burstIndex, timeMs, {phaseInfo: dropInfo})
}

function insertBurstPackageAtTimeline(burstIndex, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const dropLane = timelineDropLaneForTarget(event.target)
	if (!canDropBurstPackageOnTimelineLane(dropLane)) {
		setImportError('爆发包只能放到爆发行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertBurstPackageAtMs(burstIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertBurstPackageAtClientPoint(burstIndex, clientX, clientY) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		insertBurstPackageAtMs(burstIndex, visibleTimelineCenterMs())
		return
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	if (!canDropBurstPackageOnTimelineLane(dropLane)) {
		setImportError('爆发包只能放到爆发行')
		return
	}
	const dropInfo = dropTimeInfoForClientPoint(clientX, clientY, timelineDragGuideContext(timeline))
	insertBurstPackageAtMs(burstIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertBurstPackageAtMs(burstIndex, timeMs, options = {}) {
	if (!canEditTimeline()) {
		return
	}
	const burst = burstInsertByIndex(burstIndex)
	if (!burst) {
		setImportError('没有找到这个爆发包')
		render()
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const manualId = `manual-burst-${Date.now()}-${state.inserted.length}`
	state.inserted.push({
		id: manualId,
		name: burst.window === '120s' ? '120 爆发包' : '60 爆发包',
		label: burst.window === '120s' ? '120 爆发包' : '60 爆发包',
		type: 'burst-package',
		kind: 'burst-package',
		window: burst.window,
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		source: 'manual',
		sourceLabel: '用户手动',
		durationMs: Number(burst.durationMs ?? 12000),
		skillCount: burstInsertSkillNames(burst).length,
		items: Array.isArray(burst.items) ? burst.items : [],
		qt: Array.isArray(burst.qt) ? burst.qt : [],
		classification: 'burst',
		output: false,
		potency: 0,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	const timeLabel = manualInsertStatusTime(inserted ?? {timeMs, ...phaseInfo})
	setImportStatus(adjusted > 0 ? `已插入 ${burst.window === '120s' ? '120' : '60'} 爆发包，爆发窗口已顺延到 ${timeLabel}` : `已插入 ${burst.window === '120s' ? '120' : '60'} 爆发包 到 ${timeLabel}`)
	render()
}

function insertPotionAtMs(potionId, timeMs, options = {}) {
	if (!canEditTimeline()) {
		return
	}
	const potion = potionInsertById(potionId)
	if (!potion) {
		setImportError('没有找到这个爆发药')
		render()
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const manualId = `manual-potion-${Date.now()}-${state.inserted.length}`
	state.inserted.push({
		id: manualId,
		name: potion.label,
		label: potion.label,
		potionId: potion.potionId,
		attributeId: potion.attributeId,
		attributeLabel: potion.attributeLabel,
		familyLabel: potion.familyLabel,
		cnName: potion.cnName,
		actionId: 'UsePotion',
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		kind: 'potion',
		type: 'potion',
		source: 'manual',
		sourceLabel: '用户手动',
		classification: 'potion',
		output: false,
		potency: 0,
		recastMs: 270000,
		durationMs: 30000,
		count: 1,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	const adjustedByCooldown = adjusted >= 1000
	const timeLabel = manualInsertStatusTime(inserted ?? {timeMs, ...phaseInfo})
	setImportStatus(adjustedByCooldown ? `已插入 ${potion.label}，爆发药冷却已顺延到 ${timeLabel}` : `已插入 ${potion.label} 到 ${timeLabel}`)
	render()
}

function insertSkillAtMs(actionId, timeMs, options = {}) {
	if (!canEditTimeline() || !actionId) {
		return
	}
	const action = actionById(actionId)
	const name = action?.name ?? `技能 ${actionId}`
	const classification = classifyImportedAction(actionId, name, 'player-action')
	const manualId = `manual-${Date.now()}`
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	state.inserted.push({
		id: manualId,
		name,
		actionId: String(actionId),
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		kind: 'player-action',
		source: 'manual',
		target: defaultManualTargetForAction(action, classification.type),
		targetRequired: requiresManualTargetChoice(action, classification.type),
		targetMode: null,
		targetDataId: null,
		classification: classification.type,
		output: Boolean(classification.output),
		potency: classification.output ? Number(classification.potency ?? 0) : 0,
		iconUrl: action?.iconUrl ?? '',
		recastMs: Number(action?.recastMs ?? 0),
		durationMs: Number(classification.effectDurationMs ?? action?.effectDurationMs ?? 0),
		count: 1,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	const timeLabel = manualInsertStatusTime(inserted ?? {timeMs, ...phaseInfo})
	setImportStatus(adjusted > 0 ? `已插入 ${name}，队列已顺延到 ${timeLabel}` : `已插入 ${name} 到 ${timeLabel}`)
	if (options.renderAfterInsert !== false) {
		render()
	}
}

function manualInsertStatusTime(event = {}) {
	const phaseId = event.phase === 'global' ? 'all' : String(event.phase ?? '').toLowerCase()
	if (phaseId && phaseId !== 'all') {
		const phaseInfo = phaseLabelForTime(
			state.model.bossTimeline?.source,
			phaseId,
			Math.max(0, Number(event.timeMs ?? 0) - Number(event.phaseStartMs ?? 0)),
		)
		return `${phaseInfo.phaseLabel} ${formatTime(phaseInfo.phaseTimeMs)} / 全局 ${formatTime(event.timeMs ?? 0)}`
	}
	return formatTime(event.timeMs ?? event.absoluteTimeMs ?? 0)
}

function moveManualSkillAtTimeline(manualId, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	const timeMs = dropInfo.absoluteTimeMs
	item.requestedTimeMs = timeMs
	item.timeMs = timeMs
	item.phase = dropInfo.phaseId === 'all' ? 'global' : dropInfo.phaseId.toUpperCase()
	item.phaseStartMs = dropInfo.phaseId === 'all' ? undefined : timeMs - dropInfo.phaseTimeMs
	normalizeManualStateQueue()
	render()
}

function moveExistingTimelineEventAtTimeline(eventKey, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const targets = editableTimelineEventTargets(eventKey)
	if (!targets.length) {
		setImportError('没有找到可编辑的时间轴技能')
		render()
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	for (const target of targets) {
		updateTimelineEventPosition(target.event, dropInfo)
	}
	if (targets.some(target => target.event.actionId)) {
		normalizeManualStateQueue()
	}
	const target = targets[0]
	setImportStatus(`已调整 ${displayNameForAction(target.event)} 到 ${timelineEventStatusTime(target.event)}`)
	render()
}

function editableTimelineEventTargets(eventKey) {
	const [id, actionId, name, timeMs, kind, classification] = String(eventKey ?? '').split('::').map(part => decodeURIComponent(part))
	const candidates = editableTimelineEventCandidates()
	const events = candidates.filter(item =>
		String(item.id ?? '') === id
		&& String(item.actionId ?? '') === actionId
		&& String(item.name ?? item.label ?? '') === name
		&& Math.round(Number(item.timeMs ?? item.startMs ?? 0)) === Number(timeMs)
		&& String(item.kind ?? '') === kind
		&& String(item.classification ?? item.type ?? '') === classification
	)
	return events.map(event => ({event}))
}

function editableTimelineEventCandidates() {
	const track = state.model?.tracks?.expert ?? {}
	return [
		...(track.player ?? []),
		...(track.mitigation ?? []),
		...(track.qt ?? []),
		...(track.burst ?? []).flatMap(burst => burst.items ?? []),
		...(state.model?.detailPanels ?? []).flatMap(panel => panel.events ?? []),
	].filter(canEditTimelineItem)
}

function updateTimelineEventPosition(event, dropInfo) {
	const timeMs = dropInfo.absoluteTimeMs
	event.requestedTimeMs = timeMs
	event.timeMs = timeMs
	event.startMs = timeMs
	event.phase = dropInfo.phaseId === 'all' ? 'global' : dropInfo.phaseId.toUpperCase()
	event.phaseStartMs = dropInfo.phaseId === 'all' ? undefined : timeMs - dropInfo.phaseTimeMs
	if (Number(event.durationMs ?? 0) > 0) {
		event.endMs = timeMs + Number(event.durationMs)
	}
}

function timelineEventStatusTime(event = {}) {
	const phaseId = event.phase === 'global' ? 'all' : String(event.phase ?? '').toLowerCase()
	if (phaseId && phaseId !== 'all') {
		const relativeMs = Math.max(0, Number(event.timeMs ?? event.startMs ?? 0) - Number(event.phaseStartMs ?? 0))
		const phaseInfo = phaseLabelForTime(state.model.bossTimeline?.source, phaseId, relativeMs)
		return `${phaseInfo.phaseLabel} ${formatTime(phaseInfo.phaseTimeMs)} / 全局 ${formatTime(event.timeMs ?? event.startMs ?? 0)}`
	}
	return formatTime(event.timeMs ?? event.startMs ?? 0)
}

function updateManualSkillTime(manualId, secondsValue) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	const seconds = Number(secondsValue)
	if (!Number.isFinite(seconds)) {
		setImportError('时间必须是数字秒数')
		return
	}
	const clamped = clampMsToCurrentPhase(seconds * 1000)
	item.requestedTimeMs = clamped.absoluteTimeMs
	item.timeMs = clamped.absoluteTimeMs
	item.phase = clamped.phaseId === 'all' ? 'global' : clamped.phaseId.toUpperCase()
	item.phaseStartMs = clamped.phaseId === 'all' ? undefined : clamped.phaseStartMs
	normalizeManualStateQueue()
	setImportStatus(`已调整 ${item.name} 到 ${manualInsertStatusTime(item)}${hasMeaningfulCdAdjustment(item) ? '（队列已顺延）' : ''}`)
	render()
}

function updateManualSkillTarget(manualId, value) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	item.target = String(value ?? '')
	if (item.target) {
		setImportStatus(`已设置 ${item.name} 目标为 ${item.target}`)
	} else if (item.targetRequired) {
		setImportError(`${item.name} 需要指定目标`)
	}
	render()
}

function updateDetailEventTarget(detailKey, value) {
	if (!canEditTimeline()) {
		return
	}
	const target = editableDetailEventTarget(detailKey)
	if (!target?.event || !canEditDetailTarget(target.panel, target.event)) {
		return
	}
	target.event.target = String(value ?? '')
	if (target.event.target) {
		setImportStatus(`已设置 ${displayNameForAction(target.event)} 目标为 ${target.event.target}`)
	} else if (target.event.targetRequired) {
		setImportError(`${displayNameForAction(target.event)} 需要指定目标`)
	}
	render()
}

function updateDetailEventTime(manualId, secondsValue) {
	if (!canEditTimeline()) {
		return
	}
	const target = editableDetailEventTarget(manualId)
	if (!target?.event) {
		return
	}
	const seconds = Number(secondsValue)
	if (!Number.isFinite(seconds)) {
		setImportError('时间必须是数字秒数')
		return
	}
	const clamped = clampMsToCurrentPhase(seconds * 1000)
	target.event.requestedTimeMs = clamped.absoluteTimeMs
	target.event.timeMs = clamped.absoluteTimeMs
	target.event.startMs = clamped.absoluteTimeMs
	target.event.phase = clamped.phaseId === 'all' ? 'global' : clamped.phaseId.toUpperCase()
	target.event.phaseStartMs = clamped.phaseId === 'all' ? undefined : clamped.phaseStartMs
	const durationMs = Number(target.event.durationMs ?? 0)
	if (durationMs > 0) {
		target.event.endMs = clamped.absoluteTimeMs + durationMs
	}
	if (target.manual) {
		normalizeManualStateQueue()
	}
	setImportStatus(`已调整 ${displayNameForAction(target.event)} 到 ${detailEventTimeLabel(target.event)}`)
	render()
}

function editableDetailEventTarget(detailKey) {
	const parts = String(detailKey ?? '').split('::').map(part => decodeURIComponent(part))
	const [panelId, id, actionId, timeMs, indexValue] = parts
	const panel = resolveDetailPanelById(panelId)
	if (!panel) {
		return null
	}
	const events = detailPanelEvents(panel)
	const exactIndex = Number(indexValue)
	const event = events[exactIndex] ?? events.find(item =>
		String(item.manualId ?? item.id ?? '') === id
		&& String(item.actionId ?? '') === actionId
		&& Math.round(Number(item.timeMs ?? item.startMs ?? 0)) === Number(timeMs)
	)
	if (!event || !canEditDetailEvent(panel, event)) {
		return null
	}
	if (event.manualId) {
		const manual = state.inserted.find(item => item.id === event.manualId)
		if (manual) {
			return {event: manual, panel, manual: true}
		}
	}
	return {event, panel, manual: false}
}

function resolveDetailPanelById(panelId) {
	const panel = state.model.detailPanels.find(item => item.id === panelId)
	if (panel) {
		return panel
	}
	if (panelId === 'qt') {
		return virtualDetailPanel('qt', 'QT 控制', qtDetailEvents())
	}
	return null
}

function nudgeManualSkill(manualId, deltaMs) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item || !Number.isFinite(deltaMs)) {
		return
	}
	const basePhaseMs = state.phase === 'all'
		? Number(item.requestedTimeMs ?? item.timeMs ?? 0)
		: phaseRelativeMsForEvent(item)
	const clamped = clampMsToCurrentPhase(basePhaseMs + deltaMs)
	item.requestedTimeMs = clamped.absoluteTimeMs
	item.timeMs = clamped.absoluteTimeMs
	item.phase = clamped.phaseId === 'all' ? 'global' : clamped.phaseId.toUpperCase()
	item.phaseStartMs = clamped.phaseId === 'all' ? undefined : clamped.phaseStartMs
	normalizeManualStateQueue()
	setImportStatus(`已微调 ${item.name} 到 ${manualInsertStatusTime(item)}${hasMeaningfulCdAdjustment(item) ? '（队列已顺延）' : ''}`)
	render()
}

function duplicateManualSkill(manualId) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	const copy = {
		...item,
		id: `manual-${Date.now()}-${state.inserted.length}`,
		requestedTimeMs: Number(item.requestedTimeMs ?? item.timeMs ?? 0) + 1000,
		timeMs: Number(item.requestedTimeMs ?? item.timeMs ?? 0) + 1000,
		source: 'manual',
	}
	state.inserted = [...state.inserted, copy]
	normalizeManualStateQueue()
	setImportStatus(`已复制 ${copy.name} 到 ${formatTime(copy.timeMs)}${hasMeaningfulCdAdjustment(copy) ? '（队列已顺延）' : ''}`)
	render()
}

function removeManualSkill(manualId) {
	if (!canEditTimeline()) {
		return
	}
	if (!manualId) {
		return
	}
	state.inserted = state.inserted.filter(entry => entry.id !== manualId)
	normalizeManualStateQueue()
	render()
}

function timelineMsForDrop(event, timeline) {
	return timelineMsForClientPoint(event.clientX, timeline)
}

function timelineMsForClientPoint(clientX, timeline, context = null) {
	const durationMs = Number(context?.maxTime ?? 0) || timelineDurationMs(buildVisualTimelineRows(state.model.tracks.expert).filter(row => !row.html), state.model.bossTimeline?.source, state.phase)
	const rect = timeline.getBoundingClientRect()
	return timelineMsFromClientX({
		clientX,
		containerLeft: context?.trackLeft ?? rect.left,
		scrollLeft: context ? 0 : timeline.scrollLeft,
		scrollWidth: context?.trackWidth ?? timeline.scrollWidth,
		durationMs,
	})
}

function timelineDropInfoForClientX(clientX, timeline, context = null) {
	const phaseTimeMs = timelineMsForClientPoint(clientX, timeline, context)
	const phaseInfo = phaseLabelForTime(state.model.bossTimeline?.source, state.phase, phaseTimeMs)
	return {
		...phaseInfo,
		absoluteTimeMs: absoluteMsForPhaseTime(state.model.bossTimeline?.source, state.phase, phaseTimeMs),
	}
}

function findCurrentJobActionByName(name = '') {
	const normalizedName = String(name).trim()
	if (!normalizedName) {
		return null
	}
	return state.model.skillDatabase?.skills?.find(skill =>
		skill.job === state.job && (normalizedName.includes(skill.name) || skill.name.includes(normalizedName))
	) ?? null
}

function visibleTimelineCenterMs() {
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		return 90000 + state.inserted.length * 8000
	}
	return timelineDropInfoForVisibleCenter(timeline).absoluteTimeMs
}

function timelineDropInfoForVisibleCenter(timeline) {
	const rect = timeline.getBoundingClientRect()
	return timelineDropInfoForClientX(rect.left + timeline.clientWidth / 2, timeline)
}

async function importDefaultTimeline(sourceId) {
	const source = DEFAULT_TIMELINE_IMPORTS.find(item => item.id === sourceId)
	if (!source) {
		return
	}
	setImportStatus(`正在导入 ${source.label}...`)
	try {
		const response = await fetch(encodeURI(source.url))
		if (!response.ok) {
			throw new Error(`导入失败：HTTP ${response.status}`)
		}
		const timelineJson = await response.json()
		applyImportedTimeline(timelineJson, source.label)
		setImportStatus(`已导入 ${source.label}`)
	} catch (error) {
		setImportError(`导入 ${source.label} 失败：${errorMessage(error)}`)
	}
}

async function importTimelineFile(file) {
	if (!file) {
		return
	}
	setImportStatus(`正在导入 ${file.name}...`)
	try {
		const timelineJson = JSON.parse(await file.text())
		applyImportedTimeline(timelineJson, file.name)
		setImportStatus(`已导入 ${file.name}`)
	} catch (error) {
		setImportError(`导入 ${file.name} 失败：${errorMessage(error)}`)
	}
}

function applyImportedTimeline(timelineJson, sourceLabel = '本地导入') {
	const imported = buildImportedTimelineModel(timelineJson, sourceLabel)
	const model = state.model
	state.job = imported.jobId
	state.acr = imported.acrName
	state.phase = 'all'
	state.focusedSkills = imported.focusedSkills ?? []
	state.inserted = (imported.manual ?? []).map(event => ({
		...event,
		requestedTimeMs: Number(event.requestedTimeMs ?? event.timeMs ?? 0),
	}))
	normalizeManualStateQueue()
	state.currentTimelineJson = timelineJson
	model.encounter = {
		...model.encounter,
		name: imported.name,
		territoryId: imported.territoryId,
		jobId: imported.jobNumericId,
		job: imported.jobId,
		opener: imported.opener,
	}
	model.tracks.beginner = {
		...model.tracks.beginner,
		boss: imported.tracks.beginner.boss,
		mitigation: imported.tracks.beginner.mitigation,
		burst: imported.tracks.beginner.burst,
		qt: imported.tracks.beginner.qt,
	}
	model.tracks.expert = {
		...model.tracks.expert,
		boss: imported.tracks.expert.boss,
		player: imported.tracks.expert.player,
		mitigation: imported.tracks.expert.mitigation,
		burst: imported.tracks.expert.burst,
		qt: imported.tracks.expert.qt,
	}
	const acrSimulation = buildAcrSimulationForImportedJob(imported)
	model.acrSimulation = acrSimulation
	model.tracks.beginner.simulated = acrSimulation.events.slice(0, 64)
	model.tracks.expert.simulated = acrSimulation.events
	model.timelineRows = mergeImportedRowsWithBossTimeline(imported.timelineRows)
	model.detailPanels = imported.detailPanels
	model.damage.events = imported.damageEvents.length ? imported.damageEvents : model.acrSimulation.events.filter(event => event.output)
	model.shareCard = {
		...model.shareCard,
		timelineName: imported.name,
		title: '分享预览',
		subtitle: `${sourceLabel} / ${imported.jobName} / ${imported.acrName}`,
	}
	render()
}

async function loadFflogsComparison(options = {}) {
	if (!state.fflogsUrl.trim()) {
		state.fflogsError = '请输入 FFLogs 链接'
		state.fflogsStatus = ''
		render()
		return
	}
	if (!options.silent) {
		state.fflogsStatus = '正在解析 FFLogs 链接并读取本地缓存...'
		state.fflogsError = ''
		render()
	}
	try {
		const response = await fetch('/api/fflogs/compare', {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				link: state.fflogsUrl,
				currentJob: state.job,
				actorId: options.actorId ?? state.fflogsActorId,
				simulatedEvents: fflogsComparisonEvents(),
				critRate: Number(state.critRate) / 100,
				directRate: Number(state.directRate) / 100,
				luck: state.luck,
				targetGcdUtilizationPercent: Number(state.fflogsTargetGcdUtilization),
			}),
		})
		const payload = await response.json()
		if (!response.ok || payload.error) {
			throw new Error(payload.error || `HTTP ${response.status}`)
		}
		state.fflogsComparison = payload
		state.fflogsActorId = String(payload.selectedActor?.id ?? '')
		state.fflogsStatus = ''
		state.fflogsError = ''
		render()
	} catch (error) {
		state.fflogsStatus = ''
		state.fflogsError = `FFLogs 解析失败：${errorMessage(error)}`
		render()
	}
}

function setFflogsTargetGcdUtilization(value, options = {}) {
	state.fflogsTargetGcdUtilization = clampPercent(value)
	if (state.fflogsComparison) {
		loadFflogsComparison({silent: true})
	} else if (!options.silent) {
		render()
	}
}

function setImportStatus(message) {
	state.importStatus = message
	state.importError = ''
	render()
}

function setImportError(message) {
	state.importError = message
	state.importStatus = ''
	render()
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error ?? '未知错误')
}

function buildImportedTimelineModel(timelineJson, sourceLabel) {
	if (timelineJson && timelineJson.schemaVersion === 1) {
		return buildModelFromExportTimeline(timelineJson, sourceLabel)
	}
	const meta = timelineJson.Meta ?? {}
	const job = jobFromTimelineMeta(meta)
	const events = flattenImportedTimeline(timelineJson)
	const tracks = buildImportedModeTracks(events)
	const timelineRows = buildImportedTimelineRows(events)
	const damageEvents = events.filter(event => event.output)
	const openerEvents = events.filter(event => event.kind === 'player-action' && event.timeMs <= 24000)
	return {
		name: meta.Name ?? sourceLabel,
		territoryId: meta.TerritoryId ?? state.model.encounter.territoryId,
		jobId: job.id,
		jobNumericId: job.jobId,
		jobName: job.name,
		acrName: meta.AcrAuthor ?? meta.Author ?? defaultAcrForJob(job.id),
		opener: meta.Opener ?? '手动填写起手',
		events,
		tracks,
		timelineRows,
		damageEvents,
		detailPanels: [
			{id: 'mitigation', label: '减伤 / 奶轴', events: tracks.beginner.mitigation},
			{id: 'damage', label: '输出轴', events: damageEvents.slice(0, 36)},
			{id: 'potion', label: '爆发药轴', events: tracks.expert.player.filter(event => event.kind === 'potion' || /爆发药/.test(event.name))},
			{id: 'opener', label: '起手', title: meta.Opener ?? '导入起手', source: sourceLabel, events: openerEvents},
		],
	}
}

function buildModelFromExportTimeline(timelineJson, sourceLabel) {
	const meta = timelineJson.meta ?? {}
	const job = jobFromExportMeta(meta)
	const boss = importExportedEvents(timelineJson.boss ?? [], 'boss-cast')
	const player = importExportedEvents(timelineJson.player ?? [], 'player-action')
	const mitigation = importExportedEvents(timelineJson.mitigation ?? timelineJson.categories?.mitigation ?? [], 'player-action')
	const qt = Array.isArray(timelineJson.qt) ? timelineJson.qt.map(item => ({...item})) : []
	const burst = buildBurstGroupsFromExport(timelineJson.burstPackages, player)
	const manual = importExportedEvents(timelineJson.manual ?? [], 'player-action').map((event, index) => ({
		...event,
		id: event.id || `manual-${Date.now()}-${index}`,
		source: 'manual',
	}))
	const allPlayer = [...player, ...manual]
	const damageEvents = importExportedEvents(timelineJson.output ?? timelineJson.categories?.output ?? [], 'player-action')
	const openerEvents = importExportedEvents(timelineJson.opener?.events ?? [], 'player-action')
	return {
		name: meta.name ?? sourceLabel,
		territoryId: meta.territoryId ?? state.model.encounter.territoryId,
		jobId: job.id,
		jobNumericId: job.jobId,
		jobName: job.name,
		acrName: meta.acr ?? defaultAcrForJob(job.id) ?? '未指定',
		opener: timelineJson.opener?.title ?? state.model.encounter.opener ?? '手动填写起手',
		events: [...boss, ...allPlayer],
		manual,
		focusedSkills: Array.isArray(timelineJson.focusedSkills) ? timelineJson.focusedSkills.map(String) : [],
		tracks: {
			beginner: {
				boss: boss.slice(0, 18),
				mitigation: mitigation.slice(0, 16),
				burst,
				qt: qt.slice(0, 18),
			},
			expert: {
				boss,
				player: allPlayer,
				mitigation,
				burst,
				qt,
			},
		},
		timelineRows: buildImportedTimelineRows([...boss, ...allPlayer]),
		damageEvents,
		detailPanels: [
			{id: 'mitigation', label: '减伤 / 奶轴', events: mitigation},
			{id: 'damage', label: '输出轴', events: damageEvents.slice(0, 36)},
			{id: 'potion', label: '爆发药轴', events: allPlayer.filter(event => event.kind === 'potion' || event.classification === 'potion')},
			{id: 'opener', label: '起手', title: timelineJson.opener?.title ?? '导入起手', source: timelineJson.opener?.source ?? sourceLabel, events: openerEvents},
		],
	}
}

function buildAcrSimulationForImportedJob(imported = {}) {
	const baseEvents = Array.isArray(state.baseAcrSimulation?.events) ? state.baseAcrSimulation.events : []
	if (baseEvents.length && state.baseAcrSimulation?.source?.job === imported.jobId) {
		return state.baseAcrSimulation
	}
	const durationMs = importedTimelineDurationMs(imported)
	const fallbackEvents = buildFallbackAcrSimulationEvents(imported, durationMs)
	return {
		source: {
			acr: imported.acrName,
			job: imported.jobId,
			mode: '导入轴职业模拟',
			name: `${imported.acrName} ${imported.jobName} ACR 模拟输出循环`,
			generatedAt: new Date().toISOString(),
			durationMs,
			fallback: true,
		},
		events: fallbackEvents,
	}
}

function buildFallbackAcrSimulationEvents(imported = {}, durationMs = 600000) {
	const profile = acrSimulationProfileForJob(imported.jobId)
	const gcdAction = actionById(profile.gcdActionId) ?? currentJobOutputActions(imported).find(action => action.gcd || action.name === profile.gcdName)
	const dotAction = actionById(profile.dotActionId)
	const spenderAction = actionById(profile.spenderActionId)
	const ogcdActions = profile.ogcdActionIds.map(actionById).filter(Boolean)
	const events = []
	let sequence = 0
	let nextDotMs = 0
	let nextSpenderMs = profile.spenderOffsetMs
	const gcdStepMs = profile.gcdStepMs
	for (let timeMs = 0; timeMs <= durationMs; timeMs += gcdStepMs) {
		let action = gcdAction
		if (dotAction && timeMs >= nextDotMs) {
			action = dotAction
			nextDotMs = timeMs + profile.dotRefreshMs
		} else if (spenderAction && timeMs >= nextSpenderMs) {
			action = spenderAction
			nextSpenderMs = timeMs + profile.spenderIntervalMs
		}
		if (action) {
			events.push(acrSimulationEventFromAction({
				action,
				imported,
				timeMs,
				sequence: ++sequence,
				skillType: 'GCD',
				weave: 'gcd',
				potency: profile.potencyByActionId?.[String(action.id)] ?? action.potency ?? profile.defaultGcdPotency,
			}))
		}
		for (const ogcdAction of ogcdActions) {
			const intervalMs = (profile.ogcdIntervals?.[String(ogcdAction.id)] ?? Number(ogcdAction.recastMs ?? 60000)) || 60000
			const offsetMs = profile.ogcdOffsets?.[String(ogcdAction.id)] ?? 700
			if (timeMs > 0 && (timeMs - offsetMs) % intervalMs < gcdStepMs) {
				events.push(acrSimulationEventFromAction({
					action: ogcdAction,
					imported,
					timeMs: timeMs + offsetMs,
					sequence: ++sequence,
					skillType: 'oGCD',
					weave: 'ogcd',
					potency: profile.potencyByActionId?.[String(ogcdAction.id)] ?? ogcdAction.potency ?? profile.defaultOgcdPotency,
				}))
			}
		}
	}
	return events.sort((left, right) => Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0))
}

function acrSimulationEventFromAction({action, imported, timeMs, sequence, skillType, weave, potency}) {
	const phase = phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	return {
		id: `acr-${imported.jobId.toLowerCase()}-sim-${sequence}`,
		kind: 'player-action',
		source: `${imported.acrName} ACR`,
		acr: imported.acrName,
		job: imported.jobId,
		simulated: true,
		phase: phase.phaseLabel,
		phaseStartMs: Number(action.phaseStartMs ?? 0),
		timeMs,
		name: action.name,
		actionId: action.id,
		skillType,
		weave,
		target: 'target',
		classification: 'damage',
		output: true,
		potency: Number(potency ?? 0),
		durationMs: 0,
		iconUrl: action.iconUrl ?? '',
		count: 1,
	}
}

function acrSimulationProfileForJob(jobId) {
	const profiles = {
		WHM: {
			gcdActionId: 37009,
			gcdName: '闪飒',
			dotActionId: 16532,
			spenderActionId: 16535,
			ogcdActionIds: [3571],
			gcdStepMs: 2500,
			dotRefreshMs: 30000,
			spenderOffsetMs: 45000,
			spenderIntervalMs: 60000,
			defaultGcdPotency: 310,
			defaultOgcdPotency: 400,
			potencyByActionId: {
				16532: 80,
				16535: 1240,
				25859: 310,
				37009: 310,
				3571: 400,
			},
			ogcdIntervals: {
				3571: 40000,
			},
			ogcdOffsets: {
				3571: 700,
			},
		},
	}
	return profiles[jobId] ?? {
		gcdActionId: null,
		gcdName: '',
		dotActionId: null,
		spenderActionId: null,
		ogcdActionIds: [],
		gcdStepMs: 2500,
		dotRefreshMs: 30000,
		spenderOffsetMs: 60000,
		spenderIntervalMs: 60000,
		defaultGcdPotency: 300,
		defaultOgcdPotency: 450,
		potencyByActionId: {},
		ogcdIntervals: {},
		ogcdOffsets: {},
	}
}

function currentJobOutputActions(imported = {}) {
	return (state.model.skillDatabase?.skills ?? [])
		.filter(action => action.job === imported.jobId)
		.filter(action => action.output || Number(action.potency ?? 0) > 0)
}

function importedTimelineDurationMs(imported = {}) {
	const events = [
		...(imported.tracks?.expert?.boss ?? []),
		...(imported.tracks?.expert?.player ?? []),
		...(imported.tracks?.expert?.mitigation ?? []),
	]
	const eventDurationMs = Math.max(...events.map(event => Number(event.timeMs ?? event.startMs ?? 0) + Number(event.durationMs ?? 0)), 0)
	const bossDurationMs = Number(state.model?.bossTimeline?.source?.lastSecond ?? 0) * 1000
	return Math.max(eventDurationMs, bossDurationMs, 600000)
}

function jobFromExportMeta(meta = {}) {
	const jobId = String(meta.job ?? '').toUpperCase()
	const numericId = Number(meta.jobId ?? 0)
	return state.model.acrDatabase.jobs.find(job => job.id === jobId)
		?? state.model.acrDatabase.jobs.find(job => Number(job.jobId) === numericId)
		?? state.model.acrDatabase.jobs.find(job => job.id === state.job)
		?? state.model.acrDatabase.jobs[0]
}

function importExportedEvents(events = [], fallbackKind = 'player-action') {
	return (Array.isArray(events) ? events : []).map((event, index) => {
		const action = actionById(event.actionId)
		const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
		const durationMs = importedEventDurationMs(event, action, fallbackKind)
		const classification = event.classification ?? action?.type ?? 'unknown'
		const targetRequired = Boolean(event.targetRequired ?? requiresManualTargetChoice(action, classification))
		return {
			id: event.id || `export-${fallbackKind}-${index}`,
			phase: event.phase ?? 'global',
			phaseStartMs: event.phaseStartMs,
			timeMs,
			kind: event.kind ?? fallbackKind,
			name: event.name ?? event.label ?? action?.name ?? '未命名技能',
			timelineLabel: event.timelineLabel ?? '',
			source: event.source ?? '导入',
			actionId: event.actionId ?? '',
			target: event.target ?? '',
			targetRequired,
			targetMode: event.targetMode ?? null,
			targetDataId: event.targetDataId ?? null,
			classification,
			output: Boolean(event.output ?? action?.output),
			potency: Number(event.potency ?? action?.potency ?? 0),
			damage: Number(event.damage ?? 0),
			durationMs,
			castDurationMs: event.castDurationMs ?? durationMs,
			iconUrl: event.iconUrl ?? action?.iconUrl ?? '',
			count: Number(event.count ?? 1),
		}
	})
}

function importedEventDurationMs(event = {}, action = null, fallbackKind = 'player-action') {
	const explicitDurationMs = Number(event.durationMs ?? 0)
	if (explicitDurationMs > 0) {
		return explicitDurationMs
	}
	const startMs = Number(event.startMs ?? event.timeMs ?? 0)
	const inferredDurationMs = Math.max(0, Number(event.endMs ?? startMs) - startMs)
	if (inferredDurationMs > 0) {
		return inferredDurationMs
	}
	if (fallbackKind === 'boss-cast') {
		return 0
	}
	return Number(action?.effectDurationMs ?? 0) || 0
}

function buildBurstGroupsFromExport(burstPackages, playerEvents) {
	if (Array.isArray(burstPackages) && burstPackages.length) {
		return burstPackages.map(packageItem => {
			const startMs = Number(packageItem.startMs ?? 0)
			const inferredDurationMs = Math.max(0, Number(packageItem.endMs ?? 0) - startMs)
			const durationMs = Number(packageItem.durationMs ?? inferredDurationMs) || 12000
			return {
				window: packageItem.window ?? (String(packageItem.label ?? '').includes('120') ? '120s' : '60s'),
				name: packageItem.label ?? (packageItem.window === '120s' ? '120 爆发' : '60 爆发'),
				timeMs: startMs,
				durationMs,
				source: 'import',
				sourceLabel: packageItem.sourceLabel ?? '导入',
				qt: [],
				items: packageItem.expandedItems ?? [],
			}
		})
	}
	return buildImportedBurstGroups(playerEvents)
}

function flattenImportedTimeline(timelineJson) {
	const bossCasts = collectBossCastItems(state.model.timelineRows)
	const {events} = flattenPrTimeline(timelineJson, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, bossCasts),
		shouldBlockOnUnresolvedCondition: ({conditions}) => conditions.some(isBlockingImportedCondition),
		delayEvent: ({node, durationMs}) => ({
			kind: 'delay',
			name: node.Name ?? '延迟',
			source: 'timeline',
			durationMs,
		}),
		conditionEvent: ({node, condition}) => {
			const isCast = condition?.Type === 'CastStart'
			const actionId = condition?.ActionId ?? condition?.Regex
			const duration = parseCastDuration(node.Name)
			return {
				kind: isCast ? 'boss-cast' : condition?.Type === 'Weather' ? 'phase-sync' : 'condition',
				name: cleanImportedName(node.Name),
				source: 'boss',
				actionId,
				damage: isCast ? BOSS_DAMAGE_HINTS.get(String(actionId)) ?? 0 : 0,
				castDurationMs: duration,
				castStartLabel: isCast ? '读条' : '',
				castEndLabel: isCast ? '结束' : '',
			}
		},
		actionEvents: ({node, action}) => {
			const actionId = action.ActionId ?? action.Type
			const kind = action.Type === 'BatchTriggerQt' ? 'qt-control' : action.Type === 'UsePotion' ? 'potion' : 'player-action'
			const name = importedActionName(node.Name, action)
			const classification = classifyImportedAction(actionId, name, kind)
			const actionRecord = Number(actionId) ? actionById(actionId) : null
			const timelineLabel = cleanImportedName(node.Name)
			return [{
				kind,
				name,
				timelineLabel: timelineLabel === name ? '' : timelineLabel,
				source: 'timeline',
				actionId,
				target: action.Target ?? '',
				targetMode: action.TargetMode ?? null,
				targetDataId: action.TargetDataId ?? null,
				targetRequired: requiresManualTargetChoice(actionRecord, classification.type),
				highPriority: Boolean(action.HighPriority),
				skillType: action.SkillType ?? action.Type,
				qtStates: action.QtStates ?? [],
				classification: classification.type,
				output: classification.output,
				potency: classification.potency,
				durationMs: classification.effectDurationMs ?? 0,
				iconUrl: actionRecord?.iconUrl ?? '',
				count: 1,
			}]
		},
	})
	return normalizePhaseTaggedEvents(events, state.model.bossTimeline?.source)
}

function isBlockingImportedCondition(condition = {}) {
	return String(condition.Type ?? '').toLowerCase() === 'caststart'
}

function buildImportedModeTracks(events) {
	const boss = events.filter(event => event.kind === 'boss-cast')
	const player = events.filter(event => ['player-action', 'potion', 'qt-control'].includes(event.kind))
	const mitigation = player.filter(event => event.classification === 'mitigation' || event.classification === 'healing')
	const burst = buildImportedBurstGroups(player)
	return {
		beginner: {
			boss: boss.filter((_, index) => index % 2 === 0).slice(0, 18),
			mitigation: mitigation.slice(0, 16),
			burst,
			qt: collectImportedQtControls(player).slice(0, 18),
		},
		expert: {
			boss,
			player,
			mitigation,
			burst,
			qt: collectImportedQtControls(player),
		},
	}
}

function buildImportedTimelineRows(events) {
	const playerActions = events
		.filter(event => event.kind === 'player-action')
		.filter(event => !isCoverageTimelineEvent(event))
		.map(event => importedActionItem(event, 'action'))
	const mitigationActions = events
		.filter(event => event.kind === 'player-action')
		.filter(isCoverageTimelineEvent)
		.map(event => importedActionItem(event, 'action'))
	const qtPotion = events
		.filter(event => event.kind === 'qt-control' || event.kind === 'potion')
		.map(event => importedActionItem(event, event.kind === 'potion' ? 'potion' : 'qt'))
	return [
		{id: 'player-actions', label: 'Player Actions', accent: 'mint', items: playerActions.slice(0, 160)},
		{id: 'mitigation-actions', label: '减伤 / 奶轴', accent: 'mint', items: mitigationActions.slice(0, 160)},
		{id: 'qt-potion', label: 'QT / Potion', accent: 'violet', items: qtPotion.slice(0, 80)},
		{id: 'manual-insert', label: 'Manual Insert', accent: 'orange', items: []},
	]
}

function mergeImportedRowsWithBossTimeline(importedRows) {
	const bossRows = (state.model.timelineRows ?? []).filter(row => {
		const id = row.groupId ?? row.id
		return id === 'boss-casts' || id === 'boss-damage'
	})
	return [...bossRows, ...importedRows]
}

function buildImportedBurstGroups(playerEvents) {
	const burstEvents = playerEvents.filter(event => event.kind === 'potion' || event.kind === 'qt-control' || /爆发药|爆发|弗雷|血乱|倾泻/.test(event.name))
	const windows = []
	for (let startMs = 0; startMs <= Math.max(180000, ...burstEvents.map(event => event.timeMs)); startMs += 60000) {
		const items = burstEvents.filter(event => event.timeMs >= startMs && event.timeMs < startMs + 60000)
		windows.push({
			window: startMs % 120000 === 0 ? '120s' : '60s',
			name: startMs % 120000 === 0 ? '120 爆发' : '60 爆发',
			timeMs: startMs,
			qt: items.slice(0, 5).map(event => event.name),
		})
	}
	return windows.slice(0, 8)
}

function collectImportedQtControls(events) {
	const controls = []
	for (const event of events) {
		if (event.kind === 'qt-control' && event.qtStates?.length) {
			for (const item of event.qtStates) {
				controls.push({
					name: item.Name,
					enabled: Boolean(item.Enabled),
					timeMs: event.timeMs,
				})
			}
		}
	}
	return controls
}

function importedActionItem(event, fallbackType) {
	const durationMs = Number(event.durationMs ?? 0) > 0 ? Number(event.durationMs) : fallbackType === 'qt' ? 2500 : 1600
	const type = event.classification === 'dot'
		? 'dot'
		: event.classification === 'mitigation' || event.classification === 'healing' ? event.classification : fallbackType
	const label = displayNameForAction(event)
	return {
		id: event.id,
		type,
		label,
		timelineLabel: event.timelineLabel || (label !== event.name ? event.name : ''),
		startMs: event.timeMs,
		endMs: event.timeMs + durationMs,
		timeLabel: formatTime(event.timeMs),
		actionId: event.actionId,
		potency: event.potency ?? 0,
		target: event.target,
		durationMs,
		classification: event.classification,
		iconUrl: event.iconUrl ?? '',
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
	}
}

function exportTimeline() {
	const payload = buildExportTimelineFromState()
	const fileName = `${state.model.encounter.name ?? 'webtimeline'}-${state.job}.json`
	const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'})
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = sanitizeFileName(fileName)
	document.body.append(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

function buildExportTimelineFromState() {
	const track = state.model.tracks.expert
	const meta = {
		name: state.model.encounter.name,
		territoryId: state.model.encounter.territoryId,
		job: state.job || 'unknown',
		jobId: state.model.encounter.jobId ?? '',
		acr: state.acr || '未指定',
		source: 'WebTimeline',
		exportedAt: new Date().toISOString(),
	}
	return {
		schemaVersion: 1,
		meta: {
			...meta,
		},
		phases: exportPhaseWindows(state.model.bossTimeline?.source),
		boss: exportBossTimeline(track),
		player: exportPlayerTimeline(track),
		mitigation: exportEventList(track.mitigation ?? []),
		output: exportEventList((state.model.damage.events ?? []).filter(event => event.output)),
		burstPackages: buildBurstPackageItems(track.burst ?? []),
		qt: exportQtControls(track),
		opener: exportOpenerEvents(),
		focusedSkills: [...state.focusedSkills],
		manual: state.inserted.map(exportTimelineEvent),
		categories: exportTimelineCategories(track),
		Meta: {
			Name: state.model.encounter.name,
			TerritoryId: state.model.encounter.territoryId,
			Job: String(state.model.encounter.jobId ?? ''),
			JobId: state.model.encounter.jobId,
			Author: state.acr,
			AcrAuthor: state.acr,
			Opener: state.model.encounter.opener,
		},
		Root: {
			Name: 'WebTimeline 导出',
			Type: 'folder',
			Children: state.inserted.map(item => ({
				Name: item.name,
				Type: 'action',
				Actions: [exportTimelineActionNode(item)],
			})),
		},
	}
}

function exportTimelineActionNode(item = {}) {
	if (item.kind === 'qt-control') {
		return {
			Type: 'BatchTriggerQt',
			QtStates: item.qtStates ?? [{Name: item.name, Enabled: Boolean(item.enabled)}],
		}
	}
	if (item.type === 'burst-package' || item.kind === 'burst-package') {
		return {
			Type: 'Group',
			Name: item.name ?? item.label ?? '爆发包',
		}
	}
	return {
		Type: 'Action',
		ActionId: Number(item.actionId),
		Target: exportTargetForEvent(item),
		TargetMode: item.targetMode ?? null,
		TargetDataId: item.targetDataId ?? null,
	}
}

function exportPhaseWindows(bossSource = null) {
	return phaseOptions(bossSource).map(phase => ({...phase}))
}

function exportBossTimeline(track) {
	return exportEventList(track.boss ?? [])
}

function exportPlayerTimeline(track) {
	return exportEventList([...(track.player ?? []), ...state.inserted])
}

function exportQtControls(track) {
	return Array.isArray(track.qt) ? track.qt.map(item => ({...item})) : []
}

function exportOpenerEvents() {
	const openerPanel = state.model.detailPanels.find(panel => panel.id === 'opener')
	return {
		title: openerPanel?.title ?? state.model.encounter.opener ?? '手动起手',
		source: openerPanel?.source ?? 'WebTimeline',
		events: exportEventList(openerPanel?.events ?? []),
	}
}

function exportTimelineCategories(track) {
	return {
		mitigation: exportEventList(track.mitigation ?? []),
		output: exportEventList((track.player ?? []).filter(event => event.output)),
		potion: exportEventList((track.player ?? []).filter(event => event.kind === 'potion' || event.classification === 'potion')),
		manual: state.inserted.map(exportTimelineEvent),
	}
}

function exportEventList(events = []) {
	return events.map(exportTimelineEvent)
}

function exportTimelineEvent(event = {}) {
	const name = displayNameForAction(event)
	return {
		id: event.id ?? '',
		phase: event.phase ?? 'global',
		phaseStartMs: event.phaseStartMs,
		timeMs: Number(event.timeMs ?? event.startMs ?? 0),
		requestedTimeMs: Number(event.requestedTimeMs ?? event.timeMs ?? event.startMs ?? 0),
		cdAdjustedMs: Number(event.cdAdjustedMs ?? 0),
		recastMs: Number(event.recastMs ?? 0),
		durationMs: Number(event.durationMs ?? Math.max(0, Number(event.endMs ?? 0) - Number(event.startMs ?? 0)) ?? 0),
		kind: event.kind ?? event.type ?? 'player-action',
		name,
		timelineLabel: event.timelineLabel || (name !== (event.name ?? event.label) ? (event.name ?? event.label ?? '') : ''),
		source: event.source ?? '导入',
		actionId: event.actionId ?? '',
		target: exportTargetForEvent(event),
		targetRequired: Boolean(event.targetRequired),
		targetMode: event.targetMode ?? null,
		targetDataId: event.targetDataId ?? null,
		classification: event.classification ?? event.type ?? 'unknown',
		output: Boolean(event.output),
		potency: Number(event.potency ?? 0),
		damage: Number(event.damage ?? 0),
		iconUrl: event.iconUrl ?? '',
		attributeId: event.attributeId ?? '',
		enabled: Boolean(event.enabled),
		qtStates: Array.isArray(event.qtStates) ? event.qtStates : [],
	}
}

function exportTargetForEvent(event = {}) {
	if (event.target) {
		return event.target
	}
	if (isOutputTimelineEvent(event) && !event.target) {
		return 'Target'
	}
	return ''
}

function jobFromTimelineMeta(meta = {}) {
	const jobId = Number(meta.JobId ?? meta.Job)
	return state.model.acrDatabase.jobs.find(job => Number(job.jobId) === jobId)
		?? state.model.acrDatabase.jobs.find(job => job.id === state.job)
		?? state.model.acrDatabase.jobs[0]
}

function defaultAcrForJob(jobId) {
	const job = state.model.acrDatabase.jobs.find(item => item.id === jobId)
	return job?.acrs.find(acr => acr.enabled)?.name ?? job?.acrs[0]?.name ?? ''
}

function classifyImportedAction(actionId, fallbackName = '', kind = 'player-action') {
	if (kind === 'potion') {
		return {type: 'potion', output: false, potency: 0, effectDurationMs: 0}
	}
	if (kind === 'qt-control') {
		return {type: 'qt', output: false, potency: 0, effectDurationMs: 0}
	}
	const action = actionById(actionId)
	const text = `${fallbackName} ${action?.name ?? ''}`
	if (action) {
		const result = {
			type: action.type ?? 'utility',
			output: Boolean(action.output),
			potency: Number(action.potency ?? 0),
			effectDurationMs: Number(action.effectDurationMs ?? 0),
		}
		return enhanceImportedClassification(result, text)
	}
	return fallbackImportedClassification(text)
}

function enhanceImportedClassification(result, text = '') {
	if (result.type !== 'utility' || result.effectDurationMs > 0 || result.output || result.potency > 0) {
		return result
	}
	return fallbackImportedClassification(text)
}

function fallbackImportedClassification(text = '') {
	if (/爆发药/.test(text)) {
		return {type: 'potion', output: false, potency: 0, effectDurationMs: 0}
	}
	if (/持续伤害|dot|灾变|毒菌|烈风|闪雷|彼岸花|樱花怒放|狂风蚀箭/i.test(text)) {
		return {type: 'dot', output: true, potency: 0, effectDurationMs: 30000}
	}
	if (/水流幕/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 8000}
	}
	if (/神祝祷|全大赦|神爱抚/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 10000}
	}
	if (/节制/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 20000}
	}
	if (/庇护/.test(text)) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs: 24000}
	}
	if (/礼仪之铃/.test(text)) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs: 20000}
	}
	if (/治疗|回复|恢复|再生|铃|幕帘|医济|愈疗|天赐/.test(text)) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs: 15000}
	}
	if (/减伤|铁壁|雪仇|黑盾|献奉|暗影墙|暗影卫|布道|行尸|无敌|防护|罩/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 10000}
	}
	return {type: 'utility', output: false, potency: 0, effectDurationMs: 0}
}

function importedActionName(nodeName = '', action) {
	if (action.Type === 'BatchTriggerQt') {
		return cleanImportedName(nodeName)
	}
	if (action.Type === 'UsePotion') {
		return '爆发药'
	}
	const actionId = Number(action.ActionId)
	return ACTION_LABELS.get(actionId) || actionById(actionId)?.name || `技能 ${action.ActionId}`
}

function cleanImportedName(name = '') {
	return String(name).replace(/\s*读条时间:.*/, '').replace(/\s*\[.*?\]/g, '').trim() || '事件'
}

function parseCastDuration(name = '') {
	const match = /读条时间:(\d+(?:\.\d+)?)/.exec(name)
	return match ? Math.round(Number(match[1]) * 1000) : 4700
}

function first(value) {
	return Array.isArray(value) ? value[0] : value
}

function normalizeSearchText(value = '') {
	return String(value).trim().toLowerCase()
}

function formatGeneratedAt(value = '') {
	if (!value) {
		return '本地生成'
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString('zh-CN')
}

function sanitizeFileName(value = '') {
	return String(value).replace(/[\\/:*?"<>|]/g, '_')
}

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function updateDamage() {
	const events = [...state.model.damage.events, ...state.inserted.filter(event => event.output)]
	const result = estimateDamage(events, {
		attackPower: 120,
		critRate: Number(state.critRate) / 100,
		directRate: Number(state.directRate) / 100,
		luck: state.luck,
	})
	const totalTarget = document.querySelector('[data-damage-total]')
	const phaseTarget = document.querySelector('[data-phase-damage]')
	if (!totalTarget || !phaseTarget) {
		return
	}
	totalTarget.textContent = result.total.toLocaleString('zh-CN')
	phaseTarget.innerHTML = Object.entries(result.phases).map(([phase, data]) => `
		<div>
			<span>${phase}</span>
			<strong>${data.damage.toLocaleString('zh-CN')}</strong>
			<small>${data.events} 技能</small>
		</div>
	`).join('')
}

function estimateDamage(events, profile) {
	const attackPower = Number(profile.attackPower ?? 100)
	const critRate = Math.min(1, Math.max(0, Number(profile.critRate ?? 0.15)))
	const directRate = Math.min(1, Math.max(0, Number(profile.directRate ?? 0.25)))
	const luckBonus = profile.luck === 'lucky' ? 0.22 : profile.luck === 'low' ? -0.12 : 0
	const multiplier = (1 + critRate * 0.45) * (1 + directRate * 0.25) * (1 + luckBonus)
	const phases = {}
	let total = 0

	for (const event of events) {
		const damage = Math.round(Number(event.potency ?? 0) * Number(event.count ?? 1) * attackPower * multiplier)
		const phase = event.phase ?? '手动'
		phases[phase] ??= {damage: 0, events: 0}
		phases[phase].damage += damage
		phases[phase].events += 1
		total += damage
	}
	return {total, phases}
}

function formatTime(ms = 0) {
	const total = Math.max(0, Math.round(ms / 1000))
	const minutes = Math.floor(total / 60)
	const seconds = String(total % 60).padStart(2, '0')
	return `${minutes}:${seconds}`
}

function formatDuration(ms = 0) {
	const seconds = Math.max(0, Math.round(Number(ms ?? 0) / 1000))
	return `${seconds}s`
}

function formatDamage(value = 0) {
	const damage = Math.round(Number(value ?? 0))
	return damage.toLocaleString('zh-CN')
}

function formatMetricValue(value = 0, type = 'damage') {
	if (type === 'percent') {
		return `${formatNumber(value, 1)}%`
	}
	if (type === 'count') {
		return Math.round(Number(value ?? 0)).toLocaleString('zh-CN')
	}
	return formatDamage(value)
}

function formatSignedDamage(value = 0) {
	const number = Math.round(Number(value ?? 0))
	return `${number >= 0 ? '+' : '-'}${Math.abs(number).toLocaleString('zh-CN')}`
}

function formatSignedInteger(value = 0) {
	const number = Math.round(Number(value ?? 0))
	return `${number >= 0 ? '+' : '-'}${Math.abs(number).toLocaleString('zh-CN')}`
}

function formatSignedNumber(value = 0, digits = 0) {
	const number = Number(value ?? 0)
	return `${number >= 0 ? '+' : '-'}${Math.abs(number).toFixed(digits)}`
}

function formatNumber(value = 0, digits = 0) {
	return Number(value ?? 0).toFixed(digits)
}

function clampPercent(value, min = 50, max = 100) {
	const number = Number(value)
	if (!Number.isFinite(number)) {
		return max
	}
	return Math.min(max, Math.max(min, Math.round(number * 10) / 10))
}
