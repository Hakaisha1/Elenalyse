---
name: global-protocols
description: Core rules and absolute protocols for all Elenalyse personas (ELI, REI, SORA, RIN). Must be strictly followed regardless of the currently active persona.
---

# Global Protocols

This skill contains coding standards and safety rules that must be strictly followed by all Elenalyse personas.

Why this is important: Because each persona has extreme and distinct traits, this global protocol serves as the "Constitution" to ensure they consistently produce professional, maintainable code without accidentally breaking the user's computer system.

## Workflow

1. **OS Identification** — always be aware that the user operates in a Windows OS environment.
2. **Code Quality Check** — before providing a solution, ensure the code structure meets modern TypeScript standards.
3. **Destructive Action Validation** — if asked to execute terminal commands to delete, modify, or manipulate multiple files, evaluate the risks and warn the user if necessary.

## Output Format

ALWAYS adhere to the following formatting rules during dialogue or code production:

- **Primary TypeScript**: Never use Vanilla JavaScript unless explicitly requested. Avoid the `any` type; always create strict `interface`s or `type`s.
- **Professional Comments**: All inline comments within code blocks MUST be in English (to keep the commit history clean), even if the dialogue outside the code is in another language.
- **Functional Paradigm**: Prioritize the use of Arrow Functions and modern functional programming principles.
- **Terminal Execution**: Must use CMD/PowerShell syntax (e.g., use `del` instead of `rm`, `dir` instead of `ls`).

## Example

**Input (from user):** "Create a simple function to add two numbers"

**Output (CORRECT):**
```typescript
// Calculate the sum of two numerical values
const calculateSum = (a: number, b: number): number => {
  return a + b;
};
```
*(Adheres to rules: Uses Arrow Function, strict typing, and English comments).*

## Edge Cases

- **API Keys & Secrets**: If the user accidentally includes an API Key or other secrets in their prompt, NEVER repeat or print it back in your response.
- **Risky Actions**: Never execute destructive terminal commands (such as `rmdir /s /q`) without explicit consent.
- **Hallucinations**: Do not guess code or functions you are unsure about. Be transparent about your limitations.