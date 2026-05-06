export function buildRuntimeSettingsPayload(settings) {
  const minConfidence = Number(settings.ner.minConfidence || '0.7')

  return {
    profile: {
      patterns: settings.patterns,
      ner: {
        enabled: settings.ner.enabled,
        modelPath: settings.ner.modelPath,
        tokenizerPath: settings.ner.tokenizerPath,
        minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.7
      }
    },
    caseContext: {
      clientReplacement: settings.clientReplacement,
      clientVariants: splitLines(settings.clientVariants),
      exactEntities: settings.exactEntities
        .filter(hasMeaningfulExactEntity)
        .map((entity) => ({
          entityType: entity.entityType,
          replacement: entity.replacement,
          variants: splitLines(entity.variants)
        }))
    }
  }
}

function hasMeaningfulExactEntity(entity) {
  return Boolean(entity.entityType || entity.replacement || entity.variants)
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
