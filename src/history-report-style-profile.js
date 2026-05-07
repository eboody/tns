import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

const DEFAULT_PREFERRED_TERMS = [
  termRule('endorsed', ['described', 'reported'], ['stated'], 'global', 'strong_preference'),
  termRule('remarkable for', ['unremarkable', 'within normal limits'], ['notable for'], 'global', 'strong_preference'),
  termRule('within normal limits', ['normal'], ['fine', 'okay'], 'medical_and_developmental_history', 'strong_preference'),
  termRule('rigid adherence to routines', ['rigid patterns of behavior'], ['just right behaviors'], 'presenting_complaints', 'strong_preference'),
  termRule('diagnostic clarification', ['treatment planning', 'care'], ['figure out what is going on'], 'reason_for_referral', 'strong_preference')
]

const DEFAULT_QUOTE_RULES = {
  preserveQuoteOnlyWhenObservedOrConfirmed: true,
  defaultMode: 'paraphrase_preferred',
  preferredUseCases: [
    'short phrase preserved in exemplar and clinically phrased as secondary clarification',
    'patient wording retained only when house style also retains that pattern'
  ],
  disallowedUseCases: [
    'long transcript-like passages',
    'quotes preserved solely because the model finds them interesting',
    'quoted diagnostic or speculative language from clinician notes'
  ],
  examplePreservedPhrases: ['just right'],
  clinicianConfirmationRequired: true
}

const DEFAULT_ANTI_STYLE_RULES = {
  disallowedTerms: ['the corpus suggests', 'available artifacts indicate', 'the admitted record supports'],
  disallowedPatterns: ['workflow language in final prose', 'generic AI reassurance', 'unattributed diagnostic certainty'],
  tooAiSoundingPatterns: ['overly abstract summarization', 'excessive meta-language'],
  tooInterpretivePatterns: ['therefore she has', 'this proves', 'this confirms diagnosis'],
  confidenceLevel: 'provisional'
}

