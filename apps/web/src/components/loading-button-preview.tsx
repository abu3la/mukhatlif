'use client';

import { useEffect, useRef, useState } from 'react';
import { BusyButton } from './busy-button';

export function LoadingButtonPreview() {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <BusyButton className="customer-primary" loadingMode="replace" aria-busy={busy}
    onClick={() => {
      setBusy(true);
      timer.current = setTimeout(() => setBusy(false), 1800);
    }}>جرّب الزر</BusyButton>;
}
