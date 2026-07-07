export const MIN_TIMELINE_ZOOM = 0.6
export const MAX_TIMELINE_ZOOM = 8

export function clampTimelineZoom(value) {
	const zoom = Number(value)
	if (!Number.isFinite(zoom)) {
		return 1
	}
	return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, zoom))
}

export function zoomFromWheelDelta(currentZoom, deltaY) {
	const direction = deltaY < 0 ? 1 : -1
	const factor = 1 + direction * 0.12
	return clampTimelineZoom(currentZoom * factor)
}

export function zoomFromPinch(currentZoom, startDistance, currentDistance) {
	if (startDistance <= 0 || currentDistance <= 0) {
		return clampTimelineZoom(currentZoom)
	}
	return clampTimelineZoom(currentZoom * (currentDistance / startDistance))
}

export function scrollLeftForZoom({scrollLeft, viewportX, previousScrollWidth, nextScrollWidth}) {
	if (previousScrollWidth <= 0 || nextScrollWidth <= 0) {
		return scrollLeft
	}
	const anchorRatio = (scrollLeft + viewportX) / previousScrollWidth
	return Math.max(0, anchorRatio * nextScrollWidth - viewportX)
}

export function timelineWheelPanDelta(eventLike) {
	const deltaX = Number(eventLike.deltaX ?? 0)
	const deltaY = Number(eventLike.deltaY ?? 0)
	return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaX + deltaY
}

export function scrollLeftForDrag({startScrollLeft, startX, currentX}) {
	return Math.max(0, startScrollLeft - (currentX - startX))
}

export function shouldStartTimelineDrag({hasTimeline, button, ctrlKey, timelinePinchActive, interactiveTarget}) {
	return Boolean(hasTimeline) && button === 0 && !ctrlKey && !timelinePinchActive && !interactiveTarget
}

export function timelineMsFromClientX({clientX, containerLeft, scrollLeft, scrollWidth, durationMs}) {
	const x = Math.max(0, Number(clientX ?? 0) - Number(containerLeft ?? 0) + Number(scrollLeft ?? 0))
	const width = Math.max(1, Number(scrollWidth ?? 1))
	const duration = Math.max(0, Number(durationMs ?? 0))
	return Math.round(Math.min(1, x / width) * duration)
}

export function touchDistance(touchA, touchB) {
	const dx = touchA.clientX - touchB.clientX
	const dy = touchA.clientY - touchB.clientY
	return Math.hypot(dx, dy)
}

export function touchCenterX(touchA, touchB, containerLeft = 0) {
	return ((touchA.clientX + touchB.clientX) / 2) - containerLeft
}
