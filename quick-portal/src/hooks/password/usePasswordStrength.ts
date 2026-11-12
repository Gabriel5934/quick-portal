import { useEffect, useState } from 'react';
import { evaluateLocally, type PasswordEvaluation } from '@/lib/password/strength';

const DEBOUNCE_MS = 200;

/**
 * Debounced local zxcvbn evaluation of a password (no breach lookup; that
 * runs on submit). Results from outdated
 * inputs are dropped, and an empty password yields no result.
 */
export function usePasswordStrength(password: string, email?: string | null) {
  const [result, setResult] = useState<PasswordEvaluation | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!password) {
      setResult(null);
      setIsChecking(false);
      return;
    }
    let active = true;
    setIsChecking(true);
    const timer = setTimeout(() => {
      evaluateLocally(password, email)
        .then((evaluation) => {
          if (active) {
            setResult(evaluation);
          }
        })
        .catch(() => {
          if (active) {
            setResult(null);
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

  return { result, isChecking };
}
