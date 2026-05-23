import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialContext } from "../core/context.ts";
import { CodeChangePlanExecutionRunner } from "../core/repair/CodeChangePlanExecutionExecutor.ts";
import { CodeChangePlanDryRunExecutor, CodeChangePlanDryRunRunner } from "../core/repair/CodeChangePlanDryRunExecutor.ts";
import { CodeChangePlanExecutionApprovalExecutor, CodeChangePlanExecutionApprovalGate } from "../core/repair/CodeChangePlanExecutionApprovalExecutor.ts";
import { hashCodeChangePlan } from "../core/repair/CodeChangePlanHasher.ts";
import { HumanApprovalExecutor } from "../core/repair/HumanApprovalExecutor.ts";
import { HumanApprovalRequestBuilder, RepairPlanBuilder } from "../core/repair/RepairPlanBuilder.ts";
import { RepairPlanMaterializer } from "../core/repair/RepairPlanMaterializer.ts";
import { RepairPlanMaterializerExecutor } from "../core/repair/RepairPlanMaterializerExecutor.ts";
import { SchemaValidator } from "../core/SchemaValidator.ts";
import type { WorkflowContext } from "../core/types.ts";

describe("RepairPlanBuilder", () => {
  it("builds a scoped repair plan from failed verification evidence", () => {
    const plan = new RepairPlanBuilder().build(failedContext());

    assert.equal(plan.requiresHumanApproval, true);
    assert.ok(plan.basedOnFailureCodes.includes("test_failed"));
    assert.deepEqual(plan.targetFiles, ["src/generated.txt"]);
    assert.ok(plan.forbiddenFiles.includes(".env"));
    assert.ok(plan.proposedOperations.some((operation) => operation.type === "modify_file"));
    assert.ok(plan.proposedOperations.some((operation) => operation.type === "run_test"));
    assert.ok(!plan.proposedOperations.some((operation) => operation.type === "delete_file" as never));
    assert.equal(SchemaValidator.validate("ScopedRepairPlan", plan), plan);
  });

  it("marks unsafe or blocked repairs as high risk", () => {
    const context = failedContext();
    context.verification!.failureCodes = ["operation_blocked", "unsafe_file_touched"];
    context.verification!.evidence = {
      filesChanged: [".env"],
      safetyFindings: [".env"],
      filesDeleted: [],
      failedCommands: ["npm run test"],
    };

    const plan = new RepairPlanBuilder().build(context);

    assert.equal(plan.riskLevel, "high");
    assert.ok(!plan.targetFiles.includes(".env"));
    assert.ok(plan.forbiddenFiles.includes(".env"));
  });

  it("refuses to build when verification is missing or passed", () => {
    const context = failedContext();
    context.verification = { ...context.verification!, pass: true };

    assert.throws(() => new RepairPlanBuilder().build(context), /failed VerificationReport/);
  });
});

