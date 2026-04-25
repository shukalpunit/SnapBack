/**
 * i18n translations for SnapBack.
 * Supported: English (en), Spanish (es), Mandarin (zh), Hindi (hi)
 */

export type Language = 'en' | 'es' | 'zh' | 'hi';

export const LANGUAGE_OPTIONS: Array<{ code: Language; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'hi', label: 'हिन्दी' },
];

type TranslationKeys = {
  // App
  appName: string;
  // Tabs
  tabDashboard: string;
  tabHeatMap: string;
  tabTasks: string;
  tabSettings: string;
  // Dashboard
  todaySummary: string;
  totalTracked: string;
  deepWork: string;
  shallowWork: string;
  distractionLoops: string;
  sevenDayTrend: string;
  noTrendData: string;
  loading: string;
  // Heat Map
  heatMapTitle: string;
  prevDay: string;
  nextDay: string;
  noData: string;
  app: string;
  classification: string;
  duration: string;
  // Tasks
  taskManager: string;
  newTaskPlaceholder: string;
  addTask: string;
  noTasksYet: string;
  priorityLow: string;
  priorityMedium: string;
  priorityHigh: string;
  badgeEarned: string;
  // Settings
  settingsTitle: string;
  language: string;
  appearance: string;
  darkMode: string;
  colorBlindMode: string;
  reducedMotion: string;
  ghostBar: string;
  comingSoon: string;
  enableGhostBar: string;
  position: string;
  googleCalendar: string;
  connected: string;
  revokeAccess: string;
  authorizeCalendar: string;
  dataManagement: string;
  dataLocalMessage: string;
  deleteAllData: string;
  deleteConfirmMessage: string;
  confirmDelete: string;
  cancel: string;
  // Time blocking
  timeBlocking: string;
  generateSuggestions: string;
};

const en: TranslationKeys = {
  appName: 'SnapBack',
  tabDashboard: 'Dashboard',
  tabHeatMap: 'Heat Map',
  tabTasks: 'Tasks',
  tabSettings: 'Settings',
  todaySummary: "Today's Summary",
  totalTracked: 'Total tracked',
  deepWork: 'Deep Work',
  shallowWork: 'Shallow Work',
  distractionLoops: 'Distraction Loops',
  sevenDayTrend: '7-Day Deep Work Trend',
  noTrendData: 'No trend data yet.',
  loading: 'Loading…',
  heatMapTitle: 'Productivity Heat Map',
  prevDay: '← Prev',
  nextDay: 'Next →',
  noData: 'no data',
  app: 'App',
  classification: 'Classification',
  duration: 'Duration',
  taskManager: 'Task Manager',
  newTaskPlaceholder: 'New task…',
  addTask: 'Add',
  noTasksYet: 'No tasks yet. Add one above to start earning XP!',
  priorityLow: 'Low',
  priorityMedium: 'Medium',
  priorityHigh: 'High',
  badgeEarned: 'Badge earned',
  settingsTitle: 'Settings',
  language: 'Language',
  appearance: 'Appearance',
  darkMode: 'Dark Mode',
  colorBlindMode: 'Color Blind Mode',
  reducedMotion: 'Reduced Motion',
  ghostBar: 'Productivity Ghost',
  comingSoon: 'coming soon',
  enableGhostBar: 'Enable Ghost Bar',
  position: 'Position',
  googleCalendar: 'Google Calendar',
  connected: 'Connected',
  revokeAccess: 'Revoke Access',
  authorizeCalendar: 'Authorize Google Calendar',
  dataManagement: 'Data Management',
  dataLocalMessage: 'All your data is stored locally on this device and never leaves your machine.',
  deleteAllData: 'Delete All Data',
  deleteConfirmMessage: 'Are you sure? This cannot be undone.',
  confirmDelete: 'Yes, Delete Everything',
  cancel: 'Cancel',
  timeBlocking: 'Time Blocking',
  generateSuggestions: 'Generate Suggestions',
};

const es: TranslationKeys = {
  appName: 'SnapBack',
  tabDashboard: 'Panel',
  tabHeatMap: 'Mapa de Calor',
  tabTasks: 'Tareas',
  tabSettings: 'Ajustes',
  todaySummary: 'Resumen de Hoy',
  totalTracked: 'Total registrado',
  deepWork: 'Trabajo Profundo',
  shallowWork: 'Trabajo Superficial',
  distractionLoops: 'Ciclos de Distracción',
  sevenDayTrend: 'Tendencia de 7 Días',
  noTrendData: 'Sin datos de tendencia aún.',
  loading: 'Cargando…',
  heatMapTitle: 'Mapa de Productividad',
  prevDay: '← Anterior',
  nextDay: 'Siguiente →',
  noData: 'sin datos',
  app: 'Aplicación',
  classification: 'Clasificación',
  duration: 'Duración',
  taskManager: 'Gestor de Tareas',
  newTaskPlaceholder: 'Nueva tarea…',
  addTask: 'Agregar',
  noTasksYet: '¡Sin tareas aún. Agrega una para empezar a ganar XP!',
  priorityLow: 'Baja',
  priorityMedium: 'Media',
  priorityHigh: 'Alta',
  badgeEarned: 'Insignia obtenida',
  settingsTitle: 'Ajustes',
  language: 'Idioma',
  appearance: 'Apariencia',
  darkMode: 'Modo Oscuro',
  colorBlindMode: 'Modo Daltónico',
  reducedMotion: 'Movimiento Reducido',
  ghostBar: 'Fantasma de Productividad',
  comingSoon: 'próximamente',
  enableGhostBar: 'Activar Barra Fantasma',
  position: 'Posición',
  googleCalendar: 'Google Calendar',
  connected: 'Conectado',
  revokeAccess: 'Revocar Acceso',
  authorizeCalendar: 'Autorizar Google Calendar',
  dataManagement: 'Gestión de Datos',
  dataLocalMessage: 'Todos tus datos se almacenan localmente en este dispositivo y nunca salen de tu máquina.',
  deleteAllData: 'Eliminar Todos los Datos',
  deleteConfirmMessage: '¿Estás seguro? Esto no se puede deshacer.',
  confirmDelete: 'Sí, Eliminar Todo',
  cancel: 'Cancelar',
  timeBlocking: 'Bloques de Tiempo',
  generateSuggestions: 'Generar Sugerencias',
};

