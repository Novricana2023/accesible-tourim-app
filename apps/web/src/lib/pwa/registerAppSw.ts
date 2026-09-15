import { registerSW } from "virtual:pwa-register";

type RefreshListener = () => void;

const listeners = new Set<RefreshListener>();

let applyUpdate: (reloadPage?: boolean) => Promise<void> = async () => {};

export function onPwaNeedRefresh(listener: RefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reloadForPwaUpdate(): void {
  void applyUpdate(true);
}

export function setupAppServiceWorker(): void {
  if (!import.meta.env.PROD) {
    return;
  }

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      for (const listener of listeners) {
        listener();
      }
    },
  });
}
