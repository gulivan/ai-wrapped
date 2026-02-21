interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = ({ title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-10 text-center">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
      {description ? <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
};

export default EmptyState;
