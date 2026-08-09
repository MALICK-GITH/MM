import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-s2c";
import { fcfa } from "@/lib/s2c";

type BalanceData = {
  date: string;
  balance: number;
  transactions_count: number;
};

type WinsLossesData = {
  period: string;
  wins: number;
  losses: number;
  net_result: number;
};

type TransactionDistribution = {
  transaction_type: string;
  total_amount: number;
  count: number;
};

type PerformanceStats = {
  total_wins: number;
  total_losses: number;
  net_profit: number;
  win_rate: number;
  max_win: number;
  max_loss: number;
  avg_daily_profit: number;
};

export function BalanceEvolutionChart({ days = 30 }: { days?: number }) {
  const { user } = useMe();

  const { data, isLoading } = useQuery({
    queryKey: ["balance-evolution", user?.id, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_balance_evolution", {
        user_id_param: user?.id,
        days_back: days,
      });
      if (error) throw error;
      return (data ?? []) as BalanceData[];
    },
    enabled: !!user,
  });

  if (isLoading) return <div className="h-64 animate-pulse bg-muted/20 rounded-lg" />;
  if (!data || data.length === 0) return <div className="h-64 flex items-center justify-center text-muted-foreground">Aucune donnée disponible</div>;

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data}>
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis 
          tick={{ fontSize: 12 }}
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
        <Line 
          type="monotone" 
          dataKey="balance" 
          stroke="hsl(var(--primary))" 
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WinsLossesChart({ days = 30 }: { days?: number }) {
  const { user } = useMe();

  const { data, isLoading } = useQuery({
    queryKey: ["wins-losses", user?.id, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_wins_losses", {
        user_id_param: user?.id,
        days_back: days,
      });
      if (error) throw error;
      return (data ?? []) as WinsLossesData[];
    },
    enabled: !!user,
  });

  if (isLoading) return <div className="h-64 animate-pulse bg-muted/20 rounded-lg" />;
  if (!data || data.length === 0) return <div className="h-64 flex items-center justify-center text-muted-foreground">Aucune donnée disponible</div>;

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data}>
        <XAxis 
          dataKey="period" 
          tick={{ fontSize: 12 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis 
          tick={{ fontSize: 12 }}
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
        <Line 
          type="monotone" 
          dataKey="wins" 
          stroke="hsl(var(--accent))" 
          strokeWidth={2}
          name="Gains"
          dot={false}
        />
        <Line 
          type="monotone" 
          dataKey="losses" 
          stroke="hsl(var(--destructive))" 
          strokeWidth={2}
          name="Pertes"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PerformanceStats({ days = 30 }: { days?: number }) {
  const { user } = useMe();

  const { data, isLoading } = useQuery({
    queryKey: ["performance-stats", user?.id, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_performance_stats", {
        user_id_param: user?.id,
        days_back: days,
      });
      if (error) throw error;
      return data as PerformanceStats;
    },
    enabled: !!user,
  });

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="h-20 animate-pulse bg-muted/20 rounded-lg" />
    ))}
  </div>;

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="panel p-4 clip-corner">
        <p className="text-xs text-muted-foreground">Gains totaux</p>
        <p className="text-lg font-bold text-accent">{fcfa(data.total_wins)}</p>
      </div>
      <div className="panel p-4 clip-corner">
        <p className="text-xs text-muted-foreground">Pertes totales</p>
        <p className="text-lg font-bold text-destructive">{fcfa(data.total_losses)}</p>
      </div>
      <div className="panel p-4 clip-corner">
        <p className="text-xs text-muted-foreground">Profit net</p>
        <p className={`text-lg font-bold ${data.net_profit >= 0 ? 'text-accent' : 'text-destructive'}`}>
          {fcfa(data.net_profit)}
        </p>
      </div>
      <div className="panel p-4 clip-corner">
        <p className="text-xs text-muted-foreground">Taux de victoire</p>
        <p className="text-lg font-bold text-primary">{data.win_rate}%</p>
      </div>
      <div className="panel p-4 clip-corner">
        <p className="text-xs text-muted-foreground">Gain max</p>
        <p className="text-lg font-bold text-accent">{fcfa(data.max_win)}</p>
      </div>
      <div className="panel p-4 clip-corner">
        <p className="text-xs text-muted-foreground">Perte max</p>
        <p className="text-lg font-bold text-destructive">{fcfa(data.max_loss)}</p>
      </div>
      <div className="panel p-4 clip-corner col-span-2">
        <p className="text-xs text-muted-foreground">Moyenne journalière</p>
        <p className={`text-lg font-bold ${data.avg_daily_profit >= 0 ? 'text-accent' : 'text-destructive'}`}>
          {fcfa(data.avg_daily_profit)}/jour
        </p>
      </div>
    </div>
  );
}