describe("RepairPlanMaterializer", () => {
  it("materializes an approved repair plan into a non-executable CodeChangePlan", () => {
    const context = approvedContext();
    const plan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));

    assert.equal(plan.status, "materialized");
    assert.equal(plan.executable, false);
    assert.equal(plan.requiresExplicitExecutionApproval, true);
    assert.equal(plan.repairPlanId, context.scopedRepairPlan?.planId);
    assert.equal(plan.approvalId, context.repairApprovalRecord?.approvalId);
    assert.ok(plan.operations.some((operation) => operation.type === "modify_file"));
    assert.ok(!plan.operations.some((operation) => operation.type === "delete_file" as never));
    assert.deepEqual(plan.blockedOperations, []);
    assert.equal(SchemaValidator.validate("CodeChangePlan", plan), plan);
  });

  it("refuses pending, rejected, expired, and mismatched approvals", () => {
    for (const status of ["pending", "rejected", "consumed"] as const) {
      const context = approvedContext();
      context.repairApprovalRecord = { ...context.repairApprovalRecord!, status };
      assert.throws(() => new RepairPlanMaterializer().materialize(context), /must be approved/);
    }

    const expired = approvedContext();
    expired.repairApprovalRecord!.expiresAt = "2020-01-01T00:00:00.000Z";
    assert.throws(() => new RepairPlanMaterializer().materialize(expired), /expired/);

    const mismatched = approvedContext();
    mismatched.repairApprovalRecord!.repairPlanId = "repair_other";
    assert.throws(() => new RepairPlanMaterializer().materialize(mismatched), /does not match/);
  });

  it("refuses scope expansion, forbidden files, delete operations, and high-risk commands", () => {
    const outsideTarget = approvedContext();
    outsideTarget.scopedRepairPlan!.proposedOperations[1] = {
      ...outsideTarget.scopedRepairPlan!.proposedOperations[1],
      targetFile: "src/other.txt",
    };
    assert.throws(() => new RepairPlanMaterializer().materialize(outsideTarget), /outside scoped targetFiles/);

    const forbidden = approvedContext();
    forbidden.scopedRepairPlan!.proposedOperations[1] = {
      ...forbidden.scopedRepairPlan!.proposedOperations[1],
      targetFile: ".env",
    };
    forbidden.scopedRepairPlan!.targetFiles = [".env"];
    assert.throws(() => new RepairPlanMaterializer().materialize(forbidden), /forbidden or sensitive/);

    const deleting = approvedContext();
    deleting.scopedRepairPlan!.proposedOperations.push({
      id: "delete",
      type: "delete_file" as never,
      targetFile: "src/generated.txt",
      description: "delete",
      reason: "unsafe",
      safetyConstraints: [],
    });
    assert.throws(() => new RepairPlanMaterializer().materialize(deleting), /delete_file is not supported/);

    const riskyCommand = approvedContext();
    riskyCommand.scopedRepairPlan!.testCommands = ["rm -rf src"];
    riskyCommand.scopedRepairPlan!.proposedOperations.push({
      id: "risky_command",
      type: "run_test",
      command: "rm -rf src",
      description: "risky command",
      reason: "unsafe",
      safetyConstraints: [],
    });
    assert.throws(() => new RepairPlanMaterializer().materialize(riskyCommand), /high risk/);
  });

  it("RepairPlanMaterializerExecutor returns a CodeChangePlan without executing repair", async () => {
    const context = approvedContext();
    const output = await new RepairPlanMaterializerExecutor().execute({
      id: "repairPlanMaterializer",
      type: "materialize",
      role: "RepairPlanMaterializer",
      description: "materialize",
      inputKeys: ["scopedRepairPlan", "repairApprovalRecord"],
      outputKey: "codeChangePlan",
      outputSchema: "CodeChangePlan",
    }, context);

    const plan = SchemaValidator.validate("CodeChangePlan", output) as typeof context.codeChangePlan;
    assert.equal(plan?.executable, false);
    assert.equal(plan?.requiresExplicitExecutionApproval, true);
  });
});

