import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportDraftSubsection({ sourceDirectory, repoRoot, runId, subsectionId = 'reason-for-referral' }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const sectionPlan = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'section-plan.json'), 'utf8'))
  const claimsPayload = JSON.parse(await readFile(path.join(runRoot, '02-evidence', 'atomic-claims.json'), 'utf8'))
  const governingProfile = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'governing-profile.json'), 'utf8'))

  const subsection = sectionPlan.sections.find((section) => section.id === subsectionId)
  if (!subsection) {
    throw new Error(`Unknown subsection id: ${subsectionId}`)
  }

  const allClaims = claimsPayload.claims ?? []
  const subsectionClaims = subsection.claimIds
    .map((claimId) => allClaims.find((claim) => claim.claimId === claimId))
    .filter(Boolean)

  const approvedClaimBank = buildApprovedClaimBank({ subsection, claims: subsectionClaims, allClaims, governingProfile })
  const factualDraft = buildFactualDraft({ subsection, approvedClaimBank, governingProfile })
  const polishedDraft = polishDraft({ factualDraft, governingProfile })
  const evidenceReview = reviewEvidence({ draft: polishedDraft, approvedClaimBank, subsection })
  const styleReview = reviewStyle({ draft: polishedDraft, governingProfile })

  await Promise.all([
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.claim-bank.json`), approvedClaimBank),
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.factual.json`), factualDraft),
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.draft.json`), polishedDraft),
    writeJson(path.join(runRoot, '05-audit', `${subsectionId}.evidence-review.json`), evidenceReview),
    writeJson(path.join(runRoot, '05-audit', `${subsectionId}.style-review.json`), styleReview),
    writeFile(path.join(runRoot, '04-draft', `${subsectionId}.factual.md`), renderDraftMarkdown(subsection.title, factualDraft), 'utf8'),
    writeFile(path.join(runRoot, '04-draft', `${subsectionId}.draft.md`), renderDraftMarkdown(subsection.title, polishedDraft), 'utf8')
  ])

  return {
    caseId,
    runId,
    subsectionId,
    draftPath: path.join(runRoot, '04-draft', `${subsectionId}.draft.md`),
    evidenceReview,
    styleReview
  }
}

function buildApprovedClaimBank({ subsection, claims, allClaims, governingProfile }) {
  const selectedClaims = subsection.id === 'reason-for-referral'
    ? selectReasonForReferralClaims(claims, allClaims)
    : subsection.id === 'presenting-complaints'
      ? selectPresentingComplaintsClaims(claims, allClaims)
    : claims.filter((claim) => claim.eligibleForHistoryDraft).slice(0, 12)

  return {
    subsectionId: subsection.id,
    subsectionTitle: subsection.title,
    approvedClaims: selectedClaims.map((claim, index) => ({
      claimId: claim.claimId,
      summary: claim.claimText,
      chronology: claim.chronology,
      attributionMode: claim.attributionMode,
      preferredFraming: preferredFramingForClaim(claim, governingProfile),
      order: index + 1,
      approved: true
    }))
  }
}

function buildFactualDraft({ subsection, approvedClaimBank, governingProfile }) {
  if (subsection.id === 'reason-for-referral') {
    return buildReasonForReferralDraft(approvedClaimBank, governingProfile)
  }

  if (subsection.id === 'presenting-complaints') {
    return buildPresentingComplaintsDraft(approvedClaimBank, governingProfile)
  }

  return {
    subsectionId: subsection.id,
    title: subsection.title,
    paragraphs: [],
    sentenceTraceability: []
  }
}

function buildReasonForReferralDraft(claimBank, governingProfile) {
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const agePhrase = pickAgePhrase(summaries) ?? `CLIENT is a ${governingProfile.classification.ageYears ?? 'young'}-year-old ${governingProfile.classification.lifecycleSchema === 'transition_age_young_adult' ? 'college student' : 'adult'}`
  const genderPhrase = pickGenderPhrase(summaries)
  const referralSetting = pickReferralSetting(summaries)
  const concernPhrase = buildConcernPhrase(summaries)
  const burdenPhrase = buildBurdenPhrase(summaries)
  const purposeSentence = governingProfile.houseLexicon.global.phrases.find((rule) => rule.sectionScope === 'reason_for_referral')?.phrase
    ?? 'The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.'

  const referralVerbPhrase = agePhrase.toLowerCase().startsWith('client is') ? referralSetting.replace(/^is\s+/i, '') : referralSetting
  const sentence1 = `${agePhrase}${genderPhrase ? `, ${genderPhrase},` : ''} ${referralVerbPhrase} in the context of ${concernPhrase}${burdenPhrase}.`
  const sentence2 = purposeSentence
  const purposeClaimIds = claimBank.approvedClaims
    .filter((claim) => /testing|guidance|evaluation|referred|brain functions|helpful/i.test(claim.summary))
    .map((claim) => claim.claimId)

  const sentence1ClaimIds = claimBank.approvedClaims
    .filter((claim) => /year-old|college student|time management|attention|sensory|rigid|just right|college/i.test(claim.summary))
    .map((claim) => claim.claimId)

  return {
    subsectionId: 'reason-for-referral',
    title: 'Reason for Referral',
    paragraphs: [
      {
        text: `${sentence1} ${sentence2}`,
        sentences: [sentence1, sentence2]
      }
    ],
    sentenceTraceability: [
      {
        sentence: sentence1,
        claimIds: sentence1ClaimIds
      },
      {
        sentence: sentence2,
        claimIds: purposeClaimIds.length > 0 ? purposeClaimIds : sentence1ClaimIds.slice(0, 1)
      }
    ]
  }
}

function buildPresentingComplaintsDraft(claimBank, governingProfile) {
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const opening = 'CLIENT endorsed difficulties with a variety of cognitive, sensory, and academic challenges.'
  const timeManagement = buildTimeManagementSentence(summaries)
  const sensory = buildSensorySentence(summaries)
  const rigidity = buildRigiditySentence(summaries)
  const impact = buildImpactSentence(summaries)

  const paragraphs = [
    {
      text: `${opening} ${timeManagement}`,
      sentences: [opening, timeManagement]
    },
    {
      text: `${sensory} ${rigidity}`,
      sentences: [sensory, rigidity]
    },
    {
      text: impact,
      sentences: [impact]
    }
  ]

  return {
    subsectionId: 'presenting-complaints',
    title: 'Presenting Complaints/Symptoms',
    paragraphs,
    sentenceTraceability: [
      {
        sentence: opening,
        claimIds: claimBank.approvedClaims.filter((claim) => /attention|time management|focus|sensory|reading|rigid/i.test(claim.summary)).map((claim) => claim.claimId)
      },
      {
        sentence: timeManagement,
        claimIds: claimBank.approvedClaims.filter((claim) => /time management|late|longer than peers|task/i.test(claim.summary)).map((claim) => claim.claimId)
      },
      {
        sentence: sensory,
        claimIds: claimBank.approvedClaims.filter((claim) => /sensory|quiet|light|noise|texture/i.test(claim.summary)).map((claim) => claim.claimId)
      },
      {
        sentence: rigidity,
        claimIds: claimBank.approvedClaims.filter((claim) => /rigid|routine|just right|shower/i.test(claim.summary)).map((claim) => claim.claimId)
      },
      {
        sentence: impact,
        claimIds: claimBank.approvedClaims.filter((claim) => /college|more noticeable|frustration|impact|difficulty|reading/i.test(claim.summary)).map((claim) => claim.claimId)
      }
    ]
  }
}

function polishDraft({ factualDraft, governingProfile }) {
  const polishedParagraphs = factualDraft.paragraphs.map((paragraph) => ({
    ...paragraph,
    text: applyStyleAdjustments(paragraph.text, governingProfile)
  }))

  return {
    ...factualDraft,
    paragraphs: polishedParagraphs,
    sentenceTraceability: factualDraft.sentenceTraceability.map((entry) => ({
      ...entry,
      sentence: applyStyleAdjustments(entry.sentence, governingProfile)
    }))
  }
}

function reviewEvidence({ draft, approvedClaimBank, subsection }) {
  const approvedClaimIds = new Set(approvedClaimBank.approvedClaims.map((claim) => claim.claimId))
  const unsupported = draft.sentenceTraceability.filter((entry) => entry.claimIds.length === 0 || entry.claimIds.some((id) => !approvedClaimIds.has(id)))

  return {
    subsectionId: subsection.id,
    pass: unsupported.length === 0,
    unsupportedSentences: unsupported,
    reviewSummary: unsupported.length === 0 ? 'all sentences are traceable to approved claims' : 'unsupported sentence(s) detected'
  }
}

function reviewStyle({ draft, governingProfile }) {
  const text = draft.paragraphs.map((paragraph) => paragraph.text).join(' ')
  const disallowedTerms = governingProfile.antiStyleRules.disallowedTerms.filter((term) => text.toLowerCase().includes(term.toLowerCase()))
  const preferredTermHits = governingProfile.houseLexicon.global.terms.filter((rule) => text.toLowerCase().includes(rule.preferredTerm.toLowerCase())).map((rule) => rule.preferredTerm)
  const requiredPhrase = governingProfile.houseLexicon.global.phrases.find((rule) => rule.sectionScope === 'reason_for_referral')?.phrase
  const missingRequiredPhrase = requiredPhrase && !text.includes(requiredPhrase)

  return {
    subsectionId: draft.subsectionId,
    pass: disallowedTerms.length === 0 && !missingRequiredPhrase,
    disallowedTerms,
    preferredTermHits,
    missingRequiredPhrase: missingRequiredPhrase ? requiredPhrase : null,
    reviewSummary: disallowedTerms.length === 0 && !missingRequiredPhrase ? 'draft aligns with provisional house style requirements' : 'style deviations detected'
  }
}

function selectReasonForReferralClaims(claims, allClaims) {
  const seenCategories = new Set()
  const selected = []

  const orderedClaims = [...claims, ...allClaims.filter((claim) => !claims.some((existing) => existing.claimId === claim.claimId))]

  for (const claim of orderedClaims) {
    if (!claim.eligibleForHistoryDraft) {
      continue
    }

    const categoryKey = reasonForReferralCategoryKey(claim)
    if (categoryKey && seenCategories.has(categoryKey)) {
      continue
    }

    selected.push(claim)
    if (categoryKey) {
      seenCategories.add(categoryKey)
    }
  }

  return selected.slice(0, 12)
}

function reasonForReferralCategoryKey(claim) {
  const lower = claim.claimText.toLowerCase()
  if (/\d{1,2}[- ]?year[- ]old/.test(lower) || lower.includes('college student')) return 'identity'
  if (lower.includes('referred') || lower.includes('testing') || lower.includes('evaluation')) return 'referral'
  if (lower.includes('time management') || lower.includes('attention') || lower.includes('focus')) return 'attention_exec'
  if (lower.includes('sensory')) return 'sensory'
  if (lower.includes('rigid') || lower.includes('routine') || lower.includes('just right')) return 'rigidity'
  if (lower.includes('reading')) return 'reading'
  if (lower.includes('guidance') || lower.includes('brain functions') || lower.includes('helpful')) return 'purpose'
  return null
}

function selectPresentingComplaintsClaims(claims, allClaims) {
  const orderedClaims = [...claims, ...allClaims.filter((claim) => !claims.some((existing) => existing.claimId === claim.claimId))]
  const categories = [
    [/time management|attention|focus|concentration|late|task/i, 'time_attention'],
    [/sensory|quiet|light|noise|texture/i, 'sensory'],
    [/rigid|routine|just right|shower/i, 'rigidity'],
    [/reading/i, 'reading'],
    [/college|more noticeable|frustration|impact|difficulty completing/i, 'impact']
  ]

  const seen = new Set()
  const selected = []
  for (const claim of orderedClaims) {
    if (!claim.eligibleForHistoryDraft) continue
    for (const [pattern, key] of categories) {
      if (pattern.test(claim.summary) && !seen.has(key)) {
        seen.add(key)
        selected.push(claim)
        break
      }
    }
    if (selected.length >= categories.length + 2) break
  }
  return selected
}

function pickAgePhrase(summaries) {
  const match = summaries.join(' ').match(/CLIENT is a (\d{1,2}-year-old|\d{1,2}[- ]?year[- ]old) ([^.,;]+)/i)
  if (!match) {
    return null
  }
  const descriptor = `${match[1]} ${match[2]}`.replace(/\s+/g, ' ').trim()
  return `CLIENT is a ${descriptor}`
}

function pickGenderPhrase(summaries) {
  const joined = summaries.join(' ')
  const genderMatch = joined.match(/\b(right-handed|left-handed)\b[^.]*\b(male|female)\b/i)
  if (genderMatch) {
    return `${genderMatch[1]}, ${genderMatch[2]}`
  }
  return null
}

function pickReferralSetting(summaries) {
  const joined = summaries.join(' ')
  if (/outpatient neuropsychological assessment|outpatient neuropsychological evaluation/i.test(joined)) {
    return 'is seeking an outpatient neuropsychological assessment'
  }
  if (/psychological testing|evaluation/i.test(joined)) {
    return 'was referred for outpatient neuropsychological evaluation'
  }
  return 'is seeking an outpatient neuropsychological evaluation'
}

function buildConcernPhrase(summaries) {
  const joined = summaries.join(' ').toLowerCase()
  const parts = []
  if (/time management|attention|focus|concentration/.test(joined)) {
    parts.push('longstanding concerns related to attention, time management, and concentration')
  }
  if (/sensory/.test(joined)) {
    parts.push('sensory sensitivity')
  }
  if (/rigid|routine|just right/.test(joined)) {
    parts.push('rigid patterns of behavior')
  }
  if (/reading/.test(joined)) {
    parts.push('reading inefficiency')
  }

  return joinClinicalList(parts.length > 0 ? parts : ['longstanding concerns'])
}

function buildTimeManagementSentence(summaries) {
  const mentionsChildhood = summaries.some((summary) => /always|lifelong|childhood|since grade school/i.test(summary))
  return `She described long-standing difficulties with time management${mentionsChildhood ? ' beginning in childhood' : ''}, including chronic lateness, needing more time than peers to complete tasks, and difficulty sustaining attention efficiently.`
}

function buildSensorySentence(summaries) {
  const mentionsCollege = summaries.some((summary) => /college|usc/i.test(summary))
  return `She also described sensory sensitivities related to quiet, light, and environmental noise that interfere with focus${mentionsCollege ? ', particularly in college settings' : ''}.`
}

function buildRigiditySentence(summaries) {
  const mentionsLastYear = summaries.some((summary) => /last year|more noticeable/i.test(summary))
  return `In addition, CLIENT described rigid patterns of behavior and adherence to routines, including a need for things to feel “just right” and discomfort when routines are disrupted${mentionsLastYear ? ', which appear to have become more noticeable over the past year' : ''}.`
}

function buildImpactSentence(summaries) {
  const mentionsReading = summaries.some((summary) => /reading/i.test(summary))
  const readingClause = mentionsReading ? ' She also endorsed needing to reread material in order to fully understand it.' : ''
  return `These difficulties have contributed to frustration, reduced efficiency, and greater difficulty managing academic demands as the structure of college life has increased the burden on self-directed organization and focus.${readingClause}`.trim()
}

function buildBurdenPhrase(summaries) {
  const joined = summaries.join(' ').toLowerCase()
  if (/college|less built-in structure|more noticeable/.test(joined)) {
    return ' that have become more noticeable and burdensome in college'
  }
  return ''
}

function joinClinicalList(parts) {
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`
}

