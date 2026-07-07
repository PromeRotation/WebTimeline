import {createServer} from 'node:http'
import {readFile, stat} from 'node:fs/promises'
import path from 'node:path'
import {compareFflogsLink} from './src/fflogs-api.mjs'
import {resolveStaticRequest} from './src/static-routes.mjs'

const port = Number(process.env.PORT ?? 4173)
const publicDir = path.resolve('public')
const resourceDir = path.resolve('..', '资源')
const kanoSourceDir = path.resolve(process.env.KANO_SOURCE_DIR ?? 'F:/acr开发/KanoACR/Kano')

const mimeTypes = new Map([
	['.html', 'text/html; charset=utf-8'],
	['.css', 'text/css; charset=utf-8'],
	['.js', 'text/javascript; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.png', 'image/png'],
	['.jpg', 'image/jpeg'],
])

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url, `http://${request.headers.host}`)
		const routePath = decodeURIComponent(url.pathname)
		if (routePath === '/api/fflogs/compare' && request.method === 'POST') {
			const body = await readRequestJson(request)
			const comparison = await compareFflogsLink({
				link: body.link,
				currentJob: body.currentJob,
				actorId: body.actorId === '' || body.actorId == null ? undefined : body.actorId,
				simulatedEvents: body.simulatedEvents ?? [],
				critRate: Number(body.critRate ?? 0.18),
				directRate: Number(body.directRate ?? 0.28),
				luck: body.luck ?? 'average',
				targetGcdUtilizationPercent: body.targetGcdUtilizationPercent,
			})
			writeJson(response, comparison)
			return
		}
		const route = resolveStaticRequest(routePath, {publicDir, resourceDir, kanoSourceDir})

		if (route.forbidden) {
			response.writeHead(403)
			response.end('Forbidden')
			return
		}

		const fileStat = await stat(route.filePath)
		const finalPath = fileStat.isDirectory() ? path.join(route.filePath, 'index.html') : route.filePath
		const body = await readFile(finalPath)
		response.writeHead(200, {
			'content-type': mimeTypes.get(path.extname(finalPath)) ?? 'application/octet-stream',
			'cache-control': 'no-store',
		})
		response.end(body)
	} catch (error) {
		if (request.url?.startsWith('/api/')) {
			response.writeHead(500, {'content-type': 'application/json; charset=utf-8'})
			response.end(JSON.stringify({error: error instanceof Error ? error.message : String(error)}))
			return
		}
		response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
		response.end('Not found')
	}
})

server.listen(port, () => {
	console.log(`WebTimeline prototype: http://127.0.0.1:${port}/`)
})

async function readRequestJson(request) {
	const chunks = []
	for await (const chunk of request) {
		chunks.push(chunk)
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function writeJson(response, payload) {
	response.writeHead(200, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
	})
	response.end(JSON.stringify(payload))
}
