# /workflow-inspect

Inspect a reusable workflow template.

## Usage

`/workflow-inspect <template name, filename, or path>`

## Instructions

1. Call the custom tool `inspect_workflow` with the requested template.
2. If the template name is ambiguous, ask the user to provide a filename or path.
3. Return:
   - name
   - version
   - description
   - sourcePath
   - start
   - maxIterations
   - nodes with role, inputKeys, outputKey, outputSchema
   - edges
   - policies

Do not infer or rewrite the workflow. This command is read-only.
