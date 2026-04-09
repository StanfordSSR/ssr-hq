'use client';

type AutoSubmitFiltersProps = {
  children: React.ReactNode;
  className?: string;
};

export function AutoSubmitFilters({ children, className }: AutoSubmitFiltersProps) {
  return (
    <form
      method="get"
      className={className}
      onChange={(event) => {
        const target = event.target as EventTarget | null;
        const formTarget =
          target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target : null;
        formTarget?.form?.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
