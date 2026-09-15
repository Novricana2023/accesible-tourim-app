import type { EventBus, RuntimeEvent } from "@mara/shared";

export function createEventBus(): EventBus {
  const handlers = new Set<(event: RuntimeEvent) => void>();

  return {
    emit(event: RuntimeEvent) {
      for (const handler of handlers) {
        handler(event);
      }
    },
    subscribe(handler: (event: RuntimeEvent) => void) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
