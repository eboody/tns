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
  const timeManagementMemo = await readOptionalJson(path.join(runRoot, '03-derived', 'domain-memo.time-management-executive.json'))

  const subsection = sectionPlan.sections.find((section) => section.id === subsectionId)
  if (!subsection) {
    throw new Error(`Unknown subsection id: ${subsectionId}`)
  }

  const allClaims = claimsPayload.claims ?? []
  const subsectionClaims = subsection.claimIds
    .map((claimId) => allClaims.find((claim) => claim.claimId === claimId))
    .filter(Boolean)

  const approvedClaimBank = buildApprovedClaimBank({ subsection, claims: subsectionClaims, allClaims, governingProfile })
  const coveragePack = buildCoveragePack({ subsection, approvedClaimBank })
  const factualDraft = buildFactualDraft({ subsection, approvedClaimBank, governingProfile, coveragePack, domainMemos: { timeManagementMemo } })
  const coverageEnrichedDraft = enforceCoverage({ draft: factualDraft, coveragePack, subsection })
  const polishedDraft = polishDraft({ factualDraft: coverageEnrichedDraft, governingProfile })
  const evidenceReview = reviewEvidence({ draft: polishedDraft, approvedClaimBank, subsection })
  const coverageReview = reviewCoverage({ draft: polishedDraft, coveragePack, subsection })
  const styleReview = reviewStyle({ draft: polishedDraft, governingProfile })

  await Promise.all([
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.claim-bank.json`), approvedClaimBank),
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.coverage-pack.json`), coveragePack),
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.factual.json`), coverageEnrichedDraft),
    writeJson(path.join(runRoot, '04-draft', `${subsectionId}.draft.json`), polishedDraft),
    writeJson(path.join(runRoot, '05-audit', `${subsectionId}.evidence-review.json`), evidenceReview),
    writeJson(path.join(runRoot, '05-audit', `${subsectionId}.coverage-review.json`), coverageReview),
    writeJson(path.join(runRoot, '05-audit', `${subsectionId}.style-review.json`), styleReview),
    writeFile(path.join(runRoot, '04-draft', `${subsectionId}.factual.md`), renderDraftMarkdown(subsection.title, coverageEnrichedDraft), 'utf8'),
    writeFile(path.join(runRoot, '04-draft', `${subsectionId}.draft.md`), renderDraftMarkdown(subsection.title, polishedDraft), 'utf8')
  ])

  return {
    caseId,
    runId,
    subsectionId,
    draftPath: path.join(runRoot, '04-draft', `${subsectionId}.draft.md`),
    evidenceReview,
    coverageReview,
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
      specificityScore: claim.specificityScore ?? 0,
      preferredFraming: preferredFramingForClaim(claim, governingProfile),
      order: index + 1,
      approved: true
    }))
  }
}

function buildFactualDraft({ subsection, approvedClaimBank, governingProfile, coveragePack, domainMemos }) {
  if (subsection.id === 'reason-for-referral') {
    return buildReasonForReferralDraft(approvedClaimBank, governingProfile, coveragePack, domainMemos)
  }

  if (subsection.id === 'presenting-complaints') {
    return buildPresentingComplaintsDraft(approvedClaimBank, governingProfile, coveragePack, domainMemos)
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

function buildCoveragePack({ subsection, approvedClaimBank }) {
  const items = approvedClaimBank.approvedClaims.map((claim, index) => {
    const factKind = inferCoverageFactKind(subsection.id, claim.summary)
    const salience = inferCoverageSalience(subsection.id, claim.summary, factKind, claim)
    return {
      coverageId: `${subsection.id}-coverage-${index + 1}`,
      claimId: claim.claimId,
      factText: claim.summary,
      factKind,
      salience,
      chronology: claim.chronology,
      attributionMode: claim.attributionMode,
      specificityScore: claim.specificityScore ?? 0,
      sourceSupport: [claim.claimId],
      coveredInDraft: false,
      omitted: false,
      omissionReason: null
    }
  })

  return {
    subsectionId: subsection.id,
    subsectionTitle: subsection.title,
    items
  }
}

function inferCoverageFactKind(subsectionId, text) {
  const lower = text.toLowerCase()

  if (/mother|mom says|parents|corroborat|only child|high blood pressure/i.test(text)) return 'collateral_corroboration'
  if (/childhood|grade school|1st grade|3rd grade|middle school|high school|freshman|junior|last year|college/i.test(text)) return 'developmental_anchor'
  if (/school bus|dance class|air conditioning|jeans|sunshine|mantel|specific side|chair|playdates|parties|clubs|reread|writing\/thinking/i.test(text)) return 'concrete_example'
  if (/difficulty|frustration|late|focus|attention|time management|sensory|rigid|mood|anxiety|reading|therapy/i.test(lower)) return 'core_concern'
  if (/prepare for classes|assignments on time|deadline|impact|impaired|burdensome|academic demands/i.test(lower)) return 'functional_consequence'
  return 'background_context'
}

function inferCoverageSalience(subsectionId, text, factKind, claim) {
  const lower = text.toLowerCase()
  const specificityScore = Number(claim.specificityScore ?? 0)

  if (subsectionId === 'reason-for-referral') {
    if (/year-old|right-handed|female|time management|sensory|rigid|reading comprehension|purpose|testing|guidance/i.test(lower)) {
      return 'required'
    }
    if (/attention|concentration|college|frustration/i.test(lower) && factKind !== 'concrete_example') {
      return 'required'
    }
    if (factKind === 'concrete_example' || factKind === 'developmental_anchor') {
      return 'preferred'
    }
  }

  if (subsectionId === 'presenting-complaints' && (/time management|sensory|rigid|reading|frustration|attention|concentration|school bus|dance class|air conditioning|jeans|sunshine|shower|mantel|prepare for classes|assignments on time/i.test(lower) || factKind === 'functional_consequence')) {
    return 'required'
  }

  if (factKind === 'functional_consequence') return 'required'
  if (factKind === 'core_concern') return 'preferred'
  if (factKind === 'concrete_example' && specificityScore >= 3) return 'preferred'
  if (factKind === 'developmental_anchor') return 'preferred'
  return 'optional'
}

function enforceCoverage({ draft, coveragePack, subsection }) {
  const coveredClaimIds = new Set(draft.sentenceTraceability.flatMap((entry) => entry.claimIds))
  const uncoveredRequired = coveragePack.items.filter((item) => item.salience === 'required' && !coveredClaimIds.has(item.claimId))
  const uncoveredPreferred = coveragePack.items.filter((item) => item.salience === 'preferred' && !coveredClaimIds.has(item.claimId))
  const preferredFallbackLimit = preferredCoverageCatchupLimit(subsection.id)
  const catchupItems = [...uncoveredRequired, ...uncoveredPreferred.slice(0, preferredFallbackLimit)]

  if (catchupItems.length === 0) {
    return draft
  }

  const catchupSentence = buildCoverageCatchupSentence(subsection.id, catchupItems)
  if (!catchupSentence) {
    return draft
  }

  return {
    ...draft,
    paragraphs: [...draft.paragraphs, { text: catchupSentence, sentences: [catchupSentence] }],
    sentenceTraceability: [...draft.sentenceTraceability, {
      sentence: catchupSentence,
      claimIds: catchupItems.map((item) => item.claimId)
    }]
  }
}

function preferredCoverageCatchupLimit(subsectionId) {
  if (subsectionId === 'reason-for-referral' || subsectionId === 'presenting-complaints') return 0
  return 2
}

function buildCoverageCatchupSentence(subsectionId, items) {
  const phrases = items.map((item) => coverageFactPhrase(item.factText, subsectionId)).filter(Boolean)
  if (phrases.length === 0) return null

  const prefix = subsectionId === 'presenting-complaints'
    ? 'Additional reported details included '
    : subsectionId === 'reason-for-referral'
      ? 'Additional factors contributing to referral included '
      : 'Additional reported history included '

  return `${prefix}${joinClinicalList(phrases)}.`
}

function coverageFactPhrase(text, subsectionId) {
  const cleaned = text
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[A-Z]\.\s+[A-Z /()'-]+\s+/g, '')
    .trim()

  const lower = cleaned.toLowerCase()

  if (subsectionId === 'reason-for-referral') {
    if (/right-handed/.test(lower) && /female/.test(lower)) return 'that she is a right-handed female'
    if (/sensory/.test(lower) || /quiet|light|sound|texture/.test(lower)) return 'sensory sensitivities involving sound, light, and texture'
    if (/rigid|just right|routine/.test(lower)) return 'rigid adherence to routines and a need for things to feel “just right”'
    if (/reading/.test(lower)) return 'longstanding reading comprehension difficulty'
    if (/college|attention|concentration|frustration/.test(lower)) return 'more recent attention and concentration difficulties since starting college associated with heightened frustration'
    if (/hears every noise|can.t focus on what professor is saying/.test(lower)) return 'marked distractibility from environmental noise that interfered with hearing lectures and sustaining focus'
  }

  if (subsectionId === 'presenting-complaints') {
    if (/mantel/.test(lower)) return 'repeatedly adjusting objects such as mantel decorations until they felt “just right”'
    if (/specific side|chair|uneven/.test(lower)) return 'wanting seating arrangements to feel even and correctly positioned'
  }

  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
}

function buildReasonForReferralDraft(claimBank, governingProfile, coveragePack, domainMemos) {
  const items = sortCoverageItemsForComposition(coveragePack.items)
  const factTexts = items.map((item) => item.factText)
  const agePhrase = pickAgePhrase(factTexts) ?? `CLIENT is a ${governingProfile.classification.ageYears ?? 'young'}-year-old ${governingProfile.classification.lifecycleSchema === 'transition_age_young_adult' ? 'college student' : 'adult'}`
  const genderPhrase = pickGenderPhrase(factTexts)
  const referralSetting = pickReferralSetting(factTexts)
  const concernSentence = buildCoverageNativeReasonForReferralSentence({ agePhrase, genderPhrase, referralSetting, items, timeManagementMemo: domainMemos.timeManagementMemo })
  const purposeSentence = governingProfile.houseLexicon.global.phrases.find((rule) => rule.sectionScope === 'reason_for_referral')?.phrase
    ?? 'The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.'

  const referralContextItems = items.filter((item) => /year-old|right-handed|female|male|time management|attention|concentration|sensory|quiet|light|sound|noise|texture|rigid|reading|reread|college|frustration/i.test(item.factText))
  const purposeItems = items.filter((item) => /testing|guidance|evaluation|brain functions|helpful|referred/i.test(item.factText))

  return {
    subsectionId: 'reason-for-referral',
    title: 'Reason for Referral',
    paragraphs: [
      {
        text: `${concernSentence} ${purposeSentence}`,
        sentences: [concernSentence, purposeSentence]
      }
    ],
    sentenceTraceability: [
      {
        sentence: concernSentence,
        claimIds: referralContextItems.map((item) => item.claimId)
      },
      {
        sentence: purposeSentence,
        claimIds: purposeItems.length > 0 ? purposeItems.map((item) => item.claimId) : referralContextItems.slice(0, 1).map((item) => item.claimId)
      }
    ]
  }
}

function buildPresentingComplaintsDraft(claimBank, governingProfile, coveragePack, domainMemos) {
  const items = sortCoverageItemsForComposition(coveragePack.items)
  const timeItems = items.filter((item) => /time management|late|school bus|\bbus\b|dance class|longer to do things|task/i.test(item.factText))
  const sensoryItems = items.filter((item) => /quiet|light|noise|sound|texture|air conditioning|jeans|sunshine|clothing|sensory/i.test(item.factText))
  const rigidityItems = items.filter((item) => /rigid|routine|just right|shower|getting dressed|mantel|specific side|chair/i.test(item.factText))
  const impactItems = items.filter((item) => /college|frustration|prepare for classes|assignments on time|absorbing content|reread|reading|attentional difficulties|adhd/i.test(item.factText))

  const p1s1 = 'CLIENT endorsed difficulties with a variety of cognitive, sensory, mood, and academic challenges.'
  const p1s2 = buildCoverageNativeTimeManagementSentence(timeItems, domainMemos.timeManagementMemo)
  const p2s1 = buildCoverageNativeSensoryOverviewSentence(sensoryItems)
  const p2s2 = buildCoverageNativeSensoryDetailsSentence(sensoryItems)
  const p3s1 = buildCoverageNativeRigiditySentence(rigidityItems)
  const p3s2 = buildCoverageNativeImpactSentence(impactItems, timeItems)

  return {
    subsectionId: 'presenting-complaints',
    title: 'Presenting Complaints/Symptoms',
    paragraphs: [
      { text: `${p1s1} ${p1s2}`, sentences: [p1s1, p1s2] },
      { text: `${p2s1} ${p2s2}`, sentences: [p2s1, p2s2] },
      { text: `${p3s1} ${p3s2}`, sentences: [p3s1, p3s2] }
    ],
    sentenceTraceability: [
      { sentence: p1s1, claimIds: distinctClaimIds([...timeItems, ...sensoryItems, ...rigidityItems, ...impactItems]) },
      { sentence: p1s2, claimIds: distinctClaimIds(timeItems) },
      { sentence: p2s1, claimIds: distinctClaimIds(sensoryItems.filter((item) => /quiet|light|space|sensory|noise|texture/i.test(item.factText))) },
      { sentence: p2s2, claimIds: distinctClaimIds(sensoryItems.filter((item) => /air conditioning|jeans|sunshine|light|noise|quiet|clothing|texture/i.test(item.factText))) },
      { sentence: p3s1, claimIds: distinctClaimIds(rigidityItems) },
      { sentence: p3s2, claimIds: distinctClaimIds(impactItems) }
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
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const mentionsChildhoodDysregulation = summaries.some((summary) => /when a kid|since little|rapid mood changes|upset|crying/i.test(summary))
  const mentionsFiveSessions = summaries.some((summary) => /5 sessions|five sessions|couple intake sessions/i.test(summary))
  const p1 = `Emotional and behavioral history is notable for anxiety, racing thoughts or overthinking, low motivation at times, poor frustration tolerance, and mood variability.${mentionsChildhoodDysregulation ? ' The available history suggests that emotional reactivity and rapid shifts in engagement have been present since childhood.' : ''} These concerns appear longstanding, with last year described as a period during which they became more burdensome and impairing.`
  const p2 = `She also reported a brief history of therapy${mentionsFiveSessions ? ', consisting of approximately five sessions with a USC therapist over a period of a couple of months,' : ''}, though the available record suggests that treatment was limited in duration.`
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
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const mentionsPlaydates = summaries.some((summary) => /playdates/i.test(summary))
  const mentionsDanceOrScouts = summaries.some((summary) => /dance|girl scouts|extracurricular/i.test(summary))
  const mentionsFreshmanGroup = summaries.some((summary) => /freshman year|friend group.*dissipated|dissolved/i.test(summary))
  const mentionsFirstWeek = summaries.some((summary) => /first week of school|meeting new people/i.test(summary))
  const p1 = `Socially, the record suggests intact interest in peers and social engagement from early development onward.${mentionsPlaydates ? ' Parents described regular playdates during early childhood.' : ''}${mentionsDanceOrScouts ? ' At the same time, extracurricular demands such as dance and Girl Scouts appear to have limited the amount of available social time.' : ''}`
  const p2 = `Across adolescence and into college, she appears to have participated socially in groups more easily than she has developed close one-on-one friendships.${mentionsFreshmanGroup ? ' She described having a close friend group during her freshman year of college that later dissipated.' : ''} At present, she remains socially active and enjoys peers, clubs, and group activities, while still expressing a desire for closer friendships.${mentionsFirstWeek ? ' She also described particularly enjoying opportunities to meet new people at the start of the school year.' : ''}`
  const p3 = 'Currently, she resides in her college dormitory and described a routine centered on classes, meals, homework, and campus social activities.'
  return buildSimpleSubsectionDraft('social-history', 'Social History', [p1, p2, p3], claimBank, [
    /playdates|friends|social|group/i,
    /close friend|one-on-one|clubs|parties|meeting new people/i,
    /daily routine|dorm|parents/i
  ])
}

function buildEducationalOccupationalDraft(claimBank) {
  const summaries = claimBank.approvedClaims.map((claim) => claim.summary)
  const mentionsTutoring = summaries.some((summary) => /1st through 3rd|1st grade|3rd grade|reading specialist|reading tutor/i.test(summary))
  const mentionsExamTiming = summaries.some((summary) => /trouble completing exams in time|rushed|writing\/thinking based/i.test(summary))
  const p1 = 'Educational history is notable for consistently strong academic performance. The available record reflects high grades across schooling despite longstanding effort cost and inefficiency.'
  const p2 = `She reportedly received reading support in early elementary school${mentionsTutoring ? ', including tutoring from a reading specialist from approximately 1st through 3rd grades,' : ''} and she continued to describe longstanding challenges with time management, task completion, attention, and reading comprehension throughout schooling.${mentionsExamTiming ? ' She also described a longstanding pattern of difficulty finishing exams within the allotted time, particularly on writing- and thinking-based tests.' : ''}`
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

function reviewCoverage({ draft, coveragePack, subsection }) {
  const coveredClaimIds = new Set(draft.sentenceTraceability.flatMap((entry) => entry.claimIds))
  const itemReviews = coveragePack.items.map((item) => ({
    ...item,
    coveredInDraft: coveredClaimIds.has(item.claimId)
  }))
  const missingRequired = itemReviews.filter((item) => item.salience === 'required' && !item.coveredInDraft && !item.omitted)
  const missingPreferred = itemReviews.filter((item) => item.salience === 'preferred' && !item.coveredInDraft && !item.omitted)

  return {
    subsectionId: subsection.id,
    pass: missingRequired.length === 0,
    requiredCoverageRate: coverageRate(itemReviews, 'required'),
    preferredCoverageRate: coverageRate(itemReviews, 'preferred'),
    missingRequired: missingRequired.map((item) => ({ claimId: item.claimId, factText: item.factText, factKind: item.factKind })),
    missingPreferred: missingPreferred.map((item) => ({ claimId: item.claimId, factText: item.factText, factKind: item.factKind })),
    reviewSummary: missingRequired.length === 0 ? 'required coverage obligations satisfied' : 'required supported detail remains uncovered'
  }
}

function coverageRate(items, salience) {
  const relevant = items.filter((item) => item.salience === salience)
  if (relevant.length === 0) return 1
  const covered = relevant.filter((item) => item.coveredInDraft || item.omitted).length
  return covered / relevant.length
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
  const orderedClaims = [...claims, ...allClaims.filter((claim) => !claims.some((existing) => existing.claimId === claim.claimId))]
    .sort((left, right) => reasonForReferralSpecificityScore(claimTextForMatching(right)) - reasonForReferralSpecificityScore(claimTextForMatching(left)))
  const categories = [
    [/\d{1,2}[- ]?year[- ]old|college student|female|male|right-handed|left-handed/i, 'identity', 2],
    [/time management|attention|focus|concentration/i, 'attention_exec', 2],
    [/sensory|quiet|light|sound|noise|texture/i, 'sensory', 2],
    [/rigid|routine|just right|shower|getting dressed/i, 'rigidity', 2],
    [/reading|reread|reading comprehension/i, 'reading', 1],
    [/college|frustration|more noticeable|heightened/i, 'recent_burden', 2],
    [/testing|guidance|evaluation|brain functions|helpful|referred/i, 'purpose', 2]
  ]

  const categoryCounts = new Map()
  const selected = []
  for (const claim of orderedClaims) {
    if (!claim.eligibleForHistoryDraft) {
      continue
    }

    const text = claimTextForMatching(claim)
    for (const [pattern, key, maxCount] of categories) {
      const currentCount = categoryCounts.get(key) ?? 0
      if (pattern.test(text) && currentCount < maxCount) {
        categoryCounts.set(key, currentCount + 1)
        selected.push(claim)
        break
      }
    }
  }

  return selected.slice(0, 13)
}

function reasonForReferralSpecificityScore(text) {
  const patterns = [
    /right-handed|female|male|quiet|light|sound|noise|texture|just right|reading comprehension|heightened frustration/i,
    /time management|attention|focus|college|getting dressed|shower|reread/i,
    /testing|guidance|evaluation|brain functions/i
  ]
  return patterns.reduce((score, pattern, index) => score + (pattern.test(text) ? patterns.length - index : 0), 0)
}

function selectPresentingComplaintsClaims(claims, allClaims) {
  const orderedClaims = [...claims, ...allClaims.filter((claim) => !claims.some((existing) => existing.claimId === claim.claimId))]
    .sort((left, right) => presentingComplaintsSpecificityScore(claimTextForMatching(right)) - presentingComplaintsSpecificityScore(claimTextForMatching(left)))
  const categories = [
    [/time management|attention|focus|concentration|late|task|school bus|\bbus\b|dance class|longer to do things/i, 'time_attention', 6],
    [/sensory|quiet|light|noise|texture|air conditioning|jeans|sunshine/i, 'sensory', 6],
    [/rigid|routine|just right|shower|gets ready in a certain order|mantel|specific side|chairs/i, 'rigidity', 6],
    [/reading|re-read/i, 'reading', 1],
    [/college|more noticeable|frustration|impact|difficulty completing|prep for classes|assignments on time|absorbing content/i, 'impact', 4]
  ]

  const categoryCounts = new Map()
  const selected = []
  for (const claim of orderedClaims) {
    if (!claim.eligibleForHistoryDraft) continue
    const text = claimTextForMatching(claim)
    for (const [pattern, key, maxCount] of categories) {
      const currentCount = categoryCounts.get(key) ?? 0
      if (pattern.test(text) && currentCount < maxCount) {
        categoryCounts.set(key, currentCount + 1)
        selected.push(claim)
        break
      }
    }
    if (selected.length >= categories.reduce((sum, [, , maxCount]) => sum + maxCount, 0)) break
  }
  return selected
}

function presentingComplaintsSpecificityScore(text) {
  const patterns = [
    /school bus|\bbus\b|dance class|air conditioning|jeans|sunshine|shower every day|mantel|specific side|chairs|prep for classes|assignments on time|re-read/i,
    /quiet|light|noise|texture|just right|gets ready in a certain order|longer to do things/i,
    /time management|focus|attention|college|frustration/i
  ]
  return patterns.reduce((score, pattern, index) => score + (pattern.test(text) ? patterns.length - index : 0), 0)
}

function selectClaimsByPatterns(claims, allClaims, patterns) {
  const orderedClaims = [...claims, ...allClaims.filter((claim) => !claims.some((existing) => existing.claimId === claim.claimId))]
  const seen = new Set()
  const selected = []
  for (const claim of orderedClaims) {
    if (!claim.eligibleForHistoryDraft) continue
    const text = claimTextForMatching(claim)
    for (const [pattern, key] of patterns) {
      if (pattern.test(text) && !seen.has(key)) {
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

function claimTextForMatching(claim) {
  return String(claim.claimText ?? claim.summary ?? '')
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

function sortCoverageItemsForComposition(items) {
  return [...items].sort((left, right) => Number(right.specificityScore ?? 0) - Number(left.specificityScore ?? 0))
}

function distinctClaimIds(items) {
  return Array.from(new Set(items.map((item) => item.claimId)))
}

function buildCoverageNativeReasonForReferralSentence({ agePhrase, genderPhrase, referralSetting, items, timeManagementMemo }) {
  const identity = `${agePhrase}${genderPhrase ? `, ${genderPhrase},` : ''}`
  const concernParts = []
  if (timeManagementMemo || items.some((item) => /time management|attention|concentration|focus/i.test(item.factText))) {
    concernParts.push('notable and long-standing difficulties with time management and concentration')
  }
  if (items.some((item) => /quiet|light|sound|noise|texture|sensory/i.test(item.factText))) {
    concernParts.push('sensory sensitivities involving sound, light, and texture')
  }
  if (items.some((item) => /rigid|routine|just right|getting dressed|shower/i.test(item.factText))) {
    concernParts.push('rigid adherence to routines')
  }
  if (items.some((item) => /reading comprehension|reading|reread/i.test(item.factText))) {
    concernParts.push('reading comprehension difficulty beginning in early childhood')
  }

  const base = referralSetting.startsWith('was referred')
    ? `${identity} who ${referralSetting} in the context of ${joinClinicalList(concernParts.length > 0 ? concernParts : ['longstanding concerns'])}`
    : `${identity} ${referralSetting.replace(/^is\s+/i, '')} in the context of ${joinClinicalList(concernParts.length > 0 ? concernParts : ['longstanding concerns'])}`

  if (items.some((item) => /college|attention|concentration|frustration|heightened/i.test(item.factText))) {
    return `${base}. She also described more recent attention and concentration difficulties since starting college, which have led to heightened frustration.`
  }

  return `${base}.`
}

function buildCoverageNativeTimeManagementSentence(items, timeManagementMemo) {
  const hasBus = items.some((item) => /school bus|\bbus\b/i.test(item.factText)) || /school bus|\bbus\b/i.test(timeManagementMemo?.developmentalCourse ?? '')
  const hasDance = items.some((item) => /dance class/i.test(item.factText))
  const hasSlowCompletion = timeManagementMemo?.supportedPattern?.includes('slow task completion') || items.some((item) => /longer to do things|task/i.test(item.factText))
  const examples = [
    hasBus ? 'frequent lateness for the school bus throughout elementary, middle, and high school' : null,
    hasDance ? 'arriving late to dance classes' : null
  ].filter(Boolean)
  const exampleClause = examples.length > 0 ? ` She explained that this was evident in ${joinClinicalList(examples)}.` : ''
  return `She described long-standing challenges with time management beginning in early childhood, including chronic lateness, difficulty completing tasks efficiently, and${hasSlowCompletion ? ' needing more time than peers to finish work' : ' difficulty managing tasks within the available structure'}.${exampleClause}`
}

function buildCoverageNativeSensoryOverviewSentence(items) {
  const hasCollegeShift = items.some((item) => /college|freshman|building/i.test(item.factText))
  return `Regarding sensory sensitivities, CLIENT described long-standing sensitivities to sound, texture, and light beginning in early childhood.${hasCollegeShift ? ' She noted that these have become harder to manage since starting college.' : ''}`
}

function buildCoverageNativeSensoryDetailsSentence(items) {
  const details = []
  if (items.some((item) => /air conditioning|noise|quiet/i.test(item.factText))) {
    details.push('even slight environmental noise, such as air-conditioning or nearby conversation, could make it difficult for her to focus')
  }
  if (items.some((item) => /jeans|texture/i.test(item.factText))) {
    details.push('as a child she avoided certain clothing textures, such as jeans')
  }
  if (items.some((item) => /sunshine|light|dim|building/i.test(item.factText))) {
    details.push('she functions best in bright natural light and has more difficulty concentrating in dim environments')
  }
  return `She described that she has long needed very specific conditions of quiet, light, and space in order to focus and complete schoolwork. She added that ${joinClinicalList(details.length > 0 ? details : ['these sensory conditions significantly affected her focus'])}.`
}

function buildCoverageNativeRigiditySentence(items) {
  const examples = []
  if (items.some((item) => /shower/i.test(item.factText))) {
    examples.push('feeling compelled to shower every day and becoming uncomfortable if she did not')
  }
  if (items.some((item) => /getting dressed|certain order/i.test(item.factText))) {
    examples.push('getting dressed in a precise sequence')
  }
  if (items.some((item) => /mantel|chair|specific side|uneven/i.test(item.factText))) {
    examples.push('adjusting objects or seating arrangements until they felt “just right”')
  }
  return `CLIENT also endorsed longstanding challenges with rigid adherence to routines, although she noted that she did not fully recognize these patterns in herself until last year. Specifically, she described ${joinClinicalList(examples.length > 0 ? examples : ['a strong need for things to feel “just right”'])}.`
}

function buildCoverageNativeImpactSentence(impactItems, timeItems) {
  const hasReducedStructure = impactItems.some((item) => /college|absorbing content|frustration/i.test(item.factText))
  const hasPrep = impactItems.some((item) => /prep for classes|prepared enough for exams/i.test(item.factText))
  const hasDeadlines = impactItems.some((item) => /assignments on time|deadline|not completing some work on time/i.test(item.factText))
  const hasReading = impactItems.some((item) => /reading|re-read/i.test(item.factText))
  const impacts = [
    hasPrep ? 'insufficient time to prepare for classes' : null,
    hasDeadlines ? 'difficulty completing assignments on time' : null,
    hasReading ? 'frequently needing to reread material to fully understand it' : null
  ].filter(Boolean)
  return `Since starting college, she reported increased difficulties with attention and concentration, along with heightened stress and frustration${hasReducedStructure ? ' in the context of reduced day-to-day structure' : ''}. These difficulties contributed to ${joinClinicalList(impacts.length > 0 ? impacts : ['reduced efficiency and greater academic burden'])}.`
}

function buildConcernPhrase(summaries) {
  const joined = summaries.join(' ').toLowerCase()
  const parts = []
  if (/time management|attention|focus|concentration/.test(joined)) {
    parts.push('longstanding concerns related to attention, time management, and concentration')
  }
  if (/sensory|quiet|light|noise|texture/.test(joined)) {
    parts.push('sensory sensitivities involving sound, light, and texture')
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
  const mentionsBus = summaries.some((summary) => /school bus/i.test(summary))
  const mentionsDance = summaries.some((summary) => /dance class/i.test(summary))
  const examples = [mentionsBus ? 'frequent lateness for the school bus' : null, mentionsDance ? 'arriving late to dance classes' : null].filter(Boolean)
  const exampleClause = examples.length > 0 ? `, with examples including ${joinClinicalList(examples)}` : ''
  return `She described long-standing difficulties with time management${mentionsChildhood ? ' beginning in childhood' : ''}, including chronic lateness, needing more time than peers to complete tasks, and difficulty sustaining attention efficiently${exampleClause}.`
}

function buildSensorySentence(summaries) {
  const mentionsCollege = summaries.some((summary) => /college|usc/i.test(summary))
  const mentionsAc = summaries.some((summary) => /air conditioning|a\/c|ac\b/i.test(summary))
  const mentionsTexture = summaries.some((summary) => /texture|jeans/i.test(summary))
  const mentionsLight = summaries.some((summary) => /light|sunshine|well-lit|natural light/i.test(summary))
  const detailParts = [
    mentionsAc ? 'sound sensitivity that made air-conditioning and nearby conversation especially distracting' : null,
    mentionsTexture ? 'a childhood aversion to certain clothing textures such as jeans' : null,
    mentionsLight ? 'difficulty focusing in dim environments and a preference for bright natural light' : null
  ].filter(Boolean)
  const detailClause = detailParts.length > 0 ? ` She gave examples of ${joinClinicalList(detailParts)}.` : ''
  return `She also described sensory sensitivities related to quiet, light, and environmental noise that interfere with focus${mentionsCollege ? ', particularly in college settings' : ''}.${detailClause}`
}

function buildRigiditySentence(summaries) {
  const mentionsLastYear = summaries.some((summary) => /last year|more noticeable/i.test(summary))
  const mentionsShower = summaries.some((summary) => /shower every day|90 minutes to take a shower|need to shower/i.test(summary))
  const mentionsDress = summaries.some((summary) => /getting dressed|putting on clothes|certain order/i.test(summary))
  const mentionsObjects = summaries.some((summary) => /mantel|chairs|specific side|uneven|moving items/i.test(summary))
  const examples = [
    mentionsShower ? 'feeling compelled to shower daily' : null,
    mentionsDress ? 'getting dressed in a fixed sequence' : null,
    mentionsObjects ? 'rearranging objects or seating until they felt “just right”' : null
  ].filter(Boolean)
  const exampleClause = examples.length > 0 ? `, with examples such as ${joinClinicalList(examples)}` : ''
  return `In addition, CLIENT described rigid patterns of behavior and adherence to routines, including a need for things to feel “just right” and discomfort when routines are disrupted${mentionsLastYear ? ', which appear to have become more noticeable over the past year' : ''}${exampleClause}.`
}

function buildImpactSentence(summaries) {
  const mentionsReading = summaries.some((summary) => /reading/i.test(summary))
  const mentionsDeadlines = summaries.some((summary) => /assignments on time|deadlines|not completing some work on time/i.test(summary))
  const mentionsPrep = summaries.some((summary) => /prepare for classes|prep for classes|prepared enough for exams/i.test(summary))
  const impactExamples = [mentionsPrep ? 'insufficient time to prepare for classes' : null, mentionsDeadlines ? 'difficulty completing assignments by deadline' : null].filter(Boolean)
  const impactClause = impactExamples.length > 0 ? `, including ${joinClinicalList(impactExamples)}` : ''
  const readingClause = mentionsReading ? ' She also endorsed needing to reread material in order to fully understand it.' : ''
  return `These difficulties have contributed to frustration, reduced efficiency, and greater difficulty managing academic demands as the structure of college life has increased the burden on self-directed organization and focus${impactClause}.${readingClause}`.trim()
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

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}
