// =============================================================================
// EventBus.ts — Minimal pub/sub event bus for engine → UI notifications
// The engine emits events; UI panels subscribe. No circular dependencies.
// =============================================================================

import type { CircuitError, PropagationResult, HardwareMessage } from './types.js';

export interface EventMap {
  /** Emitted after any structural change (add/remove component or wire). */
  'circuit:changed': void;
  /** Emitted after a successful propagation — wire/port values updated. */
  'signal:updated': PropagationResult;
  /** Emitted when a simulation error is detected. */
  'error:detected': CircuitError[];
  /** Emitted when hardware serial data is received and applied. */
  'hardware:data': HardwareMessage;
  /** Emitted when simulation mode changes. */
  'mode:changed': 'simulation' | 'hardware';
  /** Emitted when simulation run/pause/reset changes. */
  'sim:stateChanged': 'running' | 'paused' | 'reset';
  /** Emitted when the circuit is saved or loaded. */
  'circuit:loaded': string;  // circuit name
}

type EventHandler<T> = T extends void ? () => void : (data: T) => void;

/**
 * Simple synchronous pub/sub bus.
 * All event delivery is synchronous so the UI updates immediately
 * after the engine finishes propagation.
 */
export class EventBus {
  private readonly listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const arr = this.listeners.get(event)!;
    const fn = handler as (data: unknown) => void;
    arr.push(fn);
    return () => {
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  /** Subscribe once — automatically unsubscribes after first delivery. */
  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const unsub = this.on(event, ((...args: unknown[]) => {
      unsub();
      (handler as (...a: unknown[]) => void)(...args);
    }) as EventHandler<EventMap[K]>);
  }

  /** Emit an event, delivering it to all current listeners. */
  emit<K extends keyof EventMap>(
    event: K,
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    for (const fn of [...listeners]) {
      fn(args[0]);
    }
  }

  /** Remove all listeners for a specific event (or all if no event given). */
  off(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/** Application-global singleton event bus. */
export const eventBus = new EventBus();
