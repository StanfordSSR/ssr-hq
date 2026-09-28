'use client';

import { rolloverAcademicYearAction } from '@/app/dashboard/actions';

export function AcademicYearRolloverButton({
  nextYear,
  available
}: {
  nextYear: string;
  available: boolean;
}) {
  return (
    <form
      action={rolloverAcademicYearAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Start the ${nextYear} academic year? Prior-year records and existing budget plans will be preserved.`
        );
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="confirm_rollover" value="ROLLOVER" />
      <input type="hidden" name="confirm_next_academic_year" value={nextYear} />
      <button className="button" type="submit" disabled={!available}>
        Start {nextYear}
      </button>
    </form>
  );
}
