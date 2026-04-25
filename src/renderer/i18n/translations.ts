/**
 * i18n — Internationalization translations for SnapBack.
 *
 * Supports: English (en), Spanish (es), Mandarin (zh), Hindi (hi)
 */

export type Language = 'en' | 'es' | 'zh' | 'hi';
export type SupportedLanguage = Language;

export interface TranslationStrings {
  // Navigation
  dashboard: string;
  heatMap: string;
  tasks: string;
  reports: string;
  calendar: string;
  settings: string;
  flowStateActive: string;
  localOnly: string;
  searchSystem: string;

  // Dashboard
  totalHours: string;
  deepWork: string;
  shallowWork: string;
  distraction: string;
  hrs: string;
  flowQuota: string;
  hrsRealWork: string;
  dailyTimeline: string;
  appBreakdown: string;
  optimalWindow: string;
  scheduleDeepBlock: string;
  viewTrends: string;
  predictiveAlert: string;
  predictiveAlertMsg: string;

  // Heat Map
  visualAnalytics: string;
  weeklyFocusIntensity: string;
  inactive: string;
  focusQuality: string;
  deepWorkRatio: string;
  distractionLevel: string;
  peakFlowHour: string;

  // Tasks
  manageTasks: string;
  manageFlowQueue: string;
  all: string;
  today: string;
  thisWeek: string;
  completed: string;
  dailyFocusOutput: string;
  remaining: string;
  projectVelocity: string;
  activeSession: string;
  pause: string;
  reset: string;
  contexts: string;
  addTask: string;
  newTask: string;

  // Reports
  performanceAnalysis: string;
  weeklyReport: string;
  exportPdf: string;
  avgFocusScore: string;
  dailyScoreTrends: string;
  thisWeekLabel: string;
  lastWeek: string;
  patternsDetected: string;
  sessionBreakdown: string;

  // Settings
  language: string;
  appearance: string;
  darkMode: string;
  colorBlindMode: string;
  reducedMotion: string;
  productivityGhost: string;
  comingSoon: string;
  enableGhostBar: string;
  position: string;
  googleCalendar: string;
  connected: string;
  revokeAccess: string;
  authorizeGoogleCalendar: string;
  dataManagement: string;
  dataLocalMessage: string;
  deleteAllData: string;
  confirmDelete: string;
  cancel: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;

  // General
  loading: string;
  noDataYet: string;
}

const en: TranslationStrings = {
  dashboard: 'Dashboard',
  heatMap: 'Heat Map',
  tasks: 'Tasks',
  reports: 'Reports',
  calendar: 'Calendar',
  settings: 'Settings',
  flowStateActive: 'Flow State Active',
  localOnly: '100% Local',
  searchSystem: 'SEARCH SYSTEM...',
  totalHours: 'TOTAL HOURS',
  deepWork: 'DEEP WORK',
  shallowWork: 'SHALLOW WORK',
  distraction: 'DISTRACTION',
  hrs: 'HRS',
  flowQuota: 'FLOW QUOTA',
  hrsRealWork: 'hrs real work',
  dailyTimeline: 'Daily Timeline',
  appBreakdown: 'App Breakdown',
  optimalWindow: 'Optimal Window',
  scheduleDeepBlock: 'SCHEDULE DEEP BLOCK',
  viewTrends: 'VIEW TRENDS',
  predictiveAlert: 'Predictive Alert:',
  predictiveAlertMsg: 'Based on your patterns, you typically lose focus around this time. Consider a 5 minute reset.',
  visualAnalytics: 'Visual Analytics',
  weeklyFocusIntensity: 'Weekly Focus Intensity',
  inactive: 'Inactive',
  focusQuality: 'Focus Quality',
  deepWorkRatio: 'Deep Work Ratio',
  distractionLevel: 'Distraction Level',
  peakFlowHour: 'Peak Flow Hour',
  manageTasks: 'Tasks',
  manageFlowQueue: 'Manage your flow state queue.',
  all: 'All',
  today: 'Today',
  thisWeek: 'This Week',
  completed: 'Completed',
  dailyFocusOutput: 'Daily Focus Output',
  remaining: 'Remaining',
  projectVelocity: 'Project Velocity',
  activeSession: 'Active Session',
  pause: 'PAUSE',
  reset: 'RESET',
  contexts: 'Contexts',
  addTask: 'Add',
  newTask: 'New task…',
  performanceAnalysis: 'Performance Analysis',
  weeklyReport: 'Weekly Report',
  exportPdf: 'EXPORT_PDF',
  avgFocusScore: 'AVERAGE_FOCUS_SCORE',
  dailyScoreTrends: 'DAILY_SCORE_TRENDS',
  thisWeekLabel: 'THIS WEEK',
  lastWeek: 'LAST WEEK',
  patternsDetected: 'PATTERNS_DETECTED',
  sessionBreakdown: 'Session Breakdown',
  language: 'Language',
  appearance: 'Appearance',
  darkMode: 'Dark Mode',
  colorBlindMode: 'Color Blind Mode',
  reducedMotion: 'Reduced Motion',
  productivityGhost: 'Productivity Ghost',
  comingSoon: 'coming soon',
  enableGhostBar: 'Enable Ghost Bar',
  position: 'Position',
  googleCalendar: 'Google Calendar',
  connected: 'Connected',
  revokeAccess: 'Revoke Access',
  authorizeGoogleCalendar: 'Authorize Google Calendar',
  dataManagement: 'Data Management',
  dataLocalMessage: 'All your data is stored locally on this device and never leaves your machine.',
  deleteAllData: 'Delete All Data',
  confirmDelete: 'Yes, Delete Everything',
  cancel: 'Cancel',
  topLeft: 'Top Left',
  topRight: 'Top Right',
  bottomLeft: 'Bottom Left',
  bottomRight: 'Bottom Right',
  loading: 'Loading…',
  noDataYet: 'No data yet.',
};