export async function runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId, exemplarPath = path.join(repoRoot, 'docs', '2026-report.md') }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const classification = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'case-classification.json'), 'utf8'))
  const exemplarText = await readFile(exemplarPath, 'utf8')

  const sections = parseReportSections(exemplarText)
  const styleProfile = compileStyleProfile({ sections, classification, exemplarPath })
  const houseLexicon = compileHouseLexicon({ sections, classification })
  const quoteRules = compileQuoteRules({ sections, exemplarText })
  const antiStyleRules = compileAntiStyleRules()
  const memoStyleRules = compileMemoStyleRules(styleProfile)
  const memoLexiconOverrides = compileMemoLexiconOverrides(houseLexicon)
  const governingProfile = {
    runId,
    caseId,
    exemplarPath,
    classification,
    requiresClinicianConfirmation: true,
    confirmationReason: 'provisional profile compiled from exemplars and default doctrine; clinician confirmation still required for promotion to stable doctrine',
    styleProfile,
    houseLexicon,
    quoteRules,
    antiStyleRules,
    memoStyleRules,
    memoLexiconOverrides
  }

  await Promise.all([
    writeJson(path.join(runRoot, '03-derived', 'style-profile.json'), styleProfile),
    writeJson(path.join(runRoot, '03-derived', 'house-lexicon.json'), houseLexicon),
    writeJson(path.join(runRoot, '03-derived', 'quote-rules.json'), quoteRules),
    writeJson(path.join(runRoot, '03-derived', 'anti-style-rules.json'), antiStyleRules),
    writeJson(path.join(runRoot, '03-derived', 'memo-style-rules.json'), memoStyleRules),
    writeJson(path.join(runRoot, '03-derived', 'memo-lexicon-overrides.json'), memoLexiconOverrides),
    writeJson(path.join(runRoot, '03-derived', 'governing-profile.json'), governingProfile),
    writeFile(path.join(runRoot, '03-derived', 'style-profile.md'), createStyleProfileMarkdown(governingProfile), 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    governingProfilePath: path.join(runRoot, '03-derived', 'governing-profile.json'),
    requiresClinicianConfirmation: true
  }
}

function compileStyleProfile({ sections, classification, exemplarPath }) {
  const headings = sections.map((section) => section.heading)
  const sentenceOpenings = collectSentenceOpenings(sections.flatMap((section) => section.paragraphs))
  const globalPhrases = countPreferredPhrases(sections.flatMap((section) => section.paragraphs).join(' '))

  return {
    targetGenre: 'polished outpatient neuropsychological history-report prose',
    exemplarPath,
    globalStyleConfidence: 'medium',
    caseTypeStyleConfidence: classification.lifecycleSchema === 'transition_age_young_adult' ? 'medium' : 'low',
    supportedByExamples: headings,
    missingExampleTypes: classification.chronologicalAgeGroup === 'child' ? ['child exemplars'] : [],
    requiresClinicianConfirmation: true,
    voiceRules: [
      'Lead with the clinical pattern, then developmental timing, then examples, then functional impact.',
      'Prefer clinician-native attributions such as CLIENT described, CLIENT endorsed, mother reported, and records indicate.',
      'Keep diagnostic restraint and do not let style introduce unsupported interpretation.'
    ],
    paragraphConstruction: {
      medianSentenceCount: median(sections.flatMap((section) => section.paragraphs.map((paragraph) => paragraph.sentences.length))),
      commonOpenings: sentenceOpenings,
      commonPhrases: globalPhrases
    },
    sectionSpecificOverrides: buildSectionOverrides(sections),
    caseTypeOverrides: {
      transition_age_young_adult: {
        emphasis: ['educational context', 'parent collateral', 'college transition burden'],
        confidence: classification.lifecycleSchema === 'transition_age_young_adult' ? 'medium' : 'low'
      }
    }
  }
}

function compileHouseLexicon({ sections, classification }) {
  return {
    global: {
      terms: DEFAULT_PREFERRED_TERMS,
      phrases: [
        phraseRule('The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.', 'reason_for_referral'),
        phraseRule('Immediate family history is remarkable for', 'family_history'),
        phraseRule('Currently, CLIENT', 'global'),
        phraseRule('Specifically,', 'presenting_complaints')
      ],
      sentencePatterns: [
        sentencePattern('CLIENT endorsed notable <domain> challenges related to <cluster>.', 'presenting_complaints'),
        sentencePattern('Medical and developmental history are unremarkable.', 'medical_and_developmental_history'),
        sentencePattern('Throughout <period>, CLIENT described <pattern> that negatively impacted <function>.', 'educational_and_occupational_history')
      ]
    },
    sectionSpecific: buildLexiconSectionOverrides(sections),
    caseTypeSpecific: {
      transition_age_young_adult: {
        preferredPhrases: ['Currently, CLIENT is a junior at USC.', 'During academic breaks, she lives with her parents.'],
        confidence: classification.lifecycleSchema === 'transition_age_young_adult' ? 'medium' : 'low'
      }
    },
    clinicianConfirmed: false
  }
}

function compileQuoteRules({ sections, exemplarText }) {
  const containsJustRight = /just right/i.test(exemplarText) || sections.some((section) => section.paragraphs.some((paragraph) => /just right/i.test(paragraph.text)))
  return {
    ...DEFAULT_QUOTE_RULES,
    observedInExemplar: containsJustRight,
    sectionSpecific: {
      presenting_complaints: {
        allowedExamples: containsJustRight ? ['just right'] : [],
        preferredMode: 'quoted_phrase_as_secondary_example'
      }
    }
  }
}

function compileAntiStyleRules() {
  return {
    ...DEFAULT_ANTI_STYLE_RULES,
    requiresClinicianConfirmation: true
  }
}

function compileMemoStyleRules(styleProfile) {
  return {
    inheritsHouseVoice: true,
    preferredTone: 'clinician-native but more directive and question-forward',
    preferredOpenings: ['Consider clarifying whether', 'It may be helpful to ask whether', 'Worth clarifying whether'],
    inheritsFromSections: Object.keys(styleProfile.sectionSpecificOverrides),
    requiresClinicianConfirmation: true
  }
}

function compileMemoLexiconOverrides(houseLexicon) {
  return {
    preferredQuestionPhrases: ['consider clarifying', 'worth asking', 'it may be helpful to clarify'],
    inheritsGlobalTerms: houseLexicon.global.terms.map((rule) => rule.preferredTerm),
    disallowedQuestionPhrases: ['this proves', 'diagnostically consistent with'],
    requiresClinicianConfirmation: true
  }
}

function buildSectionOverrides(sections) {
  const overrides = {}
  for (const section of sections) {
    const key = normalizeSectionKey(section.heading)
    overrides[key] = {
      heading: section.heading,
      paragraphCount: section.paragraphs.length,
      commonOpenings: collectSentenceOpenings(section.paragraphs),
      quoteObserved: section.paragraphs.some((paragraph) => paragraph.text.includes('“') || paragraph.text.includes('"'))
    }
  }
  return overrides
}

function buildLexiconSectionOverrides(sections) {
  const result = {}
  for (const section of sections) {
    const key = normalizeSectionKey(section.heading)
    result[key] = {
      preferredTerms: selectObservedTerms(section.paragraphs.map((paragraph) => paragraph.text).join(' ')),
      phraseExamples: countPreferredPhrases(section.paragraphs.map((paragraph) => paragraph.text).join(' '))
    }
  }
  return result
}

function parseReportSections(markdown) {
  const lines = markdown.split(/\r?\n/)
  const sections = []
  let currentSection = null
  let paragraphBuffer = []

  const flushParagraph = () => {
    if (!currentSection || paragraphBuffer.length === 0) {
      paragraphBuffer = []
      return
    }

    const text = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim()
    if (!text) {
      paragraphBuffer = []
      return
    }

    currentSection.paragraphs.push({
      text,
      sentences: splitSentences(text)
    })
    paragraphBuffer = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('### ')) {
      flushParagraph()
      currentSection = { heading: line.slice(4), paragraphs: [] }
      sections.push(currentSection)
      continue
    }

    if (!currentSection) {
      continue
    }

    if (!line) {
      flushParagraph()
      continue
    }

    paragraphBuffer.push(line)
  }

  flushParagraph()
  return sections
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
}

