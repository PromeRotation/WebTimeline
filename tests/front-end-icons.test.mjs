import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

test('front-end app script is syntactically valid JavaScript', async () => {
	await execFileAsync(process.execPath, ['--check', 'public/app.js'])
})

test('front-end no longer renders the old onboarding overlay', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.doesNotMatch(appSource, /webtimelineOnboardingDone/)
	assert.doesNotMatch(appSource, /state\.onboarding/)
	assert.doesNotMatch(appSource, /renderOnboarding/)
	assert.doesNotMatch(appSource, /skip-onboarding|next-onboarding/)
	assert.doesNotMatch(appSource, /onboarding\./)
	assert.doesNotMatch(css, /\.onboarding\b/)
})

test('front-end skill icons do not override DK actions with ACR icon assets', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.equal(appSource.includes('PixelHotkeysV4_BigCutePinkOrange'), false)
	assert.equal(appSource.includes('/resources/acr-packages/'), false)
	assert.equal(appSource.includes('/kano-source/Resources/'), false)
	assert.equal(appSource.includes('iconMap'), false)
	assert.match(appSource, /function renderIcon\([^)]*explicitUrl/)
	assert.match(appSource, /src="\$\{explicitUrl\}"/)
})

test('timeline action labels use real action names while preserving original timeline text', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function displayNameForAction\(/)
	assert.match(appSource, /ACTION_LABELS\.get\(actionId\)/)
	assert.match(appSource, /timelineLabel:\s*event\.timelineLabel \|\| \(label !== event\.name \? event\.name : ''\)/)
	assert.match(appSource, /\u539f\u8f74\uff1a/)
	assert.match(appSource, /timelineLabel \? `\$\{t\('meta\.originalAxis'\)\}\$\{timelineLabel\}` : ''/)
})

test('timeline skill names use localized database names via localizedActionName', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function localizedActionName\(/)
	assert.match(appSource, /function bossActionDisplayName\(/)
	assert.match(appSource, /ACTION_LABELS\.get\(id\)\n\t\t\?\? actionById\(id\)\?\.name/)
	// displayNameForAction must prioritize localized database name over event.name for player skills
	assert.match(appSource, /const localized = localizedActionName\(actionId, ''\)/)
	assert.match(appSource, /if \(localized\) \{[\s\S]*?return localized/)
	// boss casts strip axis annotations like P1死刑 / 半场刀 / 死刑 prefixes
	assert.match(appSource, /\(\?:\u6b7b\u5211|\u534a\u573a\u5200|\u534a\u573a|\u5f00\u542f|\u5173\u95ed|\u5173\u7206\u53d1|\u5173\u7206\)/)
	// boss cast display uses itemLabel not item.label
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))
	assert.match(itemSource, /<span class="cast-name">\$\{itemLabel\}<\/span>/)
	// original axis name preserved in tooltip via timelineLabel
	assert.match(itemSource, /\[itemLabel, timelineLabel \? `\\u539f\\u8f74\\uff1a\$\{timelineLabel\}` : ''/)
})

