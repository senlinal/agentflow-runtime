export type AgentRole =
  | "TaskIntake"
  | "TaskNegotiator"
  | "ConfirmedScopeGate"
  | "Researcher"
  | "FeasibilityEvaluator"
  | "CodeExecutor"
  | "Planner"
  | "Debater"
  | "PlannerRevision"
  | "Executor"
  | "TestRunner"
  | "Verifier"
  | "RepairPlanBuilder"
  | "HumanApprovalGate"
  | "RepairPlanMaterializer"
  | "CodeChangePlanExecutionApprovalGate"
  | "CodeChangePlanDryRunRunner"
  | "CodeChangePlanExecutionRunner"
  | "GoalKeeper";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs?: number;
};

export type OutputSchemaName =
  | "TaskBrief"
  | "TaskNegotiationResult"
  | "ScopeConfirmationRecord"
  | "ConfirmedScopeGateResult"
  | "AutonomyDecision"
  | "ResearchReport"
  | "FeasibilityReport"
  | "Plan"
  | "Critique"
  | "RevisedPlan"
  | "ExecutionResult"
  | "VerificationReport"
  | "ScopedRepairPlan"
  | "HumanApprovalRequest"
  | "CodeChangePlan"
  | "CodeChangePlanExecutionApprovalRequest"
  | "CodeChangePlanDryRunExecutionPlan"
  | "CodeChangePlanExecutionRecord"
  | "PatchExportRecord"
  | "CorrectionHint"
  | "CodeExecutionResult"
  | "TestExecutionResult"
  | "SmokeTestResult";

export type NodeType =
  | "mock"
  | "llm"
  | "negotiate"
  | "scopeGate"
  | "code"
  | "test"
  | "verify"
  | "repair"
  | "approval"
  | "materialize"
  | "executionApproval"
  | "executionDryRun"
  | "execution";

export type AgentNode = {
  id: string;
  rolePreset?: string;
  type: NodeType;
  role: AgentRole;
  description: string;
  inputKeys: string[];
  outputKey: keyof WorkflowContext;
  outputSchema: OutputSchemaName;
  systemPrompt?: string;
  retryPolicy?: RetryPolicy;
  executorConfig?: Record<string, unknown>;
};

export type RoleDefinition = {
  id: string;
  role: AgentRole;
  description: string;
  defaultType: NodeType;
  defaultInputKeys: string[];
  defaultOutputKey: keyof WorkflowContext;
  outputSchema: OutputSchemaName;
  defaultSystemPrompt: string;
  defaultPolicies?: WorkflowPolicies;
};

export type TaskSpec = {
  taskId: string;
  userGoal: string;
  constraints: Record<string, unknown>;
  successCriteria: string[];
};

export type TaskBrief = {
  taskId: string;
  goal: string;
  userRequest: string;
  taskType:
    | "general_answer"
    | "rag_optimization"
    | "project_analysis"
    | "coding_fix"
    | "frontend_site_build"
    | "external_project_fix"
    | "unknown";
  expectedDeliverable: {
    type: "answer" | "analysis_report" | "code_change_plan" | "patch" | "experiment_plan" | "workflow_demo";
    description: string;
  };
  answerRequirements?: string[];
  contentQualityCriteria?: string[];
  currentState: string;
  constraints: string[];
  resources: string[];
  budget: string;
  successCriteria: string[];
  nonGoals: string[];
  rawUserInput?: string;
};

export type TaskNegotiationResult = {
  negotiationId: string;
  understoodGoal: string;
  detectedTaskType:
    | "rag_optimization"
    | "coding_fix"
    | "refactor"
    | "documentation"
    | "research"
    | "unknown";
  targetModule?: string;
  complexity: "low" | "medium" | "high" | "unknown";
  ambiguities: string[];
  clarificationQuestions: string[];
  proposedScope: {
    allowedModules: string[];
    forbiddenModules: string[];
    allowedFiles?: string[];
    forbiddenFiles?: string[];
    allowedActions: string[];
    blockedActions: string[];
    qualityConstraints: string[];
  };
  suggestedTaskBreakdown: {
    id: string;
    title: string;
    goal: string;
    expectedOutput: string;
    riskLevel: "low" | "medium" | "high";
  }[];
  recommendedNextStep: "ask_human" | "proceed_to_feasibility" | "split_task" | "stop";
  readyToExecute: boolean;
  reason: string;
  createdAt: string;
};

