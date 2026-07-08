import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('yellow boss cast bars use dedicated high contrast styling', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.cast\.boss-idx-2\s*\{/)
	assert.match(css, /#1f1707/)
	assert.match(css, /box-shadow:[^}]*rgba\(255,\s*213,\s*74,\s*0\.38\)/s)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.cast-badge\s*\{/)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.item-damage\s*\{/)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.cast-release\s*\{/)
})

test('standalone boss damage bubbles stay readable on the pale timeline grid', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.damage\s*\{/)
	assert.match(css, /\.xiva-item\.damage[^}]*#2a1b04/s)
	assert.match(css, /\.xiva-item\.damage[^}]*border-color:\s*rgba\(255,\s*213,\s*74,\s*0\.92\)/s)
	assert.match(css, /\.xiva-item\.damage \.cast-time\s*\{/)
	assert.match(css, /\.xiva-item\.damage \.cast-time[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.42\)/s)
	assert.match(css, /\.xiva-item\.damage \.item-damage\s*\{/)
	assert.match(css, /\.xiva-item\.damage \.item-damage[^}]*#ffd54a/s)
})

test('boss cast bubbles use structured rows for cast, damage and resolve timing', async () => {
	const [js, css] = await Promise.all([
		readFile('public/app.js', 'utf8'),
		readFile('public/styles.css', 'utf8'),
	])

	assert.match(js, /class="cast-main"/)
	assert.match(js, /class="cast-meta"/)
	assert.match(js, /class="cast-resolve"/)
	assert.doesNotMatch(css, /\.xiva-item\.cast\s*\{[^}]*min-width:\s*168px/s)
	assert.match(css, /\.xiva-item\.cast\s*\{[^}]*min-width:\s*132px/s)
	assert.match(css, /\.xiva-item\.cast\s*\{[^}]*height:\s*52px/s)
	assert.match(css, /\.cast-main\s*\{/)
	assert.match(css, /\.cast-meta\s*\{/)
	assert.match(css, /\.cast-resolve\s*\{/)
	assert.match(css, /\.cast-name\s*\{[^}]*max-width:\s*none/s)
	assert.match(css, /\.xiva-item\.cast \.item-count\s*\{[^}]*right:\s*4px/s)
	assert.match(css, /\.xiva-item\.cast \.item-count\s*\{[^}]*top:\s*4px/s)
})

test('boss cast label chips use dark background with high-contrast white text', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	// The final override groups all five label chips with a unified dark background + white text.
	assert.match(
		css,
		/\.xiva-item\.cast \.cast-time[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast \.cast-time[^}]*color:\s*#fffaf1/)

	assert.match(
		css,
		/\.xiva-item\.cast \.cast-badge[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast \.cast-badge[^}]*color:\s*#fffaf1/)

	assert.match(
		css,
		/\.xiva-item\.cast \.cast-release[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast \.cast-release[^}]*color:\s*#fffaf1/)

	// 判定 (cast-start) must also be dark bg + white, not dim blue.
	assert.match(
		css,
		/\.xiva-item\.cast \.cast-start[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast \.cast-start[^}]*color:\s*#fffaf1/)

	// cast-resolve (the resolve time small) must be dark bg + white, not gray.
	assert.match(
		css,
		/\.xiva-item\.cast \.cast-resolve[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast \.cast-resolve[^}]*color:\s*#fffaf1/)
})

test('boss cast damage uses dark background with bright gold text', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(
		css,
		/\.xiva-item\.cast \.item-damage[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.88\)/,
	)
	assert.match(css, /\.xiva-item\.cast \.item-damage[^}]*color:\s*#ffe08a/)
	assert.match(css, /\.xiva-item\.cast \.item-damage[^}]*font-weight:\s*950/)
})

test('boss cast skill name uses bright white with text-shadow', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.cast \.cast-name[^}]*color:\s*#fffaf1/)
	assert.match(css, /\.xiva-item\.cast \.cast-name[^}]*font-weight:\s*950/)
	assert.match(css, /\.xiva-item\.cast \.cast-name[^}]*text-shadow:/)
})

test('boss cast meta row uses full-white color, not dimmed gray', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	// The final .cast-meta override must set color: #fffaf1 (not rgba ... 0.72).
	assert.match(css, /\.xiva-item\.cast \.cast-meta[^}]*color:\s*#fffaf1/)
})