const es: TranslationStrings = {
  dashboard: 'Panel',
  heatMap: 'Mapa de Calor',
  tasks: 'Tareas',
  reports: 'Informes',
  calendar: 'Calendario',
  settings: 'Configuración',
  flowStateActive: 'Estado de Flujo Activo',
  localOnly: '100% Local',
  searchSystem: 'BUSCAR EN EL SISTEMA...',
  totalHours: 'HORAS TOTALES',
  deepWork: 'TRABAJO PROFUNDO',
  shallowWork: 'TRABAJO SUPERFICIAL',
  distraction: 'DISTRACCIÓN',
  hrs: 'HRS',
  flowQuota: 'CUOTA DE FLUJO',
  hrsRealWork: 'hrs trabajo real',
  dailyTimeline: 'Línea de Tiempo Diaria',
  appBreakdown: 'Desglose por App',
  optimalWindow: 'Ventana Óptima',
  scheduleDeepBlock: 'PROGRAMAR BLOQUE PROFUNDO',
  viewTrends: 'VER TENDENCIAS',
  predictiveAlert: 'Alerta Predictiva:',
  predictiveAlertMsg: 'Según tus patrones, normalmente pierdes el enfoque a esta hora. Considera un descanso de 5 minutos.',
  visualAnalytics: 'Análisis Visual',
  weeklyFocusIntensity: 'Intensidad de Enfoque Semanal',
  inactive: 'Inactivo',
  focusQuality: 'Calidad de Enfoque',
  deepWorkRatio: 'Ratio de Trabajo Profundo',
  distractionLevel: 'Nivel de Distracción',
  peakFlowHour: 'Hora Pico de Flujo',
  manageTasks: 'Tareas',
  manageFlowQueue: 'Gestiona tu cola de estado de flujo.',
  all: 'Todas',
  today: 'Hoy',
  thisWeek: 'Esta Semana',
  completed: 'Completadas',
  dailyFocusOutput: 'Producción de Enfoque Diario',
  remaining: 'Restantes',
  projectVelocity: 'Velocidad del Proyecto',
  activeSession: 'Sesión Activa',
  pause: 'PAUSAR',
  reset: 'REINICIAR',
  contexts: 'Contextos',
  addTask: 'Agregar',
  newTask: 'Nueva tarea…',
  performanceAnalysis: 'Análisis de Rendimiento',
  weeklyReport: 'Informe Semanal',
  exportPdf: 'EXPORTAR_PDF',
  avgFocusScore: 'PUNTUACIÓN_PROMEDIO_ENFOQUE',
  dailyScoreTrends: 'TENDENCIAS_DIARIAS',
  thisWeekLabel: 'ESTA SEMANA',
  lastWeek: 'SEMANA PASADA',
  patternsDetected: 'PATRONES_DETECTADOS',
  sessionBreakdown: 'Desglose de Sesiones',
  language: 'Idioma',
  appearance: 'Apariencia',
  darkMode: 'Modo Oscuro',
  colorBlindMode: 'Modo Daltónico',
  reducedMotion: 'Movimiento Reducido',
  productivityGhost: 'Fantasma de Productividad',
  comingSoon: 'próximamente',
  enableGhostBar: 'Activar Barra Fantasma',
  position: 'Posición',
  googleCalendar: 'Google Calendar',
  connected: 'Conectado',
  revokeAccess: 'Revocar Acceso',
  authorizeGoogleCalendar: 'Autorizar Google Calendar',
  dataManagement: 'Gestión de Datos',
  dataLocalMessage: 'Todos tus datos se almacenan localmente en este dispositivo y nunca salen de tu máquina.',
  deleteAllData: 'Eliminar Todos los Datos',
  confirmDelete: 'Sí, Eliminar Todo',
  cancel: 'Cancelar',
  topLeft: 'Superior Izquierda',
  topRight: 'Superior Derecha',
  bottomLeft: 'Inferior Izquierda',
  bottomRight: 'Inferior Derecha',
  loading: 'Cargando…',
  noDataYet: 'Sin datos aún.',
};

