import { CardState } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const metrics = await getProgressMetrics();

  const masteryMix = [
    {
      label: "Mastered",
      value: metrics.masteredPct,
      detail: "Cards in stable review state",
    },
    {
      label: "Shaky",
      value: metrics.shakyPct,
      detail: "Learning or recently lapsed cards",
    },
    {
      label: "New",
      value: metrics.newPct,
      detail: "Cards not reviewed yet",
    },
  ];

  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Progress
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Progress and Mastery
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Live retention metrics from your real review sessions.
        </p>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4 border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Mastery Mix
          </p>
          {masteryMix.map((metric) => (
            <div key={metric.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{metric.label}</span>
                <span className="font-mono text-xs text-[var(--ink-dim)]">
                  {metric.value}%
                </span>
              </div>
              <div className="h-2 overflow-hidden bg-[rgba(19,21,26,0.12)]">
                <div
                  className="h-full bg-[var(--ink)]"
                  style={{ width: `${metric.value}%` }}
                />
              </div>
              <p className="text-xs text-[var(--ink-dim)]">{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className="border-l border-[var(--line)] pl-6 md:pl-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Session Signals
          </p>
          <dl className="mt-4 grid gap-5 text-sm">
            <div>
              <dt className="text-[var(--ink-dim)]">Cards due now</dt>
              <dd className="mt-1 text-3xl font-semibold">{metrics.dueNow}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">Current streak</dt>
              <dd className="mt-1 text-3xl font-semibold">
                {metrics.streakDays} days
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">Average response time</dt>
              <dd className="mt-1 text-3xl font-semibold">
                {metrics.avgResponseSeconds}s
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">Total reviews logged</dt>
              <dd className="mt-1 text-3xl font-semibold">{metrics.totalReviews}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

async function getProgressMetrics() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [totalCards, dueNow, stateGroups, reviewAggregate, totalReviews, streakDays] =
    await Promise.all([
      prisma.card.count(),
      prisma.cardSchedule.count({
        where: {
          dueAt: {
            lte: now,
          },
        },
      }),
      prisma.cardSchedule.groupBy({
        by: ["state"],
        _count: {
          state: true,
        },
      }),
      prisma.review.aggregate({
        where: {
          responseTimeMs: {
            not: null,
          },
        },
        _avg: {
          responseTimeMs: true,
        },
      }),
      prisma.review.count(),
      calculateStreakDays(todayStart),
    ]);

  const stateCountMap = new Map<CardState, number>(
    stateGroups.map((entry) => [entry.state, entry._count.state]),
  );

  const masteredCount = stateCountMap.get(CardState.REVIEW) ?? 0;
  const shakyCount =
    (stateCountMap.get(CardState.LEARNING) ?? 0) +
    (stateCountMap.get(CardState.RELEARNING) ?? 0);

  const denominator = Math.max(totalCards, 1);
  const masteredPct = Math.round((masteredCount / denominator) * 100);
  const shakyPct = Math.round((shakyCount / denominator) * 100);
  const newPct = Math.max(0, 100 - masteredPct - shakyPct);

  const avgResponseMs = reviewAggregate._avg.responseTimeMs ?? 0;
  const avgResponseSeconds = (avgResponseMs / 1000).toFixed(1);

  return {
    dueNow,
    streakDays,
    avgResponseSeconds,
    totalReviews,
    masteredPct,
    shakyPct,
    newPct,
  };
}

async function calculateStreakDays(todayStart: Date): Promise<number> {
  const recentReviews = await prisma.review.findMany({
    select: {
      answeredAt: true,
    },
    where: {
      answeredAt: {
        gte: new Date(todayStart.getTime() - 60 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: {
      answeredAt: "desc",
    },
  });

  const reviewedDays = new Set(
    recentReviews.map((review) => {
      const day = new Date(review.answeredAt);
      day.setHours(0, 0, 0, 0);
      return day.getTime();
    }),
  );

  let streak = 0;
  let cursor = new Date(todayStart);

  while (reviewedDays.has(cursor.getTime())) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}
