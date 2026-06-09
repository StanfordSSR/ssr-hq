'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
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
  parentId: string | null;
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
const AG_ABBR: Record<string, string> = { equipment: 'equi', food: 'food', travel: 'trav', other: 'other' };
const SHEET_HEAD_LABELS = ['Type', 'Line item', 'Team / kind', 'Category', 'Lock', 'Amount', 'Funded by / notes', ''];
const DEFAULT_COLS = [78, 230, 146, 110, 100, 116, 250, 56];

function sourceSortKey(s: Source): string {
  const group = s.kind === 'annual_grant' ? '0' : '1';
  // Annual grants on top, ordered by category (uncategorized first).
  const catRank = s.kind === 'annual_grant' ? (s.category ? CATEGORY_RANK[s.category] + 1 : 0) : 0;
  return `${group}|${String(catRank).padStart(2, '0')}|${String(s.sortOrder).padStart(6, '0')}|${s.id}`;
}

type ExpenseBlock = { id: string; teamId: string | null; rows: Expense[]; children: Expense[]; order: number };
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
  // Load saved column widths after mount (avoids hydration mismatch).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('ssr-budget-cols');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_COLS.length && parsed.every((n) => typeof n === 'number')) {
          setCols(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem('ssr-budget-cols', JSON.stringify(cols));
    } catch {
      /* ignore */
    }
  }, [cols]);
  const startResize = (event: React.PointerEvent<HTMLSpanElement>, index: number) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = cols[index];
    const nextW = cols[index + 1] ?? 0;
    const pairTotal = startW + nextW;
    const onMove = (ev: PointerEvent) => {
      // Resizing borrows width from the neighbouring column so the table's
      // total width stays constant and never overflows.
      const w = Math.max(48, Math.min(pairTotal - 48, startW + (ev.clientX - startX)));
      setCols((prev) => {
        const nextCols = [...prev];
        nextCols[index] = w;
        nextCols[index + 1] = pairTotal - w;
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [optimisticSources, addOptimisticSource] = useOptimistic(sources, (state, item: Source) => [...state, item]);
  const [optimisticExpenses, addOptimisticExpense] = useOptimistic(expenses, (state, item: Expense) => [...state, item]);
  const [optimisticAllocations, applyAllocation] = useOptimistic(
    allocations,
    (state, action: { kind: 'set' | 'remove'; sourceId: string; expenseId: string; amountCents: number }) => {
      const without = state.filter((a) => !(a.sourceId === action.sourceId && a.expenseId === action.expenseId));
      if (action.kind === 'remove') return without;
      return [
        ...without,
        { id: `temp-${action.sourceId}-${action.expenseId}`, sourceId: action.sourceId, expenseId: action.expenseId, amountCents: action.amountCents }
      ];
    }
  );

  const draftEditable = canEdit && (status === 'draft' || status === 'pending_approval');
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name || '';
  const sourceLabelById = (id: string) => sources.find((s) => s.id === id)?.label || 'Source';
  const allocByExpense = (expenseId: string) => optimisticAllocations.filter((a) => a.expenseId === expenseId);

  const commitAllocation = async (sourceId: string, expenseId: string, amountCents: number) => {
    applyAllocation({ kind: amountCents > 0 ? 'set' : 'remove', sourceId, expenseId, amountCents });
    const fd = new FormData();
    fd.set('plan_id', planId);
    fd.set('source_id', sourceId);
    fd.set('expense_id', expenseId);
    fd.set('amount', String(amountCents / 100));
    await upsertAllocationAction(fd);
  };

  const sortedSources = [...optimisticSources]
    .filter((s) => !removed.has(s.id))
    .sort((a, b) => sourceSortKey(a).localeCompare(sourceSortKey(b)));

  // Event/ops sub-items belong to their parent group, not the top level.
  const childrenByParent = new Map<string, Expense[]>();
  for (const e of optimisticExpenses) {
    if (removed.has(e.id) || !e.parentId) continue;
    if (!childrenByParent.has(e.parentId)) childrenByParent.set(e.parentId, []);
    childrenByParent.get(e.parentId)!.push(e);
  }
  for (const kids of childrenByParent.values()) {
    kids.sort(
      (a, b) =>
        (CATEGORY_RANK[a.category || 'other'] ?? 9) - (CATEGORY_RANK[b.category || 'other'] ?? 9) || (a.id < b.id ? -1 : 1)
    );
  }

  // One block per team (all its category rows move together), plus one per event/operations item.
  const blockMap = new Map<string, Expense[]>();
  for (const e of optimisticExpenses) {
    if (removed.has(e.id) || e.parentId) continue;
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
    blocks.push({
      id: key,
      teamId: rows[0].teamId,
      rows,
      children: rows[0].teamId ? [] : childrenByParent.get(rows[0].id) || [],
      order: order.has(key) ? order.get(key)! : baseOrder
    });
  }
  blocks.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  const blockIds = blocks.map((b) => b.id);
  const usedTeamCategories = new Set(
    optimisticExpenses.filter((e) => e.kind === 'team' && e.teamId && e.category).map((e) => `${e.teamId}:${e.category}`)
  );
  // An annual grant category is "over" when its remaining balance is negative.
  const grantOverByCategory = new Map<string, boolean>();
  for (const s of optimisticSources) {
    if (s.kind === 'annual_grant') grantOverByCategory.set(s.category || 'other', s.remainingCents < 0);
  }

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
        parentId: null,
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
          <span className="hq-sheet-cell">
            {isTeam ? `${teamName(e.teamId)} — ${CATEGORY_LABELS[e.category || 'other']}` : e.label}
          </span>
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
            expenseAmountCents={e.effectiveCents}
            expenseCategory={e.category}
            agLabel={`AG-${AG_ABBR[e.category || 'other']}`}
            grantOver={grantOverByCategory.get(e.category || 'other') || false}
            allocations={allocByExpense(e.id)}
            sources={sources}
            editable={draftEditable}
            sourceLabelById={sourceLabelById}
            onAllocate={(sourceId, amountCents) => commitAllocation(sourceId, e.id, amountCents)}
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

  async function handleAddSub(formData: FormData) {
    const parentId = String(formData.get('parent_id') || '');
    const kind = String(formData.get('kind') || 'event');
    const category = String(formData.get('category') || '');
    if (!parentId || !category) return;
    const amountCents = Math.max(0, Math.round((Number(formData.get('amount')) || 0) * 100));
    const tempId = `temp-${tempIdSeed()}`;
    addOptimisticExpense({
      id: tempId,
      kind,
      teamId: null,
      parentId,
      category,
      label: CATEGORY_LABELS[category] || 'Other',
      amountCents,
      lockCadence: 'yearly',
      sortOrder: 9999,
      effectiveCents: amountCents,
      allocatedCents: 0,
      remainderFromGrantCents: amountCents,
      spentCents: 0
    });
    setOpenGroups((prev) => new Set(prev).add(parentId));
    await upsertExpenseItemAction(formData);
  }

  const renderSubRow = (parent: Expense, c: Expense) => {
    const rowId = `exp-${c.id}`;
    const temp = c.id.startsWith('temp-');
    const rowEditable = draftEditable && !temp;
    const catLabel = CATEGORY_LABELS[c.category || 'other'];
    return (
      <div className="hq-sheet-row hq-sheet-subrow" role="row" key={c.id}>
        <form id={rowId} action={upsertExpenseItemAction} hidden />
        <input form={rowId} type="hidden" name="plan_id" value={planId} />
        <input form={rowId} type="hidden" name="expense_id" value={c.id} />
        <input form={rowId} type="hidden" name="parent_id" value={parent.id} />
        <input form={rowId} type="hidden" name="kind" value={parent.kind} />
        <input form={rowId} type="hidden" name="category" value={c.category || 'other'} />
        <span className="hq-sheet-type hq-sheet-type-sub" aria-hidden="true">↳</span>
        <span className="hq-sheet-cell">{catLabel}</span>
        <span className="hq-sheet-dim">—</span>
        <span className="hq-sheet-cell">{catLabel}</span>
        <span className="hq-sheet-dim">—</span>
        {rowEditable ? (
          <span className="hq-sheet-amount">
            <span>$</span>
            <input form={rowId} name="amount" type="number" min="0" step="0.01" defaultValue={dollars(c.amountCents)} aria-label="Amount" onBlur={autoSave} />
          </span>
        ) : (
          <span className="hq-sheet-cell hq-sheet-num">{usd(c.effectiveCents)}</span>
        )}
        {temp ? (
          <span className="hq-sheet-dim">—</span>
        ) : (
          <FundedByCell
            expenseAmountCents={c.effectiveCents}
            expenseCategory={c.category}
            agLabel={`AG-${AG_ABBR[c.category || 'other']}`}
            grantOver={grantOverByCategory.get(c.category || 'other') || false}
            allocations={allocByExpense(c.id)}
            sources={sources}
            editable={draftEditable}
            sourceLabelById={sourceLabelById}
            onAllocate={(sourceId, amountCents) => commitAllocation(sourceId, c.id, amountCents)}
          />
        )}
        <span className="hq-sheet-actions">
          {rowEditable ? (
            <button form={rowId} formAction={deleteExpenseItemAction} className="hq-sheet-del" title="Remove" aria-label="Remove" onClick={confirmDelete(c.id)}>
              ✕
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  const renderAddSubRow = (parent: Expense, children: Expense[]) => {
    const used = new Set(children.map((c) => c.category));
    const available = (['equipment', 'food', 'travel', 'other'] as const).filter((c) => !used.has(c));
    if (available.length === 0) return null;
    return (
      <AddSubRow
        key={`add-${parent.id}`}
        planId={planId}
        parent={parent}
        available={available}
        sources={sources}
        onAdd={handleAddSub}
      />
    );
  };

  const renderEventGroup = (block: ExpenseBlock, handle: DragHandle) => {
    const parent = block.rows[0];
    const children = block.children;
    const hasChildren = children.length > 0;
    const open = openGroups.has(parent.id);
    const temp = parent.id.startsWith('temp-');
    const rowEditable = (draftEditable || (canEdit && status === 'approved' && parent.lockCadence === 'unlocked')) && !temp;
    const rowId = `exp-${parent.id}`;
    const typeLabel = parent.kind === 'operations' ? 'Ops' : parent.kind === 'general' ? 'General' : 'Event';
    const dragProps = draftEditable && !temp ? handle : {};

    const childTotal = (c: Expense) => allocByExpense(c.id).reduce((x, a) => x + a.amountCents, 0);
    const aggEffective = children.reduce((s, c) => s + c.effectiveCents, 0);
    const aggRemainder = children.reduce((s, c) => s + Math.max(0, c.effectiveCents - Math.min(c.effectiveCents, childTotal(c))), 0);

    const combined = new Map<string, number>();
    for (const c of children) for (const a of allocByExpense(c.id)) combined.set(a.sourceId, (combined.get(a.sourceId) || 0) + a.amountCents);
    const combinedParts = Array.from(combined.entries()).map(([sid, amt]) => `${sourceLabelById(sid)} (${usd(amt)})`);
    if (aggRemainder > 0) combinedParts.push(`AG (${usd(aggRemainder)})`);
    const combinedSummary = combinedParts.length > 0 ? combinedParts.join(', ') : '—';

    return (
      <>
        <div className="hq-sheet-row" role="row" key={parent.id}>
          <form id={rowId} action={upsertExpenseItemAction} hidden />
          <input form={rowId} type="hidden" name="plan_id" value={planId} />
          <input form={rowId} type="hidden" name="expense_id" value={parent.id} />
          <input form={rowId} type="hidden" name="kind" value={parent.kind} />
          <input form={rowId} type="hidden" name="team_id" value="" />
          <span
            className={`hq-sheet-type hq-sheet-type-event${draftEditable && !temp ? ' hq-sheet-grip' : ''}`}
            title={draftEditable && !temp ? 'Drag to reorder' : undefined}
            {...dragProps}
          >
            {draftEditable && !temp ? <span className="hq-sheet-grip-dots" aria-hidden="true">⠿</span> : null}
            {typeLabel}
          </span>
          <div className="hq-sheet-src-name">
            <button type="button" className="hq-group-toggle" onClick={() => toggleGroup(parent.id)} aria-label={open ? 'Collapse' : 'Expand'}>
              {open ? '▾' : '▸'}
            </button>
            {rowEditable ? (
              <input form={rowId} className="hq-sheet-input" name="label" defaultValue={parent.label} aria-label="Name" onBlur={autoSave} />
            ) : (
              <span className="hq-sheet-cell">{parent.label}</span>
            )}
          </div>
          <span className="hq-sheet-dim">—</span>
          <span className="hq-sheet-dim">{hasChildren ? `${children.length} cat.` : 'split…'}</span>
          {rowEditable ? (
            <select form={rowId} className="hq-sheet-input" name="lock_cadence" defaultValue={parent.lockCadence} aria-label="Lock" onChange={autoSave}>
              <option value="yearly">Yearly</option>
              <option value="quarterly">Quarterly</option>
              <option value="unlocked">Unlocked</option>
            </select>
          ) : (
            <span className={`hq-budget-tag hq-budget-tag-${parent.lockCadence}`}>{parent.lockCadence}</span>
          )}
          {hasChildren ? (
            <span className="hq-sheet-cell hq-sheet-num">{usd(aggEffective)}</span>
          ) : rowEditable ? (
            <span className="hq-sheet-amount">
              <span>$</span>
              <input form={rowId} name="amount" type="number" min="0" step="0.01" defaultValue={dollars(parent.amountCents)} aria-label="Amount" onBlur={autoSave} />
            </span>
          ) : (
            <span className="hq-sheet-cell hq-sheet-num">{usd(parent.effectiveCents)}</span>
          )}
          {hasChildren ? (
            <span className="hq-sheet-dim hq-funded-summary" title={combinedSummary}>
              {combinedSummary}
            </span>
          ) : temp ? (
            <span className="hq-sheet-dim">—</span>
          ) : (
            <FundedByCell
              expenseAmountCents={parent.effectiveCents}
              expenseCategory={parent.category}
              agLabel={`AG-${AG_ABBR[parent.category || 'other']}`}
              grantOver={grantOverByCategory.get(parent.category || 'other') || false}
              allocations={allocByExpense(parent.id)}
              sources={sources}
              editable={draftEditable}
              sourceLabelById={sourceLabelById}
              onAllocate={(sourceId, amountCents) => commitAllocation(sourceId, parent.id, amountCents)}
            />
          )}
          <span className="hq-sheet-actions">
            {draftEditable && !temp ? (
              <button form={rowId} formAction={deleteExpenseItemAction} className="hq-sheet-del" title="Remove" aria-label="Remove" onClick={confirmDelete(parent.id)}>
                ✕
              </button>
            ) : null}
          </span>
        </div>
        {open ? children.map((c) => renderSubRow(parent, c)) : null}
        {open && draftEditable && !temp ? renderAddSubRow(parent, children) : null}
      </>
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
            const overCommitted = s.remainingCents < 0;
            return (
              <div
                className={`hq-sheet-row${temp ? ' hq-sheet-row-pending' : ''}${overCommitted ? ' hq-sheet-row-over-amt' : ''}`}
                role="row"
                key={s.id}
              >
                <form id={rowId} action={upsertFundingSourceAction} hidden />
                <input form={rowId} type="hidden" name="plan_id" value={planId} />
                <input form={rowId} type="hidden" name="source_id" value={s.id} />
                <input form={rowId} type="hidden" name="is_default_pool" value={s.isDefaultPool ? 'on' : ''} />
                <span className="hq-sheet-type hq-sheet-type-source">Source</span>
                <div className="hq-sheet-src-name">
                  {draftEditable && !temp ? (
                    <input form={rowId} className="hq-sheet-input" name="label" defaultValue={s.label} aria-label="Name" onBlur={autoSave} />
                  ) : (
                    <span className="hq-sheet-cell">{s.label}</span>
                  )}
                  <span className={`hq-sheet-util${overCommitted ? ' hq-funded-over' : ''}`}>
                    ({s.amountCents > 0 ? Math.round((s.committedCents / s.amountCents) * 100) : 0}% utilized)
                  </span>
                </div>
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
                <span className={`hq-sheet-dim${overCommitted ? ' hq-funded-over' : ''}`}>
                  {s.kind === 'annual_grant'
                    ? overCommitted
                      ? `over ${usd(-s.remainingCents)}`
                      : 'permanent'
                    : overCommitted
                      ? `over ${usd(-s.remainingCents)}`
                      : '—'}
                </span>
                {draftEditable && !temp ? (
                  <span className="hq-sheet-amount">
                    <span>$</span>
                    <input form={rowId} name="amount" type="number" min="0" step="0.01" defaultValue={dollars(s.amountCents)} aria-label="Amount" onBlur={autoSave} />
                  </span>
                ) : (
                  <span className="hq-sheet-cell hq-sheet-num">{usd(s.amountCents)}</span>
                )}
                {draftEditable && !temp ? (
                  <input form={rowId} className="hq-sheet-input" name="notes" defaultValue={s.notes || ''} placeholder="Notes (e.g. from ASSU)" aria-label="Notes" onBlur={autoSave} />
                ) : (
                  <span className="hq-sheet-dim">{s.notes || '—'}</span>
                )}
                <span className="hq-sheet-actions">
                  {draftEditable && !temp && s.kind !== 'annual_grant' ? (
                    <button form={rowId} formAction={deleteFundingSourceAction} className="hq-sheet-del" title="Remove" aria-label="Remove" onClick={confirmDelete(s.id)}>
                      ✕
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}

          {sortedSources.length > 0 && blocks.length > 0 ? <div className="hq-sheet-section-gap" aria-hidden="true" /> : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
              {blocks.map((block) => (
                <SortableBlock key={block.id} id={block.id} disabled={!draftEditable} isTeam={Boolean(block.teamId)}>
                  {(handle) =>
                    block.teamId
                      ? block.rows.map((e) => renderExpenseRow(e, handle))
                      : renderEventGroup(block, handle)
                  }
                </SortableBlock>
              ))}
            </SortableContext>
          </DndContext>

          {draftEditable ? (
            <AddRow planId={planId} teams={teams} onAdd={handleAdd} usedTeamCategories={usedTeamCategories} />
          ) : null}
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

function AddRow({
  planId,
  teams,
  onAdd,
  usedTeamCategories
}: {
  planId: string;
  teams: Team[];
  onAdd: (formData: FormData) => void | Promise<void>;
  usedTeamCategories: Set<string>;
}) {
  const [type, setType] = useState<'team' | 'event' | 'operations' | 'source'>('team');
  const isSource = type === 'source';
  const isTeam = type === 'team';

  return (
    <form
      className="hq-sheet-row hq-sheet-add"
      action={onAdd}
      onSubmit={(event) => {
        if (type !== 'team') return;
        const form = event.currentTarget;
        const teamId = (form.elements.namedItem('team_id') as HTMLSelectElement)?.value;
        const category = (form.elements.namedItem('category') as HTMLSelectElement)?.value;
        if (teamId && category && usedTeamCategories.has(`${teamId}:${category}`)) {
          event.preventDefault();
          window.alert(`${teams.find((t) => t.id === teamId)?.name || 'That team'} already has a ${category} budget. Edit the existing row instead.`);
        }
      }}
    >
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
        <input className="hq-sheet-input" name="notes" placeholder="Notes (e.g. from ASSU)" aria-label="Notes" />
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

function AddSubRow({
  planId,
  parent,
  available,
  sources,
  onAdd
}: {
  planId: string;
  parent: Expense;
  available: string[];
  sources: Source[];
  onAdd: (formData: FormData) => void | Promise<void>;
}) {
  const [category, setCategory] = useState<string>(available[0]);
  const eligible = sources
    .filter((s) => s.kind !== 'annual_grant')
    .filter((s) => !s.category || s.category === category);
  return (
    <form className="hq-sheet-row hq-sheet-subrow hq-sheet-add" action={onAdd}>
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="parent_id" value={parent.id} />
      <input type="hidden" name="kind" value={parent.kind} />
      <span className="hq-sheet-type hq-sheet-type-sub" aria-hidden="true">↳</span>
      <span className="hq-sheet-dim">add category…</span>
      <span className="hq-sheet-dim">—</span>
      <select
        className="hq-sheet-input"
        name="category"
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        aria-label="Category"
      >
        {available.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <span className="hq-sheet-dim">—</span>
      <span className="hq-sheet-amount">
        <span>$</span>
        <input name="amount" type="number" min="0" step="0.01" placeholder="0" aria-label="Amount" />
      </span>
      <select key={category} className="hq-sheet-input" name="source_id" defaultValue="" aria-label="Funded by">
        <option value="">Funded by annual grant</option>
        {eligible.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.category ? ` · ${s.category}` : ''}
          </option>
        ))}
      </select>
      <span className="hq-sheet-actions">
        <button className="hq-sheet-add-btn" type="submit" title="Add sub-item" aria-label="Add sub-item">
          +
        </button>
      </span>
    </form>
  );
}

function FundedByCell({
  expenseAmountCents,
  expenseCategory,
  agLabel,
  grantOver,
  allocations,
  sources,
  editable,
  sourceLabelById,
  onAllocate
}: {
  expenseAmountCents: number;
  expenseCategory: string | null;
  agLabel: string;
  grantOver: boolean;
  allocations: Allocation[];
  sources: Source[];
  editable: boolean;
  sourceLabelById: (id: string) => string;
  onAllocate: (sourceId: string, amountCents: number) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Remainder is computed from the (optimistic) allocations so it stays in sync.
  const allocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const remainderCents = Math.max(0, expenseAmountCents - allocated);

  // Itemized summary: each source with its amount, then the annual grant remainder.
  const parts: string[] = allocations.map((a) => `${sourceLabelById(a.sourceId)} (${usd(a.amountCents)})`);
  if (remainderCents > 0) parts.push(`${agLabel} (${usd(remainderCents)})`);
  const summary = parts.length > 0 ? parts.join(', ') : '—';
  const shortfall = remainderCents > 0 && grantOver;

  if (!editable) {
    return (
      <span className={`hq-sheet-dim hq-funded-summary${shortfall ? ' hq-funded-over' : ''}`} title={summary}>
        {summary}
      </span>
    );
  }

  return (
    <div className="hq-funded" ref={ref}>
      <button
        type="button"
        className={`hq-funded-trigger${shortfall ? ' hq-funded-over' : ''}`}
        title={shortfall ? `${agLabel} is over budget — add more to that annual grant.` : summary}
        onClick={() => setOpen((o) => !o)}
      >
        {summary}
      </button>
      {open ? (
        <div className="hq-funded-pop">
          {allocations.length > 0 ? (
            <div className="hq-funded-rows">
              {allocations.map((a) => (
                <div key={a.sourceId} className="hq-funded-row">
                  <span className="hq-funded-name">{sourceLabelById(a.sourceId)}</span>
                  <span className="hq-funded-amt">{usd(a.amountCents)}</span>
                  <form action={() => onAllocate(a.sourceId, 0)} className="hq-funded-x">
                    <button className="hq-sheet-chip-x" type="submit" title="Remove" aria-label="Remove allocation">
                      ✕
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
          {remainderCents > 0 ? (
            <div className={`hq-funded-row hq-funded-grant${grantOver ? ' hq-funded-over' : ''}`}>
              <span className="hq-funded-name">{agLabel}{grantOver ? ' · over budget' : ''}</span>
              <span className="hq-funded-amt">{usd(remainderCents)}</span>
            </div>
          ) : null}
          <form
            className="hq-funded-add"
            action={(formData: FormData) => {
              const srcId = String(formData.get('source_id') || '');
              const amt = Math.round((Number(formData.get('amount')) || 0) * 100);
              if (!srcId || amt <= 0) return;
              const otherToExpense = allocations.filter((a) => a.sourceId !== srcId).reduce((sum, a) => sum + a.amountCents, 0);
              if (amt + otherToExpense > expenseAmountCents) {
                window.alert(`That exceeds the line item amount (${usd(expenseAmountCents)}). Set or raise the line amount first.`);
                return;
              }
              const src = sources.find((s) => s.id === srcId);
              if (src && amt > src.remainingCents) {
                window.alert(`Only ${usd(src.remainingCents)} is left in ${src.label}.`);
                return;
              }
              return onAllocate(srcId, amt);
            }}
          >
            <select className="hq-sheet-input" name="source_id" required defaultValue="">
              <option value="" disabled>
                Add a source…
              </option>
              {sources
                .filter((s) => s.kind !== 'annual_grant')
                .filter((s) => !expenseCategory || !s.category || s.category === expenseCategory)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.category ? ` · ${s.category}` : ''}
                  </option>
                ))}
            </select>
            <div className="hq-funded-add-amount">
              <input className="hq-sheet-input" name="amount" type="number" min="0" step="0.01" placeholder="Amount" required />
              <button className="button-secondary hq-funded-add-btn" type="submit">
                Add
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
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
