import { useEffect, useImperativeHandle, useRef } from 'react';
import { Input } from '@mantine/core';

/** Public site key of the Quick Portal Turnstile widget. */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF-WQCiazLcZBTR0';
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileRenderOptions = {
  sitekey: string;
  action?: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Injects api.js once (client only) and resolves with `window.turnstile`. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable'))
    );
    script.addEventListener('error', () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Turnstile failed to load'));
    });
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type TurnstileHandle = {
  /** Clears the widget for a new challenge; tokens are single-use. */
  reset: () => void;
};

type TurnstileProps = {
  /** Must match the action Quick API expects (e.g. `register`). */
  action: string;
  /** Called with a new token, or `''` when it expires or the challenge errors. */
  onToken: (token: string) => void;
  error?: string;
  ref?: React.Ref<TurnstileHandle>;
};

/**
 * Cloudflare Turnstile widget, rendered explicitly after mount so nothing
 * touches `window` during SSR. The script loads only where this is rendered.
 */
export function Turnstile({ action, onToken, error, ref }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current) {
        window.turnstile?.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    let active = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!active || !containerRef.current) {
          return;
        }
        widgetIdRef.current =
          turnstile.render(containerRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            action,
            callback: (token) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(''),
            'error-callback': () => onTokenRef.current(''),
          }) ?? null;
      })
      .catch(() => {
        // The missing token blocks the submit with a validation message.
      });
    return () => {
      active = false;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action]);

  return (
    <Input.Wrapper error={error}>
      <div ref={containerRef} data-testid="turnstile" />
    </Input.Wrapper>
  );
}
