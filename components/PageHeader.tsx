import { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-premium leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] md:text-sm text-zinc-500 mt-1.5 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
