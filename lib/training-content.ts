export type StatItem = { value: string; label: string; sub?: string };
export type TimelineStep = { day: string; label: string; detail: string };
export type TierRow = { name: string; threshold: string; consequence: string; tone: 'minor' | 'major' };
export type FlowNode = { id: string; label: string; tone?: 'primary' | 'secondary' | 'external' };
export type FlowEdge = { from: string; to: string; label?: string };

export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; variant: 'info' | 'principle' | 'warn' | 'success'; title?: string; text: string }
  | { type: 'principle'; text: string }
  | { type: 'reference'; text: string }
  | { type: 'stat-row'; stats: StatItem[] }
  | { type: 'org-chart' }
  | { type: 'timeline'; title: string; steps: TimelineStep[] }
  | { type: 'tier-table'; title: string; rows: TierRow[] }
  | { type: 'flowchart'; title: string; nodes: FlowNode[]; edges: FlowEdge[] }
  | { type: 'image-figure'; illustration: 'circuit' | 'gear' | 'shield' | 'ledger' | 'broadcast' | 'compass'; caption?: string };

export type Question = {
  prompt: string;
  kind: 'single' | 'multi';
  options: string[];
  correctIndices: number[];
  explanation: string;
};

export type SimulationKind = 'workshop';

export type Chapter = {
  number: number;
  slug: string;
  eyebrow: string;
  title: string;
  intro: string;
  accent: string;
  illustration: 'circuit' | 'gear' | 'shield' | 'ledger' | 'broadcast' | 'compass' | 'workshop';
  minSeconds: number;
  blocks: ContentBlock[];
  questions: Question[];
  simulation?: { kind: SimulationKind };
};

export type TrainingModule = {
  slug: string;
  title: string;
  subtitle: string;
  required: boolean;
  gatedByOptIn?: boolean;
  estimatedMinutes: number;
  passingScore: number;
  chapters: Chapter[];
};

