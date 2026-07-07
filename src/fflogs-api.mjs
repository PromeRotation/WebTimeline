import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {buildFflogsComparisonFromEvents, parseFflogsReportUrl} from './fflogs-comparison.mjs'

const DEFAULT_CACHE_DIR = path.resolve('data', 'fflogs-cache')
const DEFAULT_KEY_PATH = path.resolve('..', '资源', 'private', 'fflogs api.txt')
const EVENT_ENDPOINTS = ['casts', 'damage-done', 'healing']

export async function compareFflogsLink({
	link,
	currentJob,
	actorId,
	simulatedEvents = [],
	critRate = 0.18,
	directRate = 0.28,
	luck = 'average',
	targetGcdUtilizationPercent,
	cacheDir = DEFAULT_CACHE_DIR,
	apiKeyPath = DEFAULT_KEY_PATH,
	fetchImpl = globalThis.fetch,
} = {}) {
	const parsed = parseFflogsReportUrl(link)
	const apiKey = await readFflogsApiKey(apiKeyPath)
	const payload = await loadOrFetchFflogsPayload({
		...parsed,
		apiKey,
		cacheDir,
		fetchImpl,
	})
	return createFflogsComparison({
		payload,
		currentJob,
		actorId,
		simulatedEvents,
		critRate,
		directRate,
		luck,
		targetGcdUtilizationPercent,
	})
}

export function createFflogsComparison({
	payload,
	currentJob,
	actorId,
	simulatedEvents = [],
	critRate = 0.18,
	directRate = 0.28,
	luck = 'average',
	targetGcdUtilizationPercent,
} = {}) {
	return buildFflogsComparisonFromEvents(payload, simulatedEvents, {
		currentJob,
		actorId,
		critRate,
		directRate,
		luck,
		targetGcdUtilizationPercent,
	})
}

export async function loadOrFetchFflogsPayload({
	reportCode,
	fightId,
	apiKey,
	cacheDir = DEFAULT_CACHE_DIR,
	fetchImpl = globalThis.fetch,
} = {}) {
	const cachePath = path.join(cacheDir, `${reportCode}-fight-${fightId}.json`)
	try {
		return JSON.parse(await readFile(cachePath, 'utf8'))
	} catch {
		// Cache miss: fetch below.
	}
	const fightsPayload = await fetchJson(fflogsV1Url(`/report/fights/${reportCode}`, {api_key: apiKey}), fetchImpl)
	const fight = (fightsPayload.fights ?? []).find(item => Number(item.id) === Number(fightId))
	if (!fight) {
		throw new Error(`FFLogs fight ${fightId} not found`)
	}
	const events = []
	for (const endpoint of EVENT_ENDPOINTS) {
		events.push(...await fetchPagedEvents({
			endpoint,
			reportCode,
			start: fight.start_time,
			end: fight.end_time,
			apiKey,
			fetchImpl,
		}))
	}
	const payload = buildFflogsEventPayload({
		fightsPayload,
		reportCode,
		fightId,
		events,
	})
	await mkdir(cacheDir, {recursive: true})
	await writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf8')
	return payload
}

export function buildFflogsEventPayload({fightsPayload, reportCode, fightId, events = []} = {}) {
	const fight = (fightsPayload.fights ?? []).find(item => Number(item.id) === Number(fightId))
	if (!fight) {
		throw new Error(`FFLogs fight ${fightId} not found`)
	}
	return {
		source: 'fflogs-v1',
		sourceType: 'fflogs-v1-player-events',
		reportCode,
		fightId,
		report: {
			lang: fightsPayload.lang,
		},
		fight,
		friendlies: fightsPayload.friendlies ?? [],
		friendlyPets: fightsPayload.friendlyPets ?? [],
		enemies: fightsPayload.enemies ?? [],
		enemyPets: fightsPayload.enemyPets ?? [],
		events: events.filter(event => Number(event.fight ?? fightId) === Number(fightId)),
		fetchedAt: new Date().toISOString(),
	}
}

export async function readFflogsApiKey(filePath = DEFAULT_KEY_PATH) {
	const text = await readFile(filePath, 'utf8')
	const match = /V1 Client Key:\s*([a-z0-9]+)/i.exec(text) || /api[_ -]?key[:=]\s*([a-z0-9]+)/i.exec(text)
	if (!match) {
		throw new Error('找不到 FFLogs V1 API key')
	}
	return match[1]
}

async function fetchPagedEvents({endpoint, reportCode, start, end, apiKey, fetchImpl}) {
	const events = []
	let pageStart = Number(start)
	let guard = 0
	while (pageStart < Number(end) && guard < 50) {
		guard += 1
		const payload = await fetchJson(fflogsV1Url(`/report/events/${endpoint}/${reportCode}`, {
			start: pageStart,
			end,
			hostility: 0,
			api_key: apiKey,
		}), fetchImpl)
		events.push(...(payload.events ?? []))
		if (!payload.nextPageTimestamp || Number(payload.nextPageTimestamp) <= pageStart) {
			break
		}
		pageStart = Number(payload.nextPageTimestamp)
	}
	return events
}

async function fetchJson(url, fetchImpl) {
	if (typeof fetchImpl !== 'function') {
		throw new Error('当前 Node 运行时不支持 fetch')
	}
	const response = await fetchImpl(url)
	if (!response.ok) {
		throw new Error(`FFLogs API 请求失败：HTTP ${response.status}`)
	}
	return response.json()
}

function fflogsV1Url(route, params) {
	const url = new URL(`https://www.fflogs.com/v1${route}`)
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, String(value))
	}
	return url
}
