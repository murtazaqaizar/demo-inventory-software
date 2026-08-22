// Money is stored everywhere as integer PAISA (1 PKR = 100 paisa) to avoid float drift.

export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

// Format paisa as "Rs 1,234.50" for display / print.
export function formatPKR(paisa: number): string {
  const rupees = paisa / 100;
  return (
    "Rs " +
    rupees.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
