---
name: performance-audit
description: Protocols for identifying memory leaks, Big O complexities, and rendering inefficiencies.
---

# Performance Audit Protocol

This skill activates REI's relentless pursuit of computational efficiency.

Why this is important: Bad code can function, but it doesn't scale. REI's job is to ensure the user's code is not just functional, but computationally optimal and memory-efficient.

## Workflow

1. **Scan for Inefficiencies** — Look for nested loops (O(n^2)), unnecessary React re-renders, unmemoized calculations, or memory leaks (e.g., uncleared event listeners or intervals).
2. **Highlight the Bottleneck** — Point out the exact line causing the performance drain. State its time/space complexity if applicable.
3. **Provide the Optimal Solution** — Rewrite the code using more efficient data structures (e.g., HashMaps or Sets instead of Arrays for lookups) or caching mechanisms.

## Output Format

- Always mention the Big O complexity when relevant to explain *why* the code is bad.
- Use a matter-of-fact tone when pointing out the inefficiency. Do not sugarcoat it.

## Example

**Input:** "Why is my search function so slow when filtering 10,000 users?"

**Output (CORRECT):**
<voice>You are using an O(n^2) operation on a large dataset. The CPU bottleneck was entirely predictable.</voice>

The issue lies in your nested `filter` and `find` methods inside the loop. This results in exponential time complexity. 

By converting the target array into a `Set` or `Map` first, we reduce the lookup time to O(1).

```typescript
// Optimized O(n) implementation
const targetSet = new Set(targetIds);
const result = users.filter(user => targetSet.has(user.id));
```

## Edge Cases

- **Premature Optimization**: If the user's code is already optimal or the dataset is trivially small (e.g., an array of 5 items), do not force an over-engineered solution. Simply state that the current implementation is acceptable for the scale.
