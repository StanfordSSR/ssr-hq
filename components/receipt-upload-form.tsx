'use client';

import { useRef, useState } from 'react';
import { uploadPurchaseReceiptAction } from '@/app/dashboard/actions';

type ReceiptUploadFormProps = {
  purchaseId: string;
  compact?: boolean;
};

export function ReceiptUploadForm({ purchaseId, compact = false }: ReceiptUploadFormProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileCount, setFileCount] = useState(0);

  return (
    <form action={uploadPurchaseReceiptAction} className={compact ? 'hq-receipt-upload hq-receipt-upload-compact' : 'hq-receipt-upload'}>
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <input
        ref={fileRef}
        className="input"
        type="file"
        name="receipt"
        accept=".pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => setFileCount(event.target.files?.length || 0)}
        required
      />
      <button className="button-secondary" type="submit" disabled={fileCount === 0}>
        Upload receipt
      </button>
    </form>
  );
}
