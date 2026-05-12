export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; variant: 'info' | 'principle' | 'warn' | 'success'; title?: string; text: string }
  | { type: 'principle'; text: string }
  | { type: 'reference'; text: string };

export type Question = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type Chapter = {
  number: number;
  slug: string;
  eyebrow: string;
  title: string;
  intro: string;
  accent: string;
  blocks: ContentBlock[];
  questions: Question[];
};

export type TrainingModule = {
  slug: string;
  title: string;
  subtitle: string;
  required: boolean;
  estimatedMinutes: number;
  passingScore: number;
  chapters: Chapter[];
};

const initiation: TrainingModule = {
  slug: 'initiation',
  title: 'Robotics Club Member Initiation',
  subtitle:
    'A short, required orientation covering what SSR is, how it works, and how we expect every member to operate.',
  required: true,
  estimatedMinutes: 15,
  passingScore: 1.0,
  chapters: [
    {
      number: 1,
      slug: 'welcome',
      eyebrow: 'Chapter 1',
      title: 'Welcome to Stanford Student Robotics',
      intro:
        'You are now part of an organization built to design, build, and operate real robotic systems — and to train the next generation of engineers behind them.',
      accent: '#8c1515',
      blocks: [
        {
          type: 'paragraph',
          text:
            'Stanford Student Robotics (SSR) is the umbrella organization for student-led robotics at Stanford. Our teams build robots, drones, autonomous submarines, and competition platforms across research, competition, and service projects.'
        },
        {
          type: 'paragraph',
          text:
            'SSR is open to every currently enrolled Stanford student, regardless of background or prior engineering experience. The club exists, in part, to teach hands-on engineering to anyone willing to show up and learn.'
        },
        {
          type: 'callout',
          variant: 'success',
          title: 'Zero dues, always',
          text:
            'SSR may never require dues as a condition of membership. Your seat at the bench is paid for by University funding, sponsors, and the work of every member before you.'
        },
        {
          type: 'heading',
          text: 'Why we have a Constitution'
        },
        {
          type: 'paragraph',
          text:
            'SSR is governed by a Constitution (Revision 1, September 2025) ratified by the Executive Board. It exists so that no single voice can derail the organization, and so that funds, equipment, and reputation are managed with transparency and accountability.'
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
          prompt: 'Which of the following best describes SSR’s purpose?',
          options: [
            'Sponsoring student travel and social events',
            'Designing, building, and operating robotic systems for research, competition, and service',
            'A weekly speaker series on robotics careers'
          ],
          correctIndex: 1,
          explanation:
            'Per Article I §1.2, SSR exists to facilitate designing, building, and operating robotic systems — plus training and outreach in support of that work.'
        },
        {
          prompt: 'How much does SSR membership cost per academic year?',
          options: ['$50', '$100', '$0 — SSR may never require dues'],
          correctIndex: 2,
          explanation:
            'Article II §2.6.1 forbids SSR from ever charging dues as a condition of membership. Optional contributions for personal items (e.g., apparel) are allowed.'
        }
      ]
    },
    {
      number: 2,
      slug: 'structure',
      eyebrow: 'Chapter 2',
      title: 'How SSR is structured',
      intro:
        'Two layers run SSR: the Executive Board, which governs the organization, and Teams, which actually build the projects.',
      accent: '#5b3a8a',
      blocks: [
        {
          type: 'heading',
          text: 'The Executive Board'
        },
        {
          type: 'paragraph',
          text:
            'The Board is the principal governing body of SSR. It sets strategy, oversees Teams, approves budgets, enforces the Constitution, and represents SSR to the University.'
        },
        {
          type: 'list',
          items: [
            'Two Co-Presidents — overall leadership, external representation, final authority in urgent matters',
            'Vice President — fills in for the Co-Presidents and supports operations',
            'Financial Officer — manages SSR funds, the credit card, and quarterly financial reports',
            'Strategy Director — advises on priorities and steps in where execution gaps appear',
            'Outreach Lead — sponsor relations, publicity, social media, and event coordination',
            'Secretary / Communications Officer — minutes, records, and internal communications',
            'Advisory Officer(s) — former Co-Presidents who remain as non-executive advisors'
          ]
        },
        {
          type: 'heading',
          text: 'Teams'
        },
        {
          type: 'paragraph',
          text:
            'Teams are the operational units of SSR. Each Team has a defined project (a competition, a research effort, an outreach initiative) and is run day-to-day by one or two Team Leads who report to the Board.'
        },
        {
          type: 'paragraph',
          text:
            'You can find the current roster of active SSR teams at stanfordssr.org. Most members do their actual work inside a Team — that is where the engineering happens.'
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Decisions made at the lowest level',
          text:
            'Article IV §4.1.3 directs SSR to make decisions at the lowest appropriate level of authority. Most calls happen inside the Team. Things only escalate to the Board when they affect SSR as a whole — budgets, recognition of new Teams, policy, discipline.'
        },
        {
          type: 'reference',
          text: 'Constitution Article III §3.1–3.3, Article IV §4.1–4.3, Article V §5.4'
        }
      ],
      questions: [
        {
          prompt: 'Who manages a Team’s day-to-day operations and represents it to the Board?',
          options: ['The Co-Presidents', 'The Team Lead(s)', 'The Financial Officer'],
          correctIndex: 1,
          explanation:
            'Article V §5.4.1 places each Team under one or two Team Leads, who serve as the primary liaison with the Executive Board.'
        },
        {
          prompt: 'How many Co-Presidents does SSR have?',
          options: ['One', 'Two', 'Up to five'],
          correctIndex: 1,
          explanation: 'Article III §3.1.3(a) defines two Co-Presidents on the Executive Board.'
        },
        {
          prompt: 'Where can you find the current list of SSR teams?',
          options: [
            'Only by attending a Board meeting',
            'On stanfordssr.org',
            'On the dorm bulletin board'
          ],
          correctIndex: 1,
          explanation: 'The active teams roster lives on the public site at stanfordssr.org.'
        }
      ]
    },
    {
      number: 3,
      slug: 'respect',
      eyebrow: 'Chapter 3',
      title: 'Respect: for people, equipment, and the workspace',
      intro:
        'SSR runs on shared trust. Every member is expected to treat people, tools, and space with the same care they would expect in return.',
      accent: '#0e6b4e',
      blocks: [
        {
          type: 'heading',
          text: 'Conduct standards'
        },
        {
          type: 'paragraph',
          text:
            'Members are expected to uphold honor, integrity, respect, and accountability — internally and when representing SSR publicly. That is not a slogan; it is in the Constitution (§1.5.3, §2.3.1).'
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
            'Clean up your work area at the end of every session — the next member should not have to clear your bench'
          ]
        },
        {
          type: 'callout',
          variant: 'warn',
          title: 'This is enforceable',
          text:
            'Misuse of SSR funds or property, gross negligence, harassment, and misconduct are explicit grounds for disciplinary action under Article IX §9.2. The Constitution treats damage to people and damage to the club’s assets in the same category.'
        },
        {
          type: 'heading',
          text: 'If you feel harassed, discriminated against, or unwelcome'
        },
        {
          type: 'paragraph',
          text:
            'SSR does not tolerate harassment or misconduct between members. If you experience or witness it, you have several routes — use whichever you feel safest with:'
        },
        {
          type: 'list',
          items: [
            'Speak to your Team Lead, if you feel comfortable doing so',
            'Reach out directly to any member of the Executive Board — a Co-President, the Financial Officer, the Secretary, or any other officer',
            'Submit a formal member petition: 10% of active members in good standing can trigger a Board review of any officer or Team (§4.7.3)',
            'For incidents involving Title IX, harassment, or safety, Stanford’s SHARE Title IX Office (share.stanford.edu) is always available outside of SSR'
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
            'If you experience harassment from another SSR member, the right first step within the club is to:',
          options: [
            'Stay silent so you don’t cause trouble for your Team',
            'Speak to your Team Lead or any Executive Board officer',
            'Post about it on social media tagging the official SSR account'
          ],
          correctIndex: 1,
          explanation:
            'Article II §2.5.5 and §4.7.3 give members direct access to Team Leads, the Board, and formal petitions. External resources like SHARE Title IX are also available.'
        },
        {
          prompt: 'Which of the following is named as grounds for disciplinary action under Article IX?',
          options: [
            'Disagreeing with a Team Lead’s design choice',
            'Misuse of SSR funds or property, harassment, or gross negligence',
            'Missing one optional Team meeting'
          ],
          correctIndex: 1,
          explanation:
            'Article IX §9.2 lists misuse of funds or property, harassment, and gross negligence among the grounds for discipline.'
        },
        {
          prompt: 'Respect for SSR property looks like:',
          options: [
            'Logging tool damage promptly and not taking equipment home without lead approval',
            'Hiding a broken tool so the Team doesn’t lose budget',
            'Locking other members out of the shared bench when you’re busy'
          ],
          correctIndex: 0,
          explanation:
            'Article II §2.3.4 obligates every member to respect financial stewardship and avoid misuse of SSR property.'
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
      blocks: [
        {
          type: 'paragraph',
          text:
            'SSR is funded by Stanford allocations and by sponsors. Loose tracking puts the club’s next-year budget and its sponsor relationships at risk — so the rules are tight, and they apply across every Team.'
        },
        {
          type: 'heading',
          text: 'The receipt clock'
        },
        {
          type: 'list',
          items: [
            'All Team expenses must be logged in the shared ledger within 7 business days of the transaction (§5.5.1)',
            'Recurring subscriptions (software, hosting, etc.) get up to 14 business days',
            'If you bought something for the Team and paid out-of-pocket, get the receipt to your Team Lead the same day if possible'
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
          type: 'callout',
          variant: 'warn',
          title: 'Misuse of funds is not vague',
          text:
            'Under §5.5.4, misuse of funds under $150 is a minor violation (Team probation, possible card suspension). Over $150 is a major violation — mandatory card suspension of at least 30 days, plus a Board audit.'
        },
        {
          type: 'heading',
          text: 'You cannot profit personally from SSR funds'
        },
        {
          type: 'paragraph',
          text:
            'Section 5.6.7(d) is unambiguous: research papers or presentations produced with SSR funding must remain free to access for any person in perpetuity, and members are strictly banned from making personal profit from SSR-funded research.'
        },
        {
          type: 'principle',
          text:
            '"Treat the SSR budget the way you’d want a sponsor to treat their investment. Every receipt logged is one less risk to your Team’s next-year funding."'
        },
        {
          type: 'reference',
          text: 'Constitution Article V §5.5, Article VI §6.1–6.5'
        }
      ],
      questions: [
        {
          prompt: 'How quickly must a non-subscription Team expense be logged after the purchase?',
          options: [
            'Whenever the Team Lead remembers',
            'Within 7 business days',
            'Once a year, at the annual audit'
          ],
          correctIndex: 1,
          explanation:
            '§5.5.1 requires expenses to be logged in the shared ledger within 7 business days (subscriptions get 14).'
        },
        {
          prompt: 'Who is authorized to use the SSR credit card?',
          options: [
            'Any member who asks the Financial Officer',
            'Only approved Team Leads (and Board-authorized officers after a track record)',
            'Only the Co-Presidents'
          ],
          correctIndex: 1,
          explanation:
            '§5.5.2 limits card access to approved Team Leads; additional officers can be authorized after two full quarters of demonstrated responsibility.'
        },
        {
          prompt: 'Misuse of SSR funds exceeding $150 is classified as:',
          options: [
            'A minor violation handled informally',
            'A major violation: card suspension of at least 30 days plus an internal audit',
            'Not regulated by the Constitution'
          ],
          correctIndex: 1,
          explanation:
            '§5.5.4(b) makes >$150 misuse a major financial-misconduct violation with automatic consequences.'
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
            'Larger and Major Teams have higher posting cadence requirements set in their signed financial agreement',
            'Posts must reflect the engineering work — not personal politics, not opinions on unrelated topics'
          ]
        },
        {
          type: 'heading',
          text: 'Out-of-state travel'
        },
        {
          type: 'paragraph',
          text:
            'If your Team takes an SSR-funded trip out of state, §5.6.7 kicks in: active social media coverage with SSR branding during the trip, plus a 500+ word newsletter article submitted to the Board within 15 days of return. Failure triggers an automatic 10–20% budget reduction.'
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
          prompt: 'Who is authorized to speak to media or sponsors on behalf of SSR?',
          options: ['Any member', 'The Co-Presidents and the Outreach Lead', 'Only Team Leads'],
          correctIndex: 1,
          explanation:
            '§3.2.1 and §3.2.5 make Co-Presidents and the Outreach Lead the official external voices of SSR.'
        },
        {
          prompt: 'After an SSR-funded out-of-state trip, your Team must submit a newsletter article within how many days?',
          options: ['15 days', '30 days', '90 days'],
          correctIndex: 0,
          explanation: '§5.6.7(c) requires a 500+ word article within 15 days of return.'
        },
        {
          prompt: 'A social media post about your Team’s progress should:',
          options: [
            'Avoid mentioning SSR so you get personal credit',
            'Display SSR branding and be shared with the official account',
            'Reveal sponsor financial terms so members understand the budget'
          ],
          correctIndex: 1,
          explanation:
            '§5.6.1 requires SSR branding and good-faith content shared with the official account. Sponsor terms are confidential under §7.5.2(b).'
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
            'A sponsor evaluating SSR, a Stanford official reviewing a funding request, or a prospective member looking at the Instagram should encounter a club that is unambiguously focused on robotics. Neutralism is not silence — it is discipline. It is what lets members across every background collaborate without friction, and it is what makes SSR a safe bet for the people writing the checks.'
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
          prompt: 'Posting a partisan political statement on the official SSR Instagram is:',
          options: [
            'Fine, if a majority of members agree with the position',
            'Not aligned with SSR’s institutional neutralism — SSR’s voice is restricted to its engineering mission',
            'Encouraged whenever a current event seems important'
          ],
          correctIndex: 1,
          explanation:
            'SSR as an institution stays on-mission. Personal views belong on your own accounts, not on club channels.'
        },
        {
          prompt:
            'At an SSR sponsor demo, a journalist asks you for a personal take on an unrelated geopolitical event. The right move is to:',
          options: [
            'Give a detailed answer on behalf of SSR',
            'Decline to comment on behalf of SSR and redirect SSR-related questions to the Outreach Lead',
            'Walk out of the demo'
          ],
          correctIndex: 1,
          explanation:
            'Only the Co-Presidents and Outreach Lead speak for SSR, and SSR does not take positions on unrelated topics. Decline politely on the club’s behalf and let an authorized officer handle anything SSR-related.'
        }
      ]
    }
  ]
};

const modules: TrainingModule[] = [initiation];

export function getModule(slug: string): TrainingModule | undefined {
  return modules.find((m) => m.slug === slug);
}

export function listModules(): TrainingModule[] {
  return modules;
}

export function totalQuestions(module: TrainingModule): number {
  return module.chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
}
