import {readdir, readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {COMBAT_JOBS} from './skill-database.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')

const FALLBACK_ACR_SUPPORT = [
	{package: 'KANO', jobs: ['DRK'], source: '本地 ACR 包'},
	{package: 'GaoShou', jobs: ['DRK', 'RDM'], source: '本地 ACR 包'},
	{package: 'LccMch', jobs: ['MCH'], source: '本地 ACR 包'},
	{package: 'Nag0mi', jobs: ['GNB'], source: '本地 ACR 包'},
	{package: 'Nero', jobs: ['VPR'], source: '本地 ACR 包'},
	{package: 'Wotou', jobs: ['BRD'], source: '本地 ACR 包'},
	{package: 'XSZYYS', jobs: ['PLD', 'WAR', 'DRK'], source: '本地 ACR 包'},
	{package: 'Ahxq', jobs: ['DNC', 'MCH', 'VPR'], source: '本地 ACR 包'},
	{package: 'MilkVio', jobs: [
		'PLD', 'WAR', 'DRK', 'GNB',
		'WHM', 'SCH', 'AST', 'SGE',
		'MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR',
		'MCH', 'DNC',
		'BLM', 'SMN', 'RDM', 'PCT',
	], source: '本地 ACR 包'},
]

const JOB_PATTERNS = [
	['PLD', /\bPLD\b|Paladin|骑士/i],
	['WAR', /\bWAR\b|Warrior|战士/i],
	['DRK', /\bDRK\b|DarkKnight|Dark Knight|暗黑/i],
	['GNB', /\bGNB\b|Gunbreaker|绝枪/i],
	['WHM', /\bWHM\b|WhiteMage|White Mage|白魔/i],
	['SCH', /\bSCH\b|Scholar|学者/i],
	['AST', /\bAST\b|Astrologian|占星/i],
	['SGE', /\bSGE\b|Sage|贤者/i],
	['MNK', /\bMNK\b|Monk|武僧/i],
	['DRG', /\bDRG\b|Dragoon|龙骑/i],
	['NIN', /\bNIN\b|Ninja|忍者/i],
	['SAM', /\bSAM\b|Samurai|武士/i],
	['RPR', /\bRPR\b|Reaper|钐镰/i],
	['VPR', /\bVPR\b|Viper|蝰蛇/i],
	['BRD', /\bBRD\b|Bard|吟游/i],
	['MCH', /\bMCH\b|Machinist|机工/i],
	['DNC', /\bDNC\b|Dancer|舞者/i],
	['BLM', /\bBLM\b|BlackMage|Black Mage|黑魔/i],
	['SMN', /\bSMN\b|Summoner|召唤/i],
	['RDM', /\bRDM\b|RedMage|Red Mage|赤魔/i],
	['PCT', /\bPCT\b|Pictomancer|绘灵/i],
]

export function buildAcrDatabase(packages = [], acrSources = FALLBACK_ACR_SUPPORT) {
	const packageSet = new Set(packages)
	const support = mergeAcrSources(acrSources.length ? acrSources : FALLBACK_ACR_SUPPORT)
	const allPackages = [...new Set([...packages, ...support.map(source => source.package)])].sort((left, right) => left.localeCompare(right))

	return {
		packages: allPackages,
		jobs: COMBAT_JOBS.map(job => {
			const supported = support
				.filter(source => source.jobs.includes(job.id))
				.sort((left, right) => left.package.localeCompare(right.package))
			const acrs = supported.map(source => ({
				name: source.package,
				enabled: packageSet.size ? packageSet.has(source.package) : true,
				source: source.source ?? '反编译 ACR',
			}))
			const enabled = acrs.some(acr => acr.enabled)
			return {
				id: job.id,
				jobId: job.jobId,
				name: job.name,
				role: job.role,
				enabled,
				acrs: acrs.length ? acrs : [{name: '等待接入', enabled: false, source: '灰色占位'}],
			}
		}),
	}
}