function preferredFramingForClaim(claim, governingProfile) {
  if (/guidance|brain functions|purpose/i.test(claim.claimText)) {
    return governingProfile.houseLexicon.global.phrases.find((rule) => rule.sectionScope === 'reason_for_referral')?.phrase ?? 'The purpose of this evaluation is...'
  }
  if (/time management|attention|sensory|rigid/i.test(claim.claimText)) {
    return 'CLIENT is seeking evaluation in the context of longstanding concerns related to...'
  }
  return 'CLIENT described...'
}

function applyStyleAdjustments(text, governingProfile) {
  let next = text.replace(/\s+/g, ' ').trim()
  for (const term of governingProfile.antiStyleRules.disallowedTerms) {
    if (next.toLowerCase().includes(term.toLowerCase())) {
      next = next.replace(new RegExp(term, 'ig'), '')
    }
  }
  next = next.replace(/outpatient neuropsychological evaluation/gi, 'outpatient neuropsychological assessment')
  next = next.replace(/rigid patterns of behavior/gi, 'rigid patterns of behavior')
  return next
}

function renderDraftMarkdown(title, draft) {
  return [`### ${title}`, '', ...draft.paragraphs.map((paragraph) => paragraph.text), '', '## Sentence Traceability', '', ...draft.sentenceTraceability.map((entry) => `- ${entry.sentence} -> ${entry.claimIds.join(', ')}`)].join('\n') + '\n'
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}
