'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  Chapter,
  ContentBlock,
  Question,
  TrainingModule
} from '@/lib/training-content';
import { ChapterIllustration } from '@/app/training/modules/[slug]/illustrations';

type QuestionState = {
  selected: Set<number>;
  submitted: boolean;
  correct: boolean;
  shuffledOrder: number[];
};

type ChapterState = Record<number, QuestionState[]>;

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initialQuestionStates(chapter: Chapter): QuestionState[] {
  return chapter.questions.map((q) => ({
    selected: new Set<number>(),
    submitted: false,
    correct: false,
    shuffledOrder: shuffle(q.options.map((_, idx) => idx))
  }));
}

export function ModulePlayer({
  module: mod,
  alreadyCompleted,
  email
}: {
  module: TrainingModule;
  alreadyCompleted: boolean;
  email: string;
}) {
  const router = useRouter();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterStates, setChapterStates] = useState<ChapterState>(() => {
    const init: ChapterState = {};
    mod.chapters.forEach((c, i) => {
      init[i] = initialQuestionStates(c);
    });
    return init;
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const chapter = mod.chapters[chapterIndex];
  const isLastChapter = chapterIndex === mod.chapters.length - 1;
  const questionStates = useMemo(
    () => chapterStates[chapterIndex] ?? [],
    [chapterStates, chapterIndex]
  );

  // Record start on the server when the module first loads.
  useEffect(() => {
    if (alreadyCompleted) return;
    void fetch(`/api/training/modules/${mod.slug}/start`, { method: 'POST' }).catch(() => {
      setStartError('Could not initialize this training session. Reload the page.');
    });
  }, [alreadyCompleted, mod.slug]);

  // Reset per-chapter dwell + scroll on chapter change. Setting state here is
  // intentional: the chapter index changing is the synchronization event.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setScrolledToEnd(false);
  }, [chapterIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Tick the dwell timer every second.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [chapterIndex]);

  // Track whether the user has scrolled to (or past) the end of the chapter body.
  useEffect(() => {
    const onScroll = () => {
      const body = bodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const viewportBottom = window.innerHeight;
      // Consider "reached end" when the bottom of the body is within view + 60px buffer.
      if (rect.bottom - viewportBottom < 60) {
        setScrolledToEnd(true);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [chapterIndex]);

  const dwellRemaining = Math.max(0, chapter.minSeconds - elapsedSeconds);
  const dwellMet = dwellRemaining === 0;
  const questionsUnlocked = alreadyCompleted || (dwellMet && scrolledToEnd);

  const chapterQuestionsAnswered = useMemo(() => {
    if (alreadyCompleted) return true;
    return chapter.questions.every((_, qIdx) => questionStates[qIdx]?.correct === true);
  }, [alreadyCompleted, chapter.questions, questionStates]);

  const overallProgressPct = useMemo(() => {
    const total = mod.chapters.length;
    return Math.round(((chapterIndex + (chapterQuestionsAnswered ? 1 : 0)) / total) * 100);
  }, [chapterIndex, chapterQuestionsAnswered, mod.chapters.length]);

  const updateQuestion = (qIdx: number, updater: (prev: QuestionState) => QuestionState) => {
    setChapterStates((prev) => {
      const chapState = prev[chapterIndex].slice();
      chapState[qIdx] = updater(chapState[qIdx]);
      return { ...prev, [chapterIndex]: chapState };
    });
  };

  const handleSelect = (qIdx: number, optionIdx: number) => {
    const q = chapter.questions[qIdx];
    updateQuestion(qIdx, (prev) => {
      if (prev.correct) return prev;
      const next = new Set(prev.selected);
      if (q.kind === 'single') {
        next.clear();
        next.add(optionIdx);
      } else if (next.has(optionIdx)) {
        next.delete(optionIdx);
      } else {
        next.add(optionIdx);
      }
      return { ...prev, selected: next, submitted: false };
    });
  };

  const checkCorrect = (q: Question, selected: Set<number>): boolean => {
    if (selected.size !== q.correctIndices.length) return false;
    return q.correctIndices.every((idx) => selected.has(idx));
  };

  const handleSubmitQuestion = (qIdx: number) => {
    const q = chapter.questions[qIdx];
    const state = questionStates[qIdx];
    if (!state || state.selected.size === 0) return;
    const correct = checkCorrect(q, state.selected);
    if (!correct) {
      setAttempts((a) => a + 1);
    }
    updateQuestion(qIdx, (prev) => ({ ...prev, submitted: true, correct }));
  };

  const handleRetry = (qIdx: number) => {
    const q = chapter.questions[qIdx];
    updateQuestion(qIdx, () => ({
      selected: new Set<number>(),
      submitted: false,
      correct: false,
      shuffledOrder: shuffle(q.options.map((_, idx) => idx))
    }));
  };

  const handleNext = async () => {
    if (!isLastChapter) {
      setChapterIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (alreadyCompleted) {
      router.push(`/training/modules/${mod.slug}/certificate`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`/api/training/modules/${mod.slug}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 1.0, attempts })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setSubmitError(body?.error || 'Could not record completion. Please try again.');
        setSubmitting(false);
        return;
      }
      router.push(`/training/modules/${mod.slug}/certificate`);
      router.refresh();
    } catch {
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (chapterIndex === 0) return;
    setChapterIndex((i) => i - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToChapter = (idx: number) => {
    if (idx > chapterIndex) return;
    setChapterIndex(idx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextEnabled =
    chapterQuestionsAnswered && questionsUnlocked && !submitting;

  return (
    <div className="training-shell">
      <header className="training-topbar">
        <div className="training-topbar-inner">
          <Link href="/training/home" className="training-topbar-back">
            ← Exit to home
          </Link>
          <div className="training-topbar-meta">
            <span className="training-topbar-label">{mod.title}</span>
            <span className="training-topbar-pct">{overallProgressPct}% complete</span>
          </div>
        </div>
        <div className="training-progress-track">
          <div className="training-progress-fill" style={{ width: `${overallProgressPct}%` }} />
        </div>
      </header>

      <div className="training-layout">
        <aside className="training-rail">
          <p className="training-rail-eyebrow">Module</p>
          <h2 className="training-rail-title">{mod.title}</h2>
          <ol className="training-rail-list">
            {mod.chapters.map((c, idx) => {
              const isCurrent = idx === chapterIndex;
              const isDone = idx < chapterIndex;
              return (
                <li
                  key={c.slug}
                  className={`training-rail-item ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => goToChapter(idx)}
                    disabled={idx > chapterIndex}
                    className="training-rail-button"
                  >
                    <span className="training-rail-number">{isDone ? '✓' : c.number}</span>
                    <span className="training-rail-text">{c.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {alreadyCompleted ? (
            <p className="training-rail-note">You&apos;ve already completed this training. You can review freely.</p>
          ) : null}
        </aside>

        <main className="training-stage">
          <section
            className="training-hero"
            style={{
              background: `linear-gradient(135deg, ${chapter.accent} 0%, #171414 95%)`
            }}
          >
            <div className="training-hero-number">{String(chapter.number).padStart(2, '0')}</div>
            <div className="training-hero-text">
              <p className="training-hero-eyebrow">{chapter.eyebrow}</p>
              <h1 className="training-hero-title">{chapter.title}</h1>
              <p className="training-hero-intro">{chapter.intro}</p>
            </div>
            <div className="training-hero-illu" aria-hidden="true">
              <ChapterIllustration kind={chapter.illustration} />
            </div>
          </section>

          <article className="training-body" ref={bodyRef}>
            {chapter.blocks.map((block, i) => (
              <ContentBlockView key={i} block={block} />
            ))}
          </article>

          {!alreadyCompleted ? (
            <div className="training-gate" data-met={questionsUnlocked ? 'true' : 'false'}>
              <div className={`training-gate-row ${dwellMet ? 'is-met' : ''}`}>
                <span className="training-gate-icon">{dwellMet ? '✓' : '◷'}</span>
                <div>
                  <p className="training-gate-label">Minimum time on chapter</p>
                  <p className="training-gate-detail">
                    {dwellMet
                      ? 'Met. You can submit the knowledge check below.'
                      : `Stay for ${dwellRemaining}s longer. (${elapsedSeconds}/${chapter.minSeconds}s)`}
                  </p>
                </div>
              </div>
              <div className={`training-gate-row ${scrolledToEnd ? 'is-met' : ''}`}>
                <span className="training-gate-icon">{scrolledToEnd ? '✓' : '↓'}</span>
                <div>
                  <p className="training-gate-label">Reached end of chapter</p>
                  <p className="training-gate-detail">
                    {scrolledToEnd ? 'Met.' : 'Scroll through the rest of the chapter content above.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <section className="training-check" data-locked={!questionsUnlocked}>
            <header className="training-check-head">
              <p className="training-check-eyebrow">Knowledge check</p>
              <h2 className="training-check-title">
                {questionsUnlocked
                  ? `Confirm ${chapter.questions.length === 1 ? 'this' : 'these'} before moving on`
                  : 'Knowledge check unlocks once the gates above are met'}
              </h2>
            </header>

            <ol className="training-question-list">
              {chapter.questions.map((q, qIdx) => {
                const state = questionStates[qIdx];
                const order = state?.shuffledOrder ?? q.options.map((_, idx) => idx);
                return (
                  <li key={qIdx} className="training-question">
                    <p className="training-question-prompt">
                      <span className="training-question-num">Q{qIdx + 1}.</span>{' '}
                      {q.kind === 'multi' ? (
                        <span className="training-question-badge">Select all that apply</span>
                      ) : null}{' '}
                      {q.prompt}
                    </p>
                    <ul className="training-option-list">
                      {order.map((optIdx, displayIdx) => {
                        const opt = q.options[optIdx];
                        const isSelected = state?.selected.has(optIdx) ?? false;
                        const showCorrectness = state?.submitted === true;
                        const isCorrectOption = q.correctIndices.includes(optIdx);
                        const isSubmittedCorrect = showCorrectness && state?.correct && isCorrectOption;
                        const isSubmittedWrong =
                          showCorrectness && !state?.correct && isSelected && !isCorrectOption;
                        return (
                          <li key={optIdx}>
                            <button
                              type="button"
                              className={`training-option ${isSelected ? 'is-selected' : ''} ${
                                isSubmittedCorrect ? 'is-correct' : ''
                              } ${isSubmittedWrong ? 'is-wrong' : ''}`}
                              onClick={() => handleSelect(qIdx, optIdx)}
                              disabled={!questionsUnlocked || state?.correct === true}
                            >
                              <span className="training-option-marker">
                                {String.fromCharCode(65 + displayIdx)}
                              </span>
                              <span>{opt}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {state?.submitted && state.correct ? (
                      <div className="training-feedback training-feedback-success">
                        <strong>Correct.</strong> {q.explanation}
                      </div>
                    ) : null}

                    {state?.submitted && !state.correct ? (
                      <div className="training-feedback training-feedback-error">
                        <strong>Not correct.</strong> Review the chapter above and try again — the explanation will be revealed when you answer correctly.
                        <div>
                          <button
                            type="button"
                            className="button-ghost"
                            onClick={() => handleRetry(qIdx)}
                          >
                            Try again
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {!state?.submitted ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => handleSubmitQuestion(qIdx)}
                        disabled={!questionsUnlocked || !state || state.selected.size === 0}
                      >
                        Submit answer
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          <footer className="training-footer-nav">
            <button
              type="button"
              className="button-ghost"
              onClick={handleBack}
              disabled={chapterIndex === 0 || submitting}
            >
              ← Previous chapter
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={handleNext}
              disabled={!nextEnabled}
            >
              {submitting
                ? 'Saving...'
                : isLastChapter
                  ? alreadyCompleted
                    ? 'View certificate →'
                    : 'Complete training →'
                  : `Continue to chapter ${chapter.number + 1} →`}
            </button>
          </footer>

          {startError ? (
            <p className="helper" style={{ color: '#8c1515', textAlign: 'center', marginTop: 12 }}>
              {startError}
            </p>
          ) : null}
          {submitError ? (
            <p className="helper" style={{ color: '#8c1515', textAlign: 'center', marginTop: 12 }}>
              {submitError}
            </p>
          ) : null}

          <p className="training-footer-meta">
            Signed in as <strong>{email}</strong>. Completion is recorded against this email and the server verifies time spent on the material.
          </p>
        </main>
      </div>
    </div>
  );
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="training-paragraph">{block.text}</p>;
    case 'heading':
      return <h2 className="training-heading">{block.text}</h2>;
    case 'list':
      return (
        <ul className="training-list">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'callout':
      return (
        <div className={`training-callout training-callout-${block.variant}`}>
          {block.title ? <div className="training-callout-title">{block.title}</div> : null}
          <div className="training-callout-body">{block.text}</div>
        </div>
      );
    case 'principle':
      return <blockquote className="training-principle">{block.text}</blockquote>;
    case 'reference':
      return <p className="training-reference">{block.text}</p>;
    case 'stat-row':
      return (
        <div className="training-stat-row">
          {block.stats.map((s, i) => (
            <div key={i} className="training-stat">
              <div className="training-stat-value">{s.value}</div>
              <div className="training-stat-label">{s.label}</div>
              {s.sub ? <div className="training-stat-sub">{s.sub}</div> : null}
            </div>
          ))}
        </div>
      );
    case 'org-chart':
      return <OrgChart />;
    case 'timeline':
      return (
        <figure className="training-figure">
          <figcaption className="training-figure-title">{block.title}</figcaption>
          <ol className="training-timeline">
            {block.steps.map((step, i) => (
              <li key={i} className="training-timeline-step">
                <div className="training-timeline-marker">{i + 1}</div>
                <div>
                  <div className="training-timeline-day">{step.day}</div>
                  <div className="training-timeline-label">{step.label}</div>
                  <div className="training-timeline-detail">{step.detail}</div>
                </div>
              </li>
            ))}
          </ol>
        </figure>
      );
    case 'tier-table':
      return (
        <figure className="training-figure">
          <figcaption className="training-figure-title">{block.title}</figcaption>
          <div className="training-tier-grid">
            {block.rows.map((row, i) => (
              <div key={i} className={`training-tier training-tier-${row.tone}`}>
                <div className="training-tier-head">{row.name}</div>
                <div className="training-tier-threshold">{row.threshold}</div>
                <div className="training-tier-consequence">{row.consequence}</div>
              </div>
            ))}
          </div>
        </figure>
      );
    case 'flowchart':
      return (
        <figure className="training-figure">
          <figcaption className="training-figure-title">{block.title}</figcaption>
          <div className="training-flow">
            <div className="training-flow-root">
              {block.nodes
                .filter((n) => n.tone === 'primary')
                .map((n) => (
                  <div key={n.id} className="training-flow-node training-flow-node-primary">
                    {n.label}
                  </div>
                ))}
            </div>
            <div className="training-flow-branches">
              {block.edges.map((e, i) => {
                const target = block.nodes.find((n) => n.id === e.to);
                if (!target) return null;
                return (
                  <div key={i} className="training-flow-branch">
                    {e.label ? <div className="training-flow-edge">{e.label}</div> : null}
                    <div
                      className={`training-flow-node ${
                        target.tone === 'external' ? 'training-flow-node-external' : ''
                      }`}
                    >
                      {target.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </figure>
      );
    case 'image-figure':
      return (
        <figure className="training-figure">
          <div className="training-illu-card">
            <ChapterIllustration kind={block.illustration} />
          </div>
          {block.caption ? <figcaption className="training-figure-caption">{block.caption}</figcaption> : null}
        </figure>
      );
    default:
      return null;
  }
}

function OrgChart() {
  return (
    <figure className="training-figure">
      <figcaption className="training-figure-title">Executive Board (§3.1.3)</figcaption>
      <div className="org-chart">
        <div className="org-row org-row-top">
          <div className="org-card org-card-primary">
            <div className="org-card-label">Two Co-Presidents</div>
            <div className="org-card-sub">Overall leadership, external rep, final authority in urgent matters</div>
          </div>
        </div>
        <div className="org-connector" />
        <div className="org-row org-row-mid">
          <div className="org-card">
            <div className="org-card-label">Vice President</div>
            <div className="org-card-sub">Fills in for Co-Presidents</div>
          </div>
          <div className="org-card">
            <div className="org-card-label">Financial Officer</div>
            <div className="org-card-sub">SSR funds, card, quarterly reports</div>
          </div>
          <div className="org-card">
            <div className="org-card-label">Strategy Director</div>
            <div className="org-card-sub">Priorities + execution gaps</div>
          </div>
        </div>
        <div className="org-row org-row-mid">
          <div className="org-card">
            <div className="org-card-label">Outreach Lead</div>
            <div className="org-card-sub">Sponsors, publicity, events</div>
          </div>
          <div className="org-card">
            <div className="org-card-label">Secretary / Comms</div>
            <div className="org-card-sub">Minutes, records, internal comms</div>
          </div>
          <div className="org-card org-card-muted">
            <div className="org-card-label">Advisory Officer(s)</div>
            <div className="org-card-sub">Former Co-Presidents, non-executive</div>
          </div>
        </div>
        <div className="org-connector org-connector-deep" />
        <div className="org-row org-row-bottom">
          <div className="org-card org-card-team">
            <div className="org-card-label">Teams</div>
            <div className="org-card-sub">Each led by 1–2 Team Leads — see stanfordssr.org for the current roster</div>
          </div>
        </div>
      </div>
    </figure>
  );
}
