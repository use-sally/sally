# Schema spec: project dependency relation and v1 scope rules

Status: **implemented** (commit `8740330`)

## Data model

```prisma
model ProjectDependency {
  projectId    String
  dependsOnId  String
  createdAt    DateTime @default(now())
  project      Project  @relation("projectDependencies", fields: [projectId], references: [id], onDelete: Cascade)
  dependsOn    Project  @relation("projectDependedOnBy", fields: [dependsOnId], references: [id], onDelete: Cascade)

  @@id([projectId, dependsOnId])
}
```

Project model additions:
```prisma
model Project {
  dependencies   ProjectDependency[] @relation("projectDependencies")
  dependedOnBy   ProjectDependency[] @relation("projectDependedOnBy")
}
```

## v1 scope rules

- **Same workspace only**: both projects must be in the same workspace
- **No cross-workspace dependencies**: agents operating across workspaces cannot link projects between them
- **No self-dependencies**: `projectId !== dependsOnId`
- **No cycles**: same BFS algorithm as task dependencies
- **Cascade delete**: deleting a project removes all its dependency edges

## API payload shape

### In `GET /projects/:projectId` response:
```json
{
  "dependencies": [
    { "projectId": "cuid...", "name": "Infrastructure" }
  ],
  "dependedOnBy": [
    { "projectId": "cuid...", "name": "Mobile app" }
  ]
}
```

### Mutation endpoints:
- `POST /projects/:projectId/dependencies` — body: `{ "dependsOnId": "..." }`
- `DELETE /projects/:projectId/dependencies/:dependsOnId`

### Error responses:
| Status | Error | Cause |
|--------|-------|-------|
| 400 | `dependsOnId is required` | Missing field |
| 400 | `A project cannot depend on itself` | Self-reference |
| 400 | `Adding this dependency would create a cycle` | Cycle detected |
| 404 | `Project not found` | Invalid projectId |
| 404 | `Dependency target project not found in the same workspace` | Cross-workspace or missing |
| 409 | `Dependency already exists` | Duplicate |

## MCP tools

- `project.dependencies.add` — hosted + stdio
- `project.dependencies.remove` — hosted + stdio

## Activity logging

Both operations log with types:
- `project.dependency.added`
- `project.dependency.removed`

## Future considerations

- **Cross-workspace linking**: not supported in v1. Would require workspace-level permission checks and a different UX.
- **Dependency type/label**: all dependencies are simple "depends on" edges. Typed dependencies (blocks, enables, etc.) deferred.
