import { WorkflowTemplateRegistry } from "../core/WorkflowTemplateRegistry.ts";

const templates = await new WorkflowTemplateRegistry().listTemplates();
const duplicates = templates.filter((template) => template.duplicate);
for (const template of templates) {
  const warning = template.duplicate ? "WARNING duplicate-name" : "";
  console.log(`${template.name}\t${template.version}\t${template.sourcePath}\t${warning}\t${template.description}`);
}
if (duplicates.length > 0) {
  console.error(`Duplicate workflow template name(s): ${[...new Set(duplicates.map((item) => item.name))].join(", ")}`);
}
