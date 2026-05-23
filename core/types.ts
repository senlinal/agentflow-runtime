export type AgentRole =
  | "TaskIntake"
  | "Researcher"
  | "FeasibilityEvaluator"
  | "CodeExecutor"
  | "Planner"
  | "Debater"
  | "PlannerRevision"
  | "Executor"
  | "TestRunner"
  | "Verifier"
  | "GoalKeeper";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs?: number;
};

export type OutputSchemaName =
  | "TaskBrief"
  | "ResearchReport"
  | "FeasibilityReport"
  | "Plan"
  | "Critique"
  | "RevisedPlan"
  | "ExecutionResult"
  | "VerificationReport"
  | "CorrectionHint"
  | "CodeExecutionResult"
  | "TestExecutionResult"
  | "SmokeTestResult";

export type NodeType = "mock" | "llm" | "code" | "test";

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
  currentState: string;
  constraints: string[];
  resources: string[];
  budget: string;
  successCriteria: string[];
  nonGoals: string[];
  rawUserInput?: string;
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
  steps: PlanStep[];
  risks: string[];
  successCriteria: string[];
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
  score: number;
  failedCriteria: string[];
  reason: string;
  nextAction: "end" | "replan" | "retry_execute" | "ask_human";
  feedbackToPlanner: string;
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
  inputKeys: string[];
  outputKey: keyof WorkflowContext;
  outputSummary: string;
  conditionResults: ConditionEvaluationResult[];
  nextNode: string;
  timestamp: string;
  error?: string;
};

export type WorkflowContext = TaskSpec & {
  taskBrief: TaskBrief | null;
  researchReport: ResearchReport | null;
  feasibilityReport: FeasibilityReport | null;
  plan: Plan | null;
  critique: Critique | null;
  revisedPlan: RevisedPlan | null;
  executionResult: ExecutionResult | null;
  codeExecutionResult: CodeExecutionResult | null;
  testExecutionResult: TestExecutionResult | null;
  verification: VerificationReport | null;
  correctionHint: CorrectionHint | null;
  iteration: number;
  history: unknown[];
  trace: WorkflowTrace[];
  runtimeMetadata?: RuntimeMetadata;
  stopReason?: string;
};

export type RuntimeMetadata = {
  llmConfigSummary?: Record<string, unknown>;
  llmCalls?: Array<Record<string, unknown>>;
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
