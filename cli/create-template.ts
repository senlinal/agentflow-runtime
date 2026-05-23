import { parseArgs } from "./args.ts";
import { TemplateCreateService } from "../core/TemplateCreateService.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.spec) throw new Error("Missing --spec");
if (!args.out) throw new Error("Missing --out");

const result = await new TemplateCreateService().create({
  specPath: args.spec,
  outPath: args.out,
  force: args.force === "true",
  name: args.name,
  description: args.description,
  version: args.version,
});

console.log(JSON.stringify({
  out: result.out,
  name: result.name,
  version: result.version,
  nodes: result.nodes,
  edges: result.edges,
}, null, 2));
