import test from 'node:test'
import assert from 'node:assert/strict'
import {assignTimelineLanes, timelineLaneCount} from '../public/timeline-layout.js'

test('assigns overlapping timeline items to separate visual lanes', () => {
	const items = [
		{id: 'a', startMs: 1000, endMs: 6000},
		{id: 'b', startMs: 1000, endMs: 4000},
		{id: 'c', startMs: 4500, endMs: 5500},
	]

	const laidOut = assignTimelineLanes(items)

	assert.deepEqual(laidOut.map(item => [item.id, item.lane]), [['a', 0], ['b', 1], ['c', 1]])
	assert.equal(timelineLaneCount(laidOut), 2)
})

test('uses visual width when assigning lanes for boss cast bubbles', () => {
	const items = [
		{id: 'a', type: 'cast', startMs: 1000, endMs: 1800},
		{id: 'b', type: 'cast', startMs: 2200, endMs: 3000},
		{id: 'c', type: 'cast', startMs: 62000, endMs: 63000},
	]

	const laidOut = assignTimelineLanes(items, {durationMs: 120000, minVisualWidthPx: 84, trackWidthPx: 1200})

	assert.deepEqual(laidOut.map(item => [item.id, item.lane]), [['a', 0], ['b', 1], ['c', 0]])
	assert.equal(timelineLaneCount(laidOut), 2)
})

test('boss cast lane spacing can follow real cast duration without card-sized padding', () => {
	const items = [
		{id: 'a', type: 'cast', startMs: 1000, endMs: 1800},
		{id: 'b', type: 'cast', startMs: 2200, endMs: 3000},
	]

	const laidOut = assignTimelineLanes(items, {durationMs: 120000, minVisualWidthPx: 0, trackWidthPx: 1200, laneGapMs: 0})

	assert.deepEqual(laidOut.map(item => [item.id, item.lane]), [['a', 0], ['b', 0]])
	assert.equal(timelineLaneCount(laidOut), 1)
})


test('uses laneGapMs to add spacing between items in the same lane', () => {
	const items = [
		{id: 'a', type: 'cast', startMs: 1000, endMs: 2000},
		{id: 'b', type: 'cast', startMs: 2100, endMs: 3000},
	]

	const withoutGap = assignTimelineLanes(items, {durationMs: 6000, minVisualWidthPx: 10, trackWidthPx: 600})
	const withGap = assignTimelineLanes(items, {durationMs: 6000, minVisualWidthPx: 10, trackWidthPx: 600, laneGapMs: 500})

	assert.deepEqual(withoutGap.map(item => [item.id, item.lane]), [['a', 0], ['b', 0]])
	assert.deepEqual(withGap.map(item => [item.id, item.lane]), [['a', 0], ['b', 1]])
})

test('converts pixel lane spacing to time so dense boss bubbles do not touch visually', () => {
	const items = [
		{id: 'a', type: 'cast', startMs: 1000, endMs: 2000},
		{id: 'b', type: 'cast', startMs: 13000, endMs: 14000},
		{id: 'c', type: 'cast', startMs: 27000, endMs: 28000},
	]

	const withoutGap = assignTimelineLanes(items, {durationMs: 120000, minVisualWidthPx: 120, trackWidthPx: 1200})
	const withPixelGap = assignTimelineLanes(items, {durationMs: 120000, minVisualWidthPx: 120, minVisualGapPx: 12, trackWidthPx: 1200})

	assert.deepEqual(withoutGap.map(item => [item.id, item.lane]), [['a', 0], ['b', 0], ['c', 0]])
	assert.deepEqual(withPixelGap.map(item => [item.id, item.lane]), [['a', 0], ['b', 1], ['c', 0]])
})
