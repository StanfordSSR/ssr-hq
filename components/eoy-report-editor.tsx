'use client';

import { useMemo, useRef, useState } from 'react';
import { saveEoyReportDraftAction, submitEoyReportAction } from '@/app/dashboard/actions';
import {
  EOY_CLASS_YEARS,
  EOY_JUSTIFICATION_CATEGORIES,
  countEoyWords,
  formatEoyCurrency,
  summerPlanWordLimit,
  type EoyMemberRef,
  type EoyQuestionConfig,
  type EoyReportData
} from '@/lib/eoy-report-shared';

type EoyReportEditorProps = {
  teamId: string;
  academicYear: string;
  nextAcademicYear: string;
  teamName: string;
  members: EoyMemberRef[];
  questions: EoyQuestionConfig;
  autofill: EoyReportData['autofill'];
  yearSummaryLimit: number;
  initialData: EoyReportData;
  readOnly?: boolean;
};

function memberKey(ref: { id: string; source: string }) {
  return `${ref.source}:${ref.id}`;
}

function MemberPicker({
  members,
  selected,
  max,
  disabled,
  onChange
}: {
  members: EoyMemberRef[];
  selected: EoyMemberRef[];
  max: number;
  disabled?: boolean;
  onChange: (next: EoyMemberRef[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedKeys = new Set(selected.map(memberKey));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members
      .filter((member) => !selectedKeys.has(memberKey(member)))
      .filter((member) => (needle ? member.name.toLowerCase().includes(needle) : true))
      .slice(0, 8);
  }, [members, query, selectedKeys]);

  const atMax = selected.length >= max;

  return (
    <div className="eoy-picker">
      <div className="eoy-chip-row">
        {selected.length === 0 ? <span className="helper">No one selected yet.</span> : null}
        {selected.map((member) => (
          <span key={memberKey(member)} className="eoy-chip">
            {member.name}
            {!disabled ? (
              <button
                type="button"
                className="eoy-chip-remove"
                aria-label={`Remove ${member.name}`}
                onClick={() => onChange(selected.filter((entry) => memberKey(entry) !== memberKey(member)))}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>

      {!disabled ? (
        <div className="eoy-picker-control">
          <input
            className="input"
            type="text"
            placeholder={atMax ? `You have selected ${max}` : 'Search members…'}
            value={query}
            disabled={atMax}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
          />
          {open && !atMax ? (
            <div className="eoy-picker-list">
              {filtered.length === 0 ? (
                <span className="helper eoy-picker-empty">No matching members.</span>
              ) : (
                filtered.map((member) => (
                  <button
                    key={memberKey(member)}
                    type="button"
                    className="eoy-picker-option"
                    onClick={() => {
                      onChange([...selected, member]);
                      setQuery('');
                    }}
                  >
                    <span>{member.name}</span>
                    <span className="eoy-picker-source">{member.source === 'profile' ? 'Lead' : 'Roster'}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function cumulative(shares: number[], upToIndex: number) {
  let total = 0;
  for (let index = 0; index <= upToIndex; index += 1) {
    total += shares[index] || 0;
  }
  return total;
}

function ClassDistributionSlider({
  data,
  totalMembers,
  disabled,
  onChange
}: {
  data: EoyReportData['classDistribution'];
  totalMembers: number;
  disabled?: boolean;
  onChange: (next: EoyReportData['classDistribution']) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);

  const shares = EOY_CLASS_YEARS.map((year) => data[year.key]);
  const total = shares.reduce((sum, value) => sum + value, 0) || 1;
  const pct = shares.map((value) => (value / total) * 100);

  const writeShares = (next: number[]) => {
    const mapped = { ...data };
    EOY_CLASS_YEARS.forEach((year, index) => {
      mapped[year.key] = Math.max(0, Math.round(next[index] || 0));
    });
    onChange(mapped);
  };

  const pointerToPct = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return 0;
    }
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(100, ratio * 100));
  };

  const onMove = (clientX: number) => {
    const handleIndex = draggingRef.current;
    if (handleIndex === null) {
      return;
    }
    const working = pct.map((value) => value);
    const lower = handleIndex > 0 ? cumulative(working, handleIndex - 1) : 0;
    const upper = cumulative(working, handleIndex + 1);
    const target = Math.max(lower, Math.min(upper, pointerToPct(clientX)));
    working[handleIndex] = target - lower;
    working[handleIndex + 1] = upper - target;
    // Convert percentages back into member-weighted shares.
    writeShares(working.map((value) => (value / 100) * total));
  };

  return (
    <div className="eoy-slider">
      <div
        ref={barRef}
        className="eoy-slider-bar"
        onPointerMove={(event) => {
          if (draggingRef.current !== null) {
            onMove(event.clientX);
          }
        }}
        onPointerUp={() => {
          draggingRef.current = null;
        }}
        onPointerLeave={() => {
          draggingRef.current = null;
        }}
      >
        {EOY_CLASS_YEARS.map((year, index) => (
          <div
            key={year.key}
            className="eoy-slider-region"
            style={{ width: `${pct[index]}%`, background: year.tone }}
          />
        ))}

        {!disabled
          ? EOY_CLASS_YEARS.slice(0, -1).map((year, index) => (
              <button
                key={`handle-${year.key}`}
                type="button"
                className="eoy-slider-handle"
                style={{ left: `${cumulative(pct, index)}%` }}
                aria-label={`Adjust boundary after ${year.label}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  draggingRef.current = index;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (draggingRef.current !== null) {
                    onMove(event.clientX);
                  }
                }}
                onPointerUp={(event) => {
                  draggingRef.current = null;
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }}
              />
            ))
          : null}
      </div>

      <div className="eoy-slider-legend">
        {EOY_CLASS_YEARS.map((year, index) => {
          const count = Math.round((pct[index] / 100) * totalMembers);
          return (
            <div key={year.key} className="eoy-slider-legend-item">
              <span className="eoy-slider-swatch" style={{ background: year.tone }} />
              <span className="eoy-slider-legend-label">{year.label}</span>
              <span className="eoy-slider-legend-count">
                ~{count} ({Math.round(pct[index])}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EoyReportEditor({
  teamId,
  academicYear,
  nextAcademicYear,
  teamName,
  members,
  questions,
  autofill,
  yearSummaryLimit,
  initialData,
  readOnly = false
}: EoyReportEditorProps) {
  const [data, setData] = useState<EoyReportData>(() => ({
    ...initialData,
    autofill,
    summer: {
      ...initialData.summer,
      acknowledgements: questions.acknowledgements.map(
        (_, index) => initialData.summer.acknowledgements[index] ?? false
      )
    }
  }));

  const update = (patch: Partial<EoyReportData>) => setData((current) => ({ ...current, ...patch }));
  const updateSummer = (patch: Partial<EoyReportData['summer']>) =>
    setData((current) => ({ ...current, summer: { ...current.summer, ...patch } }));

  const yearSummaryWords = countEoyWords(data.yearSummary);
  const summerPlanWords = countEoyWords(data.summer.plan);
  const summerPlanLimit = summerPlanWordLimit(data.summer.predictedSpendCents);

  const justificationFor = (category: string) =>
    data.summer.justifications.find((entry) => entry.category === category)?.justification || '';

  const setJustification = (category: string, value: string) => {
    const others = data.summer.justifications.filter((entry) => entry.category !== category);
    const next = value.trim() ? [...others, { category, justification: value }] : others;
    updateSummer({ justifications: next });
  };

  const payload: EoyReportData = { ...data, autofill };

  return (
    <form className="form-stack eoy-form">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="academic_year" value={academicYear} />
      <input type="hidden" name="report_data" value={JSON.stringify(payload)} />

      <section className="eoy-autofill-grid">
        <div className="eoy-autofill-card">
          <span className="eoy-autofill-label">Funds spent this year</span>
          <strong className="eoy-autofill-value">{formatEoyCurrency(autofill.fundsSpentThisYearCents)}</strong>
          <span className="helper">Autumn + Winter + Spring expense logs.</span>
        </div>
        <div className="eoy-autofill-card">
          <span className="eoy-autofill-label">Remaining funding for {academicYear}</span>
          <strong className="eoy-autofill-value">{formatEoyCurrency(autofill.remainingFundingCents)}</strong>
          <span className="eoy-autofill-warning">
            This amount may be less if there are spent funds not yet recorded.
          </span>
        </div>
        <div className="eoy-autofill-card">
          <span className="eoy-autofill-label">Total members</span>
          <strong className="eoy-autofill-value">{autofill.totalMembers}</strong>
          <span className="helper">Active portal leads + roster members.</span>
        </div>
      </section>

      <div className="hq-question-stack">
        <div className="eoy-section-head">
          <h2>Part 1 · Team continuity</h2>
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Question 1</h3>
          </div>
          <p className="hq-question-prompt">{questions.reregister}</p>
          <YesNoToggle
            value={data.reregister}
            disabled={readOnly}
            onChange={(value) => update({ reregister: value })}
          />
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Question 2</h3>
            <span className="hq-inline-note">Select 2</span>
          </div>
          <p className="hq-question-prompt">{questions.nextLeads}</p>
          <MemberPicker
            members={members}
            selected={data.nextLeads}
            max={2}
            disabled={readOnly}
            onChange={(next) => update({ nextLeads: next })}
          />
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Question 3</h3>
          </div>
          <p className="hq-question-prompt">{questions.leadSelection}</p>
          <textarea
            className="input hq-textarea"
            rows={3}
            readOnly={readOnly}
            value={data.leadSelection}
            onChange={(event) => update({ leadSelection: event.target.value })}
          />
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Question 4</h3>
            <span className="hq-inline-note">{yearSummaryLimit} words max</span>
          </div>
          <p className="hq-question-prompt">{questions.yearSummary}</p>
          <textarea
            className="input hq-textarea"
            rows={8}
            readOnly={readOnly}
            value={data.yearSummary}
            onChange={(event) => update({ yearSummary: event.target.value })}
          />
          <span className={`helper${yearSummaryWords > yearSummaryLimit ? ' eoy-over-limit' : ''}`}>
            {yearSummaryWords}/{yearSummaryLimit} words
          </span>
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Question 5</h3>
          </div>
          <p className="hq-question-prompt">{questions.classDistribution}</p>
          <ClassDistributionSlider
            data={data.classDistribution}
            totalMembers={autofill.totalMembers}
            disabled={readOnly}
            onChange={(next) => update({ classDistribution: next })}
          />
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Question 6</h3>
            <span className="hq-inline-note">Up to 3</span>
          </div>
          <p className="hq-question-prompt">{questions.niceToHave}</p>
          <div className="eoy-stack">
            {[0, 1, 2].map((index) => (
              <input
                key={index}
                className="input"
                type="text"
                readOnly={readOnly}
                placeholder={`Nice to have #${index + 1}`}
                value={data.niceToHave[index] || ''}
                onChange={(event) => {
                  const next = [...data.niceToHave];
                  while (next.length < 3) next.push('');
                  next[index] = event.target.value;
                  update({ niceToHave: next });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="hq-question-stack">
        <div className="eoy-section-head">
          <h2>Part 2 · Summer funding approval</h2>
        </div>

        <div className="hq-question-card">
          <div className="hq-block-head">
            <h3>Summer activity</h3>
          </div>
          <p className="hq-question-prompt">{questions.summerActive}</p>
          <YesNoToggle
            value={data.summer.active}
            disabled={readOnly}
            onChange={(value) => updateSummer({ active: value })}
          />
        </div>

        {data.summer.active === 'yes' ? (
          <>
            <div className="hq-question-card">
              <div className="hq-block-head">
                <h3>On-campus members</h3>
                <span className="hq-inline-note">Select 2</span>
              </div>
              <p className="hq-question-prompt">{questions.summerMembers}</p>
              <MemberPicker
                members={members}
                selected={data.summer.members}
                max={2}
                disabled={readOnly}
                onChange={(next) => updateSummer({ members: next })}
              />
            </div>

            <div className="hq-question-card">
              <div className="hq-block-head">
                <h3>Predicted summer spend</h3>
              </div>
              <p className="hq-question-prompt">{questions.summerSpend}</p>
              <div className="eoy-money-input">
                <span className="eoy-money-prefix">$</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  max={autofill.remainingFundingCents / 100}
                  readOnly={readOnly}
                  value={data.summer.predictedSpendCents ? (data.summer.predictedSpendCents / 100).toString() : ''}
                  onChange={(event) => {
                    const dollars = Math.max(0, Number(event.target.value) || 0);
                    const cents = Math.min(autofill.remainingFundingCents, Math.round(dollars * 100));
                    updateSummer({ predictedSpendCents: cents });
                  }}
                />
              </div>
              <span className="helper">
                Cannot exceed your remaining funding of {formatEoyCurrency(autofill.remainingFundingCents)}.
              </span>
            </div>

            <div className="hq-question-card">
              <div className="hq-block-head">
                <h3>Major expenses</h3>
                <span className="hq-inline-note">~{summerPlanLimit} words</span>
              </div>
              <p className="hq-question-prompt">{questions.summerPlan}</p>
              <textarea
                className="input hq-textarea"
                rows={6}
                readOnly={readOnly}
                value={data.summer.plan}
                onChange={(event) => updateSummer({ plan: event.target.value })}
              />
              <span className={`helper${summerPlanWords > summerPlanLimit ? ' eoy-over-limit' : ''}`}>
                {summerPlanWords}/{summerPlanLimit} recommended words
              </span>
            </div>

            <div className="hq-question-card">
              <div className="hq-block-head">
                <h3>Spending justifications</h3>
              </div>
              <p className="hq-question-prompt">{questions.summerJustifications}</p>
              <div className="eoy-stack">
                {EOY_JUSTIFICATION_CATEGORIES.map((category) => (
                  <div key={category} className="eoy-justification">
                    <label className="eoy-justification-label">{category}</label>
                    <textarea
                      className="input hq-textarea"
                      rows={2}
                      readOnly={readOnly}
                      placeholder={`Justify ${category.toLowerCase()} spending (leave blank if none).`}
                      value={justificationFor(category)}
                      onChange={(event) => setJustification(category, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="hq-question-card">
              <div className="hq-block-head">
                <h3>Acknowledgements</h3>
                <span className="hq-inline-note">All required</span>
              </div>
              <div className="eoy-ack-list">
                {questions.acknowledgements.map((acknowledgement, index) => (
                  <label key={index} className="eoy-ack-item">
                    <input
                      type="checkbox"
                      checked={data.summer.acknowledgements[index] || false}
                      disabled={readOnly}
                      onChange={(event) => {
                        const next = [...data.summer.acknowledgements];
                        while (next.length < questions.acknowledgements.length) next.push(false);
                        next[index] = event.target.checked;
                        updateSummer({ acknowledgements: next });
                      }}
                    />
                    <span>{acknowledgement}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : data.summer.active === 'no' ? (
          <div className="hq-question-card">
            <p className="helper">
              No summer spending will be approved for {teamName}. You can submit the report now.
            </p>
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <div className="button-row">
          <button className="button-secondary" formAction={saveEoyReportDraftAction}>
            Save draft
          </button>
          <button className="button" formAction={submitEoyReportAction}>
            Submit report
          </button>
        </div>
      ) : null}
    </form>
  );
}

function YesNoToggle({
  value,
  disabled,
  onChange
}: {
  value: 'yes' | 'no' | '';
  disabled?: boolean;
  onChange: (value: 'yes' | 'no') => void;
}) {
  return (
    <div className="eoy-yesno">
      {(['yes', 'no'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={`eoy-yesno-option${value === option ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option)}
        >
          {option === 'yes' ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}
