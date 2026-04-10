import { CardState, ReviewRating } from "@prisma/client";

export interface ScheduleSnapshot {
  state: CardState;
  intervalDays: number;
  easeFactor: number;
  repetition: number;
  lapses: number;
}

export interface ScheduleUpdate extends ScheduleSnapshot {
  dueAt: Date;
  lastReviewedAt: Date;
}

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;

export function applyReviewRating(
  schedule: ScheduleSnapshot,
  rating: ReviewRating,
  now: Date,
): ScheduleUpdate {
  const ease = clamp(schedule.easeFactor, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
  let nextState = schedule.state;
  let nextInterval = schedule.intervalDays;
  let nextEase = ease;
  let nextRepetition = schedule.repetition;
  let nextLapses = schedule.lapses;
  let dueAt = now;

  switch (rating) {
    case ReviewRating.AGAIN: {
      nextState = CardState.RELEARNING;
      nextInterval = 0;
      nextEase = clamp(ease - 0.2, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
      nextRepetition = 0;
      nextLapses += 1;
      dueAt = addMinutes(now, 10);
      break;
    }
    case ReviewRating.HARD: {
      nextEase = clamp(ease - 0.15, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
      nextRepetition = Math.max(1, schedule.repetition + 1);
      nextInterval =
        schedule.repetition <= 1
          ? 1
          : Math.max(1, Math.round(schedule.intervalDays * 1.2));
      nextState = nextRepetition >= 2 ? CardState.REVIEW : CardState.LEARNING;
      dueAt = addDays(now, nextInterval);
      break;
    }
    case ReviewRating.GOOD: {
      nextRepetition = schedule.repetition + 1;
      if (schedule.repetition === 0) {
        nextInterval = 1;
      } else if (schedule.repetition === 1) {
        nextInterval = 3;
      } else {
        nextInterval = Math.max(1, Math.round(schedule.intervalDays * ease));
      }
      nextState = nextRepetition >= 2 ? CardState.REVIEW : CardState.LEARNING;
      dueAt = addDays(now, nextInterval);
      break;
    }
    case ReviewRating.EASY: {
      nextEase = clamp(ease + 0.15, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
      nextRepetition = Math.max(2, schedule.repetition + 1);
      if (schedule.repetition === 0) {
        nextInterval = 4;
      } else {
        nextInterval = Math.max(
          2,
          Math.round(schedule.intervalDays * nextEase * 1.3),
        );
      }
      nextState = CardState.REVIEW;
      dueAt = addDays(now, nextInterval);
      break;
    }
    default: {
      assertNever(rating);
    }
  }

  return {
    state: nextState,
    dueAt,
    intervalDays: nextInterval,
    easeFactor: nextEase,
    repetition: nextRepetition,
    lapses: nextLapses,
    lastReviewedAt: now,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled rating variant: ${String(value)}`);
}
