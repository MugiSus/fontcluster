## Architecture: State and Responsibility Boundaries

This project is strict about state ownership and separation of concerns.

### Core rule

Before changing code, identify:
1. What state is being read or written.
2. Which module owns that state.
3. Which module is allowed to mutate it.
4. Whether the change crosses an existing responsibility boundary.

Do not implement changes until this ownership is clear.

Before implementation, also identify missing requirements, ambiguous behavior,
operational risks, and open questions that could affect the task. If any of
these materially change the implementation choice, list them and ask the user
before proceeding.

### Single Source of Truth

Every piece of application state must have exactly one authoritative owner.

Do not duplicate state across:
- component local state
- global stores
- URL/search params
- server cache
- localStorage/sessionStorage
- derived memoized values

Derived values must be computed from the source of truth, not stored independently, unless there is a documented performance reason.

### State ownership

UI components may:
- render state
- hold ephemeral UI-only state
- call actions/hooks/services

UI components must not:
- own domain state
- directly mutate shared state
- perform business logic
- coordinate cross-feature workflows

Hooks may:
- adapt state for UI consumption
- compose lower-level services
- expose narrow APIs to components

Hooks must not:
- become hidden global controllers
- mix unrelated feature state
- contain domain rules that belong in services or domain modules

Services/domain modules may:
- own business rules
- validate invariants
- perform state transitions
- define domain-level operations

Services/domain modules must not:
- import UI components
- depend on framework-specific rendering behavior
- read browser state unless explicitly documented as an adapter

### Responsibility boundaries

Do not move logic across layers unless the task explicitly requires it.

Changing any of the following is considered an architectural change and requires an explicit explanation before implementation:
- moving state ownership from one module/layer to another
- adding a new global store
- adding persistent browser storage
- changing URL state semantics
- introducing a new cross-feature dependency
- merging two previously separate responsibilities

### No orchestration creep

Do not turn UI components, hooks, or utility files into orchestration hubs.

If a function begins coordinating multiple unrelated concerns, split it by responsibility:
- parsing/normalization
- validation
- state transition
- side effect
- rendering adaptation

### Mutation policy

Prefer immutable updates.

Solid store and signal setters already no-op when the next value is identical to
the current value. Do not add explicit equality guards only to avoid setting the
same value again.

Never mutate:

- function arguments
- imported module-level objects
- global state outside the designated owner
- cached data structures from external libraries

All mutations must go through the owning module's public API.

### Implementation checklist

Before finalizing a change, verify:

- Is there exactly one source of truth for each changed state?
- Is every derived value derived rather than duplicated?
- Did any UI component gain domain logic?
- Did any hook become an implicit controller?
- Did any module start importing from a higher layer?
- Did the change preserve existing responsibility boundaries?
- Are architectural changes explicitly called out?
