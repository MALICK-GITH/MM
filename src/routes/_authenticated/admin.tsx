import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageTitle, StatCard, StatusChip } from "@/components/skill2cash/ui-bits";
import { ChatAttachment } from "@/components/skill2cash/chat-attachment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-s2c";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfileMap } from "@/lib/profiles";
import {
  DUEL_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  dateFr,
  errMessage,
  fcfa,
  type Deposit,
  type Duel,
  type Profile,
  type UsernameChangeRequest,
  type Withdrawal,
} from "@/lib/s2c";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administration — SKILL2CASH" },
      {
        name: "description",
        content: "Espace administrateur : validation des dépôts, retraits, litiges et comptes.",
      },
      { property: "og:title", content: "Administration — SKILL2CASH" },
      { property: "og:description", content: "Validation des flux financiers et arbitrage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function DisputeEvidence({ duelId }: { duelId: string }) {
  const evidence = useQuery({
    queryKey: ["dispute-evidence", duelId],
    queryFn: async () => {
      const { data, error } = await supabase.from("duel_messages").select("id, body, attachment_path, attachment_name, created_at").eq("duel_id", duelId).eq("is_dispute_evidence", true).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!evidence.data?.length) return <p className="mt-3 text-xs text-muted-foreground">Aucun justificatif joint.</p>;
  return <div className="mt-3 grid gap-3 sm:grid-cols-2">{evidence.data.map((item) => item.attachment_path && <div key={item.id} className="border border-border/60 p-2"><p className="mb-1 text-xs text-muted-foreground">{item.body || "Justificatif"} · {dateFr(item.created_at)}</p><ChatAttachment path={item.attachment_path} name={item.attachment_name} evidence /></div>)}</div>;
}

function AdminPage() {
  const { isAdmin, loading } = useMe();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState<Record<string, string>>({});

  const data = useQuery({
    queryKey: ["admin-console", search],
    enabled: isAdmin,
    queryFn: async () => {
      let usersQuery = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) usersQuery = usersQuery.ilike("username", `%${search.trim()}%`);

      const [deposits, withdrawals, disputes, usernames, users] = await Promise.all([
        supabase
          .from("deposits")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("withdrawals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("duels")
          .select("*")
          .eq("status", "dispute")
          .order("manual_review_due_at", { ascending: true }),
        supabase
          .from("username_change_requests")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        usersQuery,
      ]);

      const rows = {
        deposits: (deposits.data ?? []) as Deposit[],
        withdrawals: (withdrawals.data ?? []) as Withdrawal[],
        disputes: (disputes.data ?? []) as Duel[],
        usernames: (usernames.data ?? []) as UsernameChangeRequest[],
        users: (users.data ?? []) as Profile[],
      };
      const profiles = await fetchProfileMap([
        ...rows.deposits.map((d) => d.user_id),
        ...rows.withdrawals.map((w) => w.user_id),
        ...rows.disputes.flatMap((d) => [d.player1_id, d.player2_id]),
        ...rows.usernames.map((u) => u.user_id),
      ]);
      return { ...rows, profiles };
    },
  });

  const act = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: unknown }>) => {
      const { error } = await fn();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Action effectuée.");
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const admins = useQuery({
    queryKey: ["admin-list"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_admins");
      if (error) throw error;
      return data ?? [];
    },
  });

  const revenueStats = useQuery({
    queryKey: ["revenue-stats"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_platform_revenue_stats", { p_days_back: 30 });
      if (error) throw error;
      return data;
    },
  });

  const revenueEvolution = useQuery({
    queryKey: ["revenue-evolution"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_revenue_evolution", { p_days_back: 30 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const note = (id: string) => notes[id]?.trim().slice(0, 300) || undefined;

  if (loading) return <EmptyState text="Chargement…" />;
  if (!isAdmin)
    return (
      <div>
        <PageTitle title="Administration" subtitle="Accès réservé." />
        <EmptyState text="Cette section est réservée aux administrateurs." />
      </div>
    );

  const d = data.data;
  const p = (id: string) => d?.profiles[id]?.username ?? "joueur";

  function NoteField({ id }: { id: string }) {
    return (
      <Input
        className="h-9"
        maxLength={300}
        placeholder="Note (optionnelle)"
        value={notes[id] ?? ""}
        onChange={(e) => setNotes((s) => ({ ...s, [id]: e.target.value }))}
      />
    );
  }

  return (
    <div>
      <PageTitle
        title="Administration"
        subtitle="Validation des flux financiers, arbitrage des litiges et gestion des comptes."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Dépôts en attente" value={d?.deposits.length ?? 0} tone="neon" />
        <StatCard label="Retraits en attente" value={d?.withdrawals.filter(w => w.status === 'pending').length ?? 0} tone="neon" />
        <StatCard label="Litiges ouverts" value={d?.disputes.length ?? 0} tone="danger" />
        <StatCard label="Demandes de pseudo" value={d?.usernames.length ?? 0} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenus 30j" value={fcfa(revenueStats.data?.total_revenue)} tone="accent" />
        <StatCard label="Duels terminés" value={revenueStats.data?.total_duels_count ?? 0} />
        <StatCard label="Commission/duel" value={fcfa(revenueStats.data?.avg_commission_per_duel)} />
        <StatCard label="Revenu/jour" value={fcfa(revenueStats.data?.daily_revenue)} />
      </div>

      <section className="mt-8 panel p-5 clip-corner">
        <h2 className="font-display text-sm font-bold tracking-widest uppercase mb-4">Évolution des revenus (30 jours)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={revenueEvolution.data}>
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(value) => `${value / 1000}k`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px"
              }}
              formatter={(value: number) => fcfa(value)}
            />
            <Bar 
              dataKey="revenue" 
              fill="hsl(var(--accent))" 
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <Tabs defaultValue="deposits" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="deposits">Dépôts</TabsTrigger>
          <TabsTrigger value="withdrawals">Retraits</TabsTrigger>
          <TabsTrigger value="disputes">Litiges</TabsTrigger>
          <TabsTrigger value="usernames">Pseudos</TabsTrigger>
          <TabsTrigger value="users">Comptes</TabsTrigger>
          <TabsTrigger value="admins">Administrateurs</TabsTrigger>
        </TabsList>

        <TabsContent value="admins" className="mt-4 space-y-3">
          {(admins.data ?? []).length ? (
            (admins.data ?? []).map((a) => (
              <div key={a.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4 clip-corner">
                <div>
                  <p className="font-display text-base font-bold text-primary">{a.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.badge ? `${a.badge} · ` : ""}
                    {a.level} · {a.country} · membre depuis {dateFr(a.created_at)}
                  </p>
                </div>
                <StatusChip status="approved" label="Administrateur" />
              </div>
            ))
          ) : (
            <EmptyState text={admins.isLoading ? "Chargement…" : "Aucun administrateur."} />
          )}
        </TabsContent>

        <TabsContent value="deposits" className="mt-4 space-y-3">
          {d?.deposits.length ? (
            d.deposits.map((dep) => (
              <div key={dep.id} className="panel p-4 clip-corner">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold text-primary">
                      {fcfa(dep.amount)} · {dep.method}
                    </p>
                    <p className="text-sm">
                      {p(dep.user_id)} · {dep.sender_name} ({dep.sender_phone})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Réf. {dep.reference} · {dateFr(dep.created_at)}
                    </p>
                    {dep.fraud_score > 0 && (
                      <p className="mt-1 font-mono text-[10px] text-destructive uppercase">
                        Risque {dep.fraud_score} · {dep.fraud_flags.join(", ")}
                      </p>
                    )}
                  </div>
                  <StatusChip status={dep.status} label={REQUEST_STATUS_LABELS[dep.status]} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NoteField id={dep.id} />
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(() =>
                        supabase.rpc("admin_review_deposit", {
                          p_deposit: dep.id,
                          p_approve: true,
                          ...(note(dep.id) ? { p_note: note(dep.id)! } : {}),
                        }),
                      )
                    }
                  >
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(() =>
                        supabase.rpc("admin_review_deposit", {
                          p_deposit: dep.id,
                          p_approve: false,
                          ...(note(dep.id) ? { p_note: note(dep.id)! } : {}),
                        }),
                      )
                    }
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState text="Aucun dépôt en attente." />
          )}
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-4 space-y-3">
          {d?.withdrawals.length ? (
            d.withdrawals.map((w) => (
              <div key={w.id} className={`panel p-4 clip-corner ${w.status === 'pending' ? 'border-accent/50 bg-accent/5' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold text-primary">
                      {fcfa(w.amount)} · {w.method}
                    </p>
                    <p className="text-sm">
                      {p(w.user_id)} → {w.phone_number}
                    </p>
                    <p className="text-xs text-muted-foreground">{dateFr(w.created_at)}</p>
                    {w.fraud_score > 0 && (
                      <p className="mt-1 font-mono text-[10px] text-destructive uppercase">
                        Risque {w.fraud_score} · {w.fraud_flags.join(", ")}
                      </p>
                    )}
                  </div>
                  <StatusChip status={w.status} label={REQUEST_STATUS_LABELS[w.status]} />
                </div>
                {w.status === 'pending' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <NoteField id={w.id} />
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_review_withdrawal", {
                            p_withdrawal: w.id,
                            p_approve: true,
                            ...(note(w.id) ? { p_note: note(w.id)! } : {}),
                          }),
                        )
                      }
                    >
                      Payé / Valider
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_review_withdrawal", {
                            p_withdrawal: w.id,
                            p_approve: false,
                            ...(note(w.id) ? { p_note: note(w.id)! } : {}),
                          }),
                        )
                      }
                    >
                      Refuser
                    </Button>
                  </div>
                )}
                {w.status !== 'pending' && w.admin_note && (
                  <p className="mt-2 text-xs text-muted-foreground">Note: {w.admin_note}</p>
                )}
              </div>
            ))
          ) : (
            <EmptyState text="Aucun retrait." />
          )}
        </TabsContent>

        <TabsContent value="disputes" className="mt-4 space-y-3">
          {d?.disputes.length ? (
            d.disputes.map((duel) => (
              <div key={duel.id} className="panel p-4 clip-corner">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold text-primary">
                      {fcfa(duel.amount)} · {p(duel.player1_id)} vs {p(duel.player2_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {duel.dispute_reason ?? "Sans motif"} · échéance{" "}
                      {dateFr(duel.manual_review_due_at)}
                    </p>
                    <Link
                      to="/duels/$id"
                      params={{ id: duel.id }}
                      className="mt-1 inline-block text-xs text-primary underline"
                    >
                      Ouvrir la chambre de duel
                    </Link>
                    <DisputeEvidence duelId={duel.id} />
                  </div>
                  <StatusChip status={duel.status} label={DUEL_STATUS_LABELS[duel.status]} />
                </div>
                <div className="mt-3 space-y-2">
                  <NoteField id={duel.id} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_resolve_dispute", {
                            p_duel: duel.id,
                            p_resolution: "winner",
                            p_winner: duel.player1_id,
                            ...(note(duel.id) ? { p_note: note(duel.id)! } : {}),
                          }),
                        )
                      }
                    >
                      {p(duel.player1_id)} gagne
                    </Button>
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_resolve_dispute", {
                            p_duel: duel.id,
                            p_resolution: "winner",
                            p_winner: duel.player2_id,
                            ...(note(duel.id) ? { p_note: note(duel.id)! } : {}),
                          }),
                        )
                      }
                    >
                      {p(duel.player2_id)} gagne
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_resolve_dispute", {
                            p_duel: duel.id,
                            p_resolution: "draw",
                            ...(note(duel.id) ? { p_note: note(duel.id)! } : {}),
                          }),
                        )
                      }
                    >
                      Match nul
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_resolve_dispute", {
                            p_duel: duel.id,
                            p_resolution: "cancel",
                            ...(note(duel.id) ? { p_note: note(duel.id)! } : {}),
                          }),
                        )
                      }
                    >
                      Annuler + rembourser
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() =>
                          supabase.rpc("admin_resolve_dispute", {
                            p_duel: duel.id,
                            p_resolution: "cancel_no_refund",
                            ...(note(duel.id) ? { p_note: note(duel.id)! } : {}),
                          }),
                        )
                      }
                    >
                      Annuler sans remboursement
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState text="Aucun litige en cours." />
          )}
        </TabsContent>

        <TabsContent value="usernames" className="mt-4 space-y-3">
          {d?.usernames.length ? (
            d.usernames.map((r) => (
              <div key={r.id} className="panel p-4 clip-corner">
                <p className="font-display text-base font-bold text-primary">
                  {p(r.user_id)} → {r.new_username}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.reason ?? "Sans motif"} · {dateFr(r.created_at)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NoteField id={r.id} />
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(() =>
                        supabase.rpc("admin_review_username_change", {
                          p_request: r.id,
                          p_approve: true,
                          ...(note(r.id) ? { p_note: note(r.id)! } : {}),
                        }),
                      )
                    }
                  >
                    Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(() =>
                        supabase.rpc("admin_review_username_change", {
                          p_request: r.id,
                          p_approve: false,
                          ...(note(r.id) ? { p_note: note(r.id)! } : {}),
                        }),
                      )
                    }
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState text="Aucune demande de pseudo." />
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-3">
          <Input
            className="max-w-md"
            placeholder="Rechercher un pseudo…"
            value={search}
            maxLength={40}
            onChange={(e) => setSearch(e.target.value)}
          />
          {d?.users.length ? (
            d.users.map((u) => (
              <div key={u.id} className="panel p-4 clip-corner">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-bold text-primary">{u.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.efootball_username} · {u.level} · {u.wins}V/{u.draws}N/{u.losses}D · gains{" "}
                      {fcfa(u.total_earnings)}
                    </p>
                  </div>
                  <StatusChip status={u.is_banned ? "rejected" : "approved"} label={u.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NoteField id={u.id} />
                  <Button
                    size="sm"
                    variant={u.is_banned ? "secondary" : "destructive"}
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(() =>
                        supabase.rpc("admin_ban_user", {
                          p_user: u.id,
                          p_banned: !u.is_banned,
                          ...(note(u.id) ? { p_note: note(u.id)! } : {}),
                        }),
                      )
                    }
                  >
                    {u.is_banned ? "Réactiver" : "Suspendre"}
                  </Button>
                  <Input
                    className="h-9 w-36"
                    type="number"
                    placeholder="Ajustement"
                    value={adjust[u.id] ?? ""}
                    onChange={(e) => setAdjust((s) => ({ ...s, [u.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={act.isPending || !Number(adjust[u.id])}
                    onClick={() =>
                      act.mutate(() =>
                        supabase.rpc("admin_adjust_balance", {
                          p_user: u.id,
                          p_amount: Number(adjust[u.id]),
                          p_note: note(u.id) ?? "Ajustement administrateur",
                        }),
                      )
                    }
                  >
                    Ajuster le solde
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState text="Aucun compte trouvé." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}