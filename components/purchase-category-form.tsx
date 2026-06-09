'use client';

import { useState } from 'react';
import { updatePurchaseCategoryAction } from '@/app/dashboard/actions';

type PurchaseCategoryFormProps = {
  purchaseId: string;
  category: 'equipment' | 'food' | 'travel';
};

export function PurchaseCategoryForm({ purchaseId, category }: PurchaseCategoryFormProps) {
  const [value, setValue] = useState(category);

  return (
    <form action={updatePurchaseCategoryAction} className="hq-category-form">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <select className="select" name="category" value={value} onChange={(event) => setValue(event.target.value as typeof category)}>
        <option value="equipment">Equipment</option>
        <option value="food">Food</option>
        <option value="travel">Travel</option>
      </select>
      <button className="button-secondary" type="submit">
        Save
      </button>
    </form>
  );
}
