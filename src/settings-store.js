export const DEFAULT_PROFILE_ID = 'general'

const DEFAULT_PROFILE = {
  id: DEFAULT_PROFILE_ID,
  name: 'General',
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

export const DEFAULT_APP_SETTINGS = {
  globalSettings: {
    activeProfileId: DEFAULT_PROFILE_ID
  },
  profiles: [DEFAULT_PROFILE],
  currentCaseContext: {
    clientReplacement: '',
    clientVariants: '',
    exactEntities: []
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
  const legacySettings = isLegacySettingsShape(settings) ? settings : null
  const profiles = normalizeProfiles(settings.profiles, legacySettings)

  return {
    globalSettings: {
      activeProfileId: normalizeActiveProfileId(settings.globalSettings?.activeProfileId, profiles)
    },
    profiles,
    currentCaseContext: normalizeCaseContext(settings.currentCaseContext ?? legacySettings ?? {})
  }
}

export function getActiveProfile(settings) {
  const normalized = normalizeAppSettings(settings)
  return normalized.profiles.find((profile) => profile.id === normalized.globalSettings.activeProfileId) ?? normalized.profiles[0]
}

export function getCurrentCaseContext(settings) {
  return normalizeAppSettings(settings).currentCaseContext
}

export function setActiveProfileId(settings, profileId) {
  const normalized = normalizeAppSettings(settings)

  return normalizeAppSettings({
    ...normalized,
    globalSettings: {
      ...normalized.globalSettings,
      activeProfileId: profileId
    }
  })
}

export function createProfileFromActive(settings, { name, profile }) {
  const normalized = normalizeAppSettings(settings)
  const activeProfile = getActiveProfile(normalized)
  const nextProfile = normalizeProfile({
    ...activeProfile,
    ...profile,
    id: buildProfileId(name, normalized.profiles),
    name
  })

  return normalizeAppSettings({
    ...normalized,
    globalSettings: {
      ...normalized.globalSettings,
      activeProfileId: nextProfile.id
    },
    profiles: [...normalized.profiles, nextProfile]
  })
}

export function updateActiveProfileAndCaseContext(settings, { profile, caseContext }) {
  const normalized = normalizeAppSettings(settings)

  return normalizeAppSettings({
    globalSettings: normalized.globalSettings,
    profiles: normalized.profiles.map((candidate) =>
      candidate.id === normalized.globalSettings.activeProfileId ? normalizeProfile({ ...candidate, ...profile }) : candidate
    ),
    currentCaseContext: {
      ...normalized.currentCaseContext,
      ...caseContext
    }
  })
}

function isLegacySettingsShape(settings) {
  return Object.hasOwn(settings, 'clientReplacement')
    || Object.hasOwn(settings, 'clientVariants')
    || Object.hasOwn(settings, 'exactEntities')
    || Object.hasOwn(settings, 'patterns')
    || Object.hasOwn(settings, 'ner')
}

function normalizeProfiles(profiles, legacySettings) {
  if (Array.isArray(profiles) && profiles.length > 0) {
    return profiles.map(normalizeProfile)
  }

  return [normalizeProfile({
    id: DEFAULT_PROFILE_ID,
    name: 'General',
    patterns: legacySettings?.patterns,
    ner: legacySettings?.ner
  })]
}

function normalizeProfile(profile = {}) {
  return {
    id: normalizeString(profile.id) || DEFAULT_PROFILE_ID,
    name: normalizeString(profile.name) || 'General',
    patterns: {
      dates: normalizePatternRule(profile.patterns?.dates, DEFAULT_PROFILE.patterns.dates.replacement),
      emails: normalizePatternRule(profile.patterns?.emails, DEFAULT_PROFILE.patterns.emails.replacement),
      phones: normalizePatternRule(profile.patterns?.phones, DEFAULT_PROFILE.patterns.phones.replacement)
    },
    ner: {
      enabled: Boolean(profile.ner?.enabled),
      modelPath: normalizeString(profile.ner?.modelPath),
      tokenizerPath: normalizeString(profile.ner?.tokenizerPath),
      minConfidence: normalizeConfidence(profile.ner?.minConfidence)
    }
  }
}

function normalizeActiveProfileId(activeProfileId, profiles) {
  const normalizedId = normalizeString(activeProfileId)
  return profiles.some((profile) => profile.id === normalizedId) ? normalizedId : profiles[0]?.id ?? DEFAULT_PROFILE_ID
}

function normalizeCaseContext(caseContext = {}) {
  return {
    clientReplacement: normalizeString(caseContext.clientReplacement),
    clientVariants: normalizeMultilineString(caseContext.clientVariants),
    exactEntities: Array.isArray(caseContext.exactEntities)
      ? caseContext.exactEntities.map(normalizeExactEntity).filter(hasMeaningfulExactEntity)
      : []
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

  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_PROFILE.ner.minConfidence
}

function buildProfileId(name, profiles) {
  const base = normalizeString(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profile'

  let candidate = base
  let suffix = 2
  while (profiles.some((profile) => profile.id === candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }

  return candidate
}
