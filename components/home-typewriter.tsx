'use client';

import { useEffect, useState } from 'react';

const PHRASES = [
  'INTEGRATED INTELLIGENCE',
  'AUTOMATED FINANCIAL SERVICES',
  'INTEGRATED SLACK WORKFLOW',
  'LIVE OPERATIONAL OVERSIGHT'
];

const TYPING_DELAY_MS = 42;
const BACKSPACE_DELAY_MS = 22;
const HOLD_DELAY_MS = 950;

export function HomeTypewriter() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visibleText, setVisibleText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = PHRASES[phraseIndex] || '';

    const timeout = window.setTimeout(() => {
      if (!isDeleting) {
        const nextText = currentPhrase.slice(0, visibleText.length + 1);
        setVisibleText(nextText);

        if (nextText === currentPhrase) {
          setIsDeleting(true);
        }

        return;
      }

      const nextText = currentPhrase.slice(0, Math.max(0, visibleText.length - 1));
      setVisibleText(nextText);

      if (!nextText) {
        setIsDeleting(false);
        setPhraseIndex((current) => (current + 1) % PHRASES.length);
      }
    }, visibleText === currentPhrase && !isDeleting ? HOLD_DELAY_MS : isDeleting ? BACKSPACE_DELAY_MS : TYPING_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [isDeleting, phraseIndex, visibleText]);

  return (
    <p className="home-typewriter" aria-label={PHRASES[phraseIndex]}>
      <span>{visibleText}</span>
      <span className="home-typewriter-caret" aria-hidden="true" />
    </p>
  );
}
