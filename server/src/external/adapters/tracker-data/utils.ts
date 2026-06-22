import type { HTMLElement } from 'node-html-parser';

export class CloudflareChallengeError extends Error {
  constructor(message = 'Cloudflare Challenge detected') {
    super(message);
    this.name = 'CloudflareChallengeError';
  }
}

export function isCloudflareChallenge(dom: HTMLElement): boolean {
  const domTitle = dom.querySelector('title')?.textContent;
  const bodyErrorText = dom.querySelector('span.challenge-error-text');
  return Boolean(domTitle?.includes('Just a moment...') || bodyErrorText);
}

export function assertNotCloudflareChallenge(dom: HTMLElement): void {
  if (isCloudflareChallenge(dom)) {
    throw new CloudflareChallengeError();
  }

  throw new Error('Server responded with 403');
}
