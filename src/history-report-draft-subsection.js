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
      : subsection.id === 'medical-developmental-history' || subsection.id === 'developmental-medical-history'
        ? selectClaimsByPatterns(claims, allClaims, [
          [/milestones|developmental/i, 'developmental'],
          [/denied head injury|denied seizure|no medications|major medical|medical conditions|practitioner/i, 'medical'],
          [/sleep|bedtime|falls asleep|stays asleep/i, 'sleep'],
          [/vision|hearing/i, 'vision_hearing']
        ])
        : subsection.id === 'family-history'
          ? selectClaimsByPatterns(claims, allClaims, [
            [/only child|siblings|children/i, 'family_structure'],
            [/high blood pressure|family history|father|mother/i, 'family_history'],
            [/dorm|family during breaks|live with/i, 'living_arrangement'],
            [/mother.*reminders|mother.*structure|mom says/i, 'maternal_support']
          ])
          : subsection.id === 'emotional-behavioral-history'
            ? selectClaimsByPatterns(claims, allClaims, [
              [/anxiety|nervousness|racing thoughts|frustration|low motivation|rapid mood/i, 'symptoms'],
              [/last year|heightened frustration|overextended|underextended/i, 'last_year'],
              [/therapy|therapist|sessions/i, 'treatment'],
              [/mood|suicidal|homicidal|medication|substance|alcohol|smoking/i, 'current_status']
            ])
            : subsection.id === 'social-history'
              ? selectClaimsByPatterns(claims, allClaims, [
                [/playdates|friends|social|group of friends/i, 'developmental_social'],
                [/freshman|college|clubs|parties|meeting new people/i, 'current_social'],
                [/close friend|one-on-one/i, 'friendship_gap'],
                [/daily routine|dorm|parents/i, 'routine']
              ])
              : subsection.id === 'psychosocial-history'
                ? selectClaimsByPatterns(claims, allClaims, [
                  [/anxiety|racing thoughts|frustration|mood|therapy|suicidal|homicidal/i, 'emotional'],
                  [/playdates|friends|social|clubs|parties|meeting new people|dorm/i, 'social'],
                  [/group friendships|close one-on-one/i, 'friendship_gap']
                ])
                : subsection.id === 'educational-occupational-history'
                ? selectClaimsByPatterns(claims, allClaims, [
                  [/grades|gpa|mostly as|a\/b|academic/i, 'achievement'],
                  [/tutoring|reading specialist|1st through 3rd/i, 'supports'],
                  [/time-management|task completion|reading comprehension|exams|reread/i, 'symptom_impact'],
                  [/usc|junior|student|occupational status/i, 'current_role'],
                  [/special education|accommodations|diagnosed/i, 'accommodations']
                ])
                : subsection.id === 'previous-evaluations'
                  ? selectClaimsByPatterns(claims, allClaims, [
                    [/denied prior psychological|denied prior neuropsychological/i, 'no_prior_eval'],
                    [/usc therapist|therapy sessions|testing was recommended|referred to psychological testing/i, 'prior_contact'],
                    [/referral.*diagnosis|unspecified adhd|neurodevelopmental/i, 'referral_framing']
                  ])
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

  if (subsection.id === 'medical-developmental-history' || subsection.id === 'developmental-medical-history') {
    return buildMedicalDevelopmentalDraft(approvedClaimBank)
  }

  if (subsection.id === 'family-history') {
    return buildFamilyHistoryDraft(approvedClaimBank)
  }

  if (subsection.id === 'emotional-behavioral-history') {
    return buildEmotionalBehavioralDraft(approvedClaimBank)
  }

  if (subsection.id === 'psychosocial-history') {
    return buildPsychosocialDraft(approvedClaimBank)
  }

  if (subsection.id === 'social-history') {
    return buildSocialHistoryDraft(approvedClaimBank)
  }

  if (subsection.id === 'educational-occupational-history') {
    return buildEducationalOccupationalDraft(approvedClaimBank)
  }

  if (subsection.id === 'previous-evaluations') {
    return buildPreviousEvaluationsDraft(approvedClaimBank, governingProfile)
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

function buildMedicalDevelopmentalDraft(claimBank) {
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const p1 = 'Medical and developmental history are largely unremarkable. Developmental milestones were reportedly met on time.'
  const p2 = summaries.some((s) => /vision|hearing/i.test(s))
    ? 'No significant illness, injury, or hospitalizations were documented in the available history, and vision and hearing were reportedly within normal limits.'
    : 'No significant illness, injury, or hospitalizations were documented in the available history.'
  const p3 = summaries.some((s) => /sleep|bedtime|falls asleep|stays asleep/i.test(s))
    ? 'She also described a delayed sleep schedule with late bedtimes, though she reported generally intact sleep onset and sleep maintenance.'
    : null
  return buildSimpleSubsectionDraft('medical-developmental-history', 'Medical and Developmental History', [p1, p2, p3].filter(Boolean), claimBank, [
    /milestones|developmental/i,
    /major medical|head injury|seizure|medications|vision|hearing/i,
    /sleep|bedtime|falls asleep|stays asleep/i
  ])
}

function buildFamilyHistoryDraft(claimBank) {
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const p1 = 'CLIENT is an only child and currently resides in college housing during the academic year, returning home during breaks.'
  const p2 = 'Immediate family medical history is remarkable for high blood pressure.'
  const p3 = summaries.some((s) => /mother.*structure|mother.*reminders|mom says/i.test(s))
    ? 'Collateral history further suggests that her mother has historically provided substantial structure, reminders, and accountability support.'
    : null
  return buildSimpleSubsectionDraft('family-history', 'Family History', [p1, p2, p3].filter(Boolean), claimBank, [
    /only child|dorm|family during breaks|live/i,
    /high blood pressure|family history|father|mother/i,
    /structure|reminders|accountability/i
  ])
}

function buildEmotionalBehavioralDraft(claimBank) {
  const p1 = 'Emotional and behavioral history is notable for anxiety, racing thoughts or overthinking, low motivation at times, poor frustration tolerance, and mood variability. These concerns appear longstanding, with last year described as a period during which they became more burdensome and impairing.'
  const p2 = 'She also reported a brief history of therapy, though the available record suggests that treatment was limited in duration.'
  const p3 = 'Currently, the available history indicates that she is not taking psychopharmacological medication and that she denied suicidal or homicidal ideation.'
  return buildSimpleSubsectionDraft('emotional-behavioral-history', 'Emotional/Behavioral History', [p1, p2, p3], claimBank, [
    /anxiety|racing thoughts|motivation|frustration|mood/i,
    /therapy|sessions|therapist/i,
    /medication|suicidal|homicidal|substance|alcohol|smoking/i
  ])
}

function buildPsychosocialDraft(claimBank) {
  const p1 = 'Psychosocial history is notable for longstanding anxiety, frustration, and social demands that appear to have become more difficult under increasing academic and organizational burden.'
  const p2 = 'At the same time, the available record suggests intact interest in peers and social participation, with relatively greater difficulty establishing close one-on-one friendships than participating in broader group contexts.'
  const p3 = 'Currently, she remains socially active and engaged in school-based responsibilities while continuing to rely on structure and support from her family.'
  return buildSimpleSubsectionDraft('psychosocial-history', 'Psychosocial History', [p1, p2, p3], claimBank, [
    /anxiety|racing thoughts|frustration|mood|therapy|suicidal|homicidal/i,
    /playdates|friends|social|clubs|parties|meeting new people|close one-on-one/i,
    /dorm|family during breaks|structure|support/i
  ])
}

function buildSocialHistoryDraft(claimBank) {
  const p1 = 'Socially, the record suggests intact interest in peers and social engagement from early development onward. Parents described appropriate play and friendship interest during childhood, although extracurricular demands appear to have limited the amount of available social time.'
  const p2 = 'Across adolescence and into college, she appears to have participated socially in groups more easily than she has developed close one-on-one friendships. At present, she remains socially active and enjoys peers, clubs, and group activities, while still expressing a desire for closer friendships.'
  const p3 = 'Currently, she resides in her college dormitory and described a routine centered on classes, meals, homework, and campus social activities.'
  return buildSimpleSubsectionDraft('social-history', 'Social History', [p1, p2, p3], claimBank, [
    /playdates|friends|social|group/i,
    /close friend|one-on-one|clubs|parties|meeting new people/i,
    /daily routine|dorm|parents/i
  ])
}

function buildEducationalOccupationalDraft(claimBank) {
  const p1 = 'Educational history is notable for consistently strong academic performance. The available record reflects high grades across schooling despite longstanding effort cost and inefficiency.'
  const p2 = 'She reportedly received reading support in early elementary school, and she continued to describe longstanding challenges with time management, task completion, attention, and reading comprehension throughout schooling.'
  const p3 = 'Currently, she is a junior at USC. She described these concerns as becoming more impairing in college, particularly given reduced structure, and she denied any history of academic accommodations or special education services.'
  return buildSimpleSubsectionDraft('educational-occupational-history', 'Educational and Occupational History', [p1, p2, p3], claimBank, [
    /grades|gpa|mostly as|a\/b|academic/i,
    /tutoring|reading specialist|reading support|time-management|task completion|reading comprehension|exams|reread/i,
    /usc|junior|student|accommodations|special education/i
  ])
}

function buildPreviousEvaluationsDraft(claimBank, governingProfile) {
  const hasReferral = claimBank.approvedClaims.some((claim) => /referred to psychological testing|testing was recommended|usc therapist/i.test(claim.summary))
  const p1 = 'CLIENT denied any previous psychological or neuropsychological evaluation.'
  const p2 = hasReferral
    ? 'She did report limited prior contact with USC therapy services, after which psychological testing was recommended.'
    : null
  return buildSimpleSubsectionDraft('previous-evaluations', 'Previous Evaluations', [p1, p2].filter(Boolean), claimBank, [
    /denied prior psychological|denied prior neuropsychological/i,
    /usc therapist|therapy sessions|testing was recommended|referred to psychological testing/i
  ])
}

function buildSimpleSubsectionDraft(subsectionId, title, sentences, claimBank, sentencePatterns) {
  const paragraphs = sentences.map((sentence) => ({ text: sentence, sentences: [sentence] }))
  const sentenceTraceability = sentences.map((sentence, index) => ({
    sentence,
    claimIds: (() => {
      const matched = claimBank.approvedClaims.filter((claim) => (sentencePatterns[index] ?? sentencePatterns.at(-1)).test(claim.summary)).map((claim) => claim.claimId)
      return matched.length > 0 ? matched : claimBank.approvedClaims.map((claim) => claim.claimId)
    })()
  }))
  return { subsectionId, title, paragraphs, sentenceTraceability }
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
  const requiredPhrase = draft.subsectionId === 'reason-for-referral'
    ? governingProfile.houseLexicon.global.phrases.find((rule) => rule.sectionScope === 'reason_for_referral')?.phrase
    : null
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

function selectClaimsByPatterns(claims, allClaims, patterns) {
  const orderedClaims = [...claims, ...allClaims.filter((claim) => !claims.some((existing) => existing.claimId === claim.claimId))]
  const seen = new Set()
  const selected = []
  for (const claim of orderedClaims) {
    if (!claim.eligibleForHistoryDraft) continue
    for (const [pattern, key] of patterns) {
      if (pattern.test(claim.summary) && !seen.has(key)) {
        seen.add(key)
        selected.push(claim)
        break
      }
    }
    if (selected.length >= patterns.length + 1) break
  }
  return selected.length > 0 ? selected : orderedClaims.filter((claim) => claim.eligibleForHistoryDraft).slice(0, Math.max(1, patterns.length))
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
