import { useEffect, useState } from 'react';
import { evaluateLocally, type PasswordEvaluation } from '@/lib/password/strength';

const DEBOUNCE_MS = 200;

interface StrengthState {
  password: string;
  evaluation: PasswordEvaluation | null;
}

/**
 * Debounced local zxcvbn evaluation of a password (no breach lookup; that
 * runs on submit). Results from outdated inputs are dropped, a result is only
 * returned while it matches the current password, and an empty password
 * yields no result.
 */
export function usePasswordStrength(password: string, email?: string | null) {
  const [state, setState] = useState<StrengthState | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!password) {
      setState(null);
      setIsChecking(false);
      return;
    }
    let active = true;
    setIsChecking(true);
    const timer = setTimeout(() => {
      evaluateLocally(password, email)
        .then((evaluation) => {
          if (active) {
            setState({ password, evaluation });
          }
        })
        .catch(() => {
          if (active) {
            setState(null);
          }
        })
        .finally(() => {
          if (active) {
            setIsChecking(false);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [password, email]);

  const result = state?.password === password ? state.evaluation : null;

  return { result, isChecking };
}