function collectSentenceOpenings(paragraphs) {
  const seen = new Set()
  const openings = []
  for (const paragraph of paragraphs) {
    const sentences = Array.isArray(paragraph.sentences) ? paragraph.sentences : splitSentences(paragraph.text ?? '')
    for (const sentence of sentences) {
      const opening = sentence.split(/\s+/).slice(0, 2).join(' ')
      if (opening && !seen.has(opening)) {
        seen.add(opening)
        openings.push(opening)
      }
    }
  }
  return openings.slice(0, 8)
}

function countPreferredPhrases(text) {
  const phrases = ['CLIENT described', 'CLIENT endorsed', 'Specifically,', 'Currently, CLIENT', 'Immediate family history is remarkable for']
  return phrases.filter((phrase) => text.includes(phrase))
}

function selectObservedTerms(text) {
  return ['endorsed', 'described', 'remarkable for', 'within normal limits', 'currently'].filter((term) => text.toLowerCase().includes(term.toLowerCase()))
}

function normalizeSectionKey(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function median(values) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right)
  if (filtered.length === 0) {
    return 0
  }
  const mid = Math.floor(filtered.length / 2)
  return filtered.length % 2 === 0 ? (filtered[mid - 1] + filtered[mid]) / 2 : filtered[mid]
}

function termRule(preferredTerm, allowedVariants, disallowedVariants, sectionScope, enforcementLevel) {
  return { preferredTerm, allowedVariants, disallowedVariants, sectionScope, enforcementLevel, clinicianConfirmed: false }
}

function phraseRule(phrase, sectionScope) {
  return { phrase, sectionScope, observedInExemplar: true, clinicianConfirmed: false }
}

function sentencePattern(pattern, sectionScope) {
  return { pattern, sectionScope, observedInExemplar: true, clinicianConfirmed: false }
}

function createStyleProfileMarkdown(governingProfile) {
  return [
    '# Governing Style Profile',
    '',
    `- Exemplar Path: \`${governingProfile.exemplarPath}\``,
    `- Lifecycle Schema: \`${governingProfile.classification.lifecycleSchema}\``,
    `- Requires Clinician Confirmation: \`${governingProfile.requiresClinicianConfirmation}\``,
    `- Confirmation Reason: ${governingProfile.confirmationReason}`,
    '',
    '## Preferred Global Terms',
    '',
    ...governingProfile.houseLexicon.global.terms.map((rule) => `- ${rule.preferredTerm} (${rule.enforcementLevel})`),
    '',
    '## Quote Rules',
    '',
    `- Default mode: ${governingProfile.quoteRules.defaultMode}`,
    `- Observed in exemplar: ${governingProfile.quoteRules.observedInExemplar}`,
    '',
    '## Anti-Style Rules',
    '',
    ...governingProfile.antiStyleRules.disallowedTerms.map((term) => `- avoid: ${term}`)
  ].join('\n') + '\n'
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}