export type ScopeConfirmationRecord = {
  confirmationId: string;
  negotiationId: string;
  sourceTaskBriefId?: string;
  status: "confirmed" | "rejected" | "needs_revision" | "expired";
  confirmedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
  confirmedBy?: string;
  humanOverride: boolean;
  confirmedScope: {
    goal: string;
    targetModule?: string;
    allowedModules: string[];
    forbiddenModules: string[];
    allowedFiles?: string[];
    forbiddenFiles?: string[];
    allowedActions: string[];
    blockedActions: string[];
    qualityConstraints: string[];
    metricDefinition?: {
      primaryMetric?: string;
      secondaryMetrics?: string[];
      targetValue?: string;
      evaluationDataset?: string;
    };
    ragConstraints?: {
      recallLevel?: "file" | "heading" | "chunk" | "answer" | "unknown";
      allowChunkChanges: boolean;
      allowIndexRebuild: boolean;
      allowRerankerChanges: boolean;
      allowQueryRewrite: boolean;
      allowAnswerQualityRegression: boolean;
      productionChangesAllowed: boolean;
    };
  };
  userAnswers: {
    question: string;
    answer: string;
  }[];
  assumptionsAccepted: string[];
  assumptionsRejected: string[];
  notes?: string;
  createdAt: string;
};

export type ConfirmedScopeGateResult = {
  gateId: string;
  confirmationId?: string;
  negotiationId?: string;
  allowed: boolean;
  status: "allowed" | "blocked";
  reason: string;
  blockedReasons: string[];
  confirmedScope?: ScopeConfirmationRecord["confirmedScope"];
  recommendedNextStep: "proceed_to_feasibility" | "ask_human" | "revise_scope" | "stop";
  createdAt: string;
};

