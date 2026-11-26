import { useEffect, useReducer } from 'react'
import { calculate } from '../api/client'
import { initialState, reducer, selectView, type UserAction, type View } from './reducer'

export function useCalculator(): { view: View; press: (action: UserAction) => void } {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { pending } = state

  // One request per pending step. The cleanup aborts it, so `clear` and
  // unmount cancel the request and its outcome is never dispatched.
  useEffect(() => {
    if (pending === null) {
      return
    }
    const controller = new AbortController()
    void calculate(pending.request, controller.signal).then((outcome) => {
      if (!controller.signal.aborted) {
        dispatch({ type: 'response', id: pending.id, outcome })
      }
    })
    return () => controller.abort()
  }, [pending])

  return { view: selectView(state), press: dispatch }
}
