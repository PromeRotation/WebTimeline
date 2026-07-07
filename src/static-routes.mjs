import path from 'node:path'

export function resolveStaticRequest(routePath, dirs) {
	const publicDir = path.resolve(dirs.publicDir)
	const resourceDir = path.resolve(dirs.resourceDir)
	const kanoSourceDir = path.resolve(dirs.kanoSourceDir)
	const route = String(routePath || '/')
	const mapping = routeMapping(route, {publicDir, resourceDir, kanoSourceDir})
	const filePath = path.resolve(mapping.baseDir, mapping.relativePath)

	return {
		...mapping,
		filePath,
		forbidden: !isPathInside(mapping.baseDir, filePath),
	}
}

function routeMapping(routePath, dirs) {
	if (routePath.startsWith('/resources/')) {
		return {
			baseDir: dirs.resourceDir,
			relativePath: routePath.replace('/resources/', ''),
		}
	}
	if (routePath.startsWith('/kano-source/')) {
		return {
			baseDir: dirs.kanoSourceDir,
			relativePath: routePath.replace('/kano-source/', ''),
		}
	}
	return {
		baseDir: dirs.publicDir,
		relativePath: routePath === '/' ? 'index.html' : routePath.replace(/^\/+/, ''),
	}
}

function isPathInside(baseDir, filePath) {
	const relative = path.relative(path.resolve(baseDir), path.resolve(filePath))
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