export type ProfileSession = {
  sessionId: string;
  profileId: string;
  status: "pending_scope_confirmation" | "scope_confirmed" | "blocked" | "completed";
  task: string;
  negotiationId?: string;
  scopeConfirmationId?: string;
  lastRunId?: string;
  pendingQuestions: string[];
  proposedScope?: unknown;
  taskNegotiationResult?: TaskNegotiationResult;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMemoryRecord = {
  memoryId: string;
  profileId: string;
  type:
    | "confirmed_scope"
    | "decision"
    | "tried_route"
    | "rejected_route"
    | "open_question"
    | "current_best"
    | "next_action"
    | "progress_summary";
  title: string;
  summary: string;
  source?: {
    sessionId?: string;
    confirmationId?: string;
    workflowRunId?: string;
    executionId?: string;
    patchExportId?: string;
  };
  tags: string[];
  status: "active" | "resolved" | "rejected" | "archived";
  createdAt: string;
  updatedAt?: string;
};

export type ProjectMemorySummary = {
  profileId: string;
  generatedAt: string;
  records: ProjectMemoryRecord[];
  activeConfirmedScopes: ProjectMemoryRecord[];
  triedRoutes: ProjectMemoryRecord[];
  rejectedRoutes: ProjectMemoryRecord[];
  nextActions: ProjectMemoryRecord[];
  warnings: string[];
};

export type ConfirmedScopeMemory = {
  id: string;
  title: string;
  summary: string;
  sourceMemoryIds: string[];
  allowedModules: string[];
  forbiddenModules: string[];
  allowedActions: string[];
  blockedActions: string[];
  qualityConstraints: string[];
};

export type MemoryConflict = {
  conflictId: string;
  type:
    | "confirmed_scope_conflict"
    | "decision_conflict"
    | "route_conflict"
    | "duplicate_memory"
    | "unknown";
  severity: "low" | "medium" | "high";
  summary: string;
  conflictingMemoryIds: string[];
  recommendedResolution: "ask_human" | "prefer_latest" | "archive_duplicate" | "keep_both" | "stop";
};

export type CompactMemorySummary = {
  profileId: string;
  compactedAt: string;
  confirmedScope?: ConfirmedScopeMemory;
  currentFacts: {
    id: string;
    title: string;
    summary: string;
    sourceMemoryIds: string[];
    confidence: "low" | "medium" | "high";
  }[];
  activeDecisions: {
    id: string;
    title: string;
    summary: string;
    sourceMemoryIds: string[];
  }[];
  rejectedRoutes: {
    routeId: string;
    name: string;
    reason: string;
    doNotRepeatWithoutNewEvidence: boolean;
    sourceMemoryIds: string[];
  }[];
  candidateRoutes: {
    routeId: string;
    name: string;
    hypothesis: string;
    evidence: string[];
    sourceMemoryIds: string[];
  }[];
  openQuestions: {
    id: string;
    question: string;
    blocking: boolean;
    sourceMemoryIds: string[];
  }[];
  resolvedQuestions: {
    id: string;
    question: string;
    answerSummary: string;
    sourceMemoryIds: string[];
  }[];
  nextActions: {
    id: string;
    action: string;
    priority: "low" | "medium" | "high";
    blockedBy: string[];
    sourceMemoryIds: string[];
  }[];
  conflicts: MemoryConflict[];
  warnings: string[];
};

export type AutonomyDecision = {
  decision: "proceed" | "proceed_with_assumptions" | "ask_human" | "blocked" | "stop";
  reason: string;
  confidence: "low" | "medium" | "high";
  canProceed: boolean;
  mustAskHuman: boolean;
  assumptions: string[];
  questionsToAsk: {
    question: string;
    reason: string;
    blocking: boolean;
    relatedMemoryIds?: string[];
  }[];
  blockedReasons: string[];
  safetyFindings: string[];
  referencedMemoryIds: string[];
  nextAllowedActions: string[];
  createdAt: string;
};

export type ResearchReport = {
  summary: string;
  knownFacts: string[];
  unknowns: string[];
  dependencies: string[];
  risks: string[];
  evidence: string[];
  recommendedNextStep: string;
};

export type FeasibilityReport = {
  feasibility: "high" | "medium" | "low" | "unknown";
  decision: "proceed" | "proceed_with_risks" | "revise_goal" | "ask_human" | "stop";
  confidence: number;
  costLevel: "low" | "medium" | "high" | "unknown";
  complexityLevel: "low" | "medium" | "high" | "unknown";
  riskLevel: "low" | "medium" | "high" | "unknown";
  blockingIssues: string[];
  majorRisks: string[];
  missingInformation: string[];
  requiredResources: string[];
  recommendedScope: string;
  alternativePlans: string[];
  reason: string;
};

export type PlanStep = {
  id: string;
  action: string;
  expectedOutput: string;
};

export type Plan = {
  planId: string;
  summary: string;
  taskUnderstanding?: string;
  proposedApproach?: string;
  deliverablePlan?: string;
  steps: PlanStep[];
  risks: string[];
  successCriteria: string[];
  successCriteriaMapping?: Record<string, string>;
  assumptions: string[];
};

export type Critique = {
  issues: string[];
  risks: string[];
  missingRequirements: string[];
  suggestions: string[];
  severity: "low" | "medium" | "high";
};

export type RevisedPlan = Plan & {
  basedOnCritique: string[];
  revisionNotes: string[];
};

export type ExecutionResult = {
  status?: "success" | "failed" | "passed";
  deliverable?: {
    type: TaskBrief["expectedDeliverable"]["type"];
    content: string;
  };
  evidenceOfCompletion?: string[];
  limitations?: string[];
  completedSteps: string[];
  artifacts: string[];
  summary: string;
  errors: string[];
  rawOutput: string;
};

export type CodeExecutionResult = ExecutionResult;

export type TestExecutionResult = ExecutionResult;

export type VerificationReport = {
  pass: boolean;
  deliverableExists?: boolean;
  answersUserRequest?: boolean;
  meetsSuccessCriteria?: boolean;
  isNotMetaOnly?: boolean;
  missingRequirements?: string[];
  score: number;
  failedCriteria: string[];
  reason: string;
  nextAction: "end" | "replan" | "retry_execute" | "ask_human";
  feedbackToPlanner: string;
  failureCodes?: string[];
  evidence?: Record<string, unknown>;
  safetyFindings?: string[];
  recommendedFixes?: string[];
};

export type ProposedRepairOperation = {
  id: string;
  type: "modify_file" | "create_file" | "run_test" | "inspect" | "manual_review";
  description: string;
  targetFile?: string;
  command?: string;
  content?: string;
  reason: string;
  safetyConstraints: string[];
};

export type ScopedRepairPlan = {
  planId: string;
  summary: string;
  basedOnFailureCodes: string[];
  basedOnFailedCriteria: string[];
  targetFiles: string[];
  forbiddenFiles: string[];
  proposedOperations: ProposedRepairOperation[];
  testCommands: string[];
  riskLevel: "low" | "medium" | "high";
  requiresHumanApproval: boolean;
  rationale: string;
  safetyNotes: string[];
};

export type HumanApprovalRequest = {
  approvalId: string;
  status: "pending";
  summary: string;
  repairPlanId: string;
  requestedAction: "approve_scoped_repair_plan";
  riskLevel: ScopedRepairPlan["riskLevel"];
  requiresHumanApproval: boolean;
  blockedUntilApproved: boolean;
  approvalInstructions: string[];
  createdAt: string;
};

export type RepairApprovalRecord = {
  approvalId: string;
  repairPlanId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "consumed";
  approvedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
  approvedBy?: string;
  note?: string;
};

export type CodeChangeOperation = {
  id: string;
  type: "modify_file" | "create_file" | "run_test" | "inspect" | "manual_review";
  targetFile?: string;
  command?: string;
  content?: string;
  description: string;
  reason: string;
  safetyConstraints: string[];
};

export type CodeChangePlan = {
  planId: string;
  repairPlanId: string;
  approvalId: string;
  status: "materialized";
  summary: string;
  operations: CodeChangeOperation[];
  targetFiles: string[];
  forbiddenFiles: string[];
  testCommands: string[];
  riskLevel: ScopedRepairPlan["riskLevel"];
  safetyChecks: string[];
  blockedOperations: string[];
  executable: false;
  requiresExplicitExecutionApproval: boolean;
  createdAt: string;
};

export type CodeChangePlanExecutionApprovalRequest = {
  approvalId: string;
  codeChangePlanId: string;
  codeChangePlanHash: string;
  status: "pending" | "approved" | "rejected" | "expired" | "consumed";
  requestedAction: "approve_code_change_plan_execution";
  blockedUntilApproved: boolean;
  requiresExplicitExecutionApproval: boolean;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  reason: string;
  targetFiles: string[];
  operationsCount: number;
  testCommands: string[];
  createdAt: string;
  expiresAt?: string;
};

export type CodeChangePlanExecutionApprovalRecord = {
  approvalId: string;
  codeChangePlanId: string;
  codeChangePlanHash: string;
  status: "pending" | "approved" | "rejected" | "expired" | "consumed";
  requestedAction: "approve_code_change_plan_execution";
  approvedAt?: string;
  rejectedAt?: string;
  consumedAt?: string;
  consumedByExecutionId?: string;
  expiresAt?: string;
  approvedBy?: string;
  note?: string;
};

export type CodeChangePlanDryRunExecutionPlan = {
  dryRunId: string;
  codeChangePlanId: string;
  codeChangePlanHash: string;
  approvalId: string;
  approvalStatus: "approved";
  status: "planned";
  mode: "dry_run";
  hashMatched: true;
  summary: string;
  operations: CodeChangeOperation[];
  targetFiles: string[];
  expectedFilesChanged: string[];
  forbiddenFiles: string[];
  testCommands: string[];
  riskLevel: "low" | "medium" | "high";
  safetyChecks: string[];
  blockedReasons: string[];
  wouldWriteFiles: false;
  wouldRunCommands: false;
  wouldRunTests: false;
  wouldCallCodeExecutor: false;
  consumesApproval: false;
  requiresExecuteFlag: true;
  requiresSeparateExecutionStep: true;
  createdAt: string;
};

export type RollbackGuide = {
  rollbackId?: string;
  checkpointId?: string;
  workspaceRoot?: string;
  summary: string;
  changedFiles: string[];
  suggestedCommands?: string[];
  manualSteps: string[];
  reason?: string;
  destructiveRollbackAvailable?: false;
  destructiveRollbackPerformed: false;
};

export type CodeChangePlanExecutionRecord = {
  executionId: string;
  codeChangePlanId: string;
  approvalId: string;
  codeChangePlanHash: string;
  hashMatched: true;
  status: "executed" | "failed" | "blocked";
  startedAt: string;
  finishedAt?: string;
  checkpointId?: string;
  consumedApproval: boolean;
  codeExecutionResult?: CodeExecutionResult;
  testExecutionResult?: TestExecutionResult;
  verification?: VerificationReport;
  rollbackGuide?: RollbackGuide;
  rollbackGuideId?: string;
  executionRecordPath?: string;
  rollbackGuidePath?: string;
  blockedReasons: string[];
  safetyFindings: string[];
};

export type PatchExportRecord = {
  patchExportId: string;
  executionId: string;
  sourceProjectPath: string;
  workspaceRoot: string;
  patchPath: string;
  metadataPath: string;
  applyGuidePath: string;
  patchHash: string;
  changedFiles: string[];
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  insertions?: number;
  deletions?: number;
  testStatus?: string;
  verificationPass?: boolean;
  createdAt: string;
  safeToApplyManually: boolean;
  warnings: string[];
};

export type PatchVerificationResult = {
  patchExportId: string;
  status: "passed" | "failed" | "warning";
  patchHashMatched: boolean;
  checkedFiles: string[];
  blockedReasons: string[];
  warnings: string[];
  suggestedManualCommands: string[];
  manualReviewRequired: true;
};

export type CorrectionHint = {
  driftDetected: boolean;
  originalGoalReminder: string;
  failedCriteria: string[];
  correctionInstructions: string[];
  recommendedNextAction: "replan" | "retry_execute" | "ask_human";
};

export type SmokeTestResult = {
  ok: boolean;
  provider: string;
  model: string;
  message: string;
};

export type WorkflowTrace = {
  step: number;
  nodeId: string;
  role: AgentRole;
  nodeType?: NodeType;
  inputKeys: string[];
  outputKey: keyof WorkflowContext;
  outputSchema?: OutputSchemaName;
  outputSummary: string;
  subAgentDispatched?: boolean;
  subAgentId?: string;
  workerSessionId?: string;
  executorType?: NodeType | "unknown";
  isMock?: boolean;
  isLLMBacked?: boolean;
  modelProvider?: string;
  modelName?: string;
  callStatus?: "completed" | "failed" | "not_applicable";
  inputArtifactPath?: string;
  outputArtifactPath?: string;
  subAgentMetadataPath?: string;
  subAgentTraceSource?: "subagent_dispatch_trace";
  deliverableType?: TaskBrief["expectedDeliverable"]["type"];
  deliverablePreview?: string;
  answersUserRequest?: boolean;
  isNotMetaOnly?: boolean;
  pass?: boolean;
  conditionResults: ConditionEvaluationResult[];
  nextNode: string;
  timestamp: string;
  error?: string;
};

export type WorkflowContext = TaskSpec & {
  codingTaskContext?: CodingTaskContext | null;
  taskBrief: TaskBrief | null;
  taskNegotiationResult?: TaskNegotiationResult | null;
  scopeConfirmationRecord?: ScopeConfirmationRecord | null;
  confirmedScopeGateResult?: ConfirmedScopeGateResult | null;
  researchReport: ResearchReport | null;
  feasibilityReport: FeasibilityReport | null;
  plan: Plan | null;
  critique: Critique | null;
  revisedPlan: RevisedPlan | null;
  executionResult: ExecutionResult | null;
  codeExecutionResult: CodeExecutionResult | null;
  testExecutionResult: TestExecutionResult | null;
  verification: VerificationReport | null;
  scopedRepairPlan: ScopedRepairPlan | null;
  humanApprovalRequest: HumanApprovalRequest | null;
  repairApprovalRecord?: RepairApprovalRecord | null;
  codeChangePlan?: CodeChangePlan | null;
  codeChangePlanExecutionApprovalRequest?: CodeChangePlanExecutionApprovalRequest | null;
  codeChangePlanExecutionApprovalRecord?: CodeChangePlanExecutionApprovalRecord | null;
  codeChangePlanDryRunExecutionPlan?: CodeChangePlanDryRunExecutionPlan | null;
  codeChangePlanExecutionRecord?: CodeChangePlanExecutionRecord | null;
  patchExportRecord?: PatchExportRecord | null;
  correctionHint: CorrectionHint | null;
  iteration: number;
  history: unknown[];
  trace: WorkflowTrace[];
  runtimeMetadata?: RuntimeMetadata;
  subAgentDispatches?: SubAgentDispatchMetadata[];
  stopReason?: string;
};

export type CodingTaskContext = {
  allowedFiles?: string[];
  maxFilesChanged?: number;
  maxPatchSize?: number;
  allowFileDelete?: boolean;
  successCriteria?: string[];
};

export type RuntimeMetadata = {
  llmConfigSummary?: Record<string, unknown>;
  llmCalls?: Array<Record<string, unknown>>;
  executionVerification?: Record<string, unknown>;
  e2eRealProject?: Record<string, unknown>;
  externalProject?: Record<string, unknown>;
  patchExport?: Record<string, unknown>;
};

export type SubAgentDispatchMetadata = {
  subAgentId: string;
  workerSessionId: string;
  nodeId: string;
  role: AgentRole;
  executorType: NodeType | "unknown";
  isMock: boolean;
  isLLMBacked: boolean;
  modelProvider?: string;
  modelName?: string;
  callStatus?: "completed" | "failed" | "not_applicable";
  inputKeys: string[];
  outputKey: keyof WorkflowContext;
  outputSchema?: OutputSchemaName;
  startedAt: string;
  completedAt?: string;
  inputArtifactPath: string;
  outputArtifactPath?: string;
  metadataPath: string;
  promptPath?: string;
  summaryPath?: string;
};

export type RoleSpeech = {
  role: string;
  nodeId: string;
  subAgentId: string;
  workerSessionId: string;
  executorType: string;
  isMock: boolean;
  isLLMBacked: boolean;
  source: "subagent_output" | "subagent_summary" | "unavailable";
  title?: string;
  speech: string;
  outputKey?: string;
  outputSchema?: string;
  artifactPath?: string;
  createdAt?: string;
};

export type RoleSpeechTranscript = {
  runId: string;
  profileId?: string;
  task?: string;
  speeches: RoleSpeech[];
  warnings: string[];
  createdAt: string;
};

export type WorkflowCondition = {
  type: "always" | "equals" | "exists" | "notExists" | "in";
  path?: string;
  value?: unknown;
};

export type ConditionEvaluationResult = {
  edge: string;
  matched: boolean;
  reason: string;
};

export type WorkflowEdge = {
  from: string;
  to: string;
  condition?: WorkflowCondition;
};

export type WorkflowGraphConfig = {
  workflow: {
    name: string;
    version?: string;
    description?: string;
    start: string;
    maxIterations: number;
  };
  nodes: AgentNode[];
  edges: WorkflowEdge[];
  inputSchema?: string;
  defaultPolicies?: WorkflowPolicies;
};

export type NodeExecutor = {
  execute(node: AgentNode, context: WorkflowContext): Promise<unknown>;
};

export type PermissionPolicy = {
  allowWithoutConfirmation: string[];
  requireConfirmation: string[];
  forbiddenWithoutExplicitApproval: string[];
};

export type CostPolicy = {
  maxCostLevel: "low" | "medium" | "high";
  stopWhen: string[];
  preferredDecisionsWhenOverBudget: FeasibilityReport["decision"][];
};

export type QualityPolicy = {
  principles: string[];
  requiredChecks: string[];
  forbiddenShortcuts: string[];
};

export type WorkflowPolicies = {
  permissionPolicy?: PermissionPolicy;
  costPolicy?: CostPolicy;
  qualityPolicy?: QualityPolicy;
};

export type WorkflowTemplate = {
  name: string;
  version: string;
  description: string;
  start: string;
  maxIterations: number;
  nodes: AgentNode[];
  edges: WorkflowEdge[];
  inputSchema?: string;
  defaultPolicies?: WorkflowPolicies;
};