const zh: TranslationStrings = {
  dashboard: '仪表板',
  heatMap: '热力图',
  tasks: '任务',
  reports: '报告',
  calendar: '日历',
  settings: '设置',
  flowStateActive: '心流状态激活',
  localOnly: '100% 本地',
  searchSystem: '搜索系统...',
  totalHours: '总时长',
  deepWork: '深度工作',
  shallowWork: '浅层工作',
  distraction: '分心',
  hrs: '小时',
  flowQuota: '心流配额',
  hrsRealWork: '小时实际工作',
  dailyTimeline: '每日时间线',
  appBreakdown: '应用分析',
  optimalWindow: '最佳时段',
  scheduleDeepBlock: '安排深度时段',
  viewTrends: '查看趋势',
  predictiveAlert: '预测提醒：',
  predictiveAlertMsg: '根据你的模式，你通常在这个时间失去注意力。建议休息5分钟。',
  visualAnalytics: '可视化分析',
  weeklyFocusIntensity: '每周专注强度',
  inactive: '未活动',
  focusQuality: '专注质量',
  deepWorkRatio: '深度工作比率',
  distractionLevel: '分心程度',
  peakFlowHour: '心流高峰时段',
  manageTasks: '任务',
  manageFlowQueue: '管理你的心流队列。',
  all: '全部',
  today: '今天',
  thisWeek: '本周',
  completed: '已完成',
  dailyFocusOutput: '每日专注产出',
  remaining: '剩余',
  projectVelocity: '项目速度',
  activeSession: '活跃会话',
  pause: '暂停',
  reset: '重置',
  contexts: '上下文',
  addTask: '添加',
  newTask: '新任务…',
  performanceAnalysis: '绩效分析',
  weeklyReport: '周报',
  exportPdf: '导出PDF',
  avgFocusScore: '平均专注分数',
  dailyScoreTrends: '每日分数趋势',
  thisWeekLabel: '本周',
  lastWeek: '上周',
  patternsDetected: '检测到的模式',
  sessionBreakdown: '会话分析',
  language: '语言',
  appearance: '外观',
  darkMode: '深色模式',
  colorBlindMode: '色盲模式',
  reducedMotion: '减少动画',
  productivityGhost: '生产力幽灵',
  comingSoon: '即将推出',
  enableGhostBar: '启用幽灵栏',
  position: '位置',
  googleCalendar: 'Google 日历',
  connected: '已连接',
  revokeAccess: '撤销访问',
  authorizeGoogleCalendar: '授权 Google 日历',
  dataManagement: '数据管理',
  dataLocalMessage: '所有数据都存储在本设备上，永远不会离开你的机器。',
  deleteAllData: '删除所有数据',
  confirmDelete: '是的，删除所有',
  cancel: '取消',
  topLeft: '左上',
  topRight: '右上',
  bottomLeft: '左下',
  bottomRight: '右下',
  loading: '加载中…',
  noDataYet: '暂无数据。',
};