describe("CodeChangePlanExecutionApprovalGate", () => {
  it("hashes stable CodeChangePlan content while ignoring volatile metadata", () => {
    const context = approvedContext();
    const codeChangePlan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));
    const hash = hashCodeChangePlan(codeChangePlan);

    assert.equal(hashCodeChangePlan({ ...codeChangePlan, createdAt: "2026-05-23T10:00:00.000Z" }), hash);
    assert.equal(hashCodeChangePlan({ ...codeChangePlan, approvalId: "approval_changed" }), hash);
    assert.notEqual(
      hashCodeChangePlan({
        ...codeChangePlan,
        operations: [{ ...codeChangePlan.operations[0], description: "changed" }, ...codeChangePlan.operations.slice(1)],
      }),
      hash,
    );
    assert.notEqual(hashCodeChangePlan({ ...codeChangePlan, targetFiles: ["src/other.txt"] }), hash);
    assert.notEqual(hashCodeChangePlan({ ...codeChangePlan, executable: true as false }), hash);
    assert.notEqual(hashCodeChangePlan({ ...codeChangePlan, requiresExplicitExecutionApproval: false }), hash);
  });

  it("creates a pending execution approval request bound to the CodeChangePlan hash", () => {
    const context = approvedContext();
    const codeChangePlan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));
    const request = new CodeChangePlanExecutionApprovalGate().build(codeChangePlan, new Date("2026-05-23T00:02:00.000Z"));

    assert.equal(request.status, "pending");
    assert.equal(request.requestedAction, "approve_code_change_plan_execution");
    assert.equal(request.blockedUntilApproved, true);
    assert.equal(request.requiresExplicitExecutionApproval, true);
    assert.equal(request.codeChangePlanId, codeChangePlan.planId);
    assert.equal(request.codeChangePlanHash, hashCodeChangePlan(codeChangePlan));
    assert.equal(request.operationsCount, codeChangePlan.operations.length);
    assert.equal(SchemaValidator.validate("CodeChangePlanExecutionApprovalRequest", request), request);
  });

  it("CodeChangePlanExecutionApprovalExecutor returns pending request without executing CodeExecutor", async () => {
    const context = approvedContext();
    context.codeChangePlan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));

    const request = await new CodeChangePlanExecutionApprovalExecutor().execute({
      id: "codeChangePlanExecutionApprovalGate",
      type: "executionApproval",
      role: "CodeChangePlanExecutionApprovalGate",
      description: "request execution approval",
      inputKeys: ["codeChangePlan"],
      outputKey: "codeChangePlanExecutionApprovalRequest",
      outputSchema: "CodeChangePlanExecutionApprovalRequest",
    }, context);

    const approval = SchemaValidator.validate("CodeChangePlanExecutionApprovalRequest", request) as typeof context.codeChangePlanExecutionApprovalRequest;
    assert.equal(approval?.status, "pending");
    assert.equal(approval?.blockedUntilApproved, true);
    assert.equal(context.codeExecutionResult, null);
  });

  it("refuses missing, executable, non-explicit, blocked, delete, empty, sensitive, unscoped, or risky inputs", async () => {
    const context = approvedContext();
    const codeChangePlan = new RepairPlanMaterializer().materialize(context);

    await assert.rejects(
      () => new CodeChangePlanExecutionApprovalExecutor().execute({
        id: "codeChangePlanExecutionApprovalGate",
        type: "executionApproval",
        role: "CodeChangePlanExecutionApprovalGate",
        description: "request execution approval",
        inputKeys: ["codeChangePlan"],
        outputKey: "codeChangePlanExecutionApprovalRequest",
        outputSchema: "CodeChangePlanExecutionApprovalRequest",
      }, context),
      /requires codeChangePlan/,
    );

    assert.throws(() => new CodeChangePlanExecutionApprovalGate().build({ ...codeChangePlan, executable: true }), /non-executable/);
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({ ...codeChangePlan, requiresExplicitExecutionApproval: false }),
      /requiresExplicitExecutionApproval/,
    );
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({ ...codeChangePlan, blockedOperations: ["blocked"] }),
      /blocked operations/,
    );
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({
        ...codeChangePlan,
        operations: [{ ...codeChangePlan.operations[0], type: "delete_file" as never }],
      }),
      /delete_file/,
    );
    assert.throws(() => new CodeChangePlanExecutionApprovalGate().build({ ...codeChangePlan, operations: [] }), /at least one operation/);
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({
        ...codeChangePlan,
        targetFiles: [".env"],
        operations: [{ ...codeChangePlan.operations[0], targetFile: ".env" }],
      }),
      /forbidden or sensitive/,
    );
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({
        ...codeChangePlan,
        operations: [{ ...codeChangePlan.operations[0], targetFile: "src/other.txt" }],
      }),
      /outside targetFiles/,
    );
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({
        ...codeChangePlan,
        operations: [{ ...codeChangePlan.operations[0], type: "run_test", command: "npm run lint" }],
      }),
      /outside testCommands/,
    );
    assert.throws(
      () => new CodeChangePlanExecutionApprovalGate().build({
        ...codeChangePlan,
        testCommands: ["rm -rf src"],
        operations: [{ ...codeChangePlan.operations[0], type: "run_test", command: "rm -rf src" }],
      }),
      /high risk/,
    );
  });
});