test('yellow boss (boss-idx-2) label overrides are unified high-contrast', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	// Yellow boss badge: dark bg + white text (not yellow bg + dark text).
	assert.match(
		css,
		/\.xiva-item\.cast\.boss-idx-2 \.cast-badge[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.cast-badge[^}]*color:\s*#fffaf1/)

	// Yellow boss cast-release: dark bg + white text.
	assert.match(
		css,
		/\.xiva-item\.cast\.boss-idx-2 \.cast-release[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/,
	)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.cast-release[^}]*color:\s*#fffaf1/)

	// Yellow boss item-damage: dark bg + gold text.
	assert.match(
		css,
		/\.xiva-item\.cast\.boss-idx-2 \.item-damage[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.9\)/,
	)
	assert.match(css, /\.xiva-item\.cast\.boss-idx-2 \.item-damage[^}]*color:\s*#ffe08a/)
})

test('boss cast count badge is positioned and z-indexed above content', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.cast \.item-count[^}]*z-index:\s*6/)
	assert.match(css, /\.xiva-item\.cast \.item-count[^}]*right:\s*4px/)
	assert.match(css, /\.xiva-item\.cast \.item-count[^}]*top:\s*4px/)
})

test('boss cast layout uses grid for cast-main and flex for cast-meta', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	assert.match(css, /\.xiva-item\.cast \.cast-main[^}]*display:\s*grid/)
	assert.match(
		css,
		/\.xiva-item\.cast \.cast-main[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/,
	)
	assert.match(css, /\.xiva-item\.cast \.cast-meta[^}]*display:\s*flex/)
	assert.match(css, /\.xiva-item\.cast \.cast-meta[^}]*flex-wrap:\s*nowrap/)
})

test('boss cast labels stay inside a readable reserved card', async () => {
	const css = await readFile('public/styles.css', 'utf8')
	const finalCastStart = css.lastIndexOf('.xiva-item.cast {')
	const finalMainStart = css.lastIndexOf('.xiva-item.cast .cast-main')
	const finalMetaStart = css.lastIndexOf('.xiva-item.cast .cast-meta')
	const finalCastRule = css.slice(finalCastStart, css.indexOf('.xiva-item.cast .cast-main', finalCastStart))
	const finalCastMainRule = css.slice(finalMainStart, css.indexOf('.xiva-item.cast .cast-meta', finalMainStart))
	const finalCastMetaRule = css.slice(finalMetaStart, css.indexOf('.xiva-item.cast .cast-name', finalMetaStart))

	assert.match(finalCastRule, /overflow:\s*hidden/)
	assert.match(finalCastRule, /min-width:\s*132px/)
	assert.match(finalCastMainRule, /width:\s*100%/)
	assert.match(finalCastMainRule, /max-width:\s*100%/)
	assert.doesNotMatch(finalCastMainRule, /width:\s*max-content/)
	assert.doesNotMatch(finalCastMainRule, /max-width:\s*158px/)
	assert.match(finalCastMetaRule, /width:\s*100%/)
	assert.match(finalCastMetaRule, /max-width:\s*100%/)
	assert.doesNotMatch(finalCastMetaRule, /width:\s*max-content/)
	assert.doesNotMatch(finalCastMetaRule, /max-width:\s*158px/)
})

test('boss damage card elements are high-contrast', async () => {
	const css = await readFile('public/styles.css', 'utf8')

	// boss-damage-time: dark bg + white text.
	assert.match(
		css,
		/\.xiva-item\.damage \.boss-damage-time[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.62\)/,
	)
	assert.match(css, /\.xiva-item\.damage \.boss-damage-time[^}]*color:\s*#fffaf1/)

	// boss-damage-value: dark bg + gold text.
	assert.match(
		css,
		/\.xiva-item\.damage \.boss-damage-value[^}]*background:\s*rgba\(17,\s*24,\s*39,\s*0\.9\)/,
	)
	assert.match(css, /\.xiva-item\.damage \.boss-damage-value[^}]*color:\s*#ffe08a/)

	// boss-damage-name: white text.
	assert.match(css, /\.xiva-item\.damage \.boss-damage-name[^}]*color:\s*#fffaf1/)
})