const hi: TranslationStrings = {
  dashboard: 'डैशबोर्ड',
  heatMap: 'हीट मैप',
  tasks: 'कार्य',
  reports: 'रिपोर्ट',
  calendar: 'कैलेंडर',
  settings: 'सेटिंग्स',
  flowStateActive: 'फ्लो स्टेट सक्रिय',
  localOnly: '100% स्थानीय',
  searchSystem: 'सिस्टम खोजें...',
  totalHours: 'कुल घंटे',
  deepWork: 'गहन कार्य',
  shallowWork: 'सतही कार्य',
  distraction: 'विकर्षण',
  hrs: 'घंटे',
  flowQuota: 'फ्लो कोटा',
  hrsRealWork: 'घंटे वास्तविक कार्य',
  dailyTimeline: 'दैनिक समयरेखा',
  appBreakdown: 'ऐप विश्लेषण',
  optimalWindow: 'इष्टतम समय',
  scheduleDeepBlock: 'गहन ब्लॉक शेड्यूल करें',
  viewTrends: 'रुझान देखें',
  predictiveAlert: 'भविष्यवाणी अलर्ट:',
  predictiveAlertMsg: 'आपके पैटर्न के अनुसार, आप आमतौर पर इस समय ध्यान खो देते हैं। 5 मिनट का ब्रेक लें।',
  visualAnalytics: 'दृश्य विश्लेषण',
  weeklyFocusIntensity: 'साप्ताहिक फोकस तीव्रता',
  inactive: 'निष्क्रिय',
  focusQuality: 'फोकस गुणवत्ता',
  deepWorkRatio: 'गहन कार्य अनुपात',
  distractionLevel: 'विकर्षण स्तर',
  peakFlowHour: 'पीक फ्लो समय',
  manageTasks: 'कार्य',
  manageFlowQueue: 'अपनी फ्लो स्टेट कतार प्रबंधित करें।',
  all: 'सभी',
  today: 'आज',
  thisWeek: 'इस सप्ताह',
  completed: 'पूर्ण',
  dailyFocusOutput: 'दैनिक फोकस आउटपुट',
  remaining: 'शेष',
  projectVelocity: 'प्रोजेक्ट गति',
  activeSession: 'सक्रिय सत्र',
  pause: 'रोकें',
  reset: 'रीसेट',
  contexts: 'संदर्भ',
  addTask: 'जोड़ें',
  newTask: 'नया कार्य…',
  performanceAnalysis: 'प्रदर्शन विश्लेषण',
  weeklyReport: 'साप्ताहिक रिपोर्ट',
  exportPdf: 'PDF निर्यात',
  avgFocusScore: 'औसत फोकस स्कोर',
  dailyScoreTrends: 'दैनिक स्कोर रुझान',
  thisWeekLabel: 'इस सप्ताह',
  lastWeek: 'पिछला सप्ताह',
  patternsDetected: 'पैटर्न पहचाने गए',
  sessionBreakdown: 'सत्र विश्लेषण',
  language: 'भाषा',
  appearance: 'दिखावट',
  darkMode: 'डार्क मोड',
  colorBlindMode: 'कलर ब्लाइंड मोड',
  reducedMotion: 'कम गति',
  productivityGhost: 'उत्पादकता भूत',
  comingSoon: 'जल्द आ रहा है',
  enableGhostBar: 'घोस्ट बार सक्षम करें',
  position: 'स्थिति',
  googleCalendar: 'Google कैलेंडर',
  connected: 'जुड़ा हुआ',
  revokeAccess: 'पहुँच रद्द करें',
  authorizeGoogleCalendar: 'Google कैलेंडर अधिकृत करें',
  dataManagement: 'डेटा प्रबंधन',
  dataLocalMessage: 'आपका सारा डेटा इस डिवाइस पर स्थानीय रूप से संग्रहीत है और कभी आपकी मशीन से बाहर नहीं जाता।',
  deleteAllData: 'सारा डेटा हटाएं',
  confirmDelete: 'हाँ, सब कुछ हटाएं',
  cancel: 'रद्द करें',
  topLeft: 'ऊपर बाएँ',
  topRight: 'ऊपर दाएँ',
  bottomLeft: 'नीचे बाएँ',
  bottomRight: 'नीचे दाएँ',
  loading: 'लोड हो रहा है…',
  noDataYet: 'अभी तक कोई डेटा नहीं।',
};

export const TRANSLATIONS: Record<SupportedLanguage, TranslationStrings> = { en, es, zh, hi };

export const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文 (Mandarin)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
];

export function t(lang: SupportedLanguage, key: keyof TranslationStrings): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS['en'][key] ?? key;
}
