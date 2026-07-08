import {mkdir, writeFile} from 'node:fs/promises'
import {createPrototypeModel} from '../src/app-model.mjs'
import {buildKanoDrkSimulation} from '../src/acr-simulation.mjs'
import {loadKanoDrkSourceOpener} from '../src/acr-source-opener.mjs'
import {collectPrototypeActionIds, loadPrototypeInputs} from '../src/prototype-generation.mjs'
import {buildSkillDatabase, fetchGarlandSkillSource} from '../src/skill-database.mjs'

const {
	timeline,
	packages,
	acrSources,
	runtimeSources,
	bossTimeline,
} = await loadPrototypeInputs()
const fallbackSimulation = buildKanoDrkSimulation(buildSkillDatabase(), {durationMs: bossTimeline?.source?.lastSecond ? Math.round(bossTimeline.source.lastSecond * 1000) : 720000})
const actionIds = collectPrototypeActionIds(timeline, fallbackSimulation.events)
let skillSource = null
try {
	skillSource = await fetchGarlandSkillSource(actionIds)
} catch (error) {
	console.warn(`Garland skill fetch failed, using bundled fallback data: ${error.message}`)
}
const skillDatabase = buildSkillDatabase(skillSource ?? {})
const sourceOpener = await loadKanoDrkSourceOpener(skillDatabase)
const model = createPrototypeModel(timeline, packages, bossTimeline, {acrSources, runtimeSources, skillDatabase, sourceOpener})

await mkdir('public/data', {recursive: true})
await writeFile('public/data/prototype.json', JSON.stringify(model, null, 2), 'utf8')
const bossCastCount = model.timelineRows
	.filter(row => (row.groupId ?? row.id) === 'boss-casts')
	.reduce((sum, row) => sum + row.items.length, 0)
const bossReleaseCount = model.timelineRows
	.filter(row => (row.groupId ?? row.id) === 'boss-damage')
	.reduce((sum, row) => sum + row.items.length, 0)
console.log(`Generated public/data/prototype.json with ${bossCastCount} boss casts, ${bossReleaseCount} boss releases, ${packages.length} ACR packages and ${skillDatabase.skills.length} skills.`)
