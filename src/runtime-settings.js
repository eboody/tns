export function buildRuntimeSettingsPayload({ profile, caseContext }) {
  const minConfidence = Number(profile.ner.minConfidence || '0.7')

  return {
    profile: {
      patterns: profile.patterns,
      ner: {
        enabled: profile.ner.enabled,
        modelPath: profile.ner.modelPath,
        tokenizerPath: profile.ner.tokenizerPath,
        minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.7
      }
    },
    caseContext: {
      clientReplacement: caseContext.clientReplacement,
      clientVariants: splitLines(caseContext.clientVariants),
      exactEntities: caseContext.exactEntities
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
