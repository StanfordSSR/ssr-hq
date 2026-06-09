'use client';

import { useOptimistic, useState, useTransition } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SignaturePad } from '@/components/signature-pad';
import {
  deleteExpenseItemAction,
  deleteFundingSourceAction,
  reorderBudgetItemsAction,
  resetTeamBudgetsAction,
  reviseBudgetPlanAction,
  signBudgetPlanAction,
  signQuarterDeclarationAction,
  submitBudgetPlanForApprovalAction,
  submitQuarterDeclarationForApprovalAction,
  upsertAllocationAction,
  upsertExpenseItemAction,
  upsertFundingSourceAction,
  upsertQuarterlyValueAction
} from '@/app/dashboard/actions';

type Source = {
  id: string;
  label: string;
  kind: string;
  category: string | null;
  notes: string | null;
  amountCents: number;
  isDefaultPool: boolean;
  sortOrder: number;
  committedCents: number;
  remainingCents: number;
};
type Expense = {
  id: string;
  kind: string;
  teamId: string | null;
  category: string | null;
  label: string;
  amountCents: number;
  lockCadence: string;
  sortOrder: number;
  effectiveCents: number;
  allocatedCents: number;
  remainderFromGrantCents: number;
  spentCents: number;
};
type Allocation = { id: string; sourceId: string; expenseId: string; amountCents: number };
type Team = { id: string; name: string };
type Approval = { presidentId: string; hasSignature: boolean; source: string };
type President = { id: string; fullName: string };

type Props = {
  planId: string;
  academicYear: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded';
  version: number;
  canEdit: boolean;
  currentUserIsPresident: boolean;
  currentUserId: string;
  sources: Source[];
  expenses: Expense[];
  allocations: Allocation[];
  teams: Team[];
  approvals: Approval[];
  presidents: President[];
  totalFundingCents: number;
  totalExpenseCents: number;
  uncoveredCents: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel',
  other: 'Other'
};
const SOURCE_KIND_LABELS: Record<string, string> = {
  annual_grant: 'Annual grant',
  reserve_grant: 'Reserve grant',
  grant: 'Grant',
  sponsorship: 'Sponsorship',
  other: 'Other'
};
const CATEGORY_OPTIONS: Array<[string, string]> = [
  ['', '—'],
  ['equipment', 'Equipment'],
  ['food', 'Food'],
  ['travel', 'Travel'],
  ['other', 'Other']
];

function usd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

// Autosave: submit the input/select's associated form when the user leaves it.
function autoSave(event: { currentTarget: { form: HTMLFormElement | null } }) {
  event.currentTarget.form?.requestSubmit();
}

const CATEGORY_RANK: Record<string, number> = { equipment: 0, food: 1, travel: 2, other: 3 };
const SHEET_HEAD_LABELS = ['Type', 'Line item', 'Team / kind', 'Category', 'Lock', 'Amount', 'Funded by', ''];
const DEFAULT_COLS = [78, 240, 150, 116, 104, 116, 200, 56];

function sourceSortKey(s: Source): string {
  const group = s.kind === 'annual_grant' ? '0' : '1';
  // Annual grants on top, ordered by category (uncategorized first).
  const catRank = s.kind === 'annual_grant' ? (s.category ? CATEGORY_RANK[s.category] + 1 : 0) : 0;
  return `${group}|${String(catRank).padStart(2, '0')}|${String(s.sortOrder).padStart(6, '0')}|${s.id}`;
}

type ExpenseBlock = { id: string; teamId: string | null; rows: Expense[]; order: number };
type DragHandle = Record<string, unknown>;

function SortableBlock({
  id,
  disabled,
  isTeam,
  children
}: {
  id: string;
  disabled: boolean;
  isTeam: boolean;
  children: (handle: DragHandle) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    position: 'relative',
    zIndex: isDragging ? 5 : undefined
  };
  const handle: DragHandle = disabled ? {} : { ...attributes, ...listeners };
  return (
    <div ref={setNodeRef} style={style} className={`hq-sheet-block${isTeam ? ' hq-sheet-block-team' : ''}${isDragging ? ' hq-sheet-block-dragging' : ''}`}>
      {children(handle)}
    </div>
  );
}

