import { describe, it, expect } from "vitest";
import { normalizeContract } from "../dist/contracts.js";

describe("normalizeContract", () => {
  it("strips @version from contract name and normalizes case to expected", () => {
    const out = normalizeContract(
      { contract: "triageresult@1.0", version: "1.0" },
      "TriageResult"
    );
    expect(out.contract).toBe("TriageResult");
  });

  it("fills missing contract with expected name", () => {
    const out = normalizeContract({}, "TriageResult");
    expect(out.contract).toBe("TriageResult");
  });

  it("coerces numeric and missing version to '1.0'", () => {
    expect(normalizeContract({ version: 1 }, "X").version).toBe("1.0");
    expect(normalizeContract({}, "X").version).toBe("1.0");
    expect(normalizeContract({ version: "2.0" }, "X").version).toBe("2.0");
  });

  it("injects issue_id when missing and truncates to integer", () => {
    expect(normalizeContract({}, "X", 42).issue_id).toBe(42);
    expect(normalizeContract({ issue_id: "7" }, "X").issue_id).toBe(7);
    expect(normalizeContract({ issue_id: 3.9 }, "X").issue_id).toBe(3);
  });

  it("does not overwrite an existing issue_id", () => {
    expect(normalizeContract({ issue_id: 5 }, "X", 42).issue_id).toBe(5);
  });

  it("derives classification from `type` and lowercases it", () => {
    const out = normalizeContract({ type: "Feature" }, "TriageResult");
    expect(out.classification).toBe("feature");
  });

  it("normalizes complexity labels to S/M/L/XL", () => {
    expect(normalizeContract({ complexity: "small" }, "X").complexity).toBe("S");
    expect(normalizeContract({ complexity: "Medium" }, "X").complexity).toBe("M");
    expect(normalizeContract({ complexity: "xl" }, "X").complexity).toBe("XL");
    expect(normalizeContract({ complexity: "m" }, "X").complexity).toBe("M");
  });
});
