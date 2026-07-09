import {
	clampTimelineZoom,
	scrollLeftForDrag,
	scrollLeftForZoom,
	shouldStartTimelineDrag,
	timelineWheelPanDelta,
	timelineMsFromClientX,
	touchCenterX,
	touchDistance,
	zoomFromPinch,
	zoomFromWheelDelta,
} from './timeline-interactions.js'
import {assignTimelineLanes, timelineLaneCount} from './timeline-layout.js'
import {
	filterTimelineRowsByPhase,
	mergeBossCastAndDamageRows,
	absoluteMsForPhaseTime,
	phaseLabelForTime,
	phaseOptions,
	prepareBossTimelineRows,
	timelineDurationMs,
	timelineRowsForPhase,
	timelineTicks,
} from './timeline-view.js'
import {
	collectBossCastItems,
	detectTimelineImportKind,
	flattenPrTimeline,
	flattenPtlTimeline,
	normalizePhaseTaggedEvents,
	resolveBossCastConditionTimeMs,
	tagEventsByPhaseWindows,
} from './timeline-import-parser.js'

/* ============================================================
   Lightweight i18n — three languages, no framework.
   zh-CN is the source-of-truth default; zh-TW and ja-JP are
   translated overlays. Strings fall back to the zh-CN entry,
   then to the provided fallback, then to the key itself.
   ============================================================ */
const SUPPORTED_LANGUAGES = ['zh-CN', 'zh-TW', 'ja-JP']
const LANGUAGE_STORAGE_KEY = 'webtimelineLanguage'
const LANGUAGE_LABELS = {
	'zh-CN': '简中',
	'zh-TW': '繁中',
	'ja-JP': '日本語',
}

const I18N = {
	'zh-CN': {
		'nav.timeline': '时间轴编辑',
		'nav.tools': '工具',
		'nav.teamMode': '8人团队模式',
		'brand.subtitle': '妖星编辑器',
		'label.mode': '模式',
		'label.job': '职业',
		'label.acr': 'ACR',
		'label.target': '目标',
		'mode.browse': '浏览模式',
		'mode.edit': '编辑模式',
		'action.import': '导入',
		'action.export': '导出',
		'action.insert': '插入',
		'action.close': '关闭',
		'action.trace': '追踪',
		'action.track': '追踪',
		'action.tracked': '已追踪',
		'action.located': '已定位',
		'action.browse': '浏览',
		'action.insertBurst': '插入爆发',
		'action.insertPotion': '插入爆发药',
		'action.insertQt': '插入QT',
		'action.addFocus': '+ 关注技能',
		'action.removeFocus': '取消关注',
		'action.duplicate': '复制',
		'action.delete': '删除',
		'status.current': '当前选择',
		'status.unspecified': '未指定',
		'status.notConnected': '未接入',
		'label.jobColon': '职业：',
		'label.acrColon': 'ACR：',
		'rail.timeline': '时间轴',
		'rail.tools': '工具',
		'rail.about': '关于',
		'rail.output': '输出轴',
		'rail.mitigation': '减伤 / 奶轴',
		'rail.burst': '爆发',
		'rail.acrSim': 'ACR 模拟',
		'rail.focusAdd': '+ 关注技能',
		'legend.boss': 'Boss',
		'legend.output': '输出',
		'legend.mitigation': '减伤',
		'legend.burst': '爆发',
		'phase.all': '全部',
		'sim.hide': '隐藏 ACR 模拟',
		'sim.show': '显示 ACR 模拟',
		'sim.outputOn': '输出轴包含 ACR 模拟技能',
		'sim.outputOff': '输出轴仅显示导入 / 手动技能',
		'overview.title': '整页总览',
		'overview.boss': 'Boss 读条',
		'overview.mitigation': '减伤 / 奶轴',
		'overview.damage': '输出轴',
		'overview.potion': '爆发药轴',
		'overview.opener': '起手',
		'overview.qt': 'QT',
		'overview.burst': '爆发',
		'overview.ariaToggles': '总览显示项',
		'category.all': '全部',
		'category.output': '输出',
		'category.mitigation': '减伤',
		'category.potion': '爆发药',
		'category.qt': 'QT',
		'category.burst': '爆发',
		'insert.title': '插入技能',
		'insert.hint': '拖入时间轴或点击卡片立即生成手动技能',
		'insert.floatTitle': '拖动移动，点击打开编程模式面板',
		'insert.skillIdPlaceholder': '技能 ID',
		'burst.title': '爆发',
		'burst.hint': '拖到时间轴或点击插入 60 / 120 爆发模板',
		'burst.120': '120 爆发',
		'burst.60': '60 爆发',
		'potion.title': '爆发药',
		'potion.hint': '先选属性，再在下方选择等级；插入后作为 30 秒爆发药窗口，冷却按 4:30 处理',
		'potion.attributeAria': '爆发药属性',
		'potion.selectSuffix': '药',
		'potion.role.strength': '力量系',
		'potion.role.dexterity': '敏捷系',
		'potion.role.intelligence': '法系输出',
		'potion.role.mind': '治疗系',
		'potion.attr.strength': '刚力',
		'potion.attr.dexterity': '巧力',
		'potion.attr.intelligence': '智力',
		'potion.attr.mind': '意力',
		'qt.note': '点击左侧 QT 只会切换本次草稿；右侧确认要写入的逻辑，没问题后再插入。',
		'qt.draftTitle': '本次插入逻辑',
		'qt.draftChanges': '项变更',
		'qt.on': '开启',
		'qt.off': '关闭',
		'detail.panelNotFound': '没有找到这个栏目。',
		'detail.noData': '当前 P / 当前过滤条件下暂无数据',
		'detail.bossLocked': 'Boss 技能默认锁定',
		'detail.locateTitle': '跳转到时间轴上的这个技能',
		'detail.targetRequired': '必须选择目标',
		'target.placeholder': '请选择',
		'target.boss': 'Boss / Target',
		'target.self': '自己 / Self',
		'target.targetOfTarget': '目标的目标',
		'target.party': '队友',
		'manual.title': '手动轴编辑',
		'manual.hintEdit': '可以改时间、微调、复制或删除用户手动技能',
		'manual.hintBrowse': '浏览模式下锁定，切到编辑模式后可调整',
		'time.globalSec': '全局秒',
		'time.phaseSec': '秒',
		'acr.title': 'ACR 数据库',
		'acr.dockTitle': 'ACR 数据库',
		'acr.packages': 'ACR 包列表',
		'acr.field.status': '支持状态：',
		'acr.field.author': '作者：',
		'acr.field.source': '数据来源：',
		'acr.stat.jobs': '职业',
		'acr.stat.packages': 'ACR 包',
		'acr.stat.supported': '已支持',
		'acr.stat.waiting': '等待接入',
		'acr.stat.unsupported': '未支持',
		'acr.dataLabel': 'ACR 数据',
		'acr.status.supported': '已支持',
		'acr.status.waiting': '等待接入',
		'acr.status.unsupported': '未支持',
		'about.title': '关于',
		'about.eyebrow': '项目信息',
		'about.projectName': '项目名称',
		'about.intro': '简介',
		'about.introValue': 'FF14 时间轴编辑器 / ACR 辅助工具',
		'about.author': '作者',
		'about.version': '版本',
		'about.updatedAt': '更新时间',
		'about.supportedJobs': '支持职业',
		'about.supportedJobsValue': '已支持 {supported} / 共 {total} 个职业',
		'about.acrSource': 'ACR 数据源',
		'about.acrSourceValue': '2026-07-09',
		'about.fflogs': 'FFLogs 对比',
		'about.localImport': '本地时间轴导入',
		'about.port': '当前运行端口',
		'about.supported': '支持',
		'role.tank': 'T',
		'role.healer': 'H',
		'role.dps': 'DPS',
		'role.ranged': '远敏',
		'role.caster': '法系',
		'role.melee': '近战',
		'focus.eyebrow': '技能追踪器',
		'focus.help': '追踪当前职业的任意技能，显示出现次数、时间点和来源。',
		'focus.searchPlaceholder': '搜索技能名或技能 ID',
		'focus.currentJob': '当前职业技能',
		'focus.other': '其他技能',
		'focus.otherDesc': '其他职业、导入轴里出现过的技能，默认收起',
		'focus.universal': '通用',
		'focus.countSuffix': '个',
		'focus.occurrences': '本轴',
		'focus.timesSuffix': '次',
		'focus.trackedCount': '已追踪 {n} 个技能',
		'focus.emptyHint': '点击选择当前职业技能',
		'focus.skillId': '技能',
		'tool.eyebrow': '工具',
		'tool.title': '模拟估值 / FFLogs 对比',
		'tool.statusPill': '妖星首版',
		'tool.simEyebrow': '伤害模拟计算',
		'tool.simTitle': '分 P 与整体估值',
		'tool.luckAverage': '平均',
		'tool.luckLucky': '好运直暴',
		'tool.luckLow': '保守',
		'tool.critRate': '暴击概率',
		'tool.directRate': '直击概率',
		'tool.simHint': '可与当前 ACT log、FFLogs 榜一轴和导入轴做模拟对比。',
		'fflogs.eyebrow': 'FFLogs 对比模式',
		'fflogs.title': '当前轴 vs 日志实战轴',
		'fflogs.statusParsed': '已解析',
		'fflogs.statusPending': '待导入',
		'fflogs.placeholder': '粘贴 FFLogs report 链接',
		'fflogs.parse': '解析 FFLogs',
		'fflogs.parsing': '解析中',
		'fflogs.hint': '导入链接后会自动匹配当前职业，解析本地缓存事件，并对比伤害、技能数、GCD 利用率和治疗量。',
		'fflogs.actor': '角色',
		'fflogs.unknownJob': '未知',
		'fflogs.metric.damage': '伤害',
		'fflogs.metric.skills': '全部技能数',
		'fflogs.metric.gcd': 'GCD 利用率',
		'fflogs.metric.healing': '治疗量',
		'fflogs.sim': '模拟',
		'fflogs.log': '日志',
		'fflogs.section.phaseDamage': '分 P 伤害',
		'fflogs.section.skillDiff': '技能数量差异',
		'fflogs.tableHeader.phase': 'P',
		'fflogs.tableHeader.simulated': '模拟',
		'fflogs.tableHeader.log': '日志',
		'fflogs.tableHeader.delta': '差值',
		'fflogs.tableHeader.skill': '技能',
		'fflogs.gcdLabel': '模拟利用率',
		'fflogs.applyLog': '套用日志',
		'fflogs.reset': '重置 100%',
		'fflogs.gcdInfo': '原始模拟',
		'fflogs.gcdTargetDiff': '目标差',
		'fflogs.metric.actions': '动作',
		'fflogs.metric.autoAttack': '自动攻击',
		'boot.loading': '正在装载妖星时间轴...',
		'empty.noData': '暂无数据',
		'empty.noSkillInCategory': '这个分类暂无技能',
		'empty.noBurst': '暂无可插入的爆发',
		'empty.noPotion': '暂无可插入的爆发药',
		'empty.noQt': '暂无 QT',
		'empty.noQtState': '暂时没有解析到 QT 状态',
		'empty.noQtBurst': '当前 P / 当前过滤条件下暂无 QT 节点',
		'empty.noBurstData': '当前 P / 当前过滤条件下暂无爆发数据',
		'empty.qtDraftEmpty': '先点击左侧 QT 开关',
		'empty.noManual': '当前分类还没有手动技能，可先从上方复制或从技能列拖入。',
		'empty.noSkill': '没有找到技能',
		'unit.items': '项',
		'hint.trackSkill': '点击追踪这个技能的出现位置',
		'hint.traceSkill': '点击在时间轴上定位并高亮这个技能，不会新增关注技能',
		'hint.noTrackableId': '暂无可追踪 ID',
		'hint.insertToQueue': '插入到手动队列',
		'hint.dragInsertBurst': '点击插入这个爆发中可识别的职业技能，也可以拖入时间轴',
		'source.manual': '用户手动',
		'source.acr': 'ACR 自动',
		'source.timeline': '导入时间轴',
		'meta.originalAxis': '原轴：',
		'meta.cdAdjusted': '队列已顺延',
		'meta.queueCd': '队列CD调整',
		'acr.lockedHint': 'ACR 自动技能已锁定，可关注查看，后续高手模式再允许复制为手动技能。',
		'edit.lockedHint': '切到编辑模式后可拖入时间轴',
		'nav.fflogs': 'FFLogs 对比',
		'nav.simulation': '伤害模拟',
		'aria.editSection': '编辑分区',
		'aria.editorMode': '编辑器模式',
		'detail.qtControl': 'QT 控制',
		'category.healing': '治疗',
		'hint.dragToTimeline': '拖入时间轴',
		'insert.panelHandle': '拖动移动插入技能面板',
		'acr.lockedShort': 'ACR 锁定',
		'hint.draggableTime': '可拖动调整时间',
	},
	'zh-TW': {
		'nav.timeline': '時間軸編輯',
		'nav.tools': '工具',
		'nav.teamMode': '8人團隊模式',
		'brand.subtitle': '妖星編輯器',
		'label.mode': '模式',
		'label.job': '職業',
		'label.acr': 'ACR',
		'label.target': '目標',
		'mode.browse': '瀏覽模式',
		'mode.edit': '編輯模式',
		'action.import': '匯入',
		'action.export': '匯出',
		'action.insert': '插入',
		'action.close': '關閉',
		'action.trace': '追蹤',
		'action.track': '追蹤',
		'action.tracked': '已追蹤',
		'action.located': '已定位',
		'action.browse': '瀏覽',
		'action.insertBurst': '插入爆發',
		'action.insertPotion': '插入爆發藥',
		'action.insertQt': '插入QT',
		'action.addFocus': '+ 關注技能',
		'action.removeFocus': '取消關注',
		'action.duplicate': '複製',
		'action.delete': '刪除',
		'status.current': '目前選擇',
		'status.unspecified': '未指定',
		'status.notConnected': '未接入',
		'label.jobColon': '職業：',
		'label.acrColon': 'ACR：',
		'rail.timeline': '時間軸',
		'rail.tools': '工具',
		'rail.about': '關於',
		'rail.output': '輸出軸',
		'rail.mitigation': '減傷 / 奶軸',
		'rail.burst': '爆發',
		'rail.acrSim': 'ACR 模擬',
		'rail.focusAdd': '+ 關注技能',
		'legend.boss': 'Boss',
		'legend.output': '輸出',
		'legend.mitigation': '減傷',
		'legend.burst': '爆發',
		'phase.all': '全部',
		'sim.hide': '隱藏 ACR 模擬',
		'sim.show': '顯示 ACR 模擬',
		'sim.outputOn': '輸出軸包含 ACR 模擬技能',
		'sim.outputOff': '輸出軸僅顯示匯入 / 手動技能',
		'overview.title': '整頁總覽',
		'overview.boss': 'Boss 讀條',
		'overview.mitigation': '減傷 / 奶軸',
		'overview.damage': '輸出軸',
		'overview.potion': '爆發藥軸',
		'overview.opener': '起手',
		'overview.qt': 'QT',
		'overview.burst': '爆發',
		'overview.ariaToggles': '總覽顯示項',
		'category.all': '全部',
		'category.output': '輸出',
		'category.mitigation': '減傷',
		'category.potion': '爆發藥',
		'category.qt': 'QT',
		'category.burst': '爆發',
		'insert.title': '插入技能',
		'insert.hint': '拖入時間軸或點擊卡片立即產生手動技能',
		'insert.floatTitle': '拖動移動，點擊打開程式設計模式面板',
		'insert.skillIdPlaceholder': '技能 ID',
		'burst.title': '爆發',
		'burst.hint': '拖到時間軸或點擊插入 60 / 120 爆發範本',
		'burst.120': '120 爆發',
		'burst.60': '60 爆發',
		'potion.title': '爆發藥',
		'potion.hint': '先選屬性，再在下方選擇等級；插入後作為 30 秒爆發藥窗口，冷卻按 4:30 處理',
		'potion.attributeAria': '爆發藥屬性',
		'potion.selectSuffix': '藥',
		'potion.role.strength': '力量系',
		'potion.role.dexterity': '敏捷系',
		'potion.role.intelligence': '法系輸出',
		'potion.role.mind': '治療系',
		'potion.attr.strength': '剛力',
		'potion.attr.dexterity': '巧力',
		'potion.attr.intelligence': '智力',
		'potion.attr.mind': '意力',
		'qt.note': '點擊左側 QT 只會切換本次草稿；右側確認要寫入的邏輯，沒問題後再插入。',
		'qt.draftTitle': '本次插入邏輯',
		'qt.draftChanges': '項變更',
		'qt.on': '開啟',
		'qt.off': '關閉',
		'detail.panelNotFound': '沒有找到這個欄目。',
		'detail.noData': '目前 P / 目前過濾條件下暫無資料',
		'detail.bossLocked': 'Boss 技能預設鎖定',
		'detail.locateTitle': '跳轉到時間軸上的這個技能',
		'detail.targetRequired': '必須選擇目標',
		'target.placeholder': '請選擇',
		'target.boss': 'Boss / Target',
		'target.self': '自己 / Self',
		'target.targetOfTarget': '目標的目標',
		'target.party': '隊友',
		'manual.title': '手動軸編輯',
		'manual.hintEdit': '可以改時間、微調、複製或刪除使用者手動技能',
		'manual.hintBrowse': '瀏覽模式下鎖定，切到編輯模式後可調整',
		'time.globalSec': '全域秒',
		'time.phaseSec': '秒',
		'acr.title': 'ACR 資料庫',
		'acr.dockTitle': 'ACR 資料庫',
		'acr.packages': 'ACR 包列表',
		'acr.field.status': '支援狀態：',
		'acr.field.author': '作者：',
		'acr.field.source': '資料來源：',
		'acr.stat.jobs': '職業',
		'acr.stat.packages': 'ACR 包',
		'acr.stat.supported': '已支援',
		'acr.stat.waiting': '等待接入',
		'acr.stat.unsupported': '未支援',
		'acr.dataLabel': 'ACR 資料',
		'acr.status.supported': '已支援',
		'acr.status.waiting': '等待接入',
		'acr.status.unsupported': '未支援',
		'about.title': '關於',
		'about.eyebrow': '專案資訊',
		'about.projectName': '專案名稱',
		'about.intro': '簡介',
		'about.introValue': 'FF14 時間軸編輯器 / ACR 輔助工具',
		'about.author': '作者',
		'about.version': '版本',
		'about.updatedAt': '更新時間',
		'about.supportedJobs': '支援職業',
		'about.supportedJobsValue': '已支援 {supported} / 共 {total} 個職業',
		'about.acrSource': 'ACR 資料來源',
		'about.acrSourceValue': '2026-07-09',
		'about.fflogs': 'FFLogs 對比',
		'about.localImport': '本地時間軸匯入',
		'about.port': '目前執行連接埠',
		'about.supported': '支援',
		'role.tank': 'T',
		'role.healer': 'H',
		'role.dps': 'DPS',
		'role.ranged': '遠敏',
		'role.caster': '法系',
		'role.melee': '近戰',
		'focus.eyebrow': '技能追蹤器',
		'focus.help': '追蹤目前職業的任意技能，顯示出現次數、時間點和來源。',
		'focus.searchPlaceholder': '搜尋技能名或技能 ID',
		'focus.currentJob': '目前職業技能',
		'focus.other': '其他技能',
		'focus.otherDesc': '其他職業、匯入軸裡出現過的技能，預設收起',
		'focus.universal': '通用',
		'focus.countSuffix': '個',
		'focus.occurrences': '本軸',
		'focus.timesSuffix': '次',
		'focus.trackedCount': '已追蹤 {n} 個技能',
		'focus.emptyHint': '點擊選擇目前職業技能',
		'focus.skillId': '技能',
		'tool.eyebrow': '工具',
		'tool.title': '模擬估值 / FFLogs 對比',
		'tool.statusPill': '妖星首版',
		'tool.simEyebrow': '傷害模擬計算',
		'tool.simTitle': '分 P 與整體估值',
		'tool.luckAverage': '平均',
		'tool.luckLucky': '好運直暴',
		'tool.luckLow': '保守',
		'tool.critRate': '暴擊機率',
		'tool.directRate': '直擊機率',
		'tool.simHint': '可與目前 ACT log、FFLogs 榜一軸和匯入軸做模擬對比。',
		'fflogs.eyebrow': 'FFLogs 對比模式',
		'fflogs.title': '目前軸 vs 日誌實戰軸',
		'fflogs.statusParsed': '已解析',
		'fflogs.statusPending': '待匯入',
		'fflogs.placeholder': '貼上 FFLogs report 連結',
		'fflogs.parse': '解析 FFLogs',
		'fflogs.parsing': '解析中',
		'fflogs.hint': '匯入連結後會自動匹配目前職業，解析本地快取事件，並對比傷害、技能數、GCD 利用率和治療量。',
		'fflogs.actor': '角色',
		'fflogs.unknownJob': '未知',
		'fflogs.metric.damage': '傷害',
		'fflogs.metric.skills': '全部技能數',
		'fflogs.metric.gcd': 'GCD 利用率',
		'fflogs.metric.healing': '治療量',
		'fflogs.sim': '模擬',
		'fflogs.log': '日誌',
		'fflogs.section.phaseDamage': '分 P 傷害',
		'fflogs.section.skillDiff': '技能數量差異',
		'fflogs.tableHeader.phase': 'P',
		'fflogs.tableHeader.simulated': '模擬',
		'fflogs.tableHeader.log': '日誌',
		'fflogs.tableHeader.delta': '差值',
		'fflogs.tableHeader.skill': '技能',
		'fflogs.gcdLabel': '模擬利用率',
		'fflogs.applyLog': '套用日誌',
		'fflogs.reset': '重置 100%',
		'fflogs.gcdInfo': '原始模擬',
		'fflogs.gcdTargetDiff': '目標差',
		'fflogs.metric.actions': '動作',
		'fflogs.metric.autoAttack': '自動攻擊',
		'boot.loading': '正在載入妖星時間軸...',
		'empty.noData': '暫無資料',
		'empty.noSkillInCategory': '這個分類暫無技能',
		'empty.noBurst': '暫無可插入的爆發',
		'empty.noPotion': '暫無可插入的爆發藥',
		'empty.noQt': '暫無 QT',
		'empty.noQtState': '暫時沒有解析到 QT 狀態',
		'empty.noQtBurst': '目前 P / 目前過濾條件下暫無 QT 節點',
		'empty.noBurstData': '目前 P / 目前過濾條件下暫無爆發資料',
		'empty.qtDraftEmpty': '先點擊左側 QT 開關',
		'empty.noManual': '目前分類還沒有手動技能，可先從上方複製或從技能列拖入。',
		'empty.noSkill': '沒有找到技能',
		'unit.items': '項',
		'hint.trackSkill': '點擊追蹤這個技能的出現位置',
		'hint.traceSkill': '點擊在時間軸上定位並高亮這個技能，不會新增關注技能',
		'hint.noTrackableId': '暫無可追蹤 ID',
		'hint.insertToQueue': '插入手動佇列',
		'hint.dragInsertBurst': '點擊插入這個爆發中可識別的職業技能，也可以拖入時間軸',
		'source.manual': '使用者手動',
		'source.acr': 'ACR 自動',
		'source.timeline': '匯入時間軸',
		'meta.originalAxis': '原軸：',
		'meta.cdAdjusted': '佇列已順延',
		'meta.queueCd': '佇列CD調整',
		'acr.lockedHint': 'ACR 自動技能已鎖定，可關注查看，後續高手模式再允許複製為手動技能。',
		'edit.lockedHint': '切到編輯模式後可拖入時間軸',
		'nav.fflogs': 'FFLogs 對比',
		'nav.simulation': '傷害模擬',
		'aria.editSection': '編輯分區',
		'aria.editorMode': '編輯器模式',
		'detail.qtControl': 'QT 控制',
		'category.healing': '治療',
		'hint.dragToTimeline': '拖入時間軸',
		'insert.panelHandle': '拖動移動插入技能面板',
		'acr.lockedShort': 'ACR 鎖定',
		'hint.draggableTime': '可拖動調整時間',
	},
	'ja-JP': {
		'nav.timeline': 'タイムライン編集',
		'nav.tools': 'ツール',
		'nav.teamMode': '8人チームモード',
		'brand.subtitle': '妖星エディタ',
		'label.mode': 'モード',
		'label.job': 'ジョブ',
		'label.acr': 'ACR',
		'label.target': 'ターゲット',
		'mode.browse': '閲覧モード',
		'mode.edit': '編集モード',
		'action.import': 'インポート',
		'action.export': 'エクスポート',
		'action.insert': '挿入',
		'action.close': '閉じる',
		'action.trace': '追跡',
		'action.track': '追跡',
		'action.tracked': '追跡済み',
		'action.located': '位置済み',
		'action.browse': '閲覧',
		'action.insertBurst': 'バースト挿入',
		'action.insertPotion': '薬挿入',
		'action.insertQt': 'QT挿入',
		'action.addFocus': '+ スキル追跡',
		'action.removeFocus': '追跡解除',
		'action.duplicate': '複製',
		'action.delete': '削除',
		'status.current': '現在の選択',
		'status.unspecified': '未指定',
		'status.notConnected': '未接続',
		'label.jobColon': 'ジョブ：',
		'label.acrColon': 'ACR：',
		'rail.timeline': 'タイムライン',
		'rail.tools': 'ツール',
		'rail.about': '概要',
		'rail.output': '出力軸',
		'rail.mitigation': '軽減 / ヒール軸',
		'rail.burst': 'バースト',
		'rail.acrSim': 'ACR シミュ',
		'rail.focusAdd': '+ フォックスキル',
		'legend.boss': 'Boss',
		'legend.output': '出力',
		'legend.mitigation': '軽減',
		'legend.burst': 'バースト',
		'phase.all': '全部',
		'sim.hide': 'ACR シミュを隠す',
		'sim.show': 'ACR シミュを表示',
		'sim.outputOn': '出力軸に ACR シミュスキルを含む',
		'sim.outputOff': '出力軸はインポート / 手動スキルのみ',
		'overview.title': '全体概覧',
		'overview.boss': 'Boss 詠唱',
		'overview.mitigation': '軽減 / ヒール軸',
		'overview.damage': '出力軸',
		'overview.potion': '薬軸',
		'overview.opener': '開幕',
		'overview.qt': 'QT',
		'overview.burst': 'バースト',
		'overview.ariaToggles': '概覧表示項目',
		'category.all': '全部',
		'category.output': '出力',
		'category.mitigation': '軽減',
		'category.potion': '薬',
		'category.qt': 'QT',
		'category.burst': 'バースト',
		'insert.title': 'スキル挿入',
		'insert.hint': 'タイムラインにドラッグ、またはカードをクリックして手動スキルを生成',
		'insert.floatTitle': 'ドラッグで移動、クリックでプログラミングモードパネルを開く',
		'insert.skillIdPlaceholder': 'スキル ID',
		'burst.title': 'バースト',
		'burst.hint': 'タイムラインにドラッグ、またはクリックで 60 / 120 バーストテンプレートを挿入',
		'burst.120': '120 バースト',
		'burst.60': '60 バースト',
		'potion.title': '薬',
		'potion.hint': '先に属性を選び、下で等级を選択。挿入後は 30 秒の薬ウィンドウ、リキャストは 4:30 扱い',
		'potion.attributeAria': '薬の属性',
		'potion.selectSuffix': '薬',
		'potion.role.strength': '力系',
		'potion.role.dexterity': '敏捷系',
		'potion.role.intelligence': '魔法火力',
		'potion.role.mind': 'ヒール系',
		'potion.attr.strength': '剛力',
		'potion.attr.dexterity': '巧力',
		'potion.attr.intelligence': '智力',
		'potion.attr.mind': '意力',
		'qt.note': '左の QT をクリックすると今回のドラフトだけ切替。右側で書き込むロジックを確認し、問題なければ挿入。',
		'qt.draftTitle': '今回の挿入ロジック',
		'qt.draftChanges': '件の変更',
		'qt.on': 'オン',
		'qt.off': 'オフ',
		'detail.panelNotFound': 'この欄は見つかりません。',
		'detail.noData': '現在の P / フィルタ条件下にデータなし',
		'detail.bossLocked': 'Boss スキルは既定でロック',
		'detail.locateTitle': 'タイムライン上のこのスキルへ移動',
		'detail.targetRequired': 'ターゲットを選択必須',
		'target.placeholder': '選択してください',
		'target.boss': 'Boss / Target',
		'target.self': '自分 / Self',
		'target.targetOfTarget': 'ターゲットのターゲット',
		'target.party': 'PT',
		'manual.title': '手動軸編集',
		'manual.hintEdit': '時間変更・微調整・複製・削除が可能',
		'manual.hintBrowse': '閲覧モードではロック、編集モードに切替後調整可',
		'time.globalSec': '全体秒',
		'time.phaseSec': '秒',
		'acr.title': 'ACR データベース',
		'acr.dockTitle': 'ACR データベース',
		'acr.packages': 'ACR パッケージ一覧',
		'acr.field.status': 'サポート状態：',
		'acr.field.author': '作者：',
		'acr.field.source': 'データ元：',
		'acr.stat.jobs': 'ジョブ',
		'acr.stat.packages': 'ACR パッケージ',
		'acr.stat.supported': 'サポート済',
		'acr.stat.waiting': '接入待ち',
		'acr.stat.unsupported': '未サポート',
		'acr.dataLabel': 'ACR データ',
		'acr.status.supported': 'サポート済',
		'acr.status.waiting': '接入待ち',
		'acr.status.unsupported': '未サポート',
		'about.title': '概要',
		'about.eyebrow': 'プロジェクト情報',
		'about.projectName': 'プロジェクト名',
		'about.intro': '概要',
		'about.introValue': 'FF14 タイムラインエディタ / ACR 補助ツール',
		'about.author': '作者',
		'about.version': 'バージョン',
		'about.updatedAt': '更新日時',
		'about.supportedJobs': 'サポートジョブ',
		'about.supportedJobsValue': 'サポート済 {supported} / 全 {total} ジョブ',
		'about.acrSource': 'ACR データ元',
		'about.acrSourceValue': '2026-07-09',
		'about.fflogs': 'FFLogs 対比',
		'about.localImport': 'ローカル時間軸インポート',
		'about.port': '実行ポート',
		'about.supported': 'サポート',
		'role.tank': 'T',
		'role.healer': 'H',
		'role.dps': 'DPS',
		'role.ranged': '遠隔',
		'role.caster': '魔法',
		'role.melee': '近接',
		'focus.eyebrow': 'スキル追跡',
		'focus.help': '現在のジョブの任意スキルを追跡し、出現回数・時間・出典を表示。',
		'focus.searchPlaceholder': 'スキル名またはスキル ID を検索',
		'focus.currentJob': '現在のジョブスキル',
		'focus.other': 'その他のスキル',
		'focus.otherDesc': '他ジョブ・インポート軸に出現したスキル、既定で折りたたみ',
		'focus.universal': '汎用',
		'focus.countSuffix': '件',
		'focus.occurrences': 'この軸',
		'focus.timesSuffix': '回',
		'focus.trackedCount': '{n} 件のスキルを追跡中',
		'focus.emptyHint': 'クリックして現在のジョブスキルを選択',
		'focus.skillId': 'スキル',
		'tool.eyebrow': 'ツール',
		'tool.title': 'シミュ估值 / FFLogs 対比',
		'tool.statusPill': '妖星初版',
		'tool.simEyebrow': 'ダメージシミュ計算',
		'tool.simTitle': 'P別 / 全体估值',
		'tool.luckAverage': '平均',
		'tool.luckLucky': '好運直暴',
		'tool.luckLow': '控えめ',
		'tool.critRate': 'クリ率',
		'tool.directRate': '直撃率',
		'tool.simHint': '現在の ACT log、FFLogs トップ軸、インポート軸とシミュ対比可能。',
		'fflogs.eyebrow': 'FFLogs 対比モード',
		'fflogs.title': '現在の軸 vs ログ実戦軸',
		'fflogs.statusParsed': '解析済',
		'fflogs.statusPending': '未インポート',
		'fflogs.placeholder': 'FFLogs report リンクを貼り付け',
		'fflogs.parse': 'FFLogs を解析',
		'fflogs.parsing': '解析中',
		'fflogs.hint': 'リンクをインポートすると現在のジョブを自動マッチし、ローカルキャッシュイベントを解析、ダメージ・スキル数・GCD 利用率・ヒール量を対比します。',
		'fflogs.actor': 'キャラ',
		'fflogs.unknownJob': '不明',
		'fflogs.metric.damage': 'ダメージ',
		'fflogs.metric.skills': '全スキル数',
		'fflogs.metric.gcd': 'GCD 利用率',
		'fflogs.metric.healing': 'ヒール量',
		'fflogs.sim': 'シミュ',
		'fflogs.log': 'ログ',
		'fflogs.section.phaseDamage': 'P別ダメージ',
		'fflogs.section.skillDiff': 'スキル数の差異',
		'fflogs.tableHeader.phase': 'P',
		'fflogs.tableHeader.simulated': 'シミュ',
		'fflogs.tableHeader.log': 'ログ',
		'fflogs.tableHeader.delta': '差分',
		'fflogs.tableHeader.skill': 'スキル',
		'fflogs.gcdLabel': 'シミュ利用率',
		'fflogs.applyLog': 'ログを適用',
		'fflogs.reset': 'リセット 100%',
		'fflogs.gcdInfo': '生シミュ',
		'fflogs.gcdTargetDiff': '目標差',
		'fflogs.metric.actions': 'アクション',
		'fflogs.metric.autoAttack': 'オートアタック',
		'boot.loading': '妖星タイムラインを読み込み中...',
		'empty.noData': 'データなし',
		'empty.noSkillInCategory': 'この分類にスキルなし',
		'empty.noBurst': '挿入可能なバーストなし',
		'empty.noPotion': '挿入可能な薬なし',
		'empty.noQt': 'QT なし',
		'empty.noQtState': 'QT 状態を解析できませんでした',
		'empty.noQtBurst': '現在の P / フィルタ条件下に QT ノードなし',
		'empty.noBurstData': '現在の P / フィルタ条件下にバーストデータなし',
		'empty.qtDraftEmpty': '左の QT スイッチをクリック',
		'empty.noManual': 'この分類に手動スキルなし。上から複製、またはスキル列からドラッグ。',
		'empty.noSkill': 'スキルが見つかりません',
		'unit.items': '件',
		'hint.trackSkill': 'クリックでこのスキルの出現位置を追跡',
		'hint.traceSkill': 'クリックでタイムライン上のこのスキルを位置確認・ハイライト（追跡スキルは追加しない）',
		'hint.noTrackableId': '追跡可能な ID なし',
		'hint.insertToQueue': '手動キューに挿入',
		'hint.dragInsertBurst': 'クリックでこのバーストの職業スキルを挿入、タイムラインにドラッグも可',
		'source.manual': 'ユーザー手動',
		'source.acr': 'ACR 自動',
		'source.timeline': 'インポート時間軸',
		'meta.originalAxis': '原軸：',
		'meta.cdAdjusted': 'キュー順延済',
		'meta.queueCd': 'キューCD調整',
		'acr.lockedHint': 'ACR 自動スキルはロック済。追跡して確認可、上位モードで手動スキルとして複製可能になります。',
		'edit.lockedHint': '編集モードに切替後タイムラインにドラッグ可',
		'nav.fflogs': 'FFLogs 対比',
		'nav.simulation': 'ダメージシミュ',
		'aria.editSection': '編集セクション',
		'aria.editorMode': 'エディタモード',
		'detail.qtControl': 'QT 操作',
		'category.healing': 'ヒール',
		'hint.dragToTimeline': 'タイムラインにドラッグ',
		'insert.panelHandle': 'ドラッグでスキル挿入パネルを移動',
		'acr.lockedShort': 'ACR ロック',
		'hint.draggableTime': 'ドラッグで時間調整可',
	},
}

function detectLanguage() {
	const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
	if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
		return stored
	}
	return 'zh-CN'
}

function t(key, fallback = '') {
	const lang = state.language ?? 'zh-CN'
	const value = I18N[lang]?.[key] ?? I18N['zh-CN']?.[key]
	return value != null && value !== '' ? value : (fallback || key)
}

function setLanguage(lang) {
	const next = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'zh-CN'
	state.language = next
	localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
	document.documentElement.lang = next
	render()
}

function renderLanguageSwitcher() {
	const current = state.language ?? 'zh-CN'
	return `
		<div class="lang-switcher" role="group" aria-label="Language">
			${SUPPORTED_LANGUAGES.map(lang => `<button type="button" class="lang-switcher-button ${lang === current ? 'active' : ''}" data-lang="${lang}" aria-pressed="${lang === current ? 'true' : 'false'}">${LANGUAGE_LABELS[lang]}</button>`).join('')}
		</div>
	`
}

/* App metadata — keep APP_VERSION in sync with package.json. */
const APP_VERSION = 'v0.1.0'
const APP_AUTHOR = 'pr大团体'
const APP_UPDATED_AT = '2026-07-09'
const APP_PORT = '4173'
const INFO_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'

const state = {
	model: null,
	language: detectLanguage(),
	panel: 'mitigation',
	phase: 'all',
	job: 'DRK',
	acr: 'KANO',
	critRate: 18,
	directRate: 28,
	luck: 'average',
	inserted: [],
	pendingTargetPicker: null,
	insertSkillId: '',
	focusedSkills: [],
	lastTracedSkillId: null,
	openDetailCollapses: [],
	focusQuery: '',
	importStatus: '',
	importError: '',
	showInsertDrawer: false,
	insertSkillCategory: 'output',
	rightSkillCategory: 'output',
	potionAttribute: 'strength',
	qtDraftStates: {},
	overviewVisibleSections: {
		boss: true,
		mitigation: true,
		damage: true,
		potion: true,
		opener: true,
		qt: true,
		burst: true,
	},
	showFocusPicker: false,
	showAcrModal: false,
	showAboutModal: false,
	showAcrSimulation: localStorage.getItem('webtimelineShowAcrSimulation') === '1',
	editorMode: 'browse',
	section: 'timeline',
	insertFloatPos: loadInsertFloatPos(),
	timelineZoom: clampTimelineZoom(localStorage.getItem('webtimelineTimelineZoom') ?? 1.65),
	currentTimelineJson: null,
	baseAcrSimulation: null,
	baseAcrOpeners: {},
	fflogsUrl: 'https://www.fflogs.com/reports/VHqxznv6bFcMPpLm?fight=10&type=damage-done',
	fflogsComparison: null,
	fflogsActorId: '',
	fflogsStatus: '',
	fflogsError: '',
	fflogsTargetGcdUtilization: 100,
	hiddenTimelineRows: loadHiddenTimelineRows(),
}

const DEFAULT_TIMELINE_IMPORTS = [
	{
		id: 'kano-drk',
		label: '导入黑骑轴',
		url: assetUrl('./resources/timelines/时间轴参考/KANO_DRK_妖星乱舞绝境战_MT减伤轴.json'),
	},
	{
		id: 'whm-02',
		label: '导入白魔轴',
		url: assetUrl('./resources/timelines/时间轴参考/绝妖星白触发轴WHM02.json'),
	},
]

function assetUrl(relativePath) {
	return new URL(relativePath, import.meta.url).toString()
}

const ACTION_LABELS = new Map([
	[7531, '铁壁'],
	[7533, '挑衅'],
	[7535, '雪仇'],
	[7537, '退避'],
	[7393, '至黑之夜'],
	[7394, '暗影墙'],
	[7395, '暗黑布道'],
	[7396, '行尸走肉'],
	[16472, '弗雷'],
	[25754, '献奉'],
	[44162, '爆发药'],
])

const BOSS_DAMAGE_HINTS = new Map([
	['47764', 176000],
	['50722', 228000],
	['50179', 312000],
	['47952', 258000],
])

const POTION_ATTRIBUTES = [
	{id: 'strength', labelKey: 'potion.attr.strength', shortLabel: '力', roleKey: 'potion.role.strength'},
	{id: 'dexterity', labelKey: 'potion.attr.dexterity', shortLabel: '巧', roleKey: 'potion.role.dexterity'},
	{id: 'intelligence', labelKey: 'potion.attr.intelligence', shortLabel: '智', roleKey: 'potion.role.intelligence'},
	{id: 'mind', labelKey: 'potion.attr.mind', shortLabel: '意', roleKey: 'potion.role.mind'},
]

function potionAttributeLabel(attributeId) {
	return t(`potion.attr.${attributeId}`, POTION_ATTRIBUTES.find(attribute => attribute.id === attributeId)?.shortLabel ?? '')
}

const COMBAT_POTION_TIERS = [
	{id: 'gemdraught-g2', tier: '7.x', level: 100, label: '2级', familyLabel: '宝药', name: 'Grade 2 Gemdraught'},
	{id: 'gemdraught-g1', tier: '7.x', level: 100, label: '1级', familyLabel: '宝药', name: 'Grade 1 Gemdraught'},
	{id: 'tincture-g8', tier: '6.x', level: 90, label: '8级', familyLabel: '幻药', name: 'Grade 8 Tincture'},
	{id: 'tincture-g7', tier: '6.x', level: 90, label: '7级', familyLabel: '幻药', name: 'Grade 7 Tincture'},
	{id: 'tincture-g6', tier: '6.x', level: 90, label: '6级', familyLabel: '幻药', name: 'Grade 6 Tincture'},
	{id: 'tincture-g5', tier: '5.x', level: 80, label: '5级', familyLabel: '幻药', name: 'Grade 5 Tincture'},
	{id: 'tincture-g4', tier: '5.x', level: 80, label: '4级', familyLabel: '幻药', name: 'Grade 4 Tincture'},
	{id: 'tincture-g3', tier: '5.x', level: 80, label: '3级', familyLabel: '幻药', name: 'Grade 3 Tincture'},
	{id: 'tincture-g2', tier: '4.x', level: 70, label: '2级', familyLabel: '幻药', name: 'Grade 2 Tincture'},
	{id: 'tincture-g1', tier: '4.x', level: 70, label: '1级', familyLabel: '幻药', name: 'Grade 1 Tincture'},
]

const OVERVIEW_SECTION_TOGGLES = [
{id: 'boss', labelKey: 'overview.boss'},
{id: 'mitigation', labelKey: 'overview.mitigation'},
{id: 'damage', labelKey: 'overview.damage'},
{id: 'potion', labelKey: 'overview.potion'},
{id: 'opener', labelKey: 'overview.opener'},
{id: 'qt', labelKey: 'overview.qt'},
{id: 'burst', labelKey: 'overview.burst'},
]

const PLAYER_TIMELINE_ITEM_WIDTH_PX = 42
const PLAYER_TIMELINE_ITEM_GAP_PX = 8
const BOSS_CAST_MIN_VISUAL_WIDTH_PX = 148
const BOSS_CAST_VISUAL_GAP_PX = 8

const app = document.querySelector('#app')

let timelineDrag = null
let timelinePinch = null
let suppressTimelineClick = false
let insertFloatDrag = null
let suppressInsertFloatClick = false
let insertSkillDrag = null
let existingTimelineEventDrag = null
let suppressInsertSkillClick = false
let timelineDragGuideFrame = null
let timelineDragGuidePending = null
let timelineDragGuideCache = null

init()

async function init() {
	document.documentElement.lang = state.language
	const bootEl = document.querySelector('.boot')
	if (bootEl) {
		bootEl.textContent = t('boot.loading')
	}
	const response = await fetch(assetUrl('data/prototype.json'))
	state.model = await response.json()
	state.baseAcrSimulation = state.model.acrSimulation
	state.baseAcrOpeners = state.model.acrOpeners ?? {}
	state.currentTimelineJson = state.model.sourceTimeline ?? null
	render()
}

document.addEventListener('click', event => {
	if (suppressInsertFloatClick || suppressInsertSkillClick) {
		suppressInsertFloatClick = false
		suppressInsertSkillClick = false
		return
	}
	/* Click directly on a modal backdrop (not its inner panel) closes the modal. */
	if (event.target.classList?.contains('modal-backdrop') && event.target.dataset.backdropClose) {
		if (event.target.dataset.backdropClose === 'about' && state.showAboutModal) {
			state.showAboutModal = false
			render()
		}
		return
	}
	const langTarget = event.target.closest('[data-lang]')
	if (langTarget) {
		setLanguage(langTarget.dataset.lang)
		return
	}

	const target = event.target.closest('[data-action], [data-panel], [data-section], [data-insert-category], [data-right-skill-category], [data-potion-attribute], [data-phase], [data-toggle], [data-focus-skill], [data-remove-focus], [data-import-default], [data-manual-id], [data-manual-target-choice], [data-locate-event-key], [data-overview-expand], [data-overview-locate-event]')
	if (!target) {
		if (state.pendingTargetPicker && !event.target.closest('[data-target-picker-overlay]')) {
			state.pendingTargetPicker = null
			render()
		}
		return
	}

	if (target.dataset.section) {
		state.section = target.dataset.section
		render()
		return
	}

	if (target.dataset.panel) {
		state.panel = target.dataset.panel
		render()
		return
	}

	if (target.dataset.insertCategory) {
		state.insertSkillCategory = target.dataset.insertCategory
		render()
		return
	}

	if (target.dataset.potionAttribute) {
		setPotionAttribute(target.dataset.potionAttribute)
		return
	}

	if (target.dataset.phase) {
		state.phase = target.dataset.phase
		render()
		return
	}

	if (target.dataset.toggle === 'acr-simulation') {
		if (target.closest('summary')) {
			event.preventDefault()
			event.stopPropagation()
		}
		state.showAcrSimulation = !state.showAcrSimulation
		localStorage.setItem('webtimelineShowAcrSimulation', state.showAcrSimulation ? '1' : '0')
		render()
		return
	}

	if (target.dataset.toggle === 'insert-drawer') {
		if (canEditTimeline()) {
			state.showInsertDrawer = !state.showInsertDrawer
		}
		render()
		return
	}

	if (target.dataset.overviewExpand) {
		const id = `overview-${target.dataset.overviewExpand}`
		setDetailCollapseOpen(id, !isDetailCollapseOpen(id))
		render()
		return
	}

	if (target.dataset.overviewLocateEvent) {
		locateTimelineEventInCurrentPhase(target.dataset.overviewLocateEvent)
		return
	}

	if (target.dataset.toggle === 'editor-mode') {
		setEditorMode(state.editorMode === 'edit' ? 'browse' : 'edit')
		return
	}

	const action = target.dataset.action
	if (action === 'toggle-timeline-row') {
		toggleTimelineRowVisibility(target.dataset.rowKey)
		return
	}
	if (action === 'toggle-all-timeline-rows') {
		toggleAllTimelineRowVisibility(buildVisualTimelineRows(state.model.tracks.expert))
		return
	}
	if (action === 'choose-manual-target') {
		event.preventDefault()
		event.stopPropagation()
		updateManualSkillTarget(target.dataset.manualTargetChoice, target.dataset.targetValue)
		return
	}

	if (action === 'remove-focused-skill') {
		removeFocusedSkill(target.dataset.focusSkill ?? target.dataset.removeFocus)
		return
	}

	if (action === 'locate-timeline-event') {
		event.preventDefault()
		event.stopPropagation()
		locateTimelineEvent(target.dataset.timelineEventKey)
		return
	}

	if (action === 'trace-skill-on-timeline') {
		event.preventDefault()
		event.stopPropagation()
		const ids = (target.dataset.traceSkillIds || target.dataset.traceSkillId || '')
			.split(',')
			.map(id => id.trim())
			.filter(Boolean)
		traceSkillOnTimeline(ids, target)
		return
	}

	if (target.dataset.focusSkill) {
		event.preventDefault()
		event.stopPropagation()
		rememberOpenDetailCollapses()
		addFocusedSkill(target.dataset.focusSkill)
		return
	}

	if (target.dataset.removeFocus) {
		removeFocusedSkill(target.dataset.removeFocus)
		return
	}

	if (target.dataset.locateEventKey) {
		event.preventDefault()
		locateDetailEventFromTimeline(target.dataset.locateEventKey)
		return
	}

	if (action === 'insert-skill') {
		insertManualSkill()
		return
	}
	if (action === 'quick-insert-skill') {
		insertSkillAtVisibleTimeline(target.dataset.dragSkill)
		return
	}
	if (action === 'quick-insert-potion') {
		insertPotionAtVisibleTimeline(target.dataset.potionId)
		return
	}
	if (action === 'quick-insert-burst') {
		insertBurstPackageAtVisibleTimeline(target.dataset.burstIndex)
		return
	}
	if (action === 'quick-insert-burst-qt') {
		insertBurstQtAtVisibleTimeline(target.dataset.burstIndex, target.dataset.burstTimeMs)
		return
	}
	if (action === 'toggle-qt-draft') {
		toggleQtDraftState(target.dataset.qtInsert)
		return
	}
	if (action === 'insert-qt-draft') {
		insertQtDraftAtVisibleTimeline()
		return
	}
	if (action === 'remove-manual-skill') {
		event.preventDefault()
		event.stopPropagation()
		removeManualSkill(target.dataset.manualId)
		return
	}
	if (action === 'remove-timeline-event') {
		event.preventDefault()
		event.stopPropagation()
		removeTimelineEvent(target.dataset.timelineEventKey)
		return
	}
	if (action === 'nudge-manual-skill') {
		nudgeManualSkill(target.dataset.manualId, Number(target.dataset.deltaMs ?? 0))
		return
	}
	if (action === 'duplicate-manual-skill') {
		duplicateManualSkill(target.dataset.manualId)
		return
	}
	if (action === 'open-focus-picker') {
		state.showFocusPicker = true
		render()
		return
	}
	if (action === 'close-focus-picker') {
		state.showFocusPicker = false
		render()
		return
	}
	if (action === 'close-target-picker') {
		state.pendingTargetPicker = null
		render()
		return
	}
	if (action === 'open-acr-database') {
		state.showAcrModal = true
		render()
		return
	}
	if (action === 'close-acr-database') {
		state.showAcrModal = false
		render()
		return
	}
	if (action === 'open-about') {
		state.showAboutModal = true
		render()
		return
	}
	if (action === 'close-about') {
		state.showAboutModal = false
		render()
		return
	}
	if (action === 'import-timeline') {
		document.querySelector('[data-field="timeline-import"]')?.click()
		return
	}
	if (action === 'export-timeline') {
		exportTimeline()
		return
	}
	if (action === 'load-fflogs-comparison') {
		loadFflogsComparison()
		return
	}
	if (action === 'apply-log-gcd-utilization') {
		const percent = Number(state.fflogsComparison?.log?.gcdUtilization?.percent)
		if (Number.isFinite(percent)) {
			setFflogsTargetGcdUtilization(percent)
		}
		return
	}
	if (action === 'reset-gcd-utilization') {
		setFflogsTargetGcdUtilization(100)
		return
	}
	if (target.dataset.importDefault) {
		importDefaultTimeline(target.dataset.importDefault)
		return
	}
})

document.addEventListener('keydown', event => {
	if (event.key !== 'Escape') {
		return
	}
	if (state.showAboutModal) {
		state.showAboutModal = false
		render()
		return
	}
	if (state.showAcrModal) {
		state.showAcrModal = false
		render()
		return
	}
})

document.addEventListener('toggle', event => {
	const detail = event.target instanceof Element ? event.target.closest('.detail-collapse') : null
	if (!detail || detail !== event.target) {
		return
	}
	setDetailCollapseOpen(detail.dataset.detailCollapse, detail.open)
}, true)

document.addEventListener('dragstart', event => {
	const manual = event.target.closest('[data-manual-id]')
	if (manual) {
		if (!canEditTimeline()) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('application/x-webtimeline-manual', manual.dataset.manualId)
		event.dataTransfer.setData('text/plain', manual.dataset.manualId)
		return
	}

	const timelineEvent = event.target.closest('[data-timeline-event-key]')
	if (timelineEvent) {
		if (!canEditTimeline() || !timelineEvent.dataset.timelineEventKey) {
			event.preventDefault()
			return
		}
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('application/x-webtimeline-event', timelineEvent.dataset.timelineEventKey)
		event.dataTransfer.setData('text/plain', timelineEvent.dataset.timelineEventKey)
		return
	}

	const burst = event.target.closest('[data-drag-burst]')
	if (burst) {
		if (!canEditTimeline() || !burst.dataset.dragBurst) {
			event.preventDefault()
			return
		}
		document.body.classList.add('is-insert-skill-dragging')
		event.dataTransfer.effectAllowed = 'copy'
		event.dataTransfer.setData('application/x-webtimeline-burst', burst.dataset.dragBurst)
		event.dataTransfer.setData('text/plain', burst.dataset.dragBurst)
		return
	}

	const qt = event.target.closest('[data-drag-qt]')
	if (qt) {
		if (!canEditTimeline() || !qt.dataset.dragQt) {
			event.preventDefault()
			return
		}
		document.body.classList.add('is-insert-skill-dragging')
		event.dataTransfer.effectAllowed = 'copy'
		event.dataTransfer.setData('application/x-webtimeline-qt', qt.dataset.dragQt)
		event.dataTransfer.setData('text/plain', qt.dataset.dragQt)
		return
	}

	const potion = event.target.closest('[data-drag-potion]')
	if (potion) {
		if (!canEditTimeline() || !potion.dataset.dragPotion) {
			event.preventDefault()
			return
		}
		document.body.classList.add('is-insert-skill-dragging')
		event.dataTransfer.effectAllowed = 'copy'
		event.dataTransfer.setData('application/x-webtimeline-potion', potion.dataset.dragPotion)
		event.dataTransfer.setData('text/plain', potion.dataset.dragPotion)
		return
	}

	const skill = event.target.closest('[data-drag-skill]')
	if (!skill || !canEditTimeline() || skill.dataset.dragLocked === 'true') {
		event.preventDefault()
		return
	}
	document.body.classList.add('is-insert-skill-dragging')
	event.dataTransfer.effectAllowed = 'copy'
	event.dataTransfer.setData('application/x-webtimeline-skill', skill.dataset.dragSkill)
	event.dataTransfer.setData('text/plain', skill.dataset.dragSkill)
})

document.addEventListener('dragover', event => {
	const timeline = findTimeline(event.target)
	if (!timeline || !canEditTimeline() || !hasTimelineDropData(event.dataTransfer)) {
		return
	}
	event.preventDefault()
	event.dataTransfer.dropEffect = dataTransferHasType(event.dataTransfer, 'application/x-webtimeline-manual')
		? 'move'
		: dataTransferHasType(event.dataTransfer, 'application/x-webtimeline-event') ? 'move' : 'copy'
	scheduleTimelineDragGuide(timeline, event.clientX)
})

document.addEventListener('drop', event => {
	const timeline = findTimeline(event.target)
	if (!timeline || !canEditTimeline()) {
		return
	}
	const manualId = event.dataTransfer.getData('application/x-webtimeline-manual')
	if (manualId) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		moveManualSkillAtTimeline(manualId, event, timeline)
		return
	}
	const existingEventKey = event.dataTransfer.getData('application/x-webtimeline-event')
	if (existingEventKey) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		moveExistingTimelineEventAtTimeline(existingEventKey, event, timeline)
		return
	}
	const qtKey = event.dataTransfer.getData('application/x-webtimeline-qt')
	if (qtKey) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		insertQtAtTimeline(qtKey, event, timeline)
		return
	}
	const burstIndex = event.dataTransfer.getData('application/x-webtimeline-burst')
	if (burstIndex) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		insertBurstPackageAtTimeline(burstIndex, event, timeline)
		return
	}
	const potionId = event.dataTransfer.getData('application/x-webtimeline-potion')
	if (potionId) {
		event.preventDefault()
		hideTimelineDragGuide(timeline)
		insertPotionAtTimeline(potionId, event, timeline)
		return
	}
	const actionId = event.dataTransfer.getData('application/x-webtimeline-skill')
	if (!actionId) {
		return
	}
	event.preventDefault()
	hideTimelineDragGuide(timeline)
	insertSkillAtTimeline(actionId, event, timeline)
})

document.addEventListener('dragleave', event => {
	const timeline = findTimeline(event.target)
	if (!timeline || timeline.contains(event.relatedTarget)) {
		return
	}
	hideTimelineDragGuide(timeline)
})

document.addEventListener('dragend', () => {
	hideTimelineDragGuide()
	document.body.classList.remove('is-insert-skill-dragging')
})

document.addEventListener('click', event => {
	if (!suppressTimelineClick || !findTimeline(event.target)) {
		return
	}
	event.preventDefault()
	event.stopPropagation()
	suppressTimelineClick = false
}, true)

document.addEventListener('wheel', event => {
	const timeline = findTimeline(event.target)
	if (!timeline) {
		return
	}

	event.preventDefault()
	if (event.ctrlKey) {
		const rect = timeline.getBoundingClientRect()
		setTimelineZoom(zoomFromWheelDelta(state.timelineZoom, event.deltaY), timeline, event.clientX - rect.left)
		return
	}

	timeline.scrollLeft += timelineWheelPanDelta(event)
}, {passive: false})

document.addEventListener('pointerdown', event => {
	const skillCard = event.target instanceof Element ? event.target.closest('[data-drag-skill], [data-drag-burst], [data-drag-qt], [data-drag-potion]') : null
	if (skillCard && canStartInsertSkillDrag(skillCard, event)) {
		startInsertSkillDrag(event, skillCard)
		skillCard.setPointerCapture?.(event.pointerId)
		return
	}

	const timelineEvent = event.target instanceof Element ? event.target.closest('[data-timeline-event-key]') : null
	if (timelineEvent && canStartExistingTimelineEventDrag(timelineEvent, event)) {
		startExistingTimelineEventDrag(event, timelineEvent)
		timelineEvent.setPointerCapture?.(event.pointerId)
		return
	}

	const insertHandle = event.target instanceof Element ? event.target.closest('[data-insert-float-handle], [data-insert-panel-handle]') : null
	if (insertHandle && canEditTimeline()) {
		if (insertHandle.matches('[data-insert-panel-handle]') && event.target.closest('button, input, select, textarea, label')) {
			return
		}
		startInsertFloatDrag(event)
		insertHandle.setPointerCapture?.(event.pointerId)
		return
	}

	const timeline = findTimeline(event.target)
	if (!shouldStartTimelineDrag({
		hasTimeline: Boolean(timeline),
		button: event.button,
		ctrlKey: event.ctrlKey,
		timelinePinchActive: Boolean(timelinePinch),
		interactiveTarget: isTimelineInteractiveTarget(event.target),
	})) {
		return
	}

	startTimelineDrag(timeline, event)
	timeline.setPointerCapture?.(event.pointerId)
})

document.addEventListener('pointermove', event => {
	if (insertSkillDrag && insertSkillDrag.pointerId === event.pointerId) {
		moveInsertSkillDrag(event)
		return
	}

	if (existingTimelineEventDrag && existingTimelineEventDrag.pointerId === event.pointerId) {
		moveExistingTimelineEventDrag(event)
		return
	}

	if (insertFloatDrag && insertFloatDrag.pointerId === event.pointerId) {
		moveInsertFloat(event)
		return
	}

	if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) {
		return
	}

	const deltaX = event.clientX - timelineDrag.startX
	const deltaY = event.clientY - timelineDrag.startY
	if (!timelineDrag.dragging && Math.hypot(deltaX, deltaY) > 3) {
		timelineDrag.dragging = true
		timelineDrag.timeline.classList.add('is-dragging')
	}
	if (!timelineDrag.dragging) {
		return
	}

	event.preventDefault()
	timelineDrag.timeline.scrollLeft = scrollLeftForDrag({
		startScrollLeft: timelineDrag.scrollLeft,
		startX: timelineDrag.startX,
		currentX: event.clientX,
	})
}, {passive: false})

document.addEventListener('pointerup', event => {
	endInsertSkillDrag(event)
	endExistingTimelineEventDrag(event)
	endInsertFloatDrag(event)
	endTimelineDrag(event)
})
document.addEventListener('pointercancel', event => {
	cancelInsertSkillDrag(event)
	cancelExistingTimelineEventDrag(event)
	endInsertFloatDrag(event)
	endTimelineDrag(event)
})

document.addEventListener('mousedown', event => {
	const timeline = findTimeline(event.target)
	if (!shouldStartTimelineDrag({
		hasTimeline: Boolean(timeline),
		button: event.button,
		ctrlKey: event.ctrlKey,
		timelinePinchActive: Boolean(timelinePinch),
		interactiveTarget: isTimelineInteractiveTarget(event.target),
	})) {
		return
	}
	startTimelineDrag(timeline, event)
})

document.addEventListener('mousemove', event => {
	if (!timelineDrag || timelineDrag.pointerId != null) {
		return
	}

	const deltaX = event.clientX - timelineDrag.startX
	const deltaY = event.clientY - timelineDrag.startY
	if (!timelineDrag.dragging && Math.hypot(deltaX, deltaY) > 3) {
		timelineDrag.dragging = true
		timelineDrag.timeline.classList.add('is-dragging')
	}
	if (!timelineDrag.dragging) {
		return
	}

	event.preventDefault()
	timelineDrag.timeline.scrollLeft = scrollLeftForDrag({
		startScrollLeft: timelineDrag.scrollLeft,
		startX: timelineDrag.startX,
		currentX: event.clientX,
	})
}, {passive: false})

document.addEventListener('mouseup', event => {
	if (!timelineDrag || timelineDrag.pointerId != null) {
		return
	}
	endTimelineDrag(event)
})

document.addEventListener('touchstart', event => {
	if (event.touches.length !== 2) {
		return
	}
	const timeline = findTimeline(event.target)
	if (!timeline) {
		return
	}

	const rect = timeline.getBoundingClientRect()
	timelinePinch = {
		timeline,
		startDistance: touchDistance(event.touches[0], event.touches[1]),
		startZoom: state.timelineZoom,
	}
	timelineDrag = null
	timeline.classList.add('is-zooming')
	setTimelineZoom(state.timelineZoom, timeline, touchCenterX(event.touches[0], event.touches[1], rect.left))
}, {passive: false})

document.addEventListener('touchmove', event => {
	if (!timelinePinch || event.touches.length < 2) {
		return
	}

	event.preventDefault()
	const rect = timelinePinch.timeline.getBoundingClientRect()
	const centerX = touchCenterX(event.touches[0], event.touches[1], rect.left)
	const nextZoom = zoomFromPinch(
		timelinePinch.startZoom,
		timelinePinch.startDistance,
		touchDistance(event.touches[0], event.touches[1]),
	)
	setTimelineZoom(nextZoom, timelinePinch.timeline, centerX)
}, {passive: false})

document.addEventListener('touchend', endTimelinePinch)
document.addEventListener('touchcancel', endTimelinePinch)

document.addEventListener('input', event => {
	const burstTimeTarget = event.target.closest('[data-burst-time]')
	if (burstTimeTarget) {
		updateBurstPlannerTime(burstTimeTarget)
		return
	}

	const detailTimeTarget = event.target.closest('[data-detail-time]')
	if (detailTimeTarget) {
		updateDetailEventTime(detailTimeTarget.dataset.detailTime, detailTimeTarget.value)
		return
	}

	const manualTimeTarget = event.target.closest('[data-manual-time]')
	if (manualTimeTarget) {
		updateManualSkillTime(manualTimeTarget.dataset.manualTime, manualTimeTarget.value)
		return
	}

	const target = event.target.closest('[data-field]')
	if (!target) {
		return
	}

	if (target.dataset.field === 'skill-id') {
		state.insertSkillId = target.value.trim()
		const preview = document.querySelector('[data-insert-id-preview]')
		if (preview) {
			preview.textContent = insertIdPreviewName()
		}
		return
	}
	if (target.dataset.field === 'fflogs-url') {
		state.fflogsUrl = target.value
		render()
		return
	}
	if (target.dataset.field === 'fflogs-gcd-utilization') {
		setFflogsTargetGcdUtilization(target.value, {silent: true})
		return
	}
	if (target.dataset.field === 'editor-mode') {
		setEditorMode(target.value)
		return
	}

	state[target.dataset.field] = target.value
	if (target.dataset.field === 'critRate' || target.dataset.field === 'directRate' || target.dataset.field === 'luck') {
		updateDamage()
		if (state.fflogsComparison) {
			loadFflogsComparison({silent: true})
		}
	}
	if (target.dataset.field === 'job') {
		const selectedJob = state.model.acrDatabase.jobs.find(job => job.id === state.job)
		state.acr = selectedJob?.acrs.find(acr => acr.enabled)?.name ?? selectedJob?.acrs[0]?.name ?? ''
		render()
	}
	if (target.dataset.field === 'focus-query') {
		state.focusQuery = target.value
		render()
	}
})

document.addEventListener('change', event => {
	const overviewToggle = event.target.closest('[data-overview-section-toggle]')
	if (overviewToggle) {
		toggleOverviewSection(overviewToggle.dataset.overviewSectionToggle, overviewToggle.checked)
		return
	}

	const detailTimeTarget = event.target.closest('[data-detail-time]')
	if (detailTimeTarget) {
		updateDetailEventTime(detailTimeTarget.dataset.detailTime, detailTimeTarget.value)
		return
	}

	const detailTarget = event.target.closest('[data-detail-target]')
	if (detailTarget) {
		updateDetailEventTarget(detailTarget.dataset.detailTarget, detailTarget.value)
		return
	}

	const manualTimeTarget = event.target.closest('[data-manual-time]')
	if (manualTimeTarget) {
		updateManualSkillTime(manualTimeTarget.dataset.manualTime, manualTimeTarget.value)
		return
	}

	const importTarget = event.target.closest('[data-field="timeline-import"]')
	if (importTarget?.files?.length) {
		importTimelineFile(importTarget.files[0])
		importTarget.value = ''
	}
	const actorTarget = event.target.closest('[data-field="fflogs-actor"]')
	if (actorTarget) {
		state.fflogsActorId = actorTarget.value
		loadFflogsComparison({actorId: state.fflogsActorId})
		return
	}
})

function render() {
	const model = state.model
	if (!model) {
		return
	}
	const timelineViewport = captureTimelineViewport()
	hideTimelineDragGuide()

	app.innerHTML = `
		${renderTopbar(model)}
		<div class="app-shell">
			${renderSideRail(model)}
			<main class="workspace">
				${renderImportFeedback()}
				${state.section === 'tools' ? renderToolPanel(model) : renderUnifiedEditor(model)}
			</main>
		</div>
		${renderInsertFloat(model)}
		${renderAcrDock(model)}
		${renderFocusSkillModal(model)}
		${renderAcrModal(model)}
		${renderAboutModal(model)}
		${renderPendingTargetPickerOverlay(model)}
	`
	restoreTimelineViewport(timelineViewport)
	positionTargetPickerOverlay()
	requestAnimationFrame(() => {
		restoreTimelineViewport(timelineViewport)
		positionTargetPickerOverlay()
		updateTimelineNav()
	})
	updateDamage()
}

function captureTimelineViewport() {
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		return null
	}
	return {
		scrollLeft: timeline.scrollLeft,
		scrollTop: timeline.scrollTop,
	}
}

function restoreTimelineViewport(viewport) {
	if (!viewport) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		return
	}
	timeline.scrollLeft = viewport.scrollLeft
	timeline.scrollTop = viewport.scrollTop
}

function renderImportFeedback() {
	if (!state.importStatus && !state.importError) {
		return ''
	}
	const message = state.importError || state.importStatus
	const kind = state.importError ? 'error' : 'success'
	return `<div class="import-feedback ${kind}" role="status">${escapeHtml(message)}</div>`
}

function renderSideRail(model) {
	const navItems = [
		{id: 'timeline', icon: 'T', label: t('rail.timeline'), enabled: true},
		{id: 'tools', icon: 'G', label: t('rail.tools'), enabled: true},
	]
	const aboutItem = {id: 'about', icon: INFO_ICON_SVG, label: t('rail.about'), enabled: true, action: 'open-about', open: state.showAboutModal}
	const renderRailButton = item => {
		const active = item.id === 'about'
			? (item.open ? 'active' : '')
			: (state.section === item.id ? 'active' : '')
		const trigger = item.action ? `data-action="${item.action}"` : `data-section="${item.id}"`
		return `
			<button
				class="rail-icon-button ${active} ${item.enabled === false ? 'muted' : ''}"
				${item.enabled === false ? 'disabled' : trigger}
				title="${item.label}"
				aria-label="${item.label}"
			>
				<span>${item.icon}</span>
				<small>${item.label}</small>
			</button>
		`
	}
	const visibilityRail = state.section === 'timeline' && model?.tracks?.expert
		? `<div class="side-rail-visibility">${renderTimelineVisibilityRail(currentVisualTimelineRows(model))}</div>`
		: ''
	return `
		<aside class="side-rail" aria-label="WebTimeline">
			<div class="side-rail-brand" aria-hidden="true">${renderBossAvatar('neo')}</div>
			<nav class="side-rail-nav">
				${navItems.map(renderRailButton).join('')}
			</nav>
			${visibilityRail}
			<nav class="side-rail-footer">
				${renderRailButton(aboutItem)}
			</nav>
		</aside>
	`
}

function renderSidebar(model) {
	return `
		<aside class="guide-rail">
			<div class="brand-lockup">
				<div class="brand-boss-avatar" aria-hidden="true">${renderBossAvatar('凯夫卡')}</div>
				<div>
<p class="eyebrow">WebTimeline</p>
				<strong>${t('brand.subtitle')}</strong>
			</div>
		</div>
		<nav class="rail-nav" aria-label="${t('aria.editSection')}">
			<button class="rail-item active">${t('nav.timeline')}</button>
			<button class="rail-item">${t('nav.fflogs')}</button>
			<button class="rail-item">${t('nav.simulation')}</button>
			<button class="rail-item muted">${t('nav.teamMode')}</button>
			</nav>
			<section class="share-mini">
				<p class="eyebrow">${model.shareCard.timelineName ?? model.encounter.name}</p>
				<strong>${model.shareCard.title}</strong>
				<span>${model.shareCard.subtitle}</span>
			</section>
		</aside>
	`
}

function renderCompactNav(model) {
	return `
		<div class="compact-nav">
			<div class="brand-lockup compact-brand">
				<div class="brand-boss-avatar" aria-hidden="true">${renderBossAvatar('凯夫卡')}</div>
				<div>
<p class="eyebrow">WebTimeline</p>
				<strong>${t('brand.subtitle')}</strong>
			</div>
		</div>
		<nav class="rail-nav compact-rail" aria-label="${t('aria.editSection')}">
				<button class="rail-item ${state.section === 'timeline' ? 'active' : ''}" data-section="timeline">${t('nav.timeline')}</button>
				<button class="rail-item ${state.section === 'tools' ? 'active' : ''}" data-section="tools">${t('nav.tools')}</button>
				<button class="rail-item muted">${t('nav.teamMode')}</button>
			</nav>
			<section class="share-mini compact-share">
				<p class="eyebrow">${model.shareCard.timelineName ?? model.encounter.name}</p>
				<strong>${model.shareCard.title}</strong>
			</section>
		</div>
	`
}

function renderTopbar(model) {
	const selectedJob = model.acrDatabase.jobs.find(job => job.id === state.job) ?? model.acrDatabase.jobs[0]
	return `
		<header class="topbar">
			<div class="topbar-left">
				<div class="topbar-brand">
					<div class="brand-boss-avatar" aria-hidden="true">${renderBossAvatar('neo')}</div>
					<div>
						<strong>WebTimeline</strong>
						<span>${t('brand.subtitle')}</span>
					</div>
				</div>
<nav class="topbar-nav" aria-label="${t('aria.editSection')}">
				<button class="topbar-nav-item ${state.section === 'timeline' ? 'active' : ''}" data-section="timeline">${t('nav.timeline')}</button>
				<button class="topbar-nav-item ${state.section === 'tools' ? 'active' : ''}" data-section="tools">${t('nav.tools')}</button>
				</nav>
				<span class="topbar-divider" aria-hidden="true"></span>
			</div>
			<div class="topbar-main">
				<div class="topbar-title">
					<div class="topbar-meta">
						<p class="eyebrow" data-timeline-kind="${escapeHtml(model.encounter.timelineKindLabel ?? '默认白轴')}">Territory ${model.encounter.territoryId} / ${model.encounter.job} / ${escapeHtml(model.encounter.timelineKindLabel ?? '默认白轴')}</p>
						${renderJobAcrStatus(model, selectedJob)}
					</div>
					<h2>${model.encounter.name}</h2>
				</div>
			</div>
			<div class="topbar-controls">
				<label class="topbar-mode-field">
					<span>${t('label.mode')}</span>
					<select data-field="editor-mode" aria-label="${t('aria.editorMode')}">
						<option value="browse" ${state.editorMode === 'browse' ? 'selected' : ''}>${t('mode.browse')}</option>
						<option value="edit" ${state.editorMode === 'edit' ? 'selected' : ''}>${t('mode.edit')}</option>
					</select>
				</label>
				<label>
<span>${t('label.job')}</span>
				<select data-field="job">
					${model.acrDatabase.jobs.map(job => `<option value="${job.id}" ${job.id === state.job ? 'selected' : ''} ${job.enabled ? '' : 'disabled'}>${job.name}${job.enabled ? '' : `（${t('status.notConnected')}）`}</option>`).join('')}
					</select>
				</label>
				<label>
<span>${t('label.acr')}</span>
				<select data-field="acr">
						${selectedJob.acrs.map(acr => `<option value="${acr.name}" ${acr.name === state.acr ? 'selected' : ''} ${acr.enabled ? '' : 'disabled'}>${acr.name}</option>`).join('')}
					</select>
				</label>
			${DEFAULT_TIMELINE_IMPORTS.map(source => `<button class="ghost compact" data-import-default="${source.id}">${source.label}</button>`).join('')}
			<button class="ghost" data-action="import-timeline">${t('action.import')}</button>
			<button class="ghost" data-action="export-timeline">${t('action.export')}</button>
			${renderLanguageSwitcher()}
			<input class="hidden-file-input" type="file" accept=".json,.ptl,application/json" data-field="timeline-import">
			</div>
		</header>
	`
}

function renderJobAcrStatus(model, selectedJob) {
	const job = selectedJob ?? model.acrDatabase.jobs.find(item => item.id === state.job)
	const acr = job?.acrs.find(item => item.name === state.acr)
	const status = acrSupportStatus(job, acr)
	return `
		<div class="job-acr-status">
			<span class="current">${t('status.current')}</span>
			<span>${t('label.jobColon')}${job?.name ?? state.job ?? 'unknown'}</span>
			<span>${t('label.acrColon')}${acr?.name ?? state.acr ?? t('status.unspecified')}</span>
			${renderAcrStatusBadge(status)}
		</div>
	`
}

function setEditorMode(mode) {
	state.editorMode = mode === 'edit' ? 'edit' : 'browse'
	if (!canEditTimeline()) {
		state.showInsertDrawer = false
	}
	render()
}

function renderUnifiedEditor(model) {
	const track = model.tracks.expert
	return `
		<div class="unified-grid">
			<section class="timeline-panel">
				${renderLaneTimeline(track)}
			</section>
			<section class="detail-panel">
				${renderDetailPanel(model)}
			</section>
		</div>
	`
}

function renderInsertFloat(model) {
	if (!canEditTimeline() || state.section !== 'timeline') {
		return ''
	}
	const x = Math.round(Number(state.insertFloatPos?.x ?? 28))
	const y = Math.round(Number(state.insertFloatPos?.y ?? 520))
	const placement = insertFloatPlacement({x, y})
	const classes = [
		'insert-float',
		state.showInsertDrawer ? 'has-drawer' : '',
		placement.alignRight ? 'align-right' : 'align-left',
		placement.alignUp ? 'align-up' : 'align-down',
	].filter(Boolean).join(' ')
	return `
		<div class="${classes}" style="left:${x}px; top:${y}px;">
			<button class="insert-float-button ${state.showInsertDrawer ? 'active' : ''}" data-toggle="insert-drawer" data-insert-float-handle="true" title="${t('insert.floatTitle')}" aria-label="${t('insert.floatTitle')}">
				<img class="insert-float-avatar" src="./assets/ui/programming-mode-button.jpg" alt="" loading="lazy" decoding="async">
				<span class="insert-float-state" aria-hidden="true"></span>
			</button>
			${state.showInsertDrawer ? renderSkillDrawer(model.tracks.expert) : ''}
		</div>
	`
}

function renderBurstPlanner(bursts, options = {}) {
	const limit = Number(options.limit ?? 4)
	const className = options.className ?? ''
	return `
		<div class="burst-strip compact ${className}">
			${bursts.slice(0, limit).map((burst, index) => {
				const burstId = burst.burstIndex ?? index
				const burstTimeMs = Number(burst.timeMs ?? burst.startMs ?? index * 60000)
				const window = burstWindowForTime(burst, burstTimeMs, index)
				const burstLabel = window === '120s' ? t('burst.120') : t('burst.60')
				const qtItems = Array.isArray(burst.qt) ? burst.qt : []
				return `
				<article class="burst-window ${window === '120s' ? 'major' : 'minor'}">
					<div>
						<span>${window}</span>
						<strong>${burstLabel}</strong>
					</div>
					<div class="qt-pills">
						${qtItems.map(qt => `<button data-qt="${qt}">${qt}</button>`).join('') || `<span>${t('empty.noQt')}</span>`}
					</div>
					<label>
						<span data-burst-time-label="${burstId}">${formatTime(burstTimeMs)}</span>
						<input type="range" min="0" max="720" value="${Math.round(burstTimeMs / 1000)}" data-burst-time="${burstId}" aria-label="${burstLabel} 时间">
					</label>
					<button class="mini-button" data-action="quick-insert-burst-qt" data-burst-index="${burstId}" data-burst-time-ms="${burstTimeMs}">${t('action.insertQt')}</button>
				</article>
			`}).join('')}
		</div>
	`
}

function renderLaneTimeline(track) {
	const rows = buildVisualTimelineRows(track)
	const visibleRows = visibleTimelineRows(rows)
	const maxTime = timelineDurationMs(rows, state.model.bossTimeline?.source, state.phase)
	const phases = phaseOptions(state.model.bossTimeline?.source)
	const baseWidth = timelineBaseWidth(maxTime)
	const timelineWidth = Math.round(baseWidth * state.timelineZoom)
	const sourceSummary = state.model.bossTimeline
		? `boss-data / ${state.model.bossTimeline.source.castCount} casts / ${state.model.bossTimeline.source.abilityCount} releases`
		: `Unified view / ${rows.reduce((sum, row) => sum + row.items.length, 0)} items`
	return `
		<div class="xiva-shell" data-base-width="${baseWidth}" data-zoom="${state.timelineZoom.toFixed(2)}" style="--timeline-width:${timelineWidth}px">
			<div class="xiva-toolbar">
				<div>
					<strong>Timeline</strong>
					<span>${sourceSummary}</span>
				</div>
				<div class="timeline-phase-controls">
					<div class="timeline-nav-bar compact" data-timeline-nav aria-label="Timeline horizontal navigator">
						<div class="timeline-nav-track" data-timeline-nav-track>
							<div class="timeline-nav-thumb" data-timeline-nav-thumb>
								<img class="timeline-nav-mascot" src="./assets/ui/pixel-mascot-timeline-v1.png" alt="" loading="lazy" decoding="async">
							</div>
						</div>
					</div>
				</div>
				<div class="phase-switch" aria-label="Boss phase filter">
					<button class="${state.phase === 'all' ? 'active' : ''}" data-phase="all">${t('phase.all')}</button>
					${phases.map(phase => `<button class="${state.phase === phase.id ? 'active' : ''}" data-phase="${phase.id}">${phase.label}</button>`).join('')}
				</div>
				<div class="xiva-legend">
					<span><i class="legend-cast"></i>${t('legend.boss')}</span>
					<span><i class="legend-action"></i>${t('legend.output')}</span>
					<span><i class="legend-mitigation"></i>${t('legend.mitigation')}</span>
					<span><i class="legend-burst"></i>${t('legend.burst')}</span>
				</div>
				<button class="sim-toggle ${state.showAcrSimulation ? 'active' : ''}" data-toggle="acr-simulation">${state.showAcrSimulation ? t('sim.hide') : t('sim.show')}</button>
			</div>
			<div class="xiva-timeline">
				${renderTimelineDragGuide()}
				<div class="xiva-label xiva-axis-label">Time</div>
				<div class="xiva-track xiva-axis">${renderTimelineAxis(maxTime)}</div>
				${visibleRows.map(row => renderTimelineRow(row, maxTime, timelineWidth)).join('')}
			</div>
		</div>
	`
}

function renderSkillDrawer(track) {
	const groups = insertSkillGroups(track)
	const activeGroup = groups.find(group => group.id === state.insertSkillCategory) ?? groups[0]
	return `
		<section class="skill-drawer floating-skill-drawer">
			<div class="section-heading insert-panel-heading" data-insert-panel-handle="true" title="${t('insert.panelHandle')}">
				<div class="insert-panel-title">
					<p class="eyebrow">${t('insert.title')}</p>
					<h3>${t('insert.hint')}</h3>
				</div>
				${renderInsertTool()}
			</div>
			<div class="insert-category-tabs">
				${groups.map(group => `<button class="${group.id === activeGroup.id ? 'active' : ''}" data-insert-category="${group.id}"><span>${group.label}</span><small>${group.skills.length}</small></button>`).join('')}
			</div>
			${activeGroup.id === 'burst' ? renderBurstInsertPanel(activeGroup.skills) : activeGroup.id === 'potion' ? renderPotionInsertPanel(activeGroup.skills) : renderInsertSkillGroupContent(activeGroup)}
		</section>
	`
}

function renderInsertSkillGroupContent(activeGroup) {
	return activeGroup.id === 'qt' ? renderQtGamePanel(activeGroup.skills) : `
		<div class="skill-strip">
			${activeGroup.skills.length ? activeGroup.skills.map(event => event.type === 'burst-insert' ? renderBurstInsertCard(event) : event.type === 'qt-insert' ? renderQtInsertCard(event) : renderSkillCard(event)).join('') : `<p class="empty-state">${t('empty.noSkillInCategory')}</p>`}
		</div>
	`
}

function renderQtGamePanel(skills = []) {
	return `
		<div class="qt-game-panel">
			<p class="qt-panel-note">${t('qt.note')}</p>
			<div class="qt-game-layout">
				<div class="qt-game-grid">
					${skills.length ? skills.map(renderQtInsertCard).join('') : `<p class="empty-state">${t('empty.noQtState')}</p>`}
				</div>
				${renderQtDraftPanel(skills)}
			</div>
		</div>
	`
}

function renderQtDraftPanel(skills = []) {
	const changes = qtDraftChanges(skills)
	return `
		<aside class="qt-draft-panel">
			<div class="qt-draft-heading">
				<strong>${t('qt.draftTitle')}</strong>
				<small>${changes.length} ${t('qt.draftChanges')}</small>
			</div>
			<div class="qt-draft-logic">
				${changes.length ? changes.map(change => `
					<div class="qt-draft-row">
						<span>${escapeHtml(change.name)}</span>
						<strong>${change.enabled ? t('qt.on') : t('qt.off')}</strong>
					</div>
				`).join('') : `<p class="empty-state">${t('empty.qtDraftEmpty')}</p>`}
			</div>
			<button class="mini-button qt-draft-insert" data-action="insert-qt-draft" ${changes.length ? '' : 'disabled'}>${t('action.insert')}</button>
		</aside>
	`
}

function renderBurstInsertPanel(bursts) {
	const choices = uniqueBurstInsertChoices(bursts)
	return `
		<div class="insert-burst-panel">
			<div class="insert-burst-heading">
				<strong>${t('burst.title')}</strong>
				<span>${t('burst.hint')}</span>
			</div>
			<div class="insert-burst-card-grid">
				${choices.length ? choices.map(renderBurstInsertCard).join('') : `<p class="empty-state">${t('empty.noBurst')}</p>`}
			</div>
		</div>
	`
}

function renderPotionInsertPanel(potions = []) {
	const activeAttribute = activePotionAttribute()
	return `
		<div class="insert-potion-panel">
			<div class="insert-burst-heading">
				<strong>${t('potion.title')}</strong>
				<span>${t('potion.hint')}</span>
			</div>
			<div class="potion-attribute-grid" role="tablist" aria-label="${t('potion.attributeAria')}">
				${POTION_ATTRIBUTES.map(attribute => `
					<button class="potion-attribute-card ${attribute.id === activeAttribute.id ? 'active' : ''}" type="button" data-potion-attribute="${attribute.id}" aria-pressed="${attribute.id === activeAttribute.id ? 'true' : 'false'}" title="${escapeHtml(t(attribute.labelKey))}${t('potion.selectSuffix')}">
						<strong>${escapeHtml(t(attribute.labelKey))}</strong>
						<small>${escapeHtml(t(attribute.roleKey))}</small>
					</button>
				`).join('')}
			</div>
			<div class="insert-potion-card-grid">
				${potions.length ? potions.map(renderPotionInsertCard).join('') : `<p class="empty-state">${t('empty.noPotion')}</p>`}
			</div>
		</div>
	`
}

function uniqueBurstInsertChoices(bursts) {
	const normalized = (bursts ?? []).map((burst, index) => {
		const timeMs = Number(burst.timeMs ?? burst.startMs ?? index * 60000)
		const window = burstWindowForTime(burst, timeMs, index)
		return {...burst, timeMs, window, name: burstLabelForWindow(window)}
	})
	const sixtySecondBurst = normalized.find(burst => burst.window === '60s') ?? fallbackBurstInsertChoice('60s')
	const oneTwentySecondBurst = normalized.find(burst => burst.window === '120s') ?? fallbackBurstInsertChoice('120s')
	return [sixtySecondBurst, oneTwentySecondBurst].filter(Boolean)
}

function fallbackBurstInsertChoice(window) {
	return {
		id: `burst-insert-${window}`,
		type: 'burst-insert',
		window,
		name: window === '120s' ? '120 爆发' : '60 爆发',
		timeMs: window === '120s' ? 120000 : 60000,
		durationMs: 12000,
		source: 'manual',
		items: [],
		qt: [],
		burstIndex: window,
	}
}

function insertSkillGroups(track) {
	const currentJobSkills = currentJobInsertSkills()
	const timelineSkills = [
		...(track.mitigation ?? []),
		...mainActionTimelineEvents(track.player ?? []),
		...(state.showAcrSimulation ? state.model.acrSimulation?.events ?? [] : []),
	].filter(event => isCurrentJobInsertEvent(event)).map(event => ({
		...event,
		sidebarType: insertSidebarType(event),
	}))
	const skills = uniqueSkillLibraryItems([...timelineSkills, ...currentJobSkills])
		.sort(compareInsertSkills)
	const burstGroups = burstInsertGroups(track)
	const qtControls = insertQtControls(track)
	const groups = [
{id: 'all', label: t('category.all'), skills},
{id: 'output', label: t('category.output'), skills: skills.filter(event => event.sidebarType === 'output')},
{id: 'mitigation', label: t('category.mitigation'), skills: skills.filter(event => event.sidebarType === 'mitigation')},
{id: 'potion', label: t('category.potion'), skills: potionInsertItems()},
{id: 'qt', label: t('category.qt'), skills: qtControls},
{id: 'burst', label: t('category.burst'), skills: burstGroups},
	]
	if (!groups.some(group => group.id === state.insertSkillCategory)) {
		state.insertSkillCategory = 'all'
	}
	return groups
}

function potionInsertItems() {
	return potionInsertItemsForAttribute(activePotionAttribute())
}

function potionInsertItemsForAttribute(attribute) {
const attrLabel = t(attribute.labelKey)
const attrRole = t(attribute.roleKey)
return COMBAT_POTION_TIERS.map((tier, index) => ({
...tier,
potionId: `${tier.id}-${attribute.id}`,
attributeId: attribute.id,
attributeLabel: attrLabel,
attributeRole: attrRole,
type: 'potion-insert',
name: `${tier.label}${attrLabel}${t('potion.selectSuffix')}`,
label: `${tier.label}${attrLabel}${t('potion.selectSuffix')}`,
cnName: `${tier.label}${attrLabel}之${tier.familyLabel}`,
		timeMs: index * 1000,
		durationMs: 30000,
		recastMs: 270000,
		source: 'manual',
		sidebarType: 'potion',
	}))
}

function potionInsertById(potionId) {
	return allPotionInsertItems().find(item => item.potionId === potionId) ?? potionInsertItems()[0] ?? null
}

function allPotionInsertItems() {
	return POTION_ATTRIBUTES.flatMap(attribute => potionInsertItemsForAttribute(attribute))
}

function activePotionAttribute() {
	return POTION_ATTRIBUTES.find(attribute => attribute.id === state.potionAttribute) ?? POTION_ATTRIBUTES[0]
}

function setPotionAttribute(attributeId) {
	state.potionAttribute = POTION_ATTRIBUTES.some(attribute => attribute.id === attributeId)
		? attributeId
		: POTION_ATTRIBUTES[0].id
	render()
}

function currentJobInsertSkills() {
	return state.model.skillDatabase?.skills
		?.filter(skill => skill.job === state.job)
		?.map(skill => skillToInsertEvent(skill)) ?? []
}

function isCurrentJobInsertEvent(event = {}) {
	const action = actionById(event.actionId)
	return Boolean(action?.job === state.job || event.job === state.job)
}

function skillToInsertEvent(skill) {
	return {
		id: `skill-${skill.id}`,
		name: skill.name,
		actionId: String(skill.id),
		timeMs: 0,
		kind: 'player-action',
		source: 'skill-database',
		classification: skill.type ?? 'unknown',
		output: Boolean(skill.output),
		potency: Number(skill.potency ?? 0),
		durationMs: Number(skill.effectDurationMs ?? 0),
		iconUrl: skill.iconUrl ?? '',
		skillType: skill.category ?? '',
		sidebarType: insertSidebarType(skill),
	}
}

function insertSidebarType(event) {
	if (event.kind === 'potion' || event.type === 'potion' || event.classification === 'potion' || /爆发药/.test(event.name ?? '')) {
		return 'potion'
	}
	if (isInsertOutputOverride(event)) {
		return 'output'
	}
	if (event.classification === 'mitigation' || event.classification === 'healing' || event.type === 'mitigation' || event.type === 'healing') {
		return 'mitigation'
	}
	if (event.output || event.classification === 'damage' || event.classification === 'dot' || event.classification === 'output') {
		return 'output'
	}
	return 'other'
}

function isInsertOutputOverride(event = {}) {
	const name = `${event.name ?? ''} ${event.label ?? ''} ${event.timelineLabel ?? ''}`
	const actionId = Number(event.actionId ?? event.id)
	return actionId === 7390 || /血乱|嗜血/.test(name)
}

function burstInsertGroups(track) {
	return (track.burst ?? state.model.tracks.beginner?.burst ?? []).map((burst, index) => {
		const timeMs = Number(burst.timeMs ?? burst.startMs ?? index * 60000)
		const window = burstWindowForTime(burst, timeMs, index)
		return {
			id: `burst-insert-${index}`,
			type: 'burst-insert',
			window,
			name: burstLabelForWindow(window),
			timeMs,
			source: burst.source ?? 'ACR',
			items: Array.isArray(burst.items) ? burst.items : [],
			qt: Array.isArray(burst.qt) ? burst.qt : [],
			burstIndex: index,
		}
	})
}

function insertQtControls(track) {
	const stateItems = qtStatePanelItems(track)
	if (stateItems.length) {
		return stateItems.map((item, index) => ({
			...item,
			id: `qt-insert-${index}`,
			type: 'qt-insert',
			qtIndex: index,
		}))
	}
	const timelineItems = (timelineQtEvents(track) ?? []).map((event, index) => {
		const name = event.name ?? event.label ?? 'QT 控制'
		const defaultEnabled = Boolean(event.defaultEnabled ?? event.enabled ?? false)
		const enabled = Boolean(event.nextEnabled ?? !defaultEnabled)
		return {
			id: `qt-insert-${index}`,
			type: 'qt-insert',
			name,
			label: event.label ?? name,
			timeMs: Number(event.timeMs ?? event.startMs ?? 0),
			source: event.source ?? 'timeline',
			defaultEnabled,
			nextEnabled: enabled,
			onCount: Number(event.onCount ?? (defaultEnabled ? 1 : 0)),
			offCount: Number(event.offCount ?? (defaultEnabled ? 0 : 1)),
			qtStates: event.qtStates?.length ? event.qtStates : [{Name: name, Enabled: enabled}],
			qtIndex: index,
		}
	})
	if (timelineItems.length) {
		return timelineItems
	}
	const acrItems = acrQtControlsForCurrentSelection()
	if (acrItems.length) {
		return acrItems
	}
	return []
}

function qtStatePanelItems(track = {}) {
	const playerEvents = Array.isArray(track.player) && track.player.length
		? track.player
		: state.model?.tracks?.expert?.player ?? []
	const states = new Map()
	for (const event of playerEvents) {
		if (event.kind !== 'qt-control' || !Array.isArray(event.qtStates) || !event.qtStates.length) {
			continue
		}
		const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
		for (const rawState of event.qtStates) {
			const name = String(rawState.Name ?? rawState.name ?? '').trim()
			if (!name) {
				continue
			}
			const enabled = Boolean(rawState.Enabled ?? rawState.enabled)
			const entry = states.get(name) ?? {
				name,
				label: name,
				source: event.source ?? 'ACR',
				order: states.size,
				onCount: 0,
				offCount: 0,
				lastTimeMs: -1,
				defaultEnabled: false,
			}
			entry.onCount += enabled ? 1 : 0
			entry.offCount += enabled ? 0 : 1
			if (timeMs >= entry.lastTimeMs) {
				entry.lastTimeMs = timeMs
				entry.timeMs = timeMs
				entry.source = event.source ?? entry.source
				entry.defaultEnabled = enabled
			}
			states.set(name, entry)
		}
	}
	return [...states.values()]
		.sort((left, right) => left.order - right.order)
		.map(item => {
			const name = item.name
			const enabled = !item.defaultEnabled
			return {
				name,
				label: item.label,
				timeMs: Number(item.timeMs ?? 0),
				source: item.source,
				defaultEnabled: Boolean(item.defaultEnabled),
				nextEnabled: enabled,
				onCount: item.onCount,
				offCount: item.offCount,
				qtStates: [{Name: name, Enabled: enabled}],
			}
		})
}

function acrQtControlsForCurrentSelection() {
	const job = state.model.acrDatabase.jobs.find(job => job.id === state.job)
	const acr = job?.acrs.find(acr => acr.name === state.acr)
		?? job?.acrs.find(acr => acr.enabled)
		?? job?.acrs[0]
	const controls = Array.isArray(acr?.qtControls) ? acr.qtControls : []
	return controls.map((control, index) => {
		const name = control.name ?? control.label ?? 'QT'
		const defaultEnabled = Boolean(control.defaultEnabled)
		return {
			id: `qt-acr-${state.job}-${acr?.name ?? 'acr'}-${index}`,
			type: 'qt-insert',
			name,
			label: control.label ?? name,
			timeMs: 0,
			source: acr.name,
			qtSource: 'acr-database',
			defaultEnabled,
			nextEnabled: !defaultEnabled,
			onCount: defaultEnabled ? 1 : 0,
			offCount: defaultEnabled ? 0 : 1,
			qtStates: [{Name: name, Enabled: !defaultEnabled}],
			qtIndex: `acr-${state.job}-${acr?.name ?? 'acr'}-${index}`,
		}
	})
}

function qtDraftKey(event = {}) {
	return String(event.qtIndex ?? event.name ?? '')
}

function qtDraftEnabledFor(event = {}) {
	const key = qtDraftKey(event)
	if (Object.hasOwn(state.qtDraftStates, key)) {
		return Boolean(state.qtDraftStates[key])
	}
	return Boolean(event.defaultEnabled)
}

function qtDraftStateFor(event = {}) {
	return {
		Name: event.name,
		Enabled: qtDraftEnabledFor(event),
	}
}

function qtDraftChanges(skills = insertQtControls(state.model.tracks.expert)) {
	return (skills ?? [])
		.filter(event => qtDraftEnabledFor(event) !== Boolean(event.defaultEnabled))
		.map(event => ({
			name: event.name,
			enabled: qtDraftEnabledFor(event),
			qtIndex: event.qtIndex,
			qtState: qtDraftStateFor(event),
		}))
}

function toggleQtDraftState(qtIndex) {
	const qt = qtInsertByIndex(qtIndex)
	if (!qt) {
		setImportError('没有找到这个 QT 控制节点')
		return
	}
	const key = qtDraftKey(qt)
	const enabled = !qtDraftEnabledFor(qt)
	state.qtDraftStates = {
		...state.qtDraftStates,
		[key]: enabled,
	}
	setImportStatus(`已暂存 ${qt.name} -> ${enabled ? '开启' : '关闭'}`)
}

function compareInsertSkills(left, right) {
	if (left.type === 'burst-insert' || right.type === 'burst-insert') {
		return Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0)
	}
	const leftLevel = Number(actionById(left.actionId)?.level ?? 0)
	const rightLevel = Number(actionById(right.actionId)?.level ?? 0)
	return leftLevel - rightLevel || String(left.name).localeCompare(String(right.name), 'zh-CN')
}

function renderBurstInsertCard(event) {
const count = burstInsertSkillNames(event).length
const burstId = event.burstIndex
const window = burstWindowForTime(event, Number(event.timeMs ?? event.startMs ?? 0), 0)
const label = event.name ?? burstLabelForWindow(window)
const title = `${label} / ${formatTime(event.timeMs)} / ${count} ${t('unit.items')} — ${t('hint.dragInsertBurst')}`
return `
<div class="skill-card burst-insert-card" draggable="true" data-action="quick-insert-burst" data-burst-index="${burstId}" data-drag-burst="${event.burstIndex}" title="${escapeHtml(title)}">
<span class="skill-icon fallback">${window === '120s' ? '120' : '60'}</span>
<span class="skill-card-body">
<strong>${escapeHtml(label)}</strong>
<small>${formatTime(event.timeMs)} / ${count} ${t('unit.items')}</small>
</span>
<span class="skill-card-source burst">${window}</span>
</div>
`
}

function renderPotionInsertCard(event) {
	const attributeLabel = potionAttributeLabel(event.attributeId)
	const title = `${event.cnName} / ${event.name} / ${attributeLabel} / 30s / 4:30`
	return `
		<div class="skill-card potion-insert-card" draggable="true" data-action="quick-insert-potion" data-potion-id="${event.potionId}" data-drag-potion="${event.potionId}" title="${escapeHtml(title)}">
			<span class="skill-icon fallback potion-icon">${escapeHtml(attributeLabel)}</span>
			<span class="skill-card-body">
				<strong>${escapeHtml(event.label)}</strong>
				<small><span class="potion-tier-pill">${escapeHtml(event.tier)}</span>${escapeHtml(event.familyLabel)} / Lv.${event.level} / 30s</small>
			</span>
			<span class="skill-card-source potion">${escapeHtml(event.tier)}</span>
		</div>
	`
}

function renderQtInsertCard(event) {
	const enabled = qtDraftEnabledFor(event)
	const title = `${event.name}：${enabled ? t('qt.off') : t('qt.on')}`
	return `
		<div class="qt-game-toggle ${qtDraftEnabledFor(event) ? 'is-on' : 'is-off'} qt-insert-card" draggable="true" data-action="toggle-qt-draft" data-qt-insert="${event.qtIndex}" data-drag-qt="${event.qtIndex}" data-qt-enabled="${qtDraftEnabledFor(event) ? 'true' : 'false'}" title="${escapeHtml(title)}">
			<span class="qt-game-dot" aria-hidden="true"></span>
			<span class="skill-card-body">
				<strong>${escapeHtml(event.name)}</strong>
				<small>${enabled ? t('qt.on') : t('qt.off')}</small>
			</span>
		</div>
	`
}

function burstInsertSkillNames(event) {
	return [...(event.items ?? []).map(item => item.name ?? item.label), ...(event.qt ?? [])].filter(Boolean)
}

function renderSkillCard(event) {
	const draggable = isDraggableSkillCard(event)
	const lockedText = event.sidebarType === 'acr' ? t('acr.lockedHint') : t('edit.lockedHint')
	const title = draggable ? `${event.name} — ${t('hint.dragToTimeline')}` : `${event.name} — ${lockedText}`
	const sourceTag = event.sidebarType === 'acr' ? `<span class="skill-card-source acr">${t('acr.lockedShort')}</span>` : ''
	return `
		<div class="skill-card ${event.sidebarType === 'acr' ? 'simulated acr-locked' : ''} ${draggable ? '' : 'locked'}" draggable="${draggable ? 'true' : 'false'}" data-action="quick-insert-skill" data-drag-skill="${event.actionId}" data-drag-locked="${draggable ? 'false' : 'true'}" data-skill-source="${event.sidebarType}" title="${escapeHtml(title)}">
			${renderIcon(event.name, event.iconUrl)}
			<span class="skill-card-body">
				<strong>${escapeHtml(event.name)}</strong>
				<small>${insertSkillCardMeta(event)}</small>
			</span>
			${sourceTag}
		</div>
	`
}

function insertSkillCardMeta(event) {
	if (event.sidebarType === 'acr') {
		return t('acr.lockedShort')
	}
	const action = actionById(event.actionId)
	const level = action?.level ? `Lv.${action.level}` : ''
	const typeLabel = insertSidebarLabel(event.sidebarType) || manualClassificationLabel(event) || event.skillType || event.sidebarType
	return [typeLabel, level].filter(Boolean).join(' / ') || formatTime(event.timeMs)
}

function insertSidebarLabel(type) {
if (type === 'output') return t('category.output')
if (type === 'mitigation') return t('category.mitigation')
if (type === 'potion') return t('category.potion')
return ''
}

function isDraggableSkillCard(event) {
	return canEditTimeline() && event.sidebarType !== 'acr'
}

function qtInsertByIndex(qtIndex) {
	return insertQtControls(state.model.tracks.expert).find(item => String(item.qtIndex) === String(qtIndex))
}

function burstInsertByIndex(burstIndex) {
	const burst = burstInsertGroups(state.model.tracks.expert).find(item => String(item.burstIndex) === String(burstIndex))
	if (burst) {
		return burst
	}
	return ['60s', '120s'].includes(String(burstIndex)) ? fallbackBurstInsertChoice(String(burstIndex)) : null
}

function renderEventChip(event, index, laneType) {
	const colorClass = laneType === 'boss' ? `boss-color-${index % 4}` : laneType
	const style = event.timeMs ? `style="left:calc(${Math.min(94, event.timeMs / 720000 * 100)}%);"` : ''
	const damage = event.damage == null ? '' : `<small class="damage">${event.damage || 0}</small>`
	const badge = event.kind === 'boss-cast'
		? `<span class="corner start">${event.castStartLabel}</span><span class="corner end">${event.castEndLabel}</span>`
		: ''
	return `
		<button class="event-chip ${colorClass}" ${style} title="${event.name}">
			${badge}
			${laneType !== 'boss' ? renderIcon(event.name) : '<span class="cast-dot"></span>'}
			<span>${event.name}</span>
			${damage}
			<em>${formatTime(event.timeMs)}</em>
		</button>
	`
}

function buildVisualTimelineRows(track) {
	const parsedMergedBossRows = state.model.timelineRows.filter(row => (row.groupId ?? row.id) === 'boss')
	const parsedBossCastRows = state.model.timelineRows.filter(row => (row.groupId ?? row.id) === 'boss-casts')
	const parsedBossDamageRows = state.model.timelineRows.filter(row => (row.groupId ?? row.id) === 'boss-damage')
	const player = track.player ?? []
	const mitigation = track.mitigation ?? []
	const simulated = state.showAcrSimulation
		? (track.simulated ?? state.model.acrSimulation?.events ?? [])
		: []
	const simulatedMitigation = simulated.filter(event => isCoverageTimelineEvent(event) || timelineFunctionalLane(event) === 'mitigation')
	const simulatedOutput = simulated.filter(event => !isCoverageTimelineEvent(event) && timelineFunctionalLane(event) !== 'mitigation')
	const manual = manualQueueEvents().map((item, index) => timelineManualItem(item, index))
	const qtSource = timelineQtEvents(track)
	const burstPackages = buildBurstPackageItems(track.burst ?? state.model.tracks.beginner?.burst ?? [])
	const openerPanel = state.model.detailPanels.find(panel => panel.id === 'opener')
	const openerItems = openerDetailEvents(openerPanel).map(event => timelineItemForEvent(event, {defaultType: event.potency > 0 ? 'gcd' : 'action'}))
	const openerItemKeys = new Set(openerItems.map(timelineDisplayEventKey))
	const focused = focusedSkillRows()
	const bossCastRows = parsedBossCastRows.length
		? parsedBossCastRows
		: []
	const bossDamageRows = parsedBossDamageRows.length
		? parsedBossDamageRows
		: []
	const bossRows = prepareBossTimelineRows(
		parsedMergedBossRows.length
			? parsedMergedBossRows
			: mergeBossCastAndDamageRows([...bossCastRows, ...bossDamageRows]),
		state.model.bossTimeline?.source,
		'all',
		Infinity,
	)
	const rows = [
		...bossRows,
		{id: 'opener-actions', label: t('overview.opener'), accent: 'violet', keepWhenEmpty: true, items: openerItems},
		{id: 'output-actions', label: t('rail.output'), accent: 'mint', keepWhenEmpty: true, items: buildOutputLaneItems(player, manual, openerItemKeys)},
		{id: 'mitigation-actions', label: t('rail.mitigation'), accent: 'mint', keepWhenEmpty: true, items: buildMitigationLaneItems(mitigation, manual, simulatedMitigation, openerItemKeys)},
		{id: 'burst-integration', label: t('rail.burst'), accent: 'orange', keepWhenEmpty: true, items: buildBurstLaneItems(burstPackages, manual, openerItemKeys)},
		{id: 'qt-controls', label: 'QT 控制', accent: 'sky', keepWhenEmpty: true, items: buildQtLaneItems(qtSource, manual)},
		{id: 'acr-simulated', label: t('rail.acrSim'), accent: 'sky', items: simulatedOutput.map(event => timelineItemForEvent(event, {defaultType: event.output ? 'simulated-gcd' : 'simulated-action', simulated: true}))},
		{id: 'focus-add', label: t('rail.focusAdd'), labelHtml: renderFocusAddLabel(), accent: 'sky', keepWhenEmpty: true, items: []},
		...focused,
	].filter(row => row.id !== 'acr-simulated' || row.items.length)
	let bossIndex = 0
	return timelineRowsForPhase(rows, state.model.bossTimeline?.source, state.phase)
		.map(limitVisibleTimelineRowItems)
		.map(row => row.groupId === 'boss' ? {...row, bossIndex: bossIndex++} : row)
}

function buildOutputLaneItems(player = [], manual = [], excludedDisplayKeys = new Set()) {
	const playerItems = mainActionTimelineEvents(player)
		.filter(event => !isBurstTimelineEvent(event))
		.map(event => timelineItemForEvent(event, {defaultType: event.potency > 0 ? 'gcd' : 'action'}))
	const manualItems = manual.filter(event => timelineFunctionalLane(event) === 'output')
	return sortTimelineItems(omitTimelineItemsWithKeys(uniqueTimelineDisplayEvents([...playerItems, ...manualItems]), excludedDisplayKeys))
}

function buildMitigationLaneItems(mitigation = [], manual = [], simulatedCoverage = [], excludedDisplayKeys = new Set()) {
	const mitigationItems = mitigation
		.filter(event => timelineFunctionalLane(event) === 'mitigation')
		.map(event => timelineItemForEvent(event, {defaultType: 'action'}))
	const simulatedItems = simulatedCoverage
		.filter(event => timelineFunctionalLane(event) === 'mitigation')
		.map(event => timelineItemForEvent(event, {defaultType: 'action', simulated: true}))
	const manualItems = manual.filter(event => timelineFunctionalLane(event) === 'mitigation')
	const imported = filterCooldownConflictingTimelineItems(uniqueTimelineDisplayEvents([...mitigationItems, ...manualItems]))
	return sortTimelineItems(uniqueTimelineDisplayEvents([...omitTimelineItemsWithKeys(imported, excludedDisplayKeys), ...simulatedItems]))
}

function buildBurstLaneItems(burstPackages = [], manual = [], excludedDisplayKeys = new Set()) {
	const manualItems = manual.filter(event => timelineFunctionalLane(event) === 'burst')
	return sortTimelineItems(omitTimelineItemsWithKeys([...burstPackages, ...manualItems], excludedDisplayKeys))
}

function omitTimelineItemsWithKeys(items = [], excludedDisplayKeys = new Set()) {
	if (!excludedDisplayKeys?.size) {
		return items
	}
	return items.filter(item => !excludedDisplayKeys.has(timelineDisplayEventKey(item)))
}

function buildQtLaneItems(qtSource = [], manual = []) {
	const qtItems = compactTimelineQtEvents(qtSource)
		.map(event => timelineItemForEvent(event, {defaultType: 'qt'}))
	const manualQtItems = manual
		.filter(event => timelineFunctionalLane(event) === 'qt')
		.map(event => timelineItemForEvent(event, {defaultType: 'qt'}))
	return sortTimelineItems([...qtItems, ...manualQtItems])
}

function compactTimelineQtEvents(events = []) {
	const groups = new Map()
	for (const event of events) {
		const key = `${timelineFunctionalLane(event)}|${qtCompactBucketMs(event)}`
		const group = groups.get(key) ?? {startMs: Number(event.timeMs ?? event.startMs ?? 0), items: []}
		group.items.push(event)
		group.startMs = Math.min(group.startMs, Number(event.timeMs ?? event.startMs ?? 0))
		groups.set(key, group)
	}
	return [...groups.values()].map((group, index) => {
		const first = group.items[0] ?? {}
		const qtStates = group.items.flatMap(item => Array.isArray(item.qtStates) && item.qtStates.length
			? item.qtStates
			: [{Name: item.name ?? item.label ?? 'QT', Enabled: item.enabled}])
		const names = qtStates.map(item => `${item.Name ?? 'QT'}${item.Enabled == null ? '' : item.Enabled ? ' 开' : ' 关'}`)
		return {
			...first,
			id: `qt-compact-${Math.round(group.startMs)}-${index}`,
			type: 'qt',
			kind: 'qt-control',
			classification: 'qt',
			name: 'QT',
			label: 'QT',
			timeMs: group.startMs,
			startMs: group.startMs,
			endMs: group.startMs + 2500,
			durationMs: 2500,
			eventCount: group.items.length,
			qtStates,
			qtSummary: names.join(' / '),
		}
	})
}

function qtCompactBucketMs(event = {}) {
	return Math.round(Number(event.timeMs ?? event.startMs ?? 0) / 1500) * 1500
}

function timelineQtEvents(track = {}) {
	const parsed = state.model.timelineRows.find(row => row.id === 'qt-potion')?.items ?? []
	const trackQt = (track.qt ?? []).map((event, index) => ({
		id: event.id ?? `track-qt-${index}`,
		type: event.type ?? 'qt',
		name: event.name ?? event.label ?? 'QT',
		label: event.label ?? event.name ?? 'QT',
		timeMs: Number(event.timeMs ?? event.startMs ?? 0),
		startMs: Number(event.startMs ?? event.timeMs ?? 0),
		endMs: Number(event.endMs ?? event.timeMs ?? event.startMs ?? 0) || Number(event.timeMs ?? event.startMs ?? 0) + 2500,
		durationMs: Number(event.durationMs ?? 2500),
		classification: event.classification ?? 'qt',
		kind: event.kind ?? 'qt-control',
		source: event.source ?? 'timeline',
		actionId: event.actionId,
		iconUrl: event.iconUrl ?? '',
		qtStates: event.qtStates ?? [],
		enabled: event.enabled,
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
	}))
	return uniqueTimelineEvents([...parsed.map(parsedTimelineItemToEvent), ...trackQt])
}

function limitVisibleTimelineRowItems(row) {
	const limits = {
		'output-actions': 220,
		'mitigation-actions': 160,
		'burst-integration': 120,
		'qt-controls': 200,
		'acr-simulated': 420,
	}
	const limit = limits[row.id]
	if (!limit || row.html || row.keepWhenEmpty || (row.items ?? []).length <= limit) {
		return row
	}
	return {
		...row,
		items: row.items.slice(0, limit),
	}
}

function renderTimelineAxis(maxTime) {
	return timelineTicks(maxTime).map(tick => `
		<div class="xiva-tick ${tick.kind}" style="left:${timelinePercent(tick.ms, maxTime)}%">
			${tick.label ? `<span>${tick.label}</span>` : ''}
		</div>
	`).join('')
}

function renderTimelineDragGuide() {
	return `
		<div class="timeline-drag-guide" aria-hidden="true">
			<div class="timeline-drag-guide-line"></div>
			<div class="timeline-drag-guide-bubble">
				<strong data-guide-phase>全部</strong>
				<span data-guide-time>0:00</span>
				<small data-guide-absolute></small>
			</div>
			<div class="timeline-drag-guide-delta" data-guide-delta></div>
		</div>
	`
}

function renderTimelineRow(row, maxTime, timelineWidth = 0) {
	const rowClass = row.groupId === 'boss' ? 'boss-row' : ''
	const rowLabel = renderTimelineRowLabel(row)
	if (row.html) {
		return `
			<div class="xiva-label ${row.accent} ${rowClass}">
				${rowLabel}
			</div>
			<div class="xiva-track xiva-row-track ${row.accent} ${rowClass} focus-add-track" data-row-id="${row.id}" data-drop-lane="${timelineDropLaneForRow(row)}">
				${row.html}
			</div>
		`
	}
	const items = assignTimelineLanes(row.items, {
		durationMs: maxTime,
		trackWidthPx: timelineWidth,
		minVisualWidthPx: row.groupId === 'boss' ? BOSS_CAST_MIN_VISUAL_WIDTH_PX : PLAYER_TIMELINE_ITEM_WIDTH_PX,
		minVisualGapPx: row.groupId === 'boss' ? BOSS_CAST_VISUAL_GAP_PX : PLAYER_TIMELINE_ITEM_GAP_PX,
		laneGapMs: 0,
	})
	const lanes = timelineLaneCount(items)
	return `
		<div class="xiva-label ${row.accent} ${rowClass}" style="--lane-count:${lanes}">
			${rowLabel}
		</div>
		<div class="xiva-track xiva-row-track ${row.accent} ${rowClass}" style="--lane-count:${lanes}" data-row-id="${row.id}" data-drop-lane="${timelineDropLaneForRow(row)}">
			${renderTimelineGrid(maxTime)}
			${items.map(item => renderTimelineItem(item, maxTime, row.bossIndex, timelineWidth)).join('')}
		</div>
	`
}

function timelineDropLaneForRow(row = {}) {
	if (row.id === 'output-actions') return 'output'
	if (row.id === 'mitigation-actions') return 'mitigation'
	if (row.id === 'burst-integration') return 'burst'
	if (row.id === 'qt-controls') return 'qt'
	return 'locked'
}

function timelineDropLaneForTarget(target) {
	return target?.closest?.('[data-drop-lane]')?.dataset.dropLane ?? 'locked'
}

function timelineDropLaneAtClientPoint(clientX, clientY) {
	const target = document.elementFromPoint(clientX, clientY)
	return timelineDropLaneForTarget(target)
}

function actionTimelineDropLane(actionId) {
	const action = actionById(actionId)
	const classification = classifyImportedAction(actionId, action?.name ?? '', 'player-action')
	if (classification.type === 'mitigation' || classification.type === 'healing' || requiresManualTargetChoice(action, classification.type)) {
		return 'mitigation'
	}
	if (classification.output || classification.type === 'damage' || classification.type === 'dot' || classification.type === 'output') {
		return 'output'
	}
	return 'output'
}

function canDropActionOnTimelineLane(actionId, dropLane) {
	if (dropLane === 'locked') {
		return false
	}
	return actionTimelineDropLane(actionId) === dropLane
}

function effectiveActionDropLane(actionId, dropLane) {
	return dropLane === 'locked' ? actionTimelineDropLane(actionId) : dropLane
}

function canDropBurstPackageOnTimelineLane(dropLane) {
	return dropLane === 'burst'
}

function canDropQtOnTimelineLane(dropLane) {
	return dropLane === 'qt'
}

function canDropPotionOnTimelineLane(dropLane) {
	return dropLane === 'burst'
}

function renderTimelineRowLabel(row) {
	if (row.labelHtml) {
		return row.labelHtml
	}
	if (row.groupId !== 'boss') {
		return `<span>${row.label}</span>`
	}
	return `${renderBossAvatar(row.sourceName ?? row.label, row.bossIndex)}<span class="boss-label-name">${row.label}</span>`
}

/* ============================================================
   Timeline visibility rail — a compact vertical "eye" strip
   that controls whole-row visibility on the main timeline.
   Each dot maps to one row in the current phase; clicking it
   hides/shows that row's label + track together. State lives
   in state.hiddenTimelineRows (an array of stable row keys)
   and survives phase switches.
   ============================================================ */

function currentVisualTimelineRows(model) {
	return buildVisualTimelineRows(model.tracks.expert)
}

function timelineRowVisibilityKey(row) {
	if (row.id) {
		return row.id
	}
	return `${row.groupId ?? 'row'}:${row.label ?? ''}`
}

function isTimelineRowHidden(row) {
	return state.hiddenTimelineRows.includes(timelineRowVisibilityKey(row))
}

function visibleTimelineRows(rows) {
	if (!state.hiddenTimelineRows.length) {
		return rows
	}
	return rows.filter(row => !isTimelineRowHidden(row))
}

function resetTimelineRowVisibility() {
	if (!state.hiddenTimelineRows.length) {
		return
	}
	state.hiddenTimelineRows = []
	saveHiddenTimelineRows()
}

function timelineRowAccentColor(row) {
	switch (row.accent) {
		case 'rose':
			return 'var(--boss)'
		case 'gold':
			return 'var(--gold)'
		case 'mint':
			return 'var(--mint)'
		case 'orange':
			return 'var(--amber)'
		case 'sky':
			return 'var(--sky)'
		case 'violet':
			return 'var(--violet)'
		default:
			return 'var(--accent)'
	}
}

function renderVisibilityEyeIcon() {
	return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
}

function renderVisibilityEyeOffIcon() {
	return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
}

function renderTimelineVisibilityRail(rows) {
	const anyHidden = state.hiddenTimelineRows.length > 0
	const eyeTitle = anyHidden ? '全部显示' : '全部隐藏'
	const eyeIcon = anyHidden ? renderVisibilityEyeOffIcon() : renderVisibilityEyeIcon()
	const dots = rows
		.filter(row => row.id !== 'focus-add')
		.map(row => {
			const key = timelineRowVisibilityKey(row)
			const hidden = isTimelineRowHidden(row)
			const color = timelineRowAccentColor(row)
			const label = row.label || row.id
			const tooltip = hidden ? `显示 ${label}` : `隐藏 ${label}`
			return `<button type="button" class="timeline-visibility-dot ${hidden ? 'hidden' : ''}" style="--row-color:${color}" data-action="toggle-timeline-row" data-row-key="${escapeHtml(key)}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}" aria-pressed="${hidden ? 'true' : 'false'}"></button>`
		})
		.join('')
	return `
		<div class="timeline-visibility-rail" aria-label="时间轴图层">
			<button type="button" class="timeline-visibility-eye" data-action="toggle-all-timeline-rows" title="${eyeTitle}" aria-label="${eyeTitle}">${eyeIcon}</button>
			<span class="timeline-visibility-rail-divider" aria-hidden="true"></span>
			${dots}
		</div>
	`
}

function toggleTimelineRowVisibility(rowKey) {
	if (!rowKey) {
		return
	}
	const hidden = [...state.hiddenTimelineRows]
	const index = hidden.indexOf(rowKey)
	if (index === -1) {
		hidden.push(rowKey)
	} else {
		hidden.splice(index, 1)
	}
	state.hiddenTimelineRows = hidden
	saveHiddenTimelineRows()
	render()
}

function toggleAllTimelineRowVisibility(rows) {
	const currentKeys = rows
		.filter(row => row.id !== 'focus-add')
		.map(row => timelineRowVisibilityKey(row))
	if (state.hiddenTimelineRows.length > 0) {
		state.hiddenTimelineRows = []
	} else {
		state.hiddenTimelineRows = currentKeys
	}
	saveHiddenTimelineRows()
	render()
}

function renderTimelineGrid(maxTime) {
	const ticks = timelineTicks(maxTime).map(tick => `<i class="${tick.kind}" style="left:${timelinePercent(tick.ms, maxTime)}%"></i>`)
	return `<div class="xiva-grid">${ticks.join('')}</div>`
}

function renderTimelineItem(item, maxTime, bossIndex, timelineWidth = 0) {
const itemLabel = displayNameForAction(item)
const timelineLabel = item.timelineLabel || (itemLabel !== item.label ? item.label : '')
const rawStart = timelinePercent(item.startMs, maxTime)
const pointTypes = [`action`, `gcd`, `qt`, `potion`, `simulated-gcd`, `simulated-action`]
const isPointItem = pointTypes.includes(item.type) || item.type === `focus-tracker`
const readablePointItemWidthPx = 132
const maxPointLeftPercent = timelineWidth > 0 ? Math.max(0, 100 - readablePointItemWidthPx / timelineWidth * 100) : 98
const start = isPointItem ? Math.min(rawStart, maxPointLeftPercent) : rawStart
const endPercent = timelinePercent(item.endMs, maxTime)
const width = pointTypes.includes(item.type) ? null : Math.max(0, Math.min(Math.max(item.type === `cast` ? 0.18 : 0.45, endPercent - rawStart), 100 - start))
	const icon = renderTimelineIcon(item, itemLabel)
	const lane = Math.max(0, Number(item.lane ?? 0))
	const countBadge = item.eventCount > 1 ? `<b class="item-count">x${item.eventCount}</b>` : ``
	const isCast = item.type === `cast`
	const isDamage = item.type === `damage`
	const bossLaneTop = `calc(7px + ${lane} * 62px)`
	const damage = Number(item.damage ?? 0)
	const startTimeLabel = item.timeLabel ?? formatTime(item.startMs)
	const endTimeLabel = formatTime(item.endMs ?? item.startMs)
	const sourceKind = sourceClassForTimelineItem(item)
	const sourceBadge = renderTimelineSourceBadge(item)
	if (isCast) {
		const highDamageClass = damage >= 200000 ? 'high-damage' : ''
		const noDamageClass = damage <= 0 ? 'no-damage' : ''
		const tooltipParts = [itemLabel, timelineLabel ? `\u539f\u8f74\uff1a${timelineLabel}` : '', `${startTimeLabel}`, `${endTimeLabel}`, `${formatDamage(damage)}`].filter(Boolean)
		if (item.eventCount > 1) tooltipParts.push(`x${item.eventCount}`)
		const tooltip = tooltipParts.join(` / `)
		const bossColorClass = `boss-idx-${(bossIndex ?? 0) % 5}`
		return `
			<button class="xiva-item cast ${bossColorClass} ${highDamageClass} ${noDamageClass}" style="left:${start}%; top:${bossLaneTop}; ${width == null ? `` : `width:${width}%;`}" data-boss-idx="${bossIndex ?? 0}" title="${tooltip}">
				<span class="cast-main">
					<b class="cast-badge">读条</b>
					<span class="cast-name">${itemLabel}</span>
					<strong class="item-damage">${formatDamage(damage)}</strong>
				</span>
				<span class="cast-meta">
					<small class="cast-time">开始 ${startTimeLabel}</small>
					<em class="cast-start" aria-label="释放判定">判定</em>
					<small class="cast-resolve">${endTimeLabel}</small>
					<em class="cast-release">结束</em>
				</span>
				${countBadge}
			</button>
		`
	}
	if (isDamage) {
		const damageLabel = damage > 0 ? formatDamage(damage) : '0'
		const tooltip = [itemLabel, `判定 ${startTimeLabel}`, `伤害 ${damageLabel}`]
		if (item.eventCount > 1) tooltip.push(`x${item.eventCount}`)
		return `
			<button class="xiva-item damage boss-damage-card" style="left:${start}%; top:${bossLaneTop}; ${width == null ? `` : `width:${width}%;`}" title="${tooltip.join(' / ')}">
				<strong class="boss-damage-name">${itemLabel}</strong>
				<span class="boss-damage-meta">
					<small class="boss-damage-time">判定 ${startTimeLabel}</small>
					<b class="boss-damage-value">${damageLabel}</b>
				</span>
				${countBadge}
			</button>
		`
	}
	if (item.type === 'focus-tracker') {
		const eventLabel = item.eventLabel && item.eventLabel !== item.label ? ` / ${item.eventLabel}` : ''
		return `
			<button class="xiva-item focus-tracker focus-tracker-item" style="left:${start}%; top:calc(7px + ${lane} * 42px);" title="${item.label}${eventLabel} / ${startTimeLabel} / ${item.sourceLabel}">
				${renderIcon(item.label, item.iconUrl)}
				<span class="focus-tracker-name">${item.label}</span>
				<small class="focus-tracker-time">${startTimeLabel}</small>
				<em class="focus-tracker-source">${item.sourceLabel}</em>
			</button>
		`
	}
	if (item.type === 'burst-package') {
		const editableBurstPackage = canEditTimeline() && Boolean(item.manualId)
		const timeLabel = burstPackageTimeLabel(item, startTimeLabel)
		const absoluteLabel = burstPackageAbsoluteLabel(item)
		const absoluteText = absoluteLabel ? `<small class="burst-package-absolute">${absoluteLabel}</small>` : ''
		const adjustedLabel = hasMeaningfulCdAdjustment(item) ? `<em class="burst-package-adjusted">顺延 +${formatDuration(item.cdAdjustedMs)}</em>` : ''
		const tooltip = [
			item.label,
			`判定 ${timeLabel}`,
			absoluteLabel,
			hasMeaningfulCdAdjustment(item) ? `爆发窗口已顺延 +${formatDuration(item.cdAdjustedMs)}` : '',
			`${item.skillCount} 个技能`,
			item.sourceLabel,
			editableBurstPackage ? t('hint.draggableTime') : '',
		].filter(Boolean).join(' / ')
		return `
			<button class="xiva-item burst-package ${item.window === '120s' ? 'major' : 'minor'} ${editableBurstPackage ? 'editable' : 'locked'}" style="left:${start}%; top:calc(7px + ${lane} * 42px); ${width == null ? `` : `width:${width}%;`}" title="${tooltip}" draggable="${editableBurstPackage ? 'true' : 'false'}" ${item.manualId ? `data-manual-id="${item.manualId}"` : ''} data-source-kind="${sourceKind}" data-locate-event-key="${item.locateEventKey}">
				<strong>${item.label}</strong>
				<span class="burst-package-time">判定 ${burstPackageTimeLabel(item, startTimeLabel)}${absoluteText}</span>
				<small class="burst-package-count">${item.skillCount} 技能</small>
				<em class="burst-package-source">${item.sourceLabel}</em>
				${adjustedLabel}
				${editableBurstPackage ? `<b class="manual-grip">拖</b>${renderTimelineDeleteButton(item, editableBurstPackage)}` : ''}
			</button>
		`
	}
	if (item.qtSummary) {
		const tooltip = [`QT`, startTimeLabel, item.qtSummary].filter(Boolean).join(' / ')
		return `
			<button class="xiva-item ${item.type} qt-group source-${sourceKind}" style="left:${start}%; top:calc(7px + ${lane} * 42px);" title="${escapeHtml(tooltip)}" data-source-kind="${sourceKind}" data-locate-event-key="${item.locateEventKey}">
				${icon}
				${countBadge}
			</button>
		`
	}
	const damageBadge = isDamage || damage > 0 ? `<strong class="item-damage">${formatDamage(damage)}</strong>` : ``
	if (item.manualId) {
		const editable = canEditTimeline()
	const cdLabel = hasMeaningfulCdAdjustment(item) ? `${t('meta.queueCd')} +${formatDuration(item.cdAdjustedMs)}` : ''
	const tooltip = [itemLabel, timelineLabel ? `${t('meta.originalAxis')}${timelineLabel}` : '', cdLabel, startTimeLabel, editable ? t('hint.draggableTime') : ''].filter(Boolean).join(' / ')
		return `
			<button class="xiva-item ${item.type} editable-manual source-${sourceKind} ${editable ? 'editable' : 'locked'}" style="left:${start}%; top:calc(7px + ${lane} * 42px); ${width == null ? `` : `width:${width}%;`}" title="${tooltip}" draggable="${editable ? 'true' : 'false'}" data-manual-id="${item.manualId}" data-source-kind="${sourceKind}" ${item.actionId ? `data-action-id="${item.actionId}"` : ''} data-locate-event-key="${item.locateEventKey}">
				${icon}
				<span>${itemLabel}</span>
				<small>${startTimeLabel}</small>
				${damageBadge}
				${sourceBadge}
				${cdLabel ? `<em class="manual-cd-badge">${cdLabel}</em>` : ''}
				${editable ? `<b class="manual-grip">拖</b>${renderTimelineDeleteButton(item, editable)}` : ''}
			</button>
		`
	}
	const editableEvent = canEditTimeline() && Boolean(item.editableEventKey)
	return `
		<button class="xiva-item ${item.type} source-${sourceKind} ${editableEvent ? 'editable-timeline-event editable' : ''}" style="left:${start}%; top:calc(7px + ${lane} * 42px); ${width == null ? `` : `width:${width}%;`}" title="${[itemLabel, timelineLabel ? `${t('meta.originalAxis')}${timelineLabel}` : '', startTimeLabel, editableEvent ? t('hint.draggableTime') : ''].filter(Boolean).join(' / ')}" draggable="${editableEvent ? 'true' : 'false'}" data-source-kind="${sourceKind}" ${item.actionId ? `data-action-id="${item.actionId}"` : ''} data-locate-event-key="${item.locateEventKey}" ${item.editableEventKey ? `data-timeline-event-key="${item.editableEventKey}"` : ''}>
			${icon}
			<span>${itemLabel}</span>
			<small class="${isDamage ? `cast-time` : ``}">${startTimeLabel}</small>
			${damageBadge}
			${sourceBadge}
			${countBadge}
			${renderTimelineDeleteButton(item, editableEvent)}
		</button>
	`
}

function renderPendingTargetPickerOverlay(model) {
	if (!canEditTimeline() || !state.pendingTargetPicker) {
		return ''
	}
	const item = state.inserted.find(entry => entry.id === state.pendingTargetPicker)
	if (!item || item.target) {
		return ''
	}
	const options = targetOptionsForEvent(item).filter(option => option.value)
	if (!options.length) {
		return ''
	}
	const skillName = escapeHtml(displayNameForAction(item) || item.name || '')
	return `
		<div class="target-picker-popover" data-target-picker-overlay="${item.id}" role="dialog" aria-modal="false">
			<div class="target-picker-header">
				<strong>指定目标</strong>
				<span class="target-picker-skill">${skillName}</span>
				<button class="target-picker-close" data-action="close-target-picker" title="关闭" aria-label="关闭">×</button>
			</div>
			<div class="target-picker-options">
				${options.map(option => `
					<button class="target-picker-choice" data-action="choose-manual-target" data-manual-target-choice="${item.id}" data-target-value="${option.value}" title="指定给 ${escapeHtml(option.label)}">${escapeHtml(option.label)}</button>
				`).join('')}
			</div>
		</div>
	`
}

function positionTargetPickerOverlay() {
	const overlay = document.querySelector('[data-target-picker-overlay]')
	if (!overlay) {
		return
	}
	const manualId = overlay.dataset.targetPickerOverlay
	const skillEl = document.querySelector(`[data-manual-id="${manualId}"]`)
	if (!skillEl) {
		overlay.style.left = '50%'
		overlay.style.top = '120px'
		overlay.style.transform = 'translateX(-50%)'
		return
	}
	const rect = skillEl.getBoundingClientRect()
	const overlayWidth = overlay.offsetWidth
	const overlayHeight = overlay.offsetHeight
	const viewportWidth = window.innerWidth || 1280
	const viewportHeight = window.innerHeight || 720
	let left = rect.right + 12
	if (left + overlayWidth > viewportWidth - 16) {
		left = rect.left - overlayWidth - 12
		if (left < 16) {
			left = Math.max(16, Math.min(viewportWidth - overlayWidth - 16, rect.left))
		}
	}
	let top = rect.top
	if (top + overlayHeight > viewportHeight - 16) {
		top = Math.max(16, viewportHeight - overlayHeight - 16)
	}
	if (top < 16) {
		top = 16
	}
	overlay.style.left = `${Math.round(left)}px`
	overlay.style.top = `${Math.round(top)}px`
	overlay.style.transform = 'none'
}

function renderTimelineDeleteButton(item = {}, canDelete = false) {
	if (!canDelete) {
		return ''
	}
	if (item.manualId) {
		return `<i class="timeline-delete-button manual-remove" data-action="remove-manual-skill" data-manual-id="${item.manualId}" title="删除技能">×</i>`
	}
	if (item.editableEventKey) {
		return `<i class="timeline-delete-button manual-remove" data-action="remove-timeline-event" data-timeline-event-key="${item.editableEventKey}" title="删除技能">×</i>`
	}
	return ''
}

function renderTimelineIcon(item = {}, itemLabel = '') {
	if (item.kind === 'qt-control' || item.type === 'qt' || item.classification === 'qt') {
		return '<span class="skill-icon fallback qt-fallback" aria-hidden="true">QT</span>'
	}
	if (item.type === 'potion') {
		return renderPotionTimelineIcon(item)
	}
	const iconTypes = [`action`, `gcd`, `potion`, `simulated-gcd`, `simulated-action`, `mitigation`, `healing`]
	return iconTypes.includes(item.type) || item.type === `dot` ? renderIcon(itemLabel, item.iconUrl) : ``
}

function renderPotionTimelineIcon(item = {}) {
	return `<span class="skill-icon fallback potion-timeline-icon" aria-hidden="true" title="${escapeHtml(displayNameForAction(item))}">药</span>`
}

function hasMeaningfulCdAdjustment(event = {}) {
	return Number(event.cdAdjustedMs ?? 0) >= 1000
}

function burstPackageTimeLabel(item = {}, fallbackLabel = '') {
	if (state.phase !== 'all') {
		return fallbackLabel || formatTime(item.startMs ?? item.timeMs ?? 0)
	}
	return formatTime(item.timeMs ?? item.absoluteStartMs ?? item.startMs ?? 0)
}

function burstPackageAbsoluteLabel(item = {}) {
	if (state.phase === 'all') {
		return ''
	}
	const absoluteTimeMs = Number(item.timeMs ?? item.absoluteStartMs ?? item.startMs ?? 0)
	return `全局 ${formatTime(absoluteTimeMs)}`
}

function renderTimelineSourceBadge(item) {
	const label = sourceLabelForTimelineItem(item)
	return label ? `<em class="source-badge">${label}</em>` : ''
}

function sourceClassForTimelineItem(item) {
	if (item.type === 'simulated-gcd' || item.type === 'simulated-action' || item.simulated) {
		return 'acr'
	}
	if (item.type === 'mitigation') {
		return 'mitigation'
	}
	if (item.type === 'healing') {
		return 'healing'
	}
	if (item.type === 'dot') {
		return 'dot'
	}
	if (item.type === 'potion') {
		return 'potion'
	}
	if (item.manualId) {
		return 'editable'
	}
	return 'import'
}

function sourceLabelForTimelineItem(item) {
if (item.type === 'simulated-gcd' || item.type === 'simulated-action' || item.simulated) {
return t('source.acr')
}
if (item.type === 'mitigation') {
return t('category.mitigation')
}
if (item.type === 'healing') {
return t('category.healing')
}
if (item.type === 'dot') {
return 'DoT'
}
if (item.type === 'potion') {
return t('category.potion')
}
	return ''
}

function timelineItemForEvent(event, options = {}) {
	const durationMs = Number(event.durationMs ?? 0) > 0 ? Number(event.durationMs) : 1600
	const type = timelineEventType(event, options.defaultType ?? 'action')
	const label = displayNameForAction(event)
	return {
		id: event.id,
		type,
		label,
		timelineLabel: event.timelineLabel || (label !== event.name ? event.name : ''),
		startMs: Number(event.timeMs ?? event.startMs ?? 0),
		endMs: Number(event.timeMs ?? event.startMs ?? 0) + durationMs,
		timeLabel: formatTime(Number(event.timeMs ?? event.startMs ?? 0)),
		actionId: event.actionId,
		potency: event.potency ?? 0,
		iconUrl: event.iconUrl ?? '',
		output: Boolean(event.output),
		simulated: Boolean(options.simulated ?? event.simulated),
		durationMs,
		recastMs: event.recastMs ?? actionById(event.actionId)?.recastMs ?? 0,
		classification: event.classification,
		kind: event.kind,
		source: event.source,
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
		eventCount: event.eventCount ?? 1,
		qtStates: event.qtStates ?? [],
		qtSummary: event.qtSummary ?? '',
		manualId: event.manualId,
		editableEventKey: canEditTimelineItem(event) ? timelineEventEditKey(event) : '',
		locateEventKey: detailTimelineEventKey(event),
		cdAdjustedMs: event.cdAdjustedMs ?? 0,
		requestedTimeMs: event.requestedTimeMs ?? event.timeMs ?? event.startMs ?? 0,
	}
}

function canEditTimelineItem(event = {}) {
	return !event.manualId
		&& !event.simulated
		&& event.source !== 'KANO ACR'
		&& event.kind !== 'boss-cast'
		&& event.type !== 'cast'
		&& ['player-action', 'potion', 'qt-control'].includes(event.kind ?? 'player-action')
}

function timelineEventEditKey(event = {}) {
	return [
		event.id ?? '',
		event.actionId ?? '',
		event.name ?? event.label ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		event.kind ?? '',
		event.classification ?? event.type ?? '',
	].map(value => encodeURIComponent(String(value ?? ''))).join('::')
}

function detailTimelineEventKey(event = {}) {
	const actionId = event.actionId ?? actionByName(displayNameForAction(event))?.id ?? ''
	const timeMs = Math.round(Number(event.timeMs ?? event.startMs ?? 0))
	const kind = event.kind ?? event.classification ?? event.type ?? ''
	return [
		actionId,
		timeMs,
		kind,
	].map(value => encodeURIComponent(String(value ?? ''))).join('::')
}

function manualQueueEvents() {
	return normalizeManualQueue(state.inserted)
}

function fflogsComparisonEvents() {
	if (!state.model?.tracks?.expert) {
		return []
	}
	return uniqueComparisonEvents([
		...fflogsCurrentSimulationEvents(),
		...fflogsCurrentTimelineEvents(),
		...manualQueueEvents(),
	])
		.filter(isFflogsComparisonEvent)
		.map(fflogsComparisonEvent)
}

function fflogsCurrentSimulationEvents() {
	return fflogsAcrSimulationEvents(state.model.tracks.expert)
}

function fflogsAcrSimulationEvents(track = {}) {
	if (Array.isArray(track.simulated) && track.simulated.length) {
		return track.simulated
	}
	if (Array.isArray(state.model?.acrSimulation?.events) && state.model.acrSimulation.events.length) {
		return state.model.acrSimulation.events
	}
	return state.model?.damage?.events ?? []
}

function fflogsCurrentTimelineEvents() {
	const track = state.model?.tracks?.expert ?? {}
	return (track.player ?? [])
		.filter(event => !event.output && event.source !== 'KANO ACR' && !event.simulated)
}

function isFflogsComparisonEvent(event = {}) {
	if (!event || event.type === 'burst-package' || event.kind === 'boss-cast') {
		return false
	}
	if (event.kind === 'qt-control' || event.type === 'qt' || event.classification === 'qt') {
		return false
	}
	return Boolean(
		Number(event.actionId)
		|| event.output
		|| event.classification === 'damage'
		|| event.classification === 'output'
		|| event.classification === 'mitigation'
		|| event.classification === 'healing'
		|| event.classification === 'potion'
		|| event.kind === 'potion',
	)
}

function fflogsComparisonEvent(event = {}) {
	const action = actionById(event.actionId)
	const timeMs = Math.max(0, Math.round(Number(event.timeMs ?? event.startMs ?? 0)))
	const phase = event.phase ?? fflogsComparisonPhaseForTime(timeMs)
	return {
		...event,
		timeMs,
		requestedTimeMs: Number(event.requestedTimeMs ?? timeMs),
		phase,
		phaseStartMs: event.phaseStartMs ?? fflogsComparisonPhaseStartMs(phase),
		kind: event.kind ?? 'player-action',
		name: displayNameForAction(event),
		actionId: Number(event.actionId ?? 0) || '',
		source: event.source ?? (event.simulated ? 'ACR' : 'timeline'),
		classification: event.classification ?? action?.type ?? (event.output ? 'damage' : 'unknown'),
		output: Boolean(event.output ?? action?.output),
		potency: Number(event.potency ?? action?.potency ?? 0),
		count: Number(event.count ?? 1) || 1,
		iconUrl: event.iconUrl ?? action?.iconUrl ?? '',
		skillType: event.skillType ?? (action?.gcd ? 'GCD' : action?.category ?? ''),
		weave: event.weave ?? (action?.gcd ? 'gcd' : action ? 'ogcd' : undefined),
		simulated: Boolean(event.simulated),
	}
}

function uniqueComparisonEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = fflogsComparisonEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function fflogsComparisonEventKey(event = {}) {
	const timeMs = Math.round(Number(event.timeMs ?? event.startMs ?? 0))
	const id = String(event.id ?? '')
	if (id) {
		return `${id}|${timeMs}|${event.source ?? ''}`
	}
	return [
		event.actionId || event.name || event.label || '',
		timeMs,
		event.source ?? '',
		event.kind ?? event.type ?? '',
		event.classification ?? '',
	].join('|')
}

function fflogsComparisonPhaseForTime(timeMs) {
	const phases = phaseOptions(state.model?.bossTimeline?.source)
	const phase = phases.find(item => timeMs >= item.startMs && timeMs < item.endMs) ?? phases.at(-1)
	return phase?.label ?? '全局'
}

function fflogsComparisonPhaseStartMs(phaseLabel) {
	const phases = phaseOptions(state.model?.bossTimeline?.source)
	const phase = phases.find(item => item.label === phaseLabel || item.id === String(phaseLabel).toLowerCase())
	return phase?.startMs
}

function normalizeManualStateQueue() {
	state.inserted = normalizeManualQueue(state.inserted).map(({_queueIndex, ...event}) => event)
}

function normalizeManualQueue(events = [], baselineEvents = timelineCooldownBaselineEvents()) {
	const nextReadyByKey = new Map()
	let queueReadyMs = 0
	let gcdReadyMs = 0
	const baselines = baselineEvents
		.map((event, index) => ({
			...event,
			_queueIndex: index,
			isManual: false,
			requestedTimeMs: Number(event.timeMs ?? event.startMs ?? 0),
		}))
		.sort((left, right) => Number(left.requestedTimeMs ?? 0) - Number(right.requestedTimeMs ?? 0) || left._queueIndex - right._queueIndex)
	const manuals = events
		.map((event, index) => ({
			...event,
			_queueIndex: index,
			isManual: true,
			requestedTimeMs: Number(event.requestedTimeMs ?? event.timeMs ?? 0),
		}))
		.sort((left, right) => Number(left.requestedTimeMs ?? 0) - Number(right.requestedTimeMs ?? 0) || left._queueIndex - right._queueIndex)
	const normalizedManual = []
	let baselineIndex = 0
	const processBaseline = baseline => {
		const action = actionById(baseline.actionId)
		applyCooldownUsage({
			timeMs: Math.max(0, Math.round(Number(baseline.requestedTimeMs ?? baseline.timeMs ?? baseline.startMs ?? 0))),
			event: baseline,
			action,
			cooldownKey: manualCooldownKey(baseline, action),
			recastMs: manualActionRecastMs(baseline, action),
			lockMs: manualActionQueueLockMs(baseline, action),
			nextReadyByKey,
			setQueueReadyMs: value => {
				queueReadyMs = Math.max(queueReadyMs, value)
			},
			setGcdReadyMs: value => {
				gcdReadyMs = Math.max(gcdReadyMs, value)
			},
		})
	}
	const processBaselinesUpTo = timeMs => {
		while (baselineIndex < baselines.length && Number(baselines[baselineIndex].requestedTimeMs ?? 0) <= timeMs) {
			processBaseline(baselines[baselineIndex])
			baselineIndex += 1
		}
	}
	for (const event of manuals) {
		const action = actionById(event.actionId)
		const requestedTimeMs = Math.max(0, Math.round(Number(event.requestedTimeMs ?? event.timeMs ?? event.startMs ?? 0)))
		const cooldownKey = manualCooldownKey(event, action)
		const recastMs = manualActionRecastMs(event, action)
		const lockMs = manualActionQueueLockMs(event, action)
		processBaselinesUpTo(requestedTimeMs)
		const actualTimeMs = nextManualReadyTime({
			requestedTimeMs,
			event,
			action,
			cooldownKey,
			recastMs,
			queueReadyMs,
			gcdReadyMs,
			nextReadyByKey,
		})
		const normalized = {
			...event,
			timeMs: actualTimeMs,
			requestedTimeMs,
			cdAdjustedMs: Math.max(0, actualTimeMs - requestedTimeMs),
			cooldownKey,
			recastMs,
		}
		applyCooldownUsage({
			timeMs: actualTimeMs,
			event,
			action,
			cooldownKey,
			recastMs,
			lockMs,
			nextReadyByKey,
			setQueueReadyMs: value => {
				queueReadyMs = Math.max(queueReadyMs, value)
			},
			setGcdReadyMs: value => {
				gcdReadyMs = Math.max(gcdReadyMs, value)
			},
		})
		normalizedManual.push(normalized)
	}
	return normalizedManual.sort((left, right) => Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0) || Number(left._queueIndex ?? 0) - Number(right._queueIndex ?? 0))
}

function nextManualReadyTime({
	requestedTimeMs,
	event,
	action,
	cooldownKey,
	recastMs,
	queueReadyMs,
	gcdReadyMs,
	nextReadyByKey,
}) {
	if (event.type === 'burst-package') {
		return cooldownKey && recastMs > 0
			? Math.max(requestedTimeMs, Number(nextReadyByKey.get(cooldownKey) ?? 0))
			: requestedTimeMs
	}
	let actualTimeMs = Math.max(requestedTimeMs, queueReadyMs)
	if (isGcdAction(event, action)) {
		actualTimeMs = Math.max(actualTimeMs, gcdReadyMs)
	}
	if (cooldownKey && recastMs > 0) {
		actualTimeMs = Math.max(actualTimeMs, Number(nextReadyByKey.get(cooldownKey) ?? 0))
	}
	return actualTimeMs
}

function baselineConflictsWithManual(baseline = {}, manual = {}) {
	const baselineTimeMs = Math.max(0, Math.round(Number(baseline.requestedTimeMs ?? baseline.timeMs ?? baseline.startMs ?? 0)))
	if (baselineTimeMs < manual.actualTimeMs) {
		return true
	}
	if (baselineTimeMs < manual.actualTimeMs + manual.lockMs) {
		return true
	}
	const baselineAction = actionById(baseline.actionId)
	if (isGcdAction(manual.event, manual.action) && isGcdAction(baseline, baselineAction) && baselineTimeMs < manual.actualTimeMs + Math.max(manual.recastMs, 2500)) {
		return true
	}
	const baselineKey = manualCooldownKey(baseline, baselineAction)
	return Boolean(manual.cooldownKey && baselineKey === manual.cooldownKey && baselineTimeMs < manual.actualTimeMs + manual.recastMs)
}

function resolveActionIdByName(name) {
	if (!name) {
		return null
	}
	const db = state.model?.skillDatabase
	if (!db?.skills) {
		return null
	}
	const match = db.skills.find(skill => skill.name === name)
	return match?.id ?? null
}

function checkCooldownConflict(actionId, requestedTimeMs, options = {}) {
	const action = actionById(actionId)
	const resolvedActionId = Number(actionId) || resolveActionIdByName(action?.name)
	if (!resolvedActionId) {
		return {unknown: true, message: '缺少技能 ID，无法校验 CD'}
	}
	const cooldownKey = `action:${resolvedActionId}`
	const recastMs = manualActionRecastMs({actionId: resolvedActionId}, action)
	if (recastMs <= 0) {
		return null
	}
	const excludeId = options.excludeId
	const baselineEvents = timelineCooldownBaselineEvents()
	const allEvents = [
		...baselineEvents
			.filter(item => item.id !== excludeId)
			.filter(item => Number(item.timeMs ?? item.startMs ?? 0) <= requestedTimeMs)
			.map(event => ({
				id: event.id,
				actionId: event.actionId,
				timeMs: Number(event.timeMs ?? event.startMs ?? 0),
				source: event.source ?? 'import',
				name: event.name ?? event.label ?? '',
			})),
		...state.inserted
			.filter(item => item.id !== excludeId)
			.filter(item => Number(item.requestedTimeMs ?? item.timeMs ?? 0) <= requestedTimeMs)
			.map(item => ({
				id: item.id,
				actionId: item.actionId,
				timeMs: Number(item.requestedTimeMs ?? item.timeMs ?? 0),
				source: item.source ?? 'manual',
				name: item.name ?? '',
			})),
	]
	for (const event of allEvents) {
		const eventAction = actionById(event.actionId)
		const eventKey = manualCooldownKey({actionId: event.actionId}, eventAction)
		if (eventKey !== cooldownKey) {
			continue
		}
		const eventTimeMs = Number(event.timeMs)
		if (!Number.isFinite(eventTimeMs)) {
			continue
		}
		const readyAtMs = eventTimeMs + recastMs
		if (requestedTimeMs < readyAtMs) {
			const remainingSec = Math.ceil((readyAtMs - requestedTimeMs) / 1000)
			return {
				conflict: true,
				skillName: action?.name ?? `技能 ${resolvedActionId}`,
				lastTimeMs: eventTimeMs,
				lastSource: event.source,
				requestedTimeMs,
				remainingMs: readyAtMs - requestedTimeMs,
				readyAtMs,
				recastMs,
				message: `CD 冲突：${action?.name ?? `技能 ${resolvedActionId}`} 上次出现在 ${formatTime(eventTimeMs)}（${event.source}），当前 ${formatTime(requestedTimeMs)}，还差 ${remainingSec}s CD`,
			}
		}
	}
	return null
}

function timelineCooldownBaselineEvents() {
	if (!state.model?.tracks?.expert) {
		return []
	}
	const track = state.model.tracks.expert
	const simulatedEvents = state.showAcrSimulation
		? (track.simulated ?? state.model.acrSimulation?.events ?? [])
		: []
	return [
		...mainActionTimelineEvents(track.player ?? []),
		...(track.mitigation ?? []),
		...timelineQtEvents(track),
		...buildBurstPackageItems(track.burst ?? state.model.tracks.beginner?.burst ?? []),
		...simulatedEvents.filter(event => Number(event.actionId) && event.kind === 'player-action'),
	].filter(event => (event.type === 'burst-package' || Number(event.actionId)))
}

function applyCooldownUsage({
	timeMs,
	event,
	action,
	cooldownKey,
	recastMs,
	lockMs,
	nextReadyByKey,
	setQueueReadyMs,
	setGcdReadyMs,
}) {
	const usedAtMs = Math.max(0, Math.round(Number(timeMs ?? 0)))
	setQueueReadyMs(usedAtMs + lockMs)
	if (isGcdAction(event, action)) {
		setGcdReadyMs(usedAtMs + Math.max(recastMs, 2500))
	}
	if (cooldownKey && recastMs > 0) {
		nextReadyByKey.set(cooldownKey, Math.max(Number(nextReadyByKey.get(cooldownKey) ?? 0), usedAtMs + recastMs))
	}
}

function isGcdAction(event = {}, action = null) {
	return Boolean(action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD')
}

function timelineFunctionalLane(event = {}) {
	if (event.kind === 'qt-control' || event.classification === 'qt' || event.type === 'qt') {
		return 'qt'
	}
	if (event.type === 'burst-package') {
		return 'burst'
	}
	if (isPotionTimelineEvent(event) || isBurstTimelineEvent(event)) {
		return 'burst'
	}
	if ((isCoverageTimelineEvent(event) || event.targetRequired) && !isOutputTimelineEvent(event)) {
		return 'mitigation'
	}
	return 'output'
}

function timelineEventType(event = {}, fallbackType = 'action') {
	if (event.kind === 'qt-control' || event.type === 'qt' || event.classification === 'qt') {
		return 'qt'
	}
	if (isPotionTimelineEvent(event)) {
		return 'potion'
	}
	if (isDotTimelineEvent(event)) {
		return 'dot'
	}
	if ((isCoverageTimelineEvent(event) || event.targetRequired) && !isOutputTimelineEvent(event)) {
		return event.classification === 'healing' ? 'healing' : 'mitigation'
	}
	if (isGcdAction(event, actionById(event.actionId))) {
		return event.simulated ? 'simulated-gcd' : 'gcd'
	}
	return fallbackType
}

function isOutputTimelineEvent(event = {}) {
	return Boolean(
		event.output
		|| event.potency > 0
		|| event.classification === 'damage'
		|| event.classification === 'output'
		|| event.type === 'damage'
		|| event.type === 'output'
		|| isDotTimelineEvent(event)
		|| isInsertOutputOverride(event)
	)
}

function isDotTimelineEvent(event = {}) {
	return event?.classification === 'dot' || event?.type === 'dot'
}

function isPotionTimelineEvent(event = {}) {
	return event.kind === 'potion'
		|| event.type === 'potion'
		|| event.classification === 'potion'
		|| /爆发药/.test(`${event.name ?? ''} ${event.label ?? ''} ${event.timelineLabel ?? ''}`)
}

function isBurstTimelineEvent(event = {}) {
	if (isPotionTimelineEvent(event)) {
		return true
	}
	const text = `${event.name ?? ''} ${event.label ?? ''} ${event.timelineLabel ?? ''}`
	return /爆发|爆发药|倾泻|弗雷|血乱|嗜血|留黑盾蓝|卸蓝|暗影使者|暗影锋/.test(text)
}

function parsedTimelineItemToEvent(item = {}) {
	const startMs = Number(item.startMs ?? item.timeMs ?? 0)
	return {
		...item,
		name: item.name ?? item.label,
		timeMs: startMs,
		durationMs: Number(item.durationMs ?? 0) || Math.max(0, Number(item.endMs ?? startMs) - startMs) || (item.type === 'qt' ? 2500 : 1600),
		kind: item.kind ?? (item.type === 'potion' ? 'potion' : 'qt-control'),
		classification: item.classification ?? item.type ?? 'qt',
		source: item.source ?? 'timeline',
	}
}

function uniqueTimelineEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = `${event.id ?? ''}|${event.actionId ?? ''}|${event.name ?? event.label ?? ''}|${event.timeMs ?? event.startMs ?? 0}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function uniqueTimelineDisplayEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = timelineDisplayEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function filterCooldownConflictingTimelineItems(events = []) {
	const nextReadyByAction = new Map()
	const result = []
	const ordered = sortTimelineItems(events)
	for (const event of ordered) {
		const actionId = Number(event.actionId)
		const timeMs = Number(event.startMs ?? event.timeMs ?? 0)
		const recastMs = Number(event.recastMs ?? actionById(actionId)?.recastMs ?? 0)
		if (!Number.isFinite(actionId) || !Number.isFinite(timeMs) || recastMs <= 0) {
			result.push(event)
			continue
		}
		const readyMs = Number(nextReadyByAction.get(actionId) ?? 0)
		if (timeMs < readyMs) {
			continue
		}
		nextReadyByAction.set(actionId, timeMs + recastMs)
		result.push(event)
	}
	return result
}

function timelineDisplayEventKey(event = {}) {
	if (event.manualId) {
		return `manual:${event.manualId}`
	}
	return [
		event.actionId ?? '',
		event.label ?? event.name ?? '',
		Math.round(Number(event.startMs ?? event.timeMs ?? 0)),
		event.type ?? '',
	].join('|')
}

function sortTimelineItems(items = []) {
	return [...items].sort((left, right) => Number(left.startMs ?? left.timeMs ?? 0) - Number(right.startMs ?? right.timeMs ?? 0))
}

function timelineManualItem(item, index) {
	const id = item.id ?? `manual-${index}`
	const durationMs = Number(item.durationMs ?? actionById(item.actionId)?.effectDurationMs ?? 0) || 1600
	if (item.type === 'burst-package') {
		return {
			id,
			manualId: id,
			type: 'burst-package',
			label: item.name ?? item.label ?? (item.window === '120s' ? '120 爆发' : '60 爆发'),
			window: item.window,
			startMs: item.timeMs ?? 0,
			endMs: (item.timeMs ?? 0) + Number(item.durationMs ?? 12000),
			timeLabel: formatTime(item.timeMs ?? 0),
			skillCount: Number(item.skillCount ?? burstSkillCount(item)),
			sourceLabel: item.sourceLabel ?? burstSourceLabel(item),
			source: item.source,
			kind: item.kind ?? 'burst-package',
			locateEventKey: detailTimelineEventKey(item),
			requestedTimeMs: item.requestedTimeMs ?? item.timeMs ?? 0,
			cdAdjustedMs: item.cdAdjustedMs ?? 0,
			recastMs: item.recastMs ?? manualActionRecastMs(item),
			cooldownKey: item.cooldownKey,
			phase: item.phase,
			phaseStartMs: item.phaseStartMs,
		}
	}
	return {
		id,
		manualId: id,
		type: manualTimelineItemType(item),
		label: item.name,
		startMs: item.timeMs ?? 0,
		endMs: (item.timeMs ?? 0) + durationMs,
		timeLabel: formatTime(item.timeMs ?? 0),
		potency: item.potency ?? 0,
		iconUrl: item.iconUrl ?? '',
		actionId: item.actionId,
		target: item.target,
		targetRequired: Boolean(item.targetRequired),
		targetMode: item.targetMode,
		targetDataId: item.targetDataId,
		output: Boolean(item.output),
		classification: item.classification,
		durationMs,
		source: item.source,
		kind: item.kind ?? 'player-action',
		locateEventKey: detailTimelineEventKey(item),
		cdAdjustedMs: item.cdAdjustedMs ?? 0,
		requestedTimeMs: item.requestedTimeMs ?? item.timeMs ?? 0,
		phase: item.phase,
		phaseStartMs: item.phaseStartMs,
	}
}

function manualTimelineItemType(item = {}) {
	return timelineEventType(item, isOutputTimelineEvent(item) ? 'action' : 'action')
}

function manualCooldownKey(event = {}, action = null) {
	if (event.type === 'burst-package') {
		return `burst-package:${event.window ?? '60s'}`
	}
	const actionId = event.actionId ?? action?.id
	if (!actionId) {
		return ''
	}
	if (action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD') {
		return 'gcd'
	}
	return `action:${actionId}`
}

function manualActionRecastMs(event = {}, action = null) {
	if (event.type === 'burst-package') {
		return burstWindowForTime(event, Number(event.timeMs ?? event.startMs ?? 0), 0) === '120s' ? 120000 : 60000
	}
	const recastMs = Number(event.recastMs ?? action?.recastMs ?? 0)
	if (recastMs > 0) {
		return recastMs
	}
	if (action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD') {
		return 2500
	}
	return 0
}

function manualActionQueueLockMs(event = {}, action = null) {
	if (event.type === 'burst-package') {
		return 0
	}
	if (action?.gcd || event.weave === 'gcd' || event.skillType === 'GCD') {
		return 2500
	}
	return 700
}

function burstWindowForTime(burst = {}, startMs = 0, index = 0) {
	const explicit = String(burst.window ?? '').toLowerCase()
	if (explicit === '120s' || explicit === '120') {
		return '120s'
	}
	if (explicit === '60s' || explicit === '60') {
		return '60s'
	}
	const label = `${burst.name ?? ''} ${burst.label ?? ''}`
	if (/120/.test(label)) {
		return '120s'
	}
	if (/60/.test(label)) {
		return '60s'
	}
	const timeMs = Number(startMs ?? burst.timeMs ?? burst.startMs)
	if (Number.isFinite(timeMs)) {
		return Math.round(timeMs / 60000) % 2 === 0 ? '120s' : '60s'
	}
	return Number(index) % 2 === 0 ? '120s' : '60s'
}

function burstLabelForWindow(window) {
	return window === '120s' ? '120 爆发' : '60 爆发'
}

function buildBurstPackageItems(bursts = []) {
	return bursts.map((burst, index) => {
		const startMs = Number(burst.timeMs ?? burst.startMs ?? index * 60000)
		const window = burstWindowForTime(burst, startMs, index)
		return {
			id: `burst-package-${index}`,
			type: 'burst-package',
			label: burstLabelForWindow(window),
			window,
			startMs,
			endMs: startMs + Number(burst.durationMs ?? 12000),
			timeLabel: formatTime(startMs),
			skillCount: burstSkillCount(burst),
			sourceLabel: burstSourceLabel(burst),
			expandedItems: Array.isArray(burst.items) ? burst.items : [],
		}
	})
}

function burstSkillCount(burst) {
	if (Array.isArray(burst.items)) {
		return burst.items.length
	}
	if (Array.isArray(burst.qt)) {
		return burst.qt.length
	}
	return 0
}

function burstSourceLabel(burst) {
	if (burst.sourceLabel) {
		return burst.sourceLabel
	}
	if (burst.source === 'manual') {
		return '用户手动'
	}
	if (burst.source === 'import' || burst.source === 'timeline') {
		return '导入'
	}
	return 'ACR'
}

function focusTrackerItemForEvent(event, skill, actionId, index) {
	const durationMs = Number(event.durationMs ?? 0) > 0 ? Number(event.durationMs) : 1600
	return {
		id: `focus-${actionId}-${index}`,
		type: 'focus-tracker',
		label: skill?.name ?? event.name ?? `技能 ${actionId}`,
		eventLabel: event.name,
		startMs: event.timeMs,
		endMs: event.timeMs + durationMs,
		timeLabel: formatTime(event.timeMs),
		actionId: event.actionId,
		iconUrl: event.iconUrl ?? skill?.iconUrl ?? '',
		sourceLabel: focusSourceLabel(event),
		durationMs,
	}
}

function focusSourceLabel(event) {
	if (event?.simulated || event?.source === 'KANO ACR') {
		return 'ACR 自动'
	}
	if (event?.source === 'manual') {
		return '用户手动'
	}
	return '导入时间轴'
}

function coverageItemType(event) {
	if (isDotTimelineEvent(event)) {
		return 'dot'
	}
	if (isCoverageTimelineEvent(event)) {
		return event.classification
	}
	return null
}

function isCoverageTimelineEvent(event) {
	return event?.classification === 'mitigation' || event?.classification === 'healing' || Boolean(event?.targetRequired)
}

function mainActionTimelineEvents(events = []) {
	return events.filter(event => event.kind === 'player-action' && !isCoverageTimelineEvent(event))
}

function timelinePercent(ms, maxTime) {
	return Math.min(100, Math.max(0, (ms / Math.max(1, maxTime)) * 100))
}

function timelineBaseWidth(maxTime) {
	return Math.max(1400, Math.ceil(maxTime / 1000) * 3)
}

function findTimeline(target) {
	return target instanceof Element ? target.closest('.xiva-timeline') : null
}

function findTimelineAtClientPoint(clientX, clientY) {
	const target = document.elementFromPoint(clientX, clientY)
	const directTimeline = findTimeline(target)
	if (directTimeline) {
		return directTimeline
	}
	return Array.from(document.querySelectorAll('.xiva-timeline')).find(timeline => {
		const rect = timeline.getBoundingClientRect()
		return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
	}) ?? null
}

function isTimelineInteractiveTarget(target) {
	return target instanceof Element && Boolean(target.closest('button, input, select, textarea, label, [data-action], [data-focus-skill], [data-panel], [data-phase], [data-toggle], [draggable="true"]'))
}

function hasTimelineDropData(dataTransfer) {
	return dataTransferHasType(dataTransfer, 'application/x-webtimeline-skill')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-manual')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-event')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-qt')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-burst')
		|| dataTransferHasType(dataTransfer, 'application/x-webtimeline-potion')
}

function dataTransferHasType(dataTransfer, type) {
	return Array.from(dataTransfer?.types ?? []).includes(type)
}

function scheduleTimelineDragGuide(timeline, clientX) {
	if (!timeline || !canEditTimeline()) {
		return
	}
	timelineDragGuidePending = {timeline, clientX}
	if (timelineDragGuideFrame != null) {
		return
	}
	timelineDragGuideFrame = requestAnimationFrame(flushTimelineDragGuide)
}

function flushTimelineDragGuide() {
	timelineDragGuideFrame = null
	const pending = timelineDragGuidePending
	timelineDragGuidePending = null
	if (!pending) {
		return
	}
	showTimelineDragGuide(pending.timeline, pending.clientX)
}

function showTimelineDragGuide(timeline, clientX) {
	const context = timelineDragGuideContext(timeline)
	if (!context || !canEditTimeline()) {
		return
	}
	const dropInfo = timelineDropInfoForClientX(clientX, timeline, context)
	const trackX = Math.max(0, clientX - context.trackLeft)
	const guideLeftPx = context.trackContentLeft + trackX
	const nearest = nearestTimelineGuideEventFromCache(context.events, dropInfo.absoluteTimeMs)
	const delta = renderTimelineGuideDelta(nearest, dropInfo.absoluteTimeMs, {
		guideLeftPx,
		trackWidth: context.trackWidth,
		maxTime: context.maxTime,
	})
	timeline.dataset.guideVisible = 'true'
	timeline.style.setProperty('--guide-left', `${Math.round(guideLeftPx)}px`)
	timeline.style.setProperty('--guide-delta-left', `${Math.round(delta.leftPx)}px`)
	if (context.phaseTarget) context.phaseTarget.textContent = dropInfo.phaseLabel ?? '全部'
	if (context.timeTarget) context.timeTarget.textContent = formatTime(dropInfo.phaseTimeMs ?? 0)
	if (context.absoluteTarget) context.absoluteTarget.textContent = dropInfo.phaseId === 'all' ? '' : `全局 ${formatTime(dropInfo.absoluteTimeMs)}`
	if (context.deltaTarget) {
		context.deltaTarget.textContent = delta.label
		context.deltaTarget.dataset.empty = delta.label ? 'false' : 'true'
	}
}

function hideTimelineDragGuide(timeline = null) {
	if (timelineDragGuideFrame != null) {
		cancelAnimationFrame(timelineDragGuideFrame)
		timelineDragGuideFrame = null
	}
	timelineDragGuidePending = null
	if (!timeline || timelineDragGuideCache?.timeline === timeline) {
		timelineDragGuideCache = null
	}
	const timelines = timeline ? [timeline] : Array.from(document.querySelectorAll('.xiva-timeline'))
	for (const item of timelines) {
		delete item.dataset.guideVisible
		item.querySelector('[data-guide-delta]')?.replaceChildren()
	}
}

function timelineDragGuideContext(timeline) {
	if (!timeline) {
		return null
	}
	const axis = timeline.querySelector('.xiva-axis')
	const axisScrollWidth = axis?.scrollWidth ?? 0
	const timelineScrollWidth = timeline.scrollWidth
	const cacheValid = timelineDragGuideCache
		&& timelineDragGuideCache.timeline === timeline
		&& timelineDragGuideCache.phase === state.phase
		&& timelineDragGuideCache.zoom === state.timelineZoom
		&& timelineDragGuideCache.axisScrollWidth === axisScrollWidth
		&& timelineDragGuideCache.timelineScrollWidth === timelineScrollWidth
	if (cacheValid) {
		const rect = timeline.getBoundingClientRect()
		const axisRect = axis?.getBoundingClientRect()
		timelineDragGuideCache.trackLeft = axisRect?.left ?? rect.left
		timelineDragGuideCache.trackContentLeft = (axisRect?.left ?? rect.left) - rect.left + timeline.scrollLeft
		return timelineDragGuideCache
	}
	const rect = timeline.getBoundingClientRect()
	const axisRect = axis?.getBoundingClientRect()
	const trackLeft = axisRect?.left ?? rect.left
	const rows = buildVisualTimelineRows(state.model.tracks.expert).filter(row => !row.html)
	const maxTime = timelineDurationMs(rows, state.model.bossTimeline?.source, state.phase)
	timelineDragGuideCache = {
		timeline,
		phase: state.phase,
		zoom: state.timelineZoom,
		axisScrollWidth,
		timelineScrollWidth,
		trackLeft,
		trackContentLeft: (axisRect?.left ?? rect.left) - rect.left + timeline.scrollLeft,
		trackWidth: axisScrollWidth || Math.max(1, timelineScrollWidth - (trackLeft - rect.left)),
		maxTime,
		events: timelineGuideEvents()
			.map(event => ({
				...event,
				guideTimeMs: Number(event.timeMs ?? event.startMs ?? 0),
			}))
			.sort((left, right) => left.guideTimeMs - right.guideTimeMs),
		phaseTarget: timeline.querySelector('[data-guide-phase]'),
		timeTarget: timeline.querySelector('[data-guide-time]'),
		absoluteTarget: timeline.querySelector('[data-guide-absolute]'),
		deltaTarget: timeline.querySelector('[data-guide-delta]'),
	}
	return timelineDragGuideCache
}

function nearestTimelineGuideEvent(timeMs) {
	return nearestTimelineGuideEventFromCache(timelineGuideEvents(), timeMs)
}

function nearestTimelineGuideEventFromCache(events = [], timeMs) {
	const targetTimeMs = Number(timeMs ?? 0)
	let nearest = null
	let nearestDeltaAbs = Infinity
	for (const event of events) {
		const eventTimeMs = Number(event.guideTimeMs ?? event.timeMs ?? event.startMs ?? 0)
		const deltaMs = targetTimeMs - eventTimeMs
		const deltaAbs = Math.abs(deltaMs)
		if (deltaAbs < nearestDeltaAbs) {
			nearest = {...event, deltaMs}
			nearestDeltaAbs = deltaAbs
		}
	}
	return nearest
}

function timelineGuideEvents() {
	const track = state.model?.tracks?.expert ?? {}
	const manual = manualQueueEvents()
	return [
		...mainActionTimelineEvents(track.player ?? []),
		...(track.mitigation ?? []),
		...timelineQtEvents(track),
		...manual,
		...buildBurstPackageItems(track.burst ?? []),
	]
		.filter(event => !event.simulated && event.kind !== 'boss-cast' && event.type !== 'cast' && event.type !== 'damage')
		.filter(event => Number.isFinite(Number(event.timeMs ?? event.startMs ?? 0)))
}

function renderTimelineGuideDelta(nearest, dropTimeMs, options = {}) {
	if (!nearest) {
		return {label: '', leftPx: 0}
	}
	const eventTimeMs = Number(nearest.timeMs ?? nearest.startMs ?? 0)
	const deltaMs = Math.round(Number(dropTimeMs ?? 0) - eventTimeMs)
	const absSeconds = Math.abs(deltaMs) / 1000
	const sign = deltaMs >= 0 ? '+' : '-'
	const label = `${displayNameForAction(nearest)} ${sign}${formatDeltaSeconds(absSeconds)}`
	const maxTime = Number(options.maxTime ?? 0) || timelineDurationMs(buildVisualTimelineRows(state.model.tracks.expert), state.model.bossTimeline?.source, state.phase)
	const eventViewMs = timelineGuideViewTimeMs(eventTimeMs)
	const eventLeftPx = timelinePercent(eventViewMs, maxTime) / 100 * Number(options.trackWidth ?? 0)
	const leftPx = (eventLeftPx + Number(options.guideLeftPx ?? eventLeftPx)) / 2
	return {
		label,
		leftPx,
	}
}

function timelineGuideViewTimeMs(absoluteTimeMs) {
	if (state.phase === 'all') {
		return Number(absoluteTimeMs ?? 0)
	}
	const phase = phaseOptions(state.model.bossTimeline?.source).find(item => item.id === state.phase)
	return Math.max(0, Number(absoluteTimeMs ?? 0) - Number(phase?.startMs ?? 0))
}

function locateDetailEventFromTimeline(eventKey) {
	const key = String(eventKey ?? '')
	if (!key) {
		return
	}
	const section = overviewSectionForEventKey(key)
	if (section) {
		state.panel = 'overview'
		if (section.id !== 'boss') {
			state.overviewVisibleSections[section.id] = true
		}
		setDetailCollapseOpen(`overview-${section.id}`, true)
		render()
		requestAnimationFrame(() => {
			const target = document.querySelector(`[data-detail-locate-event-key="${cssEscape(key)}"]`)
			if (target) {
				scrollDetailElementIntoView(target)
				flashDetailElement(target)
			}
		})
		return
	}
	setImportError(state.phase === 'all' ? '右侧总览里没有找到这个时间轴节点' : '当前 P 的右侧总览里没有找到这个时间轴节点')
}

function overviewSectionForEventKey(eventKey) {
	const key = String(eventKey ?? '')
	return overviewSections(state.model).find(section =>
		(section.events ?? []).some(event => detailTimelineEventKey(event) === key)
	) ?? null
}

function scrollDetailElementIntoView(target) {
	target.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'})
}

function locateTimelineEvent(eventKey) {
	const key = String(eventKey ?? '')
	if (!key) {
		return
	}
	const target = document.querySelector(`[data-locate-event-key="${cssEscape(key)}"]`)
	if (!target) {
		if (state.phase !== 'all') {
			state.phase = 'all'
			render()
			requestAnimationFrame(() => locateTimelineEvent(key))
			return
		}
		setImportError('当前时间轴视图里没有找到这个技能')
		return
	}
	const timeline = target.closest('.xiva-timeline')
	if (timeline) {
		scrollTimelineToElement(timeline, target)
	}
	target.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'})
	flashTimelineElement(target)
}

function locateTimelineEventInCurrentPhase(eventKey) {
	const key = String(eventKey ?? '')
	if (!key) {
		return
	}
	const target = document.querySelector(`[data-locate-event-key="${cssEscape(key)}"]`)
	if (!target) {
		setImportError(state.phase === 'all' ? '时间轴里没有找到这个技能' : '当前 P 没有这个技能')
		return
	}
	const timeline = target.closest('.xiva-timeline')
	if (timeline) {
		scrollTimelineToElement(timeline, target)
	}
	target.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'})
	flashTimelineElement(target)
}

function removeTimelineEvent(eventKey) {
	if (!canEditTimeline()) {
		return
	}
	const targets = editableTimelineEventTargets(eventKey)
	if (!targets.length) {
		setImportError('没有找到可删除的时间轴技能')
		render()
		return
	}
	for (const target of targets) {
		removeEditableTimelineEvent(target.event)
	}
	setImportStatus(`已删除 ${displayNameForAction(targets[0].event)}`)
	render()
}

function removeEditableTimelineEvent(event) {
	const track = state.model.tracks.expert
	removeEventFromArray(track.player, event)
	removeEventFromArray(track.mitigation, event)
	removeEventFromArray(track.qt, event)
	removeEventFromArray(track.boss, event)
	for (const burst of track.burst ?? []) {
		removeEventFromArray(burst.items, event)
		removeEventFromArray(burst.qt, event)
	}
	for (const panel of state.model.detailPanels ?? []) {
		removeEventFromArray(panel.events, event)
	}
	removeEventFromTimelineRows(event)
}

function removeEventFromArray(events = [], event) {
	if (!Array.isArray(events) || !event) {
		return false
	}
	const index = events.indexOf(event)
	if (index >= 0) {
		events.splice(index, 1)
		return true
	}
	return false
}

function removeEventFromTimelineRows(event) {
	for (const row of state.model?.timelineRows ?? []) {
		if (!Array.isArray(row.items)) {
			continue
		}
		row.items = row.items.filter(item => !timelineRowItemMatchesEvent(item, event))
	}
}

function timelineRowItemMatchesEvent(item = {}, event = {}) {
	const rowEvent = parsedTimelineItemToEvent(item)
	return timelineEventEditKey(rowEvent) === timelineEventEditKey(event)
		|| detailTimelineEventKey(rowEvent) === detailTimelineEventKey(event)
}

function scrollTimelineToElement(timeline, target) {
	const timelineRect = timeline.getBoundingClientRect()
	const targetRect = target.getBoundingClientRect()
	const targetCenter = targetRect.left - timelineRect.left + timeline.scrollLeft + targetRect.width / 2
	timeline.scrollTo({
		left: Math.max(0, targetCenter - timeline.clientWidth / 2),
		behavior: 'smooth',
	})
}

function flashTimelineElement(target) {
	target.classList.remove('timeline-locate-flash')
	void target.offsetWidth
	target.classList.add('timeline-locate-flash')
	window.setTimeout(() => target.classList.remove('timeline-locate-flash'), 2200)
}

function flashDetailElement(target) {
	target.classList.remove('detail-locate-flash')
	void target.offsetWidth
	target.classList.add('detail-locate-flash')
	window.setTimeout(() => target.classList.remove('detail-locate-flash'), 2200)
}

function flashTimelineTraceElement(target) {
	target.classList.remove('timeline-trace-flash')
	void target.offsetWidth
	target.classList.add('timeline-trace-flash')
	window.setTimeout(() => target.classList.remove('timeline-trace-flash'), 1800)
}

function flashRightSkillTraceButton(button) {
	if (!button) {
		return
	}
	const label = button.querySelector('.right-skill-state')
	const original = label ? label.textContent : ''
	button.classList.remove('right-skill-traced')
	void button.offsetWidth
	button.classList.add('right-skill-traced')
	if (label) {
		label.textContent = t('action.located')
	}
	window.setTimeout(() => {
		button.classList.remove('right-skill-traced')
		if (label) {
			label.textContent = original
		}
	}, 1600)
}

function traceSkillOnTimeline(actionIds, sourceButton = null) {
	const ids = Array.isArray(actionIds) ? actionIds.map(String).filter(Boolean) : [String(actionIds ?? '')].filter(Boolean)
	if (!ids.length) {
		setImportError('这个技能没有可定位的 ID')
		return
	}
	const primaryId = ids[0]
	state.lastTracedSkillId = primaryId
	const timeline = document.querySelector('.xiva-timeline')
	const selectors = ids.map(id => `[data-action-id="${cssEscape(id)}"], [data-timeline-action-id="${cssEscape(id)}"]`).join(', ')
	const allMatches = timeline
		? [...timeline.querySelectorAll(selectors)]
		: [...document.querySelectorAll(`.xiva-item[data-action-id="${cssEscape(primaryId)}"]`)]
	// Only consider items that are actually visible in the current phase view.
	const matches = allMatches.filter(el => el.offsetParent !== null)
	if (!matches.length) {
		const message = state.phase === 'all'
			? '时间轴里没有这个技能'
			: '当前 P 没有这个技能'
		setImportError(message)
		return
	}
	const first = matches[0]
	const matchTimeline = first.closest('.xiva-timeline')
	if (matchTimeline) {
		scrollTimelineToElement(matchTimeline, first)
	}
	first.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'})
	for (const target of matches) {
		flashTimelineTraceElement(target)
	}
	if (sourceButton) {
		flashRightSkillTraceButton(sourceButton)
	}
	window.setTimeout(() => {
		if (state.lastTracedSkillId === primaryId) {
			state.lastTracedSkillId = null
		}
	}, 2000)
}

function locateOverviewSection(sectionId) {
	const model = state.model
	if (!model) {
		return
	}
	const section = overviewSections(model).find(item => item.id === sectionId)
	if (!section || !section.events.length) {
		setImportError(state.phase === 'all' ? '这个分类暂无数据' : '当前 P 没有这个分类')
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		return
	}
	const selectors = [
		`[data-overview-section="${cssEscape(sectionId)}"]`,
		`[data-classification="${cssEscape(sectionId)}"]`,
		sectionId === 'boss' ? '[data-timeline-kind="boss-cast"], [data-timeline-type="cast"]' : '',
		sectionId === 'damage' ? '[data-classification="output"], [data-classification="damage"]' : '',
		sectionId === 'mitigation' ? '[data-classification="mitigation"], [data-classification="healing"]' : '',
		sectionId === 'potion' ? '[data-classification="potion"], [data-kind="potion"]' : '',
		sectionId === 'qt' ? '[data-classification="qt"], [data-kind="qt-control"], [data-type="qt"]' : '',
		sectionId === 'opener' ? '[data-classification="opener"]' : '',
		sectionId === 'burst' ? '[data-classification="burst"]' : '',
	].filter(Boolean).join(', ')
	const matches = selectors
		? [...timeline.querySelectorAll(selectors)].filter(el => el.offsetParent !== null)
		: []
	if (!matches.length) {
		setImportError(state.phase === 'all' ? '时间轴里没有这个分类' : '当前 P 没有这个分类')
		return
	}
	const first = matches[0]
	const matchTimeline = first.closest('.xiva-timeline')
	if (matchTimeline) {
		scrollTimelineToElement(matchTimeline, first)
	}
	first.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'})
	for (const target of matches) {
		flashTimelineTraceElement(target)
	}
}

function cssEscape(value) {
	return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&')
}

function formatDeltaSeconds(seconds = 0) {
	const rounded = Math.round(Number(seconds) * 10) / 10
	return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}s`
}

function canEditTimeline() {
	return state.editorMode === 'edit'
}

function insertFloatPlacement(pos = state.insertFloatPos) {
	const x = Number(pos?.x ?? 28)
	const y = Number(pos?.y ?? 520)
	const viewportWidth = window.innerWidth || 1280
	const viewportHeight = window.innerHeight || 720
	return {
		alignRight: x > viewportWidth - 760,
		alignUp: y > viewportHeight - 430,
	}
}

function loadInsertFloatPos() {
	try {
		const saved = JSON.parse(localStorage.getItem('webtimelineInsertFloatPos') ?? '{}')
		return clampInsertFloatPos({
			x: Number(saved.x ?? 28),
			y: Number(saved.y ?? 520),
		})
	} catch {
		return {x: 28, y: 520}
	}
}

function saveInsertFloatPos(pos) {
	localStorage.setItem('webtimelineInsertFloatPos', JSON.stringify(clampInsertFloatPos(pos)))
}

const HIDDEN_TIMELINE_ROWS_STORAGE_KEY = 'webtimelineHiddenTimelineRows'

function loadHiddenTimelineRows() {
	try {
		const saved = JSON.parse(localStorage.getItem(HIDDEN_TIMELINE_ROWS_STORAGE_KEY) ?? '[]')
		if (!Array.isArray(saved)) {
			return []
		}
		return saved.filter(item => typeof item === 'string' && item)
	} catch {
		return []
	}
}

function saveHiddenTimelineRows() {
	localStorage.setItem(HIDDEN_TIMELINE_ROWS_STORAGE_KEY, JSON.stringify(state.hiddenTimelineRows ?? []))
}

function clampInsertFloatPos(pos) {
	const maxX = Math.max(8, window.innerWidth - 92)
	const maxY = Math.max(8, window.innerHeight - 70)
	return {
		x: Math.round(Math.min(maxX, Math.max(8, Number(pos.x ?? 28)))),
		y: Math.round(Math.min(maxY, Math.max(8, Number(pos.y ?? 520)))),
	}
}

function startInsertFloatDrag(event) {
	insertFloatDrag = {
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
		originX: Number(state.insertFloatPos?.x ?? 28),
		originY: Number(state.insertFloatPos?.y ?? 520),
		dragging: false,
	}
}

function moveInsertFloat(event) {
	const deltaX = event.clientX - insertFloatDrag.startX
	const deltaY = event.clientY - insertFloatDrag.startY
	if (!insertFloatDrag.dragging && Math.hypot(deltaX, deltaY) > 3) {
		insertFloatDrag.dragging = true
	}
	if (!insertFloatDrag.dragging) {
		return
	}
	event.preventDefault()
	state.insertFloatPos = clampInsertFloatPos({
		x: insertFloatDrag.originX + deltaX,
		y: insertFloatDrag.originY + deltaY,
	})
	const float = document.querySelector('.insert-float')
	if (float) {
		float.style.left = `${state.insertFloatPos.x}px`
		float.style.top = `${state.insertFloatPos.y}px`
	}
}

function endInsertFloatDrag(event) {
	if (!insertFloatDrag || insertFloatDrag.pointerId !== event.pointerId) {
		return
	}
	if (insertFloatDrag.dragging) {
		suppressInsertFloatClick = true
		saveInsertFloatPos(state.insertFloatPos)
		setTimeout(() => {
			suppressInsertFloatClick = false
		}, 0)
	}
	insertFloatDrag = null
}

function canStartExistingTimelineEventDrag(timelineEvent, event) {
	return canEditTimeline()
		&& event.button === 0
		&& Boolean(timelineEvent?.dataset?.timelineEventKey)
		&& !event.target.closest('.timeline-delete-button, input, select, textarea, label')
}

function startExistingTimelineEventDrag(event, timelineEvent) {
	const rect = timelineEvent.getBoundingClientRect()
	existingTimelineEventDrag = {
		pointerId: event.pointerId,
		eventKey: timelineEvent.dataset.timelineEventKey,
		card: timelineEvent,
		startX: event.clientX,
		startY: event.clientY,
		offsetX: event.clientX - rect.left,
		offsetY: event.clientY - rect.top,
		width: rect.width,
		height: rect.height,
		label: timelineEvent.querySelector('span, strong')?.textContent?.trim() ?? timelineEvent.textContent?.trim() ?? '',
		dragging: false,
		ghost: null,
		dropTarget: null,
	}
}

function moveExistingTimelineEventDrag(event) {
	const deltaX = event.clientX - existingTimelineEventDrag.startX
	const deltaY = event.clientY - existingTimelineEventDrag.startY
	if (!existingTimelineEventDrag.dragging && Math.hypot(deltaX, deltaY) > 5) {
		existingTimelineEventDrag.dragging = true
		existingTimelineEventDrag.card.classList.add('is-pointer-dragging')
		existingTimelineEventDrag.ghost = createExistingTimelineEventDragGhost()
		document.body.classList.add('is-insert-skill-dragging')
	}
	if (!existingTimelineEventDrag.dragging) {
		return
	}

	event.preventDefault()
	positionExistingTimelineEventDragGhost(event)
	updateExistingTimelineEventDropTarget(findTimelineAtClientPoint(event.clientX, event.clientY))
	updateExistingTimelineEventDragPreview(event)
}

function endExistingTimelineEventDrag(event) {
	if (!existingTimelineEventDrag || existingTimelineEventDrag.pointerId !== event.pointerId) {
		return
	}
	const wasDragging = existingTimelineEventDrag.dragging
	const eventKey = existingTimelineEventDrag.eventKey
	if (wasDragging) {
		event.preventDefault()
	}
	cleanupExistingTimelineEventDrag(event, {suppressClick: wasDragging})
	if (wasDragging) {
		moveExistingTimelineEventAtClientPoint(eventKey, event.clientX, event.clientY)
	}
}

function cancelExistingTimelineEventDrag(event) {
	if (!existingTimelineEventDrag || existingTimelineEventDrag.pointerId !== event.pointerId) {
		return
	}
	cleanupExistingTimelineEventDrag(event, {suppressClick: existingTimelineEventDrag.dragging})
}

function cleanupExistingTimelineEventDrag(event, {suppressClick = false} = {}) {
	const card = existingTimelineEventDrag?.card
	card?.releasePointerCapture?.(event.pointerId)
	card?.classList.remove('is-pointer-dragging')
	existingTimelineEventDrag?.ghost?.remove()
	if (existingTimelineEventDrag?.dropTarget) {
		hideTimelineDragGuide(existingTimelineEventDrag.dropTarget)
	}
	existingTimelineEventDrag?.dropTarget?.classList.remove('is-skill-drop-target')
	document.body.classList.remove('is-insert-skill-dragging')
	existingTimelineEventDrag = null
	if (suppressClick) {
		suppressInsertSkillClick = true
		setTimeout(() => {
			suppressInsertSkillClick = false
		}, 0)
	}
}

function createExistingTimelineEventDragGhost() {
	const ghost = document.createElement('div')
	ghost.className = 'skill-drag-ghost'
	ghost.style.width = `${Math.round(existingTimelineEventDrag.width)}px`
	ghost.style.minHeight = `${Math.round(existingTimelineEventDrag.height)}px`
	ghost.innerHTML = renderDropTimePreview({
		label: existingTimelineEventDrag.label || '调整技能',
		overTimeline: false,
	})
	document.body.append(ghost)
	return ghost
}

function positionExistingTimelineEventDragGhost(event) {
	if (!existingTimelineEventDrag.ghost) {
		return
	}
	existingTimelineEventDrag.ghost.style.left = `${event.clientX - existingTimelineEventDrag.offsetX}px`
	existingTimelineEventDrag.ghost.style.top = `${event.clientY - existingTimelineEventDrag.offsetY}px`
}

function updateExistingTimelineEventDropTarget(target) {
	const timeline = target?.classList?.contains('xiva-timeline') ? target : findTimeline(target)
	if (timeline === existingTimelineEventDrag.dropTarget) {
		return
	}
	existingTimelineEventDrag.dropTarget?.classList.remove('is-skill-drop-target')
	existingTimelineEventDrag.dropTarget = timeline
	existingTimelineEventDrag.dropTarget?.classList.add('is-skill-drop-target')
	if (!timeline) {
		hideTimelineDragGuide()
	}
}

function updateExistingTimelineEventDragPreview(event) {
	if (!existingTimelineEventDrag?.ghost) {
		return
	}
	const timeline = findTimelineAtClientPoint(event.clientX, event.clientY)
	if (timeline) {
		scheduleTimelineDragGuide(timeline, event.clientX)
	}
	const info = dropTimeInfoForClientPoint(event.clientX, event.clientY, timelineDragGuideContext(timeline))
	existingTimelineEventDrag.ghost.innerHTML = renderDropTimePreview({
		label: existingTimelineEventDrag.label || '调整技能',
		...info,
	})
}

function canStartInsertSkillDrag(skillCard, event) {
	return canEditTimeline()
		&& event.button === 0
		&& skillCard.dataset.dragLocked !== 'true'
		&& Boolean(skillCard.dataset.dragSkill || skillCard.dataset.dragBurst || skillCard.dataset.dragQt || skillCard.dataset.dragPotion)
		&& !event.target.closest('button, input, select, textarea, label')
}

function startInsertSkillDrag(event, skillCard) {
	const rect = skillCard.getBoundingClientRect()
	insertSkillDrag = {
		pointerId: event.pointerId,
		dragType: skillCard.dataset.dragQt ? 'qt' : skillCard.dataset.dragBurst ? 'burst' : skillCard.dataset.dragPotion ? 'potion' : 'skill',
		actionId: skillCard.dataset.dragSkill,
		burstIndex: skillCard.dataset.dragBurst,
		qtIndex: skillCard.dataset.dragQt,
		potionId: skillCard.dataset.dragPotion,
		card: skillCard,
		startX: event.clientX,
		startY: event.clientY,
		offsetX: event.clientX - rect.left,
		offsetY: event.clientY - rect.top,
		width: rect.width,
		height: rect.height,
		label: skillCard.querySelector('strong')?.textContent?.trim() ?? '',
		dragging: false,
		ghost: null,
		dropTarget: null,
	}
}

function moveInsertSkillDrag(event) {
	const deltaX = event.clientX - insertSkillDrag.startX
	const deltaY = event.clientY - insertSkillDrag.startY
	if (!insertSkillDrag.dragging && Math.hypot(deltaX, deltaY) > 5) {
		insertSkillDrag.dragging = true
		insertSkillDrag.card.classList.add('is-pointer-dragging')
		insertSkillDrag.ghost = createInsertSkillDragGhost()
		document.body.classList.add('is-insert-skill-dragging')
	}
	if (!insertSkillDrag.dragging) {
		return
	}

	event.preventDefault()
	positionInsertSkillDragGhost(event)
	updateInsertSkillDropTarget(findTimelineAtClientPoint(event.clientX, event.clientY))
	updateInsertSkillDragPreview(event)
}

function endInsertSkillDrag(event) {
	if (!insertSkillDrag || insertSkillDrag.pointerId !== event.pointerId) {
		return
	}
	const wasDragging = insertSkillDrag.dragging
	const actionId = insertSkillDrag.actionId
	const burstIndex = insertSkillDrag.burstIndex
	const qtIndex = insertSkillDrag.qtIndex
	const potionId = insertSkillDrag.potionId
	const dragType = insertSkillDrag.dragType
	if (wasDragging) {
		event.preventDefault()
	}
	cleanupInsertSkillDrag(event, {suppressClick: wasDragging})
	if (wasDragging) {
		if (dragType === 'burst') {
			insertBurstPackageAtClientPoint(burstIndex, event.clientX, event.clientY)
		} else if (dragType === 'potion') {
			insertPotionAtClientPoint(potionId, event.clientX, event.clientY)
		} else if (dragType === 'qt') {
			insertQtAtClientPoint(qtIndex, event.clientX, event.clientY)
		} else {
			insertSkillAtClientPoint(actionId, event.clientX, event.clientY)
		}
	}
}

function cancelInsertSkillDrag(event) {
	if (!insertSkillDrag || insertSkillDrag.pointerId !== event.pointerId) {
		return
	}
	cleanupInsertSkillDrag(event, {suppressClick: insertSkillDrag.dragging})
}

function cleanupInsertSkillDrag(event, {suppressClick = false} = {}) {
	const card = insertSkillDrag?.card
	card?.releasePointerCapture?.(event.pointerId)
	card?.classList.remove('is-pointer-dragging')
	insertSkillDrag?.ghost?.remove()
	if (insertSkillDrag?.dropTarget) {
		hideTimelineDragGuide(insertSkillDrag.dropTarget)
	}
	insertSkillDrag?.dropTarget?.classList.remove('is-skill-drop-target')
	document.body.classList.remove('is-insert-skill-dragging')
	insertSkillDrag = null
	if (suppressClick) {
		suppressInsertSkillClick = true
		setTimeout(() => {
			suppressInsertSkillClick = false
		}, 0)
	}
}

function createInsertSkillDragGhost() {
	const ghost = document.createElement('div')
	ghost.className = 'skill-drag-ghost'
	ghost.style.width = `${Math.round(insertSkillDrag.width)}px`
	ghost.style.minHeight = `${Math.round(insertSkillDrag.height)}px`
	ghost.innerHTML = renderDropTimePreview({
		label: insertSkillDrag.label || '插入技能',
		overTimeline: false,
	})
	document.body.append(ghost)
	return ghost
}

function positionInsertSkillDragGhost(event) {
	if (!insertSkillDrag.ghost) {
		return
	}
	insertSkillDrag.ghost.style.left = `${event.clientX - insertSkillDrag.offsetX}px`
	insertSkillDrag.ghost.style.top = `${event.clientY - insertSkillDrag.offsetY}px`
}

function updateInsertSkillDropTarget(target) {
	const timeline = target?.classList?.contains('xiva-timeline') ? target : findTimeline(target)
	if (timeline === insertSkillDrag.dropTarget) {
		return
	}
	insertSkillDrag.dropTarget?.classList.remove('is-skill-drop-target')
	insertSkillDrag.dropTarget = timeline
	insertSkillDrag.dropTarget?.classList.add('is-skill-drop-target')
	if (!timeline) {
		hideTimelineDragGuide()
	}
}

function updateInsertSkillDragPreview(event) {
	if (!insertSkillDrag?.ghost) {
		return
	}
	const timeline = findTimelineAtClientPoint(event.clientX, event.clientY)
	if (timeline) {
		scheduleTimelineDragGuide(timeline, event.clientX)
	}
	const info = dropTimeInfoForClientPoint(event.clientX, event.clientY, timelineDragGuideContext(timeline))
	insertSkillDrag.ghost.innerHTML = renderDropTimePreview({
		label: insertSkillDrag.label || '插入技能',
		...info,
	})
}

function dropTimeInfoForClientPoint(clientX, clientY, context = null) {
	const timeline = context?.timeline ?? findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		return {overTimeline: false}
	}
	const phaseInfo = timelineDropInfoForClientX(clientX, timeline, context)
	return {
		overTimeline: true,
		timeline,
		...phaseInfo,
	}
}

function renderDropTimePreview(info = {}) {
	const label = escapeHtml(info.label || '插入技能')
	if (!info.overTimeline) {
		return `
			<span class="skill-drag-ghost-name">${label}</span>
			<span class="skill-drag-ghost-time">拖到时间轴上</span>
		`
	}
	const phaseLabel = escapeHtml(info.phaseLabel ?? '全部')
	const phaseTime = formatTime(info.phaseTimeMs ?? 0)
	const absoluteTime = formatTime(info.absoluteTimeMs ?? info.phaseTimeMs ?? 0)
	const absolute = info.phaseId === 'all' ? '' : `<span class="skill-drag-ghost-absolute">全局 ${absoluteTime}</span>`
	return `
		<span class="skill-drag-ghost-name">${label}</span>
		<span class="skill-drag-ghost-phase">${phaseLabel}</span>
		<span class="skill-drag-ghost-time">${phaseTime}</span>
		${absolute}
	`
}

function setTimelineZoom(nextZoom, anchorTimeline = null, viewportX = 0) {
	const zoom = clampTimelineZoom(nextZoom)
	const previousScrollWidth = anchorTimeline?.scrollWidth ?? 0
	const previousScrollLeft = anchorTimeline?.scrollLeft ?? 0
	state.timelineZoom = zoom
	localStorage.setItem('webtimelineTimelineZoom', String(zoom))
	timelineDragGuideCache = null

	for (const shell of document.querySelectorAll('.xiva-shell')) {
		const baseWidth = Number(shell.dataset.baseWidth ?? 0)
		if (!baseWidth) {
			continue
		}
		shell.dataset.zoom = zoom.toFixed(2)
		shell.style.setProperty('--timeline-width', `${Math.round(baseWidth * zoom)}px`)
	}

	if (anchorTimeline) {
		anchorTimeline.scrollLeft = scrollLeftForZoom({
			scrollLeft: previousScrollLeft,
			viewportX,
			previousScrollWidth,
			nextScrollWidth: anchorTimeline.scrollWidth,
		})
	}
}

function startTimelineDrag(timeline, event) {
	timelineDrag = {
		pointerId: event.pointerId,
		timeline,
		startX: event.clientX,
		startY: event.clientY,
		scrollLeft: timeline.scrollLeft,
		dragging: false,
	}
}

function endTimelineDrag(event) {
	if (!timelineDrag || (timelineDrag.pointerId != null && timelineDrag.pointerId !== event.pointerId)) {
		return
	}

	if (timelineDrag.pointerId != null) {
		timelineDrag.timeline.releasePointerCapture?.(event.pointerId)
	}
	timelineDrag.timeline.classList.remove('is-dragging')
	if (timelineDrag.dragging) {
		suppressTimelineClick = true
		setTimeout(() => {
			suppressTimelineClick = false
		}, 0)
	}
	timelineDrag = null
}

function endTimelinePinch() {
	if (!timelinePinch) {
		return
	}
	timelinePinch.timeline.classList.remove('is-zooming')
	timelinePinch = null
}

function renderPanelTabs(model) {
	const panels = [{id: 'overview', label: t('overview.title')}]
	normalizeDetailPanelSelection()
	return `
		<div class="panel-tabs">
			${panels.map(panel => `<button class="${state.panel === panel.id ? 'active' : ''}" data-panel="${panel.id}">${panel.label}</button>`).join('')}
		</div>
	`
}

function renderDetailPanel(model) {
	normalizeDetailPanelSelection()
	if (state.panel === 'overview') {
		return renderOverviewPanel(model)
	}
	const panel = model.detailPanels.find(item => item.id === state.panel)
	if (!panel) {
		return '<div class="detail-list"><p class="empty-state">' + t('detail.panelNotFound') + '</p></div>'
	}
	const events = detailPanelEvents(panel)
	const controls = panel?.id === 'damage' ? renderOutputSimulationControl() : ''
	return `
		<div class="detail-list">
			${renderDetailCollapse({
				id: panel.id,
				label: panel.title ?? panel.label,
				count: events.length,
				events,
				controls,
				open: isDetailCollapseOpen(panel.id),
				body: events.length
? events.map((event, index) => renderDetailEventRow(panel, event, index)).join('')
				: '<p class="empty-state">' + t('detail.noData') + '</p>',
			})}
			${renderManualEditor(panel.id)}
		</div>
	`
}

function normalizeDetailPanelSelection() {
	if (state.panel !== 'overview') {
		state.panel = 'overview'
	}
}

function detailPanelEvents(panel) {
	if (!panel) {
		return []
	}
	if (panel.id === 'damage') {
		return detailEventsForCurrentPhase(outputDetailEvents())
	}
	if (panel.id === 'mitigation') {
		return uniqueDetailDisplayEvents(detailEventsForCurrentPhase(uniqueDetailEvents([
			...(panel.events ?? []),
			...manualEventsForPanel('mitigation').map(detailManualEvent),
		])))
	}
	if (panel.id === 'potion') {
		return detailEventsForCurrentPhase(uniqueDetailEvents([
			...(panel.events ?? []),
			...manualEventsForPanel('potion').map(detailManualEvent),
		]))
	}
	if (panel.id === 'opener') {
		return openerDetailEvents(panel)
	}
	return detailEventsForCurrentPhase(panel.events ?? [])
}

function openerDetailEvents(panel) {
	if (!panel) {
		return []
	}
	return uniqueDetailEvents([
		...(panel.events ?? []).map(openerDetailEvent),
		...manualEventsForPanel('opener').map(detailManualEvent).map(openerDetailEvent),
	]).sort(compareDetailEvents)
}

function openerDetailEvent(event = {}) {
	return {
		...event,
		classification: event.classification ?? 'opener',
		opener: true,
	}
}

function outputDetailEvents() {
	const track = state.model?.tracks?.expert ?? {}
	const panel = state.model?.detailPanels?.find(item => item.id === 'damage')
	const importedPanelEvents = (panel?.events ?? [])
		.filter(event => !event.simulated && event.source !== 'KANO ACR')
		.filter(isOutputTimelineEvent)
	const importedTimelineEvents = mainActionTimelineEvents(track.player ?? [])
		.filter(event => timelineFunctionalLane(event) === 'output')
		.filter(isOutputTimelineEvent)
	const manual = manualEventsForPanel('damage').map(detailManualEvent)
	const simulated = state.showAcrSimulation
		? (track.simulated ?? state.model.acrSimulation?.events ?? []).filter(event => event.output)
		: []
	return uniqueDetailEvents([
		...importedPanelEvents,
		...importedTimelineEvents,
		...manual,
		...simulated,
	]).sort(compareDetailEvents)
}

function detailManualEvent(event) {
	return {
		...event,
		id: event.id,
		manualId: event.id,
		source: event.source ?? 'manual',
	}
}

function detailEventsForCurrentPhase(events = []) {
	return events
		.filter(detailEventInCurrentPhase)
		.sort(compareDetailEvents)
}

function detailEventInCurrentPhase(event = {}) {
	if (state.phase === 'all') {
		return true
	}
	const taggedPhase = normalizedDetailPhaseId(event.phase)
	if (taggedPhase) {
		return taggedPhase === state.phase
	}
	const window = currentPhaseEditWindow()
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	const endMs = timeMs + Number(event.durationMs ?? event.castDurationMs ?? 1600)
	return endMs > window.startMs && timeMs < window.endMs
}

function uniqueDetailEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = detailEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function uniqueDetailDisplayEvents(events = []) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = detailDisplayEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function detailDisplayEventKey(event = {}) {
	if (event.manualId) {
		return `manual:${event.manualId}`
	}
	return [
		event.actionId ?? '',
		event.name ?? event.label ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		event.classification ?? event.type ?? '',
	].join('|')
}

function detailEventKey(event = {}) {
	return [
		event.manualId ? `manual:${event.manualId}` : event.id ?? '',
		event.actionId ?? '',
		event.name ?? event.label ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		event.source ?? '',
		event.simulated ? 'simulated' : '',
	].join('|')
}

function compareDetailEvents(left, right) {
	return Number(left.timeMs ?? left.startMs ?? 0) - Number(right.timeMs ?? right.startMs ?? 0)
}

function detailEditKey(panel, event, index) {
	return [
		panel?.id ?? 'detail',
		event.manualId ?? event.id ?? index,
		event.actionId ?? '',
		Math.round(Number(event.timeMs ?? event.startMs ?? 0)),
		index,
	].map(value => encodeURIComponent(String(value ?? ''))).join('::')
}

function canEditDetailEvent(panel, event = {}) {
	if (event.type === 'burst-package' && !event.manualId) {
		return false
	}
	return panel?.id !== 'boss'
		&& event.kind !== 'boss-cast'
		&& event.type !== 'cast'
		&& event.source !== 'KANO ACR'
		&& !event.simulated
}

function shouldShowDetailTargetControl(panel, event = {}) {
	return panel?.id === 'mitigation' || isCoverageTimelineEvent(event) || Boolean(event.targetRequired)
}

function canEditDetailTarget(panel, event = {}) {
	return shouldShowDetailTargetControl(panel, event) && canEditDetailEvent(panel, event)
}

function renderDetailCollapse({id, label, count, events = [], body = '', controls = '', open = false}) {
	const expandedBody = body || `<p class="empty-state">${t('empty.noData')}</p>`
	return `
		<details class="detail-collapse" data-detail-collapse="${id}" ${open ? 'open' : ''}>
			<summary>
				<div class="detail-collapse-head">
					<div>
						<strong>${label}</strong>
						<span>${state.phase === 'all' ? '全局时间' : `${state.phase.toUpperCase()} 内时间`} / ${canEditTimeline() ? '编辑模式可调整手动技能' : '浏览模式只显示位置'}</span>
					</div>
					<span class="detail-count-badge overview-count">${count} 项</span>
				</div>
			</summary>
			<div class="detail-expanded-list">
				${controls}
				${expandedBody}
			</div>
		</details>
	`
}

function rememberOpenDetailCollapses() {
	state.openDetailCollapses = [...document.querySelectorAll('.detail-collapse[open]')]
		.map(detail => detail.dataset.detailCollapse)
		.filter(Boolean)
}

function isDetailCollapseOpen(id) {
	return state.openDetailCollapses.includes(String(id))
}

function setDetailCollapseOpen(id, isOpen) {
	const normalizedId = String(id ?? '').trim()
	if (!normalizedId) {
		return
	}
	const openIds = new Set(state.openDetailCollapses)
	if (isOpen) {
		openIds.add(normalizedId)
	} else {
		openIds.delete(normalizedId)
	}
	state.openDetailCollapses = [...openIds]
}

function renderOutputSimulationControl() {
	return `
		<div class="detail-sim-toggle">
			<span>${state.showAcrSimulation ? t('sim.outputOn') : t('sim.outputOff')}</span>
			<button class="sim-toggle ${state.showAcrSimulation ? 'active' : ''}" data-toggle="acr-simulation">${state.showAcrSimulation ? t('sim.hide') : t('sim.show')}</button>
		</div>
	`
}

function detailEventTimeLabel(event = {}) {
	if (event.window) {
		return event.window
	}
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	if (state.phase !== 'all') {
		return `${state.phase.toUpperCase()} ${formatTime(phaseRelativeMsForEvent(event))}`
	}
	const taggedPhase = normalizedDetailPhaseId(event.phase)
	if (taggedPhase && Number.isFinite(Number(event.phaseStartMs))) {
		return `${taggedPhase.toUpperCase()} ${formatTime(Math.max(0, timeMs - Number(event.phaseStartMs)))}`
	}
	return formatTime(timeMs)
}

function detailSourceLabel(event = {}) {
if (event.manualId || event.source === 'manual') {
return t('source.manual')
}
if (event.simulated || event.source === 'KANO ACR') {
return t('source.acr')
}
if (event.source === 'timeline') {
return t('source.timeline')
}
return event.source
}

function phaseRelativeMsForEvent(event = {}) {
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	if (state.phase === 'all') {
		return Math.max(0, timeMs)
	}
	const taggedPhase = normalizedDetailPhaseId(event.phase)
	if (taggedPhase === state.phase && Number.isFinite(Number(event.phaseStartMs))) {
		return Math.max(0, timeMs - Number(event.phaseStartMs))
	}
	const window = currentPhaseEditWindow()
	return Math.max(0, timeMs - window.startMs)
}

function currentPhaseEditWindow() {
	const phase = phaseOptions(state.model?.bossTimeline?.source).find(item => item.id === state.phase)
	if (state.phase !== 'all' && phase) {
		return {
			phaseId: phase.id,
			startMs: phase.startMs,
			endMs: phase.endMs,
			durationMs: Math.max(1000, phase.endMs - phase.startMs),
		}
	}
	const rows = buildVisualTimelineRows(state.model.tracks.expert).filter(row => !row.html)
	const durationMs = timelineDurationMs(rows, state.model.bossTimeline?.source, 'all')
	return {
		phaseId: 'all',
		startMs: 0,
		endMs: durationMs,
		durationMs,
	}
}

function clampMsToCurrentPhase(phaseTimeMs) {
	const window = currentPhaseEditWindow()
	const clampedPhaseTimeMs = Math.min(window.durationMs, Math.max(0, Math.round(Number(phaseTimeMs ?? 0))))
	const absoluteTimeMs = absoluteMsForPhaseTime(state.model.bossTimeline?.source, state.phase, clampedPhaseTimeMs)
	return {
		phaseId: window.phaseId,
		phaseTimeMs: clampedPhaseTimeMs,
		absoluteTimeMs: Math.min(window.endMs, Math.max(window.startMs, absoluteTimeMs)),
		phaseStartMs: window.startMs,
	}
}

function normalizedDetailPhaseId(phase) {
	const match = /^p?(\d+)$/i.exec(String(phase ?? '').trim())
	return match ? `p${match[1]}` : ''
}

function detailFocusActionId(event = {}, eventName = '') {
	const explicitId = String(event.actionId ?? '').trim()
	if (explicitId) {
		return explicitId
	}
	return String(actionByName(eventName)?.id ?? '').trim()
}

function renderDetailEventRow(panel, event, index) {
	const eventName = displayNameForAction(event)
	const timelineLabel = event.timelineLabel || (eventName !== event.name ? event.name : '')
	const timeLabel = detailEventTimeLabel(event)
	const meta = [timeLabel, timelineLabel ? `${t('meta.originalAxis')}${timelineLabel}` : '', event.skillType, detailSourceLabel(event), event.classification].filter(Boolean).join(' / ')
	const canEditTime = canEditTimeline() && canEditDetailEvent(panel, event)
	const canEditTarget = canEditTimeline() && canEditDetailTarget(panel, event)
	const timelineEventKey = detailTimelineEventKey(event)
	const seconds = Math.round(phaseRelativeMsForEvent(event) / 1000)
	const timeControl = canEditTimeline()
		? canEditTime
? `<label class="detail-time-field"><span>${state.phase === 'all' ? t('time.globalSec') : `${state.phase.toUpperCase()} ${t('time.phaseSec')}`}</span><input type="number" min="0" max="${Math.round(currentPhaseEditWindow().durationMs / 1000)}" step="1" value="${seconds}" data-detail-time="${detailEditKey(panel, event, index)}"></label>`
: `<span class="detail-locked-time" title="${t('detail.bossLocked')}">${timeLabel}</span>`
		: `<span class="detail-locked-time">${timeLabel}</span>`
	const targetControl = renderDetailTargetControl(panel, event, index, canEditTarget)
	return `
		<div class="detail-row ${targetControl ? 'has-target-detail-row' : ''} ${canEditTime ? 'editable-detail-row' : 'locked-detail-row'}" data-detail-locate-event-key="${timelineEventKey}">
			${renderIcon(eventName, event.iconUrl)}
			<div>
				<strong>${eventName}</strong>
				<span class="detail-meta">${meta}</span>
			</div>
			${timeControl}
			${targetControl}
			<div class="detail-actions">
				<button class="mini-button" data-action="locate-timeline-event" data-timeline-event-key="${timelineEventKey}" title="${t('detail.locateTitle')}" ${timelineEventKey ? '' : 'disabled'}>${t('action.track')}</button>
			</div>
		</div>
	`
}

function renderDetailTargetControl(panel, event, index, canEditTarget) {
	if (!shouldShowDetailTargetControl(panel, event)) {
		return ''
	}
	const options = targetOptionsForEvent(event)
		.map(option => `<option value="${option.value}" ${String(event.target ?? '') === option.value ? 'selected' : ''}>${option.label}</option>`)
		.join('')
	const warning = event.targetRequired && !event.target
		? '<span class="target-required-warning">' + t('detail.targetRequired') + '</span>'
		: ''
	return `
		<label class="detail-target-field">
			<span>${t('label.target')}</span>
			<select data-detail-target="${detailEditKey(panel, event, index)}" ${canEditTarget ? '' : 'disabled'}>
				${options}
			</select>
			${warning}
		</label>
	`
}

function renderManualEditor(panelId = 'all') {
	const events = detailEventsForCurrentPhase(manualEventsForPanel(panelId).map(detailManualEvent))
	const canEdit = canEditTimeline()
	return `
		<section class="manual-editor">
			<div class="manual-editor-heading">
				<div>
<strong>${t('manual.title')}</strong>
				<span>${canEdit ? t('manual.hintEdit') : t('manual.hintBrowse')}</span>
			</div>
			<small>${events.length} ${t('unit.items')}</small>
			</div>
			${events.length ? events.map(event => renderManualEditorRow(event, canEdit)).join('') : `<p class="empty-state">${t('empty.noManual')}</p>`}
		</section>
	`
}

function renderManualEditorRow(event, canEdit) {
	const eventName = displayNameForAction(event)
	const timelineLabel = event.timelineLabel || (eventName !== event.name ? event.name : '')
	const seconds = Math.round(phaseRelativeMsForEvent(event) / 1000)
	const cdLabel = hasMeaningfulCdAdjustment(event) ? `${t('meta.cdAdjusted')} +${formatDuration(event.cdAdjustedMs)}` : ''
	const meta = [timelineLabel ? `${t('meta.originalAxis')}${timelineLabel}` : '', manualClassificationLabel(event), event.source === 'manual' ? t('source.manual') : event.source, cdLabel].filter(Boolean).join(' / ')
	return `
		<div class="manual-edit-row">
			${renderIcon(eventName, event.iconUrl)}
			<div class="manual-edit-main">
				<strong>${eventName}</strong>
				<span>${formatTime(event.timeMs ?? 0)}${meta ? ` · ${meta}` : ''}</span>
			</div>
			<label class="manual-time-field">
				<span>${state.phase === 'all' ? t('time.globalSec') : `${state.phase.toUpperCase()} ${t('time.phaseSec')}`}</span>
				<input type="number" min="0" max="1200" step="1" value="${seconds}" data-manual-time="${event.id}" ${canEdit ? '' : 'disabled'}>
			</label>
			<div class="manual-edit-actions">
				<button class="mini-button" data-action="nudge-manual-skill" data-manual-id="${event.id}" data-delta-ms="-1000" ${canEdit ? '' : 'disabled'}>-1s</button>
				<button class="mini-button" data-action="nudge-manual-skill" data-manual-id="${event.id}" data-delta-ms="1000" ${canEdit ? '' : 'disabled'}>+1s</button>
				<button class="mini-button" data-action="duplicate-manual-skill" data-manual-id="${event.id}" ${canEdit ? '' : 'disabled'}>${t('action.duplicate')}</button>
				<button class="mini-button danger" data-action="remove-manual-skill" data-manual-id="${event.id}" ${canEdit ? '' : 'disabled'}>${t('action.delete')}</button>
			</div>
		</div>
	`
}

function targetOptions() {
	return [
		{value: '', label: t('target.placeholder')},
		{value: 'Target', label: t('target.boss')},
		{value: 'Self', label: t('target.self')},
		{value: 'TargetOfTarget', label: t('target.targetOfTarget')},
		{value: 'Party2', label: `${t('target.party')} 2`},
		{value: 'Party3', label: `${t('target.party')} 3`},
		{value: 'Party4', label: `${t('target.party')} 4`},
		{value: 'Party5', label: `${t('target.party')} 5`},
		{value: 'Party6', label: `${t('target.party')} 6`},
		{value: 'Party7', label: `${t('target.party')} 7`},
		{value: 'Party8', label: `${t('target.party')} 8`},
		{value: 'PartyMember2', label: 'PartyMember2'},
		{value: 'PartyMember3', label: 'PartyMember3'},
		{value: 'PartyMember4', label: 'PartyMember4'},
		{value: 'PartyMember5', label: 'PartyMember5'},
		{value: 'PartyMember6', label: 'PartyMember6'},
		{value: 'PartyMember7', label: 'PartyMember7'},
		{value: 'PartyMember8', label: 'PartyMember8'},
	]
}

function targetOptionsForEvent(event = {}) {
	const options = targetOptions()
	if (event.targetRequired || requiresManualTargetChoice(actionById(event.actionId), event.classification)) {
		return options.filter(option => option.value !== 'Target')
	}
	return options
}

function manualEventsForPanel(panelId) {
	const events = [...state.inserted].sort((left, right) => Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0))
	if (panelId === 'mitigation') {
		return events.filter(event => event.classification === 'mitigation' || event.classification === 'healing')
	}
	if (panelId === 'damage') {
		return events.filter(event => event.output || event.classification === 'damage' || event.classification === 'output')
	}
	if (panelId === 'potion') {
		return events.filter(event => event.classification === 'potion' || event.kind === 'potion' || /爆发药/.test(event.name ?? ''))
	}
	if (panelId === 'qt') {
		return events.filter(event => event.kind === 'qt-control' || event.type === 'qt' || event.classification === 'qt')
	}
	if (panelId === 'opener') {
		return events.filter(event => event.classification === 'opener' || event.opener === true)
	}
	return events
}

function manualClassificationLabel(event) {
if (event.classification === 'mitigation') return t('category.mitigation')
if (event.classification === 'healing') return t('category.healing')
if (event.classification === 'potion') return t('category.potion')
if (event.output || event.classification === 'damage' || event.classification === 'output') return t('category.output')
	return event.classification ?? ''
}

function requiresManualTargetChoice(action = null, classification = '') {
	const type = String(classification || action?.type || '').toLowerCase()
	if (['mitigation', 'healing', 'invuln'].includes(type)) {
		return true
	}
	const text = `${action?.name ?? ''} ${action?.category ?? ''} ${action?.skillType ?? ''}`
	return /无敌|减伤|治疗|回复|护盾|防护|支援|铁壁|雪仇|黑盾|至黑|行尸|暗影墙|暗黑布道|献奉|心关|干预|神祝祷|水流幕|庇护|礼仪之铃|天赐|医济|Oblation|Intervention|Kardia/i.test(text)
}

function defaultManualTargetForAction(action = null, classification = '') {
	if (requiresManualTargetChoice(action, classification)) {
		return ''
	}
	if (action?.output || classification === 'damage' || classification === 'dot' || classification === 'output') {
		return 'Target'
	}
	return ''
}

function renderOverviewPanel(model) {
	const sections = overviewSections(model)
	return `
		<div class="detail-list overview-panel right-workbench">
			<section class="right-card right-overview-card">
				<div class="overview-header">
					<h3>${t('overview.title')}</h3>
					<button class="overview-sim-toggle ${state.showAcrSimulation ? 'active' : ''}" data-toggle="acr-simulation">${state.showAcrSimulation ? t('sim.hide') : t('sim.show')}</button>
				</div>
				${renderOverviewSectionToggles()}
			</section>
			<div class="overview-list">
				${sections.map(section => renderOverviewSection(section)).join('')}
			</div>
		</div>
	`
}

function renderOverviewSection(section) {
	const open = isDetailCollapseOpen(`overview-${section.id}`)
	const eventCount = section.events.length
	const chevronSvg = open
		? '<svg class="overview-chevron-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
		: '<svg class="overview-chevron-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
	return `
		<div class="overview-section-wrapper${open ? ' expanded' : ''}">
			<button class="overview-row" data-overview-expand="${section.id}" title="${t('hint.traceSkill')}">
				<div class="overview-row-text">
					<strong>${section.label}</strong>
					<small>${overviewSectionSubtitle(section.id)}</small>
				</div>
				<span class="overview-row-count">${eventCount}</span>
				<span class="overview-row-chevron">${chevronSvg}</span>
			</button>
			${open ? renderOverviewExpandedList(section) : ''}
		</div>
	`
}

function renderOverviewExpandedList(section) {
	const events = section.events
	if (!events.length) {
		return `<div class="overview-expanded-list"><p class="overview-empty-state">${state.phase === 'all' ? t('empty.noData') : '当前 P 暂无数据'}</p></div>`
	}
	const rows = events.map((event, index) => {
		const eventName = displayNameForAction(event)
		const timeLabel = detailEventTimeLabel(event)
		const sourceLabel = detailSourceLabel(event)
		const targetLabel = event.target ? ` / ${event.target}` : ''
		const eventKey = detailTimelineEventKey(event)
		return `
			<button class="overview-event-row" data-overview-locate-event="${escapeHtml(eventKey)}" title="${t('hint.traceSkill')}">
				${renderIcon(eventName, event.iconUrl)}
				<div class="overview-event-info">
					<strong>${escapeHtml(eventName)}</strong>
					<small>${escapeHtml(timeLabel)} / ${escapeHtml(sourceLabel)}${escapeHtml(targetLabel)}</small>
				</div>
			</button>
		`
	}).join('')
	return `<div class="overview-expanded-list">${rows}</div>`
}

function renderOverviewSectionToggles() {
	return `
		<div class="overview-section-toggles" aria-label="${t('overview.ariaToggles')}">
			${OVERVIEW_SECTION_TOGGLES.map(item => `
				<label class="overview-section-toggle ${overviewSectionVisible(item.id) ? 'active' : ''}">
					<input type="checkbox" data-overview-section-toggle="${item.id}" ${overviewSectionVisible(item.id) ? 'checked' : ''}>
					<span>${t(item.labelKey, item.label)}</span>
				</label>
			`).join('')}
		</div>
	`
}

function renderRightSkillLibrary(track) {
	const groups = rightSkillGroups(insertSkillGroups(track))
		.filter(group => Array.isArray(group.skills) && group.skills.length > 0)
	if (!groups.length) {
		return ''
	}
	if (!groups.some(group => group.id === state.rightSkillCategory)) {
		state.rightSkillCategory = groups[0].id
	}
	const activeGroup = groups.find(group => group.id === state.rightSkillCategory) ?? groups[0]
	const skills = activeGroup.skills.slice(0, 8)
	return `
		<section class="right-card right-skill-library">
			<div class="insert-category-tabs right-category-tabs">
				${groups.map(group => `<button class="${group.id === activeGroup.id ? 'active' : ''}" data-right-skill-category="${group.id}">${group.label}<small>${group.skills.length}</small></button>`).join('')}
			</div>
			<div class="right-skill-list">
				${skills.map(event => renderRightSkillItem(event, activeGroup.id)).join('')}
			</div>
		</section>
	`
}

function rightSkillGroups(groups) {
	const overviewGroupIds = {
		damage: 'output',
		mitigation: 'mitigation',
		potion: 'potion',
		qt: 'qt',
		burst: 'burst',
	}
	const hiddenGroups = new Set(
		Object.entries(overviewGroupIds)
			.filter(([overviewId]) => overviewSectionVisible(overviewId))
			.map(([, groupId]) => groupId)
	)
	return groups.filter(group => group.id !== 'all' && !hiddenGroups.has(group.id))
}

function renderRightSkillItem(event, activeGroupId = 'all') {
	if (event.type === 'burst-insert') {
		return renderRightBurstItem(event)
	}
	if (event.type === 'potion-insert') {
		return renderRightPotionItem(event)
	}
	if (event.type === 'qt-insert') {
		return renderRightQtItem(event)
	}
	const actionId = String(event.actionId ?? '')
	const tagName = actionId ? 'button' : 'div'
	const typeAttr = actionId ? ' type="button"' : ''
	const relatedIds = Array.isArray(event.relatedActionIds) && event.relatedActionIds.length
		? event.relatedActionIds
		: (actionId ? [actionId] : [])
	const traceIdsAttr = relatedIds.length
		? ` data-action="trace-skill-on-timeline" data-trace-skill-id="${escapeHtml(actionId || relatedIds[0])}" data-trace-skill-ids="${escapeHtml(relatedIds.join(','))}"`
		: ''
	const occurrences = Number(event.occurrenceCount ?? 1)
	const countBadge = occurrences > 1 ? `<b class="right-skill-count">x${occurrences}</b>` : ''
	const titleParts = [actionId ? t('hint.traceSkill') : t('hint.noTrackableId')]
	if (relatedIds.length > 1) {
		titleParts.push(`ID: ${relatedIds.join(', ')}`)
	}
	return `
		<${tagName} class="right-skill-item"${typeAttr}${traceIdsAttr} data-skill-source="${event.sidebarType}" title="${escapeHtml(titleParts.join(' / '))}">
			${renderIcon(event.name, event.iconUrl)}
			<div>
				<strong>${escapeHtml(event.name)}</strong>
				<small>${escapeHtml(insertSkillCardMeta(event))}</small>
			</div>
			${countBadge}
			<em class="right-skill-state">${t('action.trace')}</em>
		</${tagName}>
	`
}

function renderRightBurstItem(event) {
	const count = burstInsertSkillNames(event).length
	const window = burstWindowForTime(event, Number(event.timeMs ?? event.startMs ?? 0), 0)
	return `
		<div class="right-skill-item burst passive">
			<span class="skill-icon fallback">${window === '120s' ? '120' : '60'}</span>
			<div>
				<strong>${escapeHtml(event.name ?? burstLabelForWindow(window))}</strong>
<small>${formatTime(event.timeMs)} / ${count} ${t('unit.items')}</small>
		</div>
		<em class="right-skill-state">${t('action.browse')}</em>
		</div>
	`
}

function renderRightPotionItem(event) {
	return `
		<div class="right-skill-item potion passive">
			<span class="skill-icon fallback potion-icon">${escapeHtml(potionAttributeLabel(event.attributeId))}</span>
			<div>
				<strong>${escapeHtml(event.label)}</strong>
<small>${escapeHtml(event.familyLabel)} / Lv.${event.level}</small>
		</div>
		<em class="right-skill-state">${t('action.browse')}</em>
		</div>
	`
}

function renderRightQtItem(event) {
	return `
		<div class="right-skill-item qt passive">
			<span class="skill-icon fallback qt-fallback">QT</span>
			<div>
				<strong>${escapeHtml(event.name)}</strong>
<small>${qtDraftEnabledFor(event) ? t('qt.on') : t('qt.off')} / ${formatTime(event.timeMs)}</small>
		</div>
		<em class="right-skill-state">${t('action.browse')}</em>
		</div>
	`
}

function overviewSectionVisible(id) {
return state.overviewVisibleSections[id] !== false
}

function overviewSectionSubtitle(id) {
	const phaseLabel = state.phase === 'all' ? t('phase.all') : state.phase.toUpperCase()
	if (id === 'boss') return `${phaseLabel} ${t('overview.boss')}`
	if (id === 'mitigation') return `${phaseLabel} ${t('overview.mitigation')}`
	if (id === 'damage') return `${phaseLabel} ${t('overview.damage')}`
	if (id === 'potion') return `${phaseLabel} ${t('overview.potion')}`
	if (id === 'opener') return `${phaseLabel} ${t('overview.opener')}`
	if (id === 'qt') return `${phaseLabel} ${t('overview.qt')}`
	if (id === 'burst') return `${phaseLabel} ${t('overview.burst')}`
	return ''
}

function toggleOverviewSection(id, visible = null) {
	if (!OVERVIEW_SECTION_TOGGLES.some(item => item.id === id)) {
		return
	}
	state.overviewVisibleSections[id] = visible == null ? !overviewSectionVisible(id) : Boolean(visible)
	render()
}

function overviewSections(model) {
	const bossEvents = (model.tracks.expert.boss ?? []).filter(event => event.kind === 'boss-cast' || event.type === 'cast')
	const mitigationPanel = model.detailPanels.find(panel => panel.id === 'mitigation')
	const potionPanel = model.detailPanels.find(panel => panel.id === 'potion')
	const openerPanel = model.detailPanels.find(panel => panel.id === 'opener')
	const burstEvents = detailEventsForCurrentPhase(buildBurstPackageItems(model.tracks.expert.burst ?? []))
	const sections = [
		{id: 'boss', label: t('overview.boss'), events: detailEventsForCurrentPhase(bossEvents)},
		{id: 'mitigation', label: t('overview.mitigation'), events: detailPanelEvents(mitigationPanel)},
		{id: 'damage', label: t('overview.damage'), events: detailEventsForCurrentPhase(outputDetailEvents())},
		{id: 'potion', label: t('overview.potion'), events: detailPanelEvents(potionPanel)},
		{id: 'opener', label: t('overview.opener'), events: openerDetailEvents(openerPanel)},
		{id: 'qt', label: t('overview.qt'), events: detailEventsForCurrentPhase(qtDetailEvents())},
		{id: 'burst', label: t('overview.burst'), events: burstEvents},
	]
	return sections.filter(section => overviewSectionVisible(section.id))
}

function renderBurstGroupsInDetailPanel(bursts) {
	const burstEvents = detailEventsForCurrentPhase(buildBurstPackageItems(bursts))
	const panel = virtualDetailPanel('burst', t('overview.burst'), burstEvents)
	return `
		<div class="detail-list burst-detail-list">
			${renderDetailCollapse({
				id: panel.id,
				label: panel.label,
				count: burstEvents.length,
				events: burstEvents,
				open: isDetailCollapseOpen('burst'),
				body: burstEvents.length
? burstEvents.map((event, index) => renderDetailEventRow(panel, event, index)).join('')
				: `<p class="empty-state">${t('empty.noBurstData')}</p>`
			})}
		</div>
	`
}

function renderQtDetailPanel() {
	const events = detailEventsForCurrentPhase(qtDetailEvents())
	const panel = virtualDetailPanel('qt', t('detail.qtControl'), events)
	return `
		<div class="detail-list qt-detail-list">
			${renderDetailCollapse({
				id: panel.id,
				label: panel.label,
				count: events.length,
				events,
				open: isDetailCollapseOpen('qt'),
				body: events.length
					? events.map((event, index) => renderDetailEventRow(panel, event, index)).join('')
					: `<p class="empty-state">${t('empty.noQtBurst')}</p>`,
			})}
			${renderManualEditor('qt')}
		</div>
	`
}

function qtDetailEvents() {
	const qtEvents = editableQtEvents()
	const manualQtEvents = manualEventsForPanel('qt').map(detailManualEvent)
	return uniqueDetailEvents([
		...qtEvents,
		...manualQtEvents,
	]).sort(compareDetailEvents)
}

function editableQtEvents() {
	return (state.model.tracks.expert.qt ?? []).map(normalizeEditableQtEvent)
}

function normalizeEditableQtEvent(event = {}, index = 0) {
	const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
	const durationMs = Number(event.durationMs ?? 2500)
	event.id ??= `track-qt-${index}`
	event.type ??= 'qt'
	event.kind ??= 'qt-control'
	event.name ??= event.label ?? 'QT 控制'
	event.label ??= event.name
	event.timeMs = timeMs
	event.startMs = Number(event.startMs ?? timeMs)
	event.endMs = Number(event.endMs ?? timeMs + durationMs)
	event.durationMs = durationMs
	event.classification ??= 'qt'
	event.source ??= 'timeline'
	return event
}

function virtualDetailPanel(id, label, events = []) {
	return {id, label, events, virtual: true}
}

function renderFocusSkillModal(model) {
	if (!state.showFocusPicker) {
		return ''
	}
	const selectedJob = model.acrDatabase.jobs.find(job => job.id === state.job) ?? model.acrDatabase.jobs[0]
	const query = normalizeSearchText(state.focusQuery)
	const groups = groupedFocusCandidates(query)
	return `
		<div class="modal-backdrop" role="dialog" aria-modal="true">
			<section class="modal-panel focus-skill-modal">
				<div class="modal-header">
					<div>
<p class="eyebrow">${t('focus.eyebrow')}</p>
					<h3>${selectedJob?.name ?? state.job} ${t('action.addFocus')}</h3>
					<p class="focus-tracker-help">${t('focus.help')}</p>
				</div>
				<button class="mini-button" data-action="close-focus-picker">${t('action.close')}</button>
			</div>
			<input class="modal-search" data-field="focus-query" value="${escapeHtml(state.focusQuery)}" placeholder="${t('focus.searchPlaceholder')}">
				${renderFocusSkillSection({
					id: 'current-job',
title: t('focus.currentJob'),
				description: `${selectedJob?.name ?? state.job} ${t('focus.currentJob')}`,
					skills: groups.current,
					open: true,
				})}
				<details class="focus-skill-section other-skills">
					<summary>
						<span>
							<strong>${t('focus.other')}</strong>
							<small>${t('focus.otherDesc')}</small>
						</span>
						<em>${groups.other.length} ${t('focus.countSuffix')}</em>
					</summary>
					${renderFocusSkillGrid(groups.other, 'other-skills')}
				</details>
			</section>
		</div>
	`
}

function renderFocusSkillSection({id, title, description, skills}) {
	return `
		<section class="focus-skill-section" data-focus-section="${id}">
			<div class="focus-skill-section-heading">
				<span>
					<strong>${title}</strong>
					<small>${description}</small>
				</span>
				<em>${skills.length} ${t('focus.countSuffix')}</em>
			</div>
			${renderFocusSkillGrid(skills, id)}
		</section>
	`
}

function renderFocusSkillGrid(skills, sectionId) {
	return `
		<div class="focus-skill-grid" data-focus-section="${sectionId}">
			${skills.map(skill => renderFocusSkillOption(skill)).join('') || `<p class="empty-state">${t('empty.noSkill')}</p>`}
		</div>
	`
}

function renderFocusSkillOption(skill) {
	const tracked = state.focusedSkills.includes(String(skill.id))
	const occurrences = timelineEventsForAction(skill.id)
	return `
		<button class="focus-skill-option ${tracked ? 'active' : ''}" data-focus-skill="${skill.id}">
			${renderIcon(skill.name, skill.iconUrl)}
			<span>
				<strong>${skill.name}</strong>
				<small>${skill.id} / ${skill.jobName || skill.job || t('focus.universal')} / ${t('focus.occurrences')} ${occurrences.length} ${t('focus.timesSuffix')}</small>
			</span>
			<em>${tracked ? t('action.tracked') : '+'}</em>
		</button>
	`
}

function renderInsertTool() {
	return `
		<div class="insert-tool compact insert-command-bar">
			<input data-field="skill-id" value="${escapeHtml(state.insertSkillId)}" placeholder="${t('insert.skillIdPlaceholder')}" aria-label="${t('insert.skillIdPlaceholder')}">
			<span class="insert-id-preview" data-insert-id-preview>${escapeHtml(insertIdPreviewName())}</span>
			<button class="primary insert-command-submit" data-action="insert-skill"><span aria-hidden="true">↵</span>${t('action.insert')}</button>
		</div>
	`
}

function renderToolPanel(model) {
	return `
		<section class="tool-panel" aria-label="${t('tool.eyebrow')}">
			<div class="section-heading tool-heading">
				<div>
					<p class="eyebrow">${t('tool.eyebrow')}</p>
					<h3>${t('tool.title')}</h3>
				</div>
				<span class="status-pill">${t('tool.statusPill')}</span>
			</div>
			${renderFflogsComparisonPanel(model)}
			<div class="tool-grid">
			<section class="sim-panel">
				<div class="section-heading">
					<div>
<p class="eyebrow">${t('tool.simEyebrow')}</p>
					<h3>${t('tool.simTitle')}</h3>
				</div>
				<select data-field="luck">
					<option value="average" ${state.luck === 'average' ? 'selected' : ''}>${t('tool.luckAverage')}</option>
					<option value="lucky" ${state.luck === 'lucky' ? 'selected' : ''}>${t('tool.luckLucky')}</option>
					<option value="low" ${state.luck === 'low' ? 'selected' : ''}>${t('tool.luckLow')}</option>
				</select>
			</div>
			<label class="slider">${t('tool.critRate')} <input data-field="critRate" type="range" min="0" max="60" value="${state.critRate}"><span>${state.critRate}%</span></label>
			<label class="slider">${t('tool.directRate')} <input data-field="directRate" type="range" min="0" max="60" value="${state.directRate}"><span>${state.directRate}%</span></label>
				<div class="damage-total" data-damage-total>--</div>
				<div class="phase-damage" data-phase-damage></div>
				<p class="hint">${t('tool.simHint')}</p>
			</section>
			</div>
		</section>
	`
}

function renderFflogsComparisonPanel(model) {
	const comparison = state.fflogsComparison
	return `
		<section class="fflogs-panel">
			<div class="section-heading">
				<div>
					<p class="eyebrow">${t('fflogs.eyebrow')}</p>
					<h3>${t('fflogs.title')}</h3>
				</div>
				<span class="status-pill">${comparison ? t('fflogs.statusParsed') : t('fflogs.statusPending')}</span>
			</div>
			<div class="fflogs-import-row">
				<input data-field="fflogs-url" value="${escapeHtml(state.fflogsUrl)}" placeholder="${t('fflogs.placeholder')}">
				<button class="primary" data-action="load-fflogs-comparison">${state.fflogsStatus ? t('fflogs.parsing') : t('fflogs.parse')}</button>
			</div>
			${state.fflogsStatus ? `<p class="hint">${escapeHtml(state.fflogsStatus)}</p>` : ''}
			${state.fflogsError ? `<p class="import-feedback error">${escapeHtml(state.fflogsError)}</p>` : ''}
			${comparison ? renderFflogsComparisonResult(comparison, model) : `<p class="hint">${t('fflogs.hint')}</p>`}
		</section>
	`
}

function renderFflogsComparisonResult(comparison, model) {
	const actors = comparison.actors ?? []
	const selectedActor = comparison.selectedActor ?? {}
	return `
		<div class="fflogs-meta">
			<span>${escapeHtml(comparison.source?.encounterName || model.encounter.name)}</span>
			<span>${escapeHtml(comparison.source?.sourceLog || state.fflogsUrl)}</span>
			<label>
				<span>${t('fflogs.actor')}</span>
				<select data-field="fflogs-actor">
					${actors.map(actor => `<option value="${actor.id}" ${Number(actor.id) === Number(selectedActor.id) ? 'selected' : ''}>${escapeHtml(actor.name)} / ${escapeHtml(actor.job || t('fflogs.unknownJob'))} / ${formatDamage(actor.damage)}</option>`).join('')}
				</select>
			</label>
		</div>
		<div class="fflogs-metric-grid">
			${renderCompareMetric(t('fflogs.metric.damage'), comparison.simulated.damage.total, comparison.log.damage.total, comparison.deltas.damage.total, comparison.deltas.damage.percent, 'damage', renderDamageAdjustmentBreakdown(comparison))}
			${renderCompareMetric(t('fflogs.metric.skills'), comparison.simulated.skillCounts.total, comparison.log.skillCounts.total, comparison.deltas.skillCounts.total, null, 'count', renderSkillCountBreakdown(comparison))}
			${renderCompareMetric(t('fflogs.metric.gcd'), comparison.simulated.gcdUtilization.percent, comparison.log.gcdUtilization.percent, comparison.deltas.gcdUtilization.points, null, 'percent', renderGcdUtilizationControl(comparison))}
			${renderCompareMetric(t('fflogs.metric.healing'), comparison.simulated.healing.total, comparison.log.healing.total, comparison.deltas.healing.total, comparison.deltas.healing.percent, 'damage')}
		</div>
		<div class="fflogs-detail-grid">
			<section>
				<h4>${t('fflogs.section.phaseDamage')}</h4>
				${renderPhaseCompareTable(comparison)}
			</section>
			<section>
				<h4>${t('fflogs.section.skillDiff')}</h4>
				${renderSkillCompareTable(comparison.skillRows ?? [])}
			</section>
		</div>
	`
}

function renderDamageAdjustmentBreakdown(comparison) {
	const damage = comparison.simulated?.damage ?? {}
	const calibration = damage.calibration
	if (!calibration && !damage.adjustment) {
		return ''
	}
	const adjustedTotal = Number(damage.total ?? 0)
	const unadjustedTotal = Number(damage.unadjustedTotal ?? adjustedTotal)
	const adjustmentDelta = adjustedTotal - unadjustedTotal
	const phaseScales = Object.entries(damage.adjustment?.scales ?? {})
		.map(([phase, scale]) => `${escapeHtml(phase)} ${(Number(scale) * 100).toFixed(1)}%`)
		.join(' / ')
	const calibrationRows = calibration ? [
		`FFLogs 实战标定 ${formatNumber(calibration.attackPower, 1)} / 默认 ${formatNumber(calibration.defaultAttackPower ?? 120, 0)}`,
		`样本 ${formatMetricValue(calibration.sampleHits, 'count')} 命中 / ${formatDamage(calibration.sampleDamage)}`,
		`实战暴击 ${formatNumber(calibration.critRate, 1)}% / 直击 ${formatNumber(calibration.directRate, 1)}%`,
		`带 buff 命中 ${formatNumber(calibration.buffedRate, 1)}%`,
	] : []
	const adjustmentRows = damage.adjustment ? [
		`校正前 ${formatDamage(unadjustedTotal)}`,
		damage.adjustment.type === 'target-gcd-utilization'
			? `按目标 GCD ${formatNumber(damage.adjustment.targetPercent, 1)}% ${formatSignedDamage(adjustmentDelta)}`
			: `按日志 GCD 利用率 ${formatSignedDamage(adjustmentDelta)}`,
		phaseScales,
	] : ['GCD 利用率仅作对比显示，伤害不再二次折扣']
	return `
		<div class="fflogs-metric-detail">
			${[...calibrationRows, ...adjustmentRows].filter(Boolean).map(row => `<span>${escapeHtml(row)}</span>`).join('')}
		</div>
	`
}

function renderGcdUtilizationControl(comparison) {
	const target = clampPercent(state.fflogsTargetGcdUtilization)
	const actual = Number(comparison.simulated?.gcdUtilization?.actualPercent ?? comparison.simulated?.gcdUtilization?.percent ?? target)
	const logPercent = Number(comparison.log?.gcdUtilization?.percent ?? 0)
	const targetDiff = target - logPercent
	return `
		<div class="gcd-utilization-control">
			<label>
				<span>${t('fflogs.gcdLabel')}</span>
				<input data-field="fflogs-gcd-utilization" type="range" min="50" max="100" step="0.1" value="${formatNumber(target, 1)}">
				<strong>${formatNumber(target, 1)}%</strong>
			</label>
			<div class="gcd-utilization-actions">
				<button class="mini-button" data-action="apply-log-gcd-utilization">${t('fflogs.applyLog')} ${formatNumber(logPercent, 1)}%</button>
				<button class="mini-button" data-action="reset-gcd-utilization">${t('fflogs.reset')}</button>
			</div>
			<span>${t('fflogs.gcdInfo')} ${formatNumber(actual, 1)}% / ${t('fflogs.gcdTargetDiff')} ${formatSignedNumber(targetDiff, 1)}pt</span>
		</div>
	`
}

function renderCompareMetric(label, simulated, logValue, delta, deltaPercent, type, detail = '') {
	const deltaClass = Number(delta) >= 0 ? 'positive' : 'negative'
	const deltaLabel = type === 'percent'
		? `${formatSignedNumber(delta, 1)}pt`
		: type === 'count'
			? formatSignedInteger(delta)
			: `${formatSignedDamage(delta)}${deltaPercent == null ? '' : ` / ${formatSignedNumber(deltaPercent, 1)}%`}`
	return `
		<article class="fflogs-metric">
			<span>${label}</span>
			<div>
				<strong>${formatMetricValue(simulated, type)}</strong>
				<small>${t('fflogs.sim')}</small>
			</div>
			<div>
				<strong>${formatMetricValue(logValue, type)}</strong>
				<small>${t('fflogs.log')}</small>
			</div>
			<em class="${deltaClass}">${deltaLabel}</em>
			${detail}
		</article>
	`
}

function renderSkillCountBreakdown(comparison) {
	const simulated = comparison.simulated?.skillCounts ?? {}
	const logValue = comparison.log?.skillCounts ?? {}
	const deltas = comparison.deltas?.skillCounts ?? {}
	return `
		<div class="fflogs-metric-detail">
			<span>${t('fflogs.metric.actions')} ${formatMetricValue(simulated.actions, 'count')} / ${formatMetricValue(logValue.actions, 'count')} <b class="${Number(deltas.actions ?? 0) >= 0 ? 'positive' : 'negative'}">${formatSignedInteger(deltas.actions ?? 0)}</b></span>
			<span>${t('fflogs.metric.autoAttack')} ${formatMetricValue(simulated.auto, 'count')} / ${formatMetricValue(logValue.auto, 'count')} <b class="${Number(deltas.auto ?? 0) >= 0 ? 'positive' : 'negative'}">${formatSignedInteger(deltas.auto ?? 0)}</b></span>
		</div>
	`
}

function renderPhaseCompareTable(comparison) {
	const phaseKeys = [...new Set([
		...Object.keys(comparison.simulated.damage.phases ?? {}),
		...Object.keys(comparison.log.damage.phases ?? {}),
	])]
	return `
		<div class="compare-table">
			<div class="compare-row header"><span>${t('fflogs.tableHeader.phase')}</span><span>${t('fflogs.tableHeader.simulated')}</span><span>${t('fflogs.tableHeader.log')}</span><span>${t('fflogs.tableHeader.delta')}</span></div>
			${phaseKeys.map(phase => {
				const simulated = Number(comparison.simulated.damage.phases?.[phase]?.damage ?? 0)
				const logValue = Number(comparison.log.damage.phases?.[phase]?.damage ?? 0)
				return `<div class="compare-row"><span>${escapeHtml(phase)}</span><span>${formatDamage(simulated)}</span><span>${formatDamage(logValue)}</span><span class="${simulated - logValue >= 0 ? 'positive' : 'negative'}">${formatSignedDamage(simulated - logValue)}</span></div>`
			}).join('')}
		</div>
	`
}

function renderSkillCompareTable(rows) {
	return `
		<div class="compare-table skill-table">
			<div class="compare-row header"><span>${t('fflogs.tableHeader.skill')}</span><span>${t('fflogs.tableHeader.simulated')}</span><span>${t('fflogs.tableHeader.log')}</span><span>${t('fflogs.tableHeader.delta')}</span></div>
			${rows.slice(0, 18).map(row => `<div class="compare-row"><span>${escapeHtml(row.actionName || `技能 ${row.actionId}`)}</span><span>${row.simulatedCount}</span><span>${row.logCount}</span><span class="${row.delta >= 0 ? 'positive' : 'negative'}">${formatSignedInteger(row.delta)}</span></div>`).join('')}
		</div>
	`
}

function renderAcrDock(model) {
	return `
		<div class="acr-dock">
			<button class="acr-dock-title" data-action="open-acr-database">ACR 数据库</button>
		</div>
	`
}

function renderAcrModal(model) {
	if (!state.showAcrModal) {
		return ''
	}
	const generatedAt = formatGeneratedAt(model.acrDatabase.generatedAt || model.skillDatabase?.source?.generatedAt)
	const allJobs = model.acrDatabase.jobs
	const supportedJobs = allJobs.filter(job => acrSupportStatus(job).key === 'supported')
	const waitingJobs = allJobs.filter(job => acrSupportStatus(job).key === 'waiting')
	const unsupportedJobs = allJobs.filter(job => acrSupportStatus(job).key === 'unsupported')
	const roleLabel = role => ({ tank: t('role.tank'), healer: t('role.healer'), dps: t('role.dps'), ranged: t('role.ranged'), caster: t('role.caster'), melee: t('role.melee') }[role] || role)
	const renderJobGroup = (jobs, heading, count) => jobs.length ? `
		<div class="acr-group" data-status="${heading}">
			<div class="acr-group-head">
				<strong>${heading}</strong>
				<span class="acr-group-count">${count}</span>
			</div>
			<div class="acr-db-grid">
				${jobs.map(job => {
					const primaryAcr = job.acrs.find(acr => acr.enabled) ?? job.acrs[0]
					return `
					<article class="acr-job-card ${acrSupportStatus(job, primaryAcr).key}" data-role="${job.role}">
						<div class="acr-card-head">
							<strong>${job.name}</strong>
							<span class="acr-role-badge">${roleLabel(job.role)}</span>
						</div>
						<small class="acr-card-id">${job.id}</small>
						<div class="acr-card-fields">
${renderAcrField(t('acr.field.status'), renderAcrStatusBadge(acrSupportStatus(job, primaryAcr)))}
							${renderAcrField(t('acr.field.author'), primaryAcr?.author ?? primaryAcr?.name ?? t('status.unspecified'))}
							${renderAcrField(t('acr.field.source'), publicAcrSourceLabel(primaryAcr?.source ?? model.skillDatabase?.source?.name))}
							</div>
						${job.acrs.length > 1 ? `
						<div class="acr-chip-list">
							${job.acrs.map(acr => `<span class="${acr.enabled ? 'active' : ''}" title="${publicAcrSourceLabel(acr.source)}">${acr.name}<small>${publicAcrSourceLabel(acr.source)}</small></span>`).join('')}
						</div>` : ''}
					</article>
				`}).join('')}
			</div>
		</div>
	` : ''
	return `
		<div class="modal-backdrop" role="dialog" aria-modal="true">
			<section class="modal-panel acr-db-modal">
				<div class="acr-modal-header">
					<div class="acr-modal-title">
<h3>${t('acr.title')}</h3>
					<small>${generatedAt}</small>
				</div>
				<button class="mini-button" data-action="close-acr-database">${t('action.close')}</button>
				</div>
				<div class="acr-stats-bar">
<div class="acr-stat"><strong>${allJobs.length}</strong><small>${t('acr.stat.jobs')}</small></div>
				<div class="acr-stat"><strong>${model.acrDatabase.packages.length}</strong><small>${t('acr.stat.packages')}</small></div>
				<div class="acr-stat supported"><strong>${supportedJobs.length}</strong><small>${t('acr.stat.supported')}</small></div>
				<div class="acr-stat waiting"><strong>${waitingJobs.length}</strong><small>${t('acr.stat.waiting')}</small></div>
				<div class="acr-stat unsupported"><strong>${unsupportedJobs.length}</strong><small>${t('acr.stat.unsupported')}</small></div>
				</div>
				<details class="acr-packages">
					<summary>${t('acr.packages')} (${model.acrDatabase.packages.length})</summary>
					<div class="package-line">${model.acrDatabase.packages.map(name => `<span>${name}</span>`).join('')}</div>
				</details>
${renderJobGroup(supportedJobs, t('acr.status.supported'), supportedJobs.length)}
			${renderJobGroup(waitingJobs, t('acr.status.waiting'), waitingJobs.length)}
			${renderJobGroup(unsupportedJobs, t('acr.status.unsupported'), unsupportedJobs.length)}
			</section>
		</div>
	`
}

function renderAboutModal(model) {
	if (!state.showAboutModal) {
		return ''
	}
	const allJobs = model?.acrDatabase?.jobs ?? []
	const supportedJobs = allJobs.filter(job => acrSupportStatus(job).key === 'supported')
	const supportedJobsValue = t('about.supportedJobsValue')
		.replace('{supported}', supportedJobs.length)
		.replace('{total}', allJobs.length)
	const rows = [
		{label: t('about.projectName'), value: 'WebTimeline'},
		{label: t('about.intro'), value: t('about.introValue')},
		{label: t('about.author'), value: APP_AUTHOR},
		{label: t('about.version'), value: APP_VERSION},
		{label: t('about.updatedAt'), value: APP_UPDATED_AT},
		{label: t('about.supportedJobs'), value: supportedJobsValue},
		{label: t('about.acrSource'), value: t('about.acrSourceValue')},
		{label: t('about.fflogs'), value: t('about.supported')},
		{label: t('about.localImport'), value: t('about.supported')},
		{label: t('about.port'), value: APP_PORT},
	]
	return `
		<div class="modal-backdrop" data-backdrop-close="about" role="dialog" aria-modal="true" aria-label="${t('about.title')}">
			<section class="modal-panel about-modal">
				<div class="acr-modal-header">
					<div class="acr-modal-title">
						<h3>${t('about.title')}</h3>
						<small>WebTimeline · ${APP_VERSION}</small>
					</div>
					<button class="mini-button" data-action="close-about">${t('action.close')}</button>
				</div>
				<dl class="about-list">
					${rows.map(row => `<div class="about-row"><dt>${row.label}</dt><dd>${row.value}</dd></div>`).join('')}
				</dl>
			</section>
		</div>
	`
}

function acrSupportStatus(job, acr) {
	if (!job) {
		return {key: 'waiting', label: t('acr.status.waiting')}
	}
	if (!job.enabled) {
		return {key: 'unsupported', label: t('acr.status.unsupported')}
	}
	if (acr && !acr.enabled) {
		return {key: 'unsupported', label: t('acr.status.unsupported')}
	}
	if (!job.acrs?.length) {
		return {key: 'waiting', label: t('acr.status.waiting')}
	}
	if (!acr && !job.acrs.some(item => item.enabled)) {
		return {key: 'waiting', label: t('acr.status.waiting')}
	}
	return {key: 'supported', label: t('acr.status.supported')}
}

function renderAcrStatusBadge(status) {
	const safeStatus = status ?? {key: 'waiting', label: t('acr.status.waiting')}
	return `<span class="acr-status ${safeStatus.key}">${safeStatus.label}</span>`
}

function renderAcrField(label, value) {
	const content = value == null || value === '' ? t('status.unspecified') : value
	return `<div class="acr-field"><span>${label}</span><strong>${content}</strong></div>`
}

function publicAcrSourceLabel(source = '') {
const value = String(source ?? '').trim()
if (!value) {
return t('status.unspecified')
}
if (/反编译|decompiled/i.test(value)) {
return t('acr.dataLabel')
}
return value
}

function renderIcon(name = '', explicitUrl = '') {
	if (explicitUrl) {
		return `<img class="skill-icon" src="${explicitUrl}" alt="">`
	}
	const action = findActionByName(name)
	if (action?.iconUrl) {
		return `<img class="skill-icon" src="${action.iconUrl}" alt="">`
	}
	return `<span class="skill-icon fallback">${name.slice(0, 1) || '技'}</span>`
}

function findActionByName(name = '') {
	return state.model?.skillDatabase?.skills?.find(skill => name.includes(skill.name) || skill.name.includes(name))
}

function uniqueSkillLibraryItems(items = []) {
	// Phase 1: dedupe by actionId, keeping the first (database-preferred) occurrence.
	const byActionId = new Map()
	for (const item of items) {
		const aid = String(item.actionId ?? '')
		if (!aid) {
			continue
		}
		if (!byActionId.has(aid)) {
			byActionId.set(aid, item)
		}
	}
	const byActionList = [...byActionId.values()]
	// Items without actionId — dedupe by name+category fallback.
	const noActionItems = []
	const seenFallback = new Set()
	for (const item of items) {
		if (String(item.actionId ?? '')) {
			continue
		}
		const name = String(item.name ?? item.label ?? '')
		const cat = String(item.category ?? item.type ?? item.sidebarType ?? '')
		const fkey = `name:${name}|${cat}`
		if (!name || seenFallback.has(fkey)) {
			continue
		}
		seenFallback.add(fkey)
		noActionItems.push(item)
	}
	// Phase 2: merge entries that share the same display name but have different actionIds.
	// These are typically the same skill with variant IDs (e.g. PvE / PvP / effect variants).
	const byName = new Map()
	for (const item of [...byActionList, ...noActionItems]) {
		const name = String(item.name ?? item.label ?? '').trim()
		if (!name) {
			continue
		}
		if (!byName.has(name)) {
			byName.set(name, {
				...item,
				relatedActionIds: String(item.actionId ?? '') ? [String(item.actionId)] : [],
				occurrenceCount: 1,
				sources: new Set(item.source ? [item.source] : []),
			})
			continue
		}
		const existing = byName.get(name)
		existing.occurrenceCount += 1
		const aid = String(item.actionId ?? '')
		if (aid && !existing.relatedActionIds.includes(aid)) {
			existing.relatedActionIds.push(aid)
		}
		if (item.source) {
			existing.sources.add(item.source)
		}
		// Prefer database entries for icon/category metadata.
		if (!existing.iconUrl && item.iconUrl) {
			existing.iconUrl = item.iconUrl
		}
		if (!existing.skillType && item.skillType) {
			existing.skillType = item.skillType
		}
	}
	return [...byName.values()].map(item => ({
		...item,
		sources: [...item.sources],
	}))
}

function uniqueSkillEvents(events) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const id = String(event.actionId ?? event.name ?? '')
		if (!id || seen.has(id)) {
			continue
		}
		seen.add(id)
		result.push(event)
	}
	return result
}

function uniqueSkillsById(skills) {
	const seen = new Set()
	const result = []
	for (const skill of skills) {
		const id = String(skill?.id ?? '')
		if (!id || seen.has(id)) {
			continue
		}
		seen.add(id)
		result.push(skill)
	}
	return result
}

function uniqueFocusEvents(events) {
	const seen = new Set()
	const result = []
	for (const event of events) {
		const key = focusEventKey(event)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		result.push(event)
	}
	return result
}

function focusEventKey(event) {
	return [
		String(event?.actionId ?? ''),
		Math.round(Number(event?.timeMs ?? 0)),
		focusSourceLabel(event),
	].join('|')
}

function renderFocusAddLabel() {
	return `<button class="focus-label-button" data-action="open-focus-picker">${t('action.addFocus')}</button>`
}

function renderFocusedSkillLabel(skill, actionId, count) {
	return `
		<span class="focus-label">
			<span class="focus-label-name">${escapeHtml(skill?.name ?? `${t('focus.skillId')} ${actionId}`)}</span>
			<small>${count} ${t('focus.timesSuffix')}</small>
			<button class="focus-label-remove" data-action="remove-focused-skill" data-focus-skill="${actionId}" title="${t('action.removeFocus')}">×</button>
		</span>
	`
}

function focusedSkillRows() {
	return state.focusedSkills
		.map(actionId => {
			const skill = actionById(actionId)
			const items = timelineEventsForAction(actionId)
				.map((event, index) => focusTrackerItemForEvent(event, skill, actionId, index))
			return {
				id: `focus-${actionId}`,
				label: skill?.name ?? `技能 ${actionId}`,
				labelHtml: renderFocusedSkillLabel(skill, actionId, items.length),
				accent: 'sky',
				keepWhenEmpty: true,
				items,
			}
		})
}

function focusCandidates() {
	const track = state.model.tracks.expert
	return uniqueSkillEvents([
		...(state.showAcrSimulation ? state.model.acrSimulation.events : []),
		...(track.mitigation ?? []),
		...mainActionTimelineEvents(track.player ?? []),
		...state.inserted,
	]).filter(event => Number(event.actionId))
}

function groupedFocusCandidates(query = '') {
	const skills = state.model.skillDatabase?.skills ?? []
	const timelineEvents = focusCandidates()
	const timelineActionIds = new Set(timelineEvents.map(event => String(event.actionId)))
	const timelineSkills = timelineEvents
		.map(event => actionById(event.actionId) ?? {
			id: Number(event.actionId),
			name: event.name,
			job: event.job ?? state.job,
			jobName: event.jobName ?? event.job ?? state.job,
			iconUrl: event.iconUrl ?? '',
			category: event.skillType ?? event.classification ?? '技能',
			level: 0,
		})
	const allSkills = uniqueSkillsById([...skills, ...timelineSkills])
		.filter(skill => Number(skill.id))
		.filter(skill => focusSkillMatchesQuery(skill, query))
		.sort(compareFocusSkills)
	const current = allSkills.filter(skill => isCurrentJobFocusSkill(skill) && timelineActionIds.has(String(skill.id)))
	return {
		current,
		other: allSkills.filter(skill => !current.includes(skill)),
	}
}

function isCurrentJobFocusSkill(skill) {
	return skill.job === state.job || skill.job === 'ROLE'
}

function focusSkillMatchesQuery(skill, query = '') {
	if (!query) {
		return true
	}
	const haystack = normalizeSearchText(`${skill.id} ${skill.name} ${skill.jobName ?? ''} ${skill.job ?? ''} ${skill.category ?? ''}`)
	return haystack.includes(query)
}

function compareFocusSkills(left, right) {
	const leftCurrent = isCurrentJobFocusSkill(left) ? 0 : 1
	const rightCurrent = isCurrentJobFocusSkill(right) ? 0 : 1
	if (leftCurrent !== rightCurrent) {
		return leftCurrent - rightCurrent
	}
	const leftCount = timelineEventsForAction(left.id).length
	const rightCount = timelineEventsForAction(right.id).length
	if (leftCount !== rightCount) {
		return rightCount - leftCount
	}
	return Number(left.level ?? 0) - Number(right.level ?? 0) || String(left.name).localeCompare(String(right.name), 'zh-CN')
}

function timelineEventsForAction(actionId) {
	const id = String(actionId)
	return uniqueFocusEvents([
		...(state.showAcrSimulation ? state.model.acrSimulation.events : []),
		...mainActionTimelineEvents(state.model.tracks.expert.player ?? []),
		...(state.model.tracks.expert.mitigation ?? []),
		...state.inserted,
	].filter(event => String(event.actionId) === id))
}

function addFocusedSkill(actionId) {
	const id = String(actionId)
	if (!id || state.focusedSkills.includes(id)) {
		return
	}
	state.focusedSkills.push(id)
	const skill = actionById(id)
	setImportStatus(`已追踪 ${skill?.name ?? `技能 ${id}`}`)
	state.showFocusPicker = false
	render()
}

function removeFocusedSkill(actionId) {
	const id = String(actionId ?? '')
	if (!id) {
		return
	}
	state.focusedSkills = state.focusedSkills.filter(skillId => skillId !== id)
	render()
}

function actionById(actionId) {
	return state.model.skillDatabase?.actionsById?.[String(actionId)] ?? null
}

function localizedActionName(actionId, fallback = '') {
	const id = Number(actionId)
	if (!Number.isFinite(id)) {
		return ACTION_LABELS.get(String(actionId)) ?? fallback
	}
	return ACTION_LABELS.get(id)
		?? actionById(id)?.name
		?? ACTION_LABELS.get(String(actionId))
		?? fallback
}

function bossActionDisplayName(event = {}) {
	const rawName = String(event.name ?? event.label ?? '').trim()
	if (!rawName) {
		return ''
	}
	// Strip axis-annotation prefixes like "P1死刑 ", "半场刀 ", "死刑 ", "关爆发 " etc.
	const annotationPattern = /^(?:P\d+[\s\u3000]*)?(?:死刑|半场刀|半场|开启|关闭|关爆发|关爆)[\s\u3000]*/
	const cleaned = rawName.replace(annotationPattern, '').trim()
	return cleaned || rawName
}

function actionByName(name = '') {
	const normalizedName = String(name ?? '').trim()
	if (!normalizedName) {
		return null
	}
	return state.model.skillDatabase?.skills?.find(skill => skill.name === normalizedName)
		?? state.model.skillDatabase?.skills?.find(skill => normalizedName.includes(skill.name) || skill.name.includes(normalizedName))
		?? null
}

function insertIdPreviewName(id = state.insertSkillId) {
	const normalizedId = String(id ?? '').trim()
	if (!normalizedId) {
		return '输入 ID 后自动匹配技能名'
	}
	const action = actionById(normalizedId)
	if (!action) {
		return '未找到该技能 ID'
	}
	const job = action.jobName || action.job || '未知职业'
	return `${action.name} / ${job}`
}

function displayNameForAction(event = {}) {
	if (event.kind === 'potion' || event.type === 'potion') {
		const attributeLabel = potionAttributeLabel(event.attributeId)
		return event.name ?? event.label ?? `${attributeLabel}爆发药`
	}
	if (event.kind === 'qt-control' || event.type === 'qt') {
		return event.name ?? event.label ?? 'QT 控制'
	}
	if (event.kind === 'boss-cast' || event.type === 'cast') {
		const bossName = bossActionDisplayName(event)
		return bossName || (event.name ?? event.label ?? '技能')
	}
	const actionId = event.actionId ?? event.id
	const localized = localizedActionName(actionId, '')
	if (localized) {
		return localized
	}
	return event.name ?? event.label ?? '技能'
}

function renderBossAvatar(name, index = 0) {
	const key = bossAvatarKey(name, index)
	const avatar = BOSS_AVATAR_ASSETS[key] ?? BOSS_AVATAR_ASSETS[BOSS_AVATAR_KEYS[index % BOSS_AVATAR_KEYS.length]]
	if (avatar.kind === 'pixel') {
		return `<span class="boss-avatar boss-avatar-${key} boss-avatar-pixel boss-avatar-pixel-${avatar.pixel}" aria-hidden="true">${renderBossPixelAvatar(avatar.pixel)}</span>`
	}
	return `<span class="boss-avatar boss-avatar-${key}" aria-hidden="true"><img src="${avatar.src}" alt="" loading="lazy" decoding="async"></span>`
}

function renderBossPixelAvatar(name) {
	const cells = BOSS_PIXEL_AVATARS[name] ?? BOSS_PIXEL_AVATARS['black-hole']
	return `<span class="boss-avatar-pixel-grid">${cells.map(cell => `<i class="boss-avatar-pixel-cell p${cell}"></i>`).join('')}</span>`
}

function bossAvatarKey(name, index = 0) {
	const text = String(name ?? '')
	if (text.includes('凯夫卡') || /kefka/i.test(text)) return 'kefka'
	if (text.includes('卡奥斯') || /chaos/i.test(text)) return 'chaos'
	if (text.includes('新生艾克斯迪司') || /neo/i.test(text)) return 'exdeath'
	if (text.includes('艾克斯迪司') || /exdeath/i.test(text)) return 'exdeath'
	if (text.includes('众神之像') || /statue|graven/i.test(text)) return 'statue'
	if (text.includes('黑洞') || /black hole/i.test(text)) return 'black-hole'
	return BOSS_AVATAR_KEYS[index % BOSS_AVATAR_KEYS.length]
}

const BOSS_AVATAR_KEYS = ['kefka', 'chaos', 'exdeath', 'exdeath', 'statue', 'black-hole']

const BOSS_AVATAR_ASSETS = {
	kefka: {src: '/assets/boss/kefka.gif', kind: 'image'},
	chaos: {src: '/assets/boss/chaos.png', kind: 'image'},
	exdeath: {src: '/assets/boss/exdeath.png', kind: 'image'},
	statue: {pixel: 'statue', kind: 'pixel'},
	'black-hole': {pixel: 'black-hole', kind: 'pixel'},
}

const BOSS_PIXEL_AVATARS = {
	statue: [
		0,0,1,1,1,1,1,1,0,0,
		0,1,2,2,2,2,2,2,1,0,
		1,2,2,3,2,2,3,2,2,1,
		1,2,4,2,2,2,2,4,2,1,
		0,1,2,2,5,5,2,2,1,0,
		0,1,6,2,2,2,2,6,1,0,
		1,6,6,1,2,2,1,6,6,1,
		1,0,6,1,1,1,1,6,0,1,
	],
	'black-hole': [
		0,0,0,4,4,4,4,0,0,0,
		0,0,4,3,3,3,3,4,0,0,
		0,4,3,2,2,2,2,3,4,0,
		4,3,2,1,1,1,1,2,3,4,
		4,3,2,1,0,0,1,2,3,4,
		0,4,3,2,1,1,2,3,4,0,
		0,0,4,3,2,2,3,4,0,0,
		0,0,0,4,4,4,4,0,0,0,
	],
}

function insertManualSkill() {
	if (!canEditTimeline()) {
		return
	}
	const id = document.querySelector('[data-field="skill-id"]')?.value.trim()
	const action = state.model.skillDatabase?.actionsById?.[id]
	const name = action?.name ?? `技能 ${id}`
	const classification = classifyImportedAction(id, name, 'player-action')
	const output = Boolean(classification.output)
	if (!id) return
	state.insertSkillId = id
	const timeMs = 90000 + state.inserted.length * 8000
	const manualId = `manual-${Date.now()}`
	state.inserted.push({
		id: manualId,
		name,
		actionId: id,
		timeMs,
		requestedTimeMs: timeMs,
		kind: 'player-action',
		source: 'manual',
		target: defaultManualTargetForAction(action, classification.type),
		targetRequired: requiresManualTargetChoice(action, classification.type),
		targetMode: null,
		targetDataId: null,
		classification: classification.type,
		output,
		potency: output ? Number(classification.potency ?? 0) : 0,
		recastMs: Number(action?.recastMs ?? 0),
		iconUrl: action?.iconUrl ?? '',
		count: 1,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	setImportStatus(adjusted > 0 ? `已插入 ${name}，队列已顺延到 ${formatTime(inserted.timeMs)}` : `已插入 ${name} 到 ${formatTime(timeMs)}`)
	render()
}

function insertSkillAtTimeline(actionId, event, timeline) {
	const dropLane = timelineDropLaneAtClientPoint(event.clientX, event.clientY) || timelineDropLaneForTarget(event.target)
	const effectiveDropLane = effectiveActionDropLane(actionId, dropLane)
	if (!canDropActionOnTimelineLane(actionId, effectiveDropLane)) {
		setImportError('这个技能不能放到当前功能行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertSkillAtMs(actionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertSkillAtClientPoint(actionId, clientX, clientY) {
	if (!canEditTimeline() || !actionId) {
		return false
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('没有放到时间轴区域，技能未插入')
		render()
		return false
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	const effectiveDropLane = effectiveActionDropLane(actionId, dropLane)
	if (!canDropActionOnTimelineLane(actionId, effectiveDropLane)) {
		setImportError('这个技能不能放到当前功能行')
		return false
	}
	const dropInfo = timelineDropInfoForClientX(clientX, timeline)
	insertSkillAtMs(actionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
	return true
}

function insertSkillAtVisibleTimeline(actionId) {
	if (!canEditTimeline() || !actionId) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		insertSkillAtMs(actionId, 90000 + state.inserted.length * 8000)
		return
	}
	const dropInfo = timelineDropInfoForVisibleCenter(timeline)
	insertSkillAtMs(actionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertPotionAtVisibleTimeline(potionId) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const dropInfo = timeline ? timelineDropInfoForVisibleCenter(timeline) : null
	const timeMs = dropInfo?.absoluteTimeMs ?? visibleTimelineCenterMs()
	insertPotionAtMs(potionId, timeMs, {phaseInfo: dropInfo})
}

function insertQtAtVisibleTimeline(qtIndex) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const timeMs = timeline ? timelineDropInfoForVisibleCenter(timeline).absoluteTimeMs : visibleTimelineCenterMs()
	insertQtAtMs(qtIndex, timeMs)
}

function insertQtDraftAtVisibleTimeline() {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const dropInfo = timeline ? timelineDropInfoForVisibleCenter(timeline) : null
	const timeMs = dropInfo?.absoluteTimeMs ?? visibleTimelineCenterMs()
	insertQtDraftAtMs(timeMs, {phaseInfo: dropInfo})
}

function insertQtAtTimeline(qtIndex, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const dropLane = timelineDropLaneAtClientPoint(event.clientX, event.clientY) || timelineDropLaneForTarget(event.target)
	if (!canDropQtOnTimelineLane(dropLane)) {
		setImportError('QT 只能放到 QT 控制行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertQtAtMs(qtIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertQtAtClientPoint(qtIndex, clientX, clientY) {
	if (!canEditTimeline() || !qtIndex) {
		return false
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('没有放到时间轴区域，QT 未插入')
		render()
		return false
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	if (!canDropQtOnTimelineLane(dropLane)) {
		setImportError('QT 只能放到 QT 控制行')
		return false
	}
	const dropInfo = timelineDropInfoForClientX(clientX, timeline)
	insertQtAtMs(qtIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
	return true
}

function insertPotionAtTimeline(potionId, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const dropLane = timelineDropLaneAtClientPoint(event.clientX, event.clientY) || timelineDropLaneForTarget(event.target)
	if (!canDropPotionOnTimelineLane(dropLane)) {
		setImportError('爆发药只能放到爆发行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertPotionAtMs(potionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertPotionAtClientPoint(potionId, clientX, clientY) {
	if (!canEditTimeline()) {
		return false
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('没有放到时间轴区域，爆发药未插入')
		render()
		return false
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	if (!canDropPotionOnTimelineLane(dropLane)) {
		setImportError('爆发药只能放到爆发行')
		return false
	}
	const dropInfo = dropTimeInfoForClientPoint(clientX, clientY, timelineDragGuideContext(timeline))
	insertPotionAtMs(potionId, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
	return true
}

function insertQtAtMs(qtIndex, timeMs, options = {}) {
	const qt = qtInsertByIndex(qtIndex)
	if (!qt) {
		setImportError('没有找到这个 QT 控制节点')
		render()
		return
	}
	const window = burstWindowForTime(burst, Number(burst.timeMs ?? burst.startMs ?? timeMs), 0)
	const label = burstLabelForWindow(window)
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	insertManualQtControl(qt.name, timeMs, {
		phaseInfo,
		renderAfterInsert: false,
		enabled: qtDraftEnabledFor(qt),
		qtStates: [qtDraftStateFor(qt)],
	})
	setImportStatus(`已插入 QT：${qt.name} -> ${qtDraftEnabledFor(qt) ? '开' : '关'} 到 ${formatTime(timeMs)}`)
	render()
}

function insertQtDraftAtMs(timeMs, options = {}) {
	const changes = qtDraftChanges()
	if (!changes.length) {
		setImportError('还没有选择要变更的 QT')
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const qtStates = changes.map(change => change.qtState)
	insertManualQtControl('QT 草稿', timeMs, {
		phaseInfo,
		renderAfterInsert: false,
		enabled: qtStates.some(item => item.Enabled),
		qtStates,
	})
	state.qtDraftStates = {}
	setImportStatus(`已插入 ${changes.length} 个 QT 变更 到 ${formatTime(timeMs)}`)
}

function insertBurstQtAtVisibleTimeline(burstIndex, requestedTimeMs) {
	if (!canEditTimeline()) {
		return
	}
	const burst = burstInsertByIndex(burstIndex)
	if (!burst) {
		return
	}
	const fallbackMs = visibleTimelineCenterMs()
	const timeMs = Number.isFinite(Number(requestedTimeMs)) ? Number(requestedTimeMs) : Number(burst.timeMs ?? fallbackMs)
	const qtNames = [...new Set(burst.qt ?? [])]
	if (!qtNames.length) {
		setImportError(`${burst.name} 暂无 QT 开关`)
		render()
		return
	}
	const phaseInfo = phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	qtNames.forEach((qtName, index) => {
		insertManualQtControl(qtName, timeMs + index * 300, {phaseInfo, renderAfterInsert: false})
	})
	setImportStatus(`已插入 ${burst.name} QT 到 ${formatTime(timeMs)}`)
	render()
}

function insertManualQtControl(name, timeMs, options = {}) {
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const enabled = Boolean(options.enabled)
	const qtStates = Array.isArray(options.qtStates) && options.qtStates.length
		? options.qtStates
		: [{Name: name, Enabled: enabled}]
	state.inserted.push({
		id: `manual-qt-${Date.now()}-${state.inserted.length}`,
		name,
		timelineLabel: `QT: ${name}`,
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		kind: 'qt-control',
		source: 'manual',
		classification: 'qt',
		output: false,
		potency: 0,
		durationMs: 2500,
		count: 1,
		enabled,
		qtStates,
	})
	normalizeManualStateQueue()
	if (options.renderAfterInsert !== false) {
		render()
	}
}

function updateBurstPlannerTime(input) {
	const index = input.dataset.burstTime
	const seconds = Math.max(0, Math.round(Number(input.value ?? 0)))
	const timeMs = seconds * 1000
	const card = input.closest('.burst-window')
	const label = card?.querySelector(`[data-burst-time-label="${index}"]`)
	const button = card?.querySelector('[data-action="quick-insert-burst-qt"]')
	if (label) {
		label.textContent = formatTime(timeMs)
	}
	if (button) {
		button.dataset.burstTimeMs = String(timeMs)
	}
}

function insertBurstPackageAtVisibleTimeline(burstIndex) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	const dropInfo = timeline ? timelineDropInfoForVisibleCenter(timeline) : null
	const timeMs = dropInfo?.absoluteTimeMs ?? visibleTimelineCenterMs()
	insertBurstPackageAtMs(burstIndex, timeMs, {phaseInfo: dropInfo})
}

function insertBurstPackageAtTimeline(burstIndex, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const dropLane = timelineDropLaneAtClientPoint(event.clientX, event.clientY) || timelineDropLaneForTarget(event.target)
	if (!canDropBurstPackageOnTimelineLane(dropLane)) {
		setImportError('爆发只能放到爆发行')
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	insertBurstPackageAtMs(burstIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertBurstPackageAtClientPoint(burstIndex, clientX, clientY) {
	if (!canEditTimeline()) {
		return
	}
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		insertBurstPackageAtMs(burstIndex, visibleTimelineCenterMs())
		return
	}
	const dropLane = timelineDropLaneAtClientPoint(clientX, clientY)
	if (!canDropBurstPackageOnTimelineLane(dropLane)) {
		setImportError('爆发只能放到爆发行')
		return
	}
	const dropInfo = dropTimeInfoForClientPoint(clientX, clientY, timelineDragGuideContext(timeline))
	insertBurstPackageAtMs(burstIndex, dropInfo.absoluteTimeMs, {phaseInfo: dropInfo})
}

function insertBurstPackageAtMs(burstIndex, timeMs, options = {}) {
	if (!canEditTimeline()) {
		return
	}
	const burst = burstInsertByIndex(burstIndex)
	if (!burst) {
		setImportError('没有找到这个爆发')
		render()
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const manualId = `manual-burst-${Date.now()}-${state.inserted.length}`
	state.inserted.push({
		id: manualId,
		name: label,
		label,
		type: 'burst-package',
		kind: 'burst-package',
		window,
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		source: 'manual',
		sourceLabel: '用户手动',
		durationMs: Number(burst.durationMs ?? 12000),
		skillCount: burstInsertSkillNames(burst).length,
		items: Array.isArray(burst.items) ? burst.items : [],
		qt: Array.isArray(burst.qt) ? burst.qt : [],
		classification: 'burst',
		output: false,
		potency: 0,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	const timeLabel = manualInsertStatusTime(inserted ?? {timeMs, ...phaseInfo})
	setImportStatus(adjusted > 0 ? `已插入 ${window === '120s' ? '120' : '60'} 爆发，爆发窗口已顺延到 ${timeLabel}` : `已插入 ${window === '120s' ? '120' : '60'} 爆发 到 ${timeLabel}`)
	render()
}

function insertPotionAtMs(potionId, timeMs, options = {}) {
	if (!canEditTimeline()) {
		return
	}
	const potion = potionInsertById(potionId)
	if (!potion) {
		setImportError('没有找到这个爆发药')
		render()
		return
	}
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	const manualId = `manual-potion-${Date.now()}-${state.inserted.length}`
	state.inserted.push({
		id: manualId,
		name: potion.label,
		label: potion.label,
		potionId: potion.potionId,
		attributeId: potion.attributeId,
		attributeLabel: potion.attributeLabel,
		familyLabel: potion.familyLabel,
		cnName: potion.cnName,
		actionId: 'UsePotion',
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		kind: 'potion',
		type: 'potion',
		source: 'manual',
		sourceLabel: '用户手动',
		classification: 'potion',
		output: false,
		potency: 0,
		recastMs: 270000,
		durationMs: 30000,
		count: 1,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	const adjustedByCooldown = adjusted >= 1000
	const timeLabel = manualInsertStatusTime(inserted ?? {timeMs, ...phaseInfo})
	setImportStatus(adjustedByCooldown ? `已插入 ${potion.label}，爆发药冷却已顺延到 ${timeLabel}` : `已插入 ${potion.label} 到 ${timeLabel}`)
	render()
}

function insertSkillAtMs(actionId, timeMs, options = {}) {
	if (!canEditTimeline() || !actionId) {
		return
	}
	const action = actionById(actionId)
	const name = action?.name ?? `技能 ${actionId}`
	const conflict = checkCooldownConflict(actionId, timeMs)
	if (conflict?.conflict) {
		setImportError(conflict.message)
		return
	}
	const classification = classifyImportedAction(actionId, name, 'player-action')
	const manualId = `manual-${Date.now()}`
	const phaseInfo = options.phaseInfo ?? phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	state.inserted.push({
		id: manualId,
		name,
		actionId: String(actionId),
		timeMs,
		requestedTimeMs: timeMs,
		phase: phaseInfo.phaseId === 'all' ? 'global' : phaseInfo.phaseId.toUpperCase(),
		phaseStartMs: phaseInfo.phaseId === 'all' ? undefined : Number(phaseInfo.absoluteTimeMs ?? timeMs) - Number(phaseInfo.phaseTimeMs ?? 0),
		kind: 'player-action',
		source: 'manual',
		target: defaultManualTargetForAction(action, classification.type),
		targetRequired: requiresManualTargetChoice(action, classification.type),
		targetMode: null,
		targetDataId: null,
		classification: classification.type,
		output: Boolean(classification.output),
		potency: classification.output ? Number(classification.potency ?? 0) : 0,
		iconUrl: action?.iconUrl ?? '',
		recastMs: Number(action?.recastMs ?? 0),
		durationMs: Number(classification.effectDurationMs ?? action?.effectDurationMs ?? 0),
		count: 1,
	})
	normalizeManualStateQueue()
	const inserted = state.inserted.find(item => item.id === manualId)
	if (inserted?.targetRequired && !inserted.target) {
		state.pendingTargetPicker = inserted.id
	} else if (state.pendingTargetPicker === manualId) {
		state.pendingTargetPicker = null
	}
	const adjusted = Number(inserted?.cdAdjustedMs ?? 0)
	const timeLabel = manualInsertStatusTime(inserted ?? {timeMs, ...phaseInfo})
	setImportStatus(adjusted > 0 ? `已插入 ${name}，队列已顺延到 ${timeLabel}` : `已插入 ${name} 到 ${timeLabel}`)
	if (options.renderAfterInsert !== false) {
		render()
	}
}

function manualInsertStatusTime(event = {}) {
	const phaseId = event.phase === 'global' ? 'all' : String(event.phase ?? '').toLowerCase()
	if (phaseId && phaseId !== 'all') {
		const phaseInfo = phaseLabelForTime(
			state.model.bossTimeline?.source,
			phaseId,
			Math.max(0, Number(event.timeMs ?? 0) - Number(event.phaseStartMs ?? 0)),
		)
		return `${phaseInfo.phaseLabel} ${formatTime(phaseInfo.phaseTimeMs)} / 全局 ${formatTime(event.timeMs ?? 0)}`
	}
	return formatTime(event.timeMs ?? event.absoluteTimeMs ?? 0)
}

function moveManualSkillAtTimeline(manualId, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	const timeMs = dropInfo.absoluteTimeMs
	const conflict = checkCooldownConflict(item.actionId, timeMs, {excludeId: manualId})
	if (conflict?.conflict) {
		setImportError(conflict.message)
		return
	}
	item.requestedTimeMs = timeMs
	item.timeMs = timeMs
	item.phase = dropInfo.phaseId === 'all' ? 'global' : dropInfo.phaseId.toUpperCase()
	item.phaseStartMs = dropInfo.phaseId === 'all' ? undefined : timeMs - dropInfo.phaseTimeMs
	normalizeManualStateQueue()
	render()
}

function moveExistingTimelineEventAtClientPoint(eventKey, clientX, clientY) {
	const timeline = findTimelineAtClientPoint(clientX, clientY)
	if (!timeline) {
		setImportError('请把技能拖到时间轴上')
		render()
		return
	}
	moveExistingTimelineEventAtTimeline(eventKey, {clientX}, timeline)
}

function moveExistingTimelineEventAtTimeline(eventKey, event, timeline) {
	if (!canEditTimeline()) {
		return
	}
	const targets = editableTimelineEventTargets(eventKey)
	if (!targets.length) {
		setImportError('没有找到可编辑的时间轴技能')
		render()
		return
	}
	const dropInfo = timelineDropInfoForClientX(event.clientX, timeline)
	const target = targets[0]
	if (target?.event?.actionId) {
		const conflict = checkCooldownConflict(target.event.actionId, dropInfo.absoluteTimeMs, {excludeId: target.event.id})
		if (conflict?.conflict) {
			setImportError(conflict.message)
			return
		}
	}
	for (const target of targets) {
		updateTimelineEventPosition(target.event, dropInfo)
	}
	if (targets.some(target => target.event.actionId)) {
		normalizeManualStateQueue()
	}
	setImportStatus(`已调整 ${displayNameForAction(target.event)} 到 ${timelineEventStatusTime(target.event)}`)
	render()
}

function editableTimelineEventTargets(eventKey) {
	const [id, actionId, name, timeMs, kind, classification] = String(eventKey ?? '').split('::').map(part => decodeURIComponent(part))
	const candidates = editableTimelineEventCandidates()
	const events = candidates.filter(item =>
		String(item.id ?? '') === id
		&& String(item.actionId ?? '') === actionId
		&& String(item.name ?? item.label ?? '') === name
		&& Math.round(Number(item.timeMs ?? item.startMs ?? 0)) === Number(timeMs)
		&& String(item.kind ?? '') === kind
		&& String(item.classification ?? item.type ?? '') === classification
	)
	return events.map(event => ({event}))
}

function editableTimelineEventCandidates() {
	const track = state.model?.tracks?.expert ?? {}
	return [
		...(track.player ?? []),
		...(track.mitigation ?? []),
		...(track.qt ?? []),
		...(track.burst ?? []).flatMap(burst => burst.items ?? []),
		...(state.model?.detailPanels ?? []).flatMap(panel => panel.events ?? []),
	].filter(canEditTimelineItem)
}

function updateTimelineEventPosition(event, dropInfo) {
	const timeMs = dropInfo.absoluteTimeMs
	event.requestedTimeMs = timeMs
	event.timeMs = timeMs
	event.startMs = timeMs
	event.phase = dropInfo.phaseId === 'all' ? 'global' : dropInfo.phaseId.toUpperCase()
	event.phaseStartMs = dropInfo.phaseId === 'all' ? undefined : timeMs - dropInfo.phaseTimeMs
	if (Number(event.durationMs ?? 0) > 0) {
		event.endMs = timeMs + Number(event.durationMs)
	}
}

function timelineEventStatusTime(event = {}) {
	const phaseId = event.phase === 'global' ? 'all' : String(event.phase ?? '').toLowerCase()
	if (phaseId && phaseId !== 'all') {
		const relativeMs = Math.max(0, Number(event.timeMs ?? event.startMs ?? 0) - Number(event.phaseStartMs ?? 0))
		const phaseInfo = phaseLabelForTime(state.model.bossTimeline?.source, phaseId, relativeMs)
		return `${phaseInfo.phaseLabel} ${formatTime(phaseInfo.phaseTimeMs)} / 全局 ${formatTime(event.timeMs ?? event.startMs ?? 0)}`
	}
	return formatTime(event.timeMs ?? event.startMs ?? 0)
}

function updateManualSkillTime(manualId, secondsValue) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	const seconds = Number(secondsValue)
	if (!Number.isFinite(seconds)) {
		setImportError('时间必须是数字秒数')
		return
	}
	const clamped = clampMsToCurrentPhase(seconds * 1000)
	const conflict = checkCooldownConflict(item.actionId, clamped.absoluteTimeMs, {excludeId: manualId})
	if (conflict?.conflict) {
		setImportError(conflict.message)
		return
	}
	item.requestedTimeMs = clamped.absoluteTimeMs
	item.timeMs = clamped.absoluteTimeMs
	item.phase = clamped.phaseId === 'all' ? 'global' : clamped.phaseId.toUpperCase()
	item.phaseStartMs = clamped.phaseId === 'all' ? undefined : clamped.phaseStartMs
	normalizeManualStateQueue()
	setImportStatus(`已调整 ${item.name} 到 ${manualInsertStatusTime(item)}${hasMeaningfulCdAdjustment(item) ? '（队列已顺延）' : ''}`)
	render()
}

function updateManualSkillTarget(manualId, value) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	item.target = String(value ?? '')
	if (state.pendingTargetPicker === manualId && item.target) {
		state.pendingTargetPicker = null
	}
	if (item.target) {
		setImportStatus(`已设置 ${item.name} 目标为 ${item.target}`)
	} else if (item.targetRequired) {
		setImportError(`${item.name} 需要指定目标`)
	}
	render()
}

function updateDetailEventTarget(detailKey, value) {
	if (!canEditTimeline()) {
		return
	}
	const target = editableDetailEventTarget(detailKey)
	if (!target?.event || !canEditDetailTarget(target.panel, target.event)) {
		return
	}
	target.event.target = String(value ?? '')
	if (target.event.target) {
		setImportStatus(`已设置 ${displayNameForAction(target.event)} 目标为 ${target.event.target}`)
	} else if (target.event.targetRequired) {
		setImportError(`${displayNameForAction(target.event)} 需要指定目标`)
	}
	render()
}

function updateDetailEventTime(manualId, secondsValue) {
	if (!canEditTimeline()) {
		return
	}
	const target = editableDetailEventTarget(manualId)
	if (!target?.event) {
		return
	}
	const seconds = Number(secondsValue)
	if (!Number.isFinite(seconds)) {
		setImportError('时间必须是数字秒数')
		return
	}
	const clamped = clampMsToCurrentPhase(seconds * 1000)
	target.event.requestedTimeMs = clamped.absoluteTimeMs
	target.event.timeMs = clamped.absoluteTimeMs
	target.event.startMs = clamped.absoluteTimeMs
	target.event.phase = clamped.phaseId === 'all' ? 'global' : clamped.phaseId.toUpperCase()
	target.event.phaseStartMs = clamped.phaseId === 'all' ? undefined : clamped.phaseStartMs
	const durationMs = Number(target.event.durationMs ?? 0)
	if (durationMs > 0) {
		target.event.endMs = clamped.absoluteTimeMs + durationMs
	}
	if (target.manual) {
		normalizeManualStateQueue()
	}
	setImportStatus(`已调整 ${displayNameForAction(target.event)} 到 ${detailEventTimeLabel(target.event)}`)
	render()
}

function editableDetailEventTarget(detailKey) {
	const parts = String(detailKey ?? '').split('::').map(part => decodeURIComponent(part))
	const [panelId, id, actionId, timeMs, indexValue] = parts
	const panel = resolveDetailPanelById(panelId)
	if (!panel) {
		return null
	}
	const events = detailPanelEvents(panel)
	const exactIndex = Number(indexValue)
	const event = events[exactIndex] ?? events.find(item =>
		String(item.manualId ?? item.id ?? '') === id
		&& String(item.actionId ?? '') === actionId
		&& Math.round(Number(item.timeMs ?? item.startMs ?? 0)) === Number(timeMs)
	)
	if (!event || !canEditDetailEvent(panel, event)) {
		return null
	}
	if (event.manualId) {
		const manual = state.inserted.find(item => item.id === event.manualId)
		if (manual) {
			return {event: manual, panel, manual: true}
		}
	}
	return {event, panel, manual: false}
}

function resolveDetailPanelById(panelId) {
	const panel = state.model.detailPanels.find(item => item.id === panelId)
	if (panel) {
		return panel
	}
	if (panelId === 'qt') {
		return virtualDetailPanel('qt', 'QT 控制', qtDetailEvents())
	}
	return null
}

function nudgeManualSkill(manualId, deltaMs) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item || !Number.isFinite(deltaMs)) {
		return
	}
	const basePhaseMs = state.phase === 'all'
		? Number(item.requestedTimeMs ?? item.timeMs ?? 0)
		: phaseRelativeMsForEvent(item)
	const clamped = clampMsToCurrentPhase(basePhaseMs + deltaMs)
	item.requestedTimeMs = clamped.absoluteTimeMs
	item.timeMs = clamped.absoluteTimeMs
	item.phase = clamped.phaseId === 'all' ? 'global' : clamped.phaseId.toUpperCase()
	item.phaseStartMs = clamped.phaseId === 'all' ? undefined : clamped.phaseStartMs
	normalizeManualStateQueue()
	setImportStatus(`已微调 ${item.name} 到 ${manualInsertStatusTime(item)}${hasMeaningfulCdAdjustment(item) ? '（队列已顺延）' : ''}`)
	render()
}

function duplicateManualSkill(manualId) {
	if (!canEditTimeline()) {
		return
	}
	const item = state.inserted.find(entry => entry.id === manualId)
	if (!item) {
		return
	}
	const copy = {
		...item,
		id: `manual-${Date.now()}-${state.inserted.length}`,
		requestedTimeMs: Number(item.requestedTimeMs ?? item.timeMs ?? 0) + 1000,
		timeMs: Number(item.requestedTimeMs ?? item.timeMs ?? 0) + 1000,
		source: 'manual',
	}
	state.inserted = [...state.inserted, copy]
	normalizeManualStateQueue()
	setImportStatus(`已复制 ${copy.name} 到 ${formatTime(copy.timeMs)}${hasMeaningfulCdAdjustment(copy) ? '（队列已顺延）' : ''}`)
	render()
}

function removeManualSkill(manualId) {
	if (!canEditTimeline()) {
		return
	}
	if (!manualId) {
		return
	}
	state.inserted = state.inserted.filter(entry => entry.id !== manualId)
	normalizeManualStateQueue()
	render()
}

function timelineMsForDrop(event, timeline) {
	return timelineMsForClientPoint(event.clientX, timeline)
}

function timelineMsForClientPoint(clientX, timeline, context = null) {
	const durationMs = Number(context?.maxTime ?? 0) || timelineDurationMs(buildVisualTimelineRows(state.model.tracks.expert).filter(row => !row.html), state.model.bossTimeline?.source, state.phase)
	const rect = timeline.getBoundingClientRect()
	return timelineMsFromClientX({
		clientX,
		containerLeft: context?.trackLeft ?? rect.left,
		scrollLeft: context ? 0 : timeline.scrollLeft,
		scrollWidth: context?.trackWidth ?? timeline.scrollWidth,
		durationMs,
	})
}

function timelineDropInfoForClientX(clientX, timeline, context = null) {
	const phaseTimeMs = timelineMsForClientPoint(clientX, timeline, context)
	const phaseInfo = phaseLabelForTime(state.model.bossTimeline?.source, state.phase, phaseTimeMs)
	return {
		...phaseInfo,
		absoluteTimeMs: absoluteMsForPhaseTime(state.model.bossTimeline?.source, state.phase, phaseTimeMs),
	}
}

function findCurrentJobActionByName(name = '') {
	const normalizedName = String(name).trim()
	if (!normalizedName) {
		return null
	}
	return state.model.skillDatabase?.skills?.find(skill =>
		skill.job === state.job && (normalizedName.includes(skill.name) || skill.name.includes(normalizedName))
	) ?? null
}

function visibleTimelineCenterMs() {
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		return 90000 + state.inserted.length * 8000
	}
	return timelineDropInfoForVisibleCenter(timeline).absoluteTimeMs
}

function timelineDropInfoForVisibleCenter(timeline) {
	const rect = timeline.getBoundingClientRect()
	return timelineDropInfoForClientX(rect.left + timeline.clientWidth / 2, timeline)
}

async function importDefaultTimeline(sourceId) {
	const source = DEFAULT_TIMELINE_IMPORTS.find(item => item.id === sourceId)
	if (!source) {
		return
	}
	setImportStatus(`正在导入 ${source.label}...`)
	try {
		const response = await fetch(source.url)
		if (!response.ok) {
			throw new Error(`导入失败：HTTP ${response.status}`)
		}
		const timelineJson = await response.json()
		const imported = applyImportedTimeline(timelineJson, source.label)
		setImportStatus(`已导入 ${source.label}（${imported.timelineKindLabel}）`)
	} catch (error) {
		setImportError(`导入 ${source.label} 失败：${errorMessage(error)}`)
	}
}

async function importTimelineFile(file) {
	if (!file) {
		return
	}
	setImportStatus(`正在导入 ${file.name}...`)
	try {
		const timelineJson = JSON.parse(await file.text())
		const imported = applyImportedTimeline(timelineJson, file.name)
		setImportStatus(`已导入 ${file.name}（${imported.timelineKindLabel}）`)
	} catch (error) {
		setImportError(`导入 ${file.name} 失败：${errorMessage(error)}`)
	}
}

function applyImportedTimeline(timelineJson, sourceLabel = '本地导入') {
	const imported = buildImportedTimelineModel(timelineJson, sourceLabel)
	const model = state.model
	state.job = imported.jobId
	state.acr = imported.acrName
	state.phase = 'all'
	resetTimelineRowVisibility()
	state.focusedSkills = imported.focusedSkills ?? []
	state.inserted = (imported.manual ?? []).map(event => ({
		...event,
		requestedTimeMs: Number(event.requestedTimeMs ?? event.timeMs ?? 0),
	}))
	normalizeManualStateQueue()
	state.currentTimelineJson = timelineJson
	model.encounter = {
		...model.encounter,
		name: imported.name,
		territoryId: imported.territoryId,
		jobId: imported.jobNumericId,
		job: imported.jobId,
		opener: imported.opener,
		timelineKind: imported.timelineKind,
		timelineKindLabel: imported.timelineKindLabel,
	}
	model.tracks.beginner = {
		...model.tracks.beginner,
		boss: imported.tracks.beginner.boss,
		mitigation: imported.tracks.beginner.mitigation,
		burst: imported.tracks.beginner.burst,
		qt: imported.tracks.beginner.qt,
	}
	model.tracks.expert = {
		...model.tracks.expert,
		boss: imported.tracks.expert.boss,
		player: imported.tracks.expert.player,
		mitigation: imported.tracks.expert.mitigation,
		burst: imported.tracks.expert.burst,
		qt: imported.tracks.expert.qt,
	}
	const acrSimulation = buildAcrSimulationForImportedJob(imported)
	model.acrSimulation = acrSimulation
	model.tracks.beginner.simulated = acrSimulation.events.slice(0, 64)
	model.tracks.expert.simulated = acrSimulation.events
	model.timelineRows = mergeImportedRowsWithBossTimeline(imported.timelineRows)
	model.detailPanels = imported.detailPanels
	model.damage.events = imported.damageEvents.length ? imported.damageEvents : model.acrSimulation.events.filter(event => event.output)
	model.shareCard = {
		...model.shareCard,
		timelineName: imported.name,
		title: '分享预览',
		subtitle: `${sourceLabel} / ${imported.timelineKindLabel} / ${imported.jobName} / ${imported.acrName}`,
	}
	render()
	return imported
}

async function loadFflogsComparison(options = {}) {
	if (!state.fflogsUrl.trim()) {
		state.fflogsError = '请输入 FFLogs 链接'
		state.fflogsStatus = ''
		render()
		return
	}
	if (!options.silent) {
		state.fflogsStatus = '正在解析 FFLogs 链接并读取本地缓存...'
		state.fflogsError = ''
		render()
	}
	try {
		const response = await fetch('/api/fflogs/compare', {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				link: state.fflogsUrl,
				currentJob: state.job,
				actorId: options.actorId ?? state.fflogsActorId,
				simulatedEvents: fflogsComparisonEvents(),
				critRate: Number(state.critRate) / 100,
				directRate: Number(state.directRate) / 100,
				luck: state.luck,
				targetGcdUtilizationPercent: Number(state.fflogsTargetGcdUtilization),
			}),
		})
		const payload = await response.json()
		if (!response.ok || payload.error) {
			throw new Error(payload.error || `HTTP ${response.status}`)
		}
		state.fflogsComparison = payload
		state.fflogsActorId = String(payload.selectedActor?.id ?? '')
		state.fflogsStatus = ''
		state.fflogsError = ''
		render()
	} catch (error) {
		state.fflogsStatus = ''
		state.fflogsError = `FFLogs 解析失败：${errorMessage(error)}`
		render()
	}
}

function setFflogsTargetGcdUtilization(value, options = {}) {
	state.fflogsTargetGcdUtilization = clampPercent(value)
	if (state.fflogsComparison) {
		loadFflogsComparison({silent: true})
	} else if (!options.silent) {
		render()
	}
}

function setImportStatus(message) {
	state.importStatus = message
	state.importError = ''
	render()
}

function setImportError(message) {
	state.importError = message
	state.importStatus = ''
	render()
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error ?? '未知错误')
}

function buildImportedTimelineModel(timelineJson, sourceLabel) {
	if (timelineJson && timelineJson.schemaVersion === 1) {
		return buildModelFromExportTimeline(timelineJson, sourceLabel)
	}
	const timelineKind = detectTimelineImportKind(timelineJson)
	const meta = timelineJson.Meta ?? {}
	const job = jobFromTimelineMeta(meta)
	const events = flattenImportedTimeline(timelineJson, timelineKind)
	const tracks = buildImportedModeTracks(events)
	const timelineRows = buildImportedTimelineRows(events)
	const damageEvents = events.filter(event => event.output)
	const shouldBuildOpenerPanel = timelineKind.id !== 'ptl'
	const importedOpenerEvents = shouldBuildOpenerPanel ? importedNativeOpenerEvents(events) : []
	const openerPanel = buildImportedOpenerPanel({meta, sourceLabel, job, importedOpenerEvents, allowFallback: shouldBuildOpenerPanel})
	return {
		name: meta.Name ?? sourceLabel,
		territoryId: meta.TerritoryId ?? state.model.encounter.territoryId,
		jobId: job.id,
		jobNumericId: job.jobId,
		jobName: job.name,
		acrName: meta.AcrAuthor ?? meta.Author ?? defaultAcrForJob(job.id),
		opener: meta.Opener ?? '手动填写起手',
		timelineKind: timelineKind.id,
		timelineKindLabel: timelineKind.label,
		events,
		tracks,
		timelineRows,
		damageEvents,
		detailPanels: [
			{id: 'mitigation', label: '减伤 / 奶轴', events: tracks.beginner.mitigation},
			{id: 'damage', label: '输出轴', events: damageEvents.slice(0, 36)},
			{id: 'potion', label: '爆发药轴', events: tracks.expert.player.filter(event => event.kind === 'potion' || /爆发药/.test(event.name))},
			openerPanel,
		],
	}
}

function importedNativeOpenerEvents(events = []) {
	return events
		.filter(event => ['player-action', 'potion'].includes(event.kind))
		.filter(event => Number(event.timeMs ?? 0) <= 24000)
		.filter(isLikelyImportedOpenerEvent)
		.map(event => ({
			...event,
			classification: event.classification ?? 'opener',
			opener: true,
		}))
}

function isLikelyImportedOpenerEvent(event = {}) {
	return event.kind === 'potion'
		|| event.output
		|| event.classification === 'damage'
		|| Number(event.potency ?? 0) > 0
}

function buildImportedOpenerPanel({meta = {}, sourceLabel = '本地导入', job = {}, importedOpenerEvents = [], allowFallback = true} = {}) {
	const fallback = allowFallback ? openerFallbackForImportedJob(job.id) : {events: []}
	const hasImportedOpener = importedOpenerEvents.length > 0
	return {
		id: 'opener',
		label: '起手',
		title: meta.Opener ?? fallback.title ?? '导入起手',
		source: hasImportedOpener ? sourceLabel : fallback.source ?? sourceLabel,
		events: hasImportedOpener ? importedOpenerEvents : fallback.events,
	}
}

function openerFallbackForImportedJob(jobId) {
	const storedOpener = state.baseAcrOpeners?.[jobId] ?? state.model?.acrOpeners?.[jobId]
	if (storedOpener?.events?.length) {
		return {
			title: storedOpener.source?.name,
			source: storedOpener.source?.source ?? storedOpener.source?.acr ?? 'ACR 起手',
			events: storedOpener.events.map(event => openerDetailEvent({...event})),
		}
	}
	const baseSimulation = Array.isArray(state.baseAcrSimulation?.events) && state.baseAcrSimulation?.source?.job === jobId
		? state.baseAcrSimulation
		: null
	return {
		title: baseSimulation?.source?.name,
		source: baseSimulation?.source?.mode ?? 'ACR 模拟',
		events: (baseSimulation?.events ?? [])
			.filter(event => Number(event.timeMs ?? 0) <= 24000)
			.map(event => openerDetailEvent({...event, source: event.source ?? baseSimulation.source?.acr ?? 'ACR 模拟'})),
	}
}

function buildModelFromExportTimeline(timelineJson, sourceLabel) {
	const meta = timelineJson.meta ?? {}
	const job = jobFromExportMeta(meta)
	const boss = importExportedEvents(timelineJson.boss ?? [], 'boss-cast')
	const player = importExportedEvents(timelineJson.player ?? [], 'player-action')
	const mitigation = importExportedEvents(timelineJson.mitigation ?? timelineJson.categories?.mitigation ?? [], 'player-action')
	const qt = Array.isArray(timelineJson.qt) ? timelineJson.qt.map(item => ({...item})) : []
	const burst = buildBurstGroupsFromExport(timelineJson.burstPackages, player)
	const manual = importExportedEvents(timelineJson.manual ?? [], 'player-action').map((event, index) => ({
		...event,
		id: event.id || `manual-${Date.now()}-${index}`,
		source: 'manual',
	}))
	const allPlayer = [...player, ...manual]
	const damageEvents = importExportedEvents(timelineJson.output ?? timelineJson.categories?.output ?? [], 'player-action')
	const openerEvents = importExportedEvents(timelineJson.opener?.events ?? [], 'player-action')
	return {
		name: meta.name ?? sourceLabel,
		territoryId: meta.territoryId ?? state.model.encounter.territoryId,
		jobId: job.id,
		jobNumericId: job.jobId,
		jobName: job.name,
		acrName: meta.acr ?? defaultAcrForJob(job.id) ?? '未指定',
		opener: timelineJson.opener?.title ?? state.model.encounter.opener ?? '手动填写起手',
		timelineKind: 'webtimeline',
		timelineKindLabel: 'WebTimeline 导出',
		events: [...boss, ...allPlayer],
		manual,
		focusedSkills: Array.isArray(timelineJson.focusedSkills) ? timelineJson.focusedSkills.map(String) : [],
		tracks: {
			beginner: {
				boss: boss.slice(0, 18),
				mitigation: mitigation.slice(0, 16),
				burst,
				qt: qt.slice(0, 18),
			},
			expert: {
				boss,
				player: allPlayer,
				mitigation,
				burst,
				qt,
			},
		},
		timelineRows: buildImportedTimelineRows([...boss, ...allPlayer]),
		damageEvents,
		detailPanels: [
			{id: 'mitigation', label: '减伤 / 奶轴', events: mitigation},
			{id: 'damage', label: '输出轴', events: damageEvents.slice(0, 36)},
			{id: 'potion', label: '爆发药轴', events: allPlayer.filter(event => event.kind === 'potion' || event.classification === 'potion')},
			{id: 'opener', label: '起手', title: timelineJson.opener?.title ?? '导入起手', source: timelineJson.opener?.source ?? sourceLabel, events: openerEvents},
		],
	}
}

function buildAcrSimulationForImportedJob(imported = {}) {
	const baseEvents = Array.isArray(state.baseAcrSimulation?.events) ? state.baseAcrSimulation.events : []
	if (baseEvents.length && state.baseAcrSimulation?.source?.job === imported.jobId) {
		return state.baseAcrSimulation
	}
	const durationMs = importedTimelineDurationMs(imported)
	const fallbackEvents = buildFallbackAcrSimulationEvents(imported, durationMs)
	return {
		source: {
			acr: imported.acrName,
			job: imported.jobId,
			mode: '导入轴职业模拟',
			name: `${imported.acrName} ${imported.jobName} ACR 模拟输出循环`,
			generatedAt: new Date().toISOString(),
			durationMs,
			fallback: true,
		},
		events: fallbackEvents,
	}
}

function buildFallbackAcrSimulationEvents(imported = {}, durationMs = 600000) {
	const profile = acrSimulationProfileForJob(imported.jobId)
	const gcdAction = actionById(profile.gcdActionId) ?? currentJobOutputActions(imported).find(action => action.gcd || action.name === profile.gcdName)
	const dotAction = actionById(profile.dotActionId)
	const spenderAction = actionById(profile.spenderActionId)
	const ogcdActions = profile.ogcdActionIds.map(actionById).filter(Boolean)
	const events = []
	let sequence = 0
	let nextDotMs = 0
	let nextSpenderMs = profile.spenderOffsetMs
	const gcdStepMs = profile.gcdStepMs
	for (let timeMs = 0; timeMs <= durationMs; timeMs += gcdStepMs) {
		let action = gcdAction
		if (dotAction && timeMs >= nextDotMs) {
			action = dotAction
			nextDotMs = timeMs + profile.dotRefreshMs
		} else if (spenderAction && timeMs >= nextSpenderMs) {
			action = spenderAction
			nextSpenderMs = timeMs + profile.spenderIntervalMs
		}
		if (action) {
			events.push(acrSimulationEventFromAction({
				action,
				imported,
				timeMs,
				sequence: ++sequence,
				skillType: 'GCD',
				weave: 'gcd',
				potency: profile.potencyByActionId?.[String(action.id)] ?? action.potency ?? profile.defaultGcdPotency,
			}))
		}
		for (const ogcdAction of ogcdActions) {
			const intervalMs = (profile.ogcdIntervals?.[String(ogcdAction.id)] ?? Number(ogcdAction.recastMs ?? 60000)) || 60000
			const offsetMs = profile.ogcdOffsets?.[String(ogcdAction.id)] ?? 700
			if (timeMs > 0 && (timeMs - offsetMs) % intervalMs < gcdStepMs) {
				events.push(acrSimulationEventFromAction({
					action: ogcdAction,
					imported,
					timeMs: timeMs + offsetMs,
					sequence: ++sequence,
					skillType: 'oGCD',
					weave: 'ogcd',
					potency: profile.potencyByActionId?.[String(ogcdAction.id)] ?? ogcdAction.potency ?? profile.defaultOgcdPotency,
				}))
			}
		}
	}
	return events.sort((left, right) => Number(left.timeMs ?? 0) - Number(right.timeMs ?? 0))
}

function acrSimulationEventFromAction({action, imported, timeMs, sequence, skillType, weave, potency}) {
	const phase = phaseLabelForTime(state.model.bossTimeline?.source, 'all', timeMs)
	return {
		id: `acr-${imported.jobId.toLowerCase()}-sim-${sequence}`,
		kind: 'player-action',
		source: `${imported.acrName} ACR`,
		acr: imported.acrName,
		job: imported.jobId,
		simulated: true,
		phase: phase.phaseLabel,
		phaseStartMs: Number(action.phaseStartMs ?? 0),
		timeMs,
		name: action.name,
		actionId: action.id,
		skillType,
		weave,
		target: 'target',
		classification: 'damage',
		output: true,
		potency: Number(potency ?? 0),
		durationMs: 0,
		iconUrl: action.iconUrl ?? '',
		count: 1,
	}
}

function acrSimulationProfileForJob(jobId) {
	const profiles = {
		WHM: {
			gcdActionId: 37009,
			gcdName: '闪飒',
			dotActionId: 16532,
			spenderActionId: 16535,
			ogcdActionIds: [3571],
			gcdStepMs: 2500,
			dotRefreshMs: 30000,
			spenderOffsetMs: 45000,
			spenderIntervalMs: 60000,
			defaultGcdPotency: 310,
			defaultOgcdPotency: 400,
			potencyByActionId: {
				16532: 80,
				16535: 1240,
				25859: 310,
				37009: 310,
				3571: 400,
			},
			ogcdIntervals: {
				3571: 40000,
			},
			ogcdOffsets: {
				3571: 700,
			},
		},
	}
	return profiles[jobId] ?? {
		gcdActionId: null,
		gcdName: '',
		dotActionId: null,
		spenderActionId: null,
		ogcdActionIds: [],
		gcdStepMs: 2500,
		dotRefreshMs: 30000,
		spenderOffsetMs: 60000,
		spenderIntervalMs: 60000,
		defaultGcdPotency: 300,
		defaultOgcdPotency: 450,
		potencyByActionId: {},
		ogcdIntervals: {},
		ogcdOffsets: {},
	}
}

function currentJobOutputActions(imported = {}) {
	return (state.model.skillDatabase?.skills ?? [])
		.filter(action => action.job === imported.jobId)
		.filter(action => action.output || Number(action.potency ?? 0) > 0)
}

function importedTimelineDurationMs(imported = {}) {
	const events = [
		...(imported.tracks?.expert?.boss ?? []),
		...(imported.tracks?.expert?.player ?? []),
		...(imported.tracks?.expert?.mitigation ?? []),
	]
	const eventDurationMs = Math.max(...events.map(event => Number(event.timeMs ?? event.startMs ?? 0) + Number(event.durationMs ?? 0)), 0)
	const bossDurationMs = Number(state.model?.bossTimeline?.source?.lastSecond ?? 0) * 1000
	return Math.max(eventDurationMs, bossDurationMs, 600000)
}

function jobFromExportMeta(meta = {}) {
	const jobId = String(meta.job ?? '').toUpperCase()
	const numericId = Number(meta.jobId ?? 0)
	return state.model.acrDatabase.jobs.find(job => job.id === jobId)
		?? state.model.acrDatabase.jobs.find(job => Number(job.jobId) === numericId)
		?? state.model.acrDatabase.jobs.find(job => job.id === state.job)
		?? state.model.acrDatabase.jobs[0]
}

function importExportedEvents(events = [], fallbackKind = 'player-action') {
	return (Array.isArray(events) ? events : []).map((event, index) => {
		const action = actionById(event.actionId)
		const timeMs = Number(event.timeMs ?? event.startMs ?? 0)
		const durationMs = importedEventDurationMs(event, action, fallbackKind)
		const classification = event.classification ?? action?.type ?? 'unknown'
		const targetRequired = Boolean(event.targetRequired ?? requiresManualTargetChoice(action, classification))
		return {
			id: event.id || `export-${fallbackKind}-${index}`,
			phase: event.phase ?? 'global',
			phaseStartMs: event.phaseStartMs,
			timeMs,
			kind: event.kind ?? fallbackKind,
			name: event.name ?? event.label ?? action?.name ?? '未命名技能',
			timelineLabel: event.timelineLabel ?? '',
			source: event.source ?? '导入',
			actionId: event.actionId ?? '',
			target: event.target ?? '',
			targetRequired,
			targetMode: event.targetMode ?? null,
			targetDataId: event.targetDataId ?? null,
			classification,
			output: Boolean(event.output ?? action?.output),
			potency: Number(event.potency ?? action?.potency ?? 0),
			damage: Number(event.damage ?? 0),
			durationMs,
			castDurationMs: event.castDurationMs ?? durationMs,
			iconUrl: event.iconUrl ?? action?.iconUrl ?? '',
			count: Number(event.count ?? 1),
		}
	})
}

function importedEventDurationMs(event = {}, action = null, fallbackKind = 'player-action') {
	const explicitDurationMs = Number(event.durationMs ?? 0)
	if (explicitDurationMs > 0) {
		return explicitDurationMs
	}
	const startMs = Number(event.startMs ?? event.timeMs ?? 0)
	const inferredDurationMs = Math.max(0, Number(event.endMs ?? startMs) - startMs)
	if (inferredDurationMs > 0) {
		return inferredDurationMs
	}
	if (fallbackKind === 'boss-cast') {
		return 0
	}
	return Number(action?.effectDurationMs ?? 0) || 0
}

function buildBurstGroupsFromExport(burstPackages, playerEvents) {
	if (Array.isArray(burstPackages) && burstPackages.length) {
		return burstPackages.map((packageItem, index) => {
			const startMs = Number(packageItem.startMs ?? 0)
			const inferredDurationMs = Math.max(0, Number(packageItem.endMs ?? 0) - startMs)
			const durationMs = Number(packageItem.durationMs ?? inferredDurationMs) || 12000
			const window = burstWindowForTime(packageItem, startMs, index)
			return {
				window,
				name: burstLabelForWindow(window),
				timeMs: startMs,
				durationMs,
				source: 'import',
				sourceLabel: packageItem.sourceLabel ?? '导入',
				qt: [],
				items: packageItem.expandedItems ?? [],
			}
		})
	}
	return buildImportedBurstGroups(playerEvents)
}

function flattenImportedTimeline(timelineJson, timelineKind = detectTimelineImportKind(timelineJson)) {
	const bossCasts = collectBossCastItems(state.model.timelineRows)
	const flattenTimeline = timelineKind.id === 'ptl' ? flattenPtlTimeline : flattenPrTimeline
	const {events} = flattenTimeline(timelineJson, {
		resolveConditionTimeMs: (condition, cursorMs) => resolveBossCastConditionTimeMs(condition, cursorMs, bossCasts),
		shouldBlockOnUnresolvedCondition: ({conditions}) => conditions.some(isBlockingImportedCondition),
		actionRecastMs: ({action}) => Number(actionById(action?.ActionId)?.recastMs ?? 0),
		delayEvent: ({node, durationMs}) => ({
			kind: 'delay',
			name: node.Name ?? '延迟',
			source: 'timeline',
			durationMs,
		}),
		conditionEvent: ({node, condition}) => {
			const isCast = condition?.Type === 'CastStart'
			const actionId = condition?.ActionId ?? condition?.Regex
			const duration = parseCastDuration(node.Name)
			return {
				kind: isCast ? 'boss-cast' : condition?.Type === 'Weather' ? 'phase-sync' : 'condition',
				name: cleanImportedName(node.Name),
				source: 'boss',
				actionId,
				damage: isCast ? BOSS_DAMAGE_HINTS.get(String(actionId)) ?? 0 : 0,
				castDurationMs: duration,
				castStartLabel: isCast ? '读条' : '',
				castEndLabel: isCast ? '结束' : '',
			}
		},
		actionEvents: ({node, action}) => {
			const actionId = action.ActionId ?? action.Type
			const kind = action.Type === 'BatchTriggerQt' ? 'qt-control' : action.Type === 'UsePotion' ? 'potion' : 'player-action'
			const name = importedActionName(node.Name, action)
			const classification = classifyImportedAction(actionId, name, kind)
			const actionRecord = Number(actionId) ? actionById(actionId) : null
			const timelineLabel = cleanImportedName(node.Name)
			return [{
				kind,
				name,
				timelineLabel: timelineLabel === name ? '' : timelineLabel,
				source: 'timeline',
				actionId,
				target: action.Target ?? '',
				targetMode: action.TargetMode ?? null,
				targetDataId: action.TargetDataId ?? null,
				targetRequired: requiresManualTargetChoice(actionRecord, classification.type),
				highPriority: Boolean(action.HighPriority),
				skillType: action.SkillType ?? action.Type,
				qtStates: action.QtStates ?? [],
				classification: classification.type,
				output: classification.output,
				potency: classification.potency,
				durationMs: classification.effectDurationMs ?? 0,
				recastMs: Number(actionRecord?.recastMs ?? 0),
				iconUrl: actionRecord?.iconUrl ?? '',
				count: 1,
			}]
		},
	})
	return timelineKind.id === 'ptl'
		? tagEventsByPhaseWindows(events, state.model.bossTimeline?.source)
		: normalizePhaseTaggedEvents(events, state.model.bossTimeline?.source)
}

function isBlockingImportedCondition(condition = {}) {
	return String(condition.Type ?? '').toLowerCase() === 'caststart'
}

function buildImportedModeTracks(events) {
	const boss = events.filter(event => event.kind === 'boss-cast')
	const player = events.filter(event => ['player-action', 'potion', 'qt-control'].includes(event.kind))
	const mitigation = filterCooldownConflictingTimelineItems(player.filter(event => event.classification === 'mitigation' || event.classification === 'healing'))
	const burst = buildImportedBurstGroups(player)
	return {
		beginner: {
			boss: boss.filter((_, index) => index % 2 === 0).slice(0, 18),
			mitigation: mitigation.slice(0, 16),
			burst,
			qt: collectImportedQtControls(player).slice(0, 18),
		},
		expert: {
			boss,
			player,
			mitigation,
			burst,
			qt: collectImportedQtControls(player),
		},
	}
}

function buildImportedTimelineRows(events) {
	const playerActions = events
		.filter(event => event.kind === 'player-action')
		.filter(event => !isCoverageTimelineEvent(event))
		.map(event => importedActionItem(event, 'action'))
	const mitigationActions = filterCooldownConflictingTimelineItems(events
		.filter(event => event.kind === 'player-action')
		.filter(isCoverageTimelineEvent))
		.map(event => importedActionItem(event, 'action'))
	const qtPotion = events
		.filter(event => event.kind === 'qt-control' || event.kind === 'potion')
		.map(event => importedActionItem(event, event.kind === 'potion' ? 'potion' : 'qt'))
	return [
		{id: 'player-actions', label: 'Player Actions', accent: 'mint', items: playerActions.slice(0, 160)},
		{id: 'mitigation-actions', label: '减伤 / 奶轴', accent: 'mint', items: mitigationActions.slice(0, 160)},
		{id: 'qt-potion', label: 'QT / Potion', accent: 'violet', items: qtPotion.slice(0, 80)},
		{id: 'manual-insert', label: 'Manual Insert', accent: 'orange', items: []},
	]
}

function mergeImportedRowsWithBossTimeline(importedRows) {
	const bossRows = (state.model.timelineRows ?? []).filter(row => {
		const id = row.groupId ?? row.id
		return id === 'boss' || id === 'boss-casts' || id === 'boss-damage'
	})
	return [...bossRows, ...importedRows]
}

function buildImportedBurstGroups(playerEvents) {
	const burstEvents = playerEvents.filter(event => event.kind === 'potion' || event.kind === 'qt-control' || /爆发药|爆发|弗雷|血乱|倾泻/.test(event.name))
	const windows = []
	for (let startMs = 0; startMs <= Math.max(180000, ...burstEvents.map(event => event.timeMs)); startMs += 60000) {
		const items = burstEvents.filter(event => event.timeMs >= startMs && event.timeMs < startMs + 60000)
		windows.push({
			window: startMs % 120000 === 0 ? '120s' : '60s',
			name: startMs % 120000 === 0 ? '120 爆发' : '60 爆发',
			timeMs: startMs,
			qt: items.slice(0, 5).map(event => event.name),
		})
	}
	return windows.slice(0, 8)
}

function collectImportedQtControls(events) {
	const controls = []
	for (const event of events) {
		if (event.kind === 'qt-control' && event.qtStates?.length) {
			for (const item of event.qtStates) {
				controls.push({
					name: item.Name,
					enabled: Boolean(item.Enabled),
					timeMs: event.timeMs,
				})
			}
		}
	}
	return controls
}

function importedActionItem(event, fallbackType) {
	const durationMs = Number(event.durationMs ?? 0) > 0 ? Number(event.durationMs) : fallbackType === 'qt' ? 2500 : 1600
	const type = event.classification === 'dot'
		? 'dot'
		: event.classification === 'mitigation' || event.classification === 'healing' ? event.classification : fallbackType
	const label = displayNameForAction(event)
	return {
		id: event.id,
		type,
		label,
		timelineLabel: event.timelineLabel || (label !== event.name ? event.name : ''),
		startMs: event.timeMs,
		endMs: event.timeMs + durationMs,
		timeLabel: formatTime(event.timeMs),
		actionId: event.actionId,
		potency: event.potency ?? 0,
		target: event.target,
		durationMs,
		recastMs: event.recastMs ?? actionById(event.actionId)?.recastMs ?? 0,
		classification: event.classification,
		iconUrl: event.iconUrl ?? '',
		phase: event.phase,
		phaseStartMs: event.phaseStartMs,
	}
}

function exportTimeline() {
	const payload = buildNativePrExportFromState()
	const fileName = `${state.model.encounter.name ?? 'webtimeline'}-${state.job}.json`
	const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'})
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = sanitizeFileName(fileName)
	document.body.append(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

function buildNativePrExportFromState() {
	return exportNativePrTimeline()
}

function buildWebTimelineExportFromState() {
	const track = state.model.tracks.expert
	const nativeTimeline = exportNativePrTimeline()
	const meta = {
		name: state.model.encounter.name,
		territoryId: state.model.encounter.territoryId,
		job: state.job || 'unknown',
		jobId: state.model.encounter.jobId ?? '',
		acr: state.acr || '未指定',
		source: 'WebTimeline',
		exportedAt: new Date().toISOString(),
	}
	return {
		schemaVersion: 1,
		meta: {
			...meta,
		},
		phases: exportPhaseWindows(state.model.bossTimeline?.source),
		boss: exportBossTimeline(track),
		player: exportPlayerTimeline(track),
		mitigation: exportEventList(track.mitigation ?? []),
		output: exportEventList((state.model.damage.events ?? []).filter(event => event.output)),
		burstPackages: buildBurstPackageItems(track.burst ?? []),
		qt: exportQtControls(track),
		opener: exportOpenerEvents(),
		focusedSkills: [...state.focusedSkills],
		manual: state.inserted.map(exportTimelineEvent),
		categories: exportTimelineCategories(track),
		Meta: nativeTimeline.Meta,
		Root: nativeTimeline.Root,
	}
}

function exportNativePrTimeline() {
	if (detectTimelineImportKind(state.currentTimelineJson).id === 'ptl') {
		return jsonClone(state.currentTimelineJson)
	}
	if (state.currentTimelineJson?.Root) {
		const nativeMeta = state.currentTimelineJson.Meta
			? jsonClone(state.currentTimelineJson.Meta)
			: defaultNativeTimelineMeta()
		return {
			Meta: nativeMeta,
			Root: jsonClone(state.currentTimelineJson.Root),
		}
	}
	return {
		Meta: defaultNativeTimelineMeta(),
		Root: {
			Name: 'WebTimeline 导出',
			Type: 'folder',
			Children: state.inserted.map(item => ({
				Name: item.name,
				Type: 'action',
				Actions: [exportTimelineActionNode(item)],
			})),
		},
	}
}

function defaultNativeTimelineMeta() {
	return {
		Name: state.model.encounter.name,
		TerritoryId: state.model.encounter.territoryId,
		Job: String(state.model.encounter.jobId ?? ''),
		JobId: state.model.encounter.jobId,
		Author: state.acr,
		AcrAuthor: state.acr,
		Opener: state.model.encounter.opener,
	}
}

function jsonClone(value) {
	return JSON.parse(JSON.stringify(value))
}

function exportTimelineActionNode(item = {}) {
	if (item.kind === 'qt-control') {
		return {
			Type: 'BatchTriggerQt',
			QtStates: item.qtStates ?? [{Name: item.name, Enabled: Boolean(item.enabled)}],
		}
	}
	if (item.type === 'burst-package' || item.kind === 'burst-package') {
		return {
			Type: 'Group',
			Name: item.name ?? item.label ?? '爆发',
		}
	}
	return {
		Type: 'Action',
		ActionId: Number(item.actionId),
		Target: exportTargetForEvent(item),
		TargetMode: item.targetMode ?? null,
		TargetDataId: item.targetDataId ?? null,
	}
}

function exportPhaseWindows(bossSource = null) {
	return phaseOptions(bossSource).map(phase => ({...phase}))
}

function exportBossTimeline(track) {
	return exportEventList(track.boss ?? [])
}

function exportPlayerTimeline(track) {
	return exportEventList([...(track.player ?? []), ...state.inserted])
}

function exportQtControls(track) {
	return Array.isArray(track.qt) ? track.qt.map(item => ({...item})) : []
}

function exportOpenerEvents() {
	const openerPanel = state.model.detailPanels.find(panel => panel.id === 'opener')
	return {
		title: openerPanel?.title ?? state.model.encounter.opener ?? '手动起手',
		source: openerPanel?.source ?? 'WebTimeline',
		events: exportEventList(openerPanel?.events ?? []),
	}
}

function exportTimelineCategories(track) {
	return {
		mitigation: exportEventList(track.mitigation ?? []),
		output: exportEventList((track.player ?? []).filter(event => event.output)),
		potion: exportEventList((track.player ?? []).filter(event => event.kind === 'potion' || event.classification === 'potion')),
		manual: state.inserted.map(exportTimelineEvent),
	}
}

function exportEventList(events = []) {
	return events.map(exportTimelineEvent)
}

function exportTimelineEvent(event = {}) {
	const name = displayNameForAction(event)
	return {
		id: event.id ?? '',
		phase: event.phase ?? 'global',
		phaseStartMs: event.phaseStartMs,
		timeMs: Number(event.timeMs ?? event.startMs ?? 0),
		requestedTimeMs: Number(event.requestedTimeMs ?? event.timeMs ?? event.startMs ?? 0),
		cdAdjustedMs: Number(event.cdAdjustedMs ?? 0),
		recastMs: Number(event.recastMs ?? 0),
		durationMs: Number(event.durationMs ?? Math.max(0, Number(event.endMs ?? 0) - Number(event.startMs ?? 0)) ?? 0),
		kind: event.kind ?? event.type ?? 'player-action',
		name,
		timelineLabel: event.timelineLabel || (name !== (event.name ?? event.label) ? (event.name ?? event.label ?? '') : ''),
		source: event.source ?? '导入',
		actionId: event.actionId ?? '',
		target: exportTargetForEvent(event),
		targetRequired: Boolean(event.targetRequired),
		targetMode: event.targetMode ?? null,
		targetDataId: event.targetDataId ?? null,
		classification: event.classification ?? event.type ?? 'unknown',
		output: Boolean(event.output),
		potency: Number(event.potency ?? 0),
		damage: Number(event.damage ?? 0),
		iconUrl: event.iconUrl ?? '',
		attributeId: event.attributeId ?? '',
		enabled: Boolean(event.enabled),
		qtStates: Array.isArray(event.qtStates) ? event.qtStates : [],
	}
}

function exportTargetForEvent(event = {}) {
	if (event.target) {
		return event.target
	}
	if (isOutputTimelineEvent(event) && !event.target) {
		return 'Target'
	}
	return ''
}

function jobFromTimelineMeta(meta = {}) {
	const jobId = Number(meta.JobId ?? meta.Job)
	return state.model.acrDatabase.jobs.find(job => Number(job.jobId) === jobId)
		?? state.model.acrDatabase.jobs.find(job => job.id === state.job)
		?? state.model.acrDatabase.jobs[0]
}

function defaultAcrForJob(jobId) {
	const job = state.model.acrDatabase.jobs.find(item => item.id === jobId)
	return job?.acrs.find(acr => acr.enabled)?.name ?? job?.acrs[0]?.name ?? ''
}

function classifyImportedAction(actionId, fallbackName = '', kind = 'player-action') {
	if (kind === 'potion') {
		return {type: 'potion', output: false, potency: 0, effectDurationMs: 0}
	}
	if (kind === 'qt-control') {
		return {type: 'qt', output: false, potency: 0, effectDurationMs: 0}
	}
	const action = actionById(actionId)
	const text = `${fallbackName} ${action?.name ?? ''}`
	if (action) {
		const result = {
			type: action.type ?? 'utility',
			output: Boolean(action.output),
			potency: Number(action.potency ?? 0),
			effectDurationMs: Number(action.effectDurationMs ?? 0),
		}
		return enhanceImportedClassification(result, text)
	}
	return fallbackImportedClassification(text)
}

function enhanceImportedClassification(result, text = '') {
	if (result.type !== 'utility' || result.effectDurationMs > 0 || result.output || result.potency > 0) {
		return result
	}
	return fallbackImportedClassification(text)
}

function fallbackImportedClassification(text = '') {
	if (/爆发药/.test(text)) {
		return {type: 'potion', output: false, potency: 0, effectDurationMs: 0}
	}
	if (/持续伤害|dot|灾变|毒菌|烈风|闪雷|彼岸花|樱花怒放|狂风蚀箭/i.test(text)) {
		return {type: 'dot', output: true, potency: 0, effectDurationMs: 30000}
	}
	if (/水流幕/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 8000}
	}
	if (/神祝祷|全大赦|神爱抚/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 10000}
	}
	if (/节制/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 20000}
	}
	if (/庇护/.test(text)) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs: 24000}
	}
	if (/礼仪之铃/.test(text)) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs: 20000}
	}
	if (/治疗|回复|恢复|再生|铃|幕帘|医济|愈疗|天赐/.test(text)) {
		return {type: 'healing', output: false, potency: 0, effectDurationMs: 15000}
	}
	if (/减伤|铁壁|雪仇|黑盾|献奉|暗影墙|暗影卫|布道|行尸|无敌|防护|罩/.test(text)) {
		return {type: 'mitigation', output: false, potency: 0, effectDurationMs: 10000}
	}
	return {type: 'utility', output: false, potency: 0, effectDurationMs: 0}
}

function importedActionName(nodeName = '', action) {
	if (action.Type === 'BatchTriggerQt') {
		return cleanImportedName(nodeName)
	}
	if (action.Type === 'UsePotion') {
		return '爆发药'
	}
	const actionId = Number(action.ActionId)
	return ACTION_LABELS.get(actionId) || actionById(actionId)?.name || `技能 ${action.ActionId}`
}

function cleanImportedName(name = '') {
	return String(name).replace(/\s*读条时间:.*/, '').replace(/\s*\[.*?\]/g, '').trim() || '事件'
}

function parseCastDuration(name = '') {
	const match = /读条时间:(\d+(?:\.\d+)?)/.exec(name)
	return match ? Math.round(Number(match[1]) * 1000) : 4700
}

function first(value) {
	return Array.isArray(value) ? value[0] : value
}

function normalizeSearchText(value = '') {
	return String(value).trim().toLowerCase()
}

function formatGeneratedAt(value = '') {
	if (!value) {
		return '本地生成'
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString('zh-CN')
}

function sanitizeFileName(value = '') {
	return String(value).replace(/[\\/:*?"<>|]/g, '_')
}

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function updateDamage() {
	const events = [...state.model.damage.events, ...state.inserted.filter(event => event.output)]
	const result = estimateDamage(events, {
		attackPower: 120,
		critRate: Number(state.critRate) / 100,
		directRate: Number(state.directRate) / 100,
		luck: state.luck,
	})
	const totalTarget = document.querySelector('[data-damage-total]')
	const phaseTarget = document.querySelector('[data-phase-damage]')
	if (!totalTarget || !phaseTarget) {
		return
	}
	totalTarget.textContent = result.total.toLocaleString('zh-CN')
	phaseTarget.innerHTML = Object.entries(result.phases).map(([phase, data]) => `
		<div>
			<span>${phase}</span>
			<strong>${data.damage.toLocaleString('zh-CN')}</strong>
			<small>${data.events} 技能</small>
		</div>
	`).join('')
}

function estimateDamage(events, profile) {
	const attackPower = Number(profile.attackPower ?? 100)
	const critRate = Math.min(1, Math.max(0, Number(profile.critRate ?? 0.15)))
	const directRate = Math.min(1, Math.max(0, Number(profile.directRate ?? 0.25)))
	const luckBonus = profile.luck === 'lucky' ? 0.22 : profile.luck === 'low' ? -0.12 : 0
	const multiplier = (1 + critRate * 0.45) * (1 + directRate * 0.25) * (1 + luckBonus)
	const phases = {}
	let total = 0

	for (const event of events) {
		const damage = Math.round(Number(event.potency ?? 0) * Number(event.count ?? 1) * attackPower * multiplier)
		const phase = event.phase ?? '手动'
		phases[phase] ??= {damage: 0, events: 0}
		phases[phase].damage += damage
		phases[phase].events += 1
		total += damage
	}
	return {total, phases}
}

function formatTime(ms = 0) {
	const total = Math.max(0, Math.round(ms / 1000))
	const minutes = Math.floor(total / 60)
	const seconds = String(total % 60).padStart(2, '0')
	return `${minutes}:${seconds}`
}

function formatDuration(ms = 0) {
	const seconds = Math.max(0, Math.round(Number(ms ?? 0) / 1000))
	return `${seconds}s`
}

function formatDamage(value = 0) {
	const damage = Math.round(Number(value ?? 0))
	return damage.toLocaleString('zh-CN')
}

function formatMetricValue(value = 0, type = 'damage') {
	if (type === 'percent') {
		return `${formatNumber(value, 1)}%`
	}
	if (type === 'count') {
		return Math.round(Number(value ?? 0)).toLocaleString('zh-CN')
	}
	return formatDamage(value)
}

function formatSignedDamage(value = 0) {
	const number = Math.round(Number(value ?? 0))
	return `${number >= 0 ? '+' : '-'}${Math.abs(number).toLocaleString('zh-CN')}`
}

function formatSignedInteger(value = 0) {
	const number = Math.round(Number(value ?? 0))
	return `${number >= 0 ? '+' : '-'}${Math.abs(number).toLocaleString('zh-CN')}`
}

function formatSignedNumber(value = 0, digits = 0) {
	const number = Number(value ?? 0)
	return `${number >= 0 ? '+' : '-'}${Math.abs(number).toFixed(digits)}`
}

function formatNumber(value = 0, digits = 0) {
	return Number(value ?? 0).toFixed(digits)
}

function clampPercent(value, min = 50, max = 100) {
	const number = Number(value)
	if (!Number.isFinite(number)) {
		return max
	}
	return Math.min(max, Math.max(min, Math.round(number * 10) / 10))
}

/* ── Mini timeline navigator: sync + drag ── */
let timelineNavDrag = null

function updateTimelineNav() {
	const timeline = document.querySelector('.xiva-timeline')
	const track = document.querySelector('[data-timeline-nav-track]')
	const thumb = document.querySelector('[data-timeline-nav-thumb]')
	if (!timeline || !track || !thumb) {
		return
	}
	const maxScroll = timeline.scrollWidth - timeline.clientWidth
	if (maxScroll <= 0) {
		thumb.style.width = '100%'
		thumb.style.transform = 'translateX(0)'
		return
	}
	const trackWidth = track.clientWidth
	const thumbWidth = Math.max(42, thumb.offsetWidth || 42)
	const thumbLeft = maxScroll > 0
		? Math.round((trackWidth - thumbWidth) * (timeline.scrollLeft / maxScroll))
		: 0
	thumb.style.width = `${thumbWidth}px`
	thumb.style.transform = `translateX(${thumbLeft}px)`
}

function setTimelineScrollFromNav(clientX) {
	const timeline = document.querySelector('.xiva-timeline')
	const track = document.querySelector('[data-timeline-nav-track]')
	if (!timeline || !track) {
		return
	}
	const maxScroll = timeline.scrollWidth - timeline.clientWidth
	if (maxScroll <= 0) {
		return
	}
	const rect = track.getBoundingClientRect()
	const thumb = track.querySelector('[data-timeline-nav-thumb]')
	const thumbWidth = thumb ? thumb.offsetWidth : 42
	const usableRange = Math.max(1, rect.width - thumbWidth)
	const ratio = Math.min(1, Math.max(0, (clientX - rect.left - thumbWidth / 2) / usableRange))
	timeline.scrollLeft = ratio * maxScroll
}

document.addEventListener('pointerdown', event => {
	const thumbTarget = event.target instanceof Element ? event.target.closest('[data-timeline-nav-thumb]') : null
	const track = thumbTarget
		? thumbTarget.closest('[data-timeline-nav-track]')
		: event.target instanceof Element ? event.target.closest('[data-timeline-nav-track]') : null
	if (!track) {
		return
	}
	const thumb = track.querySelector('[data-timeline-nav-thumb]')
	const thumbRect = thumb?.getBoundingClientRect()
	const isOnThumb = Boolean(thumbTarget) || Boolean(thumbRect && event.clientX >= thumbRect.left && event.clientX <= thumbRect.right)
	// Click on track (not thumb) jumps to that position
	if (!isOnThumb) {
		setTimelineScrollFromNav(event.clientX)
	}
	timelineNavDrag = {
		pointerId: event.pointerId,
		startClientX: event.clientX,
		startScrollLeft: document.querySelector('.xiva-timeline')?.scrollLeft ?? 0,
	}
	track.setPointerCapture?.(event.pointerId)
	event.preventDefault()
})

document.addEventListener('pointermove', event => {
	if (!timelineNavDrag || timelineNavDrag.pointerId !== event.pointerId) {
		return
	}
	const timeline = document.querySelector('.xiva-timeline')
	if (!timeline) {
		return
	}
	const maxScroll = timeline.scrollWidth - timeline.clientWidth
	if (maxScroll <= 0) {
		return
	}
	const track = document.querySelector('[data-timeline-nav-track]')
	if (!track) {
		return
	}
	const trackRect = track.getBoundingClientRect()
	const thumb = track.querySelector('[data-timeline-nav-thumb]')
	const thumbWidth = thumb ? thumb.offsetWidth : 42
	const usableRange = trackRect.width - thumbWidth
	const deltaPx = event.clientX - timelineNavDrag.startClientX
	const deltaRatio = usableRange > 0 ? deltaPx / usableRange : 0
	timeline.scrollLeft = timelineNavDrag.startScrollLeft + deltaRatio * maxScroll
	updateTimelineNav()
}, {passive: true})

document.addEventListener('pointerup', event => {
	if (timelineNavDrag && timelineNavDrag.pointerId === event.pointerId) {
		timelineNavDrag = null
	}
})

document.addEventListener('pointercancel', event => {
	if (timelineNavDrag && timelineNavDrag.pointerId === event.pointerId) {
		timelineNavDrag = null
	}
})

// Sync navigator thumb when timeline scrolls
document.addEventListener('scroll', event => {
	if (!(event.target instanceof Element)) {
		return
	}
	if (!event.target.classList?.contains('xiva-timeline')) {
		return
	}
	requestAnimationFrame(updateTimelineNav)
}, {passive: true, capture: true})
