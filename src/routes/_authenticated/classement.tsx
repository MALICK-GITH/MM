import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Crown, TrendingUp } from "lucide-react";

import { EmptyState, PageTitle, StatusChip } from "@/components/skill2cash/ui-bits";
import { useMe } from "@/hooks/use-s2c";
import { supabase } from "@/integrations/supabase/client";
import { fcfa } from "@/lib/s2c";

type LeaderboardEntry = {
  rank: number;
  user_id: string;
  username: string;
  efootball_username: string;
  elo_rating: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_earnings: number;
};

export const Route = createFileRoute("/_authenticated/classement")({
  head: () => ({
    meta: [
      { title: "Classement ELO — SKILL2CASH" },
      {
        name: "description",
        content: "Le classement ELO des meilleurs joueurs eFootball basé sur leur niveau de compétition.",
      },
      { property: "og:title", content: "Classement ELO — SKILL2CASH" },
      { property: "og:description", content: "Top joueurs par classement ELO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { user } = useMe();

  const board = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leaderboard", {
        limit_count: 100,
        offset_count: 0,
      });
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
  });

  const rows = board.data ?? [];

  return (
    <div>
      <PageTitle title="Classement ELO" subtitle="Les meilleurs joueurs classés par niveau de compétition." />
      {rows.length ? (
        <div className="panel divide-y divide-border/50 clip-corner">
          {rows.map((p) => {
            const played = p.wins + p.losses;
            return (
              <div
                key={p.user_id}
                className={
                  p.user_id === user?.id
                    ? "flex items-center gap-4 bg-primary/10 px-4 py-3"
                    : "flex items-center gap-4 px-4 py-3"
                }
              >
                <span className="w-8 font-display text-lg font-bold text-muted-foreground">
                  #{p.rank}
                </span>
                {p.rank === 1 ? <Crown className="size-4 text-accent" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-primary">
                    {p.username}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.wins}V · {p.losses}D
                    {played ? ` · ${p.win_rate}% victoires` : ""} · {fcfa(p.total_earnings)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-neon" />
                  <p className="font-display text-sm font-bold text-neon">
                    {p.elo_rating}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState text={board.isLoading ? "Chargement…" : "Classement vide."} />
      )}
    </div>
  );
}