export async function discoverAcrSources(relativeOrAbsoluteRoot = '../资源/data/decompiled') {
	const root = resolveProjectPath(relativeOrAbsoluteRoot)
	const manifest = await readManifest(root)
	const entries = await readdir(root, {withFileTypes: true})
	const directories = entries.filter(entry => entry.isDirectory())
	const sources = []

	for (const directory of directories) {
		const packageName = packageNameForDirectory(directory.name, manifest)
		const fullPath = path.join(root, directory.name)
		const jobs = await discoverJobsInDirectory(fullPath)
		if (jobs.length) {
			sources.push({
				package: packageName,
				jobs,
				source: '反编译 ACR',
				path: fullPath,
			})
		}
	}

	return mergeAcrSources(sources)
}

export async function discoverSourceAcr(relativeOrAbsolutePath) {
	const root = resolveProjectPath(relativeOrAbsolutePath)
	const projectEntries = await readdir(root, {withFileTypes: true})
	const projectFile = projectEntries.find(entry => entry.isFile() && entry.name.endsWith('.csproj'))
	const packageName = projectFile ? path.basename(projectFile.name, '.csproj').toUpperCase() : path.basename(root).toUpperCase()
	const jobs = await discoverJobsInDirectory(root)
	return {
		package: packageName,
		jobs: jobs.length ? jobs : ['DRK'],
		source: '源码 ACR',
		path: root,
	}
}

async function discoverJobsInDirectory(root) {
	const hits = new Set()
	const queue = [root]
	let visited = 0

	while (queue.length && visited < 900) {
		visited += 1
		const current = queue.shift()
		const text = normalizePathForMatching(current)
		for (const [job, pattern] of JOB_PATTERNS) {
			if (pattern.test(text)) {
				hits.add(job)
			}
		}

		let entries = []
		try {
			entries = await readdir(current, {withFileTypes: true})
		} catch {
			continue
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				queue.push(path.join(current, entry.name))
				continue
			}
			if (entry.isFile() && entry.name.endsWith('.cs')) {
				matchJobsFromFileName(entry.name, hits)
			}
		}
	}

	return [...hits].sort((left, right) => jobOrder(left) - jobOrder(right))
}

function matchJobsFromFileName(fileName, hits) {
	for (const [job, pattern] of JOB_PATTERNS) {
		if (pattern.test(fileName)) {
			hits.add(job)
		}
	}
}

function mergeAcrSources(sources) {
	const byPackage = new Map()
	for (const source of sources) {
		if (!source?.package) {
			continue
		}
		if (!byPackage.has(source.package)) {
			byPackage.set(source.package, {
				package: source.package,
				jobs: [],
				source: source.source ?? '反编译 ACR',
				path: source.path,
			})
		}
		const target = byPackage.get(source.package)
		target.jobs = [...new Set([...target.jobs, ...(source.jobs ?? [])])]
			.filter(job => COMBAT_JOBS.some(item => item.id === job))
			.sort((left, right) => jobOrder(left) - jobOrder(right))
	}
	return [...byPackage.values()].filter(source => source.jobs.length)
}

async function readManifest(root) {
	try {
		return JSON.parse(await readFile(path.join(root, 'decompile-manifest.json'), 'utf8'))
	} catch {
		return []
	}
}

function packageNameForDirectory(directoryName, manifest) {
	const normalized = normalizePathForMatching(directoryName)
	const matched = manifest.find(item => normalizePathForMatching(item.output ?? '').includes(normalized))
	if (matched?.package) {
		return matched.package
	}
	const [prefix] = directoryName.split('_')
	return prefix || directoryName
}

function normalizePathForMatching(value = '') {
	return String(value).replace(/\\/g, '/')
}

function jobOrder(jobId) {
	const index = COMBAT_JOBS.findIndex(job => job.id === jobId)
	return index < 0 ? 999 : index
}

function resolveProjectPath(relativeOrAbsolutePath) {
	return path.isAbsolute(relativeOrAbsolutePath)
		? relativeOrAbsolutePath
		: path.resolve(projectDir, relativeOrAbsolutePath)
}
