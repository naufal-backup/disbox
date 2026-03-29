import { useState, useRef, useCallback } from 'react';
import { ipc } from '@/utils/ipc';

export function useTransfers() {
  const [transfers, setTransfers] = useState([]);
  const abortControllersRef = useRef(new Map());
  const isTransferring = transfers.some(t => t.status === 'active');

  const addTransfer = useCallback((t) => {
    const controller = new AbortController();
    abortControllersRef.current.set(t.id, controller);
    setTransfers(p => [...p, { ...t, signal: controller.signal }]);
    return controller.signal;
  }, []);

  const updateTransfer = useCallback((id, u) => {
    setTransfers(p => p.map(t => t.id === id ? { ...t, ...u } : t));
  }, []);

  const removeTransfer = useCallback((id) => {
    abortControllersRef.current.delete(id);
    setTransfers(p => p.filter(t => t.id !== id));
  }, []);

  const cancelTransfer = useCallback((id) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) controller.abort();
    if (ipc?.cancelUpload) ipc.cancelUpload(id);
    setTransfers(p => p.map(t => t.id === id ? { ...t, status: 'cancelled' } : t));
    setTimeout(() => {
      abortControllersRef.current.delete(id);
      setTransfers(p => p.filter(t => t.id !== id));
    }, 2000);
  }, []);

  const getTransferSignal = useCallback((id) => {
    return abortControllersRef.current.get(id)?.signal ?? null;
  }, []);

  return { transfers, setTransfers, isTransferring, addTransfer, updateTransfer, removeTransfer, cancelTransfer, getTransferSignal, abortControllersRef };
}