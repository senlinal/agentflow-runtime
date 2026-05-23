import { PolicyApprovalStore } from "../adapters/opencode/PolicyApprovalStore.ts";

const pending = new PolicyApprovalStore().listPending();

if (pending.length === 0) {
  console.log("No pending approvals.");
} else {
  for (const item of pending) {
    console.log(
      `${item.createdAt}\t${item.decisionId}\tstatus=${item.status}\t${item.riskLevel}\t${item.matchedRule}\treplayable=false\thash=${item.toolCallHash ?? "no-hash"}\texpiresAt=${item.expiresAt ?? "n/a"}\tconsumedAt=${item.consumedAt ?? "n/a"}\t${item.reason}\t${item.affectedPaths.join(",")}`,
    );
  }
}
