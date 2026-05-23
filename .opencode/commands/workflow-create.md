# /workflow-create

Create a reusable workflow template from a template spec.

## Usage

`/workflow-create spec=<path> out=<path> [name=<unique-name>] [description=<text>] [force=true]`

## Instructions

1. Call the custom tool `create_workflow`.
2. Default behavior must not overwrite an existing output file.
3. Use `force: true` only when the user explicitly asks to overwrite.
4. If the generated workflow name conflicts with an existing template, ask the user for a unique `name`.
5. Return:
   - createdPath
   - name
   - version
   - nodeCount
   - edgeCount
   - error, if creation failed

Do not create plugins or attach event hooks in this phase.