describe("CodeChangePlanDryRunRunner", () => {
  it("creates a dry-run execution plan for an approved execution approval without consuming it", () => {
    const context = approvedExecutionContext();
    const dryRun = new CodeChangePlanDryRunRunner().build(
      context.codeChangePlan!,
      context.codeChangePlanExecutionApprovalRecord!,
      new Date("2026-05-23T00:03:00.000Z"),
    );

    assert.equal(dryRun.status, "planned");
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.approvalStatus, "approved");
    assert.equal(dryRun.hashMatched, true);
    assert.equal(dryRun.codeChangePlanId, context.codeChangePlan?.planId);
    assert.equal(dryRun.codeChangePlanHash, context.codeChangePlanExecutionApprovalRecord?.codeChangePlanHash);
    assert.equal(dryRun.approvalId, context.codeChangePlanExecutionApprovalRecord?.approvalId);
    assert.deepEqual(dryRun.expectedFilesChanged, context.codeChangePlan?.targetFiles);
    assert.equal(dryRun.wouldWriteFiles, false);
    assert.equal(dryRun.wouldRunCommands, false);
    assert.equal(dryRun.wouldRunTests, false);
    assert.equal(dryRun.wouldCallCodeExecutor, false);
    assert.equal(dryRun.consumesApproval, false);
    assert.equal(dryRun.requiresExecuteFlag, true);
    assert.equal(context.codeChangePlanExecutionApprovalRecord?.status, "approved");
    assert.equal(SchemaValidator.validate("CodeChangePlanDryRunExecutionPlan", dryRun), dryRun);
  });

  it("CodeChangePlanDryRunExecutor returns a dry-run plan without execution", async () => {
    const context = approvedExecutionContext();
    const output = await new CodeChangePlanDryRunExecutor().execute({
      id: "codeChangePlanDryRunRunner",
      type: "executionDryRun",
      role: "CodeChangePlanDryRunRunner",
      description: "dry_run",
      inputKeys: ["codeChangePlan", "codeChangePlanExecutionApprovalRecord"],
      outputKey: "codeChangePlanDryRunExecutionPlan",
      outputSchema: "CodeChangePlanDryRunExecutionPlan",
    }, context);

    const dryRun = SchemaValidator.validate("CodeChangePlanDryRunExecutionPlan", output) as typeof context.codeChangePlanDryRunExecutionPlan;
    assert.equal(dryRun?.wouldCallCodeExecutor, false);
    assert.equal(context.codeExecutionResult, null);
    assert.equal(context.codeChangePlanExecutionApprovalRecord?.status, "approved");
  });

  it("refuses missing, pending, rejected, expired, consumed, mismatched, or unsafe dry-run inputs", async () => {
    const context = approvedExecutionContext();

    await assert.rejects(
      () => new CodeChangePlanDryRunExecutor().execute({
        id: "codeChangePlanDryRunRunner",
        type: "executionDryRun",
        role: "CodeChangePlanDryRunRunner",
        description: "dry_run",
        inputKeys: ["codeChangePlan"],
        outputKey: "codeChangePlanDryRunExecutionPlan",
        outputSchema: "CodeChangePlanDryRunExecutionPlan",
      }, contextWithoutExecutionApprovalRecord()),
      /requires codeChangePlanExecutionApprovalRecord/,
    );

    for (const status of ["pending", "rejected", "consumed"] as const) {
      assert.throws(
        () => new CodeChangePlanDryRunRunner().build(context.codeChangePlan!, {
          ...context.codeChangePlanExecutionApprovalRecord!,
          status,
        }),
        /must be approved/,
      );
    }

    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(context.codeChangePlan!, {
        ...context.codeChangePlanExecutionApprovalRecord!,
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
      /expired/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(context.codeChangePlan!, {
        ...context.codeChangePlanExecutionApprovalRecord!,
        codeChangePlanId: "code_change_other",
      }),
      /codeChangePlanId does not match/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(context.codeChangePlan!, {
        ...context.codeChangePlanExecutionApprovalRecord!,
        codeChangePlanHash: "sha256:mismatch",
      }),
      /hash mismatch/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(
        { ...context.codeChangePlan!, operations: [] },
        { ...context.codeChangePlanExecutionApprovalRecord!, codeChangePlanHash: hashCodeChangePlan({ ...context.codeChangePlan!, operations: [] }) },
      ),
      /at least one operation/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(
        { ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], type: "delete_file" as never }] },
        context.codeChangePlanExecutionApprovalRecord!,
      ),
      /delete_file/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(
        { ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], targetFile: ".env" }], targetFiles: [".env"] },
        { ...context.codeChangePlanExecutionApprovalRecord!, codeChangePlanHash: hashCodeChangePlan({ ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], targetFile: ".env" }], targetFiles: [".env"] }) },
      ),
      /forbidden or sensitive/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(
        { ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], targetFile: "src/other.txt" }] },
        { ...context.codeChangePlanExecutionApprovalRecord!, codeChangePlanHash: hashCodeChangePlan({ ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], targetFile: "src/other.txt" }] }) },
      ),
      /outside targetFiles/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(
        { ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], type: "run_test", command: "rm -rf src" }], testCommands: ["rm -rf src"] },
        { ...context.codeChangePlanExecutionApprovalRecord!, codeChangePlanHash: hashCodeChangePlan({ ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], type: "run_test", command: "rm -rf src" }], testCommands: ["rm -rf src"] }) },
      ),
      /high risk/,
    );
    assert.throws(
      () => new CodeChangePlanDryRunRunner().build(
        { ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], type: "run_test", command: "npm run lint" }] },
        { ...context.codeChangePlanExecutionApprovalRecord!, codeChangePlanHash: hashCodeChangePlan({ ...context.codeChangePlan!, operations: [{ ...context.codeChangePlan!.operations[0], type: "run_test", command: "npm run lint" }] }) },
      ),
      /outside testCommands/,
    );
  });
});