const initiation: TrainingModule = {
  slug: 'initiation',
  title: 'Robotics Club Member Initiation',
  subtitle:
    'A short, required orientation covering what SSR is, how it works, and how every member is expected to operate.',
  required: true,
  estimatedMinutes: 9,
  passingScore: 1.0,
  chapters: [
    {
      number: 1,
      slug: 'welcome',
      eyebrow: 'Chapter 1',
      title: 'Welcome to Stanford Student Robotics',
      intro:
        'You are now part of an organization built to design, build, and operate real robotic systems — and to train the engineers behind them.',
      accent: '#8c1515',
      illustration: 'circuit',
      minSeconds: 27,
      blocks: [
        {
          type: 'paragraph',
          text:
            'Stanford Student Robotics (SSR) is the umbrella organization for student-led robotics at Stanford. Teams under SSR build robots, drones, autonomous submarines, and competition platforms across research, competition, and service projects.'
        },
        {
          type: 'stat-row',
          stats: [
            { value: '$0', label: 'Required dues', sub: 'Forbidden by §2.6.1' },
            { value: 'All', label: 'Stanford students', sub: 'Undergrad + grad' },
            { value: 'Sept 2025', label: 'Current Constitution', sub: 'Revision 1' }
          ]
        },
        {
          type: 'paragraph',
          text:
            'Membership is open to every currently enrolled Stanford student, regardless of background or prior engineering experience. SSR exists in part to teach hands-on engineering to anyone willing to show up.'
        },
        {
          type: 'heading',
          text: 'Why we have a Constitution'
        },
        {
          type: 'paragraph',
          text:
            'SSR is governed by a written Constitution ratified by its Executive Board. It exists so that no single voice can derail the organization, and so that funds, equipment, and reputation are managed with transparency and accountability.'
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Order of authority',
          text:
            'When rules conflict: University policy prevails over the Constitution; the Constitution prevails over Bylaws; Bylaws prevail over Team charters and internal policies (§1.3.3).'
        },
        {
          type: 'principle',
          text:
            '"We strive to build not only robots, drones, and submarines, but also a legacy: one of innovation, collaboration, and leadership."'
        },
        {
          type: 'reference',
          text: 'Constitution Article I §1.2, §1.3, §2.1, §2.6.1'
        }
      ],
      questions: [
        {
          prompt: 'A first-year graduate student in mechanical engineering wants to join SSR. They have no prior robotics experience. Under the Constitution, can they join?',
          kind: 'single',
          options: [
            'No — SSR requires demonstrated robotics experience at intake',
            'Yes — membership is open to all currently enrolled Stanford students regardless of background',
            'Only as an advisor, since they have no prior experience',
            'Only if a current Team Lead nominates them'
          ],
          correctIndices: [1],
          explanation:
            '§2.1.1 makes membership open to every currently enrolled Stanford student, undergrad or graduate, regardless of engineering background. §1.2.5 reinforces that SSR exists to teach hands-on engineering to any member.'
        },
        {
          prompt: 'When a University policy conflicts with a clause in the SSR Constitution, which prevails?',
          kind: 'single',
          options: [
            'The SSR Constitution, because it was ratified by the Board',
            'Whichever is more permissive to the member',
            'University policy',
            'The disagreement is referred to the Executive Board for a vote'
          ],
          correctIndices: [2],
          explanation:
            '§1.3.3 sets a strict hierarchy: University policy > Constitution > Bylaws > Team charters.'
        },
        {
          prompt:
            'Select every statement that is true about SSR membership. (Select all that apply.)',
          kind: 'multi',
          options: [
            'SSR may never require dues as a condition of membership',
            'Members may be asked to optionally cover the cost of personal items like apparel',
            'Members must declare an engineering major to remain active',
            'Alumni may serve as advisors but cannot hold voting rights unless explicitly authorized'
          ],
          correctIndices: [0, 1, 3],
          explanation:
            '§2.6.1 forbids dues forever. §2.6.3 allows optional cost-coverage for personal-use items. §2.1.2 allows alumni as advisors only, with no voting rights unless the Bylaws explicitly grant them. No major is required.'
        },
        {
          prompt: 'Which of the following is NOT one of SSR’s stated purposes under Article I?',
          kind: 'single',
          options: [
            'Designing, building, and operating robotic systems for research, competition, and service',
            'Engaging in outreach and sponsorship to represent Stanford and secure resources',
            'Operating a paid speaker series for industry professionals',
            'Teaching hands-on engineering to any member regardless of expertise'
          ],
          correctIndices: [2],
          explanation:
            '§1.2 enumerates SSR’s purposes: building robotics, outreach/sponsorship, member training, and accountability for results. A paid speaker series is not among them.'
        }
      ]
    },
    {
      number: 2,
      slug: 'structure',
      eyebrow: 'Chapter 2',
      title: 'How SSR is structured',
      intro:
        'Two layers run SSR: the Executive Board, which governs the organization, and Teams, which build the projects.',
      accent: '#5b3a8a',
      illustration: 'gear',
      minSeconds: 48,
      blocks: [
        {
          type: 'heading',
          text: 'The Executive Board'
        },
        {
          type: 'paragraph',
          text:
            'The Board is the principal governing body of SSR. It sets strategy, oversees Teams, approves budgets, enforces the Constitution, and represents SSR to the University and the outside world.'
        },
        { type: 'org-chart' },
        {
          type: 'heading',
          text: 'Teams'
        },
        {
          type: 'paragraph',
          text:
            'Teams are the operational units of SSR. Each Team has a defined project (a competition, a research effort, an outreach initiative) and is run day-to-day by one or two Team Leads who report quarterly to the Board.'
        },
        {
          type: 'paragraph',
          text:
            'The current roster of active SSR teams is at stanfordssr.org. Most of the actual engineering work happens inside a Team, so finding one whose project excites you is the most important step after this training.'
        },
        {
          type: 'stat-row',
          stats: [
            { value: '1–2', label: 'Team Leads per Team', sub: 'Per §5.4.1' },
            { value: 'Quarterly', label: 'Team progress reports', sub: 'Submitted to the Board' },
            { value: 'stanfordssr.org', label: 'Current teams', sub: 'Public roster of active SSR teams' }
          ]
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Decisions made at the lowest level',
          text:
            '§4.1.3 directs SSR to make decisions at the lowest appropriate level of authority. Most calls happen inside the Team. Things only escalate to the Board when they affect SSR as a whole — budgets, new Teams, policy, discipline.'
        },
        {
          type: 'reference',
          text: 'Constitution Article III §3.1–3.3, Article IV §4.1–4.3, Article V §5.4, §3.7'
        }
      ],
      questions: [
        {
          prompt: 'Two Team Leads from different Teams disagree about who gets priority access to a shared workspace tool. Per §4.1.3, where should this decision be made first?',
          kind: 'single',
          options: [
            'Brought to the full Executive Board for a vote at the next meeting',
            'Escalated directly to the Co-Presidents under emergency authority',
            'Resolved between the two Team Leads themselves at the lowest appropriate level',
            'Put to a general membership vote'
          ],
          correctIndices: [2],
          explanation:
            '§4.1.3 requires decisions to be made at the lowest appropriate level of authority, escalating only as necessary.'
        },
        {
          prompt: 'Select every officer role listed in §3.1.3 of the Constitution. (Select all that apply.)',
          kind: 'multi',
          options: [
            'Co-Presidents',
            'Strategy Director',
            'Treasurer',
            'Outreach Lead',
            'Secretary / Communications Officer',
            'Chief of Staff'
          ],
          correctIndices: [0, 1, 3, 4],
          explanation:
            '§3.1.3 names: Two Co-Presidents, Vice President, Financial Officer, Strategy Director, Outreach Lead, Secretary/Communications Officer, and Advisory Officer(s). "Treasurer" and "Chief of Staff" are not constitutional roles.'
        },
        {
          prompt: 'Where can you find the current list of active SSR teams?',
          kind: 'single',
          options: [
            'Only by attending a Board meeting in person',
            'On the public site at stanfordssr.org',
            'In a Slack channel restricted to the Executive Board',
            'Posted to a Stanford-internal mailing list'
          ],
          correctIndices: [1],
          explanation:
            'The active teams roster lives on the public site at stanfordssr.org. Finding a Team whose project excites you is the most important step after this training.'
        },
        {
          prompt: 'Which of these are responsibilities of the Financial Officer? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Managing SSR funds and the credit card',
            'Reviewing team budget proposals',
            'Issuing quarterly financial reports to the Board',
            'Approving constitutional amendments without a Board vote',
            'Recording and circulating meeting minutes'
          ],
          correctIndices: [0, 1, 2],
          explanation:
            '§3.2.3 makes the Financial Officer responsible for managing funds, the SSR credit card, reviewing team proposals, preparing budgets, and issuing quarterly financial reports. Minutes are the Secretary’s job (§3.2.6). Amendments require a unanimous Board vote (§10.2.1).'
        }
      ]
    },
    {
      number: 3,
      slug: 'respect',
      eyebrow: 'Chapter 3',
      title: 'Respect: people, equipment, and the workspace',
      intro:
        'SSR runs on shared trust. Every member is expected to treat people, tools, and space with the same care they would expect in return.',
      accent: '#0e6b4e',
      illustration: 'shield',
      minSeconds: 54,
      blocks: [
        {
          type: 'heading',
          text: 'Conduct standards'
        },
        {
          type: 'paragraph',
          text:
            'Members are expected to uphold honor, integrity, respect, and accountability — internally and when representing SSR publicly. That is not a slogan; it is in §1.5.3 and §2.3.1 of the Constitution.'
        },
        {
          type: 'heading',
          text: 'Respect for SSR property'
        },
        {
          type: 'list',
          items: [
            'Log out shared tools and put them back where you found them',
            'Report damage or missing items to your Team Lead immediately — hiding a broken tool puts the next member at risk',
            'Do not take SSR equipment off-site without explicit lead approval',
            'Never use high-risk equipment without the required training or supervision (§5.7.2)',
            'Clean your work area at the end of every session — the next member should not have to clear your bench'
          ]
        },
        {
          type: 'callout',
          variant: 'warn',
          title: 'This is enforceable',
          text:
            'Misuse of SSR funds or property, gross negligence, harassment, and misconduct are all explicit grounds for disciplinary action under Article IX §9.2. The Constitution treats damage to people and damage to the club’s assets in the same category.'
        },
        {
          type: 'heading',
          text: 'If you experience or witness harassment'
        },
        {
          type: 'paragraph',
          text:
            'SSR does not tolerate harassment or misconduct between members. If something happens, you have several routes — use whichever feels safest:'
        },
        {
          type: 'flowchart',
          title: 'Reporting paths',
          nodes: [
            { id: 'start', label: 'You experience or witness harassment / misconduct', tone: 'primary' },
            { id: 'lead', label: 'Talk to your Team Lead' },
            { id: 'board', label: 'Talk to any Executive Board officer (Co-President, Financial Officer, Secretary, etc.)' },
            { id: 'petition', label: 'File a §4.7.3 petition (10% of active members triggers a formal Board review)' },
            { id: 'share', label: 'Stanford SHARE / Title IX (share.stanford.edu) — outside SSR', tone: 'external' }
          ],
          edges: [
            { from: 'start', to: 'lead', label: 'You feel safe with your lead' },
            { from: 'start', to: 'board', label: 'You don’t, or the lead is involved' },
            { from: 'start', to: 'petition', label: 'You want a formal Board review' },
            { from: 'start', to: 'share', label: 'You want an external resource' }
          ]
        },
        {
          type: 'principle',
          text: '"Honor, integrity, respect, and accountability." — Constitution §1.5.3'
        },
        {
          type: 'reference',
          text: 'Constitution §1.5.3, §2.3, §2.5, §4.7.3, §9.2'
        }
      ],
      questions: [
        {
          prompt:
            'You are working alone late one night and accidentally damage a $40 sensor. The lab is empty. The right action under SSR’s conduct standards is to:',
          kind: 'single',
          options: [
            'Hide the broken sensor and hope no one notices — it’s a small amount',
            'Replace it yourself out of pocket and never mention it, to avoid Team paperwork',
            'Report the damage to your Team Lead as soon as practical so it can be logged and replaced through proper channels',
            'Post about it on the SSR Slack to be transparent'
          ],
          correctIndices: [2],
          explanation:
            '§2.3.4 obligates members to respect financial stewardship and avoid misuse of property. Hiding damage is misuse; quiet personal replacement bypasses the ledger and breaks continuity for the next member. Report it to your Team Lead.'
        },
        {
          prompt: 'Select every reporting path that is endorsed by the Constitution for a member who experiences harassment. (Select all that apply.)',
          kind: 'multi',
          options: [
            'Speak to your Team Lead',
            'Speak to any Executive Board officer',
            'File a §4.7.3 petition signed by 10% of active members for a Board review',
            'Post anonymously about it on social media tagging SSR',
            'Stanford SHARE / Title IX Office'
          ],
          correctIndices: [0, 1, 2, 4],
          explanation:
            'All four official paths are valid: Team Lead, any Exec Board officer, a §4.7.3 petition, or Stanford’s SHARE Title IX office. Anonymous social media posting is not an official path and violates §5.6 public-image expectations.'
        },
        {
          prompt: 'Which of the following are explicit grounds for member discipline under §9.2 / §2.5? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Misuse of SSR funds or property',
            'Harassment',
            'Gross negligence in duties or repeated failure to perform responsibilities',
            'Disagreeing with a Team Lead’s design choice',
            'Election fraud or interference',
            'Preferring different software than the rest of the Team'
          ],
          correctIndices: [0, 1, 2, 4],
          explanation:
            '§9.2 lists misuse of funds/property, harassment, negligence, abuse of authority, election fraud, and repeated probation violations. Disagreement over design or tooling is not misconduct.'
        },
        {
          prompt:
            'A formal member-initiated review of an officer or Team under §4.7.3 requires a petition signed by what percentage of active members?',
          kind: 'single',
          options: ['5%', '10%', '20%', '25%'],
          correctIndices: [1],
          explanation:
            '§4.7.3: members may petition for review of any officer or Team by submitting a request signed by at least 10% of active members. The Board must investigate within one month.'
        }
      ]
    },
    {
      number: 4,
      slug: 'money',
      eyebrow: 'Chapter 4',
      title: 'Money, receipts, and financial stewardship',
      intro:
        'Every dollar SSR spends is tracked. Even if you never touch the club credit card, you are expected to understand how the money moves.',
      accent: '#b06012',
      illustration: 'ledger',
      minSeconds: 57,
      blocks: [
        {
          type: 'paragraph',
          text:
            'SSR is funded by Stanford allocations and by sponsors. Loose tracking puts the club’s next-year budget and its sponsor relationships at risk — so the rules are tight, and they apply across every Team.'
        },
        {
          type: 'timeline',
          title: 'The receipt clock',
          steps: [
            { day: 'Day 0', label: 'Purchase made', detail: 'A Team Lead buys something for the project, on card or personal funds.' },
            { day: 'Same day', label: 'Receipt captured', detail: 'Receipt photographed or saved digitally and brought into the ledger system.' },
            { day: 'Within 7 business days', label: 'Logged in shared ledger', detail: 'Standard expense logged in the shared spreadsheet (§5.5.1).' },
            { day: 'Within 14 business days', label: 'Recurring subscriptions', detail: 'Software, hosting, and other recurring services have a 14-business-day allowance.' }
          ]
        },
        {
          type: 'heading',
          text: 'Who can spend SSR money'
        },
        {
          type: 'list',
          items: [
            'Only approved Team Leads have direct SSR credit-card access (§5.5.2)',
            'Other members purchase with personal funds and submit for reimbursement',
            'Teams less than one year old, or with new Leads, may be reimbursement-only at the Board’s discretion (§5.5.3)',
            'All expenses must be pre-approved in the annual budget or via supplemental funding (§6.4.1)'
          ]
        },
        {
          type: 'tier-table',
          title: 'Financial misconduct tiers (§5.5.4)',
          rows: [
            {
              name: 'Minor violation',
              threshold: 'Misuse under $150, or repeated failure to log expenses',
              consequence: 'Team probation, possible card suspension at Board discretion',
              tone: 'minor'
            },
            {
              name: 'Major violation',
              threshold: 'Misuse > $150, intentional violation of purchasing rules, or repeated minor violations',
              consequence: 'Probation + mandatory card suspension ≥ 30 days + internal Board audit',
              tone: 'major'
            }
          ]
        },
        {
          type: 'heading',
          text: 'You cannot profit personally from SSR funds'
        },
        {
          type: 'paragraph',
          text:
            '§5.6.7(d) is unambiguous: research papers or presentations produced with SSR funding must remain free to access for any person in perpetuity, and members are strictly banned from making personal profit from SSR-funded research.'
        },
        {
          type: 'principle',
          text:
            '"Treat the SSR budget the way you’d want a sponsor to treat their investment. Every receipt logged is one less risk to your Team’s next-year funding."'
        },
        {
          type: 'reference',
          text: 'Constitution Article V §5.5, §5.6.7, Article VI §6.1–6.5'
        }
      ],
      questions: [
        {
          prompt:
            'Your Team Lead bought a $90 motor on the SSR card on a Monday. Recurring software subscriptions do not apply. By the end of which business day must this expense be logged in the shared ledger?',
          kind: 'single',
          options: [
            'The same Monday',
            'Within 5 business days (the following Monday)',
            'Within 7 business days (the following Wednesday)',
            'Within 14 business days'
          ],
          correctIndices: [2],
          explanation:
            '§5.5.1 sets a 7 business day limit for standard expenses. 14 business days applies only to recurring subscriptions. The motor is a standard one-off purchase.'
        },
        {
          prompt:
            'A Team Lead is found to have charged a $220 personal Amazon order to the SSR card. Under §5.5.4, this is classified as:',
          kind: 'single',
          options: [
            'A minor violation — handled with a verbal warning',
            'A minor violation — Team probation only',
            'A major violation — probation, mandatory card suspension ≥ 30 days, and an internal Board audit',
            'A criminal matter referred directly to Stanford police'
          ],
          correctIndices: [2],
          explanation:
            '§5.5.4(b): misuse of funds exceeding $150 (or repeated minor violations, or intentional purchasing-rule violations) is a major violation, triggering probation, a 30+ day card suspension, and an internal audit.'
        },
        {
          prompt: 'Which of these are required for any SSR Team expense? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Pre-approval in the annual budget or via a supplemental funding request',
            'Logging in the shared ledger within the allowed window',
            'Personal sign-off from both Co-Presidents on every transaction',
            'Documentation (receipt or equivalent)',
            'A public announcement on Team social media for transparency'
          ],
          correctIndices: [0, 1, 3],
          explanation:
            '§6.4.1 requires pre-approval, §5.5.1 requires logging, and §7.3.1(c) / §5.5 require receipts. Co-President sign-off on every transaction is not required, and announcing individual expenses publicly would violate sensitive-info handling under §7.5.2(a).'
        },
        {
          prompt:
            'You publish a research paper based on work funded partially by SSR. Which of the following are mandatory under §5.6.7(d)? (Select all that apply.)',
          kind: 'multi',
          options: [
            'The paper must remain free to access for any person in perpetuity',
            'You cannot make personal profit from the SSR-funded research',
            'You must acknowledge SSR in the publication',
            'You must charge a small fee to recoup SSR’s cost',
            'You can choose to paywall the paper for the first year, then make it free'
          ],
          correctIndices: [0, 1, 2],
          explanation:
            '§5.6.7(d) requires perpetual free access, SSR acknowledgment, and bans personal profit from SSR-funded research. Paywalls and recoup fees are explicitly inconsistent with the "free in perpetuity" requirement.'
        },
        {
          prompt:
            'You paid out of pocket for a $30 part your Team needed urgently. What is the correct next step?',
          kind: 'single',
          options: [
            'Keep the part and absorb the cost personally — SSR cannot reimburse you',
            'Submit the receipt to your Team Lead for reimbursement and so it can be logged in the ledger',
            'Post a photo of the receipt on the SSR Instagram for transparency',
            'Email all the Co-Presidents directly for personal approval before keeping the receipt'
          ],
          correctIndices: [1],
          explanation:
            'Members who purchase out-of-pocket submit the receipt to their Team Lead for reimbursement (§5.5.2). The Team Lead then logs the expense in the shared ledger within the §5.5.1 timeline.'
        }
      ]
    },
    {
      number: 5,
      slug: 'public-image',
      eyebrow: 'Chapter 5',
      title: 'Public image: speaking as SSR',
      intro:
        'When you wear an SSR shirt, post about a project, or stand at a sponsor demo, you are the club to whoever is watching. Treat it that way.',
      accent: '#1f5fa6',
      illustration: 'broadcast',
      minSeconds: 45,
      blocks: [
        {
          type: 'heading',
          text: 'Who speaks for SSR'
        },
        {
          type: 'paragraph',
          text:
            'The Co-Presidents and the Outreach Lead are SSR’s official voices to media, sponsors, and external organizations (§3.2.1, §3.2.5). Do not make commitments, give quotes to journalists, or sign anything on the club’s behalf without authorization.'
        },
        {
          type: 'heading',
          text: 'Social media expectations'
        },
        {
          type: 'list',
          items: [
            'Team posts highlighting SSR work should display SSR branding, be made in good faith, and be shared with the official SSR account (§5.6.1)',
            'Major Teams (>15% of SSR budget) have higher cadence requirements and must attend SSR-wide events (§5.6.2)',
            'Posts must reflect the engineering work — not personal politics or opinions on unrelated topics'
          ]
        },
        {
          type: 'heading',
          text: 'Out-of-state travel'
        },
        {
          type: 'stat-row',
          stats: [
            { value: '≥1', label: 'SSR-branded trip post', sub: 'Tagged with the official account' },
            { value: '500+', label: 'Words for newsletter', sub: 'Submitted to the Board' },
            { value: '15 days', label: 'Newsletter deadline', sub: 'After return' },
            { value: '10–20%', label: 'Auto budget cut if missed', sub: '§5.6.7' }
          ]
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Sponsor info is confidential',
          text:
            'Sponsor contracts, funding amounts, and negotiation details are sensitive information under §7.5.2(b). Do not discuss sponsor financial terms publicly or with people outside the Board / Team leadership.'
        },
        {
          type: 'principle',
          text: '"Be the engineer in the photo, not the controversy in the comments."'
        },
        {
          type: 'reference',
          text: 'Constitution §3.2.1, §3.2.5, §5.6, §7.5.2'
        }
      ],
      questions: [
        {
          prompt:
            'A reporter from a tech outlet approaches you at an SSR-hosted demo and asks for a quote about SSR’s annual sponsor revenue. The right move is to:',
          kind: 'single',
          options: [
            'Give your best estimate so the article runs accurately',
            'Decline to comment on behalf of SSR and offer to connect them with the Outreach Lead or a Co-President',
            'Direct them to the SSR Instagram DMs',
            'Share the specific sponsor figures you remember from the last Team meeting'
          ],
          correctIndices: [1],
          explanation:
            '§3.2.1 and §3.2.5 make the Co-Presidents and Outreach Lead the official external voices. Sponsor financial terms are sensitive info under §7.5.2(b) and must not be disclosed publicly.'
        },
        {
          prompt: 'For an SSR-funded out-of-state trip, which obligations apply? (Select all that apply.)',
          kind: 'multi',
          options: [
            'At least one good-faith, SSR-branded trip post on an active social account, tagged with the official SSR account',
            'A 500+ word newsletter article submitted to the Board within 15 days of return',
            'A 250-word summary posted to the public SSR Slack',
            'Failure to comply triggers an automatic budget reduction of not less than 10% and not more than 20% of the Team’s annual budget',
            'Any research papers published from the trip must remain free to access in perpetuity'
          ],
          correctIndices: [0, 1, 3, 4],
          explanation:
            '§5.6.7(a)–(d): mandatory SSR-branded trip posts, a 500+ word newsletter article within 15 days, an automatic 10–20% budget reduction for non-compliance, and perpetual free access for any research outputs.'
        },
        {
          prompt: 'A Team is preparing a recurring social-media post about their project. Per §5.6.1, which of these are required? (Select all that apply.)',
          kind: 'multi',
          options: [
            'The post displays SSR branding or logo',
            'The post is made in good faith',
            'The content is shared with or through the official SSR social media accounts',
            'The post discloses the Team’s annual budget',
            'The post includes sponsor contract terms for transparency'
          ],
          correctIndices: [0, 1, 2],
          explanation:
            '§5.6.1 requires SSR branding, good faith, and sharing with the official account. Budget and sponsor terms are sensitive under §7.5.2 and must not be in public posts.'
        },
        {
          prompt:
            'Which of the following CAN be shared publicly without violating §7.5.2?',
          kind: 'single',
          options: [
            'A photo of your Team working on the robot, with SSR branding',
            'The exact dollar amount your Team received from a named sponsor',
            'The text of an SSR sponsorship contract',
            'Internal disciplinary records from a recent Board hearing'
          ],
          correctIndices: [0],
          explanation:
            '§7.5.2 classifies financial details, sponsor contracts, and disciplinary records as sensitive. Photos of project work with SSR branding are exactly what §5.6.1 expects you to share.'
        }
      ]
    },
    {
      number: 6,
      slug: 'neutralism',
      eyebrow: 'Chapter 6',
      title: 'Neutralism: SSR’s voice and your voice',
      intro:
        'SSR depends on the trust of the University, sponsors, and a broad membership. Institutional neutralism is how we keep that trust intact.',
      accent: '#444444',
      illustration: 'compass',
      minSeconds: 42,
      blocks: [
        {
          type: 'paragraph',
          text:
            'SSR exists to build robotics, train engineers, and earn the confidence of the people and organizations that fund the work. To protect that, SSR as an institution does not take public positions on partisan politics, geopolitical conflicts, or social-movement causes that fall outside its engineering mission.'
        },
        {
          type: 'callout',
          variant: 'principle',
          title: 'The line',
          text:
            'You as an individual are free to hold and express any views you want. You are not free to express them under SSR’s name, on SSR’s channels, or while representing SSR. Personal views stay personal.'
        },
        {
          type: 'heading',
          text: 'What this looks like in practice'
        },
        {
          type: 'list',
          items: [
            'Do not post personal political content on the official SSR Instagram, website, or other club channels',
            'Do not use SSR-branded apparel or banners at unrelated personal events or causes',
            'At public events and sponsor demos, the message is engineering, education, and the projects — not politics',
            'Officers must disclose conflicts of interest and recuse themselves where appropriate (§4.6.3). The same spirit applies to every member: do not route SSR resources or sponsor relationships toward personal agendas or outside organizations'
          ]
        },
        {
          type: 'heading',
          text: 'Why this matters'
        },
        {
          type: 'paragraph',
          text:
            'A sponsor evaluating SSR, a Stanford official reviewing a funding request, or a prospective member looking at the Instagram should encounter a club unambiguously focused on robotics. Neutralism is not silence — it is discipline. It is what lets members across every background collaborate without friction, and it is what makes SSR a safe bet for the people writing the checks.'
        },
        {
          type: 'principle',
          text: '"SSR’s voice is engineering. Your voice is your own."'
        },
        {
          type: 'reference',
          text: 'Constitution §1.5.3, §4.6.3, §5.6, §5.7'
        }
      ],
      questions: [
        {
          prompt:
            'A teammate proposes that the official SSR Instagram post a statement endorsing a specific candidate in an upcoming public election. The principle of institutional neutralism implies:',
          kind: 'single',
          options: [
            'The post is fine if a majority of Team members agree with the candidate',
            'The post is not aligned with SSR’s institutional neutralism — SSR’s voice on club channels is reserved for its engineering mission. Members are free to express their views on personal accounts',
            'Only the Outreach Lead may post such endorsements',
            'The post can go up if it is later deleted within 24 hours'
          ],
          correctIndices: [1],
          explanation:
            'SSR as an institution stays on-mission. Endorsements of unrelated political causes on club channels are inconsistent with neutralism regardless of internal majority support.'
        },
        {
          prompt:
            'Which of the following are consistent with SSR’s conflict-of-interest principle and the spirit of institutional neutralism? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Being transparent about a personal stake in an outside organization before taking related action on SSR’s behalf',
            'Quietly steering an SSR sponsor relationship toward your personal startup',
            'Refusing to use SSR-branded materials at an unrelated personal political rally',
            'Using SSR resources or relationships to advance an outside cause without telling anyone'
          ],
          correctIndices: [0, 2],
          explanation:
            'The principle is simple: be transparent about conflicts and do not quietly route SSR resources or relationships toward personal agendas or outside causes.'
        },
        {
          prompt:
            'At a sponsor demo, a journalist asks for your personal opinion on an unrelated current geopolitical event. The right move is to:',
          kind: 'single',
          options: [
            'Give a detailed personal answer on behalf of SSR',
            'Decline to comment on behalf of SSR and redirect any SSR-related questions to the Outreach Lead — personal views, if shared, are clearly identified as personal and not on SSR’s account',
            'Refuse to speak with the journalist at all and walk away from the demo',
            'Take the question back to the full Board for a vote before responding'
          ],
          correctIndices: [1],
          explanation:
            'Only the Co-Presidents and Outreach Lead speak for SSR, and SSR does not take positions on unrelated topics. Decline on the club’s behalf and redirect SSR-related questions to an authorized officer.'
        },
        {
          prompt:
            'Why does SSR maintain institutional neutralism? Choose the best statement.',
          kind: 'single',
          options: [
            'Because members are not allowed to have political opinions',
            'Because it lets members across every background collaborate without friction, and keeps SSR a safe bet for sponsors, the University, and prospective members',
            'Because political content reduces social-media engagement',
            'Because the Constitution explicitly forbids any member from holding political views'
          ],
          correctIndices: [1],
          explanation:
            'Members are free to hold any views — neutralism applies to the institution, not the individual. The purpose is collaboration across differences and external trust, not personal censorship.'
        }
      ]
    }
  ]
};

