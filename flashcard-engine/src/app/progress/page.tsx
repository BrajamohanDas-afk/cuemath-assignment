import { CardState } from "@prisma/client";
import { resolveServerUserId } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const metrics = await getProgressMetrics();

  const masteryMix = [
    {
      label: "Mastered",
      value: metrics.masteredPct,
      count: metrics.masteredCount,
      detail: "Cards in stable review state",
    },
    {
      label: "Shaky",
      value: metrics.shakyPct,
      count: metrics.shakyCount,
      detail: "Learning or recently lapsed cards",
    },
    {
      label: "New",
      value: metrics.newPct,
      count: metrics.newCount,
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
                  {metric.value}% ({metric.count})
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
          <div className="mt-4 grid gap-5 text-sm">
            <div>
              <p className="text-[var(--ink-dim)]">Cards due now</p>
              <p className="mt-1 text-3xl font-semibold">{metrics.dueNow}</p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">Still due today</p>
              <p className="mt-1 text-3xl font-semibold">{metrics.dueLaterToday}</p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">Due tomorrow</p>
              <p className="mt-1 text-3xl font-semibold">{metrics.dueTomorrow}</p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">Due in next 7 days</p>
              <p className="mt-1 text-3xl font-semibold">{metrics.dueNext7Days}</p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">Current streak</p>
              <p className="mt-1 text-3xl font-semibold">{metrics.streakDays} days</p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">Average response time</p>
              <p className="mt-1 text-3xl font-semibold">
                {metrics.avgResponseSeconds}s
              </p>
            </div>
            <div>
              <p className="text-[var(--ink-dim)]">Total reviews logged</p>
              <p className="mt-1 text-3xl font-semibold">{metrics.totalReviews}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

async function getProgressMetrics() {
  const userId = await resolveServerUserId();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrowStart = new Date(
    tomorrowStart.getTime() + 24 * 60 * 60 * 1000,
  );
  const nextSevenDaysEnd = new Date(
    tomorrowStart.getTime() + 7 * 24 * 60 * 60 * 1000,
  );

  const [
    totalCards,
    dueNow,
    dueLaterToday,
    dueTomorrow,
    dueNext7Days,
    stateGroups,
    reviewAggregate,
    totalReviews,
    streakDays,
  ] = await Promise.all([
      prisma.card.count({
        where: {
          deck: {
            userId,
          },
        },
      }),
      prisma.cardSchedule.count({
        where: {
          dueAt: {
            lte: now,
          },
          card: {
            deck: {
              userId,
            },
          },
        },
      }),
      prisma.cardSchedule.count({
        where: {
          dueAt: {
            gt: now,
            lt: tomorrowStart,
          },
          card: {
            deck: {
              userId,
            },
          },
        },
      }),
      prisma.cardSchedule.count({
        where: {
          dueAt: {
            gte: tomorrowStart,
            lt: dayAfterTomorrowStart,
          },
          card: {
            deck: {
              userId,
            },
          },
        },
      }),
      prisma.cardSchedule.count({
        where: {
          dueAt: {
            gte: tomorrowStart,
            lt: nextSevenDaysEnd,
          },
          card: {
            deck: {
              userId,
            },
          },
        },
      }),
      prisma.cardSchedule.groupBy({
        where: {
          card: {
            deck: {
              userId,
            },
          },
        },
        by: ["state"],
        _count: {
          state: true,
        },
      }),
      prisma.review.aggregate({
        where: {
          card: {
            deck: {
              userId,
            },
          },
          responseTimeMs: {
            not: null,
          },
        },
        _avg: {
          responseTimeMs: true,
        },
      }),
      prisma.review.count({
        where: {
          card: {
            deck: {
              userId,
            },
          },
        },
      }),
      calculateStreakDays(todayStart, userId),
    ]);

  const stateCountMap = new Map<CardState, number>(
    stateGroups.map((entry) => [entry.state, entry._count.state]),
  );

  const masteredCount = stateCountMap.get(CardState.REVIEW) ?? 0;
  const shakyCount =
    (stateCountMap.get(CardState.LEARNING) ?? 0) +
    (stateCountMap.get(CardState.RELEARNING) ?? 0);

  const denominator = Math.max(totalCards, 1);
  let masteredPct = Math.round((masteredCount / denominator) * 100);
  let shakyPct = Math.round((shakyCount / denominator) * 100);
  const newCount = Math.max(totalCards - masteredCount - shakyCount, 0);
  let newPct = 100 - masteredPct - shakyPct;

  if (newPct < 0) {
    const overflow = Math.abs(newPct);
    const shakyReduction = Math.min(shakyPct, overflow);
    shakyPct -= shakyReduction;
    const remainingOverflow = overflow - shakyReduction;
    if (remainingOverflow > 0) {
      masteredPct = Math.max(0, masteredPct - remainingOverflow);
    }
    newPct = 0;
  }

  const avgResponseMs = reviewAggregate._avg.responseTimeMs ?? 0;
  const avgResponseSeconds = (avgResponseMs / 1000).toFixed(1);

  return {
    dueNow,
    dueLaterToday,
    dueTomorrow,
    dueNext7Days,
    streakDays,
    avgResponseSeconds,
    totalReviews,
    masteredCount,
    shakyCount,
    newCount,
    masteredPct,
    shakyPct,
    newPct,
  };
}

async function calculateStreakDays(
  todayStart: Date,
  userId: string,
): Promise<number> {
  const recentReviews = await prisma.review.findMany({
    select: {
      answeredAt: true,
    },
    where: {
      answeredAt: {
        gte: new Date(todayStart.getTime() - 60 * 24 * 60 * 60 * 1000),
      },
      card: {
        deck: {
          userId,
        },
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