describe("CodeChangePlanExecutionRunner safety gates", () => {
  it("blocks non-approved, consumed, mismatched, missing content, delete, or unsafe execution inputs without consuming approval", async () => {
    const runner = new CodeChangePlanExecutionRunner();
    for (const status of ["pending", "rejected", "consumed"] as const) {
      const context = executableExecutionContext();
      context.codeChangePlanExecutionApprovalRecord!.status = status;
      const record = await runner.executeApprovedPlan(context, { now: new Date("2026-05-23T00:03:00.000Z") });
      assert.equal(record.status, "blocked");
      assert.equal(record.consumedApproval, false);
      assert.equal(context.codeChangePlanExecutionApprovalRecord!.status, status);
    }

    const expired = executableExecutionContext();
    expired.codeChangePlanExecutionApprovalRecord!.expiresAt = "2020-01-01T00:00:00.000Z";
    assert.equal((await runner.executeApprovedPlan(expired)).status, "blocked");

    const mismatch = executableExecutionContext();
    mismatch.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = "sha256:mismatch";
    assert.equal((await runner.executeApprovedPlan(mismatch)).status, "blocked");

    const missingContent = executableExecutionContext();
    delete missingContent.codeChangePlan!.operations[0].content;
    missingContent.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = hashCodeChangePlan(missingContent.codeChangePlan!);
    assert.match((await runner.executeApprovedPlan(missingContent)).blockedReasons.join("; "), /requires explicit content/);

    const deletion = executableExecutionContext();
    deletion.codeChangePlan!.operations[0].type = "delete_file" as never;
    deletion.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = hashCodeChangePlan(deletion.codeChangePlan!);
    assert.match((await runner.executeApprovedPlan(deletion)).blockedReasons.join("; "), /delete_file/);

    const sensitive = executableExecutionContext();
    sensitive.codeChangePlan!.operations[0].targetFile = ".env";
    sensitive.codeChangePlan!.targetFiles = [".env"];
    sensitive.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = hashCodeChangePlan(sensitive.codeChangePlan!);
    assert.match((await runner.executeApprovedPlan(sensitive)).blockedReasons.join("; "), /forbidden or sensitive/);

    const outsideScope = executableExecutionContext();
    outsideScope.codeChangePlan!.operations[0].targetFile = "src/other.txt";
    outsideScope.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = hashCodeChangePlan(outsideScope.codeChangePlan!);
    assert.match((await runner.executeApprovedPlan(outsideScope)).blockedReasons.join("; "), /outside targetFiles/);

    const highRisk = executableExecutionContext();
    highRisk.codeChangePlan!.operations[1].command = "rm -rf src";
    highRisk.codeChangePlan!.testCommands = ["rm -rf src"];
    highRisk.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = hashCodeChangePlan(highRisk.codeChangePlan!);
    assert.match((await runner.executeApprovedPlan(highRisk)).blockedReasons.join("; "), /high risk/);

    const commandOutsideAllowlist = executableExecutionContext();
    commandOutsideAllowlist.codeChangePlan!.operations[1].command = "npm run lint";
    commandOutsideAllowlist.codeChangePlanExecutionApprovalRecord!.codeChangePlanHash = hashCodeChangePlan(commandOutsideAllowlist.codeChangePlan!);
    assert.match((await runner.executeApprovedPlan(commandOutsideAllowlist)).blockedReasons.join("; "), /outside testCommands/);
  });
});

