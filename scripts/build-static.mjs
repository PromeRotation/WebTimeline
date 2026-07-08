import {access, readFile} from 'node:fs/promises'

const requiredFiles = [
	'public/index.html',
	'public/home.html',
	'public/app.html',
	'public/app.js',
	'public/styles.css',
	'public/data/prototype.json',
]

for (const file of requiredFiles) {
	await access(file)
}

for (const htmlFile of ['public/index.html', 'public/home.html', 'public/app.html']) {
	const html = await readFile(htmlFile, 'utf8')
	if (html.includes('href="/styles.css"') || html.includes('src="/app.js')) {
		throw new Error(`${htmlFile} must use relative asset paths for Pages deployment`)
	}
}

console.log('Static build ready: publish the public directory.')
