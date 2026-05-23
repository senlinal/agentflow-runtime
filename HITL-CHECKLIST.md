# HITL 2.0 Checklist

Use this checklist to convert a vague agent workflow into a high-efficiency human-agent workflow.

## 1. Define The Work

- What is the concrete deliverable?
- What does "done" mean?
- What are the non-negotiable constraints?
- What data, files, or systems may the agent use?

## 2. Classify Risk

Low risk:

- Reading, summarizing, searching, drafting, local verification.

Medium risk:

- Editing code or documents, changing configuration, adding dependencies.

High risk:

- External communication, production writes, payments, deletion, releases, legal or financial judgment.

## 3. Place Human Checkpoints

Human decides:

- Goal and scope.
- Ambiguous business judgment.
- Tradeoff between alternatives.
- Acceptance of final output.
- Approval for high-risk action.

Agent handles:

- Evidence gathering.
- Option generation.
- Drafting.
- Implementation.
- Verification.
- Status reporting.

## 4. Require Decision Packets

When the agent asks for input, require:

- Decision needed.
- Options.
- Recommendation.
- Evidence.
- Consequence.

If the agent only says "please review", send it back to produce a decision packet.

## 5. Verify Outputs

For code:

- Tests or build command.
- Changed files.
- Known residual risks.

For research:

- Source links.
- Date range.
- Confidence and uncertainty.

For documents:

- Audience.
- Purpose.
- Review points.

For external actions:

- Exact payload.
- Recipient or target.
- Rollback or recovery plan.

