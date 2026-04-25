---
inclusion: fileMatch
fileMatchPattern: "src/main/**/*.ts"
---

# Interface Consistency Skill

Every subsystem in SnapBack implements an `I*` interface defined in `src/main/types.ts`. This skill enforces consistency between interfaces and implementations.

## Rules

### Interface-first design
- All public methods of a subsystem class must be declared in its corresponding `I*` interface in `types.ts`
- New public methods require a matching interface update before or alongside the implementation
- The interface in `types.ts` is the contract — the class `implements` it explicitly

### Naming conventions
- Interfaces: `I<SubsystemName>` (e.g. `IClassifier`, `ILocalStore`, `IActivityTracker`)
- Classes: `<SubsystemName>` (e.g. `Classifier`, `LocalStore`, `ActivityTracker`)
- The class file must include `implements I<SubsystemName>` in its declaration

### Type alignment
- Method signatures in the class must exactly match the interface (parameter names, types, return types)
- Use `types.ts` domain types (`Classification`, `ActivityTick`, `Task`, etc.) — don't redeclare equivalent types locally
- Shared data structures (e.g. `ClassifiedSegment`, `XPEvent`) live in `types.ts`, not in subsystem files

### Constructor injection
- Dependencies are injected via constructor, typed by their interface (e.g. `store: ILocalStore`)
- Optional dependencies use `store?: ILocalStore` with a `null` fallback internally
- Never import a concrete class when the interface suffices for the dependency type

### What to flag
- A class has a public method not present in its `I*` interface (except test helpers like `_db()`, `close()`)
- A method signature in the class diverges from the interface (extra params, different return type)
- A new interface type is defined in a subsystem file instead of `types.ts`
- A constructor takes a concrete class instead of an interface for a subsystem dependency
- An `implements` clause is missing from a subsystem class
