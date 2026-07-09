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

const MAX_DISCOVERY_ENTRIES = 1800
const MAX_QT_NAME_LENGTH = 80

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
				qtControls: normalizeQtControls(source.qtControls?.[job.id] ?? []),
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
		const discoveredJobs = await discoverJobsInDirectory(fullPath)
		const jobs = discoveredJobs.length ? discoveredJobs : fallbackJobsForPackage(packageName)
		if (jobs.length) {
			const qtControls = await discoverQtControlsInDirectory(fullPath, jobs)
			sources.push({
				package: packageName,
				jobs,
				source: '反编译 ACR',
				path: fullPath,
				qtControls,
			})
		}
	}

	return mergeAcrSources(sources)
}

export async function discoverPromeRotationSource(relativeOrAbsolutePath = '../资源/source/PromeRotation-1.0') {
	const root = resolveProjectPath(relativeOrAbsolutePath)
	const catalogPath = path.join(root, 'PromeRotation', 'ACRDownload', 'AcrDownloadModels.cs')
	const catalog = await readFile(catalogPath, 'utf8')
	const catalogJobs = [...catalog.matchAll(/new\(\(uint\)Job\.([A-Z]{3}),\s*"([A-Z]{3})"/g)]
		.map(match => match[2])
	const jobs = COMBAT_JOBS
		.filter(job => job.role !== 'Limited' && catalogJobs.includes(job.id))
		.map(job => job.id)

	return {
		package: 'PromeRotation',
		jobs,
		source: 'PR 本体源码',
		kind: 'runtime',
		author: 'PromeRotation',
		path: root,
	}
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

	while (queue.length && visited < MAX_DISCOVERY_ENTRIES) {
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

async function discoverQtControlsInDirectory(root, jobs = []) {
	const files = await collectCsFiles(root)
	const controlsByJob = new Map(jobs.map(job => [job, new Map()]))
	for (const file of files) {
		const matchedJobs = jobsForFilePath(file, jobs)
		if (!matchedJobs.length) {
			continue
		}
		let text = ''
		try {
			text = await readFile(file, 'utf8')
		} catch {
			continue
		}
		const controls = extractQtControlsFromSource(text, path.relative(root, file))
		if (!controls.length) {
			continue
		}
		for (const job of matchedJobs) {
			const target = controlsByJob.get(job) ?? new Map()
			for (const control of controls) {
				mergeQtControl(target, control)
			}
			controlsByJob.set(job, target)
		}
	}
	return Object.fromEntries(
		[...controlsByJob.entries()]
			.map(([job, controls]) => [job, [...controls.values()]])
			.filter(([, controls]) => controls.length),
	)
}

async function collectCsFiles(root) {
	const files = []
	const queue = [root]
	let visited = 0
	while (queue.length && visited < MAX_DISCOVERY_ENTRIES) {
		visited += 1
		const current = queue.shift()
		let entries = []
		try {
			entries = await readdir(current, {withFileTypes: true})
		} catch {
			continue
		}
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name)
			if (entry.isDirectory()) {
				queue.push(fullPath)
				continue
			}
			if (entry.isFile() && entry.name.endsWith('.cs')) {
				files.push(fullPath)
			}
		}
	}
	return files
}

function jobsForFilePath(filePath, sourceJobs = []) {
	const normalized = normalizePathForMatching(filePath)
	const hits = []
	for (const [job, pattern] of JOB_PATTERNS) {
		if (sourceJobs.includes(job) && pattern.test(normalized)) {
			hits.push(job)
		}
	}
	if (hits.length) {
		return hits.sort((left, right) => jobOrder(left) - jobOrder(right))
	}
	return sourceJobs.length === 1 ? [...sourceJobs] : []
}

function extractQtControlsFromSource(text, sourceFile = '') {
	if (!mightContainQtControls(text, sourceFile)) {
		return []
	}
	const controls = new Map()
	const add = (name, defaultEnabled = false, sourceKind = 'source') => {
		const cleaned = cleanQtControlName(name)
		if (!cleaned) {
			return
		}
		mergeQtControl(controls, {
			name: cleaned,
			defaultEnabled: Boolean(defaultEnabled),
			sourceFile: normalizePathForMatching(sourceFile),
			sourceKind,
		})
	}

	for (const match of text.matchAll(/\{\s*"([^"\r\n]+)"\s*,\s*(true|false)\s*\}/gi)) {
		add(match[1], match[2].toLowerCase() === 'true', 'dictionary')
	}
	for (const match of text.matchAll(/\[\s*"([^"\r\n]+)"\s*\]\s*=\s*(true|false)/gi)) {
		add(match[1], match[2].toLowerCase() === 'true', 'dictionary')
	}
	for (const match of text.matchAll(/\b(?:AddQt|SetQt)\s*\(\s*"([^"\r\n]+)"\s*,\s*(true|false)/gi)) {
		add(match[1], match[2].toLowerCase() === 'true', 'qt-call')
	}
	for (const match of text.matchAll(/\bGetQt\s*\(\s*"([^"\r\n]+)"/gi)) {
		add(match[1], false, 'qt-call')
	}
	if (isLikelyQtCatalog(text, sourceFile)) {
		for (const match of text.matchAll(/\b(?:const\s+string|(?:public|private|internal|protected)?\s*(?:static\s+)?string)\s+[^\s=]+\s*=\s*"([^"\r\n]+)"/gi)) {
			add(match[1], false, 'const')
		}
	}

	return [...controls.values()]
}

