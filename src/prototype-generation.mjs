import {readdir} from 'node:fs/promises'
import path from 'node:path'
import {discoverAcrSources, discoverPromeRotationSource, discoverSourceAcr} from './acr-database.mjs'
import {loadDefaultFflogsBossTimelineData} from './fflogs-boss-data.mjs'
import {loadFixture} from './timeline-data.mjs'

export async function loadPrototypeInputs(options = {}) {
	const timelinePath = options.timelinePath ?? '../资源/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json'
	const acrPackageRoot = path.resolve(options.acrPackageRoot ?? path.resolve('..', '资源', 'acr-packages', '现在所有acr数据', 'ACR'))
	const decompiledRoot = options.decompiledRoot ?? '../资源/data/decompiled'
	const sourceAcrPaths = options.sourceAcrPaths ?? ['F:/acr开发/KanoACR/Kano']
	const promeRotationSourcePath = options.promeRotationSourcePath ?? '../资源/source/PromeRotation-1.0'
	const timeline = await loadFixture(timelinePath)
	const packages = await discoverAcrPackages(acrPackageRoot)
	const decompiledSources = await discoverAcrSources(decompiledRoot)
	const sourceSources = await Promise.all(sourceAcrPaths.map(discoverSourceAcr))
	const runtimeSources = options.loadPromeRotationSource === false
		? []
		: [await discoverPromeRotationSource(promeRotationSourcePath)]
	const bossTimeline = options.loadBossTimeline === false ? null : await loadDefaultFflogsBossTimelineData()

	return {
		timeline,
		packages,
		acrSources: mergePrototypeAcrSources([...sourceSources, ...decompiledSources]),
		runtimeSources,
		bossTimeline,
	}
}

async function discoverAcrPackages(acrPackageRoot) {
	const entries = await readdir(acrPackageRoot, {withFileTypes: true})
	const packages = []
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue
		}
		const files = await readdir(path.join(acrPackageRoot, entry.name), {withFileTypes: true})
		const fileNames = files
			.filter(file => file.isFile())
			.map(file => file.name)
		if (!fileNames.length) {
			continue
		}
		packages.push(entry.name)
	}
	return packages.sort((left, right) => left.localeCompare(right))
}

export function collectPrototypeActionIds(timeline, simulatedEvents = []) {
	const result = new Set()
	collectTimelineActionIds(timeline?.Root ?? timeline, result)
	for (const event of simulatedEvents) {
		const id = Number(event?.actionId)
		if (Number.isFinite(id)) {
			result.add(id)
		}
	}
	return [...result].sort((left, right) => left - right)
}

function collectTimelineActionIds(node, result) {
	if (!node) {
		return
	}
	for (const action of node.Actions ?? []) {
		const id = Number(action.ActionId)
		if (Number.isFinite(id)) {
			result.add(id)
		}
	}
	for (const child of node.Children ?? []) {
		collectTimelineActionIds(child, result)
	}
}

function mergePrototypeAcrSources(sources) {
	const byPackage = new Map()
	for (const source of sources) {
		if (!source?.package) {
			continue
		}
		const existing = byPackage.get(source.package)
		if (!existing) {
			byPackage.set(source.package, {
				...source,
				jobs: [...new Set(source.jobs ?? [])],
			})
			continue
		}
		existing.jobs = [...new Set([...(existing.jobs ?? []), ...(source.jobs ?? [])])]
		if (source.source === '源码 ACR') {
			existing.source = source.source
			existing.path = source.path
		}
	}
	return [...byPackage.values()]
}
