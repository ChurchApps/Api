export const GRADES = [
  "PreK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Graduated"
];

// Pure mapping (unit-testable, no DB imports): each grade advances to the next;
// "Graduated", null, and any unrecognized value stay put.
export function nextGrade(grade: string | null | undefined): string | null {
  if (!grade) return null;
  const idx = GRADES.indexOf(grade);
  if (idx === -1 || idx >= GRADES.length - 1) return null;
  return GRADES[idx + 1];
}
