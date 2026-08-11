import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageTitle, StatCard, StatusChip } from "@/components/skill2cash/ui-bits";
import { BalanceEvolutionChart, WinsLossesChart, PerformanceStats } from "@/components/skill2cash/performance-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-s2c";
import { supabase } from "@/integrations/supabase/client";
import {
  REQUEST_STATUS_LABELS,
  TX_LABELS,
  dateFr,
  errMessage,
  fcfa,
  type Deposit,
  type Transaction,
  type Withdrawal,
} from "@/lib/s2c";

type Method = "Wave" | "MTN";

export const Route = createFileRoute("/_authenticated/portefeuille")({
  head: () => ({
    meta: [
      { title: "Portefeuille — SKILL2CASH" },
      {
        name: "description",
        content: "Recharge ton compte, demande un retrait et suis toutes tes opérations en FCFA.",
      },
      { property: "og:title", content: "Portefeuille — SKILL2CASH" },
      { property: "og:description", content: "Dépôts, retraits et historique des opérations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { user, wallet } = useMe();
  const qc = useQueryClient();
  const [days, setDays] = useState(30);

  const [dep, setDep] = useState({
    amount: "5000",
    method: "Wave" as Method,
    sender_name: "",
    sender_phone: "",
    reference: "",
  });
  const [wit, setWit] = useState({ amount: "1000", method: "Wave" as Method, phone: "" });

  const history = useQuery({
    queryKey: ["wallet-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [txs, deposits, withdrawals] = await Promise.all([
        supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(60),
        supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      return {
        txs: (txs.data ?? []) as Transaction[],
        deposits: (deposits.data ?? []) as Deposit[],
        withdrawals: (withdrawals.data ?? []) as Withdrawal[],
      };
    },
  });

  const deposit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_deposit", {
        p_amount: Number(dep.amount),
        p_method: dep.method,
        p_sender_name: dep.sender_name.trim().slice(0, 100),
        p_sender_phone: dep.sender_phone.trim().slice(0, 30),
        p_reference: dep.reference.trim().slice(0, 100),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dépôt soumis. Validation sous 24 h.");
      setDep((s) => ({ ...s, reference: "" }));
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_withdrawal", {
        p_amount: Number(wit.amount),
        p_method: wit.method,
        p_phone: wit.phone.trim().slice(0, 30),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande de retrait envoyée.");
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const depositValid =
    Number(dep.amount) >= 500 &&
    dep.sender_name.trim().length > 1 &&
    dep.sender_phone.trim().length > 5 &&
    dep.reference.trim().length > 3;

  return (
    <div>
      <PageTitle title="Portefeuille" subtitle="Recharge, retire et suis chaque mouvement." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Solde disponible" value={fcfa(wallet?.balance_available)} tone="accent" />
        <StatCard label="Fonds bloqués" value={fcfa(wallet?.balance_locked)} tone="neon" />
        <StatCard label="Total déposé" value={fcfa(wallet?.total_deposited)} />
        <StatCard label="Total retiré" value={fcfa(wallet?.total_withdrawn)} />
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-bold tracking-widest uppercase">Performance</h2>
          <Select value={days.toString()} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PerformanceStats days={days} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5 clip-corner">
          <h2 className="font-display text-sm font-bold tracking-widest uppercase mb-4">Évolution du solde</h2>
          <BalanceEvolutionChart days={days} />
        </section>

        <section className="panel p-5 clip-corner">
          <h2 className="font-display text-sm font-bold tracking-widest uppercase mb-4">Gains vs Pertes</h2>
          <WinsLossesChart days={days} />
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5 clip-corner">
          <h2 className="font-display text-sm font-bold tracking-widest uppercase">Recharger</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Envoie l'argent par Wave ou MTN Money, puis déclare la transaction ici. Un
            administrateur valide sous 24 h.
          </p>
          <div className="mt-3 border border-primary/40 bg-primary/10 p-3">
            <p className="font-display text-xs font-bold tracking-widest uppercase text-primary">
              Numéro de dépôt officiel
            </p>
            <p className="mt-1 font-mono text-base font-bold text-foreground">+225 01 00 15 05 93</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Wave ou MTN Money. N'envoie jamais d'argent à un autre numéro : tout dépôt fait
              ailleurs est définitivement perdu.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Montant (FCFA)</Label>
              <Input
                type="number"
                min={500}
                step={500}
                value={dep.amount}
                onChange={(e) => setDep((s) => ({ ...s, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Moyen de paiement</Label>
              <Select
                value={dep.method}
                onValueChange={(v) => setDep((s) => ({ ...s, method: v as Method }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wave">Wave</SelectItem>
                  <SelectItem value="MTN">MTN Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nom de l'expéditeur</Label>
              <Input
                maxLength={100}
                value={dep.sender_name}
                onChange={(e) => setDep((s) => ({ ...s, sender_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Téléphone de l'expéditeur</Label>
              <Input
                maxLength={30}
                value={dep.sender_phone}
                onChange={(e) => setDep((s) => ({ ...s, sender_phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>Référence de la transaction</Label>
              <Input
                maxLength={100}
                value={dep.reference}
                onChange={(e) => setDep((s) => ({ ...s, reference: e.target.value }))}
                placeholder="Ex : TX123456789"
              />
            </div>
            <Button
              className="w-full"
              disabled={deposit.isPending || !depositValid}
              onClick={() => deposit.mutate()}
            >
              Déclarer mon dépôt
            </Button>
          </div>
        </section>

        <section className="panel p-5 clip-corner">
          <h2 className="font-display text-sm font-bold tracking-widest uppercase">Retirer</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum 1 000 FCFA. Le montant est bloqué jusqu'à validation, une seule demande à la
            fois.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Montant (FCFA)</Label>
              <Input
                type="number"
                min={1000}
                step={500}
                value={wit.amount}
                onChange={(e) => setWit((s) => ({ ...s, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Moyen de réception</Label>
              <Select
                value={wit.method}
                onValueChange={(v) => setWit((s) => ({ ...s, method: v as Method }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wave">Wave</SelectItem>
                  <SelectItem value="MTN">MTN Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Numéro à créditer</Label>
              <Input
                maxLength={30}
                value={wit.phone}
                onChange={(e) => setWit((s) => ({ ...s, phone: e.target.value }))}
              />
            </div>
            <Button
              className="w-full"
              variant="secondary"
              disabled={
                withdraw.isPending || Number(wit.amount) < 1000 || wit.phone.trim().length < 6
              }
              onClick={() => withdraw.mutate()}
            >
              Demander le retrait
            </Button>
          </div>
        </section>
      </div>

      <section className="mt-8">
        <Tabs defaultValue="txs">
          <TabsList>
            <TabsTrigger value="txs">Opérations</TabsTrigger>
            <TabsTrigger value="deposits">Dépôts</TabsTrigger>
            <TabsTrigger value="withdrawals">Retraits</TabsTrigger>
          </TabsList>

          <TabsContent value="txs" className="mt-4">
            {history.data?.txs.length ? (
              <div className="panel divide-y divide-border/50 clip-corner">
                {history.data.txs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{TX_LABELS[t.type] ?? t.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.description ?? "—"} · {dateFr(t.created_at)}
                      </p>
                    </div>
                    <p className="font-display text-sm font-bold">{fcfa(t.amount)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Aucune opération." />
            )}
          </TabsContent>

          <TabsContent value="deposits" className="mt-4">
            {history.data?.deposits.length ? (
              <div className="panel divide-y divide-border/50 clip-corner">
                {history.data.deposits.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {fcfa(d.amount)} · {d.method}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Réf. {d.reference} · {dateFr(d.created_at)}
                        {d.admin_note ? ` · ${d.admin_note}` : ""}
                      </p>
                    </div>
                    <StatusChip status={d.status} label={REQUEST_STATUS_LABELS[d.status]} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Aucun dépôt déclaré." />
            )}
          </TabsContent>

          <TabsContent value="withdrawals" className="mt-4">
            {history.data?.withdrawals.length ? (
              <div className="panel divide-y divide-border/50 clip-corner">
                {history.data.withdrawals.map((w) => (
                  <div key={w.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {fcfa(w.amount)} · {w.method}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vers {w.phone_number} · {dateFr(w.created_at)}
                        {w.admin_note ? ` · ${w.admin_note}` : ""}
                      </p>
                    </div>
                    <StatusChip status={w.status} label={REQUEST_STATUS_LABELS[w.status]} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Aucun retrait demandé." />
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}