test('front-end renders mitigation, healing and DoT timeline items as duration bars', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function coverageItemType\(/)
	assert.match(appSource, /event\.classification === 'mitigation'/)
	assert.match(appSource, /event\.classification === 'healing'/)
	assert.match(appSource, /function isDotTimelineEvent\(/)
	assert.match(appSource, /classification === 'dot'/)
	assert.match(appSource, /item\.type === `dot`/)
	assert.match(appSource, /type:\s*'dot'/)
	assert.match(appSource, /id:\s*'mitigation-actions'/)
	assert.match(appSource, /labelKey:\s*'overview\.mitigation'/)
	assert.match(css, /\.xiva-item\.mitigation\s*\{/)
	assert.match(css, /\.xiva-item\.healing\s*\{/)
	assert.match(css, /\.xiva-item\.dot\s*\{/)
})

test('mitigation phase rows dedupe imported duplicate actions by action and time', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function uniqueTimelineDisplayEvents\(/)
	assert.match(appSource, /function timelineDisplayEventKey\(/)
	assert.match(appSource, /function filterCooldownConflictingTimelineItems\(/)
	assert.match(appSource, /function uniqueDetailDisplayEvents\(/)
	assert.match(appSource, /function detailDisplayEventKey\(/)
	assert.match(appSource, /const imported = filterCooldownConflictingTimelineItems\(uniqueTimelineDisplayEvents\(\[\.\.\.mitigationItems, \.\.\.manualItems\]\)\)/)
	assert.match(appSource, /return sortTimelineItems\(uniqueTimelineDisplayEvents\(\[\.\.\.imported, \.\.\.simulatedItems\]\)\)/)
	assert.match(appSource, /const recastMs = Number\(event\.recastMs \?\? actionById\(actionId\)\?\.recastMs \?\? 0\)/)
	assert.match(appSource, /return uniqueDetailDisplayEvents\(detailEventsForCurrentPhase\(uniqueDetailEvents\(/)
	assert.match(appSource, /event\.manualId \? `manual:\$\{event\.manualId\}`/)
	assert.match(appSource, /Math\.round\(Number\(event\.timeMs \?\? event\.startMs \?\? 0\)\)/)
})

test('front-end filters phase rows before applying visible item limits', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function limitVisibleTimelineRowItems\(/)
	assert.match(appSource, /const simulated = state\.showAcrSimulation\s*\?\s*\(track\.simulated \?\? state\.model\.acrSimulation\?\.events \?\? \[\]\)\s*:\s*\[\]/)
	assert.doesNotMatch(appSource, /track\.simulated \?\? state\.model\.acrSimulation\?\.events \?\? \[\]\)\.slice\(0,\s*420\)/)
	assert.match(appSource, /timelineRowsForPhase\(rows, state\.model\.bossTimeline\?\.source, state\.phase\)\s*\.map\(limitVisibleTimelineRowItems\)/)
	assert.match(appSource, /phaseStartMs:\s*event\.phaseStartMs/)
})

test('imported non-DRK timelines receive current job ACR simulation fallback', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function buildAcrSimulationForImportedJob\(/)
	assert.match(appSource, /const acrSimulation = buildAcrSimulationForImportedJob\(imported\)/)
	assert.match(appSource, /model\.acrSimulation = acrSimulation/)
	assert.match(appSource, /model\.tracks\.expert\.simulated = acrSimulation\.events/)
	assert.match(appSource, /action\.job === imported\.jobId/)
	assert.match(appSource, /source:\s*`\$\{imported\.acrName\} ACR`/)
	assert.match(appSource, /simulated:\s*true/)
	assert.match(appSource, /classification:\s*'damage'/)
	assert.match(appSource, /output:\s*true/)
	assert.doesNotMatch(appSource, /imported\.jobId === 'DRK' && state\.baseAcrSimulation/)
	assert.doesNotMatch(appSource, /events:\s*\[\]\}/)
})

test('ACR simulated row filters mitigation and healing into the mitigation lane', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const buildRows = appSource.slice(appSource.indexOf('function buildVisualTimelineRows('), appSource.indexOf('function buildOutputLaneItems('))
	const mitigationLaneSource = appSource.slice(appSource.indexOf('function buildMitigationLaneItems('), appSource.indexOf('function buildBurstLaneItems('))

	// buildVisualTimelineRows must split simulated into output and mitigation
	assert.match(buildRows, /const simulatedMitigation = simulated\.filter\(event => isCoverageTimelineEvent\(event\) \|\| timelineFunctionalLane\(event\) === 'mitigation'\)/)
	assert.match(buildRows, /const simulatedOutput = simulated\.filter\(event => !isCoverageTimelineEvent\(event\) && timelineFunctionalLane\(event\) !== 'mitigation'\)/)
	// acr-simulated row must use simulatedOutput, not the raw simulated list
	assert.match(buildRows, /id:\s*'acr-simulated',\s*label:\s*t\('rail\.acrSim'\),\s*accent:\s*'sky',\s*items:\s*simulatedOutput\.map/)
	assert.doesNotMatch(buildRows, /items:\s*simulated\.map\(event => timelineItemForEvent/)
	// mitigation row must receive simulatedMitigation as the third argument
	assert.match(buildRows, /buildMitigationLaneItems\(mitigation,\s*manual,\s*simulatedMitigation\)/)
	// buildMitigationLaneItems must accept simulatedCoverage and map it with simulated: true
	assert.match(mitigationLaneSource, /function buildMitigationLaneItems\(mitigation = \[\], manual = \[\], simulatedCoverage = \[\]\)/)
	assert.match(mitigationLaneSource, /const simulatedItems = simulatedCoverage/)
	assert.match(mitigationLaneSource, /\.map\(event => timelineItemForEvent\(event, \{defaultType: 'action', simulated: true\}\)\)/)
})

test('front-end exposes editor workflow controls without overflowing panels', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /showFocusPicker/)
	assert.match(appSource, /renderFocusSkillModal\(/)
	assert.match(appSource, /data-action="open-focus-picker"/)
	assert.equal(appSource.includes('focus-picker-row'), false)
	assert.match(appSource, /state\.editorMode/)
	assert.match(appSource, /data-field="editor-mode"/)
	assert.match(appSource, /draggable="\$\{draggable \? 'true' : 'false'\}"/)
	assert.match(appSource, /renderAcrModal\(/)
	assert.match(appSource, /data-action="open-acr-database"/)
	assert.match(appSource, /data-action="import-timeline"/)
	assert.match(appSource, /data-action="export-timeline"/)
	assert.match(appSource, /type="file"[^>]*data-field="timeline-import"/)
	assert.match(appSource, /renderBurstGroupsInDetailPanel\(/)
	assert.match(css, /\.panel-tabs\s*\{[^}]*flex-wrap:\s*wrap/s)
	assert.match(css, /\.panel-tabs\s*\{[^}]*grid-template-columns/s)
	assert.match(css, /\.modal-backdrop\s*\{/)
	assert.match(css, /\.acr-dock\s*\{[^}]*width:\s*auto/s)
	assert.equal(appSource.includes('完整时间轴、爆发整合、技能插入和关注技能放在同一个工作台'), false)
	assert.equal(appSource.includes('<p class="eyebrow">\u7edf\u4e00\u7f16\u8f91\u5668</p>'), false)
})

test('share preview labels use the current timeline name instead of the mode name', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /model\.shareCard\.timelineName/)
	assert.match(appSource, /timelineName:\s*imported\.name/)
	assert.doesNotMatch(appSource, /<p class="eyebrow">个人展示模式<\/p>/)
	assert.doesNotMatch(appSource, /title:\s*`\$\{imported\.name\} 分享预览`/)
})

test('tools are integrated into the main editor instead of fixed side rails', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const renderBody = appSource.match(/function render\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''

	assert.doesNotMatch(renderBody, /renderSidebar\(/)
	assert.doesNotMatch(renderBody, /renderInspector\(/)
	assert.match(renderBody, /state\.section === 'tools' \? renderToolPanel\(model\) : renderUnifiedEditor\(model\)/)
	assert.match(appSource, /function renderCompactNav\(/)
	assert.match(appSource, /function renderToolPanel\(/)
	assert.match(appSource, /section:\s*'timeline'/)
	assert.match(appSource, /data-section="tools"/)
	assert.match(appSource, /data-section="timeline"/)
	assert.match(appSource, /<p class="eyebrow">\$\{t\('tool\.eyebrow'\)\}<\/p>/)
	assert.match(css, /\.app-shell\s*\{[^}]*grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/s)
	assert.match(css, /\.tool-grid\s*\{[^}]*grid-template-columns:/s)
	assert.match(css, /\.compact-nav\s*\{/)
})

test('tools panel keeps FFLogs comparison and removes placeholder import source cards', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const modelSource = await readFile('src/app-model.mjs', 'utf8')
	const prototype = await readFile('public/data/prototype.json', 'utf8')

	assert.match(appSource, /function renderFflogsComparisonPanel\(/)
	assert.match(appSource, /renderFflogsComparisonPanel\(model\)/)
	assert.doesNotMatch(appSource, /model\.importSources/)
	assert.doesNotMatch(appSource, /白轴存储/)
	assert.doesNotMatch(appSource, /class="white-shaft"/)
	assert.doesNotMatch(appSource, /class="source-row"/)
	assert.doesNotMatch(css, /\.white-shaft/)
	assert.doesNotMatch(css, /\.source-row/)
	assert.doesNotMatch(modelSource, /importSources/)
	assert.doesNotMatch(prototype, /"importSources"/)
})

test('FFLogs comparison sends the full current player axis to the server', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function renderFflogsComparisonPanel\(/)
	assert.match(appSource, /function loadFflogsComparison\(/)
	assert.match(appSource, /function fflogsComparisonEvents\(/)
	assert.match(appSource, /function renderDamageAdjustmentBreakdown\(/)
	assert.match(appSource, /data-action="load-fflogs-comparison"/)
	assert.match(appSource, /data-action="apply-log-gcd-utilization"/)
	assert.match(appSource, /data-action="reset-gcd-utilization"/)
	assert.match(appSource, /data-field="fflogs-actor"/)
	assert.match(appSource, /data-field="fflogs-gcd-utilization"/)
	assert.match(appSource, /simulatedEvents:\s*fflogsComparisonEvents\(\)/)
	assert.match(appSource, /targetGcdUtilizationPercent:\s*Number\(state\.fflogsTargetGcdUtilization\)/)
	assert.match(appSource, /function renderGcdUtilizationControl\(/)
	assert.match(appSource, /function setFflogsTargetGcdUtilization\(/)
	assert.match(appSource, /renderCompareMetric\(t\('fflogs\.metric\.damage'\),[^]*renderDamageAdjustmentBreakdown\(comparison\)/)
	assert.match(appSource, /renderCompareMetric\(t\('fflogs\.metric\.gcd'\),[^]*renderGcdUtilizationControl\(comparison\)/)
	assert.match(appSource, /function fflogsCurrentSimulationEvents\(/)
	assert.match(appSource, /function fflogsCurrentTimelineEvents\(/)
	assert.match(appSource, /return uniqueComparisonEvents\(\[\s*\.\.\.fflogsCurrentSimulationEvents\(\),\s*\.\.\.fflogsCurrentTimelineEvents\(\),\s*\.\.\.manualQueueEvents\(\),\s*\]\)/)
	assert.doesNotMatch(appSource, /simulatedEvents:\s*\[\.\.\.\(state\.model\.damage\.events/)
	assert.match(css, /\.fflogs-panel\s*\{/)
	assert.match(css, /\.fflogs-metric-grid\s*\{/)
	assert.match(css, /\.gcd-utilization-control\s*\{/)
	assert.match(css, /\.compare-table\s*\{/)
})

test('timeline editor mode clearly separates browse and edit interactions', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /editorMode:\s*'browse'/)
	assert.equal(appSource.includes("localStorage.getItem('webtimelineEditorMode')"), false)
	assert.equal(appSource.includes("localStorage.setItem('webtimelineEditorMode'"), false)
	assert.match(appSource, /function canEditTimeline\(/)
	assert.match(appSource, /function setEditorMode\(/)
	assert.match(appSource, /data-field="editor-mode"/)
	assert.match(appSource, /<option value="browse" \$\{state\.editorMode === 'browse' \? 'selected' : ''\}>/)
	assert.match(appSource, /<option value="edit" \$\{state\.editorMode === 'edit' \? 'selected' : ''\}>/)
	assert.match(appSource, /setEditorMode\(target\.value\)/)
	assert.equal(appSource.includes('function renderEditorModeStatus('), false)
	assert.match(appSource, /<option value="browse"[^>]*>\$\{t\('mode\.browse'\)\}<\/option>/)
	assert.match(appSource, /<option value="edit"[^>]*>\$\{t\('mode\.edit'\)\}<\/option>/)
	assert.match(appSource, /function isDraggableSkillCard\(/)
	assert.match(appSource, /event\.sidebarType !== 'acr'/)
	assert.match(appSource, /data-skill-source="\$\{event\.sidebarType\}"/)
	assert.match(appSource, /ACR 自动技能已锁定/)
	assert.match(appSource, /data-manual-id="\$\{item\.manualId\}"/)
	assert.match(appSource, /data-timeline-event-key="\$\{item\.editableEventKey\}"/)
	assert.match(appSource, /function canEditTimelineItem\(/)
	assert.match(appSource, /function timelineEventEditKey\(/)
	assert.match(appSource, /function moveExistingTimelineEventAtTimeline\(/)
	assert.match(appSource, /function editableTimelineEventTargets\(/)
	assert.match(appSource, /for \(const target of targets\) \{/)
	assert.match(appSource, /updateTimelineEventPosition\(target\.event, dropInfo\)/)
	assert.match(appSource, /event\.dataTransfer\.setData\('application\/x-webtimeline-event'/)
	assert.match(appSource, /data-action="remove-manual-skill"/)
	assert.match(appSource, /moveManualSkillAtTimeline\(/)
	assert.match(appSource, /event\.dataTransfer\.setData\('application\/x-webtimeline-manual'/)
	assert.match(appSource, /dataTransferHasType\(dataTransfer, 'application\/x-webtimeline-event'\)/)
	assert.match(appSource, /dataTransferHasType\(event\.dataTransfer, 'application\/x-webtimeline-event'\) \? 'move' : 'copy'/)
	assert.match(appSource, /if \(!canEditTimeline\(\)\) \{/)
	assert.equal(css.includes('.editor-mode-status'), false)
	assert.match(css, /\.xiva-item\.editable-manual\.editable\s*\{/)
	assert.match(css, /\.xiva-item\.editable-timeline-event\.editable\s*\{/)
	assert.match(css, /\.manual-remove\s*\{/)
	assert.match(css, /\.xiva-item\.editable-manual\.mitigation,\s*\.xiva-item\.editable-manual\.healing,\s*\.xiva-item\.editable-manual\.dot\s*\{/)
	assert.match(css, /\.xiva-item\.editable-timeline-event\.mitigation,\s*\.xiva-item\.editable-timeline-event\.healing,\s*\.xiva-item\.editable-timeline-event\.dot\s*\{/)
	assert.match(css, /padding-right:\s*30px/)
	assert.match(css, /\.xiva-item\.editable-timeline-event\.mitigation\s+\.timeline-delete-button,\s*\.xiva-item\.editable-timeline-event\.healing\s+\.timeline-delete-button,\s*\.xiva-item\.editable-timeline-event\.dot\s+\.timeline-delete-button\s*\{/)
	assert.match(css, /right:\s*-15px/)
	assert.match(css, /\.timeline-delete-button\s*\{[\s\S]*z-index:\s*12/)
	assert.match(css, /\.skill-card\.acr-locked\s*\{/)
})

test('insert skill panel is a movable floating editor-only palette', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function renderInsertFloat\(/)
	assert.match(appSource, /if \(!canEditTimeline\(\) \|\| state\.section !== 'timeline'\)/)
	assert.match(appSource, /data-insert-float-handle="true"/)
	assert.match(appSource, /programming-mode-button\.jpg/)
	assert.match(appSource, /class="insert-float-avatar"/)
	assert.match(appSource, /class="insert-float-state"/)
	assert.match(appSource, /function startInsertFloatDrag\(/)
	assert.match(appSource, /function moveInsertFloat\(/)
	assert.match(appSource, /function insertFloatPlacement\(/)
	assert.match(appSource, /has-drawer/)
	assert.match(appSource, /align-right/)
	assert.match(appSource, /align-up/)
	assert.match(appSource, /webtimelineInsertFloatPos/)
	assert.match(appSource, /function insertSkillGroups\(/)
	assert.equal(appSource.includes('INSERT_SKILL_PANEL_LIMIT'), false)
	assert.match(appSource, /function insertSkillAtVisibleTimeline\(/)
	assert.match(appSource, /data-action="quick-insert-skill"/)
	assert.match(appSource, /data-insert-panel-handle="true"/)
	assert.match(appSource, /id:\s*'all'/)
	assert.match(appSource, /id:\s*'output',\s*label:\s*t\('category\.output'\)/)
	assert.match(appSource, /id:\s*'mitigation',\s*label:\s*t\('category\.mitigation'\)/)
	assert.match(appSource, /id:\s*'potion',\s*label:\s*t\('category\.potion'\)/)
	assert.match(appSource, /\{id:\s*'burst',\s*label:\s*t\('category\.burst'\),\s*skills:\s*burstGroups\}/)
	assert.doesNotMatch(appSource, /id:\s*'burst60'/)
	assert.doesNotMatch(appSource, /id:\s*'burst120'/)
	assert.match(appSource, /data-drag-skill="\$\{event\.actionId\}"/)
	assert.match(css, /\.insert-float\s*\{[^}]*position:\s*fixed/s)
	assert.match(css, /\.insert-float\.has-drawer\s*\{/)
	assert.match(css, /\.insert-float\.align-right\s*\{/)
	assert.match(css, /\.insert-float\.align-up\s*\{/)
	assert.match(css, /\.insert-float-button\s*\{[^}]*border-radius:\s*999px/s)
	assert.match(css, /\.insert-float-avatar\s*\{[^}]*object-fit:\s*cover/s)
	assert.match(css, /\.insert-float-state\s*\{[^}]*position:\s*absolute/s)
	assert.match(css, /\.floating-skill-drawer\s*\{[^}]*max-height:/s)
	assert.match(css, /\.insert-category-tabs\s*\{/)
})

test('insert skill palette wraps skills into multiple rows and supports native drag drop types', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.skill-strip\s*\{[^}]*display:\s*grid/s)
	assert.match(css, /\.skill-strip\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(176px,\s*1fr\)\)/s)
	assert.match(css, /\.skill-strip\s*\{[^}]*overflow-y:\s*auto/s)
	assert.doesNotMatch(css, /\.skill-strip\s*\{[^}]*overflow-x:\s*auto/s)
	assert.match(css, /\.skill-card\s*\{[^}]*min-width:\s*0/s)
	assert.match(appSource, /function dataTransferHasType\(/)
	assert.match(appSource, /Array\.from\(dataTransfer\?\.types \?\? \[\]\)/)
	assert.match(appSource, /dataTransferHasType\(event\.dataTransfer,\s*'application\/x-webtimeline-manual'\)/)
	assert.doesNotMatch(appSource, /event\.dataTransfer\.types\.includes/)
}
)

test('insert skill palette has pointer drag fallback for dropping skills on the timeline', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /let insertSkillDrag = null/)
	assert.match(appSource, /function startInsertSkillDrag\(/)
	assert.match(appSource, /function moveInsertSkillDrag\(/)
	assert.match(appSource, /function endInsertSkillDrag\(/)
	assert.match(appSource, /function insertSkillAtClientPoint\(/)
	assert.match(appSource, /function insertQtAtClientPoint\(/)
	assert.match(appSource, /function dropTimeInfoForClientPoint\(/)
	assert.match(appSource, /function renderDropTimePreview\(/)
	assert.match(appSource, /function findTimelineAtClientPoint\(/)
	assert.match(appSource, /document\.querySelectorAll\('\.xiva-timeline'\)/)
	assert.match(appSource, /findTimelineAtClientPoint\(event\.clientX,\s*event\.clientY\)/)
	assert.match(appSource, /document\.body\.classList\.add\('is-insert-skill-dragging'\)/)
	assert.match(appSource, /document\.body\.classList\.remove\('is-insert-skill-dragging'\)/)
	assert.match(appSource, /const actionId = insertSkillDrag\.actionId/)
	assert.match(appSource, /const qtIndex = insertSkillDrag\.qtIndex/)
	assert.match(appSource, /insertSkillAtClientPoint\(actionId,\s*event\.clientX,\s*event\.clientY\)/)
	assert.match(appSource, /insertQtAtClientPoint\(qtIndex,\s*event\.clientX,\s*event\.clientY\)/)
	assert.match(appSource, /absoluteMsForPhaseTime\(state\.model\.bossTimeline\?\.source,\s*state\.phase,\s*phaseTimeMs\)/)
	assert.match(appSource, /phaseLabelForTime\(state\.model\.bossTimeline\?\.source,\s*state\.phase,\s*phaseTimeMs\)/)
	assert.match(appSource, /insertSkillDrag\.ghost\.innerHTML = renderDropTimePreview/)
	assert.match(css, /\.skill-drag-ghost\s*\{/)
	assert.match(css, /\.skill-drag-ghost-time\s*\{/)
	assert.match(css, /\.skill-drag-ghost-phase\s*\{/)
	assert.match(css, /\.skill-card\.is-pointer-dragging\s*\{/)
	assert.match(css, /\.xiva-timeline\.is-skill-drop-target\s*\{/)
})

test('insert skill drawer does not block functional lane hit testing while dragging', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.is-insert-skill-dragging\s+\.insert-float\s*\{[^}]*pointer-events:\s*none;/s)
	assert.match(css, /\.is-insert-skill-dragging\s+\.skill-drag-ghost\s*\{[^}]*pointer-events:\s*none;/s)
})

test('insert skill cards drop the plus button and keep click insert on the whole card', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	const skillCardSource = appSource.slice(appSource.indexOf('function renderSkillCard('), appSource.indexOf('function insertSkillCardMeta('))
	const potionCardSource = appSource.slice(appSource.indexOf('function renderPotionInsertCard('), appSource.indexOf('function renderQtInsertCard('))
	const qtCardSource = appSource.slice(appSource.indexOf('function renderQtInsertCard('), appSource.indexOf('function burstInsertSkillNames('))
	const burstCardSource = appSource.slice(appSource.indexOf('function renderBurstInsertCard('), appSource.indexOf('function renderPotionInsertCard('))

	// No standalone "+" insert buttons anywhere in the insert panel cards.
	assert.equal(skillCardSource.includes('+</button>'), false)
	assert.equal(potionCardSource.includes('+</button>'), false)
	assert.equal(qtCardSource.includes('+</button>'), false)
	assert.equal(burstCardSource.includes('+</button>'), false)
	assert.equal(skillCardSource.includes('hint.insertToQueue'), false)
	assert.equal(potionCardSource.includes('插入爆发药'), false)
	assert.equal(burstCardSource.includes('action.insertBurst'), false)

	// The whole card still carries the click insert action and drag payload.
	assert.match(skillCardSource, /data-action="quick-insert-skill" data-drag-skill="\$\{event\.actionId\}"/)
	assert.match(potionCardSource, /data-action="quick-insert-potion" data-potion-id="\$\{event\.potionId\}"/)
	assert.match(qtCardSource, /data-action="toggle-qt-draft" data-qt-insert="\$\{event\.qtIndex\}"/)
	assert.match(burstCardSource, /data-action="quick-insert-burst" data-burst-index="\$\{burstId\}"/)

	// Drag attributes remain on every card kind.
	assert.match(skillCardSource, /draggable="\$\{draggable \? 'true' : 'false'\}"/)
	assert.match(potionCardSource, /draggable="true"[^>]*data-drag-potion="\$\{event\.potionId\}"/)
	assert.match(qtCardSource, /draggable="true"[^>]*data-drag-qt="\$\{event\.qtIndex\}"/)
	assert.match(burstCardSource, /draggable="true"[^>]*data-drag-burst="\$\{event\.burstIndex\}"/)

	// Card body wraps name + meta so long names ellipsize while tooltip keeps full name.
	assert.match(skillCardSource, /class="skill-card-body"/)
	assert.match(css, /\.skill-card-body\s*\{[^}]*min-width:\s*0/s)
	assert.match(css, /\.skill-card-body strong,[\s\S]*?text-overflow:\s*ellipsis/s)
	assert.match(css, /\.skill-card:hover\s*\{/)
})

test('insert skill palette offers built-in FF14 combat potions by level', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /potionAttribute:\s*'strength'/)
	assert.match(appSource, /const POTION_ATTRIBUTES = \[/)
	assert.match(appSource, /id:\s*'intelligence',\s*labelKey:\s*'potion\.attr\.intelligence'/)
	assert.match(appSource, /id:\s*'dexterity',\s*labelKey:\s*'potion\.attr\.dexterity'/)
	assert.match(appSource, /const COMBAT_POTION_TIERS = \[/)
	assert.match(appSource, /Grade 2 Gemdraught/)
	assert.match(appSource, /Grade 8 Tincture/)
	assert.match(appSource, /function potionInsertItems\(/)
	assert.match(appSource, /\{id:\s*'potion',\s*label:\s*t\('category\.potion'\),\s*skills:\s*potionInsertItems\(\)\}/)
	assert.match(appSource, /function renderPotionInsertPanel\(/)
	assert.match(appSource, /function renderPotionInsertCard\(/)
	assert.match(appSource, /function renderPotionTimelineIcon\(/)
	assert.match(appSource, /function activePotionAttribute\(/)
	assert.match(appSource, /function setPotionAttribute\(/)
	assert.match(appSource, /data-potion-attribute="\$\{attribute\.id\}"/)
	assert.match(appSource, /potionAttributeLabel\(event\.attributeId\)/)
	assert.match(appSource, /name:\s*`\$\{tier\.label\}\$\{attrLabel\}\$\{t\('potion\.selectSuffix'\)\}`/)
	assert.match(appSource, /data-action="quick-insert-potion"/)
	assert.match(appSource, /data-drag-potion="\$\{event\.potionId\}"/)
	assert.match(appSource, /application\/x-webtimeline-potion/)
	assert.match(appSource, /item\.type === 'potion'[\s\S]*return renderPotionTimelineIcon\(item\)/)
	assert.match(appSource, /function insertPotionAtMs\(/)
	assert.match(appSource, /kind:\s*'potion'/)
	assert.match(appSource, /classification:\s*'potion'/)
	assert.match(appSource, /recastMs:\s*270000/)
	assert.match(appSource, /durationMs:\s*30000/)
	assert.match(appSource, /function hasMeaningfulCdAdjustment\(/)
	assert.match(appSource, /Number\(event\.cdAdjustedMs \?\? 0\) >= 1000/)
	assert.match(appSource, /const adjustedByCooldown = adjusted >= 1000/)
	assert.match(appSource, /hasMeaningfulCdAdjustment\(item\) \? `\$\{t\('meta\.queueCd'\)\}/)
	assert.match(appSource, /hasMeaningfulCdAdjustment\(event\) \? `\$\{t\('meta\.cdAdjusted'\)\}/)
	assert.match(css, /\.insert-potion-panel\s*\{/)
	assert.match(css, /\.potion-attribute-grid\s*\{/)
	assert.match(css, /\.potion-attribute-card\.active\s*\{/)
	assert.match(css, /\.potion-insert-card\s*\{/)
	assert.match(css, /\.potion-tier-pill\s*\{/)
	assert.match(css, /\.skill-icon\.potion-timeline-icon\s*\{/)
})

test('timeline drag guide shows drop bubble and nearest event delta while editing', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /renderTimelineDragGuide\(\)/)
	assert.match(appSource, /class="timeline-drag-guide"/)
	assert.match(appSource, /function showTimelineDragGuide\(/)
	assert.match(appSource, /function hideTimelineDragGuide\(/)
	assert.match(appSource, /function nearestTimelineGuideEvent\(/)
	assert.match(appSource, /function timelineGuideEvents\(/)
	assert.match(appSource, /function renderTimelineGuideDelta\(/)
	assert.match(appSource, /scheduleTimelineDragGuide\(timeline, event\.clientX\)/)
	assert.match(appSource, /hideTimelineDragGuide\(timeline\)/)
	assert.match(appSource, /timeline\.dataset\.guideVisible = 'true'/)
	assert.match(appSource, /timeline\.style\.setProperty\('--guide-left'/)
	assert.match(appSource, /timeline\.style\.setProperty\('--guide-delta-left'/)
	assert.match(css, /\.timeline-drag-guide\s*\{/)
	assert.match(css, /\.timeline-drag-guide-bubble\s*\{/)
	assert.match(css, /\.timeline-drag-guide-delta\s*\{/)
	assert.match(css, /\.xiva-timeline\[data-guide-visible="true"\]\s+\.timeline-drag-guide\s*\{/)
})

test('timeline drag guide schedules high frequency updates through RAF and cached context', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /let timelineDragGuideFrame = null/)
	assert.match(appSource, /let timelineDragGuidePending = null/)
	assert.match(appSource, /let timelineDragGuideCache = null/)
	assert.match(appSource, /function scheduleTimelineDragGuide\(/)
	assert.match(appSource, /function flushTimelineDragGuide\(/)
	assert.match(appSource, /function timelineDragGuideContext\(/)
	assert.match(appSource, /function nearestTimelineGuideEventFromCache\(/)
	assert.match(appSource, /requestAnimationFrame\(flushTimelineDragGuide\)/)
	assert.match(appSource, /cancelAnimationFrame\(timelineDragGuideFrame\)/)
	assert.match(appSource, /scheduleTimelineDragGuide\(timeline, event\.clientX\)/)
	assert.match(appSource, /dropTimeInfoForClientPoint\(event\.clientX,\s*event\.clientY,\s*timelineDragGuideContext\(timeline\)\)/)
	assert.match(appSource, /function dropTimeInfoForClientPoint\(clientX, clientY, context = null\)/)
	assert.match(appSource, /const timeline = context\?\.timeline \?\? findTimelineAtClientPoint\(clientX, clientY\)/)
	assert.doesNotMatch(appSource, /showTimelineDragGuide\(timeline, event\.clientX\)/)
	assert.match(css, /will-change:\s*transform/)
	assert.match(css, /translate3d\(var\(--guide-left/)
}
)

test('timeline drag guide uses the track content origin so dropped skills align with the guide line', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /trackContentLeft/)
	assert.match(appSource, /trackContentLeft:\s*\(axisRect\?\.left \?\? rect\.left\) - rect\.left \+ timeline\.scrollLeft/)
	assert.match(appSource, /const trackX = Math\.max\(0,\s*clientX - context\.trackLeft\)/)
	assert.match(appSource, /const guideLeftPx = context\.trackContentLeft \+ trackX/)
	assert.match(appSource, /containerLeft:\s*context\?\.trackLeft \?\? rect\.left/)
	assert.match(appSource, /scrollLeft:\s*context \? 0 : timeline\.scrollLeft/)
	assert.match(appSource, /scrollWidth:\s*context\?\.trackWidth \?\? timeline\.scrollWidth/)
	assert.doesNotMatch(appSource, /clientX - context\.trackLeft \+ timeline\.scrollLeft/)
}
)

test('burst insert drawer offers only draggable 60 and 120 burst package buttons', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const detailSource = appSource.slice(appSource.indexOf('function renderBurstGroupsInDetailPanel('), appSource.indexOf('function renderFocusSkillModal('))
	const drawerSource = appSource.slice(appSource.indexOf('function renderSkillDrawer('), appSource.indexOf('function insertSkillGroups('))
	const rowsSource = appSource.slice(appSource.indexOf('function buildVisualTimelineRows('), appSource.indexOf('function buildOutputLaneItems('))
	const burstPanelSource = appSource.slice(appSource.indexOf('function renderBurstInsertPanel('), appSource.indexOf('function insertSkillGroups('))

	assert.match(appSource, /\{id:\s*'burst',\s*label:\s*t\('category\.burst'\),\s*skills:\s*burstGroups\}/)
	assert.match(rowsSource, /id:\s*'burst-integration',\s*label:\s*t\('rail\.burst'\)/)
	assert.doesNotMatch(appSource, /label:\s*'爆发整合'/)
	assert.doesNotMatch(appSource, /label:\s*'60 \/ 120 爆发整合'/)
	const tabIndex = drawerSource.indexOf('class="insert-category-tabs"')
	const topPanelIndex = drawerSource.indexOf('class="insert-burst-panel"')
	assert.ok(tabIndex >= 0)
	assert.ok(topPanelIndex === -1 || topPanelIndex > tabIndex)
	assert.match(drawerSource, /activeGroup\.id === 'burst' \? renderBurstInsertPanel\(activeGroup\.skills\)/)
	assert.match(appSource, /function renderBurstInsertPanel\(bursts\)/)
	assert.match(appSource, /function uniqueBurstInsertChoices\(bursts\)/)
	assert.match(appSource, /const choices = uniqueBurstInsertChoices\(bursts\)/)
	assert.match(appSource, /choices\.map\(renderBurstInsertCard\)/)
	assert.match(appSource, /window === '60s'/)
	assert.match(appSource, /window === '120s'/)
	assert.doesNotMatch(burstPanelSource, /renderBurstPlanner\(/)
	assert.doesNotMatch(burstPanelSource, /type="range"/)
	assert.match(appSource, /draggable="true"[^>]*data-drag-burst="\$\{event\.burstIndex\}"/)
	assert.match(appSource, /data-burst-index="\$\{burstId\}"/)
	assert.match(appSource, /application\/x-webtimeline-burst/)
	assert.match(appSource, /function insertBurstPackageAtTimeline\(/)
	assert.match(appSource, /function insertBurstPackageAtMs\(/)
	assert.doesNotMatch(detailSource, /renderBurstPlanner\(/)
	assert.doesNotMatch(detailSource, /input type="range"/)
	assert.match(appSource, /\{id:\s*'burst',\s*label:\s*t\('category\.burst'\),\s*skills:\s*burstGroups\}/)
	assert.doesNotMatch(appSource, /id:\s*'burst60'/)
	assert.doesNotMatch(appSource, /id:\s*'burst120'/)
	assert.match(css, /\.insert-burst-panel\s*\{/)
	assert.match(css, /\.insert-burst-card-grid\s*\{/)
	assert.match(css, /\.burst-insert-card\s*\{/)
	assert.doesNotMatch(css, /\.insert-burst-planner input\[type="range"\]/)
})

test('insert skill palette is current-job only with burst package categories', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /data-insert-panel-handle="true"/)
	assert.match(appSource, /function currentJobInsertSkills\(/)
	assert.match(appSource, /skill\.job === state\.job/)
	const insertSkillFunction = appSource.slice(appSource.indexOf('function currentJobInsertSkills('), appSource.indexOf('function isCurrentJobInsertEvent('))
	assert.equal(insertSkillFunction.includes("skill.job === 'ROLE'"), false)
	assert.match(appSource, /id:\s*'all'/)
	assert.match(appSource, /id:\s*'output'/)
	assert.match(appSource, /id:\s*'mitigation'/)
	assert.match(appSource, /id:\s*'potion'/)
	assert.match(appSource, /id:\s*'qt'/)
	assert.match(appSource, /qtDraftStates:\s*\{\}/)
	assert.match(appSource, /function insertQtControls\(/)
	assert.match(appSource, /function qtStatePanelItems\(/)
	assert.match(appSource, /qtStates:\s*\[\{Name:\s*name,\s*Enabled:\s*enabled\}\]/)
	assert.match(appSource, /function renderQtInsertCard\(/)
	assert.match(appSource, /function renderQtGamePanel\(/)
	assert.match(appSource, /function renderQtDraftPanel\(/)
	assert.match(appSource, /function toggleQtDraftState\(/)
	assert.match(appSource, /function insertQtDraftAtVisibleTimeline\(/)
	assert.match(appSource, /activeGroup\.id === 'qt' \? renderQtGamePanel\(activeGroup\.skills\)/)
	assert.match(appSource, /class="qt-panel-note"/)
	assert.match(appSource, /class="qt-game-panel"/)
	assert.match(appSource, /class="qt-game-grid"/)
	assert.match(appSource, /class="qt-draft-panel"/)
	assert.match(appSource, /class="qt-draft-logic"/)
	assert.match(appSource, /class="qt-game-toggle \$\{qtDraftEnabledFor\(event\) \? 'is-on' : 'is-off'\}/)
	assert.match(appSource, /data-action="toggle-qt-draft"/)
	assert.match(appSource, /data-action="insert-qt-draft"/)
	assert.match(appSource, /data-drag-qt="\$\{event\.qtIndex\}"/)
	assert.match(appSource, /data-qt-enabled="\$\{qtDraftEnabledFor\(event\) \? 'true' : 'false'\}"/)
	assert.match(appSource, /application\/x-webtimeline-qt/)
	assert.match(appSource, /function insertQtAtVisibleTimeline\(/)
	assert.match(appSource, /Type:\s*'BatchTriggerQt'/)
	assert.match(appSource, /QtStates:\s*item\.qtStates/)
	assert.match(appSource, /\{id:\s*'burst',\s*label:\s*t\('category\.burst'\),\s*skills:\s*burstGroups\}/)
	assert.doesNotMatch(appSource, /id:\s*'burst60'/)
	assert.doesNotMatch(appSource, /id:\s*'burst120'/)
	assert.match(appSource, /function uniqueBurstInsertChoices\(/)
	assert.match(appSource, /data-action="quick-insert-burst"/)
	assert.match(appSource, /data-drag-burst="\$\{event\.burstIndex\}"/)
	assert.equal(appSource.includes("id: 'utility'"), false)
	assert.equal(appSource.includes("id: 'healing'"), false)
	assert.match(appSource, /function isInsertOutputOverride\(/)
	assert.match(appSource, /function renderBurstInsertCard\(/)
	assert.match(css, /\.floating-skill-drawer \.section-heading\s*\{[^}]*cursor:\s*grab/s)
	assert.match(css, /\.qt-panel-note\s*\{/)
	assert.match(css, /\.qt-insert-card\s*\{/)
	assert.match(css, /\.qt-game-panel\s*\{/)
	assert.match(css, /\.qt-game-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s)
	assert.match(css, /\.qt-draft-panel\s*\{/)
	assert.match(css, /\.qt-draft-logic\s*\{/)
	assert.match(css, /\.qt-game-toggle\.is-on\s*\{/)
	assert.match(css, /\.qt-game-toggle\.is-off\s*\{/)
	assert.doesNotMatch(css, /#d66491/)
	assert.doesNotMatch(css, /rgba\(255,\s*160,\s*176/)
})

test('insert skill id entry is compact and auto-matches action names', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function insertIdPreviewName\(/)
	assert.match(appSource, /data-field="skill-id"/)
	assert.match(appSource, /data-insert-id-preview/)
	assert.equal(appSource.includes('data-field="skill-name"'), false)
	assert.equal(appSource.includes('技能名，可留空'), false)
	assert.match(appSource, /const name = action\?\.name \?\? `\u6280\u80fd \$\{id\}`/)
	assert.match(css, /\.floating-skill-drawer\s*\{[^}]*width:\s*min\(900px,\s*calc\(100vw - 24px\)\)/s)
	assert.match(css, /\.insert-float\.has-drawer\s*\{[^}]*width:\s*min\(900px,\s*calc\(100vw - 24px\)\)/s)
	assert.match(css, /\.insert-command-bar\s*\{[^}]*grid-template-columns:\s*minmax\(96px,\s*132px\)\s+minmax\(0,\s*1fr\)\s+auto/s)
	assert.match(css, /\.insert-command-submit\s*\{/)
	assert.equal(css.includes('.insert-row'), false)
})

test('inserted skills stay manual instead of becoming focused skills', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	const insertFunction = appSource.slice(appSource.indexOf('function insertSkillAtMs('), appSource.indexOf('function moveManualSkillAtTimeline('))
	assert.equal(insertFunction.includes('addFocusedSkill'), false)
	assert.match(appSource, /data-action="quick-insert-skill" data-drag-skill="\$\{event\.actionId\}"/)
	assert.doesNotMatch(appSource, /<button type="button" data-focus-skill="\$\{event\.actionId\}" title="显示这个技能的位置">\+<\/button>/)
})

test('manual insert queue applies cooldown checks and marks shifted events', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function normalizeManualQueue\(/)
	assert.match(appSource, /manualCooldownKey\(/)
	assert.match(appSource, /manualActionQueueLockMs\(/)
	assert.match(appSource, /requestedTimeMs/)
	assert.match(appSource, /cdAdjustedMs/)
	assert.match(appSource, /队列CD调整/)
	assert.match(appSource, /\u961f\u5217\u5df2\u987a\u5ef6/)
	assert.match(css, /\.manual-cd-badge\s*\{/)
})

test('main timeline uses functional editor lanes instead of source-based rows', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const buildRows = appSource.slice(appSource.indexOf('function buildVisualTimelineRows('), appSource.indexOf('function limitVisibleTimelineRowItems('))

	assert.match(buildRows, /id:\s*'output-actions'/)
	assert.match(buildRows, /label:\s*t\('rail\.output'\)/)
	assert.match(buildRows, /id:\s*'mitigation-actions'/)
	assert.match(buildRows, /label:\s*t\('rail\.mitigation'\)/)
	assert.match(buildRows, /id:\s*'burst-integration'/)
	assert.match(buildRows, /label:\s*t\('rail\.burst'\)/)
	assert.match(buildRows, /id:\s*'qt-controls',\s*label:\s*'QT \u63a7\u5236'/)
	assert.doesNotMatch(buildRows, /label:\s*'\u7206\u53d1\u6574\u5408'/)
	assert.match(buildRows, /id:\s*'acr-simulated',\s*label:\s*t\('rail\.acrSim'\)/)
	assert.doesNotMatch(buildRows, /label:\s*'KANO ACR \u6a21\u62df'/)
	assert.match(appSource, /function buildOutputLaneItems\(/)
	assert.match(appSource, /function buildBurstLaneItems\(/)
	assert.match(appSource, /function buildMitigationLaneItems\(/)
	assert.match(appSource, /function buildQtLaneItems\(/)
	assert.doesNotMatch(buildRows, /label:\s*'GCD \/ Actions'/)
	assert.doesNotMatch(buildRows, /label:\s*'QT \/ Potion'/)
	assert.doesNotMatch(buildRows, /label:\s*'Manual Insert'/)
})

test('main timeline renders the opener detail panel as its own visible row', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const buildRows = appSource.slice(appSource.indexOf('function buildVisualTimelineRows('), appSource.indexOf('function limitVisibleTimelineRowItems('))

	assert.match(buildRows, /const openerPanel = state\.model\.detailPanels\.find\(panel => panel\.id === 'opener'\)/)
	assert.match(buildRows, /const openerItems = openerDetailEvents\(openerPanel\)\.map\(event => timelineItemForEvent\(event/)
	assert.match(buildRows, /\{id:\s*'opener-actions',\s*label:\s*t\('overview\.opener'\),\s*accent:\s*'violet',\s*keepWhenEmpty:\s*true,\s*items:\s*openerItems\}/)
})

test('editable timeline lanes stay visible when the active phase has no imported actions', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const buildRows = appSource.slice(appSource.indexOf('function buildVisualTimelineRows('), appSource.indexOf('function limitVisibleTimelineRowItems('))

	assert.match(buildRows, /\{id:\s*'output-actions',\s*label:\s*t\('rail\.output'\),\s*accent:\s*'mint',\s*keepWhenEmpty:\s*true,\s*items:/)
	assert.match(buildRows, /\{id:\s*'mitigation-actions',\s*label:\s*t\('rail\.mitigation'\),\s*accent:\s*'mint',\s*keepWhenEmpty:\s*true,\s*items:/)
	assert.match(buildRows, /\{id:\s*'burst-integration',\s*label:\s*t\('rail\.burst'\),\s*accent:\s*'orange',\s*keepWhenEmpty:\s*true,\s*items:/)
	assert.match(buildRows, /\{id:\s*'qt-controls',\s*label:\s*'QT \u63a7\u5236',\s*accent:\s*'sky',\s*keepWhenEmpty:\s*true,\s*items:/)
})

test('timeline drops only accept skills in their matching functional lane', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const rowSource = appSource.slice(appSource.indexOf('function renderTimelineRow('), appSource.indexOf('function renderTimelineRowLabel('))
	const skillDropSource = appSource.slice(appSource.indexOf('function insertSkillAtTimeline('), appSource.indexOf('function insertSkillAtVisibleTimeline('))
	const skillPointerSource = appSource.slice(appSource.indexOf('function insertSkillAtClientPoint('), appSource.indexOf('function insertSkillAtVisibleTimeline('))
	const burstDropSource = appSource.slice(appSource.indexOf('function insertBurstPackageAtTimeline('), appSource.indexOf('function insertBurstPackageAtMs('))
	const burstPointerSource = appSource.slice(appSource.indexOf('function insertBurstPackageAtClientPoint('), appSource.indexOf('function insertBurstPackageAtMs('))

	assert.match(rowSource, /data-row-id="\$\{row\.id\}"/)
	assert.match(rowSource, /data-drop-lane="\$\{timelineDropLaneForRow\(row\)\}"/)
	assert.match(appSource, /function timelineDropLaneForRow\(/)
	assert.match(appSource, /function timelineDropLaneForTarget\(/)
	assert.match(appSource, /function timelineDropLaneAtClientPoint\(/)
	assert.match(appSource, /function timelineDropLaneAtClientPoint\(clientX, clientY\) \{[\s\S]*?document\.elementFromPoint\(clientX,\s*clientY\)[\s\S]*?timelineDropLaneForTarget\(target\)/)
	assert.match(appSource, /function actionTimelineDropLane\(/)
	assert.match(appSource, /function canDropActionOnTimelineLane\(/)
	assert.match(appSource, /function canDropBurstPackageOnTimelineLane\(/)
	assert.match(appSource, /function canDropQtOnTimelineLane\(/)
	assert.match(appSource, /row\.id === 'output-actions'\)\s*return 'output'/)
	assert.match(appSource, /row\.id === 'mitigation-actions'\)\s*return 'mitigation'/)
	assert.match(appSource, /row\.id === 'burst-integration'\)\s*return 'burst'/)
	assert.match(appSource, /row\.id === 'qt-controls'\)\s*return 'qt'/)
	assert.match(appSource, /dropLane === 'locked'/)
	assert.match(skillDropSource, /const dropLane = timelineDropLaneAtClientPoint\(event\.clientX,\s*event\.clientY\) \|\| timelineDropLaneForTarget\(event\.target\)/)
	assert.match(skillDropSource, /if \(!canDropActionOnTimelineLane\(actionId, dropLane\)\)/)
	assert.match(skillPointerSource, /const dropLane = timelineDropLaneAtClientPoint\(clientX, clientY\)/)
	assert.match(burstDropSource, /const dropLane = timelineDropLaneAtClientPoint\(event\.clientX,\s*event\.clientY\) \|\| timelineDropLaneForTarget\(event\.target\)/)
	assert.match(burstDropSource, /if \(!canDropBurstPackageOnTimelineLane\(dropLane\)\)/)
	assert.match(burstPointerSource, /const dropLane = timelineDropLaneAtClientPoint\(clientX, clientY\)/)
	assert.match(burstPointerSource, /if \(!canDropBurstPackageOnTimelineLane\(dropLane\)\)/)
})

test('manual insert queue checks cooldowns against existing timeline events before shifting skills', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function timelineCooldownBaselineEvents\(/)
	assert.match(appSource, /function normalizeManualQueue\(events = \[\], baselineEvents = timelineCooldownBaselineEvents\(\)\)/)
	assert.match(appSource, /isManual:\s*false/)
	assert.match(appSource, /isManual:\s*true/)
	assert.match(appSource, /applyCooldownUsage\(/)
	assert.match(appSource, /Math\.max\(actualTimeMs,\s*Number\(nextReadyByKey\.get\(cooldownKey\) \?\? 0\)\)/)
	assert.match(appSource, /manualTimelineItemType\(/)
	assert.match(appSource, /if \(item\.manualId\)/)
})

test('manual dropped skills do not chase future imported cooldown baselines', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const queueSource = appSource.slice(appSource.indexOf('function normalizeManualQueue('), appSource.indexOf('function nextManualReadyTime('))

	assert.match(queueSource, /processBaselinesUpTo\(requestedTimeMs\)/)
	assert.doesNotMatch(queueSource, /baselineConflictsWithManual\(/)
	assert.doesNotMatch(queueSource, /while \(baselineIndex < baselines\.length && baselineConflictsWithManual/)
})

test('manual inserted skills use boss target for output and require user targets for mitigation', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const insertFunction = appSource.slice(appSource.indexOf('function insertSkillAtMs('), appSource.indexOf('function manualInsertStatusTime('))
	const manualEditorSource = appSource.slice(appSource.indexOf('function renderManualEditorRow('), appSource.indexOf('function manualEventsForPanel('))
	const exportSource = appSource.slice(appSource.indexOf('function buildNativePrExportFromState('), appSource.indexOf('function jobFromTimelineMeta('))

	assert.match(appSource, /function defaultManualTargetForAction\(/)
	assert.match(appSource, /function requiresManualTargetChoice\(/)
	assert.match(insertFunction, /target:\s*defaultManualTargetForAction\(action,\s*classification\.type\)/)
	assert.match(insertFunction, /targetRequired:\s*requiresManualTargetChoice\(action,\s*classification\.type\)/)
	assert.doesNotMatch(manualEditorSource, /renderManualTargetControl\(event,\s*canEdit\)/)
	assert.match(exportSource, /Target:\s*exportTargetForEvent\(item\)/)
	assert.match(appSource, /function exportTargetForEvent\(/)
	assert.match(appSource, /if \(isOutputTimelineEvent\(event\) && !event\.target\) \{\s*return 'Target'\s*\}/s)
	assert.match(css, /\.detail-target-field\s*\{/)
	assert.match(css, /\.target-required-warning\s*\{/)
})

test('targeted manual support skills show a global target picker overlay after being dropped', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const insertFunction = appSource.slice(appSource.indexOf('function insertSkillAtMs('), appSource.indexOf('function manualInsertStatusTime('))
	const manualItemSource = appSource.slice(appSource.indexOf('function timelineManualItem('), appSource.indexOf('function manualTimelineItemType('))
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))
	const clickSource = appSource.slice(appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('toggle'"))
	const renderSource = appSource.slice(appSource.indexOf('function render()'), appSource.indexOf('function renderImportFeedback('))

	assert.match(appSource, /pendingTargetPicker:\s*null/)
	assert.match(insertFunction, /if \(inserted\?\.targetRequired && !inserted\.target\) \{/)
	assert.match(insertFunction, /state\.pendingTargetPicker = inserted\.id/)
	assert.match(manualItemSource, /target:\s*item\.target/)
	assert.match(manualItemSource, /targetRequired:\s*Boolean\(item\.targetRequired\)/)
	assert.match(manualItemSource, /targetMode:\s*item\.targetMode/)
	assert.match(manualItemSource, /targetDataId:\s*item\.targetDataId/)
	assert.doesNotMatch(itemSource, /renderInlineTargetPicker/)
	assert.doesNotMatch(itemSource, /inline-target-picker/)
	assert.match(appSource, /function renderPendingTargetPickerOverlay\(/)
	assert.match(renderSource, /renderPendingTargetPickerOverlay\(model\)/)
	assert.match(appSource, /指定目标/)
	assert.match(appSource, /data-manual-target-choice="\$\{item\.id\}"/)
	assert.match(clickSource, /action === 'choose-manual-target'/)
	assert.match(clickSource, /updateManualSkillTarget\(target\.dataset\.manualTargetChoice,\s*target\.dataset\.targetValue\)/)
	assert.match(appSource, /if \(state\.pendingTargetPicker === manualId && item\.target\) \{/)
	assert.match(appSource, /function positionTargetPickerOverlay\(/)
	assert.match(renderSource, /positionTargetPickerOverlay\(\)/)
	assert.match(css, /\.target-picker-popover\s*\{/)
	assert.match(css, /\.target-picker-options\s*\{/)
})

test('manual support target picker excludes boss targets and uses a wider option panel', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const pickerSource = appSource.slice(appSource.indexOf('function renderPendingTargetPickerOverlay('), appSource.indexOf('function positionTargetPickerOverlay('))
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))
	const detailTargetSource = appSource.slice(appSource.indexOf('function renderDetailTargetControl('), appSource.indexOf('function renderManualEditor('))
	const targetOptionsSource = appSource.slice(appSource.indexOf('function targetOptions'), appSource.indexOf('function manualEventsForPanel('))

	assert.match(pickerSource, /targetOptionsForEvent\(item\)\.filter\(option => option\.value\)/)
	assert.match(detailTargetSource, /targetOptionsForEvent\(event\)/)
	assert.match(appSource, /function targetOptionsForEvent\(event = \{\}\)/)
	assert.doesNotMatch(itemSource, /targetPickerClass/)
	assert.doesNotMatch(itemSource, /target-picker-open/)
	assert.match(targetOptionsSource, /if \(event\.targetRequired \|\| requiresManualTargetChoice\(actionById\(event\.actionId\),\s*event\.classification\)\) \{/)
	assert.match(targetOptionsSource, /return options\.filter\(option => option\.value !== 'Target'\)/)
	assert.match(css, /\.target-picker-popover\s*\{[^}]*width:\s*min\(520px,\s*calc\(100vw - 32px\)\)/s)
	assert.match(css, /\.target-picker-popover\s*\{[^}]*min-width:\s*360px/s)
	assert.match(css, /\.target-picker-popover\s*\{[^}]*box-sizing:\s*border-box/s)
	assert.match(css, /\.target-picker-popover\s*\{[^}]*position:\s*fixed/s)
	assert.match(css, /\.target-picker-popover\s*\{[^}]*z-index:\s*9999/s)
	assert.match(css, /\.target-picker-options\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(120px,\s*1fr\)\)/s)
	assert.match(css, /\.target-picker-choice\s*\{[^}]*min-height:\s*36px/s)
	assert.match(css, /\.target-picker-choice\s*\{[^}]*white-space:\s*normal/s)
	assert.doesNotMatch(css, /\.target-picker-choice\s*\{[^}]*text-overflow:\s*ellipsis/s)
	assert.doesNotMatch(css, /\.inline-target-picker/)
	assert.doesNotMatch(css, /\.target-picker-open/)
}
)

test('target picker overlay is fixed-positioned and timeline render preserves scroll', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const renderSource = appSource.slice(appSource.indexOf('function render()'), appSource.indexOf('function renderImportFeedback('))

	assert.match(css, /\.target-picker-popover\s*\{[^}]*position:\s*fixed/s)
	assert.match(css, /\.target-picker-popover\s*\{[^}]*overflow:\s*visible/s)
	assert.doesNotMatch(css, /\.inline-target-picker/)
	assert.match(appSource, /function captureTimelineViewport\(/)
	assert.match(appSource, /function restoreTimelineViewport\(/)
	assert.match(renderSource, /const timelineViewport = captureTimelineViewport\(\)/)
	assert.match(renderSource, /restoreTimelineViewport\(timelineViewport\)/)
	assert.match(renderSource, /positionTargetPickerOverlay\(\)/)
	assert.match(renderSource, /requestAnimationFrame\(\(\) => \{/)
	assert.match(appSource, /timeline\.scrollLeft = viewport\.scrollLeft/)
	assert.match(appSource, /timeline\.scrollTop = viewport\.scrollTop/)
	assert.match(css, /\.xiva-timeline\s*\{[^}]*overflow-anchor:\s*none/s)
})

test('mitigation detail panel edits targets for imported and manual coverage skills', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const changeSource = appSource.slice(appSource.indexOf("document.addEventListener('change'"), appSource.indexOf('function render()'))
	const detailRowSource = appSource.slice(appSource.indexOf('function renderDetailEventRow('), appSource.indexOf('function renderManualEditor('))
	const importSource = appSource.slice(appSource.indexOf('function importExportedEvents('), appSource.indexOf('function importedEventDurationMs('))
	const flattenSource = appSource.slice(appSource.indexOf('function flattenImportedTimeline('), appSource.indexOf('function buildImportedModeTracks('))

	assert.match(detailRowSource, /renderDetailTargetControl\(panel,\s*event,\s*index,\s*canEditTarget\)/)
	assert.match(appSource, /function canEditDetailTarget\(/)
	assert.match(appSource, /function renderDetailTargetControl\(/)
	assert.match(appSource, /data-detail-target="\$\{detailEditKey\(panel,\s*event,\s*index\)\}"/)
	assert.match(changeSource, /const detailTarget = event\.target\.closest\('\[data-detail-target\]'\)/)
	assert.match(changeSource, /updateDetailEventTarget\(detailTarget\.dataset\.detailTarget,\s*detailTarget\.value\)/)
	assert.match(appSource, /function updateDetailEventTarget\(/)
	assert.match(appSource, /const target = editableDetailEventTarget\(detailKey\)/)
	assert.match(appSource, /target\.event\.target = String\(value \?\? ''\)/)
	assert.match(importSource, /const targetRequired = Boolean\(event\.targetRequired \?\? requiresManualTargetChoice\(action,\s*classification\)\)/)
	assert.match(importSource, /targetRequired,\s*\n/)
	assert.match(flattenSource, /targetRequired:\s*requiresManualTargetChoice\(actionRecord,\s*classification\.type\)/)
	assert.match(css, /\.detail-target-field\s*\{/)
})

test('60 and 120 burst items are labeled as burst in the main timeline preview', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function burstWindowForTime\(/)
	assert.match(appSource, /function burstLabelForWindow\(/)
	assert.match(appSource, /function buildBurstPackageItems\(/)
	assert.match(appSource, /id:\s*'burst-integration'/)
	assert.match(appSource, /type:\s*'burst-package'/)
	assert.match(appSource, /60 爆发/)
	assert.match(appSource, /120 爆发/)
	assert.doesNotMatch(appSource, /\u7206\u53d1\u5305/)
	assert.match(appSource, /const window = burstWindowForTime\(burst,\s*startMs,\s*index\)/)
	assert.match(appSource, /label:\s*burstLabelForWindow\(window\)/)
	assert.match(appSource, /name:\s*burstLabelForWindow\(window\)/)
	assert.match(appSource, /skillCount:\s*burstSkillCount\(burst\)/)
	assert.match(appSource, /sourceLabel:\s*burstSourceLabel\(burst\)/)
	assert.match(appSource, /item\.type === 'burst-package'/)
	assert.match(css, /\.xiva-item\.burst-package\s*\{/)
	assert.match(css, /\.burst-package-source\s*\{/)
})

test('burst package timeline bubbles display the judged drop time explicitly', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))
	const insertSource = appSource.slice(appSource.indexOf('function insertBurstPackageAtMs('), appSource.indexOf('function insertSkillAtMs('))

	assert.match(itemSource, /class="burst-package-time"/)
	assert.match(itemSource, /判定 \$\{burstPackageTimeLabel\(item,\s*startTimeLabel\)\}/)
	assert.match(itemSource, /burstPackageAbsoluteLabel\(item\)/)
	assert.match(appSource, /function burstPackageTimeLabel\(/)
	assert.match(appSource, /function burstPackageAbsoluteLabel\(/)
	assert.match(insertSource, /timeMs,\s*\n\s*requestedTimeMs:\s*timeMs/)
	assert.match(insertSource, /phaseStartMs:\s*phaseInfo\.phaseId === 'all' \? undefined : Number\(phaseInfo\.absoluteTimeMs \?\? timeMs\) - Number\(phaseInfo\.phaseTimeMs \?\? 0\)/)
	assert.match(css, /\.burst-package-time\s*\{/)
	assert.match(css, /\.burst-package-absolute\s*\{/)
	assert.match(css, /\.xiva-item\.burst-package\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s)
	assert.doesNotMatch(css, /\.xiva-item\.burst-package\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/s)
})

test('manual burst packages stay draggable and obey 60 or 120 second cooldown windows', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))
	const queueSource = appSource.slice(appSource.indexOf('function normalizeManualQueue('), appSource.indexOf('function nextManualReadyTime('))
	const readySource = appSource.slice(appSource.indexOf('function nextManualReadyTime('), appSource.indexOf('function baselineConflictsWithManual('))
	const cooldownKeySource = appSource.slice(appSource.indexOf('function manualCooldownKey('), appSource.indexOf('function manualActionRecastMs('))
	const recastSource = appSource.slice(appSource.indexOf('function manualActionRecastMs('), appSource.indexOf('function manualActionQueueLockMs('))
	const baselineSource = appSource.slice(appSource.indexOf('function timelineCooldownBaselineEvents('), appSource.indexOf('function applyCooldownUsage('))
	const insertSource = appSource.slice(appSource.indexOf('function insertBurstPackageAtMs('), appSource.indexOf('function insertSkillAtMs('))

	assert.match(itemSource, /const editableBurstPackage = canEditTimeline\(\) && Boolean\(item\.manualId\)/)
	assert.match(itemSource, /data-manual-id="\$\{item\.manualId\}"/)
	assert.match(itemSource, /draggable="\$\{editableBurstPackage \? 'true' : 'false'\}"/)
	assert.match(itemSource, /burst-package-adjusted/)
	assert.match(cooldownKeySource, /event\.type === 'burst-package'/)
	assert.match(cooldownKeySource, /`burst-package:\$\{event\.window \?\? '60s'\}`/)
	assert.match(recastSource, /event\.type === 'burst-package'/)
	assert.match(recastSource, /burstWindowForTime\(event,\s*Number\(event\.timeMs \?\? event\.startMs \?\? 0\),\s*0\) === '120s' \? 120000 : 60000/)
	assert.match(readySource, /if \(event\.type === 'burst-package'\)/)
	assert.match(readySource, /return cooldownKey && recastMs > 0\s*\?\s*Math\.max\(requestedTimeMs,\s*Number\(nextReadyByKey\.get\(cooldownKey\) \?\? 0\)\)\s*:\s*requestedTimeMs/s)
	assert.match(baselineSource, /buildBurstPackageItems\(track\.burst \?\? state\.model\.tracks\.beginner\?\.burst \?\? \[\]\)/)
	assert.match(queueSource, /manualCooldownKey\(event,\s*action\)/)
	assert.match(insertSource, /const inserted = state\.inserted\.find\(item => item\.id === manualId\)/)
	assert.match(insertSource, /已顺延到/)
	assert.match(css, /\.burst-package-adjusted\s*\{/)
	assert.match(css, /\.xiva-item\.burst-package\.editable\s*\{/)
}
)

test('QT timeline controls render a visible fallback icon', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))

	assert.match(appSource, /function renderTimelineIcon\(/)
	assert.match(itemSource, /renderTimelineIcon\(item,\s*itemLabel\)/)
	assert.match(appSource, /item\.kind === 'qt-control'/)
	assert.match(appSource, /class="skill-icon fallback qt-fallback"/)
	assert.match(css, /\.xiva-item\.action span\.skill-icon/)
	assert.match(css, /\.skill-icon\.qt-fallback\s*\{/)
	assert.match(css, /\.xiva-item \.skill-icon\.qt-fallback\s*\{[^}]*background:/s)
})

test('QT timeline controls are compacted into one icon per close timing group', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const outputLaneSource = appSource.slice(appSource.indexOf('function buildOutputLaneItems('), appSource.indexOf('function buildMitigationLaneItems('))
	const mitigationLaneSource = appSource.slice(appSource.indexOf('function buildMitigationLaneItems('), appSource.indexOf('function buildBurstLaneItems('))
	const burstLaneSource = appSource.slice(appSource.indexOf('function buildBurstLaneItems('), appSource.indexOf('function buildQtLaneItems('))
	const qtLaneSource = appSource.slice(appSource.indexOf('function buildQtLaneItems('), appSource.indexOf('function compactTimelineQtEvents('))
	const compactSource = appSource.slice(appSource.indexOf('function compactTimelineQtEvents('), appSource.indexOf('function qtCompactBucketMs('))
	const renderSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderPendingTargetPickerOverlay('))

	assert.doesNotMatch(outputLaneSource, /compactTimelineQtEvents/)
	assert.doesNotMatch(mitigationLaneSource, /compactTimelineQtEvents/)
	assert.doesNotMatch(burstLaneSource, /compactTimelineQtEvents/)
	assert.match(qtLaneSource, /compactTimelineQtEvents\(qtSource\)/)
	assert.match(compactSource, /const key = `\$\{timelineFunctionalLane\(event\)\}\|\$\{qtCompactBucketMs\(event\)\}`/)
	assert.match(compactSource, /eventCount:\s*group\.items\.length/)
	assert.match(compactSource, /const qtStates = group\.items\.flatMap/)
	assert.match(compactSource, /qtStates,\s*\n\s*qtSummary:/)
	assert.match(compactSource, /label:\s*'QT'/)
	assert.match(renderSource, /item\.qtSummary/)
	assert.match(renderSource, /class="xiva-item \$\{item\.type\} qt-group/)
	assert.match(css, /\.xiva-item\.qt-group\s*\{/)
	assert.match(css, /\.xiva-item\.qt-group \.item-count\s*\{/)
	assert.match(css, /\.xiva-item\.qt span\.skill-icon\s*\{/)
})

test('QT controls have a dedicated row and cannot be dropped into other lanes', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const buildRows = appSource.slice(appSource.indexOf('function buildVisualTimelineRows('), appSource.indexOf('function limitVisibleTimelineRowItems('))
	const functionalLaneSource = appSource.slice(appSource.indexOf('function timelineFunctionalLane('), appSource.indexOf('function timelineEventType('))
	const dropLaneSource = appSource.slice(appSource.indexOf('function timelineDropLaneForRow('), appSource.indexOf('function timelineDropLaneForTarget('))
	const canDropQtSource = appSource.slice(appSource.indexOf('function canDropQtOnTimelineLane('), appSource.indexOf('function renderTimelineRowLabel('))
	const insertQtTimelineSource = appSource.slice(appSource.indexOf('function insertQtAtTimeline('), appSource.indexOf('function insertQtAtClientPoint('))
	const insertQtClientSource = appSource.slice(appSource.indexOf('function insertQtAtClientPoint('), appSource.indexOf('function insertPotionAtTimeline('))
	const outputLaneSource = appSource.slice(appSource.indexOf('function buildOutputLaneItems('), appSource.indexOf('function buildMitigationLaneItems('))
	const mitigationLaneSource = appSource.slice(appSource.indexOf('function buildMitigationLaneItems('), appSource.indexOf('function buildBurstLaneItems('))
	const burstLaneSource = appSource.slice(appSource.indexOf('function buildBurstLaneItems('), appSource.indexOf('function buildQtLaneItems('))

	assert.match(buildRows, /id:\s*'qt-controls',\s*label:\s*'QT \u63a7\u5236'/)
	assert.match(buildRows, /id:\s*'qt-controls',\s*label:\s*'QT \u63a7\u5236',\s*accent:\s*'sky',\s*keepWhenEmpty:\s*true/)
	assert.match(functionalLaneSource, /event\.kind === 'qt-control' \|\| event\.classification === 'qt' \|\| event\.type === 'qt'\)\s*\{\s*return 'qt'/)
	assert.match(dropLaneSource, /row\.id === 'qt-controls'\)\s*return 'qt'/)
	assert.match(canDropQtSource, /return dropLane === 'qt'/)
	assert.match(insertQtTimelineSource, /if \(!canDropQtOnTimelineLane\(dropLane\)\)/)
	assert.match(insertQtTimelineSource, /QT \u53ea\u80fd\u653e\u5230 QT \u63a7\u5236\u884c/)
	assert.match(insertQtClientSource, /if \(!canDropQtOnTimelineLane\(dropLane\)\)/)
	assert.match(insertQtClientSource, /QT \u53ea\u80fd\u653e\u5230 QT \u63a7\u5236\u884c/)
	assert.doesNotMatch(outputLaneSource, /compactTimelineQtEvents/)
	assert.doesNotMatch(mitigationLaneSource, /compactTimelineQtEvents/)
	assert.doesNotMatch(burstLaneSource, /compactTimelineQtEvents/)
})

test('non-boss timeline rows reserve visual spacing for close skill times', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const rowSource = appSource.slice(appSource.indexOf('function renderTimelineRow('), appSource.indexOf('function timelineDropLaneForRow('))

	assert.match(appSource, /const PLAYER_TIMELINE_ITEM_WIDTH_PX = 42/)
	assert.match(appSource, /const PLAYER_TIMELINE_ITEM_GAP_PX = 8/)
	assert.match(appSource, /const BOSS_CAST_MIN_VISUAL_WIDTH_PX = 148/)
	assert.match(appSource, /const BOSS_CAST_VISUAL_GAP_PX = 8/)
	assert.match(rowSource, /minVisualWidthPx:\s*row\.groupId === 'boss' \? BOSS_CAST_MIN_VISUAL_WIDTH_PX : PLAYER_TIMELINE_ITEM_WIDTH_PX/)
	assert.match(rowSource, /minVisualGapPx:\s*row\.groupId === 'boss' \? BOSS_CAST_VISUAL_GAP_PX : PLAYER_TIMELINE_ITEM_GAP_PX/)
	assert.match(rowSource, /laneGapMs:\s*0/)
})

test('timeline import exposes visible status and errors instead of failing silently', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /importStatus:\s*''/)
	assert.match(appSource, /importError:\s*''/)
	assert.match(appSource, /function renderImportFeedback\(/)
	assert.match(appSource, /class="import-feedback/)
	assert.match(appSource, /try\s*\{/)
	assert.match(appSource, /catch \(error\)/)
	assert.match(appSource, /setImportError\(/)
	assert.match(appSource, /setImportStatus\(/)
	assert.match(css, /\.import-feedback\s*\{/)
	assert.match(css, /\.import-feedback\.error\s*\{/)
})

test('default timeline import buttons fetch bundled static timeline fixtures without double encoding', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const importsSource = appSource.slice(
		appSource.indexOf('const DEFAULT_TIMELINE_IMPORTS = ['),
		appSource.indexOf('function assetUrl('),
	)
	const importDefaultSource = appSource.slice(
		appSource.indexOf('async function importDefaultTimeline'),
		appSource.indexOf('async function importTimelineFile'),
	)

	assert.match(importsSource, /id:\s*'kano-drk'/)
	assert.match(importsSource, /id:\s*'whm-02'/)
	assert.match(importsSource, /assetUrl\('\.\/resources\/timelines\/时间轴参考\/KANO_DRK_妖星乱舞绝境战_MT减伤轴\.json'\)/)
	assert.match(importsSource, /assetUrl\('\.\/resources\/timelines\/时间轴参考\/绝妖星白触发轴WHM02\.json'\)/)
	assert.match(importDefaultSource, /fetch\(source\.url\)/)
	assert.doesNotMatch(importDefaultSource, /fetch\(encodeURI\(source\.url\)\)/)
})

test('default timeline export writes a native PR timeline without duplicating WebTimeline payload', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const exportTimelineSource = appSource.slice(appSource.indexOf('function exportTimeline('), appSource.indexOf('function buildNativePrExportFromState('))
	const nativeExportSource = appSource.slice(appSource.indexOf('function buildNativePrExportFromState('), appSource.indexOf('function buildWebTimelineExportFromState('))

	assert.match(exportTimelineSource, /const payload = buildNativePrExportFromState\(\)/)
	assert.doesNotMatch(exportTimelineSource, /buildWebTimelineExportFromState\(/)
	assert.match(nativeExportSource, /return exportNativePrTimeline\(\)/)
	assert.doesNotMatch(nativeExportSource, /schemaVersion|player:|output:|mitigation:|categories:/)
})

test('WebTimeline project export schema stays available for round-tripping', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const schemaSource = appSource.slice(appSource.indexOf('function buildWebTimelineExportFromState('), appSource.indexOf('function exportNativePrTimeline('))

	assert.match(schemaSource, /schemaVersion:\s*1/)
	assert.match(schemaSource, /meta:\s*\{/)
	assert.match(schemaSource, /phases:\s*exportPhaseWindows\(/)
	assert.match(schemaSource, /boss:\s*exportBossTimeline\(/)
	assert.match(schemaSource, /player:\s*exportPlayerTimeline\(/)
	assert.match(schemaSource, /burstPackages:\s*buildBurstPackageItems\(/)
	assert.match(schemaSource, /qt:\s*exportQtControls\(/)
	assert.match(schemaSource, /opener:\s*exportOpenerEvents\(/)
	assert.match(schemaSource, /focusedSkills:\s*\[\.\.\.state\.focusedSkills\]/)
	assert.match(schemaSource, /categories:\s*exportTimelineCategories\(/)
	assert.match(schemaSource, /manual:\s*state\.inserted\.map/)
	assert.match(appSource, /timelineJson\.schemaVersion === 1/)
})

test('timeline export preserves the imported PR Meta and Root for native plugin compatibility', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const exportSource = appSource.slice(appSource.indexOf('function buildWebTimelineExportFromState('), appSource.indexOf('function exportNativePrTimeline('))

	assert.match(exportSource, /const nativeTimeline = exportNativePrTimeline\(\)/)
	assert.match(exportSource, /Meta:\s*nativeTimeline\.Meta/)
	assert.match(exportSource, /Root:\s*nativeTimeline\.Root/)
	assert.match(appSource, /function exportNativePrTimeline\(/)
	assert.match(appSource, /state\.currentTimelineJson\?\.Root/)
	assert.match(appSource, /jsonClone\(state\.currentTimelineJson\.Root\)/)
	assert.match(appSource, /jsonClone\(state\.currentTimelineJson\.Meta\)/)
	assert.doesNotMatch(exportSource, /Root:\s*\{[\s\S]*?Children:\s*state\.inserted\.map/)
})

test('timeline import restores action durations from the skill database when exports omit them', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function importedEventDurationMs\(/)
	assert.match(appSource, /importedEventDurationMs\(event,\s*action,\s*fallbackKind\)/)
	assert.match(appSource, /Number\(action\?\.effectDurationMs \?\? 0\)/)
	assert.match(appSource, /event\.castDurationMs \?\? durationMs/)
	assert.doesNotMatch(appSource, /const durationMs = Number\(event\.durationMs \?\? 0\)\s*\n\s*return \{/)
})

test('PR timeline import uses the shared parser for parallel branches and boss cast sync', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /flattenPrTimeline/)
	assert.match(appSource, /collectBossCastItems/)
	assert.match(appSource, /resolveBossCastConditionTimeMs/)
	assert.match(appSource, /resolveConditionTimeMs:\s*\(condition,\s*cursorMs\)/)
	assert.doesNotMatch(appSource, /let cursorMs = 0[\s\S]*?function flattenImportedTimeline/)
})

test('imported PR boss sync conditions do not replace the existing boss timeline rows', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const visualRowsSource = appSource.slice(
		appSource.indexOf('function buildVisualTimelineRows'),
		appSource.indexOf('function buildOutputLaneItems'),
	)
	const mergeSource = appSource.slice(
		appSource.indexOf('function mergeImportedRowsWithBossTimeline'),
		appSource.indexOf('function buildImportedBurstGroups'),
	)

	assert.match(visualRowsSource, /parsedMergedBossRows/)
	assert.match(visualRowsSource, /parsedMergedBossRows\.length/)
	assert.match(visualRowsSource, /parsedMergedBossRows\.length\s*\n\s*\t\t\t\?\s*parsedMergedBossRows/)
	assert.match(visualRowsSource, /mergeBossCastAndDamageRows\(\[\.\.\.bossCastRows,\s*\.\.\.bossDamageRows\]\)/)
	assert.doesNotMatch(visualRowsSource, /const boss = track\.boss/)
	assert.doesNotMatch(visualRowsSource, /track\.boss\.slice/)
	assert.match(mergeSource, /return id === 'boss' \|\| id === 'boss-casts' \|\| id === 'boss-damage'/)
	assert.doesNotMatch(mergeSource, /return id === 'boss-casts' \|\| id === 'boss-damage'/)
})

test('focus skill control is clickable from the row label and keeps empty tracked rows visible', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function renderFocusAddLabel\(/)
	assert.match(appSource, /data-action="open-focus-picker"/)
	assert.match(appSource, /keepWhenEmpty:\s*true/)
	assert.match(appSource, /data-action="remove-focused-skill"/)
})

test('focus-add row renders a single focus button only in the label area, not in the timeline content', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	// The label-area button is the sole entry point for adding focused skills.
	assert.match(appSource, /function renderFocusAddLabel\(/)
	assert.match(appSource, /labelHtml:\s*renderFocusAddLabel\(\)/)

	// The content-area control that previously duplicated the button must be gone.
	assert.equal(appSource.includes('function renderFocusAddRow('), false)
	assert.equal(appSource.includes('html: renderFocusAddRow()'), false)
	assert.equal(appSource.includes('focus-add-control'), false)

	// The open-focus-picker action must still be wired so the kept button works.
	assert.match(appSource, /data-action="open-focus-picker"/)
})

test('focus skill tracker renders every occurrence with icon, time and source labels', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function focusTrackerItemForEvent\(/)
	assert.match(appSource, /function focusSourceLabel\(/)
	assert.match(appSource, /function uniqueFocusEvents\(/)
	assert.match(appSource, /function focusEventKey\(/)
	assert.match(appSource, /uniqueFocusEvents\(\[/)
	assert.match(appSource, /focus-tracker-item/)
	assert.match(appSource, /focus-tracker-source/)
	assert.match(appSource, /ACR 自动/)
	assert.match(appSource, /用户手动/)
	assert.match(appSource, /\u5bfc\u5165\u65f6\u95f4\u8f74/)
	assert.match(appSource, /type:\s*'focus-tracker'/)
	assert.match(appSource, /sourceLabel:\s*focusSourceLabel\(event\)/)
	assert.match(css, /\.xiva-item\.focus-tracker\s*\{/)
	assert.match(css, /\.focus-tracker-source\s*\{/)
})

test('focus skill tracker uses the selected skill name and exposes all current job skills', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /label:\s*skill\?\.name\s*\?\?\s*event\.name/)
	assert.match(appSource, /eventLabel:\s*event\.name/)
	assert.equal(appSource.includes('.slice(0, 96)'), false)
	assert.equal(appSource.includes("String(event?.id ?? event?.name ?? '')"), false)
})

test('P1 focus control is presented as a skill tracker instead of a plain follow list', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /\$\{t\('focus\.eyebrow'\)\}/)
	assert.match(appSource, /t\('focus\.help'\)/)
	assert.match(appSource, /placeholder="\$\{t\('focus\.searchPlaceholder'\)\}"/)
	assert.match(css, /\.focus-tracker-help\s*\{/)
})

test('focus skill picker separates current job skills from collapsed other skills', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function groupedFocusCandidates\(/)
	assert.match(appSource, /function isCurrentJobFocusSkill\(/)
	assert.doesNotMatch(appSource, /function focusCandidatesForCurrentJob\(/)
	assert.match(appSource, /const timelineActionIds = new Set/)
	assert.match(appSource, /isCurrentJobFocusSkill\(skill\) && timelineActionIds\.has\(String\(skill\.id\)\)/)
	assert.match(appSource, /\u5f53\u524d\u804c\u4e1a\u6280\u80fd/)
	assert.match(appSource, /\u5176\u4ed6\u6280\u80fd/)
	assert.match(appSource, /<details class="focus-skill-section other-skills"/)
	assert.match(appSource, /id:\s*'current-job'/)
	assert.match(appSource, /renderFocusSkillGrid\(groups\.other,\s*'other-skills'\)/)
	assert.match(appSource, /data-focus-section="\$\{id\}"/)
	assert.match(css, /\.focus-skill-section\s*\{/)
	assert.match(css, /\.focus-skill-section\.other-skills\s*>\s*summary\s*\{/)
	assert.match(css, /\.focus-skill-section-heading\s*\{/)
})

test('P1 ACR database modal shows status, author, source and placeholders for every job', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function acrSupportStatus\(/)
	assert.match(appSource, /function renderAcrStatusBadge\(/)
	assert.match(appSource, /function renderAcrField\(/)
	assert.match(appSource, /function publicAcrSourceLabel\(/)
	assert.match(appSource, /'acr\.status\.supported':/)
	assert.match(appSource, /'acr\.status\.unsupported':/)
	assert.match(appSource, /'acr\.status\.waiting':/)
	assert.match(appSource, /'acr\.field\.author':/)
	assert.match(appSource, /'acr\.field\.source':/)
	assert.match(appSource, /t\('acr\.field\.source'\),\s*publicAcrSourceLabel\(primaryAcr\?\.source \?\? model\.skillDatabase\?\.source\?\.name\)/)
	assert.match(appSource, /title="\$\{publicAcrSourceLabel\(acr\.source\)\}"/)
	assert.match(appSource, /<small>\$\{publicAcrSourceLabel\(acr\.source\)\}<\/small>/)
	assert.match(appSource, /支持状态：/)
	assert.match(css, /\.acr-status\s*\{/)
	assert.match(css, /\.acr-status\.supported\s*\{/)
	assert.match(css, /\.acr-status\.unsupported\s*\{/)
	assert.match(css, /\.acr-status\.waiting\s*\{/)
})

test('P1 job and ACR selectors expose current state and unknown fallbacks', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function renderJobAcrStatus\(/)
	assert.match(appSource, /当前选择/)
	assert.match(appSource, /\u804c\u4e1a\uff1a/)
	assert.match(appSource, /ACR\uff1a/)
	assert.match(appSource, /unknown/)
	assert.match(appSource, /\u672a\u6307\u5b9a/)
	assert.match(appSource, /等待接入/)
	assert.match(css, /\.job-acr-status\s*\{/)
	assert.match(css, /\.job-acr-status \.current\s*\{/)
})

test('P1 boss cast cards expose cast, release, end, damage and high damage state', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /highDamageClass/)
	assert.match(appSource, /noDamageClass/)
	assert.match(appSource, /cast-start/)
	assert.match(appSource, /释放判定/)
	assert.match(appSource, /结束/)
	assert.match(appSource, /formatDamage\(damage\)/)
	assert.match(css, /\.xiva-item\.cast\.high-damage\s*\{/)
	assert.match(css, /\.xiva-item\.cast\.no-damage\s*\{/)
	assert.match(css, /\.cast-start\s*\{/)
})

test('P1 boss damage cards keep name, resolve time and damage readable', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /if \(isDamage\) \{/)
	assert.match(appSource, /boss-damage-card/)
	assert.match(appSource, /boss-damage-name/)
	assert.match(appSource, /boss-damage-meta/)
	assert.match(appSource, /boss-damage-time/)
	assert.match(appSource, /boss-damage-value/)
	assert.match(appSource, /判定 \$\{startTimeLabel\}/)
	assert.match(css, /\.xiva-item\.damage\.boss-damage-card\s*\{/)
	assert.match(css, /\.boss-damage-name\s*\{/)
	assert.match(css, /\.boss-damage-meta\s*\{/)
	assert.match(css, /\.boss-damage-time\s*\{/)
	assert.match(css, /\.boss-damage-value\s*\{/)
	assert.match(css, /min-width:\s*148px/)
})

test('P1 boss cast and damage cards share lane spacing to avoid global phase overlap', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /const bossLaneTop = `calc\(7px \+ \$\{lane\} \* 62px\)`/)
	assert.match(appSource, /class="xiva-item cast [^"]+" style="left:\$\{start\}%; top:\$\{bossLaneTop\};/)
	assert.match(appSource, /class="xiva-item damage boss-damage-card" style="left:\$\{start\}%; top:\$\{bossLaneTop\};/)
	assert.doesNotMatch(appSource, /top:calc\(7px \+ \$\{lane\} \* 58px\)/)
	assert.doesNotMatch(appSource, /top:calc\(7px \+ \$\{lane\} \* 46px\)/)
})

test('boss cast and damage cards reserve readable lane width without using oversized labels', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const rowSource = appSource.slice(appSource.indexOf('function renderTimelineRow('), appSource.indexOf('function timelineDropLaneForRow('))
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineIcon('))

	assert.match(appSource, /const BOSS_CAST_MIN_VISUAL_WIDTH_PX = 148/)
	assert.match(appSource, /const BOSS_CAST_VISUAL_GAP_PX = 8/)
	assert.match(rowSource, /minVisualWidthPx:\s*row\.groupId === 'boss' \? BOSS_CAST_MIN_VISUAL_WIDTH_PX : PLAYER_TIMELINE_ITEM_WIDTH_PX/)
	assert.match(rowSource, /laneGapMs:\s*0/)
	assert.doesNotMatch(rowSource, /minVisualWidthPx:\s*row\.groupId === 'boss' \? 180/)
	assert.doesNotMatch(itemSource, /item\.type === `cast` \? 0\.8/)
	assert.match(itemSource, /item\.type === `cast` \? 0\.18/)
	assert.doesNotMatch(css, /\.xiva-item\.cast\s*\{[^}]*min-width:\s*168px/s)
	assert.match(css, /\.xiva-item\.cast\s*\{[^}]*min-width:\s*132px/s)
	assert.match(css, /\.xiva-item\.cast\s*\{[^}]*overflow:\s*hidden/s)
})

test('P5 point-type timeline items are clamped so they do not overflow the track right edge', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineIcon('))

	assert.match(itemSource, /isPointItem/)
	assert.match(itemSource, /maxPointLeftPercent/)
	assert.match(itemSource, /readablePointItemWidthPx/)
	assert.match(itemSource, /const start = isPointItem \? Math\.min\(rawStart, maxPointLeftPercent\) : rawStart/)
	assert.match(itemSource, /renderTimelineItem\(item, maxTime, bossIndex, timelineWidth = 0\)/)
	assert.match(appSource, /renderTimelineItem\(item, maxTime, row\.bossIndex, timelineWidth\)/)
})

test('timeline player skill cards keep names and times readable', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.gcd,\s*\.xiva-item\.action,\s*\.xiva-item\.manual,\s*\.xiva-item\.simulated-gcd,\s*\.xiva-item\.simulated-action\s*\{[^}]*width:\s*var\(--readable-point-width\)/s)
	assert.match(css, /\.xiva-item\.gcd span,\s*\.xiva-item\.action span,\s*\.xiva-item\.manual span,\s*\.xiva-item\.simulated-gcd span,\s*\.xiva-item\.simulated-action span,\s*\.xiva-item\.gcd small,\s*\.xiva-item\.action small,\s*\.xiva-item\.manual small,\s*\.xiva-item\.simulated-gcd small,\s*\.xiva-item\.simulated-action small\s*\{[^}]*display:\s*block/s)
	assert.doesNotMatch(css, /\.xiva-item\.simulated-gcd span,\s*\.xiva-item\.simulated-action span,\s*\.xiva-item\.gcd small,[\s\S]*?display:\s*none/)
})

test('duration skill bars preserve their timeline-scaled width', async () => {
	const css = await readFile('public/styles.css', 'utf8')
	const durationBlocks = Array.from(css.matchAll(/\.xiva-item\.(?:mitigation|healing|dot)\s*\{[^}]*\}/g)).map(match => match[0]).join('\n')

	assert.doesNotMatch(durationBlocks, /min-width:\s*(?:8[2-9]|9\d|1\d{2,})px/)
	assert.match(css, /\.xiva-item\.mitigation,\s*\.xiva-item\.healing,\s*\.xiva-item\.dot\s*\{[^}]*min-width:\s*0/s)
	assert.match(css, /\.xiva-item\.mitigation,\s*\.xiva-item\.healing,\s*\.xiva-item\.dot\s*\{[^}]*overflow:\s*visible/s)
	assert.match(css, /\.xiva-item\.mitigation span,\s*\.xiva-item\.healing span,\s*\.xiva-item\.dot span\s*\{[^}]*max-width:\s*12ch/s)
})

test('duration skill labels stay readable without stretching the duration bar', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.mitigation span,\s*\.xiva-item\.healing span,\s*\.xiva-item\.dot span\s*\{[^}]*flex:\s*0\s+0\s+auto/s)
	assert.match(css, /\.xiva-item\.mitigation span,\s*\.xiva-item\.healing span,\s*\.xiva-item\.dot span\s*\{[^}]*min-width:\s*max-content/s)
	assert.match(css, /\.xiva-item\.mitigation span,\s*\.xiva-item\.healing span,\s*\.xiva-item\.dot span\s*\{[^}]*overflow:\s*visible/s)
	assert.match(css, /\.xiva-item\.mitigation small,\s*\.xiva-item\.healing small,\s*\.xiva-item\.dot small\s*\{[^}]*margin-left:\s*6px/s)
})

test('P5 bar-type timeline items have width clamped so they do not exceed the track right edge', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const itemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineIcon('))

	assert.match(itemSource, /100 - start/)
	assert.match(itemSource, /Math\.max\(0, Math\.min\(/)
})

test('output lane deduplicates items with the same actionId, time and type', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const outputSource = appSource.slice(appSource.indexOf('function buildOutputLaneItems('), appSource.indexOf('function buildMitigationLaneItems('))

	assert.match(outputSource, /return sortTimelineItems\(uniqueTimelineDisplayEvents\(\[\.\.\.playerItems, \.\.\.manualItems\]\)\)/)
	assert.doesNotMatch(outputSource, /compactTimelineQtEvents/)
})

test('P1 timeline skill source badges use consistent labels and colors', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function sourceClassForTimelineItem\(/)
	assert.match(appSource, /function sourceLabelForTimelineItem\(/)
	assert.match(appSource, /source-badge/)
	assert.match(appSource, /data-source-kind="\$\{sourceKind\}"/)
	assert.match(appSource, /ACR 自动/)
	assert.match(appSource, /用户手动/)
	assert.match(appSource, /\u5bfc\u5165\u65f6\u95f4\u8f74/)
	assert.match(appSource, /\u7206\u53d1\u836f/)
	assert.match(appSource, /减伤/)
	assert.match(appSource, /治疗/)
	assert.match(css, /\.source-badge\s*\{/)
	assert.match(css, /\.xiva-item\.source-acr\s+\.source-badge\s*\{/)
	assert.match(css, /\.xiva-item\.source-manual\s+\.source-badge\s*\{/)
	assert.match(css, /\.xiva-item\.source-import\s+\.source-badge\s*\{/)
	assert.match(css, /\.xiva-item\.source-mitigation\s+\.source-badge\s*\{/)
	assert.match(css, /\.xiva-item\.source-healing\s+\.source-badge\s*\{/)
	assert.match(css, /\.xiva-item\.source-potion\s+\.source-badge\s*\{/)
})

test('P2 detail panel exposes a full-page overview across timeline sections', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /id:\s*'overview'/)
	assert.match(appSource, /label:\s*t\('overview\.title'\)/)
	assert.match(appSource, /overviewVisibleSections:\s*\{/)
	assert.match(appSource, /function renderOverviewPanel\(/)
	assert.match(appSource, /function renderOverviewSectionToggles\(/)
	assert.match(appSource, /function overviewSections\(/)
	assert.match(appSource, /data-overview-section-toggle/)
	assert.match(appSource, /Boss 读条/)
	assert.match(appSource, /减伤 \/ 奶轴/)
	assert.match(appSource, /\u8f93\u51fa\u8f74/)
	assert.match(appSource, /爆发药轴/)
	assert.match(appSource, /起手/)
	assert.match(appSource, /QT/)
	assert.match(appSource, /爆发/)
	assert.match(appSource, /overview-section/)
	assert.match(appSource, /overview-count/)
	assert.match(css, /\.overview-grid\s*\{/)
	assert.match(css, /\.overview-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
	assert.match(css, /\.overview-section\s*\{/)
	assert.match(css, /\.overview-section-toggles\s*\{/)
	assert.match(css, /\.overview-section-toggle\s*\{/)
	assert.match(css, /\.overview-count\s*\{/)
})

test('overview section toggles include Boss 读条 as a toggleable section', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const togglesSource = appSource.slice(
		appSource.indexOf('const OVERVIEW_SECTION_TOGGLES = ['),
		appSource.indexOf('const PLAYER_TIMELINE_ITEM_WIDTH_PX'),
	)
	const stateSource = appSource.slice(
		appSource.indexOf('overviewVisibleSections: {'),
		appSource.indexOf('showFocusPicker'),
	)
	const overviewSectionsSource = appSource.slice(
		appSource.indexOf('function overviewSections('),
		appSource.indexOf('function renderBurstGroupsInDetailPanel('),
	)

	assert.match(togglesSource, /\{id: 'boss', labelKey: 'overview\.boss'\}/)
	assert.match(stateSource, /boss:\s*true/)
	assert.doesNotMatch(overviewSectionsSource, /section\.id === 'boss' \|\| overviewSectionVisible/)
	assert.match(overviewSectionsSource, /sections\.filter\(section => overviewSectionVisible\(section\.id\)\)/)
})

test('overview opener section keeps opener events visible across selected phases', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const detailPanelEventsSource = appSource.slice(
		appSource.indexOf('function detailPanelEvents('),
		appSource.indexOf('function outputDetailEvents('),
	)
	const overviewSectionsSource = appSource.slice(
		appSource.indexOf('function overviewSections('),
		appSource.indexOf('function renderBurstGroupsInDetailPanel('),
	)
	const importSource = appSource.slice(
		appSource.indexOf('function buildImportedTimelineModel('),
		appSource.indexOf('function buildModelFromExportTimeline('),
	)

	assert.match(appSource, /function openerDetailEvents\(/)
	assert.match(detailPanelEventsSource, /if \(panel\.id === 'opener'\) \{\s*return openerDetailEvents\(panel\)/)
	assert.match(overviewSectionsSource, /\{id:\s*'opener',\s*label:\s*t\('overview\.opener'\),\s*events:\s*openerDetailEvents\(openerPanel\)\}/)
	assert.doesNotMatch(overviewSectionsSource, /\{id:\s*'opener'[\s\S]*?detailPanelEvents\(openerPanel\)/)
	assert.match(importSource, /classification:\s*event\.classification \?\? 'opener'/)
	assert.match(importSource, /opener:\s*true/)
})

test('overview section toggles are decoupled from the right skill library', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const rightPanelSource = appSource.slice(
		appSource.indexOf('function renderOverviewPanel('),
		appSource.indexOf('function renderOverviewSectionToggles('),
	)
	const toggleFnSource = appSource.slice(
		appSource.indexOf('function toggleOverviewSection('),
		appSource.indexOf('function overviewSections('),
	)
	const clickSource = appSource.slice(
		appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('toggle'"))

	// The overview panel must NOT render the right skill library
	assert.doesNotMatch(rightPanelSource, /renderRightSkillLibrary/)
	assert.doesNotMatch(rightPanelSource, /right-skill-library/)
	// The overview section toggle checkbox must still exist
	assert.match(appSource, /data-overview-section-toggle/)
	assert.match(appSource, /function renderOverviewSectionToggles\(/)
	// toggleOverviewSection must only modify overviewVisibleSections, not rightSkillCategory
	assert.match(toggleFnSource, /state\.overviewVisibleSections\[id\] = visible == null \? !overviewSectionVisible\(id\) : Boolean\(visible\)/)
	assert.doesNotMatch(toggleFnSource, /rightSkillCategory/)
	// The data-right-skill-category click handler must be removed (no longer rendered)
	assert.doesNotMatch(clickSource, /dataset\.rightSkillCategory/)
	// Trace/locate logic must still be preserved
	assert.match(appSource, /data-action="trace-skill-on-timeline"/)
	assert.match(appSource, /data-action="locate-timeline-event"/)
	assert.match(appSource, /function traceSkillOnTimeline\(/)
})

test('right detail sidebar uses a single overview title without tab headers', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const rightLibrarySource = appSource.slice(
		appSource.indexOf('function renderRightSkillLibrary('),
		appSource.indexOf('function overviewSectionVisible('),
	)
	const rightPanelSource = appSource.slice(
		appSource.indexOf('function renderOverviewPanel('),
		appSource.indexOf('function renderOverviewSectionToggles('),
	)

	assert.match(appSource, /class="detail-list overview-panel right-workbench"/)
	assert.match(appSource, /class="right-card right-overview-card"/)
	// renderRightSkillLibrary function is retained for future use but must NOT be called from the overview panel
	assert.match(appSource, /function renderRightSkillLibrary\(/)
	assert.match(appSource, /function renderRightSkillItem\(/)
	assert.doesNotMatch(rightPanelSource, /renderRightSkillLibrary/)
	assert.doesNotMatch(rightPanelSource, /right-skill-library/)
	assert.doesNotMatch(rightPanelSource, /right-skill-list/)
	assert.match(appSource, /class="overview-list"/)
	assert.match(appSource, /class="overview-row" data-overview-expand=/)
	assert.match(appSource, /class="overview-row-count"/)
	assert.match(appSource, /class="overview-sim-toggle/)
	assert.match(rightPanelSource, /<h3>\$\{t\('overview\.title'\)\}<\/h3>/)
	assert.doesNotMatch(rightPanelSource, /class="right-card-tabs"/)
	assert.doesNotMatch(rightPanelSource, /renderOutputSimulationControl\(\)/)
	assert.match(rightLibrarySource, /data-action="trace-skill-on-timeline" data-trace-skill-id="\$\{escapeHtml\(actionId\s*\|\|\s*relatedIds\[0\]\)\}"/)
	assert.doesNotMatch(rightLibrarySource, /data-focus-skill/)
	assert.doesNotMatch(rightLibrarySource, /state\.focusedSkills\.includes\(actionId\)/)
	assert.doesNotMatch(rightLibrarySource, /addFocusedSkill/)
	assert.doesNotMatch(rightLibrarySource, /class="right-card-tabs"/)
	assert.doesNotMatch(rightLibrarySource, /class="right-library-note"/)
	assert.doesNotMatch(rightLibrarySource, /data-toggle="acr-simulation"/)
	assert.doesNotMatch(rightLibrarySource, /自动轴线|导入轴线/)
	assert.doesNotMatch(rightLibrarySource, /data-action="quick-insert-skill"/)
	assert.doesNotMatch(rightLibrarySource, /data-action="quick-insert-burst"/)
	assert.doesNotMatch(rightLibrarySource, /data-action="quick-insert-potion"/)
	assert.doesNotMatch(rightLibrarySource, /data-action="insert-skill"/)
	assert.doesNotMatch(rightLibrarySource, /data-action="toggle-qt-draft"/)
	assert.doesNotMatch(rightLibrarySource, /data-drag-skill/)
	assert.doesNotMatch(rightLibrarySource, /data-drag-burst/)
	assert.doesNotMatch(rightLibrarySource, /data-drag-potion/)
	assert.doesNotMatch(rightLibrarySource, /data-drag-qt/)
	assert.doesNotMatch(rightPanelSource, /data-toggle="insert-drawer"/)
	assert.match(css, /\.right-workbench\s*\{/)
	assert.match(css, /\.right-card\s*\{/)
	assert.doesNotMatch(css, /\.right-card-tabs\s*\{/)
	assert.doesNotMatch(css, /\.right-library-note\s*\{/)
	assert.match(css, /\.overview-header\s*\{[^}]*min-height:\s*52px/s)
	assert.match(css, /\.overview-row\s*\{/)
	assert.match(css, /\.overview-row-count\s*\{/)
	assert.match(css, /\.overview-sim-toggle\s*\{/)
	assert.match(css, /\.right-skill-list\s*\{/)
	assert.match(css, /\.right-skill-item\s*\{/)
	assert.match(css, /\.right-skill-item\.tracked\s*\{/)
	assert.match(css, /\.right-module-card\s*\{/)
	assert.match(css, /\.right-module-card \.detail-collapse\s*\{/)
})

test('right skill library trace button locates timeline items without adding focused skills', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const rightLibrarySource = appSource.slice(
		appSource.indexOf('function renderRightSkillLibrary('),
		appSource.indexOf('function overviewSectionVisible('),
	)
	const rightItemSource = appSource.slice(
		appSource.indexOf('function renderRightSkillItem('),
		appSource.indexOf('function renderRightBurstItem('),
	)
	const timelineItemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))
	const clickSource = appSource.slice(appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('toggle'"))
	const traceFnSource = appSource.slice(appSource.indexOf('function traceSkillOnTimeline('), appSource.indexOf('function cssEscape('))

	assert.match(rightItemSource, /data-action="trace-skill-on-timeline"/)
	assert.match(rightItemSource, /data-trace-skill-id="\$\{escapeHtml\(actionId\s*\|\|\s*relatedIds\[0\]\)\}"/)
	assert.match(rightItemSource, /data-trace-skill-ids="\$\{escapeHtml\(relatedIds\.join\(','\)\)\}"/)
	assert.match(rightItemSource, /right-skill-count/)
	assert.doesNotMatch(rightItemSource, /data-focus-skill/)
	assert.doesNotMatch(rightItemSource, /state\.focusedSkills/)
	assert.doesNotMatch(rightItemSource, /addFocusedSkill|toggleFocusedSkill/)
	assert.match(timelineItemSource, /data-action-id="\$\{item\.actionId\}"/)
	assert.match(clickSource, /if \(action === 'trace-skill-on-timeline'\)/)
	assert.match(clickSource, /target\.dataset\.traceSkillIds/)
	assert.match(appSource, /function traceSkillOnTimeline\(/)
	assert.match(traceFnSource, /Array\.isArray\(actionIds\)/)
	assert.match(traceFnSource, /ids\.map\(id => `\[data-action-id="\$\{cssEscape\(id\)\}"\]/)
	assert.match(traceFnSource, /flashTimelineTraceElement\(target\)/)
	assert.match(traceFnSource, /state\.lastTracedSkillId = primaryId/)
	assert.match(traceFnSource, /el\.offsetParent !== null/)
	assert.match(traceFnSource, /当前 P 没有这个技能/)
	assert.match(traceFnSource, /时间轴里没有这个技能/)
	assert.doesNotMatch(traceFnSource, /state\.phase\s*=\s*'all'/)
	assert.doesNotMatch(traceFnSource, /addFocusedSkill|toggleFocusedSkill|state\.focusedSkills\.push/)
	assert.match(appSource, /function uniqueSkillLibraryItems\(/)
	assert.match(appSource, /function flashTimelineTraceElement\(/)
	assert.match(appSource, /'timeline-trace-flash'/)
	assert.match(css, /\.xiva-item\.timeline-trace-flash\s*\{/)
	assert.match(css, /@keyframes timelineTraceFlash[\s\S]*outline:\s*3px solid #1f6feb/)
	assert.match(css, /\.right-skill-item\.right-skill-traced\s*\{/)
	assert.match(css, /\.right-skill-count\s*\{/)
	assert.match(appSource, /lastTracedSkillId:\s*null/)
	// The dedicated "+ 关注技能" picker is still the only path that adds focused skills.
	assert.match(appSource, /data-action="open-focus-picker"/)
	assert.doesNotMatch(rightLibrarySource, /data-action="open-focus-picker"/)
})

test('overview panel sections expand and collapse with event list on click', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const panelSource = appSource.slice(appSource.indexOf('function renderOverviewPanel('), appSource.indexOf('function renderOverviewSectionToggles('))
	const sectionSource = appSource.slice(appSource.indexOf('function renderOverviewSection('), appSource.indexOf('function renderOverviewExpandedList('))
	const listSource = appSource.slice(appSource.indexOf('function renderOverviewExpandedList('), appSource.indexOf('function renderOverviewSectionToggles('))
	const clickSource = appSource.slice(appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('toggle'"))

	assert.match(panelSource, /function renderOverviewSection\(section\)/)
	assert.match(sectionSource, /data-overview-expand="\$\{section\.id\}"/)
	assert.match(sectionSource, /isDetailCollapseOpen\(`overview-\$\{section\.id\}`\)/)
	assert.match(sectionSource, /overview-row-chevron/)
	assert.match(listSource, /overview-expanded-list/)
	assert.match(listSource, /overview-event-row/)
	assert.match(listSource, /data-overview-locate-event="\$\{escapeHtml\(eventKey\)\}"/)
	assert.match(listSource, /detailEventTimeLabel\(event\)/)
	assert.match(listSource, /detailSourceLabel\(event\)/)
	assert.match(listSource, /overview-empty-state/)
	assert.match(clickSource, /target\.dataset\.overviewExpand/)
	assert.match(clickSource, /setDetailCollapseOpen\(id, !isDetailCollapseOpen\(id\)\)/)
	assert.match(clickSource, /target\.dataset\.overviewLocateEvent/)
	assert.match(appSource, /function locateTimelineEventInCurrentPhase\(/)
	assert.doesNotMatch(clickSource, /data-overview-locate[^-]/)
	assert.doesNotMatch(panelSource, /data-overview-locate[^-]/)
	assert.match(css, /\.overview-section-wrapper\s*\{/)
	assert.match(css, /\.overview-expanded-list\s*\{/)
	assert.match(css, /\.overview-event-row\s*\{/)
	assert.match(css, /\.overview-event-info\s*\{/)
	assert.match(css, /\.overview-row-chevron\s*\{/)
	assert.match(css, /\.overview-empty-state\s*\{/)
})

test('right skill library dedupes same-name variant actionIds into a single button', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const dedupSource = appSource.slice(
		appSource.indexOf('function uniqueSkillLibraryItems('),
		appSource.indexOf('function uniqueSkillEvents('),
	)

	assert.match(appSource, /function uniqueSkillLibraryItems\(/)
	assert.match(dedupSource, /byActionId = new Map\(\)/)
	assert.match(dedupSource, /byName = new Map\(\)/)
	assert.match(dedupSource, /relatedActionIds/)
	assert.match(dedupSource, /occurrenceCount/)
	assert.match(dedupSource, /sources/)
	assert.match(appSource, /uniqueSkillLibraryItems\(\[\.\.\.timelineSkills, \.\.\.currentJobSkills\]\)/)
})

test('P2 detail rows track skills without copy-to-manual clutter', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const detailRowSource = appSource.slice(appSource.indexOf('function renderDetailEventRow('), appSource.indexOf('function renderManualEditor('))

	assert.match(appSource, /function renderDetailEventRow\(/)
	assert.doesNotMatch(appSource, /copyDetailEventToManual|data-action="copy-detail-event"|复制到手动轴/)
	assert.match(appSource, /const timelineEventKey = detailTimelineEventKey\(event\)/)
	assert.match(appSource, /data-action="locate-timeline-event"/)
	assert.match(appSource, /data-timeline-event-key="\$\{timelineEventKey\}"/)
	assert.doesNotMatch(detailRowSource, /data-focus-skill|isFocused|focused-detail-row/)
	assert.match(appSource, /function detailFocusActionId\(/)
	assert.match(appSource, /actionByName\(eventName\)/)
	assert.match(css, /\.detail-actions\s*\{/)
	assert.match(css, /\.detail-meta\s*\{/)
	assert.match(css, /\.detail-count-badge\s*\{/)
})

test('P2 focus picker tracking preserves the opened detail collapse', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /openDetailCollapses:\s*\[\]/)
	assert.match(appSource, /function rememberOpenDetailCollapses\(/)
	assert.match(appSource, /function isDetailCollapseOpen\(/)
	assert.match(appSource, /document\.addEventListener\('toggle'/)
	assert.match(appSource, /rememberOpenDetailCollapses\(\)\s*\n\t\taddFocusedSkill\(target\.dataset\.focusSkill\)/)
	assert.match(appSource, /open:\s*isDetailCollapseOpen\(panel\.id\)/)
	assert.match(appSource, /function locateOverviewSection\(/)
	assert.match(appSource, /data-overview-locate/)
	assert.match(appSource, /open:\s*isDetailCollapseOpen\('burst'\)/)
})

test('detail row trace jumps to the matching timeline item without adding a focused skill', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const clickSource = appSource.slice(appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('change'"))
	const detailRowSource = appSource.slice(appSource.indexOf('function renderDetailEventRow('), appSource.indexOf('function renderManualEditor('))
	const timelineItemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineSourceBadge('))

	assert.match(clickSource, /if \(action === 'locate-timeline-event'\)/)
	assert.match(clickSource, /locateTimelineEvent\(target\.dataset\.timelineEventKey\)/)
	assert.doesNotMatch(detailRowSource, /state\.focusedSkills\.includes\(String\(focusActionId\)\)/)
	assert.match(detailRowSource, /data-action="locate-timeline-event"/)
	assert.match(detailRowSource, /data-timeline-event-key="\$\{timelineEventKey\}"/)
	assert.match(detailRowSource, /class="mini-button"/)
	assert.doesNotMatch(detailRowSource, /trace-button/)
	assert.match(detailRowSource, /\$\{t\('action\.track'\)\}<\/button>/)
	assert.match(timelineItemSource, /data-locate-event-key="\$\{item\.locateEventKey\}"/)
	assert.match(appSource, /function locateTimelineEvent\(/)
	assert.match(appSource, /function flashTimelineElement\(/)
	assert.match(appSource, /timeline-locate-flash/)
	assert.match(css, /\.xiva-item\.timeline-locate-flash\s*\{[^}]*z-index:\s*30/s)
	assert.match(css, /@keyframes timelineLocateFlash[\s\S]*outline:\s*3px solid #111827/)
	assert.match(css, /@keyframes timelineLocateFlash[\s\S]*box-shadow:[^;]*rgba\(17,\s*24,\s*39/)
	assert.doesNotMatch(css, /\.detail-actions \.trace-button/)
})

test('timeline item click reverse-tracks into the overview detail row', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const clickSource = appSource.slice(appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('toggle'"))
	const detailRowSource = appSource.slice(appSource.indexOf('function renderDetailEventRow('), appSource.indexOf('function renderDetailTargetControl('))
	const reverseSource = appSource.slice(appSource.indexOf('function locateDetailEventFromTimeline('), appSource.indexOf('function locateTimelineEvent('))

	assert.match(clickSource, /target\.dataset\.locateEventKey/)
	assert.match(clickSource, /locateDetailEventFromTimeline\(target\.dataset\.locateEventKey\)/)
	assert.match(detailRowSource, /data-detail-locate-event-key="\$\{timelineEventKey\}"/)
	assert.match(reverseSource, /state\.panel = 'overview'/)
	assert.match(reverseSource, /setDetailCollapseOpen\(`overview-\$\{section\.id\}`,\s*true\)/)
	assert.match(reverseSource, /document\.querySelector\(`\[data-detail-locate-event-key="\$\{cssEscape\(key\)\}"\]`\)/)
	assert.match(reverseSource, /flashDetailElement\(target\)/)
	assert.doesNotMatch(reverseSource, /state\.phase\s*=\s*'all'/)
	assert.match(reverseSource, /当前 P 的右侧总览里没有找到这个时间轴节点/)
	assert.match(appSource, /function flashDetailElement\(/)
	assert.match(css, /\.detail-row\.detail-locate-flash\s*\{/)
	assert.match(css, /@keyframes detailLocateFlash[\s\S]*outline:\s*3px solid #111827/)
})

test('P2 manual timeline events can be edited from the detail panel', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function renderManualEditor\(/)
	assert.match(appSource, /function updateManualSkillTime\(/)
	assert.match(appSource, /function duplicateManualSkill\(/)
	assert.match(appSource, /data-manual-time="\$\{event\.id\}"/)
	assert.match(appSource, /data-action="nudge-manual-skill"/)
	assert.match(appSource, /data-action="duplicate-manual-skill"/)
	assert.match(appSource, /data-action="remove-manual-skill"/)
	assert.match(appSource, /\u624b\u52a8\u8f74\u7f16\u8f91/)
	assert.match(css, /\.manual-editor\s*\{/)
	assert.match(css, /\.manual-edit-row\s*\{/)
	assert.match(css, /\.manual-time-field\s*\{/)
})

test('P2 detail panel collapses sections and reuses the output simulation switch', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(appSource, /function renderDetailCollapse\(/)
	assert.match(appSource, /function detailPanelEvents\(/)
	assert.match(appSource, /function outputDetailEvents\(/)
	assert.match(appSource, /data-toggle="acr-simulation"/)
	assert.match(appSource, /state\.showAcrSimulation\s*\?\s*t\('sim\.hide'\)\s*:\s*t\('sim\.show'\)/)
	assert.match(appSource, /<details class="detail-collapse/)
	assert.match(appSource, /detail-expanded-list/)
	assert.doesNotMatch(appSource, /detail-preview-list|renderDetailPreviewRow|DETAIL_COLLAPSED_LIMIT/)
	assert.match(css, /\.detail-collapse\s*\{/)
	assert.match(css, /\.detail-sim-toggle\s*\{/)
})

test('P2 right detail column is wider and collapsed cards show text only', async () => {
	const css = await readFile('public/styles.css', 'utf8')
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(css, /\.unified-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+clamp\(380px,\s*30vw,\s*440px\)/s)
	assert.match(css, /\.detail-collapse:not\(\[open\]\)\s+\.detail-sim-toggle\s*,\s*\n\.detail-collapse:not\(\[open\]\)\s+\.detail-expanded-list\s*\{[^}]*display:\s*none/s)
	assert.match(css, /\.detail-collapse\[open\]\s*>\s*summary\s+\.detail-sim-toggle\s*\{[^}]*display:\s*none/s)
	assert.match(css, /@media \(max-width:\s*1120px\)\s*\{[\s\S]*?\.unified-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/s)
	assert.match(css, /\.detail-expanded-list\s*\{[^}]*max-height:\s*min\(420px,\s*58vh\)/s)
	assert.match(css, /\.detail-row\s*\{[^}]*grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)\s+minmax\(54px,\s*68px\)\s+auto/s)
	assert.match(css, /\.detail-row\.has-target-detail-row\s*\{[^}]*grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)\s+minmax\(54px,\s*68px\)\s+minmax\(104px,\s*128px\)\s+auto/s)
	assert.match(css, /\.detail-actions\s*\{[^}]*justify-content:\s*flex-end/s)
	assert.doesNotMatch(css, /\.detail-actions\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/s)
	assert.match(css, /\.detail-row \.skill-icon\s*\{[^}]*width:\s*24px/s)
	const renderDetailCollapseSource = appSource.slice(
		appSource.indexOf('function renderDetailCollapse'),
		appSource.indexOf('function renderOutputSimulationControl'),
	)
	assert.doesNotMatch(renderDetailCollapseSource, /<summary>[\s\S]*?\$\{controls\}[\s\S]*?<\/summary>/)
	assert.match(appSource, /<div class="detail-expanded-list">\s*\$\{controls\}\s*\$\{expandedBody\}/s)
	assert.match(appSource, /has-target-detail-row/)
})

test('P2 detail panel filters and edits manual events inside the active phase', async () => {
	const appSource = await readFile('public/app.js', 'utf8')

	assert.match(appSource, /function detailEventsForCurrentPhase\(/)
	assert.match(appSource, /function phaseRelativeMsForEvent\(/)
	assert.match(appSource, /function currentPhaseEditWindow\(/)
	assert.match(appSource, /function clampMsToCurrentPhase\(/)
	assert.match(appSource, /function updateDetailEventTime\(/)
	assert.match(appSource, /data-detail-time="\$\{detailEditKey\(panel, event, index\)\}"/)
	assert.match(appSource, /function detailEditKey\(/)
	assert.match(appSource, /function editableDetailEventTarget\(/)
	assert.match(appSource, /updateDetailEventTime\(detailTimeTarget\.dataset\.detailTime,\s*detailTimeTarget\.value\)/)
	assert.match(appSource, /absoluteMsForPhaseTime\(state\.model\.bossTimeline\?\.source,\s*state\.phase,\s*phaseTimeMs\)/)
	assert.match(appSource, /target\.event\.timeMs = clamped\.absoluteTimeMs/)
	assert.match(appSource, /target\.event\.phase = clamped\.phaseId === 'all' \? 'global' : clamped\.phaseId\.toUpperCase\(\)/)
})

test('right detail panel keeps only overview and moves QT and burst into checked sections', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const tabsSource = appSource.slice(appSource.indexOf('function renderPanelTabs('), appSource.indexOf('function renderDetailPanel('))
	const detailPanelSource = appSource.slice(appSource.indexOf('function renderDetailPanel('), appSource.indexOf('function detailPanelEvents('))
	const overviewSource = appSource.slice(appSource.indexOf('function overviewSections('), appSource.indexOf('function renderBurstGroupsInDetailPanel('))
	const burstPanelSource = appSource.slice(appSource.indexOf('function renderBurstGroupsInDetailPanel('), appSource.indexOf('function renderQtDetailPanel('))
	const detailTargetSource = appSource.slice(appSource.indexOf('function editableDetailEventTarget('), appSource.indexOf('function nudgeManualSkill('))

	assert.match(tabsSource, /const panels = \[\{id:\s*'overview',\s*label:\s*t\('overview\.title'\)\}\]/)
	assert.doesNotMatch(tabsSource, /\.\.\.model\.detailPanels/)
	assert.doesNotMatch(tabsSource, /\{id:\s*'qt',\s*label:\s*'QT'\}/)
	assert.doesNotMatch(tabsSource, /\{id:\s*'burst',\s*label:\s*'爆发'\}/)
	assert.match(detailPanelSource, /normalizeDetailPanelSelection\(\)/)
	assert.doesNotMatch(detailPanelSource, /if \(state\.panel === 'qt'\)/)
	assert.doesNotMatch(detailPanelSource, /return renderQtDetailPanel\(\)/)
	assert.doesNotMatch(detailPanelSource, /return renderBurstGroupsInDetailPanel\(/)
	assert.match(appSource, /function toggleOverviewSection\(/)
	assert.match(appSource, /function overviewSectionVisible\(/)
	assert.match(overviewSource, /\{id:\s*'qt',\s*label:\s*t\('overview\.qt'\)/)
	assert.match(overviewSource, /\{id:\s*'burst',\s*label:\s*t\('overview\.burst'\)/)
	assert.match(appSource, /function renderQtDetailPanel\(/)
	assert.match(appSource, /function qtDetailEvents\(/)
	assert.match(appSource, /function editableQtEvents\(/)
	assert.match(appSource, /function normalizeEditableQtEvent\(/)
	assert.match(appSource, /const qtEvents = editableQtEvents\(\)/)
	assert.match(appSource, /\(state\.model\.tracks\.expert\.qt \?\? \[\]\)\.map\(normalizeEditableQtEvent\)/)
	assert.match(appSource, /manualEventsForPanel\('qt'\)\.map\(detailManualEvent\)/)
	assert.match(appSource, /const panel = virtualDetailPanel\('qt',\s*t\('detail\.qtControl'\),\s*events\)/)
	assert.match(burstPanelSource, /const burstEvents = detailEventsForCurrentPhase\(buildBurstPackageItems\(bursts\)\)/)
	assert.doesNotMatch(burstPanelSource, /timelineQtEvents/)
	assert.match(burstPanelSource, /renderDetailEventRow\(panel,\s*event,\s*index\)/)
	assert.match(appSource, /function virtualDetailPanel\(/)
	assert.match(appSource, /function resolveDetailPanelById\(/)
	assert.match(detailTargetSource, /const panel = resolveDetailPanelById\(panelId\)/)
	assert.match(appSource, /if \(panelId === 'qt'\)/)
	assert.match(appSource, /return virtualDetailPanel\('qt',\s*'QT 控制',\s*qtDetailEvents\(\)\)/)
	assert.match(appSource, /target\.event\.endMs = clamped\.absoluteTimeMs \+ durationMs/)
})

test('right overview skill chips hide categories already enabled as overview sections', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const rightLibrarySource = appSource.slice(
		appSource.indexOf('function renderRightSkillLibrary('),
		appSource.indexOf('function renderRightSkillItem('),
	)
	const rightGroupsSource = appSource.slice(
		appSource.indexOf('function rightSkillGroups('),
		appSource.indexOf('function renderRightSkillItem('),
	)

	assert.match(rightLibrarySource, /const groups = rightSkillGroups\(insertSkillGroups\(track\)\)/)
	assert.match(rightGroupsSource, /damage:\s*'output'/)
	assert.match(rightGroupsSource, /mitigation:\s*'mitigation'/)
	assert.match(rightGroupsSource, /potion:\s*'potion'/)
	assert.match(rightGroupsSource, /qt:\s*'qt'/)
	assert.match(rightGroupsSource, /burst:\s*'burst'/)
	assert.match(rightGroupsSource, /overviewSectionVisible\(overviewId\)/)
	assert.match(rightGroupsSource, /group\.id !== 'all' && !hiddenGroups\.has\(group\.id\)/)
})

test('right skill library does not render an all category and defaults to output', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const rightLibrarySource = appSource.slice(
		appSource.indexOf('function renderRightSkillLibrary('),
		appSource.indexOf('function renderRightSkillItem('),
	)
	const rightGroupsSource = appSource.slice(
		appSource.indexOf('function rightSkillGroups('),
		appSource.indexOf('function renderRightSkillItem('),
	)

	assert.match(appSource, /rightSkillCategory:\s*'output'/)
	assert.doesNotMatch(rightLibrarySource, /state\.rightSkillCategory = 'all'/)
	assert.match(rightLibrarySource, /state\.rightSkillCategory = groups\[0\]\.id/)
	assert.match(rightGroupsSource, /group\.id !== 'all'/)
	assert.doesNotMatch(rightGroupsSource, /group\.id === 'all'/)
})

test('right skill library filters empty groups and does not show an empty-state card', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const rightLibrarySource = appSource.slice(
		appSource.indexOf('function renderRightSkillLibrary('),
		appSource.indexOf('function renderRightSkillItem('),
	)

	assert.match(rightLibrarySource, /\.filter\(group => Array\.isArray\(group\.skills\) && group\.skills\.length > 0\)/)
	assert.match(rightLibrarySource, /if \(!groups\.length\) \{/)
	assert.match(rightLibrarySource, /return ''/)
	assert.doesNotMatch(rightLibrarySource, /empty\.noSkillInCategory/)
	assert.doesNotMatch(rightLibrarySource, /empty-state/)
})

test('QT detail rows can be tracked and editable timeline events can be deleted from cards', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const detailRowSource = appSource.slice(appSource.indexOf('function renderDetailEventRow('), appSource.indexOf('function renderDetailTargetControl('))
	const timelineItemSource = appSource.slice(appSource.indexOf('function renderTimelineItem('), appSource.indexOf('function renderTimelineIcon('))
	const clickSource = appSource.slice(appSource.indexOf("document.addEventListener('click'"), appSource.indexOf("document.addEventListener('toggle'"))

	assert.match(detailRowSource, /const timelineEventKey = detailTimelineEventKey\(event\)/)
	assert.match(detailRowSource, /data-timeline-event-key="\$\{timelineEventKey\}"/)
	assert.doesNotMatch(detailRowSource, /focusActionId \? '' : 'disabled'/)
	assert.match(clickSource, /if \(action === 'remove-timeline-event'\)/)
	assert.match(clickSource, /removeTimelineEvent\(target\.dataset\.timelineEventKey\)/)
	assert.match(appSource, /function removeTimelineEvent\(/)
	assert.match(appSource, /editableTimelineEventTargets\(eventKey\)/)
	assert.match(appSource, /removeEditableTimelineEvent\(target\.event\)/)
	assert.match(appSource, /function removeEditableTimelineEvent\(/)
	assert.match(appSource, /removeEventFromArray\(track\.qt,\s*event\)/)
	assert.match(appSource, /removeEventFromTimelineRows\(event\)/)
	assert.match(timelineItemSource, /renderTimelineDeleteButton\(item,\s*editableEvent\)/)
	assert.match(timelineItemSource, /renderTimelineDeleteButton\(item,\s*editable\)/)
	assert.match(appSource, /function renderTimelineDeleteButton\(/)
	assert.match(appSource, /class="timeline-delete-button manual-remove"/)
	assert.match(css, /\.timeline-delete-button\s*\{/)
	assert.match(css, /\.xiva-item\.editable:hover \.timeline-delete-button/s)
})

test('front-end uses a Claude and Anthropic inspired warm editor design system', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /color-scheme:\s*light/)
	assert.match(css, /--paper:\s*#faf9f5/)
	assert.match(css, /--ink:\s*#141413/)
	assert.match(css, /--accent:\s*#cc785c/)
	assert.match(css, /--topbar-height:\s*72px/)
	assert.match(css, /--button-shadow:\s*none/)
	assert.match(css, /body\s*\{[^}]*background:\s*var\(--paper\)/s)
	assert.match(css, /\.side-rail\s*\{[^}]*background:\s*rgba\(250,\s*249,\s*245,\s*0\.78\)/s)
	assert.match(css, /\.workspace,\s*\n\.tool-panel\s*\{[^}]*background:\s*rgba\(250,\s*249,\s*245,\s*0\.86\)/s)
	assert.match(css, /\.primary\s*\{[^}]*background:\s*var\(--accent\)/s)
	assert.match(css, /\.xiva-shell\s*\{[^}]*background:\s*var\(--surface\)/s)
	assert.match(css, /\.xiva-toolbar\s*\{[^}]*background:\s*var\(--surface-soft\)/s)
})

test('topbar matches the reference single-row toolbar with brand, nav and controls', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const renderBody = appSource.match(/function render\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''

	assert.doesNotMatch(appSource, /function renderTerminalStatusBar\(/)
	assert.match(appSource, /function renderSideRail\(/)
	assert.doesNotMatch(renderBody, /renderTerminalStatusBar\(model\)/)
	assert.match(renderBody, /renderTopbar\(model\)[\s\S]*<div class="app-shell">/)
	assert.match(renderBody, /renderSideRail\(model\)/)
	const unifiedEditorSource = appSource.slice(appSource.indexOf('function renderUnifiedEditor'), appSource.indexOf('function renderInsertFloat'))
	assert.doesNotMatch(unifiedEditorSource, /renderPanelTabs\(model\)/)
	assert.doesNotMatch(appSource, /class="terminal-status-bar"/)
	assert.match(appSource, /class="side-rail"/)
	assert.match(appSource, /class="topbar-brand"/)
	assert.match(appSource, /class="topbar-nav"/)
	assert.match(appSource, /class="topbar-nav-item/)
	assert.match(appSource, /class="topbar-divider"/)
	assert.match(appSource, /data-section="timeline"/)
	assert.match(appSource, /data-section="tools"/)
	assert.match(css, /\.topbar\s*\{[^}]*min-height:\s*var\(--topbar-height\)/s)
	assert.match(css, /\.topbar\s*\{[^}]*grid-template-columns:\s*minmax\(300px,\s*455px\)\s+minmax\(320px,\s*1fr\)\s+auto/s)
	assert.match(css, /\.topbar-brand\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.topbar-nav\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.topbar-divider\s*\{[^}]*width:\s*1px/s)
	assert.match(css, /\.app-shell\s*\{[^}]*min-height:\s*calc\(100vh - var\(--topbar-height\)\)/s)
	assert.match(css, /\.app-shell\s*\{[^}]*padding:\s*0\s+8px\s+8px\s+0/s)
	assert.match(css, /\.workspace\s*\{[^}]*padding:\s*0/s)
	assert.match(css, /\.side-rail\s*\{[^}]*width:\s*72px/s)
	assert.match(css, /\.side-rail\s*\{[^}]*height:\s*calc\(100vh - var\(--topbar-height\)\)/s)
	assert.match(css, /\.side-rail-brand\s*\{[^}]*display:\s*none/s)
	assert.match(css, /\.rail-icon-button\s*\{[^}]*min-height:\s*62px/s)
	assert.match(css, /\.topbar\s*\{[^}]*padding:\s*0\s+22px/s)
	assert.match(css, /\.topbar-main\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.topbar-main\s*\{[^}]*align-items:\s*center/s)
	assert.match(css, /\.topbar h2\s*\{[^}]*font-size:\s*15px/s)
	assert.match(css, /\.job-acr-status\s*\{[^}]*margin-top:\s*0/s)
	assert.match(css, /\.topbar-controls\s*\{[^}]*align-items:\s*center/s)
	assert.match(css, /\.topbar-controls label\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.topbar-controls \.topbar-mode-field\s*\{[^}]*flex:\s*0\s+0\s+118px/s)
	assert.match(css, /\.topbar-controls \.topbar-mode-field span\s*\{[^}]*display:\s*none/s)
	assert.match(css, /\.topbar-controls \.topbar-mode-field select\s*\{[^}]*max-width:\s*118px/s)
	assert.match(css, /\.topbar-controls\s*\{[^}]*flex-wrap:\s*nowrap/s)
	assert.match(css, /\.topbar-controls \.ghost\s*\{[^}]*min-height:\s*30px/s)
	assert.match(css, /\.topbar-nav-item\s*\{[^}]*white-space:\s*nowrap/s)
	assert.match(css, /\.topbar-controls\s*\{[^}]*overflow:\s*hidden/s)
	assert.match(css, /\.topbar-controls label\s*\{[^}]*flex:\s*0\s+1\s+150px/s)
	assert.match(css, /@media \(max-width:\s*1360px\)\s*\{[\s\S]*?\.topbar-controls \.compact\s*\{[\s\S]*?display:\s*none/s)
	assert.match(css, /\.xiva-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(260px,\s*1fr\)\s+auto\s+auto\s+auto/s)
	assert.match(css, /\.xiva-toolbar\s*\{[^}]*max-height:\s*64px/s)
	assert.match(css, /\.xiva-legend\s*\{[^}]*flex-wrap:\s*nowrap/s)
	assert.match(css, /\.xiva-legend\s*\{[^}]*overflow:\s*hidden/s)
	assert.match(css, /\.xiva-legend span\s*\{[^}]*white-space:\s*nowrap/s)
	const laneTimelineSource = appSource.slice(appSource.indexOf('function renderLaneTimeline'), appSource.indexOf('function renderSkillDrawer'))
	assert.doesNotMatch(laneTimelineSource, /legend-simulated/)
	assert.match(css, /\.overview-header\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.overview-header\s*\{[^}]*min-height:\s*64px/s)
	assert.match(css, /\.overview-panel\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.overview-panel\s*\{[^}]*flex-direction:\s*column/s)
	assert.match(css, /@media \(max-width:\s*860px\)\s*\{[\s\S]*?\.side-rail\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s)
})

test('mini timeline navigator bar is rendered in the toolbar and syncs with scroll', async () => {
	const appSource = await readFile('public/app.js', 'utf8')
	const css = await readFile('public/styles.css', 'utf8')
	const laneTimelineSource = appSource.slice(
		appSource.indexOf('function renderLaneTimeline'),
		appSource.indexOf('function renderSkillDrawer'),
	)

	// The navigator bar HTML is rendered inside the xiva-shell, above xiva-timeline
	assert.match(laneTimelineSource, /data-timeline-nav/)
	assert.match(laneTimelineSource, /data-timeline-nav-track/)
	assert.match(laneTimelineSource, /data-timeline-nav-thumb/)
	// The mascot scrubber stays in its own toolbar slot; phase tabs are moved right.
	assert.match(laneTimelineSource, /<div class="timeline-phase-controls">[\s\S]*?<div class="timeline-nav-bar compact" data-timeline-nav[\s\S]*?<\/div>\s*<\/div>\s*<div class="phase-switch" aria-label="Boss phase filter">/)
	assert.doesNotMatch(laneTimelineSource, /<\/div>\s*<div class="timeline-nav-bar" data-timeline-nav>\s*<span class="timeline-nav-endpoint"/)
	assert.match(laneTimelineSource, /<img class="timeline-nav-mascot" src="\.\/assets\/ui\/pixel-mascot-timeline-v1\.png"/)
	// updateTimelineNav syncs thumb width and position from scrollWidth / scrollLeft
	assert.match(appSource, /function updateTimelineNav\(/)
	assert.match(appSource, /timeline\.scrollWidth - timeline\.clientWidth/)
	assert.match(appSource, /timeline\.scrollLeft \/ maxScroll/)
	// Dragging the navigator sets timeline.scrollLeft
	assert.match(appSource, /function setTimelineScrollFromNav\(/)
	assert.match(appSource, /timeline\.scrollLeft = ratio \* maxScroll/)
	// Pointer drag on the navigator track is handled
	assert.match(appSource, /timelineNavDrag/)
	assert.match(appSource, /closest\('\[data-timeline-nav-track\]'\)/)
	// Scroll events on .xiva-timeline trigger navigator update via rAF
	assert.match(appSource, /requestAnimationFrame\(updateTimelineNav\)/)
	// render() calls updateTimelineNav after restoring viewport
	const renderSource = appSource.slice(
		appSource.indexOf('function render() {'),
		appSource.indexOf('function captureTimelineViewport'),
	)
	assert.match(renderSource, /updateTimelineNav\(\)/)
	// CSS styles for the navigator
	assert.match(css, /\.timeline-nav-bar\s*\{/)
	assert.match(css, /\.timeline-nav-bar\.compact\s*\{/)
	assert.match(css, /\.timeline-nav-track\s*\{[^}]*height:\s*8px/s)
	assert.match(css, /\.timeline-nav-thumb\s*\{[^}]*position:\s*absolute/s)
	assert.match(css, /\.timeline-nav-mascot\s*\{/)
	assert.match(css, /\.xiva-toolbar \.timeline-phase-controls\s*\{[^}]*grid-column:\s*2/s)
	assert.match(css, /\.xiva-toolbar \.timeline-phase-controls\s*\{[^}]*margin-right:\s*0/s)
	assert.match(css, /\.xiva-toolbar\s*\{[^}]*grid-template-columns:\s*clamp\(150px,\s*11vw,\s*210px\)\s+auto\s+minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/s)
	assert.match(css, /\.xiva-toolbar \.timeline-nav-bar\.compact\s*\{[^}]*flex:\s*0\s+0\s+clamp\(260px,\s*26vw,\s*380px\)/s)
	assert.match(css, /\.xiva-toolbar \.timeline-nav-bar\.compact \.timeline-nav-thumb\s*\{[^}]*width:\s*42px/s)
	assert.match(css, /\.timeline-nav-mascot\s*\{[^}]*width:\s*42px/s)
	const phaseSwitchRule = css.slice(css.indexOf('.xiva-toolbar .phase-switch {'), css.indexOf('.xiva-toolbar .xiva-legend {'))
	assert.match(phaseSwitchRule, /grid-column:\s*4/)
	assert.match(phaseSwitchRule, /justify-self:\s*end/)
	// Native scrollbar is thinned out
	assert.match(css, /\.xiva-timeline\s*\{[^}]*scrollbar-width:\s*none/s)
	assert.match(css, /\.xiva-timeline::-webkit-scrollbar:horizontal\s*\{[^}]*height:\s*0/s)
	assert.match(css, /@media \(max-width:\s*1500px\)\s*\{[\s\S]*?\.xiva-toolbar \.xiva-legend\s*\{[\s\S]*?display:\s*none/s)
	assert.match(css, /@media \(max-width:\s*1500px\)\s*\{[\s\S]*?\.xiva-toolbar\s*\{[\s\S]*?grid-template-columns:\s*clamp\(132px,\s*12vw,\s*170px\)\s+auto\s+minmax\(0,\s*1fr\)\s+auto\s+auto/s)
	assert.match(css, /@media \(max-width:\s*1500px\)\s*\{[\s\S]*?\.xiva-toolbar \.timeline-nav-bar\.compact\s*\{[\s\S]*?flex-basis:\s*clamp\(300px,\s*32vw,\s*416px\)/s)
	assert.match(css, /@media \(max-width:\s*1180px\)\s*\{[\s\S]*?\.xiva-toolbar \.timeline-nav-bar\.compact\s*\{[\s\S]*?flex-basis:\s*320px/s)
})