describe("HumanApprovalRequestBuilder", () => {
  it("creates a pending approval request without executing repair", () => {
    const plan = new RepairPlanBuilder().build(failedContext());
    const request = new HumanApprovalRequestBuilder().build(plan, new Date("2026-05-23T00:00:00.000Z"));

    assert.equal(request.status, "pending");
    assert.equal(request.repairPlanId, plan.planId);
    assert.equal(request.blockedUntilApproved, true);
    assert.equal(request.requestedAction, "approve_scoped_repair_plan");
    assert.equal(SchemaValidator.validate("HumanApprovalRequest", request), request);
  });

  it("HumanApprovalExecutor returns pending approval and does not approve or execute repair", async () => {
    const context = failedContext();
    context.scopedRepairPlan = new RepairPlanBuilder().build(context);

    const request = await new HumanApprovalExecutor().execute({
      id: "humanApprovalGate",
      type: "approval",
      role: "HumanApprovalGate",
      description: "approval",
      inputKeys: ["scopedRepairPlan"],
      outputKey: "humanApprovalRequest",
      outputSchema: "HumanApprovalRequest",
    }, context);

    const approval = SchemaValidator.validate("HumanApprovalRequest", request) as typeof context.humanApprovalRequest;
    assert.equal(approval?.status, "pending");
    assert.equal(approval?.blockedUntilApproved, true);
    assert.equal(approval?.requestedAction, "approve_scoped_repair_plan");
  });
});

function failedContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "repair-test",
    userGoal: "repair failed execution",
    successCriteria: ["Fixture test command passes."],
  });
  return {
    ...context,
    taskBrief: {
      taskId: "repair-test",
      goal: "repair failed execution",
      currentState: "test fixture",
      constraints: ["Do not delete files."],
      resources: ["CodeExecutor", "TestRunner"],
      budget: "low",
      successCriteria: ["Fixture test command passes."],
      nonGoals: ["No automatic repair execution."],
    },
    codingTaskContext: {
      allowedFiles: ["src/generated.txt"],
      maxFilesChanged: 3,
      maxPatchSize: 20000,
    },
    testExecutionResult: {
      status: "failed",
      completedSteps: ["Ran npm run test"],
      artifacts: [],
      summary: "tests failed",
      errors: ["npm run test exited with 1."],
      rawOutput: JSON.stringify({
        passed: false,
        commands: [{ command: "npm", args: ["run", "test"], exitCode: 1 }],
      }),
    },
    verification: {
      pass: false,
      score: 0.5,
      failedCriteria: ["test_failed: One or more configured test commands failed."],
      reason: "Execution verification failed.",
      nextAction: "retry_execute",
      feedbackToPlanner: "Fix failed tests.",
      failureCodes: ["test_failed"],
      evidence: {
        filesChanged: ["src/generated.txt"],
        filesAdded: ["src/generated.txt"],
        filesModified: [],
        filesDeleted: [],
        failedCommands: ["npm run test"],
        safetyFindings: [],
      },
      safetyFindings: [],
      recommendedFixes: ["Fix the failing test."],
    },
  };
}