const zh: TranslationKeys = {
  appName: 'SnapBack',
  tabDashboard: '仪表盘',
  tabHeatMap: '热力图',
  tabTasks: '任务',
  tabSettings: '设置',
  todaySummary: '今日摘要',
  totalTracked: '总追踪时间',
  deepWork: '深度工作',
  shallowWork: '浅层工作',
  distractionLoops: '分心循环',
  sevenDayTrend: '7天深度工作趋势',
  noTrendData: '暂无趋势数据。',
  loading: '加载中…',
  heatMapTitle: '生产力热力图',
  prevDay: '← 前一天',
  nextDay: '后一天 →',
  noData: '无数据',
  app: '应用',
  classification: '分类',
  duration: '时长',
  taskManager: '任务管理',
  newTaskPlaceholder: '新任务…',
  addTask: '添加',
  noTasksYet: '还没有任务。添加一个开始赚取经验值！',
  priorityLow: '低',
  priorityMedium: '中',
  priorityHigh: '高',
  badgeEarned: '获得徽章',
  settingsTitle: '设置',
  language: '语言',
  appearance: '外观',
  darkMode: '深色模式',
  colorBlindMode: '色盲模式',
  reducedMotion: '减少动画',
  ghostBar: '生产力幽灵',
  comingSoon: '即将推出',
  enableGhostBar: '启用幽灵条',
  position: '位置',
  googleCalendar: 'Google 日历',
  connected: '已连接',
  revokeAccess: '撤销访问',
  authorizeCalendar: '授权 Google 日历',
  dataManagement: '数据管理',
  dataLocalMessage: '您的所有数据都存储在本设备上，绝不会离开您的电脑。',
  deleteAllData: '删除所有数据',
  deleteConfirmMessage: '确定吗？此操作无法撤销。',
  confirmDelete: '是的，全部删除',
  cancel: '取消',
  timeBlocking: '时间块',
  generateSuggestions: '生成建议',
};

const hi: TranslationKeys = {
  appName: 'SnapBack',
  tabDashboard: 'डैशबोर्ड',
  tabHeatMap: 'हीट मैप',
  tabTasks: 'कार्य',
  tabSettings: 'सेटिंग्स',
  todaySummary: 'आज का सारांश',
  totalTracked: 'कुल ट्रैक किया गया',
  deepWork: 'गहन कार्य',
  shallowWork: 'सतही कार्य',
  distractionLoops: 'विकर्षण चक्र',
  sevenDayTrend: '7-दिन गहन कार्य रुझान',
  noTrendData: 'अभी तक कोई रुझान डेटा नहीं।',
  loading: 'लोड हो रहा है…',
  heatMapTitle: 'उत्पादकता हीट मैप',
  prevDay: '← पिछला',
  nextDay: 'अगला →',
  noData: 'कोई डेटा नहीं',
  app: 'ऐप',
  classification: 'वर्गीकरण',
  duration: 'अवधि',
  taskManager: 'कार्य प्रबंधक',
  newTaskPlaceholder: 'नया कार्य…',
  addTask: 'जोड़ें',
  noTasksYet: 'अभी कोई कार्य नहीं। XP कमाना शुरू करने के लिए ऊपर एक जोड़ें!',
  priorityLow: 'कम',
  priorityMedium: 'मध्यम',
  priorityHigh: 'उच्च',
  badgeEarned: 'बैज अर्जित',
  settingsTitle: 'सेटिंग्स',
  language: 'भाषा',
  appearance: 'दिखावट',
  darkMode: 'डार्क मोड',
  colorBlindMode: 'कलर ब्लाइंड मोड',
  reducedMotion: 'कम गति',
  ghostBar: 'उत्पादकता घोस्ट',
  comingSoon: 'जल्द आ रहा है',
  enableGhostBar: 'घोस्ट बार सक्षम करें',
  position: 'स्थिति',
  googleCalendar: 'Google कैलेंडर',
  connected: 'जुड़ा हुआ',
  revokeAccess: 'पहुँच रद्द करें',
  authorizeCalendar: 'Google कैलेंडर अधिकृत करें',
  dataManagement: 'डेटा प्रबंधन',
  dataLocalMessage: 'आपका सारा डेटा इस डिवाइस पर स्थानीय रूप से संग्रहीत है और कभी आपकी मशीन से बाहर नहीं जाता।',
  deleteAllData: 'सारा डेटा हटाएं',
  deleteConfirmMessage: 'क्या आप सुनिश्चित हैं? यह पूर्ववत नहीं किया जा सकता।',
  confirmDelete: 'हाँ, सब कुछ हटाएं',
  cancel: 'रद्द करें',
  timeBlocking: 'टाइम ब्लॉकिंग',
  generateSuggestions: 'सुझाव उत्पन्न करें',
};

const TRANSLATIONS: Record<Language, TranslationKeys> = { en, es, zh, hi };

export function t(key: keyof TranslationKeys, lang: Language = 'en'): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS['en'][key] ?? key;
}

export type { TranslationKeys };
