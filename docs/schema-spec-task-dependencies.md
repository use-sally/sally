# Schema spec: task dependency relation, constraints, and API payload shape

Status: **implemented** (commit `12d5753`)

## Data model

```prisma
model TaskDependency {
  taskId      String
  dependsOnId String
  createdAt   DateTime @default(now())
  task        Task     @relation("taskDependencies", fields: [taskId], references: [id], onDelete: Cascade)
  dependsOn   Task     @relation("taskDependedOnBy", fields: [dependsOnId], references: [id], onDelete: Cascade)

  @@id([taskId, dependsOnId])
}
```

Task model additions:
```prisma
model Task {
  dependencies   TaskDependency[] @relation("taskDependencies")
  dependedOnBy   TaskDependency[] @relation("taskDependedOnBy")
}
```

## Constraints

- **Same project**: both tasks must belong to the same project
- **No self-dependencies**: `taskId !== dependsOnId`
- **No duplicates**: composite primary key prevents this
- **No cycles**: BFS traversal from `dependsOnId` following the dependency chain — if it reaches `taskId`, the edge is rejected
- **Cascade delete**: deleting a task removes all its dependency edges

## Cycle detection algorithm

```
function wouldCreateCycle(taskId, dependsOnId):
  visited = Set()
  queue = [dependsOnId]
  while queue is not empty:
    current = queue.shift()
    if current == taskId: return true  // cycle found
    if current in visited: continue
    visited.add(current)
    for each dep where dep.taskId == current:
      queue.push(dep.dependsOnId)
  return false
```

Time complexity: O(V + E) where V = tasks in the dependency graph, E = edges.

## API payload shape

### In `GET /tasks/:taskId` response:
```json
{
  "dependencies": [
    { "taskId": "cuid...", "number": 6, "title": "Task title" }
  ],
  "dependedOnBy": [
    { "taskId": "cuid...", "number": 8, "title": "Another task" }
  ]
}
```

### Mutation endpoints:
- `POST /tasks/:taskId/dependencies` — body: `{ "dependsOnId": "..." }`
- `DELETE /tasks/:taskId/dependencies/:dependsOnId`

Both return `{ "ok": true }` on success or `{ "ok": false, "error": "..." }` with appropriate HTTP status.

### Error responses:
| Status | Error | Cause |
|--------|-------|-------|
| 400 | `dependsOnId is required` | Missing field |
| 400 | `A task cannot depend on itself` | Self-reference |
| 400 | `Adding this dependency would create a cycle` | Cycle detected |
| 404 | `Task not found` | Invalid taskId |
| 404 | `Dependency target task not found in the same project` | Cross-project or missing |
| 409 | `Dependency already exists` | Duplicate |

## MCP tools

- `task.dependencies.add` — hosted + stdio
- `task.dependencies.remove` — hosted + stdio

## Activity logging

Both add and remove operations log to `ActivityLog` with types:
- `task.dependency.added`
- `task.dependency.removed`