function approvedContext(): WorkflowContext {
  const context = failedContext();
  const plan = new RepairPlanBuilder().build(context);
  const approval = new HumanApprovalRequestBuilder().build(plan, new Date("2026-05-23T00:00:00.000Z"));
  return {
    ...context,
    scopedRepairPlan: plan,
    humanApprovalRequest: approval,
    repairApprovalRecord: {
      approvalId: approval.approvalId,
      repairPlanId: plan.planId,
      status: "approved",
      approvedAt: "2026-05-23T00:01:00.000Z",
      approvedBy: "user",
      note: "Approved for materialization only.",
    },
  };
}

function approvedExecutionContext(): WorkflowContext {
  const context = approvedContext();
  context.codeChangePlan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));
  context.codeChangePlanExecutionApprovalRequest = new CodeChangePlanExecutionApprovalGate().build(
    context.codeChangePlan,
    new Date("2026-05-23T00:01:00.000Z"),
  );
  context.codeChangePlanExecutionApprovalRecord = {
    approvalId: context.codeChangePlanExecutionApprovalRequest.approvalId,
    codeChangePlanId: context.codeChangePlanExecutionApprovalRequest.codeChangePlanId,
    codeChangePlanHash: context.codeChangePlanExecutionApprovalRequest.codeChangePlanHash,
    status: "approved",
    requestedAction: "approve_code_change_plan_execution",
    approvedAt: "2026-05-23T00:02:00.000Z",
    approvedBy: "user",
    note: "Approved for dry-run only.",
  };
  return context;
}

function contextWithoutExecutionApprovalRecord(): WorkflowContext {
  const context = approvedContext();
  context.codeChangePlan = new RepairPlanMaterializer().materialize(context, new Date("2026-05-23T00:00:00.000Z"));
  return context;
}

function executableExecutionContext(): WorkflowContext {
  const context = createInitialContext({
    taskId: "execution_safety",
    userGoal: "execute approved code change",
    successCriteria: ["Configured test command passes."],
  });
  context.taskBrief = {
    taskId: "execution_safety",
    goal: "execute approved code change",
    currentState: "approved CodeChangePlan exists",
    constraints: ["no delete"],
    resources: [],
    budget: "low",
    successCriteria: ["Configured test command passes."],
    nonGoals: [],
  };
  context.codingTaskContext = { allowedFiles: ["src/generated.txt"], maxFilesChanged: 1, maxPatchSize: 20000, allowFileDelete: false };
  context.codeChangePlan = {
    planId: "code_change_execution_safety",
    repairPlanId: "repair_execution_safety",
    approvalId: "repair_approval_execution_safety",
    status: "materialized",
    summary: "safe plan",
    operations: [
      {
        id: "op_write",
        type: "create_file",
        targetFile: "src/generated.txt",
        content: "ok\n",
        description: "write file",
        reason: "test",
        safetyConstraints: ["scoped"],
      },
      {
        id: "op_test",
        type: "run_test",
        command: "npm run test",
        description: "run tests",
        reason: "verify",
        safetyConstraints: ["scoped"],
      },
    ],
    targetFiles: ["src/generated.txt"],
    forbiddenFiles: [".env"],
    testCommands: ["npm run test"],
    riskLevel: "low",
    safetyChecks: ["scoped"],
    blockedOperations: [],
    executable: false,
    requiresExplicitExecutionApproval: true,
    createdAt: "2026-05-23T00:00:00.000Z",
  };
  context.codeChangePlanExecutionApprovalRecord = {
    approvalId: "approval_execution_safety",
    codeChangePlanId: context.codeChangePlan.planId,
    codeChangePlanHash: hashCodeChangePlan(context.codeChangePlan),
    status: "approved",
    requestedAction: "approve_code_change_plan_execution",
    approvedAt: "2026-05-23T00:01:00.000Z",
  };
  return context;
}
