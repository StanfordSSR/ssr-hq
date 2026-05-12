'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ContentBlock, TrainingModule } from '@/lib/training-content';

type QuestionState = {
  selected: number | null;
  submitted: boolean;
  correct: boolean;
};

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
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const chapter = mod.chapters[chapterIndex];
  const isLastChapter = chapterIndex === mod.chapters.length - 1;

  const chapterQuestionsAnswered = useMemo(() => {
    return chapter.questions.every((_, qIdx) => {
      const key = `${chapter.slug}-${qIdx}`;
      return questionStates[key]?.correct === true;
    });
  }, [chapter, questionStates]);

  const overallProgressPct = useMemo(() => {
    const total = mod.chapters.length;
    return Math.round(((chapterIndex + (chapterQuestionsAnswered ? 1 : 0)) / total) * 100);
  }, [chapterIndex, chapterQuestionsAnswered, mod.chapters.length]);

  const handleSelect = (qIdx: number, optionIdx: number) => {
    const key = `${chapter.slug}-${qIdx}`;
    setQuestionStates((prev) => ({
      ...prev,
      [key]: { selected: optionIdx, submitted: false, correct: false }
    }));
  };

  const handleSubmitQuestion = (qIdx: number) => {
    const key = `${chapter.slug}-${qIdx}`;
    const state = questionStates[key];
    if (!state || state.selected === null) return;
    const correct = state.selected === chapter.questions[qIdx].correctIndex;
    if (!correct) {
      setAttempts((a) => a + 1);
    }
    setQuestionStates((prev) => ({
      ...prev,
      [key]: { selected: state.selected, submitted: true, correct }
    }));
  };

  const handleRetry = (qIdx: number) => {
    const key = `${chapter.slug}-${qIdx}`;
    setQuestionStates((prev) => ({
      ...prev,
      [key]: { selected: null, submitted: false, correct: false }
    }));
  };

  const handleNext = async () => {
    if (!isLastChapter) {
      setChapterIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
            <HeroOrnament accent={chapter.accent} />
          </section>

          <article className="training-body">
            {chapter.blocks.map((block, i) => (
              <ContentBlockView key={i} block={block} />
            ))}
          </article>

          <section className="training-check">
            <header className="training-check-head">
              <p className="training-check-eyebrow">Knowledge check</p>
              <h2 className="training-check-title">
                Confirm {chapter.questions.length === 1 ? 'this' : 'these'} before moving on
              </h2>
            </header>

            <ol className="training-question-list">
              {chapter.questions.map((q, qIdx) => {
                const key = `${chapter.slug}-${qIdx}`;
                const state = questionStates[key];
                return (
                  <li key={qIdx} className="training-question">
                    <p className="training-question-prompt">
                      <span className="training-question-num">Q{qIdx + 1}.</span> {q.prompt}
                    </p>
                    <ul className="training-option-list">
                      {q.options.map((opt, optIdx) => {
                        const isSelected = state?.selected === optIdx;
                        const isSubmittedCorrect = state?.submitted && optIdx === q.correctIndex;
                        const isSubmittedWrong =
                          state?.submitted && isSelected && optIdx !== q.correctIndex;
                        return (
                          <li key={optIdx}>
                            <button
                              type="button"
                              className={`training-option ${isSelected ? 'is-selected' : ''} ${
                                isSubmittedCorrect ? 'is-correct' : ''
                              } ${isSubmittedWrong ? 'is-wrong' : ''}`}
                              onClick={() => handleSelect(qIdx, optIdx)}
                              disabled={state?.correct === true}
                            >
                              <span className="training-option-marker">{String.fromCharCode(65 + optIdx)}</span>
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
                        <strong>Not quite.</strong> {q.explanation}
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
                        disabled={state?.selected === undefined || state?.selected === null}
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
              disabled={!chapterQuestionsAnswered || submitting}
            >
              {submitting
                ? 'Saving...'
                : isLastChapter
                  ? 'Complete training →'
                  : `Continue to chapter ${chapter.number + 1} →`}
            </button>
          </footer>

          {submitError ? (
            <p className="helper" style={{ color: '#8c1515', textAlign: 'center', marginTop: 12 }}>
              {submitError}
            </p>
          ) : null}

          <p className="training-footer-meta">
            Signed in as <strong>{email}</strong>. Your completion is recorded against this email.
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
    default:
      return null;
  }
}

function HeroOrnament({ accent }: { accent: string }) {
  return (
    <svg
      className="training-hero-ornament"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`grad-${accent.replace('#', '')}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill={`url(#grad-${accent.replace('#', '')})`} />
      <circle cx="100" cy="100" r="56" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <circle cx="100" cy="100" r="32" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <path d="M100 20 L100 180 M20 100 L180 100" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
    </svg>
  );
}
