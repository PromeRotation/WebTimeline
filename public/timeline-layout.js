export function assignTimelineLanes(items, options = {}) {
	const lanes = []
	const laneGapMs = Number(options.laneGapMs ?? 0)
	return [...items]
		.map((item, index) => ({item, index}))
		.sort((left, right) => {
			const startDelta = left.item.startMs - right.item.startMs
			if (startDelta) return startDelta
			const durationDelta = (right.item.endMs - right.item.startMs) - (left.item.endMs - left.item.startMs)
			return durationDelta || left.index - right.index
		})
		.map(({item}) => {
			const visualEndMs = visualEndForItem(item, options) + laneGapMs + visualGapMs(options)
			const lane = firstAvailableLane(lanes, item.startMs)
			lanes[lane] = visualEndMs
			return {...item, lane}
		})
}

export function timelineLaneCount(items) {
	if (!items.length) {
		return 1
	}
	return Math.max(1, ...items.map(item => Number(item.lane ?? 0) + 1))
}

function firstAvailableLane(lanes, startMs) {
	const index = lanes.findIndex(endMs => endMs <= startMs)
	return index < 0 ? lanes.length : index
}

function visualEndForItem(item, options) {
	const endMs = Number(item.endMs ?? item.startMs ?? 0)
	const durationMs = Number(options.durationMs ?? 0)
	const trackWidthPx = Number(options.trackWidthPx ?? 0)
	const minVisualWidthPx = Number(options.minVisualWidthPx ?? 0)
	if (!durationMs || !trackWidthPx || !minVisualWidthPx) {
		return endMs
	}

	const minDurationMs = durationMs * (minVisualWidthPx / trackWidthPx)
	return Math.max(endMs, Number(item.startMs ?? 0) + minDurationMs)
}

function visualGapMs(options) {
	const durationMs = Number(options.durationMs ?? 0)
	const trackWidthPx = Number(options.trackWidthPx ?? 0)
	const minVisualGapPx = Number(options.minVisualGapPx ?? 0)
	if (!durationMs || !trackWidthPx || !minVisualGapPx) {
		return 0
	}
	return durationMs * (minVisualGapPx / trackWidthPx)
}
