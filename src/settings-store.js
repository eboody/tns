export const DEFAULT_APP_SETTINGS = {
  clientReplacement: '',
  clientVariants: '',
  exactEntities: [],
  patterns: {
    dates: { enabled: false, replacement: '[DATE]' },
    emails: { enabled: false, replacement: '[EMAIL]' },
    phones: { enabled: false, replacement: '[PHONE]' }
  },
  ner: {
    enabled: false,
    modelPath: '',
    tokenizerPath: '',
    minConfidence: '0.7'
  }
}

const SETTINGS_STORAGE_KEY = 'tns-deid.desktop.settings'

export function loadAppSettings(storage = globalThis.localStorage) {
  const fallback = normalizeAppSettings()
  if (!storage) {
    return fallback
  }

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return fallback
    }

    return normalizeAppSettings(JSON.parse(raw))
  } catch {
    return fallback
  }
}

export function saveAppSettings(settings, storage = globalThis.localStorage) {
  const normalized = normalizeAppSettings(settings)
  if (!storage) {
    return normalized
  }

  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function normalizeAppSettings(settings = {}) {
  return {
    clientReplacement: normalizeString(settings.clientReplacement),
    clientVariants: normalizeMultilineString(settings.clientVariants),
    exactEntities: Array.isArray(settings.exactEntities)
      ? settings.exactEntities.map(normalizeExactEntity).filter(hasMeaningfulExactEntity)
      : [],
    patterns: {
      dates: normalizePatternRule(settings.patterns?.dates, DEFAULT_APP_SETTINGS.patterns.dates.replacement),
      emails: normalizePatternRule(settings.patterns?.emails, DEFAULT_APP_SETTINGS.patterns.emails.replacement),
      phones: normalizePatternRule(settings.patterns?.phones, DEFAULT_APP_SETTINGS.patterns.phones.replacement)
    },
    ner: {
      enabled: Boolean(settings.ner?.enabled),
      modelPath: normalizeString(settings.ner?.modelPath),
      tokenizerPath: normalizeString(settings.ner?.tokenizerPath),
      minConfidence: normalizeConfidence(settings.ner?.minConfidence)
    }
  }
}

function normalizeExactEntity(entity = {}) {
  return {
    entityType: normalizeString(entity.entityType),
    replacement: normalizeString(entity.replacement),
    variants: normalizeMultilineString(entity.variants)
  }
}

function hasMeaningfulExactEntity(entity) {
  return Boolean(entity.entityType || entity.replacement || entity.variants)
}

function normalizePatternRule(rule, fallbackReplacement) {
  return {
    enabled: Boolean(rule?.enabled),
    replacement: normalizeString(rule?.replacement) || fallbackReplacement
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeMultilineString(value) {
  return typeof value === 'string'
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
    : ''
}

function normalizeConfidence(value) {
  if (typeof value === 'number') {
    return String(value)
  }

  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_APP_SETTINGS.ner.minConfidence
}
