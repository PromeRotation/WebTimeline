import test from 'node:test'
import assert from 'node:assert/strict'
import {
	clampTimelineZoom,
	scrollLeftForDrag,
	scrollLeftForZoom,
	shouldStartTimelineDrag,
	timelineWheelPanDelta,
	timelineMsFromClientX,
	zoomFromWheelDelta,
	zoomFromPinch,
} from '../public/timeline-interactions.js'

test('calculates timeline zoom from ctrl wheel and clamps to editor limits', () => {
	assert.equal(clampTimelineZoom(0.1), 0.6)
	assert.equal(clampTimelineZoom(12), 8)
	assert.ok(zoomFromWheelDelta(1, -120) > 1)
	assert.ok(zoomFromWheelDelta(1, 120) < 1)
})

test('keeps the pointer anchored when timeline zoom changes', () => {
	const nextScrollLeft = scrollLeftForZoom({
		scrollLeft: 300,
		viewportX: 200,
		previousScrollWidth: 1000,
		nextScrollWidth: 2000,
	})

	assert.equal(nextScrollLeft, 800)
})

test('maps normal wheel motion to timeline panning and pinch distance to zoom', () => {
	assert.equal(timelineWheelPanDelta({deltaX: 12, deltaY: 40}), 52)
	assert.equal(timelineWheelPanDelta({deltaX: 0, deltaY: -36}), -36)
	assert.ok(Math.abs(zoomFromPinch(1.2, 80, 120) - 1.8) < 0.001)
})

test('converts drag distance into horizontal timeline scroll', () => {
	assert.equal(scrollLeftForDrag({startScrollLeft: 120, startX: 300, currentX: 250}), 170)
	assert.equal(scrollLeftForDrag({startScrollLeft: 120, startX: 300, currentX: 380}), 40)
	assert.equal(scrollLeftForDrag({startScrollLeft: 10, startX: 300, currentX: 380}), 0)
})

test('does not start timeline drag from interactive controls inside the timeline', () => {
	assert.equal(shouldStartTimelineDrag({
		hasTimeline: true,
		button: 0,
		ctrlKey: false,
		timelinePinchActive: false,
		interactiveTarget: true,
	}), false)
	assert.equal(shouldStartTimelineDrag({
		hasTimeline: true,
		button: 0,
		ctrlKey: false,
		timelinePinchActive: false,
		interactiveTarget: false,
	}), true)
	assert.equal(shouldStartTimelineDrag({
		hasTimeline: false,
		button: 0,
		ctrlKey: false,
		timelinePinchActive: false,
		interactiveTarget: false,
	}), false)
	assert.equal(shouldStartTimelineDrag({
		hasTimeline: true,
		button: 1,
		ctrlKey: false,
		timelinePinchActive: false,
		interactiveTarget: false,
	}), false)
})

test('maps a dropped skill x position into timeline milliseconds', () => {
	assert.equal(timelineMsFromClientX({clientX: 250, containerLeft: 50, scrollLeft: 300, scrollWidth: 2000, durationMs: 1000000}), 250000)
	assert.equal(timelineMsFromClientX({clientX: -100, containerLeft: 50, scrollLeft: 0, scrollWidth: 2000, durationMs: 1000000}), 0)
	assert.equal(timelineMsFromClientX({clientX: 3000, containerLeft: 0, scrollLeft: 0, scrollWidth: 2000, durationMs: 1000000}), 1000000)
})