export function BudgetPlanEditor(props: Props) {
  const {
    planId,
    academicYear,
    status,
    version,
    canEdit,
    currentUserIsPresident,
    currentUserId,
    sources,
    expenses,
    allocations,
    teams,
    approvals,
    presidents,
    totalFundingCents,
    totalExpenseCents,
    uncoveredCents
  } = props;

  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const hide = (id: string) => setRemoved((prev) => new Set(prev).add(id));
  const [cols, setCols] = useState<number[]>(DEFAULT_COLS);
  const startResize = (event: React.PointerEvent<HTMLSpanElement>, index: number) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = cols[index];
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(48, startW + (ev.clientX - startX));
      setCols((prev) => {
        const nextCols = [...prev];
        nextCols[index] = w;
        return nextCols;
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const [order, setOrder] = useState<Map<string, number>>(new Map());
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [optimisticSources, addOptimisticSource] = useOptimistic(sources, (state, item: Source) => [...state, item]);
  const [optimisticExpenses, addOptimisticExpense] = useOptimistic(expenses, (state, item: Expense) => [...state, item]);

  const draftEditable = canEdit && (status === 'draft' || status === 'pending_approval');
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name || '';
  const sourceLabelById = (id: string) => sources.find((s) => s.id === id)?.label || 'Source';
  const allocByExpense = (expenseId: string) => allocations.filter((a) => a.expenseId === expenseId);

  const sortedSources = [...optimisticSources]
    .filter((s) => !removed.has(s.id))
    .sort((a, b) => sourceSortKey(a).localeCompare(sourceSortKey(b)));

  // One block per team (all its category rows move together), plus one per event/operations item.
  const blockMap = new Map<string, Expense[]>();
  for (const e of optimisticExpenses) {
    if (removed.has(e.id)) continue;
    const key = e.teamId ? `team:${e.teamId}` : `exp:${e.id}`;
    if (!blockMap.has(key)) blockMap.set(key, []);
    blockMap.get(key)!.push(e);
  }
  const blocks: ExpenseBlock[] = [];
  for (const [key, rows] of blockMap) {
    rows.sort(
      (a, b) =>
        (CATEGORY_RANK[a.category || 'other'] ?? 9) - (CATEGORY_RANK[b.category || 'other'] ?? 9) ||
        a.sortOrder - b.sortOrder ||
        (a.id < b.id ? -1 : 1)
    );
    const baseOrder = Math.min(...rows.map((r) => r.sortOrder ?? 9999));
    blocks.push({ id: key, teamId: rows[0].teamId, rows, order: order.has(key) ? order.get(key)! : baseOrder });
  }
  blocks.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  const blockIds = blocks.map((b) => b.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blockIds.indexOf(String(active.id));
    const newIndex = blockIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(blockIds, oldIndex, newIndex);
    const nextOrder = new Map<string, number>();
    nextIds.forEach((k, i) => nextOrder.set(k, i));
    setOrder(nextOrder);
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const flatIds = nextIds
      .flatMap((k) => (blockById.get(k)?.rows || []).map((r) => r.id))
      .filter((id) => !id.startsWith('temp-'));
    startTransition(async () => {
      await reorderBudgetItemsAction(planId, 'budget_expense_items', flatIds);
    });
  };

  async function handleAdd(formData: FormData) {
    const rowKind = String(formData.get('__row_kind') || 'team');
    let label = String(formData.get('label') || '').trim();
    if (rowKind === 'team') {
      const tId = String(formData.get('team_id') || '');
      const cat = String(formData.get('category') || 'other');
      label = `${teams.find((t) => t.id === tId)?.name || 'Team'} — ${CATEGORY_LABELS[cat] || 'Other'}`;
    } else if (!label) {
      return;
    }
    const amountCents = Math.max(0, Math.round((Number(formData.get('amount')) || 0) * 100));
    const tempId = `temp-${tempIdSeed()}`;
    if (rowKind === 'source') {
      addOptimisticSource({
        id: tempId,
        label,
        kind: String(formData.get('kind') || 'sponsorship'),
        category: String(formData.get('category') || '') || null,
        notes: String(formData.get('notes') || '') || null,
        amountCents,
        isDefaultPool: false,
        sortOrder: 9999,
        committedCents: 0,
        remainingCents: amountCents
      });
      await upsertFundingSourceAction(formData);
    } else {
      addOptimisticExpense({
        id: tempId,
        kind: rowKind,
        teamId: String(formData.get('team_id') || '') || null,
        category: String(formData.get('category') || '') || null,
        label,
        amountCents,
        lockCadence: String(formData.get('lock_cadence') || 'yearly'),
        sortOrder: 9999,
        effectiveCents: amountCents,
        allocatedCents: 0,
        remainderFromGrantCents: amountCents,
        spentCents: 0
      });
      await upsertExpenseItemAction(formData);
    }
  }

  const confirmDelete = (id: string) => (event: { preventDefault: () => void }) => {
    if (!window.confirm('Delete this line item? This cannot be undone.')) {
      event.preventDefault();
      return;
    }
    hide(id);
  };

  const renderExpenseRow = (e: Expense, handle: DragHandle) => {
    const rowId = `exp-${e.id}`;
    const temp = e.id.startsWith('temp-');
    const isTeam = e.kind === 'team';
    const rowEditable = (draftEditable || (canEdit && status === 'approved' && e.lockCadence === 'unlocked')) && !temp;
    const typeLabel = isTeam ? 'Team' : e.kind === 'operations' ? 'Ops' : e.kind === 'general' ? 'General' : 'Event';
    const dragProps = draftEditable && !temp ? handle : {};
    return (
      <div className={`hq-sheet-row${temp ? ' hq-sheet-row-pending' : ''}`} role="row" key={e.id}>
        <form id={rowId} action={upsertExpenseItemAction} hidden />
        <input form={rowId} type="hidden" name="plan_id" value={planId} />
        <input form={rowId} type="hidden" name="expense_id" value={e.id} />
        <input form={rowId} type="hidden" name="kind" value={e.kind} />
        <span
          className={`hq-sheet-type hq-sheet-type-${isTeam ? 'team' : 'event'}${draftEditable && !temp ? ' hq-sheet-grip' : ''}`}
          title={draftEditable && !temp ? 'Drag to reorder' : undefined}
          {...dragProps}
        >
          {draftEditable && !temp ? <span className="hq-sheet-grip-dots" aria-hidden="true">⠿</span> : null}
          {typeLabel}
        </span>
        {rowEditable && !isTeam ? (
          <input form={rowId} className="hq-sheet-input" name="label" defaultValue={e.label} aria-label="Name" onBlur={autoSave} />
        ) : (
          <span className="hq-sheet-cell">{e.label}</span>
        )}
        {isTeam ? (
          rowEditable ? (
            <select form={rowId} className="hq-sheet-input" name="team_id" defaultValue={e.teamId || ''} aria-label="Team" onChange={autoSave}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="hq-sheet-cell">{teamName(e.teamId)}</span>
          )
        ) : (
          <>
            <input form={rowId} type="hidden" name="team_id" value="" />
            <span className="hq-sheet-dim">—</span>
          </>
        )}
        {isTeam ? (
          rowEditable ? (
            <select form={rowId} className="hq-sheet-input" name="category" defaultValue={e.category || 'other'} aria-label="Category" onChange={autoSave}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <span className="hq-sheet-cell">{CATEGORY_LABELS[e.category || 'other']}</span>
          )
        ) : (
          <span className="hq-sheet-dim">—</span>
        )}
        {rowEditable ? (
          <select form={rowId} className="hq-sheet-input" name="lock_cadence" defaultValue={e.lockCadence} aria-label="Lock" onChange={autoSave}>
            <option value="yearly">Yearly</option>
            <option value="quarterly">Quarterly</option>
            <option value="unlocked">Unlocked</option>
          </select>
        ) : (
          <span className={`hq-budget-tag hq-budget-tag-${e.lockCadence}`}>{e.lockCadence}</span>
        )}
        {rowEditable ? (
          <span className="hq-sheet-amount">
            <span>$</span>
            <input form={rowId} name="amount" type="number" min="0" step="0.01" defaultValue={dollars(e.amountCents)} aria-label="Amount" onBlur={autoSave} />
          </span>
        ) : (
          <span className="hq-sheet-cell hq-sheet-num">{usd(e.effectiveCents)}</span>
        )}
        {temp ? (
          <span className="hq-sheet-dim">—</span>
        ) : (
          <FundedByCell
            planId={planId}
            expenseId={e.id}
            allocations={allocByExpense(e.id)}
            sources={sources}
            remainderCents={e.remainderFromGrantCents}
            editable={draftEditable}
            sourceLabelById={sourceLabelById}
          />
        )}
        <span className="hq-sheet-actions">
          {draftEditable && !temp ? (
            <button form={rowId} formAction={deleteExpenseItemAction} className="hq-sheet-del" title="Remove" aria-label="Remove" onClick={confirmDelete(e.id)}>
              ✕
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  return (
    <div className="form-stack hq-budget-plan">
      <div className="hq-sheet-summary">
        <span>
          <strong>{usd(totalFundingCents)}</strong> funding
        </span>
        <span>
          <strong>{usd(totalExpenseCents)}</strong> planned
        </span>
        <span className={uncoveredCents > 0 ? 'hq-sheet-warn' : ''}>
          <strong>{usd(uncoveredCents)}</strong> unfunded
        </span>
        {draftEditable ? (
          <form
            action={resetTeamBudgetsAction}
            className="hq-sheet-summary-action"
            onSubmit={(event) => {
              if (
                !window.confirm(
                  'Reset team budgets? This removes every team’s category rows and recreates a clean Equipment / Food / Travel set for each team. Entered team amounts will be lost.'
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="plan_id" value={planId} />
            <button className="button-secondary" type="submit">
              Reset team rows
            </button>
          </form>
        ) : null}
      </div>

      <div className="hq-sheet-wrap">
        <div className="hq-sheet" role="table" style={{ ['--sheet-cols' as string]: cols.map((c) => `${c}px`).join(' ') } as React.CSSProperties}>
          <div className="hq-sheet-head" role="row">
            {SHEET_HEAD_LABELS.map((label, i) => (
              <span key={i} className="hq-sheet-head-cell">
                {label}
                {i < SHEET_HEAD_LABELS.length - 1 ? (
                  <span
                    className="hq-sheet-resize"
                    onPointerDown={(event) => startResize(event, i)}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
            ))}
          </div>

          {sortedSources.map((s) => {
            const rowId = `src-${s.id}`;
            const temp = s.id.startsWith('temp-');
            return (
              <div className={`hq-sheet-row${temp ? ' hq-sheet-row-pending' : ''}`} role="row" key={s.id}>
                <form id={rowId} action={upsertFundingSourceAction} hidden />
                <input form={rowId} type="hidden" name="plan_id" value={planId} />
                <input form={rowId} type="hidden" name="source_id" value={s.id} />
                <input form={rowId} type="hidden" name="is_default_pool" value={s.isDefaultPool ? 'on' : ''} />
                <span className="hq-sheet-type hq-sheet-type-source">Source</span>
                {draftEditable && !temp ? (
                  <input form={rowId} className="hq-sheet-input" name="label" defaultValue={s.label} aria-label="Name" onBlur={autoSave} />
                ) : (
                  <span className="hq-sheet-cell">{s.label}</span>
                )}
                {draftEditable && !temp ? (
                  <select form={rowId} className="hq-sheet-input" name="kind" defaultValue={s.kind} aria-label="Kind" onChange={autoSave}>
                    {Object.entries(SOURCE_KIND_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="hq-sheet-cell">{SOURCE_KIND_LABELS[s.kind] || s.kind}</span>
                )}
                {draftEditable && !temp ? (
                  <select form={rowId} className="hq-sheet-input" name="category" defaultValue={s.category || ''} aria-label="Category" onChange={autoSave}>
                    {CATEGORY_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="hq-sheet-cell">{s.category ? CATEGORY_LABELS[s.category] : '—'}</span>
                )}
                <span className="hq-sheet-dim">{s.isDefaultPool ? 'default' : '—'}</span>
                {draftEditable && !temp ? (
                  <span className="hq-sheet-amount">
                    <span>$</span>
                    <input form={rowId} name="amount" type="number" min="0" step="0.01" defaultValue={dollars(s.amountCents)} aria-label="Amount" onBlur={autoSave} />
                  </span>
                ) : (
                  <span className="hq-sheet-cell hq-sheet-num">{usd(s.amountCents)}</span>
                )}
                {draftEditable && !temp ? (
                  <input form={rowId} className="hq-sheet-input" name="notes" defaultValue={s.notes || ''} placeholder="From (e.g. ASSU)" aria-label="Funded by" onBlur={autoSave} />
                ) : (
                  <span className="hq-sheet-dim">{s.notes || '—'}</span>
                )}
                <span className="hq-sheet-actions">
                  {draftEditable && !temp && !s.isDefaultPool ? (
                    <button form={rowId} formAction={deleteFundingSourceAction} className="hq-sheet-del" title="Remove" aria-label="Remove" onClick={confirmDelete(s.id)}>
                      ✕
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
              {blocks.map((block) => (
                <SortableBlock key={block.id} id={block.id} disabled={!draftEditable} isTeam={Boolean(block.teamId)}>
                  {(handle) => block.rows.map((e) => renderExpenseRow(e, handle))}
                </SortableBlock>
              ))}
            </SortableContext>
          </DndContext>

          {draftEditable ? <AddRow planId={planId} teams={teams} onAdd={handleAdd} /> : null}
        </div>
      </div>

      <BudgetApprovalPanel
        targetType="plan"
        targetId={planId}
        academicYear={academicYear}
        status={status}
        version={version}
        canEdit={canEdit}
        currentUserIsPresident={currentUserIsPresident}
        currentUserId={currentUserId}
        approvals={approvals}
        presidents={presidents}
        uncoveredCents={uncoveredCents}
      />
    </div>
  );
}

let tempCounter = 0;
function tempIdSeed() {
  tempCounter += 1;
  return `${tempCounter}`;
}

function AddRow({ planId, teams, onAdd }: { planId: string; teams: Team[]; onAdd: (formData: FormData) => void | Promise<void> }) {
  const [type, setType] = useState<'team' | 'event' | 'operations' | 'source'>('team');
  const isSource = type === 'source';
  const isTeam = type === 'team';

  return (
    <form className="hq-sheet-row hq-sheet-add" action={onAdd}>
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="__row_kind" value={type} />
      {!isSource ? <input type="hidden" name="kind" value={type} /> : null}
      <select
        className="hq-sheet-input"
        value={type}
        onChange={(event) => setType(event.target.value as typeof type)}
        aria-label="Type"
      >
        <option value="team">Team</option>
        <option value="event">Event</option>
        <option value="operations">Ops</option>
        <option value="source">Source</option>
      </select>
      {isTeam ? (
        <span className="hq-sheet-dim">Auto-named from team + category</span>
      ) : (
        <input className="hq-sheet-input" name="label" placeholder="New line item…" required />
      )}
      {isSource ? (
        <select className="hq-sheet-input" name="kind" defaultValue="sponsorship" aria-label="Kind">
          {Object.entries(SOURCE_KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : isTeam ? (
        <select className="hq-sheet-input" name="team_id" defaultValue={teams[0]?.id || ''} aria-label="Team">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="hq-sheet-dim">—</span>
      )}
      {isSource ? (
        <select className="hq-sheet-input" name="category" defaultValue="" aria-label="Category">
          {CATEGORY_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : isTeam ? (
        <select className="hq-sheet-input" name="category" defaultValue="equipment" aria-label="Category">
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : (
        <span className="hq-sheet-dim">—</span>
      )}
      {isSource ? (
        <span className="hq-sheet-dim">—</span>
      ) : (
        <select className="hq-sheet-input" name="lock_cadence" defaultValue={isTeam ? 'yearly' : 'unlocked'} aria-label="Lock">
          <option value="yearly">Yearly</option>
          <option value="quarterly">Quarterly</option>
          <option value="unlocked">Unlocked</option>
        </select>
      )}
      <span className="hq-sheet-amount">
        <span>$</span>
        <input name="amount" type="number" min="0" step="0.01" placeholder="0" aria-label="Amount" />
      </span>
      {isSource ? (
        <input className="hq-sheet-input" name="notes" placeholder="From (e.g. ASSU)" aria-label="Funded by" />
      ) : (
        <span className="hq-sheet-dim">—</span>
      )}
      <span className="hq-sheet-actions">
        <button className="hq-sheet-add-btn" type="submit" title="Add line item" aria-label="Add line item">
          +
        </button>
      </span>
    </form>
  );
}

function FundedByCell({
  planId,
  expenseId,
  allocations,
  sources,
  remainderCents,
  editable,
  sourceLabelById
}: {
  planId: string;
  expenseId: string;
  allocations: Allocation[];
  sources: Source[];
  remainderCents: number;
  editable: boolean;
  sourceLabelById: (id: string) => string;
}) {
  const summary =
    allocations.length === 0
      ? remainderCents > 0
        ? `Grant ${usd(remainderCents)}`
        : '—'
      : `${allocations.length} source${allocations.length > 1 ? 's' : ''}${remainderCents > 0 ? ' + grant' : ''}`;

  if (!editable && allocations.length === 0) {
    return <span className="hq-sheet-dim">{summary}</span>;
  }

  return (
    <details className="hq-sheet-funded">
      <summary>{summary}</summary>
      <div className="hq-sheet-funded-body">
        {allocations.map((a) => (
          <span key={a.sourceId} className="hq-sheet-chip">
            {sourceLabelById(a.sourceId)} {usd(a.amountCents)}
            {editable ? (
              <form action={upsertAllocationAction}>
                <input type="hidden" name="plan_id" value={planId} />
                <input type="hidden" name="source_id" value={a.sourceId} />
                <input type="hidden" name="expense_id" value={expenseId} />
                <input type="hidden" name="amount" value="0" />
                <button className="hq-sheet-chip-x" type="submit" title="Remove" aria-label="Remove allocation">
                  ✕
                </button>
              </form>
            ) : null}
          </span>
        ))}
        {remainderCents > 0 ? <span className="hq-sheet-dim">Grant covers {usd(remainderCents)}</span> : null}
        {editable ? (
          <form action={upsertAllocationAction} className="hq-sheet-funded-add">
            <input type="hidden" name="plan_id" value={planId} />
            <input type="hidden" name="expense_id" value={expenseId} />
            <select className="hq-sheet-input" name="source_id" required defaultValue="">
              <option value="" disabled>
                Source…
              </option>
              {sources
                .filter((s) => !s.isDefaultPool)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
            <input className="hq-sheet-input" name="amount" type="number" min="0" step="0.01" placeholder="$" required />
            <button className="hq-sheet-save" type="submit" title="Allocate" aria-label="Allocate">
              +
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export function BudgetApprovalPanel({
  targetType,
  targetId,
  status,
  version,
  canEdit,
  currentUserIsPresident,
  currentUserId,
  approvals,
  presidents,
  uncoveredCents,
  academicYear
}: {
  targetType: 'plan' | 'quarter';
  targetId: string;
  academicYear: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded';
  version: number;
  canEdit: boolean;
  currentUserIsPresident: boolean;
  currentUserId: string;
  approvals: Approval[];
  presidents: President[];
  uncoveredCents: number;
}) {
  const [signature, setSignature] = useState('');
  const mySigned = approvals.some((a) => a.presidentId === currentUserId && a.hasSignature);

  return (
    <section className="hq-question-card eoy-ack-card">
      <div className="hq-block-head">
        <h3>President approval</h3>
        <span className={`hq-status-chip hq-status-${status === 'approved' ? 'open' : 'pending'}`}>
          {status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Awaiting signatures' : 'Draft'}
          {version > 1 ? ` · v${version}` : ''}
        </span>
      </div>

      <div className="hq-summary-list">
        {presidents.map((president) => {
          const signed = approvals.some((a) => a.presidentId === president.id && a.hasSignature);
          const intent = approvals.some((a) => a.presidentId === president.id);
          return (
            <div key={president.id} className="hq-summary-row">
              <span>{president.fullName}</span>
              <strong>{signed ? 'Signed in portal' : intent ? 'Approved in Slack (signature pending)' : 'Not signed'}</strong>
            </div>
          );
        })}
        {presidents.length !== 2 ? (
          <p className="eoy-over-limit helper">Approval needs exactly two active presidents (currently {presidents.length}).</p>
        ) : null}
      </div>

      {canEdit && status === 'draft' ? (
        <form action={submitBudgetPlanForApprovalAction} className="button-row">
          <input type="hidden" name="plan_id" value={targetId} />
          <button className="button" type="submit" disabled={uncoveredCents > 0 || presidents.length !== 2}>
            Send to presidents for approval
          </button>
          {uncoveredCents > 0 ? <span className="helper eoy-submit-hint">Resolve unfunded expenses first.</span> : null}
        </form>
      ) : null}

      {canEdit && status === 'approved' && targetType === 'plan' ? (
        <form action={reviseBudgetPlanAction} className="button-row">
          <input type="hidden" name="plan_id" value={targetId} />
          <button className="button-secondary" type="submit">
            Start a revision
          </button>
        </form>
      ) : null}

      {currentUserIsPresident && status === 'pending_approval' ? (
        <div className="form-stack">
          <p className="hq-question-prompt">
            By signing below you approve the {academicYear} budget on behalf of the presidency.
          </p>
          <SignaturePad
            value={signature}
            onChange={setSignature}
            actionLabel="Sign to approve"
            title="Sign the budget approval"
            altText="President signature"
          />
          {mySigned ? <p className="helper">You have already signed.</p> : null}
          <form action={signBudgetPlanAction} className="button-row">
            <input type="hidden" name="plan_id" value={targetId} />
            <input type="hidden" name="signature" value={signature} />
            <button className="button" type="submit" disabled={!signature}>
              Submit signature
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function QuarterlyDeclarationPanel({
  declarationId,
  quarter,
  status,
  canEdit,
  currentUserIsPresident,
  currentUserId,
  items,
  approvals,
  presidents
}: {
  declarationId: string;
  quarter: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded';
  canEdit: boolean;
  currentUserIsPresident: boolean;
  currentUserId: string;
  items: Array<{ expenseItemId: string; label: string; amountCents: number }>;
  approvals: Approval[];
  presidents: President[];
}) {
  const [signature, setSignature] = useState('');
  const editable = canEdit && (status === 'draft' || status === 'pending_approval');

  return (
    <section className="hq-question-card">
      <div className="hq-block-head">
        <h3>{quarter} declaration</h3>
        <span className={`hq-status-chip hq-status-${status === 'approved' ? 'open' : 'pending'}`}>
          {status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Awaiting signatures' : 'Draft'}
        </span>
      </div>

      <div className="hq-budget-line-list">
        {items.map((item) => (
          <div key={item.expenseItemId} className="hq-budget-line">
            <div className="hq-budget-line-main">
              <strong>{item.label}</strong>
            </div>
            {editable ? (
              <form action={upsertQuarterlyValueAction} className="hq-budget-inline-form">
                <input type="hidden" name="declaration_id" value={declarationId} />
                <input type="hidden" name="expense_item_id" value={item.expenseItemId} />
                <input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={(item.amountCents / 100).toFixed(2)} />
                <button className="button-secondary" type="submit">
                  Save
                </button>
              </form>
            ) : (
              <strong className="hq-budget-line-amount">{usd(item.amountCents)}</strong>
            )}
          </div>
        ))}
        {items.length === 0 ? <p className="empty-note">No quarterly-locked sub-budgets in this plan.</p> : null}
      </div>

      <div className="hq-summary-list">
        {presidents.map((president) => {
          const signed = approvals.some((a) => a.presidentId === president.id && a.hasSignature);
          return (
            <div key={president.id} className="hq-summary-row">
              <span>{president.fullName}</span>
              <strong>{signed ? 'Signed' : 'Not signed'}</strong>
            </div>
          );
        })}
      </div>

      {canEdit && status === 'draft' ? (
        <form action={submitQuarterDeclarationForApprovalAction} className="button-row">
          <input type="hidden" name="declaration_id" value={declarationId} />
          <button className="button" type="submit" disabled={presidents.length !== 2}>
            Send to presidents for approval
          </button>
        </form>
      ) : null}

      {currentUserIsPresident && status === 'pending_approval' ? (
        <div className="form-stack">
          <SignaturePad
            value={signature}
            onChange={setSignature}
            actionLabel="Sign to approve"
            title={`Sign the ${quarter} budget`}
            altText="President signature"
          />
          <form action={signQuarterDeclarationAction} className="button-row">
            <input type="hidden" name="declaration_id" value={declarationId} />
            <input type="hidden" name="signature" value={signature} />
            <button className="button" type="submit" disabled={!signature}>
              Submit signature
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