function mightContainQtControls(text, sourceFile) {
	return /qt/i.test(sourceFile) || /\b(?:QtList|AddQt|SetQt|GetQt|DrawQTs|HiddenQts)\b/i.test(text)
}

function isLikelyQtCatalog(text, sourceFile) {
	return /qt/i.test(sourceFile)
		|| /\bQtList\b/i.test(text)
		|| /\bHiddenQts\b/i.test(text)
		|| /\bDrawQTs\b/i.test(text)
		|| /Dictionary\s*<\s*string\s*,\s*bool\s*>/i.test(text)
}

function cleanQtControlName(name) {
	const cleaned = String(name ?? '')
		.replace(/\\"/g, '"')
		.replace(/\s+/g, ' ')
		.trim()
	if (!cleaned || cleaned.length > MAX_QT_NAME_LENGTH) {
		return ''
	}
	if (/[\r\n{};]/.test(cleaned)) {
		return ''
	}
	if (/^(true|false|null|qt)$/i.test(cleaned)) {
		return ''
	}
	if (/未开启QT|QtCols|QT 开关状态|QT\s*开关状态/i.test(cleaned)) {
		return ''
	}
	return cleaned
}

function normalizeQtControls(controls = []) {
	const byName = new Map()
	for (const control of controls) {
		mergeQtControl(byName, control)
	}
	return [...byName.values()]
}

function mergeQtControl(target, control) {
	const name = cleanQtControlName(control?.name)
	if (!name) {
		return
	}
	const existing = target.get(name)
	if (!existing) {
		target.set(name, {
			name,
			defaultEnabled: Boolean(control.defaultEnabled),
			sourceFile: control.sourceFile ? normalizePathForMatching(control.sourceFile) : undefined,
			sourceKind: control.sourceKind ?? 'source',
		})
		return
	}
	if (!existing.defaultEnabled && control.defaultEnabled) {
		existing.defaultEnabled = true
	}
	if (!existing.sourceFile && control.sourceFile) {
		existing.sourceFile = normalizePathForMatching(control.sourceFile)
	}
	if (!existing.sourceKind && control.sourceKind) {
		existing.sourceKind = control.sourceKind
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
				qtControls: {},
			})
		}
		const target = byPackage.get(source.package)
		target.jobs = [...new Set([...target.jobs, ...(source.jobs ?? [])])]
			.filter(job => COMBAT_JOBS.some(item => item.id === job))
			.sort((left, right) => jobOrder(left) - jobOrder(right))
		target.qtControls = mergeQtControlMaps(target.qtControls, source.qtControls)
	}
	return [...byPackage.values()].filter(source => source.jobs.length)
}

function mergeQtControlMaps(left = {}, right = {}) {
	const result = {}
	for (const [job, controls] of Object.entries(left ?? {})) {
		result[job] = normalizeQtControls(controls)
	}
	for (const [job, controls] of Object.entries(right ?? {})) {
		result[job] = normalizeQtControls([...(result[job] ?? []), ...(controls ?? [])])
	}
	return result
}

function fallbackJobsForPackage(packageName) {
	const source = FALLBACK_ACR_SUPPORT.find(item => item.package === packageName)
	return source?.jobs?.length ? [...source.jobs] : []
}

async function readManifest(root) {
	try {
		const text = await readFile(path.join(root, 'decompile-manifest.json'), 'utf8')
		return JSON.parse(text.replace(/^\uFEFF/, ''))
	} catch {
		return []
	}
}

function packageNameForDirectory(directoryName, manifest) {
	const matched = manifestEntryForDirectory(directoryName, manifest)
	if (matched?.package) {
		return matched.package
	}
	const [prefix] = directoryName.split('_')
	return prefix || directoryName
}

function manifestEntryForDirectory(directoryName, manifest) {
	const normalized = normalizePathForMatching(directoryName)
	const matched = manifest.find(item => normalizePathForMatching(item.output ?? '').includes(normalized))
	return matched
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
