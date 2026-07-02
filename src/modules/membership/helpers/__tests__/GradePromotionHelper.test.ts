import { GRADES, nextGrade } from "../GradeMapping.js";

describe("nextGrade", () => {
  it("advances each grade to the next one end-to-end", () => {
    const expected = [
      "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Graduated"
    ];
    const advanced = GRADES.slice(0, -1).map((g) => nextGrade(g));
    expect(advanced).toEqual(expected);
  });

  it("chains PreK all the way to Graduated", () => {
    let g: string | null = "PreK";
    const path: string[] = [g];
    for (let i = 0; i < GRADES.length + 2; i++) {
      g = nextGrade(g);
      if (g === null) break;
      path.push(g);
    }
    expect(path[path.length - 1]).toBe("Graduated");
    expect(path).toEqual(GRADES);
  });

  it("leaves Graduated untouched", () => {
    expect(nextGrade("Graduated")).toBeNull();
  });

  it("leaves null/undefined/empty untouched", () => {
    expect(nextGrade(null)).toBeNull();
    expect(nextGrade(undefined)).toBeNull();
    expect(nextGrade("")).toBeNull();
  });

  it("leaves unrecognized values untouched", () => {
    expect(nextGrade("College")).toBeNull();
  });
});