const roomAccess: TrainingModule = {
  slug: 'room-access',
  title: 'Robotics Room Access',
  subtitle:
    'Required for any member who wants physical access to the SSR robotics room. Covers door policy, forbidden activities, 3D printers, and cleanup — and ends with a 3D workshop simulation.',
  required: false,
  gatedByOptIn: true,
  estimatedMinutes: 10,
  passingScore: 0.8,
  chapters: [
    {
      number: 1,
      slug: 'access-and-door',
      eyebrow: 'Chapter 1',
      title: 'Access, the door, and visitors',
      intro:
        'Access to the robotics room is a privilege you keep by following a small set of rules. The most important one is the door.',
      accent: '#8c1515',
      illustration: 'shield',
      minSeconds: 36,
      blocks: [
        {
          type: 'paragraph',
          text:
            'Stanford granted SSR a dedicated room for engineering. That access is contingent on us keeping the space safe, organized, and used only by people who have been trained.'
        },
        {
          type: 'heading',
          text: 'The door rule'
        },
        {
          type: 'list',
          items: [
            'Do not prop the door open and leave it unattended',
            'Do not let anyone you do not personally recognize into the room',
            'Do not let a friend, partner, classmate, or other non-member in just to "hang out" — they have not done this training',
            'If someone you do not know asks to come in, tell them to email an Executive Board officer to request access. Do not let them in yourself.'
          ]
        },
        {
          type: 'callout',
          variant: 'warn',
          title: 'You are personally responsible',
          text:
            'If you let someone in who damages equipment, takes property, or gets hurt, that is on you. Card-based access is logged. We can tell who unlocked the door.'
        },
        {
          type: 'heading',
          text: 'When you leave'
        },
        {
          type: 'list',
          items: [
            'Make sure the door latches behind you',
            'If you are the last one out, confirm the door is locked',
            'Lights off and printers / equipment in a safe state'
          ]
        },
        {
          type: 'principle',
          text: '"Access is a privilege you keep by guarding the door."'
        }
      ],
      questions: [
        {
          prompt:
            'You are working in the robotics room. A friend texts asking if they can come in for 15 minutes to "see the robots". They have never been to SSR. The right answer is:',
          kind: 'single',
          options: [
            'Yes — quick visits are fine',
            'No — they must email an Exec Board officer to request access; non-members do not enter without training',
            'Yes, as long as you stay with them',
            'Only if they sign a paper waiver at the door'
          ],
          correctIndices: [1],
          explanation:
            'The door rule does not have a "quick visit" exception. Everyone in the room needs to have done the training. Direct them to an Exec Board officer.'
        },
        {
          prompt: 'Which of the following are door / access mistakes you should NOT make? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Propping the door open while you step out for a snack',
            'Letting a stranger in because they say a Team Lead invited them',
            'Locking up and confirming the door latched when you are the last one out',
            'Letting a non-member partner sit in the corner and study while you work'
          ],
          correctIndices: [0, 1, 3],
          explanation:
            'Propping the door, taking unverified claims of invitation, and letting non-members "just hang out" are all violations. Locking up on the way out is exactly what you should do.'
        },
        {
          prompt:
            'You unlocked the door this morning. Later, equipment goes missing. Who is the first point of accountability?',
          kind: 'single',
          options: [
            'Whoever happens to be in the room when staff arrive',
            'The member whose card opened the door',
            'The Outreach Lead',
            'No one — it is impossible to tell'
          ],
          correctIndices: [1],
          explanation:
            'Card access is logged. We can tell who opened the door. That is why letting unverified people in is a serious problem.'
        }
      ]
    },
    {
      number: 2,
      slug: 'forbidden-activities',
      eyebrow: 'Chapter 2',
      title: 'What you cannot do in this room',
      intro:
        'The robotics room is not a wet lab, not a machine shop, and not a paint booth. A short list of activities is forbidden here because the room is not ventilated for them.',
      accent: '#b03a1f',
      illustration: 'shield',
      minSeconds: 42,
      blocks: [
        {
          type: 'paragraph',
          text:
            'The reason these activities are forbidden is simple: the room does not have the ventilation, filtration, or safety infrastructure for them. Doing them in here puts everyone — and our access to the room — at risk.'
        },
        {
          type: 'heading',
          text: 'Forbidden'
        },
        {
          type: 'list',
          items: [
            'Machining of any kind: mill, lathe, grinder, bandsaw, drill press, Dremel/rotary tool, hacksaw on metal — metal chips and dust',
            'Soldering and rework — lead and flux fumes',
            'Spray painting, aerosols, primers — VOC-heavy',
            'Solvents and adhesive work with strong fumes: acetone, MEK, two-part epoxies that off-gas',
            'Open-flame anything — butane torches, lighters held to materials',
            'Hot plates, cooking equipment, food prep'
          ]
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Where these things belong',
          text:
            'Use Stanford makerspaces with proper ventilation for the above: the Product Realization Lab (PRL), the Skilling Auditorium shops, or the maker spaces with hoods. Most of them have free undergraduate access after a quick orientation.'
        },
        {
          type: 'heading',
          text: 'Allowed (with common sense)'
        },
        {
          type: 'list',
          items: [
            'Hand assembly with screwdrivers, hex keys, wrenches',
            'Crimping and connectorizing — no soldering',
            'Programming, testing, debugging, electronics with battery / bench supply',
            '3D printing of low-fume materials only (see next chapter)',
            'CAD, design review, documentation'
          ]
        },
        {
          type: 'principle',
          text: '"If it makes smoke, fumes, sparks, or chips — it does not happen in this room."'
        }
      ],
      questions: [
        {
          prompt: 'Which of the following activities are forbidden inside the robotics room? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Soldering a wire harness',
            'Hand-assembling a robot with screwdrivers and hex keys',
            'Dremel-cutting a metal bracket',
            'Spray painting a printed enclosure',
            'Testing code on a robot powered by a bench supply',
            'Heating a hot plate to cure an epoxy'
          ],
          correctIndices: [0, 2, 3, 5],
          explanation:
            'Soldering, machining/cutting, spray painting, and any heating / curing activity are forbidden here. Hand assembly and bench-supply electronics are fine.'
        },
        {
          prompt:
            'You need to cut a piece of aluminum stock to length for the chassis. Where should you do it?',
          kind: 'single',
          options: [
            'In the robotics room with a hacksaw, near the door',
            'In a Stanford makerspace with proper ventilation and machining tools — PRL or similar',
            'Outside on a bench in front of the building',
            'At your dorm room desk'
          ],
          correctIndices: [1],
          explanation:
            'Machining belongs in a ventilated shop. Use the Product Realization Lab or another Stanford makerspace equipped for it.'
        },
        {
          prompt:
            'A teammate says "I just need to do a quick solder on this connector — five minutes." The right response is:',
          kind: 'single',
          options: [
            'Sure, just open the window',
            'No — soldering is not done in this room regardless of duration. Take it to a space with a fume extractor.',
            'OK if you turn on a desk fan',
            'Only if you wear a dust mask'
          ],
          correctIndices: [1],
          explanation:
            'Time-limited soldering is still soldering, and the room is not ventilated for it. A window or fan does not solve flux fumes. Go to a properly equipped space.'
        }
      ]
    },
    {
      number: 3,
      slug: 'printers',
      eyebrow: 'Chapter 3',
      title: '3D printers: Prusa Core One+ and Bambu H2D',
      intro:
        'The room has two 3D printers. Both are enclosed, but enclosed does not mean fume-proof — and a few simple rules keep us out of trouble.',
      accent: '#5b3a8a',
      illustration: 'workshop',
      minSeconds: 48,
      blocks: [
        {
          type: 'stat-row',
          stats: [
            { value: 'PLA · PETG', label: 'Allowed materials', sub: 'Low-fume only' },
            { value: 'ABS · ASA · PC · Nylon', label: 'Forbidden', sub: 'Off-gas VOCs / particulate' },
            { value: 'Trained leads', label: 'Start prints', sub: 'Members may submit jobs' }
          ]
        },
        {
          type: 'heading',
          text: 'Material policy'
        },
        {
          type: 'paragraph',
          text:
            'Both printers technically support high-temperature materials. We do not use them in this room. ABS, ASA, polycarbonate, and most nylons release volatile organic compounds and ultrafine particles, and the room is not ventilated for that. PLA and PETG are the allowed materials. PLA-CF and PETG-CF are case-by-case — ask your Team Lead.'
        },
        {
          type: 'heading',
          text: 'Operating rules'
        },
        {
          type: 'list',
          items: [
            'Only trained Team Leads (or other members the Board has signed off on) start prints — you can submit jobs, but you do not press Start unless you have been trained',
            'Do not open the printer enclosure during a print. Enclosure exists to contain heat, particulate, and (with the Bambu H2D) the AMS material flow',
            'Do not modify the slicer profiles for materials you have not been trained on',
            'Long prints that will run past close-time: only if the printer has remote monitoring AND a trained member is responsible. Otherwise stop the print before you leave.',
            'When changing filament, route the unloaded spool back to its labeled storage shelf — do not leave it on the floor or workbench'
          ]
        },
        {
          type: 'callout',
          variant: 'warn',
          title: 'When something goes wrong',
          text:
            'If you see smoke, smell something burning, or hear an unusual sound — stop the printer (the front-panel button is enough), step back, and tell a Team Lead immediately. Do not try to fix it yourself.'
        },
        {
          type: 'heading',
          text: 'Specific to each printer'
        },
        {
          type: 'paragraph',
          text:
            'Prusa Core One+: enclosed CoreXY. Treat the chamber as warm — let it cool before reaching in. Bambu H2D: dual nozzle, AMS-fed; the AMS picks the spool for you, so make sure no forbidden material is loaded into any of its slots.'
        },
        {
          type: 'principle',
          text: '"If it is not PLA or PETG, it does not print here."'
        }
      ],
      questions: [
        {
          prompt: 'You need to print a structural bracket that requires high stiffness, and you find a spool of nylon on the rack. Can you load it into the Bambu H2D?',
          kind: 'single',
          options: [
            'Yes — the H2D supports nylon',
            'No — nylon off-gasses and the room is not ventilated for it; use PLA, PETG, or take the job to a ventilated space',
            'Yes, but only if you open the enclosure to vent it',
            'Only on weekends'
          ],
          correctIndices: [1],
          explanation:
            'The H2D can mechanically print nylon, but the room cannot ventilate the fumes. Allowed materials are PLA and PETG. PLA-CF / PETG-CF are case-by-case via your Team Lead.'
        },
        {
          prompt: 'Which of the following are required practice for the room\'s 3D printers? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Only trained members start prints',
            'Keep the enclosure closed during a print',
            'Submit print jobs through your Team Lead if you have not been trained',
            'Leave the printer running overnight any time you want',
            'Smelling something odd is a stop-the-print event — alert a Team Lead'
          ],
          correctIndices: [0, 1, 2, 4],
          explanation:
            'Trained-only operation, enclosure closed, jobs submitted through a lead if you have not been trained, and stopping on unusual smell/sound are all required. Overnight prints require remote monitoring AND a responsible trained member.'
        },
        {
          prompt:
            'It is 11pm and your print has six hours left. You have not done overnight-print training. The correct action is:',
          kind: 'single',
          options: [
            'Leave it running — overnight prints are normal',
            'Stop the print before you leave; restart tomorrow with a trained member responsible',
            'Ask another member nearby to "keep an eye on it" overnight',
            'Open the enclosure so the print finishes faster'
          ],
          correctIndices: [1],
          explanation:
            'Overnight prints require remote monitoring and a trained member who has signed off as responsible. Without that, stop the print.'
        }
      ]
    },
    {
      number: 4,
      slug: 'cleanup-and-tools',
      eyebrow: 'Chapter 4',
      title: 'Tool care, cleanup, and overnight rules',
      intro:
        'The room is shared. The condition you leave it in is the condition the next person finds it in.',
      accent: '#0e6b4e',
      illustration: 'shield',
      minSeconds: 36,
      blocks: [
        {
          type: 'heading',
          text: 'Tools'
        },
        {
          type: 'list',
          items: [
            'Every tool has a labeled spot on a shelf. Return it to that spot when you are done — not to the workbench, not to a random shelf, not to "I\'ll deal with it later"',
            'Tools out of place is the single most common complaint about the room. Do not be the reason',
            'Damaged or missing tools: report to your Team Lead immediately so it can be logged and replaced',
            'Do not take tools off-site without explicit lead approval'
          ]
        },
        {
          type: 'heading',
          text: 'Workbench and floor'
        },
        {
          type: 'list',
          items: [
            'Clear your workbench at the end of every session',
            'In-progress projects go on a labeled shelf with your name and a return date — not left on the workbench overnight',
            'Nothing on the floor overnight. Boxes, parts, prints, and trash all get put away'
          ]
        },
        {
          type: 'callout',
          variant: 'warn',
          title: 'No overnight dumping',
          text:
            'Leaving your stuff on a shared workbench or on the floor overnight is one of the fastest ways to lose access. It blocks other Teams from working and signals that the room is not respected.'
        },
        {
          type: 'heading',
          text: 'Trash and consumables'
        },
        {
          type: 'list',
          items: [
            'Trash in the trash bin; recyclables in the recycling. Not in a pile next to it',
            'Cardboard boxes that fit in the bin go in the bin',
            'Empty filament spools: into recycling once dry / non-functional, not piled in a corner'
          ]
        },
        {
          type: 'principle',
          text: '"Leave the room cleaner than you found it. Every time."'
        }
      ],
      questions: [
        {
          prompt:
            'You are partway through a build but it is 1am and you have class in the morning. The right way to leave the workbench is:',
          kind: 'single',
          options: [
            'Leave everything as it is so you can pick up where you left off',
            'Move the in-progress assembly to a labeled shelf with your name and a return date; return tools; clear the workbench',
            'Push everything to one side of the workbench',
            'Throw your work in progress in the trash to save space'
          ],
          correctIndices: [1],
          explanation:
            'In-progress projects belong on a labeled shelf with name + return date, not on a shared workbench overnight. Tools always return to their labeled spots.'
        },
        {
          prompt: 'Which of these are overnight rules for the robotics room? (Select all that apply.)',
          kind: 'multi',
          options: [
            'Nothing on the workbench',
            'Nothing on the floor',
            'In-progress work on a labeled shelf with name and return date',
            'Tools left out wherever they were last used — you will put them away next time'
          ],
          correctIndices: [0, 1, 2],
          explanation:
            'Workbench and floor are clear overnight; in-progress projects live on a labeled shelf. Tools always go back to their labeled spots, never "later".'
        },
        {
          prompt: 'You finish using a 4mm hex key. The right next step is:',
          kind: 'single',
          options: [
            'Leave it on the workbench so it is handy for the next person',
            'Put it in any open slot on the nearest shelf',
            'Return it to its labeled spot on the hand-tools shelf',
            'Take it back to your dorm in case you need it later'
          ],
          correctIndices: [2],
          explanation:
            'Every tool has a labeled home. Returning tools to their labeled spots is the single most-broken rule in the room — do not break it.'
        }
      ]
    },
    {
      number: 5,
      slug: 'simulation',
      eyebrow: 'Final',
      title: 'Workshop simulation',
      intro:
        'Step into the simulated robotics room. Follow the work orders, avoid the safety violations, and keep the room clean. Score 80% or higher to complete this training.',
      accent: '#171414',
      illustration: 'workshop',
      minSeconds: 0,
      simulation: { kind: 'workshop' },
      blocks: [],
      questions: []
    }
  ]
};

const modules: TrainingModule[] = [initiation, roomAccess];

export function getModule(slug: string): TrainingModule | undefined {
  return modules.find((m) => m.slug === slug);
}

export function listModules(): TrainingModule[] {
  return modules;
}

export function totalQuestions(module: TrainingModule): number {
  return module.chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
}

export function totalMinSeconds(module: TrainingModule): number {
  return module.chapters.reduce((sum, chapter) => sum + chapter.minSeconds, 0);
}
