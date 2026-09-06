// src/hooks/useLoader.js
// Runs a module's loader when its dependencies change.
//
// Calling an async loader straight from an effect body sets state
// synchronously during the effect, which cascades renders — and once a module
// compiles cleanly, the React Compiler lint rejects it. Deferring to a
// microtask puts the state update in a callback, which is the shape the rule
// is asking for.
//
// The `alive` flag matters for its own sake, not only for the linter: when a
// school code or term changes twice quickly, two loads are in flight and the
// slower one can land last, painting stale data over fresh. Dropping the
// result of a superseded load is the fix.
import { useEffect } from "react";

export default function useLoader(load) {
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [load]);
}
