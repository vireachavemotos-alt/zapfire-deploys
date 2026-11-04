"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dailyStats } from "@/lib/mocks";

export function DispatchChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={dailyStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF0033" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#FF0033" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="neonFill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF1744" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#FF1744" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,0,51,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="dia"
          stroke="#71717a"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          stroke="#71717a"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(10,0,0,0.9)",
            border: "1px solid rgba(255,0,51,0.5)",
            borderRadius: 12,
            boxShadow: "0 0 20px rgba(255,0,51,0.4)",
            fontSize: 12,
          }}
          labelStyle={{ color: "#FF0033", fontWeight: 600 }}
          itemStyle={{ color: "#f4f4f5" }}
        />
        <Area
          type="monotone"
          dataKey="enviadas"
          stroke="#FF0033"
          strokeWidth={2.5}
          fill="url(#neonFill)"
          name="Enviadas"
          activeDot={{
            r: 6,
            stroke: "#FF0033",
            strokeWidth: 2,
            fill: "#fff",
          }}
        />
        <Area
          type="monotone"
          dataKey="entregues"
          stroke="#FF1744"
          strokeWidth={2}
          fill="url(#neonFill2)"
          strokeDasharray="4 4"
          name="Entregues"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
